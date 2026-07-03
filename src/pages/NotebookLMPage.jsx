import React from 'react';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function NotebookLMPage() {
    const { currentUser } = useAuth();
    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    const notebooklmUrl = currentUser?.email 
        ? `https://notebooklm.google.com/?authuser=${encodeURIComponent(currentUser.email)}` 
        : "https://notebooklm.google.com";

    if (isElectron) {
        return (
            <div className="w-full h-screen bg-white overflow-hidden relative">
                <webview 
                    key={currentUser ? currentUser.uid : 'guest'}
                    src={notebooklmUrl}
                    style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                    allowpopups="true"
                    useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
            {/* Header Banner */}
            <div className="bg-purple-50 border-b border-purple-100 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-purple-800">
                    <AlertCircle size={18} className="text-purple-600" />
                    <span className="text-sm font-medium">
                        NotebookLM이 정상적으로 작동하지 않으면, 브라우저에 구글 로그인이 되어있는지 확인해 주세요.
                    </span>
                </div>
                <a 
                    href="https://notebooklm.google.com/" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-bold transition-colors border border-purple-200 shadow-sm"
                >
                    새 창에서 열기 <ExternalLink size={14} />
                </a>
            </div>
            
            {/* Iframe */}
            <div className="flex-1 relative bg-slate-50">
                <iframe 
                    src={notebooklmUrl}
                    className="w-full h-full border-none absolute inset-0"
                    title="NotebookLM"
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
            </div>
        </div>
    );
}
