import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where } from '../firebase';
import { db } from '../firebase';
import { ShoppingCart, Plus, X, AlertCircle, Trash2, Info } from 'lucide-react';

const CreatePOModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [vendors, setVendors] = useState([]);
    const [parts, setParts] = useState([]);
    const [ecnNotes, setEcnNotes] = useState({}); // ecnNotes[PartID] = Reason
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        VendorID: '',
        VendorName: '',
        Items: [],
        DueDate: '',
        Urgent: false,
        HideRevisionInEmail: false
    });

    useEffect(() => {
        if (isOpen) {
            fetchDependencies();
            if (initialData) {
                // Backward compatibility: If old data has single PartID instead of Items
                let initialItems = initialData.Items || [];
                if (initialItems.length === 0 && initialData.PartID) {
                    initialItems = [{
                        id: Date.now().toString(),
                        PartID: initialData.PartID,
                        PartName: initialData.PartName,
                        BasePartID: getBaseID({ PartID: initialData.PartID }),
                        Qty: initialData.Qty || 0,
                        UnitPrice: initialData.UnitPrice || 0,
                        ReceivedQty: initialData.ReceivedQty || 0
                    }];
                }

                setFormData({
                    ...initialData,
                    Items: initialItems,
                    HideRevisionInEmail: initialData.HideRevisionInEmail || false
                });
            } else {
                setFormData({
                    VendorID: '', VendorName: '', 
                    Items: [createEmptyItem()], 
                    DueDate: '', Urgent: false, HideRevisionInEmail: false
                });
            }
        }
    }, [isOpen, initialData]);

    const getBaseID = (p) => {
        if (!p) return '';
        if (p.MasterPartID) return p.MasterPartID;
        if (p.PartID && p.PartID.includes('-')) {
            const parts = p.PartID.split('-');
            if (!isNaN(parseFloat(parts[parts.length - 1]))) {
                return parts.slice(0, -1).join('-');
            }
        }
        return p.PartID || '';
    };

    const fetchDependencies = async () => {
        const vSnap = await getDocs(query(collection(db, 'vendors'), orderBy('Name', 'asc')));
        const pSnap = await getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc')));
        
        const loadedParts = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVendors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setParts(loadedParts);

        // Fetch all ECNs and build a dictionary of PartID -> Reason
        const eSnap = await getDocs(query(collection(db, 'ecns')));
        const notes = {};
        eSnap.forEach(d => {
            const data = d.data();
            // Try to map to specific PartID
            if (data.PartID) {
                notes[data.PartID] = data.Reason;
            } else if (data.MasterPartID && data.Rev) {
                // If PartID isn't perfectly matched, we'll just try to guess the PartID format
                const guessedPartID = `${data.MasterPartID}-${data.Rev}`;
                notes[guessedPartID] = data.Reason;
            }
        });
        setEcnNotes(notes);
    };

    const createEmptyItem = () => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        BasePartID: '',
        PartID: '',
        PartName: '',
        Qty: 1,
        UnitPrice: 0,
        ReceivedQty: 0
    });

    const handleVendorChange = (e) => {
        const v = vendors.find(x => x.id === e.target.value);
        setFormData(prev => ({ ...prev, VendorID: v?.id || '', VendorName: v?.Name || '' }));
    };

    const handleAddItem = () => {
        setFormData(prev => ({ ...prev, Items: [...prev.Items, createEmptyItem()] }));
    };

    const handleRemoveItem = (itemId) => {
        setFormData(prev => ({ ...prev, Items: prev.Items.filter(i => i.id !== itemId) }));
    };

    const updateItem = (itemId, field, value) => {
        setFormData(prev => {
            const newItems = prev.Items.map(item => {
                if (item.id !== itemId) return item;
                const updated = { ...item, [field]: value };
                
                // If BasePartID changes, auto-select the latest revision
                if (field === 'BasePartID') {
                    const latest = parts.find(p => getBaseID(p) === value && p.IsLatestRevision !== false);
                    if (latest) {
                        updated.PartID = latest.id;
                        updated.PartName = latest.Name;
                    } else {
                        updated.PartID = '';
                        updated.PartName = '';
                    }
                }
                
                // If PartID changes (User picked a specific revision)
                if (field === 'PartID') {
                    const selected = parts.find(p => p.id === value);
                    if (selected) {
                        updated.PartName = selected.Name;
                    }
                }

                return updated;
            });
            return { ...prev, Items: newItems };
        });
    };

    const latestParts = parts.filter(p => p.IsLatestRevision !== false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.VendorID) return alert('공급업체를 선택해주세요.');
        if (formData.Items.length === 0) return alert('발주할 품목을 1개 이상 추가해주세요.');
        
        // Validation
        for (const item of formData.Items) {
            if (!item.PartID || item.Qty <= 0) {
                return alert('모든 품목의 부품이 선택되어야 하며, 수량은 1 이상이어야 합니다.');
            }
        }
        
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Failed to create PO:', error);
            alert('발주 생성 실패');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const totalPrice = formData.Items.reduce((acc, item) => acc + (item.Qty * item.UnitPrice), 0);

    const modalContent = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-5xl shadow-xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh]">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50 shrink-0 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <ShoppingCart size={24} className="text-indigo-600" />
                            {initialData ? '발주서 수정' : '신규 발주서 (Purchase Order) 생성'}
                        </h2>
                        <p className="text-sm font-bold text-slate-500 mt-1">공급사별 다중 품목을 한 번에 발주합니다.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 shadow-sm border border-slate-200"><X size={20} /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
                    <div className="p-5 space-y-6 flex-1">
                        
                        {/* 1. Basic Info */}
                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-2 col-span-1">
                                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">공급업체 (Vendor) <span className="text-rose-500">*</span></label>
                                <select value={formData.VendorID} onChange={handleVendorChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" required>
                                    <option value="">업체를 선택하세요</option>
                                    {vendors.map(v => <option key={v.id} value={v.id}>{v.Name} ({v.Category})</option>)}
                                </select>
                            </div>
                            <div className="space-y-2 col-span-1">
                                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">납기 예정일 (Due Date) <span className="text-rose-500">*</span></label>
                                <input type="date" value={formData.DueDate} onChange={e => setFormData(prev => ({ ...prev, DueDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" required />
                            </div>
                            <div className="space-y-2 col-span-1 flex flex-col justify-center gap-3 pt-6 pl-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={formData.Urgent} onChange={e => setFormData(prev => ({ ...prev, Urgent: e.target.checked }))} className="w-5 h-5 rounded text-rose-500 focus:ring-rose-500 border-slate-300" />
                                    <span className="text-sm font-black text-rose-600 flex items-center gap-1"><AlertCircle size={16}/> 긴급 발주 (Urgent)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer" title="공급업체로 발송되는 이메일 본문에서 리비전 버전을 노출하지 않습니다.">
                                    <input type="checkbox" checked={formData.HideRevisionInEmail} onChange={e => setFormData(prev => ({ ...prev, HideRevisionInEmail: e.target.checked }))} className="w-5 h-5 rounded text-indigo-500 focus:ring-indigo-500 border-slate-300" />
                                    <span className="text-sm font-bold text-slate-700">이메일 발송 시 리비전 숨기기</span>
                                </label>
                            </div>
                        </div>

                        <hr className="border-slate-100" />

                        {/* 2. Items List */}
                        <div>
                            <div className="flex justify-between items-end mb-4">
                                <h3 className="text-sm font-black text-slate-900">발주 품목 리스트</h3>
                                <button type="button" onClick={handleAddItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-black transition-colors">
                                    <Plus size={14} /> 품목 추가
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formData.Items.map((item, index) => {
                                    const availableRevisions = parts.filter(p => getBaseID(p) === item.BasePartID).sort((a, b) => b.Rev?.localeCompare(a.Rev) || 0);
                                    
                                    return (
                                        <div key={item.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm relative group">
                                            <div className="w-8 flex-shrink-0 flex items-center justify-center pt-3">
                                                <span className="text-xs font-black text-slate-400">{index + 1}</span>
                                            </div>
                                            
                                            <div className="flex-1 grid grid-cols-12 gap-3">
                                                <div className="col-span-4">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">부품 (Base Part)</label>
                                                    <select value={item.BasePartID} onChange={e => updateItem(item.id, 'BasePartID', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" required>
                                                        <option value="">품목 선택...</option>
                                                        {latestParts.map(p => {
                                                            const baseID = getBaseID(p);
                                                            return <option key={baseID} value={baseID}>[{baseID}] {p.Name}</option>;
                                                        })}
                                                    </select>
                                                </div>

                                                <div className="col-span-3">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">리비전 (Revision)</label>
                                                    <select 
                                                        value={item.PartID} 
                                                        onChange={e => updateItem(item.id, 'PartID', e.target.value)} 
                                                        disabled={!item.BasePartID}
                                                        className={`w-full border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 ${!item.BasePartID ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-white border-slate-200 text-slate-900'}`}
                                                        required
                                                    >
                                                        {!item.BasePartID && <option value="">-</option>}
                                                        {item.BasePartID && availableRevisions.map(p => (
                                                            <option key={p.id} value={p.id}>
                                                                Rev {p.Rev || '1.0'} {p.IsLatestRevision !== false ? '(최신)' : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="col-span-2">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">수량 (Qty)</label>
                                                    <input type="number" min="1" value={item.Qty} onChange={e => updateItem(item.id, 'Qty', parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" required />
                                                </div>

                                                <div className="col-span-3">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">단가 (Price ₩)</label>
                                                    <input type="number" min="0" value={item.UnitPrice} onChange={e => updateItem(item.id, 'UnitPrice', parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                                                </div>

                                                {/* ECN Note display row */}
                                                {item.PartID && ecnNotes[item.PartID] && (
                                                    <div className="col-span-12 mt-1 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex gap-2">
                                                        <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-amber-800 font-medium">
                                                            <strong className="font-bold">리비전 사유:</strong> {ecnNotes[item.PartID]}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="pt-5 pr-1">
                                                <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" disabled={formData.Items.length <= 1}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">총 발주 금액 (Total Amount)</p>
                            <p className="text-2xl font-black text-indigo-700">₩ {totalPrice.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl text-sm font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 shadow-sm transition-colors">취소</button>
                            <button type="submit" disabled={loading} className="px-8 py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2 transition-transform hover:scale-105">
                                {loading ? '처리중...' : (initialData ? '발주서 수정 내역 저장' : '발주 신청 진행')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default CreatePOModal;
