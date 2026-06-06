import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, doc, addDoc, updateDoc, serverTimestamp, orderBy, writeBatch } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { ShoppingCart, Plus, X, Box, Calendar, DollarSign, AlertCircle, Clock, CheckCircle2, ShieldCheck, ChevronRight, PackageCheck, FileText as FileTextIcon } from 'lucide-react';

import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES } from '../services/userService';
import CreatePOModal from '../components/CreatePOModal';
import PurchaseOrderDetailPanel from '../components/PurchaseOrderDetailPanel';
import RequestQuotationModal from '../components/RequestQuotationModal';

const PO_STATUS_INFO = {
    ORDERING: { label: '발주중', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    WAITING_DELIVERY: { label: '입고대기', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    WAITING_INSPECTION: { label: '검사대기 (QA)', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    RECEIVED: { label: '적재완료', color: 'bg-slate-50 text-slate-600 border-slate-200' }
};

const PAYMENT_STATUS_INFO = {
    PENDING: { label: '결제대기', color: 'text-amber-500' },
    INVOICED: { label: '청구됨', color: 'text-blue-500' },
    PAID: { label: '지급완료', color: 'text-emerald-500' }
};

const COLUMN_DEFS = {
    PONumber: { label: 'PO 번호', default: true },
    PartName: { label: '품목', default: true },
    VendorName: { label: '공급업체', default: true },
    Qty: { label: '발주수량', default: true },
    DueDate: { label: '납기일', default: true },
    Status: { label: '물류 상태', default: true },
    PaymentStatus: { label: '결제 상태', default: true },
    TotalPrice: { label: '총액', default: false },
    CreatedAt: { label: '발주일', default: false }
};

const generatePONumber = () => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PO-${yyyy}${mm}${dd}-${random}`;
};

export default function PurchasingPage() {
    const { userProfile } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI States
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'CreatedAt', direction: 'desc' });
    const [gridViewMode, setGridViewMode] = useState('list');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [editingPO, setEditingPO] = useState(null);
    const [selectedPO, setSelectedPO] = useState(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'purchasing'), orderBy('CreatedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const list = [];
            querySnapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            setOrders(list);
        } catch (error) {
            console.error("Error fetching purchasing data: ", error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Dashboard Stats
    const stats = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        
        let overdue = 0;
        let pendingApproval = 0;
        let unreceived = 0;
        let todayDue = 0;

        orders.forEach(po => {
            const items = po.Items || [];
            let totalPoQty = 0;
            let totalPoReceived = 0;
            
            // Backward compatibility
            if (items.length === 0 && po.Qty) {
                totalPoQty = po.Qty;
                totalPoReceived = po.ReceivedQty || 0;
            } else {
                totalPoQty = items.reduce((acc, it) => acc + (it.Qty || 0), 0);
                totalPoReceived = items.reduce((acc, it) => acc + (it.ReceivedQty || 0), 0);
            }

            if (po.Status === 'ORDERING' || po.Status === 'WAITING_DELIVERY') {
                unreceived += (totalPoQty - totalPoReceived);
            }
            if (po.PaymentStatus === 'PENDING') pendingApproval++;
            
            if (po.DueDate) {
                if (po.DueDate < todayStr && (po.Status === 'ORDERING' || po.Status === 'WAITING_DELIVERY')) {
                    overdue++;
                } else if (po.DueDate === todayStr && (po.Status === 'ORDERING' || po.Status === 'WAITING_DELIVERY')) {
                    todayDue++;
                }
            }
        });

        return { overdue, pendingApproval, unreceived, todayDue };
    }, [orders]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedList = useMemo(() => {
        return [...orders].sort((a, b) => {
            if (sortConfig.key === 'CreatedAt') {
                const getTime = val => val?.seconds ? val.seconds * 1000 : 0;
                return sortConfig.direction === 'asc' ? getTime(a.CreatedAt) - getTime(b.CreatedAt) : getTime(b.CreatedAt) - getTime(a.CreatedAt);
            }
            if (sortConfig.key === 'Qty' || sortConfig.key === 'TotalPrice') {
                return sortConfig.direction === 'asc' ? (a[sortConfig.key] || 0) - (b[sortConfig.key] || 0) : (b[sortConfig.key] || 0) - (a[sortConfig.key] || 0);
            }
            const aVal = String(a[sortConfig.key] || '');
            const bVal = String(b[sortConfig.key] || '');
            return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
    }, [orders, sortConfig]);

    const handleSavePO = async (formData) => {
        const { Items, ...restData } = formData;
        // Calculate root level TotalPrice and ReceivedQty
        const TotalPrice = Items.reduce((acc, item) => acc + (item.Qty * item.UnitPrice), 0);
        let TotalQty = Items.reduce((acc, item) => acc + item.Qty, 0);
        let ReceivedQty = Items.reduce((acc, item) => acc + (item.ReceivedQty || 0), 0);
        
        // Construct summary PartName
        let summaryPartName = '';
        if (Items.length > 0) {
            summaryPartName = Items.length === 1 
                ? Items[0].PartName 
                : `${Items[0].PartName} 외 ${Items.length - 1}건`;
        }

        if (formData.id) {
            const { id, PONumber, CreatedAt, CreatedBy, Status, PaymentStatus, ...rest } = restData;
            await updateDoc(doc(db, 'purchasing', id), { 
                ...rest, 
                Items,
                PartName: summaryPartName,
                Qty: TotalQty,
                ReceivedQty: ReceivedQty,
                TotalPrice, 
                UpdatedAt: serverTimestamp() 
            });
            
            if (selectedPO && selectedPO.id === id) {
                setSelectedPO(prev => ({ ...prev, ...rest, Items, PartName: summaryPartName, Qty: TotalQty, ReceivedQty, TotalPrice }));
            }
        } else {
            const newPO = {
                PONumber: generatePONumber(),
                ...restData,
                Items,
                PartName: summaryPartName,
                Qty: TotalQty,
                ReceivedQty: 0,
                TotalPrice,
                Status: 'ORDERING',
                PaymentStatus: 'PENDING',
                CreatedAt: serverTimestamp(),
                CreatedBy: userProfile?.uid
            };
            await addDoc(collection(db, 'purchasing'), newPO);
        }
        await fetchOrders();
    };

    const handleTogglePayment = async (po) => {
        const nextStatus = po.PaymentStatus === 'PENDING' ? 'INVOICED' : po.PaymentStatus === 'INVOICED' ? 'PAID' : 'PENDING';
        if (!window.confirm(`결제 상태를 '${PAYMENT_STATUS_INFO[nextStatus].label}'(으)로 변경하시겠습니까?`)) return;

        try {
            await updateDoc(doc(db, 'purchasing', po.id), { PaymentStatus: nextStatus });
            setOrders(prev => prev.map(o => o.id === po.id ? { ...o, PaymentStatus: nextStatus } : o));
        } catch (error) {
            console.error(error);
        }
    };

    const handleUpdateStatus = async (po) => {
        if(po.Status === 'ORDERING') {
            await updateDoc(doc(db, 'purchasing', po.id), { Status: 'WAITING_DELIVERY' });
            await fetchOrders();
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 dark:text-slate-100 p-3">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-3 rounded-2xl border border-indigo-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl text-white shadow-xl shadow-indigo-200">
                        <ShoppingCart size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">발주 관리 (Purchasing)</h1>
                        <p className="text-slate-500 mt-1 text-xs font-bold">협력사 발주 및 입고, QA 파이프라인 연계</p>
                    </div>
                </div>
                <div className="relative z-10 flex gap-2">
                    <button 
                        onClick={() => setIsRequestModalOpen(true)} 
                        className="flex items-center gap-2 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 font-extrabold py-2.5 px-4 rounded-xl shadow-sm transition-all hover:scale-105"
                    >
                        <ShoppingCart size={16} />
                        <span>견적 요청</span>
                    </button>
                    <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-md transition-all hover:scale-105">
                        <Plus size={16} />
                        <span>신규 발주서(PO) 생성</span>
                    </button>
                </div>
            </div>

            {/* Dashboard Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-none">
                <div className="bg-white rounded-xl border border-rose-100 p-4 shadow-sm flex items-center justify-between group">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-rose-500">납기 지연</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{stats.overdue} <span className="text-sm font-medium text-slate-400">건</span></p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform"><AlertCircle size={20}/></div>
                </div>
                <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm flex items-center justify-between group">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">결제 대기</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{stats.pendingApproval} <span className="text-sm font-medium text-slate-400">건</span></p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><DollarSign size={20}/></div>
                </div>
                <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm flex items-center justify-between group">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-500">미입고 잔여 수량</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{stats.unreceived.toLocaleString()} <span className="text-sm font-medium text-slate-400">EA</span></p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><PackageCheck size={20}/></div>
                </div>
                <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-sm flex items-center justify-between group">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500">오늘 입고 예정</p>
                        <p className="text-2xl font-black text-slate-800 mt-1">{stats.todayDue} <span className="text-sm font-medium text-slate-400">건</span></p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform"><Calendar size={20}/></div>
                </div>
            </div>

            {/* List Content */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/50 shadow-sm flex-1 flex flex-col min-h-0 relative z-20 overflow-hidden">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">데이터를 로드하는 중...</div>
                ) : (
                    <MasterDataGrid
                        data={sortedList}
                        columnDefs={COLUMN_DEFS}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        rowKey="id"
                        onRowClick={(row) => setSelectedPO(row)}
                        sortableColumns={['PONumber', 'DueDate', 'CreatedAt', 'Qty', 'TotalPrice']}
                        enableSearch={true}
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        searchPlaceholder="PO 번호, 품목명 검색..."
                        enableFilter={true}
                        onFilteredDataChange={setFilteredData}
                        enableViewModeToggle={true}
                        viewMode={gridViewMode}
                        onViewModeChange={setGridViewMode}
                        cellRenderer={{
                            PONumber: (val, row) => (
                                <div className="flex items-center gap-2">
                                    {row.Urgent && <AlertCircle size={14} className="text-rose-500" title="긴급" />}
                                    <span className="font-extrabold text-slate-900">{val}</span>
                                </div>
                            ),
                            PartName: (val) => <span className="font-bold text-slate-700">{val}</span>,
                            VendorName: (val) => <span className="text-slate-600 font-medium">{val}</span>,
                            Qty: (val) => <span className="font-bold text-indigo-600">{val.toLocaleString()} EA</span>,
                            DueDate: (val) => {
                                const isOverdue = val < new Date().toISOString().split('T')[0];
                                return <span className={`font-bold ${isOverdue ? 'text-rose-500' : 'text-slate-600'}`}>{val}</span>;
                            },
                            Status: (val, row) => {
                                const info = PO_STATUS_INFO[val] || PO_STATUS_INFO.RECEIVED;
                                const progress = row.Qty > 0 ? Math.min(((row.ReceivedQty || 0) / row.Qty) * 100, 100) : 0;
                                return (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider border ${info.color}`}>
                                                {info.label}
                                            </span>
                                            {val === 'ORDERING' && (
                                                <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(row); }} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors" title="입고 대기(발주 확정)로 변경">
                                                    <ChevronRight size={14} />
                                                </button>
                                            )}
                                        </div>
                                        {(val === 'WAITING_DELIVERY' || row.ReceivedQty > 0) && (
                                            <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden mt-0.5">
                                                <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }}></div>
                                            </div>
                                        )}
                                    </div>
                                );
                            },
                            PaymentStatus: (val, row) => {
                                const info = PAYMENT_STATUS_INFO[val] || PAYMENT_STATUS_INFO.PENDING;
                                return (
                                    <button onClick={(e) => { e.stopPropagation(); handleTogglePayment(row); }} className={`flex items-center gap-1.5 text-xs font-bold ${info.color} hover:opacity-70 transition-opacity`}>
                                        {val === 'PAID' ? <CheckCircle2 size={14}/> : <Clock size={14}/>}
                                        {info.label}
                                    </button>
                                );
                            },
                            TotalPrice: (val) => <span className="font-bold text-slate-700">₩ {val.toLocaleString()}</span>,
                            CreatedAt: (val) => <span className="text-xs text-slate-400">{val?.toDate ? val.toDate().toLocaleDateString() : 'N/A'}</span>
                        }}
                        cardRenderer={(row) => (
                            <div key={row.id} className={`bg-white rounded-xl border ${row.Urgent ? 'border-rose-200 shadow-rose-100' : 'border-slate-200'} p-4 shadow-sm hover:shadow-md transition-all group`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        {row.Urgent && <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 animate-pulse"><AlertCircle size={14}/></div>}
                                        <span className="text-sm font-black text-slate-900">{row.PONumber}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider border ${PO_STATUS_INFO[row.Status]?.color || 'bg-slate-50'}`}>
                                        {PO_STATUS_INFO[row.Status]?.label}
                                    </span>
                                </div>
                                <h3 className="text-base font-bold text-slate-800 mb-1 line-clamp-1">{row.PartName}</h3>
                                <p className="text-xs text-slate-500 font-medium mb-3">공급사: {row.VendorName}</p>
                                
                                <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg p-2 mb-3 border border-slate-100">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold">수량</p>
                                        <p className="text-sm font-black text-indigo-600">{row.Qty.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold">납기일</p>
                                        <p className="text-sm font-bold text-slate-700">{row.DueDate}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <button onClick={(e) => { e.stopPropagation(); handleTogglePayment(row); }} className={`flex items-center gap-1.5 text-xs font-bold ${PAYMENT_STATUS_INFO[row.PaymentStatus]?.color}`}>
                                        {row.PaymentStatus === 'PAID' ? <CheckCircle2 size={14}/> : <Clock size={14}/>}
                                        {PAYMENT_STATUS_INFO[row.PaymentStatus]?.label}
                                    </button>
                                    
                                    <div className="text-xs font-bold text-slate-400">
                                        상세보기 ➔
                                    </div>
                                </div>
                            </div>
                        )}
                    />
                )}
            </div>

            <CreatePOModal 
                isOpen={isCreateModalOpen || !!editingPO} 
                initialData={editingPO}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingPO(null);
                }} 
                onSave={handleSavePO} 
            />

            <PurchaseOrderDetailPanel
                po={selectedPO}
                isOpen={!!selectedPO}
                onClose={() => setSelectedPO(null)}
                onRefresh={fetchOrders}
                onEdit={(po) => setEditingPO(po)}
            />

            <RequestQuotationModal 
                isOpen={isRequestModalOpen}
                onClose={() => setIsRequestModalOpen(false)}
            />
        </div>
    );
}
