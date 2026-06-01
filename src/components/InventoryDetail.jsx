import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, ArrowRight, ArrowLeft, MapPin, Database, Tag, Barcode, ClipboardList, Info } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import BOMTree from './BOMTree';
import { getBOMStructure } from '../services/bomService';

export default function InventoryDetail({ part, onClose, inline = false }) {
    const [transactions, setTransactions] = useState([]);
    const [inventoryList, setInventoryList] = useState([]);
    const [bomTree, setBomTree] = useState(null);
    const [loadingTx, setLoadingTx] = useState(true);
    const [loadingInv, setLoadingInv] = useState(true);
    const [activeTab, setActiveTab] = useState('history'); // history, locations, bom

    useEffect(() => {
        if (!part) return;

        // 1. Fetch Transactions
        async function loadTx() {
            setLoadingTx(true);
            try {
                const q = query(
                    collection(db, 'transactions'),
                    where('PartID', '==', part.PartID),
                    limit(50)
                );
                const snap = await getDocs(q);
                const txs = [];
                snap.forEach(d => txs.push({ ...d.data(), id: d.id }));
                txs.sort((a, b) => new Date(b.Date) - new Date(a.Date));
                setTransactions(txs);
            } catch (e) {
                console.error("Tx load failed", e);
            } finally {
                setLoadingTx(false);
            }
        }

        // 2. Fetch Detailed Inventory (Multi-location & LOT)
        async function loadInventory() {
            setLoadingInv(true);
            try {
                const q = query(
                    collection(db, 'inventory'),
                    where('PartID', '==', part.PartID)
                );
                const snap = await getDocs(q);
                const items = [];
                snap.forEach(d => items.push({ ...d.data(), id: d.id }));
                setInventoryList(items);
            } catch (e) {
                console.error("Inventory load failed", e);
            } finally {
                setLoadingInv(false);
            }
        }

        // 3. Fetch BOM
        async function loadBom() {
            const tree = await getBOMStructure(part.PartID);
            setBomTree(tree);
        }

        loadTx();
        loadInventory();
        loadBom();
    }, [part]);

    if (!part) return null;

    // Group inventory by LOT for summary
    const lotSummary = inventoryList.reduce((acc, inv) => {
        const lot = inv.LotNo || 'No LOT';
        if (!acc[lot]) acc[lot] = 0;
        acc[lot] += Number(inv.OnHand || 0);
        return acc;
    }, {});

    const content = (
        <div className={`flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 ${inline ? 'h-full' : 'fixed inset-y-0 right-0 w-full md:w-[700px] xl:w-[800px] shadow-2xl z-[150] animate-in slide-in-from-right duration-300'}`}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start bg-white dark:bg-slate-900 shrink-0">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-800">{part.Category}</span>
                        <span className="text-[10px] font-mono font-bold text-slate-400">ID: {part.PartID}</span>
                    </div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight tracking-tight">{part.Name}</h2>
                </div>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all">
                    <X size={20} />
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 bg-white dark:bg-slate-900 shrink-0 border-b border-slate-100 dark:border-slate-800">
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50">
                    <div className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                        <Database size={10} /> 현재고
                    </div>
                    <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                        {inventoryList.reduce((sum, item) => sum + Number(item.OnHand || 0), 0).toLocaleString()}
                        <span className="text-[10px] ml-0.5 font-bold opacity-60 text-emerald-600">EA</span>
                    </div>
                </div>
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50">
                    <div className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                        <MapPin size={10} /> 위치 수
                    </div>
                    <div className="text-lg font-black text-blue-700 dark:text-blue-300">
                        {new Set(inventoryList.map(i => i.Location)).size}
                        <span className="text-[10px] ml-0.5 font-bold opacity-60 text-blue-600">Loc</span>
                    </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                        <Tag size={10} /> LOT 수
                    </div>
                    <div className="text-lg font-black text-slate-700 dark:text-slate-200">
                        {Object.keys(lotSummary).filter(l => l !== 'No LOT').length}
                    </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                        <Barcode size={10} /> 단가
                    </div>
                    <div className="text-lg font-black text-slate-700 dark:text-slate-200">
                        ${Number(part.UnitPrice || 0).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 bg-white dark:bg-slate-900 shrink-0">
                {[
                    { id: 'history', label: '입출고 내역', icon: <ClipboardList size={14} /> },
                    { id: 'locations', label: '위치 및 LOT', icon: <MapPin size={14} /> },
                    { id: 'bom', label: 'BOM 구조', icon: <Database size={14} /> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-4 py-3 text-xs font-black transition-all border-b-2 ${
                            activeTab === tab.id 
                            ? 'border-blue-600 text-blue-600' 
                            : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/50">
                {activeTab === 'history' && (
                    <div className="space-y-3">
                        {loadingTx ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-xs font-bold text-slate-400">내역 로드 중...</span>
                            </div>
                        ) : transactions.length > 0 ? (
                            transactions.map(tx => (
                                <div key={tx.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow group">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${tx.Type === 'In' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20'}`}>
                                            {tx.Type === 'In' ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-[10px] font-black uppercase tracking-wider ${tx.Type === 'In' ? 'text-blue-600' : 'text-orange-600'}`}>
                                                    {tx.Type === 'In' ? '입고 (In)' : '출고 (Out)'}
                                                </span>
                                                <span className="text-[10px] text-slate-300 dark:text-slate-700">|</span>
                                                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                                    <Calendar size={10} /> {tx.Date}
                                                </span>
                                                {tx.LotNo && (
                                                    <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-black rounded flex items-center gap-1">
                                                        <Tag size={8} /> {tx.LotNo}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{tx.Ref || 'No Reference Info'}</div>
                                        </div>
                                    </div>
                                    <div className={`text-lg font-black ${tx.Type === 'In' ? 'text-blue-600' : 'text-orange-600'}`}>
                                        {tx.Type === 'In' ? '+' : '-'}{Number(tx.Quantity).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                                <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 mb-3">
                                    <Info size={24} />
                                </div>
                                <p className="text-xs text-slate-400 font-bold">입출고 이력 정보가 없습니다.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'locations' && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                        {/* Location Details Table */}
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">위치별 재고 상세</h3>
                            </div>
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">저장 위치</th>
                                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">LOT 번호</th>
                                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">시리얼 번호</th>
                                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">현재고</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {loadingInv ? (
                                            <tr>
                                                <td colSpan="4" className="px-4 py-10 text-center text-slate-400 text-xs font-bold">데이터를 불러오는 중...</td>
                                            </tr>
                                        ) : inventoryList.length > 0 ? (
                                            inventoryList.map((inv) => (
                                                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200">
                                                            <MapPin size={12} className="text-blue-500" />
                                                            {inv.Location}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">{inv.LotNo || '-'}</td>
                                                    <td className="px-4 py-3 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">{inv.SerialNo || '-'}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-sm font-black text-slate-900 dark:text-white">{Number(inv.OnHand || 0).toLocaleString()}</span>
                                                        <span className="text-[9px] ml-1 font-bold text-slate-400 uppercase">ea</span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="px-4 py-12 text-center">
                                                    <div className="flex flex-col items-center gap-2 opacity-40 text-slate-500">
                                                        <Database size={24} />
                                                        <p className="text-[10px] font-bold">등록된 위치 정보가 없습니다.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* LOT Summary Grouping */}
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">LOT별 재고 요약</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {Object.entries(lotSummary).map(([lot, qty]) => (
                                    <div key={lot} className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-colors">
                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">LOT: {lot}</div>
                                        <div className="text-lg font-black text-slate-800 dark:text-slate-200">
                                            {qty.toLocaleString()}
                                            <span className="text-[9px] ml-1 font-bold text-slate-400 uppercase">ea</span>
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(lotSummary).length === 0 && (
                                    <div className="col-span-full py-6 text-center text-slate-400 text-xs font-bold italic bg-slate-100/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200">
                                        요약할 LOT 정보가 없습니다.
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'bom' && (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-inner min-h-[400px]">
                        {bomTree ? (
                            <BOMTree data={bomTree} />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-40">
                                <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
                                <p className="text-xs font-bold text-slate-500">BOM 구조 분석 중...</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    if (inline) {
        return content;
    }

    return createPortal(
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[140]" onClick={onClose} />
            {content}
        </div>,
        document.body
    );
}
