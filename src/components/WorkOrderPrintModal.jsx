import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, CheckSquare, Square } from 'lucide-react';

export default function WorkOrderPrintModal({ isOpen, onClose, pr, bomList, showBOM: initialShowBOM = true }) {
    const [selectedBOMIds, setSelectedBOMIds] = useState([]);
    const [showBOM, setShowBOM] = useState(initialShowBOM);

    useEffect(() => {
        setShowBOM(initialShowBOM);
    }, [initialShowBOM, isOpen]);

    useEffect(() => {
        if (bomList) {
            setSelectedBOMIds(bomList.map((_, idx) => idx));
        }
    }, [bomList, isOpen]);

    if (!isOpen || !pr) return null;

    const handlePrint = () => {
        window.print();
    };

    const toggleBOMItem = (idx) => {
        setSelectedBOMIds(prev => 
            prev.includes(idx) ? prev.filter(id => id !== idx) : [...prev, idx]
        );
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 overflow-hidden">
            <div className="bg-white rounded-xl w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl relative print:static print:max-w-none print:shadow-none print:bg-white print:h-auto">
                
                {/* Header Actions (Not Printed) */}
                <div className="flex justify-between items-center p-4 border-b border-slate-200 print:hidden shrink-0 bg-slate-50 rounded-t-xl">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <FileText size={20} className="text-blue-600" />
                            작업 지시서 인쇄 설정
                        </h2>
                        <div className="flex items-center gap-4 mt-1">
                            <p className="text-[10px] font-bold text-slate-500">소요 자재를 선택하고 인쇄 버튼을 누르세요.</p>
                            <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded border border-slate-200">
                                <input 
                                    type="checkbox" 
                                    checked={showBOM} 
                                    onChange={e => setShowBOM(e.target.checked)}
                                    className="w-3 h-3 rounded"
                                />
                                <span className="text-[10px] font-black text-slate-700">자재 현황 포함</span>
                            </label>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                            <Printer size={18} />
                            지시서 인쇄
                        </button>
                        <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Main Layout Area */}
                <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">
                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-12 bg-slate-200/50 print:p-0 print:bg-white print:overflow-visible custom-scrollbar">
                        {/* A4 Paper styling for screen preview */}
                        <div id="print-area" className="w-[210mm] mx-auto bg-white shadow-2xl p-[20mm] print:shadow-none print:w-full print:p-0 print:mx-0 min-h-[297mm] relative flex flex-col border border-slate-100 print:border-none">
                            
                            {/* Barcode Mock (Top Right) */}
                            <div className="absolute top-[20mm] right-[20mm] flex flex-col items-center print:fixed print:top-[20mm] print:right-[20mm]">
                                <div className="h-10 w-40 bg-[repeating-linear-gradient(90deg,#000,#000_1px,transparent_1px,transparent_2px,#000_2px,#000_4px,transparent_4px,transparent_5px)] opacity-90"></div>
                                <span className="font-mono text-[9px] font-black tracking-widest mt-1 text-slate-800">{pr.PRNumber}</span>
                            </div>

                            {/* Work Order Header */}
                            <div className="text-left mb-10 border-b-4 border-slate-900 pb-6">
                                <h1 className="text-4xl font-black tracking-tighter text-slate-900">작업 지시서</h1>
                                <div className="flex justify-between items-end mt-2">
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">WORK ORDER / PRODUCTION SLIP</p>
                                    <p className="text-xs font-bold text-slate-800">발행일: {new Date().toLocaleDateString()}</p>
                                </div>
                            </div>

                            {/* Info Section */}
                            <div className="space-y-6 mb-8">
                                {/* Top Row: Basic Info (4 columns) */}
                                <div className="grid grid-cols-4 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">작업지시 번호</label>
                                        <p className="text-base font-black text-slate-900 font-mono tracking-tight underline underline-offset-4 decoration-slate-200">{pr.PRNumber}</p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">고객사</label>
                                        <p className="text-sm font-black text-slate-800 truncate">{pr.CustomerName || '내부 생산'}</p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">납기 희망일</label>
                                        <p className="text-sm font-black text-rose-600">{pr.DueDate}</p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">발행인 (요청자)</label>
                                        <p className="text-sm font-black text-blue-600">{pr.CreatedByName || '관리자'}</p>
                                    </div>
                                </div>

                                {/* Middle Section: Production Items List (Full Width) */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase block pl-1">생산 품목 리스트 (Production Items)</label>
                                    <div className="border-2 border-slate-900 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-slate-900 text-white">
                                                    <th className="p-2 font-black text-left pl-4 w-12 text-[10px] uppercase">No.</th>
                                                    <th className="p-2 font-black text-left text-[10px] uppercase">품명 (Description)</th>
                                                    <th className="p-2 font-black text-left text-[10px] uppercase">품번 (Part ID)</th>
                                                    <th className="p-2 font-black text-center w-24 text-[10px] uppercase">목표 수량</th>
                                                    <th className="p-2 font-black text-center w-32 text-[10px] uppercase">작업 확인</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(pr.Items || [{ 
                                                    PartName: pr.PartName, 
                                                    PartID: pr.PartID, 
                                                    Rev: pr.Rev, 
                                                    TargetQty: pr.TargetQty 
                                                }]).map((item, idx) => (
                                                    <tr key={idx} className="border-b border-slate-200 last:border-0">
                                                        <td className="p-3 pl-4 font-bold text-slate-400">{idx + 1}</td>
                                                        <td className="p-3 font-black text-slate-800 text-base">{item.PartName}</td>
                                                        <td className="p-3 font-mono text-xs font-bold text-slate-500">{item.PartID} (Rev {item.Rev || '0'})</td>
                                                        <td className="p-3 text-center font-black text-blue-700 text-lg">
                                                            {(item.TargetQty || 0).toLocaleString()} <span className="text-[10px] text-slate-400 ml-0.5 font-bold">EA</span>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="h-8 border border-dashed border-slate-300 rounded flex items-center justify-center text-[10px] text-slate-300 font-bold uppercase">Sign / Stamp</div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Split Delivery Schedule (Only if exists) */}
                                {pr.Schedules && pr.Schedules.length > 0 && (
                                    <div className="space-y-2 break-inside-avoid">
                                        <label className="text-[10px] font-black text-slate-400 uppercase block pl-1">납기 분할 일정 (Delivery Schedule)</label>
                                        <div className="border border-slate-300 rounded-lg overflow-hidden">
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-100 border-b border-slate-300">
                                                        <th className="p-2 font-black text-slate-600 text-center w-16">회차</th>
                                                        <th className="p-2 font-black text-slate-600 text-left">납기 예정일</th>
                                                        <th className="p-2 font-black text-slate-600 text-right pr-4">요청 수량</th>
                                                        <th className="p-2 font-black text-slate-600 text-center w-32">생산 확인</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pr.Schedules.map((s, sidx) => (
                                                        <tr key={sidx} className="border-b border-slate-200 last:border-0">
                                                            <td className="p-2 text-center font-bold text-slate-500">{sidx + 1}</td>
                                                            <td className="p-2 font-black text-slate-700">{s.date}</td>
                                                            <td className="p-2 text-right pr-4 font-black text-slate-900">{s.qty.toLocaleString()} EA</td>
                                                            <td className="p-2">
                                                                <div className="h-6 border border-slate-200 rounded"></div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* BOM Table */}
                            {showBOM && (
                                <div className="mt-8 block">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">소요 자재 명세 (Bill of Materials)</h3>
                                        <p className="text-[10px] font-bold text-slate-400 print:hidden">선택된 항목만 인쇄됩니다.</p>
                                    </div>
                                    <table className="w-full text-left text-sm border-collapse border-t-2 border-slate-800 print:table-auto">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="border border-slate-200 p-2 font-black text-center w-10 print:hidden">선택</th>
                                                <th className="border border-slate-200 p-2 font-black text-center w-12">No.</th>
                                                <th className="border border-slate-200 p-2 font-black">품번 (Part ID)</th>
                                                <th className="border border-slate-200 p-2 font-black">품명 (Description)</th>
                                                <th className="border border-slate-200 p-2 font-black text-center w-20">단위수량</th>
                                                <th className="border border-slate-200 p-2 font-black text-center w-24">총 소요량</th>
                                                <th className="border border-slate-200 p-2 font-black text-center w-20">확인</th>
                                            </tr>
                                        </thead>
                                        <tbody className="print:text-black">
                                            {bomList && bomList.map((item, idx) => {
                                                const isSelected = selectedBOMIds.includes(idx);
                                                if (!isSelected && window.matchMedia('print').matches) return null;

                                                return (
                                                    <tr key={idx} className={`border-b border-slate-200 break-inside-avoid ${!isSelected ? 'bg-slate-50/50 opacity-40 print:hidden' : ''}`}>
                                                        <td className="border border-slate-200 p-2 text-center print:hidden">
                                                            <button onClick={() => toggleBOMItem(idx)} className="text-slate-400 hover:text-blue-600">
                                                                {isSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                                            </button>
                                                        </td>
                                                        <td className="border border-slate-200 p-2 text-center text-xs">{idx + 1}</td>
                                                        <td className="border border-slate-200 p-2 font-mono text-xs">{item.ChildID}</td>
                                                        <td className="border border-slate-200 p-2 text-xs font-black">{item.ChildName}</td>
                                                        <td className="border border-slate-200 p-2 text-center text-xs font-bold">{item.Quantity}</td>
                                                        <td className="border border-slate-200 p-2 text-center font-black text-blue-700">{(item.Quantity * pr.TargetQty).toLocaleString()}</td>
                                                        <td className="border border-slate-200 p-2 text-center">
                                                            <div className="w-4 h-4 border border-slate-400 mx-auto rounded-sm"></div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {(!bomList || bomList.length === 0) && (
                                                <tr>
                                                    <td colSpan="7" className="p-12 text-center text-slate-300 font-black uppercase tracking-widest text-xs border border-slate-200">No Material Data Found</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Signatures */}
                            <div className="flex justify-end mt-12 break-inside-avoid signature-section">
                                <table className="text-center text-xs border-collapse w-[80mm]">
                                    <tbody>
                                        <tr>
                                            <th className="border border-slate-900 bg-slate-50 p-2 font-black w-8" rowSpan="2">결<br/>재</th>
                                            <th className="border border-slate-900 bg-white p-1 font-black w-24">작성</th>
                                            <th className="border border-slate-900 bg-white p-1 font-black w-24">검토</th>
                                            <th className="border border-slate-900 bg-white p-1 font-black w-24">승인</th>
                                        </tr>
                                        <tr>
                                            <td className="border border-slate-900 h-16"></td>
                                            <td className="border border-slate-900 h-16"></td>
                                            <td className="border border-slate-900 h-16"></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Note */}
                            <div className="mt-8 border-t border-slate-100 pt-4 print:mt-auto">
                                <p className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-widest">
                                    IRRobot Production Management System - Confidentially handled
                                </p>
                            </div>

                        </div>
                    </div>
                </div>

                {/* Print Styles */}
                <style dangerouslySetInnerHTML={{__html: `
                    @media print {
                        @page {
                            size: A4;
                            margin: 15mm;
                        }
                        
                        /* Hide everything by default */
                        body * {
                            visibility: hidden;
                        }
                        
                        /* Show only the print area and its parents */
                        #print-area, #print-area * {
                            visibility: visible;
                        }
                        
                        /* Fix parent containers that might clip content */
                        html, body {
                            height: auto !important;
                            overflow: visible !important;
                            background: white !important;
                        }

                        /* Ensure all parents of print-area are visible and non-clipping */
                        div:has(> #print-area), 
                        div:has(> div > #print-area),
                        div:has(> div > div > #print-area),
                        div:has(> div > div > div > #print-area),
                        div:has(> div > div > div > div > #print-area) {
                            visibility: visible !important;
                            overflow: visible !important;
                            display: block !important;
                            position: static !important;
                            height: auto !important;
                            max-height: none !important;
                            padding: 0 !important;
                            margin: 0 !important;
                            border: none !important;
                            box-shadow: none !important;
                        }

                        #print-area {
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            display: block !important;
                            background: white !important;
                        }

                        .print\\:hidden {
                            display: none !important;
                        }

                        .break-inside-avoid {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }

                        /* Ensure tables wrap correctly */
                        table {
                            width: 100% !important;
                            table-layout: auto !important;
                            page-break-inside: auto;
                        }
                        
                        tr {
                            page-break-inside: avoid;
                            page-break-after: auto;
                        }

                        /* Add some space before the signature section if it moves to a new page */
                        .signature-section {
                            margin-top: 30px;
                            break-inside: avoid;
                        }
                    }
                `}} />
            </div>
        </div>,
        document.body
    );
}
