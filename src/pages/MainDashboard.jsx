import React, { useState, useEffect } from 'react';
import { 
    Activity, 
    CheckCircle, 
    Clock, 
    CreditCard, 
    DollarSign, 
    FileText, 
    Package, 
    ShoppingCart, 
    Users 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const MainDashboard = () => {
    const { currentUser, odooApiUrl } = useAuth();
    const [data, setData] = useState({
        user_name: '',
        department: '',
        todo_count: 0,
        leaves_to_approve: 0,
        revenue_this_month: 0,
        sales_count: 0,
        bom_count: 0,
        production_orders: 0,
        recent_activities: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Call Odoo JSON-RPC API
                const response = await fetch(`${odooApiUrl}/api/main_dashboard/data`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "call",
                        params: {},
                        id: Math.floor(Math.random() * 1000000)
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error.data?.message || 'Odoo RPC Error');
                }

                if (result.result && result.result.status === 'success') {
                    setData(result.result.data);
                } else {
                    // if it's not a JSON-RPC format but a direct JSON response
                    if (result.status === 'success') {
                        setData(result.data);
                    } else {
                        throw new Error('Invalid data format from server');
                    }
                }
            } catch (err) {
                console.error("Dashboard fetch error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (odooApiUrl) {
            fetchDashboardData();
        }
    }, [odooApiUrl]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-slate-50">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-slate-500 font-medium">데이터를 불러오는 중입니다...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full bg-slate-50">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Activity size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">데이터 연동 오류</h3>
                    <p className="text-slate-500 mb-6">{error}</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-slate-50 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            {/* Header Section */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
                    안녕하세요, {data.user_name || currentUser?.email?.split('@')[0]}님! 👋
                </h1>
                <p className="text-slate-500 mt-2 font-medium">
                    오늘도 성공적인 하루 되세요. 소속: <span className="text-indigo-600">{data.department}</span>
                </p>
            </div>

            {/* Top KPI Cards (Glassmorphism & Gradients) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Sales Card */}
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200 transform hover:-translate-y-1 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-blue-100 font-medium text-sm">이번 달 총 매출액</p>
                            <h3 className="text-2xl font-bold mt-1">{formatCurrency(data.revenue_this_month)}</h3>
                        </div>
                        <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <DollarSign size={24} className="text-white" />
                        </div>
                    </div>
                    <div className="flex items-center text-sm">
                        <CheckCircle size={16} className="mr-1 text-blue-200" />
                        <span className="text-blue-100">총 {data.sales_count}건의 수주 달성</span>
                    </div>
                </div>

                {/* To-Do Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300 group">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-slate-500 font-medium text-sm">내 할 일 (To-Do)</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{data.todo_count}건</h3>
                        </div>
                        <div className="p-2 bg-amber-50 text-amber-500 rounded-lg group-hover:bg-amber-100 transition-colors">
                            <FileText size={24} />
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4">
                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: data.todo_count > 0 ? '60%' : '0%' }}></div>
                    </div>
                </div>

                {/* Approval Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300 group">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-slate-500 font-medium text-sm">결재 대기 (휴가 등)</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{data.leaves_to_approve}건</h3>
                        </div>
                        <div className="p-2 bg-rose-50 text-rose-500 rounded-lg group-hover:bg-rose-100 transition-colors">
                            <Clock size={24} />
                        </div>
                    </div>
                    <div className="flex items-center text-sm mt-4 text-slate-500">
                        {data.leaves_to_approve > 0 ? (
                            <span className="text-rose-500 font-medium text-sm">확인이 필요한 결재가 있습니다.</span>
                        ) : (
                            <span>모든 결재가 완료되었습니다.</span>
                        )}
                    </div>
                </div>

                {/* Manufacturing Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300 group">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-slate-500 font-medium text-sm">진행중인 제조 오더</p>
                            <h3 className="text-2xl font-bold text-slate-800 mt-1">{data.production_orders}건</h3>
                        </div>
                        <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg group-hover:bg-emerald-100 transition-colors">
                            <Package size={24} />
                        </div>
                    </div>
                    <div className="flex items-center text-sm mt-4 text-slate-500">
                        <span className="text-emerald-600 font-medium mr-2">활성 BOM: {data.bom_count}개</span>
                    </div>
                </div>
            </div>

            {/* Middle Section: Recent Activities & Shortcuts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Recent Activities List */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-800">최근 활동 내역</h2>
                        <button className="text-sm font-medium text-indigo-600 hover:text-indigo-800">전체보기</button>
                    </div>
                    
                    <div className="space-y-4">
                        {data.recent_activities.length > 0 ? (
                            data.recent_activities.map((activity, idx) => (
                                <div key={activity.id || idx} className="flex items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mr-4 shrink-0">
                                        <Activity size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{activity.summary}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">마감일: {activity.date}</p>
                                    </div>
                                    <div className="ml-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                            진행중
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-slate-400">
                                <Activity size={32} className="mx-auto mb-3 text-slate-300" />
                                <p>최근 활동 내역이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-6">빠른 실행</h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <a href="#/parts" className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors group cursor-pointer border border-transparent hover:border-indigo-100">
                            <Package size={24} className="text-slate-400 group-hover:text-indigo-600 mb-2" />
                            <span className="text-sm font-medium text-slate-600 group-hover:text-indigo-600">부품 관리</span>
                        </a>
                        <a href="#/bom" className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors group cursor-pointer border border-transparent hover:border-blue-100">
                            <CheckCircle size={24} className="text-slate-400 group-hover:text-blue-600 mb-2" />
                            <span className="text-sm font-medium text-slate-600 group-hover:text-blue-600">BOM 관리</span>
                        </a>
                        <a href="#/sales/billing" className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition-colors group cursor-pointer border border-transparent hover:border-emerald-100">
                            <ShoppingCart size={24} className="text-slate-400 group-hover:text-emerald-600 mb-2" />
                            <span className="text-sm font-medium text-slate-600 group-hover:text-emerald-600">영업 관리</span>
                        </a>
                        <a href="#/customers" className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl hover:bg-amber-50 hover:text-amber-600 transition-colors group cursor-pointer border border-transparent hover:border-amber-100">
                            <Users size={24} className="text-slate-400 group-hover:text-amber-600 mb-2" />
                            <span className="text-sm font-medium text-slate-600 group-hover:text-amber-600">고객 관리</span>
                        </a>
                    </div>

                    <div className="mt-6 p-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl text-white relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mr-4 -mt-4 w-16 h-16 bg-white opacity-10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                        <h3 className="font-bold mb-1">전자결재</h3>
                        <p className="text-xs text-slate-300 mb-3">빠르고 안전한 결재 처리</p>
                        <a href="#/approval" className="inline-block text-xs font-medium px-3 py-1.5 bg-white text-slate-900 rounded-lg hover:bg-slate-100 transition-colors">
                            결재함 이동 &rarr;
                        </a>
                    </div>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 20px;
                }
            `}} />
        </div>
    );
};

export default MainDashboard;
