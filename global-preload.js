const { ipcRenderer, webFrame } = require('electron');

console.log('[ILink-Preload] 전역 알림 가로채기 스크립트가 로드되었습니다.');

// webFrame을 사용해 메인(페이지) 컨텍스트에서 직접 스크립트 실행
webFrame.executeJavaScript(`
    (function() {
        console.log('[ILink-Preload] 메인 컨텍스트 주입 완료');
        
        function ILinkNotification(title, options) {
            var body = options && options.body || '';
            console.log('[ILink-Preload] 푸시 알림 가로챔:', title);
            
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
        console.log('[ILink-Preload] window.Notification 객체를 완벽히 가로챘습니다.');

        if (window.ServiceWorkerRegistration) {
            const originalShowNotification = window.ServiceWorkerRegistration.prototype.showNotification;
            window.ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
                console.log('[ILink-Preload] ServiceWorker 푸시 알림 가로챔:', title);
                console.log('ILINK_NOTIF::' + JSON.stringify({ 
                    title: title, 
                    body: options && options.body ? options.body : '',
                    source: window.location.hostname
                }));
                
                return originalShowNotification.call(this, title, options).catch(e => {
                    console.log('[ILink-Preload] ServiceWorker 원본 알림 호출 무시됨 (정상)', e);
                });
            };
            window.ServiceWorkerRegistration.prototype.showNotification.toString = function() { return 'function showNotification() { [native code] }'; };
            console.log('[ILink-Preload] ServiceWorkerRegistration.showNotification 객체를 완벽히 가로챘습니다.');
        }
    })();
`).catch(console.error);
