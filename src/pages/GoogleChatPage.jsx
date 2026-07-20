import React, { useState, useEffect } from 'react';
import { ExternalLink, AlertCircle, Terminal, CheckCircle2, XCircle, Info, X } from 'lucide-react';

export default function GoogleChatPage() {
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);

    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    useEffect(() => {
        if (!showLogs) return;
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/webhook-logs');
                const data = await res.json();
                if (data.success) {
                    setLogs(data.logs);
                }
            } catch (err) {
                console.error('Failed to fetch webhook logs', err);
            }
        };
        fetchLogs();
        const interval = setInterval(fetchLogs, 3000);
        return () => clearInterval(interval);
    }, [showLogs]);

    if (isElectron) return null;

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden font-sans relative">
            {/* Header Banner */}
            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 text-emerald-800">
                    <AlertCircle size={18} className="text-emerald-600" />
                    <span className="text-sm font-medium">
                        구글 챗 화면이 보이지 않거나 404 에러가 발생한다면, 브라우저에 구글 로그인이 되어있지 않거나 브라우저 보안 정책 때문일 수 있습니다.
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowLogs(!showLogs)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border shadow-sm ${showLogs ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <Terminal size={14} />
                        {showLogs ? '로그 패널 숨기기' : '실시간 연동 상태 로그'}
                    </button>
                    <a 
                        href="https://chat.google.com/" 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors border border-emerald-200 shadow-sm"
                    >
                        새 창에서 열기 <ExternalLink size={14} />
                    </a>
                </div>
            </div>
            
            {/* Main Content Area */}
            <div className="flex-1 relative flex overflow-hidden">
                {/* Iframe */}
                <div className="flex-1 relative bg-slate-50">
                    <iframe 
                        src="https://chat.google.com/"
                        className="w-full h-full border-none absolute inset-0"
                        title="Google Chat"
                        allow="camera; microphone; fullscreen; display-capture; autoplay"
                    />
                </div>

                {/* Logs Side Panel */}
                {showLogs && (
                    <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl shrink-0 z-10 transition-all duration-300">
                        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900 shrink-0">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <Terminal size={16} />
                                <span className="text-sm font-bold tracking-tight">Odoo Webhook Logs</span>
                            </div>
                            <button onClick={() => setShowLogs(false)} className="text-slate-400 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {logs.length === 0 ? (
                                <div className="text-slate-500 text-xs text-center mt-10">
                                    기록된 로그가 없습니다.<br/>(최근 이벤트 수신 대기 중)
                                </div>
                            ) : (
                                logs.map(log => (
                                    <div key={log.id} className="bg-slate-800/50 rounded p-3 border border-slate-700/50 text-xs">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-1.5 font-semibold">
                                                {log.type === 'SUCCESS' && <CheckCircle2 size={14} className="text-emerald-400" />}
                                                {log.type === 'ERROR' && <XCircle size={14} className="text-rose-400" />}
                                                {log.type === 'INFO' && <Info size={14} className="text-sky-400" />}
                                                <span className={
                                                    log.type === 'SUCCESS' ? 'text-emerald-400' :
                                                    log.type === 'ERROR' ? 'text-rose-400' : 'text-sky-400'
                                                }>
                                                    {log.type}
                                                </span>
                                            </div>
                                            <span className="text-slate-500 text-[10px]">
                                                {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <div className="text-slate-300 mb-1">
                                            <span className="text-slate-500 font-medium mr-1">To:</span> 
                                            {log.email}
                                        </div>
                                        <div className="text-slate-300 mb-1">
                                            <span className="text-slate-500 font-medium mr-1">Summary:</span> 
                                            {log.messageSummary}
                                        </div>
                                        <div className="text-slate-400 italic">
                                            {log.details}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
