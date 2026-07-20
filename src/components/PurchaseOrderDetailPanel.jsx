import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShoppingCart, Calendar, Truck, DollarSign, PackageCheck, ChevronRight, CheckCircle2, Clock, AlertCircle, FileText, Edit, Mail, ShieldCheck, CreditCard, Send, Plus, FileCheck } from 'lucide-react';
import { updateDoc, doc, writeBatch, serverTimestamp, collection, setDoc, getDoc } from '../database';
import { db } from '../database';
import { useAuth } from '../contexts/AuthContext';
import { qualityService } from '../services/qualityService';
import { createNotification } from '../services/notificationService';
import ExpenseResolutionModal from './ExpenseResolutionModal';
import ApprovalModal from './ApprovalModal';
import RFQEmailModal from './RFQEmailModal';
import QuotationUploadModal from './QuotationUploadModal';
import ApprovalReviewModal from './ApprovalReviewModal';

const PO_STATUS_INFO = {
    DRAFT: { label: '발주 초안', color: 'bg-slate-100 text-slate-500 border-slate-200' },
    RFQ_SENT: { label: '견적 대기 중', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    QUOTED: { label: '견적 완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    APPROVAL_PENDING: { label: '기안서 결재 중', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    APPROVED: { label: '결재 완료', color: 'bg-rose-50 text-rose-600 border-rose-200' },
    ORDERING: { label: '발주 요청 (PO)', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    WAITING_DELIVERY: { label: '입고 대기', color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
    WAITING_INSPECTION: { label: '수입 검사 중', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사 완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    RESOLUTION_SUBMITTED: { label: '지출결의 완료', color: 'bg-slate-900 text-white border-slate-900' },
    RECEIVED: { label: '재고 적재 완료', color: 'bg-slate-50 text-slate-400 border-slate-100' },
    COMPLETED: { label: '재고 적재 완료', color: 'bg-slate-50 text-slate-400 border-slate-100' }
};

const PAYMENT_STATUS_INFO = {
    PENDING: { label: '결제 대기', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    INVOICED: { label: '청구됨 (지출결의 필요)', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    PAID: { label: '지급 완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' }
};

const generatePONumber = () => {
    const date = new Date();
    return `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
};

export default function PurchaseOrderDetailPanel({ po, isOpen, onClose, onRefresh, onEdit }) {
    const { userProfile } = useAuth();
    
    // receiveQtys[itemId] = quantity to receive
    const [receiveQtys, setReceiveQtys] = useState({});
    const [memo, setMemo] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Modals state
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [isRFQModalOpen, setIsRFQModalOpen] = useState(false);
    const [isQuoteUploadOpen, setIsQuoteUploadOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [rfqMode, setRfqMode] = useState('RFQ'); // 'RFQ' or 'ORDER'
    const [activeApproval, setActiveApproval] = useState(null);

    useEffect(() => {
        if (po && isOpen) {
            // Initialize receive qtys to 0
            const initialQtys = {};
            const items = po.Items || [];
            
            // Backward compatibility
            if (items.length === 0 && po.PartID) {
                const rem = po.Qty - (po.ReceivedQty || 0);
                initialQtys['legacy'] = rem > 0 ? rem : '';
            } else {
                items.forEach(item => {
                    const rem = item.Qty - (item.ReceivedQty || 0);
                    initialQtys[item.id] = rem > 0 ? rem : '';
                });
            }
            setReceiveQtys(initialQtys);

            // Fetch approval info if pending
            if (po.Status === 'APPROVAL_PENDING' && po.LastApprovalID) {
                getDoc(doc(db, 'approvals', po.LastApprovalID)).then(snap => {
                    if (snap.exists()) setActiveApproval({ id: snap.id, ...snap.data() });
                });
            }
        }
    }, [po, isOpen]);

    if (!isOpen || !po) return null;

    const items = po.Items && po.Items.length > 0 ? po.Items : [{
        id: 'legacy',
        PartID: po.PartID,
        PartName: po.PartName,
        Qty: po.Qty || 0,
        UnitPrice: po.UnitPrice || 0,
        ReceivedQty: po.ReceivedQty || 0
    }];

    const totalQty = items.reduce((sum, item) => sum + item.Qty, 0);
    const totalReceived = items.reduce((sum, item) => sum + (item.ReceivedQty || 0), 0);
    const totalRemaining = totalQty - totalReceived;

    const handleUpdatePOStatus = async (status, extra = {}) => {
        setLoading(true);
        try {
            let finalExtra = { ...extra };
            if (status === 'ORDERING' && (!po.PONumber || po.PONumber === '-')) {
                finalExtra.PONumber = generatePONumber();
            }

            const batch = writeBatch(db);
            const poRef = doc(db, 'purchasing', po.id);
            
            batch.update(poRef, { 
                Status: status, 
                ...finalExtra, 
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });

            // 단가 확정 시 부품 마스터의 최종 단가도 함께 업데이트
            if (status === 'QUOTED' && finalExtra.Items) {
                for (const item of finalExtra.Items) {
                    if (item.PartID && item.UnitPrice !== undefined) {
                        const partRef = doc(db, 'parts', item.PartID);
                        batch.update(partRef, {
                            UnitPrice: item.UnitPrice,
                            LastUpdated: serverTimestamp()
                        });
                    }
                }
            }
            
            await batch.commit();
            
            if (onRefresh) await onRefresh();
        } catch (error) {
            console.error("Status update failed:", error);
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleReceiveSubmit = async (e) => {
        e.preventDefault();

        const receiveActions = [];
        let totalReceivingNow = 0;

        for (const item of items) {
            const qtyStr = receiveQtys[item.id];
            if (!qtyStr) continue;
            
            const qtyToReceive = parseInt(qtyStr);
            if (isNaN(qtyToReceive) || qtyToReceive <= 0) continue;
            
            const remaining = item.Qty - (item.ReceivedQty || 0);
            if (qtyToReceive > remaining) {
                return alert(`${item.PartName}의 남은 수량(${remaining}개)을 초과할 수 없습니다.`);
            }

            receiveActions.push({
                item,
                qty: qtyToReceive
            });
            totalReceivingNow += qtyToReceive;
        }

        if (receiveActions.length === 0) {
            return alert('입고할 수량을 1개 이상 입력해주세요.');
        }

        if (!window.confirm(`총 ${totalReceivingNow}개의 품목을 입고 처리하시겠습니까?\n처리된 수량은 즉시 QA 검사 대기열로 이관됩니다.`)) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            
            // 1. Calculate new state for items
            const newItems = items.map(item => {
                const action = receiveActions.find(a => a.item.id === item.id);
                if (action) {
                    return { ...item, ReceivedQty: (item.ReceivedQty || 0) + action.qty };
                }
                return item;
            });

            const newTotalReceived = newItems.reduce((sum, i) => sum + (i.ReceivedQty || 0), 0);
            const isFullyReceived = newTotalReceived >= totalQty;
            const nextStatus = isFullyReceived ? 'WAITING_INSPECTION' : 'WAITING_DELIVERY';

            // 2. Update PO Document
            const poRef = doc(db, 'purchasing', po.id);
            const updatePayload = {
                Items: newItems,
                ReceivedQty: newTotalReceived,
                Status: nextStatus,
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            };
            
            // Legacy backward compatibility
            if (!po.Items || po.Items.length === 0) {
                updatePayload.ReceivedQty = newTotalReceived;
            }

            batch.update(poRef, updatePayload);

            // 3. Insert into QA Receiving Queue per item
            for (const action of receiveActions) {
                const qaRef = doc(collection(db, 'receiving'));
                batch.set(qaRef, {
                    PO_ID: po.id,
                    PONumber: po.PONumber,
                    PartID: action.item.PartID,
                    PartName: action.item.PartName,
                    VendorName: po.VendorName,
                    Qty: action.qty,
                    Status: 'WAITING_INSPECTION',
                    InvoiceMemo: memo || '',
                    ReceivedAt: serverTimestamp(),
                    ReceivedBy: userProfile?.uid
                });
            }

            await batch.commit();
            alert('입고 처리 및 QA 이관이 완료되었습니다.');
            setMemo('');
            if (onRefresh) await onRefresh();
        } catch (error) {
            console.error("Receive failed:", error);
            alert("처리 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePayment = async () => {
        const nextStatus = po.PaymentStatus === 'PENDING' ? 'INVOICED' : po.PaymentStatus === 'INVOICED' ? 'PAID' : 'PENDING';
        if (!window.confirm(`결제 상태를 '${PAYMENT_STATUS_INFO[nextStatus].label}'(으)로 변경하시겠습니까?`)) return;

        try {
            await updateDoc(doc(db, 'purchasing', po.id), { PaymentStatus: nextStatus });
            if (onRefresh) await onRefresh();
        } catch (error) {
            console.error(error);
        }
    };

    const handleUpdateStatus = async () => {
        if (po.Status === 'ORDERING') {
            if (!window.confirm('발주를 확정하고 입고 대기 상태로 변경하시겠습니까?')) return;
            await handleUpdatePOStatus('WAITING_DELIVERY');
        }
    };

    const statusInfo = PO_STATUS_INFO[po.Status] || PO_STATUS_INFO.RECEIVED;
    const paymentInfo = PAYMENT_STATUS_INFO[po.PaymentStatus] || PAYMENT_STATUS_INFO.PENDING;

    const handleSendEmailDirect = () => {
        const subject = encodeURIComponent(`[발주서] ${po.PONumber} - I-Link (주)`);
        
        let itemsText = items.map((it, idx) => {
            const revText = po.HideRevisionInEmail ? '' : `(Rev ${it.Rev || '1.0'})`;
            return `${idx + 1}. ${it.PartName} ${revText}\n   - Part ID: ${it.PartID}\n   - 수량: ${it.Qty.toLocaleString()} 개\n   - 단가: ₩ ${it.UnitPrice.toLocaleString()}\n   - 금액: ₩ ${(it.Qty * it.UnitPrice).toLocaleString()}`;
        }).join('\n\n');

        const body = encodeURIComponent(`
수신: ${po.VendorName} 담당자님

안녕하십니까, I-Link (주)입니다.
아래와 같이 발주서를 송부드리오니 확인 후 납기 내 납품을 부탁드립니다.

--------------------------------------------------
[발주 정보]
- 발주 번호: ${po.PONumber}
- 납기 요청일: ${po.DueDate}
${po.Urgent ? '- 특이사항: 긴급 발주 건' : ''}

[발주 품목 내역]
${itemsText}

==================================================
총 발주 금액: ₩ ${po.TotalPrice?.toLocaleString() || 0}
--------------------------------------------------

감사합니다.
I-Link (주) 드림
        `);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    const content = (
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140] transition-opacity" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-full md:w-[700px] bg-slate-50 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out flex flex-col border-l border-slate-200">
                <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-start shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            {po.Urgent && <div className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded text-xs font-bold flex items-center gap-1 animate-pulse"><AlertCircle size={12}/> 긴급발주</div>}
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-black tracking-wider border ${statusInfo.color}`}>
                                {statusInfo.label}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-black tracking-wider border ${paymentInfo.color}`}>
                                {paymentInfo.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{(po.PONumber && po.PONumber !== '-') ? po.PONumber : (po.PRNumber || '-')}</h2>
                        </div>
                        <p className="text-sm text-slate-500 font-bold mt-1">발주일: {po.CreatedAt?.toDate ? po.CreatedAt.toDate().toLocaleDateString() : '-'}</p>
                    </div>
                    <div className="flex items-center gap-2 relative z-10">
                        {po.Status === 'DRAFT' && (
                            <button onClick={() => { setRfqMode('RFQ'); setIsRFQModalOpen(true); }} className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-indigo-600 text-white rounded-lg text-xs font-black hover:bg-indigo-700 transition-colors shadow-sm">
                                <Send size={14}/> 견적 요청 (RFQ)
                            </button>
                        )}
                        {po.Status === 'RFQ_SENT' && (
                            <button onClick={() => setIsQuoteUploadOpen(true)} className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 transition-colors shadow-sm">
                                <Plus size={14}/> 견적서 등록 및 단가 확정
                            </button>
                        )}
                        {po.Status === 'QUOTED' && (
                            <button onClick={() => setIsApprovalModalOpen(true)} className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-amber-500 text-white rounded-lg text-xs font-black hover:bg-amber-600 transition-colors shadow-sm">
                                <FileText size={14}/> 기안서 작성
                            </button>
                        )}
                        {po.Status === 'APPROVAL_PENDING' && userProfile?.uid === activeApproval?.ApproverID && (
                            <button onClick={() => setIsReviewModalOpen(true)} className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-amber-500 text-white rounded-lg text-xs font-black hover:bg-amber-600 transition-colors shadow-sm animate-pulse">
                                <FileCheck size={14}/> 기안 승인하기
                            </button>
                        )}
                        {po.Status === 'APPROVED' && (
                            <button onClick={() => { setRfqMode('ORDER'); setIsRFQModalOpen(true); }} className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-rose-600 text-white rounded-lg text-xs font-black hover:bg-rose-700 transition-colors shadow-sm">
                                <Mail size={14}/> 최종 발주 발행
                            </button>
                        )}
                        {po.Status === 'ORDERING' && (
                            <>
                                <button onClick={handleSendEmailDirect} className="flex items-center justify-center h-9 min-w-[140px] gap-2 px-4 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-xs font-black hover:bg-indigo-50 transition-colors shadow-sm">
                                    <Mail size={14} /> 재전송
                                </button>
                                <button onClick={handleUpdateStatus} className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-indigo-600 text-white rounded-lg text-xs font-black hover:bg-indigo-700 transition-colors shadow-sm">
                                    <CheckCircle2 size={14} /> 입고 대기 전환
                                </button>
                            </>
                        )}
                        {po.Status === 'WAITING_DELIVERY' && (
                            <button 
                                onClick={async () => {
                                    if (!window.confirm('전체 입고 처리를 완료하고 품질검사(QA) 대기열로 이송하시겠습니까?')) return;
                                    setLoading(true);
                                    try {
                                        const res = await qualityService.requestInspection({
                                            Type: 'INCOMING',
                                            RefPOID: po.id,
                                            PONumber: po.PONumber,
                                            PartID: items[0]?.PartID || '',
                                            PartName: po.PartName,
                                            Qty: po.Qty,
                                            VendorID: po.VendorID || '',
                                            VendorName: po.VendorName
                                        });
                                        if (res.success) {
                                            await handleUpdatePOStatus('WAITING_INSPECTION');
                                            alert('성공적으로 입고 완료 처리되었으며 품질 검사 대기열로 이송되었습니다.');
                                        } else {
                                            alert('QA 검사 요청 중 오류가 발생했습니다.');
                                        }
                                    } catch (err) {
                                        console.error(err);
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                                disabled={loading}
                                className="flex items-center justify-center h-9 min-w-[160px] gap-2 px-4 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                                <Truck size={14}/> 전체 입고 및 QA 요청
                            </button>
                        )}

                        {(po.Status === 'DRAFT' || po.Status === 'ORDERING') && (
                            <button onClick={() => onEdit && onEdit(po)} className="p-2 ml-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors" title="발주 정보 수정">
                                <Edit size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Shortage Reservation Info (Added) */}
                    {po.ShortageSources && Object.keys(po.ShortageSources).length > 0 && (
                        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 shadow-sm space-y-3">
                            <h3 className="text-xs font-black text-rose-700 flex items-center gap-2">
                                <AlertCircle size={14}/> 부족 예약 연동 정보 (관련 주문서)
                            </h3>
                            <div className="grid grid-cols-1 gap-2">
                                {Object.entries(po.ShortageSources).map(([partID, sources]) => (
                                    <div key={partID} className="bg-white/60 rounded-xl p-3 border border-rose-200/50">
                                        <p className="text-[10px] font-black text-rose-500 mb-2 uppercase tracking-wider underline decoration-rose-200 underline-offset-4">대상 품목: {partID}</p>
                                        <div className="space-y-2">
                                            {sources.map((src, idx) => (
                                                <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-[11px] border-b border-rose-100 pb-2 last:border-0 last:pb-0">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded tracking-tighter">{src.PRNumber}</span>
                                                        <span className="font-bold text-slate-800">{src.TopPartName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-slate-500">
                                                        <span className="flex items-center gap-1 font-bold"><Calendar size={12} className="text-rose-400"/> {src.DueDate}</span>
                                                        <span className="font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">부족: {src.ShortQty} EA</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Basic Info */}
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                        <div>
                            <p className="text-xs text-slate-400 font-bold mb-1">공급업체 (Vendor)</p>
                            <p className="text-base font-black text-slate-800 flex items-center gap-2"><Truck size={16} className="text-indigo-500"/> {po.VendorName}</p>
                        </div>
                        <div className="md:text-right">
                            <p className="text-xs text-slate-400 font-bold mb-1">납기 예정일</p>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-2 md:justify-end"><Calendar size={14} className="text-indigo-500"/> {po.DueDate}</p>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><ShoppingCart size={16} className="text-indigo-500"/> 발주 품목 내역</h3>
                            {po.HideRevisionInEmail && <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded">리비전 메일 숨김</span>}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white border-b border-slate-100">
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Part ID</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Part Name</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Rev</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">수량</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">단가 (₩)</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">금액 (₩)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.map(item => (
                                        <React.Fragment key={item.id}>
                                            <tr className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 text-xs font-mono font-bold text-indigo-600">{item.PartID}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-800">{item.PartName}</span>
                                                        {item.Schedules && item.Schedules.length > 1 && (
                                                            <span className="text-[10px] font-black text-indigo-500">분할 {item.Schedules.length}회</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs font-medium text-slate-500 text-right">{item.Rev || '-'}</td>
                                                <td className="px-4 py-3 text-xs font-black text-slate-700 text-right">{item.Qty.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-xs font-medium text-slate-500 text-right">{item.UnitPrice.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-xs font-black text-indigo-700 text-right">{(item.Qty * item.UnitPrice).toLocaleString()}</td>
                                            </tr>
                                            {item.Schedules && item.Schedules.length > 1 && (
                                                <tr className="bg-slate-50/30">
                                                    <td colSpan="6" className="px-4 py-2 border-b border-slate-100">
                                                        <div className="flex flex-wrap gap-2">
                                                            <span className="text-[10px] font-black text-slate-400 mr-1 self-center">납기 스케줄:</span>
                                                            {item.Schedules.map((s, idx) => (
                                                                <div key={idx} className="flex items-center gap-2 bg-white px-2 py-0.5 rounded border border-slate-200 text-[9px] font-bold shadow-sm">
                                                                    <span className="text-indigo-600">{s.qty} EA</span>
                                                                    <span className="text-slate-500">({s.date})</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Financials & Progress Summary */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2"><DollarSign size={16} className="text-emerald-500"/> 총 발주 금액</h3>
                                <p className="text-2xl font-black text-emerald-600">₩ {po.TotalPrice?.toLocaleString() || 0}</p>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-400 font-bold">결제 상태</span>
                                    <button onClick={handleTogglePayment} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${po.PaymentStatus === 'PAID' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                        {paymentInfo.label} 변경 ➔
                                    </button>
                                </div>
                                {po.PaymentStatus === 'INVOICED' && (
                                    <button 
                                        onClick={() => setIsExpenseModalOpen(true)}
                                        className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"
                                    >
                                        <CreditCard size={14}/> 지출결의서 작성하기
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><PackageCheck size={16} className="text-blue-500"/> 전체 입고 현황</h3>
                            <div className="mb-3">
                                <div className="flex justify-between text-xs font-bold mb-1.5">
                                    <span className="text-slate-600">진행률</span>
                                    <span className="text-indigo-600">{Math.round((totalReceived / totalQty) * 100) || 0}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((totalReceived / totalQty) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                            <div className="flex justify-between text-xs font-bold border-t border-slate-100 pt-3">
                                <span className="text-slate-500">총 발주: {totalQty}</span>
                                <span className="text-blue-600">입고: {totalReceived}</span>
                                <span className="text-rose-500">잔량: {totalRemaining}</span>
                            </div>
                        </div>
                    </div>

                        {/* Action buttons have been moved to the header */}

                        {/* Receive action moved to header */}

                    {po.Status === 'WAITING_DELIVERY' && totalRemaining > 0 && (
                        <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-sm overflow-hidden mt-6">
                            <div className="bg-indigo-50/50 px-5 py-3 border-b border-indigo-100">
                                <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                                    <Truck size={16} className="text-indigo-500"/> 
                                    분할 입고 등록 (Partial Receive)
                                </h3>
                                <p className="text-xs text-indigo-700/70 mt-1 font-medium">입고된 품목의 수량을 각각 입력해주세요.</p>
                            </div>
                            <form onSubmit={handleReceiveSubmit} className="p-0">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-4 py-2 text-[10px] font-black text-slate-400">품목</th>
                                            <th className="px-4 py-2 text-[10px] font-black text-slate-400 text-right">잔량</th>
                                            <th className="px-4 py-2 text-[10px] font-black text-slate-400 text-right">금회 입고</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => {
                                            const remaining = item.Qty - (item.ReceivedQty || 0);
                                            if (remaining <= 0) return null;
                                            return (
                                                <tr key={item.id} className="border-b border-slate-100">
                                                    <td className="px-4 py-3">
                                                        <div className="text-sm font-bold text-slate-800 line-clamp-1">{item.PartName}</div>
                                                        <div className="text-xs font-mono text-slate-400">{item.PartID}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-sm font-black text-rose-500">{remaining}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input 
                                                            type="number" 
                                                            min="0" 
                                                            max={remaining}
                                                            value={receiveQtys[item.id] !== undefined ? receiveQtys[item.id] : ''} 
                                                            onChange={e => setReceiveQtys(prev => ({ ...prev, [item.id]: e.target.value }))} 
                                                            className="w-20 ml-auto block bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500 text-right" 
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                                    <div className="relative mb-4">
                                        <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            value={memo} 
                                            onChange={e => setMemo(e.target.value)} 
                                            placeholder="명세서 번호 등 메모 (선택)"
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                        />
                                    </div>
                                    <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md transition-all flex items-center justify-center gap-2">
                                        {loading ? '처리중...' : '수량 입력 항목 입고 등록 및 QA 인계'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {po.Status === 'WAITING_INSPECTION' && (
                        <div className="bg-purple-50 rounded-2xl p-5 text-center border border-purple-100">
                            <ShieldCheck size={32} className="mx-auto text-purple-400 mb-2" />
                            <h3 className="text-sm font-black text-purple-900 mb-1">QA 검사 진행 중</h3>
                            <p className="text-xs text-purple-700">입고된 자재가 품질 부서에서 검수 대기/진행 중입니다.<br/>검사가 완료되어야 최종 적재가 가능합니다.</p>
                        </div>
                    )}
                </div>

                {/* Modals integrated into detail panel for easy access */}
                <ExpenseResolutionModal 
                    isOpen={isExpenseModalOpen} 
                    poData={po} 
                    onClose={() => setIsExpenseModalOpen(false)} 
                    onSubmit={() => { setIsExpenseModalOpen(false); if (onRefresh) onRefresh(); }} 
                />
                
                <RFQEmailModal 
                    isOpen={isRFQModalOpen} 
                    poData={po} 
                    mode={rfqMode}
                    onClose={() => setIsRFQModalOpen(false)} 
                    onSend={(d) => {
                        if (rfqMode === 'RFQ') {
                            handleUpdatePOStatus('RFQ_SENT', { RFQEmail: d });
                        } else {
                            handleUpdatePOStatus('ORDERING', { OrderEmail: d, OrderedAt: new Date().toISOString() });
                        }
                        setIsRFQModalOpen(false);
                    }} 
                />

                <QuotationUploadModal 
                    isOpen={isQuoteUploadOpen} 
                    poData={po} 
                    onClose={() => setIsQuoteUploadOpen(false)} 
                    onSave={(d) => handleUpdatePOStatus('QUOTED', { ...d })} 
                />

                <ApprovalModal 
                    isOpen={isApprovalModalOpen} 
                    poData={po} 
                    onClose={() => setIsApprovalModalOpen(false)} 
                    onSubmit={(d) => { 
                        const id = `APP-${Date.now()}`; 
                        setDoc(doc(db, 'approvals', id), { ...d, id }).then(() => {
                            handleUpdatePOStatus('APPROVAL_PENDING', { LastApprovalID: id });
                            createNotification(
                                d.ApproverID,
                                '신규 발주 결재 요청',
                                `[${po.VendorName}] ${po.PartName} 외 건에 대한 결재가 요청되었습니다.`,
                                `/purchasing`
                            );
                        }); 
                        setIsApprovalModalOpen(false); 
                    }} 
                />

                <ApprovalReviewModal 
                    isOpen={isReviewModalOpen} 
                    approvalData={activeApproval} 
                    onClose={() => setIsReviewModalOpen(false)} 
                    onRefresh={() => {
                        setIsReviewModalOpen(false);
                        if (onRefresh) onRefresh();
                    }} 
                />
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
