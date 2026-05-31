import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export default function ProjectGanttChart({ projects, stages }) {
    const [viewMode, setViewMode] = useState('month'); // day | month | quarter
    const [unitWidth, setUnitWidth] = useState(36); // 기본 너비 36px (심플하게 축소)
    const scrollContainerRef = useRef(null);

    // 휠 스크롤 가로 전환
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
        planning: 'bg-blue-400 border-blue-500',
        development: 'bg-indigo-400 border-indigo-500',
        dev_pp: 'bg-amber-400 border-amber-500',
        qa_test: 'bg-purple-400 border-purple-500',
        prod_pp: 'bg-emerald-400 border-emerald-500',
        mp_transfer: 'bg-rose-400 border-rose-500',
    };

    // Zoom Functions
    const handleZoomIn = () => setUnitWidth(prev => Math.min(prev + 8, 120));
    const handleZoomOut = () => setUnitWidth(prev => Math.max(prev - 8, 20));
    const handleResetZoom = () => setUnitWidth(36);

    // Chart Range Configuration
    const today = new Date();
    const timelineData = useMemo(() => {
        const topUnits = [];
        const bottomUnits = [];
        let start, end;

        if (viewMode === 'day') {
            start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
            end = new Date(start.getTime() + (60 * 24 * 60 * 60 * 1000)); // 60일치
            
            let curr = new Date(start);
            while (curr <= end) {
                const yearMonth = `${curr.getFullYear()}.${curr.getMonth() + 1}`;
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
                curr.setMonth(curr.getMonth() + 1);
            }
        } else { // quarter
            start = new Date(today.getFullYear() - 2, 0, 1);
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
                curr.setMonth(curr.getMonth() + 3);
            }
        }
        return { topUnits, bottomUnits, start, end };
    }, [viewMode, unitWidth]);

    const getX = (date) => {
        if (!date) return -1;
        const d = new Date(date);
        if (viewMode === 'day') {
            const diff = (d.getTime() - timelineData.start.getTime()) / (1000 * 60 * 60 * 24);
            return diff * unitWidth;
        } else if (viewMode === 'month') {
            const diffY = d.getFullYear() - timelineData.start.getFullYear();
            const diffM = d.getMonth() - timelineData.start.getMonth();
            const totalM = diffY * 12 + diffM;
            const dayOffset = (d.getDate() - 1) / 31; // Approximate day within month
            return (totalM + dayOffset) * unitWidth;
        } else { // quarter
            const diffY = d.getFullYear() - timelineData.start.getFullYear();
            const diffM = d.getMonth() - timelineData.start.getMonth();
            const totalQ = (diffY * 12 + diffM) / 3;
            const dayOffset = ((d.getMonth() % 3) * 31 + d.getDate()) / 93; // Approximate position within quarter
            return (totalQ + dayOffset) * unitWidth;
        }
    };

    const getWidth = (start, end) => {
        if (!start || !end) return 0;
        const width = getX(end) - getX(start) + (viewMode === 'day' ? unitWidth : 0);
        return Math.max(width, 2); // Minimum 2px visible
    };

    return (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col h-[600px]">
            {/* Header / Controls */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Calendar size={16} className="text-indigo-600"/> 프로젝트 일정 로드맵
                    </h3>
                    <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1">
                        {['day', 'month', 'quarter'].map(m => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                    viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {m === 'day' ? '일별' : m === 'month' ? '월별' : '분기별'}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-slate-200 mx-1" />

                    {/* Zoom Controls */}
                    <div className="flex items-center bg-slate-200/50 p-1 rounded-xl gap-0.5">
                        <button onClick={handleZoomOut} className="p-1.5 hover:bg-white rounded-lg text-slate-500 transition-all"><ZoomOut size={14}/></button>
                        <button onClick={handleResetZoom} className="px-2 text-[10px] font-black text-slate-600 hover:text-indigo-600 transition-all uppercase">{unitWidth}px</button>
                        <button onClick={handleZoomIn} className="p-1.5 hover:bg-white rounded-lg text-slate-500 transition-all"><ZoomIn size={14}/></button>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {stages.map(s => (
                        <div key={s.id} className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${STAGE_COLORS[s.id].split(' ')[0]}`} />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-auto custom-scrollbar relative bg-white"
            >
                {/* 2-Tier Timeline Axis */}
                <div className="sticky top-0 z-30 bg-white border-b border-slate-200 flex min-w-max">
                    <div className="w-56 shrink-0 p-4 border-r border-slate-100 bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0 z-40 flex items-center">
                        Project & Stages
                    </div>
                    <div className="flex flex-col">
                        {/* Top Tier */}
                        <div className="flex border-b border-slate-100 bg-slate-50/30">
                            {timelineData.topUnits.map((u, i) => (
                                <div key={i} className="shrink-0 text-center py-1.5 border-r border-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-50/50 overflow-hidden" style={{ width: `${u.width}px` }}>
                                    {u.label}
                                </div>
                            ))}
                        </div>
                        {/* Bottom Tier */}
                        <div className="flex">
                            {timelineData.bottomUnits.map((u, i) => (
                                <div key={i} className={`shrink-0 text-center py-2 border-r border-slate-100 text-[9px] font-black ${u.isWeekend ? 'text-rose-400 bg-rose-50/20' : 'text-slate-400 bg-white'}`} style={{ width: `${unitWidth}px` }}>
                                    {unitWidth > 25 ? u.label : ''}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Grid Content */}
                <div className="min-w-max relative">
                    {projects.map(project => (
                        <div key={project.id} className="border-b border-slate-100">
                            {/* Project Header Row */}
                            <div className="flex bg-slate-50/20 group relative">
                                <div className="w-56 shrink-0 p-4 border-r border-slate-100 sticky left-0 bg-slate-50/90 z-20 flex flex-col justify-center">
                                    <div className="text-[11px] font-black text-slate-800 truncate uppercase">{project.name}</div>
                                    <div className="text-[9px] font-bold text-slate-400 font-mono tracking-tighter">{project.code}</div>
                                </div>
                                <div className="flex-1 relative h-12">
                                    {/* Grid Lines */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {timelineData.bottomUnits.map((_, i) => (
                                            <div key={i} className="border-r border-slate-50 h-full shrink-0" style={{ width: `${unitWidth}px` }} />
                                        ))}
                                    </div>
                                    {/* Project Main Bar */}
                                    {project.startDate && project.endDate && (
                                        <div 
                                            className="absolute top-1/2 -translate-y-1/2 h-6 rounded-lg bg-slate-200 border border-slate-300 flex items-center px-3 z-10 overflow-hidden opacity-70"
                                            style={{ 
                                                left: `${getX(project.startDate)}px`, 
                                                width: `${getWidth(project.startDate, project.endDate)}px`
                                            }}
                                        >
                                            <span className="text-[8px] font-black text-slate-500 uppercase whitespace-nowrap overflow-hidden">Overall Schedule</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stage Rows */}
                            {stages.map((stage) => {
                                const schedule = project.schedules?.[stage.id];
                                if (!schedule?.start || !schedule?.end) return null;

                                return (
                                    <div key={`${project.id}-${stage.id}`} className="flex group hover:bg-slate-50/50 transition-colors border-t border-slate-50">
                                        <div className="w-56 shrink-0 pl-8 pr-4 py-2 border-r border-slate-100 sticky left-0 bg-white group-hover:bg-slate-50 z-20 flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${STAGE_COLORS[stage.id].split(' ')[0]}`} />
                                            <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">{stage.label}</span>
                                        </div>
                                        <div className="flex-1 relative h-9">
                                            {/* Sub-grid Lines */}
                                            <div className="absolute inset-0 flex pointer-events-none">
                                                {timelineData.bottomUnits.map((_, i) => (
                                                    <div key={i} className="border-r border-slate-50 h-full shrink-0" style={{ width: `${unitWidth}px` }} />
                                                ))}
                                            </div>
                                            {/* Stage Bar */}
                                            <div 
                                                className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md ${STAGE_COLORS[stage.id]} border shadow-sm flex items-center px-2 cursor-pointer hover:brightness-95 transition-all z-10 overflow-hidden`}
                                                style={{ 
                                                    left: `${getX(schedule.start)}px`, 
                                                    width: `${getWidth(schedule.start, schedule.end)}px`
                                                }}
                                                title={`${stage.label}: ${schedule.start} ~ ${schedule.end}`}
                                            >
                                                <span className="text-[7px] font-black text-white whitespace-nowrap drop-shadow-sm overflow-hidden">{unitWidth > 40 ? stage.label : ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* Today Line */}
                    <div 
                        className="absolute top-0 bottom-0 w-px bg-rose-500 z-40 pointer-events-none shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                        style={{ left: `calc(14rem + ${getX(today)}px)` }}
                    >
                        <div className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm absolute top-4 -left-5">TODAY</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
