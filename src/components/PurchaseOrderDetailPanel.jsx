import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShoppingCart, Calendar, MapPin, DollarSign, PackageCheck, Truck, ChevronRight, CheckCircle2, Clock, AlertCircle, FileText, Edit } from 'lucide-react';
import { updateDoc, doc, writeBatch, serverTimestamp, collection, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const PO_STATUS_INFO = {
    ORDERING: { label: '발주중', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    WAITING_DELIVERY: { label: '입고대기', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    WAITING_INSPECTION: { label: '검사대기(QA)', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    RECEIVED: { label: '적재완료', color: 'bg-slate-50 text-slate-600 border-slate-200' }
};

const PAYMENT_STATUS_INFO = {
    PENDING: { label: '결제대기', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    INVOICED: { label: '청구됨', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    PAID: { label: '지급완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' }
};

export default function PurchaseOrderDetailPanel({ po, isOpen, onClose, onRefresh, onEdit }) {
    const { userProfile } = useAuth();
    const [receiveQty, setReceiveQty] = useState('');
    const [memo, setMemo] = useState('');
    const [loading, setLoading] = useState(false);
    const [actualPartID, setActualPartID] = useState('');

    useEffect(() => {
        const resolvePartID = async () => {
            if (!po?.PartID) return;
            // Check if it's a Firebase doc ID (usually 20 chars, alphanumeric)
            if (po.PartID.length === 20 && !po.PartID.includes('-')) {
                try {
                    const partSnap = await getDoc(doc(db, 'parts', po.PartID));
                    if (partSnap.exists()) {
                        setActualPartID(partSnap.data().PartID);
                    } else {
                        setActualPartID(po.PartID);
                    }
                } catch (e) {
                    setActualPartID(po.PartID);
                }
            } else {
                setActualPartID(po.PartID);
            }
        };
        resolvePartID();
    }, [po]);

    if (!isOpen || !po) return null;

    const remainingQty = po.Qty - (po.ReceivedQty || 0);

    const handleReceiveSubmit = async (e) => {
        e.preventDefault();
        const qtyToReceive = parseInt(receiveQty);
        
        if (isNaN(qtyToReceive) || qtyToReceive <= 0) {
            return alert('입고 수량을 1 이상 정확히 입력해주세요.');
        }
        if (qtyToReceive > remainingQty) {
            return alert(`남은 수량(${remainingQty}개)을 초과하여 입고할 수 없습니다.`);
        }

        if (!window.confirm(`${qtyToReceive}개를 입고 처리하시겠습니까?\n처리된 수량은 즉시 QA 검사 대기열로 이관됩니다.`)) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const newReceivedQty = (po.ReceivedQty || 0) + qtyToReceive;
            const isFullyReceived = newReceivedQty >= po.Qty;
            const nextStatus = isFullyReceived ? 'WAITING_INSPECTION' : 'WAITING_DELIVERY';

            // 1. Update PO Document
            const poRef = doc(db, 'purchasing', po.id);
            batch.update(poRef, {
                ReceivedQty: newReceivedQty,
                Status: nextStatus,
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });

            // 2. Insert into QA Receiving Queue for this specific batch
            const qaRef = doc(collection(db, 'receiving'));
            batch.set(qaRef, {
                PO_ID: po.id,
                PONumber: po.PONumber,
                PartID: po.PartID,
                PartName: po.PartName,
                VendorName: po.VendorName,
                Qty: qtyToReceive, // Only the newly received quantity goes to QA
                Status: 'WAITING_INSPECTION',
                InvoiceMemo: memo || '',
                ReceivedAt: serverTimestamp(),
                ReceivedBy: userProfile?.uid
            });

            await batch.commit();
            alert('입고 처리 및 QA 이관이 완료되었습니다.');
            setReceiveQty('');
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
            await updateDoc(doc(db, 'purchasing', po.id), { Status: 'WAITING_DELIVERY' });
            if (onRefresh) await onRefresh();
        }
    };

    const statusInfo = PO_STATUS_INFO[po.Status] || PO_STATUS_INFO.RECEIVED;
    const paymentInfo = PAYMENT_STATUS_INFO[po.PaymentStatus] || PAYMENT_STATUS_INFO.PENDING;

    // Default receive input to remaining qty when opening
    if (receiveQty === '' && remainingQty > 0) {
        setReceiveQty(remainingQty.toString());
    }

    const content = (
        <div className="relative z-[9999]">
            {/* Backdrop overlay */}
            <div 
                className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140] transition-opacity"
                onClick={onClose}
            />
            
            <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-slate-50 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out flex flex-col border-l border-slate-200">
            {/* Header */}
            <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0 relative overflow-hidden">
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
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{po.PONumber}</h2>
                    <p className="text-sm text-slate-500 font-bold mt-1">발주일: {po.CreatedAt?.toDate ? po.CreatedAt.toDate().toLocaleDateString() : '-'}</p>
                </div>
                <div className="flex items-center gap-2 relative z-10">
                    {po.Status === 'ORDERING' && (
                        <button onClick={() => onEdit && onEdit(po)} className="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors" title="발주 정보 수정">
                            <Edit size={20} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Item & Vendor Info */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><ShoppingCart size={16} className="text-indigo-500"/> 기본 정보</h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div>
                            <p className="text-xs text-slate-400 font-bold mb-1.5">고유 번호 (Part ID)</p>
                            <span className="text-sm font-mono font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1.5 rounded-lg inline-block shadow-sm">{actualPartID || po.PartID}</span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold mb-1.5">품목명 (Part Name)</p>
                            <p className="text-sm font-black text-slate-800 py-1">{po.PartName}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold mb-1">공급업체 (Vendor)</p>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1"><Truck size={14} className="text-slate-400"/> {po.VendorName}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold mb-1">납기 예정일</p>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1"><Calendar size={14} className="text-slate-400"/> {po.DueDate}</p>
                        </div>
                    </div>
                </div>

                {/* 2. Financials */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2"><DollarSign size={16} className="text-emerald-500"/> 재무 정보</h3>
                        <p className="text-xs text-slate-500 font-bold mb-1">단가: ₩ {po.UnitPrice?.toLocaleString() || 0}</p>
                        <p className="text-base font-black text-slate-900">총액: ₩ {po.TotalPrice?.toLocaleString() || 0}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-400 font-bold mb-2">결제 상태 관리</p>
                        <button onClick={handleTogglePayment} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${po.PaymentStatus === 'PAID' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                            결제 상태 변경 ➔
                        </button>
                    </div>
                </div>

                {/* 3. Progress / Quantity */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><PackageCheck size={16} className="text-blue-500"/> 수량 현황</h3>
                    
                    {/* Progress Bar */}
                    <div className="mb-4">
                        <div className="flex justify-between text-xs font-bold mb-1.5">
                            <span className="text-slate-600">입고 진행률</span>
                            <span className="text-indigo-600">{Math.round(((po.ReceivedQty || 0) / po.Qty) * 100)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(((po.ReceivedQty || 0) / po.Qty) * 100, 100)}%` }}></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                            <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wider">총 발주</p>
                            <p className="text-lg font-black text-slate-800">{po.Qty}</p>
                        </div>
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-center">
                            <p className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">입고 완료</p>
                            <p className="text-lg font-black text-blue-600">{po.ReceivedQty || 0}</p>
                        </div>
                        <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100 text-center">
                            <p className="text-[10px] text-rose-400 font-bold mb-1 uppercase tracking-wider">미입고 잔량</p>
                            <p className="text-lg font-black text-rose-600">{remainingQty}</p>
                        </div>
                    </div>
                </div>

                {/* 4. Action Area */}
                {po.Status === 'ORDERING' && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 text-center shadow-sm">
                        <p className="text-sm font-bold text-indigo-800 mb-3">공급사로 발주서 전송이 완료되었습니까?</p>
                        <button onClick={handleUpdateStatus} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md">
                            발주 확정 및 입고 대기 전환
                        </button>
                    </div>
                )}

                {po.Status === 'WAITING_DELIVERY' && remainingQty > 0 && (
                    <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-sm overflow-hidden">
                        <div className="bg-indigo-50/50 px-5 py-3 border-b border-indigo-100">
                            <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                                <Truck size={16} className="text-indigo-500"/> 
                                분할 입고 등록 (Partial Receive)
                            </h3>
                        </div>
                        <form onSubmit={handleReceiveSubmit} className="p-5 space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="flex-1 space-y-1.5">
                                    <label className="text-xs font-black text-slate-700">금회 입고 수량</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max={remainingQty}
                                            value={receiveQty} 
                                            onChange={e => setReceiveQty(e.target.value)} 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                            required 
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">EA</span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    <label className="text-xs font-black text-slate-700">명세서 번호 (선택)</label>
                                    <div className="relative">
                                        <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            value={memo} 
                                            onChange={e => setMemo(e.target.value)} 
                                            placeholder="Invoice No. 등"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                    <strong className="text-indigo-600">안내:</strong> 부분 입고 처리 시, <strong className="text-slate-800">입력하신 수량({receiveQty || 0}개)</strong>에 대해서만 QA 검사 대기열로 자동 이관됩니다.
                                </p>
                            </div>
                            <button type="submit" disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md transition-all flex items-center justify-center gap-2">
                                {loading ? '처리중...' : '입고 등록 및 QA 인계'}
                            </button>
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
        </div>
    </div>
    );

    return createPortal(content, document.body);
}
