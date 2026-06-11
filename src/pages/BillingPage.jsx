import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, orderBy, where } from '../firebase';
import { db } from '../firebase';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { CreditCard, FileText, CheckCircle2, Clock, X, Eye, DollarSign, ExternalLink, ShieldCheck, Printer, History } from 'lucide-react';

const RESOLUTION_STATUS = {
    APPROVAL_PENDING: { label: '승인대기', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    APPROVED: { label: '지불대기', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    COMPLETED: { label: '지불완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    REJECTED: { label: '반려', color: 'bg-rose-50 text-rose-600 border-rose-200' }
};

export default function BillingPage() {
    const [resolutions, setResolutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRes, setSelectedRes] = useState(null);
    const [approvalInfo, setApprovalInfo] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => { fetchResolutions(); }, []);

    const fetchResolutions = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'expense_resolutions'), orderBy('CreatedAt', 'desc')));
            setResolutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    // 상세 보기 클릭 시 기안서 정보도 함께 가져옴
    const handleSelectRes = async (res) => {
        setSelectedRes(res);
        setApprovalInfo(null);
        if (res.LastApprovalID) {
            const appSnap = await getDocs(query(collection(db, 'approvals'), where('id', '==', res.LastApprovalID)));
            if (!appSnap.empty) setApprovalInfo(appSnap.docs[0].data());
        }
    };

    const handleAction = async (id, nextStatus) => {
        if (!window.confirm(`상태를 '${RESOLUTION_STATUS[nextStatus].label}'(으)로 변경하시겠습니까?`)) return;
        try {
            await updateDoc(doc(db, 'expense_resolutions', id), { Status: nextStatus, UpdatedAt: serverTimestamp() });
            alert('변경되었습니다.');
            fetchResolutions();
            setSelectedRes(null);
        } catch (err) { console.error(err); }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            {/* Header */}
            <div className="bg-slate-900 p-6 rounded-3xl text-white flex justify-between items-center shrink-0 shadow-xl shadow-slate-200">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-2xl"><CreditCard size={24} className="text-emerald-400" /></div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight">회계 및 지출 통합 관리 (Billing)</h1>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Proof Documents & Settlement Pipeline</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
                {/* Left: Resolution List */}
                <div className="flex-[3] bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
                        <h2 className="text-sm font-black flex items-center gap-2"><History size={16}/> 지출 결의 현황</h2>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <MasterDataGrid
                            data={resolutions}
                            rowKey="id"
                            onRowClick={handleSelectRes}
                            columnDefs={{
                                ResolutionTitle: { label: '결의서 제목', default: true },
                                VendorName: { label: '공급업체', default: true },
                                TotalAmount: { label: '총 합계액', default: true },
                                PaymentDate: { label: '지불희망일', default: true },
                                Status: { label: '상태', default: true }
                            }}
                            cellRenderer={{
                                ResolutionTitle: (val) => <span className="font-bold text-slate-900">{val}</span>,
                                TotalAmount: (val) => <span className="font-black text-indigo-600">₩ {val.toLocaleString()}</span>,
                                Status: (val) => {
                                    const info = RESOLUTION_STATUS[val] || { label: val, color: 'bg-slate-50' };
                                    return <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${info.color}`}>{info.label}</span>;
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Right: Evidence Viewer */}
                <div className="flex-[2] bg-white rounded-3xl border border-slate-200 shadow-lg overflow-y-auto custom-scrollbar p-6 space-y-6 text-left">
                    {selectedRes ? (
                        <>
                            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                                <div>
                                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">{selectedRes.ID}</span>
                                    <h2 className="text-lg font-black text-slate-900 mt-1">{selectedRes.ResolutionTitle}</h2>
                                </div>
                                <button onClick={() => setSelectedRes(null)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X size={20}/></button>
                            </div>

                            <section className="space-y-4">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Eye size={14}/> 통합 증빙 서류 확인</h3>
                                
                                {/* 1. 기안서 Evidence */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <p className="text-[11px] font-black text-slate-500 uppercase flex items-center gap-2"><FileText size={12}/> 원천 구매 기안서</p>
                                        <span className="text-[10px] font-bold text-indigo-600">{selectedRes.LastApprovalID || 'N/A'}</span>
                                    </div>
                                    {approvalInfo ? (
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                            <p className="text-xs font-black text-slate-800">{approvalInfo.Title}</p>
                                            <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{approvalInfo.Content}</p>
                                        </div>
                                    ) : <p className="text-xs text-slate-300 italic">연결된 기안 정보가 없습니다.</p>}
                                </div>

                                {/* 2. 견적서 Evidence */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-left">
                                    <p className="text-[11px] font-black text-slate-500 uppercase flex items-center gap-2"><Printer size={12}/> 공급사 견적서</p>
                                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
                                        <span className="text-xs font-bold text-slate-700 truncate flex-1">{selectedRes.QuotationFile || '파일 없음'}</span>
                                        <ExternalLink size={14} className="text-slate-300"/>
                                    </div>
                                </div>

                                {/* 3. 세금계산서 Evidence */}
                                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-2">
                                    <p className="text-[11px] font-black text-emerald-600 uppercase flex items-center gap-2"><DollarSign size={12}/> 세금계산서 / 영수증</p>
                                    <div className="bg-white p-3 rounded-xl border border-emerald-200 flex items-center justify-between shadow-sm">
                                        <span className="text-xs font-black text-emerald-700 truncate flex-1">{selectedRes.TaxInvoiceFile}</span>
                                        <button className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded">열기</button>
                                    </div>
                                </div>
                            </section>

                            <section className="pt-4 border-t border-slate-100 space-y-4">
                                <div className="flex justify-between items-end">
                                    <p className="text-xs font-black text-slate-400 uppercase">최종 지불 금액</p>
                                    <p className="text-2xl font-black text-slate-900 italic">₩ {selectedRes.TotalAmount?.toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2">
                                    {selectedRes.Status === 'APPROVAL_PENDING' && (
                                        <>
                                            <button onClick={() => handleAction(selectedRes.id, 'REJECTED')} className="flex-1 py-3 rounded-xl text-xs font-black bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all">지불 반려</button>
                                            <button onClick={() => handleAction(selectedRes.id, 'APPROVED')} className="flex-[2] py-3 rounded-xl text-xs font-black bg-slate-900 text-white hover:bg-black shadow-lg transition-all flex items-center justify-center gap-2"><ShieldCheck size={16}/> 지불 승인</button>
                                        </>
                                    )}
                                    {selectedRes.Status === 'APPROVED' && (
                                        <button onClick={() => handleAction(selectedRes.id, 'COMPLETED')} className="w-full py-4 rounded-xl text-sm font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl shadow-emerald-100 flex items-center justify-center gap-2"><CheckCircle2 size={18}/> 최종 지불 완료 처리 (송금완료)</button>
                                    )}
                                </div>
                            </section>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4">
                            <CreditCard size={64} strokeWidth={1} />
                            <p className="font-black uppercase tracking-[0.2em] text-xs">결의서를 선택하여 증빙을 확인하세요</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
