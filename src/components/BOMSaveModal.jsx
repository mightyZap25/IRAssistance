import React, { useState } from 'react';
import { X, AlertCircle, Save, FileText } from 'lucide-react';

export default function BOMSaveModal({ isOpen, onSave, onClose, title = "Save ECN", subTitle = "Data Modification Notification", changes = [] }) {
    const [reason, setReason] = useState('');
    const [updateType, setUpdateType] = useState('Simple Update');

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!reason.trim()) {
            alert("수정 사유를 입력해주세요.");
            return;
        }
        onSave({ reason, updateType, changes });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                            <Save size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 italic tracking-tight">{title}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subTitle}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {/* Changes Detected */}
                    {changes.length > 0 && (
                        <div className="space-y-2 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                                <AlertCircle size={12} /> Detailed Changes
                            </label>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                                {changes.map((change, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-[11px] font-bold text-slate-700 leading-tight">
                                        <div className="w-1 h-1 bg-blue-400 rounded-full mt-1.5 shrink-0"></div>
                                        {change}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reason */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            Modification Reason <span className="text-red-500">*Required</span>
                        </label>
                        <textarea
                            autoFocus
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="변경 사유를 상세히 적어주세요..."
                            className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none resize-none"
                        />
                    </div>

                    {/* Type selection */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Update Type</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setUpdateType('Simple Update')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${updateType === 'Simple Update' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${updateType === 'Simple Update' ? 'bg-emerald-500 text-white' : 'bg-slate-100'}`}>
                                    <FileText size={16} />
                                </div>
                                <span className="text-xs font-black">Simple Update</span>
                                <span className="text-[9px] font-bold opacity-60">Automatic Approval</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setUpdateType('ECN')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${updateType === 'ECN' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${updateType === 'ECN' ? 'bg-amber-500 text-white' : 'bg-slate-100'}`}>
                                    <AlertCircle size={16} />
                                </div>
                                <span className="text-xs font-black">Regular ECN</span>
                                <span className="text-[9px] font-bold opacity-60">Requires Review</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-3 px-4 border-2 border-slate-200 text-slate-400 font-black rounded-2xl hover:bg-slate-200/50 hover:text-slate-600 transition-all uppercase text-xs tracking-widest">
                        Cancel
                    </button>
                    <button type="button" onClick={handleConfirm} className="flex-[2] py-3 px-4 bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                        <Save size={16} /> Confirm & Save
                    </button>
                </div>
            </div>
        </div>
    );
}
