import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '../contexts/AuthContext';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import UpdateNotificationModal from './common/UpdateNotificationModal';
import FloatingNotepad from './common/FloatingNotepad';
import GeminiWebviewPanel from './common/GeminiWebviewPanel';
import OdooWebView from './OdooWebView';
import { BotMessageSquare, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';

export default function Layout({ children }) {
    const { currentUser, isOdooOnlyAuth, odooApiUrl } = useAuth();
    useTaskAlarm(currentUser);

    const [appVersion, setAppVersion] = React.useState('0.9.4');
    const [isGeminiPanelOpen, setIsGeminiPanelOpen] = React.useState(false);
    const navigate = useNavigate();

    React.useEffect(() => {
        if (window.electronAPI?.getAppVersion) {
            window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});
        }

        const handleToggleGemini = () => setIsGeminiPanelOpen(v => !v);
        window.addEventListener('toggle-gemini-panel', handleToggleGemini);
        return () => window.removeEventListener('toggle-gemini-panel', handleToggleGemini);
    }, []);

    React.useEffect(() => {
        const handleSessionReady = () => {
            const bgWebview = document.getElementById('odoo-bg-webview');
            if (bgWebview && bgWebview.loadURL) {
                console.log('[Layout] odoo-session-ready 수신, 백그라운드 웹뷰 새로고침 시도');
                bgWebview.loadURL(`${odooApiUrl}/web#action=hr_holidays.hr_leave_action_my`).catch(() => {});
            }
        };
        window.addEventListener('odoo-session-ready', handleSessionReady);
        return () => window.removeEventListener('odoo-session-ready', handleSessionReady);
    }, [odooApiUrl]);

    React.useEffect(() => {
        if (!window.electronAPI) return;

        const handleAppGoBack = async () => {
            console.log('[Layout] app-go-back 이벤트 수신됨!');
            const webviews = document.querySelectorAll('webview');
            let handled = false;

            const activeWebviews = Array.from(webviews).filter(wv => {
                const rect = wv.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.left < window.innerWidth;
            });
            console.log('[Layout] 발견된 webview 총 갯수:', webviews.length, '활성화된 갯수:', activeWebviews.length);

            if (activeWebviews.length > 0) {
                const webview = activeWebviews[0];
                console.log('[Layout] 웹뷰 내부에 뒤로가기 스크립트 인젝션 시작...');
                try {
                    const scriptResult = await webview.executeJavaScript(`
                        (function() {
                            console.log('[mightyONE BackNav] 내부 뒤로가기 스크립트 실행됨');
                            
                            function triggerClick(el, label) {
                                if (!el) return false;
                                console.log('[mightyONE BackNav] 타겟 발견 및 클릭 시도:', label, el);
                                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                                    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                                });
                                console.log('[mightyONE BackNav] 마우스 이벤트 시뮬레이션 완료');
                                return true;
                            }

                            const closeBtn = document.querySelector('.modal-header .btn-close, .modal-header .close, .o_dialog .btn-close');
                            if (closeBtn && closeBtn.offsetParent !== null) { 
                                return triggerClick(closeBtn, '모달 닫기 버튼'); 
                            }

                            const backBtn = document.querySelector('.o_back_button, .o_form_button_cancel, [data-hotkey="b"]');
                            if (backBtn && backBtn.offsetParent !== null) { 
                                return triggerClick(backBtn, '명시적 뒤로가기/취소 버튼'); 
                            }
                            
                            const breadcrumbs = document.querySelectorAll('.breadcrumb-item, .o_breadcrumb_item, .o_breadcrumb .active');
                            const prevItems = Array.from(breadcrumbs).filter(el => {
                                return !el.classList.contains('active') && el.getAttribute('aria-current') !== 'page';
                            });
                            
                            if (prevItems.length > 0) {
                                const target = prevItems[prevItems.length - 1];
                                const link = target.querySelector('a');
                                return triggerClick(link || target, '빵부스러기 이전 단계');
                            }

                            const hash = window.location.hash || window.location.search;
                            
                            if (hash.includes('id=') || hash.includes('view_type=form')) {
                                window.history.back();
                                return true;
                            }

                            return false;
                        })()
                    `);
                    
                    console.log('[Layout] scriptResult:', scriptResult);
                    if (scriptResult === true) {
                        console.log('[Layout] script handled back navigation');
                        handled = true;
                    } else {
                        console.log('[Layout] script did not handle, checking webview.canGoBack()...');
                        if (typeof webview.canGoBack === 'function' && webview.canGoBack()) {
                            console.log('[Layout] webview CAN go back, calling goBack()');
                            webview.goBack();
                            handled = true;
                        } else {
                            console.log('[Layout] webview CANNOT go back');
                            handled = false;
                        }
                    }
                } catch (e) {
                    console.error('[Layout] Failed to call history back on webview:', e);
                    try {
                        if (typeof webview.canGoBack === 'function' && webview.canGoBack()) {
                            console.log('[Layout] catch block: webview CAN go back, calling goBack()');
                            webview.goBack();
                            handled = true;
                        } else {
                            console.log('[Layout] catch block: webview CANNOT go back');
                            handled = false;
                        }
                    } catch(err) {
                        console.error('[Layout] catch block inner error:', err);
                        handled = false;
                    }
                }
            }

            console.log('[Layout] final handled state:', handled);
            if (!handled) {
                console.log('[Layout] navigating react router -1');
                navigate(-1);
            }
        };

        const handleAppGoForward = async () => {
            const webviews = document.querySelectorAll('webview');
            const activeWebviews = Array.from(webviews).filter(wv => {
                const parentDiv = wv.parentElement;
                if (!parentDiv) return false;
                const style = window.getComputedStyle(parentDiv);
                return style.display !== 'none' && style.opacity !== '0' && parentDiv.style.left !== '-9999px';
            });
            let handled = false;
            for (const webview of activeWebviews) {
                try {
                    if (webview.canGoForward()) {
                        webview.goForward();
                        handled = true;
                        break;
                    }
                } catch (e) {
                    console.error('Failed to call goForward on webview:', e);
                }
            }
            if (!handled) {
                navigate(1);
            }
        };

        const handleResetWebview = (e) => {
            const path = e.detail;
            let wvId = null;
            if (path === '/workspace/chat') wvId = 'webview-google-chat';
            else if (path === '/workspace/mail') wvId = 'webview-google-mail';
            else if (path === '/workspace/calendar') wvId = 'webview-google-calendar';

            if (wvId) {
                const wv = document.getElementById(wvId);
                if (wv && wv.loadURL) {
                    const src = wv.getAttribute('src');
                    if (src) {
                        console.log(`[Layout] 리셋 이벤트 수신: ${path}. 초기 화면(${src})으로 되돌립니다.`);
                        wv.loadURL(src);
                    }
                }
            }
        };

        window.addEventListener('app-go-back', handleAppGoBack);
        window.addEventListener('app-go-forward', handleAppGoForward);
        window.addEventListener('reset-webview', handleResetWebview);

        return () => {
            window.removeEventListener('app-go-back', handleAppGoBack);
            window.removeEventListener('app-go-forward', handleAppGoForward);
            window.removeEventListener('reset-webview', handleResetWebview);
        };
    }, [navigate]);

    const location = useLocation();
    
    const isGoogleApp = location.pathname.startsWith('/workspace/chat') || 
                        location.pathname.startsWith('/workspace/calendar') || 
                        location.pathname.startsWith('/workspace/drive') || 
                        location.pathname.startsWith('/workspace/mail') || 
                        location.pathname.startsWith('/workspace/notebooklm') ||
                        location.pathname.startsWith('/workspace/gemini');

    const isFullPage = isGoogleApp || (!location.pathname.startsWith('/workspace/memo') && !location.pathname.startsWith('/settings') && !location.pathname.startsWith('/workspace/meetings'));
    const isGoogleChat = location.pathname.includes('/workspace/chat');
    const isGoogleMail = location.pathname.includes('/workspace/mail');
    const isGoogleCalendar = location.pathname.includes('/workspace/calendar');
    const isCustomReactRoute = location.pathname.startsWith('/workspace/') || 
                               location.pathname.startsWith('/company/') ||
                               location.pathname.startsWith('/settings') || 
                               location.pathname === '/approval';
    const isOdooView = !isCustomReactRoute;

    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
        return localStorage.getItem('sidebar_collapsed') === 'true';
    });

    const toggleSidebar = () => {
        setIsSidebarCollapsed(prev => {
            const newVal = !prev;
            localStorage.setItem('sidebar_collapsed', String(newVal));
            return newVal;
        });
    };



    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
            <Sidebar isCollapsed={isSidebarCollapsed} toggleSidebar={toggleSidebar} />
            <div 
                className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'} print:ml-0`}
                style={{ marginRight: isGeminiPanelOpen ? '450px' : '0' }}
            >
                
                {/* ─── Odoo 상단 네비게이션바 시계/알림 옆 절대위치(Fixed) AI 챗 버튼 ─── */}
                {isOdooView && (
                    <button
                        onClick={() => setIsGeminiPanelOpen(v => !v)}
                    className={`fixed top-2.5 z-[9999] flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm border ${
                        isGeminiPanelOpen
                            ? 'bg-slate-800 text-white border-slate-700 ring-2 ring-slate-400/50'
                            : 'bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border-slate-300/80 hover:border-slate-400 shadow-slate-200/50 hover:scale-105 active:scale-95'
                    }`}
                    style={{ right: isGeminiPanelOpen ? 'calc(450px + 15rem)' : '15rem', transition: 'right 0.3s' }}
                    title="AI 챗봇 헬프봇 열기"
                >
                    <BotMessageSquare size={14} className={isGeminiPanelOpen ? 'text-white' : 'text-slate-600'} />
                    <span className="tracking-tight text-[11px] font-bold">AI 챗</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                </button>
                )}

                <main className={`flex-1 overflow-x-hidden ${isFullPage ? 'p-0' : 'p-6'} ${isGoogleApp ? (isSidebarCollapsed ? 'pl-1 bg-slate-100' : 'pl-2.5 bg-slate-100') : ''} relative`}>
                    {/* ─── 웹뷰 네비게이션 툴바 (Google Apps 한정) ─── */}
                    {isGoogleApp && isElectron && (
                        <div className="fixed top-3 left-1/2 transform -translate-x-1/2 z-[9999] flex items-center gap-1 bg-white/40 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/50 dark:border-slate-700 shadow-sm hover:shadow-md rounded-full p-1 opacity-20 hover:opacity-100 hover:bg-white/95 dark:hover:bg-slate-800 transition-all duration-300">
                            <button onClick={() => window.dispatchEvent(new CustomEvent('app-go-back'))} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-300 transition-colors active:scale-90" title="뒤로 가기">
                                <ArrowLeft size={16} />
                            </button>
                            <button onClick={() => window.dispatchEvent(new CustomEvent('app-go-forward'))} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-300 transition-colors active:scale-90" title="앞으로 가기">
                                <ArrowRight size={16} />
                            </button>
                            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                            <button onClick={() => window.location.reload()} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 dark:text-slate-300 transition-colors active:scale-90" title="현재 앱 새로고침">
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    )}
                    {/* Persistent Google Chat Webview */}
                    {isElectron && !isOdooOnlyAuth && (
                        <div style={{ 
                            position: isGoogleChat ? 'relative' : 'absolute',
                            left: isGoogleChat ? 0 : '-9999px',
                            opacity: isGoogleChat ? 1 : 0,
                            pointerEvents: isGoogleChat ? 'auto' : 'none',
                            width: '100%', 
                            height: '100vh',
                            display: isGoogleChat || !isGoogleChat ? 'block' : 'none' 
                        }}>
                            <webview 
                                id="webview-google-chat"
                                key={`chat-${currentUser ? currentUser.uid : 'guest'}`}
                                src={currentUser?.email ? `https://chat.google.com/?authuser=${encodeURIComponent(currentUser.email)}` : "https://chat.google.com"}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                allowpopups="true"
                                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                            />
                        </div>
                    )}

                    {/* Persistent Google Mail Webview (알림 수신용 백그라운드 유지) */}
                    {isElectron && !isOdooOnlyAuth && (
                        <div style={{ 
                            position: isGoogleMail ? 'relative' : 'absolute',
                            left: isGoogleMail ? 0 : '-9999px',
                            opacity: isGoogleMail ? 1 : 0,
                            pointerEvents: isGoogleMail ? 'auto' : 'none',
                            width: '100%', 
                            height: '100vh',
                            display: isGoogleMail || !isGoogleMail ? 'block' : 'none'
                        }}>
                            {/* 자체 헤더/뒤로가기 등은 WorkspaceMailPage에 있었지만, 여기서는 순수 웹뷰만 띄웁니다.
                                UI적인 통일성을 위해 WorkspaceMailPage 컴포넌트를 이 Persistent 레이어 안으로 합치는게 좋지만
                                가장 심플한 방법은 웹뷰만 띄워두고 알림을 받는 용도로 쓰는 것입니다. 
                            */}
                            <webview 
                                id="webview-google-mail"
                                key={`mail-${currentUser ? currentUser.uid : 'guest'}`}
                                src={currentUser?.email ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(currentUser.email)}` : "https://mail.google.com"}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                allowpopups="true"
                                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                            />
                        </div>
                    )}

                    {/* Persistent Google Calendar Webview (알림 수신용 백그라운드 유지) */}
                    {isElectron && !isOdooOnlyAuth && (
                        <div style={{ 
                            position: isGoogleCalendar ? 'relative' : 'absolute',
                            left: isGoogleCalendar ? 0 : '-9999px',
                            opacity: isGoogleCalendar ? 1 : 0,
                            pointerEvents: isGoogleCalendar ? 'auto' : 'none',
                            width: '100%', 
                            height: '100vh',
                            display: isGoogleCalendar || !isGoogleCalendar ? 'block' : 'none'
                        }}>
                            <webview 
                                id="webview-google-calendar"
                                key={`cal-${currentUser ? currentUser.uid : 'guest'}`}
                                src={currentUser?.email ? `https://calendar.google.com/calendar/?authuser=${encodeURIComponent(currentUser.email)}` : "https://calendar.google.com/calendar/"}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                allowpopups="true"
                                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                            />
                        </div>
                    )}

                    {/* Persistent Odoo Webview (메인 Odoo 웹뷰를 백그라운드에서 상시 구동) 
                        - 사용자가 구글 앱이나 커스텀 React 화면(전자결재 등)을 볼 때도 
                          언마운트되지 않고 상태(세션/채팅/알림)를 유지합니다.
                    */}
                    {isElectron && currentUser?.uid && (
                        <div style={{ 
                            position: isOdooView ? 'relative' : 'absolute',
                            left: isOdooView ? 0 : '-9999px',
                            opacity: isOdooView ? 1 : 0,
                            pointerEvents: isOdooView ? 'auto' : 'none',
                            width: '100%', 
                            height: '100vh',
                            display: 'block',
                            zIndex: 10
                        }}>
                            <OdooWebView />
                        </div>
                    )}
                    
                    <div className={`${isFullPage ? 'max-w-none w-full h-screen' : 'max-w-[1300px] mx-auto h-[calc(100vh-48px)]'} animate-fade-in`} style={{ display: (((isGoogleChat || isGoogleMail || isGoogleCalendar) && isElectron) || isOdooView) ? 'none' : 'block' }}>
                        {children}
                    </div>

                    {/* 전역 자동 업데이트 체크 및 알림 모달 */}
                    {isElectron && <UpdateNotificationModal />}

                    {/* 플로팅 개인 메모장 */}
                    <FloatingNotepad />

                    {/* 제미나이 헬프봇 사이드 패널 */}
                    <GeminiWebviewPanel 
                        isOpen={isGeminiPanelOpen} 
                        onClose={() => setIsGeminiPanelOpen(false)} 
                    />

                    {/* 우측 하단 고정 버전 배지 */}
                    {!isFullPage && (
                        <div className="fixed bottom-2 right-6 z-40 bg-white/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 backdrop-blur-md px-2 py-0.5 rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[9px] font-black text-slate-400 dark:text-slate-500 select-none tracking-wider pointer-events-none transition-all">
                            VER v{appVersion}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
