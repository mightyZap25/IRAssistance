import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Upload, CheckCircle2, DollarSign, Info, ShieldCheck, Printer, CreditCard } from 'lucide-react';
import { db, doc, updateDoc, serverTimestamp, setDoc } from '../firebase';

const ExpenseResolutionModal = ({ isOpen, onClose, poData, onSubmit }) => {
    const [taxInvoiceFile, setTaxInvoiceFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER'); // BANK_TRANSFER, CORPORATE_CARD
    const [resolutionData, setResolutionData] = useState({
        ResolutionTitle: '',
        Content: '',
        PaymentDate: new Date().toISOString().split('T')[0],
        IsElectronic: true // 전자결재 여부
    });

    useEffect(() => {
        if (isOpen && poData) {
            setResolutionData(prev => ({
                ...prev,
                ResolutionTitle: `[지출결의] ${poData.VendorName} 정산`,
                Content: `구매 기안(ID: ${poData.LastApprovalID || 'N/A'}) 의거, 물품 입고 완료에 따른 대금 지불 요청.`
            }));
        }
    }, [isOpen, poData]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setTaxInvoiceFile(file);
            setFileName(file.name);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!taxInvoiceFile) return alert('세금계산서(또는 영수증) 첨부는 필수입니다.');
        
        setLoading(true);
        try {
            const resolutionID = `EXP-${Date.now()}`;
            const totalAmount = poData.TotalPrice || 0;
            const vat = Math.floor(totalAmount * 0.1);

            const payload = {
                ...resolutionData,
                ID: resolutionID,
                DocType: 'EXPENSE_RESOLUTION',
                RefPOID: poData.id,
                PONumber: poData.PONumber,
                VendorID: poData.VendorID,
                VendorName: poData.VendorName,
                Amount: totalAmount,
                VAT: vat,
                TotalAmount: totalAmount + vat,
                TaxInvoiceFile: fileName,
                PaymentMethod: paymentMethod,
                Status: resolutionData.IsElectronic ? 'APPROVAL_PENDING' : 'COMPLETED',
                LastApprovalID: poData.LastApprovalID, // 기안서 참조
                QuotationFile: poData.QuotationFile, // 견적서 참조
                CreatedAt: serverTimestamp(),
                CreatedBy: 'USER_ID_PLACEHOLDER' // 실제 세션 ID 사용
            };

            await setDoc(doc(db, 'expense_resolutions', resolutionID), payload);
            
            // PO 상태 업데이트
            await updateDoc(doc(db, 'purchasing', poData.id), {
                Status: 'RESOLUTION_SUBMITTED',
                LastResolutionID: resolutionID
            });

            alert('지출결의서가 작성되었습니다.');
            onSubmit(payload);
            onClose();
        } catch (err) { console.error(err); alert('지출결의 저장 중 오류 발생'); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10005] flex items-center justify-center p-4 text-left">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <CreditCard size={20} className="text-indigo-600" />
                        <h2 className="text-lg font-black text-slate-800 tracking-tight">지출결의서 작성</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
                </div>

                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Amount Summary - Professional & Compact */}
                    <div className="bg-slate-900 rounded-xl p-5 text-white flex justify-between items-center shadow-lg">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">최종 집행 예산 (VAT 포함)</p>
                            <p className="text-2xl font-black italic">₩ {Math.floor((poData.TotalPrice || 0) * 1.1).toLocaleString()}</p>
                        </div>
                        <div className="text-right border-l border-slate-700 pl-6 space-y-1">
                            <div className="flex justify-between gap-4 text-[11px] font-bold text-slate-400"><span>공급가</span><span>₩ {(poData.TotalPrice || 0).toLocaleString()}</span></div>
                            <div className="flex justify-between gap-4 text-[11px] font-bold text-slate-400"><span>부가세</span><span>₩ {Math.floor((poData.TotalPrice || 0) * 0.1).toLocaleString()}</span></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-1 block">결의 제목</label>
                                <input type="text" value={resolutionData.ResolutionTitle} onChange={e => setResolutionData({...resolutionData, ResolutionTitle: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500" required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-1 block">지불 희망일</label>
                                    <input type="date" value={resolutionData.PaymentDate} onChange={e => setResolutionData({...resolutionData, PaymentDate: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none" required />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-1 block">지불 수단</label>
                                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none">
                                        <option value="BANK_TRANSFER">계좌 이체</option>
                                        <option value="CORPORATE_CARD">법인 카드</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* File Upload */}
                        <div>
                            <label className="text-[11px] font-bold text-rose-500 mb-1 block flex items-center gap-1.5">
                                <FileText size={12}/> 증빙 서류 (계산서/영수증)
                            </label>
                            <div className={`relative border-2 border-dashed rounded-xl h-[104px] transition-all flex flex-col items-center justify-center text-center ${taxInvoiceFile ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200 bg-slate-50'}`}>
                                <input type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf,image/*" />
                                {taxInvoiceFile ? (
                                    <>
                                        <CheckCircle2 size={24} className="text-emerald-500 mb-1"/>
                                        <p className="text-[10px] font-black text-emerald-700 truncate w-full px-4">{fileName}</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={24} className="text-slate-300 mb-1"/>
                                        <p className="text-[10px] font-bold text-slate-400">파일 업로드</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div>
                        <label className="text-[11px] font-bold text-slate-400 mb-1 block">상세 결의 내용</label>
                        <textarea value={resolutionData.Content} onChange={e => setResolutionData({...resolutionData, Content: e.target.value})} className="w-full h-20 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 resize-none" />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-4">
                            <span className="text-[11px] font-bold text-slate-400">결재 방식</span>
                            <div className="flex gap-1">
                                <button type="button" onClick={() => setResolutionData({...resolutionData, IsElectronic: true})} className={`px-4 py-1.5 rounded-md text-[11px] font-black transition-all ${resolutionData.IsElectronic ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500'}`}>전자결재</button>
                                <button type="button" onClick={() => setResolutionData({...resolutionData, IsElectronic: false})} className={`px-4 py-1.5 rounded-md text-[11px] font-black transition-all ${!resolutionData.IsElectronic ? 'bg-amber-500 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500'}`}>수동완료</button>
                            </div>
                        </div>
                    </div>
                </form>

                <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 shrink-0 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 transition-all">닫기</button>
                    <button onClick={handleFormSubmit} disabled={loading} className="px-6 py-2 rounded-lg text-sm font-black text-white bg-slate-900 hover:bg-black shadow-xl flex items-center gap-2 transition-all disabled:opacity-50">
                        {loading ? '처리 중...' : '결의서 상신'}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default ExpenseResolutionModal;
