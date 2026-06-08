import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

export default function ProjectGanttChart({ projects, stages }) {
    const [viewMode, setViewMode] = useState('month'); // day | month | quarter
    const [unitWidth, setUnitWidth] = useState(40); // grid cell width
    const [collapsedRows, setCollapsedRows] = useState({}); // rowId -> boolean (true if collapsed)
    const scrollContainerRef = useRef(null);

    // Sync vertical wheel scroll to horizontal
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onWheel = (e) => {
            if (e.deltaY === 0) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);
    
    const STAGE_COLORS = {
        planning: 'bg-blue-500 border-blue-600',
        development: 'bg-indigo-500 border-indigo-600',
        dev_pp: 'bg-amber-500 border-amber-600',
        qa_test: 'bg-purple-500 border-purple-600',
        prod_pp: 'bg-emerald-500 border-emerald-600',
        mp_transfer: 'bg-rose-500 border-rose-600',
    };

    const handleZoomIn = () => setUnitWidth(prev => Math.min(prev + 8, 120));
    const handleZoomOut = () => setUnitWidth(prev => Math.max(prev - 8, 24));
    const handleResetZoom = () => setUnitWidth(40);

    const today = new Date();

    // Helper: Calculate global start/end date for summary task
    const getProjectPeriod = (project) => {
        let start = project.startDate || '';
        let end = project.endDate || '';
        if (project.schedules) {
            Object.values(project.schedules).forEach(sched => {
                if (sched.start) {
                    if (!start || sched.start < start) start = sched.start;
                }
                if (sched.end) {
                    if (!end || sched.end > end) end = sched.end;
                }
            });
        }
        return { start, end };
    };

    const toggleRowCollapse = (rowId) => {
        setCollapsedRows(prev => ({
            ...prev,
            [rowId]: !prev[rowId]
        }));
    };

    // Construct flat rows of Summary Tasks and Sub Tasks for table rendering
    const rows = useMemo(() => {
        const flatList = [];
        let idCounter = 1;
        
        projects.forEach(p => {
            const { start, end } = getProjectPeriod(p);
            const pId = idCounter++;
            const pRowId = `p-${p.id}`;
            
            // 1. Summary Task Row (Project)
            flatList.push({
                rowId: pRowId,
                displayId: `${pId}`,
                name: p.name,
                code: p.code,
                isSummary: true,
                start,
                end,
                progress: p.progress || 0,
                stageId: null,
                indent: 0,
                hasChildren: stages.some(stage => {
                    const sched = p.schedules?.[stage.id];
                    return (sched && sched.start && sched.end) || true; // stages always show
                })
            });

            // 2. Child Stage Rows (Sub tasks)
            stages.forEach((stage, sIdx) => {
                const sched = p.schedules?.[stage.id];
                const stageRowId = `s-${p.id}-${stage.id}`;
                const stageTests = p.tests?.[stage.id] || [];
                
                flatList.push({
                    rowId: stageRowId,
                    displayId: `${pId}.${sIdx + 1}`,
                    name: stage.label,
                    isSummary: false,
                    start: sched?.start || '',
                    end: sched?.end || '',
                    progress: sched?.status === 'completed' ? 100 : (sched?.status === 'in_progress' ? 50 : 0),
                    stageId: stage.id,
                    indent: 1,
                    hasChildren: stageTests.length > 0
                });

                // 3. Sub-sub Tasks (세부 TASKs - indent: 2)
                stageTests.forEach((test, tIdx) => {
                    flatList.push({
                        rowId: `t-${p.id}-${stage.id}-${test.id}`,
                        displayId: `${pId}.${sIdx + 1}.${tIdx + 1}`,
                        name: `[${test.parent}] ${test.child}`,
                        isSummary: false,
                        start: test.startDate || sched?.start || '', 
                        end: test.endDate || sched?.end || '',
                        progress: test.completed ? 100 : 0,
                        stageId: stage.id,
                        indent: 2,
                        isTestTask: true,
                        hasChildren: false,
                        assigneeName: test.assigneeName || '',
                        priority: test.priority || 'Medium',
                        difficulty: test.difficulty || 'Medium',
                        notes: test.notes || ''
                    });
                });
            });
        });
        return flatList;
    }, [projects, stages]);

    // Filter visible rows based on collapsed parents
    const visibleRows = useMemo(() => {
        return rows.filter(row => {
            if (row.indent === 1) {
                const pId = row.rowId.split('-').slice(0, 2).join('-').replace('s-', 'p-');
                if (collapsedRows[pId]) return false;
            }
            if (row.indent === 2) {
                const parts = row.rowId.split('-');
                const pId = `p-${parts[1]}`;
                const sId = `s-${parts[1]}-${parts[2]}`;
                if (collapsedRows[pId] || collapsedRows[sId]) return false;
            }
            return true;
        });
    }, [rows, collapsedRows]);
    // Timeline Axis Range Calculation
    const timelineData = useMemo(() => {
        const topUnits = [];
        const bottomUnits = [];
        let start, end;

        if (viewMode === 'day') {
            start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
            end = new Date(start.getTime() + (60 * 24 * 60 * 60 * 1000));
            
            let curr = new Date(start);
            while (curr <= end) {
                const yearMonth = `${curr.getFullYear()}.${String(curr.getMonth() + 1).padStart(2, '0')}`;
                if (topUnits.length === 0 || topUnits[topUnits.length - 1].label !== yearMonth) {
                    topUnits.push({ label: yearMonth, width: 0 });
                }
                topUnits[topUnits.length - 1].width += unitWidth;
                bottomUnits.push({ 
                    label: curr.getDate().toString(), 
                    date: new Date(curr),
                    isWeekend: curr.getDay() === 0 || curr.getDay() === 6 
                });
                curr.setDate(curr.getDate() + 1);
            }
        } else if (viewMode === 'week') {
            // Monday helper
            const getMonday = (d) => {
                const date = new Date(d);
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(date.setDate(diff));
            };
            const currentMonday = getMonday(new Date(today));
            start = new Date(currentMonday);
            start.setDate(start.getDate() - 21); // 3 weeks ago
            end = new Date(start.getTime() + (16 * 7 * 24 * 60 * 60 * 1000)); // 16 weeks span
            
            let curr = new Date(start);
            while (curr <= end) {
                const yearMonth = `${curr.getFullYear()}.${String(curr.getMonth() + 1).padStart(2, '0')}`;
                if (topUnits.length === 0 || topUnits[topUnits.length - 1].label !== yearMonth) {
                    topUnits.push({ label: yearMonth, width: 0 });
                }
                topUnits[topUnits.length - 1].width += unitWidth;

                const labelStr = `${curr.getMonth() + 1}/${curr.getDate()}`;
                bottomUnits.push({ label: labelStr, date: new Date(curr) });
                curr.setDate(curr.getDate() + 7);
            }
        } else if (viewMode === 'month') {
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() + 1, 11, 31);
            
            let curr = new Date(start);
            while (curr <= end) {
                const year = curr.getFullYear().toString();
                if (topUnits.length === 0 || topUnits[topUnits.length - 1].label !== year) {
                    topUnits.push({ label: year, width: 0 });
                }
                topUnits[topUnits.length - 1].width += unitWidth;
                bottomUnits.push({ label: `${curr.getMonth() + 1}월`, date: new Date(curr) });
                curr.setMonth(curr.setMonth() + 1);
            }
        } else { // quarter
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() + 2, 11, 31);
            
            let curr = new Date(start);
            while (curr <= end) {
                const year = curr.getFullYear().toString();
                const q = Math.floor(curr.getMonth() / 3) + 1;
                if (topUnits.length === 0 || topUnits[topUnits.length - 1].label !== year) {
                    topUnits.push({ label: year, width: 0 });
                }
                topUnits[topUnits.length - 1].width += unitWidth;
                bottomUnits.push({ label: `Q${q}`, date: new Date(curr) });
                curr.setMonth(curr.setMonth() + 3);
            }
        }
        return { topUnits, bottomUnits, start, end };
    }, [viewMode, unitWidth]);

    const getX = (dateStr) => {
        if (!dateStr) return -1;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return -1;
        
        if (viewMode === 'day') {
            const diff = (d.getTime() - timelineData.start.getTime()) / (1000 * 60 * 60 * 24);
            return diff * unitWidth;
        } else if (viewMode === 'week') {
            const diff = (d.getTime() - timelineData.start.getTime()) / (1000 * 60 * 60 * 24);
            return (diff / 7) * unitWidth;
        } else if (viewMode === 'month') {
            const diffY = d.getFullYear() - timelineData.start.getFullYear();
            const diffM = d.getMonth() - timelineData.start.getMonth();
            const totalM = diffY * 12 + diffM;
            const dayOffset = (d.getDate() - 1) / 31;
            return (totalM + dayOffset) * unitWidth;
        } else { // quarter
            const diffY = d.getFullYear() - timelineData.start.getFullYear();
            const diffM = d.getMonth() - timelineData.start.getMonth();
            const totalQ = (diffY * 12 + diffM) / 3;
            const dayOffset = ((d.getMonth() % 3) * 31 + d.getDate()) / 93;
            return (totalQ + dayOffset) * unitWidth;
        }
    };

    const getWidth = (startStr, endStr) => {
        if (!startStr || !endStr) return 0;
        const xStart = getX(startStr);
        const xEnd = getX(endStr);
        if (xStart < 0 || xEnd < 0) return 0;
        const width = xEnd - xStart + (viewMode === 'day' ? unitWidth : viewMode === 'week' ? unitWidth / 7 : unitWidth / 2);
        return Math.max(width, 4);
    };

    const getDurationDays = (startStr, endStr) => {
        if (!startStr || !endStr) return '-';
        const s = new Date(startStr);
        const e = new Date(endStr);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return '-';
        const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return `${diff}일`;
    };

    const formatDateShort = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return `${String(d.getFullYear()).slice(-2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    return (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-[550px] select-none">
            {/* Control Bar */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Calendar size={16} className="text-indigo-600"/> MS Project Gantt
                    </h3>
                    <div className="flex bg-slate-200/50 p-0.5 rounded-lg gap-0.5">
                        {['day', 'week', 'month', 'quarter'].map(m => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${
                                    viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {m === 'day' ? '일별' : m === 'week' ? '주간별' : m === 'month' ? '월별' : '분기별'}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-slate-200 mx-1" />

                    <div className="flex items-center bg-slate-200/50 p-0.5 rounded-lg gap-0.5">
                        <button onClick={handleZoomOut} className="p-1 hover:bg-white rounded-md text-slate-500 transition-all"><ZoomOut size={13}/></button>
                        <button onClick={handleResetZoom} className="px-2 text-[9px] font-black text-slate-600 hover:text-indigo-600 transition-all">{unitWidth}px</button>
                        <button onClick={handleZoomIn} className="p-1 hover:bg-white rounded-md text-slate-500 transition-all"><ZoomIn size={13}/></button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {stages.map(s => (
                        <div key={s.id} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${(STAGE_COLORS[s.id] || 'bg-slate-500').split(' ')[0]}`} />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Split Viewport Container */}
            <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-auto custom-scrollbar bg-white"
            >
                {/* 2-Tier Sticky Header */}
                <div className="sticky top-0 z-30 bg-white border-b border-slate-200 flex min-w-max">
                    {/* Left Sticky Table Header */}
                    <div className="w-[450px] shrink-0 sticky left-0 bg-slate-50 border-r border-slate-200 z-40 flex divide-x divide-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider h-14">
                        <div className="w-10 flex items-center justify-center">ID</div>
                        <div className="w-48 flex items-center px-3">Task Name</div>
                        <div className="w-20 flex items-center justify-center">Start</div>
                        <div className="w-20 flex items-center justify-center">Finish</div>
                        <div className="w-16 flex items-center justify-center">Duration</div>
                        <div className="w-16 flex items-center justify-center">Progress</div>
                    </div>

                    {/* Right Timeline Header */}
                    <div className="flex flex-col">
                        {/* Top Tier: Year/Month */}
                        <div className="flex border-b border-slate-100 bg-slate-50/30">
                            {timelineData.topUnits.map((u, i) => (
                                <div key={i} className="shrink-0 text-center py-1.5 border-r border-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-wider bg-slate-50/50 overflow-hidden h-7" style={{ width: `${u.width}px` }}>
                                    {u.label}
                                </div>
                            ))}
                        </div>
                        {/* Bottom Tier: Days/Months/Quarters */}
                        <div className="flex">
                            {timelineData.bottomUnits.map((u, i) => (
                                <div key={i} className={`shrink-0 text-center py-1.5 border-r border-slate-100 text-[9px] font-black h-7 flex items-center justify-center ${u.isWeekend ? 'text-rose-500 bg-rose-50/15' : 'text-slate-400 bg-white'}`} style={{ width: `${unitWidth}px` }}>
                                    {u.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Rows Content */}
                <div className="min-w-max relative">
                    {visibleRows.map((row) => {
                        const hasPeriod = row.start && row.end;
                        const x = hasPeriod ? getX(row.start) : -1;
                        const w = hasPeriod ? getWidth(row.start, row.end) : 0;
                        const rowBg = row.isSummary ? 'bg-slate-50/40 font-bold' : 'hover:bg-slate-50/50';
                        const isCollapsed = collapsedRows[row.rowId];

                        return (
                            <div key={row.rowId} className={`flex border-b border-slate-100 h-9 items-stretch ${rowBg}`}>
                                {/* Left Table Row */}
                                <div className="w-[450px] shrink-0 sticky left-0 bg-white border-r border-slate-200 z-20 flex divide-x divide-slate-100 text-[11px] h-9">
                                    <div className="w-10 flex items-center justify-center text-slate-400 font-mono text-[10px]">{row.displayId}</div>
                                    <div className="w-48 flex items-center px-2 truncate gap-1" style={{ paddingLeft: `${row.indent * 12 + 8}px` }}>
                                        {/* Toggle expand/collapse button */}
                                        {row.hasChildren ? (
                                            <button 
                                                onClick={() => toggleRowCollapse(row.rowId)}
                                                className="p-0.5 text-slate-400 hover:text-slate-800 transition-colors shrink-0"
                                            >
                                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                        ) : (
                                            <div className="w-4 shrink-0" />
                                        )}

                                        {row.isSummary ? (
                                            <span className="text-slate-900 font-black truncate">{row.name}</span>
                                        ) : (
                                            <span className="text-slate-600 font-medium truncate">{row.name}</span>
                                        )}
                                    </div>
                                    <div className="w-20 flex items-center justify-center text-slate-500 font-medium">{formatDateShort(row.start)}</div>
                                    <div className="w-20 flex items-center justify-center text-slate-500 font-medium">{formatDateShort(row.end)}</div>
                                    <div className="w-16 flex items-center justify-center text-slate-500 font-medium">{getDurationDays(row.start, row.end)}</div>
                                    <div className="w-16 flex items-center justify-center text-slate-700 font-black">{row.progress}%</div>
                                </div>

                                {/* Right Timeline Row */}
                                <div className="flex-1 relative h-9">
                                    {/* Grid columns */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {timelineData.bottomUnits.map((u, i) => (
                                            <div key={i} className={`border-r border-slate-100/60 h-full shrink-0 ${u.isWeekend ? 'bg-rose-50/5' : ''}`} style={{ width: `${unitWidth}px` }} />
                                        ))}
                                    </div>

                                    {/* MS Project Gantt Bar Rendering */}
                                    {hasPeriod && x >= 0 && w > 0 && (
                                        row.isSummary ? (
                                            /* MS Project Summary Task Bar (Black brackets: [=======]) */
                                            <div 
                                                className="absolute top-1/2 -translate-y-1/2 h-[9px] z-10 flex items-center"
                                                style={{ left: `${x}px`, width: `${w}px` }}
                                            >
                                                {/* Summary Bracket Line */}
                                                <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800" />
                                                {/* Left Bracket Foot */}
                                                <div className="absolute top-0 left-0 w-1.5 h-3 bg-slate-800 rounded-bl-sm" />
                                                {/* Right Bracket Foot */}
                                                <div className="absolute top-0 right-0 w-1.5 h-3 bg-slate-800 rounded-br-sm" />
                                                
                                                {/* Summary Progress (Thin dark line inside) */}
                                                <div className="absolute top-[2px] left-0 h-1 bg-indigo-600 transition-all" style={{ width: `${row.progress}%` }} />
                                                
                                                {/* Overall label on the right */}
                                                <span className="absolute left-full ml-3 text-[9px] font-black text-slate-800 whitespace-nowrap">
                                                    {row.name} ({row.progress}%)
                                                </span>
                                            </div>
                                        ) : row.isTestTask ? (
                                            /* Thin / Inner Task Bar for Test Tasks (indent 2) */
                                            <div 
                                                className={`absolute top-1/2 -translate-y-1/2 h-[8px] rounded-sm bg-slate-100 border border-${row.progress > 0 ? 'emerald-500' : 'slate-300'} flex items-center overflow-hidden z-10`}
                                                style={{ left: `${x}px`, width: `${w}px` }}
                                            >
                                                <div 
                                                    className={`h-full ${row.progress > 0 ? 'bg-emerald-500' : 'bg-transparent'} transition-all`}
                                                    style={{ width: `${row.progress}%` }}
                                                />
                                                <span className="absolute left-full ml-2 text-[9px] font-medium text-slate-400 whitespace-nowrap italic">
                                                    {row.name} {row.progress > 0 ? '(완료)' : '(대기)'}
                                                </span>
                                            </div>
                                        ) : (
                                            /* Standard Stage Task Bar with resource color */
                                            <div 
                                                className={`absolute top-1/2 -translate-y-1/2 h-[13px] rounded ${STAGE_COLORS[row.stageId] || 'bg-slate-500 border-slate-600'} border flex items-center overflow-hidden shadow-sm z-10`}
                                                style={{ left: `${x}px`, width: `${w}px` }}
                                            >
                                                {/* Inner Progress Fill */}
                                                <div 
                                                    className="h-full bg-black/20 transition-all"
                                                    style={{ width: `${row.progress}%` }}
                                                />
                                                {/* Label beside the bar */}
                                                <span className="absolute left-full ml-2 text-[9px] font-bold text-slate-500 whitespace-nowrap">
                                                    {row.name} {row.progress > 0 ? `(${row.progress}%)` : ''}
                                                </span>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Timeline Red Vertical Line for Today */}
                    <div 
                        className="absolute top-0 bottom-0 w-[1.5px] bg-rose-500 z-40 pointer-events-none"
                        style={{ left: `calc(450px + ${getX(today)}px)` }}
                    >
                        <div className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-md absolute top-4 -left-5">TODAY</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
