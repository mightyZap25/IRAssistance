import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShoppingCart, Calendar, Truck, DollarSign, PackageCheck, ChevronRight, CheckCircle2, Clock, AlertCircle, FileText, Edit, Mail, ShieldCheck } from 'lucide-react';
import { updateDoc, doc, writeBatch, serverTimestamp, collection } from '../firebase';
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
    
    // receiveQtys[itemId] = quantity to receive
    const [receiveQtys, setReceiveQtys] = useState({});
    const [memo, setMemo] = useState('');
    const [loading, setLoading] = useState(false);

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
            await updateDoc(doc(db, 'purchasing', po.id), { Status: 'WAITING_DELIVERY' });
            if (onRefresh) await onRefresh();
        }
    };

    const statusInfo = PO_STATUS_INFO[po.Status] || PO_STATUS_INFO.RECEIVED;
    const paymentInfo = PAYMENT_STATUS_INFO[po.PaymentStatus] || PAYMENT_STATUS_INFO.PENDING;

    const handleSendEmail = () => {
        const subject = encodeURIComponent(`[발주서] ${po.PONumber} - IR Assistant (주)`);
        
        let itemsText = items.map((it, idx) => {
            const revText = po.HideRevisionInEmail ? '' : `(Rev ${it.Rev || '1.0'})`;
            return `${idx + 1}. ${it.PartName} ${revText}\n   - Part ID: ${it.PartID}\n   - 수량: ${it.Qty.toLocaleString()} 개\n   - 단가: ₩ ${it.UnitPrice.toLocaleString()}\n   - 금액: ₩ ${(it.Qty * it.UnitPrice).toLocaleString()}`;
        }).join('\n\n');

        const body = encodeURIComponent(`
수신: ${po.VendorName} 담당자님

안녕하십니까, IR Assistant (주)입니다.
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
IR Assistant (주) 드림
        `);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    const content = (
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140] transition-opacity" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-full md:w-[700px] bg-slate-50 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out flex flex-col border-l border-slate-200">
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

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                                            {item.Schedules && item.Schedules.length > 0 && (
                                                <tr className="bg-slate-50/30">
                                                    <td colSpan="6" className="px-4 py-2 border-b border-slate-100">
                                                        <div className="flex flex-wrap gap-2">
                                                            {item.Schedules.map((s, idx) => (
                                                                <div key={idx} className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold">
                                                                    <span className="text-slate-400">{idx+1}차:</span>
                                                                    <span className="text-slate-700">{s.date}</span>
                                                                    <span className="text-indigo-600">{s.qty} EA</span>
                                                                    {s.shippedQty > 0 && <span className="text-emerald-500 ml-1">✓ {s.shippedQty}</span>}
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
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-bold">결제 상태</span>
                                <button onClick={handleTogglePayment} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${po.PaymentStatus === 'PAID' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                    {paymentInfo.label} 변경 ➔
                                </button>
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

                    {/* Actions */}
                    {po.Status === 'ORDERING' && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 text-center shadow-sm">
                            <p className="text-sm font-bold text-indigo-800 mb-4">발주서 전송 및 확정 절차를 진행해주세요.</p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button onClick={handleSendEmail} className="bg-white text-indigo-600 border border-indigo-200 px-6 py-2.5 rounded-xl text-sm font-black hover:bg-indigo-50 transition-all shadow-sm flex items-center justify-center gap-2">
                                    <Mail size={16} /> 공급사로 발주서(이메일) 전송
                                </button>
                                <button onClick={handleUpdateStatus} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-black hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16} /> 발주 확정 및 입고 대기 전환
                                </button>
                            </div>
                        </div>
                    )}

                    {po.Status === 'WAITING_DELIVERY' && totalRemaining > 0 && (
                        <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-sm overflow-hidden">
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
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
