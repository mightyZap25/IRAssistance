import { app, BrowserWindow, Tray, Menu, shell, session, ipcMain } from 'electron';
import path from 'path';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { fork } from 'child_process';
import url from 'url';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();


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

function sendUpdateMessage(status, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-message', { status, ...data });
    }
}

if (app.isPackaged) {
    // === 패키징(배포) 빌드에서만 업데이트 기능 활성화 ===
    // 깃허브에 신규 릴리즈가 있고, 버전이 현재 앱보다 높을 때만 팝업이 뜹니다.
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;

    try {
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'mightyZap25',
            repo: 'IRAssistance'
        });
    } catch (e) {
        console.error('[Electron Main] Failed to set autoUpdater Feed URL:', e);
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

    ipcMain.on('check-for-updates', (event) => {
        autoUpdater.checkForUpdates().catch(err => {
            sendUpdateMessage('error', { error: err.message });
        });
    });

    ipcMain.on('start-download', () => {
        autoUpdater.downloadUpdate().catch(err => {
            sendUpdateMessage('error', { error: err.message });
        });
    });

    ipcMain.on('restart-app', () => {
        autoUpdater.quitAndInstall();
    });

} else {
    // === 개발 모드: 업데이트 기능 전체 비활성화 ===
    // autoUpdater를 초기화하지 않으므로 어떤 이벤트도 발생하지 않음
    // 프론트엔드에서 check 요청이 오면 업데이트 없음으로 즉시 응답
    ipcMain.on('check-for-updates', () => {
        sendUpdateMessage('not-available');
    });
    ipcMain.on('start-download', () => {});
    ipcMain.on('restart-app', () => {});
    console.log('[Electron Main] Dev Mode: autoUpdater is completely disabled.');
}

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// ==========================================
// Google OAuth 2.0 (Electron BrowserWindow 팝업)
// ==========================================

ipcMain.handle('google-oauth-signin', async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth 설정이 없습니다. .env 파일에 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 설정해주세요.');
    }

    const SCOPES = [
        'openid', 'email', 'profile',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/calendar'
    ].join(' ');

    const REDIRECT_URI = 'http://localhost:9876/oauth/callback';

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&access_type=offline` +
        `&prompt=select_account`;

    return new Promise((resolve, reject) => {
        let authCode = null;
        let authWin = null;

        // 로컬 콜백 수신용 HTTP 서버
        const oauthServer = http.createServer((req, rsp) => {
            const reqUrl = new URL(req.url, 'http://localhost:9876');
            if (reqUrl.pathname === '/oauth/callback') {
                authCode = reqUrl.searchParams.get('code');
                rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                rsp.end(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f4ff">
                    <h2 style="color:#4f46e5">✅ Google 로그인 완료!</h2>
                    <p style="color:#64748b">이 창을 닫아주세요.</p>
                    <script>setTimeout(()=>window.close(),1500)</script>
                </body></html>`);
                oauthServer.close();
                // 콜백 받으면 창 자동 닫기
                if (authWin && !authWin.isDestroyed()) {
                    setTimeout(() => {
                        if (authWin && !authWin.isDestroyed()) authWin.close();
                    }, 1500);
                }
            }
        });

        oauthServer.on('error', (err) => {
            reject(new Error('OAuth 콜백 서버 시작 실패: ' + err.message));
        });

        oauthServer.listen(9876, () => {
            console.log('[OAuth] 콜백 서버 시작됨 (포트 9876)');

            // Google 로그인 팝업 창
            authWin = new BrowserWindow({
                width: 520,
                height: 680,
                title: 'Google 계정으로 로그인',
                autoHideMenuBar: true,
                webPreferences: { nodeIntegration: false, contextIsolation: true }
            });

            authWin.loadURL(authUrl);

            authWin.on('closed', async () => {
                oauthServer.close();

                if (!authCode) {
                    reject(new Error('로그인이 취소되었습니다.'));
                    return;
                }

                try {
                    // Authorization Code → Access Token 교환
                    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            code: authCode,
                            client_id: clientId,
                            client_secret: clientSecret,
                            redirect_uri: REDIRECT_URI,
                            grant_type: 'authorization_code'
                        }).toString()
                    });

                    const tokenData = await tokenRes.json();
                    if (tokenData.error) {
                        reject(new Error('토큰 교환 실패: ' + (tokenData.error_description || tokenData.error)));
                        return;
                    }

                    // 사용자 정보 조회
                    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                        headers: { Authorization: `Bearer ${tokenData.access_token}` }
                    });
                    const userInfo = await userInfoRes.json();

                    console.log('[OAuth] 로그인 성공:', userInfo.email);

                    resolve({
                        accessToken: tokenData.access_token,
                        refreshToken: tokenData.refresh_token,
                        expiresIn: tokenData.expires_in,
                        user: {
                            uid: userInfo.id,
                            email: userInfo.email,
                            displayName: userInfo.name,
                            photoURL: userInfo.picture
                        }
                    });
                } catch (err) {
                    reject(new Error('인증 처리 오류: ' + err.message));
                }
            });
        });
    });
});
