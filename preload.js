const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    checkForUpdates: (options) => ipcRenderer.send('check-for-updates', options),
    startDownload: () => ipcRenderer.send('start-download'),
    restartApp: () => ipcRenderer.send('restart-app'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    googleOAuthSignIn: () => ipcRenderer.invoke('google-oauth-signin'),
    clearGoogleCookies: () => ipcRenderer.invoke('clear-google-cookies'),
    setTheme: (theme) => ipcRenderer.send('set-theme', theme),
    onUpdateMessage: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('update-message', subscription);
        return () => {
            ipcRenderer.removeListener('update-message', subscription);
        };
    }
});
