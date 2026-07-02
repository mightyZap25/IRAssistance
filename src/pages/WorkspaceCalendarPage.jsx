import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, orderBy } from '../firebase';
// Task service removed for Odoo migration
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon,
    Clock, AlertTriangle, CheckCircle2, Circle,
    Briefcase, AlertCircle, Coffee, ShieldCheck, User, Filter, Plus, ChevronRight as ChevronRightIcon
} from 'lucide-react';

// New Components
import WorkspaceEventDetailModal from '../components/WorkspaceEventDetailModal';
import QuickTaskCreateModal from '../components/QuickTaskCreateModal';

const KOREAN_HOLIDAYS = {
    '01-01': '신정', '02-09': '설날 연휴', '02-10': '설날', '02-11': '설날 연휴', '02-12': '대체공휴일',
    '03-01': '삼일절', '05-05': '어린이날', '05-06': '대체공휴일', '06-06': '현충일',
    '08-15': '광복절', '09-16': '추석 연휴', '09-17': '추석', '09-18': '추석 연휴',
    '10-03': '개천절', '10-09': '한글날', '12-25': '크리스마스'
};

export default function WorkspaceCalendarPage() {
    const { currentUser } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Data states
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [issues, setIssues] = useState([]);
    const [attendanceRequests, setAttendanceRequests] = useState([]);

    // Filter states
    const [showAttendance, setShowAttendance] = useState(true);
    const [showProjects, setShowProjects] = useState(true);
    const [showTasks, setShowTasks] = useState(true);
    const [showIssues, setShowIssues] = useState(true);

    // Modal & Selection states
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
    const [selectedDateForNewTask, setSelectedDateForNewTask] = useState(new Date());
    const [selectedDayAgenda, setSelectedDayAgenda] = useState(null); // { date: Date, events: [] }

    useEffect(() => {
        if (currentUser) {
            fetchCalendarData();
        }
    }, [currentUser]);

    const fetchCalendarData = async () => {
        setLoading(true);
        try {
            // 1. Fetch personal tasks
            const taskData = [];

            // 2. Fetch projects
            const projSnap = await getDocs(collection(db, 'projects'));
            const projData = projSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 3. Fetch issues assigned to current user
            const issueSnap = await getDocs(query(collection(db, 'issues'), where('assignedTo', '==', currentUser.email)));
            const issueData = issueSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 4. Fetch approved attendance / leave requests
            const attSnap = await getDocs(query(collection(db, 'attendance_requests'), where('Status', '==', 'Approved')));
            const attData = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setTasks(taskData);
            setProjects(projData);
            setIssues(issueData);
            setAttendanceRequests(attData);
        } catch (error) {
            console.error("Failed to fetch unified workspace calendar data:", error);
        } finally {
            setLoading(false);
        }
    };

    const calendarData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();

        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            days.push({ date: new Date(year, month - 1, prevMonthLastDay - i), currentMonth: false });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ date: new Date(year, month, i), currentMonth: true });
        }
        const remainingDays = 42 - days.length;
        for (let i = 1; i <= remainingDays; i++) {
            days.push({ date: new Date(year, month + 1, i), currentMonth: false });
        }
        return days;
    }, [currentDate]);

    const getProjectColor = (projectId) => {
        const colors = ['amber', 'orange', 'fuchsia', 'pink', 'purple', 'violet', 'cyan', 'blue'];
        let hash = 0;
        for (let i = 0; i < projectId.length; i++) {
            hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };

    const getAttendanceInfo = (req) => {
        if (req.category === 'Leave') {
            const typeMap = { 'Annual': '연차', 'Hourly': '시간차', 'Official': '공가' };
            return {
                label: typeMap[req.type] || '휴가',
                color: 'emerald'
            };
        }
        if (req.type === 'Trip') {
            return { label: '출장', color: 'sky' };
        }
        if (req.type === 'Outside') {
            return { label: '외근', color: 'teal' };
        }
        if (req.type === 'WFH') {
            return { label: '재택', color: 'indigo' };
        }
        return { label: '근태', color: 'slate' };
    };

    const getEventsForDate = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        const dayEvents = [];

        // 1. Attendance / Leaves
        if (showAttendance) {
            attendanceRequests.forEach(req => {
                if (req.startDate && req.endDate && dateStr >= req.startDate && dateStr <= req.endDate) {
                    const isStart = dateStr === req.startDate;
                    const isEnd = dateStr === req.endDate;
                    const info = getAttendanceInfo(req);
                    dayEvents.push({
                        id: req.id,
                        title: `[${info.label}] ${req.userName}`,
                        type: 'attendance',
                        isStart,
                        isEnd,
                        color: info.color,
                        colorClass: `bg-${info.color}-500 text-white font-bold border-0 hover:bg-${info.color}-600 shadow-sm`,
                        raw: req
                    });
                }
            });
        }

        // 2. Project stage schedules
        if (showProjects) {
            projects.forEach(p => {
                if (p.schedules) {
                    Object.entries(p.schedules).forEach(([stageId, sched]) => {
                        const pColor = getProjectColor(p.id);
                        if (sched.start && sched.end) {
                            const isStart = dateStr === sched.start;
                            const isEnd = dateStr === sched.end;

                            if (isStart || isEnd) {
                                dayEvents.push({
                                    id: `${p.id}-${stageId}-${isStart ? 'start' : 'end'}`,
                                    title: `[프로젝트] ${p.name.slice(0, 6)}...: ${stageId} ${isStart ? '(시작)' : '(종료)'}`,
                                    type: 'project',
                                    isStart: true, // 각각 독립된 블록으로 표시하기 위해 둘 다 true
                                    isEnd: true,
                                    color: pColor,
                                    colorClass: `bg-${pColor}-500 text-white border-0 font-bold hover:bg-${pColor}-600 shadow-sm`,
                                    raw: { ...sched, projectName: p.name, stageId, progress: p.progress }
                                });
                            }
                        } else if (sched.end && sched.end === dateStr) {
                            dayEvents.push({
                                id: `${p.id}-${stageId}`,
                                title: `[프로젝트] ${p.name.slice(0, 6)}...: ${stageId} 마감`,
                                type: 'project',
                                isStart: true,
                                isEnd: true,
                                color: pColor,
                                colorClass: `bg-${pColor}-500 text-white border-0 font-bold hover:bg-${pColor}-600 shadow-sm`,
                                raw: { ...sched, projectName: p.name, stageId, progress: p.progress }
                            });
                        }
                    });
                }
            });
        }

        // 3. Personal Tasks
        if (showTasks) {
            const tasksOnDate = tasks.filter(t => {
                if (!t.dueDate) return false;
                const tDate = new Date(t.dueDate).toISOString().split('T')[0];
                return tDate === dateStr;
            });
            if (tasksOnDate.length > 0) {
                const total = tasksOnDate.length;
                const completed = tasksOnDate.filter(t => t.status === 'completed').length;
                dayEvents.push({
                    id: `tasks-summary-${dateStr}`,
                    title: `[할일] ${completed}/${total}`,
                    type: 'task_summary',
                    colorClass: completed === total
                        ? 'bg-slate-100 text-slate-400 opacity-60 line-through border border-slate-200 hover:bg-slate-200'
                        : 'bg-indigo-500/10 text-indigo-700 border border-indigo-200 hover:bg-indigo-500/20 font-bold',
                    raw: {
                        date: dateStr,
                        tasks: tasksOnDate,
                        completed,
                        total
                    }
                });
            }
        }

        // 4. Issues
        if (showIssues) {
            issues.forEach(i => {
                if (i.dueDate && i.dueDate === dateStr) {
                    dayEvents.push({
                        id: i.id,
                        title: `[이슈] ${i.title}`,
                        type: 'issue',
                        colorClass: 'bg-rose-500 text-white border-0 hover:bg-rose-600 font-semibold shadow-sm',
                        raw: i
                    });
                }
            });
        }

        const typeOrder = { 'attendance': 1, 'task_summary': 2, 'project': 3, 'issue': 4 };
        return dayEvents.sort((a, b) => {
            const orderA = typeOrder[a.type] || 99;
            const orderB = typeOrder[b.type] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.id).localeCompare(String(b.id));
        });
    };

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    const handleDateClick = (date) => {
        setSelectedDateForNewTask(date);
        setIsQuickCreateOpen(true);
    };

    const MAX_VISIBLE_EVENTS = 3;

    return (
        <div className="h-full flex flex-col space-y-4">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm gap-2">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <CalendarIcon className="text-indigo-600" size={20} /> 통합 일정 관리
                    </h1>
                    <p className="text-slate-400 text-[10px] mt-0.5 font-medium">날짜를 클릭하여 새로운 할 일을 빠르게 추가하고, 전사 공정 및 근태 현황을 확인하세요.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={goToToday} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all">오늘</button>
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button onClick={prevMonth} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600"><ChevronLeft size={14} /></button>
                        <span className="px-2 text-[10px] font-black text-slate-800 min-w-[90px] text-center">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
                        <button onClick={nextMonth} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600"><ChevronRight size={14} /></button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                {/* Left Sidebar Filter Panel */}
                <div className="w-full md:w-52 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4 shrink-0">
                    <div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2.5">
                            <Filter size={10} /> 일정 필터 설정
                        </h3>
                        <div className="space-y-1.5">
                            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-[10px] font-bold text-slate-600">근태 및 휴가</span>
                                </div>
                                <input type="checkbox" checked={showAttendance} onChange={(e) => setShowAttendance(e.target.checked)} className="w-3.5 h-3.5 text-emerald-600 border-slate-350 rounded focus:ring-emerald-500 cursor-pointer" />
                            </label>
                            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                    <span className="text-[10px] font-bold text-slate-600">프로젝트 마감일</span>
                                </div>
                                <input type="checkbox" checked={showProjects} onChange={(e) => setShowProjects(e.target.checked)} className="w-3.5 h-3.5 text-amber-600 border-slate-350 rounded focus:ring-amber-500 cursor-pointer" />
                            </label>
                            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                    <span className="text-[10px] font-bold text-slate-600">개인 할 일 (Task)</span>
                                </div>
                                <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 border-slate-350 rounded focus:ring-indigo-500 cursor-pointer" />
                            </label>
                            <label className="flex items-center justify-between p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-all cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                                    <span className="text-[10px] font-bold text-slate-600">할당된 이슈</span>
                                </div>
                                <input type="checkbox" checked={showIssues} onChange={(e) => setShowIssues(e.target.checked)} className="w-3.5 h-3.5 text-rose-600 border-slate-350 rounded focus:ring-rose-500 cursor-pointer" />
                            </label>
                        </div>
                    </div>
                    <div className="mt-auto p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-medium text-slate-500 leading-relaxed">
                            💡 **Tip**: 달력의 빈 날짜를 클릭하면 해당 날짜에 할 일을 바로 추가할 수 있습니다.
                        </p>
                    </div>
                </div>

                {/* Calendar Component */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[300px]">
                    <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
                        {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                            <div key={day} className={`py-1.5 text-center text-[9px] font-black uppercase tracking-widest ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-sky-500' : 'text-slate-400'}`}>
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="flex-1 grid grid-cols-7 overflow-y-auto min-h-0 divide-x divide-y divide-slate-100">
                        {calendarData.map((day, idx) => {
                            const dateEvents = getEventsForDate(day.date);
                            const isTodayCell = new Date().toDateString() === day.date.toDateString();
                            const mmdd = `${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
                            const holidayName = KOREAN_HOLIDAYS[mmdd];
                            const visibleEvents = dateEvents.slice(0, MAX_VISIBLE_EVENTS);
                            const hasMore = dateEvents.length > MAX_VISIBLE_EVENTS;

                            return (
                                <div key={idx} onClick={() => handleDateClick(day.date)} className={`min-h-[70px] flex flex-col p-0.5 transition-colors cursor-pointer ${day.currentMonth ? 'bg-white' : 'bg-slate-50/30'} hover:bg-slate-50/80 group`}>
                                    <div className="flex justify-between items-start mb-0.5">
                                        <div className="flex flex-col">
                                            <span className={`text-[9px] font-black w-4 h-4 flex items-center justify-center rounded transition-all ${isTodayCell ? 'bg-indigo-600 text-white shadow shadow-indigo-100' : day.currentMonth ? (day.date.getDay() === 0 || holidayName ? 'text-rose-500' : day.date.getDay() === 6 ? 'text-sky-500' : 'text-slate-600') : 'text-slate-300'}`}>
                                                {day.date.getDate()}
                                            </span>
                                            {holidayName && <span className="text-[7px] font-bold text-rose-400 truncate max-w-[50px] mt-0">{holidayName}</span>}
                                        </div>
                                        <Plus className="text-slate-200 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" size={10} />
                                    </div>
                                    <div className="flex-1 space-y-0.5 no-scrollbar overflow-hidden">
                                        {visibleEvents.map((ev, i) => {
                                            const isMultiDay = ev.type === 'project' || ev.type === 'attendance';
                                            if (isMultiDay) {
                                                const isProject = ev.type === 'project';
                                                const progressVal = isProject ? (ev.raw?.progress || 0) : 100;
                                                const baseBg = `bg-${ev.color || 'slate'}-100 text-${ev.color || 'slate'}-700`;
                                                const fillBg = `bg-${ev.color || 'slate'}-500`;
                                                const containerMargin = `${ev.isStart ? 'ml-0 rounded-l' : 'ml-[-4px]'} ${ev.isEnd ? 'mr-0 rounded-r' : 'mr-[-4px]'}`;
                                                let displayTitle = ev.title;
                                                if (isProject && ev.isStart) displayTitle = `${ev.title} (${progressVal}%)`;
                                                return (
                                                    <div key={i} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }} className={`relative w-[calc(100%+8px)] h-[15px] flex items-center select-none cursor-pointer overflow-hidden transition-all hover:brightness-95 ${baseBg} ${containerMargin}`}>
                                                        {isProject && <div className={`absolute left-0 top-0 bottom-0 ${fillBg} opacity-20 transition-all`} style={{ width: `${progressVal}%` }} />}
                                                        {ev.isStart && <div className="relative z-10 px-1 text-[8px] font-black leading-none truncate w-full">{displayTitle}</div>}
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div key={i} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }} className={`h-[15px] flex items-center px-1 rounded text-[8px] font-black leading-none truncate border-0 select-none cursor-pointer transition-all hover:brightness-95 ${ev.colorClass}`}>
                                                    <div className="truncate">{ev.title}</div>
                                                </div>
                                            );
                                        })}
                                        {hasMore && (
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedDayAgenda({ date: day.date, events: dateEvents }); }} className="w-full py-0 text-[7px] font-black text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all text-center">
                                                + {dateEvents.length - MAX_VISIBLE_EVENTS}개 더보기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Agenda Popup for "More..." */}
            {selectedDayAgenda && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1002] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">📅 {selectedDayAgenda.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 일정</h3>
                                <p className="text-[10px] text-slate-400 font-bold mt-0.5">총 {selectedDayAgenda.events.length}개의 일정이 있습니다.</p>
                            </div>
                            <button onClick={() => setSelectedDayAgenda(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"><X size={20}/></button>
                        </div>
                        <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
                            {selectedDayAgenda.events.map((ev, idx) => (
                                <div key={idx} onClick={() => { setSelectedEvent(ev); setSelectedDayAgenda(null); }} className={`p-3 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] flex items-center justify-between group ${ev.type === 'task_summary' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : ev.type === 'attendance' ? `bg-${ev.color}-50 text-${ev.color}-700 border border-${ev.color}-100` : ev.type === 'project' ? `bg-${ev.color}-50 text-${ev.color}-700 border border-${ev.color}-100` : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                    <span className="text-xs font-black truncate pr-4">{ev.title}</span>
                                    <ChevronRightIcon size={14} className="opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <WorkspaceEventDetailModal selectedEvent={selectedEvent} onClose={() => setSelectedEvent(null)} />
            <QuickTaskCreateModal isOpen={isQuickCreateOpen} onClose={() => setIsQuickCreateOpen(false)} selectedDate={selectedDateForNewTask} uid={currentUser?.uid} onSuccess={fetchCalendarData} />
        </div>
    );
}
