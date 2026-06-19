import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    MessageSquare, User, Calendar, Clock,
    MoreHorizontal, ChevronDown, ChevronRight,
    Plus, Check, X, Paperclip, BarChart2,
    Calendar as CalendarIcon, UserPlus, ExternalLink,
    AlertTriangle, Tag, Layers, CornerDownRight
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { getAllUsers } from '../../services/userService';

// --- 표준화된 상태(Status) 설정 ---
export const STATUS_OPTIONS = {
    todo: { label: '작업 전', color: 'bg-gray-400', textColor: 'text-white' },
    working: { label: '진행 중', color: 'bg-amber-400', textColor: 'text-white' },
    stuck: { label: '막힘', color: 'bg-rose-500', textColor: 'text-white' },
    done: { label: '완료', color: 'bg-emerald-500', textColor: 'text-white' },
    pending: { label: '검토 중', color: 'bg-cyan-500', textColor: 'text-white' },
    hold: { label: '보류/반려', color: 'bg-slate-400', textColor: 'text-white' },
};

// --- 표준화된 우선순위(Priority) 설정 ---
export const PRIORITY_OPTIONS = {
    urgent: { label: '긴급', color: 'bg-indigo-950', textColor: 'text-white' },
    high: { label: '높음', color: 'bg-indigo-700', textColor: 'text-white' },
    medium: { label: '보통', color: 'bg-indigo-400', textColor: 'text-white' },
    low: { label: '낮음', color: 'bg-blue-300', textColor: 'text-white' },
};

// --- 표준화된 유형(Type) 설정 ---
export const TYPE_OPTIONS = {
    project:  { label: '프로젝트',  color: 'bg-purple-500',  textColor: 'text-white' },
    bug:      { label: '버그 픽스',  color: 'bg-rose-500',    textColor: 'text-white' },
    feature:  { label: '기능 추가',  color: 'bg-blue-500',    textColor: 'text-white' },
    analysis: { label: '분석',      color: 'bg-amber-500',   textColor: 'text-white' },
    none:     { label: '미정',      color: 'bg-slate-300',   textColor: 'text-slate-600' }
};

// 데이터 모델별 상이한 키값을 표준 키값으로 변환하는 매퍼
const mapToStandardStatus = (val) => {
    if (val === true || val === 'true' || val === 'completed' || val === 'done' || val === 'Resolved') return 'done';
    if (val === 'InProgress' || val === 'working_on_it' || val === 'in_progress') return 'working';
    if (val === 'Pending') return 'pending';
    if (val === 'Rejected' || val === 'Archived' || val === 'hold') return 'hold';
    if (val === 'stuck') return 'stuck';
    return 'todo';
};

const mapToStandardPriority = (val) => {
    const lowVal = String(val).toLowerCase();
    if (['urgent', 'critical'].includes(lowVal)) return 'urgent';
    if (['high', '상'].includes(lowVal)) return 'high';
    if (['low', '하'].includes(lowVal)) return 'low';
    return 'medium'; // Default
};

/**
 * Portal wrapper for dropdowns to ensure they are always on top
 */
const DropdownPortal = ({ children, targetRect, onClose, width = 200, align = 'center' }) => {
    if (!targetRect) return null;

    const top = targetRect.bottom + window.scrollY;
    let left = targetRect.left + window.scrollX;

    if (align === 'center') {
        left = left + (targetRect.width / 2) - (width / 2);
    } else if (align === 'right') {
        left = left + targetRect.width - width;
    }

    return createPortal(
        <>
            <div className="fixed inset-0 z-[9998]" onClick={onClose} />
            <div
                style={{
                    position: 'absolute',
                    top: `${top + 8}px`,
                    left: `${left}px`,
                    width: `${width}px`,
                    zIndex: 9999
                }}
                className="animate-in fade-in zoom-in-95 duration-100"
            >
                {children}
            </div>
        </>,
        document.body
    );
};

export default function MondayBoard({
    tasks = [],
    onSelect,
    onUpdateTask,
    onDeleteTask,
    groups: customGroups,
    groupingField = 'status',
    onAddTask,
    allCategories,
    currentUser
}) {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        const fetchUsers = async () => {
            const userData = await getAllUsers();
            setUsers(userData);
        };
        fetchUsers();
    }, []);

    const groups = React.useMemo(() => {
        if (customGroups) return customGroups;

        if (groupingField === 'parent' || groupingField === 'Category') {
            const uniqueParents = [...new Set(tasks.map(t => t[groupingField] || '미지정'))].sort();
            return uniqueParents.map(p => ({
                id: p,
                label: p,
                color: 'border-indigo-400',
                filter: (t) => (t[groupingField] || '미지정') === p
            }));
        }

        return [
            { id: 'active', label: '진행 중', color: 'border-blue-500', filter: (t) => mapToStandardStatus(t.status ?? t.Status ?? t.completed) !== 'done' },
            { id: 'done', label: '완료됨', color: 'border-emerald-500', filter: (t) => mapToStandardStatus(t.status ?? t.Status ?? t.completed) === 'done' }
        ];
    }, [tasks, customGroups, groupingField]);

    return (
        <div className="flex flex-col gap-8 pb-20">
            {groups.map(group => {
                // 그룹 필터링 시 parentId가 없는 메인 테스크만 추출
                const groupTasks = tasks.filter(t => (group.filter ? group.filter(t) : true) && !t.parentId);
                if (groupTasks.length === 0 && !customGroups) return null;

                return (
                    <MondayGroup
                        key={group.id}
                        group={group}
                        tasks={groupTasks}
                        allTasks={tasks} // 자식 검색용 원본 데이터
                        users={users}
                        onSelect={onSelect}
                        onUpdateTask={onUpdateTask}
                        onDeleteTask={onDeleteTask}
                        onAddTask={onAddTask}
                        allCategories={allCategories}
                        currentUser={currentUser}
                    />
                );
            })}
        </div>
    );
}

function MondayGroup({ group, tasks, allTasks, users, onSelect, onUpdateTask, onDeleteTask, onAddTask, allCategories, currentUser }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const handleAddTask = () => {
        if (!newTaskTitle.trim()) {
            setIsAdding(false);
            return;
        }
        if (onAddTask) {
            onAddTask(group.id, newTaskTitle);
            setNewTaskTitle('');
            setIsAdding(false);
        }
    };

    return (
        <div className="flex flex-col animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-2 group px-1">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors"
                >
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <h2 className={`text-lg font-black tracking-tight ${group.color.replace('border-', 'text-')}`}>
                    {group.label}
                </h2>
                <span className="text-xs font-bold text-slate-300 ml-1 mt-1">{tasks.length} 항목</span>
            </div>

            {isExpanded && (
                <div className="overflow-x-auto custom-scrollbar rounded-xl border border-slate-100 shadow-sm bg-white">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 h-10">
                                <th className="w-10 px-2 text-center border-r border-slate-100 text-slate-300"><BarChart2 size={12} className="mx-auto" /></th>
                                <th className={`px-4 border-l-4 ${group.color} border-r border-slate-100 min-w-[350px]`}>항목 명칭</th>
                                <th className="w-24 px-2 text-center border-r border-slate-100">유형</th>
                                <th className="w-40 px-2 text-center border-r border-slate-100">제품명</th>
                                <th className="w-14 px-2 text-center border-r border-slate-100 text-center">담당자</th>
                                <th className="w-32 px-2 text-center border-r border-slate-100 text-center">상태</th>
                                <th className="w-28 px-2 text-center border-r border-slate-100 text-center">시작일</th>
                                <th className="w-28 px-2 text-center border-r border-slate-100 text-center">마감일</th>
                                <th className="w-32 px-2 text-center border-r border-slate-100 text-center">우선순위</th>
                                <th className="px-4 border-r border-slate-100 min-w-[150px]">설명 / 메모</th>
                                <th className="w-16 px-2 text-center border-r border-slate-100"><Paperclip size={14} className="mx-auto" title="파일" /></th>
                                <th className="w-32 px-4 text-center border-r border-slate-100 text-center">업데이트</th>
                                <th className="w-10 px-2 text-center"><Plus size={14} className="mx-auto text-slate-300" /></th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => (
                                <MondayRow
                                    key={task.id}
                                    task={task}
                                    allTasks={allTasks}
                                    users={users}
                                    groupColor={group.color}
                                    onSelect={onSelect}
                                    onUpdateTask={onUpdateTask}
                                    onDeleteTask={onDeleteTask}
                                    onAddTask={onAddTask}
                                    groupId={group.id}
                                    allCategories={allCategories}
                                    currentUser={currentUser}
                                />
                            ))}
                            {isAdding ? (
                                <tr className="border-b border-slate-100 h-9 bg-white">
                                    <td className="px-2 text-center border-r border-slate-100">
                                        <Plus size={14} className="mx-auto text-slate-300" />
                                    </td>
                                    <td colSpan={11} className={`px-4 border-l-4 ${group.color}`}>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                                    e.preventDefault();
                                                    handleAddTask();
                                                }
                                                if (e.key === 'Escape') {
                                                    setIsAdding(false);
                                                }
                                            }}
                                            onBlur={() => {
                                                if (newTaskTitle.trim()) handleAddTask();
                                                else setIsAdding(false);
                                            }}
                                            placeholder="항목 명칭을 입력하고 엔터를 누르세요..."
                                            className="w-full bg-transparent text-[12px] font-bold outline-none text-slate-700 h-full"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                <tr
                                    className="group/add hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 h-9"
                                    onClick={() => setIsAdding(true)}
                                >
                                    <td className="px-2 text-center border-r border-slate-100 text-slate-300 group-hover/add:text-slate-600 transition-colors">
                                        <Plus size={14} className="mx-auto" />
                                    </td>
                                    <td colSpan={11} className={`px-4 py-2 border-l-4 ${group.color} text-[11px] font-bold text-slate-400 group-hover/add:text-slate-600 transition-colors`}>
                                        + 항목 추가
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function MondayRow({ task, allTasks, users, groupColor, onSelect, onUpdateTask, onDeleteTask, onAddTask, groupId, isSubtask = false, allCategories, currentUser }) {
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [targetRect, setTargetRect] = useState(null);
    const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);

    // 이 테스크의 하위 테스크 추출
    const subtasks = allTasks ? allTasks.filter(t => t.parentId === task.id) : [];

    // 표준 키값으로 매핑하여 설정값 가져오기
    const stdStatusKey = mapToStandardStatus(task.status ?? task.Status ?? task.completed);
    const stdPriorityKey = mapToStandardPriority(task.priority ?? task.Priority);

    const status = STATUS_OPTIONS[stdStatusKey];
    const priority = PRIORITY_OPTIONS[stdPriorityKey];
    
    // 이슈 유형 맵핑 (Category 및 type 처리)
    const typeKey = task.Category || task.category || task.type || 'none';
    let typeInfo;
    if (allCategories && allCategories[typeKey]) {
        typeInfo = {
            label: allCategories[typeKey].label || typeKey,
            color: allCategories[typeKey].color || 'bg-slate-200 border-slate-300 text-slate-700',
            textColor: allCategories[typeKey].color?.includes('text-') ? '' : 'text-slate-700'
        };
    } else {
        const legacyInfo = TYPE_OPTIONS[typeKey] || TYPE_OPTIONS.none;
        typeInfo = {
            label: legacyInfo.label,
            color: legacyInfo.color,
            textColor: legacyInfo.textColor || 'text-white'
        };
    }

    const assignee = users.find(u => u.uid === (task.assigneeUid || task.AssigneeUid));
    const isAssignee = (task.assigneeUid || task.AssigneeUid) === currentUser?.uid;

    const handleDropdownOpen = (e, type) => {
        setTargetRect(e.currentTarget.getBoundingClientRect());
        setActiveDropdown(type);
    };

    const handleValueChange = (field, value) => {
        // 담당자 배정 특수 처리 (UID와 함께 Name도 업데이트)
        if (field === 'assigneeUid') {
            const assigneeUser = users.find(u => u.uid === value);
            const assigneeName = assigneeUser ? assigneeUser.displayName || assigneeUser.name || '' : '';
            
            const updatePayload = {};
            const uidKey = task.hasOwnProperty('AssigneeUid') ? 'AssigneeUid' : 'assigneeUid';
            const nameKey = task.hasOwnProperty('AssigneeName') ? 'AssigneeName' : 'assigneeName';
            
            updatePayload[uidKey] = value;
            updatePayload[nameKey] = assigneeName;

            onUpdateTask(task.id, updatePayload);
            setActiveDropdown(null);
            return;
        }

        let finalField = field;
        let finalValue = value;

        // 원본 데이터 모델의 필드명 찾기 및 값 변환
        if (task.hasOwnProperty('Status')) finalField = (field === 'status' ? 'Status' : field);
        if (task.hasOwnProperty('Priority')) finalField = (field === 'priority' ? 'Priority' : finalField);
        if (task.hasOwnProperty('AssigneeUid')) finalField = (field === 'assigneeUid' ? 'AssigneeUid' : finalField);
        if (task.hasOwnProperty('DueDate')) finalField = (field === 'dueDate' ? 'DueDate' : finalField);
        if (task.hasOwnProperty('StartDate')) finalField = (field === 'startDate' ? 'StartDate' : finalField);
        
        // Category 필드명 매핑 처리 추가
        if (task.hasOwnProperty('Category') && field === 'type') {
            finalField = 'Category';
        } else if (task.hasOwnProperty('category') && field === 'type') {
            finalField = 'category';
        }

        // 프로젝트 TASK의 'completed' 특수 처리
        if (task.hasOwnProperty('completed') && field === 'status') {
            finalField = 'completed';
            finalValue = (value === 'done');
        }

        // 역매핑 (표준 키 -> 원본 도메인 키) - 필요시 로직 확장
        if (field === 'status' && task.hasOwnProperty('Status')) {
            const reverseStatusMap = { done: 'Resolved', working: 'InProgress', pending: 'Pending', hold: 'Archived', todo: 'todo' };
            finalValue = reverseStatusMap[value] || value;
        }

        onUpdateTask(task.id, { [finalField]: finalValue });
        setActiveDropdown(null);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        const d = date.toDate ? date.toDate() : new Date(date);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    };

    return (
        <React.Fragment>
            <tr className={`group hover:bg-slate-50/80 transition-all border-b border-slate-100 font-medium ${isSubtask ? 'bg-slate-50/30 text-[11px] h-9' : 'text-[12px] h-11'}`}>
                <td className="px-2 text-center border-r border-slate-100">
                    <input type="checkbox" className="rounded border-slate-300" />
                </td>

                <td className={`px-4 border-l-4 ${groupColor} border-r border-slate-100`}>
                    <div className={`flex items-center justify-between group/cell ${isSubtask ? 'pl-6' : ''}`}>
                        <div className="flex items-center gap-1.5">
                            {isSubtask && <CornerDownRight size={12} className="text-slate-300" />}
                            {!isSubtask && subtasks.length > 0 ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsSubtasksExpanded(!isSubtasksExpanded); }}
                                    className="p-0.5 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                                >
                                    {isSubtasksExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            ) : !isSubtask ? (
                                <div className="w-[18px]"></div>
                            ) : null}
                            <span
                                className={`truncate cursor-pointer hover:underline font-black ${isSubtask ? 'text-slate-600' : 'text-slate-700'} text-[13px] flex items-center gap-2`}
                                onClick={() => onSelect(task)}
                            >
                                <span>{task.title || task.Title || task.child}</span>
                                {!isSubtask && subtasks.length > 0 && (
                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                                        📋 {subtasks.filter(s => mapToStandardStatus(s.status) === 'done').length}/{subtasks.length}
                                    </span>
                                )}
                            </span>
                        </div>
                        <button className="p-1 hover:bg-white rounded border border-slate-200 shadow-sm text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MessageSquare size={12} />
                        </button>
                    </div>
                </td>

                <td className="px-0.5 py-0.5 border-r border-slate-100 text-center">
                    <div
                        onClick={(e) => handleDropdownOpen(e, 'type')}
                        className={`w-full h-9 flex items-center justify-center font-black transition-all hover:brightness-105 cursor-pointer rounded-lg shadow-sm text-[11px] ${typeInfo.color} ${typeInfo.textColor}`}
                    >
                        {typeInfo.label}
                    </div>
                </td>

                <td className="px-2 border-r border-slate-100">
                    <input
                        type="text"
                        defaultValue={task.TargetProductName || ''}
                        onBlur={(e) => {
                            if (e.target.value !== (task.TargetProductName || '')) {
                                onUpdateTask(task.id, { TargetProductName: e.target.value });
                            }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        placeholder="제품/시리즈명"
                        className="w-full bg-transparent border-none outline-none text-[11px] text-slate-600 font-bold placeholder:text-slate-300"
                    />
                </td>

                <td className="px-2 text-center border-r border-slate-100">
                    <div
                        className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 mx-auto flex items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all shadow-inner overflow-hidden"
                        onClick={(e) => handleDropdownOpen(e, 'user')}
                    >
                        {assignee ? (
                            assignee.photoURL ? (
                                <img src={assignee.photoURL} alt={assignee.displayName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-[10px] font-black text-slate-600">{assignee.displayName?.substring(0, 1)}</span>
                            )
                        ) : (
                            <span className="text-[9px] font-black text-slate-400">배정</span>
                        )}
                    </div>
                </td>

                <td className="px-0.5 py-0.5 border-r border-slate-100">
                    <div
                        onClick={(e) => handleDropdownOpen(e, 'status')}
                        className={`w-full h-9 flex items-center justify-center font-black text-white transition-all hover:brightness-105 cursor-pointer rounded-lg shadow-sm text-[11px] ${status.color}`}
                    >
                        {status.label}
                    </div>
                </td>

                <td 
                    className={`px-1 py-1 text-center border-r border-slate-100 ${isAssignee ? 'cursor-pointer group/date' : 'cursor-not-allowed opacity-60'}`} 
                    onClick={(e) => {
                        if (isAssignee) {
                            handleDropdownOpen(e, 'startDate');
                        } else {
                            alert('시작일은 배정된 담당자만 설정할 수 있습니다.');
                        }
                    }}
                >
                    <div className={`w-full h-full min-h-[28px] flex items-center justify-center text-slate-400 font-black tracking-tighter text-[11px] ${isAssignee ? 'group-hover/date:bg-slate-100' : ''} rounded transition-colors`}>
                        {formatDate(task.startDate || task.StartDate)}
                    </div>
                </td>

                <td 
                    className={`px-1 py-1 text-center border-r border-slate-100 ${isAssignee ? 'cursor-pointer group/date' : 'cursor-not-allowed opacity-60'}`} 
                    onClick={(e) => {
                        if (isAssignee) {
                            handleDropdownOpen(e, 'dueDate');
                        } else {
                            alert('마감일은 배정된 담당자만 설정할 수 있습니다.');
                        }
                    }}
                >
                    <div className={`w-full h-full min-h-[28px] flex items-center justify-center text-rose-500 font-black tracking-tighter text-[11px] ${isAssignee ? 'group-hover/date:bg-slate-100' : ''} rounded transition-colors`}>
                        {formatDate(task.dueDate || task.DueDate || task.endDate)}
                    </div>
                </td>

                <td className="px-0.5 py-0.5 border-r border-slate-100 text-center">
                    <div
                        onClick={(e) => handleDropdownOpen(e, 'priority')}
                        className={`w-full h-9 flex items-center justify-center font-black text-white transition-all hover:brightness-105 cursor-pointer rounded-lg shadow-sm text-[11px] ${priority.color}`}
                    >
                        {priority.label}
                    </div>
                </td>

                <td className="px-4 border-r border-slate-100 text-slate-500 truncate max-w-[200px]">
                    <div
                        className="truncate text-[11px] font-medium"
                        dangerouslySetInnerHTML={{ __html: task.description || task.Description || task.notes || '-' }}
                    />
                </td>

                <td className="px-2 text-center border-r border-slate-100 text-center">
                    {task.files?.length > 0 ? (
                        <div className="bg-blue-500 text-white rounded p-1 w-max mx-auto shadow-md">
                            <Paperclip size={10} />
                        </div>
                    ) : (
                        <div className="text-slate-200 opacity-30">-</div>
                    )}
                </td>

                <td className="px-4 text-center border-r border-slate-100 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-400">
                        <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-inner text-[8px] font-black">
                            {assignee ? assignee.displayName?.substring(0, 1) : '?'}
                        </div>
                        <span className="text-[9px] font-bold">방금 전</span>
                    </div>
                </td>

                <td className="px-2 text-center relative group/actions text-slate-200 group-hover:text-rose-400 transition-colors">
                    <button onClick={() => { if (window.confirm("항목을 삭제하시겠습니까?")) onDeleteTask(task.id); }}>
                        <X size={14} />
                    </button>
                </td>

                {activeDropdown === 'status' && (
                    <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={130}>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 ring-1 ring-black/5">
                            {Object.entries(STATUS_OPTIONS).map(([key, cfg]) => (
                                <button
                                    key={key}
                                    onClick={() => handleValueChange('status', key)}
                                    className={`w-full h-9 mb-1 last:mb-0 rounded-xl flex items-center justify-center font-black text-white text-[11px] transition-all hover:scale-[1.03] shadow-sm ${cfg.color}`}
                                >
                                    {cfg.label}
                                </button>
                            ))}
                        </div>
                    </DropdownPortal>
                )}

                {activeDropdown === 'type' && (
                <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={130}>
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 ring-1 ring-black/5 max-h-60 overflow-y-auto custom-scrollbar">
                        {allCategories ? (
                            Object.entries(allCategories).map(([key, cfg]) => {
                                const btnColor = cfg.color || 'bg-slate-200 border-slate-300 text-slate-700';
                                const btnTextColor = cfg.color?.includes('text-') ? '' : 'text-slate-700';
                                return (
                                    <button 
                                        key={key}
                                        onClick={() => handleValueChange('type', key)}
                                        className={`w-full h-9 mb-1 last:mb-0 rounded-xl flex items-center justify-center font-black text-[11px] transition-all hover:scale-[1.03] shadow-sm ${btnColor} ${btnTextColor}`}
                                    >
                                        {cfg.label || key}
                                    </button>
                                );
                            })
                        ) : (
                            Object.entries(TYPE_OPTIONS).map(([key, cfg]) => (
                                <button 
                                    key={key}
                                    onClick={() => handleValueChange('type', key)}
                                    className={`w-full h-9 mb-1 last:mb-0 rounded-xl flex items-center justify-center font-black text-white text-[11px] transition-all hover:scale-[1.03] shadow-sm ${cfg.color}`}
                                >
                                    {cfg.label}
                                </button>
                            ))
                        )}
                    </div>
                </DropdownPortal>
            )}

            {activeDropdown === 'priority' && (
                    <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={130}>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-1.5 ring-1 ring-black/5">
                            {Object.entries(PRIORITY_OPTIONS).map(([key, cfg]) => (
                                <button
                                    key={key}
                                    onClick={() => handleValueChange('priority', key)}
                                    className={`w-full h-9 mb-1 last:mb-0 rounded-xl flex items-center justify-center font-black text-white text-[11px] transition-all hover:scale-[1.03] shadow-sm ${cfg.color}`}
                                >
                                    {cfg.label}
                                </button>
                            ))}
                        </div>
                    </DropdownPortal>
                )}

                {activeDropdown === 'user' && (
                    <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={240}>
                        <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-2 ring-1 ring-black/5">
                            <div className="text-[10px] font-black text-slate-400 uppercase px-4 py-2.5 mb-1 tracking-widest border-b border-slate-50 flex justify-between items-center">
                                담당자 배정 <User size={10} />
                            </div>
                            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1 p-1 text-left">
                                {users.map(u => (
                                    <button
                                        key={u.uid}
                                        onClick={() => handleValueChange('assigneeUid', u.uid)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-2xl text-left transition-all group/user"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 group-hover/user:border-blue-200 overflow-hidden shadow-inner">
                                            {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : <User size={14} className="text-slate-400" />}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-black text-slate-700 truncate">{u.displayName}</span>
                                            <span className="text-[9px] text-slate-400 font-bold truncate uppercase tracking-tighter">{u.department || '부서 미지정'}</span>
                                        </div>
                                    </button>
                                ))}
                                <button
                                    onClick={() => handleValueChange('assigneeUid', '')}
                                    className="w-full px-4 py-2.5 hover:bg-rose-50 text-rose-500 rounded-2xl text-left text-[11px] font-black transition-colors border-t border-slate-50 mt-2"
                                >
                                    <X size={12} className="inline mr-2" /> 담당자 해제
                                </button>
                            </div>
                        </div>
                    </DropdownPortal>
                )}

                {activeDropdown === 'startDate' && (
                    <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={300}>
                        <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-4 ring-1 ring-black/10 flex flex-col items-center">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 w-full text-left">시작일 설정</label>
                            <DatePicker 
                                inline
                                selected={task.startDate || task.StartDate ? (task.startDate?.toDate ? task.startDate.toDate() : (task.StartDate?.toDate ? task.StartDate.toDate() : new Date(task.startDate || task.StartDate))) : null}
                                onChange={(date) => handleValueChange('startDate', date.toISOString())}
                                className="bg-white"
                            />
                        </div>
                    </DropdownPortal>
                )}

                {activeDropdown === 'dueDate' && (
                    <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={300}>
                        <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-4 ring-1 ring-black/10 flex flex-col items-center">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 w-full text-left">마감일 설정</label>
                            <DatePicker 
                                inline
                                selected={task.dueDate || task.DueDate || task.endDate ? (task.dueDate?.toDate ? task.dueDate.toDate() : (task.DueDate?.toDate ? task.DueDate.toDate() : (task.endDate?.toDate ? task.endDate.toDate() : new Date(task.dueDate || task.DueDate || task.endDate)))) : null}
                                onChange={(date) => handleValueChange('dueDate', date.toISOString())}
                                className="bg-white"
                            />
                        </div>
                    </DropdownPortal>
                )}
            </tr>

            {isSubtasksExpanded && subtasks.length > 0 && subtasks.map(sub => (
                <MondayRow
                    key={sub.id}
                    task={sub}
                    allTasks={allTasks}
                    users={users}
                    groupColor={groupColor}
                    onSelect={onSelect}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                    onAddTask={onAddTask}
                    groupId={groupId}
                    isSubtask={true}
                    allCategories={allCategories}
                    currentUser={currentUser}
                />
            ))}
        </React.Fragment>
    );
}
