import React, { useState, useMemo } from 'react';
import { Circle, CheckCircle2, Clock, AlertTriangle, Flag, Package, Truck, Factory, ShieldCheck, Box, ChevronRight } from 'lucide-react';

const STEPS = [
    { key: 'CREATED', label: '의뢰 등록', icon: Flag },
    { key: 'PROD_PLANNING', label: '생산 계획', icon: Clock },
    { key: 'WORK_ORDER', label: '작업 지시', icon: Package },
    { key: 'IN_PRODUCTION', label: '생산 중', icon: Factory },
    { key: 'PROD_COMPLETE', label: '생산 완료', icon: CheckCircle2 },
    { key: 'QA_COMPLETE', label: '검사 완료', icon: ShieldCheck },
    { key: 'SHIPPED', label: '출하 완료', icon: Truck },
];

const STATUS_ORDER = [
    'DRAFT', 'REVIEW', 'CONFIRMED', 'PROD_WAITING', 'PROD_PLANNING', 
    'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 
    'QA_COMPLETE', 'SHIP_READY', 'SHIPPED'
];

export default function PRTimelineGraph({ pr }) {
    const [selectedScheduleIdx, setSelectedScheduleIdx] = useState(0);

    if (!pr) return null;

    // 분할 납품 데이터 준비 (없으면 단일 건으로 처리)
    const schedules = useMemo(() => {
        if (pr.Schedules && pr.Schedules.length > 0) {
            return pr.Schedules.map((s, idx) => ({
                id: idx,
                label: `${idx + 1}회차`,
                qty: s.qty,
                date: s.date,
                status: s.status || (pr.Status === 'SHIPPED' ? 'SHIPPED' : 'PENDING'),
                shippedQty: s.shippedQty || 0
            }));
        }
        return [{ id: 0, label: '단일 납품', qty: pr.TargetQty, date: pr.DueDate, status: pr.Status }];
    }, [pr]);

    const currentStatusIdx = STATUS_ORDER.indexOf(pr.Status);

    const getStatusInfo = (stepKey) => {
        if (stepKey === 'CREATED') {
            return { 
                done: true, 
                date: pr.CreatedAt?.toDate ? pr.CreatedAt.toDate() : new Date(pr.CreatedAt)
            };
        }

        const log = pr.Logs?.find(l => l.to === stepKey);
        if (log) {
            return { done: true, date: new Date(log.timestamp) };
        }

        const stepStatusIdx = STATUS_ORDER.indexOf(stepKey);
        const isDone = currentStatusIdx >= stepStatusIdx && stepStatusIdx !== -1;
        
        if (stepKey === 'PROD_PLANNING' && pr.ProdStartDate) {
            return { done: isDone, date: new Date(pr.ProdStartDate), isPlan: true };
        }
        if (stepKey === 'PROD_COMPLETE' && pr.ProdEndDate) {
            return { done: isDone, date: new Date(pr.ProdEndDate), isPlan: true };
        }

        return { done: isDone, date: null };
    };

    return (
        <div className="w-full flex flex-col gap-8">
            {/* 1. Top Horizontal Product/Split List */}
            <div className="relative pb-4">
                <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 px-1">
                    {schedules.map((s, idx) => (
                        <button
                            key={idx}
                            onClick={() => setSelectedScheduleIdx(idx)}
                            className={`relative min-w-[120px] p-3 rounded-2xl border-2 transition-all flex flex-col gap-1 text-left ${
                                selectedScheduleIdx === idx 
                                    ? 'border-indigo-500 bg-indigo-50 shadow-md scale-105 z-10' 
                                    : 'border-slate-100 bg-white hover:border-slate-200'
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className={`text-[9px] font-black uppercase tracking-tighter ${selectedScheduleIdx === idx ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    {s.label}
                                </span>
                                {s.status === 'SHIPPED' && <CheckCircle2 size={12} className="text-emerald-500" />}
                            </div>
                            <p className="text-xs font-black text-slate-800">{(Number(s.qty) || 0).toLocaleString()} EA</p>
                            <p className="text-[10px] font-bold text-slate-500">{s.date || '-'}</p>

                            {/* Connection line between cards (visual effect from image) */}
                            {idx < schedules.length - 1 && (
                                <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-4 h-[2px] bg-slate-100 -z-10" />
                            )}
                        </button>
                    ))}
                </div>
                {/* Visual Connector to the timeline below */}
                <div className="absolute bottom-[-16px] left-[60px] w-[2px] h-4 bg-indigo-200" />
            </div>

            {/* 2. Vertical Timeline for Selected Item */}
            <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/10" />
                
                <div className="flex flex-col gap-0">
                    {STEPS.map((step, idx) => {
                        const info = getStatusInfo(step.key);
                        const isLast = idx === STEPS.length - 1;
                        const Icon = step.icon;
                        const active = pr.Status === step.key || (step.key === 'CREATED' && currentStatusIdx < STATUS_ORDER.indexOf('PROD_PLANNING'));

                        return (
                            <div key={step.key} className="relative flex items-stretch gap-6 group min-h-[90px]">
                                {/* Vertical Connecting Line */}
                                {!isLast && (
                                    <div className={`absolute left-[19px] top-10 bottom-0 w-1 -z-10 transition-colors duration-500 ${info.done ? 'bg-indigo-500' : 'bg-slate-100'}`} />
                                )}

                                {/* Node */}
                                <div className="flex flex-col items-center shrink-0">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ring-4 ${
                                        active ? 'bg-indigo-600 ring-indigo-100 scale-110' : 
                                        info.done ? 'bg-emerald-500 ring-emerald-50' : 
                                        'bg-white border-2 border-slate-200 ring-transparent group-hover:border-slate-300'
                                    }`}>
                                        <Icon size={18} className={info.done || active ? 'text-white' : 'text-slate-400'} />
                                    </div>
                                    {active && (
                                        <div className="absolute w-10 h-10 bg-indigo-400 rounded-full opacity-20 animate-ping -z-20" />
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 pb-10 pt-1">
                                    <div className="flex justify-between items-start">
                                        <div className="text-left">
                                            <h4 className={`text-sm font-black tracking-tight ${active ? 'text-indigo-600' : info.done ? 'text-slate-800' : 'text-slate-400'}`}>
                                                {step.label}
                                            </h4>
                                            <p className={`text-[10px] font-bold mt-0.5 ${info.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {info.done ? (info.isPlan ? '일정 계획됨' : '처리 완료') : '진행 대기'}
                                            </p>
                                        </div>
                                        {info.date && !isNaN(info.date.getTime()) && (
                                            <div className="text-right animate-fade-in bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                                                <p className="text-[11px] font-black text-slate-700">{info.date.toLocaleDateString()}</p>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                    {info.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {active && (
                                        <div className="mt-3 flex items-center gap-2 text-indigo-600 animate-fade-in">
                                            <div className="flex gap-1">
                                                <div className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-1 h-1 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest">처리 중</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Status Alert */}
            {new Date(pr.DueDate) < new Date() && pr.Status !== 'SHIPPED' && (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-4 animate-pulse">
                    <div className="p-2 bg-rose-500 rounded-xl text-white">
                        <AlertTriangle size={20} />
                    </div>
                    <div className="text-left">
                        <p className="text-xs font-black text-rose-700">납기 일정 지연 경고</p>
                        <p className="text-[10px] font-bold text-rose-500">지정된 납기 희망일({pr.DueDate})이 경과되었습니다. 빠른 처리가 필요합니다.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
