const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
    getZoomFactor: () => webFrame.getZoomFactor(),
    checkForUpdates: (options) => ipcRenderer.send('check-for-updates', options),
    startDownload: () => ipcRenderer.send('start-download'),
    restartApp: () => ipcRenderer.send('restart-app'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
    setLoginItemSettings: (openAtLogin) => ipcRenderer.invoke('set-login-item-settings', openAtLogin),
    getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),
    googleOAuthSignIn: () => ipcRenderer.invoke('google-oauth-signin'),
    clearGoogleCookies: () => ipcRenderer.invoke('clear-google-cookies'),
    clearOdooCookies: () => ipcRenderer.invoke('clear-odoo-cookies'),
    setOdooCookie: (cookieData) => ipcRenderer.invoke('set-odoo-cookie', cookieData),
    getOdooSessionId: () => ipcRenderer.invoke('get-odoo-session-id'),
    setTheme: (theme) => ipcRenderer.send('set-theme', theme),
    sendToHost: (channel, ...args) => ipcRenderer.sendToHost(channel, ...args),
    // Notes (Obsidian-like) file system API
    notes: {
        openFolder:  ()              => ipcRenderer.invoke('notes:openFolder'),
        listDir:     (dirPath)       => ipcRenderer.invoke('notes:listDir', dirPath),
        readFile:    (filePath)      => ipcRenderer.invoke('notes:readFile', filePath),
        writeFile:   (filePath, content) => ipcRenderer.invoke('notes:writeFile', filePath, content),
        saveImage:   (filePath, arrayBuffer) => ipcRenderer.invoke('notes:saveImage', filePath, arrayBuffer),
        createFile:  (dirPath, name) => ipcRenderer.invoke('notes:createFile', dirPath, name),
        createDir:   (dirPath, name) => ipcRenderer.invoke('notes:createDir', dirPath, name),
        deleteFile:  (filePath)      => ipcRenderer.invoke('notes:deleteFile', filePath),
        renameFile:  (oldPath, newPath) => ipcRenderer.invoke('notes:renameFile', oldPath, newPath),
        findFile:    (dirPath, fileName) => ipcRenderer.invoke('notes:findFile', dirPath, fileName),
    },
    onUpdateMessage: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('update-message', subscription);
        return () => {
            ipcRenderer.removeListener('update-message', subscription);
        };
    },
    onAppGoBack: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('app-go-back', subscription);
        return () => {
            ipcRenderer.removeListener('app-go-back', subscription);
        };
    },
    onAppGoForward: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('app-go-forward', subscription);
        return () => {
            ipcRenderer.removeListener('app-go-forward', subscription);
        };
    },
    // Electron 네이티브 알림 (빌드 후에도 안정적으로 동작)
    showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body })
});
