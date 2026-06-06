import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs, query, where } from '../../../firebase';
import { AlertTriangle, Package, Warehouse, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function LowInventoryWidget({ viewType = 'list' }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'parts'));
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const low = data.filter(p => {
                const stock = Number(p.CurrentStock || 0);
                const safe = Number(p.SafeStock || 0);
                return safe > 0 && stock < safe;
            });
            setAlerts(low);
        } catch (error) {
            console.error("Inventory widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-300"><Warehouse size={24} /></div>;

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">재고 부족</div>
                    <div className="text-4xl font-black text-rose-600 tracking-tighter">{alerts.length} <span className="text-sm">건</span></div>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/20 px-3 py-2 rounded-xl flex items-center gap-2">
                    <AlertTriangle size={12} className="text-rose-500" />
                    <span className="text-[10px] font-bold text-rose-700">안전 재고 미달 품목</span>
                </div>
            </div>
        );
    }

    // --- 2. Chart View ---
    if (viewType === 'chart') {
        const chartData = alerts.slice(0, 5).map(p => ({
            name: p.Name.slice(0, 8),
            stock: Number(p.CurrentStock || 0),
            safe: Number(p.SafeStock || 0)
        }));
        return (
            <div className="h-full min-h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 0, left: -30, bottom: 0 }}>
                        <XAxis dataKey="name" style={{ fontSize: '8px', fontWeight: 'bold' }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                        <Bar dataKey="stock" fill="#f43f5e" name="현재고" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="safe" fill="#e2e8f0" name="안전재고" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    }

    // --- 3. Table View ---
    if (viewType === 'table') {
        return (
            <div className="h-full overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                            <th className="pb-2">품번</th>
                            <th className="pb-2 text-right">부족량</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {alerts.slice(0, 10).map(item => (
                            <tr key={item.id}>
                                <td className="py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[80px]">{item.PartID}</td>
                                <td className="py-2 text-right text-[10px] font-black text-rose-600">-{Number(item.SafeStock) - Number(item.CurrentStock)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // --- 4. Default List View ---
    if (alerts.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40 italic">
            <Package size={24} className="mb-1" />
            <p className="text-[9px] font-bold">Stable Inventory</p>
        </div>
    );

    return (
        <div className="space-y-1.5">
            {alerts.slice(0, 6).map(item => (
                <div key={item.id} className="flex items-center justify-between p-2 bg-rose-50/30 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-xl">
                    <div className="min-w-0">
                        <div className="text-[8px] font-mono font-bold text-rose-500/60 leading-none">{item.PartID}</div>
                        <h4 className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate mt-1">{item.Name}</h4>
                    </div>
                    <div className="text-right pl-2">
                        <div className="text-[9px] font-black text-rose-600">
                            {item.CurrentStock || 0}<span className="text-[8px] text-slate-300 font-normal mx-0.5">/</span>{item.SafeStock}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
