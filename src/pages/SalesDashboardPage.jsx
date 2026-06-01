import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { 
    TrendingUp, DollarSign, BarChart2, PieChart, 
    ArrowUpRight, ArrowDownRight, Calendar, Filter,
    Download, RefreshCw, ShoppingBag, CreditCard
} from 'lucide-react';

const StatCard = ({ title, value, subValue, icon: Icon, color, trend }) => (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-start">
            <div className={`p-3 rounded-2xl ${color} bg-opacity-10 text-opacity-100`}>
                <Icon size={24} className={color.replace('bg-', 'text-')} />
            </div>
            {trend && (
                <div className={`flex items-center gap-1 text-[10px] font-black ${trend > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {trend > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                    {Math.abs(trend)}%
                </div>
            )}
        </div>
        <div className="mt-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
            {subValue && <p className="text-[11px] font-bold text-slate-400 mt-0.5">{subValue}</p>}
        </div>
    </div>
);

export default function SalesDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [salesData, setSalesData] = useState({
        totalRevenue: 0,
        monthlyRevenue: 0,
        pendingPayments: 0,
        completedDeals: 0,
        chartData: []
    });

    useEffect(() => {
        fetchSalesStats();
    }, []);

    const fetchSalesStats = async () => {
        setLoading(true);
        try {
            // In a real app, we would aggregate data from 'quotations' (accepted ones) and 'billing'
            const qSnap = await getDocs(query(collection(db, 'quotations'), where('Status', '==', 'ACCEPTED')));
            const bSnap = await getDocs(collection(db, 'billing'));
            
            let total = 0;
            let pending = 0;
            let count = qSnap.size;
            
            qSnap.forEach(doc => {
                total += (doc.data().TotalAmount || 0);
            });

            bSnap.forEach(doc => {
                if (doc.data().Status !== 'PAID') {
                    pending += (doc.data().Amount || 0);
                }
            });

            // Mocking chart data for visualization
            const months = ['1월', '2월', '3월', '4월', '5월', '6월'];
            const mockChart = months.map(m => ({
                name: m,
                amount: Math.floor(Math.random() * 50000000) + 10000000
            }));

            setSalesData({
                totalRevenue: total,
                monthlyRevenue: total / 12, // Dummy average
                pendingPayments: pending,
                completedDeals: count,
                chartData: mockChart
            });
        } catch (error) {
            console.error("Failed to fetch sales stats", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <TrendingUp className="text-blue-600" size={32} />
                        매출 대시보드
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">누적 매출액, 미수금 현황 및 주요 영업 지표를 확인합니다.</p>
                </div>
                <div className="flex gap-2">
                    <button className="p-3 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-2xl border border-slate-200 transition-all">
                        <Calendar size={20} />
                    </button>
                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-md shadow-blue-100 transition-all">
                        <Download size={18} />
                        보고서 다운로드
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-6 shrink-0">
                <StatCard 
                    title="Total Cumulative Revenue" 
                    value={`₩ ${(salesData.totalRevenue / 100000000).toFixed(2)}억`}
                    subValue={`총 ${salesData.completedDeals}건의 승인된 견적`}
                    icon={DollarSign} 
                    color="bg-blue-600"
                    trend={12.5}
                />
                <StatCard 
                    title="Average Monthly Sales" 
                    value={`₩ ${(salesData.monthlyRevenue / 1000000).toFixed(0)}M`}
                    subValue="최근 12개월 평균"
                    icon={BarChart2} 
                    color="bg-indigo-600"
                    trend={-2.4}
                />
                <StatCard 
                    title="Pending Payments" 
                    value={`₩ ${(salesData.pendingPayments / 1000000).toFixed(1)}M`}
                    subValue="미수금(입금 대기) 총액"
                    icon={CreditCard} 
                    color="bg-amber-600"
                />
                <StatCard 
                    title="Conversion Rate" 
                    value="68.4%"
                    subValue="견적 대비 수주 전환율"
                    icon={ShoppingBag} 
                    color="bg-emerald-600"
                    trend={4.2}
                />
            </div>

            <div className="grid grid-cols-3 gap-6 flex-1 min-h-0">
                <div className="col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-base font-black text-slate-800">월별 매출 추이</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Monthly Sales Performance</p>
                        </div>
                        <div className="flex gap-1.5">
                            {['6M', '1Y', 'ALL'].map(t => (
                                <button key={t} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${t === '6M' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 flex items-end justify-between gap-4 px-2 pb-6">
                        {salesData.chartData.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                                <div className="w-full relative flex flex-col items-center">
                                    <div 
                                        className="w-full bg-slate-100 rounded-t-xl transition-all group-hover:bg-blue-600 group-hover:shadow-lg group-hover:shadow-blue-100 cursor-pointer" 
                                        style={{ height: `${(d.amount / 60000000) * 100}%`, minHeight: '10%' }}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            ₩ {(d.amount / 1000000).toFixed(0)}M
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black text-slate-400">{d.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
                    <div className="mb-8">
                        <h3 className="text-base font-black text-slate-800">고객사별 매출 비중</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Revenue Share by Customer</p>
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center space-y-6">
                        {[
                            { name: 'Samsung Electronics', share: 45, color: 'bg-blue-600' },
                            { name: 'LG Energy Solution', share: 25, color: 'bg-rose-600' },
                            { name: 'SK On', share: 15, color: 'bg-orange-600' },
                            { name: 'Other Clients', share: 15, color: 'bg-slate-200' }
                        ].map((c, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs font-black text-slate-700">{c.name}</span>
                                    <span className="text-xs font-black text-slate-900">{c.share}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                                    <div className={`h-full ${c.color} rounded-full`} style={{ width: `${c.share}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
