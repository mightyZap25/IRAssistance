import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc, orderBy } from 'firebase/firestore';
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

                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
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
    useEffect(() => { if (isOpen && issue) setEditForm({ TargetDept: issue.TargetDept || '개발', AssigneeUid: issue.AssigneeUid || '', Priority: issue.Priority || 'Medium', Difficulty: issue.Difficulty || 'Medium', DueDate: issue.DueDate || '', AnalysisNotes: issue.AnalysisNotes || '', ResolutionNotes: issue.ResolutionNotes || '', LinkedECNId: issue.LinkedECNId || '', Documents: issue.Documents || [] }); }, [isOpen, issue]);
    if (!isOpen || !issue) return null;
    const deptMembers = users.filter(u => u.department === editForm.TargetDept);
    const handleSave = async () => { setLoading(true); const assignee = users.find(u => u.uid === editForm.AssigneeUid); await onUpdateIssue(issue.id, { ...editForm, AssigneeName: assignee ? assignee.name : '' }, { previousStatus: '수정', newStatus: '수정됨' }); setLoading(false); alert("저장됨"); };
    const handleStatus = async (ns, sn) => { setLoading(true); const assignee = users.find(u => u.uid === editForm.AssigneeUid); await onUpdateIssue(issue.id, { Status: ns, ...editForm, AssigneeName: assignee ? assignee.name : '' }, { previousStatus: issue.Status, newStatus: ns, message: `상태 변경: ${ns} (${sn})` }); setLoading(false); };
    const handleCommentSubmit = async (e) => { e.preventDefault(); if (!newComment.trim()) return; await onAddComment(issue.id, newComment.trim()); setNewComment(''); };
    return createPortal(
        <div className='relative z-[9999]'><div className='fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[140]' onClick={onClose} />
            <div className='fixed inset-y-0 right-0 w-full md:w-[500px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300'>
                <div className='bg-white px-5 py-4 border-b border-slate-200 flex justify-between items-start shrink-0'>
                    <div>
                        <div className='flex gap-1.5 mb-1'><span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${allCategories[issue.Category]?.color}`}>{allCategories[issue.Category]?.label}</span><span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${STATUS_MAP[issue.Status]?.color}`}>{STATUS_MAP[issue.Status]?.label}</span></div>
                        <h2 className='text-sm font-black text-slate-900'>{issue.Title}</h2>
                    </div>
                    <button onClick={onClose} className='p-1.5 text-slate-400 hover:text-slate-700'><X size={18}/></button>
                </div>
                <div className='flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar'>
                    <div className='bg-white border border-slate-200 rounded-xl p-4 space-y-3'>
                        <div className='flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-2'><FileText size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Description</span></div>
                        <div className='text-xs text-slate-700 leading-relaxed whitespace-pre-wrap'>{issue.Description}</div>
                        {(issue.TargetProductName) && <div className='pt-2 border-t border-slate-50'><span className='text-[9px] font-bold text-slate-400 uppercase mr-2'>Product</span><span className='text-xs font-black text-indigo-600 border-b-2 border-indigo-100'>{issue.TargetProductName}</span></div>}
                    </div>
                    <div className='bg-white border border-slate-200 rounded-xl p-4 space-y-4'>
                        <div className='flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-2'><Users size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Management</span></div>
                        <div className='grid grid-cols-2 gap-3'>
                            <select value={editForm.TargetDept} onChange={e => setEditForm({...editForm, TargetDept: e.target.value, AssigneeUid: ''})} className='w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold'>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
                            <select value={editForm.AssigneeUid} onChange={e => setEditForm({...editForm, AssigneeUid: e.target.value})} className='w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold'><option value=''>미지정</option>{deptMembers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}</select>
                        </div>
                        <div className='flex gap-2'>{issue.Status === 'Pending' && <button onClick={() => handleStatus('InProgress', '시작')} className='flex-1 bg-indigo-600 text-white text-[10px] py-2 rounded-lg font-black'>START WORK</button>}{issue.Status === 'InProgress' && <button onClick={() => handleStatus('Resolved', '완료')} className='flex-1 bg-emerald-600 text-white text-[10px] py-2 rounded-lg font-black'>COMPLETE</button>}</div>
                    </div>
                    <div className='bg-white border border-slate-200 rounded-xl p-4 space-y-4'>
                        <div className='flex items-center gap-2 text-slate-400 border-b border-slate-100 pb-2'><FileText size={14}/><span className='text-[10px] font-black uppercase tracking-widest'>Report</span></div>
                        <textarea rows={3} value={editForm.AnalysisNotes} onChange={e => setEditForm({...editForm, AnalysisNotes: e.target.value})} placeholder='원인 분석...' className='w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none' />
                        <textarea rows={3} value={editForm.ResolutionNotes} onChange={e => setEditForm({...editForm, ResolutionNotes: e.target.value})} placeholder='조치 결과...' className='w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none' />
                        <div className='flex gap-2'><select value={editForm.LinkedECNId} onChange={e => setEditForm({...editForm, LinkedECNId: e.target.value})} className='flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-black'><option value=''>LINK ECN...</option>{ecnList.map(e => <option key={e.id} value={e.id}>{e.Title}</option>)}</select>{editForm.LinkedECNId && <a href={`/ecn?id=${editForm.LinkedECNId}`} target='_blank' rel='noreferrer' className='p-2 bg-slate-100 rounded-lg'><ExternalLink size={14}/></a>}</div>
                        <button onClick={handleSave} disabled={loading} className='w-full bg-slate-900 text-white py-2 rounded-lg text-[10px] font-black uppercase'>{loading ? 'SAVING...' : 'Save Changes'}</button>
                    </div>
                    <div className='bg-white border border-slate-200 rounded-xl p-4 space-y-3 mb-4'>
                        <div className='flex items-center gap-2 text-slate-400 border-b border-slate-100 pb-2'><MessageSquare size={14} /><span className='text-[10px] font-black uppercase tracking-widest'>Feedback</span></div>
                        <form onSubmit={handleCommentSubmit} className='flex gap-2 mb-3'>
                            <input type='text' placeholder='의견...' value={newComment} onChange={e => setNewComment(e.target.value)} className='flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs outline-none' />
                            <button type='submit' className='px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black'>POST</button>
                        </form>
                        <div className='space-y-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar'>{(() => { const list = []; (issue.Comments || []).forEach(c => list.push({ type: 'comment', ...c, date: new Date(c.timestamp) })); (issue.History || []).forEach(h => list.push({ type: 'history', author: h.updatedBy, text: h.message, date: new Date(h.timestamp) })); list.sort((a, b) => b.date - a.date); return list.map((item, idx) => ( <div key={idx} className={`p-2 rounded-lg border ${item.type === 'comment' ? 'bg-white border-slate-50' : 'bg-slate-50/50 border-transparent text-slate-400'}`}><div className='flex justify-between items-center mb-0.5 font-black text-[9px]'><span>{item.author}</span><span>{item.date.toLocaleDateString()}</span></div><p className='text-[10px] font-medium leading-snug'>{item.text}</p></div> )); })()}</div>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
}
