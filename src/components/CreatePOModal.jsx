import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where } from '../firebase';
import { db } from '../firebase';
import { ShoppingCart, Plus, X, AlertCircle, Trash2, Info, Calendar, Search, Package, Factory, TrendingDown, ClipboardList } from 'lucide-react';
import { productionService } from '../services/productionService';

const CreatePOModal = ({ isOpen, onClose, onSave, initialData }) => {
    const [vendors, setVendors] = useState([]);
    const [parts, setParts] = useState([]);
    const [ecnNotes, setEcnNotes] = useState({});
    const [loading, setLoading] = useState(false);
    
    // 완제품 생산 소요량 산출을 위한 상태
    const [targetFG, setTargetFG] = useState({ id: '', qty: 1 });
    
    const [formData, setFormData] = useState({
        VendorID: '',
        VendorName: '',
        Items: [],
        DueDate: '',
        Urgent: false,
        HideRevisionInEmail: false,
        Type: 'PURCHASE', // 'PURCHASE' or 'OUTSOURCING'
        Status: 'DRAFT'
    });

    const [editingSplitId, setEditingSplitId] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setEditingSplitId(null);
            fetchDependencies();
            if (initialData) {
                setFormData({
                    ...initialData,
                    Items: initialData.Items || [],
                    HideRevisionInEmail: initialData.HideRevisionInEmail || false
                });
            } else {
                setFormData({
                    VendorID: '', VendorName: '', 
                    Items: [createEmptyItem()], 
                    DueDate: '', Urgent: false, HideRevisionInEmail: false,
                    Type: 'PURCHASE', Status: 'DRAFT'
                });
            }
        }
    }, [isOpen, initialData]);

    const fetchDependencies = async () => {
        const vSnap = await getDocs(query(collection(db, 'vendors'), orderBy('Name', 'asc')));
        const pSnap = await getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc')));
        const eSnap = await getDocs(query(collection(db, 'ecns')));
        
        const loadedParts = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setVendors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setParts(loadedParts);

        const notes = {};
        eSnap.forEach(d => {
            const data = d.data();
            if (data.PartID) notes[data.PartID] = data.Reason;
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
        ReceivedQty: 0,
        Schedules: [{ id: Date.now(), date: formData.DueDate || '', qty: 1 }]
    });

    // ─────────────────────────────────────────────────────────────
    // 고도화 기능: 부족 재고 및 BOM 소요량 불러오기
    // ─────────────────────────────────────────────────────────────
    
    // 1. 부족 재고(안전재고 미달) 임포트
    const handleImportShortages = async () => {
        if (!formData.VendorID) return alert('먼저 공급업체를 선택해주세요. 해당 업체 품목만 불러옵니다.');
        setLoading(true);
        try {
            const shortages = await productionService.getShortageItems(db);
            // 해당 업체(VendorID) 제품만 필터링 (부품의 Maker 또는 Manufacturer 기준)
            const vendorShortages = shortages.filter(s => s.VendorID === formData.VendorID);
            
            if (vendorShortages.length === 0) {
                alert('해당 공급업체의 부족 재고가 없습니다.');
            } else {
                const newItems = vendorShortages.map(s => ({
                    ...createEmptyItem(),
                    PartID: s.PartID,
                    PartName: s.PartName,
                    BasePartID: s.PartID.split('-')[0], // 심플하게 처리
                    Qty: s.Qty,
                    UnitPrice: s.UnitPrice
                }));
                setFormData(prev => ({ ...prev, Items: [...prev.Items.filter(i => i.PartID !== ''), ...newItems] }));
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    // 2. 완제품 생산을 위한 필요 자재 산출
    const handleCalculateBOM = async () => {
        if (!targetFG.id) return alert('완제품을 선택해주세요.');
        if (!formData.VendorID) return alert('먼저 공급업체를 선택해주세요.');
        
        setLoading(true);
        try {
            const needs = await productionService.calculatePurchaseNeeds(targetFG.id, targetFG.qty, db);
            const vendorNeeds = needs.filter(n => n.VendorID === formData.VendorID);

            if (vendorNeeds.length === 0) {
                alert('해당 공급업체에서 구매해야 할 자재가 없습니다. (타 업체 품목이거나 재고 충분)');
            } else {
                const newItems = vendorNeeds.map(n => ({
                    ...createEmptyItem(),
                    PartID: n.PartID,
                    PartName: n.PartName,
                    BasePartID: n.PartID.split('-')[0],
                    Qty: n.Qty,
                    UnitPrice: n.UnitPrice
                }));
                setFormData(prev => ({ ...prev, Items: [...prev.Items.filter(i => i.PartID !== ''), ...newItems] }));
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleVendorChange = (e) => {
        const v = vendors.find(x => x.id === e.target.value);
        setFormData(prev => ({ ...prev, VendorID: v?.id || '', VendorName: v?.Name || '', Items: [createEmptyItem()] }));
    };

    // 공급사별 부품 필터링: 선택된 Vendor가 취급하는 부품만 노출
    const filteredPartsByVendor = parts.filter(p => {
        if (!formData.VendorID) return false;
        return p.Maker === formData.VendorID || p.Manufacturer === formData.VendorID || p.VendorID === formData.VendorID;
    });

    const latestParts = filteredPartsByVendor.filter(p => p.IsLatestRevision !== false);

    const updateItem = (itemId, field, value) => {
        setFormData(prev => ({
            ...prev,
            Items: prev.Items.map(item => {
                if (item.id !== itemId) return item;
                const updated = { ...item, [field]: value };
                if (field === 'PartID') {
                    const selected = parts.find(p => p.id === value);
                    if (selected) {
                        updated.PartName = selected.Name;
                        updated.UnitPrice = selected.UnitPrice || 0;
                    }
                }
                return updated;
            })
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.VendorID) return alert('공급업체를 선택해주세요.');
        if (formData.Items.filter(i => i.PartID).length === 0) return alert('발주할 품목을 1개 이상 추가해주세요.');
        
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) { console.error(error); alert('저장 실패'); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    const totalPrice = formData.Items.reduce((acc, item) => acc + (item.Qty * item.UnitPrice), 0);

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-6xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <ShoppingCart size={28} className="text-indigo-600" />
                            {initialData ? '발주서 수정' : '신규 발주 및 견적 요청'}
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Purchasing & RFQ Management</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-8 grid grid-cols-12 gap-8">
                        
                        {/* Left: Configuration & Automation */}
                        <div className="col-span-4 space-y-6">
                            <section className="bg-indigo-50/50 rounded-[24px] p-6 border border-indigo-100/50 space-y-5">
                                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Package size={14}/> 기본 정보 설정
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">공급업체 (Vendor)</label>
                                        <select value={formData.VendorID} onChange={handleVendorChange} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required>
                                            <option value="">업체 선택...</option>
                                            {vendors.map(v => <option key={v.id} value={v.id}>{v.Name} ({v.Category})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">최종 납기 희망일</label>
                                        <input type="date" value={formData.DueDate} onChange={e => setFormData(prev => ({ ...prev, DueDate: e.target.value }))} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" required />
                                    </div>
                                    <div className="flex flex-col gap-2 pt-2">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input type="checkbox" checked={formData.Urgent} onChange={e => setFormData(prev => ({ ...prev, Urgent: e.target.checked }))} className="w-5 h-5 rounded-lg text-rose-500 focus:ring-rose-500 border-slate-300 transition-all" />
                                            <span className="text-xs font-black text-slate-600 group-hover:text-rose-600 transition-colors uppercase">긴급 발주 (Urgent)</span>
                                        </label>
                                    </div>
                                </div>
                            </section>

                            <section className="bg-emerald-50/50 rounded-[24px] p-6 border border-emerald-100/50 space-y-5">
                                <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <ClipboardList size={14}/> 스마트 소요량 산출
                                </h3>
                                <div className="space-y-4">
                                    <button type="button" onClick={handleImportShortages} disabled={!formData.VendorID || loading} className="w-full flex items-center justify-between px-5 py-4 bg-white border-2 border-emerald-100 rounded-2xl text-xs font-black text-emerald-700 hover:bg-emerald-50 transition-all shadow-sm disabled:opacity-50">
                                        <div className="flex items-center gap-3"><TrendingDown size={18}/> <span>부족 재고 일괄 추가</span></div>
                                        <Plus size={14}/>
                                    </button>
                                    
                                    <div className="pt-2 space-y-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase ml-1">완제품 생산 기준 추가</p>
                                        <div className="flex gap-2">
                                            <select 
                                                value={targetFG.id} 
                                                onChange={e => setTargetFG({...targetFG, id: e.target.value})}
                                                className="flex-1 bg-white border-2 border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                                            >
                                                <option value="">제품 선택...</option>
                                                {parts.filter(p => p.Class === 'ASSY').map(p => <option key={p.id} value={p.id}>{p.Name}</option>)}
                                            </select>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                value={targetFG.qty} 
                                                onChange={e => setTargetFG({...targetFG, qty: parseInt(e.target.value)})}
                                                className="w-16 bg-white border-2 border-slate-100 rounded-xl px-2 py-2 text-xs font-black text-center"
                                            />
                                        </div>
                                        <button type="button" onClick={handleCalculateBOM} disabled={!formData.VendorID || !targetFG.id || loading} className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl text-xs font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50">
                                            BOM 역계산 품목 추가
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Right: Items List */}
                        <div className="col-span-8 space-y-4">
                            <div className="flex justify-between items-center px-2">
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                    <ShoppingCart size={18} className="text-indigo-500"/> 발주 품목 리스트
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2">{formData.Items.length} ITEMS</span>
                                </h3>
                                <button type="button" onClick={() => setFormData(prev => ({...prev, Items: [...prev.Items, createEmptyItem()]}))} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-black transition-all shadow-md">
                                    <Plus size={14} /> 품목 직접 추가
                                </button>
                            </div>

                            <div className="space-y-3 min-h-[400px]">
                                {formData.Items.map((item, index) => (
                                    <div key={item.id} className="group bg-white border-2 border-slate-100 rounded-2xl p-4 transition-all hover:border-indigo-100 shadow-sm relative">
                                        <div className="grid grid-cols-12 gap-4 items-end">
                                            <div className="col-span-1 text-[10px] font-black text-slate-300 pt-3">{String(index + 1).padStart(2, '0')}</div>
                                            <div className="col-span-5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">품목 (해당 업체 공급 품목)</label>
                                                <select 
                                                    value={item.PartID} 
                                                    onChange={e => updateItem(item.id, 'PartID', e.target.value)} 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="">품목 선택...</option>
                                                    {(formData.VendorID ? filteredPartsByVendor : parts).map(p => (
                                                        <option key={p.id} value={p.id}>[{p.id}] {p.Name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">수량</label>
                                                <input type="number" min="1" value={item.Qty} onChange={e => updateItem(item.id, 'Qty', parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-900" />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">예상 단가 (₩)</label>
                                                <input type="number" min="0" value={item.UnitPrice} onChange={e => updateItem(item.id, 'UnitPrice', parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-900" />
                                            </div>
                                            <div className="col-span-1 flex justify-end">
                                                <button type="button" onClick={() => setFormData(prev => ({...prev, Items: prev.Items.filter(i => i.id !== item.id)}))} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        {item.PartID && ecnNotes[item.PartID] && (
                                            <div className="mt-2 flex gap-2 text-[10px] text-amber-600 bg-amber-50 rounded-lg p-2 font-bold">
                                                <AlertCircle size={12}/> 리비전 사유: {ecnNotes[item.PartID]}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {formData.Items.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[32px] py-20 text-slate-300">
                                        <ShoppingCart size={48} className="mb-4 opacity-20"/>
                                        <p className="font-black uppercase tracking-widest text-xs">발주 목록이 비어 있습니다</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 예상 금액</p>
                            <p className="text-3xl font-black text-indigo-700">₩ {totalPrice.toLocaleString()}</p>
                        </div>
                        <div className="h-10 w-px bg-slate-200" />
                        <div className="flex gap-4">
                            <div className="text-center">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">품목 수</p>
                                <p className="text-lg font-black text-slate-700">{formData.Items.filter(i => i.PartID).length}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">총 수량</p>
                                <p className="text-lg font-black text-slate-700">{formData.Items.reduce((acc, i) => acc + (i.Qty || 0), 0)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <button type="button" onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                        <button 
                            onClick={handleSubmit} 
                            disabled={loading || formData.Items.filter(i => i.PartID).length === 0} 
                            className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center gap-3 transition-all disabled:opacity-50"
                        >
                            {loading ? '처리 중...' : (initialData ? '수정 내용 저장' : '견적 요청 및 발주 기안 시작')}
                        </button>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
};

export default CreatePOModal;
