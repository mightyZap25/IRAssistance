import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, addDoc, updateDoc, serverTimestamp, orderBy, where, writeBatch, setDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { Settings, Plus, Send, FileText, Mail, ChevronRight, Package, ArrowRight, Truck, CheckCircle2, CreditCard, History, AlertCircle } from 'lucide-react';

import CreateOutsourcingModal from '../components/CreateOutsourcingModal';
import RFQEmailModal from '../components/RFQEmailModal';
import ApprovalModal from '../components/ApprovalModal';
import ExpenseResolutionModal from '../components/ExpenseResolutionModal';
import { createNotification } from '../services/notificationService';

const OUTSOURCING_STATUS = {
    DRAFT: { label: '의뢰초안', color: 'bg-slate-100 text-slate-500 border-slate-200' },
    RFQ_SENT: { label: '견적요청중', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    QUOTED: { label: '견적수취완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    APPROVAL_PENDING: { label: '결제기안중', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    APPROVED: { label: '승인완료(불출대기)', color: 'bg-rose-50 text-rose-600 border-rose-200' },
    MATERIAL_SHIPPED: { label: '자재출고완료', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    IN_PROCESSING: { label: '가공진행중', color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
    WAITING_INSPECTION: { label: '입고/검사대기', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    RESOLUTION_SUBMITTED: { label: '지출결의완료', color: 'bg-slate-900 text-white' }
};

export default function OutsourcingPage() {
    const { userProfile } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'CreatedAt', direction: 'desc' });

    // Modals
    const [activeOrder, setActiveOrder] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isRFQModalOpen, setIsRFQModalOpen] = useState(false);
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'outsourcing'), orderBy('CreatedAt', 'desc')));
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    const handleSaveOrder = async (formData) => {
        if (formData.id) {
            await updateDoc(doc(db, 'outsourcing', formData.id), { ...formData, UpdatedAt: serverTimestamp() });
        } else {
            await addDoc(collection(db, 'outsourcing'), {
                ...formData,
                OrderNumber: `OUT-${Date.now()}`,
                CreatedAt: serverTimestamp(),
                CreatedBy: userProfile?.uid
            });
        }
        fetchData();
    };

    // ─────────────────────────────────────────────────────────────
    // 핵심 기능: 자재 불출 (재고 차감)
    // ─────────────────────────────────────────────────────────────
    const handleShipMaterials = async (order) => {
        if (!window.confirm('선택한 사급 자재들을 업체로 불출하시겠습니까?\n이 작업은 즉시 창고 재고를 차감합니다.')) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const invSnap = await getDocs(collection(db, 'inventory'));
            const invMap = {};
            invSnap.docs.forEach(d => { invMap[d.data().PartID] = { id: d.id, onHand: d.data().OnHand || 0 }; });

            // 1. 각 자재 차감
            for (const mat of order.Materials) {
                const invItem = invMap[mat.PartID];
                if (!invItem) {
                    alert(`자재 [${mat.PartID}]의 재고 정보가 없습니다. 차감을 중단합니다.`);
                    setLoading(false); return;
                }
                if (invItem.onHand < mat.Quantity) {
                    if (!window.confirm(`자재 [${mat.PartID}]의 재고가 부족합니다. (현재: ${invItem.onHand})\n그래도 진행하시겠습니까?`)) {
                        setLoading(false); return;
                    }
                }
                batch.update(doc(db, 'inventory', invItem.id), {
                    OnHand: invItem.onHand - mat.Quantity,
                    UpdatedAt: serverTimestamp()
                });
            }

            // 2. 상태 변경
            batch.update(doc(db, 'outsourcing', order.id), {
                Status: 'MATERIAL_SHIPPED',
                ShippedAt: new Date().toISOString()
            });

            await batch.commit();
            alert('자재 불출 및 재고 차감이 완료되었습니다.');
            fetchData();
        } catch (err) { console.error(err); alert('자재 불출 중 오류 발생'); } finally { setLoading(false); }
    };

    const handleStatusUpdate = async (id, status, extra = {}) => {
        await updateDoc(doc(db, 'outsourcing', id), { Status: status, ...extra, UpdatedAt: serverTimestamp() });
        fetchData();
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent p-3 rounded-2xl border border-blue-100/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 text-left">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><Settings size={24} /></div>
                    <div><h1 className="text-xl font-black tracking-tight text-slate-900">외주 가공 관리 (Outsourcing)</h1><p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">Inventory Linking & Sub-Processing</p></div>
                </div>
                <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white font-extrabold py-3 px-6 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all hover:scale-105">
                    <Plus size={18} /><span>신규 외주 의뢰</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden text-left">
                <MasterDataGrid
                    data={orders}
                    columnDefs={{
                        OrderNumber: { label: '의뢰 번호', default: true },
                        TargetPartName: { label: '가공 품목', default: true },
                        VendorName: { label: '외주 업체', default: true },
                        TargetQty: { label: '수량', default: true },
                        DueDate: { label: '납기 요청일', default: true },
                        Status: { label: '진행 상태', default: true }
                    }}
                    rowKey="id"
                    cellRenderer={{
                        Status: (val, row) => {
                            const info = OUTSOURCING_STATUS[val] || { label: val, color: 'bg-slate-50' };
                            return (
                                <div className="flex items-center gap-3">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${info.color}`}>{info.label}</span>
                                    <div className="flex gap-1">
                                        {val === 'DRAFT' && <button onClick={(e) => { e.stopPropagation(); setActiveOrder(row); setIsRFQModalOpen(true); }} className="p-1.5 bg-indigo-600 text-white rounded-lg" title="견적요청"><Send size={12}/></button>}
                                        {val === 'APPROVED' && <button onClick={(e) => { e.stopPropagation(); handleShipMaterials(row); }} className="p-1.5 bg-rose-600 text-white rounded-lg animate-pulse" title="자재 불출(출고)"><Truck size={12}/></button>}
                                        {val === 'MATERIAL_SHIPPED' && <button onClick={(e) => { e.stopPropagation(); handleStatusUpdate(row.id, 'IN_PROCESSING'); }} className="p-1.5 bg-cyan-600 text-white rounded-lg" title="가공 시작"><ChevronRight size={12}/></button>}
                                        {val === 'INSPECTION_COMPLETE' && <button onClick={(e) => { e.stopPropagation(); setActiveOrder(row); setIsExpenseModalOpen(true); }} className="p-1.5 bg-slate-900 text-white rounded-lg" title="지출결의 작성"><CreditCard size={12}/></button>}
                                    </div>
                                </div>
                            );
                        },
                        TargetQty: (val) => <span className="font-bold text-indigo-600">{val.toLocaleString()} EA</span>
                    }}
                />
            </div>

            {/* Modals */}
            <CreateOutsourcingModal isOpen={isCreateModalOpen} onSave={handleSaveOrder} onClose={() => setIsCreateModalOpen(false)} />
            <RFQEmailModal isOpen={isRFQModalOpen} poData={activeOrder} onClose={() => setIsRFQModalOpen(false)} onSend={(d) => handleStatusUpdate(activeOrder.id, 'RFQ_SENT', { RFQEmail: d })} />
            <ApprovalModal 
                isOpen={isApprovalModalOpen} 
                poData={activeOrder} 
                onClose={() => setIsApprovalModalOpen(false)} 
                onSubmit={(d) => { 
                    const id = `APP-${Date.now()}`; 
                    setDoc(doc(db, 'approvals', id), { ...d, id }).then(() => {
                        handleStatusUpdate(activeOrder.id, 'APPROVAL_PENDING', { LastApprovalID: id });
                        // 결재자에게 알림 발송
                        createNotification(
                            d.ApproverID,
                            '신규 외주 결재 요청',
                            `[${activeOrder.VendorName}] ${activeOrder.TargetPartName} 외 건에 대한 결재가 요청되었습니다.`,
                            `/outsourcing`
                        );
                    }); 
                    setIsApprovalModalOpen(false); 
                }} 
            />
            <ExpenseResolutionModal isOpen={isExpenseModalOpen} poData={activeOrder} onClose={() => setIsExpenseModalOpen(false)} onSubmit={() => fetchData()} />
        </div>
    );
}
