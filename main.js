import { app, BrowserWindow, Tray, Menu, shell, session, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { fork } from 'child_process';
import url from 'url';

// Override default User Agent to completely bypass Google's "secure browser" check on login popups and webviews
app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
let hasShownTrayBalloon = false;

const PORT = 5050;

// Start Express Backend Server as a child process
function startBackend() {
    const serverPath = path.join(process.cwd(), 'server.js');
    console.log(`[Electron Main] Starting Backend Server: ${serverPath}`);
    
    serverProcess = fork(serverPath, [], {
        env: { ...process.env, PORT: PORT.toString() }
    });

    serverProcess.on('error', (err) => {
        console.error('[Electron Main] Failed to start backend process:', err);
    });

    serverProcess.on('exit', (code, signal) => {
        console.log(`[Electron Main] Backend process exited with code ${code} (Signal: ${signal})`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 850,
        minWidth: 1024,
        minHeight: 720,
        title: 'IR Assistant ERP',
        icon: fsExists(path.join(process.cwd(), 'app_tray_icon.png')) 
            ? path.join(process.cwd(), 'app_tray_icon.png') 
            : (fsExists(path.join(process.cwd(), 'dist', 'favicon.ico')) 
                ? path.join(process.cwd(), 'dist', 'favicon.ico') 
                : undefined),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true, // Crucial for Google Chat iframe/webview embedding
            preload: path.join(process.cwd(), 'preload.js') // Empty or utility if needed
        }
    });

    const isDev = !app.isPackaged;
    const primaryUrl = isDev ? 'http://localhost:5173' : 'http://localhost:5050';

    const loadApp = () => {
        mainWindow.loadURL(primaryUrl).catch(err => {
            console.log(`[Electron Main] Failed to load ${primaryUrl}, retrying in 1.5s...`);
            setTimeout(loadApp, 1500);
        });
    };

    loadApp();

    // Handle external links (open in default browser instead of electron window)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (
            url.startsWith('file://') || 
            url.includes('localhost:') || 
            url.includes('chat.google.com') ||
            url.includes('firebaseapp.com') ||
            url.includes('accounts.google.com')
        ) {
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Intercept close event to hide window instead of closing (Minimize to Tray)
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            console.log('[Electron Main] Window hidden (Minimized to Tray)');
            
            if (tray && !hasShownTrayBalloon) {
                tray.displayBalloon({
                    title: 'IR Assistant',
                    content: '프로그램이 백그라운드에서 계속 실행 중입니다. 우측 하단 트레이 아이콘을 더블클릭하여 다시 열 수 있습니다.',
                    iconType: 'info'
                });
                hasShownTrayBalloon = true;
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const preferredIconPath = path.join(process.cwd(), 'app_tray_icon.png');
    const builtIconPath = path.join(process.cwd(), 'dist', 'favicon.ico');
    const activeIconPath = fsExists(preferredIconPath) ? preferredIconPath : builtIconPath;
    
    tray = new Tray(activeIconPath);
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: '열기 (Open ERP)', 
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            } 
        },
        { type: 'separator' },
        { 
            label: '종료 (Quit)', 
            click: () => {
                isQuitting = true;
                app.quit();
            } 
        }
    ]);

    tray.setToolTip('IR Assistant ERP');
    tray.setContextMenu(contextMenu);

    // Toggle show/hide on double click
    tray.on('double-click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

// Helper: Sync fs check
import fs from 'fs';
function fsExists(p) {
    try {
        fs.accessSync(p);
        return true;
    } catch (e) {
        return false;
    }
}

// Single Instance Lock (prevent opening multiple instances of ERP)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            if (!mainWindow.isVisible()) mainWindow.show();
            mainWindow.focus();
        }
    });

    app.on('ready', () => {
        // Automatically allow notifications and other basic permissions for webviews
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowedPermissions = ['notifications', 'media', 'fullscreen'];
            if (allowedPermissions.includes(permission)) {
                callback(true);
            } else {
                callback(true); // Allow by default for internal ERP
            }
        });

        startBackend();
        createWindow();
        createTray();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Clean up child process upon exit
app.on('will-quit', () => {
    if (serverProcess) {
        console.log('[Electron Main] Killing backend server process...');
        serverProcess.kill();
    }
});

// ==========================================
// Auto Update Feature
// ==========================================

autoUpdater.logger = console;
autoUpdater.autoDownload = false;

function sendUpdateMessage(status, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-message', { status, ...data });
    }
}

autoUpdater.on('checking-for-update', () => {
    sendUpdateMessage('checking');
});

autoUpdater.on('update-available', (info) => {
    sendUpdateMessage('available', { info });
});

autoUpdater.on('update-not-available', (info) => {
    sendUpdateMessage('not-available', { info });
});

autoUpdater.on('error', (err) => {
    sendUpdateMessage('error', { error: err == null ? "unknown" : (err.stack || err).toString() });
});

autoUpdater.on('download-progress', (progressObj) => {
    sendUpdateMessage('downloading', {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
    });
});

autoUpdater.on('update-downloaded', (info) => {
    sendUpdateMessage('downloaded', { info });
});

ipcMain.on('check-for-updates', () => {
    if (!app.isPackaged) {
        // Dev mode mocking
        sendUpdateMessage('checking');
        setTimeout(() => {
            sendUpdateMessage('available', {
                info: {
                    version: '1.0.1',
                    releaseDate: new Date().toISOString(),
                    releaseNotes: '이것은 개발 모드 모의(Mock) 업데이트 정보입니다. 기능 테스트용입니다.'
                }
            });
        }, 1500);
    } else {
        autoUpdater.checkForUpdates().catch(err => {
            sendUpdateMessage('error', { error: err.message });
        });
    }
});

ipcMain.on('start-download', () => {
    if (!app.isPackaged) {
        sendUpdateMessage('downloading', { percent: 0 });
        let percent = 0;
        const interval = setInterval(() => {
            percent += 20;
            sendUpdateMessage('downloading', { percent });
            if (percent >= 100) {
                clearInterval(interval);
                sendUpdateMessage('downloaded', {
                    info: { version: '1.0.1' }
                });
            }
        }, 800);
    } else {
        autoUpdater.downloadUpdate().catch(err => {
            sendUpdateMessage('error', { error: err.message });
        });
    }
});

ipcMain.on('restart-app', () => {
    if (!app.isPackaged) {
        console.log('[Electron Main] Mocking Restart & Install');
        app.relaunch();
        app.exit(0);
    } else {
        autoUpdater.quitAndInstall();
    }
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
