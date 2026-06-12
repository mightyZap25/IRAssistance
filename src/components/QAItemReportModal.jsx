import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, FileText, Cloud } from 'lucide-react';

export default function QAItemReportModal({ isOpen, onClose, item, type = 'receiving' }) {
    const [saving, setSaving] = useState(false);
    
    if (!isOpen || !item) return null;

    const titles = {
        receiving: { ko: '수 입 검 사 성 적 서', en: 'Receiving Inspection Certificate', doc: '발주 번호', partner: '공급사' },
        shipping: { ko: '출 하 검 사 성 적 서', en: 'Shipping Inspection Certificate', doc: '생산 번호', partner: '고객사' },
        middle: { ko: '중 간 검 사 성 적 서', en: 'In-Process Inspection Certificate', doc: '생산 번호', partner: '공정/라인' }
    };

    const currentTitle = titles[type] || titles.receiving;

    const handlePrint = () => {
        window.print();
    };

    // Google Sheets 성적서 저장 처리
    const handleSaveToGoogleSheet = async () => {
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            return alert('구글 연동 계정으로 로그인되어 있지 않거나 토큰이 만료되었습니다. 오피스 메뉴의 [파일 연동] 페이지에서 구글 연동을 먼저 수행해 주세요.');
        }

        setSaving(true);
        try {
            const fileName = `${currentTitle.ko.replace(/\s/g, '')}_${item.PartName}_${item.PONumber || item.PRNumber || item.id}`;
            // 1. Google Sheets 파일 생성 요청
            const createUrl = 'https://www.googleapis.com/drive/v3/files';
            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: fileName,
                    mimeType: 'application/vnd.google-apps.spreadsheet'
                })
            });

            if (!createRes.ok) throw new Error('구글 시트 생성 실패');
            const fileData = await createRes.json();
            const spreadsheetId = fileData.id;

            // 2. Google Sheets API를 사용하여 셀 데이터 채우기
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:D20?valueInputOption=USER_ENTERED`;
            
            const defectsList = item.Defects?.map(d => `${d.name || d.type} (${d.qty}개) - ${d.note || d.value || ''}`).join(', ') || '없음';

            const values = [
                [currentTitle.ko, '', '', ''],
                ['', '', '', ''],
                [currentTitle.doc, item.PONumber || item.PRNumber || '-', currentTitle.partner, item.VendorName || item.CustomerName || '-'],
                ['품목 번호', item.PartID, '품목명', item.PartName],
                ['검사 일시', item.InspectedAt?.toDate ? item.InspectedAt.toDate().toLocaleString() : new Date().toLocaleString(), '검사자', 'QA Manager'],
                ['', '', '', ''],
                ['[1. 검사 수량 및 합격 정보]', '', '', ''],
                ['총 검사 수량', '검사 방법', '합격 수량', '불량 수량'],
                [`${item.Qty} EA`, item.InspectionMethod === 'Sample' ? 'Sample 검사' : '전수 검사', `${item.PassedQty || 0} EA`, `${item.FailedQty || 0} EA`],
                ['최종 판정', (item.FailedQty || 0) > 0 ? '불합격 포함' : '합격 (PASS)', '', ''],
                ['', '', '', ''],
                ['[2. 부적합 내용 및 조치 내역]', '', '', ''],
                ['불량 내역', defectsList, '', ''],
                ['부적합 조치방안', item.Remarks || (item.FailedQty > 0 ? '반품 또는 재작업' : '없음'), '', '']
            ];

            const updateRes = await fetch(updateUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values })
            });

            if (!updateRes.ok) throw new Error('구글 시트 데이터 작성 실패');

            alert('구글 드라이브에 성적서 시트 작성이 완료되었습니다!');
            window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank');
        } catch (err) {
            console.error(err);
            alert(`오류 발생: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const content = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-slate-800 px-6 py-4 flex justify-between items-center shrink-0 print:hidden">
                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                        <FileText size={20} className="text-teal-400" />
                        {currentTitle.ko} 출력
                    </h2>
                    <div className="flex items-center gap-2">
                        <button onClick={handleSaveToGoogleSheet} disabled={saving} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                            <Cloud size={14} /> {saving ? '저장 중...' : 'Google Sheet 저장'}
                        </button>
                        <button onClick={handlePrint} className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-600 flex items-center gap-1.5 transition-colors">
                            <Printer size={14} /> 인쇄 (PDF 저장)
                        </button>
                        <button onClick={onClose} className="p-1.5 bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Printable Certificate Area */}
                <div className="flex-1 overflow-y-auto p-10 bg-white print:p-0">
                    <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{currentTitle.ko}</h1>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{currentTitle.en}</p>
                    </div>

                    {/* Meta info table */}
                    <table className="w-full text-xs border border-slate-300 border-collapse mb-6">
                        <tbody>
                            <tr>
                                <td className="bg-slate-100 p-2 border border-slate-300 font-black text-slate-600 w-24">{currentTitle.doc}</td>
                                <td className="p-2 border border-slate-300 font-bold text-slate-800">{item.PONumber || item.PRNumber || '-'}</td>
                                <td className="bg-slate-100 p-2 border border-slate-300 font-black text-slate-600 w-24">{currentTitle.partner}</td>
                                <td className="p-2 border border-slate-300 font-bold text-slate-800">{item.VendorName || item.CustomerName || '-'}</td>
                            </tr>
                            <tr>
                                <td className="bg-slate-100 p-2 border border-slate-300 font-black text-slate-600">품목 번호</td>
                                <td className="p-2 border border-slate-300 font-bold text-slate-800">{item.PartID}</td>
                                <td className="bg-slate-100 p-2 border border-slate-300 font-black text-slate-600">품목명</td>
                                <td className="p-2 border border-slate-300 font-black text-slate-800">{item.PartName}</td>
                            </tr>
                            <tr>
                                <td className="bg-slate-100 p-2 border border-slate-300 font-black text-slate-600">검사 일시</td>
                                <td className="p-2 border border-slate-300 font-bold text-slate-800">
                                    {item.InspectedAt?.toDate ? item.InspectedAt.toDate().toLocaleString() : 
                                     item.InspectedAt?.seconds ? new Date(item.InspectedAt.seconds * 1000).toLocaleString() : 
                                     new Date().toLocaleString()}
                                </td>
                                <td className="bg-slate-100 p-2 border border-slate-300 font-black text-slate-600">검사자</td>
                                <td className="p-2 border border-slate-300 font-bold text-slate-800">QA Manager</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Inspection results */}
                    <h3 className="text-sm font-black text-slate-800 mb-2 border-l-4 border-teal-500 pl-2">1. 검사 수량 및 합격 정보</h3>
                    <table className="w-full text-xs border border-slate-300 border-collapse mb-6 text-center">
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="p-2 border border-slate-300 font-black text-slate-600">총 검사 수량</th>
                                <th className="p-2 border border-slate-300 font-black text-slate-600">검사 방법</th>
                                <th className="p-2 border border-slate-300 font-black text-teal-600">합격 수량 (Pass)</th>
                                <th className="p-2 border border-slate-300 font-black text-rose-600">불량 수량 (Fail)</th>
                                <th className="p-2 border border-slate-300 font-black text-slate-600">최종 종합 판정</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="font-bold text-slate-800">
                                <td className="p-3 border border-slate-300 font-black">{item.Qty} EA</td>
                                <td className="p-3 border border-slate-300">{item.InspectionMethod === 'Sample' ? 'Sample 검사' : '전수 검사'}</td>
                                <td className="p-3 border border-slate-300 text-teal-600 font-black">{item.PassedQty || 0} EA</td>
                                <td className="p-3 border border-slate-300 text-rose-600 font-black">{item.FailedQty || 0} EA</td>
                                <td className="p-3 border border-slate-300">
                                    {(item.FailedQty || 0) > 0 ? (
                                        <span className="text-rose-600 font-black">불합격 포함 (반품/재작업)</span>
                                    ) : (
                                        <span className="text-teal-600 font-black">합격 (PASS)</span>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Defect details if failed > 0 */}
                    {(item.FailedQty || 0) > 0 && (
                        <>
                            <h3 className="text-sm font-black text-slate-800 mb-2 border-l-4 border-rose-500 pl-2">2. 부적합 내용 및 조치 내역</h3>
                            <table className="w-full text-xs border border-slate-300 border-collapse mb-6">
                                <thead>
                                    <tr className="bg-slate-50 text-center">
                                        <th className="p-2 border border-slate-300 font-black text-slate-600 w-1/3">불량 원인/명칭</th>
                                        <th className="p-2 border border-slate-300 font-black text-slate-600 w-24">수량</th>
                                        <th className="p-2 border border-slate-300 font-black text-slate-600">상세 특기사항</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {item.Defects && item.Defects.map((def, idx) => (
                                        <tr key={idx} className="text-slate-700">
                                            <td className="p-2.5 border border-slate-300 font-bold">{def.name || def.type}</td>
                                            <td className="p-2.5 border border-slate-300 text-center font-black text-rose-600">{def.qty} EA</td>
                                            <td className="p-2.5 border border-slate-300 font-bold">{def.note || def.value || '-'}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50">
                                        <td className="p-2.5 border border-slate-300 font-black">부적합품 조치 방안</td>
                                        <td colSpan="2" className="p-2.5 border border-slate-300 font-black text-slate-800">
                                            {item.Remarks || '품질 관리 규정에 따른 조치 수행 완료'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </>
                    )}

                    {/* Footer sign area */}
                    <div className="mt-20 flex justify-end gap-12 pt-8 border-t border-slate-200">
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-400 mb-6">검 사 원 (Inspector)</p>
                            <p className="text-sm font-black text-slate-900 border-b border-slate-300 pb-1 min-w-[120px]">(인)</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-400 mb-6">승 인 자 (Manager)</p>
                            <p className="text-sm font-black text-slate-900 border-b border-slate-300 pb-1 min-w-[120px]">(인)</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
