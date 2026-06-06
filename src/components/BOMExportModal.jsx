import React, { useState, useEffect } from 'react';
import { X, Download, FileText, User, Building, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function BOMExportModal({ isOpen, onClose, rootPart, bomData }) {
    const [header, setHeader] = useState({
        company: 'Your Company Name',
        manager: 'Manager Name',
        date: new Date().toLocaleDateString(),
        title: `Part List - ${rootPart?.Name || 'BOM'}`
    });

    const [groups, setGroups] = useState({ electronic: [], mechanical: [], other: [] });
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (isOpen && bomData) {
            const flattened = flattenBOM(bomData);
            
            const grouped = flattened.reduce((acc, item) => {
                const partId = (item.PartID || '').toUpperCase();
                const category = (item.Category || '').toLowerCase();
                
                if (partId.startsWith('IRE') || category.includes('electronic') || category.includes('회로')) {
                    acc.electronic.push(item);
                } else if (partId.startsWith('IRM') || category.includes('mech') || category.includes('기구')) {
                    acc.mechanical.push(item);
                } else {
                    acc.other.push(item);
                }
                return acc;
            }, { electronic: [], mechanical: [], other: [] });

            // Sort within groups by PartID
            const sortFn = (a, b) => (a.PartID || '').localeCompare(b.PartID || '');
            setGroups({
                electronic: grouped.electronic.sort(sortFn),
                mechanical: grouped.mechanical.sort(sortFn),
                other: grouped.other.sort(sortFn)
            });
        }
    }, [isOpen, bomData]);

    function flattenBOM(node, multiplier = 1, result = {}) {
        if (!node || !node.Children) return [];

        node.Children.forEach(child => {
            const qty = (Number(child.Quantity) || 0) * multiplier;

            if (child.Children && child.Children.length > 0) {
                flattenBOM(child, qty, result);
            } else {
                if (result[child.PartID]) {
                    result[child.PartID].qty += qty;
                } else {
                    result[child.PartID] = {
                        ...child,
                        qty: qty,
                        priceUSD: Number(child.UnitPrice || 0),
                        priceKRW: Number(child.UnitPriceKRW || (child.UnitPrice * 1350) || 0)
                    };
                }
            }
        });

        return Object.values(result);
    }

    const calculateTotal = () => {
        const allItems = [...groups.electronic, ...groups.mechanical, ...groups.other];
        return allItems.reduce((sum, item) => sum + (Number(item.priceKRW || 0) * item.qty), 0);
    };

    const generatePDF = () => {
        setIsGenerating(true);
        try {
            const doc = new jsPDF('l', 'mm', 'a4');

            doc.setFontSize(22);
            doc.text(header.title, 14, 20);

            doc.setFontSize(10);
            doc.text(`Company: ${header.company}`, 14, 30);
            doc.text(`Manager: ${header.manager}`, 14, 35);
            doc.text(`Date: ${header.date}`, 14, 40);

            let currentY = 45;

            const tableConfig = {
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    0: { cellWidth: 10 },
                    7: { halign: 'right' },
                    8: { halign: 'right' },
                    9: { halign: 'right' },
                    10: { halign: 'right' }
                }
            };

            const renderGroup = (title, items, color) => {
                if (items.length === 0) return;
                
                doc.setFontSize(12);
                doc.setTextColor(color[0], color[1], color[2]);
                doc.text(title, 14, currentY + 5);
                currentY += 8;

                const tableRows = items.map((item, index) => [
                    index + 1,
                    item.PartID || '-',
                    item.Name || '-',
                    item.Spec || '-',
                    item.Maker || '-',
                    item.Circuit || '-',
                    item.Location || item.Note || '-',
                    item.qty,
                    `$${Number(item.priceUSD || 0).toLocaleString()}`,
                    `₩${Number(item.priceKRW || 0).toLocaleString()}`,
                    `₩${(Number(item.priceKRW || 0) * item.qty).toLocaleString()}`
                ]);

                doc.autoTable({
                    startY: currentY,
                    head: [['No', 'Part No', 'Name', 'Spec', '공급사', 'Circuit', 'Loc/Note', 'Qty', 'USD', 'KRW', 'Total']],
                    body: tableRows,
                    ...tableConfig,
                    didDrawPage: (data) => {
                        currentY = data.cursor.y;
                    }
                });
                currentY += 10;
            };

            // Order: Electronic -> Mechanical -> Others
            renderGroup('1. 회로 파트 (Electronic Parts)', groups.electronic, [16, 185, 129]);
            renderGroup('2. 기구 파트 (Mechanical Parts)', groups.mechanical, [245, 158, 11]);
            renderGroup('3. 기타 자재 (Other Parts)', groups.other, [100, 116, 139]);

            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text(`GRAND TOTAL: ₩${calculateTotal().toLocaleString()}`, 280, currentY + 5, { align: 'right' });

            doc.save(`${header.title}.pdf`);
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("PDF 생성 중 오류가 발생했습니다.");
        } finally {
            setIsGenerating(false);
        }
    };

    if (!isOpen) return null;

    const renderTableSection = (title, items, themeColor) => (
        <div className="space-y-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-l-4 ${themeColor.border} ${themeColor.bg}`}>
                <span className={`text-xs font-black uppercase tracking-widest ${themeColor.text}`}>{title}</span>
                <span className="text-[10px] font-bold opacity-50">({items.length} items)</span>
            </div>
            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left text-[11px] font-bold text-slate-600 border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                            <th className="px-4 py-3 text-center w-10">No</th>
                            <th className="px-4 py-3 w-32">Part No</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Spec</th>
                            <th className="px-2 py-3 text-center">Qty</th>
                            <th className="px-4 py-3 text-right">Total (KRW)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {items.map((item, idx) => (
                            <tr key={item.PartID} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2.5 text-center text-slate-300 font-mono text-[9px]">{idx + 1}</td>
                                <td className="px-4 py-2.5 font-mono text-blue-600 text-[10px]">{item.PartID}</td>
                                <td className="px-4 py-2.5 text-slate-700">{item.Name}</td>
                                <td className="px-4 py-2.5 text-slate-400 text-[10px] truncate max-w-[250px]">{item.Spec}</td>
                                <td className="px-4 py-2.5 text-center font-black">{item.qty}</td>
                                <td className="px-4 py-2.5 text-right font-black text-slate-800 font-mono">
                                    ₩{(item.qty * (item.priceKRW || 0)).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-slate-50 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b bg-white border-slate-200 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 italic">PDF Export Preview</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grouped Part List Generation</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    {/* Header Edit Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</label>
                            <input type="text" value={header.company} onChange={e => setHeader({...header, company: e.target.value})} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm font-bold" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manager</label>
                            <input type="text" value={header.manager} onChange={e => setHeader({...header, manager: e.target.value})} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm font-bold" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                            <input type="text" value={header.date} onChange={e => setHeader({...header, date: e.target.value})} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm font-bold" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Title</label>
                            <input type="text" value={header.title} onChange={e => setHeader({...header, title: e.target.value})} className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-sm font-bold" />
                        </div>
                    </div>

                    {/* Grouped Tables */}
                    {groups.electronic.length > 0 && renderTableSection('1. 회로 파트 (Electronic Parts)', groups.electronic, { border: 'border-emerald-500', bg: 'bg-emerald-50/50', text: 'text-emerald-700' })}
                    {groups.mechanical.length > 0 && renderTableSection('2. 기구 파트 (Mechanical Parts)', groups.mechanical, { border: 'border-amber-500', bg: 'bg-amber-50/50', text: 'text-amber-700' })}
                    {groups.other.length > 0 && renderTableSection('3. 기타 자재 (Other Parts)', groups.other, { border: 'border-slate-400', bg: 'bg-slate-100/50', text: 'text-slate-600' })}
                </div>

                {/* Footer */}
                <div className="p-6 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">Estimated Grand Total</span>
                        <span className="text-2xl font-black text-emerald-600">₩ {calculateTotal().toLocaleString()}</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-6 py-3 border-2 border-slate-200 text-slate-500 font-black rounded-2xl hover:bg-slate-50 transition-all">Cancel</button>
                        <button
                            onClick={generatePDF}
                            disabled={isGenerating}
                            className="flex items-center gap-3 bg-blue-600 text-white font-black px-8 py-3 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                        >
                            <Download size={20} />
                            <span>{isGenerating ? 'Generating PDF...' : 'Download PDF'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
