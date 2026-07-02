import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    LayoutDashboard, Package, Layers, Settings, History,
    Users, ClipboardList, ShoppingCart, Truck, Factory,
    FileCheck, BookOpen, AlertCircle, Building2,
    PlayCircle, ChevronDown, UserCheck, Briefcase, 
    ListTodo, CalendarDays, Cloud, Mail, Activity,
    TrendingUp, FileText, CreditCard, StickyNote, MessageSquare, Microscope,
    DollarSign, BarChart2, Wrench, HeadphonesIcon, Globe, Cpu,
    ClipboardCheck, Clock, Receipt, Contact, Boxes, FlaskConical
} from 'lucide-react';

const ROLE_MENU_MAP = {
    admin: ['/', '/settings', '/parts', '/bom', '/customers', '/prod-requests', '/prod-execution', '/purchasing', '/outsourcing', '/inventory', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/manufacturers', '/vendors', '/eco', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/apps', '/odoo/view'],
    engineer: ['/', '/parts', '/bom', '/eco', '/inventory', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/view'],
    sales: ['/', '/customers', '/prod-requests', '/inventory', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/view'],
    qa: ['/', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/inventory', '/transactions', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/view'],
    production: ['/', '/prod-execution', '/prod-requests', '/inventory', '/purchasing', '/outsourcing', '/transactions', '/vendors', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/view'],
    manager: ['/', '/customers', '/prod-requests', '/purchasing', '/outsourcing', '/inventory', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/manufacturers', '/vendors', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/view'],
    viewer: ['/', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/drive', '/workspace/mail', '/workspace/memo', '/workspace/chat', '/odoo/view'],
};

export default function Sidebar() {
    const { currentUser, userProfile } = useAuth();
    const [pendingEcnCount, setPendingEcnCount] = useState(0);
    const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
    const [odooMenus, setOdooMenus] = useState([]);

    useEffect(() => {
        if (!currentUser) return;

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
    }, [currentUser]);

    useEffect(() => {
        const handleOdooMenus = (e) => {
            setOdooMenus(e.detail);
        };
        window.addEventListener('odoo-menus-loaded', handleOdooMenus);
        return () => window.removeEventListener('odoo-menus-loaded', handleOdooMenus);
    }, []);

    const role = userProfile?.role || 'viewer';
    const allowedPaths = ROLE_MENU_MAP[role] || ROLE_MENU_MAP.viewer;
    const isAllowed = (path) => {
        if (path.startsWith('/odoo/view')) {
            return allowedPaths.includes('/odoo/view');
        }
        return allowedPaths.includes(path);
    };

    const filterGroups = (groups) => groups
        .map(group => ({ ...group, items: group.items.filter(item => isAllowed(item.path)) }))
        .filter(group => group.items.length > 0);



    const COLLAB_MENU_GROUPS = [
        {
            title: '협업 & 공통 오피스',
            items: [
                { name: '근태 관리', path: '/hr/attendance', icon: UserCheck, badge: pendingApprovalCount > 0 ? pendingApprovalCount : null },
                { name: '통합 메일', path: '/workspace/mail', icon: Mail },
                { name: 'Google Drive', path: '/workspace/drive', icon: Cloud },
                { name: 'Google Chat', path: '/workspace/chat', icon: MessageSquare }
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
        'Sales': '영업',
        'Purchase': '구매',
        'Inventory': '재고 관리',
        'Manufacturing': '제조',
        'Accounting': '회계',
        'Invoicing': '청구서',
        'Project': '프로젝트',
        'Employees': '직원 관리',
        'Attendances': '근태 관리',
        'Time Off': '휴가 관리',
        'Payroll': '급여',
        'Expenses': '경비',
        'Helpdesk': '헬프데스크',
        'Website': '웹사이트',
        'eCommerce': '전자상거래',
        'CRM': 'CRM (고객관리)',
        'Discuss': '메신저',
        'Contacts': '연락처',
        'Technical': '기술설정',
        'Settings': '설정',
        'Apps': '앱 센터',
        'Email Marketing': '이메일 마케팅',
        'Field Service': '현장 서비스',
        'IoT': 'IoT',
        'Maintenance': '설비 관리',
        'Quality': '품질 관리',
        'Repairs': '수리',
        'Sign': '전자서명',
        'Timesheets': '근무시간',
        'Rental': '렌탈',
        'Lunch': '식사 관리',
        'Events': '이벤트',
        'Surveys': '설문조사',
        'Live Chat': '실시간 채팅',
        'Documents': '문서 관리',
        'Consolidation': '연결 회계',
    };

    // Odoo 메뉴명 → 아이콘 맵
    const ODOO_ICON_MAP = {
        'Sales': TrendingUp,
        'Purchase': ShoppingCart,
        'Inventory': Boxes,
        'Manufacturing': Factory,
        'Accounting': DollarSign,
        'Invoicing': Receipt,
        'Project': Briefcase,
        'Employees': Users,
        'Attendances': UserCheck,
        'Time Off': CalendarDays,
        'Payroll': CreditCard,
        'Expenses': FileText,
        'Helpdesk': HeadphonesIcon,
        'Website': Globe,
        'eCommerce': ShoppingCart,
        'CRM': Building2,
        'Discuss': MessageSquare,
        'Contacts': Contact,
        'Technical': Cpu,
        'Settings': Settings,
        'Apps': Package,
        'Email Marketing': Mail,
        'Field Service': Truck,
        'IoT': Cpu,
        'Maintenance': Wrench,
        'Quality': ClipboardCheck,
        'Repairs': Wrench,
        'Sign': FileCheck,
        'Timesheets': Clock,
        'Rental': FileText,
        'Lunch': StickyNote,
        'Events': CalendarDays,
        'Surveys': ClipboardList,
        'Live Chat': MessageSquare,
        'Documents': BookOpen,
        'Consolidation': BarChart2,
    };

    // 사이드바에서 숨길 Odoo 메뉴 목록
    const ODOO_HIDDEN_MENUS = new Set([
        'Tests', 'Link Tracker',
    ]);

    const ODOO_DYNAMIC_GROUPS = odooMenus.length > 0 ? [
        {
            title: 'Odoo 서비스',
            items: odooMenus
                .filter(app => !ODOO_HIDDEN_MENUS.has(app.name))
                .map(app => ({
                    name: ODOO_NAME_MAP[app.name] || app.name,
                    path: `/odoo/view?menu_id=${app.menu_id}`,
                    icon: ODOO_ICON_MAP[app.name] || Package
                }))
        }
    ] : [];

    const fOdoo = filterGroups(ODOO_DYNAMIC_GROUPS);
    const fCollab = filterGroups(COLLAB_MENU_GROUPS);
    const fAdmin = filterGroups(ADMIN_GROUPS);

    const roleInfo = {
        admin: { label: '최고관리자', color: 'bg-rose-500' },
        engineer: { label: '개발', color: 'bg-blue-500' },
        sales: { label: '영업', color: 'bg-amber-500' },
        qa: { label: 'QA', color: 'bg-purple-500' },
        production: { label: '생산', color: 'bg-emerald-500' },
        manager: { label: '관리', color: 'bg-indigo-500' },
        viewer: { label: '뷰어', color: 'bg-slate-400' }
    }[role] || { label: '뷰어', color: 'bg-slate-400' };

    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 no-print">
            <div className="h-16 flex items-center px-6 border-b border-slate-100 shrink-0">
                <div className="font-black text-xl text-slate-800 tracking-tight flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">IR</span>
                    <span>IR Assistant</span>
                </div>
            </div>

            <div className="mx-3 mt-3 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${roleInfo.color} shrink-0`}/>
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">현재 권한</p>
                    <p className="text-xs font-black text-slate-700 truncate">{roleInfo.label}</p>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5 custom-scrollbar">
                {isAllowed('/') && (
                    <NavLink to="/" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive ? 'bg-sky-50 text-sky-700 border border-sky-100 font-bold' : 'hover:bg-slate-50 text-slate-600 font-bold'}`}>
                        <LayoutDashboard size={18} /> <span className="text-sm">통합 현황판</span>
                    </NavLink>
                )}

                {[
                    { g: fOdoo, t: 'odoo' },
                    { g: fCollab, t: '협업 오피스' },
                    { g: fAdmin, t: '시스템 관리' }
                ].map(sec => sec.g.length > 0 && (
                    <div key={sec.t} className="space-y-2">
                        <div className="px-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">{sec.t}</div>
                        <div className="space-y-1 pl-2 border-l border-slate-100 ml-2">
                            {sec.g.map((group, idx) => (
                                <div key={idx} className="space-y-0.5">
                                    <div className="text-[9px] uppercase font-extrabold text-slate-400 px-3">{group.title}</div>
                                    {group.items.map(item => (
                                        <NavLink key={item.path} to={item.path} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${isActive ? 'bg-sky-50 text-sky-700 border border-sky-100 font-bold' : 'hover:bg-slate-50 text-slate-500 font-medium'}`}>
                                            <item.icon size={16} /> <span className="text-xs flex-1">{item.name}</span>
                                            {item.badge && <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">{item.badge}</span>}
                                        </NavLink>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
        </aside>
    );
}
