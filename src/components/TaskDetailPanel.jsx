import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Calendar, Clock, Bell, BellOff, RotateCcw, 
    ListChecks, CheckCircle2, Circle, Trash2, Save,
    AlertTriangle, FileText
} from 'lucide-react';

const PRIORITY_MAP = {
    urgent: { label: '긴급', color: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
    high: { label: '높음', color: 'bg-orange-100 text-orange-700', icon: Clock },
    medium: { label: '보통', color: 'bg-blue-100 text-blue-700', icon: Clock },
    low: { label: '낮음', color: 'bg-slate-100 text-slate-700', icon: Clock },
};

const STATUS_MAP = {
    todo: { label: '할 일', color: 'bg-slate-100 text-slate-600' },
    in_progress: { label: '진행 중', color: 'bg-blue-50 text-blue-600' },
    completed: { label: '완료', color: 'bg-emerald-50 text-emerald-600' },
};

export default function TaskDetailPanel({ isOpen, onClose, task, onUpdate, onDelete }) {
    const [editForm, setEditForm] = useState(null);
    const [newSubtask, setNewSubtask] = useState('');

    useEffect(() => {
        if (isOpen && task) {
            const dateStr = task.dueDate ? new Date(task.dueDate.getTime() - (task.dueDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '';
            setEditForm({
                title: task.title,
                description: task.description || '',
                priority: task.priority,
                dueDate: dateStr,
                status: task.status,
                alarmEnabled: task.alarmEnabled || false,
                recurring: task.recurring || 'none',
                subtasks: task.subtasks || []
            });
        }
    }, [isOpen, task]);

    if (!isOpen || !task || !editForm) return null;

    const handleSave = async () => {
        const dataToSave = {
            ...editForm,
            dueDate: editForm.dueDate ? new Date(editForm.dueDate) : null
        };
        // Reset alarm if date is in the future
        if (editForm.dueDate && new Date(editForm.dueDate) > new Date()) {
            dataToSave.alarmSent = false;
        }
        await onUpdate(task.id, dataToSave);
        alert("태스크 정보가 수정되었습니다.");
    };

    const addSubtask = () => {
        if (!newSubtask.trim()) return;
        const sub = { id: Date.now(), text: newSubtask, completed: false };
        setEditForm(prev => ({ ...prev, subtasks: [...prev.subtasks, sub] }));
        setNewSubtask('');
    };

    const toggleSubtask = (id) => {
        setEditForm(prev => ({
            ...prev,
            subtasks: prev.subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s)
        }));
    };

    const removeSubtask = (id) => {
        setEditForm(prev => ({ ...prev, subtasks: prev.subtasks.filter(s => s.id !== id) }));
    };

    return createPortal(
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[140]" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
                
                {/* Header */}
                <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${STATUS_MAP[editForm.status].color}`}>
                                {STATUS_MAP[editForm.status].label}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${PRIORITY_MAP[editForm.priority].color}`}>
                                {PRIORITY_MAP[editForm.priority].label}
                            </span>
                        </div>
                        <h2 className="text-base font-black text-slate-900 truncate pr-4">{task.title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleSave} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="저장">
                            <Save size={20}/>
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl">
                            <X size={20}/>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">태스크 제목</label>
                            <input 
                                type="text"
                                value={editForm.title}
                                onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <FileText size={12}/> 상세 설명
                            </label>
                            <textarea 
                                rows="4"
                                value={editForm.description}
                                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                        </div>
                    </div>

                    {/* Schedule & Props */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Calendar size={12}/> 마감 기한
                            </label>
                            <input 
                                type="datetime-local"
                                value={editForm.dueDate}
                                onChange={(e) => setEditForm({...editForm, dueDate: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <AlertTriangle size={12}/> 중요도
                            </label>
                            <select 
                                value={editForm.priority}
                                onChange={(e) => setEditForm({...editForm, priority: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="low">낮음</option>
                                <option value="medium">보통</option>
                                <option value="high">높음</option>
                                <option value="urgent">긴급</option>
                            </select>
                        </div>
                    </div>

                    {/* Alarms & Recurring */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">알람</span>
                                <button
                                    onClick={() => setEditForm({...editForm, alarmEnabled: !editForm.alarmEnabled})}
                                    className={`p-2 rounded-xl transition-all ${editForm.alarmEnabled ? 'bg-amber-100 text-amber-600 shadow-sm' : 'bg-slate-100 text-slate-300'}`}
                                >
                                    {editForm.alarmEnabled ? <Bell size={18}/> : <BellOff size={18}/>}
                                </button>
                            </div>
                            <div className="w-[1px] h-8 bg-slate-100 mx-2"/>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">반복</span>
                                <select 
                                    value={editForm.recurring}
                                    onChange={(e) => setEditForm({...editForm, recurring: e.target.value})}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="none">안 함</option>
                                    <option value="daily">매일</option>
                                    <option value="weekly">매주</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">상태</span>
                            <select 
                                value={editForm.status}
                                onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="todo">할 일</option>
                                <option value="in_progress">진행 중</option>
                                <option value="completed">완료</option>
                            </select>
                        </div>
                    </div>

                    {/* Subtasks */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                        <h3 className="text-xs font-black text-slate-800 border-b pb-2 flex items-center gap-1.5">
                            <ListChecks size={14} className="text-slate-400"/> 세부 항목 ({editForm.subtasks.filter(s => s.completed).length}/{editForm.subtasks.length})
                        </h3>
                        <div className="space-y-2">
                            {editForm.subtasks.map(sub => (
                                <div key={sub.id} className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 group">
                                    <button onClick={() => toggleSubtask(sub.id)} className={`transition-colors ${sub.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-500'}`}>
                                        {sub.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                    </button>
                                    <span className={`text-xs flex-1 font-medium ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{sub.text}</span>
                                    <button onClick={() => removeSubtask(sub.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={newSubtask}
                                onChange={(e) => setNewSubtask(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addSubtask()}
                                placeholder="세부 항목 추가..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button onClick={addSubtask} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">추가</button>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="pt-4">
                        <button 
                            onClick={() => { if(window.confirm("이 태스크를 영구 삭제하시겠습니까?")) { onDelete(task.id); onClose(); } }}
                            className="w-full py-3 rounded-2xl border-2 border-dashed border-rose-200 text-rose-500 text-xs font-black hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                        >
                            <Trash2 size={14}/> 태스크 삭제하기
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
