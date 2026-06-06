import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Factory, Calendar, MapPin, PackageCheck, Truck, ChevronRight, CheckCircle2, Clock, AlertCircle, FileText, Edit, Printer, List } from 'lucide-react';
import { updateDoc, doc, writeBatch, serverTimestamp, collection, getDoc, query, where, getDocs } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from './common/MasterDataGrid';

const OS_STATUS_INFO = {
    WAITING_RELEASE: { label: '자재 출고 대기', color: 'bg-slate-50 text-slate-600 border-slate-200' },
    IN_PROGRESS: { label: '가공 진행 중', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    WAITING_INSPECTION: { label: '검사대기(QA)', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    COMPLETED: { label: '완료됨', color: 'bg-slate-50 text-slate-600 border-slate-200' }
};

const PAYMENT_STATUS_INFO = {
    PENDING: { label: '결제대기', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    INVOICED: { label: '청구됨', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    PAID: { label: '지급완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' }
};

export default function OutsourcingDetailPanel({ os, isOpen, onClose, onRefresh, onEdit }) {
    const { userProfile } = useAuth();
    const [receiveQty, setReceiveQty] = useState('');
    const [memo, setMemo] = useState('');
    const [loading, setLoading] = useState(false);
    const [actualPartID, setActualPartID] = useState('');
    const [bomList, setBomList] = useState([]);

    useEffect(() => {
        const resolvePartID = async () => {
            if (!os?.PartID) return;
            if (os.PartID.length === 20 && !os.PartID.includes('-')) {
                try {
                    const partSnap = await getDoc(doc(db, 'parts', os.PartID));
                    if (partSnap.exists()) {
                        setActualPartID(partSnap.data().PartID);
                    } else {
                        setActualPartID(os.PartID);
                    }
                } catch (e) {
                    setActualPartID(os.PartID);
                }
            } else {
                setActualPartID(os.PartID);
            }
        };
        resolvePartID();
    }, [os]);

    useEffect(() => {
        const fetchBOM = async () => {
            if (!actualPartID) return;
            const bomQuery = query(collection(db, 'bom'), where('ParentID', '==', actualPartID));
            const bomSnap = await getDocs(bomQuery);
            if (!bomSnap.empty) {
                setBomList(bomSnap.docs.map(d => d.data()));
            } else {
                setBomList([]);
            }
        };
        fetchBOM();
    }, [actualPartID]);

    if (!isOpen || !os) return null;

    const remainingQty = os.Qty - (os.ReceivedQty || 0);

    const handleTogglePayment = async () => {
        const nextStatus = os.PaymentStatus === 'PENDING' ? 'INVOICED' : os.PaymentStatus === 'INVOICED' ? 'PAID' : 'PENDING';
        if (!window.confirm(`결제 상태를 '${PAYMENT_STATUS_INFO[nextStatus].label}'(으)로 변경하시겠습니까?`)) return;

        try {
            await updateDoc(doc(db, 'outsourcing', os.id), { PaymentStatus: nextStatus });
            if (onRefresh) await onRefresh();
        } catch (error) {
            console.error(error);
        }
    };

    const handleUpdateStatus = async (nextStatus) => {
        if (!window.confirm(`외주 발주 상태를 '${OS_STATUS_INFO[nextStatus].label}'(으)로 변경하시겠습니까?\n\n(참고: '가공 진행 중'으로 변경 시 BOM에 등록된 원자재가 창고에서 자동 출고됩니다.)`)) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const osRef = doc(db, 'outsourcing', os.id);
            
            batch.update(osRef, { 
                Status: nextStatus,
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });

            if (nextStatus === 'IN_PROGRESS') {
                const basePartID = actualPartID || os.PartID;
                const bomQuery = query(collection(db, 'bom'), where('ParentID', '==', basePartID));
                const bomSnap = await getDocs(bomQuery);

                if (!bomSnap.empty) {
                    // 1. Check for shortages first
                    const shortages = [];
                    const inventoryUpdates = [];
                    const transactionLogs = [];

                    for (const bomDoc of bomSnap.docs) {
                        const bomData = bomDoc.data();
                        const childID = bomData.ChildID;
                        const reqQty = (bomData.Quantity || 1) * os.Qty;

                        const invQuery = query(collection(db, 'inventory'), where('PartID', '==', childID));
                        const invSnap = await getDocs(invQuery);
                        
                        let currentOnHand = 0;
                        let invDocRef = null;

                        if (!invSnap.empty) {
                            currentOnHand = invSnap.docs[0].data().OnHand || 0;
                            invDocRef = invSnap.docs[0].ref;
                        } else {
                            invDocRef = doc(collection(db, 'inventory'));
                        }

                        if (currentOnHand < reqQty) {
                            shortages.push({ partID: childID, req: reqQty, onHand: currentOnHand });
                        } else {
                            inventoryUpdates.push({ ref: invDocRef, partID: childID, newOnHand: currentOnHand - reqQty });
                            
                            const transRef = doc(collection(db, 'transactions'));
                            transactionLogs.push({
                                ref: transRef,
                                data: {
                                    PartID: childID,
                                    Type: 'Out',
                                    Quantity: reqQty,
                                    Date: serverTimestamp(),
                                    RefDoc: os.OSNumber,
                                    Reason: '외주 생산 원자재 불출',
                                    CreatedBy: userProfile?.uid || 'System'
                                }
                            });
                        }
                    }

                    // 2. Block if any shortage exists
                    if (shortages.length > 0) {
                        setLoading(false);
                        const msg = shortages.map(s => `- ${s.partID}: 필요 ${s.req}개 (현재재고 ${s.onHand}개)`).join('\n');
                        return alert(`🚨 자재 출고 불가!\n\n아래 원자재의 재고가 부족하여 출고 및 가공 시작이 차단되었습니다.\n\n${msg}`);
                    }

                    // 3. Apply updates if all okay
                    inventoryUpdates.forEach(update => {
                        batch.set(update.ref, {
                            PartID: update.partID,
                            OnHand: update.newOnHand,
                            UpdatedAt: serverTimestamp()
                        }, { merge: true });
                    });

                    transactionLogs.forEach(log => {
                        batch.set(log.ref, log.data);
                    });
                }
            }

            await batch.commit();
            if (nextStatus === 'IN_PROGRESS') {
                alert('자재 불출 처리가 완료되고 외주 가공이 시작되었습니다.');
            }
            if (onRefresh) await onRefresh();
        } catch (error) {
            console.error(error);
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleReceiveSubmit = async (e) => {
        e.preventDefault();
        const qtyToReceive = parseInt(receiveQty);
        
        if (isNaN(qtyToReceive) || qtyToReceive <= 0) {
            return alert('입고 수량을 1 이상 정확히 입력해주세요.');
        }
        if (qtyToReceive > remainingQty) {
            return alert(`남은 수량(${remainingQty}개)을 초과하여 입고할 수 없습니다.`);
        }

        if (!window.confirm(`${qtyToReceive}개를 납품(입고) 처리하시겠습니까?\n해당 품목은 즉시 QA 검사 대기열로 이관됩니다.`)) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const newReceivedQty = (os.ReceivedQty || 0) + qtyToReceive;
            const isFullyReceived = newReceivedQty >= os.Qty;
            const nextStatus = isFullyReceived ? 'WAITING_INSPECTION' : 'IN_PROGRESS';

            const osRef = doc(db, 'outsourcing', os.id);
            batch.update(osRef, {
                ReceivedQty: newReceivedQty,
                Status: nextStatus,
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });

            // QA Receiving Queue (use same structure as purchasing)
            const qaRef = doc(collection(db, 'receiving'));
            batch.set(qaRef, {
                OS_ID: os.id,
                OSNumber: os.OSNumber,
                PartID: os.PartID,
                PartName: os.PartName,
                VendorName: os.VendorName,
                Qty: qtyToReceive,
                Status: 'WAITING_INSPECTION',
                InvoiceMemo: memo || '',
                ReceivedAt: serverTimestamp(),
                ReceivedBy: userProfile?.uid,
                SourceType: 'OUTSOURCING'
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

    const statusInfo = OS_STATUS_INFO[os.Status] || OS_STATUS_INFO.WAITING_RELEASE;
    const paymentInfo = PAYMENT_STATUS_INFO[os.PaymentStatus || 'PENDING'];

    if (receiveQty === '' && remainingQty > 0) {
        setReceiveQty(remainingQty.toString());
    }

    const BOM_COLUMN_DEFS = {
        ChildID: { label: '원자재 Part ID', default: true },
        Quantity: { label: '단위 소요량', default: true },
        TotalQty: { label: '총 불출 수량', default: true }
    };

    const formattedBomList = bomList.map((b, i) => ({
        id: `bom-${i}`,
        ChildID: <span className="font-mono text-xs">{b.ChildID}</span>,
        Quantity: b.Quantity || 1,
        TotalQty: <span className="font-bold text-rose-600">{(b.Quantity || 1) * os.Qty} EA</span>
    }));

    const content = (
        <div className="relative z-[9999]">
            {/* Hidden Printable Area */}
            <div className="hidden print:block fixed inset-0 bg-white z-[99999] p-10 text-black">
                <h1 className="text-3xl font-black text-center mb-8 border-b-2 border-black pb-4">외주 가공 자재 출고 지시서</h1>
                
                <div className="flex justify-between mb-6 text-sm">
                    <div>
                        <p className="font-bold mb-1">발주 번호: <span className="font-normal">{os.OSNumber}</span></p>
                        <p className="font-bold mb-1">발주 일자: <span className="font-normal">{os.CreatedAt?.toDate ? os.CreatedAt.toDate().toLocaleDateString() : '-'}</span></p>
                        <p className="font-bold mb-1">납기 예정일: <span className="font-normal">{os.DueDate}</span></p>
                    </div>
                    <div className="text-right">
                        <p className="font-bold mb-1">외주 업체: <span className="font-normal">{os.VendorName}</span></p>
                        <p className="font-bold mb-1">가공 대상: <span className="font-normal">{os.PartName} ({actualPartID || os.PartID})</span></p>
                        <p className="font-bold mb-1">생산 수량: <span className="font-normal">{os.Qty} EA</span></p>
                    </div>
                </div>

                <h2 className="text-lg font-bold mb-3 border-b border-gray-300 pb-1">불출 필요 원자재 목록 (BOM 기준)</h2>
                {bomList.length > 0 ? (
                    <table className="w-full text-sm border-collapse border border-gray-300 mb-8">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-gray-300 py-2 px-3 text-left w-12">No</th>
                                <th className="border border-gray-300 py-2 px-3 text-left">원자재 Part ID</th>
                                <th className="border border-gray-300 py-2 px-3 text-right w-24">단위 소요량</th>
                                <th className="border border-gray-300 py-2 px-3 text-right w-32">총 불출 수량</th>
                                <th className="border border-gray-300 py-2 px-3 text-center w-32">출고 확인</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bomList.map((b, i) => (
                                <tr key={i}>
                                    <td className="border border-gray-300 py-2 px-3 text-center">{i + 1}</td>
                                    <td className="border border-gray-300 py-2 px-3 font-mono">{b.ChildID}</td>
                                    <td className="border border-gray-300 py-2 px-3 text-right">{b.Quantity || 1}</td>
                                    <td className="border border-gray-300 py-2 px-3 text-right font-bold text-lg">{(b.Quantity || 1) * os.Qty}</td>
                                    <td className="border border-gray-300 py-2 px-3 text-center">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-sm text-gray-500 py-4 text-center border border-gray-300">BOM에 등록된 하위 원자재가 없습니다.</p>
                )}

                <div className="mt-16 flex justify-end gap-16 pr-8">
                    <div className="text-center">
                        <p className="text-sm font-bold mb-8">창고 출고 담당자</p>
                        <p className="text-lg font-bold border-b border-black w-32 mx-auto">(인)</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold mb-8">외주 수령자 (업체)</p>
                        <p className="text-lg font-bold border-b border-black w-32 mx-auto">(인)</p>
                    </div>
                </div>
            </div>

            <div 
                className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140] transition-opacity print:hidden"
                onClick={onClose}
            />
            
            <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-slate-50 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out flex flex-col border-l border-slate-200 print:hidden">
                <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            {os.Urgent && <div className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded text-xs font-bold flex items-center gap-1 animate-pulse"><AlertCircle size={12}/> 긴급발주</div>}
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-black tracking-wider border ${statusInfo.color}`}>
                                {statusInfo.label}
                            </span>
                            <button 
                                onClick={handleTogglePayment}
                                className={`px-2.5 py-0.5 rounded-md text-xs font-black tracking-wider border cursor-pointer hover:opacity-80 transition-opacity ${paymentInfo.color}`}
                                title="클릭하여 결제/정산 상태 변경"
                            >
                                {paymentInfo.label}
                            </button>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{os.OSNumber}</h2>
                        <p className="text-sm text-slate-500 font-bold mt-1">발주일: {os.CreatedAt?.toDate ? os.CreatedAt.toDate().toLocaleDateString() : '-'}</p>
                    </div>
                    <div className="flex items-center gap-2 relative z-10">
                        <button onClick={() => window.print()} className="p-2 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors" title="출고 지시서 인쇄">
                            <Printer size={20} />
                        </button>
                        {os.Status === 'WAITING_RELEASE' && (
                            <button onClick={() => onEdit && onEdit(os)} className="p-2 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors" title="외주 발주 수정">
                                <Edit size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><Factory size={16} className="text-blue-500"/> 기본 정보</h3>
                        <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                            <div>
                                <p className="text-xs text-slate-400 font-bold mb-1.5">고유 번호 (Part ID)</p>
                                <span className="text-sm font-mono font-black text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-lg inline-block shadow-sm">{actualPartID || os.PartID}</span>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold mb-1.5">품목명 (Part Name)</p>
                                <p className="text-sm font-black text-slate-800 py-1">{os.PartName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold mb-1">외주업체 (Vendor)</p>
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-1"><Truck size={14} className="text-slate-400"/> {os.VendorName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold mb-1">납기 예정일</p>
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-1"><Calendar size={14} className="text-slate-400"/> {os.DueDate}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2"><FileText size={16} className="text-slate-500"/> 진행 현황 및 관리</h3>
                        
                        <div className="flex flex-col gap-6">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">총 의뢰 수량</p>
                                    <p className="text-xl font-black text-slate-800">{os.Qty}</p>
                                </div>
                                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1">납품 완료</p>
                                    <p className="text-xl font-black text-blue-700">{os.ReceivedQty || 0}</p>
                                </div>
                                <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 text-center">
                                    <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1">잔여 수량</p>
                                    <p className="text-xl font-black text-rose-600">{remainingQty}</p>
                                </div>
                            </div>

                            {os.Status === 'WAITING_RELEASE' && (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <p className="text-sm text-slate-600 font-bold mb-3">현재 상태: 자재 출고 대기</p>
                                    <button 
                                        onClick={() => handleUpdateStatus('IN_PROGRESS')}
                                        disabled={loading}
                                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black shadow-md shadow-blue-200 transition-colors"
                                    >
                                        자재 출고 확인 및 가공 시작
                                    </button>
                                </div>
                            )}

                            {os.Status === 'IN_PROGRESS' && remainingQty > 0 && (
                                <form onSubmit={handleReceiveSubmit} className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                    <h4 className="text-sm font-black text-blue-900 mb-4 flex items-center gap-2"><PackageCheck size={16}/> 부분/전체 납품 (입고) 처리</h4>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1 block">납품(입고) 수량</label>
                                                <div className="relative">
                                                    <input 
                                                        type="number" 
                                                        min="1"
                                                        max={remainingQty}
                                                        value={receiveQty}
                                                        onChange={e => setReceiveQty(e.target.value)}
                                                        className="w-full bg-white border border-blue-200 rounded-lg pl-3 pr-8 py-2 text-sm font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                        required
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-blue-400">EA</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1 block">담당자 전달 사항</label>
                                                <input 
                                                    type="text" 
                                                    value={memo}
                                                    onChange={e => setMemo(e.target.value)}
                                                    placeholder="송장번호 또는 메모"
                                                    className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                        <button 
                                            type="submit" 
                                            disabled={loading}
                                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-black shadow-md shadow-blue-200 transition-colors"
                                        >
                                            {loading ? '처리 중...' : '납품 확인 및 QA 이관'}
                                        </button>
                                    </div>
                                </form>
                            )}
                            
                            {(os.Status === 'WAITING_INSPECTION' || os.Status === 'INSPECTION_COMPLETE' || os.Status === 'COMPLETED') && (
                                <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-center">
                                    <CheckCircle2 size={32} className="text-teal-500 mx-auto mb-2" />
                                    <p className="text-sm font-black text-teal-800">모든 잔량에 대한 납품이 확인되었습니다.</p>
                                    <p className="text-xs text-teal-600 font-bold mt-1">QA 부서의 검수 또는 적재 완료 후 최종 완료 처리됩니다.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {bomList.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[300px]">
                            <div className="p-5 pb-3 border-b border-slate-100 shrink-0">
                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><List size={16} className="text-slate-500"/> 불출 대상 원자재 (BOM)</h3>
                                <p className="text-xs text-slate-500 mt-1">상태를 '가공 진행 중'으로 변경 시 아래 자재들이 자동 출고됩니다.</p>
                            </div>
                            <div className="flex-1 overflow-hidden p-2">
                                <MasterDataGrid 
                                    data={formattedBomList}
                                    columnDefs={BOM_COLUMN_DEFS}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
