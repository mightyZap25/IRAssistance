import React from 'react';
import { ExternalLink } from 'lucide-react';

export default function CompanyWebviewPage({ url, title }) {
    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    if (isElectron) {
        return (
            <div className="h-full min-h-[calc(100vh-64px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 text-slate-800 font-bold">
                        {title}
                    </div>
                    <a 
                        href={url}
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors border border-slate-200 shadow-sm"
                    >
                        새 창에서 기본 브라우저로 열기 <ExternalLink size={14} />
                    </a>
                </div>
                <div className="flex-1 relative">
                    <webview 
                        src={url}
                        style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                        allowpopups="true"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-slate-800 font-bold">
                    {title}
                </div>
                <a 
                    href={url}
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors border border-slate-200 shadow-sm"
                >
                    새 창에서 열기 <ExternalLink size={14} />
                </a>
            </div>
            
            <div className="flex-1 relative bg-slate-50">
                <iframe 
                    src={url}
                    className="w-full h-full border-none absolute inset-0"
                    title={title}
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
            </div>
        </div>
    );
}
