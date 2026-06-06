import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, User, Briefcase, FileText, Send, Info } from 'lucide-react';
import { collection, query, getDocs, orderBy } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function RequestQuotationModal({ isOpen, onClose }) {
    const { userProfile } = useAuth();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        VendorID: '',
        VendorName: '',
        VendorEmail: '',
        Subject: '',
        Content: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchVendors();
            setFormData(prev => ({
                ...prev,
                Subject: `[견적 요청] 품목 견적 의뢰의 건 - ${userProfile?.displayName || userProfile?.Name || 'IR Assistant'}`,
                Content: `
안녕하십니까, (주)IR Assistant 입니다.

아래 품목에 대한 견적을 요청드리오니, 검토 후 회신 부탁드립니다.

--------------------------------------------------
[견적 요청 상세]
- 요청 품목: 
- 요청 수량: 
- 희망 납기: 
- 기타 문의: 
--------------------------------------------------

감사합니다.
(주)IR Assistant
${userProfile?.displayName || userProfile?.Name || ''} 드림
                `.trim()
            }));
        }
    }, [isOpen, userProfile]);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const vSnap = await getDocs(query(collection(db, 'vendors'), orderBy('Name', 'asc')));
            setVendors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Failed to fetch vendors:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleVendorChange = (e) => {
        const vendorId = e.target.value;
        const vendor = vendors.find(v => v.id === vendorId);
        if (vendor) {
            setFormData(prev => ({
                ...prev,
                VendorID: vendor.id,
                VendorName: vendor.Name,
                VendorEmail: vendor.Email || ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                VendorID: '',
                VendorName: '',
                VendorEmail: ''
            }));
        }
    };

    const handleSendEmail = (e) => {
        e.preventDefault();
        if (!formData.VendorEmail) {
            alert('공급사의 이메일 주소가 등록되어 있지 않습니다. 공급사 관리에서 이메일을 먼저 등록해주세요.');
            return;
        }

        const subject = encodeURIComponent(formData.Subject);
        const body = encodeURIComponent(formData.Content);
        
        // mailto link construction
        window.location.href = `mailto:${formData.VendorEmail}?subject=${subject}&body=${body}`;
        onClose();
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <FileText size={20} className="text-indigo-600" />
                            견적 요청서 (Request for Quotation) 작성
                        </h2>
                        <p className="text-xs text-slate-500 font-bold mt-1">공급사에 품목 견적을 이메일로 요청합니다.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 shadow-sm border border-slate-200"><X size={16} /></button>
                </div>
                
                <form onSubmit={handleSendEmail} className="p-5 flex-1 overflow-y-auto space-y-5">
                    {/* 공급사 선택 */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">공급업체 선택 <span className="text-rose-500">*</span></label>
                        <div className="relative">
                            <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <select 
                                value={formData.VendorID} 
                                onChange={handleVendorChange} 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" 
                                required
                            >
                                <option value="">공급사를 선택하세요</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.Name} ({v.Email || '이메일 없음'})</option>
                                ))}
                            </select>
                        </div>
                        {formData.VendorID && !formData.VendorEmail && (
                            <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1 mt-1">
                                <Info size={10} /> 선택한 공급사의 이메일 정보가 없습니다.
                            </p>
                        )}
                    </div>

                    {/* 이메일 제목 */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">이메일 제목</label>
                        <input 
                            type="text" 
                            value={formData.Subject} 
                            onChange={e => setFormData(prev => ({ ...prev, Subject: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="이메일 제목을 입력하세요"
                            required
                        />
                    </div>

                    {/* 이메일 본문 */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">이메일 내용</label>
                        <textarea 
                            value={formData.Content} 
                            onChange={e => setFormData(prev => ({ ...prev, Content: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 min-h-[300px] resize-none leading-relaxed"
                            placeholder="공급사에 보낼 상세 내용을 작성하세요."
                            required
                        />
                    </div>

                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                        <p className="text-[11px] text-amber-700 font-bold leading-relaxed flex gap-2">
                            <Info size={14} className="shrink-0" />
                            보내기 버튼을 누르면 사용자의 기본 메일 앱(Outlook, Gmail 등)이 실행됩니다. 
                            메일 앱에서 최종 확인 후 발송 버튼을 눌러주세요.
                        </p>
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200">취소</button>
                        <button 
                            type="submit" 
                            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center gap-2 transition-all hover:scale-105"
                        >
                            <Send size={14} /> 메일 앱으로 전송
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
