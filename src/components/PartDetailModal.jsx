import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore';
import { X, Layers, ArrowRightLeft, Clock, FileText, User, Package, Box, Ruler, Factory, Settings, DollarSign, Tag } from 'lucide-react';

export default function PartDetailModal({ data, onClose }) {
    const [activeTab, setActiveTab] = useState('usedIn');
    const [detailData, setDetailData] = useState({ usedIn: [], transactions: [], history: [], revisions: [] });
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [selectedRevId, setSelectedRevId] = useState(data?.PartID || null);

    // Fetch Details when data or selectedRevId changes
    useEffect(() => {
        if (data) {
            const targetId = selectedRevId || data.PartID;
            fetchPartDetails(targetId);
        }
    }, [data, selectedRevId]);

    async function fetchPartDetails(partId) {
        setIsDetailLoading(true);
        try {
            // 0. Get current viewing part info (to handle Revision changes)
            const partSnap = await getDocs(query(collection(db, 'parts'), where('PartID', '==', partId)));
            if (partSnap.empty) return;
            const currentPart = partSnap.docs[0].data();

            // 1. Used In
            const usedInq = query(collection(db, 'bom'), where('ChildID', '==', partId));
            const usedInSnap = await getDocs(usedInq);
            const usedInList = [];
            usedInSnap.forEach(doc => usedInList.push(doc.data()));

            // Resolve Parent Names (Optimized: Fetch all parents if needed, but for now just PartID)
            const resolvedUsedIn = await Promise.all(usedInList.map(async item => {
                const pSnap = await getDocs(query(collection(db, 'parts'), where('PartID', '==', item.ParentID)));
                const pName = !pSnap.empty ? pSnap.docs[0].data().Name : item.ParentID;
                return { ...item, ParentName: pName };
            }));

            // 2. Transactions
            const txQ = query(collection(db, 'transactions'), where('PartID', '==', partId), limit(50));
            const txSnap = await getDocs(txQ);
            const txList = [];
            txSnap.forEach(doc => txList.push({ ...doc.data(), id: doc.id }));
            txList.sort((a, b) => new Date(b.Date) - new Date(a.Date));

            // 3. ECN History
            const histQ = query(collection(db, 'ecns'), where('MasterPartID', '==', currentPart.MasterPartID));
            const histSnap = await getDocs(histQ);
            const histList = [];
            histSnap.forEach(doc => histList.push({ ...doc.data(), id: doc.id }));
            histList.sort((a, b) => {
                const getVal = (v) => v?.toDate ? v.toDate().getTime() : (v instanceof Date ? v.getTime() : 0);
                return getVal(b.CreatedAt) - getVal(a.CreatedAt);
            });

            // 4. Revisions
            const revQ = query(collection(db, 'parts'), where('MasterPartID', '==', currentPart.MasterPartID));
            const revSnap = await getDocs(revQ);
            const revList = [];
            revSnap.forEach(doc => revList.push({ ...doc.data(), id: doc.id }));
            revList.sort((a, b) => {
                const revA = (a.Rev || '1.0').split('.').map(Number);
                const revB = (b.Rev || '1.0').split('.').map(Number);
                if (revA[0] !== revB[0]) return revB[0] - revA[0];
                return revB[1] - revA[1];
            });

            setDetailData({
                usedIn: resolvedUsedIn,
                transactions: txList,
                history: histList,
                revisions: revList
            });

        } catch (e) {
            console.error("Error fetching details in modal:", e);
        } finally {
            setIsDetailLoading(false);
        }
    }

    if (!data) return null;

    const currentViewingPart = (detailData.revisions || []).find(r => r.PartID === (selectedRevId || data.PartID)) || data;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[80vh] overflow-y-auto animate-in zoom-in-95 duration-200 flex flex-col custom-scrollbar">

                {/* Header */}
                <div className="sticky top-0 bg-white/95 backdrop-blur z-20 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex gap-4 items-center">
                        <h2 className="text-xl font-black text-slate-800 leading-tight">부품 상세 정보</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors font-black">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">

                    {/* LEFT COLUMN */}
                    <div className="lg:col-span-7 space-y-6">
                        {/* Title Card */}
                        <div className="bg-slate-50 p-6 rounded-2xl border border-blue-100 flex justify-between items-center shadow-sm">
                            <div>
                                <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Part Name</div>
                                <div className="text-2xl font-black text-slate-900 italic tracking-tight">{currentViewingPart.Name}</div>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Revision</div>
                                <select
                                    value={selectedRevId || data.PartID}
                                    onChange={(e) => setSelectedRevId(e.target.value)}
                                    className="text-lg font-mono font-black text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-1 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    {detailData.revisions.map(rv => (
                                        <option key={rv.PartID} value={rv.PartID}>
                                            Rev {rv.Rev} {rv.IsLatestRevision ? '(Latest)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Info Grids */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-6">
                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 pb-2 border-b border-slate-50 flex items-center gap-2">
                                    <Tag size={12} /> General Information
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                                    <CompactInfoItem label="Category" value={currentViewingPart.Category} />
                                    <CompactInfoItem label="Class" value={currentViewingPart.Class} />
                                    <CompactInfoItem label="Type Code" value={currentViewingPart.PartTypeCode} />
                                    <CompactInfoItem label="Spec" value={currentViewingPart.Spec} />
                                    <CompactInfoItem label="Unit" value={currentViewingPart.Unit} />
                                    <CompactInfoItem label="Part ID" value={currentViewingPart.PartID} />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 pb-2 border-b border-slate-50 flex items-center gap-2">
                                    <Factory size={12} /> Manufacture & Cost
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                                    <CompactInfoItem label="Maker" value={currentViewingPart.Maker} />
                                    <CompactInfoItem label="MFN" value={currentViewingPart.MFN} />
                                    <CompactInfoItem label="Owner" value={currentViewingPart.Owner} />
                                    <CompactInfoItem label="Price" value={currentViewingPart.UnitPrice ? `${currentViewingPart.Currency || 'KRW'} ${Number(currentViewingPart.UnitPrice).toLocaleString()}` : '-'} highlight />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 pb-2 border-b border-slate-50 flex items-center gap-2">
                                    <Settings size={12} /> Description
                                </h3>
                                <div className="bg-slate-50/50 p-4 rounded-xl text-sm font-bold text-slate-600 leading-relaxed italic border border-slate-100">
                                    {currentViewingPart.Description || 'No additional description provided.'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="lg:col-span-5 flex flex-col min-h-[500px] h-full">
                        {/* Tab Headers */}
                        <div className="flex p-1.5 bg-slate-100 rounded-2xl mb-4">
                            <TabButton active={activeTab === 'usedIn'} onClick={() => setActiveTab('usedIn')} icon={Layers} label="Used In" />
                            <TabButton active={activeTab === 'inOut'} onClick={() => setActiveTab('inOut')} icon={ArrowRightLeft} label="In/Out" />
                            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={Clock} label="History" />
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative min-h-[400px]">
                            {isDetailLoading && (
                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center text-slate-500 text-sm font-black uppercase tracking-widest">
                                    Loading details...
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                                {activeTab === 'usedIn' && (
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Parent Assemblies</h4>
                                        {detailData.usedIn.length > 0 ? (
                                            <ul className="space-y-3">
                                                {detailData.usedIn.map((item, idx) => (
                                                    <li key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-blue-50/50 transition-all shadow-sm">
                                                        <div>
                                                            <div className="font-black text-slate-800 text-sm italic">{item.ParentName}</div>
                                                            <div className="text-[10px] font-mono font-bold text-slate-400 mt-1">{item.ParentID}</div>
                                                        </div>
                                                        <div className="text-xs font-black text-blue-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">x {item.Quantity}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="h-32 flex flex-col items-center justify-center text-slate-400 text-xs font-bold italic border-2 border-dotted border-slate-100 rounded-2xl">
                                                No parent assemblies found.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'inOut' && (
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Transactions</h4>
                                        {detailData.transactions.length > 0 ? (
                                            <div className="space-y-3">
                                                {detailData.transactions.map(tx => (
                                                    <div key={tx.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center hover:bg-orange-50/50 transition-all shadow-sm">
                                                        <div className="space-y-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter ${tx.Type === 'In' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>{tx.Type}</span>
                                                                <span className="text-[10px] font-mono font-black text-slate-400 leading-none">{tx.Date}</span>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-slate-500">{tx['거래처'] || '-'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-black text-slate-800 text-sm">+{Number(tx.Quantity).toLocaleString()}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="h-32 flex flex-col items-center justify-center text-slate-400 text-xs font-bold italic border-2 border-dotted border-slate-100 rounded-2xl">
                                                No transaction history found.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'history' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <FileText size={12} /> ECN History Log
                                            </h4>
                                            {detailData.history.length > 0 ? (
                                                <div className="space-y-4">
                                                    {detailData.history.map(hist => (
                                                        <div key={hist.id} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-blue-100 transition-all">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${hist.Status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                                                        {hist.Status}
                                                                    </span>
                                                                    <span className="text-[10px] font-mono font-black text-blue-600 px-2 py-1 bg-blue-50 rounded-lg border border-blue-100/30">REV {hist.Rev}</span>
                                                                </div>
                                                                <span className="text-[10px] font-black text-slate-300">
                                                                    {hist.CreatedAt?.toDate ? hist.CreatedAt.toDate().toLocaleDateString() : new Date(hist.CreatedAt).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] font-bold text-slate-700 italic border-l-4 border-slate-200 pl-3 py-1 mb-3">"{hist.Reason}"</p>
                                                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-400">
                                                                <span className="flex items-center gap-1.5"><User size={12} /> {hist.CreatedBy}</span>
                                                                <span className="truncate flex-1">Modified: {hist.ModifiedFields?.join(', ')}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-24 flex items-center justify-center border-2 border-dotted border-slate-100 rounded-2xl text-slate-300 text-[10px] font-black italic">
                                                    No ECN records found.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

function CompactInfoItem({ label, value, highlight }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</span>
            <span className={`text-sm font-bold ${highlight ? 'text-blue-600 font-black' : 'text-slate-700'} truncate leading-snug`}>{value || '-'}</span>
        </div>
    );
}

function TabButton({ active, onClick, icon: Icon, label }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${active ? 'bg-white shadow-xl text-blue-600 italic scale-105 border border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'}`}
        >
            <Icon size={14} className={active ? 'animate-pulse' : ''} />
            {label}
        </button>
    );
}
