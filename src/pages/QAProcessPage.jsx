import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, where, onSnapshot, doc, writeBatch, serverTimestamp } from '../firebase';
import { 
    ShieldCheck, Activity, Search, AlertCircle, FileText, 
    CheckCircle2, TrendingUp, BarChart2, PieChart as PieChartIcon, 
    ArrowRight, Clock, Filter, Sliders, LayoutGrid
} from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Cell, Pie
} from 'recharts';
import QAProcessModal from '../components/QAProcessModal';
import QAItemReportModal from '../components/QAItemReportModal';

const TABS = [
    { key: 'receiving', label: '수입 검사 (In)', icon: ShieldCheck },
    { key: 'shipping', label: '출하 검사 (Out)', icon: Activity },
    { key: 'middle', label: '중간 검사 (Process)', icon: Sliders }
];

export default function QAProcessPage() {
    const [activeTab, setActiveTab] = useState('shipping');
    const [loading, setLoading] = useState(false);
    
    // Modal states
    const [selectedItem, setSelectedItem] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportItem, setReportItem] = useState(null);

    // Data states
    const [inspections, setInspections] = useState([]);
    const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, rate: 0 });

    useEffect(() => {
        const unsubscribe = fetchData();
        return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
    }, [activeTab]);

    const fetchData = () => {
        setLoading(true);
        try {
            // [자동 복구 로직] 수입검사(receiving)에 잘못 들어간 생산 데이터 이관
            (async () => {
                const recSnap = await getDocs(query(collection(db, 'receiving'), where('SourceType', '==', 'PRODUCTION')));
                if (!recSnap.empty) {
                    const batch = writeBatch(db);
                    for (const d of recSnap.docs) {
                        const data = d.data();
                        const newRef = doc(collection(db, 'qa_shipping_inspections'));
                        batch.set(newRef, {
                            PR_ID: data.PR_ID || '',
                            PRNumber: data.PRNumber || '',
                            PartID: data.PartID || '',
                            PartName: data.PartName || '',
                            CustomerName: data.CustomerName || '미지정 고객',
                            Qty: data.Qty || 0,
                            Status: 'WAITING_INSPECTION',
                            createdAt: data.ReceivedAt || serverTimestamp(),
                            ScheduleIdx: data.ScheduleIdx !== undefined ? data.ScheduleIdx : null,
                            migrated: true
                        });
                        batch.delete(d.ref);
                    }
                    await batch.commit();
                }
            })();

            let collectionName = '';
            if (activeTab === 'receiving') collectionName = 'receiving';
            else if (activeTab === 'shipping') collectionName = 'qa_shipping_inspections';
            else collectionName = 'qa_middle_inspections';

            const q = query(collection(db, collectionName), orderBy('createdAt', 'desc'));
            const unsubscribe = onSnapshot(q, async (snap) => {
                const list = [];
                let pCount = 0;
                let fCount = 0;
                
                const [prSnap, partsSnap] = await Promise.all([
                    getDocs(collection(db, 'production_requests')),
                    getDocs(collection(db, 'parts'))
                ]);
                const prMap = {};
                prSnap.docs.forEach(d => {
                    const pr = d.data();
                    if (pr.PRNumber) prMap[pr.PRNumber] = pr;
                });
                const partsMap = {};
                partsSnap.docs.forEach(d => {
                    const p = d.data();
                    if (p.PartID) partsMap[p.PartID] = p;
                });

                for (const d of snap.docs) {
                    const data = { id: d.id, ...d.data() };
                    
                    if (activeTab === 'shipping' && data.PRNumber) {
                        const matchingPR = prMap[data.PRNumber];
                        if (matchingPR) {
                            if (!data.CustomerName) data.CustomerName = matchingPR.CustomerName || '확인 필요';
                            if (!data.PartID) data.PartID = matchingPR.PartID || '';
                            if (!data.Qty) data.Qty = data.PassedQty || data.DefectQty || matchingPR.TargetQty || 0;
                            
                            if (matchingPR.PartID && !data.PartName) {
                                const partInfo = partsMap[matchingPR.PartID];
                                data.PartName = partInfo ? partInfo.Name : '';
                            }
                        }
                    }

                    list.push(data);
                    
                    if (data.Status === 'INSPECTION_COMPLETE' || data.Status === 'QA_COMPLETE' || data.result === 'Pass' || data.result === 'Fail') {
                        const passed = data.PassedQty || (data.result === 'Pass' ? (data.Qty || 0) : 0) || 0;
                        const failed = data.FailedQty || (data.result === 'Fail' ? (data.Qty || 0) : 0) || 0;
                        pCount += passed;
                        fCount += failed;
                    }
                }
                
                setInspections(list);
                const total = pCount + fCount;
                setStats({
                    total,
                    passed: pCount,
                    failed: fCount,
                    rate: total > 0 ? (fCount / total) * 100 : 0
                });
                setLoading(false);
            });

            return unsubscribe;
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const handleRowClick = (item) => {
        setSelectedItem(item);
        setIsModalOpen(true);
    };

    const handleOpenReport = (e, item) => {
        e.stopPropagation();
        setReportItem(item);
        setIsReportOpen(true);
    };

    // Chart Data Generation
    const chartData = useMemo(() => {
        return [
            { name: '1월', qty: 400, fail: 12 },
            { name: '2월', qty: 300, fail: 5 },
            { name: '3월', qty: 200, fail: 18 },
            { name: '4월', qty: 278, fail: 4 },
            { name: '5월', qty: 189, fail: 2 },
            { name: '6월', qty: stats.total || 0, fail: stats.failed || 0 },
        ];
    }, [stats]);

    const pieData = [
        { name: '합격 (Pass)', value: stats.passed || 1 },
        { name: '불량 (Fail)', value: stats.failed || 0 },
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
                        <div className="p-2.5 bg-teal-600 rounded-2xl shadow-xl shadow-teal-100">
                            <Activity size={28} className="text-white" />
                        </div>
                        품질 공정 및 모니터링
                    </h1>
                    <p className="text-sm text-slate-500 font-bold mt-2 ml-1">
                        생산 및 발주 공정에서 이관된 품목의 수입, 중간, 출하 검사 내역을 종합 관리합니다.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                    {TABS.map(tab => (
                        <button 
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === tab.key ? 'bg-white text-teal-600 shadow-md border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dashboard Stats Section */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4 shrink-0">
                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-20 h-24 bg-teal-50 rounded-full blur-2xl opacity-60"></div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">월간 검사 총량</p>
                        <h3 className="text-xl font-black text-slate-800">{stats.total.toLocaleString()} <span className="text-[10px] text-slate-400">EA</span></h3>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-teal-500 h-full" style={{ width: '70%' }}></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-20 h-24 bg-rose-50 rounded-full blur-2xl opacity-60"></div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">불량률 (PPM)</p>
                        <h3 className="text-xl font-black text-rose-600">{stats.rate.toFixed(2)}%</h3>
                    </div>
                </div>

                {/* Charts Area */}
                <div className="lg:col-span-2 bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="flex-1 h-24">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" hide />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="qty" fill="#0d9488" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="fail" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="w-24 h-24 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} innerRadius={25} outerRadius={35} paddingAngle={5} dataKey="value">
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? '#0d9488' : '#f43f5e'} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Main Data Grid */}
            <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-8 relative flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                            <LayoutGrid size={20} />
                        </div>
                        <h2 className="text-lg font-black text-slate-800 tracking-tight">검사 대기 및 완료 목록</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="생산 ID, 품목명 검색..." 
                                className="bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs font-bold focus:ring-2 focus:ring-teal-500 outline-none transition-all w-64"
                            />
                        </div>
                        <button className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl border border-slate-200 transition-all">
                            <Filter size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    <MasterDataGrid
                        data={inspections}
                        columnDefs={
                            activeTab === 'receiving' ? {
                                PONumber: { label: '문서번호', width: '150px' },
                                ReceivedAt: { label: '요청일', width: '120px' },
                                PartID: { label: '품목 ID', width: '130px' },
                                PartName: { label: '품명', width: '200px' },
                                VendorName: { label: '거래처', width: '150px' },
                                Qty: { label: '수량', width: '100px' },
                                Status: { label: '상태', width: '150px' }
                            } : {
                                PRNumber: { label: '문서번호', width: '150px' },
                                CustomerName: { label: '거래처', width: '150px' },
                                createdAt: { label: '요청일', width: '120px' },
                                PartID: { label: '품목 ID', width: '130px' },
                                PartName: { label: '품명', width: '200px' },
                                Qty: { label: '수량', width: '100px' },
                                result: { label: '상태/결과', width: '150px' }
                            }
                        }
                        rowKey="id"
                        onRowClick={handleRowClick}
                        cellRenderer={{
                            ReceivedAt: (val) => val?.toDate ? val.toDate().toLocaleDateString() : val || '-',
                            createdAt: (val) => val?.seconds ? new Date(val.seconds * 1000).toLocaleDateString() : val || '-',
                            Status: (val, row) => (
                                <div className="flex items-center justify-between gap-2 w-full">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${val === 'WAITING_INSPECTION' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                        {val === 'WAITING_INSPECTION' ? '검사 대기' : '검사 완료'}
                                    </span>
                                    {(val === 'QA_COMPLETE' || val === 'INSPECTION_COMPLETE') && (
                                        <button 
                                            onClick={(e) => handleOpenReport(e, row)}
                                            className="p-1.5 bg-slate-100 text-slate-500 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-all"
                                            title="성적서 출력"
                                        >
                                            <FileText size={14} />
                                        </button>
                                    )}
                                </div>
                            ),
                            result: (val, row) => (
                                <div className="flex items-center justify-between gap-2 w-full">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${val === 'Pass' ? 'bg-emerald-50 text-emerald-600' : val === 'Fail' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {val || '대기 중'}
                                    </span>
                                    {(row.Status === 'QA_COMPLETE' || row.Status === 'INSPECTION_COMPLETE') && (
                                        <button 
                                            onClick={(e) => handleOpenReport(e, row)}
                                            className="p-1.5 bg-slate-100 text-slate-500 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-all"
                                            title="성적서 출력"
                                        >
                                            <FileText size={14} />
                                        </button>
                                    )}
                                </div>
                            )
                        }}
                    />
                </div>
            </div>

            {/* Quality Inspection Modal */}
            {isModalOpen && selectedItem && (
                <QAProcessModal
                    item={selectedItem}
                    type={activeTab}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={() => fetchData()}
                />
            )}

            {/* Individual Inspection Report Modal */}
            {isReportOpen && reportItem && (
                <QAItemReportModal
                    item={reportItem}
                    type={activeTab}
                    isOpen={isReportOpen}
                    onClose={() => setIsReportOpen(false)}
                />
            )}
        </div>
    );
}
