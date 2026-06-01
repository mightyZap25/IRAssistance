import React, { useRef } from 'react';
import { Layers, FileUp, Download } from 'lucide-react';
import BOMTree from './BOMTree';
import * as XLSX from 'xlsx';

/**
 * BOMStructurePanel Component
 * Encapsulates the BOM tree visualization and its action buttons.
 */
const BOMStructurePanel = ({ 
    bomData, 
    isEditMode, 
    onNodeClick, 
    allParts,
    expandAllTrigger,
    collapseAllTrigger,
    onExpandAll,
    onCollapseAll,
    onQtyChange,
    onLocationChange,
    onNoteChange,
    onDelete,
    onAddChild,
    showObsolete,
    diffData,
    onReorder
}) => {
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

            // Assume Header: PartID, Quantity, Loc/Note
            data.slice(1).forEach(row => {
                const pId = String(row[0] || '').trim();
                const qty = parseInt(row[1], 10) || 1;
                const locOrNote = String(row[2] || '').trim();
                
                if (pId) {
                    const targetPart = allParts.find(p => p.PartID === pId || p.Name === pId);
                    if (targetPart) {
                        const isElec = (targetPart.Category || '').includes('전자') || (targetPart.PartID || '').startsWith('IRE');
                        onAddChild(bomData.PartID, targetPart.PartID, qty, isElec ? locOrNote : '', !isElec ? locOrNote : '');
                    }
                }
            });
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            {/* Panel Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="font-black text-slate-800 flex items-center gap-2">
                        <Layers size={18} className="text-blue-600" />
                        BOM Assembly Structure
                    </h2>
                    {isEditMode && (
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                            <button 
                                onClick={() => fileInputRef.current.click()}
                                className="flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100 transition-all uppercase tracking-tight"
                                title="Excel 파일 업로드로 대량 부품 추가"
                            >
                                <FileUp size={14} /> 일괄 업로드
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileUpload} 
                                className="hidden" 
                                accept=".xlsx, .xls, .csv" 
                            />
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={onExpandAll}
                        className="text-xs font-bold px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        모두 펼치기
                    </button>
                    <button 
                        onClick={onCollapseAll}
                        className="text-xs font-bold px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        모두 접기
                    </button>
                </div>
            </div>

            {/* Tree Area */}
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                <BOMTree 
                    data={bomData} 
                    isEditing={isEditMode}
                    onNodeClick={onNodeClick}
                    allParts={allParts}
                    expandAllTrigger={expandAllTrigger}
                    collapseAllTrigger={collapseAllTrigger}
                    onQtyChange={onQtyChange}
                    onLocationChange={onLocationChange}
                    onNoteChange={onNoteChange}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    showObsolete={showObsolete}
                    diffData={diffData}
                    onReorder={onReorder}
                />
            </div>
        </div>
    );
};

export default BOMStructurePanel;
