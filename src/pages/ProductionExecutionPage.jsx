import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Factory, AlertTriangle, CheckCircle2, Clock, X, ChevronRight, Zap, List, LayoutGrid, Package, AlertCircle, ShieldAlert, TrendingUp, RotateCcw, History, Calendar, BarChart2 } from 'lucide-react';
import ProjectGanttChart from '../components/ProjectGanttChart';

// ─────────────────────────────────────────────────────────────
// 상태 정의
// ─────────────────────────────────────────────────────────────
const PR_STATUS = {
    DRAFT:           { label: '임시저장',     color: 'bg-slate-100 text-slate-500 border-slate-200',    step: 0 },
    REVIEW:          { label: '생산검토',     color: 'bg-yellow-50 text-yellow-600 border-yellow-200',  step: 1 },
    CONFIRMED:       { label: '의뢰확정',     color: 'bg-blue-50 text-blue-600 border-blue-200',        step: 2 },
    PROD_WAITING:    { label: '생산대기',     color: 'bg-indigo-50 text-indigo-600 border-indigo-200',  step: 3 },
    PROD_PLANNING:   { label: '생산계획',     color: 'bg-violet-50 text-violet-600 border-violet-200',  step: 4 },
    WORK_ORDER:      { label: '작업지시',     color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200', step: 5 },
    IN_PRODUCTION:   { label: '생산중',       color: 'bg-orange-50 text-orange-600 border-orange-200',  step: 6 },
    PROD_COMPLETE:   { label: '생산완료',     color: 'bg-teal-50 text-teal-600 border-teal-200',        step: 7 },
    QA_WAITING:      { label: 'QA검사대기',   color: 'bg-purple-50 text-purple-600 border-purple-200',  step: 8 },
    QA_COMPLETE:     { label: 'QA검사완료',   color: 'bg-emerald-50 text-emerald-600 border-emerald-200', step: 9 },
    SHIP_READY:      { label: '출하준비',     color: 'bg-cyan-50 text-cyan-600 border-cyan-200',        step: 10 },
    SHIPPED:         { label: '출하완료',     color: 'bg-green-50 text-green-600 border-green-200',     step: 11 },
    ARCHIVED:        { label: '아카이브',     color: 'bg-slate-50 text-slate-400 border-slate-100',     step: 12 },
};

const EXECUTION_STATUSES = ['PROD_WAITING', 'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'];

const KANBAN_COLUMNS = [
    { key: 'PROD_WAITING',  label: '생산 대기',  color: 'border-indigo-100 bg-indigo-50/30', headColor: 'bg-indigo-100 text-indigo-700' },
    { key: 'WORK_ORDER',    label: '작업 지시',  color: 'border-pink-100 bg-pink-50/30', headColor: 'bg-pink-100 text-pink-700' },
    { key: 'IN_PRODUCTION', label: '생산 중',    color: 'border-orange-100 bg-orange-50/30', headColor: 'bg-orange-100 text-orange-700' },
    { key: 'QA_WAITING',    label: 'QA 검사',    color: 'border-purple-100 bg-purple-50/30', headColor: 'bg-purple-100 text-purple-700' },
    { key: 'SHIP_READY',    label: '출하 준비',  color: 'border-emerald-100 bg-emerald-50/30', headColor: 'bg-emerald-100 text-emerald-700' },
];

const GANTT_STAGES = [
    { id: 'planning', label: '계획' },
    { id: 'production', label: '생산' },
    { id: 'qa', label: '검사' },
    { id: 'shipping', label: '출하' }
];

const NEXT_STATUS_MAP = {
    PROD_WAITING:  { next: 'PROD_PLANNING', label: '계획 수립 시작' },
    PROD_PLANNING: { next: 'WORK_ORDER',    label: '작업 지시 발행' },
    WORK_ORDER:    { next: 'IN_PRODUCTION', label: '생산 시작' },
    IN_PRODUCTION: { next: 'PROD_COMPLETE', label: '생산 완료 처리' },
    QA_COMPLETE:   { next: 'SHIP_READY',    label: '출하 준비 완료' },
    SHIP_READY:    { next: 'SHIPPED',       label: '출하 완료' },
};

function isDelayed(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
}

function ProductionCalendar({ prs, onCardClick }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    
    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();

        for (let i = firstDay - 1; i >= 0; i--) {
            days.push({ date: new Date(year, month - 1, prevMonthLastDay - i), currentMonth: false });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ date: new Date(year, month, i), currentMonth: true });
        }
        while (days.length < 42) {
            days.push({ date: new Date(year, month + 1, days.length - firstDay - daysInMonth + 1), currentMonth: false });
        }
        return days;
    }, [currentDate]);

    const getPrsForDate = (date) => {
        const dStr = date.toISOString().split('T')[0];
        return prs.flatMap(p => {
            const events = [];
            if (p.ProdEndDate === dStr) events.push({ ...p, evType: 'PROD_END', evLabel: '생산마감' });
            if (p.DueDate === dStr) events.push({ ...p, evType: 'DUE', evLabel: '납기일' });
            return events;
        });
    };

    return (
        <div className="flex-1 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col min-h-0">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-sm font-black text-slate-700 flex items-center gap-2"><Calendar size={16} className="text-indigo-600"/> 생산 일정 캘린더</h3>
                <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} className="p-1.5 hover:bg-white rounded-lg shadow-sm border border-slate-200 text-slate-500"><ChevronRight className="rotate-180" size={16}/></button>
                    <span className="text-sm font-black text-slate-800">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} className="p-1.5 hover:bg-white rounded-lg shadow-sm border border-slate-200 text-slate-500"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="flex-1 grid grid-cols-7 overflow-y-auto divide-x divide-y divide-slate-100 custom-scrollbar">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="py-2 text-center text-[10px] font-black text-slate-400 bg-slate-50/30 uppercase tracking-widest">{d}</div>)}
                {calendarDays.map((day, idx) => {
                    const dayPrs = getPrsForDate(day.date);
                    const isToday = new Date().toDateString() === day.date.toDateString();
                    return (
                        <div key={idx} className={`min-h-[120px] p-1.5 ${day.currentMonth ? 'bg-white' : 'bg-slate-50/30'} flex flex-col gap-1.5 transition-colors hover:bg-slate-50/50`}>
                            <span className={`text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500'}`}>{day.date.getDate()}</span>
                            <div className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar">
                                {dayPrs.map((p, pIdx) => (
                                    <div 
                                        key={`${p.id}-${pIdx}`} 
                                        onClick={() => onCardClick(p)} 
                                        className={`p-1.5 rounded-xl border text-left cursor-pointer transition-all hover:scale-[1.02] shadow-sm ${p.evType === 'DUE' ? 'bg-rose-50 border-rose-100' : 'bg-indigo-50 border-indigo-100'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase ${p.evType === 'DUE' ? 'bg-rose-500 text-white' : 'bg-indigo-500 text-white'}`}>
                                                {p.evLabel}
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-black text-slate-800 leading-tight truncate">{p.PartName}</p>
                                        <p className="text-[9px] font-bold text-slate-500 truncate mt-0.5">{p.CustomerName}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function WODetailModal({ pr, onClose, onRefresh }) {
    const { userProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [actualQty, setActualQty] = useState(pr?.TargetQty || 0);
    const [defectQty, setDefectQty] = useState(0);
    const [defectReason, setDefectReason] = useState('');
    const [shortageCheck, setShortageCheck] = useState(null);
    const [bomItems, setBomItems] = useState([]);
    const [inventory, setInventory] = useState({});

    useEffect(() => {
        if (!pr) return;
        (async () => {
            const [bomSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'bom'), where('ParentID', '==', pr.PartID))),
                getDocs(collection(db, 'inventory')),
            ]);
            const boms = bomSnap.docs.map(d => d.data());
            const inv = {};
            invSnap.docs.forEach(d => { inv[d.data().PartID] = { onHand: d.data().OnHand || 0, ref: d.ref }; });
            setBomItems(boms);
            setInventory(inv);

            const shortages = boms.map(b => {
                const req = (b.Quantity || 1) * pr.TargetQty;
                const onHand = inv[b.ChildID]?.onHand || 0;
                return { partID: b.ChildID, req, onHand, shortage: Math.max(0, req - onHand), ok: onHand >= req };
            });
            setShortageCheck(shortages);
        })();
    }, [pr]);

    const handleComplete = async () => {
        const badShortages = shortageCheck?.filter(s => !s.ok) || [];
        if (badShortages.length > 0) {
            const msg = badShortages.map(s => `- ${s.partID}: 부족 ${s.shortage}개`).join('\n');
            if (!window.confirm(`⚠ 자재 부족 경고!\n\n${msg}\n\n재고 부족 상태로 진행하면 마이너스 재고가 발생합니다.\n정말 생산 완료 처리하시겠습니까?`)) return;
        } else {
            if (!window.confirm(`${actualQty}개 생산 완료 처리하시겠습니까?\nBOM 기반 원자재가 창고에서 자동 차감되고 QA 검사 대기열로 이관됩니다.`)) return;
        }

        setLoading(true);
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'production_requests', pr.id), {
                Status: 'QA_WAITING', ActualQty: actualQty, DefectQty: defectQty, DefectReason: defectReason,
                CompletedAt: serverTimestamp(), UpdatedBy: userProfile?.uid,
                Logs: [{ from: pr.Status, to: 'QA_WAITING', message: `생산 완료 처리: 양품 ${actualQty} / 불량 ${defectQty}`, user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString() }, ...(pr.Logs || [])]
            });

            const receivingRef = doc(collection(db, 'receiving'));
            batch.set(receivingRef, { PR_ID: pr.id, PRNumber: pr.PRNumber, PartID: pr.PartID, PartName: pr.PartName, Qty: actualQty, Status: 'WAITING_INSPECTION', Type: 'SHIPPING', CustomerName: pr.CustomerName, ReceivedAt: serverTimestamp(), SourceType: 'PRODUCTION' });

            for (const bom of bomItems) {
                const deductQty = (bom.Quantity || 1) * actualQty;
                const invData = inventory[bom.ChildID];
                if (invData?.ref) batch.update(invData.ref, { OnHand: (invData.onHand || 0) - deductQty, UpdatedAt: serverTimestamp() });
            }
            await batch.commit();
            alert('생산 완료 처리 및 QA 이관 완료!');
            onRefresh(); onClose();
        } catch (err) { console.error(err); alert('처리 중 오류 발생'); } finally { setLoading(false); }
    };

    if (!pr) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 text-left">
            <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div><h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Factory className="text-orange-500"/> 생산 완료 보고</h2><p className="text-xs font-bold text-slate-400 mt-1">{pr.PRNumber} | {pr.PartName}</p></div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500 mb-1 block">실제 수량</label><input type="number" value={actualQty} onChange={e => setActualQty(parseInt(e.target.value) || 0)} className="w-full bg-white border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" /></div>
                            <div><label className="text-xs font-bold text-slate-500 mb-1 block">불량 수량</label><input type="number" value={defectQty} onChange={e => setDefectQty(parseInt(e.target.value) || 0)} className="w-full bg-white border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" /></div>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl text-sm font-black bg-slate-100 text-slate-600 hover:bg-slate-200">취소</button>
                        <button onClick={handleComplete} disabled={loading} className="flex-[2] py-3.5 rounded-2xl text-sm font-black bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-100 disabled:opacity-50">{loading ? '처리 중...' : '생산 완료 보고 및 QA 이관'}</button>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
}

function KanbanCard({ pr, onClick }) {
    const delayed = isDelayed(pr.DueDate);
    return (
        <div onClick={() => onClick(pr)} className={`bg-white rounded-xl p-3 border shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 ${delayed ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'} text-left`}>
            <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-mono font-black text-slate-500">{pr.PRNumber}</span>{pr.Urgent && <AlertCircle size={11} className="text-rose-500 animate-pulse"/>}</div>
            <p className="text-sm font-black text-slate-800 mb-1 leading-tight">{pr.PartName}</p>
            <p className="text-[11px] font-bold text-slate-500 mb-2">{pr.CustomerName}</p>
            <div className="flex justify-between items-center pt-2 border-t border-slate-50"><span className="text-[11px] font-black text-slate-600">{pr.TargetQty} EA</span><span className={`text-[10px] font-black ${delayed ? 'text-rose-600' : 'text-slate-400'}`}>{pr.DueDate}</span></div>
        </div>
    );
}

export default function ProductionExecutionPage() {
    const { userProfile } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('SPLIT'); 
    const [selectedPR, setSelectedPR] = useState(null);
    const [isWOModalOpen, setIsWOModalOpen] = useState(false);
    const [woPR, setWoPR] = useState(null);
    const [scheduleForm, setScheduleForm] = useState({ startDate: '', endDate: '' });

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) setScheduleForm({ startDate: selectedPR.ProdStartDate || '', endDate: selectedPR.ProdEndDate || '' }); }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setPrs(all.filter(pr => EXECUTION_STATUSES.includes(pr.Status)));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    // Gantt Data Mapping (Ensuring all required fields for ProjectGanttChart)
    const ganttData = useMemo(() => prs.map(pr => {
        const schedules = {};
        const startDate = pr.ProdStartDate || pr.CreatedAt?.toDate?.().toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
        const endDate = pr.ProdEndDate || pr.DueDate || startDate;
        
        // Map PR stages to Gantt stages
        GANTT_STAGES.forEach(s => {
            schedules[s.id] = {
                start: startDate,
                end: endDate,
                status: pr.Status.toLowerCase().includes(s.id) ? 'in_progress' : 
                        (PR_STATUS[pr.Status]?.step > 7 ? 'completed' : 'pending')
            };
        });

        return {
            id: pr.id,
            name: pr.PartName,
            code: pr.PRNumber,
            progress: Math.min(100, (PR_STATUS[pr.Status]?.step || 0) * 10),
            startDate: startDate,
            endDate: endDate,
            schedules: schedules,
            tests: {} // Required by component
        };
    }), [prs]);

    const handleStatusChange = async (prId, nextStatus, logMessage = '', reason = '') => {
        const pr = prs.find(p => p.id === prId) || selectedPR;
        if (!pr) return;
        const currentStep = PR_STATUS[pr.Status]?.step || 0;
        const nextStep = PR_STATUS[nextStatus]?.step || 0;
        if (nextStep < currentStep && !reason) {
            const userReason = window.prompt('되돌리는 사유:');
            if (!userReason) return; reason = userReason;
        }
        const logEntry = { from: pr.Status, to: nextStatus, message: logMessage || (nextStep < currentStep ? `복구: ${reason}` : '상태 변경'), user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString() };
        try {
            await updateDoc(doc(db, 'production_requests', prId), { Status: nextStatus, UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(pr.Logs || [])] });
            await fetchPRs(); setSelectedPR(null);
        } catch (err) { console.error(err); }
    };

    const handleUpdateSchedule = async () => {
        if (!selectedPR) return;
        try {
            await updateDoc(doc(db, 'production_requests', selectedPR.id), { ProdStartDate: scheduleForm.startDate, ProdEndDate: scheduleForm.endDate, UpdatedAt: serverTimestamp(), Logs: [{ from: selectedPR.Status, to: selectedPR.Status, message: `생산 일정 수정: ${scheduleForm.startDate} ~ ${scheduleForm.endDate}`, user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString() }, ...(selectedPR.Logs || [])] });
            alert('일정 수정 완료'); await fetchPRs(); setSelectedPR(null);
        } catch (err) { console.error(err); }
    };

    const handleCardClick = (pr) => setSelectedPR(pr);

    const stats = useMemo(() => {
        const inProd = prs.filter(p => p.Status === 'IN_PRODUCTION').length;
        const delayed = prs.filter(p => isDelayed(p.DueDate)).length;
        const waiting = prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status)).length;
        const qaWaiting = prs.filter(p => p.Status === 'QA_WAITING').length;
        return { inProd, delayed, waiting, qaWaiting };
    }, [prs]);

    const waitingPRs = prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status));
    const activePRs = prs.filter(p => ['WORK_ORDER', 'IN_PRODUCTION'].includes(p.Status));

    return (
        <div className="h-full flex flex-col space-y-5">
            <div className="flex justify-between items-end shrink-0">
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 계획 관리</h1><p className="text-sm font-bold text-slate-500 mt-1.5">통합 관리 대시보드</p></div>
                <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm gap-1">
                    {[ { id: 'SPLIT', icon: List, label: '리스트' }, { id: 'KANBAN', icon: LayoutGrid, label: '칸반' }, { id: 'GANTT', icon: BarChart2, label: '간트' }, { id: 'CALENDAR', icon: Calendar, label: '캘린더' } ].map(tab => (
                        <button key={tab.id} onClick={() => setViewMode(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${viewMode === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}><tab.icon size={15}/> {tab.label}</button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4 shrink-0 text-left">
                {[ { l: '계획 대기', v: stats.waiting, c: 'text-indigo-600', b: 'bg-indigo-50', i: Clock }, { l: '생산 중', v: stats.inProd, c: 'text-orange-600', b: 'bg-orange-50', i: Factory }, { l: '납기 지연', v: stats.delayed, c: 'text-rose-600', b: 'bg-rose-50', i: AlertTriangle }, { l: 'QA 대기', v: stats.qaWaiting, c: 'text-purple-600', b: 'bg-purple-50', i: TrendingUp } ].map((s, idx) => (
                    <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${s.b}`}><s.i size={22} className={s.c}/></div>
                        <div><p className="text-[10px] font-black text-slate-400 mb-0.5">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>{s.v}</p></div>
                    </div>
                ))}
            </div>

            {loading ? <div className="flex-1 flex items-center justify-center animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"/> : 
                viewMode === 'SPLIT' ? (
                    <div className="flex-1 grid grid-cols-2 gap-5 min-h-0 text-left">
                        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
                            <div className="px-5 py-4 border-b bg-indigo-50/50 shrink-0"><h2 className="text-sm font-black text-indigo-700">계획 대기 ({waitingPRs.length})</h2></div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">{waitingPRs.map(pr => <KanbanCard key={pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
                            <div className="px-5 py-4 border-b bg-orange-50/50 shrink-0"><h2 className="text-sm font-black text-orange-700">생산 진행 중 ({activePRs.length})</h2></div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">{activePRs.map(pr => <KanbanCard key={pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                        </div>
                    </div>
                ) : viewMode === 'KANBAN' ? (
                    <div className="flex-1 flex gap-4 min-h-0 overflow-x-auto pb-4 custom-scrollbar">
                        {KANBAN_COLUMNS.map(col => <div key={col.key} className={`flex-shrink-0 w-56 rounded-2xl border-2 ${col.color} flex flex-col min-h-0 shadow-sm`}>
                            <div className={`px-4 py-3 rounded-t-xl ${col.headColor} flex justify-between items-center`}><span className="text-[11px] font-black uppercase tracking-wider">{col.label}</span><span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded-full">{prs.filter(p => p.Status === col.key).length}</span></div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-3">{prs.filter(p => p.Status === col.key).map(pr => <KanbanCard key={pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                        </div>)}
                    </div>
                ) : viewMode === 'GANTT' ? <div className="flex-1 min-h-0"><ProjectGanttChart projects={ganttData} stages={GANTT_STAGES} /></div> : <ProductionCalendar prs={prs} onCardClick={handleCardClick} />
            }

            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)}/>
                    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 text-left">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">{selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-xs font-bold animate-pulse">긴급</span>}<span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span></div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2><p className="text-sm font-bold text-slate-500">{selectedPR.PartName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                                <div><p className="font-bold text-slate-400 mb-0.5">Part ID</p><p className="font-mono font-black text-emerald-600">{selectedPR.PartID}</p></div>
                                <div><p className="font-bold text-slate-400 mb-0.5">목표 수량</p><p className="font-black text-slate-800">{selectedPR.TargetQty} EA</p></div>
                            </div>
                            {['PROD_WAITING', 'PROD_PLANNING'].includes(selectedPR.Status) && (
                                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><Calendar size={14} className="text-blue-500"/> 생산 일정 수립</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className="text-[10px] font-bold text-slate-400 block mb-1">착수 예정일</label><input type="date" value={scheduleForm.startDate} onChange={e => setScheduleForm({...scheduleForm, startDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                        <div><label className="text-[10px] font-bold text-slate-400 block mb-1">완료 예정일</label><input type="date" value={scheduleForm.endDate} onChange={e => setScheduleForm({...scheduleForm, endDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                    </div>
                                    <button onClick={handleUpdateSchedule} className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-black">일정 저장</button>
                                </div>
                            )}
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                <h3 className="text-xs font-black text-slate-700">프로세스 제어</h3>
                                {NEXT_STATUS_MAP[selectedPR.Status] && selectedPR.Status !== 'IN_PRODUCTION' && <button onClick={() => handleStatusChange(selectedPR.id, NEXT_STATUS_MAP[selectedPR.Status].next)} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2"><Zap size={14}/> {NEXT_STATUS_MAP[selectedPR.Status].label}</button>}
                                {selectedPR.Status === 'IN_PRODUCTION' && <button onClick={() => { setWoPR(selectedPR); setIsWOModalOpen(true); }} className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2"><Factory size={14}/> 생산 완료 보고</button>}
                            </div>
                            {selectedPR.Logs && selectedPR.Logs.length > 0 && (
                                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><History size={14}/> 히스토리</h3>
                                    <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar">{selectedPR.Logs.map((log, lidx) => (
                                        <div key={lidx} className="border-l-2 border-slate-100 pl-3 py-1"><div className="flex justify-between items-center"><span className="text-[10px] font-black text-blue-600">{PR_STATUS[log.to]?.label}</span><span className="text-[9px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span></div><p className="text-[11px] font-bold text-slate-700">{log.message}</p></div>
                                    ))}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>, document.body
            )}
            {isWOModalOpen && woPR && <WODetailModal pr={woPR} onClose={() => { setIsWOModalOpen(false); setWoPR(null); }} onRefresh={() => { fetchPRs(); setSelectedPR(null); }}/>}
        </div>
    );
}
