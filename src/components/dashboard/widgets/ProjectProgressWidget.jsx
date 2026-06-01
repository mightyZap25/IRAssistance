import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Layers, ChevronRight, Activity, TrendingUp, CheckCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function ProjectProgressWidget({ viewType = 'list' }) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'projects'), limit(10));
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProjects(data);
        } catch (error) {
            console.error("Project widget error:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="h-full flex items-center justify-center animate-pulse text-slate-300"><Layers size={24} /></div>;

    if (projects.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 italic">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">No Projects Found</p>
        </div>
    );

    // --- 1. Infographic (Stat) View ---
    if (viewType === 'stat') {
        const avgProgress = Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / projects.length);
        const completed = projects.filter(p => p.progress === 100).length;
        return (
            <div className="h-full flex flex-col justify-around py-2">
                <div className="text-center">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">전체 진척도</div>
                    <div className="text-4xl font-black text-indigo-600 tracking-tighter">{avgProgress}<span className="text-lg opacity-50">%</span></div>
                </div>
                <div className="flex border-t border-slate-50 dark:border-slate-800 pt-4 mt-2">
                    <div className="flex-1 text-center border-r border-slate-50 dark:border-slate-800">
                        <div className="text-[8px] font-black text-slate-400 uppercase">진행 중</div>
                        <div className="text-sm font-black text-slate-700 dark:text-slate-200">{projects.length - completed}</div>
                    </div>
                    <div className="flex-1 text-center">
                        <div className="text-[8px] font-black text-slate-400 uppercase">완료</div>
                        <div className="text-sm font-black text-emerald-600">{completed}</div>
                    </div>
                </div>
            </div>
        );
    }

    // --- 2. Chart View ---
    if (viewType === 'chart') {
        const chartData = projects.map(p => ({ name: p.name.slice(0, 10), progress: p.progress || 0 }));
        return (
            <div className="h-full min-h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <XAxis type="number" hide domain={[0, 100]} />
                        <YAxis type="category" dataKey="name" width={60} style={{ fontSize: '8px', fontWeight: 'bold' }} tickLine={false} axisLine={false} />
                        <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px' }}
                            cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }}
                        />
                        <Bar dataKey="progress" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    }

    // --- 3. Table View ---
    if (viewType === 'table') {
        return (
            <div className="h-full overflow-hidden flex flex-col">
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                            <th className="pb-2">프로젝트명</th>
                            <th className="pb-2 text-right">진행률</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {projects.slice(0, 8).map(p => (
                            <tr key={p.id} className="group hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors">
                                <td className="py-2.5 text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{p.name}</td>
                                <td className="py-2.5 text-right text-[10px] font-black text-indigo-600">{p.progress || 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // --- 4. List View (Default) ---
    return (
        <div className="space-y-4">
            {projects.slice(0, 5).map(p => (
                <div key={p.id} className="group cursor-pointer">
                    <div className="flex justify-between items-center mb-1.5">
                        <h4 className="text-[10px] font-black text-slate-800 dark:text-slate-100 truncate flex-1 pr-2 uppercase">{p.name}</h4>
                        <span className="text-[10px] font-black text-indigo-600 tracking-tighter">{p.progress || 0}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-500 transition-all duration-1000" 
                            style={{ width: `${p.progress || 0}%` }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
