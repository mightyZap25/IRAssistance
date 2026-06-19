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
    TrendingUp, FileText, CreditCard, StickyNote, MessageSquare, Microscope
} from 'lucide-react';

const ROLE_MENU_MAP = {
    admin: ['/', '/settings', '/parts', '/bom', '/customers', '/prod-requests', '/prod-execution', '/purchasing', '/outsourcing', '/inventory', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/manufacturers', '/vendors', '/ecn', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
    engineer: ['/', '/parts', '/bom', '/ecn', '/inventory', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
    sales: ['/', '/customers', '/prod-requests', '/inventory', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
    qa: ['/', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/inventory', '/transactions', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
    production: ['/', '/prod-execution', '/prod-requests', '/inventory', '/purchasing', '/outsourcing', '/transactions', '/vendors', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
    manager: ['/', '/customers', '/prod-requests', '/purchasing', '/outsourcing', '/inventory', '/qa/config', '/qa/process', '/qa/dashboard', '/qa/dev-testing', '/transactions', '/manufacturers', '/vendors', '/hr/attendance', '/project/dashboard', '/project/issues', '/project/management', '/project/tasks', '/project/task-calendar', '/sales/dashboard', '/sales/billing', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
    viewer: ['/', '/hr/attendance', '/project/management', '/project/tasks', '/project/task-calendar', '/workspace/calendar', '/workspace/meetings', '/workspace/files', '/workspace/mail', '/workspace/memo', '/workspace/chat'],
};

export default function Sidebar() {
    const { currentUser, userProfile } = useAuth();
    const [pendingEcnCount, setPendingEcnCount] = useState(0);
    const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

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

    const role = userProfile?.role || 'viewer';
    const allowedPaths = ROLE_MENU_MAP[role] || ROLE_MENU_MAP.viewer;
    const isAllowed = (path) => allowedPaths.includes(path);

    const filterGroups = (groups) => groups
        .map(group => ({ ...group, items: group.items.filter(item => isAllowed(item.path)) }))
        .filter(group => group.items.length > 0);

    const PLM_GROUPS = [
        {
            title: 'ERP 핵심 & PLM',
            items: [
                { name: '부품 관리', path: '/parts', icon: Settings },
                { name: 'BOM 관리', path: '/bom', icon: Layers },
                { name: '고객사 관리', path: '/customers', icon: Building2 },
                { name: '제조사 관리', path: '/manufacturers', icon: Factory },
                { name: '공급사 관리', path: '/vendors', icon: Users },
                { name: 'ECN 승인', path: '/ecn', icon: AlertCircle, badge: pendingEcnCount > 0 ? pendingEcnCount : null }
            ]
        }
    ];

    const SCM_GROUPS = [
        {
            title: '생산 & 공급망 SCM',
            items: [
                { name: '생산 의뢰', path: '/prod-requests', icon: ClipboardList },
                { name: '생산 계획', path: '/prod-execution', icon: PlayCircle },
                { name: '발주 관리', path: '/purchasing', icon: ShoppingCart },
                { name: '외주 관리', path: '/outsourcing', icon: Truck },
                { name: '입출고 내역', path: '/transactions', icon: History }
            ]
        }
    ];

    const QA_GROUPS = [
        {
            title: '재고 & 품질 QA',
            items: [
                { name: '품질 대시보드', path: '/qa/dashboard', icon: TrendingUp },
                { name: '재고 현황', path: '/inventory', icon: Package },
                { name: '품질 공정 관리', path: '/qa/process', icon: Activity },
                { name: '품질 기준 설정', path: '/qa/config', icon: Settings },
                { name: '개발 성능 테스트', path: '/qa/dev-testing', icon: Microscope }
            ]
        }
    ];

    const PROJECT_MENU_GROUPS = [
        {
            title: '프로젝트 & 작업 PM',
            items: [
                { name: '프로젝트 현황판', path: '/project/dashboard', icon: LayoutDashboard },
                { name: '개발 프로젝트', path: '/project/management', icon: Briefcase },
                { name: '이슈 트랙커', path: '/project/issues', icon: AlertCircle },
                { name: 'TASK', path: '/project/tasks', icon: ListTodo },
                { name: '업무 캘린더', path: '/project/task-calendar', icon: CalendarDays }
            ]
        }
    ];

    const SALES_MENU_GROUPS = [
        {
            title: '영업 & 정산',
            items: [
                { name: '매출 대시보드', path: '/sales/dashboard', icon: TrendingUp },
                { name: '수금 및 영수증', path: '/sales/billing', icon: CreditCard }
            ]
        }
    ];

    const COLLAB_MENU_GROUPS = [
        {
            title: '협업 & 공통 오피스',
            items: [
                { name: '근태 관리', path: '/hr/attendance', icon: UserCheck, badge: pendingApprovalCount > 0 ? pendingApprovalCount : null },
                { name: '통합 일정', path: '/workspace/calendar', icon: CalendarDays },
                { name: '회의 및 미팅', path: '/workspace/meetings', icon: Users },
                { name: '통합 메일', path: '/workspace/mail', icon: Mail },
                { name: '메모장', path: '/workspace/memo', icon: StickyNote },
                { name: '파일 공유', path: '/workspace/files', icon: Cloud },
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

    const fPlm = filterGroups(PLM_GROUPS);
    const fScm = filterGroups(SCM_GROUPS);
    const fQa = filterGroups(QA_GROUPS);
    const fProj = filterGroups(PROJECT_MENU_GROUPS);
    const fSales = filterGroups(SALES_MENU_GROUPS);
    const fCollab = filterGroups(COLLAB_MENU_GROUPS);
    const fAdmin = filterGroups(ADMIN_GROUPS);

    const roleInfo = {
        admin: { label: 'Admin', color: 'bg-rose-500' },
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
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Current Role</p>
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
                    { g: fPlm, t: 'PLM' },
                    { g: fScm, t: 'SCM' },
                    { g: fQa, t: 'QA' },
                    { g: fProj, t: 'PROJ' },
                    { g: fSales, t: 'SALES' },
                    { g: fCollab, t: 'COLLAB' },
                    { g: fAdmin, t: 'ADMIN' }
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
