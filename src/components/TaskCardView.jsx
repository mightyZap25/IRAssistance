import React from 'react';
import { 
    CheckCircle2, Circle, Calendar, Clock, Bell, RotateCcw, 
    ListChecks, MoreVertical 
} from 'lucide-react';

const PRIORITY_MAP = {
    urgent: { label: '긴급', color: 'bg-rose-100 text-rose-700' },
    high: { label: '높음', color: 'bg-orange-100 text-orange-700' },
    medium: { label: '보통', color: 'bg-blue-100 text-blue-700' },
    low: { label: '낮음', color: 'bg-slate-100 text-slate-700' },
};

const STATUS_MAP = {
    todo: { label: '할 일', color: 'text-slate-500', bgColor: 'bg-slate-50' },
    in_progress: { label: '진행 중', color: 'text-blue-600', bgColor: 'bg-blue-50/30' },
    completed: { label: '완료', color: 'text-emerald-600', bgColor: 'bg-emerald-50/30' },
};

export default function TaskCardView({ tasks, onSelect, onToggleStatus }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(task => (
                <div 
                    key={task.id} 
                    onClick={() => onSelect(task)}
                    className={`group p-5 rounded-2xl border transition-all cursor-pointer ${
                        task.status === 'completed' 
                            ? 'bg-slate-50 border-slate-100 opacity-60' 
                            : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-md'
                    }`}
                >
                    <div className="flex justify-between items-start mb-3">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleStatus(task); }}
                            className={`transition-colors ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-500'}`}
                        >
                            {task.status === 'completed' ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                        </button>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${PRIORITY_MAP[task.priority]?.color}`}>
                            {PRIORITY_MAP[task.priority]?.label}
                        </span>
                    </div>

                    <h3 className={`font-black text-sm mb-1.5 ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {task.title}
                    </h3>
                    
                    <p className="text-[11px] text-slate-500 line-clamp-2 mb-4 font-medium leading-relaxed">
                        {task.description || '상세 내용 없음'}
                    </p>

                    <div className="space-y-3">
                        {task.subtasks && task.subtasks.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[9px] font-black text-slate-400 mb-1">
                                    <span className="flex items-center gap-1"><ListChecks size={10}/> PROGRESS</span>
                                    <span>{Math.round((task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100)}%</span>
                                </div>
                                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-500 transition-all duration-500" 
                                        style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-50 mt-2">
                            {task.dueDate && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                    <Calendar size={12} />
                                    {task.dueDate.toLocaleDateString()}
                                </div>
                            )}
                            <div className="flex items-center gap-3 ml-auto">
                                {task.alarmEnabled && <Bell size={12} className="text-amber-500" />}
                                {task.recurring !== 'none' && <RotateCcw size={12} className="text-purple-500" />}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
