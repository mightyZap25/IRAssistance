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

            // Fetch reserved map using service
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
                // Class나 Category에 'PRODUCT'가 포함된 것을 완제품으로 인식 (사용자 요청 반영)
                const isProductClass = pClass.includes('PRODUCT') || pCategory.includes('PRODUCT');
                
                // "시리즈"나 "ACTUATOR BOARD" 등 중간 조립품은 완제품 목록에서 제외
                const isExcluded = pName.includes('SERIES') || pName.includes('BOARD');
                
                return isProductClass && !isExcluded;
            }
            
            // 그 외 카테고리는 기존 방식 및 Class 기반 필터링 병행
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
        
        // Use sequential deduction logic for multi-item check
        const analysis = productionService.checkMultiItemAvailability(items, inventory, reservedMap, bomMap);

        setAvailabilityCheck(analysis);
        setHasCheckedAvailability(true);
        
        // Open accordion for the first item with shortage
        const firstShortageItem = analysis.items.find(r => !r.ok);
        setOpenAccordion(analysis.ok ? null : firstShortageItem?.id);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!hasCheckedAvailability) return alert('생산 등록 전 반드시 [자재 가용성 체크]를 진행해주세요.');
        if (!commonForm.CustomerID) return alert('고객사를 선택해주세요.');
        if (!commonForm.DueDate) return alert('납기일을 입력해주세요.');
        if (items.length === 0) return alert('추가된 제품이 없습니다.');

        // 1. 수량 유효성 검사
        for (const item of items) {
            const totalScheduled = item.Schedules.reduce((acc, cur) => acc + cur.qty, 0);
            if (totalScheduled !== item.TargetQty) {
                setEditingSplitId(item.id);
                return alert(`[${item.PartName}]의 분할 납기 수량 합계(${totalScheduled} EA)가 전체 요청 수량(${item.TargetQty} EA)과 일치하지 않습니다.`);
            }
        }

        setLoading(true);
        try {
            // 모든 아이템에 대해 가용성 체크 및 상태 결정
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

            // 전체 PR의 상태 결정 (하나라도 부족하면 WAITING_FOR_PARTS, 아니면 CONFIRMED)
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

            // 알림 생성 (부족한 품목이 있는 경우)
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

                    {/* 중단: 제품 추가 섹션 (단일 행 구성) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <Plus size={16} className="text-indigo-600"/>
                            <h3 className="text-sm font-black text-slate-800">제품 항목 추가</h3>
                        </div>

                        <div className="grid grid-cols-12 gap-3 items-end border-2 border-dashed border-slate-200 p-5 rounded-2xl bg-slate-50/30">
                            {/* 유형 선택 (콤보박스) */}
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

                            {/* 제품 선택 및 입력 */}
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

                    {/* 하단: 추가된 아이템 목록 */}
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
                                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                                    합계: {items.map(i => `${i.Currency === 'USD' ? '$' : '₩'}${ (i.UnitPrice * i.TargetQty).toLocaleString() }`).join(' + ')}
                                </span>
                            </div>
                        </div>

                        {/* 가용성 체크 결과 (아코디언 방식) */}
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
                                                        <span className={`text-[10px] font-bold ${res.ok ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                            생산 가능: {res.canMake} EA / 부족: <span className={res.shortage > 0 ? 'underline' : ''}>{res.shortage}</span> EA
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-400">요청: {res.TargetQty} EA</span>
                                                    <ChevronRight size={14} className={`text-slate-400 transition-transform ${openAccordion === res.id ? 'rotate-90' : ''}`}/>
                                                </div>
                                            </button>
                                            
                                            {openAccordion === res.id && (
                                                <div className="px-4 pb-4 pt-2 border-t border-slate-50 bg-slate-50/50">
                                                    {res.shortages.length > 0 ? (
                                                        <div className="space-y-3 mt-1">
                                                            <div className="flex items-center gap-2 px-1">
                                                                <ShieldAlert size={12} className="text-rose-400"/>
                                                                <p className="text-[10px] font-black text-rose-400 uppercase tracking-tighter">최종 자재 부족 내역 (Critical Shortages)</p>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {res.shortages.map(s => (
                                                                    <div key={s.id} className="bg-white p-2.5 rounded-xl border border-rose-100 flex justify-between items-center shadow-sm">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-black text-slate-800">{s.id}</span>
                                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                                <span className="text-[9px] font-bold text-slate-400">보유: {s.has}</span>
                                                                                <span className="text-[9px] font-bold text-slate-400">|</span>
                                                                                <span className="text-[9px] font-bold text-slate-400">필요: {s.req}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">부족: {s.req - s.has} EA</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className="text-[9px] font-bold text-slate-400 px-1">* 위 부족 자재는 순차 차감 로직에 의해 현재고(완제품/반제품)를 우선 사용한 뒤의 최종 결측치입니다.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="py-2 px-1 flex items-center gap-2">
                                                            <CheckCircle2 size={12} className="text-emerald-500"/>
                                                            <p className="text-[10px] font-bold text-emerald-600">현재 창고 재고 및 하위 조립품 생산 가능량을 종합한 결과, 요청 수량 전체 생산이 가능합니다.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                        <th className="px-4 py-3">유형</th>
                                        <th className="px-4 py-3">제품 정보</th>
                                        <th className="px-4 py-3 text-right">수량</th>
                                        <th className="px-4 py-3 text-right">단가</th>
                                        <th className="px-4 py-3 text-right">합계</th>
                                        <th className="px-4 py-3 text-center">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 bg-white">
                                    {items.map(item => {
                                        const totalScheduled = item.Schedules.reduce((acc, cur) => acc + cur.qty, 0);
                                        const isSplitError = totalScheduled !== item.TargetQty;

                                        return (
                                            <React.Fragment key={item.id}>
                                                <tr className={`group hover:bg-slate-50/50 transition-colors ${editingSplitId === item.id ? 'bg-indigo-50/30' : ''}`}>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                            item.Type === 'PRODUCT' ? 'bg-blue-50 text-blue-600' :
                                                            item.Type === 'SUB_ASSY' ? 'bg-indigo-50 text-indigo-600' :
                                                            item.Type === 'PART' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-600'
                                                        }`}>
                                                            {item.Type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-black text-slate-800">{item.PartName}</span>
                                                                {item.Schedules.length > 1 && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black">분할 {item.Schedules.length}회</span>}
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400">{item.PartID} (Rev {item.Rev})</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs font-black text-slate-700">{item.TargetQty.toLocaleString()} EA</td>
                                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-500">{item.Currency === 'USD' ? '$' : '₩'}{item.UnitPrice.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-black text-indigo-600">{item.Currency === 'USD' ? '$' : '₩'}{(item.UnitPrice * item.TargetQty).toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button 
                                                                type="button"
                                                                onClick={() => setEditingSplitId(editingSplitId === item.id ? null : item.id)}
                                                                className={`p-1.5 rounded-lg transition-all ${editingSplitId === item.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                                                                title="납기 분할 설정"
                                                            >
                                                                <Calendar size={14}/>
                                                            </button>
                                                            <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {editingSplitId === item.id && (
                                                    <tr className="bg-indigo-50/20">
                                                        <td colSpan="6" className="px-6 py-4">
                                                            <div className="bg-white rounded-xl border border-indigo-100 p-4 shadow-sm animate-in fade-in slide-in-from-top-1">
                                                                <div className="flex justify-between items-center mb-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <Calendar size={14} className="text-indigo-600"/>
                                                                        <h4 className="text-xs font-black text-slate-700">납기 일정 분할 설정</h4>
                                                                    </div>
                                                                    <div className={`px-3 py-1 rounded-lg text-[10px] font-black border ${isSplitError ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                                                                        배분 수량: {totalScheduled.toLocaleString()} / 전체 수량: {item.TargetQty.toLocaleString()} EA
                                                                        {isSplitError && <span className="ml-2">(수량 불일치!)</span>}
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-2">
                                                                    {item.Schedules.map((s, sidx) => (
                                                                        <div key={s.id} className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                                            <div className="flex items-center gap-2 flex-1">
                                                                                <span className="text-[10px] font-black text-slate-400 w-8">{sidx + 1}회차</span>
                                                                                <input 
                                                                                    type="date" 
                                                                                    value={s.date} 
                                                                                    onChange={e => updateSplitSchedule(item.id, s.id, 'date', e.target.value)}
                                                                                    className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500 flex-1"
                                                                                />
                                                                            </div>
                                                                            <div className="flex items-center gap-2 w-32">
                                                                                <input 
                                                                                    type="number" 
                                                                                    min="1"
                                                                                    value={s.qty} 
                                                                                    onChange={e => updateSplitSchedule(item.id, s.id, 'qty', e.target.value)}
                                                                                    className="w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-black text-right outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                />
                                                                                <span className="text-[10px] font-bold text-slate-400">EA</span>
                                                                            </div>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => removeSplitSchedule(item.id, s.id)}
                                                                                disabled={item.Schedules.length <= 1}
                                                                                className="p-1 text-slate-300 hover:text-rose-500 disabled:opacity-30"
                                                                            >
                                                                                <X size={14}/>
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => addSplitSchedule(item.id)}
                                                                        className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-1 mt-2"
                                                                    >
                                                                        <Plus size={12}/> 일정 추가
                                                                    </button>
                                                                </div>
                                                                <p className="mt-3 text-[10px] font-bold text-slate-400">* 분할 납기 시 각 회차의 수량 합계가 전체 요청 수량({item.TargetQty} EA)과 정확히 일치해야 저장이 가능합니다.</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">추가된 제품이 없습니다</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 비고란 */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase block pl-1">공통 참고사항 (Remarks)</label>
                        <textarea
                            value={commonForm.Remarks}
                            onChange={e => setCommonForm(prev => ({ ...prev, Remarks: e.target.value }))}
                            placeholder="작업 지시나 특이사항을 입력하세요..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold h-24 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">취소</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={loading || items.length === 0} 
                        className={`px-8 py-2.5 rounded-xl text-sm font-black text-white transition-all shadow-lg ${loading || items.length === 0 ? 'bg-slate-300 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
                    >
                        {loading ? '의뢰 등록 중...' : `${items.length}건의 생산 의뢰 등록`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 생산 의뢰 취소 사유 입력 모달
// ─────────────────────────────────────────────────────────────
function PRCancellationModal({ isOpen, onClose, onConfirm, prNumber }) {
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
                    <div className="flex items-center gap-2 text-rose-600">
                        <ShieldAlert size={18} />
                        <h3 className="text-sm font-black uppercase tracking-tight">생산 의뢰 취소 사유 작성</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4 text-left">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">취소 대상 의뢰</p>
                        <p className="text-sm font-black text-slate-800">{prNumber}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 pl-1">취소 사유 (Cancellation Reason)</label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="의뢰를 취소하는 구체적인 사유를 입력하세요..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold h-32 outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                            autoFocus
                        />
                    </div>
                    <p className="text-[10px] font-bold text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100">
                        * 취소 처리 시 해당 의뢰의 모든 공정이 중단되며, 되돌릴 수 없습니다.
                    </p>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-black text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">닫기</button>
                    <button 
                        onClick={() => {
                            if (!reason.trim()) return alert('취소 사유를 입력해주세요.');
                            onConfirm(reason);
                            setReason('');
                        }}
                        className="px-6 py-2 bg-rose-600 text-white rounded-lg text-xs font-black shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all"
                    >
                        의뢰 취소 확정
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
function isDelayed(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
}

export default function ProductionRequestsPage() {
    const { userProfile } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('CURRENT'); // 'CURRENT', 'HISTORY'
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [selectedPR, setSelectedPR] = useState(null);
    const [transitionNote, setTransitionNote] = useState('');
    const [detailTab, setDetailTab] = useState('INFO'); // 'INFO', 'MATERIALS'
    
    const handleERPSync = async () => {
        if (!window.confirm('이카운트(ECount) 등 외부 ERP로 생산 의뢰 데이터를 전송하시겠습니까? (현재는 Mocking 테스트입니다)')) return;
        setLoading(true);
        setTimeout(async () => {
            alert(`[ERP 전송 성공] 의뢰 번호 ${selectedPR.PRNumber} 가 외부 시스템에 성공적으로 등록되었습니다.`);
            try {
                const logEntry = {
                    from: selectedPR.Status, to: selectedPR.Status,
                    message: '외부 ERP 전송 완료 (Mock)',
                    user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString()
                };
                await updateDoc(doc(db, 'production_requests', selectedPR.id), { 
                    ERPSynced: true,
                    Logs: [logEntry, ...(selectedPR.Logs || [])] 
                });
                await fetchPRs();
            } catch(e){}
            setLoading(false);
        }, 1500);
    };
    const [selectedPRBOM, setSelectedPRBOM] = useState([]);
    const [inventory, setInventory] = useState({});
    const [reservedMap, setReservedMap] = useState({});
    const [activeScheduleTab, setActiveScheduleTab] = useState(0);

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) fetchSelectedPRDetails(selectedPR); }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            setPrs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchSelectedPRDetails = async (pr) => {
        if (!pr) return;
        setActiveScheduleTab(0); // Reset tab on new PR selection
        try {
            const items = pr.Items || [{ PartID: pr.PartID, TargetQty: pr.TargetQty, PartName: pr.PartName }];
            const partIDs = items.map(i => i.PartID).filter(Boolean);

            if (partIDs.length === 0) return;

            // Fetch inventory, parts, BOM, and all active PRs for reservation calculation
            const [invSnap, partsSnap, allBomSnap, allActivePrSnap] = await Promise.all([
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'parts')),
                getDocs(collection(db, 'bom')),
                getDocs(query(collection(db, 'production_requests'), where('Status', 'in', ['WAITING_FOR_PARTS', 'PROD_WAITING', 'IN_PRODUCTION'])))
            ]);
            
            const partsMap = {};
            const partsFullMap = {};
            partsSnap.docs.forEach(d => { 
                const data = d.data();
                partsMap[data.PartID] = data.Name;
                partsFullMap[data.PartID] = data;
            });
            
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
                const schedules = (item.Schedules && item.Schedules.length > 0) 
                    ? item.Schedules 
                    : [{ date: item.DueDate || pr.DueDate, qty: item.TargetQty || pr.TargetQty }];

                // Get the tree structure starting from the item's PartID using service
                const bomTree = productionService.buildBOMTree(item.PartID, bomDataByParent, partsFullMap);

                schedules.forEach((sched, sIdx) => {
                    structuredData.push({
                        id: `${item.PartID}-${sIdx}`,
                        PartID: item.PartID,
                        PartName: item.PartName,
                        ScheduleIdx: sIdx + 1,
                        ScheduleDate: sched.date || item.DueDate || pr.DueDate,
                        SetQty: Number(sched.qty || item.TargetQty || 0),
                        BOMTree: bomTree
                    });
                });
            });

            setSelectedPRBOM(structuredData);
        } catch (err) { console.error(err); }
    };

    const handleStatusChange = async (prId, nextStatus, logMessage = '', reason = '') => {
        const pr = prs.find(p => p.id === prId);
        if (!pr) return;
        const currentStep = PR_STATUS[pr.Status]?.step || 0;
        const nextStep = PR_STATUS[nextStatus]?.step || 0;
        
        if (nextStep < currentStep && !reason && nextStatus !== 'CANCELLED') {
            const userReason = window.prompt('복구 사유를 입력하세요:');
            if (!userReason) return;
            reason = userReason;
        }

        const logEntry = {
            from: pr.Status, to: nextStatus,
            message: logMessage || (nextStatus === 'CANCELLED' ? `의뢰 취소: ${reason}` : (nextStep < currentStep ? `복구: ${reason}` : '상태 변경')),
            user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString()
        };

        try {
            const updateData = { Status: nextStatus, UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(pr.Logs || [])] };
            
            // 통합 PR인 경우 모든 아이템의 상태도 동기화 (생산 단계 진입 시)
            if (pr.Items && pr.Items.length > 0) {
                updateData.Items = pr.Items.map(item => ({
                    ...item,
                    Status: nextStatus
                }));
            }

            await updateDoc(doc(db, 'production_requests', prId), updateData);
            setTransitionNote('');
            await fetchPRs();
            setSelectedPR(null);
        } catch (err) { console.error(err); }
    };

    const handleCancelPR = async (reason) => {
        if (!selectedPR) return;
        await handleStatusChange(selectedPR.id, 'CANCELLED', '', reason);
        setIsCancelModalOpen(false);

        // 알림 생성
        try {
            await addDoc(collection(db, 'notifications'), {
                title: '❌ 생산 의뢰 취소 알림',
                message: `[${selectedPR.PartName}] 생산 의뢰(${selectedPR.PRNumber})가 취소되었습니다. (사유: ${reason})`,
                type: 'CANCELLED',
                targetDepts: ['production', 'purchasing'],
                createdAt: serverTimestamp(),
                read: false
            });
        } catch (notiErr) {
            console.error(notiErr);
        }
    };

    const handleSavePR = async (formData) => {
        const prNumber = generatePRNumber();
        const docRef = doc(db, 'production_requests', prNumber);
        await setDoc(docRef, { 
            ...formData, 
            PRNumber: prNumber, 
            CreatedAt: serverTimestamp(), 
            CreatedBy: userProfile?.uid,
            CreatedByName: userProfile?.displayName || userProfile?.name || '관리자'
        });
        await fetchPRs();
        return { id: prNumber };
    };

    const stats = useMemo(() => {
        let totalSales = 0, monthCount = 0, pendingCount = 0, urgentCount = 0;
        const now = new Date();
        prs.forEach(pr => {
            if (pr.Status !== 'CANCELLED') {
                totalSales += pr.TotalAmount || 0;
            }
            if (ACTIVE_STATUSES.includes(pr.Status)) pendingCount++;
            if (pr.Urgent) urgentCount++;
        });
        return { totalSales, monthCount, pendingCount, urgentCount };
    }, [prs]);

    const currentData = useMemo(() => {
        const format = (list, isHistory = false) => {
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                list = list.filter(pr => 
                    pr.PRNumber?.toLowerCase().includes(lower) || 
                    pr.PartName?.toLowerCase().includes(lower) || 
                    pr.CustomerName?.toLowerCase().includes(lower) ||
                    pr.Items?.some(i => i.PartName.toLowerCase().includes(lower) || i.PartID.toLowerCase().includes(lower))
                );
            }
            return list.map(pr => {
                const itemCount = pr.Items?.length || 0;
                const representativeItem = pr.Items?.[0] || pr;
                const partNameDisplay = itemCount > 1 
                    ? `${representativeItem.PartName} 외 ${itemCount - 1}건` 
                    : representativeItem.PartName;
                const totalQty = pr.Items?.reduce((acc, cur) => acc + (cur.TargetQty || 0), 0) || pr.TargetQty;

                const currencySymbol = (pr.Currency || representativeItem.Currency) === 'USD' ? '$' : '₩';

                return {
                    ...pr,
                    id: pr.id,
                    PartName: partNameDisplay,
                    TargetQty: totalQty,
                    Status: <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color}`}>{PR_STATUS[pr.Status]?.label}</span>,
                    PRNumber: <span className="font-bold">{pr.PRNumber}</span>,
                    TotalAmount: <span className="font-black text-blue-600">{currencySymbol}{(pr.TotalAmount || 0).toLocaleString()}</span>,
                    UnitPrice: <span className="font-bold text-slate-500">{currencySymbol}{(representativeItem.UnitPrice || 0).toLocaleString()}</span>,
                    CreatedAt: pr.CreatedAt?.toDate ? pr.CreatedAt.toDate().toLocaleDateString() : '-',
                    PaymentDate: pr.PaymentDate || '-'
                };
            });
        };

        return {
            active: format(prs.filter(pr => ACTIVE_STATUSES.includes(pr.Status))),
            production: format(prs.filter(pr => PRODUCTION_STATUSES.includes(pr.Status))),
            history: format(prs, true) // Show all in history
        };
    }, [prs, searchTerm]);

    const isPRReadOnly = (status) => {
        const step = PR_STATUS[status]?.step || 0;
        return (step >= 3 && step < 10) || status === 'CANCELLED';
    };

    return (
        <div className="h-full flex flex-col space-y-5">
            <div className="flex justify-between items-end">
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 의뢰 관리</h1><p className="text-sm font-bold text-slate-500 mt-1.5">생산 의뢰 및 판매 이력 추적</p></div>
                <button onClick={() => setIsCreateOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black transition-all flex items-center gap-2 shadow-lg"><Plus size={18}/> 신규 생산 의뢰</button>
            </div>

            <div className="grid grid-cols-4 gap-4 shrink-0 text-left">
                {[ { l: '처리 대기', v: stats.pendingCount, c: 'text-indigo-600', i: Clock }, { l: '긴급 처리', v: stats.urgentCount, c: 'text-rose-600', i: AlertCircle }, { l: '예상 매출 (₩)', v: `₩${(stats.totalSales/1000000).toFixed(1)}M`, c: 'text-emerald-600', i: DollarSign } ].map((s, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl"><s.i size={22} className={s.c}/></div>
                        <div><p className="text-[10px] font-black text-slate-400 mb-0.5">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>{s.v}</p></div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex space-x-6">
                        <button onClick={() => setActiveTab('CURRENT')} className={`text-sm font-black pb-4 -mb-4 border-b-2 ${activeTab === 'CURRENT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>의뢰 및 생산 현황</button>
                        <button onClick={() => setActiveTab('HISTORY')} className={`text-sm font-black pb-4 -mb-4 border-b-2 ${activeTab === 'HISTORY' ? 'border-slate-600 text-slate-600' : 'border-transparent text-slate-400'}`}>판매 이력</button>
                    </div>
                    <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" placeholder="검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 text-sm font-bold bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-sm"/></div>
                </div>
                <div className="flex-1 overflow-hidden flex flex-col">
                    {loading ? <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div> : 
                    activeTab === 'CURRENT' ? (
                        <div className="flex-1 flex flex-col min-h-0 divide-y divide-slate-200">
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                        <Clock size={12} className="text-indigo-500"/> 진행 중인 의뢰 ({currentData.active.length})
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <MasterDataGrid data={currentData.active} columnDefs={COLUMN_DEFS} onRowClick={row => setSelectedPR(prs.find(p => p.id === row.id))} />
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                        <TrendingUp size={12} className="text-blue-500"/> 생산 진행 중 ({currentData.production.length})
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <MasterDataGrid data={currentData.production} columnDefs={COLUMN_DEFS} onRowClick={row => setSelectedPR(prs.find(p => p.id === row.id))} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-hidden">
                            <MasterDataGrid data={currentData.history} columnDefs={HISTORY_COLUMN_DEFS} onRowClick={row => setSelectedPR(prs.find(p => p.id === row.id))} />
                        </div>
                    )}
                </div>
            </div>

            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)} />
                    <div className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0 text-left">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-xs font-bold animate-pulse">긴급</span>}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2>
                                <p className="text-sm text-slate-500 font-bold">{selectedPR.PartName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"><X size={18}/></button>
                        </div>

                        {/* 사이드바 내부 탭 헤더 */}
                        <div className="flex border-b border-slate-200 bg-white shrink-0">
                            <button
                                onClick={() => setDetailTab('INFO')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black transition-all border-b-2 ${
                                    detailTab === 'INFO' 
                                        ? 'border-blue-600 text-blue-600 bg-blue-50/30' 
                                        : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <ClipboardList size={14} /> 상세 정보
                            </button>
                            <button
                                onClick={() => setDetailTab('MATERIALS')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black transition-all border-b-2 ${
                                    detailTab === 'MATERIALS' 
                                        ? 'border-blue-600 text-blue-600 bg-blue-50/30' 
                                        : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <Package size={14} /> 자재 가용성 (BOM)
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 text-left custom-scrollbar bg-slate-50/50">
                            {detailTab === 'INFO' ? (
                                <div className="space-y-6">
                                    {/* 1. 공통 정보 */}
                                    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4 shadow-sm">
                                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><ClipboardList size={14} className="text-blue-500"/> 공통 정보</h3>
                                        <div className="grid grid-cols-2 gap-y-4 gap-x-3 text-xs">
                                            <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">고객사 (Customer)</p>
                                                <p className="font-black text-indigo-700 text-sm">{selectedPR.CustomerName || '미지정'}</p>
                                            </div>
                                            <div className="pl-1">
                                                <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">대표 납기일</p>
                                                <p className="font-black text-slate-800 text-sm">{selectedPR.DueDate}</p>
                                            </div>
                                            <div className="pl-1">
                                                <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">총 금액</p>
                                                <p className="font-black text-blue-600 text-sm">{selectedPR.Currency === 'USD' ? '$' : '₩'}{(selectedPR.TotalAmount || 0).toLocaleString()}</p>
                                            </div>
                                            <div className="pl-1">
                                                <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">대금 지불 예정일</p>
                                                <p className="font-black text-amber-600 text-sm">{selectedPR.PaymentDate || '-'}</p>
                                            </div>
                                            {selectedPR.Remarks && (
                                                <div className="col-span-2 mt-2 p-3 bg-amber-50/50 rounded-xl border border-amber-200/50">
                                                    <p className="font-black text-amber-800 mb-1 uppercase tracking-tighter text-[10px]">공통 참고사항 (Remarks)</p>
                                                    <p className="font-bold text-slate-700 whitespace-pre-line text-xs">{selectedPR.Remarks}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* 2. 포함된 제품 리스트 (멀티 아이템) */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest px-1 flex items-center gap-2">
                                            <Package size={14} className="text-indigo-500"/> 포함된 제품 ({selectedPR.Items?.length || 1})
                                        </h3>
                                        <div className="space-y-2">
                                            {(selectedPR.Items || [{ 
                                                PartName: selectedPR.PartName, 
                                                PartID: selectedPR.PartID, 
                                                Rev: selectedPR.Rev, 
                                                TargetQty: selectedPR.TargetQty,
                                                Status: selectedPR.Status,
                                                Currency: selectedPR.Currency || 'KRW',
                                                UnitPrice: selectedPR.UnitPrice || 0
                                            }]).map((item, idx) => (
                                                <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <h4 className="text-sm font-black text-slate-800">{item.PartName}</h4>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.PartID} (Rev {item.Rev})</p>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${PR_STATUS[item.Status]?.color || 'bg-slate-50'}`}>
                                                            {PR_STATUS[item.Status]?.label || item.Status}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-[11px] font-bold border-t border-slate-50 pt-3">
                                                        <div className="flex gap-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] text-slate-400 uppercase">수량</span>
                                                                <span className="text-slate-700">{item.TargetQty.toLocaleString()} EA</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] text-slate-400 uppercase">단가</span>
                                                                <span className="text-slate-700">{item.Currency === 'USD' ? '$' : '₩'}{(item.UnitPrice || 0).toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex flex-col">
                                                            <span className="text-[9px] text-slate-400 uppercase">합계</span>
                                                            <span className="text-indigo-600">{item.Currency === 'USD' ? '$' : '₩'}{((item.UnitPrice || 0) * item.TargetQty).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 3. 프로세스 제어 */}
                                    <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3 shadow-sm">
                                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><Settings size={14} className="text-slate-500"/> 프로세스 제어</h3>
                                        
                                        {selectedPR.Status !== 'CANCELLED' && (
                                            <div className="mb-2">
                                                <button onClick={handleERPSync} disabled={selectedPR.ERPSynced} className={`w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors ${selectedPR.ERPSynced ? 'bg-emerald-100 text-emerald-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                                    <Send size={14} /> {selectedPR.ERPSynced ? '이카운트 전송 완료' : '이카운트 연동 (Mock)'}
                                                </button>
                                            </div>
                                        )}

                                        {isPRReadOnly(selectedPR.Status) ? (
                                            <div className="space-y-2">
                                                <p className="text-xs text-slate-400 font-bold text-center py-2 bg-slate-50 rounded-xl">생산/QA 단계 수정 불가</p>
                                                {selectedPR.Status !== 'CANCELLED' && (
                                                    <button 
                                                        onClick={() => setIsCancelModalOpen(true)} 
                                                        className="w-full py-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <ShieldAlert size={14} /> 생산 의뢰 강제 취소
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {selectedPR.Status === 'CONFIRMED' && <button onClick={() => handleStatusChange(selectedPR.id, 'PROD_WAITING', transitionNote)} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black">생산 요청 (전체 품목)</button>}
                                                {selectedPR.Status === 'WAITING_FOR_PARTS' && <button onClick={() => handleStatusChange(selectedPR.id, 'CONFIRMED', '자재 입고 확인 후 수동 확정')} className="w-full py-2.5 bg-amber-600 text-white rounded-xl text-xs font-black">자재 확인 및 의뢰 확정</button>}
                                                {selectedPR.Status === 'SHIP_READY' && <button onClick={() => handleStatusChange(selectedPR.id, 'SHIPPED', transitionNote)} className="w-full py-2.5 bg-green-600 text-white rounded-xl text-xs font-black">출하 완료 처리</button>}
                                                <button 
                                                    onClick={() => setIsCancelModalOpen(true)} 
                                                    className="w-full py-2.5 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 mt-2"
                                                >
                                                    <Trash2 size={14} /> 의뢰 취소 (사유 입력)
                                                </button>
                                            </div>
                                        )}
                                        {PR_STATUS[selectedPR.Status]?.step > 0 && selectedPR.Status !== 'CANCELLED' && (
                                            <button onClick={() => { const steps = Object.entries(PR_STATUS).sort((a,b) => a[1].step - b[1].step); const idx = steps.findIndex(s => s[0] === selectedPR.Status); if (idx > 0) handleStatusChange(selectedPR.id, steps[idx - 1][0]); }} className="w-full py-2.5 bg-white border border-rose-200 text-rose-500 rounded-xl text-xs font-black flex items-center justify-center gap-2 mt-1">
                                                <RotateCcw size={14}/> 이전 단계 복구
                                            </button>
                                        )}
                                    </div>

                                    {/* 4. 공정 변경 이력 */}
                                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                                        <h3 className="text-xs font-black text-slate-700 flex items-center gap-2 mb-4 uppercase tracking-widest"><History size={16} className="text-indigo-600"/> 공정 변경 이력</h3>
                                        <div className="space-y-1">
                                            {selectedPR.Logs && selectedPR.Logs.length > 0 ? selectedPR.Logs.map((log, lidx) => (
                                                <div key={lidx} className="relative pl-6 pb-3 border-l-2 border-slate-100 last:border-0 last:pb-0 flex items-center justify-between group hover:bg-slate-50/50 rounded-r-lg transition-colors">
                                                    <div className="absolute left-[-9px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                    </div>
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <span className="text-[10px] font-black text-indigo-600 px-1.5 py-0.5 bg-indigo-50 rounded border border-indigo-100 uppercase shrink-0 w-[80px] text-center">{PR_STATUS[log.to]?.label || log.to}</span>
                                                        <p className="text-xs font-bold text-slate-700 truncate flex-1">{log.message}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4 shrink-0 ml-4">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">BY: {log.user}</span>
                                                        <span className="text-[10px] text-slate-300 font-bold tabular-nums w-[120px] text-right">{new Date(log.timestamp).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="py-12 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">이력이 없습니다.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in duration-300">
                                    {/* 자재 가용성 현황 (탭 내부) */}
                                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 min-h-[600px] flex flex-col">
                                        <div className="flex justify-between items-center px-1">
                                            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><Package size={14} className="text-amber-500"/> 자재 가용성 현황</h3>
                                            <button onClick={() => fetchSelectedPRDetails(selectedPR)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100">
                                                <RotateCcw size={14}/>
                                            </button>
                                        </div>
                                        
                                        <div className="flex gap-1 overflow-x-auto pb-2 no-scrollbar border-b border-slate-100 shrink-0">
                                            {selectedPRBOM.map((group, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setActiveScheduleTab(idx)}
                                                    className={`px-3 py-1.5 rounded-xl text-left transition-all border-2 shrink-0 flex flex-col gap-0.5 min-w-[120px] ${
                                                        activeScheduleTab === idx
                                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                            : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span className={`px-1 py-0.5 rounded text-[7px] font-black ${activeScheduleTab === idx ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                            {group.ScheduleIdx}차
                                                        </span>
                                                        <span className="text-[9px] font-black truncate max-w-[90px]">
                                                            {group.PartName}
                                                        </span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                                            {selectedPRBOM.length > 0 ? (
                                                <BOMCheckTree 
                                                    data={selectedPRBOM[activeScheduleTab].BOMTree}
                                                    targetQty={selectedPRBOM[activeScheduleTab].SetQty}
                                                    inventoryMap={Object.fromEntries(
                                                        Object.entries(inventory).map(([id, onHand]) => {
                                                            const pid = id.trim().toUpperCase();
                                                            return [
                                                                pid, 
                                                                onHand - (reservedMap[pid] || 0)
                                                            ];
                                                        })
                                                    )}
                                                />
                                            ) : (
                                                <div className="py-24 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">BOM 데이터가 없습니다.</div>
                                            )}
                                        </div>
                                        <div className="pt-4 border-t border-slate-50 mt-auto">
                                            <p className="text-[10px] font-bold text-slate-400 bg-slate-50 p-2 rounded-xl border border-slate-100">* 위 가용성 현황은 선택된 제품의 전체 BOM 구조를 분석하여 하위 서브 어셈블리 및 모든 파트의 가용 수량을 순차 차감 방식으로 계산한 결과입니다.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
            <PRRegistrationModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSave={handleSavePR} />
            <PRCancellationModal 
                isOpen={isCancelModalOpen} 
                onClose={() => setIsCancelModalOpen(false)} 
                onConfirm={handleCancelPR}
                prNumber={selectedPR?.PRNumber}
            />
        </div>
    );
}
