import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { Plus, Trash2, Mail, Phone, User, X, Building2, Pencil, History, Package, ExternalLink, ChevronRight } from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import MasterDetailLayout from '../components/common/MasterDetailLayout';
import CustomerDetailPanel from '../components/CustomerDetailPanel';

export default function CustomersPage() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // States for MasterDataGrid internal features integration
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('card');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    async function fetchCustomers() {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'customers'));
            const data = [];
            querySnapshot.forEach(doc => {
                data.push({ ...doc.data(), id: doc.id });
            });
            setCustomers(data);
        } catch (error) {
            console.error("Error fetching customers:", error);
        } finally {
            setLoading(false);
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm("정말 이 고객사를 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, 'customers', id));
            setCustomers(prev => prev.filter(c => c.id !== id));
            if (selectedCustomer?.id === id) setIsDetailOpen(false);
        } catch (error) {
            console.error("Error deleting customer:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    };

    const handleEdit = (customer) => {
        setEditingCustomer(customer);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingCustomer(null);
        setIsModalOpen(true);
    };

    const handleRowClick = (customer) => {
        setSelectedCustomer(customer);
        setIsDetailOpen(true);
    };

    const COLUMN_DEFS = {
        Name: { label: '고객사명', default: true },
        Category: { label: '구분', default: true },
        ContactPerson: { label: '담당자', default: true },
        Email: { label: '이메일', default: true },
        Phone: { label: '전화번호', default: true },
        Address: { label: '주소', default: false }
    };

    const cellRenderer = {
        Category: (val) => (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                val === '해외' ? 'bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400'
            }`}>
                {val || '국내'}
            </span>
        ),
        Email: (val) => (
            <div className="flex items-center gap-2">
                <Mail size={14} className="text-slate-400" />
                <span className="text-slate-600 dark:text-slate-400 font-medium">{val || '-'}</span>
            </div>
        )
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 dark:text-slate-100">
            
            {/* Premium Unified Header Design */}
            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent p-3 rounded-xl border border-blue-100/35 dark:border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="absolute right-0 top-0 w-48 h-48 bg-blue-500/5 blur-3xl rounded-full -mr-10 -mt-5 pointer-events-none"></div>
                <div className="relative">
                    <h1 className="text-xl font-black tracking-tight leading-tight bg-gradient-to-r from-slate-900 to-blue-950 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
                        고객사 관리 (Customers)
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-xs font-bold uppercase tracking-wider">
                        CRM & Delivery Master Database
                    </p>
                </div>
                <div className="relative">
                    <button
                        onClick={handleCreate}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold py-2.5 px-3 rounded-2xl transition-all shadow-lg shadow-blue-200 dark:shadow-none hover:scale-[1.02] transform"
                    >
                        <Plus size={18} />
                        <span>고객사 등록</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area with Integrated MasterDataGrid */}
            <div className="flex flex-col flex-1 min-h-0 relative z-20 overflow-hidden">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/80 rounded-[1.8rem]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-slate-450 font-black text-sm uppercase tracking-widest">Loading Customers...</span>
                        </div>
                    </div>
                ) : (
                    <MasterDetailLayout 
                        showDetail={!!selectedCustomer}
                        onCloseDetail={() => {
                            setSelectedCustomer(null);
                            setIsDetailOpen(false);
                        }}
                        initialListWidth="45%"
                        list={
                            <div className="h-full bg-white/60 dark:bg-slate-900/60 backdrop-blur-md">
                                <MasterDataGrid
                                    data={customers}
                                    columnDefs={COLUMN_DEFS}
                                    onRowClick={handleRowClick}
                                    rowKey="id"
                                    
                                    // Integrated MasterDataGrid Features
                                    enableSearch={true}
                                    searchTerm={searchTerm}
                                    onSearchChange={setSearchTerm}
                                    searchPlaceholder="고객사명, 담당자 검색..."
                                    
                                    enableFilter={true}
                                    enableViewModeToggle={true}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewMode}
                                    
                                    cardRenderer={(c) => (
                                        <div 
                                            key={c.id} 
                                            onClick={() => handleRowClick(c)}
                                            className={`bg-white dark:bg-slate-900 rounded-[2rem] p-5 border shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[260px] ${selectedCustomer?.id === c.id ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-blue-200/50' : 'border-slate-100 dark:border-slate-800'}`}
                                        >
                                            {/* Top Accent Line */}
                                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            
                                            {/* Card Top: Category & Actions */}
                                            <div className="flex justify-between items-center mb-6">
                                                <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm ${
                                                    c.Category === '해외' 
                                                    ? 'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/50' 
                                                    : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50'
                                                }`}>
                                                    {c.Category || '국내'}
                                                </span>
                                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(c); }}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition-all shadow-sm bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-slate-800 rounded-xl transition-all shadow-sm bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Card Main: Company Info */}
                                            <div className="flex items-start gap-5 mb-auto">
                                                <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:scale-105 transition-all duration-500 shadow-inner">
                                                    <Building2 size={32} strokeWidth={1.5} />
                                                </div>
                                                <div className="min-w-0 flex-1 py-1">
                                                    <h3 className="font-black text-slate-900 dark:text-white text-xl leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate tracking-tight">{c.Name}</h3>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{c.id.substring(0, 8)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card Bottom: Contact Details */}
                                            <div className="mt-8 pt-5 border-t border-slate-50 dark:border-slate-800/60 grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">담당자</p>
                                                    <div className="flex items-center gap-2">
                                                        <User size={12} className="text-blue-500" />
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{c.ContactPerson || '-'}</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">연락처</p>
                                                    <div className="flex items-center gap-2 justify-end text-slate-500 group-hover:text-slate-700 transition-colors">
                                                        <Phone size={12} />
                                                        <span className="text-xs font-bold truncate">{c.Phone || '-'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                                                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                                    <History size={12} />
                                                    <span>View Insights</span>
                                                </div>
                                                <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1.5 transition-all duration-300" />
                                            </div>
                                        </div>
                                    )}
                                    cellRenderer={cellRenderer}
                                    onEdit={handleEdit}
                                    onDelete={(row) => handleDelete(row.id)}
                                />
                            </div>
                        }
                        detail={
                            selectedCustomer && (
                                <CustomerDetailPanel
                                    inline={true}
                                    customer={selectedCustomer}
                                    onClose={() => {
                                        setSelectedCustomer(null);
                                        setIsDetailOpen(false);
                                    }}
                                    onEdit={(c) => {
                                        setEditingCustomer(c);
                                        setIsModalOpen(true);
                                    }}
                                />
                            )
                        }
                    />
                )}
            </div>

            {/* Modal for Creating/Editing */}
            {isModalOpen && (
                <CustomerModal
                    initialData={editingCustomer}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={(updatedC) => {
                        if (editingCustomer) {
                            setCustomers(prev => prev.map(c => c.id === updatedC.id ? updatedC : c));
                        } else {
                            setCustomers(prev => [...prev, updatedC]);
                        }
                        setIsModalOpen(false);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Customer Detail View Component
 * @deprecated Replaced by CustomerDetailPanel in MasterDetailLayout
 */
function CustomerDetailView({ customer, onClose, onEdit }) {
    const [activeTab, setActiveTab] = useState('history');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const q = query(
                    collection(db, 'receiving'),
                    where('CustomerName', '==', customer.Name),
                    where('Type', '==', 'SHIPPING'),
                    orderBy('CreatedAt', 'desc')
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setHistory(data);
            } catch (err) {
                console.error("Error fetching customer history:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [customer]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] shadow-2xl rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-slate-50/50 dark:bg-slate-850/30">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Building2 size={32} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{customer.Name}</h2>
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded uppercase">{customer.Category || '국내'}</span>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-4 text-sm">
                                <span className="flex items-center gap-1.5"><User size={14} className="text-slate-400" /> {customer.ContactPerson || '-'}</span>
                                <span className="flex items-center gap-1.5"><Phone size={14} className="text-slate-400" /> {customer.Phone || '-'}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all shadow-sm">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`py-4 px-3 text-xs font-black transition-all border-b-2 uppercase tracking-widest ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        <div className="flex items-center gap-2">
                            <History size={16} />
                            납품 이력 (History)
                        </div>
                    </button>
                    <button 
                        onClick={() => setActiveTab('info')}
                        className={`py-4 px-3 text-xs font-black transition-all border-b-2 uppercase tracking-widest ${activeTab === 'info' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        기타 정보 (Info)
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/30 dark:bg-slate-900/50">
                    {activeTab === 'history' ? (
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-center py-20 text-slate-450 font-bold uppercase tracking-widest text-xs">이력을 불러오는 중...</div>
                            ) : history.length === 0 ? (
                                <div className="text-center py-20 bg-white dark:bg-slate-850/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                    <Package size={48} className="mx-auto text-slate-200 dark:text-slate-800 mb-4" />
                                    <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">납품 이력이 없습니다.</p>
                                </div>
                            ) : (
                                history.map(item => (
                                    <div key={item.id} className="bg-white dark:bg-slate-850/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">{item.PoID || item.PR_ID || 'No Ref'}</div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-200">{item.PartName}</h4>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-black text-slate-800 dark:text-slate-100">{Number(item.ReceivedQty || item.Quantity || 0).toLocaleString()} PKG</div>
                                                <div className="text-[10px] font-bold text-slate-400 mt-1">{item.CreatedAt?.toDate().toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                                item.Status === 'RETURN_COMPLETE' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 
                                                item.Status === 'INSPECTION_COMPLETE' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                            }`}>
                                                {item.Status}
                                            </span>
                                            {item.DriveLink && (
                                                <a href={item.DriveLink} target="_blank" rel="noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline text-xs font-black flex items-center gap-1 transition-all">
                                                    성적서 보기 <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-850/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-8 text-left">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 ml-1">주소 (Address)</label>
                                <p className="text-slate-700 dark:text-slate-300 font-bold leading-relaxed text-sm p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    {customer.Address || '등록된 주소 정보가 없습니다.'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">이메일</label>
                                    <p className="text-slate-700 dark:text-slate-300 font-black text-sm">{customer.Email || '-'}</p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">연락처</label>
                                    <p className="text-slate-700 dark:text-slate-300 font-black text-sm">{customer.Phone || '-'}</p>
                                </div>
                            </div>
                            <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold italic tracking-wider">ECount API Integration Pending...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/30 flex justify-end gap-3">
                    <button 
                        onClick={() => onEdit(customer)}
                        className="px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2 transform active:scale-95"
                    >
                        <Pencil size={18} />
                        정보 수정
                    </button>
                    <button 
                        onClick={onClose}
                        className="px-4 py-3 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-black rounded-2xl transition-all shadow-lg shadow-slate-200 dark:shadow-none transform active:scale-95"
                    >
                        창 닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Customer Form Modal Component
 */
function CustomerModal({ initialData, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        Name: '', Category: '국내', ContactPerson: '', Email: '', Phone: '', Address: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                Name: initialData.Name || '',
                Category: initialData.Category || '국내',
                ContactPerson: initialData.ContactPerson || '',
                Email: initialData.Email || '',
                Phone: initialData.Phone || '',
                Address: initialData.Address || ''
            });
        }
    }, [initialData]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (initialData) {
                const docRef = doc(db, 'customers', initialData.id);
                await updateDoc(docRef, { ...formData });
                onSuccess({ ...formData, id: initialData.id });
            } else {
                const docRef = await addDoc(collection(db, 'customers'), {
                    ...formData,
                    CreatedAt: Timestamp.now()
                });
                onSuccess({ ...formData, id: docRef.id });
            }
        } catch (error) {
            console.error("Error saving customer:", error);
            alert("고객사 저장 중 오류가 발생했습니다.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputClasses = "w-full px-4 py-2.5 bg-slate-50/50 dark:bg-slate-850/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-slate-700 dark:text-slate-200 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";
    const labelClasses = "block text-xs font-black text-slate-450 dark:text-slate-500 ml-1 mb-1.5 uppercase tracking-widest";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 text-left">
                <div className="px-4 py-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-850/30">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-tight">{initialData ? '고객사 수정' : '신규 고객사 등록'}</h2>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase font-black tracking-widest">Customer Master Data</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all text-slate-400"><X size={24} /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-6">
                    <div className="space-y-5">
                        <div className="p-5 bg-blue-50/30 dark:bg-blue-900/10 rounded-xl border border-blue-100/50 dark:border-blue-900/30">
                            <label className={`${labelClasses} text-blue-600 dark:text-blue-400`}>고객사명 (Company Name)</label>
                            <input type="text" required
                                placeholder="회사명을 입력하세요"
                                className={`${inputClasses} bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900/50 focus:ring-blue-500/10 text-lg font-black`}
                                value={formData.Name}
                                onChange={e => setFormData({ ...formData, Name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelClasses}>구분</label>
                                <select
                                    className={inputClasses}
                                    value={formData.Category}
                                    onChange={e => setFormData({ ...formData, Category: e.target.value })}
                                >
                                    <option value="국내">국내 (Domestic)</option>
                                    <option value="해외">해외 (Overseas)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClasses}>담당자</label>
                                <input type="text"
                                    placeholder="성함"
                                    className={inputClasses}
                                    value={formData.ContactPerson}
                                    onChange={e => setFormData({ ...formData, ContactPerson: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className={labelClasses}>이메일</label>
                                <input type="email"
                                    placeholder="example@mail.com"
                                    className={inputClasses}
                                    value={formData.Email}
                                    onChange={e => setFormData({ ...formData, Email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClasses}>연락처</label>
                                <input type="tel"
                                    placeholder="010-0000-0000"
                                    className={inputClasses}
                                    value={formData.Phone}
                                    onChange={e => setFormData({ ...formData, Phone: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className={labelClasses}>주소 (Address)</label>
                            <textarea
                                placeholder="회사 주소를 입력하세요"
                                className={`${inputClasses} min-h-[100px] resize-none`}
                                value={formData.Address}
                                onChange={e => setFormData({ ...formData, Address: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button type="button" onClick={onClose} className="flex-1 py-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 font-black text-slate-400 dark:text-slate-500 transition-all text-xs uppercase tracking-widest">취소</button>
                        <button type="submit" disabled={isSubmitting} className="flex-[2] py-4 rounded-2xl bg-slate-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white font-black shadow-xl shadow-slate-200 dark:shadow-none transition-all disabled:opacity-50 text-xs uppercase tracking-widest transform active:scale-95">
                            {isSubmitting ? '처리 중...' : (initialData ? '수정 완료' : '고객사 등록')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
