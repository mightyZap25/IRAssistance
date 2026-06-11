import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, CheckCircle2, ClipboardList, FileText, AlertCircle } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

export default function QAStandardSetupModal({ part, isOpen, onClose, onSave }) {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        isTarget: false,
        useDocument: false,
        inspectionItems: [] // { id, name, standard }
    });

    useEffect(() => {
        if (isOpen && part) {
            fetchSettings();
        }
    }, [isOpen, part]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, 'qa_target_parts', part.id);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                setSettings({
                    isTarget: true,
                    useDocument: data.useDocument || false,
                    inspectionItems: data.inspectionItems || []
                });
            } else {
                setSettings({
                    isTarget: false,
                    useDocument: false,
                    inspectionItems: []
                });
            }
        } catch (err) {
            console.error("Failed to fetch QA settings:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddItem = () => {
        setSettings(prev => ({
            ...prev,
            inspectionItems: [...prev.inspectionItems, { id: Date.now(), name: '', standard: '' }]
        }));
    };

    const handleRemoveItem = (id) => {
        setSettings(prev => ({
            ...prev,
            inspectionItems: prev.inspectionItems.filter(item => item.id !== id)
        }));
    };

    const handleUpdateItem = (id, field, value) => {
        setSettings(prev => ({
            ...prev,
            inspectionItems: prev.inspectionItems.map(item => 
                item.id === id ? { ...item, [field]: value } : item
            )
        }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            if (!settings.isTarget) {
                // If not target anymore, remove from collection
                await deleteDoc(doc(db, 'qa_target_parts', part.id));
            } else {
                await setDoc(doc(db, 'qa_target_parts', part.id), {
                    partId: part.PartID || part.id,
                    partName: part.Name,
                    spec: part.Spec || '',
                    useDocument: settings.useDocument,
                    inspectionItems: settings.inspectionItems,
                    updatedAt: new Date()
                });
            }
            onSave();
            onClose();
        } catch (err) {
            alert("저장 실패: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-teal-600 rounded-2xl shadow-lg shadow-teal-100">
                            <ShieldCheck className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">품질 검사 기준 설정</h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5">[{part?.PartID}] {part?.Name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* Status Toggle */}
                    <div className="flex items-center justify-between p-6 bg-teal-50/50 rounded-[2rem] border border-teal-100">
                        <div>
                            <h4 className="font-black text-teal-900">수입검사 대상 여부</h4>
                            <p className="text-xs text-teal-600 font-bold mt-1">이 품목을 입고 시 품질 검사 목록에 노출합니다.</p>
                        </div>
                        <button 
                            onClick={() => setSettings(p => ({ ...p, isTarget: !p.isTarget }))}
                            className={`px-6 py-2.5 rounded-2xl text-sm font-black transition-all border-2 ${settings.isTarget ? 'bg-teal-600 border-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                        >
                            {settings.isTarget ? '✓ 검사 대상' : '미대상'}
                        </button>
                    </div>

                    {settings.isTarget && (
                        <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
                            {/* Document Replacement Option */}
                            <label className="flex items-start gap-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-200 cursor-pointer group hover:bg-white hover:border-teal-200 transition-all">
                                <input 
                                    type="checkbox" 
                                    checked={settings.useDocument}
                                    onChange={e => setSettings(p => ({ ...p, useDocument: e.target.checked }))}
                                    className="w-5 h-5 mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                />
                                <div>
                                    <h4 className="font-black text-slate-800 flex items-center gap-2">
                                        <FileText size={18} className="text-blue-500" /> 도면 또는 Datasheet로 대체
                                    </h4>
                                    <p className="text-xs text-slate-500 font-bold mt-1">개별 검사 항목을 작성하지 않고 첨부된 도면/스펙시트를 기준으로 검사합니다.</p>
                                </div>
                            </label>

                            {!settings.useDocument && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-2">
                                        <h4 className="font-black text-slate-800 flex items-center gap-2">
                                            <ClipboardList size={18} className="text-teal-600" /> 세부 검사항목 설정
                                        </h4>
                                        <button 
                                            onClick={handleAddItem}
                                            className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-xl text-xs font-black transition-all"
                                        >
                                            <Plus size={14} /> 항목 추가
                                        </button>
                                    </div>

                                    {settings.inspectionItems.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300 text-slate-400">
                                            <AlertCircle size={32} className="mb-2 opacity-20" />
                                            <p className="text-xs font-bold">등록된 검사항목이 없습니다.</p>
                                            <p className="text-[10px] mt-1 italic">치수, 외관, 기능 등 검사할 내용을 입력하세요.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {settings.inspectionItems.map((item, index) => (
                                                <div key={item.id} className="flex gap-3 group animate-in slide-in-from-left-2" style={{ animationDelay: `${index * 50}ms` }}>
                                                    <div className="flex-1 grid grid-cols-2 gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-sm focus-within:border-teal-400 transition-all">
                                                        <div>
                                                            <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">검사항목</label>
                                                            <input 
                                                                type="text" 
                                                                placeholder="예: 전체 길이" 
                                                                value={item.name}
                                                                onChange={e => handleUpdateItem(item.id, 'name', e.target.value)}
                                                                className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none"
                                                            />
                                                        </div>
                                                        <div className="border-l border-slate-100 pl-3">
                                                            <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">기준 데이터값</label>
                                                            <input 
                                                                type="text" 
                                                                placeholder="예: 100mm ± 0.5" 
                                                                value={item.standard}
                                                                onChange={e => handleUpdateItem(item.id, 'standard', e.target.value)}
                                                                className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all h-fit self-center"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white border border-slate-200 text-slate-500 font-black text-xs rounded-2xl hover:bg-slate-50 transition-all uppercase tracking-wider"
                    >
                        취소
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="px-10 py-2.5 bg-slate-900 text-white font-black text-xs rounded-2xl shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? '저장 중...' : <><CheckCircle2 size={16} /> 설정 저장하기</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
