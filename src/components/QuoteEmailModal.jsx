import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Send, Mail, Check, Plus, FileDown, Building2, User,
    ChevronDown, AlertCircle, Sparkles
} from 'lucide-react';
import { db, collection, getDocs, query, where } from '../firebase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * QuoteEmailModal
 * - isOpen: boolean
 * - onClose: () => void
 * - quoteData: 견적서 데이터 객체
 * - onSend: ({ subject, content, recipients }) => void  (상태 SENT 처리 포함)
 */
const QuoteEmailModal = ({ isOpen, onClose, quoteData, onSend }) => {
    const [subject, setSubject] = useState('');
    const [emailContent, setEmailContent] = useState('');
    const [customerContacts, setCustomerContacts] = useState([]);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [customEmail, setCustomEmail] = useState('');
    const [customName, setCustomName] = useState('');
    const [sending, setSending] = useState(false);

    // ── 고객사 연락처 로드 ──────────────────────────────────────
    useEffect(() => {
        if (!isOpen || !quoteData?.CustomerID) return;

        const fetchContacts = async () => {
            try {
                // 1) customers 컬렉션 doc ID로 조회
                const snap = await getDocs(
                    query(collection(db, 'customers'), where('__name__', '==', quoteData.CustomerID))
                );

                let list = [];
                if (!snap.empty) {
                    const data = snap.docs[0].data();

                    if (data.Contacts && data.Contacts.length > 0) {
                        list = data.Contacts
                            .filter(c => c.email || c.Email)
                            .map(c => ({
                                name: c.name || c.Name || data.ContactPerson || '담당자',
                                email: c.email || c.Email,
                                title: c.title || c.Title || '담당자',
                            }));
                    } else if (data.Email || data.email) {
                        list = [{
                            name: data.ContactPerson || data.Name || '담당자',
                            email: data.Email || data.email,
                            title: '대표담당자',
                        }];
                    }
                }

                setCustomerContacts(list);
                if (list.length > 0) setSelectedEmails([list[0].email]);
            } catch (err) {
                console.error('고객사 연락처 로드 실패:', err);
            }
        };

        fetchContacts();
    }, [isOpen, quoteData]);

    // ── 제목 & 본문 자동완성 ─────────────────────────────────────
    useEffect(() => {
        if (!isOpen || !quoteData) return;

        const q = quoteData;
        const customerName = q.CustomerName || '고객사';
        const quoteNo = q.QuoteNo || 'QT-XXXXXXXX';
        const totalAmt = (q.TotalAmount || 0).toLocaleString();

        setSubject(`[견적서 발송] ${q.Title || '견적 건'} (${quoteNo} / ${customerName})`);

        const itemLines = (q.Items || []).map((item, idx) => {
            const no = String(idx + 1).padStart(2, ' ');
            const name = `${item.Name || '-'}`.padEnd(30, ' ');
            const qty = String(item.Qty || 0).padStart(6, ' ');
            const price = `${(item.UnitPrice || 0).toLocaleString()}원`.padStart(14, ' ');
            const amount = `${(item.Amount || 0).toLocaleString()}원`.padStart(14, ' ');
            return `  ${no}. ${name} | ${qty} EA | 단가 ${price} | 합계 ${amount}`;
        }).join('\n');

        const validUntil = q.ValidUntil || '-';
        const company = q.CompanyInfo || {};
        const bank = q.BankInfo || {};

        setEmailContent(
`안녕하세요, ${customerName} 담당자님.

${company.Name || 'IRAssistance'}입니다.

평소 저희 제품에 관심 가져주셔서 감사드립니다.
요청하신 건에 대하여 아래와 같이 견적서를 발송해 드립니다.

─────────────────────────────────────
견적 번호 : ${quoteNo}
견적 건명 : ${q.Title || '-'}
견적 일자 : ${q.Date || '-'}
유효 기한 : ${validUntil}
─────────────────────────────────────

[견적 품목 내역]
${itemLines || '  (품목 없음)'}

─────────────────────────────────────
합계 금액   : ₩ ${totalAmt} (VAT 별도)
─────────────────────────────────────

[결제 정보]
  은행명  : ${bank.Bank || '-'}
  계좌번호 : ${bank.Account || '-'}
  예금주  : ${bank.Holder || '-'}

[견적 조건]
${q.Terms || '-'}

기타 문의 사항이 있으시면 언제든지 연락 주시기 바랍니다.

감사합니다.

${company.Name || 'IRAssistance'} 영업 담당자 드림
연락처: ${company.Contact || '-'}
주소: ${company.Address || '-'}`
        );
    }, [isOpen, quoteData]);

    // ── 이메일 선택 토글 ───────────────────────────────────────
    const toggleEmail = (email) => {
        setSelectedEmails(prev =>
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
        );
    };

    // ── 직접 입력 추가 ────────────────────────────────────────
    const handleAddCustomEmail = (e) => {
        e.preventDefault();
        if (!customEmail) return;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customEmail)) {
            alert('유효한 이메일 형식이 아닙니다.');
            return;
        }
        const newContact = { name: customName || '직접 입력', email: customEmail, title: '사용자 지정' };
        setCustomerContacts(prev => [...prev, newContact]);
        setSelectedEmails(prev => [...prev, customEmail]);
        setCustomEmail('');
        setCustomName('');
    };

    // ── PDF 다운로드 ──────────────────────────────────────────
    const handleDownloadPDF = () => {
        if (!quoteData) return;
        const q = quoteData;
        const doc = new jsPDF();

        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        doc.text('QUOTATION (견적서)', 14, 20);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`No: ${q.QuoteNo || '-'}`, 14, 30);
        doc.text(`Date: ${q.Date || '-'}  /  Valid Until: ${q.ValidUntil || '-'}`, 14, 36);
        doc.text(`Customer: ${q.CustomerName || '-'}`, 14, 42);
        doc.text(`Title: ${q.Title || '-'}`, 14, 48);

        const tableRows = (q.Items || []).map((item, idx) => [
            idx + 1,
            item.PartID || '-',
            item.Name || '-',
            item.Qty || 0,
            `${(item.UnitPrice || 0).toLocaleString()}`,
            `${(item.Amount || 0).toLocaleString()}`,
        ]);

        autoTable(doc, {
            startY: 56,
            head: [['No', 'Part ID', '품목명', '수량', '단가 (₩)', '금액 (₩)']],
            body: tableRows,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [79, 70, 229] },
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFont(undefined, 'bold');
        doc.text(`합계 금액 (VAT 별도): ₩ ${(q.TotalAmount || 0).toLocaleString()}`, 14, finalY);

        doc.save(`견적서_${q.QuoteNo || 'QT'}.pdf`);
    };

    // ── 발송 ─────────────────────────────────────────────────
    const handleSend = async () => {
        if (selectedEmails.length === 0) {
            alert('이메일 수신처를 최소 하나 이상 선택해주세요.');
            return;
        }
        if (!window.confirm('견적서 이메일을 발송하시겠습니까?\nGmail 작성 화면으로 연결됩니다.')) return;

        setSending(true);
        try {
            const to = selectedEmails.join(',');
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailContent)}`;
            window.open(gmailUrl, '_blank');

            await onSend({ subject, content: emailContent, recipients: selectedEmails });
            onClose();
        } finally {
            setSending(false);
        }
    };

    if (!isOpen || !quoteData) return null;

    const q = quoteData;
    const company = q.CompanyInfo || {};
    const bank = q.BankInfo || {};
    const items = q.Items || [];

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-white rounded-[28px] w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden text-left animate-in fade-in zoom-in-95 duration-200">

                {/* ── 헤더 ─────────────────────────────── */}
                <div className="flex justify-between items-center px-8 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0 rounded-t-[28px]">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <Mail size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tight">견적서 이메일 발행</h2>
                            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">
                                Quotation Email — {q.QuoteNo}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* ── 본문: 좌(견적서 미리보기) + 우(이메일 작성) ─── */}
                <div className="flex-1 overflow-hidden grid grid-cols-[420px_1fr] divide-x divide-slate-100">

                    {/* ════ 왼쪽: 견적서 양식 미리보기 ════ */}
                    <div className="overflow-y-auto p-6 space-y-4 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">견적서 미리보기</p>
                            <button
                                onClick={handleDownloadPDF}
                                className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                            >
                                <FileDown size={11} /> PDF 저장
                            </button>
                        </div>

                        {/* 견적서 카드 */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            {/* 견적서 헤더 */}
                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">QUOTATION</p>
                                <p className="text-xl font-black tracking-tight">{q.QuoteNo}</p>
                                <div className="grid grid-cols-2 gap-1 mt-3 text-[10px] text-slate-400">
                                    <span>견적일: <span className="text-white font-bold">{q.Date || '-'}</span></span>
                                    <span>유효기한: <span className="text-white font-bold">{q.ValidUntil || '-'}</span></span>
                                </div>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* 고객사 / 공급자 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">Bill To (고객사)</p>
                                        <p className="text-xs font-black text-slate-800">{q.CustomerName || '-'}</p>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">{q.Title || '-'}</p>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">From (공급자)</p>
                                        <p className="text-xs font-black text-slate-800">{company.Name || '-'}</p>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">대표: {company.CEO || '-'}</p>
                                    </div>
                                </div>

                                {/* 품목 테이블 */}
                                <div className="rounded-xl border border-slate-100 overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 text-[9px] font-black text-slate-500 uppercase">
                                                <th className="px-3 py-2">품목명</th>
                                                <th className="px-3 py-2 text-center w-12">수량</th>
                                                <th className="px-3 py-2 text-right w-24">금액</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {items.length === 0 ? (
                                                <tr>
                                                    <td colSpan="3" className="px-3 py-4 text-center text-[10px] text-slate-300">품목 없음</td>
                                                </tr>
                                            ) : items.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50">
                                                    <td className="px-3 py-2">
                                                        <p className="text-[10px] font-black text-slate-800 leading-tight">{item.Name || '-'}</p>
                                                        <p className="text-[9px] text-slate-400 font-mono">{item.PartID || ''}</p>
                                                    </td>
                                                    <td className="px-3 py-2 text-center text-[10px] font-black text-slate-600">{item.Qty}</td>
                                                    <td className="px-3 py-2 text-right text-[10px] font-black text-slate-800">
                                                        ₩{(item.Amount || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* 합계 */}
                                <div className="flex justify-end">
                                    <div className="bg-indigo-600 text-white px-5 py-3 rounded-xl text-right">
                                        <p className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Total Amount (VAT 별도)</p>
                                        <p className="text-lg font-black mt-0.5">₩ {(q.TotalAmount || 0).toLocaleString()}</p>
                                    </div>
                                </div>

                                {/* 계좌 정보 */}
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Details</p>
                                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                                        <div><span className="text-slate-400">은행: </span><span className="font-black text-slate-700">{bank.Bank || '-'}</span></div>
                                        <div className="col-span-2"><span className="text-slate-400">계좌: </span><span className="font-black text-slate-700 font-mono">{bank.Account || '-'}</span></div>
                                    </div>
                                </div>

                                {/* 조건 */}
                                {q.Terms && (
                                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                                        <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1.5">Terms & Conditions</p>
                                        <p className="text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">{q.Terms}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ════ 오른쪽: 이메일 작성 ════ */}
                    <div className="flex flex-col min-h-0 p-6 gap-5 overflow-y-auto">
                        {/* 수신자 선택 */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <User size={11} /> 받는 사람
                            </label>
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                                {/* 등록된 이메일 선택 */}
                                {customerContacts.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {customerContacts.map((contact, idx) => {
                                            const isSelected = selectedEmails.includes(contact.email);
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => toggleEmail(contact.email)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-black whitespace-nowrap transition-all ${
                                                        isSelected
                                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-200'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                                                    }`}
                                                >
                                                    {isSelected && <Check size={10} />}
                                                    <span>{contact.name}</span>
                                                    <span className={`text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                        ({contact.title})
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                        <AlertCircle size={12} />
                                        <span>등록된 이메일이 없습니다. 아래에서 직접 입력해주세요.</span>
                                    </div>
                                )}

                                {/* 선택된 이메일 표시 */}
                                {selectedEmails.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200">
                                        {selectedEmails.map(email => (
                                            <span key={email} className="text-[10px] bg-indigo-50 text-indigo-700 font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                                {email}
                                                <button onClick={() => toggleEmail(email)} className="text-indigo-400 hover:text-indigo-700 ml-0.5">
                                                    <X size={9} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* 직접 입력 */}
                                <div className="flex gap-2 pt-2 border-t border-slate-200">
                                    <input
                                        type="text"
                                        placeholder="이름"
                                        value={customName}
                                        onChange={e => setCustomName(e.target.value)}
                                        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <input
                                        type="email"
                                        placeholder="이메일 직접 입력"
                                        value={customEmail}
                                        onChange={e => setCustomEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddCustomEmail(e)}
                                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddCustomEmail}
                                        className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[11px] font-black hover:bg-black transition-colors flex items-center gap-1"
                                    >
                                        <Plus size={11} /> 추가
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 이메일 제목 */}
                        <div className="space-y-1.5 shrink-0">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">이메일 제목</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                        </div>

                        {/* 이메일 본문 */}
                        <div className="flex flex-col flex-1 min-h-0 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">이메일 본문</label>
                                <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                    <Sparkles size={9} /> 자동 완성됨
                                </div>
                            </div>
                            <textarea
                                value={emailContent}
                                onChange={e => setEmailContent(e.target.value)}
                                className="flex-1 w-full min-h-[280px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-[13px] font-medium text-slate-700 leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* ── 푸터 ────────────────────────────── */}
                <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="text-[10px] font-bold text-slate-400">
                        {selectedEmails.length > 0
                            ? `${selectedEmails.length}명에게 발송 예정`
                            : '수신자를 선택해주세요'}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-sm font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={sending || selectedEmails.length === 0}
                            className="px-8 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                        >
                            <Send size={15} />
                            {sending ? '처리 중...' : '견적서 이메일 발송'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default QuoteEmailModal;
