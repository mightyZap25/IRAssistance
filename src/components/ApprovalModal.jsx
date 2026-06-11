import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, UserCheck, ShieldCheck, Clock, AlertCircle, Info, Send } from 'lucide-react';
import { db, collection, getDocs, query, where } from '../firebase';

const ApprovalModal = ({ isOpen, onClose, poData, onSubmit }) => {
    const [approvers, setApprovers] = useState([]);
    const [selectedApprover, setSelectedApprover] = useState('');
    const [draftData, setFormData] = useState({
        Title: '',
        Department: '구매팀',
        PreservationPeriod: '10년',
        Content: '',
        VATIncluded: true
    });

    useEffect(() => {
        if (isOpen && poData) {
            setFormData(prev => ({
                ...prev,
                Title: `[지출기안] ${poData.VendorName} - ${poData.PartName} 구매의 건`,
                Content: `${poData.VendorName}으로부터 수취한 견적을 바탕으로 위 품목에 대한 구매 승인을 요청합니다.`
            }));
            fetchApprovers();
        }
    }, [isOpen, poData]);

    const fetchApprovers = async () => {
        try {
            const q = query(collection(db, 'users'), where('role', 'in', ['MANAGER', 'ADMIN']));
            const snap = await getDocs(q);
            setApprovers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!selectedApprover) return alert('결재자를 선택해주세요.');
        
        const totalAmount = poData.Items.reduce((acc, cur) => acc + (cur.Qty * cur.UnitPrice), 0) + (poData.ShippingFee || 0);
        const vat = draftData.VATIncluded ? Math.floor(totalAmount * 0.1) : 0;

        const approvalPayload = {
            ...draftData,
            DocType: 'PURCHASE_REQUEST',
            RefID: poData.id,
            PONumber: poData.PONumber,
            VendorID: poData.VendorID,
            VendorName: poData.VendorName,
            TotalAmount: totalAmount,
            VAT: vat,
            ShippingFee: poData.ShippingFee || 0,
            FinalAmount: totalAmount + vat,
            Items: poData.Items,
            QuotationFile: poData.QuotationFile,
            ApproverID: selectedApprover,
            ApproverName: approvers.find(a => a.id === selectedApprover)?.displayName || '',
            Status: 'PENDING',
            RequestedAt: new Date().toISOString()
        };

        onSubmit(approvalPayload);
    };

    if (!isOpen) return null;

    const totalBase = poData.Items.reduce((acc, cur) => acc + (cur.Qty * cur.UnitPrice), 0) + (poData.ShippingFee || 0);

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10002] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] overflow-hidden text-left">
                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-amber-50/30 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <FileText size={28} className="text-amber-500" />
                            지출 결재 기안서 작성
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Internal Approval Request</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-8 space-y-8">
                        {/* 기본 정보 그리드 */}
                        <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">기안 제목</label>
                                    <input type="text" value={draftData.Title} onChange={e => setFormData({...draftData, Title: e.target.value})} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-amber-500" required />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">기안 부서</label>
                                        <input type="text" value={draftData.Department} readOnly className="w-full bg-slate-100 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-black text-slate-500" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">보존 연한</label>
                                        <select value={draftData.PreservationPeriod} onChange={e => setFormData({...draftData, PreservationPeriod: e.target.value})} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-black outline-none">
                                            <option>1년</option><option>3년</option><option>5년</option><option>10년</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-amber-600 uppercase mb-1.5 ml-1 block">최종 결재자 선택</label>
                                    <select 
                                        value={selectedApprover} 
                                        onChange={e => setSelectedApprover(e.target.value)}
                                        className="w-full bg-white border-2 border-amber-200 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                                        required
                                    >
                                        <option value="">결재자 선택...</option>
                                        {approvers.map(a => <option key={a.id} value={a.id}>{a.displayName} ({a.role})</option>)}
                                    </select>
                                </div>
                                <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100">
                                    <p className="text-[10px] font-bold text-amber-700 leading-relaxed flex gap-2">
                                        <ShieldCheck size={14} className="shrink-0"/>
                                        결재 승인 시 해당 업체로 발주 요청 메일을 보낼 수 있는 권한이 부여됩니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 물품 및 금액 요약 */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">구매 물품 및 소요 예산</h3>
                            <div className="border-2 border-slate-100 rounded-[24px] overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr className="text-[10px] font-black text-slate-500 uppercase">
                                            <th className="px-6 py-3 text-left">품목명</th>
                                            <th className="px-6 py-3 text-center">수량</th>
                                            <th className="px-6 py-3 text-right">단가</th>
                                            <th className="px-6 py-3 text-right">금액</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {poData.Items.map(item => (
                                            <tr key={item.id} className="font-bold text-slate-700">
                                                <td className="px-6 py-4">{item.PartName} <span className="text-[10px] text-slate-300 ml-1">[{item.PartID}]</span></td>
                                                <td className="px-6 py-4 text-center">{item.Qty.toLocaleString()} EA</td>
                                                <td className="px-6 py-4 text-right">₩ {item.UnitPrice.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-right">₩ {(item.Qty * item.UnitPrice).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        {poData.ShippingFee > 0 && (
                                            <tr className="bg-slate-50/30 text-slate-500 font-bold">
                                                <td colSpan="3" className="px-6 py-3 text-right text-[11px]">배송비</td>
                                                <td className="px-6 py-3 text-right">₩ {poData.ShippingFee.toLocaleString()}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="bg-slate-900 text-white font-black">
                                        <tr>
                                            <td colSpan="3" className="px-6 py-5 text-right uppercase tracking-widest text-[11px]">총 합계 (VAT {draftData.VATIncluded ? '10%' : '별도'})</td>
                                            <td className="px-6 py-5 text-right text-xl italic">
                                                ₩ {(totalBase + (draftData.VATIncluded ? totalBase * 0.1 : 0)).toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* 기안 내용 */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">기안 사유 및 상세 내용</label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={draftData.VATIncluded} onChange={e => setFormData({...draftData, VATIncluded: e.target.checked})} className="w-4 h-4 rounded text-amber-500" />
                                    <span className="text-[10px] font-black text-slate-500">부가세(10%) 포함하여 기안</span>
                                </label>
                            </div>
                            <textarea 
                                value={draftData.Content} 
                                onChange={e => setFormData({...draftData, Content: e.target.value})}
                                className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                            />
                        </div>

                        {/* 견적서 링크 표시 */}
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-700">
                            <Clock size={20}/>
                            <div className="flex-1">
                                <p className="text-xs font-black">공급사 견적서 첨부됨</p>
                                <p className="text-[10px] font-bold opacity-80">{poData.QuotationFile}</p>
                            </div>
                            <div className="px-3 py-1 bg-white rounded-lg text-[10px] font-black shadow-sm">VIEW</div>
                        </div>
                    </div>
                </form>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취onClose</button>
                    <button 
                        onClick={handleFormSubmit}
                        className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-amber-500 hover:bg-amber-600 shadow-xl shadow-amber-100 flex items-center gap-3 transition-all"
                    >
                        <Send size={18}/> 기안서 제출 및 결재 요청
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default ApprovalModal;
