import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, CheckCircle2, Circle, Clock, FileText, ChevronRight, 
    ArrowRight, Upload, ExternalLink, History, MessageSquare,
    Trash2, Plus, Save, Briefcase, User, Layers, Layout, AlertCircle
} from 'lucide-react';
import { getIssuesByProject } from '../services/issueService';
import MondayBoard from './common/MondayBoard';

const STAGE_DOCUMENTS = {
    planning: ['제품 기획서', '시장 분석서', '개발 일정표'],
    development: ['회로도', 'PCB Layout', '기구 도면', '소스코드 링크', '개발 검토서'],
    dev_pp: ['시작품 제작 보고서', '초기 성능 측정서', '디자인 리뷰'],
    qa_test: ['QA 검사 성적서', '신뢰성 테스트 리포트', '버그 트래킹 리포트'],
    prod_pp: ['생산 준비 검토서', '금형/지그 리스트', '작업 표준서'],
    mp_transfer: ['양산 이관 승인서', '최종 BOM', '포장 사양서'],
};

export default function ProjectProcessPanel({ isOpen, onClose, project, stages, onUpdate, users }) {
    const [viewMode, setViewMode] = useState('overview'); // overview | issues | stage_detail
    const [activeStageId, setActiveStageId] = useState(null);
    const [newTest, setNewTest] = useState({ parent: '', child: '' });
    const [isAddingNewParent, setIsAddingNewParent] = useState(false);
    
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

    const handleAddTest = async (stageId) => {
        if (!newTest.parent || !newTest.child) return;
        const updatedTests = { ...(project.tests || {}) };
        if (!updatedTests[stageId]) updatedTests[stageId] = [];
        updatedTests[stageId].push({ 
            id: Date.now(), 
            parent: newTest.parent, 
            child: newTest.child, 
            completed: false, 
            updatedAt: new Date().toISOString(),
            startDate: project.schedules?.[stageId]?.start || '',
            endDate: project.schedules?.[stageId]?.end || '',
            assigneeUid: '',
            assigneeName: '',
            priority: 'Medium', // High, Medium, Low
            difficulty: 'Medium', // High, Medium, Low
            notes: ''
        });
        await onUpdate(project.id, { tests: updatedTests });
        setNewTest({ ...newTest, child: '' }); 
    };

    const toggleTest = async (stageId, testId) => {
        const updatedTests = { ...project.tests };
        updatedTests[stageId] = updatedTests[stageId].map(t => t.id === testId ? { ...t, completed: !t.completed, updatedAt: new Date().toISOString() } : t);
        await onUpdate(project.id, { tests: updatedTests });
        // sync details state if open
        if (editingTest && editingTest.id === testId) {
            setEditingTest(prev => ({ ...prev, completed: !prev.completed }));
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
                if (fields.assigneeUid !== undefined) {
                    const matchedUser = (users || []).find(u => u.uid === fields.assigneeUid);
                    updated.assigneeName = matchedUser ? matchedUser.displayName : '';
                }
                return updated;
            }
            return t;
        });
        await onUpdate(project.id, { tests: updatedTests });
        if (editingTest && editingTest.id === testId) {
            setEditingTest(prev => {
                const nextVal = { ...prev, ...fields };
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
                <div className="bg-white px-5 py-3 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[9px] font-black border border-indigo-100 font-mono tracking-tighter uppercase">{project.code}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Control Center</span>
                        </div>
                        <h2 className="text-lg font-black text-slate-900 leading-tight">{project.name}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all"><X size={20}/></button>
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
                            return (
                                <button key={stage.id} onClick={() => handleStageSelect(stage.id)} className={`flex flex-col items-center min-w-[75px] transition-all ${isActive ? 'scale-105' : 'opacity-50 hover:opacity-100'}`}>
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 mb-1 transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg ring-2 ring-indigo-50' : isCurrent ? 'bg-amber-50 border-amber-200 text-amber-600' : isCompleted ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        {isCompleted ? <CheckCircle2 size={16} /> : <stage.icon size={14} />}
                                    </div>
                                    <span className={`text-[9px] font-black ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>{stage.label}</span>
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
                                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">🚀 로드맵 요약</h4>
                                <div className="grid grid-cols-1 gap-2">
                                    {stages.map((s) => {
                                        const isCurrent = project.currentStage === s.id;
                                        const docCount = project.documents?.[s.id]?.length || 0;
                                        const testDone = project.tests?.[s.id]?.filter(t => t.completed).length || 0;
                                        const testTotal = project.tests?.[s.id]?.length || 0;
                                        return (
                                            <div key={s.id} onClick={() => handleStageSelect(s.id)} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer group ${isCurrent ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCurrent ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400 group-hover:text-indigo-600'}`}><s.icon size={16}/></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5"><span className={`text-xs font-black truncate ${isCurrent ? 'text-white' : 'text-slate-800'}`}>{s.label}</span></div>
                                                    <div className="flex items-center gap-3 text-[9px] font-bold opacity-70">
                                                        <span>문서: {docCount}건</span><span>|</span><span>테스트: {testDone}/{testTotal}</span>
                                                    </div>
                                                </div>
                                                <ChevronRight size={14} className={isCurrent ? 'text-white' : 'text-slate-300 group-hover:text-indigo-500'}/>
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

                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                                <h3 className="text-xs font-black text-slate-800 border-b pb-2 flex justify-between items-center">
                                    <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500"/> PROJECT TASK</span>
                                    <span className="text-[9px] font-black text-slate-400">{project.tests?.[activeStageId]?.filter(t => t.completed).length || 0}/{project.tests?.[activeStageId]?.length || 0} 완료</span>
                                </h3>
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2">
                                        <div className="flex items-center justify-between"><label className="text-[8px] font-black text-slate-400 uppercase">신규 분류(그룹) 및 태스크 등록</label></div>
                                        <div className="flex gap-2">
                                            <input type="text" placeholder="분류 명칭 (예: 기구설계)" value={newTest.parent} onChange={(e) => setNewTest({...newTest, parent: e.target.value})} className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black" />
                                            <input type="text" placeholder="첫 번째 태스크 명칭 (필수)" value={newTest.child} onChange={(e) => setNewTest({...newTest, child: e.target.value})} onKeyDown={(e) => { if(e.key === 'Enter') handleAddTest(activeStageId); }} className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black" />
                                            <button type="button" onClick={() => handleAddTest(activeStageId)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black whitespace-nowrap">태스크 생성</button>
                                        </div>
                                    </div>

                                    <MondayBoard
                                        tasks={project.tests?.[activeStageId] || []}
                                        onSelect={setEditingTest}
                                        onUpdateTask={(id, fields) => handleUpdateTestDetail(activeStageId, id, fields)}
                                        onDeleteTask={(id) => removeTest(activeStageId, id)}
                                        groupingField="parent"
                                        onAddTask={(parentName) => {
                                            const taskName = prompt(`[${parentName}] 그룹에 추가할 태스크 명칭을 입력하세요:`);
                                            if (taskName) {
                                                const updatedTests = { ...(project.tests || {}) };
                                                if (!updatedTests[activeStageId]) updatedTests[activeStageId] = [];
                                                updatedTests[activeStageId].push({ 
                                                    id: Date.now(), 
                                                    parent: parentName, 
                                                    child: taskName, 
                                                    completed: false, 
                                                    updatedAt: new Date().toISOString(),
                                                    startDate: project.schedules?.[activeStageId]?.start || '',
                                                    endDate: project.schedules?.[activeStageId]?.end || '',
                                                    assigneeUid: '',
                                                    assigneeName: '',
                                                    priority: 'Medium',
                                                    notes: ''
                                                });
                                                onUpdate(project.id, { tests: updatedTests });
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2">
                                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b pb-2"><MessageSquare size={14} className="text-blue-500"/> 업무 메모</h3>
                                <textarea rows="3" value={project.memos?.[activeStageId] || ''} onChange={(e) => handleMemoChange(activeStageId, e.target.value)} placeholder="기록 사항..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[10px] font-medium resize-none shadow-inner" />
                            </div>

                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                                <h3 className="text-xs font-black text-slate-800 border-b pb-2 flex justify-between items-center"><span className="flex items-center gap-1.5"><FileText size={14} className="text-slate-400"/> 기술 산출물</span><span className="text-[9px] font-black text-slate-400">{project.documents?.[activeStageId]?.length || 0}/{STAGE_DOCUMENTS[activeStageId]?.length} 건</span></h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {STAGE_DOCUMENTS[activeStageId]?.map((docName, idx) => {
                                        const uploadedDoc = project.documents?.[activeStageId]?.find(d => d.name === docName);
                                        return (
                                            <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${uploadedDoc ? 'bg-emerald-50/20 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${uploadedDoc ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-slate-300'}`}><FileText size={14}/></div>
                                                <div className="flex-1 min-w-0"><p className="text-[10px] font-black truncate">{docName}</p><p className="text-[7px] text-slate-400 font-bold">{uploadedDoc ? uploadedDoc.updatedAt.split('T')[0] : '미등록'}</p></div>
                                                {uploadedDoc ? <a href={uploadedDoc.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white text-emerald-600 rounded-lg border border-emerald-100 shadow-sm"><ExternalLink size={12}/></a> : <button onClick={() => addDocumentLink(activeStageId, docName)} className="p-1.5 bg-white text-indigo-600 rounded-lg border border-slate-200 shadow-sm"><Plus size={12}/></button>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Footer */}
                <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between">
                    <button onClick={() => { if(window.confirm("프로젝트를 삭제하시겠습니까?")) { /* delete logic */ onClose(); } }} className="text-rose-400 text-[8px] font-black hover:text-rose-600 uppercase tracking-widest flex items-center gap-1.5"><Trash2 size={12}/> Delete</button>
                    <div className="text-[8px] font-black text-slate-200 uppercase">Sync: {project.updatedAt?.toDate ? project.updatedAt.toDate().toLocaleTimeString() : 'N/A'}</div>
                </div>

                {/* 5. Task Detail Modal (Popup inside portal) */}
                {editingTest && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">TASK DETAILS</span>
                                    <h3 className="text-sm font-black text-slate-800 leading-tight">[{editingTest.parent}] {editingTest.child}</h3>
                                </div>
                                <button type="button" onClick={() => setEditingTest(null)} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl"><X size={16}/></button>
                            </div>
                            
                            <div className="p-5 space-y-4 flex-1 overflow-y-auto max-h-[60vh] text-xs">
                                {/* Completed Status */}
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="font-black text-slate-700">진행 상태</span>
                                    <button 
                                        type="button"
                                        onClick={() => toggleTest(activeStageId, editingTest.id)} 
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-black text-[10px] transition-all shadow-sm ${
                                            editingTest.completed ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 border border-slate-250'
                                        }`}
                                    >
                                        {editingTest.completed ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                                        {editingTest.completed ? '완료' : '진행 대기'}
                                    </button>
                                </div>

                                {/* Date Range */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">시작일</label>
                                        <input 
                                            type="date" 
                                            value={editingTest.startDate || ''} 
                                            onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { startDate: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">완료일</label>
                                        <input 
                                            type="date" 
                                            value={editingTest.endDate || ''} 
                                            onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { endDate: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold" 
                                        />
                                    </div>
                                </div>

                                {/* Assignee & Priority & Difficulty */}
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">담당자 지정</label>
                                        <select 
                                            value={editingTest.assigneeUid || ''} 
                                            onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { assigneeUid: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold"
                                        >
                                            <option value="">담당자 없음</option>
                                            {(users || []).map(u => (
                                                <option key={u.uid} value={u.uid}>{u.displayName} ({u.department || '부서 미설정'})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">우선순위</label>
                                            <select 
                                                value={editingTest.priority || 'Medium'} 
                                                onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { priority: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold"
                                            >
                                                <option value="High">높음 (상)</option>
                                                <option value="Medium">보통 (중)</option>
                                                <option value="Low">낮음 (하)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">난이도</label>
                                            <select 
                                                value={editingTest.difficulty || 'Medium'} 
                                                onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { difficulty: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-bold"
                                            >
                                                <option value="High">어려움 (상)</option>
                                                <option value="Medium">보통 (중)</option>
                                                <option value="Low">쉬움 (하)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Documents & Links */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b pb-1.5">
                                        <ExternalLink size={12}/> 참조 문서 및 링크
                                    </h4>
                                    <div className="space-y-1.5">
                                        {(editingTest.links || []).map((link, lIdx) => (
                                            <div key={lIdx} className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl group/link">
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
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="문서명" 
                                            id="new-link-title"
                                            className="w-1/3 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none" 
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="URL (구글드라이브 등)" 
                                            id="new-link-url"
                                            className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none" 
                                        />
                                        <button 
                                            onClick={() => {
                                                const title = document.getElementById('new-link-title').value;
                                                const url = document.getElementById('new-link-url').value;
                                                if (title && url) {
                                                    const nextLinks = [...(editingTest.links || []), { title, url }];
                                                    handleUpdateTestDetail(activeStageId, editingTest.id, { links: nextLinks });
                                                    document.getElementById('new-link-title').value = '';
                                                    document.getElementById('new-link-url').value = '';
                                                }
                                            }}
                                            className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black"
                                        >
                                            추가
                                        </button>
                                    </div>
                                </div>

                                {/* Notepad / Memo style description */}
                                <div className="space-y-1.5 pt-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">메모 및 업무 상세내역 (메모장)</label>
                                    <textarea 
                                        rows="6" 
                                        value={editingTest.notes || ''} 
                                        onChange={(e) => handleUpdateTestDetail(activeStageId, editingTest.id, { notes: e.target.value })}
                                        placeholder="이 TASK의 상세 지침, 실행 로그, 참고 사항 등을 메모장처럼 자유롭게 기록해 보세요..." 
                                        className="w-full bg-amber-50/30 border border-amber-200/80 rounded-2xl p-4 text-[11px] font-medium resize-none shadow-inner text-slate-800 placeholder-slate-400/80 font-sans focus:outline-none focus:ring-1 focus:ring-amber-300" 
                                    />
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3.5 shrink-0">
                                <button type="button" onClick={() => removeTest(activeStageId, editingTest.id)} className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all font-black text-[10px] rounded-xl flex items-center gap-1.5"><Trash2 size={12}/> 삭제</button>
                                <button type="button" onClick={() => setEditingTest(null)} className="flex-1 py-2 bg-indigo-600 text-white hover:bg-indigo-700 transition-all font-black text-[10px] rounded-xl text-center shadow-md shadow-indigo-100">닫기</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
