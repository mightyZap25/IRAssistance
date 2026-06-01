import React, { useState } from 'react';
import { X, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { createPersonalTask } from '../services/taskService';

export default function QuickTaskCreateModal({ isOpen, onClose, selectedDate, uid, onSuccess }) {
    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState('medium');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;

        setLoading(true);
        try {
            const taskData = {
                title: title.trim(),
                description: '',
                priority,
                dueDate: selectedDate, // Date object
                status: 'todo',
                subtasks: [],
                alarmEnabled: false,
                recurring: 'none'
            };
            await createPersonalTask(uid, taskData);
            setTitle('');
            setPriority('medium');
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to create quick task:", error);
            alert("할 일 생성에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1001] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                        ⚡ 빠른 할 일 추가
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">날짜</label>
                        <div className="flex items-center gap-2 text-sm font-bold text-indigo-600 mt-1">
                            <Calendar size={14} />
                            {selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                        </div>
                    </div>

                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">할 일 제목</label>
                        <input
                            autoFocus
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="무엇을 해야 하나요?"
                            className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">우선순위</label>
                        <div className="grid grid-cols-4 gap-2">
                            {['low', 'medium', 'high', 'urgent'].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPriority(p)}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all border ${
                                        priority === p
                                            ? p === 'urgent' ? 'bg-rose-500 border-rose-500 text-white' :
                                              p === 'high' ? 'bg-orange-500 border-orange-500 text-white' :
                                              p === 'medium' ? 'bg-blue-500 border-blue-500 text-white' :
                                              'bg-slate-500 border-slate-500 text-white'
                                            : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                                    }`}
                                >
                                    {p === 'low' ? '낮음' : p === 'medium' ? '보통' : p === 'high' ? '높음' : '긴급'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all"
                        >
                            {loading ? '추가 중...' : '할 일 추가하기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
