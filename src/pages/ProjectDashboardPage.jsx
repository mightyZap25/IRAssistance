import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
    Briefcase, CheckCircle2, Clock, AlertTriangle, 
    BarChart3, PieChart, TrendingUp, ChevronRight, 
    Layers, Users, FileText, Zap, AlertOctagon, MessageSquare
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
    const [projects, setProjects] = useState([]);
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);

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
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <BarChart3 className="text-indigo-600" size={32} /> 통합 운영 현황
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">프로젝트 진척도와 리스크(이슈) 현황을 한눈에 통합 관리합니다.</p>
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
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3">
                        <Layers size={18} className="text-indigo-500"/> 개발 공정별 분포
                    </h3>
                    <div className="space-y-4">
                        {stats.stageDist.map(stage => (
                            <div key={stage.id} className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-black uppercase">
                                    <span className="text-slate-600">{stage.label}</span>
                                    <span className="text-slate-900">{stage.count}개</span>
                                </div>
                                <div className="h-2 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                    <div className={`h-full ${stage.color} transition-all duration-1000`} style={{ width: `${stats.totalProj > 0 ? (stage.count / stats.totalProj) * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Issue Priority Distribution */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3">
                        <AlertOctagon size={18} className="text-rose-500"/> 이슈 우선순위 현황
                    </h3>
                    <div className="space-y-4">
                        {stats.issuePriorityDist.map(item => (
                            <div key={item.label} className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-black uppercase">
                                    <span className="text-slate-600">{item.label}</span>
                                    <span className="text-slate-900">{item.count}건</span>
                                </div>
                                <div className="h-2 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                    <div className={`h-full ${item.color} transition-all duration-1000`} style={{ width: `${stats.totalIssues > 0 ? (item.count / stats.totalIssues) * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Urgent Action Items (Recent Issues) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                            <Zap size={18} className="text-amber-500"/> 긴급 조치 필요 이슈
                        </h3>
                        <ChevronRight size={16} className="text-slate-400" />
                    </div>
                    <div className="flex-1 overflow-auto divide-y divide-slate-50">
                        {issues.filter(i => (i.priority === 'urgent' || i.priority === 'high') && i.columnId !== 'done').slice(0, 5).map(i => (
                            <div key={i.id} className="p-4 hover:bg-slate-50 transition-all group">
                                <div className="flex items-start gap-3">
                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i.priority === 'urgent' ? 'bg-rose-500 animate-pulse' : 'bg-orange-500'}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-black text-slate-800 truncate mb-0.5">{i.title}</div>
                                        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase">
                                            <span className="text-indigo-600">{i.projectId ? projects.find(p => p.id === i.projectId)?.name.slice(0,10)+'...' : '일반 이슈'}</span>
                                            <span>·</span>
                                            <span>{i.category}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {issues.filter(i => (i.priority === 'urgent' || i.priority === 'high') && i.columnId !== 'done').length === 0 && (
                            <div className="py-12 text-center text-[10px] font-bold text-slate-300 italic">긴급 이슈 없음</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom: Comprehensive Project List */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-500"/> 전사 프로젝트 진척 및 리스크 리포트
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">프로젝트</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">공정 단계</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">진척도</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">이슈 현황</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">리스크</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {projects.map(p => {
                                const projIssues = issues.filter(i => i.projectId === p.id);
                                const activeIssues = projIssues.filter(i => i.columnId !== 'done').length;
                                const isDelayed = p.schedules?.[p.currentStage]?.end && new Date(p.schedules[p.currentStage].end) < new Date() && p.schedules[p.currentStage].status !== 'completed';

                                return (
                                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-black text-slate-800">{p.name}</div>
                                            <div className="text-[9px] text-slate-400 font-mono">{p.code}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${PROCESS_STAGES.find(s => s.id === p.currentStage)?.color.replace('bg-', 'bg-').replace('500', '50')} ${PROCESS_STAGES.find(s => s.id === p.currentStage)?.color.replace('bg-', 'text-')}`}>
                                                {PROCESS_STAGES.find(s => s.id === p.currentStage)?.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 min-w-[80px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500" style={{ width: `${p.progress}%` }} />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700">{p.progress}%</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex items-center gap-2 px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400">OPEN: <span className={activeIssues > 0 ? 'text-rose-500' : 'text-slate-400'}>{activeIssues}</span></span>
                                                <span className="text-slate-200">|</span>
                                                <span className="text-[10px] font-black text-slate-400">TOTAL: {projIssues.length}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {activeIssues > 3 || isDelayed ? (
                                                <span className="flex items-center gap-1.5 text-rose-500 text-[10px] font-black uppercase tracking-tighter">
                                                    <AlertTriangle size={12}/> {isDelayed ? '일정지연' : '이슈과다'}
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-black uppercase tracking-tighter">
                                                    <CheckCircle2 size={12}/> 안정적
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
        <div className={`p-5 rounded-3xl border bg-white shadow-sm flex items-center gap-4 transition-all hover:shadow-md ${isWarning ? 'ring-2 ring-rose-200' : ''}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colors[color]}`}>
                <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</div>
                <div className="flex items-end gap-2 mt-1">
                    <div className="text-2xl font-black text-slate-900 leading-none">{value}</div>
                    {total !== undefined && <div className="text-xs font-bold text-slate-300 mb-0.5">/ {total}</div>}
                </div>
            </div>
        </div>
    );
}
