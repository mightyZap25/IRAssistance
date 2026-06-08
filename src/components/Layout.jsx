import React from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; // Will create next
import { useAuth } from '../contexts/AuthContext';
import { useTaskAlarm } from '../hooks/useTaskAlarm';

export default function Layout({ children }) {
    const { currentUser } = useAuth();
    useTaskAlarm(currentUser);

    const location = useLocation();
    
    // Determine if we should use full width (e.g., for dashboard, google chat)
    const isFullPage = location.pathname.includes('/dashboard') || location.pathname.includes('/workspace/chat');
    const isGoogleChat = location.pathname.includes('/workspace/chat');

    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
            <Sidebar />
            <div className="flex-1 ml-64 flex flex-col min-w-0 transition-all duration-300">
                <Header />
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
                    
                    <div className={`${isFullPage ? 'max-w-none w-full h-[calc(100vh-48px)]' : 'max-w-[1300px] mx-auto'} animate-fade-in`} style={{ display: (isGoogleChat && isElectron) ? 'none' : 'block' }}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
