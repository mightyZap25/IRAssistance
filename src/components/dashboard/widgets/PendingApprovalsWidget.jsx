import React, { useState, useEffect } from 'react';
import { db } from '../../../database';
import { collection, query, where, getDocs, limit, orderBy } from '../../../database';
import { ShieldCheck, Clock, ArrowRight, FileCheck, FileText, ShoppingCart, UserCheck } from 'lucide-react';
import ApprovalReviewModal from '../../ApprovalReviewModal';
import { useNavigate } from 'react-router-dom';

export default function PendingApprovalsWidget({ user, viewType = 'list' }) {
    const navigate = useNavigate();
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Review Modal State
    const [selectedApproval, setSelectedApproval] = useState(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

    useEffect(() => {
        if (user?.uid) {
            fetchApprovals();
        }
    }, [user]);

    const fetchApprovals = async () => {
        setLoading(true);
        try {
            // 1. ECN Approvals (Old System)
            const ecnQ = query(
                collection(db, 'ecns'),
                where('Status', '==', 'Pending'),
                orderBy('CreatedAt', 'desc'),
                limit(10)
            );
            
            // 2. General Approvals (New System - Purchasing, Outsourcing etc)
            const generalQ = query(
                collection(db, 'approvals'),
                where('ApproverID', '==', user.uid),
                where('Status', '==', 'PENDING'),
                limit(10)
            );

            const [ecnSnap, generalSnap] = await Promise.all([
                getDocs(ecnQ),
                getDocs(generalQ)
            ]);

            const ecnData = ecnSnap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                _type: 'ECO',
                _date: doc.data().CreatedAt?.toDate() || new Date()
            }));

            const generalData = generalSnap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                _type: doc.data().DocType || 'APPROVAL',
                _date: doc.data().RequestedAt ? new Date(doc.data().RequestedAt) : new Date()
            }));

            const combined = [...ecnData, ...generalData].sort((a, b) => b._date - a._date);
            setApprovals(combined);
        } catch (error) {
            console.error("Approval widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleItemClick = (item) => {
        if (item._type === 'ECO') {
            navigate('/eco');
        } else {
            setSelectedApproval(item);
            setIsReviewModalOpen(true);
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
            {approvals.slice(0, 5).map(item => (
                <div 
                    key={item.id} 
                    onClick={() => handleItemClick(item)}
                    className="p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl hover:border-indigo-200 transition-all cursor-pointer group"
                >
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1">
                            {item._type === 'PURCHASE_REQUEST' ? <ShoppingCart size={10} className="text-amber-500"/> : <FileText size={10} className="text-indigo-500"/>}
                            <span className="text-[8px] font-black text-slate-500 uppercase">{item._type}</span>
                        </div>
                        <span className="text-[8px] text-slate-400 font-bold">{item._date.toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 transition-colors">{item.Title || '결재 요청'}</h4>
                </div>
            ))}

            {/* Review Modal */}
            <ApprovalReviewModal 
                isOpen={isReviewModalOpen} 
                approvalData={selectedApproval} 
                onClose={() => setIsReviewModalOpen(false)} 
                onRefresh={fetchApprovals} 
            />
        </div>
    );
}
