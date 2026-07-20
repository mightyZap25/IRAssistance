import React, { useState, useEffect } from 'react';
import { db } from '../../../database';
import { collection, getDocs, query, where, orderBy } from '../../../database';
import { AlertCircle, Package, ShoppingCart, ArrowRight } from 'lucide-react';

export default function PartWaitingPRWidget({ viewType = 'list' }) {
    const [waitingPRs, setWaitingPRs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWaitingPRs();
    }, []);

    const fetchWaitingPRs = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'production_requests'), 
                where('Status', '==', 'WAITING_FOR_PARTS'),
                orderBy('CreatedAt', 'desc')
            );
            const snap = await getDocs(q);
            setWaitingPRs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Part waiting widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-300"><Package size={24} /></div>;

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">자재 대기 PR</div>
                    <div className="text-4xl font-black text-rose-600 tracking-tighter">{waitingPRs.length} <span className="text-sm">건</span></div>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/20 px-3 py-2 rounded-xl flex items-center gap-2">
                    <AlertCircle size={12} className="text-rose-500" />
                    <span className="text-[10px] font-bold text-rose-700 font-black">구매 발주 필요</span>
                </div>
            </div>
        );
    }

    if (waitingPRs.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40 italic">
            <ShoppingCart size={24} className="mb-1" />
            <p className="text-[9px] font-bold uppercase">All Materials Ready</p>
        </div>
    );

    return (
        <div className="space-y-2">
            {waitingPRs.slice(0, 5).map(pr => (
                <div key={pr.id} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-indigo-300 transition-colors group">
                    <div className="flex justify-between items-start mb-1.5">
                        <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">{pr.PRNumber}</span>
                        <span className="text-[9px] font-bold text-slate-400 italic">{pr.DueDate}</span>
                    </div>
                    <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">{pr.PartName}</h4>
                    <div className="mt-2 flex items-center justify-between">
                        <div className="flex -space-x-1.5">
                            {(pr.Shortages || []).slice(0, 3).map((s, i) => (
                                <div key={i} className="w-5 h-5 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-[8px] font-black text-rose-600 shadow-sm" title={s.id}>
                                    {s.id.charAt(0)}
                                </div>
                            ))}
                            {(pr.Shortages || []).length > 3 && (
                                <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px] font-black text-slate-500 shadow-sm">
                                    +{(pr.Shortages || []).length - 3}
                                </div>
                            )}
                        </div>
                        <span className="text-[10px] font-black text-rose-600 flex items-center gap-0.5">
                            {(pr.Shortages || []).length}개 품목 부족 <ArrowRight size={10} />
                        </span>
                    </div>
                </div>
            ))}
            {waitingPRs.length > 5 && (
                <button className="w-full py-1.5 text-[10px] font-black text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">
                    전체 {waitingPRs.length}건 보기
                </button>
            )}
        </div>
    );
}
