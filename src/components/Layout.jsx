import React from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import UpdateNotificationModal from './common/UpdateNotificationModal';
import FloatingNotepad from './common/FloatingNotepad';

export default function Layout({ children }) {
    const { currentUser } = useAuth();
    useTaskAlarm(currentUser);

    const [appVersion, setAppVersion] = React.useState('0.9.4');

    React.useEffect(() => {
        if (window.electronAPI?.getAppVersion) {
            window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});
        }
    }, []);

    const location = useLocation();
    
    const isGoogleApp = location.pathname.startsWith('/workspace/chat') || 
                        location.pathname.startsWith('/workspace/calendar') || 
                        location.pathname.startsWith('/workspace/drive') || 
                        location.pathname.startsWith('/workspace/mail') || 
                        location.pathname.startsWith('/workspace/notebooklm') ||
                        location.pathname.startsWith('/workspace/gemini');

    const isFullPage = isGoogleApp || (!location.pathname.startsWith('/workspace/memo') && !location.pathname.startsWith('/settings') && !location.pathname.startsWith('/workspace/meetings'));
    const isGoogleChat = location.pathname.includes('/workspace/chat');

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
                    {/* Persistent Google Chat Webview (Always in DOM for background notifications) */}
                    {isElectron && (
                        <div style={{ 
                            position: isGoogleChat ? 'relative' : 'absolute',
                            left: isGoogleChat ? 0 : '-9999px',
                            opacity: isGoogleChat ? 1 : 0,
                            pointerEvents: isGoogleChat ? 'auto' : 'none',
                            width: '100%', 
                            height: '100vh' 
                        }}>
                            <webview 
                                key={currentUser ? currentUser.uid : 'guest'}
                                src={currentUser?.email ? `https://chat.google.com/?authuser=${encodeURIComponent(currentUser.email)}` : "https://chat.google.com"}
                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                allowpopups="true"
                                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                            />
                        </div>
                    )}
                    
                    <div className={`${isFullPage ? 'max-w-none w-full h-screen' : 'max-w-[1300px] mx-auto h-[calc(100vh-48px)]'} animate-fade-in`} style={{ display: (isGoogleChat && isElectron) ? 'none' : 'block' }}>
                        {children}
                    </div>

                    {/* 전역 자동 업데이트 체크 및 알림 모달 */}
                    {isElectron && <UpdateNotificationModal />}

                    {/* 플로팅 개인 메모장 */}
                    <FloatingNotepad />

                    {/* 우측 하단 고정 버전 배지 */}
                    {!isFullPage && (
                        <div className="fixed bottom-4 right-5 z-40 bg-white/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/40 backdrop-blur-md px-2 py-0.5 rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[9px] font-black text-slate-400 dark:text-slate-500 select-none tracking-wider pointer-events-none transition-all">
                            VER v{appVersion}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
