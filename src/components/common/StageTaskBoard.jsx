import React, { useState, useRef, useEffect } from 'react';
import {
    Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2,
    Circle, AlertCircle, Clock, User, MoreHorizontal, GripVertical,
    Flag, X
} from 'lucide-react';

// 상태 설정
const STATUS_CONFIG = {
    todo:    { label: '작업 전', dot: 'bg-slate-300',    pill: 'bg-slate-100 text-slate-600',    icon: Circle },
    working: { label: '진행 중', dot: 'bg-amber-400',    pill: 'bg-amber-100 text-amber-700',    icon: Clock },
    stuck:   { label: '막힘',   dot: 'bg-rose-500',     pill: 'bg-rose-100 text-rose-700',      icon: AlertCircle },
    done:    { label: '완료',   dot: 'bg-emerald-500',  pill: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

const PRIORITY_CONFIG = {
    High:   { label: '높음', color: 'text-rose-500',   bg: 'bg-rose-50' },
    Medium: { label: '보통', color: 'text-amber-500',  bg: 'bg-amber-50' },
    Low:    { label: '낮음', color: 'text-slate-400',  bg: 'bg-slate-50' },
};

// 날짜 포맷 (M/D)
function fmtDate(val) {
    if (!val) return null;
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d)) return null;
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// D-day 계산
function dday(val) {
    if (!val) return null;
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d)) return null;
    const diff = Math.ceil((d - new Date()) / 86400000);
    return diff;
}

/**
 * 공정 단계 전용 경량 Task 보드
 * - 그룹(parent) 단위로 섹션 구분
 * - 각 태스크: 상태 토글 / 제목 / 담당자 / 마감 D-day / 우선순위 / 삭제
 * - 가로 스크롤 없음, 인라인 편집
 */
export default function StageTaskBoard({ tasks = [], users = [], onSelect, onUpdateTask, onDeleteTask, onAddTask }) {
    // tasks를 parent(그룹)별로 분류
    const groups = React.useMemo(() => {
        const map = new Map();
        tasks.forEach(t => {
            const g = t.parent || '미분류';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(t);
        });
        return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
    }, [tasks]);

    return (
        <div className="space-y-3">
            {groups.length === 0 && (
                <div className="text-center py-10 text-slate-300">
                    <div className="text-4xl mb-2">📋</div>
                    <p className="text-xs font-black">태스크가 없습니다</p>
                    <p className="text-[10px] mt-1">상단의 '+ 그룹 추가' 버튼을 눌러 첫 태스크를 생성하세요.</p>
                </div>
            )}
            {groups.map(g => (
                <TaskGroup
                    key={g.name}
                    groupName={g.name}
                    tasks={g.items}
                    users={users}
                    onSelect={onSelect}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                    onAddTask={onAddTask}
                />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────
//  그룹 섹션
// ─────────────────────────────────────────
function TaskGroup({ groupName, tasks, users, onSelect, onUpdateTask, onDeleteTask, onAddTask }) {
    const [expanded, setExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isAdding) inputRef.current?.focus();
    }, [isAdding]);

    const doneCount = tasks.filter(t => t.status === 'done' || t.completed === true).length;
    const allDone = tasks.length > 0 && doneCount === tasks.length;

    const handleAdd = () => {
        if (!newTitle.trim()) { setIsAdding(false); return; }
        onAddTask?.(groupName, newTitle.trim());
        setNewTitle('');
        setIsAdding(false);
    };

    // 그룹 왼쪽 컬러바 (완료율 기반)
    const pct = tasks.length > 0 ? doneCount / tasks.length : 0;
    const barColor = pct === 1 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-indigo-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-300';

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* 그룹 헤더 */}
            <div
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                onClick={() => setExpanded(e => !e)}
            >
                {/* 완료율 컬러 바 */}
                <div className={`w-1 h-5 rounded-full ${barColor} shrink-0`} />

                <button className="p-0.5 text-slate-300 hover:text-slate-600 transition-colors">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <span className="text-xs font-black text-slate-700 flex-1 truncate">{groupName}</span>

                {/* 진행률 */}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${barColor}`}
                                style={{ width: `${pct * 100}%` }}
                            />
                        </div>
                        <span className="text-[9px] font-black text-slate-400">{doneCount}/{tasks.length}</span>
                    </div>
                    {allDone && <CheckCircle2 size={13} className="text-emerald-500" />}
                </div>
            </div>

            {/* 태스크 목록 */}
            {expanded && (
                <div className="border-t border-slate-100">
                    {tasks.map(task => (
                        <TaskRow
                            key={task.id}
                            task={task}
                            users={users}
                            onSelect={onSelect}
                            onUpdateTask={onUpdateTask}
                            onDeleteTask={onDeleteTask}
                        />
                    ))}

                    {/* 인라인 추가 */}
                    {isAdding ? (
                        <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-50 bg-indigo-50/30">
                            <div className="w-3 h-3 rounded-full border-2 border-slate-300 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd();
                                    if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); }
                                }}
                                onBlur={() => { if (newTitle.trim()) handleAdd(); else setIsAdding(false); }}
                                placeholder="태스크명 입력 후 Enter..."
                                className="flex-1 bg-transparent text-[11px] font-bold outline-none text-slate-700 placeholder-slate-300"
                            />
                            <button onClick={() => { setIsAdding(false); setNewTitle(''); }} className="text-slate-300 hover:text-rose-400 transition-colors">
                                <X size={12} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={e => { e.stopPropagation(); setIsAdding(true); }}
                            className="w-full flex items-center gap-2 px-4 py-2 border-t border-slate-50 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all group/add"
                        >
                            <Plus size={12} className="shrink-0" />
                            <span className="text-[10px] font-black">태스크 추가</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────
//  개별 태스크 행
// ─────────────────────────────────────────
function TaskRow({ task, users, onSelect, onUpdateTask, onDeleteTask }) {
    const [showActions, setShowActions] = useState(false);

    const curStatus = task.status || (task.completed ? 'done' : 'todo');
    const statusCfg = STATUS_CONFIG[curStatus] || STATUS_CONFIG.todo;
    const StatusIcon = statusCfg.icon;
    const isDone = curStatus === 'done';

    const assignee = users.find(u => u.uid === (task.assigneeUid || task.AssigneeUid));
    const priority = PRIORITY_CONFIG[task.priority || 'Medium'];
    const due = task.dueDate || task.endDate;
    const ddayVal = dday(due);

    const handleStatusCycle = (e) => {
        e.stopPropagation();
        const cycle = ['todo', 'working', 'stuck', 'done'];
        const next = cycle[(cycle.indexOf(curStatus) + 1) % cycle.length];
        onUpdateTask?.(task.id, { status: next, completed: next === 'done' });
    };

    return (
        <div
            className={`group/row flex items-center gap-2.5 px-4 py-2 border-t border-slate-50 hover:bg-slate-50/60 transition-all cursor-pointer ${isDone ? 'opacity-60' : ''}`}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            {/* 상태 토글 버튼 */}
            <button
                onClick={handleStatusCycle}
                title={`현재: ${statusCfg.label} (클릭하면 다음 상태)`}
                className="shrink-0 transition-transform hover:scale-110"
            >
                <div className={`w-3.5 h-3.5 rounded-full ${statusCfg.dot} flex items-center justify-center`}>
                    {isDone && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
            </button>

            {/* 태스크 제목 */}
            <span
                onClick={() => onSelect?.(task)}
                className={`flex-1 min-w-0 text-[11px] font-bold truncate hover:text-indigo-600 transition-colors ${
                    isDone ? 'line-through text-slate-400' : 'text-slate-700'
                }`}
            >
                {task.title || task.child}
            </span>

            {/* 상태 필 (호버 시 숨김) */}
            {!showActions && (
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* 우선순위 점 */}
                    {task.priority && task.priority !== 'Medium' && (
                        <Flag size={10} className={priority.color} />
                    )}

                    {/* 담당자 아바타 */}
                    {assignee && (
                        <div className="w-5 h-5 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center overflow-hidden shrink-0"
                            title={assignee.displayName}
                        >
                            {assignee.photoURL
                                ? <img src={assignee.photoURL} alt="" className="w-full h-full object-cover" />
                                : <span className="text-[8px] font-black text-indigo-600">{assignee.displayName?.[0]}</span>
                            }
                        </div>
                    )}

                    {/* D-day */}
                    {ddayVal !== null && (
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                            ddayVal < 0 ? 'bg-rose-100 text-rose-600' :
                            ddayVal <= 3 ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-400'
                        }`}>
                            {ddayVal < 0 ? `D+${Math.abs(ddayVal)}` : ddayVal === 0 ? 'D-Day' : `D-${ddayVal}`}
                        </span>
                    )}

                    {/* 상태 필 */}
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${statusCfg.pill}`}>
                        {statusCfg.label}
                    </span>
                </div>
            )}

            {/* 호버 시 액션 버튼 */}
            {showActions && (
                <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-100">
                    <button
                        onClick={(e) => { e.stopPropagation(); onSelect?.(task); }}
                        className="px-2 py-1 text-[9px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                    >
                        상세
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('태스크를 삭제하시겠습니까?')) onDeleteTask?.(task.id);
                        }}
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            )}
        </div>
    );
}
