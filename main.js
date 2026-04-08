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
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  
  regionSelectorWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreen: true,
    hasShadow: false,
    opacity: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  regionSelectorWindow.loadFile('region-selector.html');
  regionSelectorWindow.setAlwaysOnTop(true, 'screen-saver');
  
  regionSelectorWindow.webContents.on('did-finish-load', () => {
    regionSelectorWindow.webContents.executeJavaScript(`
      document.body.style.margin = '0';
      document.body.style.overflow = 'hidden';
    `);
  });
  
  regionSelectorWindow.on('closed', () => {
    regionSelectorWindow = null;
  });
}

async function captureScreen() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size
    });
    
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
  
  // Capture current screen first
  const screenshotDataUrl = await captureScreen();
  
  // Show region selector overlay
  showRegionSelector();
  
  // Send screenshot to renderer for display in selector
  if (regionSelectorWindow && screenshotDataUrl) {
    regionSelectorWindow.webContents.on('did-finish-load', () => {
      regionSelectorWindow.webContents.send('screenshot', screenshotDataUrl);
    });
  }
}

function showHistory() {
  // TODO: Show history window
  log.info('History requested');
}

function inferRegion(rect) {
  state = 'inferring';
  log.info('Inferring region:', rect);
  
  // Get all screen sources for capture
  desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: screen.getPrimaryDisplay().size
  }).then(sources => {
    if (sources.length > 0) {
      const screenshotDataUrl = sources[0].thumbnail.toDataURL();
      
      // For now, show a mock answer while we figure out LLaVA integration
      // TODO: Wire up actual LLaVA inference here
      setTimeout(() => {
        const mockAnswer = `📸 Screen Region\n\nCaptured at: ${rect.width}×${rect.height}\n\nLLaVA inference will describe what's visible in this region.\n\nNote: Configure LLaVA in settings to enable AI description.`;
        showAnswerPanel(mockAnswer, screenshotDataUrl);
      }, 1500);
    }
  }).catch(err => {
    log.error('Inference error:', err);
    showAnswerPanel('Error: Failed to capture screen region', null);
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
