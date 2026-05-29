import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck, Activity, Search, AlertCircle, FileText, PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import MasterDataGrid from '../components/common/MasterDataGrid';
import QAInspectionModal from '../components/QAInspectionModal';
import QAReportModal from '../components/QAReportModal';
import QAItemReportModal from '../components/QAItemReportModal';

const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#8b5cf6'];

const COLUMN_DEFS = {
    PONumber: { label: '발주 번호', width: '120px' },
    PartName: { label: '품목명', width: '250px' },
    VendorName: { label: '공급사', width: '150px' },
    Qty: { label: '입고 수량', width: '100px' },
    Status: { label: '상태', width: '120px' },
    ReceivedAt: { label: '입고일시', width: '150px' },
    report: { label: '성적서', width: '100px' }
};

export default function ReceivingInspectionPage() {
    const [receivingList, setReceivingList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('PENDING'); // PENDING | HISTORY
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    const [qaTargetIds, setQaTargetIds] = useState([]);

    const fetchReceivingData = async () => {
        setLoading(true);
        try {
            // Fetch QA targets
            const qaSnap = await getDocs(collection(db, 'qa_target_parts'));
            const qaIds = [];
            qaSnap.forEach(doc => qaIds.push(doc.id));
            setQaTargetIds(qaIds);

            const q = query(collection(db, 'receiving'), orderBy('ReceivedAt', 'desc'));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            setReceivingList(list);
        } catch (error) {
            console.error("Error fetching receiving data: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReceivingData();
    }, []);

    // Filter logic
    const displayList = useMemo(() => {
        let filtered = receivingList;
        
        if (activeTab === 'PENDING') {
            // 대기 품목 중 qaTargetIds가 정의되어 있으면 필터링을 하되, qaTargetIds가 비어 있다면 전체 검사 대기를 노출
            filtered = filtered.filter(item => {
                if (item.Status !== 'WAITING_INSPECTION') return false;
                if (qaTargetIds.length === 0) return true; // 설정에 아무것도 없으면 기본적으로 모두 노출하여 누락 방지
                return qaTargetIds.includes(item.PartID) || qaTargetIds.includes(item.id);
            });
        } else {
            filtered = filtered.filter(item => item.Status !== 'WAITING_INSPECTION');
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(item => 
                (item.PONumber && item.PONumber.toLowerCase().includes(lower)) ||
                (item.PartName && item.PartName.toLowerCase().includes(lower)) ||
                (item.VendorName && item.VendorName.toLowerCase().includes(lower))
            );
        }

        return filtered;
    }, [receivingList, activeTab, searchTerm, qaTargetIds]);

    // Dashboard Calculations (From History)
    const stats = useMemo(() => {
        const history = receivingList.filter(i => i.Status !== 'WAITING_INSPECTION');
        const pendingCount = receivingList.filter(i => i.Status === 'WAITING_INSPECTION').length;
        const completeCount = history.length;
        
        let totalInspected = 0;
        let totalPassed = 0;
        let defectCounts = {};
        let vendorDefects = {};

        history.forEach(h => {
            const p = h.PassedQty || 0;
            const f = h.FailedQty || 0;
            totalInspected += (p + f);
            totalPassed += p;

            if (f > 0 && h.Defects) {
                h.Defects.forEach(d => {
                    defectCounts[d.type] = (defectCounts[d.type] || 0) + (d.qty || 1);
                });
                vendorDefects[h.VendorName] = (vendorDefects[h.VendorName] || 0) + f;
            }
        });

        const passRate = totalInspected > 0 ? (totalPassed / totalInspected) * 100 : 0;
        const defectRate = totalInspected > 0 ? ((totalInspected - totalPassed) / totalInspected) * 100 : 0;
        const totalItems = pendingCount + completeCount;
        const inspectionRate = totalItems > 0 ? (completeCount / totalItems) * 100 : 0;

        const passRateColor = passRate >= 95 ? 'text-emerald-500' : (passRate >= 80 ? 'text-blue-500' : 'text-rose-500');

        const topDefects = Object.entries(defectCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);

        const topVendors = Object.entries(vendorDefects)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);

        return {
            pendingCount,
            completeCount,
            totalInspected,
            passRate,
            defectRate,
            inspectionRate,
            passRateColor,
            topDefects,
            topVendors
        };
    }, [receivingList]);

    const [selectedReportItem, setSelectedReportItem] = useState(null);

    return (
        <div className="flex flex-col h-[calc(100vh-100px)]">
            <QAInspectionModal 
                item={selectedItem} 
                isOpen={!!selectedItem && activeTab === 'PENDING'} 
                onClose={() => setSelectedItem(null)}
                onRefresh={fetchReceivingData}
            />

            <QAItemReportModal
                item={selectedReportItem}
                isOpen={!!selectedReportItem}
                onClose={() => setSelectedReportItem(null)}
            />

            <QAReportModal 
                isOpen={isReportModalOpen} 
                onClose={() => setIsReportModalOpen(false)} 
                data={receivingList.filter(i => i.Status !== 'WAITING_INSPECTION')} 
            />

            {/* Header */}
            <div className="mb-4">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <ShieldCheck size={28} className="text-teal-500" /> QA 검사 관리 (Receiving Inspection)
                </h1>
                <p className="text-sm text-slate-500 font-bold mt-1 ml-9">
                    입고된 자재 및 완제품의 품질 검수를 수행하고 부적합 내역을 관리합니다.
                </p>
            </div>

            {/* Top Dashboard (4 sections) */}
            <div className="grid grid-cols-4 gap-4 mb-4 shrink-0">
                
                {/* 1. Monthly Status & Inspection Rate */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-black text-slate-400 mb-1 uppercase tracking-wider">월간 검사 진척률</p>
                        <div className="flex items-end gap-1 mt-2">
                            <span className="text-3xl font-black text-slate-800">{stats.inspectionRate.toFixed(1)}</span>
                            <span className="text-lg font-bold text-slate-400 mb-0.5">%</span>
                        </div>
                        <p className="text-xs font-bold text-slate-500 mt-2">대기: <span className="text-rose-500 font-black">{stats.pendingCount}건</span> / 완료: <span className="text-teal-600 font-black">{stats.completeCount}건</span></p>
                    </div>
                    {/* Simulated Gauge for Inspection Rate */}
                    <div className="relative w-16 h-16">
                        <svg viewBox="0 0 36 36" className="w-full h-full">
                            <path className="text-slate-100" strokeWidth="4" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path className="text-teal-500" strokeWidth="4" strokeDasharray={`${stats.inspectionRate}, 100`} stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        </svg>
                    </div>
                </div>

                {/* 2. Quality Yield (Pass / Defect) */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-black text-slate-400 mb-1 uppercase tracking-wider">합격률 / 불량률</p>
                        <div className="flex items-end gap-1 mt-2">
                            <span className={`text-3xl font-black ${stats.passRateColor}`}>{stats.passRate.toFixed(1)}</span>
                            <span className="text-lg font-bold text-slate-400 mb-0.5">%</span>
                        </div>
                        <p className="text-xs font-bold text-slate-500 mt-2">불량률: <span className="text-rose-500 font-black">{stats.defectRate.toFixed(1)}%</span></p>
                    </div>
                    {/* Simulated Gauge with SVG */}
                    <div className="relative w-16 h-16">
                        <svg viewBox="0 0 36 36" className="w-full h-full">
                            <path className="text-rose-100" strokeWidth="4" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path className={stats.passRateColor} strokeWidth="4" strokeDasharray={`${stats.passRate}, 100`} stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        </svg>
                    </div>
                </div>

                {/* 3. Defect Types (Donut) */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-20 h-20 shrink-0">
                        {stats.topDefects.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={stats.topDefects} innerRadius={25} outerRadius={35} paddingAngle={2} dataKey="value" stroke="none">
                                        {stats.topDefects.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', padding: '4px 8px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                <PieChartIcon size={20} className="text-slate-300" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-black text-slate-400 mb-1.5 uppercase tracking-wider">주요 불량 사유</p>
                        {stats.topDefects.length > 0 ? (
                            <div className="space-y-1">
                                {stats.topDefects.slice(0, 2).map((d, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-600 truncate">{d.name}</span>
                                        <span className="font-black text-slate-800">{d.value}건</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 font-bold">데이터 없음</p>
                        )}
                    </div>
                </div>

                {/* 4. Vendor Defects (Donut) */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-20 h-20 shrink-0">
                        {stats.topVendors.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={stats.topVendors} innerRadius={25} outerRadius={35} paddingAngle={2} dataKey="value" stroke="none">
                                        {stats.topVendors.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', padding: '4px 8px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                                <PieChartIcon size={20} className="text-slate-300" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-black text-slate-400 mb-1.5 uppercase tracking-wider">공급사 불량 (수량)</p>
                        {stats.topVendors.length > 0 ? (
                            <div className="space-y-1">
                                {stats.topVendors.slice(0, 2).map((v, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-600 truncate w-20">{v.name}</span>
                                        <span className="font-black text-rose-500">{v.value}개</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 font-bold">데이터 없음</p>
                        )}
                    </div>
                </div>

            </div>

            {/* Tabs & Search */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex bg-slate-200/50 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('PENDING')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'PENDING' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        검수 대기 (Pending)
                        {stats.pendingCount > 0 && <span className="ml-2 bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px]">{stats.pendingCount}</span>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('HISTORY')}
                        className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'HISTORY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                        검수 히스토리 (History)
                    </button>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="PO, 품목명, 공급사 검색..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 w-64"
                        />
                    </div>
                    {activeTab === 'HISTORY' && (
                        <button onClick={() => setIsReportModalOpen(true)} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 shadow-sm flex items-center gap-2">
                            <FileText size={16} /> QA 리포트 생성
                        </button>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden relative z-20">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-slate-400 font-bold">데이터를 로드하는 중...</div>
                ) : (
                    <MasterDataGrid
                        data={displayList}
                        columnDefs={COLUMN_DEFS}
                        rowKey="id"
                        onRowClick={(row) => {
                            if (activeTab === 'PENDING') {
                                setSelectedItem(row);
                            }
                        }}
                        cellRenderer={{
                            Status: (val) => {
                                if (val === 'WAITING_INSPECTION') return <span className="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg text-xs font-black tracking-wide">대기중</span>;
                                if (val === 'INSPECTION_COMPLETE') return <span className="px-2.5 py-1 bg-teal-50 text-teal-600 border border-teal-200 rounded-lg text-xs font-black tracking-wide">완료 (적재대기)</span>;
                                if (val === 'PLACEMENT_COMPLETE') return <span className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-black tracking-wide">적재 완료</span>;
                                return <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold">{val}</span>;
                            },
                            ReceivedAt: (val) => val?.toDate ? val.toDate().toLocaleString() : '-',
                            Qty: (val) => <span className="font-black text-slate-800">{val}</span>,
                            VendorName: (val) => <span className="font-bold text-slate-600">{val}</span>,
                            report: (val, row) => {
                                if (row.Status === 'WAITING_INSPECTION') return <span className="text-slate-400 text-xs font-bold">-</span>;
                                return (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedReportItem(row);
                                        }}
                                        className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-black transition-all"
                                    >
                                        출력/저장
                                    </button>
                                );
                            }
                        }}
                    />
                )}
            </div>
            {activeTab === 'PENDING' && !loading && (
                <div className="mt-2 text-right">
                    <p className="text-xs text-slate-500 font-bold">목록을 클릭하여 품질 검사를 수행하세요.</p>
                </div>
            )}
        </div>
    );
}
