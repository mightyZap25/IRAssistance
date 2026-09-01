import React, { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OdooWebView from '../OdooWebView';
import { LogIn, RefreshCw, LogOut, Menu, Home, Settings } from 'lucide-react';

export default function WebLayout() {
    const { odooApiUrl } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(true);
    const iframeKey = useRef(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const handlePopupLogin = () => {
        // Odoo 로그인 페이지를 팝업으로 엽니다.
        const width = 500;
        const height = 650;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
            `${odooApiUrl}/web/login`,
            'OdooLoginPopup',
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        if (!popup) {
            alert('팝업 차단이 감지되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
            return;
        }

        // 팝업이 닫힐 때까지 감시하다가, 닫히면 iframe을 새로고침합니다.
        const timer = setInterval(() => {
            if (popup.closed) {
                clearInterval(timer);
                console.log('[WebLayout] 팝업 닫힘 감지. iframe 새로고침');
                handleRefresh();
                return;
            }

            // 만약 도메인이 같아 접근이 가능하다면 로그인 후 대시보드 진입 시 강제 종료 시도
            try {
                const path = popup.location.pathname;
                if (path && (path === '/web' || path.includes('/odoo/'))) {
                    console.log('[WebLayout] 팝업 내 로그인 완료 감지! 팝업 강제 종료');
                    popup.close();
                    clearInterval(timer);
                    handleRefresh();
                }
            } catch (e) {
                // 브라우저 보안(CORS)으로 인해 아직 구글 로그인 도메인에 머물고 있거나 다른 도메인일 경우 무시
            }
        }, 1000);
    };

    const handleRefresh = () => {
        iframeKey.current += 1;
        setRefreshKey(iframeKey.current);
    };

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
            {/* Sidebar */}
            <div className={`flex flex-col bg-slate-900 text-white transition-all duration-300 ${isMenuOpen ? 'w-64' : 'w-20'} shadow-xl z-20`}>
                <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                    {isMenuOpen && <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">mightyONE Web</span>}
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                        <Menu size={20} />
                    </button>
                </div>

                <div className="flex-1 py-6 flex flex-col gap-2 px-3">
                    <button onClick={handleRefresh} className="flex items-center px-3 py-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-all group">
                        <Home size={22} className="min-w-[22px] group-hover:text-blue-400 transition-colors" />
                        {isMenuOpen && <span className="ml-3 font-medium">홈 (새로고침)</span>}
                    </button>
                    
                    <button onClick={handlePopupLogin} className="flex items-center px-3 py-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 transition-all group mt-2">
                        <LogIn size={22} className="min-w-[22px]" />
                        {isMenuOpen && <span className="ml-3 font-semibold">Odoo 구글 로그인</span>}
                    </button>
                </div>

                <div className="p-4 border-t border-slate-700/50">
                    <div className="bg-slate-800/50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mb-2">
                            <Settings size={18} className="text-slate-400" />
                        </div>
                        {isMenuOpen && (
                            <>
                                <p className="text-xs text-slate-400 font-medium">Web Version</p>
                                <p className="text-[10px] text-slate-500 mt-1">iframe integration</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col relative bg-white">
                <div className="h-12 border-b border-slate-200 flex items-center px-6 justify-between bg-white shadow-sm z-10">
                    <h1 className="text-sm font-semibold text-slate-700">Odoo ERP Workspace</h1>
                    <div className="flex items-center gap-3">
                        <button onClick={handlePopupLogin} className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold rounded-lg transition-colors flex items-center gap-1.5">
                            <LogIn size={14} /> 팝업 로그인 열기
                        </button>
                        <button onClick={handleRefresh} className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium rounded-lg transition-colors flex items-center gap-1.5">
                            <RefreshCw size={14} /> 화면 새로고침
                        </button>
                    </div>
                </div>
                <div className="flex-1 w-full bg-slate-100 relative">
                    <OdooWebView key={refreshKey} />
                </div>
            </div>
        </div>
    );
}
