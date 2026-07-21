import React, { useRef, useState, useEffect } from 'react';
import { X, MessageSquarePlus, Loader2, Sparkles } from 'lucide-react';

const NOTEBOOK_LM_URL = "https://notebooklm.google.com/notebook/2ed9f700-cda1-487e-a72f-ab76e201364c";

export default function GeminiWebviewPanel({ isOpen, onClose }) {
    const webviewRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);

    const handleNewChat = () => {
        if (webviewRef.current) {
            setIsLoading(true);
            webviewRef.current.loadURL(NOTEBOOK_LM_URL);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
        }
    }, [isOpen]);

    React.useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleNewWindow = (e) => {
            e.preventDefault();
            window.open(e.url, '_blank');
        };

        const handleDomReady = () => {
            setIsLoading(false);

            // 상단 헤더(빨간 박스)를 숨기기 위한 스크립트 주입
            const hideHeaderScript = `
                (function() {
                    const hideUI = () => {
                        // 1. 최상단 Google Bar (#gb) 숨기기
                        const gb = document.getElementById('gb');
                        if (gb) gb.style.display = 'none';

                        // header나 banner 역할 숨기기
                        const headers = document.querySelectorAll('header, [role="banner"]');
                        headers.forEach(h => { h.style.display = 'none'; });

                        // 계정, 햄버거 메뉴 등 Google 공통 상단 메뉴 숨기기
                        const ariaMenus = document.querySelectorAll('[aria-label*="계정"], [aria-label*="메뉴"], [aria-label*="Google 앱"], [aria-label*="설정"]');
                        ariaMenus.forEach(el => {
                            if (el.parentElement) el.parentElement.style.display = 'none';
                        });

                        // 2. '노트북 만들기' 버튼이 포함된 상단 영역 찾아서 숨기기
                        const buttons = document.querySelectorAll('button, a');
                        buttons.forEach(btn => {
                            if (btn.innerText && (btn.innerText.includes('노트북 만들기') || btn.innerText.includes('New notebook'))) {
                                let parent = btn.parentElement;
                                if (parent) {
                                    parent.style.display = 'none';
                                    if (parent.parentElement) parent.parentElement.style.display = 'none';
                                }
                            }
                        });

                        // 3. '출처 / 채팅 / 스튜디오' 탭 리스트 숨기기
                        const tabLists = document.querySelectorAll('[role="tablist"]');
                        tabLists.forEach(tab => {
                            tab.style.display = 'none';
                        });
                        
                        // 추가로 빈 공간이나 불필요한 패딩 제거
                        document.body.style.paddingTop = '0px';
                    };

                    hideUI();
                    
                    // SPA 특성상 DOM이 동적으로 변할 수 있으므로 MutationObserver로 지속 감시
                    const observer = new MutationObserver(() => {
                        hideUI();
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                })();
            `;

            webview.executeJavaScript(hideHeaderScript).catch(err => {
                console.warn('UI Hide Script Failed:', err);
            });
        };

        // Electron webview 이벤트 리스너 등록
        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('did-finish-load', handleDomReady);
        webview.addEventListener('new-window', handleNewWindow);

        return () => {
            if (webview) {
                webview.removeEventListener('dom-ready', handleDomReady);
                webview.removeEventListener('did-finish-load', handleDomReady);
                webview.removeEventListener('new-window', handleNewWindow);
            }
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[450px] bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col z-[100] animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold text-slate-800 dark:text-slate-200">Odoo 헬프봇 (NotebookLM)</h2>
                        <p className="text-[11px] text-slate-500 font-medium">임시 탭 · API 미사용</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={handleNewChat}
                        className="flex items-center gap-1 px-3 py-1.5 mx-1 text-[12px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-md transition-colors"
                        title="새로고침"
                    >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        <span>새로고침</span>
                    </button>
                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content (Webview) */}
            <div className="flex-1 w-full bg-white relative">
                {isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                        <p className="text-sm text-slate-500 font-medium animate-pulse">NotebookLM 연결 중...</p>
                    </div>
                )}

                <webview 
                    ref={webviewRef}
                    src={NOTEBOOK_LM_URL}
                    className="w-full h-full border-none"
                    allowpopups="true"
                    useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                />
            </div>
        </div>
    );
}
