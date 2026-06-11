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
                ResolutionTitle: `[지출결의] ${poData.VendorName} - ${poData.PONumber} 정산의 건`,
                Content: `기 승인된 구매 기안(ID: ${poData.LastApprovalID || 'N/A'})에 의거하여, 물품 입고 및 QA 검사가 완료되었으므로 대금 지불을 요청합니다.`
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

            alert('지출결의서가 작성되었습니다. 경리 파트로 전송되었습니다.');
            onSubmit(payload);
            onClose();
        } catch (err) { console.error(err); alert('지출결의 저장 중 오류 발생'); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10005] flex items-center justify-center p-4 text-left">
            <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-indigo-50/30 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <CreditCard size={28} className="text-indigo-600" />
                            지출결의서 작성
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest text-left">Expense Resolution & Payment Request</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-8 grid grid-cols-12 gap-8 text-left">
                        {/* Left Side: Basic Info */}
                        <div className="col-span-7 space-y-6 text-left">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">결의서 제목</label>
                                    <input type="text" value={resolutionData.ResolutionTitle} onChange={e => setResolutionData({...resolutionData, ResolutionTitle: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500" required />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">지불 희망일</label>
                                        <input type="date" value={resolutionData.PaymentDate} onChange={e => setResolutionData({...resolutionData, PaymentDate: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500" required />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">지불 수단</label>
                                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-black outline-none">
                                            <option value="BANK_TRANSFER">계좌 이체</option>
                                            <option value="CORPORATE_CARD">법인 카드</option>
                                            <option value="CASH">현금 지불</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 ml-1 block">상세 결의 내용</label>
                                    <textarea value={resolutionData.Content} onChange={e => setResolutionData({...resolutionData, Content: e.target.value})} className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                                </div>
                            </div>

                            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-3">
                                <Info size={18} className="text-amber-500 shrink-0"/>
                                <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                                    이 지출결의서는 사내 경리 시스템에 자동 등록되며, 관련 기안서와 견적서가 함께 전달되어 최종 검토됩니다.
                                </p>
                            </div>
                        </div>

                        {/* Right Side: Files & Amount */}
                        <div className="col-span-5 space-y-6">
                            <section className="bg-slate-900 rounded-[24px] p-8 text-white space-y-4 shadow-xl">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">최종 정산 금액 (VAT 포함)</p>
                                <p className="text-4xl font-black italic tracking-tighter">₩ {Math.floor((poData.TotalPrice || 0) * 1.1).toLocaleString()}</p>
                                <div className="pt-4 border-t border-slate-800 space-y-2">
                                    <div className="flex justify-between text-[11px] font-bold text-slate-400"><span>공급가액</span><span>₩ {(poData.TotalPrice || 0).toLocaleString()}</span></div>
                                    <div className="flex justify-between text-[11px] font-bold text-slate-400"><span>부가세 (10%)</span><span>₩ {Math.floor((poData.TotalPrice || 0) * 0.1).toLocaleString()}</span></div>
                                </div>
                            </section>

                            <section className="space-y-3">
                                <label className="text-[10px] font-black text-rose-500 uppercase mb-1.5 ml-1 block flex items-center gap-2">
                                    <FileText size={12}/> 세금계산서 / 영수증 첨부 (필수)
                                </label>
                                <div className={`relative border-2 border-dashed rounded-[24px] p-8 transition-all flex flex-col items-center justify-center text-center ${taxInvoiceFile ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300 bg-slate-50'}`}>
                                    <input type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf,image/*" />
                                    {taxInvoiceFile ? (
                                        <>
                                            <CheckCircle2 size={32} className="text-emerald-500 mb-2"/>
                                            <p className="text-xs font-black text-emerald-700 truncate w-full px-4">{fileName}</p>
                                            <p className="text-[9px] font-bold text-emerald-500 mt-1">파일이 정상적으로 첨부되었습니다.</p>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={32} className="text-slate-300 mb-2"/>
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">파일 업로드</p>
                                        </>
                                    )}
                                </div>
                            </section>

                            <div className="bg-slate-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase">
                                    <span>승인 방식 선택</span>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setResolutionData({...resolutionData, IsElectronic: true})} className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${resolutionData.IsElectronic ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>전자결재</button>
                                    <button type="button" onClick={() => setResolutionData({...resolutionData, IsElectronic: false})} className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${!resolutionData.IsElectronic ? 'bg-amber-500 text-white' : 'bg-white text-slate-500'}`}>수동완료</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                    <button onClick={handleFormSubmit} disabled={loading} className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-slate-900 hover:bg-black shadow-xl flex items-center gap-3 transition-all disabled:opacity-50">
                        {loading ? '처리 중...' : '지출결의서 최종 상신'}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default ExpenseResolutionModal;
