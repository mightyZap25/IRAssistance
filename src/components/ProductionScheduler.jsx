import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Calendar as CalendarIcon, Clock, Factory, CheckCircle2, ShieldCheck, Ship, Flag, TrendingUp } from 'lucide-react';

const STATUS_CONFIG = {
    PROD_WAITING:    { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: Clock, label: '대기' },
    PROD_PLANNING:   { color: 'bg-teal-50 text-teal-700 border-teal-100', icon: CalendarIcon, label: '계획' },
    WORK_ORDER:      { color: 'bg-cyan-50 text-cyan-700 border-cyan-100', icon: Factory, label: '지시' },
    IN_PRODUCTION:   { color: 'bg-orange-50 text-orange-700 border-orange-200', icon: Factory, label: '생산중' },
    QA_WAITING:      { color: 'bg-purple-50 text-purple-700 border-purple-100', icon: ShieldCheck, label: '검사' },
    QA_COMPLETE:     { color: 'bg-emerald-500 text-white border-emerald-600', icon: CheckCircle2, label: '완료' },
    SHIP_READY:      { color: 'bg-indigo-500 text-white border-indigo-600', icon: Ship, label: '출하준비' },
    SHIPPED:         { color: 'bg-slate-700 text-white border-slate-800', icon: CheckCircle2, label: '출하완료' },
};

export default function ProductionScheduler({ prs, onCardClick }) {
    const scrollRef = useRef(null);
    const [viewType, setViewType] = useState('day'); // 'day', 'week', 'month'
    const [zoomLevel, setZoomLevel] = useState(30); 
    const [viewDate, setViewDate] = useState(new Date());

    // 뷰 타입별 줌 레벨 설정 (정수 단위로 소수점 오차 방지)
    useEffect(() => {
        if (viewType === 'day') setZoomLevel(30);
        else if (viewType === 'week') setZoomLevel(6); // 7일 * 6 = 42px
        else if (viewType === 'month') setZoomLevel(2); // 30일 * 2 = 60px
    }, [viewType]);

    // 시간 범위 생성
    const timeRange = useMemo(() => {
        const dates = [];
        const start = new Date(viewDate);
        if (viewType === 'day') {
            start.setDate(start.getDate() - 15);
            for (let i = 0; i < 45; i++) {
                const d = new Date(start); d.setDate(d.getDate() + i); dates.push(d);
            }
        } else if (viewType === 'week') {
            start.setDate(start.getDate() - 50);
            for (let i = 0; i < 110; i++) {
                const d = new Date(start); d.setDate(d.getDate() + i); dates.push(d);
            }
        } else {
            start.setMonth(start.getMonth() - 5);
            for (let i = 0; i < 300; i++) {
                const d = new Date(start); d.setDate(d.getDate() + i); dates.push(d);
            }
        }
        return dates;
    }, [viewDate, viewType]);

    const shouldShowHeader = (date, i) => {
        if (viewType === 'day') return true;
        if (viewType === 'week') return date.getDay() === 1; // 월요일
        if (viewType === 'month') return date.getDate() === 1; // 1일
        return false;
    };
const getHeaderLabel = (date) => {
    if (viewType === 'day') return date.getDate();
    if (viewType === 'week') {
        const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const weekNum = Math.ceil((date.getDate() + firstDayOfMonth.getDay()) / 7);
        return `${weekNum}주`; // 월 정보 제외, 'N주'만 표시
    }
    return '';
};


    const yearSegments = useMemo(() => {
        const segments = [];
        if (timeRange.length === 0) return segments;
        let current = { year: timeRange[0].getFullYear(), count: 1 };
        for (let i = 1; i < timeRange.length; i++) {
            const y = timeRange[i].getFullYear();
            if (y !== current.year) { segments.push(current); current = { year: y, count: 1 }; }
            else { current.count++; }
        }
        segments.push(current);
        return segments;
    }, [timeRange]);

    const monthSegments = useMemo(() => {
        const segments = [];
        if (timeRange.length === 0) return segments;
        let current = { month: timeRange[0].getMonth(), count: 1, year: timeRange[0].getFullYear() };
        for (let i = 1; i < timeRange.length; i++) {
            const m = timeRange[i].getMonth();
            const y = timeRange[i].getFullYear();
            if (m !== current.month || y !== current.year) { segments.push(current); current = { month: m, count: 1, year: y }; }
            else { current.count++; }
        }
        segments.push(current);
        return segments;
    }, [timeRange]);

    const headerSegments = useMemo(() => {
        const segments = [];
        if (timeRange.length === 0) return segments;
        let currentSegment = { date: timeRange[0], count: 1 };
        for (let i = 1; i < timeRange.length; i++) {
            if (shouldShowHeader(timeRange[i], i)) { segments.push(currentSegment); currentSegment = { date: timeRange[i], count: 1 }; }
            else { currentSegment.count++; }
        }
        segments.push(currentSegment);
        return segments;
    }, [timeRange, viewType]);

    const getX = (dateStr) => {
        if (!dateStr) return -1;
        const date = new Date(dateStr);
        date.setHours(0,0,0,0);
        const start = timeRange[0];
        start.setHours(0,0,0,0);
        const diff = (date.getTime() - start.getTime()) / 86400000;
        return diff * zoomLevel;
    };

    const getTodayX = () => {
        const today = new Date();
        today.setHours(0,0,0,0);
        return getX(today.toISOString());
    };

    // 품목별 그룹화 데이터 생성
    const groupedPrs = useMemo(() => {
        const groups = {};
        prs.forEach(pr => {
            const key = pr.PartName || 'Unknown';
            if (!groups[key]) {
                groups[key] = {
                    PartName: key,
                    PRNumber: pr.PRNumber, // 대표 번호
                    items: []
                };
            }
            groups[key].items.push(pr);
        });
        return Object.values(groups);
    }, [prs]);

    const scrollToToday = () => {
        if (scrollRef.current) {
            const todayX = getTodayX();
            const containerWidth = scrollRef.current.offsetWidth;
            scrollRef.current.scrollLeft = todayX - (containerWidth / 3);
        }
    };

    useEffect(() => {
        setTimeout(scrollToToday, 100);
    }, [zoomLevel, groupedPrs.length]);

    return (
        <div className="flex-1 bg-white rounded-[40px] border border-slate-200 overflow-hidden flex flex-col shadow-sm text-left select-none min-h-[600px]">
            <div className="px-8 py-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-6">
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                        <div className="p-2 bg-emerald-50 rounded-xl"><Flag size={18} className="text-emerald-600"/></div>
                        생산 통합 타임라인 (품목별)
                    </h3>
                    <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
                        {[ { id: 'day', label: '일간' }, { id: 'week', label: '주간' }, { id: 'month', label: '월간' } ].map(t => (
                            <button key={t.id} onClick={() => setViewType(t.id)} className={`px-4 py-1.5 rounded-xl text-[11px] font-black transition-all ${viewType === t.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t.label}</button>
                        ))}
                    </div>
                    <div className="flex bg-slate-50 rounded-2xl p-1 gap-1 border border-slate-100 shadow-inner">
                        <button onClick={() => setViewDate(new Date(viewDate.setDate(viewDate.getDate() - 14)))} className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-slate-400 transition-all"><ChevronLeft size={16}/></button>
                        <button onClick={() => { setViewDate(new Date()); scrollToToday(); }} className="px-4 text-[11px] font-black text-slate-600 hover:text-emerald-600 transition-colors">오늘(TODAY)</button>
                        <button onClick={() => setViewDate(new Date(viewDate.setDate(viewDate.getDate() + 14)))} className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-slate-400 transition-all"><ChevronRight size={16}/></button>
                    </div>
                </div>
                <div className="flex items-center gap-4 text-slate-400">
                    <button onClick={() => setZoomLevel(prev => Math.max(5, prev - 10))} className="p-2 hover:bg-slate-50 rounded-xl transition-all"><ZoomOut size={16}/></button>
                    <span className="text-[10px] font-black w-12 text-center">{zoomLevel}px</span>
                    <button onClick={() => setZoomLevel(prev => Math.min(300, prev + 10))} className="p-2 hover:bg-slate-50 rounded-xl transition-all"><ZoomIn size={16}/></button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden bg-slate-50/20">
                <div className="w-80 border-r border-slate-100 flex flex-col shrink-0 bg-white z-20 shadow-2xl shadow-slate-200/20">
                    <div className="h-[84px] border-b border-slate-100 bg-slate-50/50 flex items-center px-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] justify-between">
                        <span>Items Pipeline</span>
                        <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-400">({groupedPrs.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-slate-50">
                        {groupedPrs.map(group => (
                            <div key={group.PartName} className="h-[50px] px-6 flex items-center justify-between hover:bg-slate-50 transition-all border-l-4 border-transparent hover:border-emerald-500 group">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="text-[12px] font-black text-slate-800 group-hover:text-emerald-700 transition-colors truncate">{group.PartName}</span>
                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter shrink-0">{group.items.length} 건</span>
                                </div>
                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase tracking-tighter shrink-0 ml-2">
                                    Total: {group.items.reduce((acc, cur) => acc + (cur.qty || cur.TargetQty || 0), 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-auto custom-scrollbar relative">
                    <div className="sticky top-0 z-10 flex flex-col bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
                        <div className="flex h-6 border-b border-slate-100">
                            {yearSegments.map((s, i) => (
                                <div key={i} className="shrink-0 border-r border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 bg-slate-50/30 uppercase tracking-widest" style={{ width: `${s.count * zoomLevel}px` }}>{s.year}년</div>
                            ))}
                        </div>
                        <div className="flex h-6 border-b border-slate-100">
                            {monthSegments.map((s, i) => (
                                <div key={i} className="shrink-0 border-r border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-700 bg-white" style={{ width: `${s.count * zoomLevel}px` }}>{s.month + 1}월</div>
                            ))}
                        </div>
                        <div className="flex h-9">
                            {headerSegments.map((segment, i) => {
                                const date = segment.date;
                                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                const isToday = new Date().toDateString() === date.toDateString();
                                return (
                                    <div key={i} className={`shrink-0 border-r border-slate-200 flex flex-col items-center justify-center ${isWeekend ? 'bg-slate-50/30' : ''}`} style={{ width: `${segment.count * zoomLevel}px` }}>
                                        <span className={`text-[8px] font-black uppercase tracking-tighter ${isWeekend ? 'text-slate-300' : 'text-slate-400'}`}>{viewType === 'day' ? ['일','월','화','수','목','금','토'][date.getDay()] : ''}</span>
                                        <span className={`text-[10px] font-black whitespace-nowrap ${isToday && viewType === 'day' ? 'text-emerald-600 bg-emerald-50 px-1.5 rounded' : 'text-slate-500'}`}>{getHeaderLabel(date)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="relative min-h-full" style={{ width: `${timeRange.length * zoomLevel}px` }}>
                        <div className="absolute inset-0 flex pointer-events-none">
                            {headerSegments.map((segment, i) => (
                                <div key={i} className={`h-full border-r border-slate-200/60 ${segment.date.getDay() === 0 || segment.date.getDay() === 6 ? 'bg-slate-50/10' : ''}`} style={{ width: `${segment.count * zoomLevel}px` }} />
                            ))}
                        </div>
                        <div className="absolute top-0 bottom-0 w-[3px] bg-emerald-500/20 z-10 pointer-events-none" style={{ left: `${getTodayX()}px` }}><div className="bg-emerald-600 text-white text-[9px] font-black px-2 py-1 rounded shadow-lg absolute top-0 -left-6 z-20 uppercase tracking-widest">오늘</div></div>
                        <div className="flex flex-col pt-1">
                            {groupedPrs.map(group => (
                                <div key={group.PartName} className="h-[50px] relative flex items-center border-b border-slate-50/50 group">
                                    {group.items.map(pr => {
                                        const startX = getX(pr.StartDate);
                                        const endX = getX(pr.EndDate);
                                        const barWidth = Math.max(zoomLevel / 2, endX - startX + zoomLevel);
                                        const statusInfo = STATUS_CONFIG[pr.Status] || STATUS_CONFIG.PROD_WAITING;
                                        if (startX === -1) return null;
                                        return (
                                            <div 
                                                key={pr.id} 
                                                className={`absolute h-8 rounded-lg border-2 ${statusInfo.color} shadow-sm flex items-center px-2 gap-1.5 transition-all group-hover:shadow-md hover:-translate-y-0.5 cursor-pointer z-10`} 
                                                style={{ left: `${startX}px`, width: `${barWidth}px` }} 
                                                onClick={(e) => { e.stopPropagation(); onCardClick(pr); }}
                                                title={`[${pr.PRNumber}] Qty: ${pr.qty || pr.TargetQty}`}
                                            >
                                                <div className="p-0.5 bg-white/40 rounded shadow-inner shrink-0"><statusInfo.icon size={10} className="text-current opacity-80" /></div>
                                                <span className="text-[9px] font-black whitespace-nowrap overflow-hidden text-ellipsis leading-tight text-current">{pr.PRNumber}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-10 py-4 bg-white border-t border-slate-100 flex items-center gap-10 shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mr-4">상태 범례 (Status)</span>
                {Object.entries(STATUS_CONFIG).slice(0, 5).map(([key, info]) => (
                    <div key={key} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full border-2 ${info.color.split(' ')[0]} ${info.color.split(' ')[2]}`} />
                        <span className="text-[11px] font-black text-slate-600 tracking-tight">{info.label}</span>
                    </div>
                ))}
                <div className="ml-auto flex items-center gap-2 text-slate-300">
                    <TrendingUp size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Chronological Waterfall View</span>
                </div>
            </div>
        </div>
    );
}
