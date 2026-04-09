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
  
  // Capture screenshot and send to renderer to use as background
  captureScreenForSelector(targetDisplay).then(screenshotDataUrl => {
    if (regionSelectorWindow && screenshotDataUrl) {
      regionSelectorWindow.webContents.on('did-finish-load', () => {
        regionSelectorWindow.webContents.send('screenshot', screenshotDataUrl);
      });
      // If already loaded, send immediately
      if (!regionSelectorWindow.webContents.isLoading()) {
        regionSelectorWindow.webContents.send('screenshot', screenshotDataUrl);
      }
    }
  });
  
  regionSelectorWindow.on('closed', () => {
    regionSelectorWindow = null;
  });
}

async function captureScreenForSelector(targetDisplay) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: targetDisplay.size.width, height: targetDisplay.size.height }
    });
    
    // Find matching source
    for (const source of sources) {
      if (Number(source.display_id) === targetDisplay.id) {
        return source.thumbnail.toDataURL();
      }
    }
    // Fallback to first source
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
  } catch (err) {
    log.error('Selector capture error:', err);
  }
  return null;
}

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

function showAnswerPanel(answer, imagePath) {
  if (panelWindow) {
    panelWindow.close();
  }
  
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
    panelWindow.webContents.executeJavaScript(`showAnswer(${JSON.stringify(answer)})`);
    panelWindow.show();
    panelWindow.center();
    state = 'showing';
  });
  
  panelWindow.on('closed', () => {
    panelWindow = null;
    state = 'idle';
  });
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

function inferRegion(rect) {
  state = 'inferring';
  log.info('Inferring region:', rect);
  
  // Get all screen sources for capture
  const cursorPoint = screen.getCursorScreenPoint();
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { width, height } = targetDisplay.size;
  log.info(`Target display: ${targetDisplay.id} at (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y}) size ${width}x${height}`);
  
  desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  }).then(sources => {
    log.info(`Found ${sources.length} screen sources`);
    for (const source of sources) {
      log.info(`  Source: display_id=${source.display_id} name="${source.name}"`);
    }
    
    // Find matching display - try ID match first
    let screenshotDataUrl = null;
    for (const source of sources) {
      log.info(`Comparing source.id=${source.display_id} vs target.id=${targetDisplay.id}`);
      if (Number(source.display_id) === targetDisplay.id) {
        screenshotDataUrl = source.thumbnail.toDataURL();
        log.info('Matched by ID!');
        break;
      }
    }
    
    // Fallback: try to match by display index (first screen = main)
    if (!screenshotDataUrl && sources.length > 0) {
      // Use first source (usually the main screen)
      screenshotDataUrl = sources[0].thumbnail.toDataURL();
      log.info('Using first available source as fallback');
    }
    
    log.info(`Screenshot capture: ${screenshotDataUrl ? 'SUCCESS' : 'FAILED'}`);
    
    if (screenshotDataUrl) {
      setTimeout(() => {
        const mockAnswer = `📸 Screen Region\n\nCaptured: ${Math.round(rect.width)}×${Math.round(rect.height)} pixels\n\nLLaVA inference will describe this region.\n\nSetup: Run 'bash setup_llm.sh' to enable AI description.`;
        showAnswerPanel(mockAnswer, screenshotDataUrl);
      }, 1000);
    } else {
      showAnswerPanel('Screen captured! LLaVA setup needed.\n\nRun: bash setup_llm.sh\n\nThen restart the app.', null);
    }
  }).catch(err => {
    log.error('Inference error:', err);
    showAnswerPanel('Error: ' + err.message, null);
  });
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
