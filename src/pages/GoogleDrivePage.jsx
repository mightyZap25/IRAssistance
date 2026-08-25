import React, { useRef, useEffect, useState } from 'react';
import { ExternalLink, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FindInPageBar from '../components/common/FindInPageBar';

export default function GoogleDrivePage() {
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
        const handleUpdateTargetUrl = (e) => {
            // Can be used for link previews
        };

        const updateNavigationState = () => {
            setCanGoBack(webview.canGoBack());
        };

        const injectCSS = () => {
            const css = `
                /* Google Drive Previewer Light Theme Override */
                div.ndfHFb-c43Cm-z7Ux7b-dL434, 
                div.ndfHFb-c43Cm-z7Ux7b-r4nke, 
                div.ndfHFb-c43Cm-w7Ozid,
                div[role="dialog"],
                div[style*="background-color: rgb(17, 17, 17)"],
                div[style*="background-color: rgb(30, 30, 30)"] {
                    background-color: #f1f5f9 !important;
                }
                .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb, 
                .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb,
                div[style*="background-color: rgb(32, 33, 36)"] {
                    background-color: #ffffff !important;
                    border-bottom: 1px solid #e2e8f0 !important;
                }
                .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb *,
                .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb *,
                div[style*="background-color: rgb(32, 33, 36)"] * {
                    color: #0f172a !important;
                }
                .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb svg,
                .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb svg,
                .ndfHFb-c43Cm-pyv4t-aufaD-hrZbpb svg path,
                .ndfHFb-c43Cm-pyv4t-aufaD-M743ry-R78rGb svg path,
                div[style*="background-color: rgb(32, 33, 36)"] svg,
                div[style*="background-color: rgb(32, 33, 36)"] svg path {
                    fill: #334155 !important;
                    color: #334155 !important;
                }
            `;
            webview.insertCSS(css);
        };

        webview.addEventListener('new-window', handleNewWindow);
        webview.addEventListener('did-navigate', updateNavigationState);
        webview.addEventListener('did-navigate-in-page', updateNavigationState);
        webview.addEventListener('dom-ready', injectCSS);

        return () => {
            if (webview) {
                webview.removeEventListener('new-window', handleNewWindow);
                webview.removeEventListener('did-navigate', updateNavigationState);
                webview.removeEventListener('did-navigate-in-page', updateNavigationState);
                webview.removeEventListener('dom-ready', injectCSS);
            }
        };
    }, [currentUser]);

    const driveUrl = currentUser?.email 
        ? `https://drive.google.com/drive/my-drive?authuser=${encodeURIComponent(currentUser.email)}` 
        : "https://drive.google.com/drive/my-drive";

    if (isElectron) {
        return (
            <div className="w-full h-screen flex flex-col bg-white overflow-hidden relative">
                <FindInPageBar webviewRef={webviewRef} />
                {/* Webview Area */}
                <div className="flex-1 relative bg-white">
                    <webview 
                        ref={webviewRef}
                        key={currentUser ? currentUser.uid : 'guest'}
                        src={driveUrl}
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
            <div className="bg-sky-50 border-b border-sky-100 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-sky-800">
                    <AlertCircle size={18} className="text-sky-600" />
                    <span className="text-sm font-medium">
                        구글 드라이브가 정상적으로 작동하지 않으면, 브라우저에 구글 로그인이 되어있는지 확인해 주세요.
                    </span>
                </div>
                <a 
                    href="https://drive.google.com/" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-bold transition-colors border border-sky-200 shadow-sm"
                >
                    새 창에서 열기 <ExternalLink size={14} />
                </a>
            </div>
            
            {/* Iframe */}
            <div className="flex-1 relative bg-slate-50">
                <iframe 
                    src={driveUrl}
                    className="w-full h-full border-none absolute inset-0"
                    title="Google Drive"
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
            </div>
        </div>
    );
}
