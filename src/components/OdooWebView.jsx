import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { createSpreadsheet, updateSpreadsheetValues } from '../services/googleService';

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
            '/bom': 'Manufacturing',
            '/eco': 'PLM',
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

        if (location.pathname === '/' && globalOdooMenus.length > 0) {
            const hrMenu = globalOdooMenus.find(m => m.name === '근태/휴가 대시보드');
            if (hrMenu) {
                return `${odooBaseUrl}/web#menu_id=${hrMenu.menu_id}`;
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
                        const loadPromise = webviewRef.current.loadURL(targetUrl);
                        if (loadPromise && loadPromise.catch) {
                            loadPromise.catch(err => {
                                if (err.code !== 'ERR_ABORTED') {
                                    console.warn('[OdooWebView] loadURL warning:', err);
                                }
                            });
                        }
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
                    
                    .o_navbar .o_nav_entry, 
                    .o_navbar .dropdown-toggle,
                    .o_main_navbar > a,
                    .o_main_navbar > button,
                    .o_menu_brand {
                        color: #475569 !important; /* Slate-600 */
                    }
                    
                    /* Hide HR Sidebar */
                    .hr_nav_sidebar {
                        display: none !important;
                    }

                    /* ==================================================== */
                    /* 5. Print Mode (인쇄 최적화 - A4 세로, 깔끔한 디자인) */
                    /* ==================================================== */
                    
                    /* 화면(웹)에서는 숨겨두고 인쇄할 때만 보여줄 커스텀 헤더 */
                    #custom-print-header { display: none; }
                    
                    @media print {
                        /* 불필요한 UI(메뉴, 상단바, 패널 등) 모두 숨김 */
                        .o_main_navbar, 
                        header, 
                        .o_control_panel,
                        .o_content > .o_mrp_bom_report_buttons,
                        button.o_mrp_bom_print,
                        .o_action_manager .o_cp_top,
                        .o_action_manager .o_cp_bottom {
                            display: none !important;
                        }
                        
                        /* 사용자가 인쇄물에서 숨기길 원하는 배지(M, P 등) 숨김 */
                        .ir-badge {
                            display: none !important;
                        }

                        /* 옵션 다이얼로그에서 선택된 필터링 행(어셈블리/악세사리) 숨김 */
                        .ir-hide-in-print {
                            display: none !important;
                        }

                        /* 기존 Odoo의 못생긴 H1 타이틀 숨김 */
                        h1:not(#custom-print-header h1) {
                            display: none !important;
                        }
                        
                        /* 커스텀 헤더 표시 */
                        #custom-print-header {
                            display: block !important;
                            border-bottom: 3px solid #0f172a !important;
                            padding-bottom: 16px !important;
                            margin-bottom: 24px !important;
                        }
                        
                        /* 컨텐츠 영역을 A4 용지에 꽉 차게 재설정 */
                        body, html, .o_web_client, .o_action_manager, .o_content {
                            height: auto !important;
                            overflow: visible !important;
                            background-color: white !important;
                        }
                        .o_content {
                            position: static !important;
                        }

                        /* A4 세로 규격 설정 */
                        @page {
                            size: A4 portrait !important;
                            margin: 15mm !important;
                        }

                        /* 폰트 및 배경, 선 정리 */
                        body {
                            font-family: 'Inter', 'Noto Sans KR', sans-serif !important;
                            color: #0f172a !important;
                        }
                        
                        table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                        }
                        
                        th, td {
                            padding: 8px 12px !important;
                            border-bottom: 1px solid #e2e8f0 !important;
                            font-size: 10pt !important;
                        }
                        
                        th {
                            background-color: #f8fafc !important;
                            font-weight: 700 !important;
                            border-top: 2px solid #475569 !important;
                            border-bottom: 2px solid #94a3b8 !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                    }

                    /* ==================================================== */
                    /* Modernize Odoo Native Modals (팝업창 디자인 살짝 변경) */
                    /* ==================================================== */
                    .modal-content {
                        border-radius: 16px !important;
                        border: none !important;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.12) !important;
                        overflow: hidden !important;
                    }
                    .modal-header {
                        background-color: #f8fafc !important;
                        border-bottom: 1px solid #e2e8f0 !important;
                        padding: 16px 24px !important;
                    }
                    .modal-title {
                        font-weight: 700 !important;
                        color: #1e293b !important;
                    }
                    .modal-footer {
                        border-top: 1px solid #e2e8f0 !important;
                        background-color: #f8fafc !important;
                        padding: 16px 24px !important;
                    }

                    /* ==================================================== */
                    /* IR Assistant Custom Badges (품목 분류/클래스 하이라이트) */
                    /* ==================================================== */
                    .ir-badge {
                        font-weight: 800 !important;
                        padding: 1px 5px !important;
                        border-radius: 6px !important;
                        display: inline-block !important;
                        font-size: 0.85em !important;
                        line-height: 1.3 !important;
                        margin-right: 3px !important;
                        min-width: 20px !important;
                        text-align: center !important;
                    }
                    .ir-badge-mech { background-color: #fdf4ff !important; color: #c026d3 !important; border: 1px solid rgba(192, 38, 211, 0.3) !important; }
                    .ir-badge-elec { background-color: #eff6ff !important; color: #2563eb !important; border: 1px solid rgba(37, 99, 235, 0.3) !important; }
                    .ir-badge-out { background-color: #fefce8 !important; color: #ca8a04 !important; border: 1px solid rgba(202, 138, 4, 0.3) !important; }
                    .ir-badge-assy { background-color: #ecfdf5 !important; color: #059669 !important; border: 1px solid rgba(5, 150, 105, 0.3) !important; }
                    .ir-badge-prod { background-color: #f8fafc !important; color: #475569 !important; border: 1px solid rgba(71, 85, 105, 0.3) !important; }
                    .ir-badge-part { background-color: #fff1f2 !important; color: #e11d48 !important; border: 1px solid rgba(225, 29, 72, 0.3) !important; }

                    /* ==================================================== */
                    /* 4. Kanban / List Views Tweaks                        */
                    /* ==================================================== */
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
            

            // Webview 내부에 Ctrl + 마우스 휠 줌(Zoom) 기능 주입
            try {
                await webview.executeJavaScript(`
                    window.addEventListener('wheel', (e) => {
                        if (e.ctrlKey) {
                            e.preventDefault();
                            const currentZoom = parseFloat(document.body.style.zoom || '1');
                            let newZoom = currentZoom;
                            if (e.deltaY > 0) newZoom -= 0.1;
                            else newZoom += 0.1;
                            
                            if (newZoom < 0.5) newZoom = 0.5;
                            if (newZoom > 3.0) newZoom = 3.0;
                            
                            document.body.style.zoom = newZoom;
                        }
                    }, { passive: false });
                `);
            } catch(e) {
                console.warn('[OdooWebView] Failed to inject zoom script:', e);
            }

            // Webview 내부에 Clipboard API 폴리필 주입 (HTTP 환경에서 navigator.clipboard.writeText 오류 방지)
            try {
                await webview.executeJavaScript(`
                    if (!navigator.clipboard) {
                        navigator.clipboard = {};
                    }
                    if (!navigator.clipboard.writeText) {
                        navigator.clipboard.writeText = function(text) {
                            return new Promise((resolve, reject) => {
                                try {
                                    const textArea = document.createElement('textarea');
                                    textArea.value = text;
                                    textArea.style.position = 'fixed';
                                    textArea.style.left = '-999999px';
                                    textArea.style.top = '-999999px';
                                    document.body.appendChild(textArea);
                                    textArea.focus();
                                    textArea.select();
                                    const successful = document.execCommand('copy');
                                    textArea.remove();
                                    if (successful) resolve();
                                    else reject(new Error('copy command failed'));
                                } catch (err) {
                                    reject(err);
                                }
                            });
                        };
                    }
                `);
            } catch(e) {
                console.warn('[OdooWebView] Failed to inject clipboard polyfill:', e);
            }

            // --- INJECTED: Odoo BOM Circular Dependency Detector (임시 진단용) ---
            try {
                await webview.executeJavaScript(`
                    window.analyzeCircularBOM = async function() {
                        try {
                            const boms = await fetch('/web/dataset/call_kw', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    jsonrpc: '2.0', method: 'call', id: 1,
                                    params: { model: 'mrp.bom', method: 'search_read', args: [[]], kwargs: { fields: ['product_tmpl_id', 'product_id'] } }
                                })
                            }).then(r => r.json()).then(r => r.result);

                            const lines = await fetch('/web/dataset/call_kw', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    jsonrpc: '2.0', method: 'call', id: 2,
                                    params: { model: 'mrp.bom.line', method: 'search_read', args: [[]], kwargs: { fields: ['bom_id', 'product_id', 'product_tmpl_id'] } }
                                })
                            }).then(r => r.json()).then(r => r.result);

                            if (!boms || !lines) return;

                            const bomMap = {};
                            boms.forEach(b => { if (b.product_tmpl_id) bomMap[b.id] = { tmpl_id: b.product_tmpl_id[0], name: b.product_tmpl_id[1] }; });
                            
                            const adjList = {};
                            const nameMap = {};

                            lines.forEach(line => {
                                const parentBom = bomMap[line.bom_id[0]];
                                if (!parentBom) return;
                                const parentTmplId = parentBom.tmpl_id;
                                nameMap[parentTmplId] = parentBom.name;

                                let childTmplId = null;
                                let childName = null;
                                if (line.product_tmpl_id) {
                                    childTmplId = line.product_tmpl_id[0];
                                    childName = line.product_tmpl_id[1];
                                } else if (line.product_id) {
                                    childTmplId = 'prod_' + line.product_id[0];
                                    childName = line.product_id[1];
                                }
                                if (!childTmplId) return;
                                nameMap[childTmplId] = childName;

                                if (!adjList[parentTmplId]) adjList[parentTmplId] = new Set();
                                adjList[parentTmplId].add(childTmplId);
                            });

                            const visited = new Set();
                            const stack = new Set();
                            let cycleFound = false;

                            function dfs(node, path) {
                                visited.add(node);
                                stack.add(node);
                                path.push(node);
                                if (adjList[node]) {
                                    for (const child of adjList[node]) {
                                        if (!visited.has(child)) {
                                            if (dfs(child, path)) return true;
                                        } else if (stack.has(child)) {
                                            const start = path.indexOf(child);
                                            const cycle = path.slice(start);
                                            cycle.push(child);
                                            const names = cycle.map(n => nameMap[n] || n).join('\\n  ⬇\\n');
                                            alert('🚨 Odoo BOM 순환 참조 (무한 루프) 발견!\\n\\n이 부품들이 꼬리를 물고 있습니다:\\n\\n' + names + '\\n\\n위 품목 중 하나의 BOM에 들어가서 잘못 들어간 자식 부품을 삭제하세요.');
                                            cycleFound = true;
                                            return true;
                                        }
                                    }
                                }
                                stack.delete(node);
                                path.pop();
                                return false;
                            }

                            for (const node of Object.keys(adjList)) {
                                if (!visited.has(node)) {
                                    if (dfs(node, [])) break;
                                }
                            }
                            if (!cycleFound) console.log('✅ BOM 무한 루프 없음');
                        } catch (e) {
                            console.error('BOM 분석 실패:', e);
                        }
                    };
                    
                    // 실행
                    window.analyzeCircularBOM();
                `);
            } catch(e) {}
            
            // --- INJECTED: Odoo UI Highlight Logic (품목 분류/클래스 색상 하이라이트) ---
            try {
                await webview.executeJavaScript(`
                    if (!window.__ir_highlight_injected_v7) {
                        window.__ir_highlight_injected_v7 = true;
                        
                        const highlightCells = () => {
                            // 리스트 뷰, 폼 뷰, BOM 현황(report)의 a 태그, button 등 텍스트를 포함할 만한 모든 컨테이너 검색
                            const elements = document.querySelectorAll('td, span, a, div, h1, button');
                            
                            elements.forEach(el => {
                                // 이미 파싱된 컨테이너이거나, 우리가 방금 생성한 요소 자체인 경우 무한 루프 방지
                                if (el.dataset.irParsed === 'true') return;
                                if (el.classList.contains('ir-parsed-wrapper') || el.classList.contains('ir-badge') || el.classList.contains('ir-parsed-code')) return;
                                
                                let modified = false;
                                
                                // 3. 구글 시트 저장 버튼 주입
                                if (el.tagName && el.tagName.toLowerCase() === 'button') {
                                    if (el.textContent.includes('인쇄') || el.classList.contains('o_mrp_bom_print')) {
                                        // 인쇄 버튼 옆에 구글 시트 저장 버튼 삽입 (아직 없으면)
                                        if (!document.getElementById('ir_btn_save_sheet')) {
                                            const btnHtml = \`
                                                <button type="button" id="ir_btn_save_sheet" style="display:inline-flex; align-items:center; gap:6px; margin-right:12px; background:#10b981; color:white; padding:6px 14px; border-radius:6px; border:none; font-size:13px; font-weight:700; cursor:pointer; vertical-align: middle; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: 0.2s;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">
                                                    📊 구글 시트로 저장
                                                </button>
                                            \`;
                                            el.insertAdjacentHTML('beforebegin', btnHtml);
                                            
                                            document.getElementById('ir_btn_save_sheet').addEventListener('click', (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                
                                                // 로딩 표시
                                                const loader = document.createElement('div');
                                                loader.id = 'ir-sheet-loader';
                                                loader.innerHTML = '<div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;"><h2 style="color:#10b981; font-size:26px; font-weight:900; margin-bottom:12px;">구글 시트 생성 중...</h2><p style="color:#64748b; font-size:16px;">데이터를 추출하고 있습니다.</p></div>';
                                                document.body.appendChild(loader);
                                                
                                                // React 앱으로 추출 신호 전송
                                                console.log('__IR_SAVE_SHEET__');
                                            });
                                            modified = true;
                                        }
                                    }
                                }
                                
                                if (modified) {
                                    el.dataset.irParsed = 'true';
                                }
                            });
                        };

                        setInterval(highlightCells, 600); // 부하를 줄이기 위해 0.6초로 조정
                    }
                `);
            } catch(e) {
                console.warn('Highlight injection failed:', e);
            }
            // ----------------------------------------------------------------------
        };
            
        const handleConsoleMessage = async (e) => {
            if (e.message === '__IR_SAVE_SHEET__') {
                try {
                    const data = await webviewRef.current.executeJavaScript(`
                        (() => {
                            let rawTitle = '';
                            const potentialTitles = document.querySelectorAll('.o_mrp_bom_report_page h1, .o_content h1, h1, h2, h3, table tbody tr:first-child td span');
                            for (let t of potentialTitles) {
                                const txt = t.textContent || '';
                                if (txt.includes('[IR')) {
                                    const cloneT = t.cloneNode(true);
                                    cloneT.querySelectorAll('.ir-badge').forEach(b => b.remove());
                                    rawTitle = cloneT.textContent.trim();
                                    break; 
                                }
                            }
                            
                            const rows = [];
                            const ths = document.querySelectorAll('table thead th');
                            if (ths.length > 0) {
                                const headerRow = [];
                                ths.forEach(th => headerRow.push(th.textContent.trim().replace(/\\s+/g, ' ')));
                                rows.push(headerRow);
                            }
                            
                            const trs = document.querySelectorAll('table tbody tr');
                            trs.forEach(tr => {
                                const row = [];
                                tr.querySelectorAll('th, td').forEach(td => {
                                    row.push(td.textContent.trim().replace(/\\s+/g, ' '));
                                });
                                if (row.length > 0) rows.push(row);
                            });
                            
                            return { title: rawTitle || 'BOM Export', rows };
                        })();
                    `);
                    
                    if (!data.rows || data.rows.length === 0) {
                        throw new Error("테이블 데이터를 찾을 수 없습니다.");
                    }
                    
                    const safeTitle = data.title.replace(/[\\\\/:*?"<>|]/g, "_");
                    const sheet = await createSpreadsheet(safeTitle);
                    const sheetId = sheet.spreadsheetId;
                    const sheetUrl = sheet.spreadsheetUrl;
                    
                    // 최대 컬럼 수 계산해서 Range 동적 생성
                    const numCols = data.rows.reduce((max, row) => Math.max(max, row.length), 0);
                    // 간략히 A~Z 까지만 대응 (보통 BOM 열이 26개를 넘지 않으므로)
                    const endCol = String.fromCharCode(64 + Math.min(numCols, 26)); 
                    const range = `A1:${endCol}${data.rows.length}`;
                    
                    await updateSpreadsheetValues(sheetId, range, data.rows);
                    
                    webviewRef.current.executeJavaScript(`
                        const loader = document.getElementById('ir-sheet-loader');
                        if (loader) {
                            loader.innerHTML = '<div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;"><h2 style="color:#10b981; font-size:26px; font-weight:900; margin-bottom:12px;">✅ 저장 완료!</h2><p style="color:#64748b; font-size:16px; margin-bottom:20px;">구글 시트에 성공적으로 저장되었습니다.</p><button onclick="this.parentElement.parentElement.remove(); window.open(\\'${sheetUrl}\\', \\'_blank\\');" style="padding:10px 24px; background:#10b981; color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-size:15px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">시트 열기</button></div>';
                        }
                    `);
                } catch (err) {
                    console.error(err);
                    webviewRef.current.executeJavaScript(`
                        const loader = document.getElementById('ir-sheet-loader');
                        if (loader) {
                            loader.innerHTML = '<div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;"><h2 style="color:#ef4444; font-size:26px; font-weight:900; margin-bottom:12px;">❌ 오류 발생</h2><p style="color:#64748b; font-size:16px; max-width:80%; text-align:center;">' + \\\`${err.message}\\\` + '</p><button onclick="this.parentElement.parentElement.remove();" style="margin-top:20px; padding:8px 16px; background:#ef4444; color:white; border:none; border-radius:6px; font-weight:700; cursor:pointer;">닫기</button></div>';
                        }
                    `);
                }
            }
        };
        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('console-message', handleConsoleMessage);
        
        return () => {
            webview.removeEventListener('dom-ready', handleDomReady);
            webview.removeEventListener('console-message', handleConsoleMessage);
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
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            />
        </div>
    );
}
