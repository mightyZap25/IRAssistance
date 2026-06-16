import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Layers, Box, Cpu, Settings, Circle, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

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
        const remainingNeeded = required - stock;
        return node.Children.every(child => isNodeReady(child, remainingNeeded, inventoryMap));
    }

    // 3. Otherwise (Part or Finished Good with no stock), it's not ready.
    return false;
}

function BOMCheckTreeNode({ node, level = 0, multiplier = 1, inventoryMap = {}, inboundMap = {}, globalShortages = {}, onShortageClick }) {
    const [expanded, setExpanded] = useState(true);

    const hasChildren = node.Children && node.Children.length > 0;
    const style = getCategoryStyle(node);
    const isRoot = level === 0;

    const unitQty = Number(node.Quantity || 1);
    const setQty = multiplier;
    const requiredQty = node.RequiredQty !== undefined ? node.RequiredQty : (unitQty * setQty);
    const currentStock = node.AvailableStock !== undefined ? node.AvailableStock : Number(inventoryMap[node.PartID] || 0);
    const isActuallyEnough = currentStock >= requiredQty;
    const shortage = requiredQty - currentStock;

    const remainingNeeded = Math.max(0, requiredQty - currentStock);
    const isReadyToBuild = !isActuallyEnough && hasChildren && node.Children.every(child => isNodeReady(child, remainingNeeded, inventoryMap));

    // 전사 누적 부족분 (Global Cumulative Shortage)
    const pid = (node.PartID || '').toUpperCase();
    const globalShort = globalShortages[pid] || 0;

    // Final Label logic
    let statusLabel = { text: '부족', color: 'text-red-500', icon: AlertCircle, bg: 'bg-red-50/10' };
    if (isRoot) {
        statusLabel = { text: '생산 대상', color: 'text-blue-500', icon: Box, bg: 'bg-slate-50/30' };
    } else if (isActuallyEnough) {
        statusLabel = { text: 'OK', color: 'text-emerald-600', icon: CheckCircle2, bg: '' };
    } else if (isReadyToBuild) {
        statusLabel = { text: '제작 가능', color: 'text-blue-600', icon: Layers, bg: 'bg-blue-50/10' };
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
                {/* Toggle & Badge */}
                <div className="flex items-center gap-1 shrink-0 mr-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 transition-transform ${hasChildren ? 'visible' : 'invisible'}`}
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <span className={`w-4 h-4 flex items-center justify-center rounded ${style.color} text-white text-[8px] font-black shadow-sm`}>
                        {style.char}
                    </span>
                </div>

                {/* Info */}
                <div className="flex-1 flex flex-col justify-center overflow-hidden min-w-0 pr-4">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className={`text-[11px] font-black truncate ${style.char === 'P' ? 'text-orange-600' : 'text-slate-700'}`}>
                            {node.Name || node.PartID}
                        </span>
                        <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded shrink-0">[{node.PartID}]</span>
                    </div>

                    <div className="flex items-center mt-1 gap-1.5 h-3">
                        {inboundInfo && (
                            <div className="flex items-center gap-1">
                                <span className="text-[7px] font-black text-blue-600 bg-blue-50 px-1 py-0.5 rounded whitespace-nowrap border border-blue-100 uppercase">IN: {inboundInfo.date}</span>
                                <span className="text-[7px] font-black text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded whitespace-nowrap border border-emerald-100">{inboundInfo.qty?.toLocaleString()} EA</span>
                            </div>
                        )}
                        {/* 전사 누적 부족분 표시 (글로벌 뱃지) */}
                        {globalShort > 0 && (
                            <div className="flex items-center gap-1 bg-rose-600 text-white px-1.5 py-0.5 rounded animate-pulse shadow-sm">
                                <ShieldAlert size={8} />
                                <span className="text-[7px] font-black uppercase whitespace-nowrap">전체 부족: {globalShort.toLocaleString()} EA</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Columns */}
                <div className="flex items-center gap-2.5 shrink-0 ml-auto border-l border-slate-50 pl-3">
                    <div className="text-right w-11">
                        <p className="text-[7px] font-black text-slate-300 uppercase tracking-tighter leading-tight mb-0.5">Unit</p>
                        <p className="text-[11px] font-black text-indigo-500 tabular-nums leading-none">{unitQty.toLocaleString()}<span className="text-[8px] ml-0.5 opacity-40">/D</span></p>
                    </div>
                    <div className="text-right w-11">
                        <p className="text-[7px] font-black text-slate-300 uppercase tracking-tighter leading-tight mb-0.5">Set</p>
                        <p className="text-[11px] font-black text-indigo-500 tabular-nums leading-none">{setQty.toLocaleString()}<span className="text-[8px] ml-0.5 opacity-40">S</span></p>
                    </div>
                    <div className="text-right w-14">
                        <p className="text-[7px] font-black text-slate-300 uppercase tracking-tighter leading-tight mb-0.5">Req</p>
                        <p className="text-[11px] font-black text-slate-700 tabular-nums leading-none">{requiredQty.toLocaleString()}<span className="text-[8px] ml-0.5 opacity-40">E</span></p>
                    </div>
                    <div className="text-right w-18">
                        <p className="text-[7px] font-black text-slate-300 uppercase tracking-tighter leading-tight mb-0.5">Stock</p>
                        <p className={`text-[11px] font-black tabular-nums leading-none ${isActuallyEnough ? 'text-blue-600' : 'text-rose-500'}`}>{currentStock.toLocaleString()}<span className="text-[8px] ml-0.5 opacity-40">A</span></p>
                        {shortage > 0 && (
                            <p className="text-[9px] font-black text-rose-600 mt-1 animate-pulse leading-none">-{shortage.toLocaleString()}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Children */}
            {expanded && hasChildren && (
                <div className="ml-0">
                    {node.Children.map((child, idx) => (
                        <BOMCheckTreeNode
                            key={idx}
                            node={child}
                            level={level + 1}
                            multiplier={remainingNeeded}
                            inventoryMap={inventoryMap}
                            inboundMap={inboundMap}
                            globalShortages={globalShortages}
                            onShortageClick={onShortageClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function BOMCheckTree({ data, targetQty, inventoryMap, inboundMap, globalShortages = {}, onShortageClick, className = "" }) {
    if (!data) return <div className="p-8 text-center text-slate-400 font-bold italic">BOM 데이터가 없습니다.</div>;

    return (
        <div className={`flex flex-col min-h-0 ${className}`}>
            <div className="flex-1 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                <BOMCheckTreeNode
                    node={data}
                    level={0}
                    multiplier={targetQty}
                    inventoryMap={inventoryMap}
                    inboundMap={inboundMap}
                    globalShortages={globalShortages}
                    onShortageClick={onShortageClick}
                />
            </div>
        </div>
    );
}
