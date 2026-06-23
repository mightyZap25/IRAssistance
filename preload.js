const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    checkForUpdates: (options) => ipcRenderer.send('check-for-updates', options),
    startDownload: () => ipcRenderer.send('start-download'),
    restartApp: () => ipcRenderer.send('restart-app'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateMessage: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('update-message', subscription);
        return () => {
            ipcRenderer.removeListener('update-message', subscription);
        };
    }
});
