import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Layers, Box, Cpu, Settings, Circle, AlertCircle, CheckCircle2 } from 'lucide-react';

// Helper to determine icon/color based on category/partID
function getCategoryStyle(part) {
    const cat = (part.Category || '').toLowerCase();
    const pid = (part.PartID || '').toUpperCase();

    if (pid.startsWith('IRPA') || cat.includes('product')) return { icon: Box, color: 'bg-orange-500', char: 'P', text: 'text-orange-600' };
    if (pid.startsWith('IRAA') || cat.includes('assy')) return { icon: Layers, color: 'bg-blue-600', char: 'A', text: 'text-blue-600' };
    if (pid.startsWith('IRE') || cat.includes('electronic')) return { icon: Cpu, color: 'bg-emerald-500', char: 'E', text: 'text-emerald-500' };
    if (pid.startsWith('IRM') || cat.includes('mech')) return { icon: Settings, color: 'bg-orange-500', char: 'M', text: 'text-orange-500' };

    return { icon: Circle, color: 'bg-slate-400', char: 'O', text: 'text-slate-400' };
}

// Helper to check if a node is ready (either enough stock or all components ready)
function isNodeReady(node, multiplier, inventoryMap) {
    const required = (node.Quantity || 1) * multiplier;
    const stock = Number(inventoryMap[node.PartID] || 0);

    // 1. If stock is enough, it's ready.
    if (stock >= required) return true;

    // 2. If it has children and is not a Finished Good (IRPA), check if all children are ready
    const hasChildren = node.Children && node.Children.length > 0;
    const isFinishedGood = (node.PartID || '').toUpperCase().startsWith('IRPA');

    if (hasChildren && !isFinishedGood) {
        return node.Children.every(child => isNodeReady(child, required, inventoryMap));
    }

    // 3. Otherwise (Part or Finished Good with no stock), it's not ready.
    return false;
}

function BOMCheckTreeNode({ node, level = 0, multiplier = 1, inventoryMap = {}, inboundMap = {}, onShortageClick }) {
    const [expanded, setExpanded] = useState(true);

    const hasChildren = node.Children && node.Children.length > 0;
    const style = getCategoryStyle(node);
    const isRoot = level === 0;

    const requiredQty = (node.Quantity || 1) * multiplier;
    const currentStock = Number(inventoryMap[node.PartID] || 0);

    const isActuallyEnough = currentStock >= requiredQty;
    const isReadyToBuild = !isActuallyEnough && hasChildren && node.Children.every(child => isNodeReady(child, requiredQty, inventoryMap));

    // Final Label logic
    let statusLabel = { text: '부족', color: 'text-red-500', icon: AlertCircle, bg: 'bg-red-50/30' };
    if (isRoot) {
        statusLabel = { text: '생산 대상', color: 'text-blue-500', icon: Box, bg: 'bg-blue-50/20' };
    } else if (isActuallyEnough) {
        statusLabel = { text: 'OK', color: 'text-emerald-600', icon: CheckCircle2, bg: '' };
    } else if (isReadyToBuild) {
        statusLabel = { text: '제작 필요', color: 'text-blue-600', icon: Layers, bg: 'bg-blue-50/20' };
    }

    const isInboundAvailable = !isActuallyEnough && !isReadyToBuild;
    const inboundInfo = isInboundAvailable ? inboundMap[node.PartID] : null;
    const isClickable = isInboundAvailable && !inboundInfo;

    const handleClick = () => {
        if (isClickable && onShortageClick) {
            onShortageClick(node);
        }
    };

    return (
        <div className="select-none">
            <div
                onClick={handleClick}
                className={`flex items-center py-2 px-2 border-b border-slate-50 transition-colors ${isRoot ? 'bg-slate-50/50' : ''} ${statusLabel.bg} ${isClickable ? 'cursor-pointer hover:bg-red-100/50' : 'hover:bg-slate-50'}`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
                {/* Toggle */}
                <div className="w-8 flex items-center justify-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                        className={`w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 transition-transform ${hasChildren ? 'visible' : 'invisible'}`}
                    >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>

                {/* Badge */}
                <div className="w-8 flex items-center justify-center mr-1">
                    <span className={`w-5 h-5 flex items-center justify-center rounded ${style.color} text-white text-[10px] font-bold shadow-sm`}>
                        {style.char}
                    </span>
                </div>

                {/* Info */}
                <div className="flex-1 flex flex-col justify-center overflow-hidden">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className={`text-sm font-bold truncate ${style.char === 'P' ? 'text-orange-600 font-black' : 'text-slate-700'}`}>
                            {node.Name || node.PartID}
                        </span>
                    </div>
                    {/* Real Inbound Schedule - Only for true shortage (not OK, not ReadyToBuild) */}
                    {inboundInfo && (
                        <div className="flex items-center mt-0.5 gap-2">
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                입고 예정: {inboundInfo.date}
                            </span>
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                수량: {inboundInfo.qty?.toLocaleString()} EA
                            </span>
                        </div>
                    )}
                </div>

                {/* Availability Check Right Side */}
                <div className="flex items-center gap-4 ml-4 min-w-[120px] justify-end">

                    {/* Stock / Required */}
                    {!isRoot && (
                        <div className="text-right flex flex-col items-end">
                            <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-black tabular-nums ${isActuallyEnough ? 'text-slate-300' : 'text-red-500'}`}>
                                    {currentStock.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-slate-300">/</span>
                                <span className="text-xs font-black text-slate-700 tabular-nums">
                                    {requiredQty.toLocaleString()}
                                </span>
                            </div>
                            {/* Status Label */}
                            <div className={`flex items-center gap-1 text-[9px] font-bold ${statusLabel.color}`}>
                                {React.createElement(statusLabel.icon, { size: 10 })}
                                <span>{statusLabel.text}</span>
                            </div>
                        </div>
                    )}
                    {isRoot && (
                        <div className="text-right flex flex-col items-end">
                            <div className={`flex items-center gap-1 text-[9px] font-bold ${statusLabel.color}`}>
                                {React.createElement(statusLabel.icon, { size: 10 })}
                                <span>{statusLabel.text}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Children */}
            {expanded && hasChildren && (
                <div className="ml-0">
                    {node.Children.map(child => (
                        <BOMCheckTreeNode
                            key={child.PartID}
                            node={child}
                            level={level + 1}
                            multiplier={requiredQty}
                            inventoryMap={inventoryMap}
                            inboundMap={inboundMap}
                            onShortageClick={onShortageClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function BOMCheckTree({ data, targetQty, inventoryMap, inboundMap, onShortageClick, className = "" }) {
    if (!data) return <div className="p-8 text-center text-slate-400 font-bold italic">BOM 데이터가 없습니다.</div>;

    return (
        <div className={`flex flex-col min-h-0 ${className}`}>
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white rounded-xl border border-slate-100 relative pr-1">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Layers size={14} className="text-slate-400" />
                        BOM Structure & Availability
                    </h4>
                </div>
                <div className="pb-4">
                    <BOMCheckTreeNode
                        node={data}
                        level={0}
                        multiplier={targetQty}
                        inventoryMap={inventoryMap}
                        inboundMap={inboundMap}
                        onShortageClick={onShortageClick}
                    />
                </div>
            </div>
        </div>
    );
}
