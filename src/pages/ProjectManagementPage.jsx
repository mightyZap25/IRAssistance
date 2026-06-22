import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc, orderBy, deleteDoc, where } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
    Plus, Search, Filter, Briefcase, FileText, ChevronRight, 
    CheckCircle2, Clock, AlertTriangle, MoreVertical, 
    Layers, Zap, Terminal, Microscope, Factory, Ship,
    LayoutGrid, List, ArrowRight, Kanban, Calendar,
    AlertCircle, ListChecks, CheckCircle, TrendingUp, User, Circle,
    CalendarDays, Users, ChevronLeft, Activity, Tag
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
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [newProjectCode, setNewProjectCode] = useState('');

    // Filter/Tab
    const [activeTab, setActiveTab] = useState('ALL'); // ALL | ACTIVE | COMPLETED
    const [viewMode, setViewMode] = useState('pipeline'); // pipeline | gantt

    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchProjects();
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const snap = await getDocs(collection(db, 'users'));
            const list = snap.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            }));
            setUsers(list);
        } catch (err) {
            console.error("Failed to fetch users:", err);
        }
    };

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

    const generateProjectCode = () => {
        const year = new Date().getFullYear();
        const prefix = `IR-${year}-`;
        let maxIdx = 0;
        
        projects.forEach(p => {
            if (p.code && p.code.startsWith(prefix)) {
                const idxStr = p.code.replace(prefix, '');
                const idx = parseInt(idxStr, 10);
                if (!isNaN(idx) && idx > maxIdx) {
                    maxIdx = idx;
                }
            }
        });
        return `${prefix}${String(maxIdx + 1).padStart(3, '0')}`;
    };

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
            <div className="flex justify-between items-center bg-white py-5 px-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
                        <Briefcase className="text-indigo-600" size={26} /> 전사 개발 프로젝트 관리
                    </h1>
                    <p className="text-slate-400 text-xs mt-1 font-medium">
                        제품 개발 전 공정(Planning to Mass Production) 진척도 및 문서 관리
                    </p>
                </div>
                <button
                    onClick={() => {
                        setNewProjectCode(generateProjectCode());
                        setIsCreateModalOpen(true);
                    }}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4 custom-scrollbar">
                                {PROCESS_STAGES.map(stage => {
                                    const stageProjects = filteredProjects.filter(p => p.currentStage === stage.id);
                                    return (
                                        <div key={stage.id} className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-3 flex flex-col min-w-[200px] min-h-[450px]">
                                            {/* Column Header */}
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                <div className="flex items-center gap-1.5">
                                                    <stage.icon className={`${stage.color}`} size={16} />
                                                    <span className="text-xs font-black text-slate-700">{stage.label}</span>
                                                </div>
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{stageProjects.length}</span>
                                            </div>
                                            
                                            {/* Cards List */}
                                            <div className="flex-1 space-y-2.5 overflow-y-auto no-scrollbar">
                                                {stageProjects.map(project => (
                                                    <ProjectCard 
                                                        key={project.id} 
                                                        project={project} 
                                                        onClick={() => setSelectedProject(project)}
                                                        onMoveStage={(newStage) => handleUpdateProject(project.id, { currentStage: newStage })}
                                                    />
                                                ))}
                                                {stageProjects.length === 0 && (
                                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 py-16">
                                                        <span className="text-[10px] font-bold">프로젝트 없음</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
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
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 tracking-widest">프로젝트 코드 (자동생성)</label>
                                    <input 
                                        name="projectCode" 
                                        required 
                                        value={newProjectCode}
                                        onChange={e => setNewProjectCode(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500" 
                                    />
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
                users={users}
                currentUser={currentUser}
            />
        </div>
    );
}

function ProjectCard({ project, onClick, onMoveStage }) {
    const currentIdx = PROCESS_STAGES.findIndex(s => s.id === project.currentStage);
    const currentStage = PROCESS_STAGES[currentIdx];

    // Task 완료율 계산
    const allTasks = Object.values(project.tests || {}).flat();
    const doneTasks = allTasks.filter(t => t.status === 'done' || t.completed === true).length;
    const taskPct = allTasks.length > 0 ? Math.round((doneTasks / allTasks.length) * 100) : null;

    // D-day 계산 (일정이 세팅된 현 공정 단계 기준)
    const schedEnd = project.schedules?.[project.currentStage]?.end;
    let dday = null;
    if (schedEnd) {
        const diff = Math.ceil((new Date(schedEnd) - new Date()) / (1000 * 60 * 60 * 24));
        dday = diff;
    }

    const handlePrev = (e) => { e.stopPropagation(); if (currentIdx > 0) onMoveStage(PROCESS_STAGES[currentIdx - 1].id); };
    const handleNext = (e) => { e.stopPropagation(); if (currentIdx < PROCESS_STAGES.length - 1) onMoveStage(PROCESS_STAGES[currentIdx + 1].id); };

    const progressColor = (project.progress || 0) >= 80 ? 'bg-emerald-500' : (project.progress || 0) >= 40 ? 'bg-indigo-500' : 'bg-amber-400';

    return (
        <div 
            onClick={onClick}
            className="bg-white border border-slate-200/80 rounded-2xl hover:border-indigo-300 hover:shadow-lg transition-all duration-200 cursor-pointer group flex flex-col overflow-hidden"
        >
            {/* 상단 액센트 스트라이프 */}
            <div className={`h-1 w-full ${currentStage?.color?.replace('text-', 'bg-').replace('-500', '-400') || 'bg-indigo-400'}`} />

            <div className="p-4 flex flex-col space-y-3 flex-1">
                {/* 헤더: 코드 + D-day */}
                <div className="flex justify-between items-start gap-1">
                    <span className="text-[9px] font-black text-slate-400 font-mono tracking-tighter uppercase truncate">
                        {project.code || 'NO-CODE'}
                    </span>
                    {dday !== null && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                            dday < 0 ? 'bg-rose-100 text-rose-600' :
                            dday <= 3 ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-500'
                        }`}>
                            {dday < 0 ? `D+${Math.abs(dday)} 초과` : dday === 0 ? 'D-Day' : `D-${dday}`}
                        </span>
                    )}
                </div>

                {/* 프로젝트명 */}
                <h4 className="text-sm font-black text-slate-800 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-tight">
                    {project.name}
                </h4>

                {/* 담당자 + 진철도 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center">
                            <User size={10} className="text-indigo-600" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold truncate max-w-[80px]">
                            {project.ownerName || '미지정'}
                        </span>
                    </div>
                    <span className={`text-xs font-black ${(project.progress || 0) >= 80 ? 'text-emerald-600' : (project.progress || 0) >= 40 ? 'text-indigo-600' : 'text-amber-600'}`}>
                        {project.progress || 0}%
                    </span>
                </div>

                {/* 전체 진철도 바 */}
                <div className="space-y-1">
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                            className={`h-full ${progressColor} rounded-full transition-all duration-500`} 
                            style={{ width: `${project.progress || 0}%` }} 
                        />
                    </div>
                    {/* Task 완료율 (Task가 있을 경우만) */}
                    {taskPct !== null && (
                        <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-400 rounded-full transition-all duration-500" 
                                    style={{ width: `${taskPct}%` }} 
                                />
                            </div>
                            <span className="text-[8px] font-black text-slate-400 whitespace-nowrap">
                                Task {doneTasks}/{allTasks.length}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* 하단: 단계 이동 */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <button 
                    onClick={handlePrev}
                    disabled={currentIdx === 0}
                    className="flex items-center gap-0.5 text-[9px] font-black text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:pointer-events-none transition-colors py-0.5 px-1 rounded hover:bg-indigo-50"
                    title="이전 단계"
                >
                    <ChevronLeft size={12} />
                    {currentIdx > 0 ? PROCESS_STAGES[currentIdx - 1]?.label?.slice(0, 4) : ''}
                </button>
                <div className="flex items-center gap-1">
                    {currentStage && <currentStage.icon size={10} className={currentStage.color} />}
                    <span className="text-[9px] font-black text-slate-500">{currentStage?.label}</span>
                </div>
                <button 
                    onClick={handleNext}
                    disabled={currentIdx === PROCESS_STAGES.length - 1}
                    className="flex items-center gap-0.5 text-[9px] font-black text-slate-400 hover:text-indigo-600 disabled:opacity-20 disabled:pointer-events-none transition-colors py-0.5 px-1 rounded hover:bg-indigo-50"
                    title="다음 단계"
                >
                    {currentIdx < PROCESS_STAGES.length - 1 ? PROCESS_STAGES[currentIdx + 1]?.label?.slice(0, 4) : ''}
                    <ChevronRight size={12} />
                </button>
            </div>
        </div>
    );
}
