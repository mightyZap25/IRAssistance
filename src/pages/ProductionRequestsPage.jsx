import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ClipboardList, Plus, X, AlertCircle, CheckCircle2, Clock, DollarSign,
    ChevronRight, ChevronDown, Layers, Search, Package, Users, Calendar, TrendingUp, ShieldAlert, UserPlus, History, RotateCcw,
    Send, Trash2, ShoppingCart, Box, Tag, Settings
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { db, collection, getDocs, doc, updateDoc, addDoc, setDoc, serverTimestamp, query, orderBy, where } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';

// ─────────────────────────────────────────────────────────────
// 상태 및 상수 정의
// ─────────────────────────────────────────────────────────────
const PR_STATUS = {
    DRAFT:           { label: '임시저장',     color: 'bg-slate-100 text-slate-500 border-slate-200',    step: 0 },
    REVIEW:          { label: '생산검토',     color: 'bg-yellow-50 text-yellow-600 border-yellow-200',  step: 1 },
    CONFIRMED:       { label: '의뢰확정',     color: 'bg-blue-50 text-blue-600 border-blue-200',        step: 2 },
    WAITING_FOR_PARTS: { label: '자재대기',     color: 'bg-rose-50 text-rose-600 border-rose-200',        step: 2.5 },
    PROD_WAITING:    { label: '생산대기',     color: 'bg-indigo-50 text-indigo-600 border-indigo-200',  step: 3 },
    PROD_PLANNING:   { label: '생산계획',     color: 'bg-violet-50 text-violet-600 border-violet-200',  step: 4 },
    WORK_ORDER:      { label: '작업지시',     color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200', step: 5 },
    IN_PRODUCTION:   { label: '생산중',       color: 'bg-orange-50 text-orange-600 border-orange-200',  step: 6 },
    PROD_COMPLETE:   { label: '생산완료',     color: 'bg-teal-50 text-teal-600 border-teal-200',        step: 7 },
    QA_WAITING:      { label: 'QA검사대기',   color: 'bg-purple-50 text-purple-600 border-purple-200',  step: 8 },
    QA_COMPLETE:     { label: 'QA검사완료',   color: 'bg-emerald-50 text-emerald-600 border-emerald-200', step: 9 },
    SHIP_READY:      { label: '출하준비',     color: 'bg-cyan-50 text-cyan-600 border-cyan-200',        step: 10 },
    SHIPPED:         { label: '출하완료',     color: 'bg-green-50 text-green-600 border-green-200',     step: 11 },
    ARCHIVED:        { label: '아카이브',     color: 'bg-slate-50 text-slate-400 border-slate-100',     step: 12 },
    CANCELLED:       { label: '의뢰취소',     color: 'bg-red-50 text-red-600 border-red-200',        step: -1 },
};

const ACTIVE_STATUSES = ['DRAFT', 'REVIEW', 'CONFIRMED', 'WAITING_FOR_PARTS'];
const PRODUCTION_STATUSES = ['PROD_WAITING', 'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'];
const HISTORY_STATUSES = ['SHIPPED', 'ARCHIVED', 'CANCELLED'];

const COLUMN_DEFS = {
    PRNumber:    { label: 'PR 번호',    default: true },
    PartName:    { label: '제품명',     default: true },
    CustomerName:{ label: '고객사',     default: true },
    TargetQty:   { label: '수량',       default: true },
    UnitPrice:   { label: '단가',       default: true },
    TotalAmount: { label: '총 금액',    default: true },
    DueDate:     { label: '납기일',     default: true },
    Status:      { label: '상태',       default: true },
    CreatedAt:   { label: '등록일',     default: false },
};

const HISTORY_COLUMN_DEFS = {
    CreatedAt:   { label: '주문 일자',  default: true },
    DueDate:     { label: '납품 일자',  default: true },
    PartName:    { label: '주문 내역',  default: true },
    PaymentDate: { label: '대금 일자',  default: true },
    TotalAmount: { label: '판매액',     default: true },
    Status:      { label: '상태',       default: true },
    PRNumber:    { label: 'PR 번호',    default: false },
};

const generatePRNumber = () => {
    const d = new Date();
    return `PR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
};

import { productionService } from '../services/productionService';
import BOMCheckTree from '../components/BOMCheckTree';
import PRTimelineGraph from '../components/PRTimelineGraph';

// ─────────────────────────────────────────────────────────────
// 신규 생산 의뢰 등록 모달 (멀티 아이템 추가 방식)
// ─────────────────────────────────────────────────────────────
function PRRegistrationModal({ isOpen, onClose, onSave }) {
    const { userProfile } = useAuth();
    const [parts, setParts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [inventory, setInventory] = useState({});
    const [reservedMap, setReservedMap] = useState({});
    const [bomMap, setBomMap] = useState({});
    const [loading, setLoading] = useState(false);

    const [items, setItems] = useState([]);
    const [itemType, setItemType] = useState('PRODUCT');
    const [selectedMasterID, setSelectedMasterID] = useState('');
    const [availableVersions, setAvailableVersions] = useState([]);
    const [itemForm, setItemForm] = useState({ 
        PartID: '', 
        PartName: '', 
        Rev: '', 
        PartDocID: '', 
        TargetQty: 10, 
        UnitPrice: 0, 
        Currency: 'KRW' 
    });
    const [commonForm, setCommonForm] = useState({ 
        CustomerID: '', 
        CustomerName: '', 
        DueDate: '', 
        Remarks: '', 
        Urgent: false,
        PaymentDate: ''
    });

    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomerForm, setNewCustomerForm] = useState({ Name: '', Contact: '', Email: '' });
    const [addingCustomer, setAddingCustomer] = useState(false);
    
    const [hasCheckedAvailability, setHasCheckedAvailability] = useState(false);
    const [availabilityCheck, setAvailabilityCheck] = useState(null);
    const [openAccordion, setOpenAccordion] = useState(null);
    const [editingSplitId, setEditingSplitId] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        setCommonForm({ CustomerID: '', CustomerName: '', DueDate: '', Remarks: '', Urgent: false, PaymentDate: '' });
        setItems([]);
        setHasCheckedAvailability(false);
        setAvailabilityCheck(null);
        setShowAddCustomer(false);
        setNewCustomerForm({ Name: '', Contact: '', Email: '' });
        setEditingSplitId(null);
        resetItemForm();

        (async () => {
            const [pSnap, cSnap, invSnap, bomSnap] = await Promise.all([
                getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc'))),
                getDocs(query(collection(db, 'customers'), orderBy('Name', 'asc'))),
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'bom')),
            ]);
            setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setCustomers(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            
            const inv = {};
            invSnap.docs.forEach(d => { inv[d.data().PartID] = Number(d.data().OnHand || 0); });
            setInventory(inv);

            const bm = {};
            bomSnap.docs.forEach(d => {
                const data = d.data();
                if (!bm[data.ParentID]) bm[data.ParentID] = [];
                bm[data.ParentID].push(data);
            });
            setBomMap(bm);

            const reserved = await productionService.fetchReservedMap();
            setReservedMap(reserved);
        })();
    }, [isOpen]);

    const resetItemForm = () => {
        setSelectedMasterID('');
        setAvailableVersions([]);
        setItemForm({ 
            PartID: '', 
            PartName: '', 
            Rev: '', 
            PartDocID: '', 
            TargetQty: 10, 
            UnitPrice: 0, 
            Currency: 'KRW' 
        });
    };

    const filteredParts = useMemo(() => {
        return parts.filter(p => {
            const pClass = (p.Class || '').toUpperCase();
            const pCategory = (p.Category || '').toUpperCase();
            const pName = (p.Name || '').toUpperCase();

            if (itemType === 'PRODUCT') {
                const isProductClass = pClass.includes('PRODUCT') || pCategory.includes('PRODUCT');
                const isExcluded = pName.includes('SERIES') || pName.includes('BOARD');
                return isProductClass && !isExcluded;
            }
            if (itemType === 'SUB_ASSY') return pClass.includes('ASSEMBLY') || pCategory === 'SUB_ASSY';
            if (itemType === 'PART') return pClass.includes('PART') || pCategory === 'PART';
            return pCategory === itemType;
        });
    }, [parts, itemType]);

    const handlePartSelect = (partDocID) => {
        const p = parts.find(x => x.id === partDocID);
        if (!p) return;
        
        const masterID = p.MasterPartID || p.PartID.split('-').slice(0,-1).join('-');
        setSelectedMasterID(masterID);
        
        const versions = parts.filter(x => (x.MasterPartID || x.PartID.split('-').slice(0,-1).join('-')) === masterID)
                             .sort((a,b) => (b.Rev || '0').localeCompare(a.Rev || '0'));
        setAvailableVersions(versions);
        
        const latest = versions[0];
        setItemForm(prev => ({
            ...prev,
            PartID: latest.PartID,
            PartName: latest.Name,
            Rev: latest.Rev || '0.0',
            PartDocID: latest.id,
            UnitPrice: latest.UnitPrice || 0,
            Currency: latest.Currency || 'KRW'
        }));
    };

    const handleVersionSelect = (partDocID) => {
        const v = availableVersions.find(x => x.id === partDocID);
        if (!v) return;
        setItemForm(prev => ({
            ...prev,
            PartID: v.PartID,
            PartName: v.Name,
            Rev: v.Rev || '0.0',
            PartDocID: v.id,
            UnitPrice: v.UnitPrice || 0,
            Currency: v.Currency || 'KRW'
        }));
    };

    const addItem = () => {
        if (!itemForm.PartDocID) return alert('제품을 선택해주세요.');
        if (itemForm.TargetQty <= 0) return alert('수량을 입력해주세요.');
        
        const newItem = {
            ...itemForm,
            id: Date.now().toString(),
            Type: itemType,
            Schedules: [{ id: 'S1', date: commonForm.DueDate, qty: itemForm.TargetQty }]
        };
        setItems(prev => [...prev, newItem]);
        setHasCheckedAvailability(false);
    };

    const addSplitSchedule = (itemId) => {
        setItems(prev => prev.map(item => {
            if (item.id === itemId) {
                const nextIdx = item.Schedules.length + 1;
                return {
                    ...item,
                    Schedules: [...item.Schedules, { id: `S${nextIdx}`, date: commonForm.DueDate, qty: 0 }]
                };
            }
            return item;
        }));
    };

    const removeSplitSchedule = (itemId, scheduleId) => {
        setItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    Schedules: item.Schedules.filter(s => s.id !== scheduleId)
                };
            }
            return item;
        }));
    };

    const updateSplitSchedule = (itemId, scheduleId, field, value) => {
        setItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    Schedules: item.Schedules.map(s => s.id === scheduleId ? { ...s, [field]: field === 'qty' ? parseInt(value) || 0 : value } : s)
                };
            }
            return item;
        }));
    };

    const removeItem = (id) => {
        setItems(prev => prev.filter(x => x.id !== id));
        setHasCheckedAvailability(false);
    };

    const handleAddCustomer = async () => {
        if (!newCustomerForm.Name) return;
        setAddingCustomer(true);
        try {
            const docRef = await addDoc(collection(db, 'customers'), {
                ...newCustomerForm,
                CreatedAt: serverTimestamp()
            });
            const newC = { id: docRef.id, ...newCustomerForm };
            setCustomers(prev => [...prev, newC].sort((a,b) => a.Name.localeCompare(b.Name)));
            setCommonForm(prev => ({ ...prev, CustomerID: newC.id, CustomerName: newC.Name }));
            setShowAddCustomer(false);
            setNewCustomerForm({ Name: '', Contact: '', Email: '' });
        } catch (err) {
            console.error(err);
            alert('고객사 등록 실패');
        } finally {
            setAddingCustomer(false);
        }
    };

    const checkAvailability = () => {
        if (items.length === 0) return alert('목록에 제품이 없습니다.');
        const analysis = productionService.checkMultiItemAvailability(items, inventory, reservedMap, bomMap);
        setAvailabilityCheck(analysis);
        setHasCheckedAvailability(true);
        const firstShortageItem = analysis.items.find(r => !r.ok);
        setOpenAccordion(analysis.ok ? null : firstShortageItem?.id);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!hasCheckedAvailability) return alert('생산 등록 전 반드시 [자재 가용성 체크]를 진행해주세요.');
        if (!commonForm.CustomerID) return alert('고객사를 선택해주세요.');
        if (!commonForm.DueDate) return alert('납기일을 입력해주세요.');
        if (items.length === 0) return alert('추가된 제품이 없습니다.');

        for (const item of items) {
            const totalScheduled = item.Schedules.reduce((acc, cur) => acc + cur.qty, 0);
            if (totalScheduled !== item.TargetQty) {
                setEditingSplitId(item.id);
                return alert(`[${item.PartName}]의 분할 납기 수량 합계(${totalScheduled} EA)가 전체 요청 수량(${item.TargetQty} EA)과 일치하지 않습니다.`);
            }
        }

        setLoading(true);
        try {
            const processedItems = items.map(item => {
                const status = productionService.checkProductionStatus(item.PartID, item.TargetQty, inventory, reservedMap, bomMap);
                const hasShortage = !status.ok;
                const itemStatus = hasShortage ? 'WAITING_FOR_PARTS' : 'CONFIRMED';
                
                return {
                    ...item,
                    Status: itemStatus,
                    Shortages: status.shortages,
                    TotalAmount: item.UnitPrice * item.TargetQty,
                    Schedules: item.Schedules.map(s => ({
                        date: s.date,
                        qty: s.qty,
                        status: 'PENDING',
                        shippedQty: 0
                    }))
                };
            });

            const overallStatus = processedItems.some(i => i.Status === 'WAITING_FOR_PARTS') 
                ? 'WAITING_FOR_PARTS' 
                : 'CONFIRMED';

            const prData = {
                ...commonForm,
                Items: processedItems,
                Status: overallStatus,
                TotalAmount: processedItems.reduce((acc, cur) => acc + cur.TotalAmount, 0),
                Currency: processedItems[0]?.Currency || 'KRW',
                Logs: [{
                    from: 'NONE',
                    to: overallStatus,
                    message: `생산 의뢰 통합 등록 (품목: ${items.length}종)`,
                    user: userProfile?.displayName || 'Unknown',
                    timestamp: new Date().toISOString()
                }]
            };

            const prDoc = await onSave(prData);

            const shortageItems = processedItems.filter(i => i.Shortages.length > 0);
            if (shortageItems.length > 0) {
                await addDoc(collection(db, 'notifications'), {
                    title: '🚨 자재 부족 알림 (통합 PR)',
                    message: `[${commonForm.CustomerName}] 의뢰 건(${items.length}종) 중 ${shortageItems.length}종의 자재가 부족합니다.`,
                    type: 'SHORTAGE',
                    targetDepts: ['production', 'purchasing'],
                    refID: prDoc?.id,
                    createdAt: serverTimestamp(),
                    read: false
                });
            }
            
            onClose();
        } catch (err) {
            console.error(err);
            alert('생산 의뢰 등록 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 text-left">
            <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-blue-700 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <ShoppingCart size={22} />
                        <h2 className="text-lg font-black tracking-tight">신규 생산 의뢰 등록</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors"><X size={18}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* 상단: 고객사 및 납기일 */}
                    <div className="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <div className="col-span-1">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">고객사 선택</label>
                                <button 
                                    type="button" 
                                    onClick={() => setShowAddCustomer(!showAddCustomer)}
                                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                >
                                    {showAddCustomer ? <X size={10}/> : <Plus size={10}/>} {showAddCustomer ? '취소' : '신규 등록'}
                                </button>
                            </div>
                            
                            {!showAddCustomer ? (
                                <select
                                    value={commonForm.CustomerID}
                                    onChange={e => {
                                        const c = customers.find(x => x.id === e.target.value);
                                        setCommonForm(prev => ({ ...prev, CustomerID: c?.id || '', CustomerName: c?.Name || '' }));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                >
                                    <option value="">고객사 선택</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.Name}</option>)}
                                </select>
                            ) : (
                                <div className="space-y-2 bg-white p-3 rounded-xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-1">
                                    <input 
                                        type="text" 
                                        placeholder="고객사명 (필수)" 
                                        value={newCustomerForm.Name}
                                        onChange={e => setNewCustomerForm(prev => ({ ...prev, Name: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="연락처" 
                                            value={newCustomerForm.Contact}
                                            onChange={e => setNewCustomerForm(prev => ({ ...prev, Contact: e.target.value }))}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
                                        />
                                        <button 
                                            type="button"
                                            onClick={handleAddCustomer}
                                            disabled={addingCustomer || !newCustomerForm.Name}
                                            className="bg-indigo-600 text-white rounded-lg text-xs font-black py-1.5 hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
                                        >
                                            {addingCustomer ? '...' : '등록'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">납기 희망일</label>
                            <input 
                                type="date" 
                                value={commonForm.DueDate} 
                                onChange={e => setCommonForm(prev => ({ ...prev, DueDate: e.target.value }))} 
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none" 
                                required 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">대금 지불 예정일</label>
                            <input 
                                type="date" 
                                value={commonForm.PaymentDate} 
                                onChange={e => setCommonForm(prev => ({ ...prev, PaymentDate: e.target.value }))} 
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">우선순위</label>
                            <div className="flex items-center h-10 gap-2">
                                <input 
                                    type="checkbox" 
                                    id="urgent-check"
                                    checked={commonForm.Urgent} 
                                    onChange={e => setCommonForm(prev => ({ ...prev, Urgent: e.target.checked }))}
                                    className="w-4 h-4 rounded text-indigo-600"
                                />
                                <label htmlFor="urgent-check" className="text-sm font-bold text-slate-600 cursor-pointer">긴급 생산</label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <Plus size={16} className="text-indigo-600"/>
                            <h3 className="text-sm font-black text-slate-800">제품 항목 추가</h3>
                        </div>

                        <div className="grid grid-cols-12 gap-3 items-end border-2 border-dashed border-slate-200 p-5 rounded-2xl bg-slate-50/30">
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-slate-400 mb-1 block">분류</label>
                                <select
                                    value={itemType}
                                    onChange={e => { setItemType(e.target.value); resetItemForm(); }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="PRODUCT">완제품</option>
                                    <option value="SUB_ASSY">반조립품</option>
                                    <option value="PART">부품</option>
                                    <option value="ACC">액세서리</option>
                                </select>
                            </div>

                            <div className="col-span-3">
                                <label className="text-[10px] font-black text-slate-400 mb-1 block">제품명</label>
                                <select
                                    value={filteredParts.find(p => (p.MasterPartID || p.PartID.split('-').slice(0,-1).join('-')) === selectedMasterID)?.id || ''}
                                    onChange={e => handlePartSelect(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">제품 선택</option>
                                    {filteredParts.map(p => <option key={p.id} value={p.id}>[{p.PartID}] {p.Name}</option>)}
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-slate-400 mb-1 block">버전</label>
                                <select
                                    value={itemForm.PartDocID}
                                    onChange={e => handleVersionSelect(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none"
                                    disabled={!selectedMasterID}
                                >
                                    {availableVersions.map(v => (
                                        <option key={v.id} value={v.id}>{v.Rev || '0.0'}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-slate-400 mb-1 block">수량</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    value={itemForm.TargetQty} 
                                    onChange={e => setItemForm(prev => ({ ...prev, TargetQty: parseInt(e.target.value) || 0 }))} 
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-slate-400 mb-1 block">통화 및 단가</label>
                                <div className="flex gap-1">
                                    <select
                                        value={itemForm.Currency}
                                        onChange={e => setItemForm(prev => ({ ...prev, Currency: e.target.value }))}
                                        className="w-20 bg-white border border-slate-200 rounded-xl px-2 py-2 text-[10px] font-black outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
                                    >
                                        <option value="KRW">KRW (₩)</option>
                                        <option value="USD">USD ($)</option>
                                    </select>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        value={itemForm.UnitPrice} 
                                        onChange={e => setItemForm(prev => ({ ...prev, UnitPrice: parseFloat(e.target.value) || 0 }))} 
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                            <div className="col-span-3">
                                <button 
                                    type="button" 
                                    onClick={addItem}
                                    className="w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors h-10 shadow-md shadow-indigo-100"
                                >
                                    <Plus size={14}/> 품목 추가
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <h3 className="text-xs font-black text-slate-700 flex items-center gap-2">
                                <ShoppingCart size={14} className="text-blue-500"/> 생산 요청 목록 ({items.length})
                            </h3>
                            <div className="flex gap-2">
                                <button 
                                    type="button" 
                                    onClick={checkAvailability}
                                    className="text-[10px] font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-sm"
                                >
                                    <ShieldAlert size={12}/> 전체 자재 가용성 체크
                                </button>
                            </div>
                        </div>

                        {availabilityCheck && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <div className={`p-3 rounded-xl border flex items-center justify-between ${availabilityCheck.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                    <div className="flex items-center gap-2">
                                        {availabilityCheck.ok ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
                                        <span className="text-xs font-black">{availabilityCheck.ok ? '모든 항목의 자재 재고가 충분합니다.' : '일부 항목의 자재 재고가 부족합니다. 상세 내용을 확인하세요.'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    {availabilityCheck.items.map(res => (
                                        <div key={res.id} className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
                                            <button 
                                                type="button"
                                                onClick={() => setOpenAccordion(openAccordion === res.id ? null : res.id)}
                                                className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors ${!res.ok ? 'bg-rose-50/30' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {res.ok ? <CheckCircle2 size={14} className="text-emerald-500"/> : <AlertCircle size={14} className="text-rose-500"/>}
                                                    <div className="flex flex-col items-start">
                                                        <span className={`text-xs font-black ${res.ok ? 'text-slate-700' : 'text-rose-600'}`}>{res.PartName}</span>
                                                    </div>
                                                </div>
                                                <ChevronRight size={14} className={`text-slate-400 transition-transform ${openAccordion === res.id ? 'rotate-90' : ''}`}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                        <th className="px-4 py-3">제품 정보</th>
                                        <th className="px-4 py-3 text-right">수량</th>
                                        <th className="px-4 py-3 text-right">합계</th>
                                        <th className="px-4 py-3 text-center">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 bg-white">
                                    {items.map(item => (
                                        <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-slate-800">{item.PartName}</span>
                                                    <span className="text-[10px] font-bold text-slate-400">{item.PartID}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-black text-slate-700">{item.TargetQty.toLocaleString()} EA</td>
                                            <td className="px-4 py-3 text-right text-xs font-black text-indigo-600">{item.Currency === 'USD' ? '$' : '₩'}{(item.UnitPrice * item.TargetQty).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">취소</button>
                    <button onClick={handleSubmit} disabled={loading || items.length === 0} className={`px-8 py-2.5 rounded-xl text-sm font-black text-white transition-all shadow-lg ${loading || items.length === 0 ? 'bg-slate-300 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}>
                        의뢰 등록
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────
export default function ProductionRequestsPage() {
    const { userProfile } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('CURRENT');
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedPR, setSelectedPR] = useState(null);
    const [detailTab, setDetailTab] = useState('INFO'); // 'INFO', 'MATERIALS', 'HISTORY'
    const [selectedPRBOM, setSelectedPRBOM] = useState([]);
    const [inventory, setInventory] = useState({});
    const [reservedMap, setReservedMap] = useState({});
    const [activeScheduleTab, setActiveScheduleTab] = useState(0);
    const [partsList, setPartsList] = useState([]);

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) fetchSelectedPRDetails(selectedPR); }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const [prSnap, partsSnap] = await Promise.all([
                getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc'))),
                getDocs(collection(db, 'parts'))
            ]);
            setPrs(prSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setPartsList(partsSnap.docs.map(d => d.data()));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchSelectedPRDetails = async (pr) => {
        if (!pr) return;
        setActiveScheduleTab(0);
        try {
            const items = pr.Items || [];
            const [invSnap, partsSnap, allBomSnap] = await Promise.all([
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'parts')),
                getDocs(collection(db, 'bom'))
            ]);
            
            const partsFullMap = {};
            partsSnap.docs.forEach(d => { partsFullMap[d.data().PartID] = d.data(); });
            const inventoryMap = {};
            invSnap.docs.forEach(d => { inventoryMap[d.data().PartID] = Number(d.data().OnHand || 0); });
            setInventory(inventoryMap);

            const bomDataByParent = {};
            allBomSnap.docs.forEach(d => {
                const data = d.data();
                if (!bomDataByParent[data.ParentID]) bomDataByParent[data.ParentID] = [];
                bomDataByParent[data.ParentID].push(data);
            });

            const reserved = await productionService.fetchReservedMap(pr.id);
            setReservedMap(reserved);

            const structuredData = [];
            items.forEach((item, itemIdx) => {
                const schedules = item.Schedules || [{ date: item.DueDate || pr.DueDate, qty: item.TargetQty }];
                const bomTree = productionService.buildBOMTree(item.PartID, bomDataByParent, partsFullMap);
                schedules.forEach((sched, sIdx) => {
                    structuredData.push({
                        id: `${item.PartID}-${sIdx}`,
                        PartName: item.PartName,
                        ScheduleIdx: sIdx + 1,
                        SetQty: Number(sched.qty || 0),
                        BOMTree: bomTree
                    });
                });
            });
            setSelectedPRBOM(structuredData);
        } catch (err) { console.error(err); }
    };

    const handleStatusChange = async (prId, nextStatus) => {
        const pr = prs.find(p => p.id === prId);
        if (!pr) return;
        const logEntry = {
            from: pr.Status, to: nextStatus,
            message: '상태 변경',
            user: userProfile?.displayName || 'Unknown', 
            timestamp: new Date().toISOString()
        };
        try {
            const updateData = { Status: nextStatus, UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(pr.Logs || [])] };
            await updateDoc(doc(db, 'production_requests', prId), updateData);
            await fetchPRs();
            if (selectedPR?.id === prId) setSelectedPR(prev => ({ ...prev, ...updateData }));
        } catch (err) { console.error(err); }
    };

    const handleSavePR = async (formData) => {
        const prNumber = generatePRNumber();
        await setDoc(doc(db, 'production_requests', prNumber), { ...formData, PRNumber: prNumber, CreatedAt: serverTimestamp() });
        await fetchPRs();
        return { id: prNumber };
    };

    const currentData = useMemo(() => {
        const list = prs.filter(pr => {
            if (!searchTerm) return true;
            const lower = searchTerm.toLowerCase();
            return pr.PRNumber?.toLowerCase().includes(lower) || pr.PartName?.toLowerCase().includes(lower) || pr.CustomerName?.toLowerCase().includes(lower);
        });
        return {
            active: list.filter(pr => ACTIVE_STATUSES.includes(pr.Status)),
            production: list.filter(pr => PRODUCTION_STATUSES.includes(pr.Status)),
            history: list
        };
    }, [prs, searchTerm]);

    return (
        <div className="h-full flex flex-col space-y-5">
            <div className="flex justify-between items-end">
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 의뢰 관리</h1><p className="text-sm font-bold text-slate-500 mt-1.5">생산 의뢰 및 이력 추적</p></div>
                <button onClick={() => setIsCreateOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-lg"><Plus size={18}/> 신규 의뢰</button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex space-x-6">
                        <button onClick={() => setActiveTab('CURRENT')} className={`text-sm font-black pb-4 -mb-4 border-b-2 ${activeTab === 'CURRENT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>진행 현황</button>
                        <button onClick={() => setActiveTab('HISTORY')} className={`text-sm font-black pb-4 -mb-4 border-b-2 ${activeTab === 'HISTORY' ? 'border-slate-600 text-slate-600' : 'border-transparent text-slate-400'}`}>전체 이력</button>
                    </div>
                    <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" placeholder="검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 text-sm font-bold bg-white border border-slate-200 rounded-xl outline-none w-64 shadow-sm"/></div>
                </div>
                <div className="flex-1 overflow-hidden">
                    {loading ? <div className="flex items-center justify-center h-full">Loading...</div> : 
                    <MasterDataGrid data={activeTab === 'CURRENT' ? [...currentData.active, ...currentData.production] : currentData.history} columnDefs={COLUMN_DEFS} onRowClick={row => setSelectedPR(prs.find(p => p.id === row.id))} />}
                </div>
            </div>

            {selectedPR && createPortal(
                <div className="fixed inset-0 z-[9999] flex justify-end">
                    <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setSelectedPR(null)} />
                    <div className="relative w-full md:w-[520px] bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                            <div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span>
                                <h2 className="text-xl font-black text-slate-900 mt-1">{selectedPR.PRNumber}</h2>
                                <p className="text-sm text-slate-500 font-bold">{selectedPR.PartName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"><X size={20}/></button>
                        </div>

                        <div className="flex border-b border-slate-100 bg-slate-50/50 shrink-0">
                            {[ { id: 'INFO', label: '상세 정보', icon: ClipboardList }, { id: 'MATERIALS', label: '자재 현황', icon: Package }, { id: 'HISTORY', label: '생산 이력', icon: History } ].map(tab => (
                                <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black transition-all border-b-2 ${detailTab === tab.id ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}>
                                    <tab.icon size={14} /> {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                            {detailTab === 'INFO' ? (
                                <div className="space-y-6">
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                                        <div className="flex justify-between text-xs"><span className="text-slate-400 font-bold">고객사</span><span className="font-black text-slate-700">{selectedPR.CustomerName}</span></div>
                                        <div className="flex justify-between text-xs"><span className="text-slate-400 font-bold">납기일</span><span className="font-black text-slate-700">{selectedPR.DueDate}</span></div>
                                        <div className="flex justify-between text-xs"><span className="text-slate-400 font-bold">총 수량</span><span className="font-black text-blue-600">{selectedPR.TargetQty} EA</span></div>
                                    </div>
                                    {selectedPR.Items?.map((item, idx) => (
                                        <div key={idx} className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm space-y-2">
                                            <div className="flex justify-between"><span className="text-xs font-black text-slate-800">{item.PartName}</span><span className="text-[10px] font-black text-slate-400">{item.PartID}</span></div>
                                            <div className="text-[10px] font-bold text-slate-500">수량: {item.TargetQty} EA</div>
                                        </div>
                                    ))}
                                </div>
                            ) : detailTab === 'MATERIALS' ? (
                                <div className="space-y-4 h-full flex flex-col">
                                    <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-100 shrink-0">
                                        {selectedPRBOM.map((g, i) => (
                                            <button key={i} onClick={() => setActiveScheduleTab(i)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black shrink-0 ${activeScheduleTab === i ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}>{g.ScheduleIdx}차 ({g.SetQty}EA)</button>
                                        ))}
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        {selectedPRBOM.length > 0 ? <BOMCheckTree data={selectedPRBOM[activeScheduleTab].BOMTree} targetQty={selectedPRBOM[activeScheduleTab].SetQty} inventoryMap={inventory} /> : <div className="py-24 text-center text-xs font-bold text-slate-300">BOM 데이터 없음</div>}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 animate-in fade-in duration-300">
                                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-2 mb-6 uppercase tracking-widest"><History size={16} className="text-indigo-600"/> 생산 진행 이력 (Logs)</h3>
                                    <div className="space-y-6">
                                        {selectedPR.Logs && selectedPR.Logs.length > 0 ? selectedPR.Logs.map((log, lidx) => (
                                            <div key={lidx} className="relative pl-8 pb-6 border-l-2 border-slate-100 last:border-0 last:pb-0 flex flex-col group">
                                                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center z-10"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div></div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-black text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded border border-indigo-100 uppercase">{PR_STATUS[log.to]?.label || log.to}</span>
                                                    <span className="text-[10px] text-slate-300 font-bold tabular-nums">{new Date(log.timestamp).toLocaleString()}</span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 mt-1 leading-relaxed">{log.message}</p>
                                                <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-tighter flex items-center gap-1.5"><Users size={10} /> BY: {log.user}{log.scope && <span className="ml-2 px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 border border-slate-200">{log.scope}</span>}</p>
                                            </div>
                                        )) : <div className="py-24 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">이력이 없습니다.</div>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
            <PRRegistrationModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSave={handleSavePR} />
        </div>
    );
}
