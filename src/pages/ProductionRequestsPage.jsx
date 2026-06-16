import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ClipboardList, Plus, X, AlertCircle, CheckCircle2, Clock, DollarSign,
    ChevronRight, ChevronDown, Layers, Search, Package, Users, TrendingUp, ShieldAlert, UserPlus, History, RotateCcw,
    Send, Trash2, Box, Tag, Settings
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { db, collection, getDocs, doc, updateDoc, addDoc, setDoc, serverTimestamp, query, orderBy, where, writeBatch } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';

// ─────────────────────────────────────────────────────────────
// 상태 및 상수 정의
// ─────────────────────────────────────────────────────────────
const PR_STATUS = {
    DRAFT:           { label: '임시저장',     color: 'bg-slate-100 text-slate-500 border-slate-200',    step: 0 },
    QUOTE_ISSUING:   { label: '견적발행중',   color: 'bg-amber-50 text-amber-600 border-amber-200',     step: 0.5 },
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
    COMPLETED:       { label: '출하완료',     color: 'bg-green-50 text-green-600 border-green-200',     step: 11 },
    completed:       { label: '출하완료',     color: 'bg-green-50 text-green-600 border-green-200',     step: 11 },
    ARCHIVED:        { label: '아카이브',     color: 'bg-slate-50 text-slate-400 border-slate-100',     step: 12 },
    CANCELLED:       { label: '의뢰취소',     color: 'bg-red-50 text-red-600 border-red-200',        step: -1 },
};

const ACTIVE_STATUSES = ['DRAFT', 'QUOTE_ISSUING', 'REVIEW', 'CONFIRMED', 'WAITING_FOR_PARTS'];
const PRODUCTION_STATUSES = ['PROD_WAITING', 'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'];
const HISTORY_STATUSES = ['SHIPPED', 'COMPLETED', 'completed', 'ARCHIVED', 'CANCELLED'];

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
import { inventoryService } from '../services/inventoryService';
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

    // 이메일 스텝
    const [showEmailStep, setShowEmailStep] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const quoteNo = `QUOTE-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;

    useEffect(() => {
        if (!isOpen) return;
        setCommonForm({ CustomerID: '', CustomerName: '', DueDate: '', Remarks: '', Urgent: false, PaymentDate: '' });
        setItems([]);
        setHasCheckedAvailability(false);
        setAvailabilityCheck(null);
        setShowAddCustomer(false);
        setNewCustomerForm({ Name: '', Contact: '', Email: '' });
        setEditingSplitId(null);
        setShowEmailStep(false);
        setEmailRecipients([]);
        setEmailInput('');
        setEmailSubject('');
        setEmailBody('');
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
        
        const newId = Date.now().toString();
        const newItem = {
            ...itemForm,
            id: newId,
            Type: itemType,
            Schedules: [{ id: 'S1', date: commonForm.DueDate, qty: itemForm.TargetQty }]
        };
        setItems(prev => [...prev, newItem]);
        setEditingSplitId(newId); // 추가 즉시 분할납기 패널 자동 오픈
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

    const checkAvailability = () => {
        if (items.length === 0) return alert('추가된 품목이 없습니다.');
        const partsFullMap = {};
        parts.forEach(p => { partsFullMap[p.PartID] = p; });
        const result = productionService.checkMultiItemAvailability(items, inventory, reservedMap, bomMap, partsFullMap);
        setAvailabilityCheck(result);
        setHasCheckedAvailability(true);
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
            setCommonForm(prev => ({ ...prev, CustomerID: docRef.id, CustomerName: newCustomerForm.Name }));
            setShowAddCustomer(false);
        } catch (err) {
            console.error(err);
            alert('고객사 등록 실패');
        } finally {
            setAddingCustomer(false);
        }
    };

    // 견적서 발행 단계로 이동 (유효성 검사)
    const handleShowEmailStep = () => {
        if (!commonForm.CustomerID) return alert('고객사를 선택해주세요.');
        if (!commonForm.DueDate) return alert('납기일을 입력해주세요.');
        if (items.length === 0) return alert('추가된 제품이 없습니다.');
        if (!hasCheckedAvailability) return alert('진행 전 반드시 [자재 가용성 체크]를 완료해주세요.');
        
        for (const item of items) {
            const total = item.Schedules.reduce((acc, cur) => acc + cur.qty, 0);
            if (total !== item.TargetQty) {
                setEditingSplitId(item.id);
                return alert(`[${item.PartName}]의 분할 납기 수량 합계(${total} EA)가 전체 요청 수량(${item.TargetQty} EA)과 일치하지 않습니다.`);
            }
        }

        // 고객사 이메일 자동 연동
        const selectedCustomer = customers.find(c => c.id === commonForm.CustomerID);
        if (selectedCustomer?.Email) {
            setEmailRecipients([selectedCustomer.Email]);
        } else {
            setEmailRecipients([]);
        }

        // 이메일 자동 생성 (본문 내용 보강)
        const currency = items[0]?.Currency === 'USD' ? 'USD' : 'KRW';
        const sym = currency === 'USD' ? '$' : '₩';
        const totalAmt = items.reduce((a, i) => a + i.UnitPrice * i.TargetQty, 0);
        
        const itemRows = items.map((item, i) => {
            const splitInfo = item.Schedules.length > 1 
                ? `\n   (분할 납기: ${item.Schedules.map(s => `${s.date} ${s.qty}EA`).join(', ')})`
                : '';
            return `${i+1}. ${item.PartName} (${item.PartID})
   - 수량: ${item.TargetQty.toLocaleString()} EA
   - 단가: ${sym}${item.UnitPrice.toLocaleString()}
   - 금액: ${sym}${(item.UnitPrice * item.TargetQty).toLocaleString()}${splitInfo}`;
        }).join('\n\n');

        setEmailSubject(`[견적서] ${commonForm.CustomerName} 귀중 - ${quoteNo}`);
        setEmailBody(
`${commonForm.CustomerName} 귀중,

안녕하세요. 귀사의 무궁한 발전을 기원합니다.
요청하신 제품에 대한 견적 내역을 아래와 같이 보내드립니다.

■ 견적 번호: ${quoteNo}
■ 견적 일자: ${new Date().toLocaleDateString('ko-KR')}

[견적 세부 내역]
${itemRows}

--------------------------------------
■ 합계 금액: ${sym}${totalAmt.toLocaleString()} (${currency})
■ 납기 희망일: ${commonForm.DueDate}
■ 비고: ${commonForm.Remarks || '없음'}
--------------------------------------

※ 본 메일은 시스템에서 자동 생성된 견적 내역입니다.
상기 내용 검토 후 회신 부탁드립니다.

감사합니다.`
        );
        setShowEmailStep(true);
    };

    // 공통 저장 함수
    const savePR = async (forceStatus) => {
        setLoading(true);
        try {
            const partsFullMap = {};
            parts.forEach(p => { partsFullMap[p.PartID] = p; });

            // 순차적 재고 차감 로직을 사용하여 실제 부족분 산출
            const availabilityResult = productionService.checkMultiItemAvailability(items, inventory, reservedMap, bomMap, partsFullMap);

            const processedItems = availabilityResult.items.map(item => {
                return {
                    ...item,
                    Status: item.ok ? 'CONFIRMED' : 'WAITING_FOR_PARTS',
                    // Shortages는 checkMultiItemAvailability에서 이미 계산되어 들어있음
                    TotalAmount: item.UnitPrice * item.TargetQty,
                    Schedules: item.Schedules.map(s => ({ 
                        date: s.date, 
                        qty: s.qty, 
                        status: item.ok ? 'PENDING' : 'WAITING_FOR_PARTS', 
                        shippedQty: 0 
                    }))
                };
            });

            const overallStatus = forceStatus || (
                processedItems.some(i => i.Status === 'WAITING_FOR_PARTS') ? 'WAITING_FOR_PARTS' : 'CONFIRMED'
            );

            const prData = {
                ...commonForm,
                Items: processedItems,
                Status: overallStatus,
                TotalAmount: processedItems.reduce((acc, cur) => acc + cur.TotalAmount, 0),
                Currency: processedItems[0]?.Currency || 'KRW',
                QuoteNo: quoteNo,
                Logs: [{ 
                    from: 'NONE', 
                    to: overallStatus, 
                    message: overallStatus === 'QUOTE_ISSUING' 
                        ? `견적서 발행 (번호: ${quoteNo})` 
                        : `견적서 발행 생략 — 직접 생산 의뢰 등록`, 
                    user: userProfile?.displayName || 'Unknown', 
                    timestamp: new Date().toISOString() 
                }]
            };

            const prDoc = await onSave(prData);
            const shortageItems = processedItems.filter(i => i.Status === 'WAITING_FOR_PARTS');

            if (shortageItems.length > 0 && overallStatus !== 'QUOTE_ISSUING') {
                await addDoc(collection(db, 'notifications'), {
                    title: '🚨 자재 부족 알림 (통합 PR)',
                    message: `[${commonForm.CustomerName}] 의뢰 건(${items.length}종) 중 ${shortageItems.length}종의 자재가 부족합니다.`,
                    type: 'SHORTAGE', targetDepts: ['production', 'purchasing'],
                    refID: prDoc?.id, createdAt: serverTimestamp(), read: false
                });
            }
            onClose();
        } catch (err) {
            console.error(err);
            alert('오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 메일 발송 + QUOTE_ISSUING 저장
    const handleSendEmailAndSave = async () => {
        let finalRecipients = [...emailRecipients];
        if (emailInput.trim() && !finalRecipients.includes(emailInput.trim())) {
            finalRecipients.push(emailInput.trim());
        }
        
        if (finalRecipients.length === 0) return alert('수신 이메일 주소를 입력해주세요.');

        const toStr = finalRecipients.join(',');
        const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(toStr)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        window.open(gmailUrl, '_blank');
        await savePR('QUOTE_ISSUING');
    };

    // 보내지 않고 직접 생산 의렌
    const handleSkipEmail = () => {
        if (!hasCheckedAvailability) return alert('생산 등록 전 반드시 [자재 가용성 체크]를 진행해주세요.');
        savePR(null);
    };

    if (!isOpen) return null;


    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 text-left">
            <div className="relative bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-blue-700 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <Send size={22} />
                        <h2 className="text-lg font-black tracking-tight">견적서 발행</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors"><X size={18}/></button>
                </div>

                <div className="flex-1 overflow-hidden grid grid-cols-[360px_1fr] divide-x divide-slate-100 min-h-0">
                    <div className="flex flex-col overflow-y-auto p-5 space-y-5 bg-slate-50/40">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">고객사 선택</label>
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
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">납기 희망일</label>
                                <input 
                                    type="date" 
                                    value={commonForm.DueDate} 
                                    onChange={e => setCommonForm(prev => ({ ...prev, DueDate: e.target.value }))} 
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" 
                                    required 
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">대금 지불 예정일</label>
                                <input 
                                    type="date" 
                                    value={commonForm.PaymentDate} 
                                    onChange={e => setCommonForm(prev => ({ ...prev, PaymentDate: e.target.value }))} 
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none" 
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                            <input 
                                type="checkbox" 
                                id="urgent-check"
                                checked={commonForm.Urgent} 
                                onChange={e => setCommonForm(prev => ({ ...prev, Urgent: e.target.checked }))}
                                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                            />
                            <label htmlFor="urgent-check" className="text-sm font-bold text-slate-600 cursor-pointer flex items-center gap-1.5">
                                <span className="text-rose-500">🔴</span> 긴급 생산
                            </label>
                        </div>
                        <div className="border-t border-dashed border-slate-200"/>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Plus size={15} className="text-indigo-600"/>
                                <h3 className="text-xs font-black text-slate-800">제품 항목 추가</h3>
                            </div>
                            <div className="space-y-3 bg-white border-2 border-dashed border-slate-200 p-4 rounded-2xl">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">분류</label>
                                    <select
                                        value={itemType}
                                        onChange={e => { setItemType(e.target.value); resetItemForm(); }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="PRODUCT">완제품</option>
                                        <option value="SUB_ASSY">반조립품</option>
                                        <option value="PART">부품</option>
                                        <option value="ACC">액세서리</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">제품명</label>
                                        <select
                                            value={filteredParts.find(p => (p.MasterPartID || p.PartID.split('-').slice(0,-1).join('-')) === selectedMasterID)?.id || ''}
                                            onChange={e => handlePartSelect(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">제품 선택</option>
                                            {filteredParts.map(p => <option key={p.id} value={p.id}>[{p.PartID}] {p.Name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">버전</label>
                                        <select
                                            value={itemForm.PartDocID}
                                            onChange={e => handleVersionSelect(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none"
                                            disabled={!selectedMasterID}
                                        >
                                            {availableVersions.map(v => (
                                                <option key={v.id} value={v.id}>{v.Rev || '0.0'}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-end">
                                    <div className="space-y-1 w-20 shrink-0">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">수량</label>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            value={itemForm.TargetQty} 
                                            onChange={e => setItemForm(prev => ({ ...prev, TargetQty: parseInt(e.target.value) || 0 }))} 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">통화 / 단가</label>
                                        <div className="flex gap-1">
                                            <select
                                                value={itemForm.Currency}
                                                onChange={e => setItemForm(prev => ({ ...prev, Currency: e.target.value }))}
                                                className="w-16 bg-slate-50 border border-slate-200 rounded-xl px-1 py-2 text-[10px] font-black outline-none shrink-0"
                                            >
                                                <option value="KRW">KRW</option>
                                                <option value="USD">USD</option>
                                            </select>
                                            <input 
                                                type="number" 
                                                min="0" 
                                                value={itemForm.UnitPrice} 
                                                onChange={e => setItemForm(prev => ({ ...prev, UnitPrice: parseFloat(e.target.value) || 0 }))} 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={addItem}
                                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100"
                                >
                                    <Plus size={14}/> 품목 목록에 추가
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col min-h-0 overflow-y-auto p-5 space-y-4">
                        <div className="flex justify-between items-center shrink-0">
                            <h3 className="text-xs font-black text-slate-700 flex items-center gap-2">
                                <Tag size={14} className="text-blue-500"/> 견적 품목 목록 ({items.length})
                            </h3>
                            <button 
                                type="button" 
                                onClick={checkAvailability}
                                className="text-[10px] font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                                <ShieldAlert size={12}/> 자재 가용성 체크
                            </button>
                        </div>

                        {availabilityCheck && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 shrink-0">
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${availabilityCheck.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                    {availabilityCheck.ok ? <CheckCircle2 size={15}/> : <AlertCircle size={15}/>}
                                    <span className="text-xs font-black">
                                        {availabilityCheck.ok ? '모든 항목의 자재 재고가 충분합니다.' : '일부 항목의 자재가 부족합니다. 상세 내용을 확인하세요.'}
                                    </span>
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
                                                            생산 가능: {res.canMake} EA / 부족: {res.shortage} EA
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
                                                            <div className="flex items-center gap-2">
                                                                <ShieldAlert size={11} className="text-rose-400"/>
                                                                <p className="text-[10px] font-black text-rose-400 uppercase">최종 자재 부족 내역 (Critical Shortages)</p>
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
                                                                        <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">부족: {s.req - s.has} EA</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="py-2 px-1 flex items-center gap-2">
                                                            <CheckCircle2 size={12} className="text-emerald-500"/>
                                                            <p className="text-[10px] font-bold text-emerald-600">재고 및 하위 조립품 생산 가능량을 종합한 결과, 전체 생산이 가능합니다.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white shrink-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                        <th className="px-4 py-3">유형</th>
                                        <th className="px-4 py-3">제품 정보</th>
                                        <th className="px-4 py-3 text-right">수량</th>
                                        <th className="px-4 py-3 text-right">합계</th>
                                        <th className="px-4 py-3 text-center">납기/삭제</th>
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
                                                    <td className="px-4 py-3 text-right text-xs font-black text-indigo-600">{item.Currency === 'USD' ? '$' : '₩'}{(item.UnitPrice * item.TargetQty).toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button 
                                                                type="button"
                                                                onClick={() => setEditingSplitId(editingSplitId === item.id ? null : item.id)}
                                                                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${editingSplitId === item.id ? 'bg-indigo-600 text-white' : 'text-indigo-500 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100'}`}
                                                            >
                                                                분할납기
                                                            </button>
                                                            <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {editingSplitId === item.id && (
                                                    <>
                                                        {item.Schedules.map((s, sidx) => {
                                                            const isLastSchedule = sidx === item.Schedules.length - 1;
                                                            return (
                                                                <tr key={s.id} className="bg-indigo-50/20 animate-in fade-in">
                                                                    <td colSpan="5" className={`pl-8 pr-4 py-1.5 ${isLastSchedule ? 'border-b border-indigo-100' : ''}`}>
                                                                        <div className="flex items-center gap-2 ml-4">
                                                                            {/* 트리 연결선 */}
                                                                            <div className="flex flex-col items-center self-stretch shrink-0 w-4">
                                                                                <div className={`w-px bg-indigo-200 ${sidx === 0 ? 'mt-2' : ''} ${isLastSchedule ? 'h-1/2' : 'flex-1'}`}/>
                                                                                <div className="w-3 h-px bg-indigo-200 self-end"/>
                                                                            </div>
                                                                            {/* 회차 뱃지 */}
                                                                            <span className="text-[10px] font-black text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
                                                                                {sidx + 1}차
                                                                            </span>
                                                                            {/* 날짜 */}
                                                                            <input
                                                                                type="date"
                                                                                value={s.date}
                                                                                onChange={e => updateSplitSchedule(item.id, s.id, 'date', e.target.value)}
                                                                                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-400"
                                                                            />
                                                                            {/* 수량 */}
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={s.qty}
                                                                                onChange={e => updateSplitSchedule(item.id, s.id, 'qty', e.target.value)}
                                                                                className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-black text-right outline-none focus:ring-1 focus:ring-indigo-400"
                                                                            />
                                                                            <span className="text-[10px] text-slate-400 font-bold">EA</span>
                                                                            {/* 삭제 */}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeSplitSchedule(item.id, s.id)}
                                                                                disabled={item.Schedules.length <= 1}
                                                                                className="text-slate-300 hover:text-rose-500 disabled:opacity-20"
                                                                            >
                                                                                <X size={12}/>
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        {/* 추가 & 합계 행 */}
                                                        <tr className="border-b border-indigo-100">
                                                            <td colSpan="5" className="pl-16 pr-4 py-1.5 bg-indigo-50/10">
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => addSplitSchedule(item.id)}
                                                                        className="flex items-center gap-1 text-[10px] font-black text-indigo-500 hover:text-indigo-700 transition-colors"
                                                                    >
                                                                        <Plus size={11}/> 일정 추가
                                                                    </button>
                                                                    <span className="text-slate-200">|</span>
                                                                    <span className={`text-[10px] font-black ${isSplitError ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                                        {isSplitError
                                                                            ? `⚠ 합계 ${totalScheduled} / ${item.TargetQty} EA — 불일치`
                                                                            : `✓ 합계 ${totalScheduled} EA — 수량 일치`
                                                                        }
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    </>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="px-4 py-12 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">
                                                왼쪽에서 제품을 추가하면 여기에 표시됩니다
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* 공통 참고사항 */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase block pl-1">공통 참고사항 (Remarks)</label>
                            <textarea
                                value={commonForm.Remarks}
                                onChange={e => setCommonForm(prev => ({ ...prev, Remarks: e.target.value }))}
                                placeholder="작업 지시나 특이사항을 입력하세요..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold h-20 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="text-xs font-bold text-slate-400">
                        {items.length > 0
                            ? `총 ${items.length}종 • 합계 ${items.reduce((a, i) => a + i.UnitPrice * i.TargetQty, 0).toLocaleString()} ${items[0]?.Currency === 'USD' ? 'USD' : 'KRW'}`
                            : '추가된 품목이 없습니다'}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">취소</button>
                        <button onClick={handleShowEmailStep} disabled={loading || items.length === 0} className={`px-8 py-2.5 rounded-xl text-sm font-black text-white transition-all shadow-lg ${loading || items.length === 0 ? 'bg-slate-300 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}>
                            견적서 발행
                        </button>
                    </div>
                </div>

                {/* ─── 이메일 스텝 오버레이 ─── */}
                {showEmailStep && (
                    <div className="absolute inset-0 bg-white rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* 헤더 */}
                        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shrink-0">
                            <div className="flex items-center gap-3">
                                <Send size={20}/>
                                <div>
                                    <h2 className="text-base font-black tracking-tight">견적서 이메일 발행</h2>
                                    <p className="text-[11px] text-violet-200 font-bold">{quoteNo}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowEmailStep(false)} className="px-3 py-1.5 hover:bg-white/20 rounded-xl transition-colors text-xs font-black flex items-center gap-1">
                                    <ChevronDown size={14}/> 수정하기
                                </button>
                                <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                                    <X size={18}/>
                                </button>
                            </div>
                        </div>

                        {/* 2컬럼: 견적서 미리보기 | 이메일 작성 */}
                        <div className="flex-1 overflow-hidden grid grid-cols-[1fr_420px] divide-x divide-slate-100 min-h-0">

                            {/* 왼쪽: 견적서 미리보기 */}
                            <div className="overflow-y-auto p-6 bg-slate-50">
                                <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                                    {/* 견적서 헤더 */}
                                    <div className="flex justify-between items-start mb-8">
                                        <div>
                                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">견 적 서</h1>
                                            <p className="text-xs font-bold text-slate-400 mt-1">QUOTATION</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase">견적 번호</p>
                                            <p className="text-xs font-black text-indigo-600">{quoteNo}</p>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1">발행일: {new Date().toLocaleDateString('ko-KR')}</p>
                                        </div>
                                    </div>

                                    {/* 고객사 정보 */}
                                    <div className="bg-slate-50 rounded-xl p-4 mb-6">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">수신처</p>
                                        <p className="text-base font-black text-slate-800">{commonForm.CustomerName} 귀중</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1">납기 희망일: <span className="text-indigo-600">{commonForm.DueDate}</span></p>
                                        {commonForm.Urgent && <span className="inline-block mt-1 px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-black rounded">🔴 긴급</span>}
                                    </div>

                                    {/* 품목 테이블 */}
                                    <table className="w-full text-left text-xs border-collapse mb-6">
                                        <thead>
                                            <tr className="border-b-2 border-slate-800">
                                                <th className="pb-2 font-black text-slate-600">No</th>
                                                <th className="pb-2 font-black text-slate-600">품목명</th>
                                                <th className="pb-2 font-black text-slate-600 text-right">수량</th>
                                                <th className="pb-2 font-black text-slate-600 text-right">단가</th>
                                                <th className="pb-2 font-black text-slate-600 text-right">금액</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, idx) => {
                                                const sym = item.Currency === 'USD' ? '$' : '₩';
                                                return (
                                                    <tr key={item.id} className="border-b border-slate-100">
                                                        <td className="py-2.5 text-slate-400 font-bold">{idx + 1}</td>
                                                        <td className="py-2.5">
                                                            <p className="font-black text-slate-800">{item.PartName}</p>
                                                            <p className="text-[10px] text-slate-400 font-bold">{item.PartID} · Rev {item.Rev}</p>
                                                            {item.Schedules.length > 1 && (
                                                                <div className="mt-1 space-y-0.5">
                                                                    {item.Schedules.map((s, si) => (
                                                                        <p key={s.id} className="text-[10px] text-indigo-500 font-bold">└ {si+1}차 납기: {s.date} · {s.qty} EA</p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 text-right font-bold text-slate-700">{item.TargetQty.toLocaleString()} EA</td>
                                                        <td className="py-2.5 text-right font-bold text-slate-700">{sym}{item.UnitPrice.toLocaleString()}</td>
                                                        <td className="py-2.5 text-right font-black text-indigo-600">{sym}{(item.UnitPrice * item.TargetQty).toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* 합계 */}
                                    <div className="flex justify-end">
                                        <div className="bg-indigo-50 rounded-xl px-6 py-3 text-right">
                                            <p className="text-[10px] font-black text-indigo-400 uppercase">합계 금액</p>
                                            <p className="text-xl font-black text-indigo-700">
                                                {items[0]?.Currency === 'USD' ? '$' : '₩'}{items.reduce((a, i) => a + i.UnitPrice * i.TargetQty, 0).toLocaleString()}
                                                <span className="text-xs ml-1 text-indigo-400">{items[0]?.Currency || 'KRW'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* 비고 */}
                                    {commonForm.Remarks && (
                                        <div className="mt-6 pt-4 border-t border-slate-100">
                                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">비고</p>
                                            <p className="text-xs font-bold text-slate-600">{commonForm.Remarks}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 오른쪽: 이메일 작성 */}
                            <div className="flex flex-col overflow-y-auto p-6 space-y-4">
                                <h3 className="text-sm font-black text-slate-700">이메일 작성</h3>

                                {/* 받는 사람 */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">받는 사람</label>
                                    <div className="bg-white border border-slate-200 rounded-xl p-2 min-h-10 flex flex-wrap gap-1.5">
                                        {emailRecipients.map((r, i) => (
                                            <span key={i} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[11px] font-black px-2 py-0.5 rounded-lg">
                                                {r}
                                                <button type="button" onClick={() => setEmailRecipients(prev => prev.filter((_, idx) => idx !== i))} className="text-indigo-400 hover:text-indigo-700">
                                                    <X size={10}/>
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="email"
                                            placeholder="이메일 입력 후 Enter"
                                            value={emailInput}
                                            onChange={e => setEmailInput(e.target.value)}
                                            onKeyDown={e => {
                                                if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) {
                                                    e.preventDefault();
                                                    setEmailRecipients(prev => [...prev, emailInput.trim()]);
                                                    setEmailInput('');
                                                }
                                            }}
                                            className="flex-1 min-w-32 outline-none text-[11px] font-bold text-slate-700 bg-transparent"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400">Enter 또는 쉼표로 구분하여 여러 명 추가</p>
                                </div>

                                {/* 제목 */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">이메일 제목</label>
                                    <input
                                        type="text"
                                        value={emailSubject}
                                        onChange={e => setEmailSubject(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                </div>

                                {/* 본문 */}
                                <div className="space-y-1.5 flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase">이메일 내용</label>
                                    <textarea
                                        value={emailBody}
                                        onChange={e => setEmailBody(e.target.value)}
                                        className="w-full h-64 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                                    />
                                </div>

                                {/* 버튼 */}
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <button
                                        onClick={handleSendEmailAndSave}
                                        disabled={loading || emailRecipients.length === 0}
                                        className={`w-full py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all shadow-lg ${loading || emailRecipients.length === 0 ? 'bg-slate-300 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
                                    >
                                        <Send size={15}/> 메일 발송 및 견적서 발행
                                    </button>
                                    <button
                                        onClick={handleSkipEmail}
                                        disabled={loading}
                                        className="w-full py-2.5 rounded-xl text-sm font-black text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                                    >
                                        견적서 발행 생략 — 바로 생산 의뢰 등록
                                    </button>
                                    {!hasCheckedAvailability && (
                                        <p className="text-center text-[11px] text-amber-600 font-bold">⚠ 생략 시 자재 가용성 체크가 필요합니다</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
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
            const loadedPrs = prSnap.docs.map(d => {
                const data = d.data();
                let createdAtStr = '-';
                if (data.CreatedAt) {
                    if (data.CreatedAt.toDate) {
                        createdAtStr = data.CreatedAt.toDate().toISOString().split('T')[0];
                    } else if (typeof data.CreatedAt === 'string') {
                        createdAtStr = data.CreatedAt.split('T')[0];
                    } else if (data.CreatedAt.seconds) {
                        createdAtStr = new Date(data.CreatedAt.seconds * 1000).toISOString().split('T')[0];
                    }
                }

                // Derive items-based properties if missing or for consistency
                const items = data.Items || [];
                let partName = data.PartName || '';
                let targetQty = data.TargetQty || 0;
                let unitPrice = data.UnitPrice || 0;
                let totalAmount = data.TotalAmount || 0;

                if (items.length > 0) {
                    if (items.length === 1) {
                        partName = items[0].PartName || items[0].Name || partName;
                        targetQty = items[0].TargetQty || items[0].Qty || targetQty;
                        unitPrice = items[0].UnitPrice || unitPrice;
                        totalAmount = items[0].TotalAmount || items[0].Amount || (items[0].UnitPrice * items[0].TargetQty) || totalAmount;
                    } else {
                        const firstItemName = items[0].PartName || items[0].Name || '';
                        partName = `${firstItemName} 외 ${items.length - 1}종`;
                        targetQty = items.reduce((acc, cur) => acc + (cur.TargetQty || cur.Qty || 0), 0);
                        unitPrice = '-';
                        totalAmount = data.TotalAmount || items.reduce((acc, cur) => acc + (cur.UnitPrice * (cur.TargetQty || cur.Qty || 0)), 0);
                    }
                }

                return { 
                    id: d.id, 
                    ...data, 
                    CreatedAt: createdAtStr,
                    PartName: partName,
                    TargetQty: targetQty,
                    UnitPrice: unitPrice,
                    TotalAmount: totalAmount
                };
            });
            setPrs(loadedPrs);
            setPartsList(partsSnap.docs.map(d => d.data()));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const [globalShortages, setGlobalShortages] = useState({});

    const fetchSelectedPRDetails = async (pr) => {
        if (!pr) return;
        setActiveScheduleTab(0);
        setSelectedPRBOM([]);
        setGlobalShortages({});
        
        try {
            // 대기열 시뮬레이션 실행 (FIFO 기반)
            const simulation = await productionService.getQueueSimulation(pr.id);
            if (!simulation || !simulation.targetPR) {
                console.warn("No simulation results for PR:", pr.id);
                return;
            }

            setGlobalShortages(simulation.globalShortages);
            setInventory(simulation.inventorySnapshot);

            const structuredData = simulation.targetPR.simulationItems.map((res, idx) => ({
                id: res.id || `${pr.id}-${idx}`,
                PartName: res.PartName || res.Name || res.PartID,
                ScheduleIdx: res.ScheduleIdx || (idx + 1),
                SetQty: res.TargetQty,
                BOMTree: res.bomTree 
            }));

            setSelectedPRBOM(structuredData);
        } catch (err) { 
            console.error("Error in fetchSelectedPRDetails:", err); 
        }
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

    const handlePaymentComplete = async (prId, totalAmount) => {
        try {
            const updateData = { 
                PaymentStatus: 'PAID', 
                AmountPaid: totalAmount,
                PaymentDate: new Date().toISOString(),
                UpdatedAt: serverTimestamp() 
            };
            await updateDoc(doc(db, 'production_requests', prId), updateData);
            await fetchPRs();
            if (selectedPR?.id === prId) setSelectedPR(prev => ({ ...prev, ...updateData }));
        } catch (err) { console.error(err); }
    };

    const handleShipment = async (prId) => {
        const pr = prs.find(p => p.id === prId);
        if (!pr) return;
        
        try {
            const batch = writeBatch(db);
            const updateData = { Status: 'SHIPPED', UpdatedAt: serverTimestamp() };
            
            const logEntry = {
                from: pr.Status, to: 'SHIPPED',
                message: '제품 출하 완료',
                user: userProfile?.displayName || 'Unknown',
                timestamp: new Date().toISOString()
            };
            updateData.Logs = [logEntry, ...(pr.Logs || [])];
            
            const prRef = doc(db, 'production_requests', prId);
            batch.update(prRef, updateData);
            
            if (pr.Items && pr.Items.length > 0) {
                for (const item of pr.Items) {
                    await inventoryService.addTransaction({
                        PartID: item.PartID,
                        Type: 'Out',
                        Quantity: item.TargetQty,
                        Reason: '완제품 출하',
                        RefDoc: pr.PRNumber || pr.id
                    }, batch);
                }
            } else {
                await inventoryService.addTransaction({
                    PartID: pr.PartID,
                    Type: 'Out',
                    Quantity: pr.TargetQty,
                    Reason: '완제품 출하',
                    RefDoc: pr.PRNumber || pr.id
                }, batch);
            }
            
            await batch.commit();
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
                    <MasterDataGrid 
                        data={(activeTab === 'CURRENT' ? [...currentData.active, ...currentData.production] : currentData.history).map(pr => {
                            const currency = pr.Currency || 'KRW';
                            const formatVal = (val, isPrice = false) => {
                                if (val === '-') return '-';
                                if (typeof val !== 'number') return val;
                                if (isPrice) {
                                    if (currency === 'USD') {
                                        return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                    }
                                    return `₩${val.toLocaleString()}`;
                                }
                                return `${val.toLocaleString()} EA`;
                            };
                            return {
                                ...pr,
                                TargetQty: formatVal(pr.TargetQty),
                                UnitPrice: formatVal(pr.UnitPrice, true),
                                TotalAmount: formatVal(pr.TotalAmount, true),
                                Status: PR_STATUS[pr.Status]?.label || pr.Status
                            };
                        })}
                        columnDefs={COLUMN_DEFS}
                        onRowClick={row => setSelectedPR(prs.find(p => p.id === row.id))}
                        cellRenderer={{
                            Status: (val, row) => {
                                const rawStatus = Object.keys(PR_STATUS).find(k => PR_STATUS[k].label === val) || row.Status || val;
                                const statusInfo = PR_STATUS[rawStatus] || { label: val, color: 'bg-slate-100 text-slate-500 border-slate-200' };
                                return (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${statusInfo.color}`}>
                                        {statusInfo.label}
                                    </span>
                                );
                            }
                        }}
                    />}
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


                                    {/* ─── 추가된 납기 안전도 및 결제 정보 ─── */}
                                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
                                        {/* 안전도 */}
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">배송 예정일 안전도</span>
                                            {(() => {
                                                const diffTime = new Date(selectedPR.DueDate).getTime() - new Date().getTime();
                                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                let safeStatus = { label: '여유', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <CheckCircle2 size={14}/> };
                                                if (diffDays < 0) safeStatus = { label: '지연 (위험)', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: <AlertCircle size={14}/> };
                                                else if (diffDays <= 3) safeStatus = { label: '임박 (주의)', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: <ShieldAlert size={14}/> };
                                                
                                                return (
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1.5 ${safeStatus.color}`}>
                                                            {safeStatus.icon} {safeStatus.label}
                                                        </span>
                                                        <span className="text-xs font-bold text-slate-500">
                                                            {diffDays < 0 ? `납기일로부터 ${Math.abs(diffDays)}일 지남` : `납기일까지 ${diffDays}일 남음`}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="h-px bg-slate-100" />

                                        {/* 입금 정보 */}
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><DollarSign size={12}/> 대금 입금 여부</span>
                                                {selectedPR.PaymentStatus !== 'PAID' && (
                                                    <button 
                                                        onClick={() => {
                                                            if (window.confirm('대금 입금 처리를 완료하시겠습니까?')) {
                                                                handlePaymentComplete(selectedPR.id, selectedPR.TotalAmount || 0);
                                                            }
                                                        }}
                                                        className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] font-black transition-colors"
                                                    >
                                                        입금 확인 처리
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${selectedPR.PaymentStatus === 'PAID' ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                                    <span className={`text-xs font-black ${selectedPR.PaymentStatus === 'PAID' ? 'text-blue-700' : 'text-slate-500'}`}>
                                                        {selectedPR.PaymentStatus === 'PAID' ? '입금 완료' : '미입금 (대기중)'}
                                                    </span>
                                                </div>
                                                <div className="text-sm font-black text-slate-800">
                                                    {(selectedPR.AmountPaid || 0).toLocaleString()} <span className="text-[10px] text-slate-400 font-bold">{selectedPR.Currency || 'KRW'}</span>
                                                    <span className="mx-2 text-slate-300">/</span>
                                                    <span className="text-xs text-slate-400">총 {(selectedPR.TotalAmount || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedPR.Status === 'QUOTE_ISSUING' && (
                                        <button 
                                            onClick={() => handleStatusChange(selectedPR.id, 'REVIEW')}
                                            className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all animate-in zoom-in-95"
                                        >
                                            <TrendingUp size={18}/> 생산 검토 요청
                                        </button>
                                    )}

                                    {selectedPR.Status === 'QA_COMPLETE' && (
                                        <button 
                                            onClick={() => {
                                                if (window.confirm('출하를 진행하시겠습니까?\n(상태가 출하 완료로 변경되며 이력으로 이동됩니다)')) {
                                                    handleShipment(selectedPR.id);
                                                }
                                            }}
                                            className="w-full py-3 bg-teal-600 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-teal-100 hover:bg-teal-700 transition-all animate-in zoom-in-95"
                                        >
                                            <Package size={18}/> 출하 진행 (SHIPPING)
                                        </button>
                                    )}

                                    {selectedPR.Items?.map((item, idx) => {
                                        const schedules = item.Schedules && item.Schedules.length > 0 
                                            ? item.Schedules 
                                            : [{ date: item.DueDate || selectedPR.DueDate, qty: item.TargetQty, status: item.Status || selectedPR.Status }];

                                        return (
                                            <div key={idx} className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm space-y-3">
                                                <div className="flex justify-between border-b border-slate-50 pb-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-800">{item.PartName}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{item.PartID}</span>
                                                    </div>
                                                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">총 {item.TargetQty} EA</span>
                                                </div>
                                                
                                                <div className="space-y-1.5">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">배송 및 진행 상태</span>
                                                    {schedules.map((sched, sidx) => {
                                                        const statusKey = sched.status || item.Status || selectedPR.Status || 'DRAFT';
                                                        const statusInfo = PR_STATUS[statusKey] || { label: statusKey, color: 'bg-slate-100 text-slate-500 border-slate-200' };
                                                        return (
                                                            <div key={sidx} className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 text-[10px]">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="font-black text-slate-800">{sidx + 1}차 배송:</span>
                                                                    <span className="font-bold text-slate-500">{sched.date}</span>
                                                                    <span className="font-black text-indigo-600">({sched.qty} EA)</span>
                                                                </div>
                                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${statusInfo.color}`}>
                                                                    {statusInfo.label}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : detailTab === 'MATERIALS' ? (
                                <div className="space-y-4 h-full flex flex-col min-h-0">
                                    {selectedPRBOM && selectedPRBOM.length > 0 ? (
                                        <>
                                            {/* 대기열 요약 정보 (FIFO 알림) */}
                                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 shrink-0">
                                                <div className="flex items-start gap-2.5">
                                                    <ShieldAlert size={16} className="text-amber-600 mt-0.5" />
                                                    <div className="flex-1">
                                                        <h4 className="text-[11px] font-black text-amber-800 uppercase tracking-tight">전사 생산 대기열 시뮬레이션 (FIFO)</h4>
                                                        <p className="text-[10px] text-amber-700/80 font-bold leading-relaxed mt-0.5">
                                                            이 정보는 등록일 순서에 따른 실시간 자재 예약 현황입니다. 
                                                            나보다 먼저 등록된 주문들이 자재를 우선 점유하며, 아래 트리는 그 결과가 반영된 수치입니다.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-100 shrink-0">
                                                {selectedPRBOM.map((g, i) => (
                                                    <button 
                                                        key={i} 
                                                        onClick={() => setActiveScheduleTab(i)} 
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black shrink-0 transition-all ${activeScheduleTab === i ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                                    >
                                                        {g.ScheduleIdx}차 ({g.SetQty}EA)
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex-1 overflow-y-auto">
                                                {selectedPRBOM[activeScheduleTab] && selectedPRBOM[activeScheduleTab].BOMTree ? (
                                                    <BOMCheckTree 
                                                        data={selectedPRBOM[activeScheduleTab].BOMTree} 
                                                        targetQty={selectedPRBOM[activeScheduleTab].SetQty} 
                                                        inventoryMap={inventory} 
                                                        globalShortages={globalShortages}
                                                    />
                                                ) : (
                                                    <div className="py-24 text-center text-xs font-bold text-slate-300">BOM 데이터를 구성할 수 없습니다.</div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="py-24 text-center">
                                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 mb-4">
                                                <Package size={24} className="text-slate-200" />
                                            </div>
                                            <p className="text-sm font-black text-slate-300 uppercase tracking-widest">BOM 데이터 로딩 중이거나 없습니다</p>
                                        </div>
                                    )}
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
