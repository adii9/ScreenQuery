const { app, BrowserWindow, globalShortcut, screen, desktopCapturer, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const log = require('electron-log');

log.transports.file.level = 'info';
log.info('ScreenQuery starting...');

// Prevent garbage collection
let mainWindow = null;
let tray = null;
let regionSelectorWindow = null;
let panelWindow = null;
let state = 'idle'; // idle | selecting | inferring | showing

// Global exception handler
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  log.error('Unhandled Rejection:', err);
});

function createTray() {
  // Create tray icon - use SF Symbol via nativeImage
  const trayIcon = nativeImage.createFromNamedImage('NSQuestionMarkButtonImage', [16, 16]);
  
  // Fallback: create a simple 16x16 icon
  let icon = trayIcon;
  if (icon.isEmpty()) {
    // Create a simple colored square as fallback
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      canvas[i * 4] = 0;     // R
      canvas[i * 4 + 1] = 122; // G  
      canvas[i * 4 + 2] = 255; // B
      canvas[i * 4 + 3] = 255; // A
    }
    icon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
  }
  
  tray = new Tray(icon);
  
  tray.setToolTip('ScreenQuery');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Capture Region (⌘⇧2)', click: startCapture },
    { type: 'separator' },
    { label: 'History', click: showHistory },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.on('click', () => startCapture());
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
}

function showRegionSelector() {
  // Get the display where the cursor currently is
  const cursorPoint = screen.getCursorScreenPoint();
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { width, height, x, y } = targetDisplay.bounds;
  
  log.info(`Opening region selector on display at (${x}, ${y}) size ${width}x${height}`);
  
  // CAPTURE SCREEN BEFORE creating overlay window
  // This ensures we capture the real screen, not the overlay itself
  desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: width * 2, height: height * 2 }
  }).then(async (capturedSources) => {
    log.info(`getSources returned ${capturedSources.length} sources`);
    
    // Find matching display
    let screenshotDataUrl = null;
    for (const source of capturedSources) {
      if (Number(source.display_id) === targetDisplay.id) {
        screenshotDataUrl = source.thumbnail.toDataURL();
        break;
      }
    }
    if (!screenshotDataUrl && capturedSources.length > 0) {
      screenshotDataUrl = capturedSources[0].thumbnail.toDataURL();
    }
    
    log.info(`Screenshot: ${screenshotDataUrl ? 'captured (' + screenshotDataUrl.length + ' chars)' : 'FAILED'}`);
    
    // Store for later use in inferRegion
    capturedScreenshotDataUrl = screenshotDataUrl;
    capturedDisplay = targetDisplay;
    
    // Now create and show overlay window
    regionSelectorWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      transparent: false,
      frame: false,
      backgroundColor: '#1a1a1a',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    regionSelectorWindow.loadFile('region-selector.html');
    regionSelectorWindow.setAlwaysOnTop(true, 'screen-saver');
    
    // Send screenshot after DOM is ready
    regionSelectorWindow.webContents.once('did-finish-load', () => {
      log.info('Region selector HTML loaded, sending screenshot');
      if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
        regionSelectorWindow.webContents.send('screenshot', screenshotDataUrl);
      }
    });
    
    regionSelectorWindow.on('closed', () => {
      regionSelectorWindow = null;
    });
    
  }).catch(err => {
    log.error('Capture failed:', err);
  });
}

let capturedScreenshotDataUrl = null;
let capturedDisplay = null;

async function captureScreen() {
  try {
    const cursorPoint = screen.getCursorScreenPoint();
    const targetDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { width, height } = targetDisplay.size;
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    });
    
    // Find the source matching our target display
    // desktopCapturer returns screens in order, try to match by display ID
    for (const source of sources) {
      // source.display_id should match our target display
      if (String(source.display_id) === String(targetDisplay.id)) {
        return source.thumbnail.toDataURL();
      }
    }
    
    // Fallback: if no match, use first source (usually main screen)
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
  } catch (err) {
    log.error('Screen capture error:', err);
  }
  return null;
}

let pendingAnswer = null;
let pendingImagePath = null;

function showAnswerPanel(answer, imagePath) {
  if (panelWindow) {
    panelWindow.close();
  }
  
  pendingAnswer = answer;
  pendingImagePath = imagePath;
  
  panelWindow = new BrowserWindow({
    width: 500,
    height: 320,
    frame: false,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  panelWindow.loadFile('answer-panel.html');
  
  panelWindow.webContents.on('did-finish-load', () => {
    // Show "Analyzing..." immediately
    panelWindow.webContents.executeJavaScript(`showAnswer("Analyzing...")`);
    panelWindow.show();
    panelWindow.center();
    state = 'showing';
  });
  
  panelWindow.on('closed', () => {
    panelWindow = null;
    state = 'idle';
    pendingAnswer = null;
    pendingImagePath = null;
  });
}

function updateAnswerPanel(answer) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.executeJavaScript(`showAnswer(${JSON.stringify(answer)})`);
  }
}

async function startCapture() {
  if (state !== 'idle') return;
  state = 'selecting';
  showRegionSelector();
}

function showHistory() {
  // TODO: Show history window
  log.info('History requested');
}

async function cropScreenshot(base64Data, rect, display) {
  return new Promise((resolve) => {
    try {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromDataURL(`data:image/png;base64,${base64Data}`);
      const size = img.getSize();
      
      log.info(`Crop: img=${size.width}x${size.height}, display=${display.bounds.width}x${display.bounds.height}, rect=(${Math.round(rect.x)},${Math.round(rect.y)}) ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      
      // Scale factor: screenshot is 2x resolution on Retina displays
      const scaleX = size.width / display.bounds.width;
      const scaleY = size.height / display.bounds.height;
      
      // Crop coordinates
      const cropRect = {
        x: Math.round(rect.x * scaleX),
        y: Math.round((display.bounds.height - rect.y - rect.height) * scaleY),
        width: Math.round(rect.width * scaleX),
        height: Math.round(rect.height * scaleY)
      };
      
      log.info(`Crop rect: (${cropRect.x},${cropRect.y}) ${cropRect.width}x${cropRect.height}`);
      
      // Validate crop rect
      if (cropRect.width <= 0 || cropRect.height <= 0 || cropRect.x < 0 || cropRect.y < 0) {
        log.error('Invalid crop rect, using full image');
        resolve(null);
        return;
      }
      
      const cropped = img.crop(cropRect);
      const croppedSize = cropped.getSize();
      log.info(`Cropped size: ${croppedSize.width}x${croppedSize.height}`);
      resolve(cropped.toPNG().toString('base64'));
    } catch (e) {
      log.error('Crop error:', e.message);
      resolve(null);
    }
  });
}

async function runOllamaVision(base64Image, prompt) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    
    // LLaVA - larger model, much more accurate for screen captures
    const body = JSON.stringify({
      model: 'llava',
      prompt: prompt || "Describe exactly what you see in this screenshot. List all visible text, UI elements, icons, and their positions. Be specific and accurate.",
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 400
      }
    });
    
    const options = {
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.response) {
            resolve(json.response.trim());
          } else if (json.error) {
            reject(new Error(json.error));
          } else {
            reject(new Error('Unexpected response: ' + data.substring(0, 200)));
          }
        } catch (e) {
          reject(new Error('Failed to parse response: ' + data.substring(0, 200)));
        }
      });
    });
    
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error('Ollama not running. Start with: ollama serve'));
      } else {
        reject(e);
      }
    });
    
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Inference timed out (120s)'));
    });
    
    req.write(body);
    req.end();
  });
}

async function inferRegion(rect) {
  state = 'inferring';
  log.info('Inferring region:', rect);
  
  try {
    // Close overlay window BEFORE capturing
    if (regionSelectorWindow) {
      regionSelectorWindow.close();
      regionSelectorWindow = null;
    }
    
    // Small delay to ensure overlay is gone
    await new Promise(r => setTimeout(r, 200));
    
    // Use the already-captured screenshot from showRegionSelector
    const screenshotDataUrl = capturedScreenshotDataUrl;
    const targetDisplay = capturedDisplay;
    
    if (!screenshotDataUrl || !targetDisplay) {
      showAnswerPanel('Failed to capture screen.', null);
      return;
    }
    
    // Extract base64 from data URL
    const base64Data = screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '');
    
    // Crop the screenshot to the selected region
    const croppedBase64 = await cropScreenshot(base64Data, rect, targetDisplay);
    
    // DEBUG: Save screenshots
    const fs = require('fs');
    fs.writeFileSync('/tmp/screenquery_full.png', Buffer.from(base64Data, 'base64'));
    if (croppedBase64) {
      fs.writeFileSync('/tmp/screenquery_cropped.png', Buffer.from(croppedBase64, 'base64'));
      log.info(`DEBUG: Full=/tmp/screenquery_full.png, Cropped=/tmp/screenquery_cropped.png`);
    }
    
    // Show panel with Analyzing...
    showAnswerPanel("Analyzing...", screenshotDataUrl);
    
    // Call Ollama with vision model - simple 1 sentence description
    const imageToSend = croppedBase64 || base64Data;
    const llavaResponse = await runOllamaVision(imageToSend, `Look at this screenshot and describe what you see in ONE clear sentence. Focus on the main content and meaning. Example: "A developer terminal showing git commit logs for a React project" or "A Discord chat window with messages about a coding task."`);
    const answer = llavaResponse;
    updateAnswerPanel(answer);
    
  } catch (err) {
    log.error('Inference error:', err);
    showAnswerPanel('Error: ' + err.message, null);
  }
}

// IPC Handlers
ipcMain.on('region-selected', (event, rect) => {
  if (regionSelectorWindow) {
    regionSelectorWindow.close();
    regionSelectorWindow = null;
  }
  inferRegion(rect);
});

ipcMain.on('region-cancelled', () => {
  if (regionSelectorWindow) {
    regionSelectorWindow.close();
    regionSelectorWindow = null;
  }
  state = 'idle';
});

ipcMain.on('copy-answer', (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
});

ipcMain.on('close-panel', () => {
  if (panelWindow) {
    panelWindow.close();
    panelWindow = null;
  }
  state = 'idle';
});

ipcMain.handle('get-screenshot', async () => {
  return await captureScreen();
});

// Register global shortcut
function registerGlobalShortcut() {
  const ret = globalShortcut.register('CommandOrControl+Shift+2', () => {
    log.info('Global shortcut triggered');
    startCapture();
  });
  
  if (!ret) {
    log.warn('Global shortcut registration failed');
  }
}

// App lifecycle
app.whenReady().then(() => {
  createTray();
  createMainWindow();
  registerGlobalShortcut();
  
  log.info('ScreenQuery ready. Press Cmd+Shift+2 to capture.');
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close (menu bar app)
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  log.info('ScreenQuery shutting down');
});
