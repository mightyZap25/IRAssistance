import React from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';

export default function TaskCalendarPage() {
    // Electron 환경인지 확인 (webview 태그 사용 가능 여부)
    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col space-y-4">
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <CalendarDays className="text-blue-600" /> 통합 일정 (Google Calendar)
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">
                        IR Assistant ERP에서 동기화된 모든 일정이 구글 캘린더를 통해 안전하게 제공됩니다.
                    </p>
                </div>
                <a 
                    href="https://calendar.google.com/calendar" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors"
                >
                    새 탭에서 열기 <ExternalLink size={16} />
                </a>
            </div>

            <div className="flex-1 w-full bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm relative">
                {isElectron ? (
                    <webview 
                        src="https://calendar.google.com/calendar/u/0/r" 
                        style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                        allowpopups="true"
                        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    />
                ) : (
                    <iframe 
                        src="https://calendar.google.com/calendar/u/0/r"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="Google Calendar"
                    />
                )}
            </div>
        </div>
    );
}
