import React, { useState, useEffect, useRef } from 'react';
import { 
    ChevronRight, ChevronDown, Layers, Box, Cpu, Settings, Circle, Trash2, Plus, X, 
    RotateCcw, Ban, Clock, DollarSign, Image as ImageIcon, GripVertical, FileSpreadsheet
} from 'lucide-react';
import { 
    DndContext, 
    closestCenter, 
    KeyboardSensor, 
    PointerSensor, 
    useSensor, 
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as XLSX from 'xlsx';

// Helper to determine icon/color based on category/partID
function getCategoryStyle(part) {
    const cat = (part.Category || '').toLowerCase();
    const pid = (part.PartID || '').toUpperCase();
    const isAssy = (part.Class || '').includes('Assembly') || pid.startsWith('IRA');
    const isProduct = (part.Class || '').includes('Product') || pid.startsWith('IRP');

    const isElectronic = pid.startsWith('IRE') || cat.includes('electronic') || cat.includes('전자');
    const isMechanical = pid.startsWith('IRM') || cat.includes('mech') || cat.includes('기구');

    if (isProduct) return { color: 'bg-blue-600', char: 'P', text: 'text-blue-700' };

    if (isElectronic) {
        if (isAssy) return { color: 'bg-emerald-500', char: 'E', text: 'text-emerald-700' }; // 회로 어셈블리 (녹색 배경)
        return { color: 'bg-slate-400', char: 'E', text: 'text-emerald-600' };             // 회로 부품 (회색 배경)
    }
    
    if (isMechanical) {
        if (isAssy) return { color: 'bg-orange-500', char: 'M', text: 'text-orange-700' };  // 기구 어셈블리 (주황색 배경)
        return { color: 'bg-slate-400', char: 'M', text: 'text-slate-700' };               // 기구 부품 (회색 배경, 회색 폰트)
    }

    if (isAssy) return { color: 'bg-amber-500', char: 'A', text: 'text-amber-700' };       // 기타 일반 조립품
    return { color: 'bg-slate-400', char: 'P', text: 'text-slate-700' };                   // 기타 일반 부품
}

function BOMTreeNode({ 
    node, 
    level = 0, 
    isEditing, 
    onQtyChange, 
    onLocationChange, 
    onNoteChange, 
    onDelete, 
    onAddChild, 
    onNodeClick, 
    allParts = [], 
    expandAllTrigger, 
    collapseAllTrigger,
    inheritedReadOnly = false,
    showObsolete = false,
    parentPath = [],
    diffData = null,
    onReorder
}) {
    const [expanded, setExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const currentPath = [...parentPath, node.PartID];

    // DnD Hooks
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: node.PartID, disabled: !isEditing || level === 0 });

    const dndStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // Explicit Expand All - Triggered whenever expandAllTrigger changes
    useEffect(() => {
        if (expandAllTrigger > 0) {
            setExpanded(true);
        }
    }, [expandAllTrigger]);

    // Explicit Collapse All - Triggered whenever collapseAllTrigger changes
    useEffect(() => {
        if (collapseAllTrigger > 0) {
            setExpanded(false);
        }
    }, [collapseAllTrigger]);

    // Draft state for new child
    const [draftCat, setDraftCat] = useState('전체');
    const [draftPartID, setDraftPartID] = useState('');
    const [draftQty, setDraftQty] = useState(1);
    const [draftLocation, setDraftLocation] = useState('');
    const [draftNote, setDraftNote] = useState('');

    const hasChildren = node.Children && node.Children.length > 0;
    const style = getCategoryStyle(node);
    const isRoot = level === 0;

    // Diff Styling
    const diff = diffData?.find(d => d.partId === node.PartID);
    let diffBg = '';
    let diffBorder = 'border-slate-50';
    
    if (node.isCircular) {
        diffBg = 'bg-red-100';
        diffBorder = 'border-red-400';
    } else if (diff) {
        if (diff.type === 'added') {
            diffBg = 'bg-emerald-50/50';
            diffBorder = 'border-emerald-200';
        } else if (diff.type === 'removed') {
            diffBg = 'bg-rose-50/50';
            diffBorder = 'border-rose-200';
        } else if (diff.type === 'modified') {
            diffBg = 'bg-amber-50/50';
            diffBorder = 'border-amber-200';
        }
    }

    // Only allow editing children if this is not the root node and not in a readonly subtree
    const canEditThisNode = isEditing && level > 0 && !inheritedReadOnly;
    const isDeleted = node.isDeleted || diff?.type === 'removed';
    const isDiscontinued = node.isDiscontinued;
    const isNew = node.isNew || diff?.type === 'added';

    const categories = ['전체', '조립품 (A)', '기구부품 (M)', '전자부품 (E)', '구매품 (O)'];

    const filteredParts = allParts.filter(p => {
        if (!p) return false;
        if (draftCat === '전체') return true;
        const pCat = (p.Category || '').toUpperCase();
        const pID = (p.PartID || '').toUpperCase();
        const pClass = (p.Class || '').toUpperCase();
        
        const getCode = (str) => {
            const m = str.match(/\(([MAEO])\)/);
            return m ? m[1] : '';
        };
        const targetCode = getCode(draftCat);
        const partCode = getCode(pCat);
        const idCode = pID.charAt(2);
        
        if (targetCode === 'A') return idCode === 'A' || pClass.includes('ASSEMBLY') || pCat.includes('ASSY');
        return (targetCode && (partCode === targetCode || idCode === targetCode)) ||
            (pCat.includes(draftCat.split(' ')[0].toUpperCase())) ||
            (pCat === draftCat.toUpperCase());
    });

    const isElectronic = (node.Category || '').includes('전자') || (node.PartID || '').startsWith('IRE');
    const canAddChild = node.PartID?.startsWith('IRP') || node.PartID?.startsWith('IRA') || (node.Category || '').includes('조립품') || (node.Category || '').includes('완제품');

    // 하위 조립품 여부 판단
    const isSubAssembly = level > 0 && canAddChild;
    const passReadOnlyToChildren = inheritedReadOnly || isSubAssembly;

    const handleAddSubmit = () => {
        if (!draftPartID) {
            alert('추가할 부품을 선택해주세요.');
            return;
        }

        if (currentPath.includes(draftPartID)) {
            alert(`[순환 참조 감지] ${draftPartID} 부품은 현재 상위 경로에 이미 존재합니다.`);
            return;
        }

        const selectedPart = allParts.find(p => p.PartID === draftPartID);
        const isSelectedElectronic = (selectedPart?.Category || '').includes('전자') || (draftPartID || '').startsWith('IRE');

        onAddChild(node.PartID, draftPartID, draftQty, isSelectedElectronic ? draftLocation : '', !isSelectedElectronic ? draftNote : '');
        
        setIsAdding(false);
        setDraftPartID('');
        setDraftQty(1);
        setDraftLocation('');
        setDraftNote('');
    };

    const handleMouseEnter = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ x: rect.right + 10, y: rect.top });
        setShowTooltip(true);
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    const handleExcelPaste = async (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        if (!text) return;

        // Simple Tab-separated value parsing (Excel copy format)
        const rows = text.split('\n').filter(r => r.trim());
        for (const row of rows) {
            const cols = row.split('\t');
            if (cols.length >= 2) {
                const pId = cols[0].trim();
                const qty = parseInt(cols[1].trim(), 10) || 1;
                const locOrNote = cols[2] ? cols[2].trim() : '';
                
                const targetPart = allParts.find(p => p.PartID === pId || p.Name === pId);
                if (targetPart) {
                    const isElec = (targetPart.Category || '').includes('전자') || (targetPart.PartID || '').startsWith('IRE');
                    onAddChild(node.PartID, targetPart.PartID, qty, isElec ? locOrNote : '', !isElec ? locOrNote : '');
                }
            }
        }
    };

    const renderTooltip = () => {
        if (!showTooltip) return null;
        const fullPart = allParts.find(p => p.PartID === node.PartID) || node;
        let specs = [];
        try {
            if (fullPart.Spec && typeof fullPart.Spec === 'string' && fullPart.Spec.startsWith('[')) {
                specs = JSON.parse(fullPart.Spec);
            }
        } catch(e) {}

        return (
            <div 
                className="fixed z-[100] w-64 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 pointer-events-none animate-in fade-in zoom-in duration-200"
                style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
                {node.isCircular && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-1">
                        <div className="flex items-center gap-2 mb-1">
                            <Ban size={14} className="text-red-600" />
                            <span className="text-xs font-black text-red-600 uppercase">순환 참조 오류</span>
                        </div>
                        <p className="text-[11px] font-bold text-red-600 leading-snug">
                            자기 자신 또는 상위 조립품을 하위 부품으로 포함하고 있습니다. 이 항목을 삭제해야 구조가 정상화됩니다.
                        </p>
                    </div>
                )}
                {fullPart.Thumbnail ? (
                    <div className="w-full aspect-square rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
                        <img src={fullPart.Thumbnail} alt={fullPart.Name} className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div className="w-full aspect-square rounded-xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-slate-300 gap-2">
                        <ImageIcon size={32} />
                        <span className="text-[10px] font-bold">No Image</span>
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-black text-blue-500 font-mono tracking-tighter uppercase">{fullPart.PartID}</div>
                    <div className="text-sm font-black text-slate-800 leading-tight">{fullPart.Name}</div>
                </div>
                {specs.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
                        {specs.slice(0, 5).map((s, i) => (
                            <div key={i} className="flex justify-between items-center gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase truncate w-16">{s.label}</span>
                                <span className="text-[10px] font-bold text-slate-600 truncate flex-1 text-right">{s.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div 
            ref={setNodeRef} 
            style={dndStyle} 
            className={`select-none ${isDeleted || isDiscontinued ? 'opacity-50' : ''}`}
        >
            <div
                className={`flex items-center py-1 px-1 hover:bg-slate-50 border-b ${diffBorder} transition-colors ${isRoot ? 'bg-slate-50/50' : ''} ${diffBg} ${isDeleted ? 'bg-red-50/30' : ''}`}
            >
                {/* Drag Handle */}
                {isEditing && level > 0 && (
                    <div {...attributes} {...listeners} className="w-4 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 mr-1">
                        <GripVertical size={14} />
                    </div>
                )}

                {/* Toggle */}
                {!isRoot && (
                    <div className="w-4 flex items-center justify-center shrink-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(!expanded);
                            }}
                            className={`w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 transition-transform ${hasChildren ? 'visible' : 'invisible'}`}
                        >
                            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                    </div>
                )}

                {/* Badge (Text based) */}
                <div className={`w-5 h-5 flex items-center justify-center shrink-0 rounded-md ${isDeleted || isDiscontinued ? 'bg-slate-300' : style.color} text-white shadow-sm ${isRoot ? 'ml-0 mr-1.5' : 'mr-1.5'}`}>
                    <span className="text-[10px] font-black">{style.char}</span>
                </div>

                <div
                    className={`flex-1 flex flex-col justify-center overflow-hidden ${!isEditing ? 'cursor-pointer hover:opacity-80' : ''} text-left`}
                    onClick={() => !isEditing && onNodeClick && onNodeClick(node)}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="flex-1 flex justify-between items-center overflow-hidden">
                        <div className="flex flex-col py-0.5 justify-center overflow-hidden text-left">
                            <div className="flex items-center gap-1.5 leading-none">
                                <span className={`text-[9px] font-black font-mono tracking-tighter ${style.text}`}>
                                    {node.PartID}
                                </span>
                                {node.isCircular && (
                                    <span className="text-[8px] bg-red-600 text-white px-1 py-0.5 rounded-full font-black animate-pulse whitespace-nowrap leading-none">
                                        [⚠️ 순환 참조]
                                    </span>
                                )}
                                {diff?.type === 'modified' && (
                                    <span className="text-[8px] bg-amber-100 text-amber-600 px-1 rounded font-black uppercase leading-none" title={diff.details}>Modified</span>
                                )}
                                {isNew && (
                                    <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1 rounded font-black uppercase tracking-tighter leading-none">Added</span>
                                )}
                            </div>
                            <span className={`text-xs font-bold mt-0.5 truncate ${isDeleted ? 'text-slate-400 line-through decoration-red-500' : isDiscontinued ? 'text-amber-600/70' : style.text} ${node.isCircular ? 'text-red-600' : ''}`}>
                                {node.Name}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2 pr-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                <DollarSign size={8} />
                                {new Intl.NumberFormat('ko-KR').format(node.TotalCost || 0)}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 ml-4">
                    {canEditThisNode ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder={isElectronic ? "PCB Loc..." : "Add note..."}
                                value={(isElectronic ? node.Location : node.Note) || ''}
                                disabled={isDeleted || node.isCircular}
                                onChange={(e) => isElectronic ? onLocationChange(node.PartID, e.target.value) : onNoteChange(node.PartID, e.target.value)}
                                className={`w-32 px-2 py-1 text-[10px] font-bold border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none ${isDeleted || node.isCircular ? 'bg-slate-50 text-slate-300' : 'bg-white'}`}
                            />

                            <input
                                type="number"
                                value={node.Quantity || 0}
                                disabled={isDeleted || node.isCircular}
                                onChange={(e) => onQtyChange(node.PartID, parseInt(e.target.value, 10) || 0)}
                                className={`w-12 px-1 py-1 text-center text-[10px] font-bold border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none ${isDeleted || node.isCircular ? 'bg-slate-50 text-slate-300' : 'bg-white'}`}
                            />

                            <div className="flex items-center gap-1">
                                {isDeleted ? (
                                    <button onClick={() => onDelete(node.PartID, isNew, 'restore')} className="p-1 px-1.5 rounded bg-blue-50 text-blue-500 hover:bg-blue-100">
                                        <RotateCcw size={12} />
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={() => onDelete(node.PartID, isNew, 'discontinue')} className="p-1 px-1.5 rounded bg-amber-50 text-amber-500 hover:bg-amber-100" disabled={node.isCircular}>
                                            <Ban size={12} />
                                        </button>
                                        <button onClick={() => onDelete(node.PartID, isNew, 'delete')} className="p-1 px-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100">
                                            <Trash2 size={12} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-bold text-slate-500">{isElectronic ? node.Location : node.Note}</span>
                            <div className="px-1.5 text-right min-w-[36px]">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border ${isDeleted ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-white text-slate-500 border-slate-100'}`}>
                                    {node.Quantity || (isRoot ? 1 : 0)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                {renderTooltip()}
            </div>

            {expanded && (
                <div className={`border-l border-slate-200/60 ${isRoot ? 'ml-[10px]' : 'ml-[12px]'}`}>
                    {hasChildren && (
                        <SortableContext 
                            items={node.Children.map(c => c.PartID)} 
                            strategy={verticalListSortingStrategy}
                        >
                            {node.Children.map((child, idx) => (
                                <BOMTreeNode
                                    key={`${child.PartID}-${idx}`}
                                    node={child}
                                    level={level + 1}
                                    isEditing={isEditing}
                                    onQtyChange={onQtyChange}
                                    onLocationChange={onLocationChange}
                                    onNoteChange={onNoteChange}
                                    onDelete={onDelete}
                                    onAddChild={onAddChild}
                                    onNodeClick={onNodeClick}
                                    allParts={allParts}
                                    expandAllTrigger={expandAllTrigger}
                                    collapseAllTrigger={collapseAllTrigger}
                                    inheritedReadOnly={passReadOnlyToChildren}
                                    showObsolete={showObsolete}
                                    parentPath={currentPath}
                                    diffData={diffData}
                                    onReorder={(oldIdx, newIdx) => onReorder(node.PartID, oldIdx, newIdx)}
                                />
                            ))}
                        </SortableContext>
                    )}

                    {isEditing && canAddChild && !passReadOnlyToChildren && !node.isCircular && (
                        <div className="flex flex-col gap-1 py-1">
                            {isAdding ? (
                                <div className="flex items-center py-1 px-1 bg-blue-50/50 border border-blue-100 rounded-lg my-0.5" onPaste={handleExcelPaste}>
                                    <select
                                        value={draftCat}
                                        onChange={e => { setDraftCat(e.target.value); setDraftPartID(''); }}
                                        className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-1 bg-white w-24"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <select
                                        value={draftPartID}
                                        onChange={e => setDraftPartID(e.target.value)}
                                        className="flex-1 text-[10px] font-bold border border-slate-200 rounded px-1.5 py-1 bg-white mx-1"
                                    >
                                        <option value="" disabled>부품 선택</option>
                                        {filteredParts.map(p => <option key={p.PartID} value={p.PartID}>{p.Name} [{p.PartID}]</option>)}
                                    </select>
                                    <input type="number" value={draftQty} onChange={e => setDraftQty(parseInt(e.target.value, 10) || 1)} className="w-12 text-center text-[10px] font-bold border border-slate-200 rounded px-1 py-1 mr-1" />
                                    <button onClick={handleAddSubmit} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700">추가</button>
                                    <button onClick={() => setIsAdding(false)} className="px-1.5 py-1 text-slate-400 ml-1"><X size={14} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsAdding(true)}
                                        className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-[10px] font-black text-blue-600 hover:text-white hover:bg-blue-500 rounded border border-blue-100 uppercase tracking-wider transition-colors"
                                    >
                                        <Plus size={12} /> Add Child
                                    </button>
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400 italic">
                                        <FileSpreadsheet size={10} />
                                        Excel Paste Support (Ctrl+V)
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function BOMTree({ 
    data, 
    isEditing, 
    onQtyChange, 
    onLocationChange, 
    onNoteChange, 
    onDelete, 
    onAddChild, 
    onNodeClick, 
    allParts, 
    expandAllTrigger, 
    collapseAllTrigger,
    showObsolete = false,
    diffData = null,
    onReorder
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    if (!data) return <div className="p-8 text-center text-slate-400 font-bold italic">구조 데이터가 없습니다.</div>;

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            // Find parent and indices
            const findParentAndIndices = (node) => {
                if (!node.Children) return null;
                const oldIdx = node.Children.findIndex(c => c.PartID === active.id);
                const newIdx = node.Children.findIndex(c => c.PartID === over.id);
                if (oldIdx !== -1 && newIdx !== -1) return { parentId: node.PartID, oldIdx, newIdx };
                for (let child of node.Children) {
                    const res = findParentAndIndices(child);
                    if (res) return res;
                }
                return null;
            };

            const result = findParentAndIndices(data);
            if (result && onReorder) {
                onReorder(result.parentId, result.oldIdx, result.newIdx);
            }
        }
    };

    return (
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragEnd={handleDragEnd}
        >
            <div className="overflow-x-auto pb-4">
                <BOMTreeNode
                    node={data}
                    level={0}
                    isEditing={isEditing}
                    onQtyChange={onQtyChange}
                    onLocationChange={onLocationChange}
                    onNoteChange={onNoteChange}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onNodeClick={onNodeClick}
                    allParts={allParts}
                    expandAllTrigger={expandAllTrigger}
                    collapseAllTrigger={collapseAllTrigger}
                    showObsolete={showObsolete}
                    parentPath={[]}
                    diffData={diffData}
                    onReorder={onReorder}
                />
            </div>
        </DndContext>
    );
}