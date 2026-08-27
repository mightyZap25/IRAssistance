import { app, BrowserWindow, Tray, Menu, shell, session, ipcMain, nativeTheme, dialog, Notification } from 'electron';
import path from 'path';
import { createRequire } from 'module';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
const _require = createRequire(import.meta.url);
const fs = _require('fs');
import { fork } from 'child_process';
import url from 'url';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
// 개발 환경: __dirname 기준 / 패키징 환경: app.getAppPath() 기준으로 .env 경로 명시
const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(path.dirname(url.fileURLToPath(import.meta.url)), '.env');
dotenv.config({ path: envPath });
console.log('[Electron Main] .env 로드 경로:', envPath);


// Override default User Agent to completely bypass Google's "secure browser" check on login popups and webviews
app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 윈도우 OS 네이티브 알림(Notification)이 정상 작동하기 위한 필수 설정
// 빌드 후 간혹 설치 방식(포터블/unpacked 등)에 따라 윈도우 시작 메뉴 단축아이콘 AUMID와 매칭이 안 되어 
// 알림이 무시되는 윈도우 11의 엄격한 정책을 통과하기 위해, package.json에 정의된 appId와 동일한 AUMID를 사용해야 합니다.
app.setAppUserModelId("com.irassistant.app");

// 알림 전용 아이콘 자동 다운로드 함수
function ensureNotificationIcons() {
    const iconDir = path.join(app.getPath('userData'), 'icons');
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

    const defaultIconSrc = path.join(app.getAppPath(), 'build', 'icon.png');
    const defaultIconDest = path.join(iconDir, 'icon.png');
    if (fs.existsSync(defaultIconSrc) && !fs.existsSync(defaultIconDest)) {
        fs.copyFileSync(defaultIconSrc, defaultIconDest);
    }
    
    // 윈도우 작업표시줄 아이콘 버그(asar 가상경로 인식 실패) 우회를 위해 ICO 파일도 물리 디스크로 복사
    const winIconSrc = path.join(app.getAppPath(), 'build', 'icon.ico');
    const winIconDest = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(winIconSrc) && !fs.existsSync(winIconDest)) {
        fs.copyFileSync(winIconSrc, winIconDest);
    }

    const downloadIcon = (url, filename) => {
        const dest = path.join(iconDir, filename);
        if (!fs.existsSync(dest)) {
            https.get(url, (res) => {
                if (res.statusCode === 200) {
                    const file = fs.createWriteStream(dest);
                    res.pipe(file);
                }
            }).on('error', err => console.error('[Icon Download Error]', err));
        }
    };

    downloadIcon('https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/512px-Gmail_icon_%282020%29.svg.png', 'gmail.png');
    downloadIcon('https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Google_Chat_icon_%282020%29.svg/512px-Google_Chat_icon_%282020%29.svg.png', 'gchat.png');
    downloadIcon('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Google_Calendar_icon_%282020%29.svg/512px-Google_Calendar_icon_%282020%29.svg.png', 'gcalendar.png');
}

// Force Light Mode as the initial theme for all renderer contents and webviews
nativeTheme.themeSource = 'light';

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
let hasShownTrayBalloon = false;

const PORT = 5050;

// Start Express Backend Server as a child process
function startBackend() {
    const appPath = app.getAppPath();
    const serverPath = app.isPackaged
        ? path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'server.js')
        : path.join(appPath, 'server.js');
    console.log(`[Electron Main] Starting Backend Server: ${serverPath}`);
    
    // 백엔드 로그 저장을 위한 파일 경로
    const logDir = app.getPath('userData');
    const logFile = path.join(logDir, 'backend.log');

    try {
        serverProcess = fork(serverPath, [], {
            silent: true, // stdout, stderr 캡처
            env: { 
                ...process.env, 
                PORT: PORT.toString(),
                ELECTRON_RESOURCES_PATH: app.isPackaged ? process.resourcesPath : app.getAppPath()
            }
        });

        if (serverProcess.stdout) {
            serverProcess.stdout.on('data', (data) => {
                const msg = data.toString();
                console.log(`[Backend Server Output] ${msg}`);
                fs.appendFileSync(logFile, `[STDOUT] ${new Date().toISOString()} - ${msg}`);
            });
        }

        if (serverProcess.stderr) {
            serverProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                console.error(`[Backend Server Error] ${msg}`);
                fs.appendFileSync(logFile, `[STDERR] ${new Date().toISOString()} - ${msg}`);
            });
        }

        serverProcess.on('error', (err) => {
            console.error('[Electron Main] Failed to start backend process:', err);
            dialog.showErrorBox('백엔드 서버 시작 오류', `백엔드 서버 프로세스 시작에 실패했습니다:\n${err.message}`);
        });

        serverProcess.on('exit', (code, signal) => {
            console.log(`[Electron Main] Backend process exited with code ${code} (Signal: ${signal})`);
            if (code !== 0 && code !== null && !isQuitting) {
                let errorMsg = `백엔드 서버(PORT ${PORT})가 예기치 않게 종료되었습니다. (종료 코드: ${code})\n로그 파일: ${logFile}`;
                if (fs.existsSync(logFile)) {
                    try {
                        const lastLogs = fs.readFileSync(logFile, 'utf8').slice(-1000);
                        errorMsg += `\n\n최근 오류 로그:\n${lastLogs}`;
                    } catch(e) {}
                }
                dialog.showErrorBox('백엔드 서버 종료됨', errorMsg);
            }
        });
    } catch (e) {
        console.error('[Electron Main] Fork Exception:', e);
        dialog.showErrorBox('백엔드 실행 실패', e.message);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 850,
        minWidth: 1024,
        minHeight: 720,
        title: 'I-Link',
        icon: (() => {
            if (process.platform === 'win32' && app.isPackaged) {
                // 윈도우 패키징 상태에서는 icon을 지정하지 않아야 빌드된 exe 자체 아이콘이 작업표시줄에 정상 적용됩니다.
                return undefined;
            }
            const localIcon = path.join(app.getPath('userData'), 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
            return fs.existsSync(localIcon) ? localIcon : path.join(app.getAppPath(), 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
        })(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Bypass CORS for direct Odoo API fetches
            webviewTag: true, // Crucial for Google Chat iframe/webview embedding
            preload: path.join(app.getAppPath(), 'preload.js') // app.getAppPath()는 패키징 환경(asar)에서도 올바른 경로 반환
        }
    });

    const isDev = !app.isPackaged;
    const primaryUrl = isDev ? 'http://localhost:5173' : 'http://localhost:5050';

    let loadRetryCount = 0;
    const loadApp = () => {
        loadRetryCount++;
        console.log(`[Electron Main] Loading URL: ${primaryUrl} (Attempt ${loadRetryCount})`);
        mainWindow.loadURL(primaryUrl).catch(err => {
            console.log(`[Electron Main] Failed to load ${primaryUrl}, retrying in 1.5s...`);
            if (loadRetryCount < 20) {
                setTimeout(loadApp, 1500);
            } else {
                dialog.showErrorBox('페이지 로딩 실패', `서버(${primaryUrl}) 연결에 실패했습니다.\n오류: ${err.message}`);
            }
        });
    };

    loadApp();

    // DevTools 키보드 단축키 (F12 또는 Ctrl+Shift+I) 항상 등록
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toUpperCase() === 'I'))) {
            mainWindow.webContents.toggleDevTools();
        }
    });

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
                    title: 'I-Link',
                    content: '프로그램이 백그라운드에서 계속 실행 중입니다. 우측 하단 트레이 아이콘을 더블클릭하여 다시 열 수 있습니다.',
                    iconType: 'info'
                });
                hasShownTrayBalloon = true;
            }
        }
    });

    // Intercept mouse back/forward button clicks to handle inside webviews
    mainWindow.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward') {
            e.preventDefault();
            mainWindow.webContents.send('app-go-back');
        } else if (cmd === 'browser-forward') {
            e.preventDefault();
            mainWindow.webContents.send('app-go-forward');
        }
    });

    // 윈도우 마우스 드라이버나 키보드 단축키(Alt+Left)로 인한 Chromium 네이티브 뒤로가기(React Hash 변경)를 원천 차단합니다.
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'BrowserBack' || (input.alt && input.key === 'ArrowLeft')) {
            event.preventDefault();
            if (input.type === 'keyDown') mainWindow.webContents.send('app-go-back');
        }
        if (input.key === 'BrowserForward' || (input.alt && input.key === 'ArrowRight')) {
            event.preventDefault();
            if (input.type === 'keyDown') mainWindow.webContents.send('app-go-forward');
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const localIcon = path.join(app.getPath('userData'), 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
    const activeIconPath = fs.existsSync(localIcon) ? localIcon : path.join(app.getAppPath(), 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
    
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

    tray.setToolTip('I-Link ERP');
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
        // 필수 아이콘 준비
        ensureNotificationIcons();

        // Automatically allow notifications and other basic permissions for webviews
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowedPermissions = ['notifications', 'media', 'fullscreen'];
            if (allowedPermissions.includes(permission)) {
                callback(true);
            } else {
                callback(true); // Allow by default for internal ERP
            }
        });
        session.defaultSession.setPermissionCheckHandler((webContents, permission) => true);

        // Odoo 전용 파티션 세션 알림 허용
        const odooSession = session.fromPartition('persist:odoo');
        odooSession.setPermissionRequestHandler((webContents, permission, callback) => {
            callback(true);
        });
        odooSession.setPermissionCheckHandler((webContents, permission) => {
            return true;
        });

        // Global CSS Injection to force Light Mode for Google previewers and iframes
        app.on('web-contents-created', (event, contents) => {
            // 모든 호스트(주로 메인 윈도우)에서 webview가 생성될 때 가로채기
            contents.on('will-attach-webview', (e, webPreferences, params) => {
                // global-preload.js는 webview preload로 주입되므로 asar 내부 경로를 사용할 수 없음
                // 패키징 환경에서는 app.asar.unpacked 경로를 사용해야 합니다
                const appPath = app.getAppPath();
                const preloadPath = app.isPackaged
                    ? path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'global-preload.js')
                    : path.join(appPath, 'global-preload.js');
                webPreferences.preload = preloadPath;
                webPreferences.contextIsolation = false; // 전역 객체 덮어쓰기를 위해 격리 해제
                webPreferences.backgroundThrottling = false; // 백그라운드 웹뷰(Gmail 등)의 타이머/웹소켓 지연 방지
            });

            // If it is a webview guest contents, intercept all popups and open them in-place!
            if (contents.getType() === 'webview') {
                // ✅ 웹뷰 자체 세션에도 알림 권한 허용 설정
                contents.session.setPermissionRequestHandler((wc, permission, callback) => {
                    callback(true);
                });
                contents.session.setPermissionCheckHandler((wc, permission) => {
                    return true;
                });

                // Webview 내부에서 보내는 IPC 메시지 감지
                contents.on('ipc-message', (e, channel, ...args) => {
                    if (channel === 'odoo-desktop-notification') {
                        const data = args[0] || {};
                        if (Notification.isSupported()) {
                            const notif = new Notification({
                                title: data.title || '새 알림',
                                body: data.options?.body || '',
                                icon: path.join(app.getPath('userData'), 'icons', 'icon.png')
                            });
                            notif.show();
                        }
                    }
                    
                    // global-preload.js에서 ipcRenderer.sendToHost로 전송한 알림 처리
                    // 빌드 후에도 안정적으로 동작하는 방식 (console.log 방식의 대안)
                    if (channel === 'ilink-notification') {
                        const data = args[0] || {};
                        console.log('[Electron Main] ilink-notification 수신:', data);
                        
                        let prefix = '';
                        let iconName = 'icon.png';
                        const source = data.source || '';
                        if (source.includes('mail.google.com')) { prefix = '[지메일] '; iconName = 'gmail.png'; }
                        else if (source.includes('chat.google.com')) { prefix = '[구글챗] '; iconName = 'gchat.png'; }
                        else if (source.includes('calendar.google.com')) { prefix = '[캘린더] '; iconName = 'gcalendar.png'; }
                        else if (source.includes('192.168.0.7') || source.includes('100.67.238.32')) { prefix = '[Odoo] '; iconName = 'icon.png'; }
                        
                        if (Notification.isSupported()) {
                            let iconPath = path.join(app.getPath('userData'), 'icons', iconName);
                            if (!fs.existsSync(iconPath)) {
                                iconPath = path.join(app.getPath('userData'), 'icons', 'icon.png');
                            }
                            const notif = new Notification({
                                title: prefix + (data.title || '새 알림'),
                                body: data.body || '',
                                icon: iconPath
                            });
                            notif.show();
                        }
                    }
                });


                // Preload 스크립트의 console.log를 터미널로 중계 및 알림 처리
                contents.on('console-message', (event, level, message, line, sourceId) => {
                    const msg = message || '';
                    if (msg.startsWith('ILINK_NOTIF::')) {
                        try {
                            const data = JSON.parse(msg.slice('ILINK_NOTIF::'.length));
                            console.log('[Electron Main] Received ILINK_NOTIF::', data);
                            
                            // 출처에 따라 제목에 접두사(Prefix) 붙이기 및 아이콘 설정
                            let prefix = '';
                            let iconName = 'icon.png';
                            if (data.source) {
                                if (data.source.includes('mail.google.com')) { prefix = '[지메일] '; iconName = 'gmail.png'; }
                                else if (data.source.includes('chat.google.com')) { prefix = '[구글챗] '; iconName = 'gchat.png'; }
                                else if (data.source.includes('calendar.google.com')) { prefix = '[캘린더] '; iconName = 'gcalendar.png'; }
                                else if (data.source.includes('192.168.0.7') || data.source.includes('100.67.238.32')) { prefix = '[Odoo] '; iconName = 'icon.png'; }
                            }
                            
                            const finalTitle = prefix + (data.title || '새 알림');
                            
                            if (Notification.isSupported()) {
                                // 다운로드된 아이콘 파일이 userData 경로에 존재하는지 확인
                                let iconPath = path.join(app.getPath('userData'), 'icons', iconName);
                                if (!fs.existsSync(iconPath)) {
                                    iconPath = path.join(app.getPath('userData'), 'icons', 'icon.png');
                                }
                                
                                const notif = new Notification({
                                    title: finalTitle,
                                    body: data.body || '',
                                    icon: iconPath
                                });
                                notif.show();
                            }
                        } catch(ex) {
                            console.error('[Electron Main] 알림 파싱 실패:', ex);
                        }
                    }
                });

                // 내부 서비스 여부 판별 함수
                const isInternalUrl = (testUrl) => {
                    try {
                        const u = new URL(testUrl);
                        const host = u.hostname;
                        
                        const internalHosts = [
                            'mail.google.com',
                            'drive.google.com',
                            'docs.google.com',
                            'gemini.google.com',
                            'calendar.google.com',
                            'chat.google.com',
                            'notebooklm.google.com',
                            'accounts.google.com',
                            'myaccount.google.com',
                            'workspace.google.com'
                        ];
                        
                        if (internalHosts.some(h => host === h || host.endsWith('.' + h))) return true;
                        if (host.includes('192.168.0.') || host.includes('100.67.238.') || host.includes('odoo')) return true;
                        if (host === 'localhost' || host === '127.0.0.1') return true;
                        
                        return false;
                    } catch(e) {
                        return true; // URL 파싱 실패시 안전하게 내부로 간주
                    }
                };

                // 웹뷰 내부에서 일반 링크 클릭 시 (target="_self")
                contents.on('will-navigate', (e, url) => {
                    if (!isInternalUrl(url)) {
                        e.preventDefault();
                        console.log('[Electron Main] 외부 링크 감지 (will-navigate), 기본 브라우저로 엽니다:', url);
                        shell.openExternal(url);
                    }
                });

                // 웹뷰 내부에서 새 창 열기 시 (target="_blank" 등)
                contents.setWindowOpenHandler(({ url }) => {
                    if (!isInternalUrl(url)) {
                        console.log('[Electron Main] 외부 링크 감지 (popup), 기본 브라우저로 엽니다:', url);
                        shell.openExternal(url);
                        return { action: 'deny' };
                    } else {
                        console.log('[Electron Main] 내부 링크 팝업 감지, 현재 웹뷰에서 엽니다:', url);
                        contents.loadURL(url).catch(err => {
                            console.error('[Electron Main] Failed to load popup URL in webview:', err);
                        });
                        return { action: 'deny' };
                    }
                });
            }

            contents.on('dom-ready', () => {
                contents.insertCSS(`
                    /* 1. Google Drive Previewer: Force Light Theme on Backdrop & Dialogs */
                    div.ndfHFb-c43Cm-z7Ux7b-dL434, 
                    div.ndfHFb-c43Cm-z7Ux7b-r4nke, 
                    div.ndfHFb-c43Cm-w7Ozid,
                    div[role="dialog"],
                    div[style*="background-color: rgb(17, 17, 17)"],
                    div[style*="background-color: rgb(30, 30, 30)"] {
                        background-color: #f1f5f9 !important;
                    }
                    
                    /* 2. Top Header Bar: Force White Background */
                    .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb, 
                    .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb,
                    div[style*="background-color: rgb(32, 33, 36)"] {
                        background-color: #ffffff !important;
                        border-bottom: 1px solid #e2e8f0 !important;
                    }
                    
                    /* 3. Top Header Bar: Force Dark Text for Readability */
                    .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb *,
                    .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb *,
                    div[style*="background-color: rgb(32, 33, 36)"] * {
                        color: #0f172a !important;
                    }
                    
                    /* 4. Top Header Bar: Force Dark Icons for Readability */
                    .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb svg,
                    .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb svg,
                    .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb svg path,
                    .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb svg path,
                    div[style*="background-color: rgb(32, 33, 36)"] svg,
                    div[style*="background-color: rgb(32, 33, 36)"] svg path {
                        fill: #334155 !important;
                        color: #334155 !important;
                    }
                    
                    /* 5. Google Drive Spreadsheet Preview: Force Light Column/Row Headers */
                    .goog-inline-block.grid-header-canvas,
                    .grid-header-canvas,
                    .grid-row-header,
                    .grid-column-header,
                    td.grid-row-header,
                    td.grid-column-header,
                    .grid-row-header-content,
                    .grid-column-header-content,
                    .grid-header-canvas-container,
                    .goog-inline-block.grid-row-header,
                    .goog-inline-block.grid-column-header {
                        background-color: #f1f5f9 !important;
                        color: #334155 !important;
                        border-color: #cbd5e1 !important;
                    }
                    
                    /* 6. Document Viewer Canvas / Loading background */
                    .ndfHFb-c43Cm-n7FmZ-w7Ozid {
                        background-color: #f1f5f9 !important;
                    }

                    /* 7. Odoo & Webview 한글/기호 ㅁ (Tofu) 글자 깨짐 방지 폰트 Fallback 패치 */
                    body, button, input, select, textarea, .o_main_navbar, .o_content, span, div, p, td, th, a {
                        font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif !important;
                    }
                `, { cssOrigin: 'user' }).catch(err => {});
            });
        });

        // Persist session cookies for Google domains so users stay logged in across restarts
        session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
            if (!removed && cookie.session && (cookie.domain.includes('google.com') || cookie.domain.includes('google.co.kr'))) {
                const protocol = cookie.secure ? 'https:' : 'http:';
                const domainClean = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
                const url = `${protocol}//${domainClean}${cookie.path}`;
                
                const persistentCookie = {
                    url: url,
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    expirationDate: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // Persist for 30 days
                    sameSite: cookie.sameSite
                };

                setImmediate(() => {
                    session.defaultSession.cookies.set(persistentCookie)
                        .catch(err => {
                            // Suppress logs for transient failures
                        });
                });
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

// Renderer(React)에서 IPC로 요청하는 네이티브 알림 핸들러
// 빌드 후에도 icon 경로 문제 없이 Electron Notification API로 안정적으로 표시됩니다.
ipcMain.on('show-notification', (event, { title, body }) => {
    if (Notification.isSupported()) {
        let iconPath = path.join(app.getPath('userData'), 'icons', 'icon.png');
        if (!fs.existsSync(iconPath)) {
            iconPath = path.join(app.getAppPath(), 'build', 'icon.png');
        }
        const notif = new Notification({
            title: title || 'I-Link',
            body: body || '',
            icon: iconPath
        });
        notif.show();
    }
});

ipcMain.handle('get-preload-path', () => {
    const appPath = app.getAppPath();
    const p = app.isPackaged
        ? path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'odoo-preload.js')
        : path.join(appPath, 'odoo-preload.js');
    return url.pathToFileURL(p).href;
});

ipcMain.on('odoo-desktop-notification', (event, data) => {
    const { title, options } = data;
    console.log('\n=======================================');
    console.log(`[Electron Main] 🔔 Odoo 푸시 알림 수신됨!`);
    console.log(`- 제목: ${title}`);
    console.log(`- 내용: ${options?.body}`);
    console.log('=======================================\n');

    if (Notification.isSupported()) {
        const notif = new Notification({
            title: title || 'Odoo 알림',
            body: options?.body || '',
            icon: path.join(app.getPath('userData'), 'icons', 'icon.png')
        });
        notif.show();
        console.log('[Electron Main] 네이티브 윈도우 알림을 성공적으로 표시했습니다.');
    } else {
        console.log('[Electron Main] ❌ 현재 OS에서 네이티브 알림을 지원하지 않거나 비활성화되어 있습니다.');
    }
});

// ==========================================
// Google OAuth 2.0 (System Default Browser)
// ==========================================

let activeOAuthServer = null;
let activeOAuthReject = null;

ipcMain.handle('google-oauth-signin', async () => {
    // 이전 로그인 요청이 활성화되어 있다면 정리
    if (activeOAuthServer) {
        try {
            activeOAuthServer.close();
        } catch (e) {
            console.error('[OAuth] Failed to close previous server:', e);
        }
        activeOAuthServer = null;
    }
    if (activeOAuthReject) {
        activeOAuthReject(new Error('새로운 로그인 요청이 시작되어 이전 요청이 취소되었습니다.'));
        activeOAuthReject = null;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth 설정이 없습니다. .env 파일에 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 설정해주세요.');
    }

    const SCOPES = [
        'openid', 'email', 'profile',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly'
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
        activeOAuthReject = reject;
        let isResolvedOrRejected = false;
        let loginWin = null;

        // 5분 타임아웃 설정
        const timeoutId = setTimeout(() => {
            if (!isResolvedOrRejected) {
                isResolvedOrRejected = true;
                cleanup();
                reject(new Error('로그인 시간이 초과되었습니다. (5분)'));
            }
        }, 5 * 60 * 1000);

        const cleanup = () => {
            clearTimeout(timeoutId);
            if (loginWin && !loginWin.isDestroyed()) {
                try {
                    loginWin.destroy();
                } catch (e) {}
            }
            loginWin = null;
            if (activeOAuthServer) {
                try {
                    activeOAuthServer.close();
                } catch (e) {}
                activeOAuthServer = null;
            }
            if (activeOAuthReject === reject) {
                activeOAuthReject = null;
            }
        };

        // 로컬 콜백 수신용 HTTP 서버
        const oauthServer = http.createServer(async (req, rsp) => {
            const reqUrl = new URL(req.url, 'http://localhost:9876');
            if (reqUrl.pathname === '/oauth/callback') {
                const authCode = reqUrl.searchParams.get('code');
                const authError = reqUrl.searchParams.get('error');

                if (authError) {
                    rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    rsp.end(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#fff1f2">
                        <h2 style="color:#e11d48">❌ Google 로그인 실패</h2>
                        <p style="color:#4b5563">오류: ${authError}</p>
                        <p style="color:#6b7280">이 창을 닫고 다시 시도해주세요.</p>
                    </body></html>`);

                    if (!isResolvedOrRejected) {
                        isResolvedOrRejected = true;
                        reject(new Error('Google 로그인 실패: ' + authError));
                    }
                    cleanup();
                    return;
                }

                if (!authCode) {
                    rsp.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                    rsp.end('잘못된 요청입니다. (Authorization code가 없습니다.)');
                    return;
                }

                // 성공 응답 전송
                rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                rsp.end(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#f0f4ff">
                    <h2 style="color:#4f46e5">✅ Google 로그인 완료!</h2>
                    <p style="color:#64748b">로그인이 성공적으로 처리되었습니다. 이 브라우저 창은 자동으로 닫힙니다.</p>
                </body></html>`);

                if (loginWin && !loginWin.isDestroyed()) {
                    setTimeout(() => {
                        try {
                            loginWin.close();
                        } catch (e) {}
                    }, 1000);
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
                        if (!isResolvedOrRejected) {
                            isResolvedOrRejected = true;
                            reject(new Error('토큰 교환 실패: ' + (tokenData.error_description || tokenData.error)));
                        }
                        cleanup();
                        return;
                    }

                    // 사용자 정보 조회
                    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                        headers: { Authorization: `Bearer ${tokenData.access_token}` }
                    });
                    const userInfo = await userInfoRes.json();

                    console.log('[OAuth] 로그인 성공:', userInfo.email);

                    if (!isResolvedOrRejected) {
                        isResolvedOrRejected = true;
                        resolve({
                            accessToken: tokenData.access_token,
                            idToken: tokenData.id_token,       // Firebase signInWithCredential용
                            refreshToken: tokenData.refresh_token,
                            expiresIn: tokenData.expires_in,
                            user: {
                                uid: userInfo.id,
                                email: userInfo.email,
                                displayName: userInfo.name,
                                photoURL: userInfo.picture
                            }
                        });
                    }

                    // 메인 윈도우 포커스
                    if (mainWindow) {
                        if (mainWindow.isMinimized()) mainWindow.restore();
                        mainWindow.show();
                        mainWindow.focus();
                    }
                } catch (err) {
                    if (!isResolvedOrRejected) {
                        isResolvedOrRejected = true;
                        reject(new Error('인증 처리 오류: ' + err.message));
                    }
                } finally {
                    cleanup();
                }
            }
        });

        oauthServer.on('error', (err) => {
            if (!isResolvedOrRejected) {
                isResolvedOrRejected = true;
                reject(new Error('OAuth 콜백 서버 시작 실패: ' + err.message));
            }
            cleanup();
        });

        activeOAuthServer = oauthServer;
        oauthServer.listen(9876, async () => {
            console.log('[OAuth] 콜백 서버 시작됨 (포트 9876)');
            try {
                // 시스템 웹 브라우저 대신 작은 Electron 윈도우를 모달 창으로 띄움
                loginWin = new BrowserWindow({
                    width: 500,
                    height: 650,
                    title: 'Google 계정 로그인',
                    parent: mainWindow || undefined,
                    modal: true,
                    show: false,
                    resizable: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                });

                loginWin.setMenu(null); // 상단 기본 메뉴바 숨김

                // Google의 Electron 로그인 차단을 피하기 위해 Chrome User-Agent 주입
                const userAgent = process.platform === 'darwin'
                    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

                loginWin.loadURL(authUrl, { userAgent });

                // 뒤로가기/앞으로가기 단축키 지원 (Backspace, Cmd+[, Alt+Left 등)
                loginWin.webContents.on('before-input-event', (event, input) => {
                    if (input.type === 'keyDown') {
                        const isBack = 
                            (process.platform === 'darwin' && input.meta && input.key === '[') || // Cmd + [
                            (input.alt && input.key === 'ArrowLeft') || // Alt + Left
                            (input.key === 'BrowserBack') || // Browser Back key
                            (input.key === 'Backspace' && !input.meta && !input.control && !input.alt); // Backspace (텍스트 필드 외)

                        if (isBack) {
                            if (loginWin.webContents.canGoBack()) {
                                loginWin.webContents.goBack();
                                event.preventDefault();
                            }
                        }
                    }
                });

                // 마우스 우클릭 시 컨텍스트 메뉴로 뒤로가기/앞으로가기/새로고침 지원
                loginWin.webContents.on('context-menu', (e, params) => {
                    const menu = Menu.buildFromTemplate([
                        {
                            label: '뒤로 가기',
                            enabled: loginWin.webContents.canGoBack(),
                            click: () => loginWin.webContents.goBack()
                        },
                        {
                            label: '앞으로 가기',
                            enabled: loginWin.webContents.canGoForward(),
                            click: () => loginWin.webContents.goForward()
                        },
                        { type: 'separator' },
                        {
                            label: '새로고침',
                            click: () => loginWin.webContents.reload()
                        }
                    ]);
                    menu.popup({ window: loginWin });
                });

                loginWin.once('ready-to-show', () => {
                    loginWin.show();
                });

                // 로그인 창이 그냥 닫혔을 때 (취소) 처리
                loginWin.on('close', () => {
                    if (!isResolvedOrRejected) {
                        isResolvedOrRejected = true;
                        reject(new Error('로그인이 취소되었습니다.'));
                    }
                    cleanup();
                });
            } catch (err) {
                if (!isResolvedOrRejected) {
                    isResolvedOrRejected = true;
                    reject(new Error('로그인 창을 열지 못했습니다: ' + err.message));
                }
                cleanup();
            }
        });
    });
});

ipcMain.handle('clear-google-cookies', async () => {
    await session.defaultSession.clearStorageData({
        storages: ['cookies']
    });
    console.log('[Electron Main] Cleared all session cookies.');
    return true;
});

ipcMain.handle('clear-odoo-cookies', async () => {
    try {
        // persist:odoo 파티션의 세션 사용
        const odooSession = session.fromPartition('persist:odoo');
        const cookies = await odooSession.cookies.get({});
        for (const cookie of cookies) {
            const protocol = cookie.secure ? 'https' : 'http';
            const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
            const url = `${protocol}://${domain}${cookie.path}`;
            await odooSession.cookies.remove(url, cookie.name);
        }
        // session_id 쿠키만 명확히 삭제
        await odooSession.clearStorageData({ storages: ['cookies'] });
        console.log('[Electron Main] Cleared Odoo session cookies (persist:odoo partition).');
        return true;
    } catch (error) {
        console.error('Failed to clear Odoo cookies:', error);
        return false;
    }
});

ipcMain.handle('set-odoo-cookie', async (event, cookieData) => {
    try {
        await session.defaultSession.cookies.set(cookieData);
        console.log('[Electron Main] Set Odoo session cookie successfully.');
        return true;
    } catch (error) {
        console.error('Failed to set Odoo cookie:', error);
        return false;
    }
});

ipcMain.handle('get-odoo-session-id', async () => {
    try {
        const odooSession = session.fromPartition('persist:odoo');
        const cookies = await odooSession.cookies.get({ name: 'session_id' });
        if (cookies.length > 0) return cookies[0].value;
        return null;
    } catch (error) {
        console.error('Failed to get Odoo session cookie:', error);
        return null;
    }
});

ipcMain.on('set-theme', (event, theme) => {
    console.log('[Electron Main] Setting theme to:', theme);
    nativeTheme.themeSource = theme;
});

// ===== Markdown Notes (Obsidian-like) File System Handlers =====

ipcMain.handle('notes:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '노트 폴더 선택 (Obsidian Vault 또는 일반 폴더)'
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

ipcMain.handle('notes:listDir', async (event, dirPath) => {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
            .filter(e => !e.name.startsWith('.'))
            .map(e => ({
                name: e.name,
                path: path.join(dirPath, e.name),
                isDir: e.isDirectory(),
            }))
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name, 'ko');
            });
    } catch { return []; }
});

ipcMain.handle('notes:readFile', async (event, filePath) => {
    try { return fs.readFileSync(filePath, 'utf-8'); }
    catch { return null; }
});

ipcMain.handle('notes:writeFile', async (event, filePath, content) => {
    try { fs.writeFileSync(filePath, content, 'utf-8'); return true; }
    catch { return false; }
});

ipcMain.handle('notes:saveImage', async (event, filePath, arrayBuffer) => {
    try { 
        fs.writeFileSync(filePath, Buffer.from(arrayBuffer)); 
        return true; 
    } catch { 
        return false; 
    }
});

ipcMain.handle('notes:createFile', async (event, dirPath, fileName) => {
    const filePath = path.join(dirPath, fileName.endsWith('.md') ? fileName : fileName + '.md');
    try {
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, `# ${fileName.replace(/\.md$/, '')}\n\n`, 'utf-8');
        return filePath;
    } catch { return null; }
});

ipcMain.handle('notes:createDir', async (event, dirPath, dirName) => {
    const newPath = path.join(dirPath, dirName);
    try { fs.mkdirSync(newPath, { recursive: true }); return newPath; }
    catch { return null; }
});

ipcMain.handle('notes:deleteFile', async (event, filePath) => {
    try { fs.unlinkSync(filePath); return true; }
    catch { return false; }
});

ipcMain.handle('notes:renameFile', async (event, oldPath, newPath) => {
    try { fs.renameSync(oldPath, newPath); return true; }
    catch { return false; }
});

let vaultFileCache = new Map();
let vaultCacheTime = 0;

ipcMain.handle('notes:findFile', async (event, dirPath, fileName) => {
    const now = Date.now();
    // 5초마다 캐시 갱신 (단기간 다중 호출 시 디스크 I/O 최적화)
    if (now - vaultCacheTime > 5000 || !vaultFileCache.has(dirPath)) {
        const cache = new Map();
        const scanDir = (dir) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.name === '.git' || e.name === 'node_modules') continue;
                    if (e.isDirectory()) scanDir(path.join(dir, e.name));
                    else cache.set(e.name.toLowerCase(), path.join(dir, e.name));
                }
            } catch { }
        };
        scanDir(dirPath);
        vaultFileCache.set(dirPath, cache);
        vaultCacheTime = now;
    }
    
    const cache = vaultFileCache.get(dirPath);
    return cache ? cache.get(fileName.toLowerCase()) || null : null;
});
