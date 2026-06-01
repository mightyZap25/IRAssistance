import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { ShieldCheck, Clock, ArrowRight, FileCheck } from 'lucide-react';

export default function PendingApprovalsWidget({ user, viewType = 'list' }) {
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchApprovals();
    }, []);

    const fetchApprovals = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'ecns'),
                where('Status', '==', 'Pending'),
                orderBy('CreatedAt', 'desc'),
                limit(10)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setApprovals(data);
        } catch (error) {
            console.error("Approval widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-200"><FileCheck size={24} /></div>;

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">미결재 문서</div>
                    <div className="text-4xl font-black text-indigo-600 tracking-tighter">{approvals.length} <span className="text-sm">건</span></div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-xl flex items-center justify-center gap-2">
                    <ShieldCheck size={12} className="text-indigo-500" />
                    <span className="text-[9px] font-black text-indigo-700 uppercase">승인 대기 중</span>
                </div>
            </div>
        );
    }

    // --- 2. Default List View ---
    if (approvals.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40 italic">
            <ShieldCheck size={24} className="mb-1" />
            <p className="text-[9px] font-bold uppercase tracking-tighter">No Pending Docs</p>
        </div>
    );

    return (
        <div className="space-y-1.5">
            {approvals.slice(0, 5).map(ecn => (
                <div key={ecn.id} className="p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl hover:border-indigo-200 transition-all cursor-pointer group">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded uppercase">ECN</span>
                        <span className="text-[8px] text-slate-400 font-bold">{ecn.CreatedAt?.toDate ? ecn.CreatedAt.toDate().toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <h4 className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 transition-colors">{ecn.Title || 'ECN Request'}</h4>
                </div>
            ))}
        </div>
    );
}
