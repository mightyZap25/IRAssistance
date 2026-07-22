import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { db } from '../database';
import { collection, query, where, onSnapshot } from '../database';
import { useAuth } from '../contexts/AuthContext';
import {
    LayoutDashboard, Package, Layers, Settings, History,
    Users, ClipboardList, ShoppingCart, Truck, Factory,
    FileCheck, BookOpen, AlertCircle, Building2,
    PlayCircle, ChevronDown, UserCheck, Briefcase,
    ListTodo, CalendarDays, Cloud, Mail, Activity,
    TrendingUp, FileText, CreditCard, StickyNote, MessageSquare, Microscope,
    DollarSign, BarChart2, Wrench, HeadphonesIcon, Globe, Cpu,
    ClipboardCheck, Clock, Receipt, Contact, Boxes, FlaskConical,
    LogOut, User, ChevronLeft, ChevronRight, Sparkles, Sun, Moon, NotebookPen, Bot, RefreshCw, KeyRound
} from 'lucide-react';

const ROLE_MENU_MAP = {
    admin: ['/', '/settings', '/parts', '/bom', '/customers', '/prod-requests', '/prod-execution', '/purchasing', '/outsourcing', '/inventory', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/manufacturers', '/vendors', '/eco', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/apps', '/odoo/view', '/plm', '/approval'],
    engineer: ['/', '/parts', '/bom', '/eco', '/inventory', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/view', '/plm', '/approval'],
    sales: ['/', '/customers', '/prod-requests', '/inventory', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/view'],
    qa: ['/', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/inventory', '/transactions', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/view'],
    production: ['/', '/prod-execution', '/prod-requests', '/inventory', '/purchasing', '/outsourcing', '/transactions', '/vendors', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/view'],
    manager: ['/', '/customers', '/prod-requests', '/purchasing', '/outsourcing', '/inventory', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/manufacturers', '/vendors', '/eco', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/view', '/plm', '/approval'],
    viewer: ['/', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/workspace/notebooklm', '/workspace/gemini', '/workspace/agent', '/workspace/notes', '/odoo/view'],
    field_viewer: ['/', '/odoo/view'],
};

export default function Sidebar({ isCollapsed, toggleSidebar }) {
    const { currentUser, userProfile, logout, isOdooOnlyAuth, odooLinked, linkOdoo } = useAuth();
    const location = useLocation();
    const [pendingEcnCount, setPendingEcnCount] = useState(0);
    const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
    const [odooMenus, setOdooMenus] = useState([]);
    const [appVersion, setAppVersion] = useState('0.9.2');
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [tooltip, setTooltip] = useState(null); // { label, y }
    const [collapsedSections, setCollapsedSections] = useState(() => {
        try { return JSON.parse(localStorage.getItem('sidebar_sections') || '{}'); } catch { return {}; }
    });
    const [darkMode, setDarkMode] = useState(() => {
        return localStorage.getItem('theme') === 'dark';
    });
    const [showAiMenu, setShowAiMenu] = useState(() => {
        return localStorage.getItem('sidebar_show_ai_menu') === 'true'; // 기본값 false로 변경 (사용자 요청에 의해 비활성화)
    });

    const [showOdooPrompt, setShowOdooPrompt] = useState(false);
    const [odooPromptPwd, setOdooPromptPwd] = useState('');
    const [isOdooPromptLoading, setIsOdooPromptLoading] = useState(false);

    const handleOdooLink = () => {
        setOdooPromptPwd('');
        setShowOdooPrompt(true);
    };

    const submitOdooLink = async (e) => {
        if (e) e.preventDefault();
        if (!odooPromptPwd) return;
        setIsOdooPromptLoading(true);
        try {
            await linkOdoo(odooPromptPwd);
            alert("Odoo 자동 로그인 설정 완료!");
            window.location.reload();
        } catch (e) {
            alert("Odoo 로그인 실패: " + e.message);
        } finally {
            setIsOdooPromptLoading(false);
            setShowOdooPrompt(false);
        }
    };


    // 설정 페이지에서 localStorage 변경 시 즉시 반영
    useEffect(() => {
        const handleStorageChange = () => {
            setShowAiMenu(localStorage.getItem('sidebar_show_ai_menu') === 'true');
        };
        window.addEventListener('storage', handleStorageChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    // Odoo 로그인 정보가 없을 때 띄우는 이벤트 수신
    useEffect(() => {
        const handleRequireOdooLogin = () => {
            // 한 번 더 체크해서 정말 없는 경우에만 띄움
            if (!localStorage.getItem('odoo_password')) {
                handleOdooLink();
            }
        };
        window.addEventListener('require-odoo-login', handleRequireOdooLogin);
        return () => window.removeEventListener('require-odoo-login', handleRequireOdooLogin);
    }, []);

    useEffect(() => {
        const theme = darkMode ? 'dark' : 'light';
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        if (window.electronAPI?.setTheme) {
            window.electronAPI.setTheme(theme);
        }
    }, [darkMode]);

    useEffect(() => {
        // Odoo 전용 로그인 시 Firebase 구독 불필요 (Google 인증 없음)
        if (!currentUser || isOdooOnlyAuth) return;

        const qEcn = query(collection(db, 'ecns'), where('Status', '==', 'Pending'));
        const unsubEcn = onSnapshot(qEcn, (snap) => setPendingEcnCount(snap.docs.length));

        const counts = { leave: 0, flex: 0 };
        const unsubLeave = onSnapshot(query(collection(db, 'leave_requests'), where('Status', '==', 'Pending')), (snap) => {
            counts.leave = snap.docs.filter(d => d.data().ApprovalSteps?.[d.data().CurrentStep || 0]?.approverUid === currentUser.uid).length;
            setPendingApprovalCount(counts.leave + counts.flex);
        });
        const unsubFlex = onSnapshot(query(collection(db, 'flex_requests'), where('Status', '==', 'Pending')), (snap) => {
            counts.flex = snap.docs.filter(d => d.data().ApprovalSteps?.[d.data().CurrentStep || 0]?.approverUid === currentUser.uid).length;
            setPendingApprovalCount(counts.leave + counts.flex);
        });

        return () => { unsubEcn(); unsubLeave(); unsubFlex(); };
    }, [currentUser, isOdooOnlyAuth]);

    useEffect(() => {
        const handleOdooMenus = (e) => {
            setOdooMenus(e.detail);
        };
        window.addEventListener('odoo-menus-loaded', handleOdooMenus);

        if (window.electronAPI?.getAppVersion) {
            window.electronAPI.getAppVersion().then(setAppVersion).catch(() => { });
        }

        return () => window.removeEventListener('odoo-menus-loaded', handleOdooMenus);
    }, []);

    const role = userProfile?.role || 'viewer';
    const allowedPaths = ROLE_MENU_MAP[role] || ROLE_MENU_MAP.viewer;
    const isAllowed = (item) => {
        const path = item.path;
        if (item.isExternal) return true;
        if (path === '/settings' || path === '/odoo/login' || path === '/odoo/logout') return true;

        if (path.startsWith('/odoo/')) {
            // 특정 Odoo 메뉴들은 React 앱의 네이티브 권한 경로와 매핑하여 표시 여부 결정
            if (item.name === '판매' || item.name === 'Sales') return allowedPaths.includes('/sales/dashboard');
            if (item.name === '청구서' || item.name === 'Invoicing') return allowedPaths.includes('/sales/billing');
            if (item.name === '구매 & 외주' || item.name === 'Purchase') return allowedPaths.includes('/purchasing');
            if (item.name === '제조관리' || item.name === 'Manufacturing') return allowedPaths.includes('/prod-execution');
            if (item.name === '도면 & BOM & ECO' || item.name === 'PLM') return allowedPaths.includes('/plm');

            // 동적 메뉴 권한을 가진 사용자에게 모두 허용
            return allowedPaths.includes('/odoo/view');
        }
        return allowedPaths.includes(path);
    };

    const filterGroups = (groups) => groups
        .map(group => ({ ...group, items: group.items.filter(item => isAllowed(item)) }))
        .filter(group => group.items.length > 0);

    const checkActive = (path) => {
        const currentPath = location.pathname + location.search;
        if (path === '/') {
            return location.pathname === '/';
        }
        if (path.startsWith('/odoo/view')) {
            return currentPath === path || currentPath.startsWith(path + '&');
        }
        return currentPath.startsWith(path);
    };

    const COLLAB_MENU_GROUPS = [
        {
            title: '구글 워크스페이스',
            items: [
                { name: 'Gmail', path: '/workspace/mail', icon: Mail },
                { name: 'Google Drive', path: '/workspace/drive', icon: Cloud },
                { name: 'Google Gemini', path: '/workspace/gemini', icon: Sparkles },
                { name: 'Google Calendar', path: '/workspace/calendar', icon: CalendarDays },
                { name: 'Google Chat', path: '/workspace/chat', icon: MessageSquare },
                { name: 'NotebookLM', path: '/workspace/notebooklm', icon: BookOpen },
                { name: '노트', path: '/workspace/notes', icon: NotebookPen }
            ]
        }
    ];

    const ADMIN_GROUPS = [
        {
            title: '시스템 제어',
            items: [
                { name: '환경설정(Admin)', path: '/settings', icon: Settings }
            ]
        }
    ];

    // Odoo 영문 메뉴명 → 한글 변환 맵
    const ODOO_NAME_MAP = {
        'Sales': '판매',
        'Purchase': '매입',
        'Inventory': '재고',
        'Manufacturing': '제조관리',
        'Quality': '품질',
        'PLM': 'ECO',
        'Invoicing': '청구서',
        'Attendances': '근태',
        'Time Off': '휴가',
        'Employees': '인사',
        'Projects': '프로젝트',
        'Maintenance': '설비 보전',
        'IoT': 'IoT 기기',
        'Helpdesk': '고객 서비스',
        'Repairs': '수리',
        'CRM': 'CRM',
        'Expenses': '경비처리',
        'To-Do': '할일관리'
    };

    const ODOO_CATEGORY_MAP = {
        'Sales': '영업',
        'CRM': '영업',
        'Purchase': '생산 관리',
        'Inventory': '생산 관리',
        'Helpdesk': '생산 관리',
        'Maintenance': '생산 관리',
        'Manufacturing': '생산 관리',
        'Quality': '제조 품질',
        'PLM': '제조 품질',
        'IoT': '제조 품질',
        'Repairs': '제조 품질',
        'Invoicing': '영업',
        'Attendances': '근태관리',
        'Time Off': '근태관리',
        'Employees': '근태관리',
        '근태/휴가 대시보드': '근태관리',
        'Projects': '협업 & 기타',
        'Expenses': '협업 & 기타',
        'To-Do': '협업 & 기타'
    };

    // Odoo 메뉴별 어울리는 Lucide 아이콘 매핑
    const ODOO_ICON_MAP = {
        'Sales': TrendingUp,
        'CRM': Briefcase,
        'Purchase': ShoppingCart,
        'Inventory': Package,
        'Manufacturing': Factory,
        'Quality': FileCheck,
        'PLM': Layers,
        'Invoicing': CreditCard,
        'Attendances': UserCheck,
        'Time Off': CalendarDays,
        'Employees': Users,
        '근태/휴가 대시보드': LayoutDashboard,
        'Projects': ClipboardList,
        'Maintenance': Wrench,
        'IoT': Cpu,
        'Helpdesk': HeadphonesIcon,
        'Repairs': Wrench,
        'Expenses': Receipt,
        'To-Do': ListTodo
    };

    // UI에 보여줄 카테고리 순서 정의
    const ODOO_CATEGORY_ORDER = [
        '영업',
        '생산 관리',
        '제조 품질',
        '근태관리',
        '협업 & 기타',
        'Project 관리',
        '매뉴얼'
    ];

    const GROUP_COLOR_MAP = {
        '영업': 'text-indigo-500',
        '생산 관리': 'text-emerald-600',
        '제조 품질': 'text-amber-600',
        '근태관리': 'text-sky-600',
        '협업 & 기타': 'text-purple-500',
        'Project 관리': 'text-slate-500',
        '매뉴얼': 'text-blue-500',
        '구글 워크스페이스': 'text-blue-500',
        '시스템 제어': 'text-slate-500'
    };

    const ODOO_HIDDEN_MENUS = new Set([
        'Discuss', 'Calendar', 'Contacts', 'Dashboards', 'App Store', 'Settings', 'Apps', 'Tests', 'Link Tracker', 'Attendances', 'Time Off', '근태', '휴가'
    ]);

    const getOdooDynamicGroups = () => {
        const groupsMap = {};

        // Odoo 17 직접 라우팅 주소 키워드 매핑 (어떤 이름으로 들어오든 포괄적으로 잡아냄)
        const ODOO_17_ROUTES = [
            { keywords: ['할일', '할 일', 'to-do'], path: '/odoo/to-do' },
            { keywords: ['전자결재'], path: '/odoo/action-707' },
            // { keywords: ['대시보드', '현황판'], path: '/odoo/dashboards?dashboard_id=3' },
            { keywords: ['판매', 'sales'], path: '/odoo/sales' },
            { keywords: ['청구', 'invoicing'], path: '/odoo/customer-invoices' },
            { keywords: ['프로젝트', 'project'], path: '/odoo/project' },
            { keywords: ['매입', '구매', 'purchase'], path: '/odoo/purchase' },
            { keywords: ['재고', 'inventory'], path: '/odoo/inventory' },
            { keywords: ['제조', 'manufacturing'], path: '/odoo/manufacturing' },
            { keywords: ['수리', 'repairs'], path: '/odoo/repairs' },
            { keywords: ['인사', '임직원', 'employees'], path: '/odoo/employees' },
            { keywords: ['경비', '경비처리', 'expenses'], path: '/odoo/expenses' },
            { keywords: ['근태/휴가', 'time off', 'attendances'], path: '/odoo/action-724' }
        ];

        const CUSTOM_APPS = [
            { cat: '시스템 제어', name: 'Odoo 로그인', path: '/odoo/login', icon: UserCheck },
            { cat: '시스템 제어', name: 'Odoo 로그아웃', path: '/odoo/logout', icon: LogOut },
            { cat: '매뉴얼', name: 'ERP MANUAL', path: 'https://www.odoo.com/documentation/19.0/ko/index.html', icon: BookOpen, isExternal: true }
        ];

        CUSTOM_APPS.forEach(app => {
            if (!groupsMap[app.cat]) groupsMap[app.cat] = [];
            groupsMap[app.cat].push({
                name: app.name,
                path: app.path,
                icon: app.icon,
                isExternal: app.isExternal
            });
        });

        if (odooMenus && odooMenus.length > 0) {
            odooMenus
                .forEach(app => {
                    const cleanName = app.name.replace(/\s*\(custom\)\s*/i, '').trim();
                    if (ODOO_HIDDEN_MENUS.has(cleanName) || ODOO_HIDDEN_MENUS.has(app.name)) return;

                    const cat = ODOO_CATEGORY_MAP[cleanName] || ODOO_CATEGORY_MAP[app.name] || 'Project 관리';
                    if (!groupsMap[cat]) {
                        groupsMap[cat] = [];
                    }

                    const mappedName = ODOO_NAME_MAP[cleanName] || ODOO_NAME_MAP[app.name] || cleanName;

                    let targetPath = `/odoo/view?menu_id=${app.menu_id}`;
                    const lowercaseName = mappedName.toLowerCase();
                    const lowercaseOriginal = app.name.toLowerCase();

                    for (const route of ODOO_17_ROUTES) {
                        if (route.keywords.some(kw => lowercaseName.includes(kw) || lowercaseOriginal.includes(kw))) {
                            targetPath = route.path;
                            break;
                        }
                    }

                    groupsMap[cat].push({
                        name: mappedName,
                        path: targetPath,
                        icon: ODOO_ICON_MAP[cleanName] || ODOO_ICON_MAP[app.name] || Package
                    });
                });
        }

        // 정렬: 근태관리 내의 순서를 고정
        const SORT_ORDER = {
            '근태/휴가 대시보드': 1,
            '근태': 2,
            '휴가': 3,
            '인사': 4,
            '전자결재': 10,
            '프로젝트': 11,
            'ERP MANUAL': 12,
        };
        Object.keys(groupsMap).forEach(cat => {
            groupsMap[cat].sort((a, b) => {
                const orderA = SORT_ORDER[a.name] || 99;
                const orderB = SORT_ORDER[b.name] || 99;
                return orderA - orderB;
            });
        });

        return ODOO_CATEGORY_ORDER
            .filter(cat => groupsMap[cat] && groupsMap[cat].length > 0)
            .map(cat => ({
                title: cat,
                items: groupsMap[cat]
            }));
    };

    const ODOO_DYNAMIC_GROUPS = getOdooDynamicGroups();

    const fOdoo = filterGroups(ODOO_DYNAMIC_GROUPS);
    const fCollab = isOdooOnlyAuth ? [] : filterGroups(COLLAB_MENU_GROUPS);
    const fAdmin = (isOdooOnlyAuth || currentUser?.email !== 'jogak@mightyzap.com') ? [] : filterGroups(ADMIN_GROUPS);

    const roleInfo = {
        admin: { label: '최고관리자', color: 'bg-rose-500' },
        engineer: { label: '개발', color: 'bg-blue-500' },
        sales: { label: '영업', color: 'bg-amber-500' },
        qa: { label: 'QA', color: 'bg-purple-500' },
        production: { label: '생산', color: 'bg-emerald-500' },
        manager: { label: '관리', color: 'bg-indigo-500' },
        viewer: { label: '뷰어', color: 'bg-slate-400' },
        field_viewer: { label: '현장직', color: 'bg-emerald-600' }
    }[role] || { label: '뷰어', color: 'bg-slate-400' };

    return (
        <aside className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 no-print`}>
            {/* Fixed tooltip rendered outside overflow containers */}
            {isCollapsed && tooltip && (
                <div
                    className="fixed z-[200] pointer-events-none"
                    style={{ left: 68, top: tooltip.y - 14 }}
                >
                    <div className="flex items-center gap-0">
                        <span className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[6px] border-r-slate-800 dark:border-r-slate-600" />
                        <span className="px-2.5 py-1.5 bg-slate-800 dark:bg-slate-600 text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap">
                            {tooltip.label}
                        </span>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className={`h-16 flex items-center border-b border-slate-100 dark:border-slate-800 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between px-6'}`}>
                {!isCollapsed ? (
                    <>
                        <div className="font-black text-xl text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2 animate-fade-in">
                            <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">IR</span>
                            <span>I-Link</span>
                        </div>
                        <button
                            onClick={toggleSidebar}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 animate-fade-in"
                            title="메뉴 접기"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={toggleSidebar}
                        className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 hover:scale-105"
                        title="메뉴 펼치기"
                    >
                        <ChevronRight size={18} />
                    </button>
                )}
            </div>

            {/* Profile Card */}
            <div className={`relative ${isCollapsed ? 'mx-2 mt-3 flex flex-col items-center gap-2' : 'mx-3 mt-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl flex flex-col gap-2.5'}`}>
                {isCollapsed ? (
                    <>
                        <button
                            onClick={() => setProfileMenuOpen(v => !v)}
                            className={`w-9 h-9 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-150 shadow-sm hover:scale-105 transition-all relative ${profileMenuOpen ? 'ring-2 ring-blue-500' : ''}`}
                            title="계정 정보"
                        >
                            {currentUser?.photoURL ? (
                                <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-200 dark:bg-slate-800">
                                    <User size={16} />
                                </div>
                            )}
                        </button>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('toggle-floating-memo'))}
                            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-500 rounded-lg transition-all active:scale-95 shadow-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                            title="개인 메모장"
                        >
                            <StickyNote size={15} />
                        </button>
                    </>
                ) : (
                    <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                            {/* Profile Image */}
                            <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-150 shrink-0">
                                {currentUser?.photoURL ? (
                                    <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-200 dark:bg-slate-800">
                                        <User size={16} />
                                    </div>
                                )}
                            </div>
                            {/* User Details */}
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 truncate">
                                    {userProfile?.displayName || currentUser?.displayName || '사용자'}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-[120px] font-semibold">
                                        {userProfile?.department || '부서 미지정'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons: Memo and Gear Icon */}
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('toggle-floating-memo'))}
                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-500 rounded-lg transition-colors"
                                title="개인 메모장"
                            >
                                <StickyNote size={14} />
                            </button>
                            <button
                                onClick={() => setProfileMenuOpen(v => !v)}
                                className={`p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-655 dark:hover:text-slate-350 transition-colors ${profileMenuOpen ? 'bg-slate-200 dark:bg-slate-800 text-slate-655 dark:text-slate-200' : ''}`}
                                title="계정 설정"
                            >
                                <Settings size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Dropdown Popover */}
                {profileMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-45" onClick={() => setProfileMenuOpen(false)} />
                        <div className={`absolute border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.15)] z-50 p-3 flex flex-col gap-2.5 text-left bg-white/95 dark:bg-slate-950/95 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150 ${isCollapsed ? 'left-12 top-0 w-56' : 'left-0 right-0 top-full mt-2'}`}>
                            <div className="px-1 py-0.5">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">통합 로그인 상태</p>
                            </div>

                            {!isOdooOnlyAuth && (
                                <div className="flex flex-col gap-1.5 p-2 bg-slate-50/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/60 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-3.5 h-3.5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center font-black text-[8px]">G</span>
                                            <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">Google Workspace</span>
                                        </div>
                                        <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400">로그인됨</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1.5">
                                        <p className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold truncate flex-1" title={currentUser?.email}>
                                            {currentUser?.email}
                                        </p>
                                        <button
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                logout();
                                            }}
                                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 transition-colors active:scale-90"
                                            title="구글 계정 바꾸기"
                                        >
                                            <LogOut size={10} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5 p-2 bg-slate-50/70 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800/60 rounded-xl">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-650 dark:text-emerald-400 flex items-center justify-center font-black text-[8px]">O</span>
                                        <span className="text-slate-800 dark:text-slate-200 font-black text-[9px]">Odoo ERP</span>
                                    </div>
                                    <button
                                        className={`text-[8px] font-black px-1.5 py-0.5 rounded transition-colors ${odooLinked ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'}`}
                                        onClick={async () => {
                                            setProfileMenuOpen(false);
                                            if (odooLinked) {
                                                if (isOdooOnlyAuth) {
                                                    logout();
                                                } else {
                                                    localStorage.removeItem('odoo_password');
                                                    window.dispatchEvent(new CustomEvent('clear-odoo-session'));
                                                    if (window.electronAPI && window.electronAPI.clearOdooCookies) {
                                                        await window.electronAPI.clearOdooCookies();
                                                    } else {
                                                        await new Promise(r => setTimeout(r, 500));
                                                    }
                                                    window.location.reload();
                                                }
                                            } else {
                                                handleOdooLink();
                                            }
                                        }}
                                    >
                                        {odooLinked ? '로그아웃' : '로그인'}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between gap-1.5">
                                    <p className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold truncate flex-1" title={currentUser?.email}>
                                        {currentUser?.email}
                                    </p>
                                    {odooLinked ? (
                                        <button
                                            onClick={async () => {
                                                setProfileMenuOpen(false);
                                                if (isOdooOnlyAuth) {
                                                    logout();
                                                } else {
                                                    localStorage.removeItem('odoo_password');
                                                    window.dispatchEvent(new CustomEvent('clear-odoo-session'));
                                                    if (window.electronAPI && window.electronAPI.clearOdooCookies) {
                                                        await window.electronAPI.clearOdooCookies();
                                                    } else {
                                                        await new Promise(r => setTimeout(r, 500));
                                                    }
                                                    window.location.reload();
                                                }
                                            }}
                                            className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 transition-colors active:scale-90"
                                            title="Odoo 로그아웃"
                                        >
                                            <LogOut size={10} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                handleOdooLink();
                                            }}
                                            className="px-2 py-1 text-[9px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-all active:scale-95 shadow-sm"
                                        >
                                            로그인
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Navigation Menus */}
            <nav className={`flex-1 overflow-y-auto py-3 space-y-5 custom-scrollbar ${isCollapsed ? 'px-2 flex flex-col items-center' : 'px-3'}`}>
                {[
                    { g: fOdoo, t: 'odoo', label: 'Odoo ERP' },
                    { g: fCollab, t: '구글 워크스페이스', label: '구글 워크스페이스' },
                    { g: fAdmin, t: '시스템 관리', label: '시스템 관리' }
                ].map(sec => sec.g.length > 0 && (
                    <div key={sec.t} className={`w-full ${isCollapsed ? 'space-y-3 flex flex-col items-center' : 'space-y-2'}`}>
                        {!isCollapsed ? (
                            <button
                                className="w-full flex items-center justify-between px-3 py-0.5 group"
                                onClick={() => {
                                    const next = { ...collapsedSections, [sec.t]: !collapsedSections[sec.t] };
                                    setCollapsedSections(next);
                                    localStorage.setItem('sidebar_sections', JSON.stringify(next));
                                }}
                            >
                                <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 tracking-wider group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">{sec.label}</span>
                                <ChevronDown
                                    size={11}
                                    className={`text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-all duration-200 ${collapsedSections[sec.t] ? '-rotate-90' : ''}`}
                                />
                            </button>
                        ) : (
                            <div className="w-8 h-px bg-slate-100 dark:bg-slate-800 my-1" />
                        )}

                        {/* Section items - hidden when collapsed section */}
                        {!collapsedSections[sec.t] && (
                            <div className={isCollapsed ? 'w-full flex flex-col items-center gap-1.5' : 'space-y-1 pl-2 border-l border-slate-100 dark:border-slate-800 ml-2'}>
                                {sec.g.map((group, idx) => (
                                    <div key={idx} className={`w-full ${isCollapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'}`}>
                                        {!isCollapsed && (
                                            <div className={`text-[9px] uppercase font-extrabold px-3 ${GROUP_COLOR_MAP[group.title] || 'text-slate-400 dark:text-slate-500'}`}>
                                                {group.title}
                                            </div>
                                        )}
                                        {group.items.map(item => {
                                            const activeClass = isCollapsed
                                                ? `flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 relative bg-sky-50 dark:bg-sky-955/40 text-sky-700 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50`
                                                : `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group bg-sky-50 dark:bg-sky-955/40 text-sky-700 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50 font-bold`;
                                            const inactiveClass = isCollapsed
                                                ? `flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 relative hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400`
                                                : `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 font-medium`;

                                            const getClassName = (isActive) => isActive ? activeClass : inactiveClass;

                                            const onMouseEnter = isCollapsed ? (e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setTooltip({ label: item.name, y: rect.top + rect.height / 2 });
                                            } : undefined;
                                            const onMouseLeave = isCollapsed ? () => setTooltip(null) : undefined;

                                            const handleClick = async (e) => {
                                                if (item.path === '/odoo/logout') {
                                                    e.preventDefault();
                                                    if (isOdooOnlyAuth) {
                                                        logout();
                                                    } else {
                                                        localStorage.removeItem('odoo_password');
                                                        window.dispatchEvent(new CustomEvent('clear-odoo-session'));
                                                        if (window.electronAPI && window.electronAPI.clearOdooCookies) {
                                                            await window.electronAPI.clearOdooCookies();
                                                        } else {
                                                            // fallback for non-electron environment
                                                            await new Promise(r => setTimeout(r, 500));
                                                        }
                                                        window.location.reload();
                                                    }
                                                } else if (item.path === '/odoo/login') {
                                                    e.preventDefault();
                                                    handleOdooLink();
                                                }
                                            };

                                            const content = (
                                                <>
                                                    <item.icon size={16} />
                                                    {!isCollapsed && <span className="text-xs flex-1">{item.name}</span>}
                                                    {item.badge && (
                                                        isCollapsed ? (
                                                            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                                                                {item.badge}
                                                            </span>
                                                        ) : (
                                                            <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                                                {item.badge}
                                                            </span>
                                                        )
                                                    )}
                                                </>
                                            );

                                            return item.isExternal ? (
                                                <a
                                                    key={item.path}
                                                    href={item.path}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={inactiveClass}
                                                    onMouseEnter={onMouseEnter}
                                                    onMouseLeave={onMouseLeave}
                                                >
                                                    {content}
                                                </a>
                                            ) : (
                                                <NavLink
                                                    key={item.path}
                                                    to={item.path}
                                                    replace={true}
                                                    className={({ isActive }) => getClassName(checkActive(item.path))}
                                                    onMouseEnter={onMouseEnter}
                                                    onMouseLeave={onMouseLeave}
                                                    onClick={handleClick}
                                                >
                                                    {content}
                                                </NavLink>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>

            {/* Sidebar Utility Bottom */}
            {isCollapsed ? (
                <div className="py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0 flex flex-col items-center">
                    <button
                        onClick={() => setDarkMode(prev => !prev)}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 rounded-lg transition-colors"
                        title={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
                    >
                        {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                    </button>
                    <button
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('manual-update-check'));
                        }}
                        className="p-1.5 mt-1 hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 rounded-lg transition-colors"
                        title="업데이트 확인"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <span className="text-[8px] font-bold text-slate-400 dark:text-slate-655 select-none transform scale-90 origin-center mt-1">v{appVersion}</span>
                </div>
            ) : (
                <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0 flex items-center justify-between">
                    {/* Crescent moon toggle to the left of the version */}
                    <button
                        onClick={() => setDarkMode(prev => !prev)}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        title={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
                    >
                        {darkMode ? <Sun size={15} /> : <Moon size={15} />}
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {darkMode ? "라이트 모드" : "다크 모드"}
                        </span>
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('manual-update-check'));
                            }}
                            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-indigo-650 dark:hover:text-indigo-400 rounded-lg transition-colors flex items-center justify-center"
                            title="업데이트 확인"
                        >
                            <RefreshCw size={13} />
                        </button>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600">v{appVersion}</span>
                    </div>
                </div>
            )}
            {/* Odoo Password Prompt Modal */}
            {showOdooPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in px-4">
                    <form onSubmit={submitOdooLink} className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-800 animate-slide-up">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                <KeyRound size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-slate-200">Odoo 계정 연동</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">자동 로그인을 위해 비밀번호를 입력해주세요</p>
                            </div>
                        </div>

                        <div className="mb-5">
                            <input
                                type="password"
                                value={odooPromptPwd}
                                onChange={(e) => setOdooPromptPwd(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Odoo 비밀번호"
                                autoFocus
                                required
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowOdooPrompt(false)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={isOdooPromptLoading}
                                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isOdooPromptLoading ? '확인 중...' : '확인'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </aside>
    );
}
