import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where } from '../database';
import { db } from '../database';
import { ShoppingCart, Plus, X, AlertCircle, Trash2, Info, Package, ArrowRight, Settings, ClipboardList } from 'lucide-react';
import { productionService } from '../services/productionService';

const CreateOutsourcingModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [vendors, setVendors] = useState([]);
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        VendorID: '',
        VendorName: '',
        TargetPartID: '',    // 받을 물품 (가공 완료품)
        TargetPartName: '',
        TargetQty: 1,
        UnitPrice: 0,        // 가공비 (공임)
        Materials: [],       // 보낼 물품 (우리 자재)
        DueDate: '',
        Urgent: false,
        Status: 'DRAFT',
        Type: 'OUTSOURCING'
    });

    useEffect(() => {
        if (isOpen) {
            fetchDependencies();
            if (initialData) setFormData(initialData);
            else resetForm();
        }
    }, [isOpen, initialData]);

    const resetForm = () => {
        setFormData({
            VendorID: '', VendorName: '', TargetPartID: '', TargetPartName: '',
            TargetQty: 1, UnitPrice: 0, Materials: [], DueDate: '', Urgent: false,
            Status: 'DRAFT', Type: 'OUTSOURCING'
        });
    };

    const fetchDependencies = async () => {
        const vSnap = await getDocs(query(collection(db, 'vendors'), where('Category', '==', '외주가공'), orderBy('Name', 'asc')));
        const pSnap = await getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc')));
        setVendors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    // 받을 물품 선택 시 보낼 물품 자동 산출
    const handleTargetPartChange = async (partID) => {
        const selected = parts.find(p => p.id === partID);
        if (!selected) return;

        setLoading(true);
        try {
            const materials = await productionService.getOutsourcingMaterials(partID, formData.TargetQty, db);
            setFormData(prev => ({
                ...prev,
                TargetPartID: partID,
                TargetPartName: selected.Name,
                UnitPrice: selected.UnitPrice || 0,
                Materials: materials
            }));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    // 수량 변경 시 보낼 물품 수량 동기화
    const handleQtyChange = (qty) => {
        const newQty = parseInt(qty) || 0;
        setFormData(prev => ({
            ...prev,
            TargetQty: newQty,
            Materials: prev.Materials.map(m => ({
                ...m,
                Quantity: (m.Quantity / (prev.TargetQty || 1)) * newQty
            }))
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.VendorID || !formData.TargetPartID) return alert('필수 정보를 입력해주세요.');
        
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-5xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] overflow-hidden text-left">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <Settings size={28} className="text-indigo-600" />
                            신규 외주 가공 의뢰
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest text-left">Outsourcing & Sub-Processing Request</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-8 grid grid-cols-12 gap-8 text-left">
                        {/* Left: Target & Fee */}
                        <div className="col-span-5 space-y-6 text-left">
                            <section className="bg-indigo-50/50 rounded-[24px] p-6 border border-indigo-100/50 space-y-5">
                                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Package size={14}/> 1. 의뢰 정보 (받을 물품)
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">외주 가공 업체</label>
                                        <select value={formData.VendorID} onChange={e => setFormData({...formData, VendorID: e.target.value, VendorName: vendors.find(v => v.id === e.target.value)?.Name})} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required>
                                            <option value="">업체 선택...</option>
                                            {vendors.map(v => <option key={v.id} value={v.id}>{v.Name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">가공 완료 품목 (가공 후 입고될 제품)</label>
                                        <select value={formData.TargetPartID} onChange={e => handleTargetPartChange(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required>
                                            <option value="">품목 선택...</option>
                                            {parts.map(p => <option key={p.id} value={p.id}>[{p.id}] {p.Name}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">의뢰 수량</label>
                                            <input type="number" min="1" value={formData.TargetQty} onChange={e => handleQtyChange(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">개당 가공비 (공임)</label>
                                            <input type="number" min="0" value={formData.UnitPrice} onChange={e => setFormData({...formData, UnitPrice: parseInt(e.target.value) || 0})} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">납기 요청일</label>
                                        <input type="date" value={formData.DueDate} onChange={e => setFormData({...formData, DueDate: e.target.value})} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Right: Materials to Send */}
                        <div className="col-span-7 space-y-6">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <ClipboardList size={18} className="text-rose-500"/> 2. 사급 자재 정보 (업체로 보낼 물품)
                                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2">AUTO-CALCULATED FROM BOM</span>
                            </h3>
                            
                            <div className="space-y-3 min-h-[300px]">
                                {formData.Materials.map((m, idx) => (
                                    <div key={idx} className="bg-white border-2 border-slate-100 rounded-2xl p-5 flex items-center justify-between group hover:border-rose-100 transition-all shadow-sm">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0"><ArrowRight size={18}/></div>
                                            <div className="min-w-0 flex-1 text-left">
                                                <p className="text-xs font-black text-slate-400 mb-0.5">ITEM {idx + 1}</p>
                                                <p className="text-sm font-black text-slate-800 truncate">{m.PartName}</p>
                                                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">[{m.PartID}]</p>
                                            </div>
                                        </div>
                                        <div className="text-right ml-4">
                                            <p className="text-[10px] font-black text-slate-400 uppercase">보낼 수량</p>
                                            <p className="text-base font-black text-rose-600">{m.Quantity.toLocaleString()} {m.Unit}</p>
                                        </div>
                                    </div>
                                ))}
                                {formData.Materials.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[32px] py-24 text-slate-300">
                                        <Info size={48} className="mb-4 opacity-20"/>
                                        <p className="font-black uppercase tracking-widest text-xs">품목을 선택하면 필요한 자재가 자동으로 표시됩니다</p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-rose-50 rounded-2xl p-5 border border-rose-100 flex gap-4">
                                <AlertCircle size={20} className="text-rose-500 shrink-0"/>
                                <div>
                                    <p className="text-xs font-black text-rose-700">자재 차감 안내</p>
                                    <p className="text-[10px] font-bold text-rose-600 leading-relaxed mt-1">
                                        결재 승인 후 '자재 출고' 버튼을 누르면 위 리스트의 물품들이 우리 창고 재고에서 실제 차감됩니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 예상 공임 (가공비)</p>
                        <p className="text-3xl font-black text-indigo-700">₩ {(formData.TargetQty * formData.UnitPrice).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-4">
                        <button type="button" onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                        <button onClick={handleSubmit} disabled={loading || !formData.TargetPartID} className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all disabled:opacity-50">
                            {loading ? '처리 중...' : '외주 의뢰 기안 시작'}
                        </button>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
};

export default CreateOutsourcingModal;
