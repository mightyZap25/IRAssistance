import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, CheckCircle2, Circle, Clock, FileText, ChevronRight, 
    ArrowRight, Upload, ExternalLink, History, MessageSquare,
    Trash2, Plus, Save, Briefcase, User, Layers, Layout, AlertCircle
} from 'lucide-react';
import { getIssuesByProject } from '../services/issueService';
import StageTaskBoard from './common/StageTaskBoard';

const STAGE_DOCUMENTS = {
    planning: ['제품 기획서', '시장 분석서', '개발 일정표'],
    development: ['회로도', 'PCB Layout', '기구 도면', '소스코드 링크', '개발 검토서'],
    dev_pp: ['시작품 제작 보고서', '초기 성능 측정서', '디자인 리뷰'],
    qa_test: ['QA 검사 성적서', '신뢰성 테스트 리포트', '버그 트래킹 리포트'],
    prod_pp: ['생산 준비 검토서', '금형/지그 리스트', '작업 표준서'],
    mp_transfer: ['양산 이관 승인서', '최종 BOM', '포장 사양서'],
};

export default function ProjectProcessPanel({ isOpen, onClose, project, stages, onUpdate, users, currentUser }) {
    const [viewMode, setViewMode] = useState('overview'); // overview | issues | stage_detail
    const [activeStageId, setActiveStageId] = useState(null);
    const [newTest, setNewTest] = useState({ parent: '', child: '' });
    const [isAddingNewParent, setIsAddingNewParent] = useState(false);
    const [inlineAddingGroup, setInlineAddingGroup] = useState(null);
    const [inlineTaskName, setInlineTaskName] = useState('');
    const [newLink, setNewLink] = useState({ title: '', url: '' }); // 링크 추가 상태 관리
    const [projectIssues, setProjectIssues] = useState([]);
    const [loadingIssues, setLoadingIssues] = useState(false);
    const [editingTest, setEditingTest] = useState(null); // The test task object currently opened in details

    useEffect(() => {
        if (isOpen && project) {
            setViewMode('overview');
            setActiveStageId(null);
            fetchIssues();
        }
    }, [isOpen, project]);

    const fetchIssues = async () => {
        if (!project?.id) return;
        setLoadingIssues(true);
        try {
            const issues = await getIssuesByProject(project.id);
            setProjectIssues(issues);
        } catch (error) {
            console.error("Failed to fetch project issues:", error);
        } finally {
            setLoadingIssues(false);
        }
    };

    if (!isOpen || !project) return null;

    const currentStageIdx = stages.findIndex(s => s.id === project.currentStage);
    const activeStage = activeStageId ? stages.find(s => s.id === activeStageId) : null;

    // Actions
    const handleStageSelect = (stageId) => {
        setActiveStageId(stageId);
        setViewMode('stage_detail');
    };


    const handleStageChange = async (stageId) => {
        if (!window.confirm(`프로젝트 단계를 [${stages.find(s => s.id === stageId).label}]로 변경하시겠습니까?`)) return;
        const newIdx = stages.findIndex(s => s.id === stageId);
        const progress = Math.round(((newIdx + 1) / stages.length) * 100);
        const newHistory = [
            { stage: stageId, date: new Date().toISOString(), note: `단계 변경: ${stages.find(s => s.id === project.currentStage).label} ➔ ${stages.find(s => s.id === stageId).label}` },
            ...(project.stageHistory || [])
        ];
        await onUpdate(project.id, { currentStage: stageId, progress, stageHistory: newHistory });
    };

    const handleScheduleChange = async (stageId, field, value) => {
        const updatedSchedules = { ...project.schedules };
        if (!updatedSchedules[stageId]) updatedSchedules[stageId] = { start: '', end: '', status: 'pending' };
        updatedSchedules[stageId][field] = value;
        await onUpdate(project.id, { schedules: updatedSchedules });
    };

    // 태스크 완료율 기반 프로젝트 진행률 자동 계산
    const calcProgressFromTasks = (tests) => {
        const allTasks = Object.values(tests || {}).flat();
        if (allTasks.length === 0) return project.progress || 0;
        const done = allTasks.filter(t => t.status === 'done' || t.completed === true).length;
        return Math.round((done / allTasks.length) * 100);
    };

    const handleAddTest = async (stageId, groupName, taskName) => {
        const pName = groupName ?? newTest.parent;
        const cName = taskName ?? newTest.child;
        if (!pName || !cName) return;
        const updatedTests = { ...(project.tests || {}) };
        if (!updatedTests[stageId]) updatedTests[stageId] = [];
        updatedTests[stageId].push({ 
            id: Date.now(), 
            parent: pName,       // 그룹명 (호환성 유지)
            title: cName,        // 타스크명 (통일된 필드명)
            child: cName,        // 하위 호환성 유지
            status: 'todo',      // 다단계 상태
            completed: false,    // 호환성 유지
            updatedAt: new Date().toISOString(),
            startDate: project.schedules?.[stageId]?.start || '',
            dueDate: project.schedules?.[stageId]?.end || '',
            endDate: project.schedules?.[stageId]?.end || '',   // 호환성 유지
            assigneeUid: '',
            assigneeName: '',
            priority: 'Medium',
            difficulty: 'Medium',
            notes: ''
        });
        const newProgress = calcProgressFromTasks(updatedTests);
        await onUpdate(project.id, { tests: updatedTests, progress: newProgress });
        setNewTest({ parent: pName, child: '' }); 
        setInlineAddingGroup(null);
        setInlineTaskName('');
    };

    const toggleTest = async (stageId, testId) => {
        const updatedTests = { ...project.tests };
        updatedTests[stageId] = updatedTests[stageId].map(t => {
            if (t.id !== testId) return t;
            const isDone = t.status === 'done' || t.completed === true;
            return { 
                ...t, 
                status: isDone ? 'todo' : 'done',
                completed: !isDone,
                updatedAt: new Date().toISOString() 
            };
        });
        const newProgress = calcProgressFromTasks(updatedTests);
        await onUpdate(project.id, { tests: updatedTests, progress: newProgress });
        if (editingTest && editingTest.id === testId) {
            const updated = updatedTests[stageId].find(t => t.id === testId);
            setEditingTest(prev => ({ ...prev, status: updated.status, completed: updated.completed }));
        }
    };

    const removeTest = async (stageId, testId) => {
        const updatedTests = { ...project.tests };
        updatedTests[stageId] = updatedTests[stageId].filter(t => t.id !== testId);
        await onUpdate(project.id, { tests: updatedTests });
        if (editingTest && editingTest.id === testId) {
            setEditingTest(null);
        }
    };

    const handleUpdateTestDetail = async (stageId, testId, fields) => {
        const updatedTests = { ...project.tests };
        updatedTests[stageId] = updatedTests[stageId].map(t => {
            if (t.id === testId) {
                const updated = { ...t, ...fields, updatedAt: new Date().toISOString() };
                // status/completed 동기화
                if (fields.status !== undefined) updated.completed = (fields.status === 'done');
                if (fields.completed !== undefined) updated.status = fields.completed ? 'done' : 'todo';
                // title/child 동기화
                if (fields.title !== undefined) updated.child = fields.title;
                if (fields.child !== undefined) updated.title = fields.child;
                if (fields.assigneeUid !== undefined) {
                    const matchedUser = (users || []).find(u => u.uid === fields.assigneeUid);
                    updated.assigneeName = matchedUser ? matchedUser.displayName : '';
                }
                return updated;
            }
            return t;
        });
        const newProgress = calcProgressFromTasks(updatedTests);
        await onUpdate(project.id, { tests: updatedTests, progress: newProgress });
        if (editingTest && editingTest.id === testId) {
            setEditingTest(prev => {
                const nextVal = { ...prev, ...fields };
                if (fields.status !== undefined) nextVal.completed = (fields.status === 'done');
                if (fields.completed !== undefined) nextVal.status = fields.completed ? 'done' : 'todo';
                if (fields.title !== undefined) nextVal.child = fields.title;
                if (fields.child !== undefined) nextVal.title = fields.child;
                if (fields.assigneeUid !== undefined) {
                    const matchedUser = (users || []).find(u => u.uid === fields.assigneeUid);
                    nextVal.assigneeName = matchedUser ? matchedUser.displayName : '';
                }
                return nextVal;
            });
        }
    };

    const addDocumentLink = async (stageId, docName) => {
        const link = window.prompt(`${docName} 문서 링크(URL)를 입력하세요:`);
        if (!link) return;
        const updatedDocs = { ...project.documents };
        if (!updatedDocs[stageId]) updatedDocs[stageId] = [];
        updatedDocs[stageId].push({ name: docName, url: link, updatedAt: new Date().toISOString(), updatedBy: project.ownerName });
        await onUpdate(project.id, { documents: updatedDocs });
    };

    const handleMemoChange = async (stageId, value) => {
        const updatedMemos = { ...(project.memos || {}) };
        updatedMemos[stageId] = value;
        await onUpdate(project.id, { memos: updatedMemos });
    };

    return createPortal(
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[140]" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-full md:w-[750px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
                
                {/* 1. Header */}
                <div className="bg-white px-5 pt-4 pb-3 border-b border-slate-200 shrink-0">
                    <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[9px] font-black border border-indigo-100 font-mono tracking-tighter uppercase">{project.code}</span>
                                {/* 현재 단계 뱅지 */}
                                {(() => {
                                    const s = stages.find(st => st.id === project.currentStage);
                                    return s ? (
                                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 border border-amber-200 ${s.color}`}>
                                            <s.icon size={10}/> {s.label}
                                        </span>
                                    ) : null;
                                })()}
                            </div>
                            <h2 className="text-base font-black text-slate-900 leading-tight truncate">{project.name}</h2>
                        </div>
                        <button onClick={onClose} className="ml-3 p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all shrink-0">
                            <X size={18}/>
                        </button>
                    </div>
                    {/* 전체 진행률 바 */}
                    <div className="mt-3 space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Overall Progress</span>
                            <span className={`text-[10px] font-black ${
                                (project.progress || 0) >= 80 ? 'text-emerald-600' :
                                (project.progress || 0) >= 40 ? 'text-indigo-600' : 'text-amber-600'
                            }`}>{project.progress || 0}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-700 ${
                                    (project.progress || 0) >= 80 ? 'bg-emerald-500' :
                                    (project.progress || 0) >= 40 ? 'bg-indigo-500' : 'bg-amber-400'
                                }`}
                                style={{ width: `${project.progress || 0}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* 2. Navigation Tabs */}
                <div className="bg-white border-b border-slate-200 px-5 py-2 shrink-0 flex items-center gap-3 overflow-x-auto no-scrollbar shadow-sm">
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                            onClick={() => { setViewMode('overview'); setActiveStageId(null); }}
                            className={`flex flex-col items-center min-w-[60px] transition-all ${viewMode === 'overview' ? 'scale-105' : 'opacity-40 hover:opacity-100'}`}
                        >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 mb-1 transition-all ${viewMode === 'overview' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg ring-2 ring-indigo-50' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <Layout size={16} />
                            </div>
                            <span className={`text-[9px] font-black ${viewMode === 'overview' ? 'text-indigo-600' : 'text-slate-500'}`}>개요</span>
                        </button>
                        <button 
                            onClick={() => { setViewMode('issues'); setActiveStageId(null); }}
                            className={`flex flex-col items-center min-w-[60px] transition-all ${viewMode === 'issues' ? 'scale-105' : 'opacity-40 hover:opacity-100'}`}
                        >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 mb-1 transition-all ${viewMode === 'issues' ? 'bg-rose-600 border-rose-600 text-white shadow-lg ring-2 ring-rose-50' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <AlertCircle size={16} />
                            </div>
                            <span className={`text-[9px] font-black ${viewMode === 'issues' ? 'text-rose-600' : 'text-slate-500'}`}>이슈</span>
                        </button>
                    </div>
                    <div className="w-px h-6 bg-slate-100 shrink-0 mx-0.5" />
                    <div className="flex items-center gap-1">
                        {stages.map((stage, idx) => {
                            const isCurrent = project.currentStage === stage.id;
                            const isActive = activeStageId === stage.id;
                            const isCompleted = idx < currentStageIdx;
                            // Task 완료율
                            const stageTasks = project.tests?.[stage.id] || [];
                            const doneCount = stageTasks.filter(t => t.status === 'done' || t.completed).length;
                            const pct = stageTasks.length > 0 ? Math.round((doneCount / stageTasks.length) * 100) : null;
                            return (
                                <button key={stage.id} onClick={() => handleStageSelect(stage.id)} className={`flex flex-col items-center min-w-[75px] transition-all ${isActive ? 'scale-105' : 'opacity-50 hover:opacity-100'}`}>
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 mb-1 transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg ring-2 ring-indigo-50' : isCurrent ? 'bg-amber-50 border-amber-200 text-amber-600' : isCompleted ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        {isCompleted ? <CheckCircle2 size={16} /> : <stage.icon size={14} />}
                                    </div>
                                    <span className={`text-[9px] font-black ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>{stage.label}</span>
                                    {/* Task 완료율 배지 */}
                                    {pct !== null && (
                                        <span className={`text-[8px] font-black mt-0.5 px-1 py-0.5 rounded-full leading-none ${
                                            pct === 100 
                                                ? 'bg-emerald-100 text-emerald-700' 
                                                : isActive 
                                                    ? 'bg-indigo-100 text-indigo-700' 
                                                    : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {pct}%
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 3. Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                    {viewMode === 'overview' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 border-b pb-2"><Briefcase className="text-indigo-600" size={14}/> 프로젝트 프로필</h3>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">상세 목표</label>
                                    <div className="text-xs font-bold text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">{project.description || '등록된 설명이 없습니다.'}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-indigo-50/30 border border-indigo-100 space-y-0.5">
                                        <label className="text-[8px] font-black text-indigo-400 uppercase flex items-center gap-1"><Clock size={10}/> 기간</label>
                                        <div className="text-[10px] font-black text-indigo-900">{project.startDate || '미설정'} ~ {project.endDate || '미설정'}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-emerald-50/30 border border-emerald-100 space-y-0.5">
                                        <label className="text-[8px] font-black text-emerald-400 uppercase flex items-center gap-1"><Layers size={10}/> 전체 진척도</label>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden border border-emerald-100"><div className="h-full bg-emerald-500" style={{ width: `${project.progress}%` }} /></div>
                                            <span className="text-[10px] font-black text-emerald-700">{project.progress}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <span>🚀</span> 로드맵 요약
                                </h4>
                                <div className="space-y-1.5">
                                    {stages.map((s, idx) => {
                                        const isCurrent = project.currentStage === s.id;
                                        const isCompleted = idx < stages.findIndex(st => st.id === project.currentStage);
                                        const isFuture = !isCurrent && !isCompleted;
                                        const docCount = project.documents?.[s.id]?.length || 0;
                                        const stageTasks = project.tests?.[s.id] || [];
                                        const testDone = stageTasks.filter(t => t.status === 'done' || t.completed).length;
                                        const testTotal = stageTasks.length;
                                        const taskPct = testTotal > 0 ? Math.round((testDone / testTotal) * 100) : 0;
                                        const schedStart = project.schedules?.[s.id]?.start;
                                        const schedEnd = project.schedules?.[s.id]?.end;

                                        return (
                                            <div 
                                                key={s.id} 
                                                onClick={() => handleStageSelect(s.id)} 
                                                className={`relative flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer group overflow-hidden ${
                                                    isCurrent 
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                                                        : isCompleted 
                                                            ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400' 
                                                            : 'bg-white border-slate-200 hover:border-indigo-200 opacity-60 hover:opacity-100'
                                                }`}
                                            >
                                                {/* 왜쪽 아이콘 */}
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border-2 ${
                                                    isCurrent 
                                                        ? 'bg-white/20 border-white/30 text-white' 
                                                        : isCompleted 
                                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                                            : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:text-indigo-600'
                                                }`}>
                                                    {isCompleted 
                                                        ? <CheckCircle2 size={16}/> 
                                                        : <s.icon size={14}/>
                                                    }
                                                </div>

                                                {/* 중앙 콘텐츠 */}
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className={`text-xs font-black truncate ${
                                                            isCurrent ? 'text-white' : isCompleted ? 'text-emerald-800' : 'text-slate-700'
                                                        }`}>{s.label}</span>
                                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                                            {testTotal > 0 && (
                                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                                                    isCurrent ? 'bg-white/20 text-white' : isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                                }`}>
                                                                    {testDone}/{testTotal}
                                                                </span>
                                                            )}
                                                            {docCount > 0 && (
                                                                <span className={`text-[9px] font-black ${
                                                                    isCurrent ? 'text-white/70' : 'text-slate-400'
                                                                }`}>📄 {docCount}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Task 완료율 바 */}
                                                    {testTotal > 0 && (
                                                        <div className={`w-full h-1 rounded-full overflow-hidden ${
                                                            isCurrent ? 'bg-white/20' : 'bg-slate-200'
                                                        }`}>
                                                            <div 
                                                                className={`h-full rounded-full transition-all ${
                                                                    isCurrent ? 'bg-white' : isCompleted ? 'bg-emerald-500' : 'bg-indigo-400'
                                                                }`} 
                                                                style={{ width: `${taskPct}%` }} 
                                                            />
                                                        </div>
                                                    )}

                                                    {/* 일정 */}
                                                    {(schedStart || schedEnd) && (
                                                        <div className={`text-[8px] font-bold ${
                                                            isCurrent ? 'text-white/60' : 'text-slate-400'
                                                        }`}>
                                                            {schedStart || '?'} ~ {schedEnd || '?'}
                                                        </div>
                                                    )}
                                                </div>

                                                <ChevronRight size={14} className={isCurrent ? 'text-white/60' : 'text-slate-300 group-hover:text-indigo-500'}/>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {viewMode === 'issues' && (
                        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b pb-2"><AlertCircle size={14} className="text-rose-500"/> 이슈 트래커</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-slate-50 p-3 rounded-xl text-center"><div className="text-[8px] font-black text-slate-400">전체</div><div className="text-lg font-black">{projectIssues.length}</div></div>
                                    <div className="bg-rose-50 p-3 rounded-xl text-center"><div className="text-[8px] font-black text-rose-400">진행중</div><div className="text-lg font-black text-rose-600">{projectIssues.filter(i => i.columnId !== 'done').length}</div></div>
                                    <div className="bg-emerald-50 p-3 rounded-xl text-center"><div className="text-[8px] font-black text-emerald-400">완료</div><div className="text-lg font-black text-emerald-600">{projectIssues.filter(i => i.columnId === 'done').length}</div></div>
                                </div>
                                <div className="divide-y divide-slate-100 border-t">
                                    {loadingIssues ? <div className="py-10 text-center animate-pulse text-xs font-black text-slate-400">LOADING ISSUES...</div> : 
                                     projectIssues.length === 0 ? <div className="py-10 text-center text-[10px] text-slate-300 font-bold italic">NO ISSUES FOUND</div> :
                                     projectIssues.map(issue => (
                                        <div key={issue.id} className="py-3 flex items-center gap-3 group cursor-pointer" onClick={() => window.location.href='/project/issues'}>
                                            <div className={`w-1 h-6 rounded-full ${issue.priority === 'urgent' ? 'bg-rose-500' : issue.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                                            <div className="flex-1 min-w-0"><div className="text-[11px] font-black text-slate-800 truncate">{issue.title}</div><div className="text-[8px] font-bold text-slate-400 uppercase">{issue.category} · {issue.columnId}</div></div>
                                            <ChevronRight size={14} className="text-slate-200 group-hover:text-indigo-500"/>
                                        </div>
                                     ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {viewMode === 'stage_detail' && activeStage && (
                        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5"><Clock size={14} className="text-indigo-500"/> 일정 관리</h3>
                                    <select value={project.schedules?.[activeStageId]?.status || 'pending'} onChange={(e) => handleScheduleChange(activeStageId, 'status', e.target.value)} className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none">
                                        <option value="pending">대기</option><option value="in_progress">진행중</option><option value="completed">완료</option><option value="delayed">지연</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">시작</label><input type="date" value={project.schedules?.[activeStageId]?.start || ''} onChange={(e) => handleScheduleChange(activeStageId, 'start', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold" /></div>
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">완료</label><input type="date" value={project.schedules?.[activeStageId]?.end || ''} onChange={(e) => handleScheduleChange(activeStageId, 'end', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold" /></div>
                                </div>
                                {activeStageId !== project.currentStage && <button onClick={() => handleStageChange(activeStageId)} className="w-full bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black shadow-md hover:bg-indigo-700">단계를 [{activeStage.label}]로 변경</button>}
                            </div>

                                <div className="space-y-3">
                                    {/* PROJECT TASK - StageTaskBoard */}
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                                            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                                <CheckCircle2 size={14} className="text-emerald-500"/>
                                                PROJECT TASK
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black text-slate-400">
                                                    {project.tests?.[activeStageId]?.filter(t => t.status === 'done' || t.completed).length || 0}
                                                    /{project.tests?.[activeStageId]?.length || 0} 완료
                                                </span>
                                                {/* 신규 그룹 추가 */}
                                                {newTest.parent ? (
                                                    <div className="flex items-center gap-1.5 animate-in slide-in-from-right duration-200">
                                                        <input
                                                            type="text"
                                                            autoFocus
                                                            placeholder="첫 태스크명"
                                                            value={newTest.child}
                                                            onChange={e => setNewTest(p => ({ ...p, child: e.target.value }))}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddTest(activeStageId);
                                                                if (e.key === 'Escape') setNewTest({ parent: '', child: '' });
                                                            }}
                                                            className="w-32 bg-slate-50 border border-indigo-200 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-400"
                                                        />
                                                        <button
                                                            onClick={() => handleAddTest(activeStageId)}
                                                            disabled={!newTest.child}
                                                            className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                                                        >
                                                            생성
                                                        </button>
                                                        <button
                                                            onClick={() => setNewTest({ parent: '', child: '' })}
                                                            className="p-1 text-slate-300 hover:text-rose-400 transition-colors"
                                                        >
                                                            <X size={12}/>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            const g = window.prompt('신규 그룹명을 입력하세요 (예: 기구설계, 소프트웨어)');
                                                            if (g?.trim()) setNewTest({ parent: g.trim(), child: '' });
                                                        }}
                                                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[9px] font-black hover:bg-indigo-100 transition-colors"
                                                    >
                                                        <Plus size={11}/> 그룹 추가
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <StageTaskBoard
                                                tasks={project.tests?.[activeStageId] || []}
                                                users={users}
                                                onSelect={setEditingTest}
                                                onUpdateTask={(id, fields) => handleUpdateTestDetail(activeStageId, id, fields)}
                                                onDeleteTask={(id) => removeTest(activeStageId, id)}
                                                onAddTask={(groupName, taskName) => handleAddTest(activeStageId, groupName, taskName)}
                                            />
                                        </div>
                                    </div>
                                </div>

                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
                                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b pb-2"><MessageSquare size={14} className="text-blue-500"/> 업무 메모</h3>
                                <textarea rows="3" value={project.memos?.[activeStageId] || ''} onChange={(e) => handleMemoChange(activeStageId, e.target.value)} placeholder="기록 사항..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[10px] font-medium resize-none shadow-inner" />
                            </div>

                            {/* 기술 산출물 */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                                <h3 className="text-xs font-black text-slate-800 border-b pb-2 flex justify-between items-center">
                                    <span className="flex items-center gap-1.5"><FileText size={14} className="text-slate-400"/> 기술 산출물</span>
                                    <span className="text-[9px] font-black text-slate-400">{project.documents?.[activeStageId]?.length || 0}/{STAGE_DOCUMENTS[activeStageId]?.length} 건</span>
                                </h3>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {STAGE_DOCUMENTS[activeStageId]?.map((docName, idx) => {
                                        const uploadedDoc = project.documents?.[activeStageId]?.find(d => d.name === docName);
                                        return (
                                            <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all group/doc ${
                                                uploadedDoc 
                                                    ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300' 
                                                    : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                                            }`}>
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${
                                                    uploadedDoc ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                                                }`}>
                                                    {uploadedDoc ? '✓' : `${idx + 1}`}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[10px] font-black truncate ${uploadedDoc ? 'text-emerald-800' : 'text-slate-600'}`}>{docName}</p>
                                                    <p className="text-[8px] text-slate-400 font-bold">
                                                        {uploadedDoc ? `등록: ${uploadedDoc.updatedAt.split('T')[0]}` : '미등록'}
                                                    </p>
                                                </div>
                                                {uploadedDoc 
                                                    ? <a href={uploadedDoc.url} target="_blank" rel="noopener noreferrer" 
                                                        className="shrink-0 flex items-center gap-1 px-2 py-1 bg-white text-emerald-600 rounded-lg border border-emerald-200 text-[9px] font-black shadow-sm hover:bg-emerald-50 transition-colors">
                                                        <ExternalLink size={10}/> 열기
                                                      </a>
                                                    : <button onClick={() => addDocumentLink(activeStageId, docName)} 
                                                        className="shrink-0 flex items-center gap-1 px-2 py-1 bg-white text-indigo-600 rounded-lg border border-indigo-100 text-[9px] font-black shadow-sm hover:bg-indigo-50 transition-colors">
                                                        <Plus size={10}/> 등록
                                                      </button>
                                                }
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Footer */}
                <div className="px-5 py-3 bg-white border-t border-slate-100 shrink-0 flex items-center justify-between">
                    <button 
                        onClick={() => { if(window.confirm("프로젝트를 삭제하시겠습니까?")) { onClose(); } }} 
                        className="flex items-center gap-1.5 text-rose-400 text-[9px] font-black hover:text-rose-600 uppercase tracking-widest px-2 py-1 hover:bg-rose-50 rounded-lg transition-all"
                    >
                        <Trash2 size={11}/> 삭제
                    </button>
                    <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-300">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        Sync: {project.updatedAt?.toDate ? project.updatedAt.toDate().toLocaleTimeString('ko-KR') : 'N/A'}
                    </div>
                </div>

                {/* 5. Task Detail Modal */}
                {editingTest && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                            {/* 모달 헤더 */}
                            <div className={`px-5 pt-5 pb-4 border-b border-slate-100 flex justify-between items-start ${
                                (() => {
                                    const s = editingTest.status || (editingTest.completed ? 'done' : 'todo');
                                    return s === 'done' ? 'bg-gradient-to-r from-emerald-50 to-white' :
                                           s === 'working' ? 'bg-gradient-to-r from-amber-50 to-white' :
                                           s === 'stuck' ? 'bg-gradient-to-r from-rose-50 to-white' :
                                           'bg-slate-50/50';
                                })()
                            }`}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">TASK DETAILS</span>
                                        {/* 현재 상태 표시 */}
                                        {(() => {
                                            const s = editingTest.status || (editingTest.completed ? 'done' : 'todo');
                                            const cfg = {
                                                todo:    { label: '작업 전', cls: 'bg-slate-200 text-slate-700' },
                                                working: { label: '진행 중', cls: 'bg-amber-400 text-white' },
                                                stuck:   { label: '막힐',   cls: 'bg-rose-500 text-white' },
                                                done:    { label: '완료',   cls: 'bg-emerald-500 text-white' },
                                            }[s] || { label: s, cls: 'bg-slate-100 text-slate-600' };
                                            return <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
                                        })()}
                                    </div>
                                    <h3 className="text-sm font-black text-slate-900 leading-snug">[{editingTest.parent}] {editingTest.title || editingTest.child}</h3>
                                    {editingTest.dueDate && (
                                        <p className="text-[9px] text-rose-500 font-black mt-1">
                                            마감: {editingTest.dueDate || editingTest.endDate}
                                        </p>
                                    )}
                                </div>
                                <button type="button" onClick={() => setEditingTest(null)} className="ml-3 p-1.5 text-slate-400 hover:text-slate-700 bg-white/80 rounded-xl shrink-0 shadow-sm">
                                    <X size={16}/>
                                </button>
                            </div>
                            
                            <div className="p-5 space-y-4 flex-1 overflow-y-auto text-xs">
                                {/* Status */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">진행 상태</label>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {[
                                            { key: 'todo',    label: '작업 전', emoji: '⏳', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
                                            { key: 'working', label: '진행 중', emoji: '🔄', cls: 'bg-amber-400 text-white border-amber-400' },
                                            { key: 'stuck',   label: '막힐',   emoji: '🚧', cls: 'bg-rose-500 text-white border-rose-500' },
                                            { key: 'done',    label: '완료',   emoji: '✅', cls: 'bg-emerald-500 text-white border-emerald-500' },
                                        ].map(opt => {
                                            const curStatus = editingTest.status || (editingTest.completed ? 'done' : 'todo');
                                            const isAct = curStatus === opt.key;
                                            return (
                                                <button
                                                    key={opt.key}
                                                    onClick={() => handleUpdateTestDetail(activeStageId, editingTest.id, { status: opt.key })}
                                                    className={`flex flex-col items-center py-2 rounded-xl font-black text-[10px] border-2 transition-all ${
                                                        isAct ? opt.cls + ' shadow-md scale-105' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <span className="text-lg">{opt.emoji}</span>
                                                    <span>{opt.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 날짜 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">시작일</label>
                                        <input 
                                            type="date" 
                                            value={editingTest.startDate || ''} 
                                            onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { startDate: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold focus:ring-1 focus:ring-indigo-300 outline-none" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">마감일</label>
                                        <input 
                                            type="date" 
                                            value={editingTest.dueDate || editingTest.endDate || ''} 
                                            onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { dueDate: e.target.value, endDate: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold focus:ring-1 focus:ring-indigo-300 outline-none" 
                                        />
                                    </div>
                                </div>

                                {/* 담당자 - 아바타 버튼 그리드 */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">담당자</label>
                                    <div className="flex flex-wrap gap-2">
                                        {/* 담당자 없음 */}
                                        <button
                                            onClick={() => handleUpdateTestDetail(activeStageId, editingTest.id, { assigneeUid: '', assigneeName: '' })}
                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black border-2 transition-all ${
                                                !editingTest.assigneeUid 
                                                    ? 'bg-slate-700 text-white border-slate-700 shadow-md' 
                                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <User size={11}/> 미지정
                                        </button>
                                        {(users || []).map(u => {
                                            const isAssigned = editingTest.assigneeUid === u.uid;
                                            return (
                                                <button
                                                    key={u.uid}
                                                    onClick={() => handleUpdateTestDetail(activeStageId, editingTest.id, { assigneeUid: u.uid })}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black border-2 transition-all ${
                                                        isAssigned 
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                                    }`}
                                                >
                                                    {u.photoURL 
                                                        ? <img src={u.photoURL} alt="" className="w-4 h-4 rounded-full"/>
                                                        : <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black ${
                                                            isAssigned ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'
                                                          }`}>{u.displayName?.[0]}</div>
                                                    }
                                                    {u.displayName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 우선순위 + 난이도 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">우선순위</label>
                                        <div className="flex gap-1">
                                            {[{v:'High',l:'높음',c:'bg-rose-500 text-white'},{v:'Medium',l:'보통',c:'bg-amber-400 text-white'},{v:'Low',l:'낙음',c:'bg-slate-300 text-slate-700'}].map(opt => (
                                                <button key={opt.v}
                                                    onClick={() => handleUpdateTestDetail(activeStageId, editingTest.id, { priority: opt.v })}
                                                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-black transition-all border-2 ${
                                                        (editingTest.priority || 'Medium') === opt.v 
                                                            ? opt.c + ' border-transparent shadow-sm scale-105' 
                                                            : 'bg-white text-slate-400 border-slate-200'
                                                    }`}
                                                >{opt.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">난이도</label>
                                        <div className="flex gap-1">
                                            {[{v:'High',l:'어려움',c:'bg-purple-500 text-white'},{v:'Medium',l:'보통',c:'bg-blue-400 text-white'},{v:'Low',l:'쉽음',c:'bg-slate-300 text-slate-700'}].map(opt => (
                                                <button key={opt.v}
                                                    onClick={() => handleUpdateTestDetail(activeStageId, editingTest.id, { difficulty: opt.v })}
                                                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-black transition-all border-2 ${
                                                        (editingTest.difficulty || 'Medium') === opt.v 
                                                            ? opt.c + ' border-transparent shadow-sm scale-105' 
                                                            : 'bg-white text-slate-400 border-slate-200'
                                                    }`}
                                                >{opt.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* 링크 */}
                                <div className="space-y-2">
                                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <ExternalLink size={11}/> 참조 문서 및 링크
                                    </h4>
                                    <div className="space-y-1.5">
                                        {(editingTest.links || []).map((link, lIdx) => (
                                            <div key={lIdx} className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl group/link">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[10px] font-black text-slate-700 truncate">{link.title}</span>
                                                    <a href={link.url} target="_blank" rel="noreferrer" className="text-[8px] text-blue-500 hover:underline truncate">{link.url}</a>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const nextLinks = editingTest.links.filter((_, i) => i !== lIdx);
                                                        handleUpdateTestDetail(activeStageId, editingTest.id, { links: nextLinks });
                                                    }}
                                                    className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover/link:opacity-100 transition-all"
                                                >
                                                    <X size={10}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="문서명" 
                                            value={newLink.title}
                                            onChange={e => setNewLink(p => ({ ...p, title: e.target.value }))}
                                            className="w-1/3 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-300" 
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="URL (구글드라이브 등)" 
                                            value={newLink.url}
                                            onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newLink.title && newLink.url) {
                                                    const nextLinks = [...(editingTest.links || []), { title: newLink.title, url: newLink.url }];
                                                    handleUpdateTestDetail(activeStageId, editingTest.id, { links: nextLinks });
                                                    setNewLink({ title: '', url: '' });
                                                }
                                            }}
                                            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none focus:ring-1 focus:ring-indigo-300" 
                                        />
                                        <button 
                                            onClick={() => {
                                                if (newLink.title && newLink.url) {
                                                    const nextLinks = [...(editingTest.links || []), { title: newLink.title, url: newLink.url }];
                                                    handleUpdateTestDetail(activeStageId, editingTest.id, { links: nextLinks });
                                                    setNewLink({ title: '', url: '' });
                                                }
                                            }}
                                            className="px-3 py-1 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-[10px] font-black hover:bg-indigo-100 transition-colors"
                                        >
                                            추가
                                        </button>
                                    </div>
                                </div>

                                {/* 메모 */}
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">메모 및 상세 내역</label>
                                    <textarea 
                                        rows="5" 
                                        value={editingTest.notes || ''} 
                                        onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { notes: e.target.value })}
                                        placeholder="이 TASK의 상세 지침, 실행 로그, 참고 사항 등..." 
                                        className="w-full bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4 text-[11px] font-medium resize-none text-slate-800 placeholder-slate-400/70 focus:outline-none focus:ring-1 focus:ring-amber-300" 
                                    />
                                </div>
                            </div>

                            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                                <button 
                                    type="button" 
                                    onClick={() => { removeTest(activeStageId, editingTest.id); setEditingTest(null); }} 
                                    className="flex items-center gap-1.5 px-4 py-2 bg-white text-rose-500 hover:bg-rose-50 border border-rose-200 transition-all font-black text-[10px] rounded-xl shadow-sm"
                                >
                                    <Trash2 size={12}/> 삭제
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setEditingTest(null)} 
                                    className="flex-1 py-2 bg-indigo-600 text-white hover:bg-indigo-700 transition-all font-black text-[10px] rounded-xl shadow-md shadow-indigo-100"
                                >
                                    저장 및 닫기
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
