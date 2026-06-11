import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Calendar, Clock, CheckCircle2, Factory, Package, Ship, Flag, ShieldCheck } from 'lucide-react';

const STAGES = [
    { id: 'CREATED', label: '의뢰 등록', icon: Flag, color: 'bg-slate-500' },
    { id: 'PROD_PLANNING', label: '생산 계획', icon: Clock, color: 'bg-indigo-500' },
    { id: 'WORK_ORDER', label: '작업 지시', icon: Package, color: 'bg-amber-500' },
    { id: 'IN_PRODUCTION', label: '생산 중', icon: Factory, color: 'bg-orange-500' },
    { id: 'QA_COMPLETE', label: '검사 완료', icon: ShieldCheck, color: 'bg-purple-500' },
    { id: 'SHIPPED', label: '출하 완료', icon: Ship, color: 'bg-emerald-500' },
];

const STATUS_ORDER = [
    'DRAFT', 'REVIEW', 'CONFIRMED', 'PROD_WAITING', 'PROD_PLANNING', 
    'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 
    'QA_COMPLETE', 'SHIP_READY', 'SHIPPED'
];

export default function PRGanttScheduler({ pr }) {
    const scrollContainerRef = useRef(null);
    const [unitWidth, setUnitWidth] = useState(60); // px per day

    if (!pr) return null;

    // Get current status index
    const currentStatusIdx = STATUS_ORDER.indexOf(pr.Status);

    // Calculate dates for each stage
    const timelineData = useMemo(() => {
        const data = STAGES.map(stage => {
            let start = null;
            let end = null;
            let done = false;
            let isCurrent = pr.Status === stage.id;

            const log = pr.Logs?.find(l => l.to === stage.id);
            const stageIdx = STATUS_ORDER.indexOf(stage.id);
            done = currentStatusIdx >= stageIdx && stageIdx !== -1;

            if (stage.id === 'CREATED') {
                start = pr.CreatedAt?.toDate ? pr.CreatedAt.toDate() : new Date(pr.CreatedAt);
                end = new Date(start.getTime() + 86400000); // 1 day for registration
            } else if (stage.id === 'PROD_PLANNING') {
                start = pr.ProdStartDate ? new Date(pr.ProdStartDate) : null;
                end = pr.ProdEndDate ? new Date(pr.ProdEndDate) : (start ? new Date(start.getTime() + 86400000 * 2) : null);
            } else if (log) {
                end = new Date(log.timestamp);
                start = new Date(end.getTime() - 86400000 * 3); // Mock 3 days duration if only end date known
            } else {
                // Fallback for visualization
                const prevLog = pr.Logs?.find(l => l.from === stage.id);
                if (prevLog) start = new Date(prevLog.timestamp);
            }

            return { ...stage, start, end, done, isCurrent };
        });

        // Determine timeline range
        const allDates = data.flatMap(d => [d.start, d.end]).filter(Boolean);
        if (allDates.length === 0) {
            const today = new Date();
            allDates.push(new Date(today.getTime() - 86400000 * 7), new Date(today.getTime() + 86400000 * 14));
        }
        
        const minDate = new Date(Math.min(...allDates));
        minDate.setDate(minDate.getDate() - 2);
        const maxDate = new Date(Math.max(...allDates));
        maxDate.setDate(maxDate.getDate() + 5);

        return { stages: data, minDate, maxDate };
    }, [pr, currentStatusIdx]);

    const getX = (date) => {
        if (!date) return -1;
        const diff = (date.getTime() - timelineData.minDate.getTime()) / (1000 * 60 * 60 * 24);
        return diff * unitWidth;
    };

    const getWidth = (start, end) => {
        if (!start || !end) return unitWidth * 2; // Default width
        const xStart = getX(start);
        const xEnd = getX(end);
        return Math.max(xEnd - xStart, unitWidth);
    };

    const totalWidth = (timelineData.maxDate.getTime() - timelineData.minDate.getTime()) / (1000 * 60 * 60 * 24) * unitWidth;

    return (
        <div className="flex flex-col gap-6 w-full text-left">
            {/* Header / Info */}
            <div className="flex justify-between items-end">
                <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Production Stage Timeline</h4>
                    <p className="text-lg font-black text-slate-900">{pr.PRNumber} <span className="text-slate-400 font-bold ml-2">[{pr.PartName}]</span></p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-400">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500" /> In Progress</div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-200" /> Pending</div>
                </div>
            </div>

            {/* Gantt Container */}
            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm flex flex-col h-[400px]">
                {/* Timeline Header */}
                <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative"
                >
                    {/* Time Axis Grid */}
                    <div className="absolute inset-0 flex pointer-events-none">
                        {Array.from({ length: Math.ceil(totalWidth / unitWidth) }).map((_, i) => {
                            const date = new Date(timelineData.minDate.getTime() + i * 86400000);
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            return (
                                <div 
                                    key={i} 
                                    className={`shrink-0 border-r border-slate-50 h-full flex flex-col ${isWeekend ? 'bg-slate-50/50' : ''}`}
                                    style={{ width: `${unitWidth}px` }}
                                >
                                    <div className="h-8 border-b border-slate-100 flex items-center justify-center text-[9px] font-black text-slate-400">
                                        {date.getMonth() + 1}/{date.getDate()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bars Area */}
                    <div className="relative pt-12 pb-8 flex flex-col gap-6" style={{ width: `${totalWidth}px` }}>
                        {timelineData.stages.map((stage, idx) => {
                            const start = stage.start || new Date(timelineData.minDate.getTime() + (idx + 1) * 86400000 * 2);
                            const end = stage.end || new Date(start.getTime() + 86400000 * 3);
                            const x = getX(start);
                            const w = getWidth(start, end);
                            
                            return (
                                <div key={stage.id} className="relative h-10 group">
                                    {/* Connection Line */}
                                    {idx < timelineData.stages.length - 1 && (
                                        <div 
                                            className={`absolute h-[2px] -z-10 transition-colors ${stage.done ? 'bg-indigo-200' : 'bg-slate-100'}`}
                                            style={{ 
                                                left: `${x + w}px`, 
                                                width: `${unitWidth}px`,
                                                top: '50%'
                                            }}
                                        />
                                    )}

                                    {/* The Bar */}
                                    <div 
                                        className={`absolute h-full rounded-2xl flex items-center gap-3 px-4 shadow-lg transition-all duration-500 group-hover:scale-[1.02] cursor-pointer ${
                                            stage.isCurrent ? 'bg-indigo-600 ring-4 ring-indigo-100' :
                                            stage.done ? 'bg-emerald-500' : 'bg-slate-100 border border-slate-200 shadow-none'
                                        }`}
                                        style={{ left: `${x}px`, width: `${w}px` }}
                                    >
                                        <div className={`p-1.5 rounded-lg ${stage.done || stage.isCurrent ? 'bg-white/20 text-white' : 'bg-white text-slate-400'}`}>
                                            <stage.icon size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-[11px] font-black truncate ${stage.done || stage.isCurrent ? 'text-white' : 'text-slate-600'}`}>{stage.label}</p>
                                            <p className={`text-[9px] font-bold truncate ${stage.done || stage.isCurrent ? 'text-white/70' : 'text-slate-400'}`}>
                                                {stage.done ? 'Completed' : stage.isCurrent ? 'In Progress' : 'Planned'}
                                            </p>
                                        </div>
                                        
                                        {/* Status Checkmark */}
                                        {stage.done && !stage.isCurrent && (
                                            <div className="ml-auto bg-white/20 rounded-full p-0.5">
                                                <CheckCircle2 size={12} className="text-white" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Date Labels under/over */}
                                    <div 
                                        className="absolute -top-5 text-[8px] font-black text-slate-400 whitespace-nowrap"
                                        style={{ left: `${x}px` }}
                                    >
                                        {start.toLocaleDateString()}
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Today Marker */}
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 pointer-events-none"
                            style={{ left: `${getX(new Date())}px` }}
                        >
                            <div className="bg-rose-500 text-white text-[8px] font-black px-1 py-0.5 rounded shadow absolute top-0 -left-4">NOW</div>
                        </div>
                    </div>
                </div>
                
                {/* Footer Legend */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                    <div className="flex gap-6">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Start Date</span>
                            <span className="text-xs font-black text-slate-700">{timelineData.minDate.toLocaleDateString()}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Estimated Finish</span>
                            <span className="text-xs font-black text-slate-700">{pr.DueDate || '-'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button onClick={() => setUnitWidth(w => Math.max(w - 10, 30))} className="p-1.5 hover:bg-white rounded-lg border border-slate-200 text-slate-400">-</button>
                         <span className="text-[10px] font-black text-slate-600 px-2">Zoom: {unitWidth}px</span>
                         <button onClick={() => setUnitWidth(w => Math.min(w + 10, 150))} className="p-1.5 hover:bg-white rounded-lg border border-slate-200 text-slate-400">+</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
