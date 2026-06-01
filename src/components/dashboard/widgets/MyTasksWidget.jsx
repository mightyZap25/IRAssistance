import React, { useState, useEffect } from 'react';
import { getPersonalTasks } from '../../../services/taskService';
import { CheckCircle2, Circle, Clock, AlertCircle, ListTodo } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function MyTasksWidget({ user, viewType = 'list' }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.uid) {
            fetchTasks();
        }
    }, [user]);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const data = await getPersonalTasks(user.uid);
            setTasks(data);
        } catch (error) {
            console.error("Task widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-200"><ListTodo size={24} /></div>;

    const incomplete = tasks.filter(t => t.status !== 'completed');
    const urgent = incomplete.filter(t => t.priority === 'urgent').length;

    // --- 1. Stat View ---
    if (viewType === 'stat') {
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">남은 할 일</div>
                    <div className="text-4xl font-black text-indigo-600 tracking-tighter">{incomplete.length}</div>
                </div>
                {urgent > 0 && (
                    <div className="flex items-center justify-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 py-1.5 rounded-xl">
                        <AlertCircle size={10} className="text-rose-500" />
                        <span className="text-[10px] font-black text-rose-600 uppercase">긴급 {urgent}건</span>
                    </div>
                )}
            </div>
        );
    }

    // --- 2. Chart View ---
    if (viewType === 'chart') {
        const completed = tasks.length - incomplete.length;
        const chartData = [
            { name: '진행중', value: incomplete.length, color: '#4f46e5' },
            { name: '완료', value: completed, color: '#10b981' }
        ];
        return (
            <div className="h-full min-h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={chartData} innerRadius={35} outerRadius={50} paddingAngle={5} dataKey="value">
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 -mt-2">
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"/><span className="text-[8px] font-black text-slate-400">진행중</span></div>
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/><span className="text-[8px] font-black text-slate-400">완료</span></div>
                </div>
            </div>
        );
    }

    // --- 3. Default List View ---
    if (tasks.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 opacity-40">
            <CheckCircle2 size={24} className="mb-1" />
            <p className="text-[9px] font-bold">No Tasks</p>
        </div>
    );

    return (
        <div className="space-y-2">
            {incomplete.slice(0, 6).map(task => (
                <div key={task.id} className="flex items-start gap-2.5 p-2 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className={`mt-0.5 shrink-0 ${task.priority === 'urgent' ? 'text-rose-500' : 'text-slate-300'}`}>
                        <Circle size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate leading-tight">{task.title}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[8px] font-black uppercase px-1 rounded ${
                                task.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-500'
                            }`}>
                                {task.priority}
                            </span>
                            {task.dueDate && <span className="text-[8px] text-slate-400 font-bold">{new Date(task.dueDate).toLocaleDateString()}</span>}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
