import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, where, addDoc, serverTimestamp } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
    Briefcase, CheckCircle2, Clock, AlertTriangle, 
    BarChart3, PieChart, TrendingUp, ChevronRight, 
    Layers, Users, FileText, Zap, AlertOctagon, MessageSquare,
    LayoutGrid, List
} from 'lucide-react';

const PROCESS_STAGES = [
    { id: 'planning', label: '개발 기획', color: 'bg-blue-500' },
    { id: 'development', label: '개발', color: 'bg-indigo-500' },
    { id: 'dev_pp', label: '개발 PP', color: 'bg-amber-500' },
    { id: 'qa_test', label: 'QA Test', color: 'bg-purple-500' },
    { id: 'prod_pp', label: '생산 PP', color: 'bg-emerald-500' },
    { id: 'mp_transfer', label: '양산이관', color: 'bg-rose-500' },
];

export default function ProjectDashboardPage() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal state for detailed lists
    const [activeModal, setActiveModal] = useState(null); // null | { type: 'project'|'issue', label: string, items: Array }

    const handleCreateSampleData = async () => {
        if (!window.confirm("데모용 샘플 데이터(프로젝트 1개, 이슈 2개, 개인Task 1개)를 생성하시겠습니까?")) return;
        setLoading(true);
        try {
            // 1. 프로젝트 생성
            const projRef = await addDoc(collection(db, 'projects'), {
                name: '샘플: 차세대 지능형 컨트롤러 개발',
                code: 'IR-DEMO-2026',
                description: 'AI 기반의 저전력 제어 모듈 개발 프로젝트입니다.',
                startDate: '2026-06-01',
                endDate: '2026-12-31',
                currentStage: 'development',
                progress: 25,
                owner: currentUser.email,
                ownerName: '관리자',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                schedules: {
                    planning: { start: '2026-06-01', end: '2026-06-15', status: 'completed' },
                    development: { start: '2026-06-16', end: '2026-08-31', status: 'in_progress' },
                },
                tests: {
                    planning: [{ id: 1, parent: '시장성', child: '경쟁사 분석', completed: true }],
                    development: [{ id: 2, parent: 'HW설계', child: 'MCU 회로 검토', completed: false }]
                }
            });

            // 2. 관련 이슈 생성
            await addDoc(collection(db, 'issues'), {
                projectId: projRef.id,
                title: 'MCU 수급 지연 리스크',
                priority: 'urgent',
                category: '자재',
                columnId: 'todo',
                assignedTo: currentUser.email,
                dueDate: '2026-06-10',
                createdAt: serverTimestamp()
            });

            await addDoc(collection(db, 'issues'), {
                projectId: projRef.id,
                title: 'PCB 노이즈 간섭 분석',
                priority: 'high',
                category: '설계',
                columnId: 'in_progress',
                assignedTo: currentUser.email,
                dueDate: '2026-06-20',
                createdAt: serverTimestamp()
            });

            // 3. 개인 Task 생성
            await addDoc(collection(db, 'personal_tasks'), {
                ownerUid: currentUser.uid,
                title: '샘플: 데모용 주간 보고서 작성',
                priority: 'medium',
                status: 'todo',
                dueDate: '2026-06-05T14:00',
                alarmEnabled: true,
                createdAt: serverTimestamp()
            });

            alert("샘플 데이터가 생성되었습니다. 캘린더와 대시보드에서 확인해 보세요!");
            fetchData();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [projectSnap, issueSnap] = await Promise.all([
                getDocs(query(collection(db, 'projects'), orderBy('createdAt', 'desc'))),
                getDocs(query(collection(db, 'issues')))
            ]);

            setProjects(projectSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIssues(issueSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            console.error("Failed to fetch dashboard data:", err);
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        // Project Stats
        const totalProj = projects.length;
        const activeProj = projects.filter(p => p.currentStage !== 'mp_transfer').length;
        const delayedProj = projects.filter(p => {
            const currentSched = p.schedules?.[p.currentStage];
            return currentSched?.end && new Date(currentSched.end) < new Date() && currentSched.status !== 'completed';
        }).length;

        // Issue Stats
        const totalIssues = issues.length;
        const activeIssues = issues.filter(i => i.columnId !== 'done').length;
        const criticalIssues = issues.filter(i => (i.priority === 'urgent' || i.priority === 'high') && i.columnId !== 'done').length;

        const stageDist = PROCESS_STAGES.map(stage => ({
            ...stage,
            count: projects.filter(p => p.currentStage === stage.id).length
        }));

        const issuePriorityDist = [
            { label: '긴급', count: issues.filter(i => i.priority === 'urgent').length, color: 'bg-rose-500' },
            { label: '높음', count: issues.filter(i => i.priority === 'high').length, color: 'bg-orange-500' },
            { label: '보통', count: issues.filter(i => i.priority === 'medium').length, color: 'bg-blue-500' },
            { label: '낮음', count: issues.filter(i => i.priority === 'low').length, color: 'bg-slate-400' },
        ];

        return { totalProj, activeProj, delayedProj, totalIssues, activeIssues, criticalIssues, stageDist, issuePriorityDist };
    }, [projects, issues]);

    if (loading) {
        return <div className="flex h-96 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center bg-white py-5 px-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
                        <BarChart3 className="text-indigo-600" size={26} /> 통합 운영 관리
                    </h1>
                    <p className="text-slate-400 text-xs mt-1 font-medium">프로젝트 진척도와 리스크(이슈) 현황을 한눈에 통합 관리합니다.</p>
                </div>
                <button 
                    onClick={handleCreateSampleData}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                >
                    데모 샘플 생성
                </button>
            </div>

            {/* Stat Cards - Mixed Project & Issue */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard icon={Briefcase} label="활성 프로젝트" value={stats.activeProj} total={stats.totalProj} color="indigo" />
                <StatCard icon={AlertTriangle} label="일정 지연 프로젝트" value={stats.delayedProj} color="rose" isWarning={stats.delayedProj > 0} />
                <StatCard icon={AlertOctagon} label="미결 이슈 (Active)" value={stats.activeIssues} total={stats.totalIssues} color="orange" />
                <StatCard icon={Zap} label="중점 관리(긴급/높음)" value={stats.criticalIssues} color="rose" isWarning={stats.criticalIssues > 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Stage Distribution */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between min-h-[160px]">
                    <div className="border-b border-slate-100 pb-2 flex justify-between items-center mb-3">
                        <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                            <Layers size={14} className="text-indigo-500"/> 개발 공정별 분포 (클릭 시 상세)
                        </h3>
                    </div>
                    <div className="grid grid-cols-3 gap-2 flex-1">
                        {stats.stageDist.map(stage => {
                            const bgLight = stage.color.replace('bg-', 'bg-').replace('500', '50/50');
                            const borderCol = stage.color.replace('bg-', 'border-').replace('500', '200');
                            const textCol = stage.color.replace('bg-', 'text-');
                            return (
                                <div 
                                    key={stage.id} 
                                    onClick={() => setActiveModal({
                                        type: 'project',
                                        label: `${stage.label} 단계 프로젝트`,
                                        items: projects.filter(p => p.currentStage === stage.id)
                                    })}
                                    className={`p-2 rounded-xl border ${bgLight} ${borderCol} flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] hover:shadow-sm`}
                                >
                                    <span className="text-[8px] font-black text-slate-500 uppercase truncate">{stage.label}</span>
                                    <div className="flex justify-between items-end mt-2">
                                        <div className={`w-1 h-1 rounded-full ${stage.color}`} />
                                        <span className={`text-xs font-black ${textCol}`}>{stage.count}개</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Issue Priority Distribution */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between min-h-[160px]">
                    <div className="border-b border-slate-100 pb-2 flex justify-between items-center mb-3">
                        <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                            <AlertOctagon size={14} className="text-rose-500"/> 이슈 우선순위 현황 (클릭 시 상세)
                        </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                        {stats.issuePriorityDist.map(item => {
                            const bgLight = item.color.replace('bg-', 'bg-').replace('500', '50/50').replace('slate-400', 'slate-50');
                            const borderCol = item.color.replace('bg-', 'border-').replace('500', '200').replace('slate-400', 'slate-200');
                            const textCol = item.color.replace('bg-', 'text-').replace('slate-400', 'slate-600');
                            return (
                                <div 
                                    key={item.label} 
                                    onClick={() => setActiveModal({
                                        type: 'issue',
                                        label: `${item.label} 이슈`,
                                        items: issues.filter(i => {
                                            const pri = item.label === '긴급' ? 'urgent' : item.label === '높음' ? 'high' : item.label === '보통' ? 'medium' : 'low';
                                            return i.priority === pri && i.columnId !== 'done';
                                        })
                                    })}
                                    className={`p-2 rounded-xl border ${bgLight} ${borderCol} flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] hover:shadow-sm`}
                                >
                                    <span className="text-[8px] font-black text-slate-500 uppercase">{item.label}</span>
                                    <div className="flex justify-between items-end mt-2">
                                        <div className={`w-1 h-1 rounded-full ${item.color}`} />
                                        <span className={`text-xs font-black ${textCol}`}>{item.count}건</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Urgent Action Items (Recent Issues) */}
                <div 
                    onClick={() => setActiveModal({
                        type: 'issue',
                        label: '긴급 조치 필요 이슈',
                        items: issues.filter(i => (i.priority === 'urgent' || i.priority === 'high') && i.columnId !== 'done')
                    })}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between cursor-pointer hover:border-rose-300 hover:shadow-md transition-all group min-h-[160px]"
                >
                    <div className="border-b border-slate-100 pb-2 flex justify-between items-center">
                        <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                            <Zap size={14} className="text-rose-500 animate-pulse"/> 긴급 조치 필요 이슈
                        </h3>
                        <ChevronRight size={14} className="text-slate-400 group-hover:text-rose-500 transition-colors" />
                    </div>
                    <div className="flex-1 flex items-center gap-4 py-2 mt-2">
                        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 relative">
                            <AlertOctagon size={24} className="animate-bounce" />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-ping" />
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-900 leading-none">
                                {issues.filter(i => (i.priority === 'urgent' || i.priority === 'high') && i.columnId !== 'done').length}건
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">즉각적인 대응이 필요한 미결 이슈 개수입니다. 클릭하여 상세 목록을 확인하세요.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Overlay Modal */}
            {activeModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-sm font-black text-slate-850">
                                {activeModal.label} 상세 내역 ({activeModal.items.length})
                            </h2>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setActiveModal(null); }} 
                                className="px-3 py-1.5 text-[10px] font-black text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="p-5 max-h-[300px] overflow-y-auto space-y-2 custom-scrollbar">
                            {activeModal.items.length === 0 ? (
                                <div className="py-12 text-center text-xs font-bold text-slate-300 italic">내역이 없습니다.</div>
                            ) : (
                                activeModal.items.map(item => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => {
                                            setActiveModal(null);
                                            navigate(activeModal.type === 'project' ? '/project/management' : '/project/issues');
                                        }}
                                        className="p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer flex justify-between items-center group"
                                    >
                                        <div className="min-w-0 flex-1 pr-4">
                                            <div className="text-xs font-black text-slate-800 group-hover:text-indigo-600 truncate">{item.name || item.title}</div>
                                            <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                                                {activeModal.type === 'project' ? `${item.code} · ${item.ownerName}` : `${item.category || '이슈'} · 담당: ${item.assignedTo || '미지정'}`}
                                            </div>
                                        </div>
                                        {activeModal.type === 'project' ? (
                                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{item.progress}%</span>
                                        ) : (
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${item.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : item.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {item.priority === 'urgent' ? '긴급' : item.priority === 'high' ? '높음' : '보통'}
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom: Comprehensive Project List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                        <TrendingUp size={14} className="text-emerald-500"/> 전사 프로젝트 진척 및 리스크 리포트
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-slate-100">
                                <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">프로젝트</th>
                                <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">공정 단계</th>
                                <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">진척도</th>
                                <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">이슈 현황</th>
                                <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">리스크</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {projects.map(p => {
                                const projIssues = issues.filter(i => i.projectId === p.id);
                                const activeIssues = projIssues.filter(i => i.columnId !== 'done').length;
                                const isDelayed = p.schedules?.[p.currentStage]?.end && new Date(p.schedules[p.currentStage].end) < new Date() && p.schedules[p.currentStage].status !== 'completed';

                                return (
                                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-2.5">
                                            <div className="text-xs font-black text-slate-800">{p.name}</div>
                                            <div className="text-[9px] text-slate-400 font-mono">{p.code}</div>
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${PROCESS_STAGES.find(s => s.id === p.currentStage)?.color.replace('bg-', 'bg-').replace('500', '50')} ${PROCESS_STAGES.find(s => s.id === p.currentStage)?.color.replace('bg-', 'text-')}`}>
                                                {PROCESS_STAGES.find(s => s.id === p.currentStage)?.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 min-w-[80px] h-1 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500" style={{ width: `${p.progress}%` }} />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700">{p.progress}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <div className="inline-flex items-center gap-2 px-1.5 py-0.5 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-[9px] font-black text-slate-400">OPEN: <span className={activeIssues > 0 ? 'text-rose-500' : 'text-slate-400'}>{activeIssues}</span></span>
                                                <span className="text-slate-200">|</span>
                                                <span className="text-[9px] font-black text-slate-400">TOTAL: {projIssues.length}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {activeIssues > 3 || isDelayed ? (
                                                <span className="flex items-center gap-1 text-rose-500 text-[9px] font-black uppercase tracking-tighter">
                                                    <AlertTriangle size={10}/> {isDelayed ? '일정지연' : '이슈과다'}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-emerald-500 text-[9px] font-black uppercase tracking-tighter">
                                                    <CheckCircle2 size={10}/> 안정적
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, total, color, isWarning }) {
    const colors = {
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        rose: 'bg-rose-50 text-rose-600 border-rose-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        orange: 'bg-orange-50 text-orange-600 border-orange-100',
    };

    return (
        <div className={`p-4 rounded-2xl border bg-white shadow-sm flex items-center gap-3 transition-all hover:shadow-md ${isWarning ? 'ring-1 ring-rose-200 border-rose-300' : ''}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
                <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</div>
                <div className="flex items-end gap-1.5 mt-0.5">
                    <div className="text-xl font-black text-slate-900 leading-none">{value}</div>
                    {total !== undefined && <div className="text-[10px] font-bold text-slate-300 mb-0.5">/ {total}</div>}
                </div>
            </div>
        </div>
    );
}
