import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, UserCheck, ShieldCheck, Clock, AlertCircle, Info, Send } from 'lucide-react';
import { db, collection, getDocs, query, where } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const ApprovalModal = ({ isOpen, onClose, poData, onSubmit }) => {
    const { userProfile } = useAuth();
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
            const isOutsourcing = !!poData.TargetPartName;
            setFormData(prev => ({
                ...prev,
                Title: `[${isOutsourcing ? '외주기안' : '지출기안'}] ${poData.VendorName} - ${poData.PartName || poData.TargetPartName} ${isOutsourcing ? '가공' : '구매'}`,
                Content: `${poData.VendorName} 견적 기반 ${isOutsourcing ? '외주 가공' : '구매'} 승인 요청 건.`,
                Department: userProfile?.dept || '구매팀'
            }));
            fetchApprovers();
        }
    }, [isOpen, poData, userProfile]);

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
        
        const isOutsourcing = !!poData.TargetPartName;
        const items = poData.Items || [];
        const totalAmount = items.length > 0 ? items.reduce((acc, cur) => acc + (cur.Qty * cur.UnitPrice), 0) + (poData.ShippingFee || 0)
                          : ((poData.Qty || poData.TargetQty || 0) * (poData.UnitPrice || 0)) + (poData.ShippingFee || 0);
        const vat = draftData.VATIncluded ? Math.floor(totalAmount * 0.1) : 0;

        const approvalPayload = {
            ...draftData,
            DocType: isOutsourcing ? 'OUTSOURCING_REQUEST' : 'PURCHASE_REQUEST',
            RefID: poData.id,
            RefNumber: poData.PONumber || poData.OrderNumber,
            VendorID: poData.VendorID,
            VendorName: poData.VendorName,
            TotalAmount: totalAmount,
            VAT: vat,
            ShippingFee: poData.ShippingFee || 0,
            FinalAmount: totalAmount + vat,
            Items: items,
            QuotationFile: poData.QuotationFile || '',
            RequesterID: userProfile?.uid,
            RequesterName: userProfile?.displayName,
            ApproverID: selectedApprover,
            ApproverName: approvers.find(a => a.id === selectedApprover)?.displayName || '',
            Status: 'PENDING',
            RequestedAt: new Date().toISOString()
        };

        onSubmit(approvalPayload);
    };

    if (!isOpen || !poData) return null;

    const items = poData.Items || [];
    const totalBase = items.length > 0 ? items.reduce((acc, cur) => acc + (cur.Qty * cur.UnitPrice), 0) + (poData.ShippingFee || 0)
                    : ((poData.Qty || poData.TargetQty || 0) * (poData.UnitPrice || 0)) + (poData.ShippingFee || 0);

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10002] flex items-center justify-center p-4 sm:p-6">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl flex flex-col max-h-full sm:max-h-[calc(100vh-3rem)] overflow-hidden text-left border border-slate-200">
                {/* Compact Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-amber-600" />
                        <h2 className="text-lg font-black text-slate-800 tracking-tight">결재 기안서 작성</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
                </div>

                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
                    {/* Basic Info Section - Compact Grid */}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm border-b border-slate-100 pb-6">
                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-1 block">기안 제목</label>
                                <input type="text" value={draftData.Title} onChange={e => setFormData({...draftData, Title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold outline-none focus:border-amber-500" required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-1 block">부서</label>
                                    <input type="text" value={draftData.Department} readOnly className="w-full bg-slate-100 border border-slate-100 rounded-lg px-3 py-2 font-bold text-slate-500" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-1 block">보존 연한</label>
                                    <select value={draftData.PreservationPeriod} onChange={e => setFormData({...draftData, PreservationPeriod: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold outline-none">
                                        <option>1년</option><option>3년</option><option>5년</option><option>10년</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-amber-600 mb-1 block">결재권자 지정</label>
                                <select value={selectedApprover} onChange={e => setSelectedApprover(e.target.value)} className="w-full bg-amber-50/30 border border-amber-200 rounded-lg px-3 py-2 font-bold outline-none focus:border-amber-500" required>
                                    <option value="">결재자 선택...</option>
                                    {approvers.map(a => <option key={a.id} value={a.id}>{a.displayName} ({a.role})</option>)}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <Info size={14} className="text-slate-400"/>
                                <p className="text-[11px] font-bold text-slate-500 leading-tight">승인 완료 시 자동으로 발주 시스템과 연동됩니다.</p>
                            </div>
                        </div>
                    </div>

                    {/* Compact Table */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-end">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">상세 내역</label>
                            <span className="text-[11px] font-black text-slate-600">{poData.VendorName}</span>
                        </div>
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-[12px]">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr className="text-slate-500 font-bold">
                                        <th className="px-4 py-2 text-left">품목 정보</th>
                                        <th className="px-4 py-2 text-center w-20">수량</th>
                                        <th className="px-4 py-2 text-right w-28">단가</th>
                                        <th className="px-4 py-2 text-right w-28">금액</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 font-bold text-slate-700">
                                    {items.length > 0 ? items.map(item => (
                                        <tr key={item.id}>
                                            <td className="px-4 py-2">{item.PartName} <span className="text-[10px] text-slate-400 ml-1">({item.PartID})</span></td>
                                            <td className="px-4 py-2 text-center">{item.Qty.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right">₩ {item.UnitPrice.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right">₩ {(item.Qty * item.UnitPrice).toLocaleString()}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td className="px-4 py-2">{poData.PartName || poData.TargetPartName}</td>
                                            <td className="px-4 py-2 text-center">{poData.Qty || poData.TargetQty || 0}</td>
                                            <td className="px-4 py-2 text-right">₩ {poData.UnitPrice?.toLocaleString() || 0}</td>
                                            <td className="px-4 py-2 text-right">₩ {( (poData.Qty || poData.TargetQty || 0) * (poData.UnitPrice || 0) ).toLocaleString()}</td>
                                        </tr>
                                    )}
                                    {poData.ShippingFee > 0 && (
                                        <tr className="text-slate-400">
                                            <td colSpan="3" className="px-4 py-1 text-right text-[11px]">배송비</td>
                                            <td className="px-4 py-1 text-right font-bold">₩ {poData.ShippingFee.toLocaleString()}</td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t border-slate-100">
                                    <tr className="font-black text-slate-900">
                                        <td colSpan="3" className="px-4 py-3 text-right text-[11px]">합계 (VAT {draftData.VATIncluded ? '포함' : '별도'})</td>
                                        <td className="px-4 py-3 text-right text-base text-amber-600">
                                            ₩ {(totalBase + (draftData.VATIncluded ? totalBase * 0.1 : 0)).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-slate-400">기안 사유</label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={draftData.VATIncluded} onChange={e => setFormData({...draftData, VATIncluded: e.target.checked})} className="w-3.5 h-3.5 rounded text-amber-500 border-slate-300" />
                                <span className="text-[11px] font-bold text-slate-500">부가세(10%) 포함</span>
                            </label>
                        </div>
                        <textarea 
                            value={draftData.Content} 
                            onChange={e => setFormData({...draftData, Content: e.target.value})}
                            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-500 resize-none"
                        />
                    </div>

                    {/* Attachment Info */}
                    <div className="flex items-center justify-between p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-emerald-600"/>
                            <span className="text-[11px] font-bold text-emerald-800">공급사 견적서 : {poData.QuotationFile}</span>
                        </div>
                        <span className="text-[10px] font-black text-emerald-600 cursor-pointer hover:underline">열기</span>
                    </div>
                </form>

                <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all">닫기</button>
                    <button 
                        onClick={handleFormSubmit}
                        className="px-6 py-2 rounded-lg text-sm font-black text-white bg-slate-800 hover:bg-slate-900 shadow-md flex items-center gap-2 transition-all"
                    >
                        <Send size={16}/> 기안 상신
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default ApprovalModal;
