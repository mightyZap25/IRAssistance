import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc, orderBy } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
    AlertCircle, Bug, CheckCircle, Clock, FileText, Filter, HelpCircle, 
    MessageSquare, Plus, RefreshCw, Search, ShieldAlert, User, Users, 
    X, ArrowRight, CornerDownRight, ClipboardList, Calendar, Bookmark, BarChart2,
    LayoutGrid, List, Kanban, ExternalLink
} from 'lucide-react';
import MondayBoard from '../components/common/MondayBoard';
import IssueCardView   from '../components/IssueCardView';
import IssueKanbanView from '../components/IssueKanbanView';

const CATEGORY_MAP = {
    Bug:      { label: '버그',       color: 'bg-rose-50 border-rose-200 text-rose-700', icon: Bug },
    Feature:  { label: '기능 추가/변경', color: 'bg-purple-50 border-purple-200 text-purple-700', icon: Plus },
    Test:     { label: '기능 테스트',  color: 'bg-blue-50 border-blue-200 text-blue-700', icon: ClipboardList },
    Customer: { label: '고객 피드백',  color: 'bg-amber-50 border-amber-200 text-amber-700', icon: HelpCircle }
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
            const [issueSnap, userSnap, partsSnap, ecnSnap] = await Promise.all([
                getDocs(query(collection(db, 'project_issues'), orderBy('CreatedAt', 'desc'))),
                getDocs(collection(db, 'users')),
                getDocs(collection(db, 'parts')),
                getDocs(query(collection(db, 'ecns'), orderBy('CreatedAt', 'desc')))
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
                map[issue.Category] = { label: issue.Category, color: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: Bookmark };
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
            result = result.filter(i => i.AssigneeUid === currentUser?.uid);
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
            const issueDoc = {
                ...newIssueData,
                DueDate: '', Priority: newIssueData.Priority || 'Medium', Status: 'Pending',
                CreatedBy: userProfile?.name || currentUser?.displayName || '사용자', CreatedByEmail: currentUser?.email || '', CreatedByUid: currentUser?.uid || '',
                CreatedAt: serverTimestamp(), Difficulty: 'Medium', AnalysisNotes: '', ResolutionNotes: '', Comments: [],
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
        <div className="h-full flex flex-col space-y-4">
            <div className="flex justify-between items-end shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <AlertCircle className="text-indigo-600" size={28} /> 이슈 및 요구사항 관리
                    </h1>
                </div>
                <button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-black text-xs shadow-md transition-all"><Plus size={16} /> 이슈 등록</button>
            </div>

            <div className="grid grid-cols-4 gap-4 shrink-0">
                {[ { t: '전체', v: stats.total, c: 'text-slate-800' }, { t: '검토중', v: stats.pending, c: 'text-cyan-600' }, { t: '진행중', v: stats.inProgress, c: 'text-amber-600' }, { t: '완료', v: stats.resolved, c: 'text-emerald-600' } ].map((s, idx) => (
                    <div key={idx} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                        <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">{s.t}</p>
                        <p className={`text-xl font-black ${s.c}`}>{s.v}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-2">
                        {[ { k: 'ALL', l: '전체' }, { k: 'MY_DEPT', l: '우리 부서' }, { k: 'MY_ASSIGNED', l: '내 배정' } ].map(t => (
                            <button key={t.k} onClick={() => setActiveTab(t.k)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${activeTab === t.k ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-200/50'}`}>{t.l}</button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                            {[ { m: 'card', i: LayoutGrid }, { m: 'list', i: List }, { m: 'kanban', i: Kanban } ].map(v => (
                                <button key={v.m} onClick={() => setViewMode(v.m)} className={`p-1.5 rounded transition-all ${viewMode === v.m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}><v.i size={14}/></button>
                            ))}
                        </div>
                        <input type="text" placeholder="검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                </div>

                <div className={`flex-1 ${viewMode === 'kanban' ? 'overflow-hidden' : 'overflow-y-auto'} p-4 bg-slate-50/30`}>
                    {loading ? <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-indigo-600" size={24} /></div> : filteredIssues.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-slate-300"><p className="text-xs font-black">데이터가 없습니다.</p></div> : 
                        viewMode === 'list' ? <MondayBoard tasks={filteredIssues} onSelect={setSelectedIssue} onUpdateTask={handleUpdateIssue} onAddTask={() => setIsCreateOpen(true)} /> : 
                        viewMode === 'kanban' ? <IssueKanbanView issues={filteredIssues} allCategories={allCategories} STATUS_MAP={STATUS_MAP} PRIORITY_MAP={PRIORITY_MAP} KANBAN_COLUMNS={KANBAN_COLUMNS} userProfile={userProfile} onSelect={setSelectedIssue} onStatusChange={(id, ns, ps) => handleUpdateIssue(id, { Status: ns }, { previousStatus: ps, newStatus: ns, message: `칸반 이동: ${ps} ➔ ${ns}` })} /> :
                        <IssueCardView issues={filteredIssues} allCategories={allCategories} STATUS_MAP={STATUS_MAP} PRIORITY_MAP={PRIORITY_MAP} onSelect={setSelectedIssue} />
                    }
                </div>
            </div>

            <CreateIssueModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSave={handleSaveIssue} existingCategories={Object.keys(allCategories)} products={products} />
            <IssueDetailPanel isOpen={!!selectedIssue} onClose={() => setSelectedIssue(null)} issue={selectedIssue} users={users} userProfile={userProfile} currentUser={currentUser} onUpdateIssue={handleUpdateIssue} onAddComment={handleAddComment} allCategories={allCategories} ecnList={ecnList} />
        </div>
    );
}

function CreateIssueModal({ isOpen, onClose, onSave, existingCategories, products }) {
    const [form, setForm] = useState({ Title: '', Description: '', Category: 'Bug', TargetDept: '개발', Priority: 'Medium', TargetProductID: '', TargetProductName: '', ProductSeries: '', ProductCommType: '' });
    useEffect(() => { if (isOpen) setForm({ Title: '', Description: '', Category: 'Bug', TargetDept: '개발', Priority: 'Medium', TargetProductID: '', TargetProductName: '', ProductSeries: '', ProductCommType: '' }); }, [isOpen]);
    const handleSubmit = (e) => { e.preventDefault(); if (!form.Title.trim() || !form.Description.trim()) return alert("입력 필요"); onSave(form); };
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 font-black text-sm">신규 이슈 등록 <button type="button" onClick={onClose}><X size={18}/></button></div>
                <div className="p-5 space-y-3 flex-1 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <input type="text" placeholder="제목" value={form.Title} onChange={e => setForm({...form, Title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none" required />
                    <textarea placeholder="설명" value={form.Description} onChange={e => setForm({...form, Description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium outline-none resize-none" rows="4" required />
                    <div className="grid grid-cols-2 gap-3">
                        <select value={form.Category} onChange={e => setForm({...form, Category: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold"><option value="Bug">버그</option><option value="Feature">기능변경</option></select>
                        <select value={form.TargetDept} onChange={e => setForm({...form, TargetDept: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold">{DEPARTMENTS.map(d => <option key={d} value={d}>{d}부서</option>)}</select>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-black text-slate-500 bg-slate-100 rounded-lg">취소</button><button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black">등록</button></div>
            </form>
        </div>, document.body
    );
}

function IssueDetailPanel({ isOpen, onClose, issue, users, userProfile, currentUser, onUpdateIssue, onAddComment, allCategories, ecnList }) {
    const [editForm, setEditForm] = useState({ TargetDept: '', AssigneeUid: '', Priority: '', Difficulty: '', DueDate: '', AnalysisNotes: '', ResolutionNotes: '', LinkedECNId: '', Documents: [] });
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('info'); // 'info', 'erp', 'history'

    useEffect(() => { 
        if (isOpen && issue) {
            setEditForm({ 
                TargetDept: issue.TargetDept || '개발', 
                AssigneeUid: issue.AssigneeUid || '', 
                Priority: issue.Priority || 'Medium', 
                Difficulty: issue.Difficulty || 'Medium', 
                DueDate: issue.DueDate || '', 
                AnalysisNotes: issue.AnalysisNotes || '', 
                ResolutionNotes: issue.ResolutionNotes || '', 
                LinkedECNId: issue.LinkedECNId || '', 
                Documents: issue.Documents || [] 
            });
            setActiveTab('info');
        }
    }, [isOpen, issue]);

    if (!isOpen || !issue) return null;

    const deptMembers = users.filter(u => u.department === editForm.TargetDept);

    const handleSave = async () => { 
        setLoading(true); 
        const assignee = users.find(u => u.uid === editForm.AssigneeUid); 
        await onUpdateIssue(issue.id, { ...editForm, AssigneeName: assignee ? assignee.name : '' }, { previousStatus: '수정', newStatus: '수정됨' }); 
        setLoading(false); 
        alert("저장됨"); 
    };

    const handleStatus = async (ns, sn) => { 
        setLoading(true); 
        const assignee = users.find(u => u.uid === editForm.AssigneeUid); 
        await onUpdateIssue(issue.id, { Status: ns, ...editForm, AssigneeName: assignee ? assignee.name : '' }, { previousStatus: issue.Status, newStatus: ns, message: `상태 변경: ${ns} (${sn})` }); 
        setLoading(false); 
    };

    const handleCommentSubmit = async (e) => { 
        e.preventDefault(); 
        if (!newComment.trim()) return; 
        await onAddComment(issue.id, newComment.trim()); 
        setNewComment(''); 
    };

    return createPortal(
        <div className='relative z-[9999]'>
            <div className='fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[140]' onClick={onClose} />
            <div className='fixed inset-y-0 right-0 w-full md:w-[520px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300'>
                {/* Header */}
                <div className='bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0 text-left'>
                    <div>
                        <div className='flex gap-1.5 mb-1.5'>
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${allCategories[issue.Category]?.color}`}>
                                {allCategories[issue.Category]?.label}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${STATUS_MAP[issue.Status]?.color}`}>
                                {STATUS_MAP[issue.Status]?.label}
                            </span>
                        </div>
                        <h2 className='text-lg font-black text-slate-900 tracking-tight'>{issue.Title}</h2>
                    </div>
                    <button onClick={onClose} className='p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-xl transition-colors'><X size={20}/></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-white shrink-0 px-2">
                    {[
                        { id: 'info', label: '상세 정보', icon: ClipboardList },
                        { id: 'erp', label: 'ERP 연동', icon: Package },
                        { id: 'history', label: '활동 이력', icon: History }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-black transition-all border-b-2 ${
                                activeTab === tab.id 
                                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' 
                                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className='flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-left'>
                    {activeTab === 'info' && (
                        <>
                            <div className='bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm'>
                                <div className='flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-2'>
                                    <FileText size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Description</span>
                                </div>
                                <div className='text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium'>{issue.Description}</div>
                                {issue.TargetProductName && (
                                    <div className='pt-3 border-t border-slate-50 flex items-center justify-between'>
                                        <span className='text-[10px] font-black text-slate-400 uppercase tracking-tighter'>Target Product</span>
                                        <span className='text-xs font-black text-indigo-600 px-2 py-1 bg-indigo-50 rounded-lg'>{issue.TargetProductName}</span>
                                    </div>
                                )}
                            </div>

                            <div className='bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-sm'>
                                <div className='flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-2'>
                                    <Users size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Management & Workflow</span>
                                </div>
                                <div className='grid grid-cols-2 gap-4'>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">배정 부서</label>
                                        <select value={editForm.TargetDept} onChange={e => setEditForm({...editForm, TargetDept: e.target.value, AssigneeUid: ''})} className='w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all'>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}부서</option>)}</select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">담당자</label>
                                        <select value={editForm.AssigneeUid} onChange={e => setEditForm({...editForm, AssigneeUid: e.target.value})} className='w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all'><option value=''>미지정</option>{deptMembers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}</select>
                                    </div>
                                </div>
                                <div className='flex gap-3 pt-2'>
                                    {issue.Status === 'Pending' && <button onClick={() => handleStatus('InProgress', '시작')} className='flex-1 bg-indigo-600 text-white text-xs py-3 rounded-xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all'>작업 시작 (START)</button>}
                                    {issue.Status === 'InProgress' && <button onClick={() => handleStatus('Resolved', '완료')} className='flex-1 bg-emerald-600 text-white text-xs py-3 rounded-xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all'>조치 완료 (RESOLVE)</button>}
                                    {['Resolved', 'Rejected', 'Archived'].includes(issue.Status) && <button onClick={() => handleStatus('InProgress', '재개')} className='flex-1 bg-slate-800 text-white text-xs py-3 rounded-xl font-black hover:bg-slate-900 transition-all'>다시 시작 (REOPEN)</button>}
                                </div>
                            </div>

                            <div className='bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm'>
                                <div className='flex items-center gap-2 text-slate-400 border-b border-slate-100 pb-2'>
                                    <FileText size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Analysis & Resolution Report</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">원인 분석 (Root Cause)</label>
                                        <textarea rows={3} value={editForm.AnalysisNotes} onChange={e => setEditForm({...editForm, AnalysisNotes: e.target.value})} placeholder='원인 및 현상 분석 내용을 입력하세요...' className='w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all' />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">조치 결과 (Resolution)</label>
                                        <textarea rows={3} value={editForm.ResolutionNotes} onChange={e => setEditForm({...editForm, ResolutionNotes: e.target.value})} placeholder='최종 조치 결과 및 재발 방지 대책을 입력하세요...' className='w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all' />
                                    </div>
                                </div>
                                <button onClick={handleSave} disabled={loading} className='w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-md'>{loading ? 'SAVING...' : 'Save Detailed Report'}</button>
                            </div>
                        </>
                    )}

                    {activeTab === 'erp' && (
                        <div className="space-y-4">
                            <div className='bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm'>
                                <div className='flex items-center gap-2 text-slate-400 border-b border-slate-100 pb-2'>
                                    <Layers size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Linked ERP Data</span>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2">연관 설계 변경 (ECN)</p>
                                        <div className='flex gap-2'>
                                            <select value={editForm.LinkedECNId} onChange={e => setEditForm({...editForm, LinkedECNId: e.target.value})} className='flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black outline-none'>
                                                <option value=''>연관 ECN 선택...</option>
                                                {ecnList.map(e => <option key={e.id} value={e.id}>[{e.ECNNumber}] {e.Title}</option>)}
                                            </select>
                                            {editForm.LinkedECNId && (
                                                <button onClick={() => window.open(`/ecn?id=${editForm.LinkedECNId}`, '_blank')} className='p-2 bg-white border border-slate-200 rounded-xl text-indigo-600 hover:bg-indigo-50 transition-colors shadow-sm'>
                                                    <ExternalLink size={16}/>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-10 text-slate-400">
                                        <Package size={24} className="mb-2 opacity-20" />
                                        <p className="text-xs font-black">품목 재고 및 생산 정보</p>
                                        <p className="text-[10px] font-bold mt-1">이슈와 연관된 품목의 실시간 데이터를 불러옵니다.</p>
                                        <button className="mt-4 px-4 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black hover:bg-slate-200 transition-colors">데이터 동기화</button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className='bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm'>
                                <div className='flex items-center gap-2 text-slate-400 border-b border-slate-100 pb-2'>
                                    <Bookmark size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Attachments & Checklists</span>
                                </div>
                                <div className="border-2 border-dashed border-slate-100 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer group">
                                    <Plus size={20} className="mx-auto mb-2 text-slate-300 group-hover:text-indigo-500" />
                                    <p className="text-[10px] font-black text-slate-400 group-hover:text-slate-600">파일을 드래그하거나 클릭하여 업로드</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-4">
                            <div className='bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm'>
                                <div className='flex items-center gap-2 text-slate-400 border-b border-slate-100 pb-2'>
                                    <MessageSquare size={14} /><span className='text-[10px] font-black uppercase tracking-widest'>Team Collaboration</span>
                                </div>
                                <form onSubmit={handleCommentSubmit} className='flex gap-2'>
                                    <input type='text' placeholder='의견이나 피드백을 입력하세요...' value={newComment} onChange={e => setNewComment(e.target.value)} className='flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500' />
                                    <button type='submit' className='px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-indigo-700 transition-all'>POST</button>
                                </form>
                                <div className='space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar'>
                                    {(() => { 
                                        const list = []; 
                                        (issue.Comments || []).forEach(c => list.push({ type: 'comment', ...c, date: new Date(c.timestamp) })); 
                                        (issue.History || []).forEach(h => list.push({ type: 'history', author: h.updatedBy, text: h.message, date: new Date(h.timestamp) })); 
                                        list.sort((a, b) => b.date - a.date); 
                                        
                                        return list.length > 0 ? list.map((item, idx) => ( 
                                            <div key={idx} className={`p-3 rounded-xl border ${item.type === 'comment' ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400'}`}>
                                                <div className='flex justify-between items-center mb-1.5 font-black text-[10px]'>
                                                    <span className={item.type === 'comment' ? 'text-indigo-600' : ''}>{item.author}</span>
                                                    <span className="opacity-50 font-bold tabular-nums">{item.date.toLocaleString()}</span>
                                                </div>
                                                <p className='text-xs font-bold leading-relaxed text-slate-700'>{item.text}</p>
                                            </div> 
                                        )) : (
                                            <div className="py-10 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">No Activity Yet</div>
                                        ); 
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>, document.body
    );
}
