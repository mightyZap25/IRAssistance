const { ipcRenderer, webFrame } = require('electron');

// webview 내부에서 발생하는 Notification 이벤트를 가로채어 Electron main 프로세스로 전달합니다.
webFrame.executeJavaScript(`
    (function() {
        function sendNotifToMain(title, body, source) {
            if (window.__ilinkSendNotif) {
                try { window.__ilinkSendNotif(title, body, source); } catch(e) {}
            }
            console.log('ILINK_NOTIF::' + JSON.stringify({ 
                title: title, 
                body: body,
                source: source
            }));
        }

        function ILinkNotification(title, options) {
            var body = options && options.body || '';
            var source = window.location.hostname;
            sendNotifToMain(title, body, source);
            
            this.addEventListener = function() {};
            this.removeEventListener = function() {};
            this.close = function() {};
            this.onclick = null;
            this.onclose = null;
            this.onerror = null;
            this.onshow = null;
            return this;
        }

        ILinkNotification.permission = 'granted';
        ILinkNotification.requestPermission = function(cb) {
            if (cb) cb('granted');
            return Promise.resolve('granted');
        };
        ILinkNotification.toString = function() { return 'function Notification() { [native code] }'; };
        ILinkNotification.requestPermission.toString = function() { return 'function requestPermission() { [native code] }'; };

        window.Notification = ILinkNotification;

        if (window.ServiceWorkerRegistration) {
            const originalShowNotification = window.ServiceWorkerRegistration.prototype.showNotification;
            window.ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
                sendNotifToMain(
                    title, 
                    options && options.body ? options.body : '',
                    window.location.hostname
                );
                return originalShowNotification.call(this, title, options).catch(function(e) {});
            };
            window.ServiceWorkerRegistration.prototype.showNotification.toString = function() { return 'function showNotification() { [native code] }'; };
        }

        // 한글 폰트 Fallback CSS 주입 (ㅁ 글자 깨짐 완전 방지)
        try {
            const style = document.createElement('style');
            style.textContent = 'body, button, input, select, textarea, .o_main_navbar, .o_content, span, div, p, td, th, a { font-family: -apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif !important; }';
            document.head.appendChild(style);
        } catch(e) {}

        if (window.location.hostname.includes('192.168.0.7') || window.location.hostname.includes('100.67.238.32') || window.location.hostname.includes('odoo')) {
            Object.defineProperty(document, 'hidden', { get: function() { return true; } });
            Object.defineProperty(document, 'visibilityState', { get: function() { return 'hidden'; } });
        }
    })();
`).catch(console.error);

try {
    if (typeof window !== 'undefined') {
        window.__ilinkSendNotif = function(title, body, source) {
            try {
                ipcRenderer.sendToHost('ilink-notification', { title, body, source });
            } catch(e) {
                console.log('ILINK_NOTIF::' + JSON.stringify({ title, body, source }));
            }
        };
    }
} catch(e) {}
