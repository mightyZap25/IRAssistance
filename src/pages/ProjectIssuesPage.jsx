import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc, orderBy } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
    AlertCircle, Bug, CheckCircle, Clock, FileText, Filter, HelpCircle, 
    MessageSquare, Plus, RefreshCw, Search, ShieldAlert, User, Users, 
    X, ArrowRight, CornerDownRight, ClipboardList, Calendar, Bookmark, BarChart2,
    LayoutGrid, List, Kanban, ExternalLink, Package, History, Layers, Zap, Activity
} from 'lucide-react';
import MondayBoard from '../components/common/MondayBoard';
import IssueCardView   from '../components/IssueCardView';
import IssueKanbanView from '../components/IssueKanbanView';
import { getProjects, createProject } from '../services/projectService';
import RichMemoEditor from '../components/common/RichMemoEditor';

const CATEGORY_MAP = {
    Bug:      { label: '버그',       color: 'bg-rose-100 border-rose-300 text-rose-800', icon: Bug },
    Feature:  { label: '기능 추가/변경', color: 'bg-purple-100 border-purple-300 text-purple-800', icon: Plus },
    Test:     { label: '기능 테스트',  color: 'bg-blue-100 border-blue-300 text-blue-800', icon: ClipboardList },
    Customer: { label: '고객 피드백',  color: 'bg-amber-100 border-amber-300 text-amber-800', icon: HelpCircle }
};

const STATUS_MAP = {
    Pending:    { label: '접수/검토 중', color: 'bg-cyan-50 border-cyan-200 text-cyan-800', icon: Search },
    InProgress: { label: '진행 중',     color: 'bg-amber-50 border-amber-200 text-amber-700', icon: RefreshCw },
    Resolved:   { label: '조치 완료',   color: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: CheckCircle },
    Rejected:   { label: '폐기/반려',   color: 'bg-rose-50 border-rose-200 text-rose-700', icon: ShieldAlert },
    Archived:   { label: '보류/보관',   color: 'bg-slate-50 border-slate-200 text-slate-450', icon: X }
};

const KANBAN_COLUMNS = [
    { key: 'Pending',    label: '접수 대기',   icon: Search,      statuses: ['Pending'] },
    { key: 'InProgress', label: '진행 중',     icon: RefreshCw,   statuses: ['InProgress', 'Testing'] },
    { key: 'Resolved',   label: '조치 완료',   icon: CheckCircle, statuses: ['Resolved'] },
    { key: 'Archived',   label: '보류/반려',   icon: X,           statuses: ['Archived', 'Rejected'] }
];

const PRIORITY_MAP = {
    High:   { label: '높음 (상)', color: 'text-rose-600 bg-rose-50' },
    Medium: { label: '보통 (중)', color: 'text-amber-600 bg-amber-50' },
    Low:    { label: '낮음 (하)', color: 'text-slate-600 bg-slate-50' }
};

const DEPARTMENTS = ['개발', 'QA', '생산', '영업', '관리'];

export default function ProjectIssuesPage() {
    const { currentUser, userProfile } = useAuth();
    const [issues, setIssues] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]); 
    const [ecnList, setEcnList] = useState([]); 
    const [projectList, setProjectList] = useState([]); 

    const [activeTab, setActiveTab] = useState('ALL'); 
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deptFilter, setDeptFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('card'); 

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [issueSnap, userSnap, partsSnap, ecnSnap, projectsData] = await Promise.all([
                getDocs(query(collection(db, 'project_issues'), orderBy('CreatedAt', 'desc'))),
                getDocs(collection(db, 'users')),
                getDocs(collection(db, 'parts')),
                getDocs(query(collection(db, 'ecns'), orderBy('CreatedAt', 'desc'))),
                getProjects()
            ]);

            const issueList = issueSnap.docs.map(doc => {
                const data = doc.data();
                let status = data.Status || 'Pending';
                if (status === 'Analyzing') status = 'Pending';
                else if (status === 'Approved' || status === 'Testing') status = 'InProgress';
                return { id: doc.id, ...data, Status: status };
            });
            const userList = userSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            const partsList = partsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const ecns = ecnSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const productList = partsList.filter(p => 
                p.Class === 'Product (P)' || 
                (p.Category && p.Category.includes('완제품')) || 
                p.PartID?.startsWith('IRP')
            );

            setIssues(issueList);
            setUsers(userList);
            setProducts(productList);
            setEcnList(ecns);
            setProjectList(projectsData);
        } catch (err) {
            console.error("Error loading data:", err);
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        let total = issues.length;
        let pending = 0;
        let inProgress = 0;
        let resolved = 0;
        issues.forEach(i => {
            if (i.Status === 'Pending') pending++;
            else if (i.Status === 'InProgress') inProgress++;
            else resolved++;
        });
        return { total, pending, inProgress, resolved };
    }, [issues]);

    const allCategories = useMemo(() => {
        const map = { ...CATEGORY_MAP };
        issues.forEach(issue => {
            if (issue.Category && !map[issue.Category]) {
                map[issue.Category] = { label: issue.Category, color: 'bg-indigo-100 border-indigo-300 text-indigo-800', icon: Bookmark };
            }
        });
        return map;
    }, [issues]);

    const filteredIssues = useMemo(() => {
        let result = issues;
        if (activeTab === 'MY_DEPT') {
            const myDept = userProfile?.department || '';
            result = result.filter(i => i.TargetDept === myDept);
        } else if (activeTab === 'MY_ASSIGNED') {
            result = result.filter(i => (i.AssigneeUid || i.assigneeUid) === currentUser?.uid);
        }
        if (categoryFilter !== 'all') result = result.filter(i => i.Category === categoryFilter);
        if (statusFilter !== 'all') result = result.filter(i => i.Status === statusFilter);
        if (deptFilter !== 'all') result = result.filter(i => i.TargetDept === deptFilter);
        if (priorityFilter !== 'all') result = result.filter(i => i.Priority === priorityFilter);
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(i => (i.Title || '').toLowerCase().includes(lower) || (i.Description || '').toLowerCase().includes(lower) || (i.AssigneeName || '').toLowerCase().includes(lower) || (i.CreatedBy || '').toLowerCase().includes(lower));
        }
        return result;
    }, [issues, activeTab, categoryFilter, statusFilter, deptFilter, priorityFilter, searchTerm, userProfile, currentUser]);

    const handleSaveIssue = async (newIssueData) => {
        try {
            const { IsCustomProduct, IsCustomCategory, ...saveData } = newIssueData;
            const issueDoc = {
                ...saveData,
                DueDate: '', 
                Priority: saveData.Priority || 'Medium', 
                Status: 'Pending',
                ResolutionStatus: 'Pending',
                CreatedBy: userProfile?.name || currentUser?.displayName || '사용자', 
                CreatedByEmail: currentUser?.email || '', 
                CreatedByUid: currentUser?.uid || '',
                CreatedAt: serverTimestamp(), 
                Difficulty: 'Medium', 
                AnalysisNotes: '', 
                ResolutionNotes: '', 
                Comments: [],
                History: [{ logId: `log_${Date.now()}`, updatedBy: userProfile?.name || '시스템', previousStatus: '-', newStatus: 'Pending', timestamp: new Date().toISOString() }]
            };
            await addDoc(collection(db, 'project_issues'), issueDoc);
            await fetchData();
            setIsCreateOpen(false);
        } catch (error) { alert("이슈 생성 실패"); }
    };

    const handleUpdateIssue = async (issueId, updatedFields, transitionLog) => {
        try {
            const issueRef = doc(db, 'project_issues', issueId);
            const dataToUpdate = { ...updatedFields };
            if (transitionLog) {
                const targetIssue = issues.find(i => i.id === issueId);
                const currentHistory = targetIssue?.History || [];
                dataToUpdate.History = [{ logId: `log_${Date.now()}`, updatedBy: userProfile?.name || '시스템', ...transitionLog, timestamp: new Date().toISOString() }, ...currentHistory];
            }
            await updateDoc(issueRef, dataToUpdate);
            await fetchData();
            if (selectedIssue?.id === issueId) setSelectedIssue(prev => ({ ...prev, ...dataToUpdate }));
        } catch (error) { alert("수정사항 저장 실패"); }
    };

    const handleAddComment = async (issueId, commentText) => {
        if (!commentText.trim()) return;
        try {
            const targetIssue = issues.find(i => i.id === issueId);
            const currentComments = targetIssue?.Comments || [];
            const newComment = { commentId: `comment_${Date.now()}`, author: userProfile?.name || '팀원', text: commentText, timestamp: new Date().toISOString() };
            await updateDoc(doc(db, 'project_issues', issueId), { Comments: [...currentComments, newComment] });
            await fetchData();
            if (selectedIssue?.id === issueId) setSelectedIssue(prev => ({ ...prev, Comments: [...(prev.Comments || []), newComment] }));
        } catch (error) { console.error("댓글 추가 실패", error); }
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* 상단 헤더 영역: 제목 및 핵심 액션 */}
            <div className="flex justify-between items-center shrink-0 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-inner">
                        <AlertCircle className="text-indigo-600" size={26} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1.5">이슈 트레커</h1>
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-wider">
                            <Layers size={12} /> 프로젝트 요구사항 및 이슈 통합 관리
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col items-end mr-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">긴급 이슈</span>
                        <div className="flex items-center gap-1.5 text-rose-600 font-black text-sm">
                            <Zap size={14} fill="currentColor" /> {issues.filter(i => i.Priority === 'High' && i.Status === 'Pending').length} 건 대기 중
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsCreateOpen(true)} 
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs shadow-lg shadow-indigo-100 transition-all hover:scale-[1.02] active:scale-95"
                    >
                        <Plus size={18} /> 이슈 등록
                    </button>
                </div>
            </div>

            {/* 통계 섹션: 시각적 진행률 기반 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 shrink-0">
                {[ 
                    { t: '전체 이슈', v: stats.total, c: 'text-slate-800', bg: 'bg-white', icon: FileText, p: 100, pc: 'bg-slate-200' }, 
                    { t: '검토 중', v: stats.pending, c: 'text-cyan-600', bg: 'bg-white', icon: Search, p: (stats.pending / stats.total * 100) || 0, pc: 'bg-cyan-500' }, 
                    { t: '조치 중', v: stats.inProgress, c: 'text-amber-600', bg: 'bg-white', icon: RefreshCw, p: (stats.inProgress / stats.total * 100) || 0, pc: 'bg-amber-500' }, 
                    { t: '완료됨', v: stats.resolved, c: 'text-emerald-600', bg: 'bg-white', icon: CheckCircle, p: (stats.resolved / stats.total * 100) || 0, pc: 'bg-emerald-500' } 
                ].map((s, idx) => (
                    <div key={idx} className={`${s.bg} rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col relative overflow-hidden group hover:border-indigo-200 transition-all`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="p-2 rounded-xl bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                <s.icon size={18} />
                            </div>
                            <span className={`text-2xl font-black ${s.c} tabular-nums`}>{s.v}</span>
                        </div>
                        <p className="text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest">{s.t}</p>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${s.pc} transition-all duration-1000`} style={{ width: `${s.p}%` }}></div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 메인 리스트 영역: 필터 및 컨텐츠 */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-wrap gap-5 items-center justify-between">
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        {[ { k: 'ALL', l: '전체 보기' }, { k: 'MY_DEPT', l: '우리 부서' }, { k: 'MY_ASSIGNED', l: '내게 배정됨' } ].map(t => (
                            <button 
                                key={t.k} 
                                onClick={() => setActiveTab(t.k)} 
                                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === t.k ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                {t.l}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                            {[ { m: 'card', i: LayoutGrid }, { m: 'list', i: List }, { m: 'kanban', i: Kanban } ].map(v => (
                                <button 
                                    key={v.m} 
                                    onClick={() => setViewMode(v.m)} 
                                    className={`p-2 rounded-lg transition-all ${viewMode === v.m ? 'bg-slate-100 text-indigo-600 shadow-inner' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <v.i size={16}/>
                                </button>
                            ))}
                        </div>
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={14} />
                            <input 
                                type="text" 
                                placeholder="제목, 담당자, 내용 검색..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-64 shadow-sm" 
                            />
                        </div>
                    </div>
                </div>

                <div className={`flex-1 ${viewMode === 'kanban' ? 'overflow-hidden' : 'overflow-y-auto'} p-4 bg-slate-50/30`}>
                    {loading ? <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-indigo-600" size={24} /></div> : filteredIssues.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-slate-300"><p className="text-xs font-black">데이터가 없습니다.</p></div> : 
                        viewMode === 'list' ? <MondayBoard tasks={filteredIssues} onSelect={setSelectedIssue} onUpdateTask={handleUpdateIssue} onAddTask={() => setIsCreateOpen(true)} allCategories={allCategories} currentUser={currentUser} /> : 
                        viewMode === 'kanban' ? <IssueKanbanView issues={filteredIssues} allCategories={allCategories} STATUS_MAP={STATUS_MAP} PRIORITY_MAP={PRIORITY_MAP} KANBAN_COLUMNS={KANBAN_COLUMNS} userProfile={userProfile} onSelect={setSelectedIssue} onStatusChange={(id, ns, ps) => handleUpdateIssue(id, { Status: ns }, { previousStatus: ps, newStatus: ns, message: `칸반 이동: ${ps} ➔ ${ns}` })} /> :
                        <IssueCardView issues={filteredIssues} allCategories={allCategories} STATUS_MAP={STATUS_MAP} PRIORITY_MAP={PRIORITY_MAP} onSelect={setSelectedIssue} />
                    }
                </div>
            </div>

            <CreateIssueModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSave={handleSaveIssue} existingCategories={Object.keys(allCategories)} products={products} />
            <IssueDetailPanel isOpen={!!selectedIssue} onClose={() => setSelectedIssue(null)} issue={selectedIssue} users={users} userProfile={userProfile} currentUser={currentUser} onUpdateIssue={handleUpdateIssue} onAddComment={handleAddComment} allCategories={allCategories} ecnList={ecnList} products={products} projectList={projectList} fetchData={fetchData} />
        </div>
    );
}

function CreateIssueModal({ isOpen, onClose, onSave, existingCategories, products }) {
    const [form, setForm] = useState({ 
        Title: '', 
        Description: '', 
        Category: 'Bug', 
        TargetDept: '개발', 
        Priority: 'Medium', 
        TargetProductID: '', 
        TargetProductName: '', 
        IsCustomProduct: false,
        IsCustomCategory: false,
        CustomerEmail: '',
        CustomerImportance: 'Medium',
        GoogleDriveLink: ''
    });

    useEffect(() => { 
        if (isOpen) {
            setForm({ 
                Title: '', 
                Description: '', 
                Category: 'Bug', 
                TargetDept: '개발', 
                Priority: 'Medium', 
                TargetProductID: '', 
                TargetProductName: '', 
                IsCustomProduct: false,
                IsCustomCategory: false,
                CustomerEmail: '',
                CustomerImportance: 'Medium',
                GoogleDriveLink: ''
            }); 
        } 
    }, [isOpen]);

    const handleSubmit = (e) => { 
        e.preventDefault(); 
        if (!form.Title.trim() || !form.Description.trim()) return alert("제목과 설명을 입력해 주세요."); 
        onSave(form); 
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 font-black text-sm">
                    신규 이슈 등록 
                    <button type="button" onClick={onClose}><X size={18}/></button>
                </div>
                <div className="p-5 space-y-3 flex-1 overflow-y-auto custom-scrollbar text-left flex flex-col">
                    {/* 이슈 제목 */}
                    <div className="space-y-1 shrink-0">
                        <label className="text-[10px] font-black text-slate-400 block ml-1">이슈 제목</label>
                        <input type="text" placeholder="이슈 제목을 입력하세요" value={form.Title} onChange={e => setForm({...form, Title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" required />
                    </div>

                    {/* 2단 그리드 메타 영역 */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 shrink-0">
                        {/* 이슈 대상 제품 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">이슈 대상 제품</label>
                            <div className="flex-1 flex gap-1.5">
                                <select 
                                    value={form.IsCustomProduct ? 'custom' : form.TargetProductID} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === 'custom') {
                                            setForm({ ...form, IsCustomProduct: true, TargetProductID: '', TargetProductName: '' });
                                        } else if (val === '') {
                                            setForm({ ...form, IsCustomProduct: false, TargetProductID: '', TargetProductName: '' });
                                        } else {
                                            const selectedProd = products.find(p => p.id === val);
                                            setForm({ 
                                                ...form, 
                                                IsCustomProduct: false, 
                                                TargetProductID: val, 
                                                TargetProductName: selectedProd ? (selectedProd.PartName || selectedProd.Name || '') : '' 
                                            });
                                        }
                                    }} 
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="">선택 안 함</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.PartName || p.Name}
                                        </option>
                                    ))}
                                    <option value="custom">직접 입력...</option>
                                </select>
                                {form.IsCustomProduct && (
                                    <input 
                                        type="text" 
                                        placeholder="직접 입력" 
                                        value={form.TargetProductName} 
                                        onChange={e => setForm({ ...form, TargetProductName: e.target.value })} 
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 w-24" 
                                        required
                                    />
                                )}
                            </div>
                        </div>

                        {/* 이슈 분류 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">이슈 분류</label>
                            <div className="flex-1 flex gap-1.5">
                                <select 
                                    value={form.IsCustomCategory ? 'custom' : form.Category} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === 'custom') {
                                            setForm({ ...form, IsCustomCategory: true, Category: '' });
                                        } else {
                                            setForm({ ...form, IsCustomCategory: false, Category: val });
                                        }
                                    }} 
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="Bug">버그</option>
                                    <option value="Feature">기능변경</option>
                                    <option value="Test">기능테스트</option>
                                    <option value="Customer">고객피드백</option>
                                    <option value="custom">직접 입력...</option>
                                </select>
                                {form.IsCustomCategory && (
                                    <input 
                                        type="text" 
                                        placeholder="직접 입력" 
                                        value={form.Category} 
                                        onChange={e => setForm({ ...form, Category: e.target.value })} 
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 w-24" 
                                        required
                                    />
                                )}
                            </div>
                        </div>

                        {/* 배정 부서 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">배정 부서</label>
                            <select value={form.TargetDept} onChange={e => setForm({...form, TargetDept: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500">
                                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}부서</option>)}
                            </select>
                        </div>

                        {/* 내부 중요도 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">내부 중요도</label>
                            <select value={form.Priority} onChange={e => setForm({...form, Priority: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500">
                                <option value="High">높음 (상)</option>
                                <option value="Medium">보통 (중)</option>
                                <option value="Low">낮음 (하)</option>
                            </select>
                        </div>

                        {/* 고객사 중요도 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">고객 중요도</label>
                            <select value={form.CustomerImportance} onChange={e => setForm({...form, CustomerImportance: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500">
                                <option value="High">높음 (상)</option>
                                <option value="Medium">보통 (중)</option>
                                <option value="Low">낮음 (하)</option>
                            </select>
                        </div>

                        {/* 이메일 링크 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">이메일 링크</label>
                            <input type="url" placeholder="이메일 공유 URL" value={form.CustomerEmail} onChange={e => setForm({...form, CustomerEmail: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800" />
                        </div>

                        {/* 구글 드라이브 링크 */}
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-black text-slate-500 w-24 shrink-0">드라이브 링크</label>
                            <input type="url" placeholder="https://drive.google.com/..." value={form.GoogleDriveLink} onChange={e => setForm({...form, GoogleDriveLink: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800" />
                        </div>
                    </div>

                    {/* 상세 설명 */}
                    <div className="space-y-1 flex-1 flex flex-col min-h-[200px] mt-2 shrink-0">
                        <label className="text-[10px] font-black text-slate-400 block ml-1">상세 설명</label>
                        <textarea placeholder="구체적인 발생 현상이나 상세한 설명을 적어주세요." value={form.Description} onChange={e => setForm({...form, Description: e.target.value})} className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium outline-none resize-none focus:ring-2 focus:ring-indigo-500 min-h-[180px]" required />
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 shrink-0">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-black text-slate-500 bg-white border border-slate-200 rounded-lg shadow-sm">취소</button>
                    <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black shadow-sm hover:bg-indigo-700">등록</button>
                </div>
            </form>
        </div>, document.body
    );
}

function IssueDetailPanel({ isOpen, onClose, issue, users, userProfile, currentUser, onUpdateIssue, onAddComment, allCategories, ecnList, products, projectList, fetchData }) {
    const [editForm, setEditForm] = useState({ 
        TargetDept: '', 
        AssigneeUid: '', 
        Priority: '', 
        Difficulty: '', 
        DueDate: '', 
        LinkedECNId: '', 
        Documents: [],
        TargetProductID: '',
        TargetProductName: '',
        CustomerEmail: '',
        CustomerImportance: 'Medium',
        GoogleDriveLink: '',
        IsCustomProduct: false,
        GoogleSheetsAnalysisLink: '',
        LinkedProjectId: '',
        SubTasks: [],
        ResolutionStatus: 'Pending',
        Description: ''
    });
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [newSubTaskTitle, setNewSubTaskTitle] = useState('');

    useEffect(() => { 
        if (isOpen && issue) {
            const assigneeUid = issue.AssigneeUid || issue.assigneeUid || '';
            const assigneeUser = users.find(u => u.uid === assigneeUid);
            
            const migratedTasks = (issue.SubTasks || []).map(t => {
                if (t.status === undefined) {
                    return { ...t, status: t.completed ? 'Completed' : 'Pending' };
                }
                return t;
            });

            setEditForm({ 
                TargetDept: issue.TargetDept || assigneeUser?.department || '개발', 
                AssigneeUid: assigneeUid, 
                Priority: issue.Priority || 'Medium', 
                Difficulty: issue.Difficulty || 'Medium', 
                DueDate: issue.DueDate || '', 
                LinkedECNId: issue.LinkedECNId || '', 
                Documents: issue.Documents || [],
                TargetProductID: issue.TargetProductID || '',
                TargetProductName: issue.TargetProductName || '',
                CustomerEmail: issue.CustomerEmail || '',
                CustomerImportance: issue.CustomerImportance || 'Medium',
                GoogleDriveLink: issue.GoogleDriveLink || '',
                IsCustomProduct: (issue.TargetProductID === '' || !issue.TargetProductID) && (issue.TargetProductName !== '' && !!issue.TargetProductName),
                GoogleSheetsAnalysisLink: issue.GoogleSheetsAnalysisLink || '',
                LinkedProjectId: issue.LinkedProjectId || '',
                SubTasks: migratedTasks,
                ResolutionStatus: issue.ResolutionStatus || 'Pending',
                Description: issue.Description || ''
            });
        }
    }, [isOpen, issue]);

    if (!isOpen || !issue) return null;

    const deptMembers = users.filter(u => u.department === editForm.TargetDept || u.uid === editForm.AssigneeUid);

    const handleSave = async () => { 
        setLoading(true); 
        const assignee = users.find(u => u.uid === editForm.AssigneeUid); 
        const { IsCustomProduct, ...saveData } = editForm;
        await onUpdateIssue(issue.id, { ...saveData, AssigneeName: assignee ? assignee.name : '' }, { previousStatus: '수정', newStatus: '수정됨' }); 
        setLoading(false); 
        alert("저장됨"); 
    };

    const handleStatus = async (ns, sn) => { 
        setLoading(true); 
        const assignee = users.find(u => u.uid === editForm.AssigneeUid); 
        const { IsCustomProduct, ...saveData } = editForm;
        await onUpdateIssue(issue.id, { Status: ns, ...saveData, AssigneeName: assignee ? assignee.name : '' }, { previousStatus: issue.Status, newStatus: ns, message: `상태 변경: ${ns} (${sn})` }); 
        setLoading(false); 
    };

    const handleAddTask = async () => {
        if (!newSubTaskTitle.trim()) return;
        const newTask = {
            id: Date.now().toString(),
            title: newSubTaskTitle.trim(),
            assigneeUid: '',
            assigneeName: '미지정',
            status: 'Pending',
            createdAt: new Date().toISOString()
        };
        const updatedTasks = [...editForm.SubTasks, newTask];
        setEditForm({ ...editForm, SubTasks: updatedTasks });
        setNewSubTaskTitle('');
        await onUpdateIssue(issue.id, { SubTasks: updatedTasks }, { previousStatus: '태스크 추가', newStatus: '수정됨' });
    };

    const handleUpdateTask = async (taskId, updates) => {
        const updatedTasks = editForm.SubTasks.map(t => t.id === taskId ? { ...t, ...updates } : t);
        setEditForm({ ...editForm, SubTasks: updatedTasks });
        await onUpdateIssue(issue.id, { SubTasks: updatedTasks }, { previousStatus: '태스크 업데이트', newStatus: '수정됨' });
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm("이 태스크를 삭제하시겠습니까?")) return;
        const updatedTasks = editForm.SubTasks.filter(t => t.id !== taskId);
        setEditForm({ ...editForm, SubTasks: updatedTasks });
        await onUpdateIssue(issue.id, { SubTasks: updatedTasks }, { previousStatus: '태스크 삭제', newStatus: '수정됨' });
    };

    const handleCreateNewECN = async () => {
        if (!window.confirm("이 이슈를 기반으로 신규 ECN을 즉시 발행하고 연동하시겠습니까?")) return;
        setLoading(true);
        try {
            const ecnNum = `ECN-${Date.now().toString().slice(-6)}`;
            const newEcnDoc = {
                ECNNumber: ecnNum,
                Title: `[이슈 연계] ${issue.Title}`,
                TargetProductName: editForm.TargetProductName || issue.TargetProductName || '미지정',
                TargetProductID: editForm.TargetProductID || issue.TargetProductID || '',
                Status: 'Draft',
                CreatedBy: userProfile?.name || currentUser?.displayName || '시스템',
                CreatedAt: new Date(),
                Description: `이슈 연계 설계 변경 발의됨.`
            };
            const docRef = await addDoc(collection(db, 'ecns'), newEcnDoc);
            
            await onUpdateIssue(issue.id, { LinkedECNId: docRef.id, ResolutionStatus: 'ECN_Linked' }, { 
                previousStatus: issue.Status, 
                newStatus: issue.Status, 
                message: `신규 ECN (${ecnNum}) 발행 및 이슈 연동` 
            });
            setEditForm(prev => ({ ...prev, LinkedECNId: docRef.id, ResolutionStatus: 'ECN_Linked' }));
            await fetchData();
            alert(`신규 설계변경 문서 (${ecnNum})가 발행 및 연동되었습니다.`);
        } catch (error) {
            console.error("ECN 생성 실패:", error);
            alert("ECN 생성 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNewProject = async () => {
        const projName = window.prompt("신규 발족할 프로젝트 명을 입력해 주세요:", `[이슈 조치] ${issue.Title}`);
        if (projName === null) return;
        if (!projName.trim()) return alert("프로젝트명을 입력해 주세요.");
        
        setLoading(true);
        try {
            const projData = {
                name: projName.trim(),
                description: `이슈 해결을 위한 연계 프로젝트.`,
                owner: userProfile?.name || currentUser?.displayName || '시스템'
            };
            const newProjId = await createProject(projData);
            
            await onUpdateIssue(issue.id, { LinkedProjectId: newProjId, ResolutionStatus: 'Project_Linked' }, { 
                previousStatus: issue.Status, 
                newStatus: issue.Status, 
                message: `신규 프로젝트 (${projName}) 발족 및 연계` 
            });
            setEditForm(prev => ({ ...prev, LinkedProjectId: newProjId, ResolutionStatus: 'Project_Linked' }));
            await fetchData();
            alert(`신규 프로젝트 [${projName}]가 발족 및 연동되었습니다.`);
        } catch (error) {
            console.error("프로젝트 생성 실패:", error);
            alert("프로젝트 발족에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleCommentSubmit = async (e) => { 
        e.preventDefault(); 
        if (!newComment.trim()) return; 
        await onAddComment(issue.id, newComment.trim()); 
        setNewComment(''); 
    };

    const SUBTASK_STATUS_COLORS = {
        Pending: 'bg-slate-100 text-slate-500',
        InProgress: 'bg-amber-100 text-amber-700',
        Completed: 'bg-emerald-100 text-emerald-700'
    };

    const linkedEcnDoc = ecnList.find(e => e.id === editForm.LinkedECNId);
    const linkedProjectDoc = projectList.find(p => p.id === editForm.LinkedProjectId);

    return createPortal(
        <div className='relative z-[9999]'>
            <div className='fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[140]' onClick={onClose} />
            <div className='fixed inset-y-0 right-0 w-full md:w-[900px] lg:w-[1100px] bg-slate-100 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300'>
                {/* Header */}
                <div className='bg-white px-5 py-3 border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm z-10 text-left'>
                    <div className='flex items-center gap-3'>
                        <span className={`px-2 py-1 rounded text-[10px] font-black border ${allCategories[issue.Category]?.color}`}>
                            {allCategories[issue.Category]?.label}
                        </span>
                        <h2 className='text-lg font-black text-slate-800 tracking-tight truncate max-w-[500px]'>{issue.Title}</h2>
                        <span className={`px-2 py-1 rounded text-[10px] font-black border ${STATUS_MAP[issue.Status]?.color}`}>
                            {STATUS_MAP[issue.Status]?.label}
                        </span>
                    </div>
                    <div className='flex items-center gap-2'>
                        <button onClick={handleSave} className='px-4 py-1.5 bg-indigo-600 text-white text-[11px] font-black rounded-lg shadow-sm hover:bg-indigo-700 transition-all flex items-center gap-1.5'>
                            <CheckCircle size={14}/> 저장
                        </button>
                        <button onClick={onClose} className='p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors'><X size={18}/></button>
                    </div>
                </div>

                {/* Body Layout */}
                <div className='flex-1 flex min-h-0 overflow-hidden text-left'>
                    
                    {/* LEFT COLUMN */}
                    <div className='flex-[2] overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col'>

                        {/* 하위 태스크 */}
                        <div className='bg-white border border-slate-200 rounded-xl p-4 shadow-sm shrink-0'>
                            <div className='flex items-center justify-between mb-2'>
                                <div className='flex items-center gap-2 text-slate-400'>
                                    <List size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>하위 태스크</span>
                                </div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    {editForm.SubTasks.filter(t => t.status === 'Completed').length} / {editForm.SubTasks.length} 완료
                                </span>
                            </div>
                            
                            <div className="space-y-1 mb-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                                {editForm.SubTasks.length === 0 ? (
                                    <div className="py-6 text-center text-[10px] font-black text-slate-300 uppercase italic">하위 태스크가 없습니다.</div>
                                ) : (
                                    editForm.SubTasks.map(task => (
                                        <div key={task.id} className={`flex items-center gap-2 p-1.5 rounded-lg border border-slate-100 transition-all ${task.status === 'Completed' ? 'bg-slate-50 opacity-60' : 'bg-white hover:border-indigo-200'}`}>
                                            <select 
                                                value={task.status} 
                                                onChange={e => handleUpdateTask(task.id, { status: e.target.value })}
                                                className={`h-6 px-1.5 text-[9px] font-black rounded outline-none cursor-pointer ${SUBTASK_STATUS_COLORS[task.status] || SUBTASK_STATUS_COLORS.Pending}`}
                                            >
                                                <option value="Pending">대기</option>
                                                <option value="InProgress">진행중</option>
                                                <option value="Completed">완료</option>
                                            </select>
                                            <input 
                                                type="text" 
                                                value={task.title} 
                                                onChange={e => handleUpdateTask(task.id, { title: e.target.value })}
                                                className={`flex-1 bg-transparent border-none p-1 text-[11px] font-bold outline-none ${task.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}
                                            />
                                            <select 
                                                value={task.assigneeUid} 
                                                onChange={e => {
                                                    const u = users.find(user => user.uid === e.target.value);
                                                    handleUpdateTask(task.id, { assigneeUid: e.target.value, assigneeName: u ? u.name : '미지정' });
                                                }}
                                                className="h-6 bg-slate-100 rounded px-1.5 text-[9px] font-black text-slate-600 outline-none cursor-pointer"
                                            >
                                                <option value="">담당자 미지정</option>
                                                {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                                            </select>
                                            <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-rose-500 p-1"><X size={12}/></button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="새 태스크 입력 후 Enter..." 
                                    value={newSubTaskTitle} 
                                    onChange={e => setNewSubTaskTitle(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button onClick={handleAddTask} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black hover:bg-indigo-100 transition-all flex items-center gap-1">
                                    <Plus size={14}/> 추가
                                </button>
                            </div>
                        </div>

                        {/* Updates */}
                        <div className='bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1 flex flex-col min-h-0'>
                            <div className='flex items-center gap-2 text-slate-400 mb-3 shrink-0'>
                                <MessageSquare size={14} /><span className='text-[10px] font-black uppercase tracking-widest'>활동 내역 (Updates)</span>
                            </div>
                            <form onSubmit={handleCommentSubmit} className='flex gap-2 mb-4 shrink-0'>
                                <input type='text' placeholder='댓글 남기기...' value={newComment} onChange={e => setNewComment(e.target.value)} className='flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-indigo-500' />
                                <button type='submit' className='px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black hover:bg-indigo-700 transition-all'>입력</button>
                            </form>
                            <div className='border border-slate-100 rounded-xl divide-y divide-slate-100 flex-1 overflow-y-auto custom-scrollbar'>
                                {(() => { 
                                    const list = []; 
                                    (issue.Comments || []).forEach(c => list.push({ type: 'comment', ...c, date: new Date(c.timestamp) })); 
                                    (issue.History || []).forEach(h => list.push({ type: 'history', author: h.updatedBy, text: h.message, date: new Date(h.timestamp) })); 
                                    list.sort((a, b) => b.date - a.date); 
                                    
                                    return list.length > 0 ? list.map((item, idx) => ( 
                                        <div key={idx} className={`flex items-center gap-3 py-2.5 px-3 hover:bg-slate-50 transition-colors ${item.type === 'comment' ? 'bg-indigo-50/10' : ''}`}>
                                            <div className='flex items-center gap-1.5 w-[80px] shrink-0'>
                                                {item.type === 'comment' ? <User size={12} className="text-indigo-500" /> : <History size={12} className="text-slate-400" />}
                                                <span className={`text-[10px] font-black truncate ${item.type === 'comment' ? 'text-indigo-700' : 'text-slate-500'}`}>{item.author}</span>
                                            </div>
                                            <div className={`flex-1 text-[11px] truncate ${item.type === 'comment' ? 'font-bold text-slate-800' : 'font-medium text-slate-500'}`} title={item.text}>
                                                {item.text}
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-400 tabular-nums shrink-0 text-right w-24">
                                                {item.date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div> 
                                    )) : (
                                        <div className="py-8 text-center text-[10px] font-black text-slate-300 uppercase italic">활동 내역이 없습니다.</div>
                                    ); 
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className='flex-[1] border-l border-slate-200 bg-white overflow-y-auto p-4 space-y-5 custom-scrollbar'>
                        
                        {/* Workflow & Resolution Status */}
                        <div className="space-y-2">
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">이슈 상태</span>
                                <div className="flex gap-1">
                                    {issue.Status === 'Pending' && <button onClick={() => handleStatus('InProgress', '시작')} className='bg-indigo-600 text-white text-[10px] px-3 py-1.5 rounded shadow-sm font-black hover:bg-indigo-700 transition-all'>작업 시작</button>}
                                    {issue.Status === 'InProgress' && <button onClick={() => handleStatus('Resolved', '완료')} className='bg-emerald-600 text-white text-[10px] px-3 py-1.5 rounded shadow-sm font-black hover:bg-emerald-700 transition-all'>조치 완료</button>}
                                    {['Resolved', 'Rejected', 'Archived'].includes(issue.Status) && <button onClick={() => handleStatus('InProgress', '재개')} className='bg-slate-700 text-white text-[10px] px-3 py-1.5 rounded shadow-sm font-black hover:bg-slate-800 transition-all'>다시 시작</button>}
                                </div>
                            </div>
                            
                            <div className={`rounded-xl p-3 border flex items-center justify-between transition-colors ${
                                editForm.ResolutionStatus === 'Completed' ? 'bg-emerald-50 border-emerald-200' :
                                editForm.ResolutionStatus === 'ECN_Linked' ? 'bg-indigo-50 border-indigo-200' :
                                editForm.ResolutionStatus === 'Project_Linked' ? 'bg-purple-50 border-purple-200' :
                                'bg-white border-slate-200'
                            }`}>
                                <div className="flex items-center gap-1.5">
                                    <Activity size={14} className={
                                        editForm.ResolutionStatus === 'Completed' ? 'text-emerald-500' :
                                        editForm.ResolutionStatus === 'ECN_Linked' ? 'text-indigo-500' :
                                        editForm.ResolutionStatus === 'Project_Linked' ? 'text-purple-500' :
                                        'text-slate-400'
                                    } />
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">조치 상태</span>
                                </div>
                                <select 
                                    value={editForm.ResolutionStatus} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        setEditForm({...editForm, ResolutionStatus: val});
                                        onUpdateIssue(issue.id, { ResolutionStatus: val }, { previousStatus: '조치 상태 변경', newStatus: '수정됨' });
                                    }} 
                                    className={`bg-transparent text-right text-[11px] font-black outline-none cursor-pointer appearance-none ${
                                        editForm.ResolutionStatus === 'Completed' ? 'text-emerald-700' :
                                        editForm.ResolutionStatus === 'ECN_Linked' ? 'text-indigo-700' :
                                        editForm.ResolutionStatus === 'Project_Linked' ? 'text-purple-700' :
                                        'text-slate-500'
                                    }`}
                                >
                                    <option value="Pending">조치 전 (Pending)</option>
                                    <option value="Task_Ongoing">일반 조치 중</option>
                                    <option value="ECN_Linked">설계 변경 연동</option>
                                    <option value="Project_Linked">프로젝트 이관</option>
                                    <option value="Completed">조치 완료</option>
                                </select>
                            </div>
                        </div>

                        {/* Basic Info Table */}
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-2 px-1 tracking-widest">메타 정보</span>
                            <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 text-[11px] font-bold bg-white">
                                <div className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors">
                                    <span className="text-slate-400 w-20">담당자</span>
                                    <select value={editForm.AssigneeUid} onChange={e => setEditForm({...editForm, AssigneeUid: e.target.value})} className='flex-1 bg-transparent text-right text-indigo-600 outline-none cursor-pointer appearance-none'>
                                        <option value=''>미지정</option>
                                        {deptMembers.map(u => <option key={u.uid} value={u.uid}>{u.displayName || u.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors">
                                    <span className="text-slate-400 w-20">중요도</span>
                                    <select value={editForm.Priority} onChange={e => setEditForm({...editForm, Priority: e.target.value})} className={`flex-1 bg-transparent text-right outline-none cursor-pointer appearance-none ${editForm.Priority === 'High' ? 'text-rose-600' : editForm.Priority === 'Medium' ? 'text-amber-600' : 'text-slate-600'}`}>
                                        <option value="High">높음 (High)</option>
                                        <option value="Medium">보통 (Medium)</option>
                                        <option value="Low">낮음 (Low)</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors">
                                    <span className="text-slate-400 w-20">관련 부서</span>
                                    <select value={editForm.TargetDept} onChange={e => setEditForm({...editForm, TargetDept: e.target.value, AssigneeUid: ''})} className='flex-1 bg-transparent text-right text-slate-700 outline-none cursor-pointer appearance-none'>
                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}부서</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col p-2.5 hover:bg-slate-50 transition-colors gap-1.5 text-right">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 text-left">대상 제품</span>
                                        <select 
                                            value={editForm.IsCustomProduct ? 'custom' : editForm.TargetProductID} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === 'custom') {
                                                    setEditForm({ ...editForm, IsCustomProduct: true, TargetProductID: '', TargetProductName: '' });
                                                } else if (val === '') {
                                                    setEditForm({ ...editForm, IsCustomProduct: false, TargetProductID: '', TargetProductName: '' });
                                                } else {
                                                    const selectedProd = products.find(p => p.id === val);
                                                    setEditForm({ ...editForm, IsCustomProduct: false, TargetProductID: val, TargetProductName: selectedProd ? (selectedProd.PartName || selectedProd.Name || '') : '' });
                                                }
                                            }}
                                            className="bg-transparent text-right text-indigo-600 max-w-[150px] truncate outline-none cursor-pointer appearance-none"
                                        >
                                            <option value="">선택 안함</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.PartName || p.Name}</option>)}
                                            <option value="custom">직접 입력...</option>
                                        </select>
                                    </div>
                                    {editForm.IsCustomProduct && (
                                        <input 
                                            type="text" 
                                            value={editForm.TargetProductName} 
                                            onChange={e => setEditForm({ ...editForm, TargetProductName: e.target.value })} 
                                            placeholder="직접 입력" 
                                            className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px] mt-1 outline-none" 
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 상세 설명 (Simple Textarea) */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1 px-1 flex items-center gap-1 tracking-widest"><FileText size={12}/> 상세 설명</span>
                            <textarea 
                                value={editForm.Description} 
                                onChange={e => setEditForm({...editForm, Description: e.target.value})}
                                onBlur={() => onUpdateIssue(issue.id, { Description: editForm.Description }, { previousStatus: '설명 수정', newStatus: '수정됨' })}
                                placeholder="설명을 입력하세요..."
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 min-h-[150px] resize-none leading-relaxed"
                            />
                        </div>

                        {/* Compact Integrations */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase block mb-1 px-1 flex items-center gap-1 tracking-widest"><Package size={12}/> 시스템 연동</span>
                            
                            <div className={`border rounded-xl p-2.5 transition-all ${linkedEcnDoc ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-white'}`}>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[10px] font-black text-slate-500">ECN (설계변경)</span>
                                    {!linkedEcnDoc && <button onClick={handleCreateNewECN} className="text-[9px] font-black text-indigo-600 hover:underline flex items-center gap-0.5"><Plus size={10}/>신규</button>}
                                </div>
                                {linkedEcnDoc ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black shrink-0">{linkedEcnDoc.ECNNumber}</span>
                                            <span className="text-[11px] font-bold text-slate-800 truncate">{linkedEcnDoc.Title}</span>
                                        </div>
                                        <button onClick={() => {
                                            setEditForm({...editForm, LinkedECNId: '', ResolutionStatus: editForm.ResolutionStatus === 'ECN_Linked' ? 'Pending' : editForm.ResolutionStatus});
                                            onUpdateIssue(issue.id, { LinkedECNId: '', ResolutionStatus: editForm.ResolutionStatus === 'ECN_Linked' ? 'Pending' : editForm.ResolutionStatus }, { previousStatus: 'ECN 연동 해제', newStatus: '수정됨' });
                                        }} className="text-slate-400 hover:text-rose-500 ml-2 shrink-0"><X size={12}/></button>
                                    </div>
                                ) : (
                                    <select value={editForm.LinkedECNId} onChange={e => { 
                                        const val = e.target.value; 
                                        setEditForm({...editForm, LinkedECNId: val, ResolutionStatus: val ? 'ECN_Linked' : editForm.ResolutionStatus}); 
                                        onUpdateIssue(issue.id, { LinkedECNId: val, ResolutionStatus: val ? 'ECN_Linked' : editForm.ResolutionStatus }, { previousStatus: 'ECN 연동', newStatus: '수정됨' }); 
                                    }} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-slate-600 outline-none">
                                        <option value="">연동된 문서 없음 (클릭하여 선택)</option>
                                        {ecnList.map(ecn => <option key={ecn.id} value={ecn.id}>[{ecn.ECNNumber}] {ecn.Title}</option>)}
                                    </select>
                                )}
                            </div>

                            <div className={`border rounded-xl p-2.5 transition-all ${linkedProjectDoc ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-white'}`}>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[10px] font-black text-slate-500">Project</span>
                                    {!linkedProjectDoc && <button onClick={handleCreateNewProject} className="text-[9px] font-black text-emerald-600 hover:underline flex items-center gap-0.5"><Plus size={10}/>신규</button>}
                                </div>
                                {linkedProjectDoc ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <span className="text-[11px] font-bold text-slate-800 truncate">{linkedProjectDoc.name}</span>
                                        </div>
                                        <button onClick={() => {
                                            setEditForm({...editForm, LinkedProjectId: '', ResolutionStatus: editForm.ResolutionStatus === 'Project_Linked' ? 'Pending' : editForm.ResolutionStatus});
                                            onUpdateIssue(issue.id, { LinkedProjectId: '', ResolutionStatus: editForm.ResolutionStatus === 'Project_Linked' ? 'Pending' : editForm.ResolutionStatus }, { previousStatus: '프로젝트 연동 해제', newStatus: '수정됨' });
                                        }} className="text-slate-400 hover:text-rose-500 ml-2 shrink-0"><X size={12}/></button>
                                    </div>
                                ) : (
                                    <select value={editForm.LinkedProjectId} onChange={e => { 
                                        const val = e.target.value; 
                                        setEditForm({...editForm, LinkedProjectId: val, ResolutionStatus: val ? 'Project_Linked' : editForm.ResolutionStatus}); 
                                        onUpdateIssue(issue.id, { LinkedProjectId: val, ResolutionStatus: val ? 'Project_Linked' : editForm.ResolutionStatus }, { previousStatus: '프로젝트 연동', newStatus: '수정됨' }); 
                                    }} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-slate-600 outline-none">
                                        <option value="">연동된 프로젝트 없음 (클릭하여 선택)</option>
                                        {projectList.map(proj => <option key={proj.id} value={proj.id}>{proj.name}</option>)}
                                    </select>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>, document.body
    );
}
