import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc, orderBy, deleteDoc, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
    Plus, Search, Filter, Briefcase, FileText, ChevronRight, 
    CheckCircle2, Clock, AlertTriangle, MoreVertical, 
    Layers, Zap, Terminal, Microscope, Factory, Ship,
    LayoutGrid, List, ArrowRight, Kanban, Calendar,
    AlertCircle, ListChecks, CheckCircle, TrendingUp, User, Circle
} from 'lucide-react';
import ProjectProcessPanel from '../components/ProjectProcessPanel';
import ProjectGanttChart from '../components/ProjectGanttChart';

const PROCESS_STAGES = [
    { id: 'planning', label: '개발 기획', icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-50' },
    { id: 'development', label: '개발', icon: Terminal, color: 'text-indigo-500', bgColor: 'bg-indigo-50' },
    { id: 'dev_pp', label: '개발 PP', icon: Zap, color: 'text-amber-500', bgColor: 'bg-amber-50' },
    { id: 'qa_test', label: 'QA Test', icon: Microscope, color: 'text-purple-500', bgColor: 'bg-purple-50' },
    { id: 'prod_pp', label: '생산 PP', icon: Factory, color: 'text-emerald-500', bgColor: 'bg-emerald-50' },
    { id: 'mp_transfer', label: '양산이관', icon: Ship, color: 'text-rose-500', bgColor: 'bg-rose-50' },
];

export default function ProjectManagementPage() {
    const { currentUser, userProfile } = useAuth();
    const [projects, setProjects] = useState([]);
    const [allIssues, setAllIssues] = useState([]);
    const [allTasks, setAllTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);

    // Filter/Tab
    const [activeTab, setActiveTab] = useState('ALL'); // ALL | ACTIVE | COMPLETED
    const [viewMode, setViewMode] = useState('pipeline'); // pipeline | gantt

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            // 1. Projects
            const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            const list = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    currentStage: data.currentStage || 'planning',
                    progress: data.progress || 0,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null)
                };
            });
            setProjects(list);

            // 2. Issues
            const issueSnap = await getDocs(collection(db, 'issues'));
            setAllIssues(issueSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            // 3. Tasks
            const taskSnap = await getDocs(query(collection(db, 'personal_tasks'), where('ownerUid', '==', currentUser.uid)));
            setAllTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm("모든 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
        setLoading(true);
        try {
            const q = query(collection(db, 'projects'));
            const snap = await getDocs(q);
            const deletePromises = snap.docs.map(d => deleteDoc(doc(db, 'projects', d.id)));
            await Promise.all(deletePromises);
            await fetchProjects();
            alert("모든 프로젝트가 삭제되었습니다.");
        } catch (err) {
            console.error("Failed to clear projects:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredProjects = useMemo(() => {
        return projects.filter(p => {
            const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 (p.code || '').toLowerCase().includes(searchTerm.toLowerCase());
            
            if (activeTab === 'ACTIVE') return matchesSearch && p.currentStage !== 'mp_transfer';
            if (activeTab === 'COMPLETED') return matchesSearch && p.currentStage === 'mp_transfer';
            return matchesSearch;
        });
    }, [projects, searchTerm, activeTab]);

    const handleCreateProject = async (e) => {
        e.preventDefault();
        const name = e.target.projectName.value;
        const code = e.target.projectCode.value;
        const description = e.target.description.value;

        try {
            const initialSchedules = {};
            PROCESS_STAGES.forEach(s => {
                initialSchedules[s.id] = { start: '', end: '', status: 'pending' };
            });

            await addDoc(collection(db, 'projects'), {
                name,
                code,
                description,
                currentStage: 'planning',
                progress: 10,
                owner: currentUser.email,
                ownerName: userProfile?.name || currentUser.displayName,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                schedules: initialSchedules,
                stageHistory: [
                    { stage: 'planning', date: new Date().toISOString(), note: '프로젝트 생성 및 기획 단계 진입' }
                ],
                documents: {
                    planning: [], development: [], dev_pp: [], qa_test: [], prod_pp: [], mp_transfer: []
                }
            });
            setIsCreateModalOpen(false);
            fetchProjects();
        } catch (err) {
            console.error("Project creation failed:", err);
        }
    };

    const handleUpdateProject = async (projectId, updateData) => {
        try {
            await updateDoc(doc(db, 'projects', projectId), {
                ...updateData,
                updatedAt: serverTimestamp()
            });
            fetchProjects();
            if (selectedProject?.id === projectId) {
                setSelectedProject(prev => ({ ...prev, ...updateData }));
            }
        } catch (err) {
            console.error("Project update failed:", err);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* Header */}
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Briefcase className="text-indigo-600" size={32} />
                        전사 개발 프로젝트 관리
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">
                        제품 개발 전 공정(Planning to Mass Production) 진척도 및 문서 관리
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-md shadow-indigo-100 transition-all transform hover:scale-[1.02]"
                >
                    <Plus size={18} />
                    신규 프로젝트 등록
                </button>
            </div>

            {/* Main Area */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center">
                    <div className="flex gap-1.5">
                        {['ALL', 'ACTIVE', 'COMPLETED'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                                    activeTab === tab 
                                        ? 'bg-indigo-600 text-white shadow-md' 
                                        : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
                                }`}
                            >
                                {tab === 'ALL' ? '전체' : tab === 'ACTIVE' ? '진행 중' : '완료'}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 max-w-sm ml-auto flex gap-3 items-center">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="프로젝트명, 코드 검색..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <button
                            onClick={handleClearAll}
                            className="px-3 py-2.5 rounded-xl text-[10px] font-black bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all border border-rose-100 whitespace-nowrap"
                        >
                            전체 초기화
                        </button>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 border border-slate-200 ml-4">
                        <button
                            onClick={() => setViewMode('pipeline')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'pipeline' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="파이프라인 뷰"
                        >
                            <Kanban size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('gantt')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'gantt' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            title="간트 차트 뷰"
                        >
                            <Calendar size={16} />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/30">
                    
                    {/* 1. Unified Dashboard Overview */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
                        {/* Summary KPI Card */}
                        <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3">
                                <TrendingUp className="text-indigo-600" size={18}/> 운영 요약 (Portfolio KPI)
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                                    <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Active Proj.</div>
                                    <div className="text-2xl font-black text-indigo-700">{projects.filter(p => p.currentStage !== 'mp_transfer').length}</div>
                                </div>
                                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                                    <div className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Open Issues</div>
                                    <div className="text-2xl font-black text-rose-700">{allIssues.filter(i => i.columnId !== 'done').length}</div>
                                </div>
                                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                                    <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">To-Dos</div>
                                    <div className="text-2xl font-black text-blue-700">{allTasks.filter(t => t.status !== 'completed').length}</div>
                                </div>
                                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                    <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Completed</div>
                                    <div className="text-2xl font-black text-emerald-700">{projects.filter(p => p.currentStage === 'mp_transfer').length}</div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Urgent Issues Hub */}
                        <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3 mb-4">
                                <AlertCircle className="text-rose-500" size={18}/> 긴급 대응 이슈 (Urgent Issues)
                            </h3>
                            <div className="flex-1 space-y-3 overflow-y-auto max-h-[180px] pr-1 custom-scrollbar">
                                {allIssues.filter(i => i.priority === 'urgent' && i.columnId !== 'done').length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                        <CheckCircle size={32} className="opacity-10 mb-2"/>
                                        <p className="text-[10px] font-bold uppercase italic tracking-widest">Clear: No Urgent Issues</p>
                                    </div>
                                ) : (
                                    allIssues.filter(i => i.priority === 'urgent' && i.columnId !== 'done').map(issue => (
                                        <div key={issue.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3 group hover:border-rose-200 transition-all">
                                            <div className="w-1 h-6 rounded-full bg-rose-500 animate-pulse" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-black text-slate-800 truncate">{issue.title}</div>
                                                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                                    {projects.find(p => p.id === issue.projectId)?.name || 'General Issue'}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Weekly Personal Tasks */}
                        <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3 mb-4">
                                <ListChecks className="text-blue-500" size={18}/> 이번 주 할 일 (Tasks)
                            </h3>
                            <div className="flex-1 space-y-2 overflow-y-auto max-h-[180px] pr-1 custom-scrollbar">
                                {allTasks.filter(t => t.status !== 'completed').length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                        <CheckCircle size={32} className="opacity-10 mb-2"/>
                                        <p className="text-[10px] font-bold uppercase italic tracking-widest">All tasks done</p>
                                    </div>
                                ) : (
                                    allTasks.filter(t => t.status !== 'completed').slice(0, 4).map(task => (
                                        <div key={task.id} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-100">
                                            <Circle size={14} className="text-slate-300" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold text-slate-700 truncate">{task.title}</div>
                                                <div className="text-[8px] font-black text-blue-400 uppercase">{task.dueDate?.toLocaleDateString() || 'No Deadline'}</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-slate-200/50" />

                    {/* 2. Pipeline / Gantt View Sections */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                {viewMode === 'pipeline' ? '프로젝트 파이프라인' : '간트 타임라인 로드맵'}
                            </h3>
                        </div>
                        
                        {loading ? (
                            <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
                        ) : filteredProjects.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <Layers size={48} className="mb-4 opacity-20" /><p className="font-bold">검색 결과가 없습니다.</p>
                            </div>
                        ) : viewMode === 'pipeline' ? (
                            <div className="space-y-4">
                                {filteredProjects.map(project => (
                                    <ProjectRow 
                                        key={project.id} 
                                        project={project} 
                                        onClick={() => setSelectedProject(project)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <ProjectGanttChart 
                                projects={filteredProjects} 
                                stages={PROCESS_STAGES} 
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
                    <form onSubmit={handleCreateProject} className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <Plus className="text-indigo-600"/> 신규 프로젝트 등록
                            </h2>
                            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl">
                                <ChevronRight className="rotate-90" size={18}/>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">프로젝트 코드</label>
                                    <input name="projectCode" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500" placeholder="예: IR-2026-001" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">프로젝트 명</label>
                                    <input name="projectName" required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500" placeholder="차세대 컨트롤러 개발" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">상세 설명</label>
                                <textarea name="description" rows="3" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="프로젝트 목표 및 주요 사양..." />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 rounded-2xl text-xs font-black bg-slate-100 text-slate-600">취소</button>
                                <button type="submit" className="flex-1 py-3 rounded-2xl text-xs font-black bg-indigo-600 text-white shadow-md shadow-indigo-100">프로젝트 생성</button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Sliding Panel */}
            <ProjectProcessPanel 
                isOpen={!!selectedProject}
                onClose={() => setSelectedProject(null)}
                project={selectedProject}
                stages={PROCESS_STAGES}
                onUpdate={handleUpdateProject}
            />
        </div>
    );
}

function ProjectRow({ project, onClick }) {
    const currentStageIdx = PROCESS_STAGES.findIndex(s => s.id === project.currentStage);
    
    return (
        <div 
            onClick={onClick}
            className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Briefcase size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 font-mono tracking-tighter uppercase">{project.code || 'NO-CODE'}</span>
                            <h3 className="text-sm font-black text-slate-800">{project.name}</h3>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium">{project.ownerName} · {project.createdAt?.toLocaleDateString()}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black text-slate-400 mb-1">TOTAL PROGRESS</div>
                    <div className="flex items-center gap-2">
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${project.progress || 0}%` }} />
                        </div>
                        <span className="text-xs font-black text-indigo-600">{project.progress || 0}%</span>
                    </div>
                </div>
            </div>

            {/* Pipeline Visual */}
            <div className="flex items-center w-full">
                {PROCESS_STAGES.map((stage, idx) => {
                    const isCompleted = idx < currentStageIdx;
                    const isCurrent = idx === currentStageIdx;

                    return (
                        <React.Fragment key={stage.id}>
                            <div className="flex flex-col items-center relative flex-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                    isCompleted ? 'bg-emerald-50 border-emerald-500 text-emerald-600' :
                                    isCurrent ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-50' :
                                    'bg-white border-slate-200 text-slate-300'
                                }`}>
                                    {isCompleted ? <CheckCircle2 size={16} /> : <stage.icon size={14} />}
                                </div>
                                <span className={`absolute top-full mt-2 text-[9px] font-black truncate w-full text-center ${
                                    isCurrent ? 'text-indigo-600' : 'text-slate-400'
                                }`}>
                                    {stage.label}
                                </span>
                            </div>
                            {idx < PROCESS_STAGES.length - 1 && (
                                <div className="flex-1 px-1">
                                    <div className={`h-0.5 w-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            <div className="h-6" /> {/* Spacer for labels */}
        </div>
    );
}
