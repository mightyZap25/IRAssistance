import React, { useState, useEffect } from 'react';
import { db } from '../../../database';
import { collection, getDocs, query, where, limit, orderBy } from '../../../database';
import { ShoppingCart, Clock, Truck, PackageCheck } from 'lucide-react';

export default function PendingPOWidget({ viewType = 'list' }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'purchase_orders'),
                where('Status', 'in', ['ORDERING', 'WAITING_DELIVERY']),
                orderBy('CreatedAt', 'desc'),
                limit(10)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(data);
        } catch (error) {
            console.error("PO widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-200"><PackageCheck size={24} /></div>;

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">입고 대기</div>
                    <div className="text-4xl font-black text-blue-600 tracking-tighter">{orders.length} <span className="text-sm">건</span></div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-xl flex items-center justify-center gap-2">
                    <Truck size={12} className="text-blue-500" />
                    <span className="text-[9px] font-black text-blue-700 uppercase">발주 진행 중</span>
                </div>
            </div>
        );
    }

    // --- 2. Default List View ---
    if (orders.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40 italic">
            <ShoppingCart size={24} className="mb-1" />
            <p className="text-[9px] font-bold">No Pending Orders</p>
        </div>
    );

    return (
        <div className="space-y-1.5">
            {orders.slice(0, 5).map(order => (
                <div key={order.id} className="p-2 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter">{order.PONumber || 'PO-XXXX'}</span>
                        <span className={`text-[7px] font-black px-1 rounded-full ${
                            order.Status === 'WAITING_DELIVERY' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                            {order.Status === 'WAITING_DELIVERY' ? '대기' : '진행'}
                        </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{order.PartName}</div>
                </div>
            ))}
        </div>
    );
}
