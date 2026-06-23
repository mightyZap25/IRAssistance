import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    X, CheckCircle2, Circle, Clock, FileText, ChevronRight, 
    ArrowRight, Upload, ExternalLink, History, MessageSquare,
    Trash2, Plus, Save, Briefcase, User, Layers, Layout, AlertCircle,
    Table, MonitorPlay, Link2, Bold, Italic, Underline, List, ListOrdered, Code, Type,
    CalendarDays, Edit3
} from 'lucide-react';
import { getIssuesByProject } from '../services/issueService';
import StageTaskBoard from './common/StageTaskBoard';
import MondayStyleBoard from './common/MondayStyleBoard';

const STAGE_DOCUMENTS = {
    planning: ['제품 기획서', '시장 분석서', '개발 일정표'],
    development: ['회로도', 'PCB Layout', '기구 도면', '소스코드 링크', '개발 검토서'],
    dev_pp: ['시작품 제작 보고서', '초기 성능 측정서', '디자인 리뷰'],
    qa_test: ['QA 검사 성적서', '신뢰성 테스트 리포트', '버그 트래킹 리포트'],
    prod_pp: ['생산 준비 검토서', '금형/지그 리스트', '작업 표준서'],
    mp_transfer: ['양산 이관 승인서', '최종 BOM', '포장 사양서'],
};

const DEFAULT_TASK_TYPES = ['버그', '기능', '개선', '문서 작성', '미팅', '기획', '테스트', '기타'];

export default function ProjectProcessPanel({ isOpen, onClose, project, stages, onUpdate, onDelete, users, currentUser, userProfile }) {
    const [viewMode, setViewMode] = useState('main_table'); // main_table | overview | issues
    const [activeStageId, setActiveStageId] = useState(null);
    const [newTest, setNewTest] = useState({ parent: '', child: '' });
    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [projectIssues, setProjectIssues] = useState([]);
    const [loadingIssues, setLoadingIssues] = useState(false);
    const [editingTest, setEditingTest] = useState(null); // The test task object currently opened in details
    const [scheduleEditModal, setScheduleEditModal] = useState(null);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [newLink, setNewLink] = useState({ title: '', url: '' });

    const allStages = useMemo(() => {
        const defaultStages = stages || [];
        const custom = project.customStages || [];
        const combined = [...defaultStages, ...custom];
        if (project.stageOrder && project.stageOrder.length > 0) {
            return [...combined].sort((a, b) => {
                const idxA = project.stageOrder.indexOf(a.id);
                const idxB = project.stageOrder.indexOf(b.id);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return 0;
            });
        }
        return combined;
    }, [stages, project.customStages, project.stageOrder]);

    const handleReorderGroups = async (newStageIds) => {
        await onUpdate(project.id, { stageOrder: newStageIds });
    };

    const handleReorderTasks = async (draggedTaskId, targetTaskId, targetStageId, position) => {
        const updatedTests = { ...project.tests };
        
        let draggedTask = null;
        let sourceStageId = null;
        
        for (const stageId of Object.keys(updatedTests)) {
            const idx = updatedTests[stageId]?.findIndex(t => t.id === draggedTaskId);
            if (idx !== -1 && idx !== undefined) {
                [draggedTask] = updatedTests[stageId].splice(idx, 1);
                sourceStageId = stageId;
                break;
            }
        }
        
        if (!draggedTask) return;
        
        if (targetTaskId) {
            const targetIdx = updatedTests[targetStageId]?.findIndex(t => t.id === targetTaskId);
            if (targetIdx !== -1 && targetIdx !== undefined) {
                const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
                updatedTests[targetStageId].splice(insertIdx, 0, draggedTask);
            } else {
                updatedTests[targetStageId].push(draggedTask);
            }
        } else {
            if (!updatedTests[targetStageId]) updatedTests[targetStageId] = [];
            updatedTests[targetStageId].push(draggedTask);
        }
        
        const newProgress = calcProgressFromTasks(updatedTests);
        await onUpdate(project.id, { tests: updatedTests, progress: newProgress });
    };

    const allTaskTypes = useMemo(() => {
        return [...DEFAULT_TASK_TYPES, ...(project.customTaskTypes || [])];
    }, [project.customTaskTypes]);

    const handleAddCustomType = async (newType) => {
        const trimmed = newType.trim();
        if (!trimmed) return;
        const currentCustom = project.customTaskTypes || [];
        if (DEFAULT_TASK_TYPES.includes(trimmed) || currentCustom.includes(trimmed)) {
            alert('이미 존재하는 유형입니다.');
            return;
        }
        await onUpdate(project.id, { customTaskTypes: [...currentCustom, trimmed] });
    };

    const handleCreateGroup = () => {
        setIsAddingGroup(true);
    };

    const handleCreateGroupSubmit = async () => {
        if (!newGroupName || !newGroupName.trim()) return;

        const custom = project.customStages || [];
        const newGroup = {
            id: 'custom_' + Date.now(),
            label: newGroupName.trim(),
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-50'
        };

        const updatedCustomStages = [...custom, newGroup];

        // schedules에도 초기화
        const updatedSchedules = { ...(project.schedules || {}) };
        updatedSchedules[newGroup.id] = { start: '', end: '', status: 'pending' };

        // documents에도 초기화
        const updatedDocs = { ...(project.documents || {}) };
        updatedDocs[newGroup.id] = [];

        // tests에도 초기화
        const updatedTests = { ...(project.tests || {}) };
        updatedTests[newGroup.id] = [];

        await onUpdate(project.id, {
            customStages: updatedCustomStages,
            schedules: updatedSchedules,
            documents: updatedDocs,
            tests: updatedTests
        });

        setIsAddingGroup(false);
        setNewGroupName('');
    };
    const [isEditingHeader, setIsEditingHeader] = useState(false);
    const [headerInput, setHeaderInput] = useState({
        name: '',
        description: '',
        targetModel: '',
        projectStartDate: '',
        projectEndDate: ''
    });

    useEffect(() => {
        if (isOpen && project) {
            setViewMode('overview');
            setActiveStageId(null);
            fetchIssues();
            setIsEditingHeader(false);
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

    const currentStageIdx = allStages.findIndex(s => s.id === project.currentStage);
    const activeStage = activeStageId ? allStages.find(s => s.id === activeStageId) : null;

    // Actions
    const handleStageSelect = (stageId) => {
        setActiveStageId(stageId);
        setViewMode('stage_detail');
    };


    const handleStageChange = async (stageId) => {
        if (!window.confirm(`프로젝트 단계를 [${allStages.find(s => s.id === stageId).label}]로 변경하시겠습니까?`)) return;
        const newIdx = allStages.findIndex(s => s.id === stageId);
        const progress = Math.round(((newIdx + 1) / allStages.length) * 100);
        const newHistory = [
            { stage: stageId, date: new Date().toISOString(), note: `단계 변경: ${allStages.find(s => s.id === project.currentStage).label} ➔ ${allStages.find(s => s.id === stageId).label}` },
            ...(project.stageHistory || [])
        ];
        await onUpdate(project.id, { currentStage: stageId, progress, stageHistory: newHistory });
    };

    const handleScheduleChange = (group) => {
        setScheduleEditModal({
            stageId: group.id,
            label: group.name,
            start: group.schedule?.start || '',
            end: group.schedule?.end || '',
            reason: ''
        });
    };

    const handleSaveSchedule = async () => {
        if (!scheduleEditModal.reason.trim()) {
            alert('일정 수정 사유를 반드시 입력해주세요.');
            return;
        }

        const stageId = scheduleEditModal.stageId;
        const oldSchedule = project.schedules?.[stageId] || { start: '', end: '' };

        const updatedSchedules = { ...project.schedules };
        updatedSchedules[stageId] = {
            ...updatedSchedules[stageId],
            start: scheduleEditModal.start,
            end: scheduleEditModal.end,
            status: 'pending'
        };

        const newLogEntry = {
            id: Date.now().toString(),
            type: 'schedule_change',
            stageId,
            stageName: scheduleEditModal.label,
            user: userProfile?.name || currentUser?.displayName || currentUser?.email || 'Unknown',
            photoURL: currentUser?.photoURL || null,
            timestamp: new Date().toISOString(),
            message: '일정 변경',
            reason: scheduleEditModal.reason,
            changes: {
                oldStart: oldSchedule.start,
                oldEnd: oldSchedule.end,
                newStart: scheduleEditModal.start,
                newEnd: scheduleEditModal.end
            }
        };

        const updatedLogs = [newLogEntry, ...(project.activityLog || [])];
        
        await onUpdate(project.id, { schedules: updatedSchedules, activityLog: updatedLogs });
        setScheduleEditModal(null);
    };

    // 태스크 완료율 기반 프로젝트 진행률 자동 계산
    const calcProgressFromTasks = (tests) => {
        const allTasks = Object.values(tests || {}).flat();
        if (allTasks.length === 0) return project.progress || 0;
        const done = allTasks.filter(t => t.status === 'done' || t.completed === true).length;
        return Math.round((done / allTasks.length) * 100);
    };

    const handleAddTest = async (stageId, parentId, draftTaskObj = null) => {
        let titleStr = '';
        if (typeof draftTaskObj === 'string') {
            titleStr = draftTaskObj;
            draftTaskObj = {};
        } else if (draftTaskObj && draftTaskObj.title) {
            titleStr = draftTaskObj.title;
        }

        const updatedTests = { ...project.tests };
        if (!updatedTests[stageId]) updatedTests[stageId] = [];
        const newTask = {
            id: Date.now().toString(),
            child: titleStr,
            title: titleStr,
            status: draftTaskObj?.status || 'todo',
            completed: draftTaskObj?.status === 'done',
            type: draftTaskObj?.type || '버그',
            product: draftTaskObj?.product || '',
            startDate: draftTaskObj?.startDate || project.schedules?.[stageId]?.start || '',
            dueDate: draftTaskObj?.endDate || draftTaskObj?.dueDate || project.schedules?.[stageId]?.end || '',
            endDate: draftTaskObj?.endDate || project.schedules?.[stageId]?.end || '',
            assigneeUid: draftTaskObj?.assigneeUid || '',
            assigneeName: draftTaskObj?.assigneeUid ? ((users || []).find(u => u.uid === draftTaskObj.assigneeUid)?.displayName || '') : '',
            priority: draftTaskObj?.priority || 'Medium',
            difficulty: 'Medium',
            notes: ''
        };
        updatedTests[stageId].push(newTask);
        const newProgress = calcProgressFromTasks(updatedTests);
        await onUpdate(project.id, { tests: updatedTests, progress: newProgress });
        setNewTest({ parent: '', child: '' }); 
        setIsAddingGroup(false);
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

    const editingStageId = useMemo(() => {
        if (!editingTest) return null;
        for (const stage of allStages) {
            if (project.tests?.[stage.id]?.find(t => t.id === editingTest.id)) {
                return stage.id;
            }
        }
        return null;
    }, [editingTest, project.tests, allStages]);

    return (
        <div className="flex-1 w-full min-h-0 bg-white flex flex-col animate-in fade-in duration-300 relative">
            
            {/* 1. Header (Monday Style) */}
            {isEditingHeader ? (
                /* Edit Mode */
                <div className="bg-white px-8 pt-8 pb-6 border-b border-slate-200 shrink-0">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 min-w-0 pr-8">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs font-bold text-slate-500">Projects</span>
                                <span className="text-slate-300">/</span>
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-black">{project.code || 'PRJ'}</span>
                            </div>
                            
                            <div className="space-y-4 max-w-2xl bg-slate-50/50 p-6 rounded-2xl border border-slate-200/80 animate-in fade-in">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">프로젝트 정보 수정</h3>
                                
                                {/* 프로젝트 이름 */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-black text-slate-600">프로젝트명</label>
                                    <input
                                        type="text"
                                        value={headerInput.name}
                                        onChange={e => setHeaderInput(p => ({ ...p, name: e.target.value }))}
                                        className="w-full bg-white border border-slate-350 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                        placeholder="프로젝트명을 입력하세요"
                                    />
                                </div>

                                {/* 개발개요 */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-black text-slate-600">개발개요</label>
                                    <textarea
                                        value={headerInput.description}
                                        onChange={e => setHeaderInput(p => ({ ...p, description: e.target.value }))}
                                        rows="2"
                                        className="w-full bg-white border border-slate-350 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all"
                                        placeholder="개발개요 및 간단한 설명글을 입력하세요"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* 대상 모델 */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-black text-slate-600">대상 모델</label>
                                        <input
                                            type="text"
                                            value={headerInput.targetModel}
                                            onChange={e => setHeaderInput(p => ({ ...p, targetModel: e.target.value }))}
                                            className="w-full bg-white border border-slate-350 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                            placeholder="현 모델 및 신규 모델 가칭"
                                        />
                                    </div>

                                    {/* 기간 */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-black text-slate-600">개발 기간</label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="date"
                                                value={headerInput.projectStartDate}
                                                onChange={e => setHeaderInput(p => ({ ...p, projectStartDate: e.target.value }))}
                                                className="flex-1 bg-white border border-slate-350 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                                            />
                                            <span className="text-slate-400 font-bold">~</span>
                                            <input
                                                type="date"
                                                value={headerInput.projectEndDate}
                                                onChange={e => setHeaderInput(p => ({ ...p, projectEndDate: e.target.value }))}
                                                className="flex-1 bg-white border border-slate-350 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* 버튼 */}
                                <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingHeader(false)}
                                        className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200/50 rounded-xl transition-all"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onUpdate(project.id, {
                                                name: headerInput.name.trim(),
                                                description: headerInput.description.trim(),
                                                targetModel: headerInput.targetModel.trim(),
                                                projectStartDate: headerInput.projectStartDate,
                                                projectEndDate: headerInput.projectEndDate
                                            });
                                            setIsEditingHeader(false);
                                        }}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all">
                                <X size={18}/>
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* View Mode */
                <div className="bg-white px-8 py-4 border-b border-slate-200 shrink-0 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center">
                        <div className="flex-1 min-w-0 pr-6">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-bold text-slate-400 hover:underline cursor-pointer">Projects</span>
                                <span className="text-slate-300">/</span>
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-black">{project.code || 'PRJ'}</span>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 leading-tight truncate tracking-tight">
                                {project.name || project.title || '제목 없는 프로젝트'}
                            </h2>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button 
                                onClick={() => {
                                    setHeaderInput({
                                        name: project.name || project.title || '',
                                        description: project.description || '',
                                        targetModel: project.targetModel || '',
                                        projectStartDate: project.projectStartDate || '',
                                        projectEndDate: project.projectEndDate || ''
                                    });
                                    setIsEditingHeader(true);
                                }} 
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all shadow-sm"
                            >
                                <Edit3 size={12} /> 정보 수정
                            </button>
                            <button 
                                onClick={() => onDelete?.(project.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-rose-500 hover:text-rose-605 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-all shadow-sm"
                            >
                                <Trash2 size={12} /> 삭제
                            </button>
                            <button onClick={() => setShowActivityLog(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all shadow-sm">
                                <History size={12} /> 활동 로그
                            </button>
                            <div className="text-[10px] font-bold text-slate-400 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
                                총 {allStages.reduce((acc, stage) => acc + (project.tests?.[stage.id]?.length || 0), 0)}개 업무
                            </div>
                            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all">
                                <X size={16}/>
                            </button>
                        </div>
                    </div>

                    {/* 프로젝트 메타데이터 인라인 바 (개발개요, 기간, 대상 모델) */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 text-[11px] text-slate-600 animate-in fade-in duration-200">
                        {/* 개발개요 */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/50 px-2.5 py-1 rounded-lg">
                            <FileText size={12} className="text-indigo-500" />
                            <span className="font-black text-slate-400">개발개요</span>
                            <span className="text-slate-300">|</span>
                            <span className="font-bold text-slate-700 max-w-[250px] truncate" title={project.description}>
                                {project.description || <span className="text-slate-400 font-medium italic">미등록</span>}
                            </span>
                        </div>

                        {/* 기간 */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/50 px-2.5 py-1 rounded-lg">
                            <CalendarDays size={12} className="text-indigo-500" />
                            <span className="font-black text-slate-400">기간</span>
                            <span className="text-slate-300">|</span>
                            <span className="font-bold text-slate-700">
                                {project.projectStartDate || project.projectEndDate ? (
                                    <span>
                                        {project.projectStartDate ? new Date(project.projectStartDate).toLocaleDateString('ko-KR') : '미정'}
                                        {' ~ '}
                                        {project.projectEndDate ? new Date(project.projectEndDate).toLocaleDateString('ko-KR') : '미정'}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 font-medium italic">미지정</span>
                                )}
                            </span>
                        </div>

                        {/* 대상 모델 */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/50 px-2.5 py-1 rounded-lg">
                            <Layers size={12} className="text-indigo-500" />
                            <span className="font-black text-slate-400">대상 모델</span>
                            <span className="text-slate-300">|</span>
                            <span className="font-bold text-slate-700 max-w-[180px] truncate" title={project.targetModel}>
                                {project.targetModel || <span className="text-slate-400 font-medium italic">미등록</span>}
                            </span>
                        </div>
                    </div>
                </div>
            )}

                {/* 2. Main Board Content (Monday Style List Only) */}
                <div className="flex-1 overflow-y-auto bg-[#f5f6f8] flex flex-col relative">
                    {/* Main Board Table */}
                    <div className="flex-1 p-8">
                        <MondayStyleBoard
                            explicitGroups={allStages.map((stage) => ({
                                id: stage.id,
                                name: stage.label,
                                items: project.tests?.[stage.id] || [],
                                schedule: project.schedules?.[stage.id] || { start: '', end: '' }
                            }))}
                            users={users}
                            onSelect={setEditingTest}
                            onUpdateTask={(id, fields) => {
                                let foundStageId = null;
                                for (const stage of allStages) {
                                    if (project.tests?.[stage.id]?.find(t => t.id === id)) {
                                        foundStageId = stage.id;
                                        break;
                                    }
                                }
                                if (foundStageId) handleUpdateTestDetail(foundStageId, id, fields);
                            }}
                            onDeleteTask={(id) => {
                                let foundStageId = null;
                                for (const stage of allStages) {
                                    if (project.tests?.[stage.id]?.find(t => t.id === id)) {
                                        foundStageId = stage.id;
                                        break;
                                    }
                                }
                                if (foundStageId) removeTest(foundStageId, id);
                            }}
                            onAddTask={(stageId, taskName) => handleAddTest(stageId, null, taskName)}
                            onUpdateGroupSchedule={handleScheduleChange}
                            onReorderGroups={handleReorderGroups}
                            onReorderTasks={handleReorderTasks}
                            taskTypes={allTaskTypes}
                            onAddCustomType={handleAddCustomType}
                        />
                    </div>
                </div>

                {/* 4. Footer */}
                <div className="px-5 py-3 bg-white border-t border-slate-100 shrink-0 flex items-center justify-end">
                    <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-300">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        Sync: {project.updatedAt?.toDate ? project.updatedAt.toDate().toLocaleTimeString('ko-KR') : 'N/A'}
                    </div>
                </div>

                {/* 5. Task Detail Sidebar (Issue Tracker UI) */}
                {editingTest && (
                    <>
                        {/* 블러 배경 (Backdrop) */}
                        <div 
                            className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[150] animate-in fade-in duration-200" 
                            onClick={() => setEditingTest(null)}
                        />
                        {/* 사이드바 본체 */}
                        <div className="fixed top-0 right-0 w-[500px] h-screen bg-white shadow-[0_0_60px_rgba(0,0,0,0.2)] z-[160] flex flex-col border-l border-slate-200 animate-in slide-in-from-right-8 duration-200">
                        {/* 헤더 */}
                        <div className="px-6 pt-6 pb-4 flex justify-between items-start bg-white shrink-0">
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">
                                        {editingTest.parent}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-400">
                                        TSK-{editingTest.id.toString().slice(-4)}
                                    </span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 leading-tight">
                                    {editingTest.title || editingTest.child}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setEditingTest(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                    <X size={18}/>
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 bg-white flex flex-col min-h-0">
                            {/* Properties (Jira/Linear style metadata grid) */}
                            <div className="px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-slate-100 bg-slate-50/50 shrink-0">
                                
                                {/* Status */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">상태</label>
                                    <select 
                                        value={editingTest.status || (editingTest.completed ? 'done' : 'todo')}
                                        onChange={e => handleUpdateTestDetail(editingStageId, editingTest.id, { status: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 shadow-sm"
                                    >
                                        <option value="todo">작업 전</option>
                                        <option value="working">진행 중</option>
                                        <option value="done">완료</option>
                                        <option value="discard">폐기</option>
                                    </select>
                                </div>

                                {/* Assignee */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">담당자</label>
                                    <select 
                                        value={editingTest.assigneeUid || ''}
                                        onChange={e => handleUpdateTestDetail(editingStageId, editingTest.id, { assigneeUid: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 shadow-sm"
                                    >
                                        <option value="">미지정</option>
                                        {(users || []).map(u => (
                                            <option key={u.uid} value={u.uid}>{u.displayName}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Priority */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">우선순위</label>
                                    <select 
                                        value={editingTest.priority || 'Medium'}
                                        onChange={e => handleUpdateTestDetail(editingStageId, editingTest.id, { priority: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 shadow-sm"
                                    >
                                        <option value="High">🔴 높음</option>
                                        <option value="Medium">🟠 보통</option>
                                        <option value="Low">⚪️ 낮음</option>
                                    </select>
                                </div>

                                {/* Dates */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">마감일</label>
                                    <input 
                                        type="date" 
                                        value={editingTest.dueDate || editingTest.endDate || ''} 
                                        onChange={e => handleUpdateTestDetail(editingStageId, editingTest.id, { dueDate: e.target.value, endDate: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 shadow-sm"
                                    />
                                </div>
                            </div>

                            {/* Description & Links */}
                            <div className="p-6 flex-1 flex flex-col gap-6 min-h-0">
                                {/* Description */}
                                <div className="flex flex-col gap-2 flex-1 min-h-0">
                                    <label className="text-[12px] font-black text-slate-800 flex items-center gap-1.5">
                                        <FileText size={14} className="text-slate-400" /> 상세 설명 (Description)
                                    </label>
                                    <div className="flex flex-col flex-1 min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
                                        {/* Mock Toolbar */}
                                        <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
                                            <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Type size={13} /></button>
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Bold size={13} /></button>
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Italic size={13} /></button>
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Underline size={13} /></button>
                                            </div>
                                            <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><List size={13} /></button>
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><ListOrdered size={13} /></button>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Link2 size={13} /></button>
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Code size={13} /></button>
                                                <button className="p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded transition-colors"><Upload size={13} /></button>
                                            </div>
                                        </div>
                                        {/* Textarea */}
                                        <textarea 
                                            value={editingTest.notes || ''} 
                                            onChange={e => handleUpdateTestDetail(editingStageId, editingTest.id, { notes: e.target.value })}
                                            placeholder="이 이슈에 대한 상세 설명, 실행 컨텍스트, 배경 등을 작성하세요..." 
                                            className="w-full h-full flex-1 p-4 text-[13px] font-medium resize-none overflow-y-auto text-slate-800 placeholder-slate-400 outline-none" 
                                        />
                                    </div>
                                </div>

                                {/* Links */}
                                <div className="flex flex-col gap-2 shrink-0">
                                    <label className="text-[12px] font-black text-slate-800 flex items-center gap-1.5">
                                        <ExternalLink size={14} className="text-slate-400" /> 참조 링크
                                    </label>
                                    <div className="flex flex-col gap-2">
                                        {/* 빠른 템플릿 추가 버튼 */}
                                        <div className="flex gap-2 mb-1">
                                            <button 
                                                onClick={() => setNewLink({ title: '구글 문서', url: 'https://docs.google.com/document/d/' })} 
                                                className="px-2 py-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 rounded flex items-center gap-1 hover:bg-blue-100 transition-colors"
                                            >
                                                <FileText size={10}/> 구글 문서
                                            </button>
                                            <button 
                                                onClick={() => setNewLink({ title: '구글 스프레드시트', url: 'https://docs.google.com/spreadsheets/d/' })} 
                                                className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 rounded flex items-center gap-1 hover:bg-emerald-100 transition-colors"
                                            >
                                                <Table size={10}/> 구글 시트
                                            </button>
                                        </div>
                                        
                                        {(editingTest.links || []).map((link, lIdx) => {
                                            const isDoc = link.url.includes('docs.google.com/document');
                                            const isSheet = link.url.includes('docs.google.com/spreadsheets');
                                            const isFigma = link.url.includes('figma.com');
                                            const Icon = isDoc ? FileText : isSheet ? Table : isFigma ? Layout : Link2;
                                            const iconColor = isDoc ? 'text-blue-500' : isSheet ? 'text-emerald-500' : isFigma ? 'text-purple-500' : 'text-slate-400';

                                            return (
                                                <div key={lIdx} className="flex items-center justify-between bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-lg group/link transition-all hover:border-indigo-100 hover:shadow-sm">
                                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                        <div className={`p-1.5 bg-white rounded-md border border-slate-100 shadow-sm ${iconColor}`}>
                                                            <Icon size={14} />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[11px] font-bold text-slate-700 truncate">{link.title}</span>
                                                            <a href={link.url} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-500 hover:underline truncate">{link.url}</a>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => {
                                                            const nextLinks = editingTest.links.filter((_, i) => i !== lIdx);
                                                            handleUpdateTestDetail(editingStageId, editingTest.id, { links: nextLinks });
                                                        }}
                                                        className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover/link:opacity-100 transition-all rounded-md hover:bg-rose-50"
                                                    >
                                                        <X size={12}/>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <div className="flex gap-2 mt-1">
                                            <input 
                                                type="text" 
                                                placeholder="문서명" 
                                                value={newLink.title}
                                                onChange={e => setNewLink(p => ({ ...p, title: e.target.value }))}
                                                className="w-[120px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200" 
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="URL 입력 후 엔터" 
                                                value={newLink.url}
                                                onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && newLink.title && newLink.url) {
                                                        const nextLinks = [...(editingTest.links || []), { title: newLink.title, url: newLink.url }];
                                                        handleUpdateTestDetail(editingStageId, editingTest.id, { links: nextLinks });
                                                        setNewLink({ title: '', url: '' });
                                                    }
                                                }}
                                                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200" 
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* 모달 푸터 (하단 고정) */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
                            <span className="text-[10px] font-bold text-slate-400">
                                마지막 수정: {new Date(editingTest.updatedAt).toLocaleString('ko-KR')}
                            </span>
                            <div className="flex items-center gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => { 
                                        if(window.confirm('이 이슈를 완전히 삭제하시겠습니까?')) {
                                            removeTest(editingStageId, editingTest.id); 
                                            setEditingTest(null); 
                                        }
                                    }} 
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-rose-500 hover:bg-rose-50 border border-rose-200 transition-all font-black text-[11px] rounded-lg shadow-sm"
                                >
                                    <Trash2 size={12}/> 이슈 삭제
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setEditingTest(null)} 
                                    className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 transition-all font-black text-[11px] rounded-lg shadow-md shadow-indigo-100"
                                >
                                    저장 및 닫기
                                </button>
                            </div>
                        </div>
                        </div>
                    </>
                )}

                {/* 6. Activity Log Sidebar */}
                {showActivityLog && (
                    <>
                        {/* 블러 배경 (Backdrop) */}
                        <div 
                            className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[150] animate-in fade-in duration-200" 
                            onClick={() => setShowActivityLog(false)}
                        />
                        <div className="fixed top-0 right-0 w-[400px] h-screen bg-white shadow-2xl z-[170] flex flex-col border-l border-slate-200 animate-in slide-in-from-right-8 duration-200">
                            <div className="px-6 py-5 flex justify-between items-center border-b border-slate-200 bg-white shrink-0">
                                <div className="flex items-center gap-2">
                                    <History size={18} className="text-indigo-500" />
                                    <h3 className="text-lg font-black text-slate-800">프로젝트 활동 로그</h3>
                            </div>
                            <button onClick={() => setShowActivityLog(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                <X size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-6">
                            {(project.activityLog || []).length === 0 ? (
                                <div className="text-center py-10 flex flex-col items-center gap-3">
                                    <MessageSquare size={32} className="text-slate-200" />
                                    <p className="text-xs font-bold text-slate-400">아직 기록된 활동 로그가 없습니다.</p>
                                </div>
                            ) : (
                                (project.activityLog || []).slice().reverse().map((log, idx) => (
                                    <div key={idx} className="flex gap-4 relative">
                                        {/* 타임라인 선 */}
                                        {idx !== (project.activityLog?.length || 1) - 1 && (
                                            <div className="absolute left-[15px] top-[30px] bottom-[-20px] w-[2px] bg-slate-200 rounded-full" />
                                        )}
                                        {/* 아바타 */}
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0 z-10 text-indigo-700 font-black text-[10px]">
                                            {log.user?.slice(0,2) || 'UK'}
                                        </div>
                                        {/* 로그 컨텐츠 */}
                                        <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[12px] font-black text-slate-800">{log.user || '알 수 없음'}</span>
                                                    <span className="text-[10px] font-bold text-indigo-500">{log.stageName || log.stageId || '프로젝트'}</span>
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-400">
                                                    {new Date(log.timestamp).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 font-bold mb-3">일정을 변경했습니다.</p>
                                            
                                            {/* 변경 내역 박스 */}
                                            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                                    <Clock size={12} className="text-amber-500"/>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="line-through opacity-60 text-slate-400">{log.changes?.oldStart || '미정'} ~ {log.changes?.oldEnd || '미정'}</span>
                                                        <ArrowRight size={10} className="text-slate-300"/>
                                                        <span className="text-amber-600">{log.changes?.newStart || '미정'} ~ {log.changes?.newEnd || '미정'}</span>
                                                    </div>
                                                </div>
                                                {log.reason && (
                                                    <div className="flex items-start gap-2 text-[10px] font-bold text-slate-500 pt-2 border-t border-slate-100">
                                                        <MessageSquare size={12} className="text-indigo-400 mt-0.5 shrink-0"/>
                                                        <p className="text-slate-700 leading-relaxed">"{log.reason}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        </div>
                    </>
                )}

            {/* 플로팅 새 그룹 추가 버튼 (FAB) */}
            <button
                onClick={handleCreateGroup}
                className="fixed bottom-8 right-8 z-[180] w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-300/40 hover:shadow-indigo-400/50 transition-all hover:scale-110 active:scale-95 group hover:-translate-y-0.5"
                title="새 그룹 추가"
            >
                <Plus size={22} className="transition-transform group-hover:rotate-90 duration-200" />
            </button>

            {/* 새 그룹 추가 미니 팝업 다이얼로그 */}
            {isAddingGroup && (
                <>
                    <div 
                        className="fixed inset-0 bg-slate-900/10 backdrop-blur-[1px] z-[190] animate-in fade-in duration-200" 
                        onClick={() => { setIsAddingGroup(false); setNewGroupName(''); }}
                    />
                    <div className="fixed bottom-24 right-8 z-[200] w-72 bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <h4 className="text-xs font-black text-slate-800 mb-2.5 flex items-center gap-1.5">
                            🆕 새 그룹 추가
                        </h4>
                        <input
                            autoFocus
                            type="text"
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateGroupSubmit();
                                if (e.key === 'Escape') {
                                    setIsAddingGroup(false);
                                    setNewGroupName('');
                                }
                            }}
                            placeholder="그룹 명칭을 입력하세요..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                        <div className="flex gap-2 justify-end mt-3">
                            <button
                                type="button"
                                onClick={() => { setIsAddingGroup(false); setNewGroupName(''); }}
                                className="px-2.5 py-1.5 text-[10px] font-black text-slate-450 hover:text-slate-600 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateGroupSubmit}
                                disabled={!newGroupName.trim()}
                                className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all shadow-sm ${newGroupName.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                                추가
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
