import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Mail, Edit3, ClipboardCheck, Info, Plus, Check, FileDown, Printer } from 'lucide-react';
import { db, collection, getDocs, query, where } from '../database';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const RFQEmailModal = ({ isOpen, onClose, poData, onSend, mode = 'RFQ' }) => {
    const [emailContent, setEmailContent] = useState('');
    const [subject, setSubject] = useState('');
    const [vendorContacts, setVendorContacts] = useState([]);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [customEmail, setCustomEmail] = useState('');
    const [customName, setCustomName] = useState('');

    // 공급업체의 담당자 정보 조회
    useEffect(() => {
        const fetchVendorContacts = async () => {
            if (!isOpen || !poData || !poData.VendorID) return;
            try {
                // Vendors 컬렉션에서 공급업체 정보 조회
                const q = query(collection(db, 'vendors'), where('id', '==', poData.VendorID));
                const snap = await getDocs(q);
                let contactsList = [];
                
                if (!snap.empty) {
                    const vendorInfo = snap.docs[0].data();
                    
                    // Contacts 배열이 있으면 활용
                    if (vendorInfo.Contacts && vendorInfo.Contacts.length > 0) {
                        contactsList = vendorInfo.Contacts.map(c => ({
                            name: c.name || vendorInfo.ContactPerson || '담당자',
                            email: c.email || vendorInfo.Email || '',
                            title: c.title || '담당자'
                        })).filter(c => c.email);
                    } else if (vendorInfo.Email) {
                        // 없을 경우 기본 이메일/담당자 매핑
                        contactsList = [{
                            name: vendorInfo.ContactPerson || '담당자',
                            email: vendorInfo.Email,
                            title: '대표담당자'
                        }];
                    }
                }
                
                setVendorContacts(contactsList);
                // 기본적으로 첫 번째 담당자의 이메일을 선택 상태로 설정
                if (contactsList.length > 0) {
                    setSelectedEmails([contactsList[0].email]);
                }
            } catch (err) {
                console.error("공급사 연락처 로드 중 오류 발생:", err);
            }
        };

        fetchVendorContacts();
    }, [isOpen, poData]);

    useEffect(() => {
        if (isOpen && poData) {
            const vendorName = poData.VendorName || '공급사';
            const poType = poData.Type === 'OUTSOURCING' ? '외주 가공' : '자재 구매';
            
            if (mode === 'RFQ') {
                setSubject(`[견적요청] ${poType} 건에 대한 견적 요청의 건 (${vendorName} / IR_Assistant)`);
            } else {
                setSubject(`[발주요청] ${poType} 건에 대한 발주 요청의 건 (${poData.PONumber} / IR_Assistant)`);
            }
            
            // 이메일 본문 일반 텍스트 포맷 생성
            const itemText = (poData.Items || []).map((item, idx) => {
                const no = String(idx + 1).padEnd(4, ' ');
                const name = `${item.PartName} (${item.PartID})`.padEnd(35, ' ');
                const qty = `${item.Qty.toLocaleString()}`.padStart(8, ' ');
                const unit = ` ${item.Unit || 'EA'}`.padEnd(6, ' ');
                const spec = item.Spec || '-';
                return `${no} | ${name} | ${qty}${unit} | ${spec}`;
            }).join('\n');

            const textHeader = `No   | 품목명 (Part ID)                        | 수량(단위) | 비고/규격\n` +
                               `-----------------------------------------------------------------------\n`;

            const body = mode === 'RFQ' ? `안녕하세요, ${vendorName} 담당자님.

IR_Assistant 구매팀입니다.

아래 품목에 대하여 견적을 요청드리오니, 검토 후 회신 부탁드립니다.
본 메일에는 시스템에서 자동 생성된 [견적요청서_${poData.PONumber || 'RFQ'}.pdf] 파일이 첨부되어 있습니다.

[견적 요청 내역]
${textHeader}${itemText}

* 희망 납기일: ${poData.DueDate || '별도 협의'}

견적서 회신 시 단가, 납기일, 부가세 포함 여부를 명시해 주시기 바랍니다.

감사합니다.

IR_Assistant 구매 담당자 드림` : `안녕하세요, ${vendorName} 담당자님.

IR_Assistant 구매팀입니다.

아래 품목에 대하여 최종 발주를 요청드리오니, 납기 일정 확인 후 회신 부탁드립니다.
본 메일에는 최종 승인된 [발주요청서_${poData.PONumber || 'PO'}.pdf] 및 견적안이 첨부되어 있습니다.

[발주 요청 내역]
${textHeader}${itemText}

* 최종 납기 예정일: ${poData.DueDate || '별도 협의'}

기타 세부 사항은 첨부파일을 참고해주시기 바랍니다.

감사합니다.

IR_Assistant 구매 담당자 드림`;

            setEmailContent(body);
        }
    }, [isOpen, poData, mode]);

    const handleToggleEmail = (email) => {
        if (selectedEmails.includes(email)) {
            setSelectedEmails(prev => prev.filter(e => e !== email));
        } else {
            setSelectedEmails(prev => [...prev, email]);
        }
    };

    const handleAddCustomEmail = (e) => {
        e.preventDefault();
        if (!customEmail) return;
        
        // 이메일 유효성 검사
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(customEmail)) {
            alert('유효한 이메일 형식이 아닙니다.');
            return;
        }

        const newContact = {
            name: customName || '직접 입력 담당자',
            email: customEmail,
            title: '사용자 지정'
        };

        setVendorContacts(prev => [...prev, newContact]);
        setSelectedEmails(prev => [...prev, customEmail]);
        
        setCustomEmail('');
        setCustomName('');
    };

    const handleSend = () => {
        if (selectedEmails.length === 0) {
            alert('이메일 수신처를 최소 하나 이상 선택해야 합니다.');
            return;
        }
        const confirmMsg = mode === 'RFQ' 
            ? '공급사로 견적 요청 이메일을 발송하시겠습니까?\n확인 시 작성 화면이 Gmail로 연동됩니다.' 
            : '공급사로 최종 발주 요청 이메일을 발송하시겠습니까?\n확인 시 작성 화면이 Gmail로 연동됩니다.';
            
        if (!window.confirm(confirmMsg)) return;

        // Gmail compose URL 생성
        const toEmails = selectedEmails.join(',');
        const encodedSubject = encodeURIComponent(subject);
        const encodedBody = encodeURIComponent(emailContent);
        
        // Gmail 작성 화면 링크 호출
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${toEmails}&su=${encodedSubject}&body=${encodedBody}`;
        window.open(gmailUrl, '_blank');
        
        onSend({ 
            subject, 
            content: emailContent, 
            recipients: selectedEmails 
        });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] overflow-hidden text-left">
                <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <Mail size={28} className={mode === 'RFQ' ? "text-indigo-600" : "text-rose-600"} />
                            {mode === 'RFQ' ? '견적 요청 이메일 발송' : '발주 요청 이메일 발송'}
                        </h2>
                        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">
                            {mode === 'RFQ' ? 'Email Draft for RFQ' : 'Email Draft for Purchase Order'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-2xl text-slate-400 hover:text-slate-600 shadow-sm border border-slate-200 transition-all"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-hidden p-8 grid grid-cols-12 gap-8">
                    {/* Left Column: Configuration & Doc View (Col 5) */}
                    <div className="col-span-5 flex flex-col gap-5 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                        {/* 1. 왼쪽 상단: 담당자 선택 (한 줄로 나오게 함) */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">수신 담당자 선택</label>
                            <div className="flex flex-row gap-2 items-center overflow-x-auto py-1 custom-scrollbar-none">
                                {vendorContacts.map((contact, idx) => {
                                    const isSelected = selectedEmails.includes(contact.email);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleToggleEmail(contact.email)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-black whitespace-nowrap transition-all ${
                                                isSelected
                                                    ? 'bg-indigo-650 border-indigo-650 text-white shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-350'
                                            }`}
                                        >
                                            {isSelected && <Check size={10} />}
                                            <span>{contact.name}({contact.title})</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 간편 직접 입력 영역 (한 줄로 배치) */}
                            <div className="flex gap-2 pt-2 border-t border-slate-200/60">
                                <input
                                    type="text"
                                    placeholder="이름"
                                    value={customName}
                                    onChange={e => setCustomName(e.target.value)}
                                    className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <input
                                    type="email"
                                    placeholder="이메일 직접 입력"
                                    value={customEmail}
                                    onChange={e => setCustomEmail(e.target.value)}
                                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddCustomEmail}
                                    className="px-2.5 py-1.5 bg-slate-950 text-white hover:bg-black rounded-lg text-[10px] font-black flex items-center justify-center shadow"
                                >
                                    추가
                                </button>
                            </div>
                        </div>

                        {/* 2. 왼쪽 하단: 견적 요청서 문서 (미리보기 표 및 PDF 발행) */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex-1 flex flex-col gap-3 min-h-[220px]">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                    {mode === 'RFQ' ? '견적 요청서 미리보기' : '발주서 미리보기'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const docPdf = new jsPDF();
                                        docPdf.setFontSize(22);
                                        docPdf.text(mode === 'RFQ' ? 'REQUEST FOR QUOTATION (RFQ)' : 'PURCHASE ORDER (PO)', 14, 20);
                                        docPdf.setFontSize(10);
                                        docPdf.text(`Doc Number: ${poData.PONumber || 'N/A'}`, 14, 30);
                                        docPdf.text(`Date: ${new Date().toLocaleDateString()}`, 14, 35);
                                        docPdf.text(`Vendor: ${poData.VendorName || 'N/A'}`, 14, 40);
                                        docPdf.text(`Due Date: ${poData.DueDate || '별도 협의'}`, 14, 45);
                                        
                                        const tableRows = (poData.Items || []).map((item, idx) => [
                                            idx + 1,
                                            item.PartID,
                                            item.PartName,
                                            item.Qty,
                                            item.Unit || 'EA',
                                            item.Spec || '-'
                                        ]);
                                        autoTable(docPdf, {
                                            startY: 55,
                                            head: [['No', 'Part ID', 'Part Name', 'Qty', 'Unit', 'Spec']],
                                            body: tableRows,
                                        });
                                        docPdf.save(mode === 'RFQ' ? `RFQ_${poData.PONumber}.pdf` : `PO_${poData.PONumber}.pdf`);
                                        alert('PDF 파일이 생성 및 다운로드되었습니다.');
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black shadow transition-all"
                                >
                                    <FileDown size={11} /> PDF 저장
                                </button>
                            </div>

                            <div className="border border-slate-100 rounded-xl overflow-auto flex-1 text-[11px] bg-slate-50/50">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-bold text-[9px]">
                                            <th className="py-1.5 px-2">Part ID</th>
                                            <th className="py-1.5 px-2">품목명</th>
                                            <th className="py-1.5 px-2 text-right">수량</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-150">
                                        {(poData.Items || []).map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-100/50">
                                                <td className="py-1.5 px-2 font-mono text-slate-500">{item.PartID}</td>
                                                <td className="py-1.5 px-2 truncate max-w-[100px] font-medium text-slate-800">{item.PartName}</td>
                                                <td className="py-1.5 px-2 text-right font-black">{item.Qty.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Email Content (Col 7) */}
                    <div className="col-span-7 flex flex-col gap-4 min-h-0">
                        <div className="shrink-0">
                            <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">이메일 제목</label>
                            <input 
                                type="text" 
                                value={subject} 
                                onChange={e => setSubject(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex-1 flex flex-col min-h-0">
                            <label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1 block">이메일 본문 (텍스트)</label>
                            <textarea 
                                value={emailContent} 
                                onChange={e => setEmailContent(e.target.value)}
                                className="w-full flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar resize-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 shrink-0 flex justify-end gap-4">
                    <button onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-black text-slate-500 bg-white border-2 border-slate-100 hover:bg-slate-50 transition-all">취소</button>
                    <button 
                        onClick={handleSend}
                        className={`px-10 py-4 rounded-2xl text-sm font-black text-white shadow-xl flex items-center gap-3 transition-all ${
                            mode === 'RFQ' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                        }`}
                    >
                        <Send size={18}/> {mode === 'RFQ' ? '견적 요청 메일 전송' : '발주 요청 메일 전송'}
                    </button>
                </div>
            </div>
        </div>, document.body
    );
};

export default RFQEmailModal;
