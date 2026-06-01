import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, GripVertical, PenTool, Trash2, Search, SlidersHorizontal, LayoutGrid, List, X, Plus } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Drag and drop sort item component
function SortableColumnItem({ col, onToggle }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: col.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: 'relative'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center justify-between gap-2.5 py-1 px-2 rounded-xl transition-all ${isDragging ? 'bg-indigo-50 dark:bg-indigo-950/40 shadow-md border border-indigo-100/50 dark:border-indigo-950 z-50' : 'hover:bg-slate-50 dark:hover:bg-slate-850'}`}
        >
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-black text-slate-700 dark:text-slate-350 flex-1 select-none py-0.5">
                <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={onToggle}
                    className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                {col.label}
            </label>
            <div
                {...attributes}
                {...listeners}
                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
                <GripVertical size={13} />
            </div>
        </div>
    );
}

// Advanced Dynamic Filter Modal
function FilterModal({ columnOrder, activeFilters, setActiveFilters, onClose, recommendations = {} }) {
    // 요구사항 1: 시각적으로 보이는 컬럼뿐만 아니라 모든 항목을 필터링 가능하게 함
    const availableColumns = columnOrder;

    const operators = [
        { value: 'contains', label: '포함' },
        { value: 'equals', label: '일치 (==)' },
        { value: 'notEquals', label: '불일치 (!=)' },
        { value: 'greaterThan', label: '큼 (>)' },
        { value: 'lessThan', label: '작음 (<)' },
        { value: 'greaterThanEqual', label: '크거나 같음 (>=)' },
        { value: 'lessThanEqual', label: '작거나 같음 (<=)' },
        { value: 'startsWith', label: '시작단어' },
        { value: 'endsWith', label: '끝단어' }
    ];

    const handleAddFilter = () => {
        const unusedCol = availableColumns.find(col => !activeFilters.some(f => f.key === col.key));
        const defaultKey = unusedCol ? unusedCol.key : (availableColumns[0]?.key || '');
        // 요구사항 2: 기본 연산자는 'contains'로 설정
        setActiveFilters([...activeFilters, { key: defaultKey, operator: 'contains', value: '' }]);
    };

    const handleRemoveFilter = (index) => {
        setActiveFilters(activeFilters.filter((_, idx) => idx !== index));
    };

    const handleFilterChange = (index, field, value) => {
        const next = [...activeFilters];
        next[index][field] = value;
        setActiveFilters(next);
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in text-slate-800 dark:text-slate-100"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col transform transition-all overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            고급 다중 필터 조건 설정
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">지정한 모든 필터 조건들을 만족(AND)하는 데이터만 조회됩니다.</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar my-5 pr-1 space-y-3 min-h-[240px]">
                    {activeFilters.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-450 italic py-12 text-xs text-center">
                            추가된 필터 조건이 없습니다.<br/>
                            우측 하단의 [필터 추가] 버튼을 눌러 원하는 검색 조건을 설정해 보세요.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeFilters.map((filter, index) => (
                                <div 
                                    key={index} 
                                    className="flex items-center gap-3 bg-slate-50/60 dark:bg-slate-850 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 animate-slide-in group"
                                >
                                    {/* 요구사항 4: [항목 선택] - [연산자 선택] - [값 입력] 순서로 한 줄 배치 */}
                                    <div className="flex-1 grid grid-cols-12 gap-3 items-center">
                                        <select
                                            value={filter.key}
                                            onChange={e => handleFilterChange(index, 'key', e.target.value)}
                                            className="col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-350 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                                        >
                                            {availableColumns.map(col => (
                                                <option key={col.key} value={col.key}>{col.label}</option>
                                            ))}
                                        </select>

                                        <select
                                            value={filter.operator}
                                            onChange={e => handleFilterChange(index, 'operator', e.target.value)}
                                            className="col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl px-3 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                                        >
                                            {operators.map(op => (
                                                <option key={op.value} value={op.value}>{op.label}</option>
                                            ))}
                                        </select>

                                        {/* 요구사항 2, 3: 입력창 자동완성 UI 및 지능형 추천 리스트 */}
                                        <div className="col-span-5 relative">
                                            <input
                                                type="text"
                                                placeholder="검색할 값 입력..."
                                                value={filter.value}
                                                onChange={e => handleFilterChange(index, 'value', e.target.value)}
                                                list={`datalist-${index}`}
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                            />
                                            <datalist id={`datalist-${index}`}>
                                                {(recommendations[filter.key] || []).map((val, i) => (
                                                    <option key={i} value={val} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => handleRemoveFilter(index)}
                                        className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40 rounded-xl transition-all shadow-sm shrink-0 group-hover:scale-105"
                                        title="조건 삭제"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={() => setActiveFilters([])}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-slate-700 transition-all shadow-sm"
                    >
                        조건 전체 초기화
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddFilter}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-650 hover:bg-indigo-150 dark:bg-indigo-950/30 dark:text-indigo-400 dark:hover:bg-indigo-950/50 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95"
                        >
                            <Plus size={14} />
                            <span>필터 추가</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black hover:scale-[1.02] active:scale-95 transform transition-all shadow-md shadow-indigo-200 dark:shadow-none"
                        >
                            필터 적용
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function MasterDataGrid({
    data = [],
    columnDefs = {},
    sortConfig = { key: '', direction: 'asc' },
    onSort = () => {},
    onRowClick = () => {},
    rowKey = 'id',
    cellRenderer = {},
    onEdit = null,
    onDelete = null,
    sortableColumns = [],

    // 추가되는 기능 제어 Props
    enableSearch = false,
    searchTerm = '',
    onSearchChange = () => {},
    searchPlaceholder = '검색...',

    enableFilter = false,
    filterConfig = [],
    filterValues = {},
    onFilterChange = () => {},

    enableViewModeToggle = false,
    viewMode = 'list',
    onViewModeChange = () => {},
    cardRenderer = null,

    extraHeaderActions = null,
    onFilteredDataChange = null
}) {
    // Column Visibility & Order State
    const [columnOrder, setColumnOrder] = useState(() => {
        return Object.keys(columnDefs).map(key => ({
            id: key,
            key: key,
            label: columnDefs[key].label,
            visible: columnDefs[key].default !== undefined ? columnDefs[key].default : true
        }));
    });
    const [isColSelectorOpen, setIsColSelectorOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);

    // 요구사항 1: 데이터 추천(Recommendation) 추출
    const recommendations = React.useMemo(() => {
        const recs = {};
        // 모든 컬럼(columnOrder에 포함된 키들)에 대해 유니크한 값 추출
        columnOrder.forEach(col => {
            const key = col.key;
            const uniqueValues = Array.from(new Set(
                data.map(item => item[key])
                    .filter(val => val !== undefined && val !== null && val !== '')
                    .map(val => String(val))
            )).sort().slice(0, 50); // 상위 50개 리스트 또는 중복 제거된 리스트
            recs[key] = uniqueValues;
        });
        return recs;
    }, [data, columnOrder]);

    // Internal dynamic filtering engine
    // 요구사항 3: 필터 평가 로직 고도화
    const finalFilteredData = React.useMemo(() => {
        return data.filter(row => {
            // 1. Text Search Filtering (기존 기능 유지)
            if (enableSearch && searchTerm) {
                const term = searchTerm.toLowerCase();
                const searchableFields = ['Name', 'PartID', 'Description', 'Spec', 'ContactPerson', 'CompanyName'];
                const match = searchableFields.some(field => 
                    String(row[field] || '').toLowerCase().includes(term)
                );
                if (!match) return false;
            }

            // 2. Dynamic Multicolumn Filtering (고도화된 연산자 처리)
            for (const f of activeFilters) {
                if (!f.key || f.value === undefined || f.value === '') continue;
                
                const rawVal = row[f.key];
                const filterVal = f.value;
                const operator = f.operator || 'contains';

                // 숫자 타입 체크 및 변환
                const isNumber = typeof rawVal === 'number' || (!isNaN(rawVal) && !isNaN(parseFloat(rawVal)));
                const valA = isNumber ? parseFloat(rawVal) : String(rawVal ?? '').toLowerCase();
                const valB = isNumber ? parseFloat(filterVal) : String(filterVal).toLowerCase();

                switch (operator) {
                    case 'contains':
                        if (isNumber) {
                            if (String(valA) !== String(valB)) return false;
                        } else {
                            if (!valA.includes(valB)) return false;
                        }
                        break;
                    case 'equals':
                        if (valA != valB) return false;
                        break;
                    case 'notEquals':
                        if (valA == valB) return false;
                        break;
                    case 'greaterThan':
                        if (!(valA > valB)) return false;
                        break;
                    case 'lessThan':
                        if (!(valA < valB)) return false;
                        break;
                    case 'greaterThanEqual':
                        if (!(valA >= valB)) return false;
                        break;
                    case 'lessThanEqual':
                        if (!(valA <= valB)) return false;
                        break;
                    case 'startsWith':
                        if (isNumber) {
                            if (!String(valA).startsWith(String(valB))) return false;
                        } else {
                            if (!valA.startsWith(valB)) return false;
                        }
                        break;
                    case 'endsWith':
                        if (isNumber) {
                            if (!String(valA).endsWith(String(valB))) return false;
                        } else {
                            if (!valA.endsWith(valB)) return false;
                        }
                        break;
                    default:
                        if (!String(valA).includes(String(valB))) return false;
                }
            }
            return true;
        });
    }, [data, searchTerm, activeFilters, enableSearch]);

    const prevFilteredDataRef = React.useRef();

    React.useEffect(() => {
        if (typeof onFilteredDataChange === 'function') {
            // 무한 루프 방지: 데이터의 내용이 실제로 변경되었을 때만 호출
            const isSame = prevFilteredDataRef.current && 
                          prevFilteredDataRef.current.length === finalFilteredData.length &&
                          prevFilteredDataRef.current.every((val, i) => val === finalFilteredData[i]);
            
            if (!isSame) {
                prevFilteredDataRef.current = finalFilteredData;
                onFilteredDataChange(finalFilteredData);
            }
        }
    }, [finalFilteredData, onFilteredDataChange]);

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setColumnOrder((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleToggleColumn = (key) => {
        setColumnOrder(prev =>
            prev.map(col => (col.key === key ? { ...col, visible: !col.visible } : col))
        );
    };

    const portalTarget = document.getElementById('grid-column-selector-portal');

    const columnSelectorUI = (
        <div className="relative">
            <button
                onClick={() => setIsColSelectorOpen(!isColSelectorOpen)}
                className={`flex items-center gap-2 px-4 py-2 border rounded-xl font-black text-xs transition-all shadow-sm ${isColSelectorOpen ? 'bg-indigo-50 text-indigo-600 border-indigo-200/70' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50'}`}
            >
                <Settings size={14} />
                <span>표시 열 설정</span>
            </button>
            {isColSelectorOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-5 shadow-2xl z-50 animate-slide-in text-slate-800 dark:text-slate-100">
                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200 dark:border-slate-800">출력 열 선택 및 순서 설정</h4>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar mt-3 pr-1">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={columnOrder.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                {columnOrder.map((col) => (
                                    <SortableColumnItem
                                        key={col.id}
                                        col={col}
                                        onToggle={() => handleToggleColumn(col.key)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            )}
        </div>
    );

    const filterModalPortal = isFilterOpen && createPortal(
        <FilterModal 
            columnOrder={columnOrder}
            activeFilters={activeFilters}
            setActiveFilters={setActiveFilters}
            onClose={() => setIsFilterOpen(false)}
            recommendations={recommendations}
        />,
        document.body
    );

    return (
        <div className="flex-1 flex flex-col min-h-0 focus:outline-none relative">
            
            {/* Header control block (Integrated Search / Filters / View Mode Toggle) */}
            {(enableSearch || enableFilter || enableViewModeToggle) ? (
                <div className="px-5 py-3 flex flex-col gap-3 flex-none border-b border-slate-100 dark:border-slate-800/50 bg-white/40 dark:bg-slate-900/40 z-10 relative">
                    <div className="flex gap-4 items-center justify-between">
                        
                        {/* Left: Search & Total Count */}
                        <div className="flex gap-5 items-center flex-1">
                            {enableSearch && (
                                <div className="relative w-64 md:w-80">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input
                                        type="text"
                                        placeholder={searchPlaceholder}
                                        className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 transition-all font-bold text-slate-700 dark:text-slate-250 text-xs outline-none shadow-sm"
                                        value={searchTerm}
                                        onChange={(e) => onSearchChange(e.target.value)}
                                    />
                                </div>
                            )}
                            <div className="text-xs text-slate-450 font-bold whitespace-nowrap">
                                총 <span className="text-indigo-650 dark:text-indigo-400 font-black">{finalFilteredData.length}</span>건 조회됨
                            </div>
                        </div>

                        {/* Right: Action Controls */}
                        <div className="flex gap-2.5 items-center justify-end">
                            {extraHeaderActions}
                            
                            {enableFilter && (
                                <button
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-black text-xs transition-all ${isFilterOpen || activeFilters.length > 0 ? 'bg-indigo-50 text-indigo-600 border-indigo-200/70' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 shadow-sm'}`}
                                >
                                    <SlidersHorizontal size={13} />
                                    <span>고급 필터 {activeFilters.length > 0 ? `(${activeFilters.length})` : ''}</span>
                                </button>
                            )}

                            {columnSelectorUI}

                            {enableViewModeToggle && (
                                <div className="flex bg-slate-100/80 dark:bg-slate-800/60 p-0.5 rounded-lg border border-slate-200/50 shadow-sm">
                                    <button
                                        onClick={() => onViewModeChange('card')}
                                        className={`p-1.5 rounded transition-all ${viewMode === 'card' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-slate-700'}`}
                                    >
                                        <LayoutGrid size={14} />
                                    </button>
                                    <button
                                        onClick={() => onViewModeChange('list')}
                                        className={`p-1.5 rounded transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-slate-700'}`}
                                    >
                                        <List size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* Fallback legacy header control block */
                portalTarget ? (
                    createPortal(columnSelectorUI, portalTarget)
                ) : (
                    <div className="flex justify-between items-center mb-3 px-2">
                        <div className="text-xs text-slate-450 font-bold">
                            총 <span className="text-indigo-650 dark:text-indigo-400 font-black">{finalFilteredData.length}</span>건 조회됨
                        </div>
                        {columnSelectorUI}
                    </div>
                )
            )}

            {/* List and Grid Views (Body) */}
            {enableViewModeToggle && viewMode === 'card' && cardRenderer ? (
                /* Premium Card Grid Scroll Area */
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4.5 bg-slate-50/20 dark:bg-slate-950/20 pr-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {finalFilteredData.map(item => cardRenderer(item))}
                    </div>
                </div>
            ) : (
                /* Scrollable table content with dynamic border-spacing for padding */
                <div className="flex-1 overflow-auto custom-scrollbar relative pr-1">
                    <table className="w-full text-left text-xs text-slate-650 dark:text-slate-350 border-separate border-spacing-y-3">
                        <thead className="text-xs uppercase text-slate-450 font-black tracking-widest sticky top-0 z-20">
                            <tr>
                                {columnOrder.map((col) => {
                                    if (!col.visible) return null;
                                    const key = col.key;
                                    // sortableColumns가 명시되어 있으면 해당 컬럼들만 정렬 가능, 비어 있으면 전체 정렬 허용
                                    const isSortable = sortableColumns.length > 0 
                                        ? sortableColumns.includes(key)
                                        : true;
                                    const sortArrow = sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : '';
                                    
                                    if (isSortable) {
                                        return (
                                            <th
                                                key={key}
                                                onClick={() => onSort(key)}
                                                className="px-2 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors first:rounded-l-2xl last:rounded-r-2xl whitespace-nowrap sticky top-0 z-20"
                                            >
                                                {col.label}{sortArrow}
                                            </th>
                                        );
                                    }
                                    return (
                                        <th key={key} className="px-2 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 first:rounded-l-2xl last:rounded-r-2xl whitespace-nowrap sticky top-0 z-20">
                                            {col.label}
                                        </th>
                                    );
                                })}
                                {(onEdit || onDelete) && (
                                    <th className="px-2 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 rounded-r-2xl whitespace-nowrap text-center sticky top-0 z-20">
                                        관리
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {finalFilteredData.map(row => (
                                <tr
                                    key={row[rowKey]}
                                    onClick={() => onRowClick(row)}
                                    className="bg-white/40 dark:bg-slate-900/35 border border-slate-200/30 hover:bg-indigo-50/50 dark:hover:bg-slate-800/40 hover:scale-[1.002] transition-all cursor-pointer group shadow-sm"
                                >
                                    {columnOrder.map((col) => {
                                        if (!col.visible) return null;
                                        const key = col.key;
                                        
                                        // Custom renderer lookup
                                        let cellContent = row[key] !== undefined ? row[key] : '-';
                                        if (cellRenderer[key]) {
                                            cellContent = cellRenderer[key](row[key], row);
                                        }

                                        let cellClass = "px-2 py-2.5 border-y border-slate-200/10 dark:border-slate-800/10 text-slate-650 dark:text-slate-350 first:rounded-l-2xl last:rounded-r-2xl whitespace-nowrap max-w-[200px] truncate";
                                        
                                        // General premium styles for generic keys if not overriden
                                        if (key === 'PartID' || key === 'id') {
                                            cellClass = "px-2 py-2.5 font-mono font-bold text-slate-400 group-hover:text-indigo-650 transition-colors rounded-l-2xl border-y border-l border-slate-200/10 dark:border-slate-800/10 whitespace-nowrap max-w-[150px] truncate";
                                        } else if (key === 'Name' || key === 'Title') {
                                            cellClass = "px-2 py-2.5 font-extrabold text-slate-800 dark:text-slate-200 group-hover:text-indigo-655 transition-colors max-w-xs truncate whitespace-nowrap border-y border-slate-200/10 dark:border-slate-800/10";
                                        } else if (key === 'Spec') {
                                            cellClass = "px-2 py-2.5 text-slate-500 font-bold border-y border-slate-200/10 dark:border-slate-800/10 whitespace-nowrap max-w-[200px] truncate";
                                        } else if (key === 'DefaultLocation' || key === 'Location') {
                                            cellClass = "px-2 py-2.5 text-emerald-600 dark:text-emerald-500 font-extrabold border-y border-slate-200/10 dark:border-slate-800/10 whitespace-nowrap max-w-[150px] truncate";
                                        } else if (key === 'UnitPrice' || key === 'Price') {
                                            cellClass = "px-2 py-2.5 text-right font-black text-slate-800 dark:text-slate-250 border-y border-slate-200/10 dark:border-slate-800/10 whitespace-nowrap max-w-[120px] truncate";
                                        }
                                        
                                        const titleText = typeof row[key] === 'string' || typeof row[key] === 'number' ? row[key] : '';
                                        return (
                                            <td key={key} className={cellClass} title={titleText}>
                                                {cellContent}
                                            </td>
                                        );
                                    })}

                                    {/* Edit/Delete row actions */}
                                    {(onEdit || onDelete) && (
                                        <td className="px-2 py-2.5 text-center rounded-r-2xl border-y border-r border-slate-200/10 dark:border-slate-800/10 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2.5 justify-center items-center">
                                                {onEdit && (
                                                    <button
                                                        onClick={() => onEdit(row)}
                                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                                                    >
                                                        <PenTool size={14} />
                                                    </button>
                                                )}
                                                {onDelete && (
                                                    <button
                                                        onClick={() => onDelete(row)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-slate-800 rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {filterModalPortal}
        </div>
    );
}
