import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Upload, CheckCircle2, DollarSign, Info, Trash2, Plus } from 'lucide-react';

const QuotationUploadModal = ({ isOpen, onClose, poData, onSave }) => {
    const [items, setItems] = useState([]);
    const [quoteFile, setQuoteFile] = useState(null);
    const [quoteFileName, setQuoteFileOriginalName] = useState('');
    const [loading, setLoading] = useState(false);
    const [shippingFee, setShippingFee] = useState(0);

    useEffect(() => {
        if (isOpen && poData) {
            setItems(poData.Items.map(item => ({
                ...item,
                QuoteUnitPrice: item.UnitPrice || 0 // 초기값은 예상 단가
            })));
            setShippingFee(poData.ShippingFee || 0);
        }
    }, [isOpen, poData]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setQuoteFile(file);
            setQuoteFileOriginalName(file.name);
        }
    };

    const handleUpdatePrice = (id, price) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, QuoteUnitPrice: parseInt(price) || 0 } : item));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!quoteFile && !window.confirm('견적서 파일이 첨부되지 않았습니다. 금액만 등록하시겠습니까?')) return;
        
        setLoading(true);
        try {
            // 실제 환경에서는 quoteFile을 Firebase Storage에 업로드하고 URL을 받아와야 함
            // 여기서는 시뮬레이션을 위해 파일명만 저장
            const finalData = {
                ...poData,
                Items: items.map(item => ({ ...item, UnitPrice: item.QuoteUnitPrice })),
                ShippingFee: shippingFee,
                QuotationFile: quoteFileName || 'uploaded_file_placeholder',
                Status: 'QUOTED',
                QuotedAt: new Date().toISOString()
            };
            await onSave(finalData);
            onClose();
        } catch (err) { console.error(err); alert('견적 등록 실패'); } finally { setLoading(false); }
    };

    if (!isOpen) return null;

    const totalAmount = items.reduce((acc, cur) => acc + (cur.Qty * cur.QuoteUnitPrice), 0) + shippingFee;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-5xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden text-left">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-emerald-50/30 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <FileText size={28} className="text-emerald-600" />
                            공급사 견적서 등록
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Register Quotation & Confirm Prices</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-8 grid grid-cols-12 gap-8">
                        {/* Left: Prices */}
                        <div className="col-span-7 space-y-6">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <DollarSign size={18} className="text-emerald-500"/> 품목별 확정 단가 입력
                            </h3>
                            <div className="space-y-3">
                                {items.map((item, idx) => (
                                    <div key={item.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all hover:border-emerald-100">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-slate-400 mb-0.5">ITEM {idx + 1}</p>
                                            <p className="text-sm font-black text-slate-800 truncate">{item.PartName}</p>
                                            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">[{item.PartID}]</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-slate-400 uppercase">수량</p>
                                                <p className="text-xs font-black text-slate-700">{item.Qty.toLocaleString()} EA</p>
                                            </div>
                                            <div className="w-40">
                                                <label className="text-[9px] font-black text-emerald-600 uppercase mb-1 block">확정 단가 (₩)</label>
                                                <input 
                                                    type="number" 
                                                    value={item.QuoteUnitPrice} 
                                                    onChange={e => handleUpdatePrice(item.id, e.target.value)}
                                                    className="w-full bg-slate-50 border border-emerald-100 rounded-xl px-3 py-2 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: File & Summary */}
                        <div className="col-span-5 space-y-6">
                            <section className="bg-slate-50 rounded-[24px] p-6 border border-slate-200 space-y-5">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Upload size={14}/> 견적서 파일 첨부
                                </h3>
                                <div className="space-y-4">
                                    <div className={`relative border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center ${quoteFile ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300 hover:border-indigo-400 bg-white'}`}>
                                        <input 
                                            type="file" 
                                            onChange={handleFileChange}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            accept=".pdf,image/*,.xls,.xlsx"
                                        />
                                        {quoteFile ? (
                                            <>
                                                <CheckCircle2 size={32} className="text-emerald-500 mb-2"/>
                                                <p className="text-xs font-black text-emerald-700 truncate max-w-full px-4">{quoteFileName}</p>
                                                <p className="text-[10px] font-bold text-emerald-500 mt-1">파일이 선택되었습니다. 클릭하여 변경</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={32} className="text-slate-300 mb-2"/>
                                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">견적서 파일을 드래그하거나 클릭</p>
                                                <p className="text-[10px] font-bold text-slate-400 mt-1">PDF, Image, Excel 가능</p>
                                            </>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">배송비 (Shipping Fee)</label>
                                        <input 
                                            type="number" 
                                            value={shippingFee} 
                                            onChange={e => setShippingFee(parseInt(e.target.value) || 0)}
                                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="bg-slate-900 rounded-[24px] p-8 text-white space-y-6 shadow-xl shadow-slate-200">
                                <div className="flex justify-between items-end">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">최종 합계 금액</p>
                                    <p className="text-xs font-bold text-slate-500">(VAT 별도)</p>
                                </div>
                                <div>
                                    <p className="text-4xl font-black tracking-tighter italic">₩ {totalAmount.toLocaleString()}</p>
                                </div>
                                <div className="pt-4 border-t border-slate-800 space-y-2">
                                    <div className="flex justify-between text-[11px] font-bold text-slate-400">
                                        <span>공급가액</span>
                                        <span>₩ {(totalAmount - shippingFee).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] font-bold text-slate-400">
                                        <span>배송비</span>
                                        <span>₩ {shippingFee.toLocaleString()}</span>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </form>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={loading} 
                        className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-100 flex items-center gap-3 transition-all disabled:opacity-50"
                    >
                        {loading ? '처리 중...' : '견적 등록 및 금액 확정'}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default QuotationUploadModal;
