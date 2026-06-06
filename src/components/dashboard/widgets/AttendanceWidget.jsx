import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs, query, where } from '../../../firebase';
import { UserX, Plane, Briefcase, Home, Coffee, Users } from 'lucide-react';

export default function AttendanceWidget({ viewType = 'list' }) {
    const [absentToday, setAbsentToday] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAttendance();
    }, []);

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const q = query(
                collection(db, 'attendance_requests'),
                where('Status', '==', 'Approved')
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const today = data.filter(req => {
                return req.startDate <= todayStr && req.endDate >= todayStr;
            });
            setAbsentToday(today);
        } catch (error) {
            console.error("Attendance widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    const getTypeIcon = (type) => {
        switch(type) {
            case 'Trip': return <Plane size={14} className="text-sky-500" />;
            case 'Outside': return <Briefcase size={14} className="text-teal-500" />;
            case 'WFH': return <Home size={14} className="text-indigo-500" />;
            case 'Leave': return <Coffee size={14} className="text-emerald-500" />;
            default: return <UserX size={14} className="text-slate-400" />;
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-200"><Users size={24} /></div>;

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">금일 부재자</div>
                    <div className="text-4xl font-black text-indigo-600 tracking-tighter">{absentToday.length} <span className="text-sm">명</span></div>
                </div>
                <div className="text-center text-[10px] font-bold text-slate-400">
                    휴가/출장/외근 포함
                </div>
            </div>
        );
    }

    // --- 2. Default List View ---
    if (absentToday.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40">
            <UserX size={24} className="mb-1" />
            <p className="text-[9px] font-bold uppercase tracking-tighter">All Present</p>
        </div>
    );

    return (
        <div className="grid grid-cols-1 gap-1.5">
            {absentToday.slice(0, 5).map(req => (
                <div key={req.id} className="flex items-center gap-2.5 p-2 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 flex items-center justify-center shadow-sm shrink-0">
                        {getTypeIcon(req.type || req.category)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-700 dark:text-slate-100">{req.userName}</span>
                            <span className="text-[8px] font-bold text-slate-400">{req.department}</span>
                        </div>
                        <div className="text-[8px] font-bold text-indigo-600 truncate">
                            {req.type === 'Leave' ? '휴가' : req.type === 'Trip' ? '출장' : req.type === 'Outside' ? '외근' : req.type === 'WFH' ? '재택' : '근태'}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
