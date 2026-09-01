import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { createSpreadsheet, updateSpreadsheetValues } from '../services/googleService';
import { useAuth } from '../contexts/AuthContext';

let globalOdooMenus = (() => {
    try {
        const cached = localStorage.getItem('odoo_cached_menus');
        return cached ? JSON.parse(cached) : [];
    } catch (e) {
        return [];
    }
})();

let lastAuthenticatedUser = null;

export default function OdooWebView() {
    const { odooApiUrl } = useAuth();
    const location = useLocation();
    const webviewRef = useRef(null);
    const [menusLoaded, setMenusLoaded] = React.useState(globalOdooMenus.length > 0);
    const [isWebViewLoading, setIsWebViewLoading] = React.useState(true);

    const isElectron = window.electronAPI?.isElectron ||
                       (window && window.process && window.process.type === 'renderer') ||
                       (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    // 웹뷰 내비게이션 디버깅 및 마우스 뒤로가기 직접 후킹
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;
        
        const handleConsoleMessage = (e) => {
            if (e.message && e.message.includes('[mightyONE BackNav]')) {
                console.log(e.message);
            }
        };

        const handleDomReady = () => {
            // 웹뷰 내부에 Odoo 느린 서버 반응 시 목표 페이지 지속 재접속(Retry) 스크립트 삽입
            webview.executeJavaScript(`
                // 페이지가 새로 로드될 때마다 네비게이션 타임스탬프 리셋 (유예기간 항상 보장)
                window._iLinkNavTime = Date.now();
                // sessionStorage에서 목표 경로 복원 (페이지 전환 시 새 컨텍스트에서도 유효)
                window._iLinkTargetPath = sessionStorage.getItem('iLinkTargetPath') || null;
                console.log('[mightyONE Nav] 페이지 로드 - 목표경로: ' + (window._iLinkTargetPath || 'none'));

                if (!window._iLinkNavWatcher) {
                    window._iLinkNavWatcher = true;
                    console.log('[mightyONE Nav] 감시기 가동');

                    // 0. Odoo 작업/사용 중 세션 타임아웃 방지 (3분마다 Keep-Alive 핑 전송)
                    setInterval(function() {
                        try {
                            fetch('/web/session/check', { method: 'POST', credentials: 'include' }).catch(function() {});
                        } catch(e) {}
                    }, 180000);

                    // 1. 세션 만료(Session Expired) 및 로그인 페이지 튕김 감지 시 Silent Auto-Relogin (자동 재인증)
                    setInterval(function() {
                        // 페이지 전환 직후 3초간은 개입하지 않음
                        if (window._iLinkNavTime && (Date.now() - window._iLinkNavTime) < 3000) return;

                        const bodyText = document.body ? document.body.innerText : '';
                        const isLoginPage = window.location.pathname.includes('/web/login');
                        const isSessionExpired = bodyText.includes('Session Expired') || 
                                                 bodyText.includes('세션이 만료되었습니다') || 
                                                 bodyText.includes('세션 만료');
                                                 // ⚠️ /web/login 경로 체크 제거: 페이지 전환 중 잠깐 거치는 경우 오판 유발

                        if (isSessionExpired && !window._isReloggingIn) {
                            console.log('[mightyONE Nav] ⚠️ 세션 만료/로그인 페이지 감지!' +
                                ' | 현재경로: ' + window.location.pathname +
                                ' | 로그인페이지: ' + isLoginPage +
                                ' | 목표경로: ' + (window._iLinkTargetPath || 'none'));
                            window._isReloggingIn = true;

                            let creds = null;
                            try { creds = JSON.parse(sessionStorage.getItem('odoo_last_creds') || 'null'); } catch(e) {}

                            if (creds && creds.login && creds.password && creds.db) {
                                console.log('[mightyONE Nav] 🔑 자동 재인증 시도: ' + creds.login);
                                fetch('/web/session/authenticate', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        jsonrpc: '2.0', id: 99,
                                        params: { db: creds.db, login: creds.login, password: creds.password }
                                    })
                                }).then(r => r.json()).then(d => {
                                    if (d.result && d.result.uid) {
                                        console.log('[mightyONE Nav] ✅ 재인증 성공! uid=' + d.result.uid + ' → 복귀 경로: ' + (window._iLinkTargetPath || '/odoo/time-off'));
                                        window._isReloggingIn = false;
                                        const targetPath = window._iLinkTargetPath || sessionStorage.getItem('iLinkTargetPath') || '/odoo/action-724';
                                        window.location.replace(targetPath);
                                    } else {
                                        console.log('[mightyONE Nav] ❌ 재인증 실패: ' + JSON.stringify(d.error || {}));
                                        window._isReloggingIn = false;
                                    }
                                }).catch(function(e) {
                                    console.log('[mightyONE Nav] ❌ 재인증 네트워크 오류: ' + e.message);
                                    window._isReloggingIn = false;
                                });
                            } else {
                                console.log('[mightyONE Nav] ❌ 저장된 자격증명 없음 - 재인증 불가');
                                window._isReloggingIn = false;
                            }
                        }

                        // 유효하지 않습니다 / Action not found 모달 자동 닫기 및 목표 페이지 재접속
                        const invalidModal = document.querySelector('.o_dialog, .modal-content');
                        if (invalidModal && invalidModal.innerText && (invalidModal.innerText.includes('유효하지') || invalidModal.innerText.includes('Invalid') || invalidModal.innerText.includes('Action not found'))) {
                            console.log('[mightyONE Nav] ⚠️ 유효하지 않은 액션 모달 감지됨! 자동 닫고 목표 페이지 재접속');
                            const okBtn = invalidModal.querySelector('.btn-primary, .btn-secondary, button');
                            if (okBtn) okBtn.click();
                            const targetPath = window._iLinkTargetPath || sessionStorage.getItem('iLinkTargetPath') || '/odoo/action-724';
                            setTimeout(function() { window.location.replace(targetPath); }, 500);
                        }
                    }, 600);



                    // Odoo 네비게이션 메뉴 중 Discuss 아이콘 숨기기 및 푸시 알림 에러 토스트 자동 닫기
                    setInterval(function() {
                        const discussMenu = document.querySelector('a[data-menu-xmlid="mail.menu_root_discuss"]');
                        if (discussMenu) discussMenu.style.display = 'none';
                        
                        // "푸시 알림을 사용 설정하지 못함" 에러 토스트 매우 빠르게 자동 닫기
                        const toasts = document.querySelectorAll('.o_notification_manager .o_notification, .o_notification_toast, .toast');
                        toasts.forEach(toast => {
                            const text = toast.innerText || '';
                            if (text.includes('푸시 알림') || text.includes('push service') || text.includes('Registration failed')) {
                                toast.style.opacity = '0';
                                toast.style.display = 'none';
                                const closeBtn = toast.querySelector('.btn-close, .o_notification_close, button');
                                if (closeBtn) closeBtn.click();
                            }
                        });

                    }, 200);

                    window.addEventListener('mouseup', function(e) {
                        if (e.button === 3) {
                            console.log('[mightyONE BackNav] 마우스 뒤로가기 버튼(3번) 입력 감지됨!');
                            
                            function triggerClick(el, label) {
                                if (!el) return false;
                                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                                    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                                });
                                return true;
                            }

                            const closeBtn = document.querySelector('.modal-header .btn-close, .modal-header .close, .o_dialog .btn-close');
                            if (closeBtn && closeBtn.offsetParent !== null) { triggerClick(closeBtn, '모달 닫기 버튼'); return; }

                            const backBtn = document.querySelector('.o_back_button, .o_form_button_cancel, [data-hotkey="b"]');
                            if (backBtn && backBtn.offsetParent !== null) { triggerClick(backBtn, '명시적 뒤로가기/취소 버튼'); return; }
                            
                            const breadcrumbs = document.querySelectorAll('.breadcrumb-item, .o_breadcrumb_item, .o_breadcrumb .active');
                            const prevItems = Array.from(breadcrumbs).filter(el => {
                                return !el.classList.contains('active') && el.getAttribute('aria-current') !== 'page';
                            });
                            
                            if (prevItems.length > 0) {
                                const target = prevItems[prevItems.length - 1];
                                const link = target.querySelector('a');
                                triggerClick(link || target, '빵부스러기 이전 단계');
                                return;
                            }

                            const defaultMenuMapping = ['매입', '재고관리', '제조관리', '수리'];
                            const navLinks = document.querySelectorAll('.o_main_navbar a, .o_navbar a, .nav-link, .dropdown-toggle, .o_menu_brand');
                            let clickedDefault = false;
                            
                            for (let i = 0; i < navLinks.length; i++) {
                                const el = navLinks[i];
                                const text = el.innerText ? el.innerText.trim() : '';
                                if (defaultMenuMapping.includes(text)) {
                                    clickedDefault = triggerClick(el, '디폴트 메뉴(' + text + ')');
                                    if (clickedDefault) break;
                                }
                            }

                            if (clickedDefault) return;

                            let rootHash = window._iLinkRootHash;
                            try { if (!rootHash) rootHash = sessionStorage.getItem('iLinkRootHash'); } catch(e) {}
                            if (!rootHash && window.location.hash.includes('menu_id=')) {
                                const match = window.location.hash.match(/(menu_id=\\d+)/);
                                if (match) rootHash = match[1];
                            }

                            if (rootHash) {
                                window.location.hash = rootHash;
                                window.location.reload();
                                return;
                            }

                            window.history.back();
                        }
                    });
                }
            `).catch(() => {});
        };
        
        const handleIpcMessage = (e) => {
            if (e.channel === 'odoo-notification') {
                const { title, options } = e.args[0];
                console.log('[OdooWebView] IPC Notification Request Received:', title);
                // 메인 렌더러(mightyONE) 권한으로 진짜 윈도우 알림을 띄웁니다!
                new window.Notification(title, options);
            } else if (e.channel === 'odoo-navigate') {
                const { path } = e.args[0];
                console.log('[OdooWebView] IPC Navigate Request Received:', path);
                // React Router를 통해 라우팅 수행
                window.location.hash = '#' + path; // HashRouter 사용 가정
            }
        };

        const handleFinishLoad = () => {
            setIsWebViewLoading(false);
        };

        webview.addEventListener('console-message', handleConsoleMessage);
        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('ipc-message', handleIpcMessage);
        webview.addEventListener('did-finish-load', handleFinishLoad);
        return () => {
            webview.removeEventListener('console-message', handleConsoleMessage);
            webview.removeEventListener('dom-ready', handleDomReady);
            webview.removeEventListener('ipc-message', handleIpcMessage);
            webview.removeEventListener('did-finish-load', handleFinishLoad);
        };
    }, []);





    // 목표 URL 계산 (근태/휴가 및 각 메뉴 다국어 대응 & 채팅창 튕김 방지)
    const getTargetUrl = () => {
        if (location.pathname === '/odoo/apps') return `${odooApiUrl}/odoo/apps`;
        if (location.pathname === '/odoo/login') return `${odooApiUrl}/web/login`;
        if (location.pathname === '/odoo/logout') return `${odooApiUrl}/web/session/logout`;
        
        if (location.pathname === '/odoo/view') {
            const searchParams = new URLSearchParams(location.search);
            const menuId = searchParams.get('menu_id');
            if (menuId) return `${odooApiUrl}/web#menu_id=${menuId}`;
        }
        
        // Odoo 17 최신 네이티브 라우트 패턴 (예: /odoo/to-do, /odoo/action-707 등)을 패스스루
        if (location.pathname.startsWith('/odoo/')) {
            return `${odooApiUrl}${location.pathname}${location.search}${location.hash}`;
        }
        
        // 네이티브 메뉴 경로를 Odoo 앱(App) 다국어 키워드 배열로 매핑
        const appMap = {
            '/parts': ['Inventory', '재고', '재고관리'],
            '/inventory': ['Inventory', '재고', '재고관리'],
            '/bom': ['Manufacturing', '제조', '제조관리'],
            '/prod-execution': ['Manufacturing', '제조', '제조관리'],
            '/eco': ['PLM', '제품수명주기'],
            '/customers': ['Contacts', '연락처', '고객'],
            '/manufacturers': ['Contacts', '연락처'],
            '/vendors': ['Contacts', '연락처', '공급업체'],
            '/purchasing': ['Purchase', '매입', '구매'],
            '/qa/dashboard': ['Quality', '품질'],
            '/project/management': ['Project', '프로젝트'],
            '/project/tasks': ['Project', '프로젝트'],
            '/sales/billing': ['Accounting', 'Invoicing', '회계', '청구']
        };

        const targetKeywords = appMap[location.pathname];
        if (targetKeywords && globalOdooMenus.length > 0) {
            const matchedMenu = globalOdooMenus.find(m => 
                m.name && targetKeywords.some(kw => m.name.toLowerCase().includes(kw.toLowerCase()))
            );
            if (matchedMenu) {
                return `${odooApiUrl}/web#menu_id=${matchedMenu.menu_id}`;
            }
        }

        // 앱 시작 시 (location.pathname === '/') 첫 화면을 근태/휴가 대시보드로 설정
        if (location.pathname === '/') {
            return `${odooApiUrl}/odoo/action-724`;
        }

        // 지정되지 않은 기타 경로일 경우 Odoo 외부 화면(예: 전자결재, 설정 등 커스텀 React 화면)이므로 
        // Odoo 내비게이션 처리를 무시하도록 null 반환
        return null;
    };

    const isFirstRender = useRef(true);

    // 경로 변경 시 webview URL 이동 및 안전 메뉴 전환 (유효하지 않다 오류 방지)
    useEffect(() => {
        const targetUrl = getTargetUrl();
        if (!targetUrl) {
            console.log(`[OdooWebView] ⏸️ 비-Odoo 경로 감지, Odoo 웹뷰 상태 유지 (변경 없음)`);
            return;
        }
        
        console.log(`[OdooWebView] 🔀 경로 변경 감지 | React 경로: ${location.pathname}${location.search} → 목표 URL: ${targetUrl}`);
        if (webviewRef.current && isElectron) {
            if (isFirstRender.current) {
                isFirstRender.current = false;
            }
            try {
                const currentUrl = webviewRef.current.getURL();
                console.log(`[OdooWebView] 📍 현재 웹뷰 URL: ${currentUrl}`);
                const targetBase = targetUrl.split('#')[0];
                const currentBase = currentUrl.split('#')[0];
                const hashPart = targetUrl.includes('#') ? targetUrl.split('#')[1] : '';
                
                // Odoo 17 네이티브 경로를 웹뷰 내부에 저장 (채팅창 감시 스크립트의 복귀 목표로 사용)
                const targetPathForStorage = (() => {
                    try {
                        const u = new URL(targetUrl);
                        return u.pathname + u.search + u.hash;
                    } catch(e) { return ''; }
                })();
                if (targetPathForStorage && targetPathForStorage.startsWith('/odoo/') && !targetPathForStorage.includes('discuss')) {
                    webviewRef.current.executeJavaScript(`
                        window._iLinkTargetPath = '${targetPathForStorage}';
                        window._iLinkNavTime = Date.now();
                        try { sessionStorage.setItem('iLinkTargetPath', '${targetPathForStorage}'); } catch(e) {}
                        console.log('[mightyONE Nav] ✅ 목표 경로 저장: ${targetPathForStorage}');
                    `).catch(() => {});
                }

                // 구형 해시 기반도 병행 저장 (하위호환)
                if (hashPart) {
                    webviewRef.current.executeJavaScript(`
                        window._iLinkRootHash = '${hashPart}';
                        try { sessionStorage.setItem('iLinkRootHash', '${hashPart}'); } catch(e) {}
                    `).catch(() => {});
                }

                if (currentUrl !== targetUrl) {
                    console.log(`[OdooWebView] 🚀 이동 시도 | ${currentUrl} → ${targetUrl}`);
                    const isNativeOdoo17Path = targetUrl.includes('/odoo/') && !targetUrl.includes('#');
                    const targetOrigin = (() => { try { return new URL(targetUrl).origin; } catch(e) { return ''; } })();
                    const currentOrigin = (() => { try { return new URL(currentUrl).origin; } catch(e) { return ''; } })();
                    
                    const isLoginPage = currentUrl.includes('/web/login');
                    
                    // SPA 모드를 사용할지 결정
                    let shouldDoSpa = false;
                    if (currentOrigin && currentOrigin === targetOrigin && !isLoginPage) {
                        // 첫 클릭은 Odoo 내부 상태 꼬임을 방지하기 위해 무조건 풀 로드 진행
                        if (window._isFirstOdooClick === undefined && targetUrl !== `${odooApiUrl}/web`) {
                            window._isFirstOdooClick = false;
                            shouldDoSpa = false;
                            console.log(`[OdooWebView] 🌟 첫 메뉴 클릭 감지! 깔끔한 부팅을 위해 풀 로드 진행: ${targetUrl}`);
                        } else {
                            shouldDoSpa = true;
                        }
                    }
                    
                    if (shouldDoSpa) {
                        // 같은 도메인 내 이동인 경우 웹뷰 전체 새로고침(loadURL)을 피하고 Odoo SPA 내부 라우팅 유도
                        if (isNativeOdoo17Path) {
                            console.log(`[OdooWebView] 🔄 SPA 네이티브 라우팅 시도 | 경로: ${targetPathForStorage}`);
                            webviewRef.current.executeJavaScript(`
                                (function() {
                                    var path = '${targetPathForStorage}';
                                    
                                    // 1. Odoo 19 Owl 환경 객체가 노출되어 있는 경우 직접 라우터 호출
                                    try {
                                        if (window.odoo && window.odoo.__DEBUG__ && window.odoo.__DEBUG__.services && window.odoo.__DEBUG__.services.router) {
                                            window.odoo.__DEBUG__.services.router.pushState({ pathname: path });
                                            return;
                                        }
                                        if (window.__owl__ && window.__owl__.env && window.__owl__.env.services && window.__owl__.env.services.router) {
                                            window.__owl__.env.services.router.pushState({ pathname: path });
                                            return;
                                        }
                                    } catch(e) {}

                                    // 2. Odoo 19 화면 내에 존재하는 실제 네이티브 메뉴 a 태그를 찾아서 클릭 (Owl 라우터가 정상 감지하도록)
                                    var existingLink = document.querySelector('a[href="' + path + '"]');
                                    if (existingLink) {
                                        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                                            existingLink.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                                        });
                                        return;
                                    }

                                    // 3. Owl 라우터가 이벤트를 정상적으로 가로채는지 확인하고, 안 되면 재시도하는 강력한 로직
                                    function trySpaNavigation() {
                                        if (window.location.pathname === path) return;
                                        
                                        var existingLink = document.querySelector('a[href="' + path + '"]');
                                        var a = existingLink || document.createElement('a');
                                        
                                        if (!existingLink) {
                                            a.href = path;
                                            a.style.opacity = '0';
                                            a.style.position = 'absolute';
                                            a.style.zIndex = '-9999';
                                            document.body.appendChild(a);
                                        }
                                        
                                        var owlHandled = false;
                                        // window 객체에 이벤트를 달아야 Odoo 라우터(document)가 처리한 후의 상태를 확인 가능
                                        var windowClickHandler = function(e) {
                                            // 이벤트 타겟이 우리의 가짜 a 태그이거나 기존 메뉴 링크일 때
                                            if (e.target === a || a.contains(e.target)) {
                                                if (e.defaultPrevented) {
                                                    owlHandled = true; // Odoo 라우터가 정상적으로 가로챔
                                                } else {
                                                    e.preventDefault(); // 라우터가 로딩 중이라 못 잡았다면 네이티브 새로고침 차단!
                                                }
                                            }
                                        };
                                        window.addEventListener('click', windowClickHandler);
                                        
                                        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                                            a.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                                        });
                                        
                                        window.removeEventListener('click', windowClickHandler);
                                        if (!existingLink && a.parentNode) { a.parentNode.removeChild(a); }
                                        
                                        // Owl이 이벤트를 잡지 못했거나 URL이 안 바뀌었다면 아직 로딩 중이므로 0.5초 뒤 재시도
                                        if (!owlHandled && window.location.pathname !== path) {
                                            console.log('[mightyONE Nav] ⏳ Odoo 라우터가 아직 준비되지 않음. 0.5초 후 재시도...');
                                            setTimeout(trySpaNavigation, 500);
                                        }
                                    }
                                    
                                    trySpaNavigation();
                                })();
                            `).catch(() => {});
                        } else if (hashPart) {
                            // [구형 해시 경로 처리] 같은 base이면서 hash만 다른 경우 → 가상 클릭 시도
                            const menuIdMatch = hashPart.match(/menu_id=(\d+)/);
                            const menuId = menuIdMatch ? menuIdMatch[1] : null;

                            webviewRef.current.executeJavaScript(`
                                (function() {
                                    var menuId = "${menuId || ''}";
                                    var hashPart = "${hashPart}";
                                    var success = false;

                                    if (menuId) {
                                        var el = document.querySelector('[data-menu-id="' + menuId + '"], a[href*="menu_id=' + menuId + '"]');
                                        
                                        if (!el) {
                                            var dropdownItems = document.querySelectorAll('.dropdown-menu a, .o-dropdown--menu a');
                                            for (var i = 0; i < dropdownItems.length; i++) {
                                                if (dropdownItems[i].getAttribute('data-menu-id') === menuId || (dropdownItems[i].href && dropdownItems[i].href.includes('menu_id=' + menuId))) {
                                                    el = dropdownItems[i];
                                                    break;
                                                }
                                            }
                                        }

                                        if (el) {
                                            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                                                el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                                            });
                                            success = true;
                                        }
                                    }

                                    if (!success) {
                                        window.location.href = window.location.origin + '/web#' + hashPart;
                                        setTimeout(function() { window.location.reload(); }, 100);
                                    }
                                })();
                            `).then(() => {
                                if (webviewRef.current && webviewRef.current.clearHistory) {
                                    webviewRef.current.clearHistory();
                                }
                            }).catch(() => {
                                webviewRef.current.loadURL(targetUrl).catch(() => {});
                            });
                        }
                    } else {
                        // 완전히 다른 URL(예: 최초 로드 시) → loadURL로 직행
                        console.log(`[OdooWebView] 🌍 완전 외부 이동 또는 최초 로드 (loadURL)`);
                        const loadPromise = webviewRef.current.loadURL(targetUrl);
                        if (loadPromise && loadPromise.catch) {
                            loadPromise.then(() => {
                                if (webviewRef.current && webviewRef.current.clearHistory) {
                                    webviewRef.current.clearHistory();
                                }
                            }).catch(err => {
                                if (err && err.message && !err.message.includes('ERR_ABORTED')) {
                                    console.warn('[OdooWebView] loadURL warning:', err);
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                webviewRef.current.src = targetUrl;
            }
        }
    }, [location.pathname, location.search, isElectron, menusLoaded]);

    useEffect(() => {
        const handleClearSession = async () => {
            globalOdooMenus = [];
            lastAuthenticatedUser = null;
            try {
                localStorage.removeItem('odoo_cached_menus');
            } catch (e) {}
            setMenusLoaded(false);
            window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: [] }));
            
            if (webviewRef.current) {
                // 웹뷰 내부에서 Odoo 세션 파기
                try {
                    await webviewRef.current.executeJavaScript(`
                        (async () => {
                            try {
                                await fetch('/web/session/destroy', {
                                    method: 'POST', credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ jsonrpc: '2.0', id: 0, params: {} })
                                });
                            } catch(e) {}
                        })()
                    `).catch(() => {});
                } catch(e) {}
                
                webviewRef.current.loadURL(`${odooApiUrl}/web/login`);
            }
            
            if (isElectron && window.electronAPI?.clearOdooCookies) {
                await window.electronAPI.clearOdooCookies();
            }
        };
        window.addEventListener('clear-odoo-session', handleClearSession);
        return () => window.removeEventListener('clear-odoo-session', handleClearSession);
    }, [isElectron, odooApiUrl]);

    // odoo-auto-login 이벤트 수신: 웹뷰가 직접 Odoo 로그인 처리
    useEffect(() => {
        const handleAutoLogin = (e) => {
            const { login, password, db, url } = e.detail;
            
            // 이미 동일한 유저로 자동 로그인이 처리되어 있다면 중복 로그인 및 세션 끊김을 방지합니다.
            if (lastAuthenticatedUser === login) {
                return;
            }

            // 웹뷰가 준비되면 내부에서 인증 수행
            const attemptLogin = async () => {
                const webview = webviewRef.current;
                if (!webview) return;
                try {
                    // 새 자격증명으로 로그인 (Race condition 방지를 위해 락 설정)
                    const uid = await webview.executeJavaScript(`
                        (async () => {
                            if (window._isReloggingIn) return null;
                            window._isReloggingIn = true;
                            try {
                                const r = await fetch('/web/session/authenticate', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, params: { db: '${db}', login: '${login.replace(/'/g, "\\'")}', password: '${password.replace(/'/g, "\\'")}' } })
                                });
                                const d = await r.json();
                                window._isReloggingIn = false;
                                return d.result?.uid || null;
                            } catch(err) { 
                                window._isReloggingIn = false;
                                return null; 
                            }
                        })()
                    `);
                    if (uid) {
                        console.log('[OdooWebView] 웹뷰 내 자동 로그인 성공');
                        lastAuthenticatedUser = login; // 인증 완료된 유저 기록
                        
                        // 세션 만료 시 자동 재인증을 위해 웹뷰 내부 sessionStorage에 저장
                        webview.executeJavaScript(`
                            try {
                                sessionStorage.setItem('odoo_last_creds', JSON.stringify({
                                    login: '${login.replace(/'/g, "\\'")}',
                                    password: '${password.replace(/'/g, "\\'")}',
                                    db: '${db}'
                                }));
                            } catch(e) {}
                        `).catch(() => {});
                        let targetUrl = `${url}/odoo/action-724`;
                        webview.loadURL(targetUrl).catch(() => {});
                        // 백그라운드 웹뷰(Layout.jsx)도 쿠키가 세팅된 상태로 /web을 다시 로드하도록 알림
                        window.dispatchEvent(new CustomEvent('odoo-session-ready'));
                    }
                } catch(e) {
                    if (e.message && e.message.includes('dom-ready')) {
                        console.log('[OdooWebView] 웹뷰 DOM 준비 대기 중... 자동 로그인 재시도 (500ms)');
                        setTimeout(attemptLogin, 500);
                    } else {
                        console.log('[OdooWebView] 자동 로그인 실패 소리없이 통과:', e);
                    }
                }
            };
            attemptLogin();
        };

        window.addEventListener('odoo-auto-login', handleAutoLogin);

        // 앱 재시작 후에도 로그인 유지: 저장된 자격증명이 있으면 즉시 실행
        if (window._odooPendingCreds) {
            handleAutoLogin({ detail: window._odooPendingCreds });
        }

        return () => window.removeEventListener('odoo-auto-login', handleAutoLogin);
    }, [isElectron]);

    // Google 로그인 이벤트: 웹뷰를 /web 으로 이동 (기존 Odoo 세션 쿠키 활용)
    useEffect(() => {
        const handleGoogleLogin = (e) => {
            setTimeout(() => {
                const webview = webviewRef.current;
                if (!webview) return;
                
                let targetUrl = `${odooApiUrl}/odoo/action-724`;
                
                console.log('[OdooWebView] Google 로그인 감지 → Odoo 이동:', targetUrl);
                webview.loadURL(targetUrl).catch(() => {});
            }, 200);
        };
        window.addEventListener('odoo-google-login', handleGoogleLogin);
        return () => window.removeEventListener('odoo-google-login', handleGoogleLogin);
    }, [isElectron, odooApiUrl]);

    // webview 내부에서 직접 JSON-RPC 호출 (Odoo 세션 쿠키 사용)
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview || !isElectron) return;

        const handleDomReady = async () => {
            // 로그인 페이지인 경우 자동 로그인 시도
            try {
                const currentPath = await webview.executeJavaScript(`window.location.pathname + window.location.search`);
                if (currentPath && (currentPath.includes('/web/login') || currentPath.includes('action=login'))) {
                    const creds = window._odooPendingCreds;
                    if (creds) {
                        console.log('[OdooWebView] 로그인 페이지 감지 → 웹뷰 내부 자동 인증 시작');
                        const uid = await webview.executeJavaScript(`
                            (async () => {
                                try {
                                    const r = await fetch('/web/session/authenticate', {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ jsonrpc: '2.0', id: 1, params: { db: '${creds.db}', login: '${creds.login.replace(/'/g, "\\'")}', password: '${creds.password.replace(/'/g, "\\'")}' } })
                                    });
                                    const d = await r.json();
                                    return d.result?.uid || null;
                                } catch(e) { return null; }
                            })()
                        `);
                        if (uid) {
                            console.log('[OdooWebView] 자동 로그인 성공! 근태/휴가 대시보드로 이동');
                            webview.loadURL(`${creds.url}/web#action=hr_holidays.hr_leave_action_my`).catch(() => {});
                            return; // CSS 주입 등 나머지는 다음 dom-ready에서 처리
                        }
                    }
                }
            } catch(e) {
                // 로그인 페이지 체크 실패 무시
            }
            // Odoo 상단 메뉴바의 홈 버튼(앱 선택기)만 숨기고, 하위 메뉴(품목, 작업 등)는 보이도록 유지
            // 추가로 Odoo 기본 보라색 테마를 mightyONE 색상(Slate-800)으로 덮어씌우고 좌측 마진을 줍니다.
            webview.insertCSS(`
                .o_navbar_apps_menu { display: none !important; }
                .o_menu_toggle { display: none !important; }
                .o_menu_apps { display: none !important; }
                
                /* Odoo 우측 상단 사용자 프로필 메뉴 숨기기 */
                .o_user_menu, .o_user_menu_wrapper, .o_menu_systray .o_user_menu, [data-menu-xmlid="base.menu_user"] {
                    display: none !important;
                }

                /* 링크 추적기(Link Tracker) 메뉴 강제 숨김 */
                a[data-menu-xmlid="utm.menu_link_tracker_root"],
                a[data-menu-xmlid="link_tracker.link_tracker_menu_main"],
                a.o_nav_entry:has(:contains("링크 추적기")),
                a.o_nav_entry:has(:contains("Link Tracker")) {
                    display: none !important;
                }

                /* 좌측 마진 추가 */
                .o_menu_brand { margin-left: 24px !important; }
                
                /* Odoo 기본 보라색 로더 및 프로그레스바 강제 제거 */
                .o_loading, .bg-primary, .progress-bar {
                    background-color: #2563eb !important;
                }
                
                /* 서브메뉴(버튼) 영역 강제 투명화 및 배경 초기화 (보라색 제거) - 글로벌 적용 */
                .o_menu_sections, .o_menu_sections > *, .o_menu_sections .o_nav_entry, .o_navbar_apps_menu {
                    background-color: transparent !important;
                    background-image: none !important;
                }
                
                /* 글로벌 폰트 및 상단바 높이 개편 */
                .o_main_navbar, .o_navbar, .o_menu_brand, .o_menu_sections, .o_menu_sections a, .o_menu_sections button, .o_menu_sections .o_nav_entry {
                    font-family: 'Outfit', 'Inter', -apple-system, sans-serif !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    letter-spacing: -0.01em !important;
                }
                
                .o_navbar, .o_main_navbar {
                    height: 48px !important;
                    padding: 0 16px !important;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03) !important;
                }
                
                /* 상단 앱 대메뉴 브랜드 타이틀 스타일 다듬기 */
                .o_menu_brand {
                    font-size: 14px !important;
                    font-weight: 800 !important;
                    text-transform: uppercase !important;
                    letter-spacing: -0.02em !important;
                    margin-left: 20px !important;
                    padding-right: 15px !important;
                    border-right: 1px solid #cbd5e1 !important;
                    height: 24px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    align-self: center !important; /* 수직 중앙 정렬 */
                }
                
                /* 서브메뉴 컨테이너 자체 수직 정렬 */
                .o_menu_sections {
                    display: inline-flex !important;
                    align-items: center !important;
                    align-self: center !important; /* 수직 중앙 정렬 */
                }
                
                /* 서브메뉴 아이템들을 이쁜 라운드 필(Pill) 형태로 렌더링 */
                .o_menu_sections a, .o_menu_sections button, .o_menu_sections .o_nav_entry {
                    padding: 6px 12px !important;
                    margin: 0 4px !important;
                    border-radius: 8px !important;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    height: auto !important;
                    line-height: normal !important;
                    display: inline-flex !important;
                    align-items: center !important;
                }
                
                /* ===== 인사 직원 칸반 카드 프리미엄 스타일링 (글로벌) ===== */
                
                /* 카드 기본 형태 - 둥근 모서리, 심플한 아웃라인, 배경 없음, 그림자 제거 */
                .o_kanban_record {
                    border-radius: 12px !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    border: 1px solid #e2e8f0 !important;
                    box-shadow: none !important;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    overflow: hidden !important;
                }
                
                .o_kanban_record:hover {
                    transform: translateY(-1.5px) !important;
                }
                
                /* 카드 왼쪽의 단색 영역 (컬러 바, 왼쪽 테두리 색상, 이미지 채우기 배경색) 제거 */
                .o_kanban_color_bar, .o_color_bar {
                    display: none !important;
                }
                
                .o_kanban_record[class*="oe_kanban_color_"], 
                .o_kanban_record[class*="o_kanban_color_"] {
                    border-left-width: 1px !important;
                }
                
                /* 이미지 영역 전체 (모든 Odoo 칸반 사진 영역 클래스 포함) */
                .o_kanban_view .o_kanban_image_fill_left,
                .o_kanban_view .o_kanban_image,
                .o_kanban_view .o_kanban_image_placeholder,
                .o_kanban_view .o_avatar_year,
                .o_kanban_view .o_image_holder,
                .o_kanban_view .oe_kanban_avatar {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E");
                    background-size: 28px 28px;
                    background-repeat: no-repeat;
                    background-position: center;
                    border-radius: 50% !important;
                    background-color: transparent !important;
                    border: 1px solid #e2e8f0 !important;
                    color: transparent !important;
                    font-size: 0 !important;
                    position: absolute !important;
                    top: 50% !important;
                    left: 16px !important;
                    transform: translateY(-50%) !important;
                    width: 60px !important;
                    height: 60px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-shadow: none !important;
                    overflow: hidden !important;
                }
                
                /* 만약 텍스트 노드가 바로 안에 있는 경우 숨기기 */
                .o_kanban_view .o_kanban_image_fill_left span,
                .o_kanban_view .o_kanban_image span,
                .o_kanban_view .o_kanban_image_placeholder span,
                .o_kanban_view .o_image_holder span,
                .o_kanban_view .o_kanban_image_fill_left div,
                .o_kanban_view .o_kanban_image div,
                .o_kanban_view .o_kanban_image_placeholder div,
                .o_kanban_view .o_image_holder div {
                    display: none !important;
                    opacity: 0 !important;
                    color: transparent !important;
                }

                .o_kanban_view .o_kanban_image_fill_left img, 
                .o_kanban_view .o_kanban_image img,
                .o_kanban_view .o_kanban_image_placeholder img {
                    width: 100% !important;
                    height: 100% !important;
                    border-radius: 50% !important;
                    object-fit: cover !important;
                }
                
                /* HR 직원 카드 (o_kanban_view 안 카드) 내부 레이아웃 */
                .o_hr_employee_kanban .o_kanban_record .o_card_info,
                .o_employee_kanban .o_kanban_record .o_card_info,
                .o_kanban_view .o_kanban_record .oe_kanban_card {
                    padding: 16px !important;
                }
                
                /* 직원 이름 폰트 크기 및 두께 */
                .o_kanban_record .o_card_name,
                .o_kanban_record .o_primary,
                .o_kanban_record strong.d-block,
                .o_kanban_record .o_field_char.o_bold,
                .o_employee_kanban .o_kanban_record h3,
                .o_employee_kanban .o_kanban_record .o_kanban_record_title {
                    font-size: 14px !important;
                    font-weight: 700 !important;
                    letter-spacing: -0.01em !important;
                }
                
                /* 직책/부서 서브텍스트 */
                .o_kanban_record .o_secondary,
                .o_kanban_record .o_subtitle,
                .o_kanban_record small,
                .o_employee_kanban .o_kanban_record .o_field_widget:not(.o_field_many2one):not(.o_field_char) {
                    font-size: 11.5px !important;
                    font-weight: 500 !important;
                    opacity: 0.75 !important;
                }
                
                /* 직원 사진(아바타) - 크고 둥글게 */
                .o_kanban_record .o_avatar,
                .o_kanban_record img.o_avatar,
                .o_employee_kanban .o_kanban_image img {
                    width: 60px !important;
                    height: 60px !important;
                    border-radius: 50% !important;
                    object-fit: cover !important;
                    border: 2px solid rgba(37, 99, 235, 0.12) !important;
                }
                
                /* 칸반 헤더(상태) 바 */
                .o_kanban_grouped .o_column_title {
                    font-family: 'Outfit', 'Inter', -apple-system, sans-serif !important;
                    font-weight: 700 !important;
                    font-size: 12px !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.04em !important;
                }
                
                /* 상태 dot(채용 단계) 색상 뱃지 */
                .o_kanban_record .o_status {
                    border-radius: 50% !important;
                    width: 10px !important;
                    height: 10px !important;
                }
                
                /* 카드 하단 푸터 버튼들 (메시지, 활동 등) */
                .o_kanban_record .oe_kanban_action_button,
                .o_kanban_record .o_kanban_manage_button_area .btn {
                    border-radius: 8px !important;
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    padding: 4px 10px !important;
                }
                
                @media (prefers-color-scheme: light) {
                    /* Odoo 전체 기본 테마(보라색)를 세련된 파란색(Blue 600)으로 강제 덮어쓰기 */
                    :root {
                        --o-brand-odoo: #2563eb !important;
                        --o-brand-primary: #2563eb !important;
                        --primary: #2563eb !important;
                        --bs-primary: #2563eb !important;
                        --bs-primary-rgb: 37, 99, 235 !important;
                        
                        /* Light mode subtle primary overrides (replace light purple with light blue) */
                        --o-brand-light: #eff6ff !important;
                        --bs-primary-bg-subtle: #dbeafe !important;
                        --bs-primary-border-subtle: #bfdbfe !important;
                        --bs-primary-text-emphasis: #1e40af !important;
                    }
                    
                    /* 버튼 및 포인트 컬러 강제 오버라이드 (상단 버튼 및 스테이지 셰브론 포함) */
                    .btn-primary,
                    .o_control_panel .btn-primary,
                    .o_statusbar_buttons .btn-primary,
                    .o_statusbar_status .btn-primary,
                    .o_statusbar_status .btn-primary:disabled,
                    .o_statusbar_status .btn-primary.disabled,
                    .o_statusbar_status .o_arrow_button_active,
                    .o_arrow_button.btn-primary,
                    .o_arrow_button.active,
                    .o_form_buttons_edit .btn-primary {
                        background-color: #2563eb !important;
                        border-color: #2563eb !important;
                        color: white !important;
                    }
                    .btn-primary:hover,
                    .o_control_panel .btn-primary:hover,
                    .o_statusbar_buttons .btn-primary:hover,
                    .o_form_buttons_edit .btn-primary:hover {
                        background-color: #1d4ed8 !important;
                        border-color: #1d4ed8 !important;
                    }
                    .text-primary {
                        color: #2563eb !important;
                    }
                    .bg-primary {
                        background-color: #2563eb !important;
                    }
                    
                    /* 기본 아바타 백그라운드 보라색/랜덤색을 깔끔한 블루-슬레이트로 변경 */
                    .o_avatar, .o_user_avatar, .o_image, .o_mimetype_icon {
                        background-color: #3b82f6 !important;
                        color: #ffffff !important;
                    }
                    
                    /* 상단바 색상 변경 (연한 회색 배경 + 어두운 글씨) */
                    .o_navbar, .o_main_navbar { 
                        background-color: #f8fafc !important; 
                        background-image: none !important;
                        border-bottom: 1px solid #e2e8f0 !important; 
                    }
                    
                    .o_navbar .o_nav_entry, 
                    .o_navbar .dropdown-toggle,
                    .o_main_navbar > a,
                    .o_main_navbar > button,
                    .o_menu_brand {
                        color: #475569 !important; /* Slate-600 */
                    }
                    
                    /* Hide HR Sidebar */
                    .hr_nav_sidebar {
                        display: none !important;
                    }

                    /* ==================================================== */
                    /* 5. Print Mode (인쇄 최적화 - A4 세로, 깔끔한 디자인) */
                    /* ==================================================== */
                    
                    /* 화면(웹)에서는 숨겨두고 인쇄할 때만 보여줄 커스텀 헤더 */
                    #custom-print-header { display: none; }
                    
                    @media print {
                        /* 불필요한 UI(메뉴, 상단바, 패널 등) 모두 숨김 */
                        .o_main_navbar, 
                        header, 
                        .o_control_panel,
                        .o_content > .o_mrp_bom_report_buttons,
                        button.o_mrp_bom_print,
                        .o_action_manager .o_cp_top,
                        .o_action_manager .o_cp_bottom {
                            display: none !important;
                        }
                        
                        /* 사용자가 인쇄물에서 숨기길 원하는 배지(M, P 등) 숨김 */
                        .ir-badge {
                            display: none !important;
                        }

                        /* 옵션 다이얼로그에서 선택된 필터링 행(어셈블리/악세사리) 숨김 */
                        .ir-hide-in-print {
                            display: none !important;
                        }

                        /* 기존 Odoo의 못생긴 H1 타이틀 숨김 */
                        h1:not(#custom-print-header h1) {
                            display: none !important;
                        }
                        
                        /* 커스텀 헤더 표시 */
                        #custom-print-header {
                            display: block !important;
                            border-bottom: 3px solid #0f172a !important;
                            padding-bottom: 16px !important;
                            margin-bottom: 24px !important;
                        }
                        
                        /* 컨텐츠 영역을 A4 용지에 꽉 차게 재설정 */
                        body, html, .o_web_client, .o_action_manager, .o_content {
                            height: auto !important;
                            overflow: visible !important;
                            background-color: white !important;
                        }
                        .o_content {
                            position: static !important;
                        }

                        /* A4 세로 규격 설정 */
                        @page {
                            size: A4 portrait !important;
                            margin: 15mm !important;
                        }

                        /* 폰트 및 배경, 선 정리 */
                        body {
                            font-family: 'Inter', 'Noto Sans KR', sans-serif !important;
                            color: #0f172a !important;
                        }
                        
                        table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                        }
                        
                        th, td {
                            padding: 8px 12px !important;
                            border-bottom: 1px solid #e2e8f0 !important;
                            font-size: 10pt !important;
                        }
                        
                        th {
                            background-color: #f8fafc !important;
                            font-weight: 700 !important;
                            border-top: 2px solid #475569 !important;
                            border-bottom: 2px solid #94a3b8 !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                    }

                    /* ==================================================== */
                    /* Modernize Odoo Native Modals (팝업창 디자인 살짝 변경) */
                    /* ==================================================== */
                    .modal-content {
                        border-radius: 16px !important;
                        border: none !important;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.12) !important;
                        overflow: hidden !important;
                    }
                    .modal-header {
                        background-color: #f8fafc !important;
                        border-bottom: 1px solid #e2e8f0 !important;
                        padding: 16px 24px !important;
                    }
                    .modal-title {
                        font-weight: 700 !important;
                        color: #1e293b !important;
                    }
                    .modal-footer {
                        border-top: 1px solid #e2e8f0 !important;
                        background-color: #f8fafc !important;
                        padding: 16px 24px !important;
                    }

                    /* ==================================================== */
                    /* mightyONE Custom Badges (품목 분류/클래스 하이라이트) */
                    /* ==================================================== */
                    .ir-badge {
                        font-weight: 800 !important;
                        padding: 1px 5px !important;
                        border-radius: 6px !important;
                        display: inline-block !important;
                        font-size: 0.85em !important;
                        line-height: 1.3 !important;
                        margin-right: 3px !important;
                        min-width: 20px !important;
                        text-align: center !important;
                    }
                    .ir-badge-mech { background-color: #fdf4ff !important; color: #c026d3 !important; border: 1px solid rgba(192, 38, 211, 0.3) !important; }
                    .ir-badge-elec { background-color: #eff6ff !important; color: #2563eb !important; border: 1px solid rgba(37, 99, 235, 0.3) !important; }
                    .ir-badge-out { background-color: #fefce8 !important; color: #ca8a04 !important; border: 1px solid rgba(202, 138, 4, 0.3) !important; }
                    .ir-badge-assy { background-color: #ecfdf5 !important; color: #059669 !important; border: 1px solid rgba(5, 150, 105, 0.3) !important; }
                    .ir-badge-prod { background-color: #f8fafc !important; color: #475569 !important; border: 1px solid rgba(71, 85, 105, 0.3) !important; }
                    .ir-badge-part { background-color: #fff1f2 !important; color: #e11d48 !important; border: 1px solid rgba(225, 29, 72, 0.3) !important; }

                    /* ==================================================== */
                    /* 4. Kanban / List Views Tweaks                        */
                    /* ==================================================== */
                    .o_menu_sections a:hover, 
                    .o_menu_sections button:hover, 
                    .o_menu_sections .o_nav_entry:hover,
                    .o_navbar .dropdown-toggle:hover {
                        background-color: #f1f5f9 !important; /* Slate-100 */
                        color: #0f172a !important; /* Slate-900 */
                    }
                    
                    /* 상단바 액티브(Selected) 활성화 효과 - 소프트 블루 라운드 필(Pill) */
                    .o_menu_sections a.active, 
                    .o_menu_sections button.active,
                    .o_menu_sections .o_nav_entry.active,
                    .o_menu_sections .show > .dropdown-toggle {
                        background-color: #eff6ff !important; /* Blue-50 */
                        color: #2563eb !important; /* Blue-600 */
                        font-weight: 750 !important;
                    }
                    
                    /* 칸반 카드 라이트모드 아웃라인 & 호버 효과 */
                    .o_kanban_record,
                    .o_kanban_record[class*="oe_kanban_color_"], 
                    .o_kanban_record[class*="o_kanban_color_"] {
                        border-color: #e2e8f0 !important;
                        background-color: #ffffff !important; /* 라이트모드에서는 깔끔한 백그라운드 */
                    }
                    .o_kanban_record:hover {
                        border-color: #3b82f6 !important; /* 호버 시 파란 아웃라인 */
                        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.04) !important;
                    }
                }

                @media (prefers-color-scheme: dark) {
                    /* Odoo Smart Dark Mode Inversion filter */
                    html {
                        filter: invert(0.9) hue-rotate(180deg) !important;
                        background-color: #defaff !important; /* Inverts to slate-900 */
                    }
                    
                    /* Override dark mode variables under the filter */
                    :root {
                        --o-brand-light: #cbd5e1 !important; /* Inverts to dark slate hover */
                        --bs-primary-bg-subtle: #dbedff !important; /* Inverts to slate-800 */
                        --bs-primary-border-subtle: #c8dcf0 !important; /* Inverts to slate-700 border */
                        --bs-primary-text-emphasis: #111111 !important; /* Inverts to white */
                    }
                    
                    /* Page backgrounds -> invert to #0f172a (slate-900) */
                    body, .o_web_client, .o_action_manager, .o_content, .o_form_sheet_bg, .o_view_controller, .o_settings_container {
                        background-color: #defaff !important;
                    }
                    
                    /* Card, sheet, row, and list backgrounds -> invert to #1e293b (slate-800) */
                    .o_form_sheet, .o_list_view, .table, .table td, .table th, tr, td, th, .dropdown-menu, .modal-content, .o_searchview {
                        background-color: #dbedff !important;
                        border-color: #c8dcf0 !important; /* Inverts to border slate-700 */
                        color: #111111 !important; /* Inverts to white text */
                    }
                    
                    /* Secondary elements (headers, panel headers) -> invert to slate-950/900 */
                    .o_control_panel, .o_navbar, .o_main_navbar, .modal-header, .modal-footer {
                        background-color: #e2e8f0 !important;
                        border-bottom: 1px solid #cbd5e1 !important;
                    }
                    
                    /* Inputs and search -> invert to slate-800 background, white text */
                    input, select, textarea, .o_input, .o_searchview_input {
                        background-color: #dbedff !important;
                        color: #111111 !important;
                        border-color: #c8dcf0 !important;
                    }
                    
                    /* Active/selected tabs and badges -> blue accent */
                    .nav-tabs .nav-link.active, .o_searchview_facet, .badge-primary, .badge-info {
                        background-color: #c4d6f9 !important; /* Inverts to blue-500 */
                        color: #111111 !important;
                    }
                    
                    /* Primary active/action buttons in dark mode -> invert to blue-500 */
                    .o_control_panel .btn-primary,
                    .o_statusbar_buttons .btn-primary,
                    .o_statusbar_status .btn-primary,
                    .o_statusbar_status .btn-primary:disabled,
                    .o_statusbar_status .btn-primary.disabled,
                    .o_statusbar_status .o_arrow_button_active,
                    .o_arrow_button.btn-primary,
                    .o_arrow_button.active,
                    .o_form_buttons_edit .btn-primary {
                        background-color: #c4d6f9 !important;
                        border-color: #c4d6f9 !important;
                        color: #111111 !important;
                    }
                    
                    /* Hover styles -> invert to slate-700 (#334155) background */
                    .o_kanban_record:hover, tr:hover, td:hover, .dropdown-item:hover, .btn-secondary:hover {
                        background-color: #cbd5e1 !important;
                    }
                    
                    /* Muted texts -> invert to slate-400 (#94a3b8) */
                    .text-muted, .o_field_translate, .o_form_label_empty, .o_input_placeholder {
                        color: #555555 !important;
                    }
                    
                    /* Odoo Submenu and brand title text colors in dark mode -> invert to light blue (#93c5fd / #bfdbfe) */
                    .o_menu_brand,
                    .o_menu_sections, 
                    .o_menu_sections a, 
                    .o_menu_sections button, 
                    .o_menu_sections .o_nav_entry,
                    .o_menu_sections .dropdown-toggle {
                        color: #003a83 !important; /* Inverts to light blue #93c5fd */
                    }
                    .o_menu_sections a:hover, 
                    .o_menu_sections button:hover, 
                    .o_menu_sections .o_nav_entry:hover,
                    .o_menu_sections .dropdown-toggle:hover {
                        background-color: #cbd5e1 !important; /* Inverts to slate-700 background */
                        color: #001a4e !important; /* Inverts to bright hover blue #bfdbfe */
                    }
                    .o_menu_sections a.active, 
                    .o_menu_sections button.active,
                    .o_menu_sections .o_nav_entry.active,
                    .o_menu_sections .show > .dropdown-toggle {
                        background-color: #dbedff !important; /* Inverts to slate-800 active background */
                        color: #000000 !important; /* Inverts to clean white #ffffff */
                        font-weight: 750 !important;
                    }
                    
                    /* 다크모드 아바타 백그라운드 보라색/랜덤색을 정갈한 슬레이트로 변경 */
                    .o_avatar, .o_user_avatar, .o_image, .o_mimetype_icon {
                        background-color: #334155 !important;
                        color: #ffffff !important;
                    }
                    
                    /* Re-invert normal images, avatars, icons and background images */
                    img, video, .o_avatar, .o_user_avatar, .o_image, .o_mimetype_icon, [style*="background-image"] {
                        filter: invert(1) hue-rotate(180deg) !important;
                    }
                    
                    /* 칸반 카드 다크모드 아웃라인 & 호버 효과 */
                    .o_kanban_record,
                    .o_kanban_record[class*="oe_kanban_color_"], 
                    .o_kanban_record[class*="o_kanban_color_"] {
                        border-color: #cbd5e1 !important; /* Inverts to slate-700 border */
                        background-color: transparent !important; /* 내부 배경색 제거 */
                        color: #111111 !important;
                    }
                    .o_kanban_record:hover {
                        border-color: #c4d6f9 !important; /* Inverts to blue border */
                        background-color: transparent !important;
                    }
                }
            `).catch(() => {});
            
            // --- Detect session expiration and auto-relogin ---
            (async () => {
                try {
                    const bodyText = await webview.executeJavaScript('document.body.innerText || ""');
                    if (bodyText.includes('세션이 만료되었습니다') || bodyText.includes('Session Expired')) {
                        console.warn('[OdooWebView] 세션 만료 감지, 자동 재로그인 시도');
                        const creds = window._odooPendingCreds;
                        if (creds) {
                            const uid = await webview.executeJavaScript(`
                                (async () => {
                                    try {
                                        const r = await fetch('/web/session/authenticate', {
                                            method: 'POST',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ jsonrpc: '2.0', id: 1, params: { db: '${creds.db}', login: '${creds.login}', password: '${creds.password}' } })
                                        });
                                        const d = await r.json();
                                        return d.result?.uid || null;
                                    } catch (e) { return null; }
                                })()
                            `);
                            if (uid) {
                                console.log('[OdooWebView] 자동 재로그인 성공, 현재 페이지 유지');
                                // Optionally update stored uid
                                window._odooPendingCreds.uid = uid;
                            } else {
                                console.warn('[OdooWebView] 자동 재로그인 실패, 알림 팝업 표시');
                                webview.executeJavaScript('alert("자동 재로그인 실패. 로그인 페이지를 확인하세요.")');
                            }
                        }
                    }
                } catch (e) {
                    console.error('[OdooWebView] 세션 체크 오류:', e);
                }
            })();

            // webview 내부(= Odoo 서버와 같은 origin)에서 JSON-RPC 호출
            // → CORS 없음, Odoo 세션 쿠키 자동 포함
            try {
                const menusData = await webview.executeJavaScript(`
                    fetch('/web/dataset/call_kw', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'call',
                            id: 1,
                            params: {
                                model: 'ir.ui.menu',
                                method: 'load_menus',
                                args: [false],
                                kwargs: {}
                            }
                        })
                    })
                    .then(r => r.json())
                    .then(d => (d && d.result) ? d.result : null)
                    .catch(() => null);
                `);

                if (menusData && menusData.root && menusData.root.children) {
                    const childrenIds = menusData.root.children;
                    const apps = childrenIds.map(id => {
                        const m = menusData[id];
                        return {
                            name: m.name,
                            menu_id: String(m.id),
                        };
                    });
                    globalOdooMenus = apps;
                    try {
                        localStorage.setItem('odoo_cached_menus', JSON.stringify(apps));
                    } catch (e) {}
                    setMenusLoaded(true);
                    window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: apps }));
                } else {
                    throw new Error('Invalid load_menus response');
                }
            } catch (e) {
                console.warn('[OdooWebView] executeJavaScript menu fetch failed:', e.message);
                globalOdooMenus = [];
                window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: [] }));
            }
            

            // Webview 내부에 Ctrl + 마우스 휠 줌(Zoom) 기능 주입
            try {
                await webview.executeJavaScript(`
                    window.addEventListener('wheel', (e) => {
                        if (e.ctrlKey) {
                            e.preventDefault();
                            const currentZoom = parseFloat(document.body.style.zoom || '1');
                            let newZoom = currentZoom;
                            if (e.deltaY > 0) newZoom -= 0.1;
                            else newZoom += 0.1;
                            
                            if (newZoom < 0.5) newZoom = 0.5;
                            if (newZoom > 3.0) newZoom = 3.0;
                            
                            document.body.style.zoom = newZoom;
                        }
                    }, { passive: false });
                `);
            } catch(e) {
                console.warn('[OdooWebView] Failed to inject zoom script:', e);
            }

            // Webview 내부에 Clipboard API 폴리필 주입 (HTTP 환경에서 navigator.clipboard.writeText 오류 방지)
            try {
                await webview.executeJavaScript(`
                    if (!navigator.clipboard) {
                        navigator.clipboard = {};
                    }
                    if (!navigator.clipboard.writeText) {
                        navigator.clipboard.writeText = function(text) {
                            return new Promise((resolve, reject) => {
                                try {
                                    const textArea = document.createElement('textarea');
                                    textArea.value = text;
                                    textArea.style.position = 'fixed';
                                    textArea.style.left = '-999999px';
                                    textArea.style.top = '-999999px';
                                    document.body.appendChild(textArea);
                                    textArea.focus();
                                    textArea.select();
                                    const successful = document.execCommand('copy');
                                    textArea.remove();
                                    if (successful) resolve();
                                    else reject(new Error('copy command failed'));
                                } catch (err) {
                                    reject(err);
                                }
                            });
                        };
                    }
                    true;
                `);
            } catch(e) {
                console.warn('[OdooWebView] Failed to inject clipboard polyfill:', e);
            }


            
            // --- INJECTED: Odoo UI Highlight Logic (품목 분류/클래스 색상 하이라이트) ---
            try {
                await webview.executeJavaScript(`
                    if (!window.__ir_highlight_injected_v7) {
                        window.__ir_highlight_injected_v7 = true;
                        
                        const highlightCells = () => {
                            // 리스트 뷰, 폼 뷰, BOM 현황(report)의 a 태그, button 등 텍스트를 포함할 만한 모든 컨테이너 검색
                            const elements = document.querySelectorAll('td, span, a, div, h1, button');
                            
                            elements.forEach(el => {
                                // 이미 파싱된 컨테이너이거나, 우리가 방금 생성한 요소 자체인 경우 무한 루프 방지
                                if (el.dataset.irParsed === 'true') return;
                                if (el.classList.contains('ir-parsed-wrapper') || el.classList.contains('ir-badge') || el.classList.contains('ir-parsed-code')) return;
                                
                                let modified = false;
                                
                                // 구글 시트 저장 버튼 주입 기능 제거됨 (자동 동기화로 대체)
                                
                                if (modified) {
                                    el.dataset.irParsed = 'true';
                                }
                            });

                            // 4. 앱 별 매뉴얼 버튼 주입 기능 제거됨 (Sidebar 메뉴로 이동)
                        };

                        setInterval(highlightCells, 600); // 부하를 줄이기 위해 0.6초로 조정
                    }
                `);
            } catch(e) {
                console.warn('Highlight injection failed:', e);
            }
            // ----------------------------------------------------------------------
        };
            
        const handleConsoleMessage = async (e) => {
            if (typeof e.message === 'string' && e.message.startsWith('__IR_NAVIGATE__:')) {
                const targetPath = e.message.split('__IR_NAVIGATE__:')[1];
                console.log('[OdooWebView] Navigation requested from Odoo:', targetPath);
                window.location.hash = '#' + targetPath;
                return;
            }

            if (e.message === '__IR_SAVE_SHEET__') {
                try {
                    const data = await webviewRef.current.executeJavaScript(`
                        (() => {
                            let rawTitle = '';
                            const potentialTitles = document.querySelectorAll('.o_mrp_bom_report_page h1, .o_content h1, h1, h2, h3, table tbody tr:first-child td span');
                            for (let t of potentialTitles) {
                                const txt = t.textContent || '';
                                if (txt.includes('[IR')) {
                                    const cloneT = t.cloneNode(true);
                                    cloneT.querySelectorAll('.ir-badge').forEach(b => b.remove());
                                    rawTitle = cloneT.textContent.trim();
                                    break; 
                                }
                            }
                            
                            const rows = [];
                            const ths = document.querySelectorAll('table thead th');
                            if (ths.length > 0) {
                                const headerRow = [];
                                ths.forEach(th => headerRow.push(th.textContent.trim().replace(/\\s+/g, ' ')));
                                rows.push(headerRow);
                            }
                            
                            const trs = document.querySelectorAll('table tbody tr');
                            trs.forEach(tr => {
                                const row = [];
                                tr.querySelectorAll('th, td').forEach(td => {
                                    row.push(td.textContent.trim().replace(/\\s+/g, ' '));
                                });
                                if (row.length > 0) rows.push(row);
                            });
                            
                            return { title: rawTitle || 'BOM Export', rows };
                        })();
                    `);
                    
                    if (!data.rows || data.rows.length === 0) {
                        throw new Error("테이블 데이터를 찾을 수 없습니다.");
                    }
                    
                    const safeTitle = data.title.replace(/[\\\\/:*?"<>|]/g, "_");
                    const sheet = await createSpreadsheet(safeTitle);
                    const sheetId = sheet.spreadsheetId;
                    const sheetUrl = sheet.spreadsheetUrl;
                    
                    // 최대 컬럼 수 계산해서 Range 동적 생성
                    const numCols = data.rows.reduce((max, row) => Math.max(max, row.length), 0);
                    // 간략히 A~Z 까지만 대응 (보통 BOM 열이 26개를 넘지 않으므로)
                    const endCol = String.fromCharCode(64 + Math.min(numCols, 26)); 
                    const range = `A1:${endCol}${data.rows.length}`;
                    
                    await updateSpreadsheetValues(sheetId, range, data.rows);
                    
                    webviewRef.current.executeJavaScript(`
                        const loader = document.getElementById('ir-sheet-loader');
                        if (loader) {
                            loader.innerHTML = '<div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;"><h2 style="color:#10b981; font-size:26px; font-weight:900; margin-bottom:12px;">✅ 저장 완료!</h2><p style="color:#64748b; font-size:16px; margin-bottom:20px;">구글 시트에 성공적으로 저장되었습니다.</p><button onclick="this.parentElement.parentElement.remove(); window.open(\\'${sheetUrl}\\', \\'_blank\\');" style="padding:10px 24px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-size:15px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">시트 열기</button></div>';
                        }
                    `);
                } catch (err) {
                    console.error(err);
                    webviewRef.current.executeJavaScript(`
                        const loader = document.getElementById('ir-sheet-loader');
                        if (loader) {
                            loader.innerHTML = '<div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;"><h2 style="color:#ef4444; font-size:26px; font-weight:900; margin-bottom:12px;">❌ 오류 발생</h2><p style="color:#64748b; font-size:16px; max-width:80%; text-align:center;">' + \\\`${err.message}\\\` + '</p><button onclick="this.parentElement.parentElement.remove();" style="margin-top:20px; padding:8px 16px; background:#ef4444; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;">닫기</button></div>';
                        }
                    `);
                }
            }
        };
        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('console-message', handleConsoleMessage);
        
        return () => {
            webview.removeEventListener('dom-ready', handleDomReady);
            webview.removeEventListener('console-message', handleConsoleMessage);
        };
    }, [isElectron]);

    if (!isElectron) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-white rounded-2xl border border-slate-200 p-10 shadow-sm">
                <div className="text-rose-500 font-bold text-xl mb-4">웹 환경에서는 지원되지 않습니다.</div>
                <p className="text-slate-600">Odoo 연동은 데스크톱 앱(Electron) 환경에서만 작동합니다.</p>
            </div>
        );
    }

    return (
        <div 
            className="w-full h-full bg-white flex flex-col relative"
            onMouseEnter={() => webviewRef.current?.focus()}
        >
            {isWebViewLoading && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-5 shadow-sm"></div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">환영합니다!</h2>
                    <p className="text-slate-500 font-medium">Odoo 스마트 업무 환경을 준비하고 있습니다...</p>
                </div>
            )}
            
            <webview
                ref={webviewRef}
                src={`${odooApiUrl}/web?db=odoo-db`}
                style={{ width: '100%', height: '100%', border: 'none', opacity: isWebViewLoading ? 0 : 1, transition: 'opacity 0.3s ease-in-out' }}
                allowpopups="true"
                partition="persist:odoo"
                webpreferences="contextIsolation=no"
            />
        </div>
    );
}
