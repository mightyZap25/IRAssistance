import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; // Will create next
import { useAuth } from '../contexts/AuthContext';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import UpdateNotificationModal from './common/UpdateNotificationModal';
import HelpDrawer from './common/HelpDrawer';
import GuidedTour from './common/GuidedTour';
import ScreenHintManager from './common/ScreenHintManager';

export default function Layout({ children }) {
    const { currentUser } = useAuth();
    useTaskAlarm(currentUser);

    const location = useLocation();
    
    // Help & Tour Global States
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [activeTour, setActiveTour] = useState(null);
    const [singleTourTarget, setSingleTourTarget] = useState(null);
    const [showScreenHints, setShowScreenHints] = useState(false);
    const [hintNumbers, setHintNumbers] = useState({});
    
    // Determine if we should use full width (e.g., for dashboard, google chat)
    const isFullPage = location.pathname.includes('/dashboard') || location.pathname.includes('/workspace/chat') || location.pathname.includes('/hr/attendance') || location.pathname.includes('/project/management');
    const isGoogleChat = location.pathname.includes('/workspace/chat');

    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    React.useEffect(() => {
        if (isHelpOpen) {
            document.body.classList.add('help-drawer-open');
        } else {
            document.body.classList.remove('help-drawer-open');
        }
        return () => {
            document.body.classList.remove('help-drawer-open');
        };
    }, [isHelpOpen]);

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
            <Sidebar />
            <div className={`flex-1 ml-64 flex flex-col min-w-0 transition-all duration-300 ${isHelpOpen ? 'pr-[380px]' : ''}`}>
                <Header isHelpOpen={isHelpOpen} onToggleHelp={() => { if (isHelpOpen) { setIsHelpOpen(false); setShowScreenHints(false); } else { setIsHelpOpen(true); } }} />
                <main className={`flex-1 overflow-x-hidden ${isFullPage ? 'p-0' : 'p-6'} relative`}>
                    {/* Persistent Google Chat Webview (Always in DOM for background notifications) */}
                    {isElectron && (
                        <div style={{ 
                            position: isGoogleChat ? 'relative' : 'absolute',
                            left: isGoogleChat ? 0 : '-9999px',
                            opacity: isGoogleChat ? 1 : 0,
                            pointerEvents: isGoogleChat ? 'auto' : 'none',
                            width: '100%', 
                            height: 'calc(100vh - 48px)' 
                        }}>
                            <webview 
                                src="https://chat.google.com" 
                                style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                                allowpopups="true"
                                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                            />
                        </div>
                    )}
                    
                    <div className={`${isFullPage ? 'max-w-none w-full h-[calc(100vh-48px)]' : 'max-w-[1300px] mx-auto h-[calc(100vh-96px)]'} animate-fade-in`} style={{ display: (isGoogleChat && isElectron) ? 'none' : 'block' }}>
                        {children}
                    </div>

                    {/* 전역 자동 업데이트 체크 및 알림 모달 */}
                    {isElectron && <UpdateNotificationModal />}
                    
                    {/* 사용자 도움말 및 가이드 투어 */}
                    <HelpDrawer 
                        isOpen={isHelpOpen} 
                        onClose={() => { setIsHelpOpen(false); setShowScreenHints(false); }} 
                        pathname={location.pathname} 
                        showScreenHints={showScreenHints}
                        onToggleScreenHints={() => setShowScreenHints(!showScreenHints)}
                        onStartTour={(tourKey) => {
                            setIsHelpOpen(false);
                            setActiveTour(tourKey);
                            setSingleTourTarget(null);
                        }}
                        onTriggerSingleTour={(targetKey) => {
                            setSingleTourTarget(targetKey);
                            setActiveTour(null);
                        }}
                        onHintNumbersChange={setHintNumbers}
                    />

                    <GuidedTour 
                        tourKey={activeTour} 
                        singleTargetKey={singleTourTarget}
                        onClose={() => {
                            setActiveTour(null);
                            setSingleTourTarget(null);
                            setIsHelpOpen(true); // 가이드 투어가 끝나면 사이드 도움말이 다시 활성화되도록 연동
                        }} 
                    />

                    {/* 동적 화면 힌트(전구) 매니저 */}
                    <ScreenHintManager 
                        showScreenHints={showScreenHints} 
                        hintNumbers={hintNumbers}
                        onTriggerSingleTour={(targetKey) => {
                            setSingleTourTarget(targetKey);
                            setActiveTour(null);
                        }}
                    />
                </main>
            </div>
        </div>
    );
}
