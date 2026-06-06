import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, setDoc, updateDoc, serverTimestamp, orderBy } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { Factory, Plus, Clock, CheckCircle2, TrendingUp, AlertCircle, DollarSign } from 'lucide-react';
import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES } from '../services/userService';
import CreateOutsourcingModal from '../components/CreateOutsourcingModal';
import OutsourcingDetailPanel from '../components/OutsourcingDetailPanel';

const OS_STATUS_INFO = {
    WAITING_RELEASE: { label: '자재 출고 대기', color: 'bg-slate-50 text-slate-600 border-slate-200' },
    IN_PROGRESS: { label: '가공 진행 중', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    WAITING_INSPECTION: { label: '검사대기(QA)', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    INSPECTION_COMPLETE: { label: '검사완료', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    COMPLETED: { label: '완료됨', color: 'bg-slate-50 text-slate-600 border-slate-200' }
};

const COLUMN_DEFS = {
    OSNumber: { label: '발주 번호', default: true },
    PartName: { label: '생산 대상 품목', default: true },
    VendorName: { label: '외주가공 업체', default: true },
    Qty: { label: '의뢰 수량', default: true },
    ReceivedQty: { label: '납품 수량', default: true },
    DueDate: { label: '납기일', default: true },
    Status: { label: '진행 상태', default: true },
    CreatedAt: { label: '발주일', default: false }
};

const generateOSNumber = () => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `OS-${yyyy}${mm}${dd}-${random}`;
};

export default function OutsourcingPage() {
    const { userProfile } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI States
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingOS, setEditingOS] = useState(null);
    const [selectedOS, setSelectedOS] = useState(null);
    const [activeTab, setActiveTab] = useState('PENDING');

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'outsourcing'), orderBy('CreatedAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const list = [];
            querySnapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() }));
            setOrders(list);
        } catch (error) {
            console.error("Error fetching outsourcing data: ", error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Stats
    const stats = useMemo(() => {
        let total = 0;
        let pending = 0;
        let completed = 0;
        let urgent = 0;
        let unpaidBalance = 0;
        
        orders.forEach(os => {
            total++;
            if (os.Status === 'WAITING_INSPECTION' || os.Status === 'INSPECTION_COMPLETE' || os.Status === 'COMPLETED') {
                completed++;
            } else {
                pending++;
            }
            if (os.Urgent && (os.Status === 'WAITING_RELEASE' || os.Status === 'IN_PROGRESS')) {
                urgent++;
            }
            if (os.PaymentStatus !== 'PAID') {
                unpaidBalance += (os.ReceivedQty || 0) * (os.UnitPrice || 0);
            }
        });
        
        const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

        return { total, pending, completed, urgent, completionRate, unpaidBalance };
    }, [orders]);

    const vendorStats = useMemo(() => {
        const vMap = {};
        orders.forEach(os => {
            if (!vMap[os.VendorName]) {
                vMap[os.VendorName] = { total: 0, completed: 0, receivedQty: 0, totalQty: 0 };
            }
            vMap[os.VendorName].total++;
            vMap[os.VendorName].totalQty += os.Qty;
            vMap[os.VendorName].receivedQty += (os.ReceivedQty || 0);
            if (['WAITING_INSPECTION', 'INSPECTION_COMPLETE', 'COMPLETED'].includes(os.Status)) {
                vMap[os.VendorName].completed++;
            }
        });
        
        return Object.entries(vMap)
            .map(([name, data]) => ({
                name,
                ...data,
                completionRate: data.totalQty > 0 ? Math.round((data.receivedQty / data.totalQty) * 100) : 0
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
    }, [orders]);

    // Apply Filters & Tabs
    useEffect(() => {
        let result = orders;
        
        // Tab Filter
        if (activeTab === 'PENDING') {
            result = result.filter(o => !['WAITING_INSPECTION', 'INSPECTION_COMPLETE', 'COMPLETED'].includes(o.Status));
        } else {
            result = result.filter(o => ['WAITING_INSPECTION', 'INSPECTION_COMPLETE', 'COMPLETED'].includes(o.Status));
        }

        // Search Filter
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(o => 
                (o.OSNumber && o.OSNumber.toLowerCase().includes(lower)) ||
                (o.PartName && o.PartName.toLowerCase().includes(lower)) ||
                (o.VendorName && o.VendorName.toLowerCase().includes(lower))
            );
        }

        const formatted = result.map(o => ({
            ...o,
            Status: <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${OS_STATUS_INFO[o.Status]?.color || 'bg-slate-100'}`}>{OS_STATUS_INFO[o.Status]?.label || o.Status}</span>,
            CreatedAt: o.CreatedAt?.toDate ? o.CreatedAt.toDate().toLocaleString() : '-',
            ReceivedQty: <span className={o.ReceivedQty > 0 ? "text-blue-600 font-bold" : "text-slate-400 font-medium"}>{o.ReceivedQty || 0}</span>,
            OSNumber: <span className="font-bold text-slate-800 flex items-center gap-1">{o.OSNumber}{o.Urgent && <AlertCircle size={12} className="text-rose-500"/>}{o.PaymentStatus === 'PENDING' && <DollarSign size={12} className="text-amber-500"/>}</span>
        }));

        setFilteredData(formatted);
    }, [orders, searchTerm, activeTab]);

    const handleSaveOS = async (formData) => {
        if (editingOS) {
            await updateDoc(doc(db, 'outsourcing', editingOS.id), {
                ...formData,
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });
            setEditingOS(null);
        } else {
            const OSNumber = generateOSNumber();
            await setDoc(doc(collection(db, 'outsourcing')), {
                ...formData,
                OSNumber,
                Status: 'WAITING_RELEASE',
                PaymentStatus: 'PENDING',
                ReceivedQty: 0,
                CreatedAt: serverTimestamp(),
                CreatedBy: userProfile?.uid
            });
        }
        await fetchOrders();
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">외주 생산 관리</h1>
                    <p className="text-sm font-bold text-slate-500 mt-2">협력사 외주 생산 발주 및 입고 추적</p>
                </div>
                <RoleGuard allowedRoles={[USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ENGINEER]}>
                    <button 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 shadow-md shadow-blue-200 transition-all flex items-center gap-2"
                    >
                        <Plus size={18} /> 신규 외주 발주
                    </button>
                </RoleGuard>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-5 gap-4 shrink-0">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-500 border border-slate-100">
                        <Factory size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">전체 누적 발주</p>
                        <p className="text-xl font-black text-slate-800">{stats.total}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-500 border border-blue-100">
                        <Clock size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">진행 중 (가공/대기)</p>
                        <p className="text-xl font-black text-blue-600">{stats.pending}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-rose-50 rounded-xl text-rose-500 border border-rose-100">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">긴급 외주 발주</p>
                        <p className="text-xl font-black text-rose-600">{stats.urgent}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-teal-50 rounded-xl text-teal-500 border border-teal-100">
                        <CheckCircle2 size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">납품 완료율</p>
                        <div className="flex items-end justify-between">
                            <p className="text-xl font-black text-teal-600">{stats.completionRate}<span className="text-sm font-bold text-slate-500 ml-1">%</span></p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-500 border border-amber-100">
                        <DollarSign size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">결제 대기 (미정산액)</p>
                        <p className="text-xl font-black text-amber-600">₩{stats.unpaidBalance.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Vendor Stats */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 shrink-0">
                <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500"/> 주요 외주 업체별 납품 진척률 (Top 3)</h3>
                <div className="grid grid-cols-3 gap-6">
                    {vendorStats.map((v, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-bold text-slate-700">{v.name}</p>
                                <span className="text-xs font-black text-blue-600">{v.completionRate}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${v.completionRate}%` }}></div>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 text-right">총 발주 {v.totalQty}개 중 {v.receivedQty}개 납품</p>
                        </div>
                    ))}
                    {vendorStats.length === 0 && <p className="text-xs text-slate-400 col-span-3 text-center py-2">외주 발주 데이터가 없습니다.</p>}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex space-x-6">
                        <button onClick={() => setActiveTab('PENDING')} className={`text-sm font-black pb-4 -mb-4 border-b-2 transition-colors ${activeTab === 'PENDING' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                            진행 중인 외주 건
                        </button>
                        <button onClick={() => setActiveTab('HISTORY')} className={`text-sm font-black pb-4 -mb-4 border-b-2 transition-colors ${activeTab === 'HISTORY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                            QA 및 납품 이력
                        </button>
                    </div>
                    
                    <div className="w-64">
                        <input
                            type="text"
                            placeholder="발주 번호, 업체명 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full text-sm font-bold bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder-slate-400 shadow-sm"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <MasterDataGrid 
                            data={filteredData}
                            columnDefs={COLUMN_DEFS}
                            onRowClick={(row) => {
                                const originalOS = orders.find(o => o.id === row.id);
                                setSelectedOS(originalOS);
                            }}
                        />
                    )}
                </div>
            </div>

            <CreateOutsourcingModal 
                isOpen={isCreateModalOpen || !!editingOS}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingOS(null);
                }}
                onSave={handleSaveOS}
                initialData={editingOS}
            />

            <OutsourcingDetailPanel
                os={selectedOS}
                isOpen={!!selectedOS}
                onClose={() => setSelectedOS(null)}
                onRefresh={fetchOrders}
                onEdit={(os) => {
                    setSelectedOS(null);
                    setEditingOS(os);
                }}
            />
        </div>
    );
}
