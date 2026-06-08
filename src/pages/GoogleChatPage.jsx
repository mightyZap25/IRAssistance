import React from 'react';

export default function GoogleChatPage() {
    // Electron 환경인지 확인 (webview 태그를 쓸 수 있는지 확인하는 용도)
    const isElectron = window.electronAPI?.isElectron || 
                      (window && window.process && window.process.type === 'renderer') || 
                      (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    if (isElectron) return null;

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Content Area */}
            <div className="flex-1 min-h-0 relative w-full h-full">
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-50">
                        <div className="max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
                            <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600 mx-auto mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            </div>
                            <h2 className="text-lg font-black text-slate-800 mb-2">Google Chat 연동 안내</h2>
                            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                                Google Chat 임베딩 기능은 **IR Assistant 데스크톱(Electron) 앱** 내에서 온전하게 제공됩니다. 현재 웹 브라우저 환경에서는 보안 정책으로 인해 직접 화면을 띄울 수 없습니다.
                            </p>
                            <a 
                                href="https://chat.google.com" 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-sm shadow-blue-100"
                            >
                                Google Chat 웹으로 열기
                            </a>
                        </div>
                    </div>
            </div>
        </div>
    );
}
