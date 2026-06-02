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

const DIFFICULTY_MAP = {
    High:   { label: '어려움 (상)', color: 'text-rose-600 border-rose-200' },
    Medium: { label: '보통 (중)', color: 'text-amber-600 border-amber-200' },
    Low:    { label: '쉬움 (하)', color: 'text-slate-600 border-slate-200' }
};

const DEPARTMENTS = ['개발', 'QA', '생산', '영업', '관리'];

export default function ProjectIssuesPage() {
    const { currentUser, userProfile } = useAuth();
    const [issues, setIssues] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]); // 완제품 상태 추가
    const [ecnList, setEcnList] = useState([]); // ECN 목록 추가

    // 필터/검색 조건
    const [activeTab, setActiveTab] = useState('ALL'); // ALL | MY_DEPT | MY_ASSIGNED
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deptFilter, setDeptFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('card'); // card | list | kanban

    // 모달 및 사이드 패널 상태
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
                return {
                    id: doc.id,
                    ...data,
                    Status: status
                };
            });
            const userList = userSnap.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            }));
            const partsList = partsSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            const ecns = ecnSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // 완제품 필터링 (Class === 'Product (P)' 또는 Category에 '완제품' 포함 또는 PartID가 'IRP'로 시작)
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
            console.error("Error loading issues/users/parts/ecns:", err);
        } finally {
            setLoading(false);
        }
    };

    // 통계 계산
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

    // 동적 카테고리 목록 구성 (기본 4개 + DB 내 등록된 고유 카테고리)
    const allCategories = useMemo(() => {
        const map = { ...CATEGORY_MAP };
        issues.forEach(issue => {
            if (issue.Category && !map[issue.Category]) {
                map[issue.Category] = {
                    label: issue.Category,
                    color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
                    icon: Bookmark
                };
            }
        });
        return map;
    }, [issues]);

    // 필터 가공
    const filteredIssues = useMemo(() => {
        let result = issues;

        // 1. 대분류 탭 필터
        if (activeTab === 'MY_DEPT') {
            const myDept = userProfile?.department || '';
            result = result.filter(i => i.TargetDept === myDept);
        } else if (activeTab === 'MY_ASSIGNED') {
            result = result.filter(i => i.AssigneeUid === currentUser?.uid);
        }

        // 2. 카테고리 필터
        if (categoryFilter !== 'all') {
            result = result.filter(i => i.Category === categoryFilter);
        }

        // 3. 상태 필터
        if (statusFilter !== 'all') {
            result = result.filter(i => i.Status === statusFilter);
        }

        // 4. 담당 부서 필터
        if (deptFilter !== 'all') {
            result = result.filter(i => i.TargetDept === deptFilter);
        }

        // 5. 중요도 필터
        if (priorityFilter !== 'all') {
            result = result.filter(i => i.Priority === priorityFilter);
        }

        // 6. 검색 필터 (제목, 설명, 배정자, 등록자)
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(i => 
                (i.Title || '').toLowerCase().includes(lower) ||
                (i.Description || '').toLowerCase().includes(lower) ||
                (i.AssigneeName || '').toLowerCase().includes(lower) ||
                (i.CreatedBy || '').toLowerCase().includes(lower)
            );
        }

        return result;
    }, [issues, activeTab, categoryFilter, statusFilter, deptFilter, priorityFilter, searchTerm, userProfile, currentUser]);

    // 신규 이슈 저장
    const handleSaveIssue = async (newIssueData) => {
        try {
            const issueDoc = {
                ...newIssueData,
                DueDate: '', // 등록 시 완료 예정일은 공란으로 시작, 담당자 지정 후 검토 시 설정
                Priority: newIssueData.Priority || 'Medium', // 신청자가 입력한 희망 중요도 적용 (담당자가 변경 가능)
                Status: 'Pending',
                CreatedBy: userProfile?.name || currentUser?.displayName || currentUser?.email || '시스템 사용자',
                CreatedByEmail: currentUser?.email || '',
                CreatedByUid: currentUser?.uid || '',
                CreatedAt: serverTimestamp(),
                Difficulty: 'Medium', // 기본 난이도 보통
                AnalysisNotes: '',
                ResolutionNotes: '',
                Comments: [],
                History: [
                    {
                        logId: `log_${Date.now()}`,
                        updatedBy: userProfile?.name || currentUser?.displayName || '시스템',
                        previousStatus: '-',
                        newStatus: '접수 대기 (Pending)',
                        timestamp: new Date().toISOString()
                    }
                ]
            };

            await addDoc(collection(db, 'project_issues'), issueDoc);
            await fetchData();
            setIsCreateOpen(false);
        } catch (error) {
            console.error("이슈 생성 실패:", error);
            alert("이슈 생성 중 오류가 발생했습니다.");
        }
    };

    // 이슈 업데이트 (상세 정보 수정, 검토 의견, 상태 전이 등)
    const handleUpdateIssue = async (issueId, updatedFields, transitionLog) => {
        try {
            const issueRef = doc(db, 'project_issues', issueId);
            const dataToUpdate = { ...updatedFields };

            if (transitionLog) {
                const targetIssue = issues.find(i => i.id === issueId);
                const currentHistory = targetIssue?.History || [];
                dataToUpdate.History = [
                    {
                        logId: `log_${Date.now()}`,
                        updatedBy: userProfile?.name || currentUser?.displayName || '시스템',
                        ...transitionLog,
                        timestamp: new Date().toISOString()
                    },
                    ...currentHistory
                ];
            }

            await updateDoc(issueRef, dataToUpdate);
            await fetchData();
            
            // 패널에 선택된 상세정보 동기화
            setIssues(prev => {
                const index = prev.findIndex(i => i.id === issueId);
                if (index !== -1) {
                    const freshIssue = { ...prev[index], ...dataToUpdate };
                    if (selectedIssue?.id === issueId) {
                        setSelectedIssue(freshIssue);
                    }
                }
                return prev;
            });
        } catch (error) {
            console.error("이슈 업데이트 실패:", error);
            alert("수정사항 저장 실패");
        }
    };

    // 칸반 드래그로 상태 변경
    const handleDragStatusUpdate = async (issueId, newStatus, previousStatus) => {
        await handleUpdateIssue(issueId, { Status: newStatus }, {
            previousStatus,
            newStatus,
            message: `칸반 이동: [${STATUS_MAP[previousStatus]?.label || previousStatus}] ➔ [${STATUS_MAP[newStatus]?.label || newStatus}]`
        });
    };

    // 댓글 저장
    const handleAddComment = async (issueId, commentText) => {
        if (!commentText.trim()) return;
        try {
            const targetIssue = issues.find(i => i.id === issueId);
            const currentComments = targetIssue?.Comments || [];
            
            const newComment = {
                commentId: `comment_${Date.now()}`,
                author: userProfile?.name || currentUser?.displayName || '팀원',
                text: commentText,
                timestamp: new Date().toISOString()
            };

            await updateDoc(doc(db, 'project_issues', issueId), {
                Comments: [...currentComments, newComment]
            });
            await fetchData();
            
            // 세션 상태 갱신
            if (selectedIssue?.id === issueId) {
                setSelectedIssue(prev => ({
                    ...prev,
                    Comments: [...(prev.Comments || []), newComment]
                }));
            }
        } catch (error) {
            console.error("댓글 추가 실패:", error);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* Header */}
            <div className="flex justify-between items-end shrink-0 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <AlertCircle className="text-indigo-600 animate-pulse" size={32} />
                        이슈 및 요구사항 관리
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">
                        버그, 기능 변경 요청, 테스트 시나리오 검증 등 내/외부 고객 소통 이슈 관리
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-md shadow-indigo-100 transition-all transform hover:scale-[1.02]"
                >
                    <Plus size={18} />
                    이슈 등록
                </button>
            </div>

            {/* Dashboard Stats */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-500 border border-slate-100"><BarChart2 size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">총 이슈 건수</p>
                        <p className="text-2xl font-black text-slate-800">{stats.total.toLocaleString()}<span className="text-xs font-bold text-slate-400 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-cyan-50 rounded-xl text-cyan-600 border border-cyan-100 animate-pulse"><Search size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">접수/검토 중</p>
                        <p className="text-2xl font-black text-cyan-600">{stats.pending.toLocaleString()}<span className="text-xs font-bold text-slate-400 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-500 border border-amber-100"><RefreshCw size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">진행 중</p>
                        <p className="text-2xl font-black text-amber-600">{stats.inProgress.toLocaleString()}<span className="text-xs font-bold text-slate-400 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500 border border-emerald-100"><CheckCircle size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">조치 완결 (완료/폐기/보류)</p>
                        <p className="text-2xl font-black text-emerald-600">{stats.resolved.toLocaleString()}<span className="text-xs font-bold text-slate-400 ml-1">건</span></p>
                    </div>
                </div>
            </div>

            {/* Filter & List Area */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Toolbars */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-4">
                    {/* Tab Navigation */}
                    <div className="flex justify-between items-center">
                        <div className="flex gap-1.5">
                            {[
                                { key: 'ALL',          label: '전체 이슈' },
                                { key: 'MY_DEPT',      label: '우리 부서 이슈' },
                                { key: 'MY_ASSIGNED',  label: '내게 배정된 이슈' }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`px-4.5 py-2 rounded-xl text-xs font-black transition-colors ${
                                        activeTab === tab.key
                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {/* View Mode Switcher */}
                            <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 border border-slate-200">
                                {[
                                    { mode: 'card',   icon: LayoutGrid, label: '카드형' },
                                    { mode: 'list',   icon: List,       label: '리스트형' },
                                    { mode: 'kanban', icon: Kanban,     label: '칸반보드' }
                                ].map(item => (
                                    <button
                                        key={item.mode}
                                        onClick={() => setViewMode(item.mode)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                            viewMode === item.mode
                                                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/40'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                        title={item.label}
                                    >
                                        <item.icon size={12} />
                                        <span className="hidden sm:inline">{item.label}</span>
                                    </button>
                                ))}
                            </div>

                            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors" title="새로고침">
                                <RefreshCw size={16}/>
                            </button>
                        </div>
                    </div>

                    {/* Filter Elements */}
                    <div className="flex flex-wrap gap-3 items-center">
                        {/* 구분 필터 */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">이슈구분</span>
                            <select 
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                className="text-xs font-bold text-slate-700 bg-transparent outline-none focus:ring-0 cursor-pointer"
                            >
                                <option value="all">전체</option>
                                {Object.entries(allCategories).map(([key, val]) => (
                                    <option key={key} value={key}>{val.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* 상태 필터 */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">진행상태</span>
                            <select 
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="text-xs font-bold text-slate-700 bg-transparent outline-none focus:ring-0 cursor-pointer"
                            >
                                <option value="all">전체</option>
                                {Object.entries(STATUS_MAP).map(([key, value]) => (
                                    <option key={key} value={key}>{value.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* 부서 필터 */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">담당부서</span>
                            <select 
                                value={deptFilter}
                                onChange={e => setDeptFilter(e.target.value)}
                                className="text-xs font-bold text-slate-700 bg-transparent outline-none focus:ring-0 cursor-pointer"
                            >
                                <option value="all">전체</option>
                                {DEPARTMENTS.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>

                        {/* 중요도 필터 */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">중요도</span>
                            <select 
                                value={priorityFilter}
                                onChange={e => setPriorityFilter(e.target.value)}
                                className="text-xs font-bold text-slate-700 bg-transparent outline-none focus:ring-0 cursor-pointer"
                            >
                                <option value="all">전체</option>
                                <option value="High">높음 (상)</option>
                                <option value="Medium">보통 (중)</option>
                                <option value="Low">낮음 (하)</option>
                            </select>
                        </div>

                        {/* 검색창 */}
                        <div className="relative flex-1 max-w-sm ml-auto">
                            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input
                                type="text"
                                placeholder="제목, 설명, 담당자, 등록자 검색..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                            />
                        </div>
                    </div>
                </div>

                {/* List Container */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <RefreshCw className="animate-spin text-indigo-600 mb-3" size={32} />
                        </div>
                    ) : filteredIssues.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-450">
                            <ClipboardList size={48} className="mb-3 opacity-20 text-indigo-600" />
                            <p className="text-sm font-black">표시할 이슈가 없습니다.</p>
                            <p className="text-xs font-medium text-slate-400 mt-1">새로운 이슈를 등록하거나 필터를 확인해 보세요.</p>
                        </div>
                    ) : viewMode === 'list' ? (
                        <MondayBoard
                            tasks={filteredIssues}
                            onSelect={setSelectedIssue}
                            onUpdateTask={handleUpdateIssue}
                            onAddTask={() => setIsCreateOpen(true)}
                        />
                    ) : viewMode === 'kanban' ? (
                        <IssueKanbanView
                            issues={filteredIssues}
                            allCategories={allCategories}
                            STATUS_MAP={STATUS_MAP}
                            PRIORITY_MAP={PRIORITY_MAP}
                            KANBAN_COLUMNS={KANBAN_COLUMNS}
                            userProfile={userProfile}
                            onSelect={setSelectedIssue}
                            onStatusChange={handleDragStatusUpdate}
                        />
                    ) : (
                        <IssueCardView
                            issues={filteredIssues}
                            allCategories={allCategories}
                            STATUS_MAP={STATUS_MAP}
                            PRIORITY_MAP={PRIORITY_MAP}
                            onSelect={setSelectedIssue}
                        />
                    )}
                </div>
            </div>

            {/* Create Issue Modal */}
            <CreateIssueModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSave={handleSaveIssue}
                existingCategories={Object.keys(allCategories)}
                products={products}
            />

            {/* Sliding Detail & Review Side Panel */}
            <IssueDetailPanel
                isOpen={!!selectedIssue}
                onClose={() => setSelectedIssue(null)}
                issue={selectedIssue}
                users={users}
                userProfile={userProfile}
                currentUser={currentUser}
                onUpdateIssue={handleUpdateIssue}
                onAddComment={handleAddComment}
                allCategories={allCategories}
                ecnList={ecnList}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 신규 이슈 생성 모달 (Create Issue Modal)
// ─────────────────────────────────────────────────────────────
function CreateIssueModal({ isOpen, onClose, onSave, existingCategories, products }) {
    const [form, setForm] = useState({
        Title: '',
        Description: '',
        Category: 'Bug',
        TargetDept: '개발',
        Priority: 'Medium',
        TargetProductID: '',
        TargetProductName: '',
        ProductSeries: '',
        ProductCommType: ''
    });
    const [customCategory, setCustomCategory] = useState('');
    const [isCustom, setIsCustom] = useState(false);

    // 시리즈 직접 입력용
    const [isCustomSeries, setIsCustomSeries] = useState(false);
    const [customSeries, setCustomSeries] = useState('');

    // 통신타입 직접 입력용
    const [isCustomComm, setIsCustomComm] = useState(false);
    const [customComm, setCustomComm] = useState('');

    // DB 내 모든 완제품에서 고유 시리즈 및 통신 타입 목록 동적 추출
    const { uniqueSeries, uniqueCommTypes } = useMemo(() => {
        const seriesSet = new Set(['S-Series', 'M-Series', 'E-Series', 'I-Series']);
        const commSet = new Set(['RS-485', 'RS-232', 'Ethernet', 'CAN', 'Wi-Fi', 'Bluetooth']);

        if (products && Array.isArray(products)) {
            products.forEach(prod => {
                // 1) Spec JSON 파싱 시도
                if (prod.Spec) {
                    try {
                        const parsedSpec = JSON.parse(prod.Spec);
                        if (Array.isArray(parsedSpec)) {
                            const seriesObj = parsedSpec.find(item => item.label === '시리즈');
                            const commObj = parsedSpec.find(item => item.label === '통신 타입' || item.label === '통신타입');
                            if (seriesObj && seriesObj.value) seriesSet.add(seriesObj.value);
                            if (commObj && commObj.value) commSet.add(commObj.value);
                        }
                    } catch (e) {
                        // 일반 텍스트
                    }
                }
                
                // 2) 일반 텍스트 기반 감지 보완
                const fullText = `${prod.Name || ''} ${prod.Spec || ''} ${prod.Description || ''}`.toLowerCase();
                const seriesMatch = fullText.match(/([a-z0-9-]+)\s*(시리즈|series)/i);
                if (seriesMatch) {
                    const rawVal = seriesMatch[0].trim();
                    if (rawVal.length < 30) {
                        // 첫 글자 대문자화 등 적절히 정리 (예: "12Lf 시리즈")
                        seriesSet.add(rawVal);
                    }
                }
            });
        }

        return {
            uniqueSeries: Array.from(seriesSet).filter(Boolean),
            uniqueCommTypes: Array.from(commSet).filter(Boolean)
        };
    }, [products]);

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
                ProductSeries: '',
                ProductCommType: ''
            });
            setCustomCategory('');
            setIsCustom(false);
            setIsCustomSeries(false);
            setCustomSeries('');
            setIsCustomComm(false);
            setCustomComm('');
        }
    }, [isOpen]);

    const handleCategoryChange = (val) => {
        if (val === '__custom__') {
            setIsCustom(true);
            setForm(prev => ({ ...prev, Category: '' }));
        } else {
            setIsCustom(false);
            setForm(prev => ({ ...prev, Category: val }));
        }
    };

    const handleProductChange = (prodId) => {
        const prod = products.find(p => p.PartID === prodId);
        if (!prod) {
            setForm(prev => ({
                ...prev,
                TargetProductID: '',
                TargetProductName: '',
                ProductSeries: '',
                ProductCommType: ''
            }));
            setIsCustomSeries(false);
            setIsCustomComm(false);
            return;
        }

        // 완제품 정보 자동 파싱 및 추천 로직
        let inferredSeries = '';
        let inferredComm = '';

        // 1. Spec JSON 파싱 우선 시도
        if (prod.Spec) {
            try {
                const parsedSpec = JSON.parse(prod.Spec);
                if (Array.isArray(parsedSpec)) {
                    const seriesObj = parsedSpec.find(item => item.label === '시리즈');
                    const commObj = parsedSpec.find(item => item.label === '통신 타입' || item.label === '통신타입');
                    if (seriesObj && seriesObj.value) inferredSeries = seriesObj.value;
                    if (commObj && commObj.value) inferredComm = commObj.value;
                }
            } catch (e) {
                // 일반 텍스트이거나 파싱 실패 시 무시
            }
        }

        // 2. 텍스트 기반 매칭 Fallback
        if (!inferredSeries || !inferredComm) {
            const fullText = `${prod.Name || ''} ${prod.Spec || ''} ${prod.Description || ''}`.toLowerCase();

            if (!inferredSeries) {
                if (fullText.includes('s-series') || fullText.includes('s series')) inferredSeries = 'S-Series';
                else if (fullText.includes('m-series') || fullText.includes('m series')) inferredSeries = 'M-Series';
                else if (fullText.includes('e-series') || fullText.includes('e series')) inferredSeries = 'E-Series';
                else if (fullText.includes('i-series') || fullText.includes('i series')) inferredSeries = 'I-Series';
                else {
                    const match = fullText.match(/[a-z]\d{3}/i);
                    if (match) {
                        inferredSeries = match[0].toUpperCase();
                    } else {
                        const seriesMatch = fullText.match(/([a-z0-9-]+)\s*(시리즈|series)/i);
                        if (seriesMatch) {
                            inferredSeries = seriesMatch[0].trim();
                        }
                    }
                }
            }

            if (!inferredComm) {
                if (fullText.includes('rs-485') || fullText.includes('rs485')) inferredComm = 'RS-485';
                else if (fullText.includes('rs-232') || fullText.includes('rs232')) inferredComm = 'RS-232';
                else if (fullText.includes('ethernet') || fullText.includes('modbus tcp')) inferredComm = 'Ethernet';
                else if (fullText.includes('can')) inferredComm = 'CAN';
                else if (fullText.includes('wi-fi') || fullText.includes('wifi')) inferredComm = 'Wi-Fi';
                else if (fullText.includes('bluetooth') || fullText.includes('ble')) inferredComm = 'Bluetooth';
                else if (fullText.includes('modbus')) inferredComm = 'Modbus RTU';
            }
        }

        // 자동 파싱 매칭 시 커스텀 입력 플래그 초기화
        setIsCustomSeries(false);
        setIsCustomComm(false);

        setForm(prev => ({
            ...prev,
            TargetProductID: prod.PartID,
            TargetProductName: prod.Name,
            ProductSeries: inferredSeries || prev.ProductSeries,
            ProductCommType: inferredComm || prev.ProductCommType
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.Title.trim() || !form.Description.trim()) {
            return alert("제목과 상세 설명을 입력해 주십시오.");
        }
        
        let finalCategory = form.Category;
        if (isCustom) {
            if (!customCategory.trim()) {
                return alert("직접 입력할 카테고리명을 작성해 주십시오.");
            }
            finalCategory = customCategory.trim();
        }

        let finalSeries = form.ProductSeries;
        if (isCustomSeries) {
            finalSeries = customSeries.trim();
        }

        let finalComm = form.ProductCommType;
        if (isCustomComm) {
            finalComm = customComm.trim();
        }
        
        onSave({
            ...form,
            Category: finalCategory,
            ProductSeries: finalSeries,
            ProductCommType: finalComm
        });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <ClipboardList className="text-indigo-600"/> 신규 이슈 및 요구사항 등록
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">부적합, 버그, 피드백, 개선 아이디어 등록</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"><X size={18}/></button>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-4 flex-1 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">이슈 제목 <span className="text-rose-500">*</span></label>
                        <input
                            type="text"
                            value={form.Title}
                            onChange={e => setForm(prev => ({ ...prev, Title: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-950 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="간단 명료한 이슈 요약 기재"
                            required
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">상세 내용 <span className="text-rose-500">*</span></label>
                        <textarea
                            value={form.Description}
                            onChange={e => setForm(prev => ({ ...prev, Description: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="현상, 재현 경로, 발생 배경 등을 구체적으로 서술해 주세요."
                            rows="4"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">이슈 구분</label>
                            <select
                                value={isCustom ? '__custom__' : form.Category}
                                onChange={e => handleCategoryChange(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                            >
                                <option value="Bug">버그 / 결함</option>
                                <option value="Feature">기능 추가 및 변경 요청</option>
                                <option value="Test">기능 검증 테스트</option>
                                <option value="Customer">고객 소통 / 문의피드백</option>
                                {existingCategories && existingCategories.filter(cat => !['Bug', 'Feature', 'Test', 'Customer'].includes(cat)).map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                                <option value="__custom__">직접 입력...</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">담당 지정 부서</label>
                            <select
                                value={form.TargetDept}
                                onChange={e => setForm(prev => ({ ...prev, TargetDept: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                            >
                                {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}부서</option>)}
                            </select>
                        </div>
                    </div>

                    {isCustom && (
                        <div>
                            <label className="text-[10px] font-black text-indigo-650 uppercase tracking-widest block mb-1.5">새로운 이슈 구분 직접 입력</label>
                            <input
                                type="text"
                                value={customCategory}
                                onChange={e => setCustomCategory(e.target.value)}
                                className="w-full bg-indigo-50/50 border border-indigo-200 rounded-xl px-4 py-3 text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="예: 보안점검, 인프라개선 등"
                                required
                            />
                        </div>
                    )}

                    {/* 대상 완제품 및 시리즈/통신타입 태그 선택 (Option) */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200/80 space-y-3.5">
                        <div className="flex items-center justify-between border-b pb-1.5 mb-1">
                            <span className="text-[10px] font-black text-indigo-650 uppercase tracking-widest block">대상 제품 연동 (선택사항)</span>
                            <span className="text-[9px] font-bold text-slate-400">완제품 사양/태그 정보 자동 추천</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">대상 완제품</label>
                                <select
                                    value={form.TargetProductID}
                                    onChange={e => handleProductChange(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="">완제품 선택 안 함</option>
                                    {products && products.map(prod => (
                                        <option key={prod.PartID} value={prod.PartID}>{prod.Name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">제품 시리즈</label>
                                <select
                                    value={isCustomSeries ? '__custom__' : form.ProductSeries}
                                    onChange={e => {
                                        if (e.target.value === '__custom__') {
                                            setIsCustomSeries(true);
                                            setForm(prev => ({ ...prev, ProductSeries: '' }));
                                        } else {
                                            setIsCustomSeries(false);
                                            setForm(prev => ({ ...prev, ProductSeries: e.target.value }));
                                        }
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="">시리즈 미지정</option>
                                    {uniqueSeries.map(series => (
                                        <option key={series} value={series}>{series}</option>
                                    ))}
                                    {form.ProductSeries && !uniqueSeries.includes(form.ProductSeries) && (
                                        <option value={form.ProductSeries}>{form.ProductSeries}</option>
                                    )}
                                    <option value="__custom__">직접 입력...</option>
                                </select>
                                {isCustomSeries && (
                                    <input
                                        type="text"
                                        placeholder="시리즈명 입력"
                                        value={customSeries}
                                        onChange={e => setCustomSeries(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 mt-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">통신 타입</label>
                                <select
                                    value={isCustomComm ? '__custom__' : form.ProductCommType}
                                    onChange={e => {
                                        if (e.target.value === '__custom__') {
                                            setIsCustomComm(true);
                                            setForm(prev => ({ ...prev, ProductCommType: '' }));
                                        } else {
                                            setIsCustomComm(false);
                                            setForm(prev => ({ ...prev, ProductCommType: e.target.value }));
                                        }
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="">통신 미지정</option>
                                    {uniqueCommTypes.map(comm => (
                                        <option key={comm} value={comm}>{comm}</option>
                                    ))}
                                    {form.ProductCommType && !uniqueCommTypes.includes(form.ProductCommType) && (
                                        <option value={form.ProductCommType}>{form.ProductCommType}</option>
                                    )}
                                    <option value="__custom__">직접 입력...</option>
                                </select>
                                {isCustomComm && (
                                    <input
                                        type="text"
                                        placeholder="통신 타입 입력"
                                        value={customComm}
                                        onChange={e => setCustomComm(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 mt-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">희망 중요도 (요청 수준)</label>
                        <select
                            value={form.Priority}
                            onChange={e => setForm(prev => ({ ...prev, Priority: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                        >
                            <option value="High">높음 (상) - 즉시 해결 요구</option>
                            <option value="Medium">보통 (중) - 차기 마일스톤 반영</option>
                            <option value="Low">낮음 (하) - 보완 가능 시 수정</option>
                        </select>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-650 bg-slate-100 hover:bg-slate-200 transition-all">취소</button>
                    <button
                        type="submit"
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 transition-all"
                    >
                        등록 완료
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}

// 이슈 상세 정보 및 검토 패널 (Issue Detail / Review Panel)
// ─────────────────────────────────────────────────────────────
function IssueDetailPanel({ isOpen, onClose, issue, users, userProfile, currentUser, onUpdateIssue, onAddComment, allCategories, ecnList }) {
    const [editForm, setEditForm] = useState({
        TargetDept: '',
        AssigneeUid: '',
        Priority: '',
        Difficulty: '',
        DueDate: '',
        AnalysisNotes: '',
        ResolutionNotes: '',
        LinkedECNId: '',
        Documents: []  // [{ title, url, type }]
    });
    const [newDocTitle, setNewDocTitle] = useState('');
    const [newDocUrl, setNewDocUrl]   = useState('');
    const [newDocType, setNewDocType] = useState('googlesheet');
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);

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
            setNewComment('');
            setNewDocTitle('');
            setNewDocUrl('');
            setNewDocType('googlesheet');
        }
    }, [isOpen, issue]);

    if (!isOpen || !issue) return null;

    // 해당 부서 팀원 필터링 (배정 대상자 선별)
    const deptMembers = users.filter(u => u.department === editForm.TargetDept);

    const handleFieldChange = (field, value) => {
        setEditForm(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'TargetDept') {
                // 부서 변경 시 담당자 자동 초기화
                next.AssigneeUid = '';
            }
            return next;
        });
    };

    // 설정 임시 저장
    const handleSaveSettings = async () => {
        setLoading(true);
        const assignee = users.find(u => u.uid === editForm.AssigneeUid);
        const updated = {
            TargetDept: editForm.TargetDept,
            AssigneeUid: editForm.AssigneeUid,
            AssigneeName: assignee ? assignee.name : '',
            Priority: editForm.Priority,
            Difficulty: editForm.Difficulty,
            DueDate: editForm.DueDate,
            AnalysisNotes: editForm.AnalysisNotes,
            ResolutionNotes: editForm.ResolutionNotes,
            LinkedECNId: editForm.LinkedECNId,
            Documents: editForm.Documents || []
        };

        const hasChanges = Object.keys(updated).some(key => updated[key] !== issue[key]);
        if (hasChanges) {
            await onUpdateIssue(issue.id, updated, {
                previousStatus: '배정 및 환경 변경',
                newStatus: '상세 정보 수정 반영됨'
            });
            alert("이슈 속성 및 설정이 변경되었습니다.");
        }
        setLoading(false);
    };

    // 상태 전이 함수
    const handleStatusTransition = async (newStatus, stateName) => {
        setLoading(true);
        const assignee = users.find(u => u.uid === editForm.AssigneeUid);
        const updated = {
            Status: newStatus,
            TargetDept: editForm.TargetDept,
            AssigneeUid: editForm.AssigneeUid,
            AssigneeName: assignee ? assignee.name : '',
            AnalysisNotes: editForm.AnalysisNotes,
            ResolutionNotes: editForm.ResolutionNotes
        };

        await onUpdateIssue(issue.id, updated, {
            previousStatus: issue.Status,
            newStatus: newStatus,
            message: `상태 변경: [${STATUS_MAP[issue.Status]?.label || issue.Status}] ➔ [${STATUS_MAP[newStatus]?.label || newStatus}] (${stateName})`
        });
        setLoading(false);
    };

    // 댓글 등록
    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        await onAddComment(issue.id, newComment.trim());
        setNewComment('');
    };

    const hasEditPermission = userProfile && (
        userProfile.role === 'admin' || 
        userProfile.role === 'manager' || 
        userProfile.department === issue.TargetDept
    );

    const createdDate = issue.CreatedAt?.toDate ? issue.CreatedAt.toDate().toLocaleString('ko-KR') : '-';

    return createPortal(
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[140]" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-full md:w-[540px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="bg-white px-6 py-5 border-b border-slate-250 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${allCategories[issue.Category]?.color || 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                                {allCategories[issue.Category]?.label || issue.Category}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${STATUS_MAP[issue.Status]?.color}`}>
                                {STATUS_MAP[issue.Status]?.label}
                            </span>
                        </div>
                        <h2 className="text-base font-black text-slate-900 line-clamp-1">{issue.Title}</h2>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 font-mono">ID: {issue.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all"><X size={18}/></button>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {/* 1. Basic details */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-3">
                            <FileText size={14} />
                            <h3 className="text-[11px] font-black uppercase tracking-widest">Description</h3>
                        </div>
                        <div className="text-[13px] text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{issue.Description}</div>
                        
                        {(issue.TargetProductName || issue.ProductSeries || issue.ProductCommType) && (
                            <div className="pt-4 border-t border-slate-50 flex flex-wrap gap-x-5 gap-y-2">
                                {issue.TargetProductName && <div className="flex items-baseline gap-1.5"><span className="text-[10px] font-bold text-slate-400 uppercase">Product</span><span className="text-xs font-black text-indigo-600 border-b-2 border-indigo-100">{issue.TargetProductName}</span></div>}
                                {issue.ProductSeries && <div className="flex items-baseline gap-1.5"><span className="text-[10px] font-bold text-slate-400 uppercase">Series</span><span className="text-xs font-black text-slate-700">{issue.ProductSeries}</span></div>}
                                {issue.ProductCommType && <div className="flex items-baseline gap-1.5"><span className="text-[10px] font-bold text-slate-400 uppercase">Comm.</span><span className="text-xs font-black text-teal-600">{issue.ProductCommType}</span></div>}
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-2 text-[10px] font-bold text-slate-400 italic">
                            <span>{issue.CreatedBy} • {createdDate}</span>
                        </div>
                    </div>

                    {/* 2. Attributes & Status */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-5">
                        <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-3"><Users size={14}/><h3 className="text-[11px] font-black uppercase tracking-widest">Management</h3></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dept.</label>
                            <select value={editForm.TargetDept} onChange={e => handleFieldChange('TargetDept', e.target.value)} disabled={!hasEditPermission} className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-300 disabled:opacity-50">
                                {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}부서</option>)}
                            </select></div>
                            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assignee</label>
                            <select value={editForm.AssigneeUid} onChange={e => handleFieldChange('AssigneeUid', e.target.value)} disabled={!hasEditPermission} className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-300 disabled:opacity-50">
                                <option value="">미지정</option>
                                {deptMembers.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                            </select></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Priority</label>
                            <select value={editForm.Priority} onChange={e => handleFieldChange('Priority', e.target.value)} disabled={!hasEditPermission} className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-indigo-300">
                                <option value="High">HIGH</option><option value="Medium">MEDIUM</option><option value="Low">LOW</option>
                            </select></div>
                            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Difficulty</label>
                            <select value={editForm.Difficulty} onChange={e => handleFieldChange('Difficulty', e.target.value)} disabled={!hasEditPermission} className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-indigo-300">
                                <option value="High">HARD</option><option value="Medium">NORMAL</option><option value="Low">EASY</option>
                            </select></div>
                            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Due Date</label>
                            <input type="date" value={editForm.DueDate} onChange={e => handleFieldChange('DueDate', e.target.value)} disabled={!hasEditPermission} className="w-full bg-slate-50/50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-black text-slate-800 outline-none focus:border-indigo-300" /></div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            {issue.Status === 'Pending' && <><button onClick={() => handleStatusTransition('InProgress', '작업 시작')} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] py-2.5 rounded-lg font-black transition-all">START WORK</button><button onClick={() => handleStatusTransition('Rejected', '기각')} className="px-4 border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 text-[11px] py-2.5 rounded-lg font-black transition-all">REJECT</button></>}
                            {issue.Status === 'InProgress' && <><button onClick={() => handleStatusTransition(issue.Category === 'Feature' ? 'Testing' : 'Resolved', '조치 완료')} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] py-2.5 rounded-lg font-black transition-all">COMPLETE</button><button onClick={() => handleStatusTransition('Archived', '보류')} className="px-4 border border-slate-200 text-slate-500 hover:bg-slate-100 text-[11px] py-2.5 rounded-lg font-black transition-all">HOLD</button></>}
                            {issue.Status === 'Testing' && <button onClick={() => handleStatusTransition('Resolved', '최종 검증 완료')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] py-2.5 rounded-lg font-black transition-all">VERIFY & CLOSE</button>}
                            {issue.Status === 'Resolved' && <button onClick={() => handleStatusTransition('InProgress', '재오픈')} className="flex-1 border-2 border-rose-100 text-rose-600 hover:bg-rose-50 text-[11px] py-2.5 rounded-lg font-black transition-all">RE-OPEN ISSUE</button>}
                        </div>
                    </div>

                    {/* 3. Analysis & Resolution */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-5">
                        <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-3"><FileText size={14} className="text-indigo-400"/><h3 className="text-[11px] font-black uppercase tracking-widest">Report</h3></div>
                        <div className="space-y-4">
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1 flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-indigo-400"></div> Analysis</label>
                            <textarea rows={4} value={editForm.AnalysisNotes} onChange={e => handleFieldChange('AnalysisNotes', e.target.value)} disabled={!hasEditPermission} placeholder="원인 분석 및 현상 기록..." className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-300 transition-colors resize-none" /></div>
                            <div className="space-y-1.5"><label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1 flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-emerald-400"></div> Resolution</label>
                            <textarea rows={4} value={editForm.ResolutionNotes} onChange={e => handleFieldChange('ResolutionNotes', e.target.value)} disabled={!hasEditPermission} placeholder="조치 결과 및 해결 방법..." className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-medium text-slate-700 outline-none focus:border-emerald-300 transition-colors resize-none" /></div>
                            <div className="space-y-2"><label className="text-[10px] font-black text-amber-500 uppercase tracking-widest ml-1">Linked ECN</label>
                            <div className="flex gap-2">
                                <select value={editForm.LinkedECNId} onChange={e => handleFieldChange('LinkedECNId', e.target.value)} disabled={!hasEditPermission} className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50">
                                    <option value="">NONE</option>
                                    {ecnList && ecnList.map(ecn => <option key={ecn.id} value={ecn.id}>[{ecn.Status}] {ecn.Title}</option>)}
                                </select>
                                {editForm.LinkedECNId && <a href={`/ecn?id=${editForm.LinkedECNId}`} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center"><ExternalLink size={16} /></a>}
                            </div></div>
                            {hasEditPermission && <button onClick={handleSaveSettings} disabled={loading} className="w-full bg-slate-900 hover:bg-black text-white py-3 rounded-xl text-[11px] font-black transition-all uppercase tracking-widest">{loading ? 'SAVING...' : 'Save Changes'}</button>}
                        </div>
                    </div>

                    {/* 4. Documents */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-3"><ArrowRight size={14} className="text-teal-500"/><h3 className="text-[11px] font-black uppercase tracking-widest">Docs</h3></div>
                        <div className="space-y-2">
                            {(editForm.Documents || []).length === 0 ? <p className="text-[10px] text-slate-300 italic text-center py-2 uppercase">No Docs</p> : editForm.Documents.map((doc, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"><span className="text-sm">{doc.type === 'googlesheet' ? '📊' : doc.type === 'googledoc' ? '📄' : '🔗'}</span>
                                <div className="flex-1 min-w-0"><p className="text-[10px] font-black text-slate-700 truncate">{doc.title}</p>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-indigo-500 hover:text-indigo-700 truncate block">{doc.url}</a></div>
                                {hasEditPermission && <button onClick={() => handleFieldChange('Documents', editForm.Documents.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500 p-1"><X size={12}/></button>}</div>
                            ))}
                        </div>
                        {hasEditPermission && (
                            <div className="pt-2 border-t border-slate-50 space-y-2">
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Doc Title" value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none" />
                                    <select value={newDocType} onChange={e => setNewDocType(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-black outline-none"><option value="googlesheet">📊 Sheet</option><option value="googledoc">📄 Doc</option><option value="other">🔗 Link</option></select>
                                </div>
                                <div className="flex gap-2">
                                    <input type="url" placeholder="URL" value={newDocUrl} onChange={e => setNewDocUrl(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium outline-none" />
                                    <button onClick={async () => { if (!newDocUrl.trim()) return; const newDoc = { title: newDocTitle.trim() || newDocUrl, url: newDocUrl.trim(), type: newDocType, addedBy: userProfile?.name || 'User', addedAt: new Date().toISOString() }; const updatedDocs = [...(editForm.Documents || []), newDoc]; handleFieldChange('Documents', updatedDocs); await onUpdateIssue(issue.id, { Documents: updatedDocs }); setNewDocTitle(''); setNewDocUrl(''); }} disabled={!newDocUrl.trim()} className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black">ADD</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 5. Feedback */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 mb-6">
                        <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-3"><MessageSquare size={14} /><h3 className="text-[11px] font-black uppercase tracking-widest">Feedback</h3></div>
                        <form onSubmit={handleCommentSubmit} className="flex gap-2">
                            <input type="text" placeholder="의견 작성..." value={newComment} onChange={e => setNewComment(e.target.value)} className="flex-1 bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-medium focus:border-indigo-300 outline-none" />
                            <button type="submit" className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-100 transition-all">POST</button>
                        </form>
                        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                            {(() => {
                                const list = [];
                                (issue.Comments || []).forEach(c => list.push({ type: 'comment', ...c, date: new Date(c.timestamp) }));
                                (issue.History || []).forEach(h => list.push({ type: 'history', author: h.updatedBy, text: h.message || `Status: ${h.previousStatus} ➔ ${h.newStatus}`, date: new Date(h.timestamp) }));
                                list.sort((a, b) => b.date - a.date);
                                if (list.length === 0) return <p className="text-[10px] text-slate-300 font-bold italic text-center py-2 uppercase">Empty</p>;
                                return list.map((item, idx) => (
                                    <div key={idx} className={`p-2.5 rounded-xl border ${item.type === 'comment' ? 'bg-white border-slate-50' : 'bg-slate-50/30 border-transparent text-slate-400'}`}>
                                        <div className="flex justify-between items-center mb-0.5"><span className="text-[10px] font-black text-slate-600">{item.author}</span><span className="text-[9px] font-bold text-slate-300">{item.date.toLocaleDateString()}</span></div>
                                        <p className="text-[11px] font-medium text-slate-500 leading-snug">{item.text}</p>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
