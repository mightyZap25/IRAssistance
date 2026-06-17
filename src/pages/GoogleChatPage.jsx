import React, { useState } from 'react';
import { ExternalLink, AlertCircle } from 'lucide-react';

export default function GoogleChatPage() {
    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    if (isElectron) return null;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
            {/* Header Banner */}
            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-emerald-800">
                    <AlertCircle size={18} className="text-emerald-600" />
                    <span className="text-sm font-medium">
                        구글 챗 화면이 보이지 않거나 404 에러가 발생한다면, 브라우저에 구글 로그인이 되어있지 않거나 브라우저 보안 정책 때문일 수 있습니다.
                    </span>
                </div>
                <a 
                    href="https://chat.google.com/" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors border border-emerald-200 shadow-sm"
                >
                    새 창에서 열기 <ExternalLink size={14} />
                </a>
            </div>
            
            {/* Iframe */}
            <div className="flex-1 relative bg-slate-50">
                <iframe 
                    src="https://chat.google.com/"
                    className="w-full h-full border-none absolute inset-0"
                    title="Google Chat"
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
            </div>
        </div>
    );
}
