import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import UpdateNotificationModal from './common/UpdateNotificationModal';
import FloatingNotepad from './common/FloatingNotepad';
import GeminiWebviewPanel from './common/GeminiWebviewPanel';
import { BotMessageSquare } from 'lucide-react';

export default function Layout({ children }) {
    const { currentUser, isOdooOnlyAuth } = useAuth();
    useTaskAlarm(currentUser);

    const [appVersion, setAppVersion] = React.useState('0.9.4');
    const [isGeminiPanelOpen, setIsGeminiPanelOpen] = React.useState(false);
    const navigate = useNavigate();

    React.useEffect(() => {
        if (window.electronAPI?.getAppVersion) {
            window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});
        }
    }, []);

    React.useEffect(() => {
        if (!window.electronAPI) return;

        const unsubscribeBack = window.electronAPI.onAppGoBack(async () => {
            console.log('[Layout] app-go-back 이벤트 수신됨!');
            const webviews = document.querySelectorAll('webview');
            let handled = false;

            // 화면에 떠 있는 활성 웹뷰를 찾습니다. (투명하게 숨겨진 Google Chat 등 제외)
            const activeWebviews = Array.from(webviews).filter(wv => {
                const style = window.getComputedStyle(wv);
                return style.display !== 'none' && style.opacity !== '0' && wv.style.left !== '-9999px';
            });
            console.log('[Layout] 발견된 webview 총 갯수:', webviews.length, '활성화된 갯수:', activeWebviews.length);

            if (activeWebviews.length > 0) {
                const webview = activeWebviews[0];
                console.log('[Layout] 웹뷰 내부에 뒤로가기 스크립트 인젝션 시작...');
                try {
                    // Odoo 19 SPA 구조에서 history.back()이 안 먹힐 때를 대비해, 
                    // Odoo UI의 빵부스러기(Breadcrumb) 이전 링크나 닫기 버튼을 먼저 우선적으로 클릭하도록 시도합니다.
                    await webview.executeJavaScript(`
                        (function() {
                            console.log('[I-Link BackNav] 내부 뒤로가기 스크립트 실행됨');
                            
                            function triggerClick(el, label) {
                                if (!el) return false;
                                console.log('[I-Link BackNav] 타겟 발견 및 클릭 시도:', label, el);
                                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                                    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                                });
                                console.log('[I-Link BackNav] 마우스 이벤트 시뮬레이션 완료');
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
                            
                            console.log('[I-Link BackNav] 발견된 전체 빵부스러기 요소:', breadcrumbs.length, '개. 이전 단계 요소:', prevItems.length, '개');
                            if (prevItems.length > 0) {
                                const target = prevItems[prevItems.length - 1];
                                const link = target.querySelector('a');
                                return triggerClick(link || target, '빵부스러기 이전 단계');
                            }

                            const hash = window.location.hash || window.location.search;
                            console.log('[I-Link BackNav] 현재 URL Hash:', hash);
                            
                            // 웹에서는 잘 된다고 하셨으므로, history.back()이 Odoo 내비게이션의 핵심일 수 있습니다.
                            // 단, '재고 -> 휴가' 처럼 모듈 간 점프를 막기 위해 id= 또는 form 뷰인 경우에만 우선 허용합니다.
                            if (hash.includes('id=') || hash.includes('view_type=form')) {
                                console.log('[I-Link BackNav] URL에 상세 뷰 패턴(id= 등)이 확인되어 history.back() 실행');
                                window.history.back();
                                return true;
                            }

                            console.log('[I-Link BackNav] 아무 UI도 찾지 못했고, 최상위 경로로 판단하여 작동 중지(무시)');
                            return false;
                        })()
                    `);
                    
                    handled = true;
                } catch (e) {
                    console.error('Failed to call history back on webview:', e);
                    handled = true; 
                }
            }

            if (!handled) {
                navigate(-1);
            }
        });

        const unsubscribeForward = window.electronAPI.onAppGoForward(() => {
            const webviews = document.querySelectorAll('webview');
            let handled = false;

            for (const webview of webviews) {
                if (webview.getBoundingClientRect().height > 0) {
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
            }

            if (!handled) {
                navigate(1);
            }
        });

        return () => {
            unsubscribeBack();
            unsubscribeForward();
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
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
                <main className={`flex-1 overflow-x-hidden ${isFullPage ? 'p-0' : 'p-6'} ${isGoogleApp ? (isSidebarCollapsed ? 'pl-1 bg-slate-100' : 'pl-2.5 bg-slate-100') : ''} relative`}>
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
                                key={`cal-${currentUser ? currentUser.uid : 'guest'}`}
                                src={currentUser?.email ? `https://calendar.google.com/calendar/?authuser=${encodeURIComponent(currentUser.email)}` : "https://calendar.google.com/calendar/"}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                allowpopups="true"
                                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                            />
                        </div>
                    )}

                    {/* Persistent Odoo Webview (알림 수신 전용 백그라운드 유지) 
                        - 사용자가 구글 챗/메일 등 다른 화면을 볼 때도 Odoo의 멘션/결재 알림을 받기 위해 백그라운드에서 실행
                    */}
                    {isElectron && currentUser?.uid && (
                        <div style={{ 
                            position: 'absolute',
                            left: '-9999px',
                            opacity: 0,
                            pointerEvents: 'none',
                            width: '1px', 
                            height: '1px',
                            display: 'block'
                        }}>
                            <webview 
                                key={`odoo-bg-${currentUser.uid}`}
                                src="http://100.67.238.32:8069/web"
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                allowpopups="true"
                            />
                        </div>
                    )}
                    
                    <div className={`${isFullPage ? 'max-w-none w-full h-screen' : 'max-w-[1300px] mx-auto h-[calc(100vh-48px)]'} animate-fade-in`} style={{ display: ((isGoogleChat || isGoogleMail || isGoogleCalendar) && isElectron) ? 'none' : 'block' }}>
                        {children}
                    </div>

                    {/* 전역 자동 업데이트 체크 및 알림 모달 */}
                    {isElectron && <UpdateNotificationModal />}

                    {/* 플로팅 개인 메모장 */}
                    <FloatingNotepad />

                    {/* 제미나이 헬프봇 플로팅 버튼 (우측 하단) */}
                    {!isGeminiPanelOpen && (
                        <button
                            onClick={() => setIsGeminiPanelOpen(true)}
                            className="fixed bottom-6 right-6 z-[9000] p-3 md:p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.3)] transition-all duration-300 hover:scale-110 flex items-center justify-center group"
                            title="Odoo 헬프봇 열기"
                        >
                            <BotMessageSquare className="w-6 h-6 md:w-7 md:h-7 group-hover:animate-pulse" />
                        </button>
                    )}

                    {/* 제미나이 헬프봇 사이드 패널 */}
                    <GeminiWebviewPanel 
                        isOpen={isGeminiPanelOpen} 
                        onClose={() => setIsGeminiPanelOpen(false)} 
                    />

                    {/* 우측 하단 고정 버전 배지 */}
                    {!isFullPage && (
                        <div className="fixed bottom-4 right-20 z-40 bg-white/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 backdrop-blur-md px-2 py-0.5 rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[9px] font-black text-slate-400 dark:text-slate-500 select-none tracking-wider pointer-events-none transition-all">
                            VER v{appVersion}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
