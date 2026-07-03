import React, { useRef, useEffect, useState } from 'react';
import { ExternalLink, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function WorkspaceMailPage() {
    const { currentUser } = useAuth();
    const webviewRef = useRef(null);
    const [canGoBack, setCanGoBack] = useState(false);

    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleNewWindow = (e) => {
            e.preventDefault();
            webview.loadURL(e.url);
        };

        const updateNavigationState = () => {
            setCanGoBack(webview.canGoBack());
        };

        webview.addEventListener('new-window', handleNewWindow);
        webview.addEventListener('did-navigate', updateNavigationState);
        webview.addEventListener('did-navigate-in-page', updateNavigationState);

        return () => {
            if (webview) {
                webview.removeEventListener('new-window', handleNewWindow);
                webview.removeEventListener('did-navigate', updateNavigationState);
                webview.removeEventListener('did-navigate-in-page', updateNavigationState);
            }
        };
    }, [currentUser]);

    const gmailUrl = currentUser?.email 
        ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(currentUser.email)}` 
        : "https://mail.google.com";

    if (isElectron) {
        return (
            <div className="w-full h-screen flex flex-col bg-white overflow-hidden relative">
                {/* Top Navigation Bar */}
                <div className="h-11 border-b border-slate-200/80 bg-slate-50 px-4 flex items-center justify-between shrink-0 select-none">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                if (webviewRef.current?.canGoBack()) {
                                    webviewRef.current.goBack();
                                }
                            }}
                            disabled={!canGoBack}
                            className={`p-1.5 rounded-lg border transition-all flex items-center justify-center gap-1 text-xs font-bold ${
                                canGoBack
                                    ? 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 active:scale-95 shadow-sm'
                                    : 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed opacity-50'
                            }`}
                            title="뒤로 가기"
                        >
                            <ArrowLeft size={14} strokeWidth={2.5} />
                            <span>뒤로 가기</span>
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-1" />
                        <button
                            onClick={() => webviewRef.current?.reload()}
                            className="p-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-xs font-bold active:scale-95 transition-all shadow-sm flex items-center justify-center"
                            title="새로고침"
                        >
                            새로고침
                        </button>
                    </div>
                    <div className="text-slate-400 text-[10px] font-black uppercase tracking-wider mr-2">
                        Gmail
                    </div>
                </div>

                {/* Webview Area */}
                <div className="flex-1 relative bg-white">
                    <webview 
                        ref={webviewRef}
                        key={currentUser ? currentUser.uid : 'guest'}
                        src={gmailUrl}
                        style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                        allowpopups="true"
                        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
            {/* Header Banner */}
            <div className="bg-rose-50 border-b border-rose-100 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-rose-800">
                    <AlertCircle size={18} className="text-rose-600" />
                    <span className="text-sm font-medium">
                        지메일(Gmail)이 정상적으로 작동하지 않으면, 브라우저에 구글 로그인이 되어있는지 확인해 주세요.
                    </span>
                </div>
                <a 
                    href="https://mail.google.com/" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors border border-rose-200 shadow-sm"
                >
                    새 창에서 열기 <ExternalLink size={14} />
                </a>
            </div>
            
            {/* Iframe */}
            <div className="flex-1 relative bg-slate-50">
                <iframe 
                    src={gmailUrl}
                    className="w-full h-full border-none absolute inset-0"
                    title="Gmail"
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
            </div>
        </div>
    );
}
