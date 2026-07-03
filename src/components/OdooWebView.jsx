import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const ODOO_BASE_URL = 'http://192.168.0.7:8069'; // NAS Odoo Server

let globalOdooMenus = [];

export default function OdooWebView() {
    const location = useLocation();
    const webviewRef = useRef(null);
    const [menusLoaded, setMenusLoaded] = React.useState(globalOdooMenus.length > 0);

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
        
        // 기존 네이티브 메뉴 경로를 Odoo 앱(App) 이름으로 매핑
        const appMap = {
            '/parts': 'Inventory',
            '/customers': 'Contacts',
            '/inventory': 'Inventory',
            '/manufacturers': 'Contacts',
            '/vendors': 'Contacts',
            '/prod-execution': 'Manufacturing',
            '/purchasing': 'Purchase',
            '/qa/dashboard': 'Quality',
            '/project/management': 'Project',
            '/project/tasks': 'Project',
            '/sales/billing': 'Accounting'
        };

        const targetAppName = appMap[location.pathname];
        if (targetAppName && globalOdooMenus.length > 0) {
            const matchedMenu = globalOdooMenus.find(m => m.name === targetAppName || m.name === 'Invoicing');
            if (matchedMenu) {
                return `${ODOO_BASE_URL}/web#menu_id=${matchedMenu.menu_id}`;
            }
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
    }, [location.pathname, location.search, isElectron, menusLoaded]);

    // webview 내부에서 직접 JSON-RPC 호출 (Odoo 세션 쿠키 사용)
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview || !isElectron) return;

        const handleDomReady = async () => {
            // Odoo 상단 메뉴바의 홈 버튼(앱 선택기)만 숨기고, 하위 메뉴(품목, 작업 등)는 보이도록 유지
            // 추가로 Odoo 기본 보라색 테마를 IR Assistant 색상(Slate-800)으로 덮어씌우고 좌측 마진을 줍니다.
            webview.insertCSS(`
                .o_navbar_apps_menu { display: none !important; }
                .o_menu_toggle { display: none !important; }
                .o_menu_apps { display: none !important; }
                
                /* 좌측 마진 추가 */
                .o_menu_brand { margin-left: 24px !important; }
                
                /* Odoo 전체 기본 테마(보라색)를 세련된 파란색(Blue 600)으로 강제 덮어쓰기 */
                :root {
                    --o-brand-odoo: #2563eb !important;
                    --o-brand-primary: #2563eb !important;
                    --primary: #2563eb !important;
                    --bs-primary: #2563eb !important;
                    --bs-primary-rgb: 37, 99, 235 !important;
                }
                
                /* 버튼 및 포인트 컬러 강제 오버라이드 */
                .btn-primary {
                    background-color: #2563eb !important;
                    border-color: #2563eb !important;
                    color: white !important;
                }
                .btn-primary:hover {
                    background-color: #1d4ed8 !important;
                    border-color: #1d4ed8 !important;
                }
                .text-primary {
                    color: #2563eb !important;
                }
                .bg-primary {
                    background-color: #2563eb !important;
                }
                
                /* 상단바 색상 변경 (연한 회색 배경 + 어두운 글씨) */
                .o_navbar, .o_main_navbar { 
                    background-color: #f8fafc !important; 
                    background-image: none !important;
                    border-bottom: 1px solid #e2e8f0 !important; 
                }
                /* 서브메뉴(버튼) 영역 강제 투명화 및 배경 초기화 (보라색 제거) */
                .o_menu_sections, .o_menu_sections > *, .o_menu_sections .o_nav_entry, .o_navbar_apps_menu {
                    background-color: transparent !important;
                    background-image: none !important;
                }
                
                /* 상단바 글씨 색상 */
                .o_navbar .o_nav_entry, 
                .o_navbar .dropdown-toggle,
                .o_main_navbar > a,
                .o_main_navbar > button,
                .o_menu_brand {
                    color: #475569 !important;
                }
                /* 상단바 마우스 오버(Hover) 시 효과 */
                .o_navbar .o_nav_entry:hover, 
                .o_navbar .dropdown-toggle:hover, 
                .o_navbar .o_nav_entry.show, 
                .o_navbar .dropdown-toggle.show,
                .o_main_navbar > a:hover,
                .o_main_navbar > button:hover {
                    background-color: #e2e8f0 !important;
                    color: #0f172a !important;
                }
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
                    globalOdooMenus = apps;
                    setMenusLoaded(true);
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
        <div className="w-full h-full bg-white flex flex-col">
            <webview
                ref={webviewRef}
                src={getTargetUrl()}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowpopups="true"
            />
        </div>
    );
}
