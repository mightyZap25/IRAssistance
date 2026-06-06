import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText } from 'lucide-react';

export default function WorkOrderPrintModal({ isOpen, onClose, pr, bomList }) {
    if (!isOpen || !pr) return null;

    const handlePrint = () => {
        window.print();
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative">
                
                {/* Header Actions (Not Printed) */}
                <div className="flex justify-between items-center p-4 border-b border-slate-200 print:hidden shrink-0">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <FileText size={20} className="text-blue-600" />
                        작업 지시서 미리보기
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors">
                            <Printer size={16} />
                            인쇄하기
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Print Content Area */}
                <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible custom-scrollbar">
                    {/* A4 Paper styling for screen preview */}
                    <div className="max-w-[210mm] mx-auto bg-white print:shadow-none print:max-w-full" style={{ minHeight: '297mm' }}>
                        
                        {/* Work Order Header */}
                        <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
                            <h1 className="text-3xl font-black tracking-widest text-slate-900">작업 지시서 (WORK ORDER)</h1>
                            <p className="text-sm font-bold text-slate-500 mt-2">IRRobot Production Department</p>
                        </div>

                        {/* PR Info */}
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <table className="w-full text-left text-sm border-collapse">
                                <tbody>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black w-24">작업지시 번호</th>
                                        <td className="border border-slate-300 p-2 font-mono font-bold text-slate-700">{pr.PRNumber}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black">고객사</th>
                                        <td className="border border-slate-300 p-2 font-bold text-slate-700">{pr.CustomerName || '내부 생산'}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black">납기일</th>
                                        <td className="border border-slate-300 p-2 font-bold text-rose-600">{pr.DueDate}</td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <table className="w-full text-left text-sm border-collapse">
                                <tbody>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black w-24">품명</th>
                                        <td className="border border-slate-300 p-2 font-bold text-slate-900 text-lg">{pr.PartName}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black">품번</th>
                                        <td className="border border-slate-300 p-2 font-mono font-bold text-slate-700">{pr.PartID}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black">목표 수량</th>
                                        <td className="border border-slate-300 p-2 font-black text-blue-700 text-lg">{pr.TargetQty} <span className="text-sm font-bold text-slate-500">EA</span></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Barcode Mock */}
                        <div className="mb-8 p-4 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center">
                            <div className="h-16 w-64 bg-[repeating-linear-gradient(90deg,#000,#000_2px,transparent_2px,transparent_4px,#000_4px,#000_8px,transparent_8px,transparent_10px,#000_10px,#000_12px)] opacity-80 mix-blend-multiply"></div>
                            <span className="font-mono text-xs font-black tracking-widest mt-2">{pr.PRNumber}</span>
                        </div>

                        {/* BOM Table */}
                        <div className="mb-8">
                            <h3 className="text-sm font-black text-slate-800 bg-slate-100 p-2 border border-slate-300 border-b-0">소요 자재 명세 (BOM)</h3>
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-black text-center w-12">No.</th>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-black">품번</th>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-black">품명</th>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-black text-center">단위수량</th>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-black text-center">총 소요량</th>
                                        <th className="border border-slate-300 bg-slate-50 p-2 font-black text-center w-20">출고확인</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bomList && bomList.map((item, idx) => (
                                        <tr key={idx} className="border-b border-slate-300">
                                            <td className="border-r border-slate-300 p-2 text-center text-xs">{idx + 1}</td>
                                            <td className="border-r border-slate-300 p-2 font-mono text-xs">{item.ChildID}</td>
                                            <td className="border-r border-slate-300 p-2 text-xs font-bold">{item.ChildName}</td>
                                            <td className="border-r border-slate-300 p-2 text-center text-xs">{item.Quantity}</td>
                                            <td className="border-r border-slate-300 p-2 text-center font-bold text-blue-600">{(item.Quantity * pr.TargetQty).toLocaleString()}</td>
                                            <td className="p-2 text-center"><div className="w-4 h-4 border-2 border-slate-300 mx-auto rounded-sm"></div></td>
                                        </tr>
                                    ))}
                                    {(!bomList || bomList.length === 0) && (
                                        <tr>
                                            <td colSpan="6" className="p-4 text-center text-slate-400 font-bold border border-slate-300">소요 자재 내역이 없습니다.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Signatures */}
                        <div className="flex justify-end gap-2 mt-16">
                            <table className="text-center text-sm border-collapse w-64">
                                <tbody>
                                    <tr>
                                        <th className="border border-slate-300 bg-slate-100 p-2 font-black w-8" rowSpan="2">결재</th>
                                        <th className="border border-slate-300 bg-slate-50 p-1 font-bold text-xs h-6 w-20">담당</th>
                                        <th className="border border-slate-300 bg-slate-50 p-1 font-bold text-xs h-6 w-20">검토</th>
                                        <th className="border border-slate-300 bg-slate-50 p-1 font-bold text-xs h-6 w-20">승인</th>
                                    </tr>
                                    <tr>
                                        <td className="border border-slate-300 h-16"></td>
                                        <td className="border border-slate-300 h-16"></td>
                                        <td className="border border-slate-300 h-16"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Print Styles */}
                        <style dangerouslySetInnerHTML={{__html: `
                            @media print {
                                body * { visibility: hidden; }
                                .fixed { position: absolute; }
                                .print\\:visible, .print\\:visible * { visibility: visible; }
                                .print\\:p-0 { padding: 0 !important; }
                                .print\\:shadow-none { box-shadow: none !important; }
                                .print\\:hidden { display: none !important; }
                                .max-w-\\[210mm\\] { max-width: none !important; min-height: 0 !important; }
                            }
                        `}} />

                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
