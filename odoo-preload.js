const { ipcRenderer } = require('electron');

console.log('[Odoo-Preload] Odoo 알림 가로채기 스크립트가 실행되었습니다. (contextIsolation=no 환경)');

class OdooNotification {
    constructor(title, options) {
        console.log('[Odoo-Preload] 🔔 알림 띄우기 요청됨:', title);
        ipcRenderer.send('odoo-desktop-notification', { title, options });
    }
    
    static get permission() { 
        return 'granted'; 
    }
    
    static requestPermission(callback) {
        console.log('[Odoo-Preload] Odoo가 알림 권한을 요청했습니다. (자동 승인)');
        if (callback) callback('granted');
        return Promise.resolve('granted');
    }
}

// 기본 알림 객체 덮어쓰기
window.Notification = OdooNotification;
console.log('[Odoo-Preload] window.Notification 객체를 완벽히 가로챘습니다.');
