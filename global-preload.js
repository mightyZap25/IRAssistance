const { ipcRenderer, webFrame } = require('electron');

// webFrame을 사용해 메인(페이지) 컨텍스트에서 직접 스크립트 실행
webFrame.executeJavaScript(`
    (function() {
        function ILinkNotification(title, options) {
            var body = options && options.body || '';
            // 콘솔 메시지를 통해 메인 프로세스로 신호 전달 (IPC 대용)
            // 출처를 알 수 있도록 hostname을 같이 보냅니다.
            console.log('ILINK_NOTIF::' + JSON.stringify({ 
                title: title, 
                body: body,
                source: window.location.hostname 
            }));
            
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
                console.log('ILINK_NOTIF::' + JSON.stringify({ 
                    title: title, 
                    body: options && options.body ? options.body : '',
                    source: window.location.hostname
                }));
                
                return originalShowNotification.call(this, title, options).catch(e => {
                    // 무시
                });
            };
            window.ServiceWorkerRegistration.prototype.showNotification.toString = function() { return 'function showNotification() { [native code] }'; };
        }
    })();
`).catch(console.error);
