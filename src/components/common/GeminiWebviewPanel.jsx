import React, { useRef, useState, useEffect } from 'react';
import { X, MessageSquarePlus, Loader2, Sparkles } from 'lucide-react';

// 대표님께서 요청하신 실제 Odoo 공식 매뉴얼 링크로 교체되었습니다.
const ODOO_MANUAL_LINK = "https://www.odoo.com/documentation/19.0/ko/index.html";
const GOOGLE_DRIVE_MANUAL_LINK = "https://drive.google.com/drive/folders/0AKqL0FGgJSakUk9PVA";

export default function GeminiWebviewPanel({ isOpen, onClose }) {
    const webviewRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAutomating, setIsAutomating] = useState(false);
    const injectionStartedRef = useRef(false);

    const handleNewChat = () => {
        if (webviewRef.current) {
            setIsLoading(true);
            setIsAutomating(true);
            injectionStartedRef.current = false;
            webviewRef.current.loadURL('https://gemini.google.com/');
        }
    };

    // 패널이 열릴 때마다 무조건 새 채팅(백지 상태)으로 강제 초기화하여 '임시 채팅창'처럼 동작하게 함
    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setIsAutomating(true);
            injectionStartedRef.current = false; // 패널 열릴 때마다 주입 상태 초기화
            // 컴포넌트가 마운트되면서 webview의 src 속성에 의해 자동으로 로드됩니다.
            // 여기서 loadURL()을 호출하면 아직 webview가 완전히 준비되지 않아 에러가 발생하므로 생략합니다.
        } else {
            setIsAutomating(false);
        }
    }, [isOpen]);

    React.useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleNewWindow = (e) => {
            e.preventDefault();
            window.open(e.url, '_blank');
        };

        const handleConsoleMessage = (e) => {
            if (e.message === 'GEMINI_AUTOMATION_DONE') {
                // 텍스트 입력 완료 신호를 받으면 2초 후 락을 해제합니다.
                setTimeout(() => setIsAutomating(false), 2000);
            }
        };

        const handleDomReady = () => {
            setIsLoading(false);

            // 이미 주입을 시작했다면 중복 실행 방지 (SPA 라우팅/이벤트 중복 발생 방지)
            if (injectionStartedRef.current) return;
            injectionStartedRef.current = true;

            // 완전히 자동화된 주입 스크립트 (오버레이 없이 봇이 직접 우측 상단 아이콘 클릭)
            const injectScript = `
                (function() {
                    // 1. 임시 채팅 버튼 찾기 (우측 상단 마법봉 아이콘)
                    let clicked = false;
                    
                    // 방법 A: Header 내의 마지막 버튼 클릭 (대부분 우측 끝 마법봉 아이콘임)
                    const header = document.querySelector('header');
                    if (header) {
                        const buttons = Array.from(header.querySelectorAll('button, [role="button"]'));
                        if (buttons.length > 0) {
                            const target = buttons[buttons.length - 1];
                            const isPressed = target.getAttribute('aria-pressed') === 'true' || target.getAttribute('aria-expanded') === 'true';
                            if (!isPressed) {
                                target.click();
                            }
                            clicked = true;
                        }
                    }
                    
                    // 방법 B: 좌표로 강제 클릭 (우측에서 40px, 위에서 35px 지점)
                    if (!clicked) {
                        const x = window.innerWidth - 40;
                        const y = 35;
                        let el = document.elementFromPoint(x, y);
                        while(el && el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.getAttribute('role') !== 'button') {
                            el = el.parentElement;
                        }
                        if (el) {
                            const isPressed = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-expanded') === 'true';
                            if (!isPressed) {
                                el.click();
                            }
                        }
                    }

                    // 2. 임시 채팅 모드(회색 배경) 진입 대기 후 매뉴얼 주입
                    setTimeout(() => {
                        const editor = document.querySelector('[contenteditable="true"]') || document.querySelector('.rich-textarea');
                        if (editor) {
                            editor.focus();
                            const textToInject = '앞으로 무조건 Odoo 사용방법에 대해서만 답해. 그리고 아래의 Odoo 공식 매뉴얼과 우리 회사의 구글 드라이브 자료를 함께 참조하여 답해라:\\n- Odoo 공식 매뉴얼: ${ODOO_MANUAL_LINK}\\n- 회사 구글 드라이브: ${GOOGLE_DRIVE_MANUAL_LINK}\\n\\n- 필요한 경우 링크를 첨부해라\\n';
                            document.execCommand('insertText', false, textToInject);
                            editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                            
                            setTimeout(() => {
                                const enterEvent = new KeyboardEvent('keydown', {
                                    bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13
                                });
                                editor.dispatchEvent(enterEvent);
                                
                                const sendButton = document.querySelector('button[aria-label*="Send"], button[aria-label*="전송"], button[aria-label*="보내기"], .send-button');
                                if (sendButton && !sendButton.disabled) {
                                    sendButton.click();
                                }
                                
                                // 호스트 앱(React)에 완료 신호 전송
                                console.log('GEMINI_AUTOMATION_DONE');
                            }, 800);
                        } else {
                            // 에디터를 못 찾은 경우에도 락을 풀기 위해 신호 전송
                            console.log('GEMINI_AUTOMATION_DONE');
                        }
                    }, 1500); // 클릭 후 화면 갱신을 위해 1.5초 대기
                })();
            `;
            
            // 페이지가 완전히 렌더링된 2.5초 뒤에 봇이 자동으로 버튼을 클릭하고 주입함
            setTimeout(() => {
                webview.executeJavaScript(injectScript).catch(err => {
                    console.warn('자동 클릭 스크립트 실행 실패:', err);
                    // 실패 시에도 락 해제
                    setIsAutomating(false);
                });
            }, 2500);
        };

        // Electron webview 이벤트 리스너 등록
        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('did-finish-load', handleDomReady);
        webview.addEventListener('new-window', handleNewWindow);
        webview.addEventListener('console-message', handleConsoleMessage);

        return () => {
            if (webview) {
                webview.removeEventListener('dom-ready', handleDomReady);
                webview.removeEventListener('did-finish-load', handleDomReady);
                webview.removeEventListener('new-window', handleNewWindow);
                webview.removeEventListener('console-message', handleConsoleMessage);
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
                        <h2 className="text-[15px] font-bold text-slate-800 dark:text-slate-200">Odoo 헬프봇 (Gemini)</h2>
                        <p className="text-[11px] text-slate-500 font-medium">임시 탭 · API 미사용</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={handleNewChat}
                        className="flex items-center gap-1 px-3 py-1.5 mx-1 text-[12px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-md transition-colors"
                        title="대화 기록 지우기 및 새 채팅"
                    >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        <span>새 채팅</span>
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
                        <p className="text-sm text-slate-500 font-medium animate-pulse">제미나이 연결 중...</p>
                    </div>
                )}

                {/* 자동화 진행 중(isAutomating)일 때 마우스/키보드 입력을 완전히 차단하는 투명 오버레이 */}
                {isAutomating && !isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] z-[50] pointer-events-auto">
                        <Loader2 className="w-10 h-10 text-white animate-spin mb-4" />
                        <h3 className="text-white font-bold text-lg mb-2 text-center">봇이 헬프 데스크를<br/>초기 세팅하고 있습니다...</h3>
                        <p className="text-white/80 text-sm font-medium animate-pulse text-center">
                            잠시만 기다려 주세요 (약 5초 소요)<br/>
                            <span className="text-xs text-white/50 mt-1 block">이 화면은 설정이 완료되면 자동으로 사라집니다.</span>
                        </p>
                    </div>
                )}

                <webview 
                    ref={webviewRef}
                    src="https://gemini.google.com/"
                    className="w-full h-full border-none"
                    allowpopups="true"
                    useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                />
            </div>
        </div>
    );
}
