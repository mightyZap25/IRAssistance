import React from 'react';
import { X, GripVertical, LayoutList, PieChart, Table, Info } from 'lucide-react';

/**
 * Converts a hex color and opacity percentage to an rgba string.
 */
function hexToRgba(hex, opacity) {
    if (!hex) return '';
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

export default function WidgetContainer({ 
    title, 
    children, 
    onRemove, 
    isEditMode = false,
    viewType = 'list',
    onViewTypeChange,
    hideTitle = false,
    hideViewTypes = false,
    borderless = false,
    isSelected = false,
    onSelect,
    customStyle = {},
    style,
    className,
    onMouseDown,
    onMouseUp,
    onTouchEnd,
    childrenRef
}) {
    const { 
        backgroundColor = '#ffffff', 
        opacity = 100,
        borderColor = '#e2e8f0',
        borderOpacity = 100
    } = customStyle;

    const viewOptions = [
        { id: 'list', icon: LayoutList, label: '리스트' },
        { id: 'chart', icon: PieChart, label: '차트' },
        { id: 'table', icon: Table, label: '테이블' },
        { id: 'stat', icon: Info, label: '데이터' }
    ];

    // Build independent background and border styles
    const containerStyle = {
        ...style,
        backgroundColor: borderless ? 'transparent' : hexToRgba(backgroundColor, opacity),
        borderColor: borderless ? 'transparent' : hexToRgba(borderColor, borderOpacity),
        boxShadow: isSelected ? 'inset 0 0 0 2px #6366f1' : (borderless ? 'none' : undefined),
    };

    return (
        <div 
            style={containerStyle} 
            onClick={(e) => {
                if (onSelect) {
                    e.stopPropagation();
                    onSelect();
                }
            }}
            className={`${className} ${borderless ? '' : 'rounded-2xl border shadow-sm'} overflow-hidden flex flex-row group ${isEditMode ? '' : 'transition-all duration-200'} relative h-full w-full`}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onTouchEnd={onTouchEnd}
        >
            {/* 1. Left Side: Drag Handle (Visible for all widgets in Edit Mode) */}
            {isEditMode && (
                <div className={`drag-handle w-6 flex items-start justify-center pt-3 shrink-0 cursor-grab active:cursor-grabbing transition-colors ${borderless ? 'hover:text-indigo-600 text-slate-300' : 'bg-slate-900/5 dark:bg-white/5 border-r border-slate-100/50 dark:border-slate-800/50 text-slate-400 hover:text-indigo-600'}`}>
                    <GripVertical size={14} />
                </div>
            )}

            {/* 2. Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative">
                {/* Header: Hidden for borderless widgets */}
                {!borderless && (
                    <div className={`
                        flex justify-between items-center px-3 py-1.5 border-b border-slate-100/50 dark:border-slate-800/50 shrink-0
                        ${isEditMode ? 'bg-indigo-50/20 dark:bg-indigo-900/5' : 'bg-transparent'}
                    `}>
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                            {!hideTitle && (
                                <h3 className="text-xs font-black text-slate-700 dark:text-slate-100 uppercase tracking-widest truncate">
                                    {title}
                                </h3>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {onViewTypeChange && !hideViewTypes && (
                                <div className="flex items-center bg-slate-50 dark:bg-slate-800/50 p-0.5 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
                                    {viewOptions.map(opt => {
                                        const Icon = opt.icon;
                                        const isActive = viewType === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onViewTypeChange(opt.id);
                                                }}
                                                className={`p-1.5 rounded-md transition-all ${
                                                    isActive 
                                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' 
                                                    : 'text-slate-300 hover:text-slate-400'
                                                }`}
                                            >
                                                <Icon size={14} />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Content Area */}
                <div ref={childrenRef} className={`flex-1 overflow-y-auto ${borderless ? 'p-0' : 'p-3'} custom-scrollbar min-h-0 bg-transparent`}>
                    {children}
                </div>
            </div>

            {/* 3. Right Side: Remove Button (Visible for borderless in Edit Mode) */}
            {borderless && isEditMode && onRemove && (
                <div className="w-6 flex items-start justify-center pt-3 shrink-0">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-all"
                        title="위젯 삭제"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Standard Remove Button for non-borderless in header area (absolute to save space) */}
            {!borderless && isEditMode && onRemove && (
                <div className="absolute top-1 right-1 z-10">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-all"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
