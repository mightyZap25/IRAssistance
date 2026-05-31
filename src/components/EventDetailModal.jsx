import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, CheckCircle2, Circle, Clock, FileText, ChevronRight, 
    ArrowRight, User, AlertCircle, Briefcase, Calendar, MessageSquare
} from 'lucide-react';

export default function EventDetailModal({ isOpen, onClose, event }) {
    if (!isOpen || !event) return null;

    const getIcon = () => {
        switch (event.type) {
            case 'task': return <CheckCircle2 className="text-indigo-500" size={20} />;
            case 'milestone': return <Briefcase className="text-amber-500" size={20} />;
            case 'issue': return <AlertCircle className="text-rose-500" size={20} />;
            default: return <Calendar size={20} />;
        }
    };

    const getTypeName = () => {
        switch (event.type) {
            case 'task': return '개인 Task';
            case 'milestone': return '프로젝트 마일스톤';
            case 'issue': return '할당된 이슈';
            default: return '이벤트';
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        {getIcon()}
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getTypeName()}</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 leading-tight">{event.title || event.text}</h2>
                        {event.description && (
                            <p className="mt-3 text-sm font-medium text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed italic">
                                "{event.description}"
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar size={12}/> 일정</label>
                            <div className="text-xs font-black text-slate-700">
                                {event.dueDate ? new Date(event.dueDate).toLocaleString() : '미설정'}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12}/> 상태</label>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${event.status === 'completed' || event.status === 'done' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                <span className="text-xs font-black text-slate-700 uppercase">{event.status || 'Pending'}</span>
                            </div>
                        </div>
                    </div>

                    {event.type === 'issue' && (
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-400 uppercase">Issue Category</span>
                                <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 text-[10px] font-black uppercase">{event.category || 'N/A'}</span>
                            </div>
                            <button 
                                onClick={() => window.location.href='/project/issues'}
                                className="w-full py-3 bg-rose-600 text-white rounded-2xl text-xs font-black shadow-md shadow-rose-100 hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                            >
                                이슈 칸반으로 이동 <ArrowRight size={14}/>
                            </button>
                        </div>
                    )}

                    {event.type === 'milestone' && (
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                            <button 
                                onClick={() => window.location.href='/project/management'}
                                className="w-full py-3 bg-amber-500 text-white rounded-2xl text-xs font-black shadow-md shadow-amber-100 hover:bg-amber-600 transition-all flex items-center justify-center gap-2"
                            >
                                프로젝트 관리로 이동 <ArrowRight size={14}/>
                            </button>
                        </div>
                    )}

                    {event.type === 'task' && (
                        <div className="pt-4 border-t border-slate-100 space-y-3">
                            <button 
                                onClick={() => window.location.href='/project/tasks'}
                                className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                            >
                                Task 관리로 이동 <ArrowRight size={14}/>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
