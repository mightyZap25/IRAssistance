import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const ODOO_BASE_URL = 'http://192.168.0.7:8069'; // NAS Odoo Server

export default function OdooWebView() {
    const location = useLocation();
    const webviewRef = useRef(null);

    const isElectron = window.electronAPI?.isElectron ||
                       (window && window.process && window.process.type === 'renderer') ||
                       (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    // 목표 URL 계산
    const getTargetUrl = () => {
        if (location.pathname === '/odoo/apps') {
            return `${ODOO_BASE_URL}/odoo/apps`;
        }
        if (location.pathname === '/odoo/view') {
            const searchParams = new URLSearchParams(location.search);
            const menuId = searchParams.get('menu_id');
            if (menuId) return `${ODOO_BASE_URL}/web#menu_id=${menuId}`;
        }
        return `${ODOO_BASE_URL}/web`;
    };

    // 경로 변경 시 webview URL 이동
    useEffect(() => {
        const targetUrl = getTargetUrl();
        if (webviewRef.current && isElectron) {
            try {
                if (webviewRef.current.getURL() !== targetUrl) {
                    webviewRef.current.loadURL(targetUrl);
                }
            } catch (e) {
                webviewRef.current.src = targetUrl;
            }
        }
    }, [location.pathname, location.search, isElectron]);

    // webview 내부에서 직접 JSON-RPC 호출 (Odoo 세션 쿠키 사용)
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview || !isElectron) return;

        const handleDomReady = async () => {
            // Odoo 상단 메뉴바 숨기기
            webview.insertCSS(`
                .o_main_navbar { display: none !important; }
                .o_action_manager { padding-top: 0 !important; }
            `).catch(() => {});

            // webview 내부(= Odoo 서버와 같은 origin)에서 JSON-RPC 호출
            // → CORS 없음, Odoo 세션 쿠키 자동 포함
            try {
                const menus = await webview.executeJavaScript(`
                    fetch('/web/dataset/call_kw', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'call',
                            id: 1,
                            params: {
                                model: 'ir.ui.menu',
                                method: 'search_read',
                                args: [[['parent_id', '=', false]]],
                                kwargs: {
                                    fields: ['id', 'name', 'sequence'],
                                    order: 'sequence asc'
                                }
                            }
                        })
                    })
                    .then(r => r.json())
                    .then(d => (d && d.result) ? d.result : [])
                    .catch(() => []);
                `);

                if (Array.isArray(menus) && menus.length > 0) {
                    const apps = menus.map(m => ({
                        name: m.name,
                        menu_id: String(m.id),
                    }));
                    window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: apps }));
                }
            } catch (e) {
                console.warn('[OdooWebView] executeJavaScript menu fetch failed:', e.message);
            }
        };

        webview.addEventListener('dom-ready', handleDomReady);
        return () => {
            webview.removeEventListener('dom-ready', handleDomReady);
        };
    }, [isElectron]);

    if (!isElectron) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-white rounded-2xl border border-slate-200 p-10 shadow-sm">
                <div className="text-rose-500 font-bold text-xl mb-4">웹 환경에서는 지원되지 않습니다.</div>
                <p className="text-slate-600">Odoo 연동은 데스크톱 앱(Electron) 환경에서만 작동합니다.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
            <webview
                ref={webviewRef}
                src={getTargetUrl()}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowpopups="true"
            />
        </div>
    );
}
