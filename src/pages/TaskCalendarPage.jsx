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

            setTasks(taskData);
            setProjects(projData);
            setIssues(issueData);
        } catch (error) {
            console.error("Failed to fetch calendar events:", error);
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

    const getEventsForDate = (date) => {
        const dateStr = date.toDateString();
        const dayTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === dateStr)
            .map(t => ({ ...t, type: 'task' }));
        const dayMilestones = [];
        projects.forEach(p => {
            if (p.schedules) {
                Object.entries(p.schedules).forEach(([stageId, sched]) => {
                    if (sched.end && new Date(sched.end).toDateString() === dateStr) {
                        dayMilestones.push({
                            id: `${p.id}-${stageId}`,
                            title: `[${p.name}] ${stageId} 마감`,
                            type: 'milestone',
                            status: sched.status,
                            description: `프로젝트 단계 마감일: ${stageId}`
                        });
                    }
                });
            }
        });
        const dayIssues = issues.filter(i => i.dueDate && new Date(i.dueDate).toDateString() === dateStr)
            .map(i => ({ ...i, type: 'issue' }));
        return [...dayTasks, ...dayMilestones, ...dayIssues];
    };

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">통합 업무 캘린더</h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">개인 Task, 프로젝트 마일스톤, 할당된 이슈를 통합 관리합니다.</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"/> <span className="text-[10px] font-black text-slate-500">TASK</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"/> <span className="text-[10px] font-black text-slate-500">PROJECT</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"/> <span className="text-[10px] font-black text-slate-500">ISSUE</span></div>
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

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
                    {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                        <div key={day} className={`py-3 text-center text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-sky-500' : 'text-slate-400'}`}>{day}</div>
                    ))}
                </div>
                <div className="flex-1 grid grid-cols-7 overflow-hidden">
                    {calendarData.map((day, idx) => {
                        const dateEvents = getEventsForDate(day.date);
                        const isToday = new Date().toDateString() === day.date.toDateString();
                        return (
                            <div key={idx} className={`min-h-0 flex flex-col border-r border-b border-slate-100 p-2 transition-colors ${day.currentMonth ? 'bg-white' : 'bg-slate-50/30'} hover:bg-indigo-50/20`}>
                                <div className="flex justify-between items-start mb-1"><span className={`text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-md' : day.currentMonth ? (day.date.getDay() === 0 ? 'text-rose-500' : day.date.getDay() === 6 ? 'text-sky-500' : 'text-slate-600') : 'text-slate-300'}`}>{day.date.getDate()}</span></div>
                                <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                                    {dateEvents.map((ev, i) => (
                                        <div key={i} onClick={() => setSelectedEvent(ev)} className={`p-1.5 rounded-lg text-[10px] leading-tight border transition-all cursor-pointer hover:shadow-md hover:scale-[1.02] ${ev.type === 'task' ? (ev.status === 'completed' ? 'bg-slate-50 opacity-40 grayscale' : 'bg-indigo-50 border-indigo-100 text-indigo-700') : ev.type === 'milestone' ? 'bg-amber-50 border-amber-100 text-amber-700 font-black' : 'bg-rose-50 border-rose-100 text-rose-700 font-bold'}`}><div className="flex items-center gap-1">{ev.type === 'task' ? (ev.status === 'completed' ? <CheckCircle2 size={10} /> : <Circle size={10} />) : ev.type === 'milestone' ? <Briefcase size={10} /> : <AlertCircle size={10} />}<span className="truncate flex-1">{ev.title}</span></div></div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <EventDetailModal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} event={selectedEvent} />
        </div>
    );
}
