import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Search, Package, AlertTriangle, TrendingDown, DollarSign, ClipboardCheck, Plus, X, RefreshCw } from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import InventoryDetail from '../components/InventoryDetail';

const COLUMN_DEFS = {
    PartID: { label: 'Part ID', default: true },
    Name: { label: '부품명', default: true },
    Category: { label: '카테고리', default: true },
    OnHand: { label: '현재고', default: true },
    SafetyStock: { label: '안전재고', default: true },
    Location: { label: '위치', default: true },
    UnitPrice: { label: '단가', default: true }
};

export default function InventoryPage() {
    const [inventoryData, setInventoryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'
    const [filterMode, setFilterMode] = useState('all'); // 'all' | 'shortage'
    const [selectedPart, setSelectedPart] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'PartID', direction: 'asc' });
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Parts (Master Data)
            const partsSnap = await getDocs(collection(db, 'parts'));
            const partsList = [];
            partsSnap.forEach(doc => {
                const data = doc.data();
                // Filter out discontinued parts
                const isDiscontinued = data.IsDiscontinued === true || data.Status === 'Discontinued' || data.Lifecycle === 'Obsolete';
                if (!isDiscontinued) {
                    partsList.push({ ...data, id: doc.id });
                }
            });

            // 2. Fetch Inventory (Real-time Stock)
            const invSnap = await getDocs(collection(db, 'inventory'));
            const invMap = {};
            invSnap.forEach(doc => {
                const data = doc.data();
                invMap[data.PartID] = data;
            });

            // 3. Merge Data
            const merged = partsList.map(part => {
                const invInfo = invMap[part.PartID] || {};
                return {
                    ...part,
                    OnHand: Number(invInfo.OnHand || 0),
                    Location: invInfo.Location || part.DefaultLocation || '-',
                    SafetyStock: Number(part.SafetyStock || 0),
                    UnitPrice: Number(part.UnitPrice || 0)
                };
            });

            setInventoryData(merged);
        } catch (error) {
            console.error("Error fetching inventory data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Stats
    const stats = useMemo(() => {
        const shortage = inventoryData.filter(i => i.OnHand < i.SafetyStock).length;
        const totalValue = inventoryData.reduce((acc, i) => acc + (i.OnHand * i.UnitPrice), 0);
        const totalItems = inventoryData.length;
        return { shortage, totalValue, totalItems };
    }, [inventoryData]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredData = inventoryData.filter(item => {
        const matchesFilter = filterMode === 'all' || (filterMode === 'shortage' && item.OnHand < item.SafetyStock);
        return matchesFilter;
    }).sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return sortConfig.direction === 'asc' 
            ? String(aVal).localeCompare(String(bVal)) 
            : String(bVal).localeCompare(String(aVal));
    });

    const cellRenderer = {
        OnHand: (val, row) => {
            const isLowStock = Number(val) < Number(row.SafetyStock);
            return (
                <div className={`flex items-center gap-2 ${isLowStock ? 'text-red-600 font-black' : 'font-bold'}`}>
                    {Number(val).toLocaleString()}
                    {isLowStock && <AlertTriangle size={14} className="animate-pulse" />}
                </div>
            );
        },
        Location: (val) => (
            <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                <Package size={12} className="text-emerald-500" />
                {val}
            </span>
        ),
        UnitPrice: (val) => {
            const price = Number(val || 0);
            return (
                <div className="text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                    ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            );
        },
        SafetyStock: (val) => <span className="text-slate-500 font-bold">{Number(val).toLocaleString()}</span>,
        Category: (val) => <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-wider">{val?.split(' ')[0]}</span>
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] gap-1.5 animate-fade-in">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-3 rounded-xl border border-emerald-100/35 dark:border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="absolute right-0 top-0 w-48 h-48 bg-emerald-500/5 blur-3xl rounded-full -mr-10 -mt-5 pointer-events-none"></div>
                <div>
                    <h1 className="text-xl font-black tracking-tight leading-tight bg-gradient-to-r from-slate-900 to-emerald-950 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
                        재고 현황 (Inventory)
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-xs font-bold uppercase tracking-wider">
                        Real-time Stock & Warehouse Location Monitor
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    {/* Adjustment Button */}
                    <button 
                        onClick={() => setIsAdjustModalOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-2xl font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-slate-200 dark:shadow-none whitespace-nowrap"
                    >
                        <Plus size={18} />
                        재고 보정 (Adjustment)
                    </button>
                </div>
            </div>

            {/* Stats Widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div 
                    onClick={() => setFilterMode(prev => prev === 'shortage' ? 'all' : 'shortage')}
                    className={`bg-white dark:bg-slate-900 p-3 rounded-[2rem] shadow-sm border-2 transition-all cursor-pointer group hover:shadow-lg hover:-translate-y-1 ${filterMode === 'shortage' ? 'border-red-500 ring-4 ring-red-500/10' : 'border-slate-100 dark:border-slate-800'}`}
                >
                    <div className="flex items-center gap-5">
                        <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform">
                            <AlertTriangle size={28} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">위험 재고 (Shortage)</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white flex items-baseline gap-1">
                                {stats.shortage.toLocaleString()}
                                <span className="text-sm font-bold text-slate-400">품목</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-[2rem] shadow-sm border-2 border-slate-100 dark:border-slate-800 flex items-center gap-5 transition-all cursor-default group hover:shadow-md">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                        <DollarSign size={28} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">총 재고 자산</p>
                        <p className="text-lg font-black text-slate-900 dark:text-white">
                            ${stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    </div>
                </div>

                <div 
                    onClick={() => setFilterMode('all')}
                    className={`bg-white dark:bg-slate-900 p-3 rounded-[2rem] shadow-sm border-2 transition-all cursor-pointer group hover:shadow-lg hover:-translate-y-1 ${filterMode === 'all' ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-100 dark:border-slate-800'}`}
                >
                    <div className="flex items-center gap-5">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                            <ClipboardCheck size={28} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">실사 대상 (Summary)</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white flex items-baseline gap-1">
                                {stats.totalItems.toLocaleString()}
                                <span className="text-sm font-bold text-slate-400">전체 품목</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/80 rounded-[1.8rem] shadow-sm flex flex-col flex-1 min-h-0 relative overflow-hidden">
                <div className="flex-1 overflow-hidden flex flex-col p-4">
                    {filterMode !== 'all' && (
                        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-2.5">
                                <AlertTriangle size={16} className="text-red-600" />
                                <span className="text-sm font-bold text-red-900 dark:text-red-400">
                                    현재 위험 재고(Shortage) 품목만 표시 중입니다.
                                </span>
                            </div>
                            <button 
                                onClick={() => setFilterMode('all')}
                                className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-red-200 dark:shadow-none"
                            >
                                <X size={14} />
                                필터 해제
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-slate-450 font-black text-sm uppercase tracking-widest">Loading Inventory...</span>
                            </div>
                        </div>
                    ) : (
                        <MasterDataGrid
                            data={filteredData}
                            columnDefs={COLUMN_DEFS}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            onRowClick={(row) => setSelectedPart(row)}
                            rowKey="PartID"
                            cellRenderer={cellRenderer}
                            sortableColumns={['PartID', 'Name', 'OnHand', 'SafetyStock', 'UnitPrice']}
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="부품명 또는 Part ID 검색..."
                            enableFilter={true}
                            enableViewModeToggle={true}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            cardRenderer={(part) => (
                                <div
                                    key={part.PartID}
                                    onClick={() => setSelectedPart(part)}
                                    className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm rounded-[1.8rem] p-3 border border-slate-200/50 dark:border-slate-800/80 shadow-md hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[220px]"
                                >
                                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-teal-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase tracking-wider">{part.Category?.split(' ')[0] || '-'}</span>
                                        <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-500 text-[10px]">
                                            <Package size={12} />
                                            {part.Location}
                                        </div>
                                    </div>

                                    <div className="space-y-2 flex-grow">
                                        <div className="text-[10px] font-mono font-bold text-slate-400">{part.PartID}</div>
                                        <div>
                                            <div className="text-[9px] font-black text-slate-450 uppercase tracking-wider">부품명</div>
                                            <h3 className="font-extrabold text-slate-850 dark:text-slate-200 text-sm leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors mt-0.5">{part.Name}</h3>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">현재고</span>
                                            <div className={`flex items-center gap-1.5 mt-0.5 font-black ${Number(part.OnHand) < Number(part.SafetyStock) ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'}`}>
                                                <span className="text-lg">{Number(part.OnHand).toLocaleString()}</span>
                                                {Number(part.OnHand) < Number(part.SafetyStock) && <AlertTriangle size={14} className="animate-pulse" />}
                                            </div>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">단가</span>
                                            <span className="font-bold text-slate-600 dark:text-slate-300 mt-1">
                                                ${Number(part.UnitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        />
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedPart && (
                <InventoryDetail
                    part={selectedPart}
                    onClose={() => setSelectedPart(null)}
                />
            )}

            {/* Adjustment Modal (Simple) */}
            {isAdjustModalOpen && (
                <AdjustmentModal 
                    onClose={() => setIsAdjustModalOpen(false)} 
                    inventoryData={inventoryData}
                    onSuccess={fetchData}
                />
            )}
        </div>
    );
}

function AdjustmentModal({ onClose, inventoryData, onSuccess }) {
    const [selectedPartID, setSelectedPartID] = useState('');
    const [adjustmentType, setAdjustmentType] = useState('Set'); // Set, In, Out
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedPartID || !quantity) return;

        setIsSubmitting(true);
        try {
            const currentItem = inventoryData.find(i => i.PartID === selectedPartID);
            const qtyNum = Number(quantity);
            let newTotal = 0;

            if (adjustmentType === 'Set') newTotal = qtyNum;
            else if (adjustmentType === 'In') newTotal = (currentItem?.OnHand || 0) + qtyNum;
            else if (adjustmentType === 'Out') newTotal = (currentItem?.OnHand || 0) - qtyNum;

            // 1. Update Inventory
            // In a real app, use a service or cloud function to ensure atomicity
            const invRef = doc(db, 'inventory', selectedPartID);
            await updateDoc(invRef, {
                OnHand: newTotal,
                LastUpdated: serverTimestamp()
            });

            // 2. Add Transaction Record
            await addDoc(collection(db, 'transactions'), {
                PartID: selectedPartID,
                Type: adjustmentType === 'In' ? 'In' : adjustmentType === 'Out' ? 'Out' : 'Adj',
                Quantity: qtyNum,
                Date: new Date().toISOString().split('T')[0],
                Ref: `Manual Adjustment: ${reason || 'No reason provided'}`,
                Timestamp: serverTimestamp()
            });

            alert('재고 보정이 완료되었습니다.');
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Adjustment failed:", error);
            alert('보정 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="px-3 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-850/50">
                    <h2 className="text-xl font-black text-slate-800 dark:text-white">재고 수동 보정</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-3 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">부품 선택 (Part ID)</label>
                        <select 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-bold text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={selectedPartID}
                            onChange={(e) => setSelectedPartID(e.target.value)}
                            required
                        >
                            <option value="">부품을 선택하세요...</option>
                            {inventoryData.map(item => (
                                <option key={item.PartID} value={item.PartID}>{item.PartID} - {item.Name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {['Set', 'In', 'Out'].map(type => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setAdjustmentType(type)}
                                className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${adjustmentType === type ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                                {type === 'Set' ? '변경' : type === 'In' ? '입고' : '출고'}
                            </button>
                        ))}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">수량 (Quantity)</label>
                        <input 
                            type="number"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono font-bold text-lg focus:ring-2 focus:ring-emerald-500 outline-none text-center"
                            placeholder="0"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">보정 사유 (Reason)</label>
                        <textarea 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-medium text-sm focus:ring-2 focus:ring-emerald-500 outline-none h-14 resize-none"
                            placeholder="예: 실사 결과 차이 보정, 파손 처리 등"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        {isSubmitting ? '처리 중...' : '보정 내용 적용하기'}
                    </button>
                </form>
            </div>
        </div>
    );
}
