import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, Calendar, Clock, Bell, BellOff, RotateCcw, 
    ListChecks, CheckCircle2, Circle, Trash2, Save,
    AlertTriangle, FileText, Link as LinkIcon, ExternalLink
} from 'lucide-react';
import RichMemoEditor from './common/RichMemoEditor';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from './common/MondayBoard';

// 데이터 모델별 상이한 키값을 표준 키값으로 변환하는 헬퍼
const mapToStandardStatus = (val) => {
    if (val === true || val === 'true' || val === 'completed' || val === 'done' || val === 'Resolved') return 'done';
    if (val === 'InProgress' || val === 'working_on_it' || val === 'in_progress' || val === 'working') return 'working';
    if (val === 'Pending' || val === 'pending') return 'pending';
    if (val === 'Rejected' || val === 'Archived' || val === 'hold') return 'hold';
    if (val === 'stuck') return 'stuck';
    return 'todo';
};

const mapToStandardPriority = (val) => {
    const lowVal = String(val || 'medium').toLowerCase();
    if (['urgent', 'critical'].includes(lowVal)) return 'urgent';
    if (['high', '상'].includes(lowVal)) return 'high';
    if (['low', '하'].includes(lowVal)) return 'low';
    return 'medium';
};

export default function TaskDetailPanel({ isOpen, onClose, task, onUpdate, onDelete }) {
    const [editForm, setEditForm] = useState(null);
    const [newSubtask, setNewSubtask] = useState('');
    const [newSubtaskLink, setNewSubtaskLink] = useState('');

    useEffect(() => {
        if (isOpen && task) {
            let dateStr = '';
            if (task.dueDate) {
                const d = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
                if (!isNaN(d.getTime())) {
                    dateStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                }
            }
            
            setEditForm({
                title: task.title || task.Title || task.child || '',
                description: task.description || task.Description || task.notes || '',
                priority: task.priority || task.Priority || 'medium',
                dueDate: dateStr,
                status: task.status !== undefined ? task.status : (task.Status !== undefined ? task.Status : task.completed),
                alarmEnabled: task.alarmEnabled || false,
                recurring: task.recurring || 'none',
                subtasks: task.subtasks || [],
                budget: task.budget || 0,
            });
        }
    }, [isOpen, task]);

    if (!isOpen || !task || !editForm) return null;

    const stdStatusKey = mapToStandardStatus(editForm.status);
    const stdPriorityKey = mapToStandardPriority(editForm.priority);
    
    const statusInfo = STATUS_OPTIONS[stdStatusKey] || STATUS_OPTIONS.todo;
    const priorityInfo = PRIORITY_OPTIONS[stdPriorityKey] || PRIORITY_OPTIONS.medium;

    const handleSave = async () => {
        let finalField = 'status';
        let finalValue = editForm.status;

        // 원본 데이터 형식에 맞게 변환
        if (task.hasOwnProperty('Status')) finalField = 'Status';
        if (task.hasOwnProperty('completed')) {
            finalField = 'completed';
            finalValue = (stdStatusKey === 'done');
        }

        const dataToSave = {
            ...editForm,
            [finalField]: finalValue,
            dueDate: editForm.dueDate ? new Date(editForm.dueDate) : null
        };
        
        await onUpdate(task.id, dataToSave);
        alert("정보가 수정되었습니다.");
    };

    const addSubtask = () => {
        if (!newSubtask.trim()) return;
        const sub = { 
            id: Date.now(), 
            text: newSubtask, 
            link: newSubtaskLink || null,
            completed: false 
        };
        setEditForm(prev => ({ ...prev, subtasks: [...prev.subtasks, sub] }));
        setNewSubtask('');
        setNewSubtaskLink('');
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
            <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
                
                {/* Header */}
                <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div className="text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black text-white ${statusInfo.color}`}>
                                {statusInfo.label}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black text-white ${priorityInfo.color}`}>
                                {priorityInfo.label}
                            </span>
                        </div>
                        <h2 className="text-base font-black text-slate-900 truncate pr-4">{editForm.title}</h2>
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
                <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
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
                                <FileText size={12}/> 상세 설명 (Rich Memo)
                            </label>
                            <RichMemoEditor 
                                value={editForm.description}
                                onChange={(val) => setEditForm({...editForm, description: val})}
                                placeholder="헤더, 리스트, 굵게, 컬러, 테이블 등을 사용하여 내용을 작성하세요..."
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1.5 text-left">
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
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1.5 text-left">
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1.5 text-left">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="font-mono">$</span> 예산 (USD)
                            </label>
                            <input 
                                type="number"
                                value={editForm.budget}
                                onChange={(e) => setEditForm({...editForm, budget: Number(e.target.value)})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1.5 text-left">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                상태 변경
                            </label>
                            <select 
                                value={editForm.status}
                                onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                            >
                                {Object.entries(STATUS_OPTIONS).map(([key, cfg]) => (
                                    <option key={key} value={key}>{cfg.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 text-left">
                        <h3 className="text-xs font-black text-slate-800 border-b pb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1.5"><ListChecks size={14} className="text-slate-400"/> 세부 항목 ({editForm.subtasks.filter(s => s.completed).length}/{editForm.subtasks.length})</span>
                        </h3>
                        <div className="space-y-2">
                            {editForm.subtasks.map(sub => (
                                <div key={sub.id} className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 group">
                                    <button onClick={() => toggleSubtask(sub.id)} className={`transition-colors ${sub.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-500'}`}>
                                        {sub.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                    </button>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className={`text-xs font-bold ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{sub.text}</span>
                                        {sub.link && (
                                            <a 
                                                href={sub.link} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 mt-0.5 font-bold"
                                            >
                                                <LinkIcon size={10} /> {sub.link.length > 40 ? sub.link.substring(0, 40) + '...' : sub.link}
                                                <ExternalLink size={8} />
                                            </a>
                                        )}
                                    </div>
                                    <button onClick={() => removeSubtask(sub.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2 text-left">
                            <input 
                                type="text"
                                value={newSubtask}
                                onChange={(e) => setNewSubtask(e.target.value)}
                                placeholder="세부 항목 내용 입력..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <LinkIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text"
                                        value={newSubtaskLink}
                                        onChange={(e) => setNewSubtaskLink(e.target.value)}
                                        placeholder="구글 드라이브 또는 파일 링크 (선택 사항)"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-[10px] font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <button onClick={addSubtask} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">추가</button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 text-center">
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
