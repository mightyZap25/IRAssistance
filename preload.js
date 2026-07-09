const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
    getZoomFactor: () => webFrame.getZoomFactor(),
    checkForUpdates: (options) => ipcRenderer.send('check-for-updates', options),
    startDownload: () => ipcRenderer.send('start-download'),
    restartApp: () => ipcRenderer.send('restart-app'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    googleOAuthSignIn: () => ipcRenderer.invoke('google-oauth-signin'),
    clearGoogleCookies: () => ipcRenderer.invoke('clear-google-cookies'),
    clearOdooCookies: () => ipcRenderer.invoke('clear-odoo-cookies'),
    getOdooSessionId: () => ipcRenderer.invoke('get-odoo-session-id'),
    setTheme: (theme) => ipcRenderer.send('set-theme', theme),
    // Notes (Obsidian-like) file system API
    notes: {
        openFolder:  ()              => ipcRenderer.invoke('notes:openFolder'),
        listDir:     (dirPath)       => ipcRenderer.invoke('notes:listDir', dirPath),
        readFile:    (filePath)      => ipcRenderer.invoke('notes:readFile', filePath),
        writeFile:   (filePath, content) => ipcRenderer.invoke('notes:writeFile', filePath, content),
        createFile:  (dirPath, name) => ipcRenderer.invoke('notes:createFile', dirPath, name),
        createDir:   (dirPath, name) => ipcRenderer.invoke('notes:createDir', dirPath, name),
        deleteFile:  (filePath)      => ipcRenderer.invoke('notes:deleteFile', filePath),
        renameFile:  (oldPath, newPath) => ipcRenderer.invoke('notes:renameFile', oldPath, newPath),
    },
    onUpdateMessage: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('update-message', subscription);
        return () => {
            ipcRenderer.removeListener('update-message', subscription);
        };
    }
});
