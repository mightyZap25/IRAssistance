import React from 'react';
import { 
    CheckCircle2, Circle, Calendar, Clock, Bell, RotateCcw, 
    ListChecks, Edit2, Trash2, ChevronRight 
} from 'lucide-react';

const PRIORITY_MAP = {
    urgent: { label: '긴급', color: 'bg-rose-100 text-rose-700' },
    high: { label: '높음', color: 'bg-orange-100 text-orange-700' },
    medium: { label: '보통', color: 'bg-blue-100 text-blue-700' },
    low: { label: '낮음', color: 'bg-slate-100 text-slate-700' },
};

const STATUS_MAP = {
    todo: { label: '할 일', color: 'bg-slate-100 text-slate-600' },
    in_progress: { label: '진행 중', color: 'bg-blue-50 text-blue-600' },
    completed: { label: '완료', color: 'bg-emerald-50 text-emerald-600' },
};

export default function TaskListView({ tasks, onSelect, onToggleStatus, onDelete }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 text-center">상태</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">할 일 내역</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">중요도</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">기한</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">진행도</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-20 text-center">관리</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {tasks.map(task => (
                        <tr 
                            key={task.id} 
                            onClick={() => onSelect(task)}
                            className={`group hover:bg-slate-50/50 transition-colors cursor-pointer ${task.status === 'completed' ? 'opacity-60' : ''}`}
                        >
                            <td className="px-4 py-3 text-center" onClick={(e) => { e.stopPropagation(); onToggleStatus(task); }}>
                                <button className={`transition-colors ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-500'}`}>
                                    {task.status === 'completed' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                </button>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex flex-col">
                                    <span className={`text-xs font-black ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                        {task.title}
                                    </span>
                                    {task.description && (
                                        <span className="text-[10px] text-slate-400 truncate max-w-md font-medium">{task.description}</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${PRIORITY_MAP[task.priority]?.color}`}>
                                    {PRIORITY_MAP[task.priority]?.label}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                        <Calendar size={10} />
                                        {task.dueDate ? task.dueDate.toLocaleDateString() : '-'}
                                    </div>
                                    {task.dueDate && (
                                        <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                            <Clock size={10} />
                                            {task.dueDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </div>
                                    )}
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                {task.subtasks && task.subtasks.length > 0 ? (
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-indigo-500 transition-all duration-500" 
                                                style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-black text-indigo-600">
                                            {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[10px] font-bold text-slate-300">-</span>
                                )}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    <ChevronRight size={14} className="text-slate-300" />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
