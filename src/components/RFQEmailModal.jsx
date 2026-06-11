import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Mail, Edit3, ClipboardCheck, Info } from 'lucide-react';

const RFQEmailModal = ({ isOpen, onClose, poData, onSend }) => {
    const [emailContent, setEmailContent] = useState('');
    const [subject, setSubject] = useState('');

    useEffect(() => {
        if (isOpen && poData) {
            const dateStr = new Date().toLocaleDateString();
            const vendorName = poData.VendorName || '공급사';
            const poType = poData.Type === 'OUTSOURCING' ? '외주 가공' : '자재 구매';
            
            setSubject(`[견적요청] ${poType} 건에 대한 견적 요청의 건 (${vendorName} / IR_Assistant)`);
            
            // 이메일 본문 HTML 템플릿 생성
            const itemRows = poData.Items.map((item, idx) => `
                <tr>
                    <td style="border: 1px solid #e2e8f0; padding: 12px; text-align: center;">${idx + 1}</td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px;">${item.PartName} (${item.PartID})</td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px; text-align: center;">${item.Qty.toLocaleString()}</td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px; text-align: center;">${item.Unit || 'EA'}</td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px;">${item.Spec || '-'}</td>
                </tr>
            `).join('');

            const body = `
                <div style="font-family: 'Malgun Gothic', sans-serif; line-height: 1.6; color: #1e293b;">
                    <p>안녕하세요, <strong>${vendorName}</strong> 담당자님.</p>
                    <p>IR_Assistant 구매팀입니다.</p>
                    <p>아래 품목에 대하여 견적 요청드리오니, 검토 후 회신 부탁드립니다.</p>
                    
                    <div style="margin: 25px 0; background-color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #f1f5f9;">
                        <h3 style="margin-top: 0; color: #4f46e5; font-size: 16px;">[견적 요청 내역]</h3>
                        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff; font-size: 13px;">
                            <thead>
                                <tr style="background-color: #f1f5f9; color: #475569;">
                                    <th style="border: 1px solid #e2e8f0; padding: 12px;">No</th>
                                    <th style="border: 1px solid #e2e8f0; padding: 12px;">품목명 (Part ID)</th>
                                    <th style="border: 1px solid #e2e8f0; padding: 12px;">수량</th>
                                    <th style="border: 1px solid #e2e8f0; padding: 12px;">단위</th>
                                    <th style="border: 1px solid #e2e8f0; padding: 12px;">비고/규격</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemRows}
                            </tbody>
                        </table>
                        <p style="margin-bottom: 0; font-size: 12px; color: #64748b; margin-top: 15px;">* 희망 납기일: <strong>${poData.DueDate || '별도 협의'}</strong></p>
                    </div>

                    <p>견적서 회신 시 <strong>단가, 납기일, 부가세 포함 여부</strong>를 명시해 주시기 바랍니다.</p>
                    <p>감사합니다.</p>
                    <br/>
                    <p><strong>IR_Assistant 구매 담당자 드림</strong></p>
                </div>
            `;
            // Simple string version for textarea (strip some HTML or use as is)
            setEmailContent(body.replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n').trim());
        }
    }, [isOpen, poData]);

    const handleSend = () => {
        if (!window.confirm('공급사로 견적 요청 이메일을 발송하시겠습니까?')) return;
        onSend({ subject, content: emailContent });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <Mail size={28} className="text-indigo-600" />
                            견적 요청 이메일 발송
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Email Draft for RFQ</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                        <Info size={20} className="text-amber-500 shrink-0"/>
                        <p className="text-xs font-bold text-amber-700 leading-relaxed">
                            발송 전 내용을 자유롭게 수정할 수 있습니다. <br/>
                            현재는 시스템 연동 테스트 단계로, 실제 메일 발송 대신 전송 기록이 시스템에 저장됩니다.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">이메일 제목</label>
                            <input 
                                type="text" 
                                value={subject} 
                                onChange={e => setSubject(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">이메일 본문 (텍스트)</label>
                            <textarea 
                                value={emailContent} 
                                onChange={e => setEmailContent(e.target.value)}
                                className="w-full h-80 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar resize-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                    <button 
                        onClick={handleSend}
                        className="px-10 py-4 rounded-2xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center gap-3 transition-all"
                    >
                        <Send size={18}/> 견적 요청 메일 전송
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default RFQEmailModal;
