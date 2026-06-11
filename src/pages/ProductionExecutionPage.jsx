import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch, addDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Factory, AlertTriangle, CheckCircle2, Clock, X, ChevronRight, Zap, List, LayoutGrid, Package, AlertCircle, ShieldAlert, TrendingUp, RotateCcw, History, Calendar, BarChart2, ClipboardList, Send } from 'lucide-react';
import ProjectGanttChart from '../components/ProjectGanttChart';
import BOMCheckTree from '../components/BOMCheckTree';
import PRTimelineGraph from '../components/PRTimelineGraph';
import { productionService } from '../services/productionService';

// ─────────────────────────────────────────────────────────────
// 상태 정의
// ─────────────────────────────────────────────────────────────
const PR_STATUS = {
    DRAFT:           { label: '임시저장',     color: 'bg-slate-100 text-slate-500 border-slate-200',    step: 0 },
    REVIEW:          { label: '생산검토',     color: 'bg-yellow-50 text-yellow-600 border-yellow-200',  step: 1 },
    CONFIRMED:       { label: '의뢰확정',     color: 'bg-blue-50 text-blue-600 border-blue-200',        step: 2 },
    WAITING_FOR_PARTS: { label: '자재대기',     color: 'bg-rose-50 text-rose-600 border-rose-200',        step: 2.5 },
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
    const [groupBy, setGroupBy] = useState('ORDER'); // 'ORDER' | 'DELIVERY'
    const [isWOModalOpen, setIsWOModalOpen] = useState(false);
    const [woPR, setWoPR] = useState(null);
    const [scheduleForm, setScheduleForm] = useState({ startDate: '', endDate: '' });

    const [detailTab, setDetailTab] = useState('basic'); 
    const [selectedPRBOM, setSelectedPRBOM] = useState([]);
    const [inventory, setInventory] = useState({});
    const [reservedMap, setReservedMap] = useState({});
    const [activeScheduleTab, setActiveScheduleTab] = useState(0);

    const processedData = useMemo(() => {
        if (groupBy === 'ORDER') return prs;
        
        // Flatten PRs into individual delivery items
        const flattened = [];
        prs.forEach(pr => {
            const items = pr.Items || [{ PartID: pr.PartID, PartName: pr.PartName, TargetQty: pr.TargetQty, DueDate: pr.DueDate }];
            items.forEach((item, itemIdx) => {
                const schedules = item.Schedules && item.Schedules.length > 0 
                    ? item.Schedules 
                    : [{ date: item.DueDate || pr.DueDate, qty: item.TargetQty || pr.TargetQty }];
                
                schedules.forEach((sched, sIdx) => {
                    flattened.push({
                        ...pr,
                        displayID: `${pr.PRNumber}-${itemIdx + 1}-${sIdx + 1}`,
                        PartID: item.PartID,
                        PartName: item.PartName,
                        TargetQty: Number(sched.qty || item.TargetQty || 0),
                        DueDate: sched.date || item.DueDate || pr.DueDate,
                        isSplit: true,
                        parentPR: pr
                    });
                });
            });
        });
        return flattened;
    }, [prs, groupBy]);

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) {
        setScheduleForm({ startDate: selectedPR.ProdStartDate || '', endDate: selectedPR.ProdEndDate || '' });
        fetchSelectedPRDetails(selectedPR);
    } }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setPrs(all.filter(pr => EXECUTION_STATUSES.includes(pr.Status)));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchSelectedPRDetails = async (pr) => {
        if (!pr) return;
        setActiveScheduleTab(0);
        try {
            const items = pr.Items || [{ PartID: pr.PartID, TargetQty: pr.TargetQty, PartName: pr.PartName }];
            const [invSnap, partsSnap, allBomSnap, allActivePrSnap] = await Promise.all([
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'parts')),
                getDocs(collection(db, 'bom')),
                getDocs(query(collection(db, 'production_requests'), where('Status', 'in', ['WAITING_FOR_PARTS', 'PROD_WAITING', 'IN_PRODUCTION'])))
            ]);
            
            const partsMap = {};
            const partsFullMap = {};
            partsSnap.docs.forEach(d => { 
                const data = d.data();
                partsMap[data.PartID] = data.Name;
                partsFullMap[data.PartID] = data;
            });
            
            const inventoryMap = {};
            invSnap.docs.forEach(d => { inventoryMap[d.data().PartID] = Number(d.data().OnHand || 0); });
            setInventory(inventoryMap);

            const bomDataByParent = {};
            allBomSnap.docs.forEach(d => {
                const data = d.data();
                if (!bomDataByParent[data.ParentID]) bomDataByParent[data.ParentID] = [];
                bomDataByParent[data.ParentID].push(data);
            });

            const reserved = await productionService.fetchReservedMap(pr.id);
            setReservedMap(reserved);

            const structuredData = [];
            items.forEach((item, itemIdx) => {
                const schedules = (item.Schedules && item.Schedules.length > 0) ? item.Schedules : [{ date: item.DueDate || pr.DueDate, qty: item.TargetQty || pr.TargetQty }];
                
                const bomTree = productionService.buildBOMTree(item.PartID, bomDataByParent, partsFullMap);
                
                schedules.forEach((sched, sIdx) => {
                    structuredData.push({
                        id: `${item.PartID}-${sIdx}`,
                        PartID: item.PartID,
                        PartName: item.PartName,
                        ScheduleIdx: sIdx + 1,
                        ScheduleDate: sched.date || item.DueDate || pr.DueDate,
                        SetQty: Number(sched.qty || item.TargetQty || 0),
                        BOMTree: bomTree
                    });
                });
            });
            setSelectedPRBOM(structuredData);
        } catch (err) { console.error(err); }
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

    const waitingPRs = processedData.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status));
    const activePRs = processedData.filter(p => ['WORK_ORDER', 'IN_PRODUCTION'].includes(p.Status));

    const handleUpdateScheduleItem = async (itemIdx, sIdx, start, end) => {
        if (!selectedPR) return;
        const newItems = [...(selectedPR.Items || [{ PartID: selectedPR.PartID, PartName: selectedPR.PartName, TargetQty: selectedPR.TargetQty, DueDate: selectedPR.DueDate }])];
        if (!newItems[itemIdx].Schedules) {
            newItems[itemIdx].Schedules = [{ date: newItems[itemIdx].DueDate, qty: newItems[itemIdx].TargetQty }];
        }
        newItems[itemIdx].Schedules[sIdx] = { ...newItems[itemIdx].Schedules[sIdx], startDate: start, endDate: end };
        
        try {
            await updateDoc(doc(db, 'production_requests', selectedPR.id), { 
                Items: newItems, 
                UpdatedAt: serverTimestamp(), 
                Logs: [{ from: selectedPR.Status, to: selectedPR.Status, message: `분할 일정 수정: ${newItems[itemIdx].PartName} ${sIdx+1}차 (${start} ~ ${end})`, user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString() }, ...(selectedPR.Logs || [])] 
            });
            await fetchPRs();
            setSelectedPR({ ...selectedPR, Items: newItems });
        } catch (err) { console.error(err); }
    };

    return (
        <div className="h-full flex flex-col space-y-5">
            <div className="flex justify-between items-end shrink-0">
                <div className="flex items-end gap-6">
                    <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 계획 관리</h1><p className="text-sm font-bold text-slate-500 mt-1.5">통합 관리 대시보드</p></div>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 mb-1">
                        <button onClick={() => setGroupBy('ORDER')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${groupBy === 'ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>주문서별</button>
                        <button onClick={() => setGroupBy('DELIVERY')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${groupBy === 'DELIVERY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>납기기준별</button>
                    </div>
                </div>
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
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">{waitingPRs.map(pr => <KanbanCard key={pr.displayID || pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
                            <div className="px-5 py-4 border-b bg-orange-50/50 shrink-0"><h2 className="text-sm font-black text-orange-700">생산 진행 중 ({activePRs.length})</h2></div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">{activePRs.map(pr => <KanbanCard key={pr.displayID || pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                        </div>
                    </div>
                ) : viewMode === 'KANBAN' ? (
                    <div className="flex-1 flex gap-4 min-h-0 overflow-x-auto pb-4 custom-scrollbar">
                        {KANBAN_COLUMNS.map(col => <div key={col.key} className={`flex-shrink-0 w-56 rounded-2xl border-2 ${col.color} flex flex-col min-h-0 shadow-sm`}>
                            <div className={`px-4 py-3 rounded-t-xl ${col.headColor} flex justify-between items-center`}><span className="text-[11px] font-black uppercase tracking-wider">{col.label}</span><span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded-full">{processedData.filter(p => p.Status === col.key).length}</span></div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-3">{processedData.filter(p => p.Status === col.key).map(pr => <KanbanCard key={pr.displayID || pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                        </div>)}
                    </div>
                ) : viewMode === 'GANTT' ? <div className="flex-1 min-h-0"><ProjectGanttChart projects={ganttData} stages={GANTT_STAGES} /></div> : <ProductionCalendar prs={processedData} onCardClick={handleCardClick} />
            }

            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)}/>
                    <div className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 text-left">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">{selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-xs font-bold animate-pulse">긴급</span>}<span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span></div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2><p className="text-sm font-bold text-slate-500">{selectedPR.PartName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-xl"><X size={18}/></button>
                        </div>
                        
                        <div className="flex-1 overflow-hidden flex flex-col">
                            {/* 사이드바 탭 헤더 */}
                            <div className="flex border-b border-slate-200 bg-white shrink-0 px-2">
                                {[
                                    { id: 'basic', label: '기본 정보', icon: ClipboardList },
                                    { id: 'materials', label: 'BOM/소요자재', icon: Package },
                                    { id: 'history', label: '활동 로그', icon: History }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDetailTab(tab.id)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black transition-all border-b-2 ${
                                            detailTab === tab.id 
                                                ? 'border-blue-600 text-blue-600 bg-blue-50/30' 
                                                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <tab.icon size={14} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-left custom-scrollbar">
                                {detailTab === 'basic' && (
                                    <div className="space-y-4">
                                        {/* 상단 주문 정보 */}
                                        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4 shadow-sm text-xs">
                                            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b pb-2"><ClipboardList size={14} className="text-blue-500"/> 고객사 주문 정보</h3>
                                            <div className="grid grid-cols-2 gap-y-4 gap-x-3">
                                                <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                    <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[9px]">고객사 (Customer)</p>
                                                    <p className="font-black text-indigo-700 text-sm">{selectedPR.CustomerName || '미지정'}</p>
                                                </div>
                                                <div className="pl-1">
                                                    <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[9px]">납기 희망일</p>
                                                    <p className="font-black text-rose-600 text-sm">{selectedPR.DueDate}</p>
                                                </div>
                                                <div className="pl-1">
                                                    <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[9px]">등록일</p>
                                                    <p className="font-black text-slate-500 text-sm">{selectedPR.CreatedAt?.toDate ? selectedPR.CreatedAt.toDate().toLocaleDateString() : '-'}</p>
                                                </div>
                                                {selectedPR.Remarks && (
                                                    <div className="col-span-2 mt-2 p-3 bg-amber-50/50 rounded-xl border border-amber-200/50">
                                                        <p className="font-black text-amber-800 mb-1 uppercase tracking-tighter text-[9px]">비고 사항</p>
                                                        <p className="font-bold text-slate-700 whitespace-pre-line leading-relaxed">{selectedPR.Remarks}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 프로세스 제어 (상태 변경) */}
                                        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3 shadow-sm">
                                            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b pb-2"><Zap size={14} className="text-orange-500"/> 공정 단계 제어</h3>
                                            <div className="flex gap-2">
                                                {NEXT_STATUS_MAP[selectedPR.Status] && selectedPR.Status !== 'IN_PRODUCTION' && (
                                                    <button onClick={() => handleStatusChange(selectedPR.id, NEXT_STATUS_MAP[selectedPR.Status].next)} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700">
                                                        <Zap size={14}/> {NEXT_STATUS_MAP[selectedPR.Status].label}
                                                    </button>
                                                )}
                                                {selectedPR.Status === 'IN_PRODUCTION' && (
                                                    <button onClick={() => { setWoPR(selectedPR); setIsWOModalOpen(true); }} className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-orange-100 transition-all hover:bg-orange-600">
                                                        <Factory size={14}/> 생산 완료 보고
                                                    </button>
                                                )}
                                            </div>
                                            {PR_STATUS[selectedPR.Status]?.step > 3 && (
                                                <button onClick={() => { const steps = Object.entries(PR_STATUS).sort((a,b) => a[1].step - b[1].step); const idx = steps.findIndex(s => s[0] === selectedPR.Status); if (idx > 0) handleStatusChange(selectedPR.id, steps[idx - 1][0]); }} className="w-full py-2.5 bg-white border border-rose-200 text-rose-500 rounded-xl text-[10px] font-black flex items-center justify-center gap-2 transition-colors hover:bg-rose-50">
                                                    <RotateCcw size={12}/> 이전 단계로 복구
                                                </button>
                                            )}
                                        </div>

                                        {/* 하단 분할 납기 및 모델별 일정 계획 */}
                                        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4 shadow-sm">
                                            <h3 className="text-xs font-black text-slate-700 flex items-center gap-2 uppercase tracking-widest"><Calendar size={14} className="text-blue-500"/> 완제품별 분할 납기 계획</h3>
                                            <div className="space-y-4">
                                                {(selectedPR.Items || [{ PartID: selectedPR.PartID, PartName: selectedPR.PartName, TargetQty: selectedPR.TargetQty, DueDate: selectedPR.DueDate }]).map((item, itemIdx) => {
                                                    const schedules = item.Schedules && item.Schedules.length > 0 
                                                        ? item.Schedules 
                                                        : [{ date: item.DueDate, qty: item.TargetQty, startDate: selectedPR.ProdStartDate, endDate: selectedPR.ProdEndDate }];
                                                    
                                                    return (
                                                        <div key={itemIdx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Model: {item.PartID}</p>
                                                                    <p className="text-xs font-black text-slate-700">{item.PartName}</p>
                                                                </div>
                                                                <span className="text-[10px] font-black px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-500">총 {item.TargetQty} EA</span>
                                                            </div>
                                                            <div className="space-y-2.5">
                                                                {schedules.map((sched, sIdx) => (
                                                                    <div key={sIdx} className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">{sIdx + 1}차 납기 ({sched.qty} EA)</span>
                                                                            <span className="text-[9px] font-bold text-rose-500">배송희망일: {sched.date}</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-3">
                                                                            <div>
                                                                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">작업 시작일</label>
                                                                                <input 
                                                                                    type="date" 
                                                                                    defaultValue={sched.startDate || ''} 
                                                                                    onBlur={e => handleUpdateScheduleItem(itemIdx, sIdx, e.target.value, sched.endDate)}
                                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">작업 종료일</label>
                                                                                <input 
                                                                                    type="date" 
                                                                                    defaultValue={sched.endDate || ''} 
                                                                                    onBlur={e => handleUpdateScheduleItem(itemIdx, sIdx, sched.startDate, e.target.value)}
                                                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {detailTab === 'materials' && (
                                    <div className="bg-white rounded-[32px] p-6 border border-slate-200 flex flex-col h-[600px] shadow-sm text-left overflow-hidden">
                                        <div className="flex justify-between items-center mb-6 shrink-0">
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                                                <Package size={18} className="text-amber-500"/> 실시간 자재 가용성 현황
                                            </h3>
                                            <button onClick={() => fetchSelectedPRDetails(selectedPR)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100" title="새로고침">
                                                <RotateCcw size={16}/>
                                            </button>
                                        </div>

                                        {/* 납기 회차별 서브 탭 */}
                                        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 no-scrollbar border-b border-slate-100 shrink-0">
                                            {selectedPRBOM.map((group, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setActiveScheduleTab(idx)}
                                                    className={`px-3 py-1.5 rounded-xl text-left transition-all border-2 shrink-0 flex flex-col gap-0.5 min-w-[120px] ${
                                                        activeScheduleTab === idx
                                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                            : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span className={`px-1 py-0.5 rounded text-[7px] font-black ${activeScheduleTab === idx ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                            {group.ScheduleIdx}차
                                                        </span>
                                                        <span className="text-[9px] font-black truncate max-w-[90px]">
                                                            {group.PartName}
                                                        </span>
                                                        <span className={`text-[7px] font-bold ${activeScheduleTab === idx ? 'text-indigo-200' : 'text-indigo-600/60'}`}>
                                                            ({group.SetQty} SET)
                                                        </span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar relative text-left">
                                            {selectedPRBOM.length > 0 && selectedPRBOM[activeScheduleTab] ? (
                                                <div className="animate-in fade-in duration-300">
                                                    <BOMCheckTree 
                                                        data={selectedPRBOM[activeScheduleTab].BOMTree}
                                                        targetQty={selectedPRBOM[activeScheduleTab].SetQty}
                                                        inventoryMap={Object.fromEntries(
                                                            Object.entries(inventory).map(([id, onHand]) => {
                                                                const pid = id.trim().toUpperCase();
                                                                return [
                                                                    pid, 
                                                                    onHand - (reservedMap[pid] || 0)
                                                                ];
                                                            })
                                                        )}
                                                        className="h-auto"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="py-24 text-center text-xs font-bold text-slate-300 uppercase tracking-[0.2em]">BOM 데이터 로드 중...</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {detailTab === 'history' && (
                                    <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm min-h-[500px] text-left">
                                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-6 uppercase tracking-tight"><History size={16} className="text-indigo-600"/> 생산 진행 이력</h3>
                                        <div className="space-y-1">
                                            {selectedPR.Logs && selectedPR.Logs.length > 0 ? selectedPR.Logs.map((log, lidx) => (
                                                <div key={lidx} className="relative pl-6 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0 flex flex-col group hover:bg-slate-50/50 rounded-r-lg transition-colors p-2">
                                                    <div className="absolute left-[-9px] top-4 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                    </div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-black text-indigo-600 px-1.5 py-0.5 bg-indigo-50 rounded border border-indigo-100 uppercase">{PR_STATUS[log.to]?.label || log.to}</span>
                                                        <span className="text-[9px] text-slate-300 font-bold tabular-nums">{new Date(log.timestamp).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-700">{log.message}</p>
                                                    <p className="text-[9px] font-black text-slate-400 mt-1 uppercase tracking-tighter">BY: {log.user}</p>
                                                </div>
                                            )) : (
                                                <div className="py-24 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">이력이 없습니다.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}
            {isWOModalOpen && woPR && <WODetailModal pr={woPR} onClose={() => { setIsWOModalOpen(false); setWoPR(null); }} onRefresh={() => { fetchPRs(); setSelectedPR(null); }}/>}
        </div>
    );
}
