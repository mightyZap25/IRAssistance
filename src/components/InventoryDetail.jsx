import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, orderBy, where, doc, getDoc } from '../database';
import { db } from '../database';
import { X, History, ArrowUpRight, ArrowDownRight, Package, User, FileText, ExternalLink, Info, AlertCircle, Link as LinkIcon, Factory, Ban } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { inventoryService } from '../services/inventoryService';

const InventoryDetail = ({ item, isOpen, onClose, onRefresh }) => {
    const [history, setHistory] = useState([]);
    const [usageInBoms, setUsageInBoms] = useState([]);
    const [loading, setLoading] = useState(true);
    const { userProfile } = useAuth();
    
    // Cancellation state
    const [cancelingLog, setCancelingLog] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isCanceling, setIsCanceling] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            fetchDetailData();
        }
    }, [isOpen, item]);

    const fetchDetailData = async () => {
        setLoading(true);
        try {
            // 1. 입출고 히스토리 조회
            const [histSnap, txSnap] = await Promise.all([
                getDocs(query(
                    collection(db, 'inventory_history'),
                    where('PartID', '==', item.PartID),
                    orderBy('Timestamp', 'desc')
                )),
                getDocs(query(
                    collection(db, 'transactions'),
                    where('PartID', '==', item.PartID),
                    orderBy('Date', 'desc')
                ))
            ]);
            
            // 2. 해당 부품을 사용하는 상위 BOM(조립품) 조회
            const bomSnap = await getDocs(query(
                collection(db, 'bom'),
                where('ChildID', '==', item.PartID)
            ));

            const combined = [
                ...histSnap.docs.map(d => ({ ...d.data(), id: d.id, _isFromHistoryTable: true })),
                ...txSnap.docs.map(d => {
                    const dt = d.data();
                    return {
                        ...dt,
                        id: d.id,
                        _isFromHistoryTable: false,
                        Timestamp: dt.Date,
                        Change: dt.Type === 'In' ? Number(dt.Quantity || 0) : -Number(dt.Quantity || 0),
                        SourceType: dt.Reason || dt.Type || 'ETC',
                        PRNumber: dt.RefDoc
                    };
                })
            ].sort((a, b) => {
                const ta = a.Timestamp?.seconds || 0;
                const tb = b.Timestamp?.seconds || 0;
                return tb - ta;
            });

            setHistory(combined);
            setUsageInBoms(bomSnap.docs.map(d => d.data()));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const handleCancelTransaction = async () => {
        if (!cancelReason.trim()) {
            alert('취소 사유서를 반드시 작성해야 합니다.');
            return;
        }
        setIsCanceling(true);
        try {
            await inventoryService.cancelTransaction(
                cancelingLog.id, 
                cancelingLog._isFromHistoryTable, 
                cancelReason, 
                userProfile
            );
            setCancelingLog(null);
            setCancelReason('');
            fetchDetailData(); // Refresh history
            if (onRefresh) onRefresh(); // Refresh parent list
        } catch (err) {
            console.error(err);
            alert('취소 처리 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setIsCanceling(false);
        }
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
                                const isCancelled = log.Status === 'CANCELLED';
                                const isPlus = log.Type === 'IN' || log.Change > 0;
                                return (
                                    <div key={log.id} className={`bg-white border-2 border-slate-50 rounded-[24px] p-5 hover:border-indigo-100 transition-all shadow-sm ${isCancelled ? 'opacity-60 grayscale' : ''}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl ${isCancelled ? 'bg-slate-100 text-slate-400' : (isPlus ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}`}>
                                                    {isCancelled ? <Ban size={18}/> : (isPlus ? <ArrowUpRight size={18}/> : <ArrowDownRight size={18}/>)}
                                                </div>
                                                <div className="text-left">
                                                    <p className={`text-sm font-black ${isCancelled ? 'text-slate-500 line-through' : (isPlus ? 'text-emerald-700' : 'text-rose-700')}`}>
                                                        {isPlus ? '+' : ''}{log.Change?.toLocaleString()} EA
                                                        <span className="ml-2 text-xs font-bold text-slate-400">({log.Type === 'IN' ? '입고' : '출고'})</span>
                                                    </p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{new Date(log.Timestamp?.seconds * 1000).toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                                                    isCancelled ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                    log.SourceType === 'PRODUCTION' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                                    log.SourceType === 'SHIPPING' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                                                }`}>
                                                    {isCancelled ? '취소됨' : log.SourceType === 'PRODUCTION' ? '생산 재고확보' : 
                                                     log.SourceType === 'SHIPPING' ? '고객 출하' : log.Reason || '기타'}
                                                </span>
                                                {!isCancelled && (
                                                    <button onClick={() => setCancelingLog(log)} className="text-[10px] font-bold text-slate-400 hover:text-rose-600 underline underline-offset-2">취소/수정(롤백)</button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {isCancelled && log.CancelReason && (
                                            <div className="mt-2 p-3 bg-rose-50/50 rounded-xl border border-rose-100/50 flex flex-col gap-1">
                                                <span className="text-[10px] font-black text-rose-500 flex items-center gap-1"><AlertCircle size={10}/> 취소 사유</span>
                                                <p className="text-xs font-bold text-slate-600">{log.CancelReason}</p>
                                            </div>
                                        )}
                                        
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

            {/* Cancel Prompt Modal */}
            {cancelingLog && (
                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[10002] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h3 className="text-lg font-black text-slate-900 mb-2">재고 트랜잭션 취소(롤백)</h3>
                        <p className="text-xs text-slate-500 font-bold mb-4">
                            이 작업을 수행하면 기존에 증감되었던 재고 수량이 반대로 복구되며, 해당 내역은 취소 처리됩니다. <span className="text-rose-500">사유서 작성이 필수입니다.</span>
                        </p>
                        <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">취소 대상</p>
                            <p className="text-sm font-black text-slate-800">{cancelingLog.Change > 0 ? '+' : ''}{cancelingLog.Change} EA ({cancelingLog.SourceType})</p>
                        </div>
                        <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="취소 사유를 상세히 적어주세요 (예: 입고 수량 중복 입력 정정)"
                            className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white resize-none mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setCancelingLog(null); setCancelReason(''); }} className="px-4 py-2 font-black text-slate-400 hover:text-slate-600 rounded-xl transition-colors">취소</button>
                            <button onClick={handleCancelTransaction} disabled={isCanceling} className="px-5 py-2 font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition-all shadow-sm">
                                {isCanceling ? '처리 중...' : '롤백 실행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>, document.body
    );
};

export default InventoryDetail;
