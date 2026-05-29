import React from 'react';
import { Layers } from 'lucide-react';
import BOMTree from './BOMTree';

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
    showObsolete
}) => {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            {/* Panel Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                <h2 className="font-black text-slate-800 flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    BOM Assembly Structure
                </h2>
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
                />
            </div>
        </div>
    );
};

export default BOMStructurePanel;
