import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Download, Printer } from 'lucide-react';

export default function QAReportModal({ isOpen, onClose, data }) {
    if (!isOpen) return null;

    let totalInspected = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let defectCounts = {};

    data.forEach(row => {
        const p = row.PassedQty || 0;
        const f = row.FailedQty || 0;
        totalInspected += (p + f);
        totalPassed += p;
        totalFailed += f;

        if (f > 0 && row.Defects) {
            row.Defects.forEach(d => {
                defectCounts[d.type] = (defectCounts[d.type] || 0) + (d.qty || 1);
            });
        }
    });

    const passRate = totalInspected > 0 ? ((totalPassed / totalInspected) * 100).toFixed(1) : '0.0';
    
    const sortedDefects = Object.entries(defectCounts)
        .map(([type, qty]) => ({ type, qty, percentage: totalFailed > 0 ? ((qty / totalFailed) * 100).toFixed(1) : '0.0' }))
        .sort((a, b) => b.qty - a.qty);

    const topDefect = sortedDefects.length > 0 ? sortedDefects[0] : null;

    const handlePrint = () => {
        window.print();
    };

    const content = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-800 px-6 py-4 flex justify-between items-center shrink-0 print:hidden">
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <FileText size={20} className="text-teal-400" />
                            품질 검사 보고서 (QA Report)
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint} className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-600 flex items-center gap-1.5 transition-colors">
                            <Printer size={14} /> 인쇄 (PDF)
                        </button>
                        <button onClick={onClose} className="p-1.5 bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors ml-2">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-white print:p-0" id="qa-report-print-area">
                    <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">수입 검사 성적서</h1>
                        <p className="text-sm font-bold text-slate-500 mt-2 uppercase tracking-widest">Receiving Inspection Report</p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-3 border-b border-slate-200 pb-1">검사 개요</h3>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-2 font-bold text-slate-500 w-1/3 bg-slate-50 px-3">보고서 일자</td>
                                        <td className="py-2 font-black text-slate-800 px-3">{new Date().toLocaleDateString()}</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-2 font-bold text-slate-500 w-1/3 bg-slate-50 px-3">총 검사 대상</td>
                                        <td className="py-2 font-black text-slate-800 px-3">{data.length} 건</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-2 font-bold text-slate-500 w-1/3 bg-slate-50 px-3">작성자</td>
                                        <td className="py-2 font-black text-slate-800 px-3">QA Manager</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-3 border-b border-slate-200 pb-1">종합 품질 요약</h3>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-full flex flex-col justify-center">
                                <div className="flex justify-between items-end mb-3">
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold mb-1">전체 누계 합격률</p>
                                        <p className="text-2xl font-black text-emerald-600 leading-none">{passRate}%</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400 font-bold">검사 완료 (총계)</p>
                                        <p className="text-sm font-black text-slate-700">{totalInspected.toLocaleString()} 개</p>
                                    </div>
                                </div>
                                
                                <p className="text-xs text-slate-500 font-bold mb-1">주요 불량 사유 (1위)</p>
                                <p className="text-sm font-black text-rose-600">
                                    {topDefect ? `${topDefect.type} (전체 불량의 ${topDefect.percentage}%)` : '발생한 불량 내역 없음'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {sortedDefects.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-sm font-black text-slate-800 mb-3 border-b border-slate-200 pb-1">불량 유형 분석 (Defect Breakdown)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {sortedDefects.map((d, i) => (
                                    <div key={i} className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex justify-between items-center">
                                        <span className="text-xs font-black text-rose-800 truncate pr-2">{d.type}</span>
                                        <div className="text-right shrink-0">
                                            <span className="text-sm font-black text-rose-600">{d.qty}개</span>
                                            <span className="text-[10px] text-rose-400 font-bold ml-1">({d.percentage}%)</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <h3 className="text-sm font-black text-slate-800 mb-3 border-b border-slate-200 pb-1">상세 검사 내역</h3>
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-100 border-y border-slate-300">
                                <th className="py-2.5 px-3 text-left font-black text-slate-700 w-24">발주번호</th>
                                <th className="py-2.5 px-3 text-left font-black text-slate-700">품목명</th>
                                <th className="py-2.5 px-3 text-left font-black text-slate-700 w-32">공급사</th>
                                <th className="py-2.5 px-3 text-right font-black text-slate-700 w-20">검사수</th>
                                <th className="py-2.5 px-3 text-right font-black text-teal-700 w-20">합격</th>
                                <th className="py-2.5 px-3 text-right font-black text-rose-700 w-20">불량</th>
                                <th className="py-2.5 px-3 text-center font-black text-slate-700 w-24">판정</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.slice(0, 15).map((row, i) => (
                                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-2.5 px-3 text-slate-500 font-bold text-xs">{row.PONumber}</td>
                                    <td className="py-2.5 px-3 text-slate-800 font-bold truncate max-w-[200px]">{row.PartName}</td>
                                    <td className="py-2.5 px-3 text-slate-600 font-bold truncate">{row.VendorName}</td>
                                    <td className="py-2.5 px-3 text-right text-slate-800 font-black">{row.Qty}</td>
                                    <td className="py-2.5 px-3 text-right text-teal-600 font-black">{row.PassedQty || 0}</td>
                                    <td className="py-2.5 px-3 text-right text-rose-600 font-black">{row.FailedQty || 0}</td>
                                    <td className="py-2.5 px-3 text-center">
                                        {(row.FailedQty || 0) > 0 ? (
                                            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-black">불합격 포함</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] font-black">전량 합격</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {data.length > 15 && (
                        <p className="text-center text-xs font-bold text-slate-400 mt-4 py-2 bg-slate-50 rounded-lg">
                            * 지면 관계상 최근 15건의 데이터만 표시됩니다.
                        </p>
                    )}

                    <div className="mt-12 flex justify-end gap-8 pt-8 border-t-2 border-slate-200">
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-500 mb-4">검토자 (Reviewer)</p>
                            <p className="text-sm font-black text-slate-900 border-b border-slate-300 pb-1 min-w-[120px]">(인)</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-500 mb-4">승인자 (Approver)</p>
                            <p className="text-sm font-black text-slate-900 border-b border-slate-300 pb-1 min-w-[120px]">(인)</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
}
