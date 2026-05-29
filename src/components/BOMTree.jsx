import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Layers, Box, Cpu, Settings, Circle, Trash2, Plus, X, RotateCcw, Ban } from 'lucide-react';

// Helper to determine icon/color based on category/partID
function getCategoryStyle(part) {
    const cat = (part.Category || '').toLowerCase();
    const pid = (part.PartID || '').toUpperCase();

    if (pid.startsWith('IRP') || cat.includes('product')) return { icon: Box, color: 'bg-blue-600', char: 'P', text: 'text-blue-600' };
    if (pid.startsWith('IRA') || cat.includes('assy')) return { icon: Layers, color: 'bg-amber-500', char: 'A', text: 'text-amber-600' };
    if (pid.startsWith('IRE') || cat.includes('electronic')) return { icon: Cpu, color: 'bg-emerald-500', char: 'E', text: 'text-emerald-500' };
    if (pid.startsWith('IRM') || cat.includes('mech')) return { icon: Settings, color: 'bg-orange-500', char: 'M', text: 'text-orange-500' };

    return { icon: Circle, color: 'bg-slate-400', char: 'O', text: 'text-slate-400' };
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
    showObsolete = false
}) {
    const [expanded, setExpanded] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

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

    // Only allow editing children if this is not the root node and not in a readonly subtree
    const canEditThisNode = isEditing && level > 0 && !inheritedReadOnly;
    const isDeleted = node.isDeleted;
    const isDiscontinued = node.isDiscontinued;
    const isNew = node.isNew;

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

    // 하위 조립품 여부 판단: 루트(레벨0)가 아닌데 조립품인 경우, 그 하위의 자식들은 모두 읽기 전용이어야 함
    const isSubAssembly = level > 0 && canAddChild;
    const passReadOnlyToChildren = inheritedReadOnly || isSubAssembly;

    const handleAddSubmit = () => {
        if (!draftPartID) {
            alert('추가할 부품을 선택해주세요.');
            return;
        }
        const selectedPart = allParts.find(p => p.PartID === draftPartID);
        const isSelectedElectronic = (selectedPart?.Category || '').includes('전자') || (draftPartID || '').startsWith('IRE');

        onAddChild(node.PartID, draftPartID, draftQty, isSelectedElectronic ? draftLocation : '', !isSelectedElectronic ? draftNote : '');
        
        // Reset and close
        setIsAdding(false);
        setDraftPartID('');
        setDraftQty(1);
        setDraftLocation('');
        setDraftNote('');
    };

    return (
        <div className={`select-none ${isDeleted || isDiscontinued ? 'opacity-50' : ''}`}>
            <div
                className={`flex items-center py-1 px-1 hover:bg-slate-50 border-b border-slate-50 transition-colors ${isRoot ? 'bg-slate-50/50' : ''} ${isDeleted ? 'bg-red-50/30' : ''} ${isDiscontinued ? 'bg-amber-50/20' : ''}`}
                style={{ paddingLeft: `0px` }}
            >
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

                {/* Badge */}
                <div className={`w-5 flex items-center justify-center shrink-0 ${isRoot ? 'ml-0 mr-1' : 'mr-1'}`}>
                    <span className={`w-4 h-4 flex items-center justify-center rounded ${isDeleted || isDiscontinued ? 'bg-slate-300' : style.color} text-white text-[9px] font-black shadow-sm`}>
                        {style.char}
                    </span>
                </div>

                <div
                    className={`flex-1 flex flex-col justify-center overflow-hidden ${!isEditing ? 'cursor-pointer hover:opacity-80' : ''} text-left`}
                    onClick={() => !isEditing && onNodeClick && onNodeClick(node)}
                >
                    <div className="flex items-baseline gap-2 overflow-hidden justify-start">
                        <span className={`text-xs font-bold truncate ${isDeleted ? 'text-slate-400 line-through decoration-red-500' : isDiscontinued ? 'text-amber-600/70' : (style.char === 'P' ? 'text-blue-600 font-black' : 'text-slate-700')}`}>
                            {node.Name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">[{node.PartID}]</span>
                        
                        {/* 상태 뱃지 */}
                        {(node.Lifecycle || node.Status) ? (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border shrink-0 ${
                                (node.Lifecycle || node.Status) === 'Draft' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                (node.Lifecycle || node.Status) === 'ECN' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                ((node.Lifecycle || node.Status) === 'Obsolete' || (node.Lifecycle || node.Status) === 'Discontinued' || isDiscontinued) ? 'bg-red-50 text-red-600 border-red-100' :
                                'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}>
                                {(node.Lifecycle || node.Status) === 'Draft' ? '대기' :
                                 (node.Lifecycle || node.Status) === 'ECN' ? '설계변경' :
                                 ((node.Lifecycle || node.Status) === 'Obsolete' || (node.Lifecycle || node.Status) === 'Discontinued' || isDiscontinued) ? '단종' : '양산'}
                            </span>
                        ) : (
                            isDiscontinued && <span className="text-[9px] bg-red-50 text-red-600 border-red-100 px-1.5 py-0.5 rounded font-black">단종</span>
                        )}

                        {isNew && <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded font-black uppercase tracking-tighter">New</span>}
                    </div>
                </div>

                {/* Location/Note, Qty & Actions */}
                <div className="flex items-center gap-4 ml-4">
                    {canEditThisNode ? (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 min-w-[120px]">
                                <span className="text-[8px] font-black text-slate-300 uppercase w-7">{isElectronic ? 'Loc' : 'Note'}</span>
                                <input
                                    type="text"
                                    placeholder={isElectronic ? "PCB Loc..." : "Add note..."}
                                    value={(isElectronic ? node.Location : node.Note) || ''}
                                    disabled={isDeleted || isDiscontinued}
                                    onChange={(e) => isElectronic ? onLocationChange(node.PartID, e.target.value) : onNoteChange(node.PartID, e.target.value)}
                                    className={`w-32 px-2 py-1 text-[10px] font-bold border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none ${isDeleted || isDiscontinued ? 'bg-slate-50 text-slate-300 shadow-none' : 'bg-white shadow-sm'}`}
                                />
                            </div>

                            <div className="flex items-center gap-1">
                                <span className="text-[8px] font-black text-slate-300 uppercase">Qty</span>
                                <input
                                    type="number"
                                    value={node.Quantity || 0}
                                    disabled={isDeleted || isDiscontinued}
                                    onChange={(e) => onQtyChange(node.PartID, parseInt(e.target.value, 10) || 0)}
                                    className={`w-12 px-1 py-1 text-center text-[10px] font-bold border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none ${isDeleted || isDiscontinued ? 'bg-slate-50 text-slate-300' : 'bg-white'}`}
                                />
                            </div>

                            {isDeleted || isDiscontinued ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(node.PartID, isNew, 'restore');
                                    }}
                                    className="p-1 px-1.5 rounded bg-blue-50 text-blue-500 hover:bg-blue-100 shadow-sm"
                                >
                                    <RotateCcw size={12} />
                                </button>
                            ) : (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(node.PartID, isNew, 'discontinue');
                                        }}
                                        className="p-1 px-1.5 rounded bg-amber-50 text-amber-500 hover:bg-amber-100 shadow-sm"
                                    >
                                        <Ban size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(node.PartID, isNew, 'delete');
                                        }}
                                        className="p-1 px-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 shadow-sm"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            {isElectronic ? (
                                node.Location && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100/50 rounded-full border border-slate-200/50">
                                        <span className="text-[8px] font-black text-slate-400 uppercase">Loc</span>
                                        <span className="text-[10px] font-mono font-bold text-slate-600 italic tracking-tighter">{node.Location}</span>
                                    </div>
                                )
                            ) : (
                                node.Note && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-50/50 rounded-full border border-orange-200/50">
                                        <span className="text-[8px] font-black text-orange-400 uppercase">Note</span>
                                        <span className="text-[10px] font-bold text-slate-600 italic tracking-tighter">{node.Note}</span>
                                    </div>
                                )
                            )}
                            <div className="px-4 text-right min-w-[60px]">
                                <span className={`text-xs font-bold px-2 py-1 rounded shadow-sm border ${isDeleted ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-white text-slate-500 border-slate-100'}`}>
                                    {node.Quantity || (isRoot ? 1 : 0)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Children & Adding Row */}
            {expanded && (
                <div className={`border-l border-slate-200/60 ${isRoot ? 'ml-[14px]' : 'ml-[8px]'}`}>
                    {hasChildren && node.Children
                        .filter(child => {
                            if (showObsolete) return true;
                            const status = (child.Lifecycle || child.Status || '').toLowerCase();
                            const isObsolete = child.isDiscontinued || status === 'obsolete' || status === 'discontinued';
                            return !isObsolete;
                        })
                        .map((child, idx) => (
                            <BOMTreeNode
                                key={`${child.PartID}-${level + 1}-${idx}`}
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
                            />
                        ))}

                    {isEditing && isAdding && canAddChild && !passReadOnlyToChildren && (
                        <div
                            className="flex items-center py-1 px-1 bg-blue-50/50 border-b border-blue-100/50 rounded-lg my-0.5 shadow-sm overflow-hidden"
                            style={{ marginLeft: `0px` }}
                        >
                            <div className="flex items-center gap-1 w-full flex-nowrap">
                                <select
                                    value={draftCat}
                                    onChange={e => {
                                        setDraftCat(e.target.value);
                                        setDraftPartID('');
                                    }}
                                    className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 outline-none bg-white w-20 shrink-0"
                                >
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <select
                                    value={draftPartID}
                                    onChange={e => setDraftPartID(e.target.value)}
                                    className="flex-1 text-[10px] font-bold border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-blue-500 outline-none bg-white min-w-0"
                                >
                                    <option value="" disabled>{filteredParts.length > 0 ? '부품 선택' : '조건에 맞는 부품 없음'}</option>
                                    {filteredParts
                                        .filter(p => !node.Children?.some(c => c.PartID === p.PartID) && p.PartID !== node.PartID)
                                        .map(p => (
                                            <option key={p.PartID} value={p.PartID}>{p.Name} [{p.PartID}]</option>
                                        ))
                                    }
                                </select>
                                <div className="flex items-center bg-white border border-slate-200 rounded px-1.5 py-1 shrink-0">
                                    <span className="text-[8px] font-black text-slate-400 mr-1 uppercase">Loc/Note</span>
                                    <input
                                        type="text"
                                        placeholder="..."
                                        value={draftCat.includes('전자') || draftCat === '전체' ? draftLocation : draftNote}
                                        onChange={e => draftCat.includes('전자') || draftCat === '전체' ? setDraftLocation(e.target.value) : setDraftNote(e.target.value)}
                                        className="w-16 text-[10px] font-bold outline-none"
                                    />
                                </div>
                                <div className="flex items-center bg-white border border-slate-200 rounded px-1.5 py-1 shrink-0">
                                    <span className="text-[8px] font-black text-slate-400 mr-1 uppercase">Qty</span>
                                    <input
                                        type="number"
                                        value={draftQty}
                                        onChange={e => setDraftQty(parseInt(e.target.value, 10) || 1)}
                                        className="w-8 text-center text-[10px] font-bold outline-none"
                                    />
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddSubmit();
                                    }}
                                    className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 shadow-sm shrink-0"
                                >
                                    추가
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsAdding(false);
                                        setDraftPartID('');
                                        setDraftQty(1);
                                        setDraftLocation('');
                                        setDraftNote('');
                                    }}
                                    className="px-1.5 py-1 text-slate-400 hover:text-slate-600 rounded bg-slate-100 hover:bg-slate-200 shrink-0"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Add Child Button - Always visible when editing and expanded */}
                    {isEditing && expanded && canAddChild && !isAdding && !passReadOnlyToChildren && (
                        <div className="py-1" style={{ paddingLeft: `0px` }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(true);
                                    setIsAdding(true);
                                }}
                                className="flex items-center gap-1 px-2 py-1 ml-2 bg-blue-50 text-[10px] font-black text-blue-600 hover:text-white hover:bg-blue-500 rounded border border-blue-100 transition-colors uppercase tracking-wider group w-fit"
                            >
                                <Plus size={12} className="group-hover:rotate-90 transition-transform" /> Add Child
                            </button>
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
    showObsolete = false
}) {
    if (!data) return <div className="p-8 text-center text-slate-400 font-bold italic">구조 데이터가 없습니다.</div>;
    return (
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
            />
        </div>
    );
}
