import React, { useState, useEffect } from 'react';
import { X, Search, FileText, Download } from 'lucide-react';

export default function BOMPartListModal({ isOpen, onClose, rootPart, bomData }) {
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && bomData) {
            const flattened = flattenBOM(bomData);
            setItems(flattened);
        }
    }, [isOpen, bomData]);

    // Recursive function to flatten BOM and aggregate quantities
    function flattenBOM(node, multiplier = 1, result = {}) {
        if (!node || !node.Children) return [];

        node.Children.forEach(child => {
            const qty = (Number(child.Quantity) || 0) * multiplier;

            if (child.Children && child.Children.length > 0) {
                flattenBOM(child, qty, result);
            } else {
                // It's a leaf part
                if (result[child.PartID]) {
                    result[child.PartID].qty += qty;
                } else {
                    result[child.PartID] = {
                        ...child,
                        qty: qty
                    };
                }
            }
        });

        return Object.values(result).sort((a, b) => (a.PartID || '').localeCompare(b.PartID || ''));
    }

    const filteredItems = items.filter(item => 
        item.PartID?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.Spec?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 italic">Aggregated Part List</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Total unique items for <span className="text-indigo-600">{rootPart?.Name}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                type="text"
                                placeholder="Search parts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 transition-all"
                            />
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all shadow-sm">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                        <table className="w-full text-left text-[12px] font-bold text-slate-600 border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                    <th className="px-4 py-4 text-center w-12">No</th>
                                    <th className="px-4 py-4">Part ID</th>
                                    <th className="px-4 py-4">Name</th>
                                    <th className="px-4 py-4">Specification</th>
                                    <th className="px-4 py-4">Maker</th>
                                    <th className="px-4 py-4 text-center">Total Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredItems.map((item, idx) => (
                                    <tr key={item.PartID} className="hover:bg-indigo-50/30 transition-colors group">
                                        <td className="px-4 py-3 text-center text-slate-300 font-mono text-[10px]">{idx + 1}</td>
                                        <td className="px-4 py-3 font-mono text-indigo-600">{item.PartID}</td>
                                        <td className="px-4 py-3 text-slate-700">{item.Name}</td>
                                        <td className="px-4 py-3 text-slate-500 text-[11px] font-medium">{item.Spec || '-'}</td>
                                        <td className="px-4 py-3 text-slate-400">{item.Maker || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[11px] font-black min-w-[40px] inline-block">
                                                {item.qty}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredItems.length === 0 && (
                            <div className="p-12 text-center text-slate-400 italic font-bold">No parts matching your search.</div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                    <div className="text-sm font-bold text-slate-500">
                        Total Unique Items: <span className="text-slate-800">{items.length}</span>
                    </div>
                    <button 
                        onClick={onClose}
                        className="px-8 py-2.5 bg-slate-800 text-white font-black rounded-xl hover:bg-slate-900 transition-all uppercase text-xs tracking-widest shadow-lg shadow-slate-100"
                    >
                        Close View
                    </button>
                </div>
            </div>
        </div>
    );
}
