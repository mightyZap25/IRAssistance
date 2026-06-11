import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, doc, addDoc, updateDoc, serverTimestamp, orderBy, writeBatch, where, setDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { ShoppingCart, Plus, X, Box, Calendar, DollarSign, AlertCircle, Clock, CheckCircle2, ShieldCheck, ChevronRight, PackageCheck, FileText as FileTextIcon, Send, Mail, FileCheck, UserCheck, CreditCard, Truck } from 'lucide-react';

import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES } from '../services/userService';
import CreatePOModal from '../components/CreatePOModal';
import PurchaseOrderDetailPanel from '../components/PurchaseOrderDetailPanel';
import RFQEmailModal from '../components/RFQEmailModal';
import QuotationUploadModal from '../components/QuotationUploadModal';
import ApprovalModal from '../components/ApprovalModal';
import ExpenseResolutionModal from '../components/ExpenseResolutionModal';

const PO_STATUS_INFO = {
    DRAFT: { label: '초안(Draft)', color: 'bg-slate-100 text-slate-500 border-slate-200' },
    RFQ_SENT: { label: '견적요청중', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    QUOTED: { label: '견적수취완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    APPROVAL_PENDING: { label: '결제기안중', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    APPROVED: { label: '결제승인완료', color: 'bg-rose-50 text-rose-600 border-rose-200' },
    ORDERING: { label: '발주완료(PO)', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    WAITING_DELIVERY: { label: '입고대기', color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
    WAITING_INSPECTION: { label: '검사대기(QA)', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    RESOLUTION_SUBMITTED: { label: '지출결의완료', color: 'bg-slate-900 text-white border-slate-900' },
    RECEIVED: { label: '적재완료', color: 'bg-slate-50 text-slate-400 border-slate-100' }
};

const COLUMN_DEFS = {
    PONumber: { label: '문서 번호', default: true },
    PartName: { label: '품목 요약', default: true },
    VendorName: { label: '공급업체', default: true },
    Qty: { label: '수량', default: true },
    TotalPrice: { label: '합계(예상)', default: true },
    DueDate: { label: '납기희망일', default: true },
    Status: { label: '진행 상태', default: true },
    CreatedAt: { label: '등록일', default: false }
};

const generatePONumber = () => {
    const date = new Date();
    return `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
};

export default function PurchasingPage() {
    const { userProfile } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'CreatedAt', direction: 'desc' });
    
    // Modals
    const [activePO, setActivePO] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isRFQModalOpen, setIsRFQModalOpen] = useState(false);
    const [isQuoteUploadOpen, setIsQuoteUploadOpen] = useState(false);
    const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

    const [editingPO, setEditingPO] = useState(null);
    const [selectedPO, setSelectedPO] = useState(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const poSnap = await getDocs(query(collection(db, 'purchasing'), orderBy('CreatedAt', 'desc')));
            setOrders(poSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    const handleSavePO = async (formData) => {
        const { Items, ...restData } = formData;
        const TotalPrice = Items.reduce((acc, item) => acc + (item.Qty * item.UnitPrice), 0);
        const TotalQty = Items.reduce((acc, item) => acc + item.Qty, 0);
        const summaryPartName = Items.length > 0 ? (Items.length === 1 ? Items[0].PartName : `${Items[0].PartName} 외 ${Items.length - 1}건`) : '';

        if (formData.id) {
            const { id, ...rest } = formData;
            await updateDoc(doc(db, 'purchasing', id), { ...rest, Items, PartName: summaryPartName, Qty: TotalQty, TotalPrice, UpdatedAt: serverTimestamp() });
        } else {
            await addDoc(collection(db, 'purchasing'), {
                PONumber: generatePONumber(), ...restData, Items, PartName: summaryPartName, Qty: TotalQty, ReceivedQty: 0, TotalPrice,
                Status: 'DRAFT', PaymentStatus: 'PENDING', CreatedAt: serverTimestamp(), CreatedBy: userProfile?.uid
            });
        }
        fetchData();
    };

    const handleStatusUpdate = async (id, status, extra = {}) => {
        try {
            await updateDoc(doc(db, 'purchasing', id), { Status: status, ...extra, UpdatedAt: serverTimestamp() });
            fetchData();
        } catch (err) { console.error(err); }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedList = useMemo(() => {
        return [...orders].sort((a, b) => {
            if (sortConfig.key === 'CreatedAt') {
                const getTime = v => v?.seconds ? v.seconds * 1000 : 0;
                return sortConfig.direction === 'asc' ? getTime(a.CreatedAt) - getTime(b.CreatedAt) : getTime(b.CreatedAt) - getTime(a.CreatedAt);
            }
            return sortConfig.direction === 'asc' ? (a[sortConfig.key] > b[sortConfig.key] ? 1 : -1) : (a[sortConfig.key] < b[sortConfig.key] ? 1 : -1);
        });
    }, [orders, sortConfig]);

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-3 rounded-2xl border border-indigo-100/50 flex justify-between items-center shrink-0 relative overflow-hidden">
                <div className="flex items-center gap-4 text-left">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100"><ShoppingCart size={24} /></div>
                    <div><h1 className="text-xl font-black tracking-tight text-slate-900">발주 및 조달 통합 관리</h1><p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">Phase 4: Full Pipeline with Expense Resolution</p></div>
                </div>
                <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white font-extrabold py-3 px-6 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all hover:scale-105">
                    <Plus size={18} /><span>신규 발주서 작성</span>
                </button>
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/50 shadow-sm flex-1 flex flex-col min-h-0 relative z-20 overflow-hidden text-left">
                <MasterDataGrid
                    data={sortedList} columnDefs={COLUMN_DEFS} sortConfig={sortConfig} onSort={handleSort} rowKey="id" onRowClick={setSelectedPO}
                    enableSearch={true} searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="PO 번호, 업체명 검색..."
                    cellRenderer={{
                        Status: (val, row) => {
                            const info = PO_STATUS_INFO[val] || { label: val, color: 'bg-slate-50' };
                            return (
                                <div className="flex items-center gap-3">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${info.color}`}>{info.label}</span>
                                    <div className="flex gap-1">
                                        {val === 'DRAFT' && <button onClick={(e) => { e.stopPropagation(); setActivePO(row); setIsRFQModalOpen(true); }} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm" title="견적요청"><Send size={12}/></button>}
                                        {val === 'RFQ_SENT' && <button onClick={(e) => { e.stopPropagation(); setActivePO(row); setIsQuoteUploadOpen(true); }} className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm" title="견적등록"><Plus size={12}/></button>}
                                        {val === 'QUOTED' && <button onClick={(e) => { e.stopPropagation(); setActivePO(row); setIsApprovalModalOpen(true); }} className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 shadow-sm" title="결재기안 작성"><FileTextIcon size={12}/></button>}
                                        {val === 'APPROVED' && <button onClick={(e) => { e.stopPropagation(); handleStatusUpdate(row.id, 'ORDERING', { OrderedAt: new Date().toISOString() }); alert('발주 메일 발송 완료'); }} className="p-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 shadow-sm" title="최종 발주 요청(Email)"><Mail size={12}/></button>}
                                        {val === 'ORDERING' && (
                                            <button 
                                                onClick={async (e) => { 
                                                    e.stopPropagation(); 
                                                    if (!window.confirm('물품이 입고되었습니까? 품질 검사 대기열로 이관됩니다.')) return;
                                                    
                                                    const res = await qualityService.requestInspection({
                                                        Type: 'INCOMING',
                                                        RefPOID: row.id,
                                                        PONumber: row.PONumber,
                                                        PartID: row.Items?.[0]?.PartID || '', // 요약 정보 사용
                                                        PartName: row.PartName,
                                                        Qty: row.Qty,
                                                        VendorID: row.VendorID,
                                                        VendorName: row.VendorName
                                                    });

                                                    if (res.success) {
                                                        await handleStatusUpdate(row.id, 'WAITING_INSPECTION');
                                                        alert('품질 검사 대기열로 이송되었습니다.');
                                                    }
                                                }} 
                                                className="p-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 shadow-sm" 
                                                title="입고 확인 및 QA 이송"
                                            >
                                                <Truck size={12}/>
                                            </button>
                                        )}
                                        {val === 'INSPECTION_COMPLETE' && <button onClick={(e) => { e.stopPropagation(); setActivePO(row); setIsExpenseModalOpen(true); }} className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-black shadow-sm" title="지출결의서 작성"><CreditCard size={12}/></button>}
                                    </div>
                                </div>
                            );
                        },
                        TotalPrice: (val) => <span className="font-bold">₩ {val.toLocaleString()}</span>,
                        CreatedAt: (val) => <span className="text-xs text-slate-400">{val?.toDate ? val.toDate().toLocaleDateString() : '-'}</span>
                    }}
                />
            </div>

            <CreatePOModal isOpen={isCreateModalOpen || !!editingPO} initialData={editingPO} onClose={() => { setIsCreateModalOpen(false); setEditingPO(null); }} onSave={handleSavePO} />
            <RFQEmailModal isOpen={isRFQModalOpen} poData={activePO} onClose={() => setIsRFQModalOpen(false)} onSend={(d) => handleStatusUpdate(activePO.id, 'RFQ_SENT', { RFQEmail: d })} />
            <QuotationUploadModal isOpen={isQuoteUploadOpen} poData={activePO} onClose={() => setIsQuoteUploadOpen(false)} onSave={(d) => handleStatusUpdate(d.id, 'QUOTED', { ...d })} />
            <ApprovalModal isOpen={isApprovalModalOpen} poData={activePO} onClose={() => setIsApprovalModalOpen(false)} onSubmit={(d) => { const id = `APP-${Date.now()}`; setDoc(doc(db, 'approvals', id), { ...d, id }).then(() => handleStatusUpdate(activePO.id, 'APPROVAL_PENDING', { LastApprovalID: id })); setIsApprovalModalOpen(false); }} />
            <ExpenseResolutionModal isOpen={isExpenseModalOpen} poData={activePO} onClose={() => setIsExpenseModalOpen(false)} onSubmit={() => fetchData()} />
            <PurchaseOrderDetailPanel po={selectedPO} isOpen={!!selectedPO} onClose={() => setSelectedPO(null)} onRefresh={fetchData} onEdit={setEditingPO} />
        </div>
    );
}
