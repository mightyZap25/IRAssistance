import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Factory, X, AlertCircle } from 'lucide-react';

const CreateOutsourcingModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [vendors, setVendors] = useState([]);
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        VendorID: '',
        VendorName: '',
        PartID: '',
        PartName: '',
        Qty: 0,
        UnitPrice: 0,
        DueDate: '',
        Urgent: false
    });

    useEffect(() => {
        if (isOpen) {
            fetchDependencies();
            if (initialData) {
                setFormData(initialData);
            } else {
                setFormData({
                    VendorID: '', VendorName: '', PartID: '', PartName: '', Qty: 0, UnitPrice: 0, DueDate: '', Urgent: false
                });
            }
        }
    }, [isOpen, initialData]);

    const fetchDependencies = async () => {
        try {
            // 외주가공 업체만 필터링
            const vSnap = await getDocs(query(collection(db, 'vendors'), where('Category', '==', '외주가공')));
            const pSnap = await getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc')));
            
            const vendorList = vSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.Name.localeCompare(b.Name));
            setVendors(vendorList);
            setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Error fetching dependencies:", error);
        }
    };

    const handleVendorChange = (e) => {
        const v = vendors.find(x => x.id === e.target.value);
        setFormData(prev => ({ ...prev, VendorID: v?.id || '', VendorName: v?.Name || '' }));
    };

    const handlePartChange = (e) => {
        const basePartID = e.target.value;
        const latest = parts.find(p => getBaseID(p) === basePartID && p.IsLatestRevision !== false);
        if (latest) {
            setFormData(prev => ({ ...prev, PartID: latest.id, PartName: latest.Name }));
        } else {
            setFormData(prev => ({ ...prev, PartID: '', PartName: '' }));
        }
    };

    const getBaseID = (p) => {
        if (!p) return '';
        if (p.MasterPartID) return p.MasterPartID;
        if (p.PartID && p.PartID.includes('-')) {
            const partsList = p.PartID.split('-');
            if (!isNaN(parseFloat(partsList[partsList.length - 1]))) {
                return partsList.slice(0, -1).join('-');
            }
        }
        return p.PartID || '';
    };

    const latestParts = parts.filter(p => p.IsLatestRevision !== false);
    const currentSelectedPart = parts.find(p => p.id === formData.PartID);
    const currentBasePartID = getBaseID(currentSelectedPart);
    const availableRevisions = parts.filter(p => getBaseID(p) === currentBasePartID).sort((a, b) => b.Rev?.localeCompare(a.Rev) || 0);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.VendorID || !formData.PartID || formData.Qty <= 0) return alert('필수 항목을 모두 올바르게 입력해주세요.');
        
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Failed to create Outsourcing order:', error);
            alert('외주 발주 생성 실패');
        } finally {
            setLoading(false);
        }
    };

    const modalContent = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Factory size={20} className="text-blue-600" />
                            {initialData ? '외주 발주서 수정' : '신규 외주 발주 (Outsource Order)'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 shadow-sm border border-slate-200"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">외주가공 업체 (Vendor) <span className="text-rose-500">*</span></label>
                            <select value={formData.VendorID} onChange={handleVendorChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" required>
                                <option value="">업체를 선택하세요</option>
                                {vendors.map(v => <option key={v.id} value={v.id}>{v.Name} ({v.Category})</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">생산 대상 품목 (Part) <span className="text-rose-500">*</span></label>
                            <select value={currentBasePartID} onChange={handlePartChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" required>
                                <option value="">품목을 선택하세요</option>
                                {latestParts.map(p => {
                                    const baseID = getBaseID(p);
                                    return <option key={baseID} value={baseID}>[{baseID}] {p.Name}</option>;
                                })}
                            </select>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">품목 리비전 (Revision) <span className="text-rose-500">*</span></label>
                            <select 
                                value={formData.PartID} 
                                onChange={e => {
                                    const p = parts.find(x => x.id === e.target.value);
                                    if (p) setFormData(prev => ({ ...prev, PartID: p.id, PartName: p.Name }));
                                }} 
                                disabled={!currentBasePartID}
                                className={`w-full border rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all ${!currentBasePartID ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-50/30 border-slate-200 text-blue-900'}`}
                                required
                            >
                                {!currentBasePartID && <option value="">품목을 먼저 선택하세요</option>}
                                {currentBasePartID && availableRevisions.map(p => (
                                    <option key={p.id} value={p.id}>
                                        Rev {p.Rev || '1.0'} {p.IsLatestRevision !== false ? '(최신 버전)' : '(구버전)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">외주 수량 (Quantity) <span className="text-rose-500">*</span></label>
                            <input type="number" min="1" value={formData.Qty} onChange={e => setFormData(prev => ({ ...prev, Qty: parseInt(e.target.value) || 0 }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">외주 단가 (Unit Price ₩)</label>
                            <input type="number" min="0" value={formData.UnitPrice} onChange={e => setFormData(prev => ({ ...prev, UnitPrice: parseInt(e.target.value) || 0 }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">납기 예정일 (Due Date)</label>
                            <input type="date" value={formData.DueDate} onChange={e => setFormData(prev => ({ ...prev, DueDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>
                        <div className="space-y-1.5 flex items-center pt-6 pl-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={formData.Urgent} onChange={e => setFormData(prev => ({ ...prev, Urgent: e.target.checked }))} className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 border-slate-300" />
                                <span className="text-sm font-bold text-rose-600 flex items-center gap-1"><AlertCircle size={14}/> 긴급 (Urgent)</span>
                            </label>
                        </div>
                    </div>
                    <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 mt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200">취소</button>
                        <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 flex items-center gap-2">
                            {loading ? '처리중...' : (initialData ? '수정 사항 저장' : '발주서 전송')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default CreateOutsourcingModal;
