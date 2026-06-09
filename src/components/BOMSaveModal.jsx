import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, Save, FileText, CheckCircle2, Info } from 'lucide-react';

export default function BOMSaveModal({ 
    isOpen, 
    onSave, 
    onClose, 
    title = "BOM 변경 사항 저장", 
    subTitle = "Engineering Change Notification (ECN) Draft", 
    changes = [] 
}) {
    const [reason, setReason] = useState('');
    const [updateType, setUpdateType] = useState('Simple Update');

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setReason('');
            setUpdateType('Simple Update');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!reason.trim()) {
            alert("변경 사유를 입력해주세요.");
            return;
        }
        onSave({ reason, updateType, changes });
    };

    const modalContent = (
        <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-300"
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
        >
            <div className="bg-white/90 backdrop-blur-2xl w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/40 overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Decorative Background Element */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

                {/* Header */}
                <div className="relative px-10 pt-10 pb-6 flex justify-between items-start">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-blue-200 ring-4 ring-blue-50">
                            <Save size={28} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{title}</h2>
                            <p className="text-[11px] font-black text-blue-500/60 uppercase tracking-[0.2em] mt-1">{subTitle}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-all">
                        <X size={24} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="px-10 pb-10 space-y-8 relative">
                    {/* Changes Detected Section */}
                    {changes.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                <Info size={14} className="text-blue-500" /> 감지된 변경 내역 ({changes.length})
                            </label>
                            <div className="bg-slate-50/50 border border-slate-100 rounded-[1.5rem] p-4 max-h-40 overflow-y-auto custom-scrollbar shadow-inner">
                                <div className="space-y-2">
                                    {changes.map((change, idx) => (
                                        <div key={idx} className="flex items-start gap-3 text-xs font-bold text-slate-600 bg-white/60 p-2.5 rounded-xl border border-white">
                                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                                change.startsWith('ADDED') ? 'bg-emerald-500' : 
                                                change.startsWith('REMOVED') ? 'bg-rose-500' : 'bg-amber-500'
                                            }`}></div>
                                            {change}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Modification Reason */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex justify-between px-1">
                            변경 사유 (Modification Reason) <span className="text-rose-500 text-[10px]">*필수 입력</span>
                        </label>
                        <textarea
                            autoFocus
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                            onKeyUp={e => e.stopPropagation()}
                            onKeyPress={e => e.stopPropagation()}
                            placeholder="이번 BOM 수정의 배경과 구체적인 변경 사유를 입력해주세요..."
                            className="w-full h-32 bg-slate-50 border border-slate-200 rounded-[1.5rem] p-5 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white transition-all outline-none resize-none shadow-inner"
                        />
                    </div>

                    {/* Update Type Selection */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">업데이트 유형 선택</label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setUpdateType('Simple Update')}
                                className={`group flex flex-col items-center gap-3 p-5 rounded-[2rem] border-2 transition-all relative overflow-hidden ${
                                    updateType === 'Simple Update' 
                                    ? 'border-emerald-500 bg-emerald-50/50 shadow-lg shadow-emerald-100 text-emerald-800' 
                                    : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200 hover:bg-white'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${updateType === 'Simple Update' ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-200' : 'bg-white text-slate-300'}`}>
                                    <FileText size={20} />
                                </div>
                                <div className="text-center">
                                    <span className="text-xs font-black block">단순 업데이트</span>
                                    <span className="text-[9px] font-bold opacity-60 uppercase tracking-tighter mt-0.5 block">Auto Approval</span>
                                </div>
                                {updateType === 'Simple Update' && <CheckCircle2 size={16} className="absolute top-3 right-3 text-emerald-500" />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setUpdateType('ECN')}
                                className={`group flex flex-col items-center gap-3 p-5 rounded-[2rem] border-2 transition-all relative overflow-hidden ${
                                    updateType === 'ECN' 
                                    ? 'border-amber-500 bg-amber-50/50 shadow-lg shadow-amber-100 text-amber-800' 
                                    : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200 hover:bg-white'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${updateType === 'ECN' ? 'bg-amber-500 text-white scale-110 shadow-lg shadow-amber-200' : 'bg-white text-slate-300'}`}>
                                    <AlertCircle size={20} />
                                </div>
                                <div className="text-center">
                                    <span className="text-xs font-black block">정식 ECN 기안</span>
                                    <span className="text-[9px] font-bold opacity-60 uppercase tracking-tighter mt-0.5 block">Review Required</span>
                                </div>
                                {updateType === 'ECN' && <CheckCircle2 size={16} className="absolute top-3 right-3 text-amber-500" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-10 py-8 bg-slate-50/80 border-t border-slate-100 flex gap-4">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-500 font-black rounded-3xl hover:bg-white hover:text-slate-700 transition-all uppercase text-[11px] tracking-widest shadow-sm"
                    >
                        취소 (Cancel)
                    </button>
                    <button 
                        type="button" 
                        onClick={handleConfirm} 
                        className="flex-[1.5] py-4 px-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 group active:scale-95"
                    >
                        <Save size={18} className="group-hover:scale-110 transition-transform" /> 최종 승인 및 저장
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
