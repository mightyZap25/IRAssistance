import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getPersonalTasks } from '../services/taskService';
import EventDetailModal from '../components/EventDetailModal';
import { 
    ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
    Clock, AlertTriangle, CheckCircle2, Circle, 
    Briefcase, AlertCircle, Bookmark
} from 'lucide-react';

export default function TaskCalendarPage() {
    const { currentUser } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [issues, setIssues] = useState([]);
    const [attendanceRequests, setAttendanceRequests] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);

    useEffect(() => {
        if (currentUser) {
            fetchAllEvents();
        }
    }, [currentUser]);

    const fetchAllEvents = async () => {
        setLoading(true);
        try {
            const taskData = await getPersonalTasks(currentUser.uid);
            const projSnap = await getDocs(collection(db, 'projects'));
            const projData = projSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const issueSnap = await getDocs(query(collection(db, 'issues'), where('assignedTo', '==', currentUser.email)));
            const issueData = issueSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const attSnap = await getDocs(query(collection(db, 'attendance_requests'), where('Status', '==', 'Approved')));
            const attData = attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setTasks(taskData);
            setProjects(projData);
            setIssues(issueData);
            setAttendanceRequests(attData);
        } catch (error) {
            console.error("Failed to fetch calendar events:", error);
        } finally {
            setLoading(false);
        }
    };

    const getProjectColor = (projectId, stageId = '') => {
        const colors = ['amber', 'orange', 'fuchsia', 'pink', 'purple', 'violet', 'cyan', 'blue'];
        const combinedId = `${projectId}-${stageId}`;
        let hash = 0;
        for (let i = 0; i < combinedId.length; i++) {
            hash = combinedId.charCodeAt(i) + ((hash << 5) - hash);
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

    const firstVisibleEventDates = useMemo(() => {
        const firstDates = {}; // eventIdStr -> date string
        calendarData.forEach(day => {
            const dateStr = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
            
            // 1. Attendance
            attendanceRequests.forEach(req => {
                if (req.startDate && req.endDate && dateStr >= req.startDate && dateStr <= req.endDate) {
                    const eventId = `attendance-${req.id}`;
                    if (!firstDates[eventId]) {
                        firstDates[eventId] = dateStr;
                    }
                }
            });

            // 2. Projects (Milestones)
            projects.forEach(p => {
                if (p.schedules) {
                    Object.entries(p.schedules).forEach(([stageId, sched]) => {
                        const eventId = `milestone-${p.id}-${stageId}`;
                        if (sched.start && sched.end) {
                            if (dateStr >= sched.start && dateStr <= sched.end) {
                                if (!firstDates[eventId]) {
                                    firstDates[eventId] = dateStr;
                                }
                            }
                        } else if (sched.end && sched.end === dateStr) {
                            if (!firstDates[eventId]) {
                                    firstDates[eventId] = dateStr;
                            }
                        }
                    });
                }
            });

            // 3. Tasks
            tasks.forEach(t => {
                if (t.dueDate) {
                    const tDate = `${new Date(t.dueDate).getFullYear()}-${String(new Date(t.dueDate).getMonth() + 1).padStart(2, '0')}-${String(new Date(t.dueDate).getDate()).padStart(2, '0')}`;
                    if (tDate === dateStr) {
                        const eventId = `task_summary-tasks-summary-${tDate}`;
                        if (!firstDates[eventId]) {
                            firstDates[eventId] = tDate;
                        }
                    }
                }
            });

            // 4. Issues
            issues.forEach(i => {
                if (i.dueDate) {
                    const iDate = `${new Date(i.dueDate).getFullYear()}-${String(new Date(i.dueDate).getMonth() + 1).padStart(2, '0')}-${String(new Date(i.dueDate).getDate()).padStart(2, '0')}`;
                    if (iDate === dateStr) {
                        const eventId = `issue-${i.id}`;
                        if (!firstDates[eventId]) {
                            firstDates[eventId] = dateStr;
                        }
                    }
                }
            });
        });
        return firstDates;
    }, [calendarData, tasks, projects, issues, attendanceRequests]);

    const getEventsForDate = (date) => {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const dayEvents = [];

        // 1. Tasks (Grouped)
        const tasksOnDate = tasks.filter(t => {
            if (!t.dueDate) return false;
            const tDate = `${new Date(t.dueDate).getFullYear()}-${String(new Date(t.dueDate).getMonth() + 1).padStart(2, '0')}-${String(new Date(t.dueDate).getDate()).padStart(2, '0')}`;
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

        // 2. Projects (Milestones)
        projects.forEach(p => {
            if (p.schedules) {
                Object.entries(p.schedules).forEach(([stageId, sched]) => {
                    const pColor = getProjectColor(p.id, stageId);
                    if (sched.start && sched.end) {
                        if (dateStr >= sched.start && dateStr <= sched.end) {
                            const isStart = dateStr === sched.start;
                            const isEnd = dateStr === sched.end;
                            dayEvents.push({
                                id: `${p.id}-${stageId}`,
                                title: `[프로젝트] ${p.name.slice(0, 6)}...: ${stageId}`,
                                type: 'milestone',
                                isStart,
                                isEnd,
                                status: sched.status,
                                color: pColor,
                                colorClass: `bg-${pColor}-500 text-white border-0 font-bold hover:bg-${pColor}-600 shadow-sm`,
                                description: `프로젝트 단계 마감일: ${stageId}`,
                                raw: { ...sched, projectName: p.name, stageId, progress: p.progress }
                            });
                        }
                    } else if (sched.end && sched.end === dateStr) {
                        dayEvents.push({
                            id: `${p.id}-${stageId}`,
                            title: `[프로젝트] ${p.name.slice(0, 6)}...: ${stageId} 마감`,
                            type: 'milestone',
                            isStart: true,
                            isEnd: true,
                            status: sched.status,
                            color: pColor,
                            colorClass: `bg-${pColor}-500 text-white border-0 font-bold hover:bg-${pColor}-600 shadow-sm`,
                            description: `프로젝트 단계 마감일: ${stageId}`,
                            raw: { ...sched, projectName: p.name, stageId, progress: p.progress }
                        });
                    }
                });
            }
        });

        // 3. Issues
        issues.forEach(i => {
            if (i.dueDate) {
                const iDate = `${new Date(i.dueDate).getFullYear()}-${String(new Date(i.dueDate).getMonth() + 1).padStart(2, '0')}-${String(new Date(i.dueDate).getDate()).padStart(2, '0')}`;
                if (iDate === dateStr) {
                    dayEvents.push({
                        id: i.id,
                        title: `[이슈] ${i.title}`,
                        type: 'issue',
                        colorClass: 'bg-rose-500 text-white border-0 hover:bg-rose-600 font-semibold shadow-sm',
                        raw: i
                    });
                }
            }
        });

        // 4. Attendance
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

        return dayEvents;
    };

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    return (
        <div className="h-full flex flex-col space-y-6">
            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>

            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">통합 업무 캘린더</h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">개인 Task, 프로젝트 마일스톤, 할당된 이슈, 전사 근태/휴가를 통합 관리합니다.</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"/> <span className="text-[10px] font-black text-slate-500">TASK</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"/> <span className="text-[10px] font-black text-slate-500">PROJECT</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"/> <span className="text-[10px] font-black text-slate-500">ISSUE</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"/> <span className="text-[10px] font-black text-slate-500">ATTENDANCE</span></div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={goToToday} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all">오늘</button>
                        <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                            <button onClick={prevMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-600"><ChevronLeft size={18} /></button>
                            <span className="px-4 text-sm font-black text-slate-800 min-w-[120px] text-center">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
                            <button onClick={nextMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-600"><ChevronRight size={18} /></button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden min-h-[400px]">
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
                    {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                        <div key={day} className={`py-2 text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-sky-500' : 'text-slate-400'}`}>{day}</div>
                    ))}
                </div>
                <div className="flex-1 grid grid-cols-7 overflow-y-auto min-h-0 divide-x divide-y divide-slate-100">
                    {calendarData.map((day, idx) => {
                        const dateEvents = getEventsForDate(day.date);
                        const isTodayCell = new Date().toDateString() === day.date.toDateString();

                        // Lane/Slot-based layout distribution
                        const attendances = dateEvents.filter(e => e.type === 'attendance').sort((a, b) => {
                            const startA = a.raw?.startDate || '';
                            const startB = b.raw?.startDate || '';
                            return startA.localeCompare(startB);
                        });

                        const tasksList = dateEvents.filter(e => e.type === 'task_summary');

                        // Sort projects chronologically (earlier projects go to the top slot)
                        const projectsList = dateEvents.filter(e => e.type === 'milestone').sort((a, b) => {
                            const startA = a.raw?.start || '';
                            const startB = b.raw?.start || '';
                            return startA.localeCompare(startB);
                        });

                        const issuesList = dateEvents.filter(e => e.type === 'issue');

                        // Distribute to fixed rows/slots (All slots now have uniform h-[16px] height)
                        const slots = [
                            { event: attendances[0], heightClass: 'h-[16px]', type: 'attendance' },
                            { event: attendances[1], heightClass: 'h-[16px]', type: 'attendance' },
                            { event: tasksList[0], heightClass: 'h-[16px]', type: 'task_summary' },
                            { event: projectsList[0], heightClass: 'h-[16px]', type: 'project' },
                            { event: projectsList[1], heightClass: 'h-[16px]', type: 'project' },
                            { event: issuesList[0], heightClass: 'h-[16px]', type: 'issue' }
                        ];

                        return (
                            <div key={idx} className={`min-h-[80px] flex flex-col p-1 transition-colors ${day.currentMonth ? 'bg-white' : 'bg-slate-50/30'} hover:bg-indigo-50/20`}>
                                <div className="flex justify-between items-start mb-0.5"><span className={`text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-lg ${isTodayCell ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : day.currentMonth ? (day.date.getDay() === 0 ? 'text-rose-500' : day.date.getDay() === 6 ? 'text-sky-500' : 'text-slate-600') : 'text-slate-300'}`}>{day.date.getDate()}</span></div>
                                <div className="flex-1 overflow-y-auto space-y-0.5 no-scrollbar">
                                    {slots.map((slot, i) => {
                                        const ev = slot.event;
                                        if (!ev) {
                                            // Empty Lane Placeholder (No content, strict height matching)
                                            return <div key={i} className={`${slot.heightClass} select-none pointer-events-none`}></div>;
                                        }

                                        const eventKey = `${ev.type}-${ev.id}`;
                                        const dateStr = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
                                        const isFirstVisible = firstVisibleEventDates[eventKey] === dateStr;
                                        
                                        const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                                        const isToday = dateStr === todayStr;
                                        const showTitle = isFirstVisible || isToday;

                                        const isMultiDay = ev.type === 'milestone' || ev.type === 'attendance';
                                        
                                        if (isMultiDay) {
                                            const isProject = ev.type === 'milestone';
                                            const progressVal = isProject ? (ev.raw?.progress || 0) : 100;
                                            const baseBg = `bg-${ev.color || 'slate'}-100 text-${ev.color || 'slate'}-700`;
                                            const fillBg = `bg-${ev.color || 'slate'}-500`;
                                            const containerMargin = `${ev.isStart ? 'ml-0 rounded-l-md' : 'ml-[-8px]'} ${ev.isEnd ? 'mr-0 rounded-r-md' : 'mr-[-8px]'}`;
                                            
                                            // Title composition
                                            let displayTitle = ev.title;
                                            const showTitle = ev.isStart;
                                            if (isProject && ev.isStart) {
                                                displayTitle = `${ev.title} (${progressVal}%)`;
                                            }

                                            return (
                                                <div 
                                                    key={i} 
                                                    onClick={() => setSelectedEvent(ev)} 
                                                    className={`relative w-[calc(100%+16px)] h-[16px] flex items-center select-none cursor-pointer overflow-hidden transition-all hover:scale-[1.01] ${baseBg} ${containerMargin}`}
                                                >
                                                    {/* MS Project Gantt Progress Fill */}
                                                    {isProject && (
                                                        <div 
                                                            className={`absolute left-0 top-0 bottom-0 ${fillBg} opacity-25 transition-all`} 
                                                            style={{ width: `${progressVal}%` }}
                                                        />
                                                    )}
                                                    
                                                    {/* Label (Larger font size [10px]) */}
                                                    {showTitle && (
                                                        <div className="relative z-10 px-2 text-[10px] font-black leading-none truncate max-w-[90%]">
                                                            {displayTitle}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        // Single day events (Larger font size [10px])
                                        const itemClass = `h-[14px] flex items-center px-1.5 rounded text-[10px] font-bold leading-none truncate border-0 select-none cursor-pointer transition-all hover:scale-[1.01] ${ev.colorClass}`;
                                        return (
                                            <div 
                                                key={i} 
                                                onClick={() => setSelectedEvent(ev)} 
                                                className={itemClass}
                                            >
                                                <div className="truncate">{ev.title}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedEvent && (selectedEvent.type === 'task_summary' || selectedEvent.type === 'attendance') ? (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                                📅 일정 상세 정보
                            </h3>
                            <button 
                                onClick={() => setSelectedEvent(null)}
                                className="px-3 py-1.5 text-[10px] font-black text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">일정 제목</label>
                                <div className="text-sm font-bold text-slate-800 mt-0.5">{selectedEvent.title}</div>
                            </div>

                            {selectedEvent.type === 'attendance' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400">신청 카테고리</label>
                                            <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.category === 'Leave' ? '휴가' : '유연근로/근태'}</div>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400">부서 / 성명</label>
                                            <div className="text-xs font-bold text-slate-700 mt-0.5">[{selectedEvent.raw.department}] {selectedEvent.raw.userName}</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400">시작일</label>
                                            <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.startDate}</div>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400">종료일</label>
                                            <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedEvent.raw.endDate}</div>
                                        </div>
                                    </div>
                                    {selectedEvent.raw.reason && (
                                        <div>
                                            <label className="text-[9px] font-black text-slate-400">신청 사유</label>
                                            <div className="text-xs font-medium text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-0.5 whitespace-pre-wrap">{selectedEvent.raw.reason}</div>
                                        </div>
                                    )}
                                </>
                            )}

                            {selectedEvent.type === 'task_summary' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
                                        <span className="text-xs font-bold text-slate-600">진행도 요약</span>
                                        <span className="text-xs font-black text-indigo-600">{selectedEvent.raw.completed} / {selectedEvent.raw.total} 완료</span>
                                    </div>
                                    <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                                        {selectedEvent.raw.tasks.map((task, tIdx) => (
                                            <div key={tIdx} className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm space-y-1 hover:border-indigo-100 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs font-bold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                                        {task.title}
                                                    </span>
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
                                                        {task.status === 'completed' ? '완료' : '진행중'}
                                                    </span>
                                                </div>
                                                {task.description && (
                                                    <p className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg mt-1 border border-slate-100/50">{task.description}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <EventDetailModal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} event={selectedEvent} />
            )}
        </div>
    );
}
