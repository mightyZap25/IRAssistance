import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// 기본 사내망 Odoo 주소 및 테일스케일 Odoo 주소 (현재 외부 접속 테스트를 위해 통일)
const ODOO_LOCAL_URL = 'http://100.67.238.32:8069'; 
const ODOO_REMOTE_URL = 'http://100.67.238.32:8069';

let globalOdooMenus = [];

export default function OdooWebView() {
    const location = useLocation();
    const webviewRef = useRef(null);
    const [menusLoaded, setMenusLoaded] = React.useState(globalOdooMenus.length > 0);
    const [odooBaseUrl, setOdooBaseUrl] = React.useState(ODOO_LOCAL_URL);

    // 활성화된 프로필에 맞는 Odoo URL 가져오기
    useEffect(() => {
        fetch('/api/config/db')
            .then(res => res.json())
            .then(data => {
                if (data && data.currentProfile === 'remote') {
                    setOdooBaseUrl(ODOO_REMOTE_URL);
                    console.log('[OdooWebView] 외부 원격 프로필(Tailscale) 적용됨:', ODOO_REMOTE_URL);
                } else {
                    setOdooBaseUrl(ODOO_LOCAL_URL);
                    console.log('[OdooWebView] 사내 로컬 프로필 적용됨:', ODOO_LOCAL_URL);
                }
            })
            .catch(err => {
                console.error('[OdooWebView] DB 설정 로드 실패, 기본 로컬 주소 사용:', err);
                setOdooBaseUrl(ODOO_LOCAL_URL);
            });
    }, []);

    const isElectron = window.electronAPI?.isElectron ||
                       (window && window.process && window.process.type === 'renderer') ||
                       (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1);

    // 목표 URL 계산
    const getTargetUrl = () => {
        if (location.pathname === '/odoo/apps') {
            return `${odooBaseUrl}/odoo/apps`;
        }
        if (location.pathname === '/odoo/login') {
            return `${odooBaseUrl}/web/login`;
        }
        if (location.pathname === '/odoo/logout') {
            return `${odooBaseUrl}/web/session/logout`;
        }
        if (location.pathname === '/odoo/view') {
            const searchParams = new URLSearchParams(location.search);
            const menuId = searchParams.get('menu_id');
            if (menuId) return `${odooBaseUrl}/web#menu_id=${menuId}`;
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
                return `${odooBaseUrl}/web#menu_id=${matchedMenu.menu_id}`;
            }
        }

        return `${odooBaseUrl}/web`;
    };

    // 경로 변경 시 webview URL 이동
    useEffect(() => {
        const targetUrl = getTargetUrl();
        if (webviewRef.current && isElectron) {
            try {
                const currentUrl = webviewRef.current.getURL();
                // 만약 Base URL은 같은데 hash만 다르다면, loadURL 대신 JS로 hash만 변경 (ERR_ABORTED 방지)
                const targetBase = targetUrl.split('#')[0];
                const currentBase = currentUrl.split('#')[0];
                
                if (currentUrl !== targetUrl) {
                    if (currentBase === targetBase && targetUrl.includes('#')) {
                        const hashPart = targetUrl.split('#')[1];
                        webviewRef.current.executeJavaScript(`window.location.hash = '${hashPart}';`).catch(() => {});
                    } else {
                        webviewRef.current.loadURL(targetUrl);
                    }
                }
            } catch (e) {
                webviewRef.current.src = targetUrl;
            }
        }
    }, [location.pathname, location.search, isElectron, menusLoaded]);

    useEffect(() => {
        const handleClearSession = async () => {
            if (isElectron && window.electronAPI?.clearOdooCookies) {
                await window.electronAPI.clearOdooCookies();
                globalOdooMenus = [];
                setMenusLoaded(false);
                window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: [] }));
                if (webviewRef.current) {
                    webviewRef.current.loadURL(`${odooBaseUrl}/web/login`);
                }
            }
        };
        window.addEventListener('clear-odoo-session', handleClearSession);
        return () => window.removeEventListener('clear-odoo-session', handleClearSession);
    }, [isElectron, odooBaseUrl]);

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
                
                /* Odoo 우측 상단 사용자 프로필 메뉴 숨기기 */
                .o_user_menu, .o_user_menu_wrapper, .o_menu_systray .o_user_menu, [data-menu-xmlid="base.menu_user"] {
                    display: none !important;
                }

                /* 좌측 마진 추가 */
                .o_menu_brand { margin-left: 24px !important; }
                
                /* Odoo 기본 보라색 로더 및 프로그레스바 강제 제거 */
                .o_loading, .bg-primary, .progress-bar {
                    background-color: #2563eb !important;
                }
                
                /* 서브메뉴(버튼) 영역 강제 투명화 및 배경 초기화 (보라색 제거) - 글로벌 적용 */
                .o_menu_sections, .o_menu_sections > *, .o_menu_sections .o_nav_entry, .o_navbar_apps_menu {
                    background-color: transparent !important;
                    background-image: none !important;
                }
                
                /* 글로벌 폰트 및 상단바 높이 개편 */
                .o_main_navbar, .o_navbar, .o_menu_brand, .o_menu_sections, .o_menu_sections a, .o_menu_sections button, .o_menu_sections .o_nav_entry {
                    font-family: 'Outfit', 'Inter', -apple-system, sans-serif !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    letter-spacing: -0.01em !important;
                }
                
                .o_navbar, .o_main_navbar {
                    height: 48px !important;
                    padding: 0 16px !important;
                    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03) !important;
                }
                
                /* 상단 앱 대메뉴 브랜드 타이틀 스타일 다듬기 */
                .o_menu_brand {
                    font-size: 14px !important;
                    font-weight: 800 !important;
                    text-transform: uppercase !important;
                    letter-spacing: -0.02em !important;
                    margin-left: 20px !important;
                    padding-right: 15px !important;
                    border-right: 1px solid #cbd5e1 !important;
                    height: 24px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    align-self: center !important; /* 수직 중앙 정렬 */
                }
                
                /* 서브메뉴 컨테이너 자체 수직 정렬 */
                .o_menu_sections {
                    display: inline-flex !important;
                    align-items: center !important;
                    align-self: center !important; /* 수직 중앙 정렬 */
                }
                
                /* 서브메뉴 아이템들을 이쁜 라운드 필(Pill) 형태로 렌더링 */
                .o_menu_sections a, .o_menu_sections button, .o_menu_sections .o_nav_entry {
                    padding: 6px 12px !important;
                    margin: 0 4px !important;
                    border-radius: 8px !important;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    height: auto !important;
                    line-height: normal !important;
                    display: inline-flex !important;
                    align-items: center !important;
                }
                
                /* ===== 인사 직원 칸반 카드 프리미엄 스타일링 (글로벌) ===== */
                
                /* 카드 기본 형태 - 둥근 모서리, 심플한 아웃라인, 배경 없음, 그림자 제거 */
                .o_kanban_record {
                    border-radius: 12px !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    border: 1px solid #e2e8f0 !important;
                    box-shadow: none !important;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    overflow: hidden !important;
                }
                
                .o_kanban_record:hover {
                    transform: translateY(-1.5px) !important;
                }
                
                /* 카드 왼쪽의 단색 영역 (컬러 바, 왼쪽 테두리 색상, 이미지 채우기 배경색) 제거 */
                .o_kanban_color_bar, .o_color_bar {
                    display: none !important;
                }
                
                .o_kanban_record[class*="oe_kanban_color_"], 
                .o_kanban_record[class*="o_kanban_color_"] {
                    border-left-width: 1px !important;
                }
                
                /* 이미지 영역 전체 (모든 Odoo 칸반 사진 영역 클래스 포함) */
                .o_kanban_view .o_kanban_image_fill_left,
                .o_kanban_view .o_kanban_image,
                .o_kanban_view .o_kanban_image_placeholder,
                .o_kanban_view .o_avatar_year,
                .o_kanban_view .o_image_holder,
                .o_kanban_view .oe_kanban_avatar {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E");
                    background-size: 28px 28px;
                    background-repeat: no-repeat;
                    background-position: center;
                    border-radius: 50% !important;
                    background-color: transparent !important;
                    border: 1px solid #e2e8f0 !important;
                    color: transparent !important;
                    font-size: 0 !important;
                    position: absolute !important;
                    top: 50% !important;
                    left: 16px !important;
                    transform: translateY(-50%) !important;
                    width: 60px !important;
                    height: 60px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-shadow: none !important;
                    overflow: hidden !important;
                }
                
                /* 만약 텍스트 노드가 바로 안에 있는 경우 숨기기 */
                .o_kanban_view .o_kanban_image_fill_left span,
                .o_kanban_view .o_kanban_image span,
                .o_kanban_view .o_kanban_image_placeholder span,
                .o_kanban_view .o_image_holder span,
                .o_kanban_view .o_kanban_image_fill_left div,
                .o_kanban_view .o_kanban_image div,
                .o_kanban_view .o_kanban_image_placeholder div,
                .o_kanban_view .o_image_holder div {
                    display: none !important;
                    opacity: 0 !important;
                    color: transparent !important;
                }

                .o_kanban_view .o_kanban_image_fill_left img, 
                .o_kanban_view .o_kanban_image img,
                .o_kanban_view .o_kanban_image_placeholder img {
                    width: 100% !important;
                    height: 100% !important;
                    border-radius: 50% !important;
                    object-fit: cover !important;
                }
                
                /* HR 직원 카드 (o_kanban_view 안 카드) 내부 레이아웃 */
                .o_hr_employee_kanban .o_kanban_record .o_card_info,
                .o_employee_kanban .o_kanban_record .o_card_info,
                .o_kanban_view .o_kanban_record .oe_kanban_card {
                    padding: 16px !important;
                }
                
                /* 직원 이름 폰트 크기 및 두께 */
                .o_kanban_record .o_card_name,
                .o_kanban_record .o_primary,
                .o_kanban_record strong.d-block,
                .o_kanban_record .o_field_char.o_bold,
                .o_employee_kanban .o_kanban_record h3,
                .o_employee_kanban .o_kanban_record .o_kanban_record_title {
                    font-size: 14px !important;
                    font-weight: 700 !important;
                    letter-spacing: -0.01em !important;
                }
                
                /* 직책/부서 서브텍스트 */
                .o_kanban_record .o_secondary,
                .o_kanban_record .o_subtitle,
                .o_kanban_record small,
                .o_employee_kanban .o_kanban_record .o_field_widget:not(.o_field_many2one):not(.o_field_char) {
                    font-size: 11.5px !important;
                    font-weight: 500 !important;
                    opacity: 0.75 !important;
                }
                
                /* 직원 사진(아바타) - 크고 둥글게 */
                .o_kanban_record .o_avatar,
                .o_kanban_record img.o_avatar,
                .o_employee_kanban .o_kanban_image img {
                    width: 60px !important;
                    height: 60px !important;
                    border-radius: 50% !important;
                    object-fit: cover !important;
                    border: 2px solid rgba(37, 99, 235, 0.12) !important;
                }
                
                /* 칸반 헤더(상태) 바 */
                .o_kanban_grouped .o_column_title {
                    font-family: 'Outfit', 'Inter', -apple-system, sans-serif !important;
                    font-weight: 700 !important;
                    font-size: 12px !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.04em !important;
                }
                
                /* 상태 dot(채용 단계) 색상 뱃지 */
                .o_kanban_record .o_status {
                    border-radius: 50% !important;
                    width: 10px !important;
                    height: 10px !important;
                }
                
                /* 카드 하단 푸터 버튼들 (메시지, 활동 등) */
                .o_kanban_record .oe_kanban_action_button,
                .o_kanban_record .o_kanban_manage_button_area .btn {
                    border-radius: 8px !important;
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    padding: 4px 10px !important;
                }
                
                @media (prefers-color-scheme: light) {
                    /* Odoo 전체 기본 테마(보라색)를 세련된 파란색(Blue 600)으로 강제 덮어쓰기 */
                    :root {
                        --o-brand-odoo: #2563eb !important;
                        --o-brand-primary: #2563eb !important;
                        --primary: #2563eb !important;
                        --bs-primary: #2563eb !important;
                        --bs-primary-rgb: 37, 99, 235 !important;
                        
                        /* Light mode subtle primary overrides (replace light purple with light blue) */
                        --o-brand-light: #eff6ff !important;
                        --bs-primary-bg-subtle: #dbeafe !important;
                        --bs-primary-border-subtle: #bfdbfe !important;
                        --bs-primary-text-emphasis: #1e40af !important;
                    }
                    
                    /* 버튼 및 포인트 컬러 강제 오버라이드 (상단 버튼 및 스테이지 셰브론 포함) */
                    .btn-primary,
                    .o_control_panel .btn-primary,
                    .o_statusbar_buttons .btn-primary,
                    .o_statusbar_status .btn-primary,
                    .o_statusbar_status .btn-primary:disabled,
                    .o_statusbar_status .btn-primary.disabled,
                    .o_statusbar_status .o_arrow_button_active,
                    .o_arrow_button.btn-primary,
                    .o_arrow_button.active,
                    .o_form_buttons_edit .btn-primary {
                        background-color: #2563eb !important;
                        border-color: #2563eb !important;
                        color: white !important;
                    }
                    .btn-primary:hover,
                    .o_control_panel .btn-primary:hover,
                    .o_statusbar_buttons .btn-primary:hover,
                    .o_form_buttons_edit .btn-primary:hover {
                        background-color: #1d4ed8 !important;
                        border-color: #1d4ed8 !important;
                    }
                    .text-primary {
                        color: #2563eb !important;
                    }
                    .bg-primary {
                        background-color: #2563eb !important;
                    }
                    
                    /* 기본 아바타 백그라운드 보라색/랜덤색을 깔끔한 블루-슬레이트로 변경 */
                    .o_avatar, .o_user_avatar, .o_image, .o_mimetype_icon {
                        background-color: #3b82f6 !important;
                        color: #ffffff !important;
                    }
                    
                    /* 상단바 색상 변경 (연한 회색 배경 + 어두운 글씨) */
                    .o_navbar, .o_main_navbar { 
                        background-color: #f8fafc !important; 
                        background-image: none !important;
                        border-bottom: 1px solid #e2e8f0 !important; 
                    }
                    
                    /* 상단바 일반 메뉴 글씨 색상 */
                    .o_navbar .o_nav_entry, 
                    .o_navbar .dropdown-toggle,
                    .o_main_navbar > a,
                    .o_main_navbar > button,
                    .o_menu_brand {
                        color: #475569 !important; /* Slate-600 */
                    }
                    
                    /* 상단바 마우스 오버(Hover) 시 효과 - 슬레이트 연한 회색 라운드 필(Pill) */
                    .o_menu_sections a:hover, 
                    .o_menu_sections button:hover, 
                    .o_menu_sections .o_nav_entry:hover,
                    .o_navbar .dropdown-toggle:hover {
                        background-color: #f1f5f9 !important; /* Slate-100 */
                        color: #0f172a !important; /* Slate-900 */
                    }
                    
                    /* 상단바 액티브(Selected) 활성화 효과 - 소프트 블루 라운드 필(Pill) */
                    .o_menu_sections a.active, 
                    .o_menu_sections button.active,
                    .o_menu_sections .o_nav_entry.active,
                    .o_menu_sections .show > .dropdown-toggle {
                        background-color: #eff6ff !important; /* Blue-50 */
                        color: #2563eb !important; /* Blue-600 */
                        font-weight: 750 !important;
                    }
                    
                    /* 칸반 카드 라이트모드 아웃라인 & 호버 효과 */
                    .o_kanban_record,
                    .o_kanban_record[class*="oe_kanban_color_"], 
                    .o_kanban_record[class*="o_kanban_color_"] {
                        border-color: #e2e8f0 !important;
                        background-color: #ffffff !important; /* 라이트모드에서는 깔끔한 백그라운드 */
                    }
                    .o_kanban_record:hover {
                        border-color: #3b82f6 !important; /* 호버 시 파란 아웃라인 */
                        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.04) !important;
                    }
                }

                @media (prefers-color-scheme: dark) {
                    /* Odoo Smart Dark Mode Inversion filter */
                    html {
                        filter: invert(0.9) hue-rotate(180deg) !important;
                        background-color: #defaff !important; /* Inverts to slate-900 */
                    }
                    
                    /* Override dark mode variables under the filter */
                    :root {
                        --o-brand-light: #cbd5e1 !important; /* Inverts to dark slate hover */
                        --bs-primary-bg-subtle: #dbedff !important; /* Inverts to slate-800 */
                        --bs-primary-border-subtle: #c8dcf0 !important; /* Inverts to slate-700 border */
                        --bs-primary-text-emphasis: #111111 !important; /* Inverts to white */
                    }
                    
                    /* Page backgrounds -> invert to #0f172a (slate-900) */
                    body, .o_web_client, .o_action_manager, .o_content, .o_form_sheet_bg, .o_view_controller, .o_settings_container {
                        background-color: #defaff !important;
                    }
                    
                    /* Card, sheet, row, and list backgrounds -> invert to #1e293b (slate-800) */
                    .o_form_sheet, .o_list_view, .table, .table td, .table th, tr, td, th, .dropdown-menu, .modal-content, .o_searchview {
                        background-color: #dbedff !important;
                        border-color: #c8dcf0 !important; /* Inverts to border slate-700 */
                        color: #111111 !important; /* Inverts to white text */
                    }
                    
                    /* Secondary elements (headers, panel headers) -> invert to slate-950/900 */
                    .o_control_panel, .o_navbar, .o_main_navbar, .modal-header, .modal-footer {
                        background-color: #e2e8f0 !important;
                        border-bottom: 1px solid #cbd5e1 !important;
                    }
                    
                    /* Inputs and search -> invert to slate-800 background, white text */
                    input, select, textarea, .o_input, .o_searchview_input {
                        background-color: #dbedff !important;
                        color: #111111 !important;
                        border-color: #c8dcf0 !important;
                    }
                    
                    /* Active/selected tabs and badges -> blue accent */
                    .nav-tabs .nav-link.active, .o_searchview_facet, .badge-primary, .badge-info {
                        background-color: #c4d6f9 !important; /* Inverts to blue-500 */
                        color: #111111 !important;
                    }
                    
                    /* Primary active/action buttons in dark mode -> invert to blue-500 */
                    .o_control_panel .btn-primary,
                    .o_statusbar_buttons .btn-primary,
                    .o_statusbar_status .btn-primary,
                    .o_statusbar_status .btn-primary:disabled,
                    .o_statusbar_status .btn-primary.disabled,
                    .o_statusbar_status .o_arrow_button_active,
                    .o_arrow_button.btn-primary,
                    .o_arrow_button.active,
                    .o_form_buttons_edit .btn-primary {
                        background-color: #c4d6f9 !important;
                        border-color: #c4d6f9 !important;
                        color: #111111 !important;
                    }
                    
                    /* Hover styles -> invert to slate-700 (#334155) background */
                    .o_kanban_record:hover, tr:hover, td:hover, .dropdown-item:hover, .btn-secondary:hover {
                        background-color: #cbd5e1 !important;
                    }
                    
                    /* Muted texts -> invert to slate-400 (#94a3b8) */
                    .text-muted, .o_field_translate, .o_form_label_empty, .o_input_placeholder {
                        color: #555555 !important;
                    }
                    
                    /* Odoo Submenu and brand title text colors in dark mode -> invert to light blue (#93c5fd / #bfdbfe) */
                    .o_menu_brand,
                    .o_menu_sections, 
                    .o_menu_sections a, 
                    .o_menu_sections button, 
                    .o_menu_sections .o_nav_entry,
                    .o_menu_sections .dropdown-toggle {
                        color: #003a83 !important; /* Inverts to light blue #93c5fd */
                    }
                    .o_menu_sections a:hover, 
                    .o_menu_sections button:hover, 
                    .o_menu_sections .o_nav_entry:hover,
                    .o_menu_sections .dropdown-toggle:hover {
                        background-color: #cbd5e1 !important; /* Inverts to slate-700 background */
                        color: #001a4e !important; /* Inverts to bright hover blue #bfdbfe */
                    }
                    .o_menu_sections a.active, 
                    .o_menu_sections button.active,
                    .o_menu_sections .o_nav_entry.active,
                    .o_menu_sections .show > .dropdown-toggle {
                        background-color: #dbedff !important; /* Inverts to slate-800 active background */
                        color: #000000 !important; /* Inverts to clean white #ffffff */
                        font-weight: 750 !important;
                    }
                    
                    /* 다크모드 아바타 백그라운드 보라색/랜덤색을 정갈한 슬레이트로 변경 */
                    .o_avatar, .o_user_avatar, .o_image, .o_mimetype_icon {
                        background-color: #334155 !important;
                        color: #ffffff !important;
                    }
                    
                    /* Re-invert normal images, avatars, icons and background images */
                    img, video, .o_avatar, .o_user_avatar, .o_image, .o_mimetype_icon, [style*="background-image"] {
                        filter: invert(1) hue-rotate(180deg) !important;
                    }
                    
                    /* 칸반 카드 다크모드 아웃라인 & 호버 효과 */
                    .o_kanban_record,
                    .o_kanban_record[class*="oe_kanban_color_"], 
                    .o_kanban_record[class*="o_kanban_color_"] {
                        border-color: #cbd5e1 !important; /* Inverts to slate-700 border */
                        background-color: transparent !important; /* 내부 배경색 제거 */
                        color: #111111 !important;
                    }
                    .o_kanban_record:hover {
                        border-color: #c4d6f9 !important; /* Inverts to blue border */
                        background-color: transparent !important;
                    }
                }
            `).catch(() => {});
            
            // webview 내부(= Odoo 서버와 같은 origin)에서 JSON-RPC 호출
            // → CORS 없음, Odoo 세션 쿠키 자동 포함
            try {
                const menusData = await webview.executeJavaScript(`
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
                                method: 'load_menus',
                                args: [false],
                                kwargs: {}
                            }
                        })
                    })
                    .then(r => r.json())
                    .then(d => (d && d.result) ? d.result : null)
                    .catch(() => null);
                `);

                if (menusData && menusData.root && menusData.root.children) {
                    const childrenIds = menusData.root.children;
                    const apps = childrenIds.map(id => {
                        const m = menusData[id];
                        return {
                            name: m.name,
                            menu_id: String(m.id),
                        };
                    });
                    globalOdooMenus = apps;
                    setMenusLoaded(true);
                    window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: apps }));
                } else {
                    throw new Error('Invalid load_menus response');
                }
            } catch (e) {
                console.warn('[OdooWebView] executeJavaScript menu fetch failed:', e.message);
                globalOdooMenus = [];
                window.dispatchEvent(new CustomEvent('odoo-menus-loaded', { detail: [] }));
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
