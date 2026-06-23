import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, MessageSquare, MoreHorizontal, User, Flag, Clock, Paperclip, Plus, X, Check, GripVertical } from 'lucide-react';

const STATUS_CONFIG = {
    todo:    { label: '작업 전', bg: 'bg-[#c4c4c4]', text: 'text-white' },
    working: { label: '진행 중', bg: 'bg-[#fdab3d]', text: 'text-white' },
    done:    { label: '완료',   bg: 'bg-[#00c875]', text: 'text-white' },
    discard: { label: '폐기',   bg: 'bg-[#333333]', text: 'text-white' },
};

const GROUP_COLORS = ['bg-[#579bfc]', 'bg-[#a25ddc]', 'bg-[#00c875]', 'bg-[#e2445c]', 'bg-[#fdab3d]', 'bg-[#0086c0]'];

const PRIORITY_CONFIG = {
    High:   { label: '높음', bg: 'bg-[#e2445c]', text: 'text-white' },
    Medium: { label: '보통', bg: 'bg-[#7888f4]', text: 'text-white' },
    Low:    { label: '낮음', bg: 'bg-[#c4c4c4]', text: 'text-white' },
};

function getTimeAgo(val) {
    if (!val) return '방금 전';
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d)) return '방금 전';
    const diff = Math.floor((new Date() - d) / 86400000);
    if (diff === 0) return '오늘';
    return `${diff}일 전`;
}

export default function MondayStyleBoard({ tasks = [], explicitGroups, users = [], onSelect, onUpdateTask, onDeleteTask, onAddTask, onEditGroupSchedule, onReorderGroups, onReorderTasks, taskTypes, onAddCustomType }) {
    const [draggedGroupId, setDraggedGroupId] = useState(null);
    const [hoveredGroupId, setHoveredGroupId] = useState(null);
    const [canDrag, setCanDrag] = useState(null);
    const [localGroups, setLocalGroups] = useState([]);

    // 태스크 드래그 상태
    const [draggedTaskId, setDraggedTaskId] = useState(null);
    const [hoveredTaskId, setHoveredTaskId] = useState(null);
    const [canDragTaskId, setCanDragTaskId] = useState(null);

    const handleDragStartTask = (e, taskId, sourceStageId) => {
        setDraggedTaskId(taskId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('task-id', taskId);
        e.dataTransfer.setData('source-stage-id', sourceStageId);
        e.dataTransfer.setData('type', 'task');
    };

    const handleDragEnterTask = (e, targetTaskId) => {
        e.preventDefault();
        if (draggedTaskId && draggedTaskId !== targetTaskId) {
            setHoveredTaskId(targetTaskId);
        }
    };

    const handleDragLeaveTask = (e, targetTaskId) => {
        e.preventDefault();
        if (hoveredTaskId === targetTaskId) {
            setHoveredTaskId(null);
        }
    };

    const handleDropTask = (e, targetTaskId, targetStageId) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('task-id');
        const sourceStageId = e.dataTransfer.getData('source-stage-id');
        const type = e.dataTransfer.getData('type');

        if (type === 'task' && taskId && taskId !== targetTaskId) {
            onReorderTasks?.(taskId, targetTaskId, targetStageId, 'before');
        }

        setDraggedTaskId(null);
        setHoveredTaskId(null);
        setCanDragTaskId(null);
    };

    const handleDragEndTask = () => {
        setDraggedTaskId(null);
        setHoveredTaskId(null);
        setCanDragTaskId(null);
    };

    // 그룹핑: { [parentName]: [task1, task2, ...] }
    const initialGroups = useMemo(() => {
        if (explicitGroups) {
            return explicitGroups.map((g, idx) => ({
                ...g,
                color: g.color || GROUP_COLORS[idx % GROUP_COLORS.length]
            }));
        }
        
        const map = new Map();
        tasks.forEach(t => {
            const g = t.parent || '미분류';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(t);
        });
        return Array.from(map.entries()).map(([name, items], idx) => ({ 
            id: name,
            name, 
            items, 
            color: GROUP_COLORS[idx % GROUP_COLORS.length] 
        }));
    }, [tasks, explicitGroups]);

    useEffect(() => {
        setLocalGroups(initialGroups || []);
    }, [initialGroups]);

    const handleDragStart = (e, groupId) => {
        setDraggedGroupId(groupId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', groupId);
    };

    const handleDragEnter = (e, targetGroupId) => {
        e.preventDefault();
        if (draggedGroupId && draggedGroupId !== targetGroupId) {
            setHoveredGroupId(targetGroupId);
        }
    };

    const handleDragLeave = (e, targetGroupId) => {
        e.preventDefault();
        if (hoveredGroupId === targetGroupId) {
            setHoveredGroupId(null);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (draggedGroupId && hoveredGroupId && draggedGroupId !== hoveredGroupId) {
            const draggedIdx = localGroups.findIndex(g => (g.id || g.name) === draggedGroupId);
            const targetIdx = localGroups.findIndex(g => (g.id || g.name) === hoveredGroupId);
            
            if (draggedIdx !== -1 && targetIdx !== -1) {
                const reordered = [...localGroups];
                const [draggedItem] = reordered.splice(draggedIdx, 1);
                reordered.splice(targetIdx, 0, draggedItem);
                
                setLocalGroups(reordered);
                const newOrderIds = reordered.map(g => g.id || g.name);
                onReorderGroups?.(newOrderIds);
            }
        }
        setDraggedGroupId(null);
        setHoveredGroupId(null);
    };

    const handleDragEnd = () => {
        setDraggedGroupId(null);
        setHoveredGroupId(null);
        setCanDrag(null);
    };

    if (localGroups.length === 0) {
        return (
            <div className="text-center py-20 text-slate-400 border border-slate-200 border-dashed rounded-2xl mx-4">
                <div className="text-4xl mb-3">🗂️</div>
                <p className="text-sm font-black text-slate-500">추가된 그룹 및 태스크가 없습니다</p>
                <p className="text-xs mt-1">상단의 '+ 그룹 추가' 버튼을 눌러 작업을 시작하세요.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-full">
            {localGroups.map(group => {
                const isDragged = draggedGroupId === (group.id || group.name);
                const isHovered = hoveredGroupId === (group.id || group.name);
                
                let containerClass = 'transition-all duration-200 border border-transparent p-1 relative';
                if (isDragged) {
                    containerClass = 'opacity-35 bg-slate-50 border-2 border-dashed border-slate-200 p-1 relative';
                }

                const draggedIdx = localGroups.findIndex(g => (g.id || g.name) === draggedGroupId);
                const targetIdx = localGroups.findIndex(g => (g.id || g.name) === (group.id || group.name));

                return (
                    <div
                        key={group.id || group.name}
                        draggable={canDrag === (group.id || group.name)}
                        onDragStart={(e) => handleDragStart(e, group.id || group.name)}
                        onDragEnter={(e) => handleDragEnter(e, group.id || group.name)}
                        onDragLeave={(e) => handleDragLeave(e, group.id || group.name)}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        className={`rounded-xl ${containerClass}`}
                    >
                        {/* 드롭 가이드 라인 (덜덜 떨림 없음) */}
                        {draggedGroupId && isHovered && (
                            <div className={`absolute left-0 right-0 h-1 bg-indigo-500 rounded-full z-50 animate-pulse ${
                                draggedIdx > targetIdx ? 'top-0' : 'bottom-0'
                            }`} />
                        )}

                        <MondayGroup 
                            group={group} 
                            users={users} 
                            onSelect={onSelect} 
                            onUpdateTask={onUpdateTask} 
                            onDeleteTask={onDeleteTask}
                            onAddTask={onAddTask} 
                            onEditGroupSchedule={onEditGroupSchedule}
                            dragHandleProps={{
                                onMouseDown: () => setCanDrag(group.id || group.name),
                                onMouseUp: () => setCanDrag(null)
                            }}
                            draggedTaskId={draggedTaskId}
                            hoveredTaskId={hoveredTaskId}
                            canDragTaskId={canDragTaskId}
                            setCanDragTaskId={setCanDragTaskId}
                            onDragStartTask={handleDragStartTask}
                            onDragEnterTask={handleDragEnterTask}
                            onDragLeaveTask={handleDragLeaveTask}
                            onDropTask={handleDropTask}
                            onDragEndTask={handleDragEndTask}
                            taskTypes={taskTypes}
                            onAddCustomType={onAddCustomType}
                        />
                    </div>
                );
            })}
        </div>
    );
}

function MondayGroup({ 
    group, users, onSelect, onUpdateTask, onDeleteTask, onAddTask, onEditGroupSchedule, dragHandleProps,
    draggedTaskId, hoveredTaskId, canDragTaskId, setCanDragTaskId,
    onDragStartTask, onDragEnterTask, onDragLeaveTask, onDropTask, onDragEndTask,
    taskTypes, onAddCustomType
}) {
    const [expanded, setExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [draftTask, setDraftTask] = useState({
        title: '',
        type: taskTypes?.[0] || '버그',
        product: '',
        assigneeUid: '',
        status: 'todo',
        priority: 'Medium',
        startDate: '',
        endDate: ''
    });

    const doneCount = group.items.filter(t => t.status === 'done' || t.completed === true).length;
    const pct = group.items.length > 0 ? (doneCount / group.items.length) * 100 : 0;
    
    const handleAdd = () => {
        if (!draftTask.title.trim()) {
            setIsAdding(false);
            return;
        }
        onAddTask?.(group.id || group.name, draftTask);
        setDraftTask({ title: '', type: taskTypes?.[0] || '버그', product: '', assigneeUid: '', status: 'todo', priority: 'Medium', startDate: '', endDate: '' });
        setIsAdding(false);
    };

    const handleGroupDrop = (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('task-id');
        const type = e.dataTransfer.getData('type');
        if (type === 'task' && taskId) {
            onDropTask(e, null, group.id || group.name);
        }
    };

    return (
        <div 
            className="w-full"
            onDragOver={(e) => {
                const isTaskDrag = e.dataTransfer.types.includes('task-id') || e.dataTransfer.types.includes('text/plain');
                if (isTaskDrag) e.preventDefault();
            }}
            onDrop={handleGroupDrop}
        >
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-2 mb-2 select-none group/header cursor-pointer" onClick={() => setExpanded(!expanded)}>
                {/* 드래그 그립 핸들 */}
                <div 
                    {...dragHandleProps}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-slate-100 rounded text-slate-400 shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                    title="드래그하여 그룹 순서 변경"
                >
                    <GripVertical size={14} />
                </div>
                <button className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${group.color} text-white`}>
                    {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                </button>
                <h3 className={`text-[15px] font-black transition-colors ${group.color.replace('bg-', 'text-')}`}>
                    {group.name}
                </h3>
                <span className="text-[11px] font-bold text-slate-400 ml-2">
                    {group.items.length} Tasks
                </span>
                
                {/* 그룹 (단계) 별 총 기간 표시 & 수정 */}
                <div 
                    className="ml-4 flex items-center gap-2"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditGroupSchedule?.(group);
                    }}
                >
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200 cursor-pointer transition-colors" title="일정 수정하기">
                        <Clock size={11} className="text-slate-400" />
                        <span>
                            {group.schedule?.start ? new Date(group.schedule.start).toLocaleDateString('ko-KR') : '미정'}
                            {' ~ '}
                            {group.schedule?.end ? new Date(group.schedule.end).toLocaleDateString('ko-KR') : '미정'}
                        </span>
                        <span className="ml-1 text-indigo-500">✏️</span>
                    </div>
                </div>
            </div>

            {/* 테이블 아코디언 본문 */}
            {expanded && (
                <div className="ml-[10px] pl-[10px] border-l-[2px] transition-all" style={{ borderColor: group.color.replace('bg-', '').replace(']', '').replace('[', '') }}>
                    <div className="border border-slate-200 rounded-lg overflow-x-auto overflow-y-hidden bg-white shadow-sm">
                        <div className="min-w-max">
                        {/* 테이블 헤더 */}
                        {/* 테이블 헤더 */}
                        <div className="flex items-stretch border-b border-slate-200 bg-white text-[11px] font-black text-slate-400 h-10 select-none">
                            <div className="w-[40px] flex items-center justify-center border-r border-slate-200 shrink-0">
                                <MoreHorizontal size={14} className="text-slate-300 opacity-50"/>
                            </div>
                            <div className="flex-1 px-4 flex items-center border-r border-slate-200 min-w-[200px]">항목 명칭</div>
                            <div className="w-[80px] flex items-center justify-center border-r border-slate-200 shrink-0">유형</div>
                            <div className="w-[80px] flex items-center justify-center border-r border-slate-200 shrink-0">담당자</div>
                            <div className="w-[130px] flex items-center justify-center border-r border-slate-200 shrink-0">상태</div>
                            <div className="w-[90px] flex items-center justify-center border-r border-slate-200 shrink-0">시작일</div>
                            <div className="w-[90px] flex items-center justify-center border-r border-slate-200 shrink-0">마감일</div>
                            <div className="w-[110px] flex items-center justify-center border-r border-slate-200 shrink-0">우선순위</div>
                            <div className="w-[150px] flex items-center justify-center border-r border-slate-200 shrink-0">설명 / 메모</div>
                            <div className="w-[50px] flex items-center justify-center border-r border-slate-200 shrink-0"><Paperclip size={12}/></div>
                            <div className="w-[90px] flex items-center justify-center border-r border-slate-200 shrink-0">업데이트</div>
                            <div className="w-[40px] flex items-center justify-center shrink-0"><Plus size={14} className="text-slate-300"/></div>
                        </div>

                        {/* 태스크 행 목록 */}
                        <div className="divide-y divide-slate-100 bg-white">
                            {group.items.map(task => (
                                <MondayRow 
                                    key={task.id} 
                                    task={task} 
                                    stageId={group.id || group.name}
                                    users={users} 
                                    onSelect={onSelect} 
                                    onUpdateTask={onUpdateTask} 
                                    onDeleteTask={onDeleteTask}
                                    groupColor={group.color}
                                    draggedTaskId={draggedTaskId}
                                    hoveredTaskId={hoveredTaskId}
                                    canDragTaskId={canDragTaskId}
                                    setCanDragTaskId={setCanDragTaskId}
                                    onDragStartTask={onDragStartTask}
                                    onDragEnterTask={onDragEnterTask}
                                    onDragLeaveTask={onDragLeaveTask}
                                    onDropTask={onDropTask}
                                    onDragEndTask={onDragEndTask}
                                    taskTypes={taskTypes}
                                    onAddCustomType={onAddCustomType}
                                />
                            ))}

                            {/* + 항목 추가 행 */}
                            {!isAdding ? (
                                <div 
                                    className="flex items-center h-10 bg-white hover:bg-slate-50 transition-colors cursor-pointer group/add border-b border-slate-200"
                                    onClick={() => {
                                        setDraftTask({ title: '', type: taskTypes?.[0] || '버그', product: '', assigneeUid: '', status: 'todo', priority: 'Medium', startDate: '', endDate: '' });
                                        setIsAdding(true);
                                    }}
                                >
                                    <div className="w-[40px] h-full flex items-center justify-center border-r border-slate-200 shrink-0 relative bg-slate-50/50">
                                        <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${group.color}`} />
                                        <div className="w-3.5 h-3.5 rounded border border-slate-300 opacity-50 flex items-center justify-center">
                                            <span className="text-[10px] font-black text-slate-400 group-hover/add:text-indigo-500 transition-colors">+</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 px-4 text-[12px] font-bold text-slate-400 group-hover/add:text-indigo-500 transition-colors">
                                        이 항목의 빈 행을 클릭하여 새 태스크 추가
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-stretch h-10 bg-indigo-50/10 transition-colors border-b border-indigo-200">
                                    <div className="w-[40px] flex items-center justify-center border-r border-slate-200 shrink-0 relative bg-slate-50/50">
                                        <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${group.color}`} />
                                    </div>
                                    
                                    {/* 2. 항목 명칭 */}
                                    <div className="flex-1 px-2 flex items-center border-r border-slate-200 border-l-4 border-indigo-400 min-w-[200px]">
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={draftTask.title}
                                            onChange={e => setDraftTask(p => ({ ...p, title: e.target.value }))}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
                                                if (e.key === 'Escape') setIsAdding(false);
                                            }}
                                            placeholder="태스크 명칭..."
                                            className="w-full bg-white px-2 py-1 text-[12px] font-bold outline-none border border-slate-200 focus:border-indigo-400 rounded"
                                        />
                                    </div>

                                    {/* 3. 유형 */}
                                    <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.type}
                                            onChange={e => setDraftTask(p => ({ ...p, type: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            {(taskTypes || ['버그', '기능']).map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 5. 담당자 */}
                                    <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.assigneeUid}
                                            onChange={e => setDraftTask(p => ({ ...p, assigneeUid: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            <option value="">미지정</option>
                                            {users.map(u => (
                                                <option key={u.uid} value={u.uid}>{u.displayName}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 6. 상태 */}
                                    <div className="w-[130px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.status}
                                            onChange={e => setDraftTask(p => ({ ...p, status: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 7. 시작일 */}
                                    <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <input 
                                            type="date"
                                            value={draftTask.startDate}
                                            onChange={e => setDraftTask(p => ({ ...p, startDate: e.target.value }))}
                                            className="w-full h-7 bg-white px-1 border border-slate-200 rounded text-[10px] font-bold outline-none focus:border-indigo-400"
                                        />
                                    </div>

                                    {/* 8. 마감일 */}
                                    <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <input 
                                            type="date"
                                            value={draftTask.endDate}
                                            onChange={e => setDraftTask(p => ({ ...p, endDate: e.target.value }))}
                                            className="w-full h-7 bg-white px-1 border border-slate-200 rounded text-[10px] font-bold outline-none focus:border-indigo-400"
                                        />
                                    </div>

                                    {/* 9. 우선순위 */}
                                    <div className="w-[110px] border-r border-slate-200 flex items-center justify-center shrink-0 px-1">
                                        <select 
                                            value={draftTask.priority}
                                            onChange={e => setDraftTask(p => ({ ...p, priority: e.target.value }))}
                                            className="w-full h-7 bg-white border border-slate-200 rounded text-[11px] font-black outline-none focus:border-indigo-400"
                                        >
                                            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 빈 공간들 */}
                                    <div className="w-[150px] border-r border-slate-200 shrink-0 bg-white/50"></div>
                                    <div className="w-[50px] border-r border-slate-200 shrink-0 bg-white/50"></div>
                                    <div className="w-[90px] border-r border-slate-200 shrink-0 bg-white/50"></div>

                                    {/* 저장 버튼 */}
                                    <div className="w-[40px] shrink-0 flex items-center justify-center bg-white border-l border-slate-200 sticky right-0 z-10 shadow-[-4px_0_10px_rgba(0,0,0,0.02)]">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleAdd(); }} 
                                            disabled={!draftTask.title.trim()}
                                            className={`px-2 py-1 text-[10px] font-black rounded shadow-sm transition-colors ${draftTask.title.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                            title="저장"
                                        >
                                            <Check size={12}/>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 하단 요약 (진행률) */}
                        <div className="flex items-stretch border-t border-slate-200 bg-slate-50 h-8">
                            {/* 진행률 컬러 바 */}
                            <div className="w-[140px] flex items-center justify-center border-r border-slate-200 p-1">
                                {group.items.length > 0 ? (
                                    <div className="w-full h-full flex rounded-sm overflow-hidden border border-black/5">
                                        {Object.entries(STATUS_CONFIG).map(([sKey, cfg]) => {
                                            const count = group.items.filter(t => (t.status || (t.completed ? 'done' : 'todo')) === sKey).length;
                                            const ratio = (count / group.items.length) * 100;
                                            if (ratio === 0) return null;
                                            return (
                                                <div key={sKey} className={`h-full ${cfg.bg}`} style={{ width: `${ratio}%` }} title={`${cfg.label} ${count}건`}/>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="w-full h-full bg-[#c4c4c4] rounded-sm opacity-30" />
                                )}
                            </div>
                            <div className="flex-1 px-4 flex items-center justify-end border-r border-slate-200">
                                <span className="text-[10px] font-black text-slate-400">{Math.round(pct)}% 완료</span>
                            </div>
                            <div className="w-[120px] border-r border-slate-200" />
                            <div className="w-[60px]" />
                        </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}

const TYPE_CONFIG = {
    '버그':      { bg: 'bg-rose-100', text: 'text-rose-600' },
    '기능':      { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    '개선':      { bg: 'bg-blue-100', text: 'text-blue-600' },
    '문서 작성': { bg: 'bg-amber-100', text: 'text-amber-600' },
    '미팅':      { bg: 'bg-indigo-100', text: 'text-indigo-600' },
    '기획':      { bg: 'bg-purple-100', text: 'text-purple-600' },
    '테스트':    { bg: 'bg-teal-100', text: 'text-teal-600' },
    '기타':      { bg: 'bg-slate-100', text: 'text-slate-600' },
};

function getTypeStyle(type) {
    if (TYPE_CONFIG[type]) return TYPE_CONFIG[type];
    const hash = type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
        { bg: 'bg-sky-100', text: 'text-sky-700' },
        { bg: 'bg-pink-100', text: 'text-pink-700' },
        { bg: 'bg-violet-100', text: 'text-violet-700' },
        { bg: 'bg-lime-100', text: 'text-lime-700' },
        { bg: 'bg-cyan-100', text: 'text-cyan-700' },
        { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
    ];
    return colors[hash % colors.length];
}

function MondayRow({ 
    task, stageId, users, onSelect, onUpdateTask, onDeleteTask, groupColor,
    draggedTaskId, hoveredTaskId, canDragTaskId, setCanDragTaskId,
    onDragStartTask, onDragEnterTask, onDragLeaveTask, onDropTask, onDragEndTask,
    taskTypes = [], onAddCustomType
}) {
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const [newCustomType, setNewCustomType] = useState('');
    const [isAddingNewType, setIsAddingNewType] = useState(false);

    const curStatus = task.status || (task.completed ? 'done' : 'todo');
    const statusCfg = STATUS_CONFIG[curStatus] || STATUS_CONFIG.todo;
    const isDone = curStatus === 'done';
    
    const taskType = task.type || '버그';
    const priority = task.priority || 'Medium';
    const pCfg = PRIORITY_CONFIG[priority];

    const isDragged = draggedTaskId === task.id;
    const isHovered = hoveredTaskId === task.id;

    useEffect(() => {
        const handleScrollOrClickOutside = () => {
            setIsStatusOpen(false);
            setIsAssigneeOpen(false);
            setIsTypeOpen(false);
            setIsAddingNewType(false);
            setNewCustomType('');
        };

        if (isStatusOpen || isAssigneeOpen || isTypeOpen) {
            window.addEventListener('scroll', handleScrollOrClickOutside, true);
            return () => {
                window.removeEventListener('scroll', handleScrollOrClickOutside, true);
            };
        }
    }, [isStatusOpen, isAssigneeOpen, isTypeOpen]);

    const handleStatusClick = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom,
            left: rect.left,
            width: rect.width
        });
        setIsStatusOpen(!isStatusOpen);
        setIsAssigneeOpen(false);
        setIsTypeOpen(false);
    };

    const handleAssigneeClick = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom,
            left: rect.left - 40,
            width: 160
        });
        setIsAssigneeOpen(!isAssigneeOpen);
        setIsStatusOpen(false);
        setIsTypeOpen(false);
    };

    const handleTypeClick = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom,
            left: rect.left,
            width: rect.width
        });
        setIsTypeOpen(!isTypeOpen);
        setIsStatusOpen(false);
        setIsAssigneeOpen(false);
    };

    return (
        <div 
            draggable={canDragTaskId === task.id}
            onDragStart={(e) => onDragStartTask(e, task.id, stageId)}
            onDragEnter={(e) => onDragEnterTask(e, task.id)}
            onDragLeave={(e) => onDragLeaveTask(e, task.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropTask(e, task.id, stageId)}
            onDragEnd={onDragEndTask}
            className={`flex items-stretch bg-white border-b border-slate-200 hover:bg-slate-50 transition-colors group/row h-10 relative ${
                isDone ? 'opacity-70' : ''
            } ${isDragged ? 'opacity-25 bg-slate-50' : ''}`}
        >
            {/* 드롭 가이드 라인 (덜덜 떨림 없음) */}
            {draggedTaskId && isHovered && (
                <div className="absolute left-0 right-0 h-0.5 bg-indigo-500 rounded-full z-50 animate-pulse top-0" />
            )}

            {/* 1. 햄버거 드래그 핸들 & 세로 컬러바 */}
            <div 
                onMouseDown={() => setCanDragTaskId(task.id)}
                onMouseUp={() => setCanDragTaskId(null)}
                className="w-[40px] flex items-center justify-center border-r border-slate-200 shrink-0 relative bg-slate-50/50 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition-colors group-hover/row:bg-slate-100/50"
                title="드래그하여 태스크 순서 이동"
            >
                <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${groupColor}`} />
                <GripVertical size={13} className="text-slate-400 opacity-40 group-hover/row:opacity-100 transition-opacity" />
            </div>

            {/* 2. 항목 명칭 */}
            <div 
                className="flex-1 px-4 flex items-center min-w-[200px] border-r border-slate-200 border-l-4 border-transparent hover:border-slate-300 cursor-pointer"
                onClick={() => onSelect?.(task)}
            >
                <span className={`text-[13px] font-black truncate transition-colors hover:text-indigo-600 ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {task.title || task.child}
                </span>
            </div>

            {/* 3. 유형 */}
            <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 p-1.5 relative">
                <div 
                    onClick={handleTypeClick}
                    className={`w-full h-full flex items-center justify-center rounded-md text-[11px] font-black cursor-pointer hover:opacity-80 active:scale-95 transition-all ${getTypeStyle(taskType).bg} ${getTypeStyle(taskType).text}`}
                >
                    {taskType}
                </div>

                {isTypeOpen && (
                    <>
                        <div className="fixed inset-0 z-[940]" onClick={() => { setIsTypeOpen(false); setIsAddingNewType(false); }} />
                        <div 
                            className="fixed bg-white border border-slate-200 shadow-2xl z-[950] animate-in fade-in zoom-in-95 duration-100 flex flex-col rounded-xl p-1.5 gap-0.5"
                            style={{ 
                                top: dropdownPosition.top + 4, 
                                left: dropdownPosition.left,
                                width: '130px'
                            }}
                        >
                            <div className="text-[9px] font-black text-slate-400 px-2 py-1 uppercase tracking-wider border-b border-slate-100">유형 선택</div>
                            <div className="max-h-[160px] overflow-y-auto flex flex-col gap-0.5">
                                {(taskTypes || ['버그', '기능']).map(typeOpt => (
                                    <button
                                        key={typeOpt}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUpdateTask?.(task.id, { type: typeOpt });
                                            setIsTypeOpen(false);
                                        }}
                                        className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-between ${taskType === typeOpt ? 'bg-slate-50 text-indigo-650' : ''}`}
                                    >
                                        <span className="truncate text-[11px]">{typeOpt}</span>
                                        {taskType === typeOpt && <Check size={10} className="text-indigo-600 shrink-0" />}
                                    </button>
                                ))}
                            </div>
                            
                            {/* 유형 직접 추가 기능 */}
                            <div className="border-t border-slate-100 mt-1 pt-1.5 px-1">
                                {!isAddingNewType ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsAddingNewType(true);
                                        }}
                                        className="w-full py-1 text-center text-[10px] font-black text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex items-center justify-center gap-1"
                                    >
                                        <Plus size={10} /> 유형 추가
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={newCustomType}
                                            onChange={(e) => setNewCustomType(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                                    if (newCustomType.trim()) {
                                                        onAddCustomType?.(newCustomType);
                                                        onUpdateTask?.(task.id, { type: newCustomType.trim() });
                                                        setIsTypeOpen(false);
                                                        setIsAddingNewType(false);
                                                        setNewCustomType('');
                                                    }
                                                }
                                                if (e.key === 'Escape') {
                                                    setIsAddingNewType(false);
                                                    setNewCustomType('');
                                                }
                                            }}
                                            placeholder="유형명 입력..."
                                            className="flex-1 w-full bg-white px-1.5 py-0.5 text-[10px] border border-slate-200 focus:border-indigo-400 rounded outline-none"
                                        />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (newCustomType.trim()) {
                                                    onAddCustomType?.(newCustomType);
                                                    onUpdateTask?.(task.id, { type: newCustomType.trim() });
                                                    setIsTypeOpen(false);
                                                    setIsAddingNewType(false);
                                                    setNewCustomType('');
                                                }
                                            }}
                                            className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                        >
                                            <Check size={10} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 5. 담당자 아바타 */}
            <div className="w-[80px] border-r border-slate-200 flex items-center justify-center shrink-0 relative">
                <div 
                    onClick={handleAssigneeClick}
                    className="cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                >
                    {(() => {
                        const assignee = users.find(u => u.uid === (task.assigneeUid || task.AssigneeUid));
                        if (!assignee) return <div className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center bg-slate-50"><User size={10} className="text-slate-300"/></div>;
                        return (
                            <div className="w-6 h-6 rounded-full bg-indigo-500 border border-indigo-600 flex items-center justify-center overflow-hidden" title={assignee.displayName}>
                                {assignee.photoURL 
                                    ? <img src={assignee.photoURL} alt="" className="w-full h-full object-cover" />
                                    : <span className="text-[10px] font-black text-white">{assignee.displayName?.[0]}</span>
                                }
                            </div>
                        );
                    })()}
                </div>

                {isAssigneeOpen && (
                    <>
                        <div className="fixed inset-0 z-[940]" onClick={() => setIsAssigneeOpen(false)} />
                        <div 
                            className="fixed w-[160px] max-h-[200px] overflow-y-auto bg-white border border-slate-200 shadow-2xl z-[950] animate-in fade-in zoom-in-95 duration-100 flex flex-col rounded-xl p-1.5 gap-0.5"
                            style={{ 
                                top: dropdownPosition.top + 4, 
                                left: dropdownPosition.left 
                            }}
                        >
                            <div className="text-[9px] font-black text-slate-400 px-2 py-1 uppercase tracking-wider border-b border-slate-100">담당자 선택</div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateTask?.(task.id, { assigneeUid: '', assigneeName: '' });
                                    setIsAssigneeOpen(false);
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                            >
                                <div className="w-4 h-4 rounded-full border border-dashed border-slate-300 flex items-center justify-center bg-slate-50"><User size={8} className="text-slate-300"/></div>
                                <span>미지정</span>
                            </button>
                            {(users || []).map(u => (
                                <button
                                    key={u.uid}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateTask?.(task.id, { assigneeUid: u.uid, assigneeName: u.displayName });
                                        setIsAssigneeOpen(false);
                                    }}
                                    className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-1.5"
                                >
                                    <div className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center overflow-hidden text-[8px] font-black shrink-0">
                                        {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : u.displayName?.[0]}
                                    </div>
                                    <span className="truncate text-[11px]">{u.displayName}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* 6. 상태 (Dog-ear 포함) */}
            <div className="w-[130px] border-r border-slate-200 shrink-0 relative border-b border-b-white">
                <div 
                    onClick={handleStatusClick}
                    className={`w-full h-full flex items-center justify-center cursor-pointer transition-all hover:opacity-90 ${statusCfg.bg} ${statusCfg.text} relative overflow-hidden`}
                >
                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-l-[8px] border-t-white border-l-transparent opacity-0 group-hover/row:opacity-40 transition-opacity" />
                    <span className="text-[12px] font-black">{statusCfg.label}</span>
                </div>

                {isStatusOpen && (
                    <>
                        <div className="fixed inset-0 z-[940]" onClick={() => setIsStatusOpen(false)} />
                        <div 
                            className="fixed bg-white shadow-2xl z-[950] animate-in fade-in zoom-in-95 duration-100 flex flex-col overflow-hidden ring-1 ring-black/5 rounded-lg"
                            style={{ 
                                top: dropdownPosition.top + 4, 
                                left: dropdownPosition.left, 
                                width: dropdownPosition.width 
                            }}
                        >
                            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                <button 
                                    key={key} 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onUpdateTask?.(task.id, { status: key, completed: key === 'done' }); 
                                        setIsStatusOpen(false); 
                                    }}
                                    className={`w-full py-2.5 text-[12px] font-black transition-all hover:brightness-90 active:brightness-75 ${cfg.bg} ${cfg.text} border-b border-black/10 last:border-0`}
                                >
                                    {cfg.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* 7. 시작일 */}
            <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0">
                <span className="text-[12px] font-black text-slate-500">
                    {task.startDate ? new Date(task.startDate).toLocaleDateString('ko-KR', {month:'short', day:'numeric'}) : '-'}
                </span>
            </div>

            {/* 8. 마감일 */}
            <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0">
                <span className="text-[12px] font-black text-rose-500">
                    {task.dueDate || task.endDate ? new Date(task.dueDate || task.endDate).toLocaleDateString('ko-KR', {month:'short', day:'numeric'}) : '-'}
                </span>
            </div>

            {/* 9. 우선순위 (컬러 블록) */}
            <div className="w-[110px] border-r border-slate-200 shrink-0 p-1.5 border-b border-b-white">
                <div className={`w-full h-full flex items-center justify-center text-[12px] font-black ${pCfg.bg} ${pCfg.text}`}>
                    {pCfg.label}
                </div>
            </div>

            {/* 10. 설명 / 메모 */}
            <div className="w-[150px] border-r border-slate-200 flex items-center px-3 shrink-0">
                <span className="text-[11px] font-bold text-slate-500 truncate">{task.notes || '내용 없음'}</span>
            </div>

            {/* 11. 첨부파일 */}
            <div className="w-[50px] border-r border-slate-200 flex items-center justify-center shrink-0">
                {(task.links && task.links.length > 0) ? <Paperclip size={13} className="text-slate-400"/> : <span className="text-slate-200">-</span>}
            </div>

            {/* 12. 업데이트 (Time Ago) */}
            <div className="w-[90px] border-r border-slate-200 flex items-center justify-center shrink-0 gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-100 flex items-center justify-center"><User size={8} className="text-slate-400" /></div>
                <span className="text-[10px] font-black text-slate-400">
                    {getTimeAgo(task.updatedAt)}
                </span>
            </div>

            {/* 13. 오른쪽 끝 삭제(X) */}
            <div className="w-[40px] flex items-center justify-center shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTask?.(task.id);
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors"
                >
                    <X size={12}/>
                </button>
            </div>
        </div>
    );
}
