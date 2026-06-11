import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where, doc, getDoc } from '../firebase';
import { db } from '../firebase';
import { X, History, ArrowUpRight, ArrowDownRight, Package, User, FileText, ExternalLink, Info, AlertCircle, Link as LinkIcon, Factory } from 'lucide-react';

const InventoryDetail = ({ item, isOpen, onClose, onRefresh }) => {
    const [history, setHistory] = useState([]);
    const [usageInBoms, setUsageInBoms] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && item) {
            fetchDetailData();
        }
    }, [isOpen, item]);

    const fetchDetailData = async () => {
        setLoading(true);
        try {
            // 1. 입출고 히스토리 조회
            const histSnap = await getDocs(query(
                collection(db, 'inventory_history'),
                where('PartID', '==', item.PartID),
                orderBy('Timestamp', 'desc')
            ));
            
            // 2. 해당 부품을 사용하는 상위 BOM(조립품) 조회
            const bomSnap = await getDocs(query(
                collection(db, 'bom'),
                where('ChildID', '==', item.PartID)
            ));

            setHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setUsageInBoms(bomSnap.docs.map(d => d.data()));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    if (!isOpen || !item) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10001] flex justify-end">
            <div className="w-full max-w-2xl bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col overflow-hidden text-left">
                {/* Header */}
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-widest">Inventory Details</span>
                            <span className="text-xs font-mono font-bold text-slate-400">[{item.PartID}]</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{item.Name}</h2>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-xl shadow-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">현재 총 재고</p>
                            <p className="text-2xl font-black italic">{item.OnHand?.toLocaleString()} <span className="text-sm font-bold text-slate-500">EA</span></p>
                        </div>
                        <div className="bg-amber-50 rounded-3xl p-5 border border-amber-100">
                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">예약 수량</p>
                            <p className="text-2xl font-black text-slate-800">{item.Reserved?.toLocaleString()} <span className="text-sm font-bold text-slate-300">EA</span></p>
                        </div>
                        <div className="bg-rose-50 rounded-3xl p-5 border border-rose-100">
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">가용 재고</p>
                            <p className={`text-2xl font-black ${item.IsRisk ? 'text-rose-600' : 'text-slate-800'}`}>{item.Available?.toLocaleString()} <span className="text-sm font-bold text-slate-300">EA</span></p>
                        </div>
                    </div>

                    {/* BOM Usage Section */}
                    <section className="space-y-4">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <LinkIcon size={16} className="text-indigo-500"/> 상위 조립품 사용처 (BOM)
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {usageInBoms.length > 0 ? usageInBoms.map((b, idx) => (
                                <div key={idx} className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-700 flex items-center gap-2">
                                    <Factory size={12}/> {b.ParentID} <span className="text-[10px] opacity-60">({b.Quantity}개 소요)</span>
                                </div>
                            )) : <p className="text-xs text-slate-300 italic px-2">상위 BOM 정보가 없습니다.</p>}
                        </div>
                    </section>

                    {/* History List */}
                    <section className="space-y-4 pb-10">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <History size={16} className="text-emerald-500"/> 입출고 상세 이력
                        </h3>
                        <div className="space-y-3">
                            {loading ? (
                                <div className="py-20 text-center animate-pulse text-slate-300 font-bold">히스토리 로드 중...</div>
                            ) : history.length > 0 ? history.map((log) => {
                                const isPlus = log.Type === 'IN' || log.Change > 0;
                                return (
                                    <div key={log.id} className="bg-white border-2 border-slate-50 rounded-[24px] p-5 hover:border-indigo-100 transition-all shadow-sm">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl ${isPlus ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                    {isPlus ? <ArrowUpRight size={18}/> : <ArrowDownRight size={18}/>}
                                                </div>
                                                <div className="text-left">
                                                    <p className={`text-sm font-black ${isPlus ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        {isPlus ? '+' : ''}{log.Change?.toLocaleString()} EA
                                                        <span className="ml-2 text-xs font-bold text-slate-400">({log.Type === 'IN' ? '입고' : '출고'})</span>
                                                    </p>
                                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{new Date(log.Timestamp?.seconds * 1000).toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                                                    log.SourceType === 'PRODUCTION' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                                    log.SourceType === 'SHIPPING' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                                                }`}>
                                                    {log.SourceType === 'PRODUCTION' ? '생산 재고확보' : 
                                                     log.SourceType === 'SHIPPING' ? '고객 출하' : log.Reason || '기타'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {(log.SourceType === 'SHIPPING' || log.PRNumber) && (
                                            <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                        <User size={12}/> {log.CustomerName || '내부 부서'}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-black text-indigo-500">
                                                        <FileText size={12}/> {log.PRNumber || log.RefID || '-'}
                                                    </div>
                                                </div>
                                                <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-300 transition-colors">
                                                    <ExternalLink size={14}/>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="py-20 text-center border-2 border-dashed border-slate-50 rounded-[32px] text-slate-300">
                                    <Info size={40} className="mx-auto mb-3 opacity-20"/>
                                    <p className="font-black text-xs uppercase tracking-widest">기록된 이력이 없습니다</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Footer Warning */}
                {item.IsRisk && (
                    <div className="p-6 bg-rose-600 text-white shrink-0 flex items-center gap-4 animate-in slide-in-from-bottom duration-500">
                        <AlertCircle size={24} className="animate-bounce" />
                        <div>
                            <p className="text-sm font-black">위험 재고 알림</p>
                            <p className="text-[11px] font-bold opacity-90">가용 재고가 안전재고 기준({item.Safety} EA) 미달입니다. 자재 수급 계획을 확인하세요.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>, document.body
    );
};

export default InventoryDetail;
