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

        if (window.location.hostname.includes('192.168.0.11') || window.location.hostname.includes('100.67.238.32') || window.location.hostname.includes('odoo')) {
            Object.defineProperty(document, 'hidden', { get: function() { return true; } });
            Object.defineProperty(document, 'visibilityState', { get: function() { return 'hidden'; } });
        }

        // 웹뷰 내부에서 포커스를 가지고 있을 때 마우스 뒤로가기(button 3)/앞으로가기(button 4) 처리
        window.addEventListener('mouseup', function(e) {
            if (e.button === 3) {
                e.preventDefault();
                window.history.back();
            } else if (e.button === 4) {
                e.preventDefault();
                window.history.forward();
            }
        }, { capture: true });
    })();
`).catch(console.error);

// -----------------------------------------------------------------------------
// Preload Native Context (Here we have access to webFrame)
// -----------------------------------------------------------------------------

// 웹뷰 내부에서 포커스를 가지고 있을 때 키보드 단축키 처리 (Alt+Left/Right 뒤로가기 및 Ctrl+/-/0 확대축소)
window.addEventListener('keydown', function(e) {
    if (e.altKey && e.key === 'ArrowLeft') {
        window.history.back();
    } else if (e.altKey && e.key === 'ArrowRight') {
        window.history.forward();
    } else if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
        let currentZoom = webFrame.getZoomFactor();
        if (e.key === '=' || e.key === '+') currentZoom += 0.1;
        else if (e.key === '-') currentZoom -= 0.1;
        else if (e.key === '0') currentZoom = 1.0;
        
        if (currentZoom < 0.5) currentZoom = 0.5;
        if (currentZoom > 3.0) currentZoom = 3.0;
        webFrame.setZoomFactor(currentZoom);
    }
}, { capture: true });

// 웹뷰 내부에서 Ctrl + 마우스 휠 줌(Zoom) 기능
window.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
        e.preventDefault();
        let currentZoom = webFrame.getZoomFactor();
        if (e.deltaY > 0) currentZoom -= 0.1;
        else currentZoom += 0.1;
        
        if (currentZoom < 0.5) currentZoom = 0.5;
        if (currentZoom > 3.0) currentZoom = 3.0;
        
        webFrame.setZoomFactor(currentZoom);
    }
}, { passive: false });

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
