import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, ArrowRight, ArrowLeft, MapPin, Database, Tag, Barcode, ClipboardList, Info } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from '../firebase';
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
        <div className={`flex flex-col bg-slate-50 border-l border-slate-200 ${inline ? 'h-full' : 'fixed inset-y-0 right-0 w-full md:w-[600px] xl:w-[750px] shadow-2xl z-[150] animate-in slide-in-from-right duration-300'}`}>
            {/* Header */}
            <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider border border-indigo-100">{part.Category}</span>
                        <span className="text-[11px] font-mono font-bold text-slate-400"># {part.PartID}</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">{part.Name}</h2>
                </div>
                <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all shadow-sm">
                    <X size={20} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Stats Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-8 py-6 shrink-0">
                    <div className="p-4 rounded-3xl bg-emerald-50/50 border border-emerald-100 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <Database size={12} /> 현재 재고
                        </p>
                        <p className="text-2xl font-black text-emerald-700">
                            {inventoryList.reduce((sum, item) => sum + Number(item.OnHand || 0), 0).toLocaleString()}
                            <span className="text-xs ml-1 font-bold text-emerald-500/60 uppercase tracking-tighter font-mono">EA</span>
                        </p>
                    </div>
                    <div className="p-4 rounded-3xl bg-blue-50/50 border border-blue-100 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <MapPin size={12} /> 보관 위치
                        </p>
                        <p className="text-2xl font-black text-blue-700">
                            {new Set(inventoryList.map(i => i.Location)).size}
                            <span className="text-xs ml-1 font-bold text-blue-500/60 uppercase tracking-tighter font-mono">LOC</span>
                        </p>
                    </div>
                    <div className="p-4 rounded-3xl bg-amber-50/50 border border-amber-100 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <Tag size={12} /> 관리 LOT 수
                        </p>
                        <p className="text-2xl font-black text-amber-700">
                            {Object.keys(lotSummary).filter(l => l !== 'No LOT').length}
                            <span className="text-xs ml-1 font-bold text-amber-500/60 uppercase tracking-tighter font-mono">LOT</span>
                        </p>
                    </div>
                    <div className="p-4 rounded-3xl bg-slate-100/50 border border-slate-200 shadow-sm transition-transform hover:scale-[1.02]">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <Barcode size={12} /> 매입 단가
                        </p>
                        <p className="text-2xl font-black text-slate-700">
                            <span className="text-sm mr-0.5 text-slate-400">₩</span>{Number(part.UnitPrice || 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                {/* Tabs Wrapper */}
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-y border-slate-100 px-8">
                    <div className="flex gap-8">
                        {[
                            { id: 'history', label: '입출고 히스토리', icon: <ClipboardList size={15} /> },
                            { id: 'locations', label: '상세 위치 정보', icon: <MapPin size={15} /> },
                            { id: 'bom', label: 'BOM 계층 구조', icon: <Database size={15} /> }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 py-4 text-xs font-black transition-all border-b-2 relative ${
                                    activeTab === tab.id 
                                    ? 'border-indigo-600 text-indigo-700' 
                                    : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {activeTab === tab.id && <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-indigo-600 rounded-full"></span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Pane */}
                <div className="p-8">
                    {activeTab === 'history' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {loadingTx ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">데이터 로드 중...</span>
                                </div>
                            ) : transactions.length > 0 ? (
                                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50">
                                                <th className="pl-8 pr-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">구분 / 일자</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">사유 및 참조</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">변동 수량</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {transactions.map((tx) => (
                                                <tr key={tx.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="pl-8 pr-4 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tx.Type === 'In' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                                {tx.Type === 'In' ? <ArrowLeft size={14} strokeWidth={3} /> : <ArrowRight size={14} strokeWidth={3} />}
                                                            </div>
                                                            <div>
                                                                <p className={`text-[10px] font-black uppercase tracking-tight ${tx.Type === 'In' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                    {tx.Type === 'In' ? '입고' : '출고'}
                                                                </p>
                                                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{tx.Date}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="max-w-[200px]">
                                                            <p className="text-xs font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">{tx.Ref || '상세 사유 미기재'}</p>
                                                            {tx.LotNo && (
                                                                <p className="text-[9px] font-mono font-bold text-slate-300 mt-1 flex items-center gap-1">
                                                                    <Tag size={8} /> {tx.LotNo}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right pr-8">
                                                        <span className={`text-base font-black font-mono ${tx.Type === 'In' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {tx.Type === 'In' ? '+' : '-'}{Number(tx.Quantity).toLocaleString()}
                                                        </span>
                                                        <span className="text-[9px] ml-1 font-bold text-slate-300 uppercase font-mono">EA</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border-2 border-dashed border-slate-100">
                                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-200 mb-4">
                                        <ClipboardList size={32} />
                                    </div>
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">히스토리 내역 없음</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'locations' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {/* Location Details Grid */}
                            <section>
                                <div className="flex items-center gap-2.5 mb-5 px-1">
                                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">창고별 보관 현황</h3>
                                </div>
                                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50">
                                                <th className="pl-8 pr-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">저장 위치</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">LOT 번호</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">현재 보유고</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {inventoryList.map((inv) => (
                                                <tr key={inv.id} className="hover:bg-indigo-50/30 transition-colors group">
                                                    <td className="pl-8 pr-4 py-5">
                                                        <div className="flex items-center gap-2.5 text-sm font-black text-slate-800">
                                                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                                <MapPin size={14} strokeWidth={2.5} />
                                                            </div>
                                                            {inv.Location}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-5">
                                                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200/50">{inv.LotNo || 'Common'}</span>
                                                    </td>
                                                    <td className="px-4 py-5 text-right pr-8">
                                                        <span className="text-base font-black text-indigo-600">{Number(inv.OnHand || 0).toLocaleString()}</span>
                                                        <span className="text-[10px] ml-1.5 font-bold text-slate-300 uppercase font-mono">EA</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* LOT Summary Cards */}
                            <section>
                                <div className="flex items-center gap-2.5 mb-5 px-1">
                                    <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">제조 LOT 요약</h3>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                    {Object.entries(lotSummary).map(([lot, qty]) => (
                                        <div key={lot} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:border-emerald-200 transition-all group">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                                                <span>LOT 번호</span>
                                                <Tag size={12} className="group-hover:text-emerald-500 transition-colors" />
                                            </div>
                                            <div className="flex items-end justify-between">
                                                <div className="text-sm font-black text-slate-800 truncate pr-2" title={lot}>{lot}</div>
                                                <div className="text-lg font-black text-emerald-600 shrink-0">
                                                    {qty.toLocaleString()}
                                                    <span className="text-[10px] ml-1 font-bold text-slate-300 font-mono">EA</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'bom' && (
                        <div className="bg-white rounded-[40px] border border-slate-100 p-8 shadow-inner min-h-[450px]">
                            {bomTree ? (
                                <BOMTree data={bomTree} />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-40">
                                    <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">BOM 데이터 분석 중...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
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
