import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    MessageSquare, User, Calendar, Clock, 
    MoreHorizontal, ChevronDown, ChevronRight,
    Plus, Check, X, Paperclip, BarChart2,
    Calendar as CalendarIcon, UserPlus, ExternalLink,
    AlertTriangle, Tag, Layers
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { getAllUsers } from '../../services/userService';

// --- 표준화된 상태(Status) 설정 ---
export const STATUS_OPTIONS = {
    todo:    { label: '작업 전',   color: 'bg-gray-400',    textColor: 'text-white' },
    working: { label: '진행 중',   color: 'bg-amber-400',   textColor: 'text-white' },
    stuck:   { label: '막힘',     color: 'bg-rose-500',    textColor: 'text-white' },
    done:    { label: '완료',     color: 'bg-emerald-500', textColor: 'text-white' },
    pending: { label: '검토 중',   color: 'bg-cyan-500',    textColor: 'text-white' },
    hold:    { label: '보류/반려', color: 'bg-slate-400',    textColor: 'text-white' },
};

// --- 표준화된 우선순위(Priority) 설정 ---
export const PRIORITY_OPTIONS = {
    urgent: { label: '긴급', color: 'bg-indigo-950', textColor: 'text-white' },
    high:   { label: '높음', color: 'bg-indigo-700', textColor: 'text-white' },
    medium: { label: '보통', color: 'bg-indigo-400', textColor: 'text-white' },
    low:    { label: '낮음', color: 'bg-blue-300',   textColor: 'text-white' },
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
    onAddTask
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
                const groupTasks = tasks.filter(group.filter || ((t) => true));
                if (groupTasks.length === 0 && !customGroups) return null;
                
                return (
                    <MondayGroup 
                        key={group.id}
                        group={group}
                        tasks={groupTasks}
                        users={users}
                        onSelect={onSelect}
                        onUpdateTask={onUpdateTask}
                        onDeleteTask={onDeleteTask}
                        onAddTask={onAddTask}
                    />
                );
            })}
        </div>
    );
}

function MondayGroup({ group, tasks, users, onSelect, onUpdateTask, onDeleteTask, onAddTask }) {
    const [isExpanded, setIsExpanded] = useState(true);

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
                                <th className="w-14 px-2 text-center border-r border-slate-100"><User size={14} className="mx-auto" title="소유자" /></th>
                                <th className="w-32 px-2 text-center border-r border-slate-100 text-center">상태</th>
                                <th className="w-32 px-2 text-center border-r border-slate-100 text-center">기한</th>
                                <th className="w-32 px-2 text-center border-r border-slate-100 text-center">우선순위</th>
                                <th className="px-4 border-r border-slate-100 min-w-[150px]">설명 / 메모</th>
                                <th className="w-48 px-4 text-center border-r border-slate-100 text-center">타임라인</th>
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
                                    users={users}
                                    groupColor={group.color}
                                    onSelect={onSelect}
                                    onUpdateTask={onUpdateTask}
                                    onDeleteTask={onDeleteTask}
                                />
                            ))}
                            <tr 
                                className="group/add hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 h-9"
                                onClick={() => onAddTask && onAddTask(group.id)}
                            >
                                <td className="px-2 text-center border-r border-slate-100 text-slate-300 group-hover/add:text-slate-600 transition-colors">
                                    <Plus size={14} className="mx-auto" />
                                </td>
                                <td colSpan={10} className={`px-4 py-2 border-l-4 ${group.color} text-[11px] font-bold text-slate-400 group-hover/add:text-slate-600 transition-colors`}>
                                    + 항목 추가
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function MondayRow({ task, users, groupColor, onSelect, onUpdateTask, onDeleteTask }) {
    const [activeDropdown, setActiveDropdown] = useState(null); 
    const [targetRect, setTargetRect] = useState(null);
    
    // 표준 키값으로 매핑하여 설정값 가져오기
    const stdStatusKey = mapToStandardStatus(task.status ?? task.Status ?? task.completed);
    const stdPriorityKey = mapToStandardPriority(task.priority ?? task.Priority);

    const status = STATUS_OPTIONS[stdStatusKey];
    const priority = PRIORITY_OPTIONS[stdPriorityKey];
    const assignee = users.find(u => u.uid === (task.assigneeUid || task.AssigneeUid));

    const handleDropdownOpen = (e, type) => {
        setTargetRect(e.currentTarget.getBoundingClientRect());
        setActiveDropdown(type);
    };

    const handleValueChange = (field, value) => {
        let finalField = field;
        let finalValue = value;

        // 원본 데이터 모델의 필드명 찾기 및 값 변환
        if (task.hasOwnProperty('Status')) finalField = (field === 'status' ? 'Status' : field);
        if (task.hasOwnProperty('Priority')) finalField = (field === 'priority' ? 'Priority' : finalField);
        if (task.hasOwnProperty('AssigneeUid')) finalField = (field === 'assigneeUid' ? 'AssigneeUid' : finalField);
        if (task.hasOwnProperty('DueDate')) finalField = (field === 'dueDate' ? 'DueDate' : finalField);
        if (task.hasOwnProperty('StartDate')) finalField = (field === 'startDate' ? 'StartDate' : finalField);

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
        <tr className="group hover:bg-slate-50/80 transition-all border-b border-slate-100 text-[12px] font-medium h-11">
            <td className="px-2 text-center border-r border-slate-100">
                <input type="checkbox" className="rounded border-slate-300" />
            </td>
            
            <td className={`px-4 border-l-4 ${groupColor} border-r border-slate-100`}>
                <div className="flex items-center justify-between group/cell">
                    <span 
                        className="truncate cursor-pointer hover:underline font-black text-slate-700 text-[13px]"
                        onClick={() => onSelect(task)}
                    >
                        {task.title || task.Title || task.child}
                    </span>
                    <button className="p-1 hover:bg-white rounded border border-slate-200 shadow-sm text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MessageSquare size={12} />
                    </button>
                </div>
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
                        <UserPlus size={14} className="opacity-30" />
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

            <td className="px-4 text-center border-r border-slate-100 text-slate-600 font-black whitespace-nowrap tracking-tighter text-[11px]">
                {formatDate(task.dueDate || task.DueDate || task.endDate)}
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

            <td className="px-4 border-r border-slate-100">
                <div 
                    className="w-full bg-slate-100 h-6 rounded-full relative overflow-hidden group/timeline cursor-pointer hover:bg-slate-200 transition-all border border-slate-200 shadow-inner"
                    onClick={(e) => handleDropdownOpen(e, 'timeline')}
                >
                    {(task.startDate || task.StartDate || task.dueDate || task.DueDate || task.endDate) ? (
                        <>
                            <div className="absolute inset-0 bg-blue-500 w-full opacity-80" />
                            <span className="relative z-10 text-[9px] font-black text-white flex justify-center items-center h-full tracking-tighter">
                                {formatDate(task.startDate || task.StartDate)} - {formatDate(task.dueDate || task.DueDate || task.endDate)}
                            </span>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-[8px] font-black text-slate-300 tracking-tighter italic uppercase">NOT SET</div>
                    )}
                </div>
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
                <button onClick={() => { if(window.confirm("항목을 삭제하시겠습니까?")) onDeleteTask(task.id); }}>
                    <X size={14} />
                </button>
            </td>

            {/* --- Portaled Dropdowns --- */}
            
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
                            담당자 배정 <User size={10}/>
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

            {activeDropdown === 'timeline' && (
                <DropdownPortal targetRect={targetRect} onClose={() => setActiveDropdown(null)} width={480}>
                    <div className="bg-white border border-slate-200 rounded-[32px] shadow-2xl p-8 ring-1 ring-black/10">
                        <div className="text-sm font-black text-slate-800 mb-6 border-b pb-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl shadow-inner"><CalendarIcon size={20} /></div>
                                <span>기간 및 일정 설정</span>
                            </div>
                            <button onClick={() => setActiveDropdown(null)} className="p-2 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-10 text-left">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">시작일 (Start Date)</label>
                                <div className="relative group/dp">
                                    <DatePicker 
                                        selected={task.startDate || task.StartDate ? (task.startDate?.toDate ? task.startDate.toDate() : (task.StartDate?.toDate ? task.StartDate.toDate() : new Date(task.startDate || task.StartDate))) : null}
                                        onChange={(date) => handleValueChange('startDate', date.toISOString())}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-black outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer shadow-inner"
                                        dateFormat="yyyy년 MM월 dd일"
                                        placeholderText="날짜 선택"
                                        portalId="root"
                                    />
                                    <CalendarIcon size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none group-hover/dp:text-blue-400 transition-colors" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">마감일 (Due Date)</label>
                                <div className="relative group/dp">
                                    <DatePicker 
                                        selected={task.dueDate || task.DueDate || task.endDate ? (task.dueDate?.toDate ? task.dueDate.toDate() : (task.DueDate?.toDate ? task.DueDate.toDate() : (task.endDate?.toDate ? task.endDate.toDate() : new Date(task.dueDate || task.DueDate || task.endDate)))) : null}
                                        onChange={(date) => handleValueChange('dueDate', date.toISOString())}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-black outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer shadow-inner"
                                        dateFormat="yyyy년 MM월 dd일"
                                        placeholderText="날짜 선택"
                                        portalId="root"
                                    />
                                    <CalendarIcon size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none group-hover/dp:text-blue-400 transition-colors" />
                                </div>
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                            <button 
                                onClick={() => setActiveDropdown(null)}
                                className="px-10 py-3.5 bg-blue-600 text-white rounded-2xl text-xs font-black hover:bg-blue-700 shadow-2xl shadow-blue-100 transition-all transform hover:scale-[1.02] active:scale-95"
                            >
                                설정 완료
                            </button>
                        </div>
                    </div>
                </DropdownPortal>
            )}
        </tr>
    );
}
