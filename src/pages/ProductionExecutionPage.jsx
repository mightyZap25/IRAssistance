import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch, addDoc, getDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Factory, AlertTriangle, CheckCircle2, Clock, X, ChevronRight, Zap, List, LayoutGrid, Package, AlertCircle, ShieldAlert, TrendingUp, RotateCcw, History, Calendar, BarChart2, ClipboardList, Send } from 'lucide-react';
import ProjectGanttChart from '../components/ProjectGanttChart';
import BOMCheckTree from '../components/BOMCheckTree';
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

const EXECUTION_STATUSES = ['PROD_WAITING', 'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY', 'WAITING_FOR_PARTS', 'CONFIRMED'];

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

    return (
        <div className="flex-1 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col min-h-0 text-left">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-sm font-black text-slate-700 flex items-center gap-2"><Calendar size={16} className="text-indigo-600"/> 생산 일정 캘린더</h3>
                <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))} className="p-1.5 hover:bg-white rounded-lg border border-slate-200"><ChevronRight className="rotate-180" size={16}/></button>
                    <span className="text-sm font-black">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))} className="p-1.5 hover:bg-white rounded-lg border border-slate-200"><ChevronRight size={16}/></button>
                </div>
            </div>
            <div className="flex-1 grid grid-cols-7 overflow-y-auto divide-x divide-y divide-slate-100 custom-scrollbar">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d} className="py-2 text-center text-[10px] font-black text-slate-400 bg-slate-50/30 uppercase">{d}</div>)}
                {calendarDays.map((day, idx) => {
                    const dStr = day.date.toISOString().split('T')[0];
                    const dayPrs = prs.filter(p => p.DueDate === dStr || p.ProdEndDate === dStr);
                    return (
                        <div key={idx} className={`min-h-[100px] p-1.5 ${day.currentMonth ? 'bg-white' : 'bg-slate-50/30'} flex flex-col gap-1`}>
                            <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ${day.date.toDateString() === new Date().toDateString() ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'}`}>{day.date.getDate()}</span>
                            <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar">
                                {dayPrs.map((p, pIdx) => (
                                    <div key={pIdx} onClick={() => onCardClick(p)} className="p-1 rounded-lg border text-[9px] font-black cursor-pointer shadow-sm bg-indigo-50 border-indigo-100 text-indigo-700 truncate">{p.PartName}</div>
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
    const [bomItems, setBomItems] = useState([]);
    const [inventory, setInventory] = useState({});

    useEffect(() => {
        if (!pr) return;
        (async () => {
            const [bomSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'bom'), where('ParentID', '==', pr.PartID))),
                getDocs(collection(db, 'inventory')),
            ]);
            setBomItems(bomSnap.docs.map(d => d.data()));
            const inv = {};
            invSnap.docs.forEach(d => { inv[d.data().PartID] = { onHand: d.data().OnHand || 0, ref: d.ref }; });
            setInventory(inv);
        })();
    }, [pr]);

    const handleComplete = async () => {
        if (!window.confirm(`${actualQty}개 생산 완료 처리하시겠습니까?`)) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const nextStatus = 'QA_WAITING';
            const logEntry = { 
                from: pr.Status, to: nextStatus, 
                message: `생산 완료: 양품 ${actualQty} / 불량 ${defectQty}`, 
                user: userProfile?.displayName || 'Unknown', 
                timestamp: new Date().toISOString(),
                scope: pr.isSplit ? `${pr.PartName} ${pr.scheduleIdx + 1}차` : '전체'
            };

            const parentRef = doc(db, 'production_requests', pr.id);
            const parentSnap = await getDoc(parentRef);
            if (parentSnap.exists()) {
                const parentData = parentSnap.data();
                const newItems = [...(parentData.Items || [])];
                if (pr.isSplit && newItems[pr.itemIdx]) {
                    if (!newItems[pr.itemIdx].Schedules) newItems[pr.itemIdx].Schedules = [{ date: newItems[pr.itemIdx].DueDate || pr.DueDate, qty: newItems[pr.itemIdx].TargetQty || pr.TargetQty }];
                    newItems[pr.itemIdx].Schedules[pr.scheduleIdx] = { ...newItems[pr.itemIdx].Schedules[pr.scheduleIdx], status: nextStatus, actualQty, defectQty };
                    if (newItems[pr.itemIdx].Schedules.every(s => s.status === nextStatus)) newItems[pr.itemIdx].Status = nextStatus;
                }
                const allPRDone = newItems.every(item => (item.Schedules || []).every(s => ['PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY', 'SHIPPED'].includes(s.status)));
                batch.update(parentRef, { Items: newItems, Status: allPRDone ? 'PROD_COMPLETE' : 'IN_PRODUCTION', UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(parentData.Logs || [])] });
            }

            /* 
               기존에 receiving 컬렉션에 저장하던 로직을 제거합니다. 
               생산 제품은 수입검사 대상이 아니므로 qa_shipping_inspections 로만 이관됩니다.
            */

            // 품질 검사 요청 추가 (품질 공정 관리 페이지 - 출하검사 탭 연동)
            const inspectionRef = doc(collection(db, 'qa_shipping_inspections'));
            batch.set(inspectionRef, {
                PR_ID: pr.id,
                PRNumber: pr.PRNumber,
                RefPRID: pr.PRNumber,
                PartID: pr.PartID,
                PartName: pr.PartName,
                CustomerName: pr.CustomerName || '일반고객', // 고객사 정보 추가
                Qty: actualQty,
                Status: 'WAITING_INSPECTION',
                createdAt: serverTimestamp(), // QAProcessPage에서 사용하는 필드명
                ScheduleIdx: pr.isSplit ? pr.scheduleIdx : undefined
            });

            bomItems.forEach(bom => {
                const deductQty = (bom.Quantity || 1) * actualQty;
                const invData = inventory[bom.ChildID];
                if (invData?.ref) batch.update(invData.ref, { OnHand: (invData.onHand || 0) - deductQty, UpdatedAt: serverTimestamp() });
            });

            await batch.commit();
            alert('완료되었습니다.'); onRefresh(); onClose();
        } catch (err) { console.error(err); alert('오류 발생'); } finally { setLoading(false); }
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                    <div><h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Factory size={20} className="text-orange-500"/> 생산 완료 보고</h2><p className="text-[10px] font-bold text-slate-400 mt-0.5">{pr.PartName}</p></div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-xl shadow-sm"><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase">양품 수량</label><input type="number" value={actualQty} onChange={e => setActualQty(parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-orange-400" /></div>
                        <div className="space-y-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase">불량 수량</label><input type="number" value={defectQty} onChange={e => setDefectQty(parseInt(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-black outline-none focus:ring-2 focus:ring-orange-400" /></div>
                    </div>
                    <div className="flex gap-2 pt-2"><button onClick={onClose} className="flex-1 py-3 rounded-xl text-xs font-black bg-slate-100 text-slate-600">취소</button><button onClick={handleComplete} disabled={loading} className="flex-[2] py-3 rounded-xl text-xs font-black bg-orange-500 text-white shadow-lg shadow-orange-100 disabled:opacity-50">{loading ? '처리 중...' : '생산 완료 보고'}</button></div>
                </div>
            </div>
        </div>, document.body
    );
}

function KanbanCard({ pr, onClick }) {
    const delayed = isDelayed(pr.DueDate);
    return (
        <div onClick={() => onClick(pr)} className={`bg-white rounded-xl p-3 border shadow-sm cursor-pointer hover:shadow-md transition-all ${delayed ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-200'} text-left`}>
            <div className="flex justify-between items-start mb-1.5"><span className="text-[9px] font-black text-slate-400 uppercase">{pr.PRNumber}</span>{pr.Urgent && <AlertCircle size={10} className="text-rose-500"/>}</div>
            <p className="text-xs font-black text-slate-800 leading-tight mb-1 truncate">{pr.PartName}</p>
            <p className="text-[10px] font-bold text-slate-400 mb-2 truncate">{pr.CustomerName}</p>
            <div className="flex justify-between items-center pt-2 border-t border-slate-50"><span className="text-[10px] font-black text-slate-600">{pr.TargetQty} EA</span><span className={`text-[9px] font-black ${delayed ? 'text-rose-600' : 'text-slate-400'}`}>{pr.DueDate}</span></div>
        </div>
    );
}

export default function ProductionExecutionPage() {
    const { userProfile } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('SPLIT'); 
    const [selectedPR, setSelectedPR] = useState(null);
    const [groupBy, setGroupBy] = useState('ORDER');
    const [isWOModalOpen, setIsWOModalOpen] = useState(false);
    const [woPR, setWoPR] = useState(null);
    const [detailTab, setDetailTab] = useState('basic'); 
    const [selectedPRBOM, setSelectedPRBOM] = useState([]);
    const [inventory, setInventory] = useState({});
    const [reservedMap, setReservedMap] = useState({});
    const [activeScheduleTab, setActiveScheduleTab] = useState(0);

    const processedData = useMemo(() => {
        if (groupBy === 'ORDER') return prs;
        const flattened = [];
        prs.forEach(pr => {
            const items = pr.Items || [{ PartID: pr.PartID, PartName: pr.PartName, TargetQty: pr.TargetQty, DueDate: pr.DueDate, Status: pr.Status }];
            items.forEach((item, itemIdx) => {
                const schedules = item.Schedules && item.Schedules.length > 0 ? item.Schedules : [{ date: item.DueDate || pr.DueDate, qty: item.TargetQty || pr.TargetQty, status: item.Status || pr.Status }];
                schedules.forEach((sched, sIdx) => {
                    const currentStatus = sched.status || item.Status || pr.Status || 'PROD_WAITING';
                    flattened.push({ ...pr, displayID: `${pr.PRNumber}-${itemIdx+1}-${sIdx+1}`, itemIdx, scheduleIdx: sIdx, PartID: item.PartID, PartName: item.PartName, TargetQty: Number(sched.qty || 0), DueDate: sched.date, Status: currentStatus, isSplit: true });
                });
            });
        });
        return flattened;
    }, [prs, groupBy]);

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) fetchSelectedPRDetails(selectedPR); }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            setPrs(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(pr => EXECUTION_STATUSES.includes(pr.Status)));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchSelectedPRDetails = async (pr) => {
        if (!pr) return;
        try {
            const [invSnap, partsSnap, allBomSnap] = await Promise.all([getDocs(collection(db, 'inventory')), getDocs(collection(db, 'parts')), getDocs(collection(db, 'bom'))]);
            const partsFullMap = {}; partsSnap.docs.forEach(d => { partsFullMap[d.data().PartID] = d.data(); });
            const inventoryMap = {}; invSnap.docs.forEach(d => { inventoryMap[d.data().PartID] = Number(d.data().OnHand || 0); });
            setInventory(inventoryMap);
            const bomDataByParent = {}; allBomSnap.docs.forEach(d => { const data = d.data(); if (!bomDataByParent[data.ParentID]) bomDataByParent[data.ParentID] = []; bomDataByParent[data.ParentID].push(data); });
            const reserved = await productionService.fetchReservedMap(pr.id); setReservedMap(reserved);
            const structuredData = [];
            (pr.Items || [{ PartID: pr.PartID, TargetQty: pr.TargetQty, PartName: pr.PartName }]).forEach((item, itemIdx) => {
                const schedules = (item.Schedules && item.Schedules.length > 0) ? item.Schedules : [{ date: item.DueDate || pr.DueDate, qty: item.TargetQty || pr.TargetQty }];
                const bomTree = productionService.buildBOMTree(item.PartID, bomDataByParent, partsFullMap);
                schedules.forEach((sched, sIdx) => { structuredData.push({ id: `${item.PartID}-${sIdx}`, PartName: item.PartName, ScheduleIdx: sIdx + 1, ScheduleDate: sched.date, SetQty: Number(sched.qty || 0), BOMTree: bomTree }); });
            });
            setSelectedPRBOM(structuredData);
        } catch (err) { console.error(err); }
    };

    const handleStatusChange = async (prId, nextStatus, logMessage = '', itemIdx = undefined, sIdx = undefined) => {
        const pr = prs.find(p => p.id === prId) || selectedPR; if (!pr) return;
        const isSplit = itemIdx !== undefined && sIdx !== undefined;
        const currentStatus = isSplit ? (pr.Items?.[itemIdx]?.Schedules?.[sIdx]?.status || pr.Items?.[itemIdx]?.Status || pr.Status || '') : pr.Status;
        
        const currentStep = PR_STATUS[currentStatus]?.step || 0;
        const nextStep = PR_STATUS[nextStatus]?.step || 0;

        // 1. 상태 변경 경고창
        if (!window.confirm(`상태를 [${PR_STATUS[nextStatus]?.label || nextStatus}] 단계로 변경하시겠습니까?`)) return;

        let reason = '';
        // 2. 이전 단계로 되돌리는 경우 사유 입력
        if (nextStep < currentStep && currentStatus !== '') {
            const userReason = window.prompt('이전 단계로 되돌리는 사유를 입력해주세요:');
            if (!userReason) {
                alert('사유를 입력해야 상태 변경이 가능합니다.');
                return;
            }
            reason = userReason;
        }

        const logEntry = { 
            from: currentStatus, 
            to: nextStatus, 
            message: logMessage || (reason ? `상태 복구: ${reason}` : '상태 변경'), 
            user: userProfile?.displayName || 'Unknown', 
            timestamp: new Date().toISOString(), 
            scope: isSplit ? `${pr.Items?.[itemIdx]?.PartName || pr.PartName} ${sIdx+1}차` : '전체' 
        };

        try {
            const updateData = { UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(pr.Logs || [])] };
            if (isSplit) {
                const newItems = pr.Items && pr.Items.length > 0 ? [...pr.Items] : [{ PartID: pr.PartID, PartName: pr.PartName, Rev: pr.Rev || '0.0', TargetQty: pr.TargetQty, DueDate: pr.DueDate, Status: pr.Status, Schedules: [{ date: pr.DueDate, qty: pr.TargetQty, status: pr.Status }] }];
                if (newItems[itemIdx]) {
                    if (!newItems[itemIdx].Schedules) newItems[itemIdx].Schedules = [{ date: newItems[itemIdx].DueDate || pr.DueDate, qty: newItems[itemIdx].TargetQty || pr.TargetQty, status: newItems[itemIdx].Status || pr.Status }];
                    newItems[itemIdx].Schedules[sIdx].status = nextStatus;
                    newItems[itemIdx].Status = newItems[itemIdx].Schedules.every(s => s.status === nextStatus) ? nextStatus : 'IN_PRODUCTION';
                }
                updateData.Items = newItems;
                const allPRDone = newItems.every(item => (item.Schedules || []).every(s => ['PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY', 'SHIPPED'].includes(s.status)));
                updateData.Status = allPRDone ? 'PROD_COMPLETE' : 'IN_PRODUCTION';
            } else {
                updateData.Status = nextStatus;
                if (pr.Items) updateData.Items = pr.Items.map(item => ({ ...item, Status: nextStatus, Schedules: (item.Schedules || []).map(s => ({ ...s, status: nextStatus })) }));
            }
            await updateDoc(doc(db, 'production_requests', prId), updateData);
            await fetchPRs(); if (selectedPR?.id === prId) setSelectedPR(prev => ({ ...prev, ...updateData, UpdatedAt: new Date() }));
        } catch (err) { console.error(err); alert('상태 변경 실패'); }
    };

    const handleUpdateScheduleItem = async (itemIdx, sIdx, updates, logMessage = '') => {
        if (!selectedPR) return;
        const newItems = selectedPR.Items && selectedPR.Items.length > 0 ? [...selectedPR.Items] : [{ PartID: selectedPR.PartID, PartName: selectedPR.PartName, Rev: selectedPR.Rev || '0.0', TargetQty: selectedPR.TargetQty, DueDate: selectedPR.DueDate, Status: selectedPR.Status, Schedules: [{ date: selectedPR.DueDate, qty: selectedPR.TargetQty, status: selectedPR.Status }] }];
        if (!newItems[itemIdx].Schedules) newItems[itemIdx].Schedules = [{ date: newItems[itemIdx].DueDate || selectedPR.DueDate, qty: newItems[itemIdx].TargetQty || selectedPR.TargetQty }];
        
        newItems[itemIdx].Schedules[sIdx] = { ...newItems[itemIdx].Schedules[sIdx], ...updates };
        
        // 수정 모드 플래그 제거 (DB 저장용 아님)
        delete newItems[itemIdx].Schedules[sIdx]._editingStart;
        delete newItems[itemIdx].Schedules[sIdx]._editingEnd;

        const logEntry = {
            from: selectedPR.Status,
            to: selectedPR.Status,
            message: logMessage || `일정 정보 수정: ${newItems[itemIdx].PartName} ${sIdx+1}차`,
            user: userProfile?.displayName || 'Unknown',
            timestamp: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, 'production_requests', selectedPR.id), { 
                Items: newItems, 
                UpdatedAt: serverTimestamp(),
                Logs: [logEntry, ...(selectedPR.Logs || [])]
            });
            await fetchPRs();
            setSelectedPR(prev => ({ ...prev, Items: newItems, Logs: [logEntry, ...(prev.Logs || [])] }));
        } catch (err) { console.error(err); alert('수정 실패'); }
    };

    const stats = useMemo(() => ({ inProd: prs.filter(p => p.Status === 'IN_PRODUCTION').length, delayed: prs.filter(p => isDelayed(p.DueDate)).length, waiting: prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status)).length, qaWaiting: prs.filter(p => p.Status === 'QA_WAITING').length }), [prs]);
    const waitingPRs = processedData.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status));
    const activePRs = processedData.filter(p => ['WORK_ORDER', 'IN_PRODUCTION'].includes(p.Status));

    const ganttData = useMemo(() => prs.map(pr => ({ id: pr.id, name: pr.PartName, code: pr.PRNumber, progress: Math.min(100, (PR_STATUS[pr.Status]?.step || 0) * 10), startDate: pr.ProdStartDate || pr.DueDate, endDate: pr.ProdEndDate || pr.DueDate, schedules: {}, tests: {} })), [prs]);

    return (
        <div className="h-full flex flex-col space-y-5 text-left custom-scrollbar">
            <div className="flex justify-between items-end shrink-0">
                <div className="flex items-end gap-6">
                    <div><h1 className="text-2xl font-black text-slate-900 tracking-tight">생산 계획 관리</h1></div>
                    <div className="flex bg-slate-100 p-1 rounded-xl border gap-1 mb-0.5">
                        <button onClick={() => setGroupBy('ORDER')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${groupBy === 'ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>주문서별</button>
                        <button onClick={() => setGroupBy('DELIVERY')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${groupBy === 'DELIVERY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>납기기준별</button>
                    </div>
                </div>
                <div className="flex bg-white p-1 rounded-2xl border shadow-sm gap-1">
                    {[ { id: 'SPLIT', icon: List, label: '리스트' }, { id: 'KANBAN', icon: LayoutGrid, label: '칸반' }, { id: 'GANTT', icon: BarChart2, label: '간트' }, { id: 'CALENDAR', icon: Calendar, label: '캘린더' } ].map(tab => (
                        <button key={tab.id} onClick={() => setViewMode(tab.id)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black transition-all ${viewMode === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}><tab.icon size={14}/> {tab.label}</button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4 shrink-0">
                {[ { l: '계획 대기', v: stats.waiting, c: 'text-indigo-600', b: 'bg-indigo-50', i: Clock }, { l: '생산 중', v: stats.inProd, c: 'text-orange-600', b: 'bg-orange-50', i: Factory }, { l: '납기 지연', v: stats.delayed, c: 'text-rose-600', b: 'bg-rose-50', i: AlertTriangle }, { l: 'QA 대기', v: stats.qaWaiting, c: 'text-purple-600', b: 'bg-purple-50', i: TrendingUp } ].map((s, idx) => (
                    <div key={idx} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${s.b}`}><s.i size={18} className={s.c}/></div>
                        <div><p className="text-[9px] font-black text-slate-400 mb-0.5 uppercase">{s.l}</p><p className={`text-xl font-black ${s.c}`}>{s.v}</p></div>
                    </div>
                ))}
            </div>

            {loading ? <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"/></div> : 
                viewMode === 'SPLIT' ? (
                    <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
                        <div className="bg-white rounded-2xl border flex flex-col overflow-hidden"><div className="px-5 py-3 border-b bg-indigo-50/30 shrink-0"><h2 className="text-xs font-black text-indigo-700">계획 대기 ({waitingPRs.length})</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">{waitingPRs.map(pr => <KanbanCard key={pr.displayID || pr.id} pr={pr} onClick={setSelectedPR}/>)}</div></div>
                        <div className="bg-white rounded-2xl border flex flex-col overflow-hidden"><div className="px-5 py-3 border-b bg-orange-50/30 shrink-0"><h2 className="text-xs font-black text-orange-700">생산 진행 중 ({activePRs.length})</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">{activePRs.map(pr => <KanbanCard key={pr.displayID || pr.id} pr={pr} onClick={setSelectedPR}/>)}</div></div>
                    </div>
                ) : viewMode === 'KANBAN' ? (
                    <div className="flex-1 flex gap-4 min-h-0 overflow-x-auto pb-4 custom-scrollbar">
                        {KANBAN_COLUMNS.map(col => <div key={col.key} className={`flex-shrink-0 w-60 rounded-2xl border-2 ${col.color} flex flex-col min-h-0 shadow-sm`}>
                            <div className={`px-4 py-3 rounded-t-xl ${col.headColor} flex justify-between items-center`}><span className="text-[10px] font-black uppercase tracking-wider">{col.label}</span><span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded-full">{processedData.filter(p => p.Status === col.key).length}</span></div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">{processedData.filter(p => p.Status === col.key).map(pr => <KanbanCard key={pr.displayID || pr.id} pr={pr} onClick={setSelectedPR}/>)}</div>
                        </div>)}
                    </div>
                ) : viewMode === 'GANTT' ? <div className="flex-1 min-h-0 bg-white rounded-2xl border p-4"><ProjectGanttChart projects={ganttData} stages={GANTT_STAGES} /></div> : <ProductionCalendar prs={processedData} onCardClick={setSelectedPR} />
            }

            {selectedPR && createPortal(
                <div className="relative z-[9999] text-left">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)}/>
                    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200">
                        <div className="bg-white px-5 py-4 border-b flex justify-between items-start shrink-0">
                            <div><div className="flex items-center gap-2 mb-1">{selectedPR.Urgent && <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-black animate-pulse">긴급</span>}<span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span></div><h2 className="text-lg font-black text-slate-900 leading-tight">{selectedPR.PRNumber}</h2><p className="text-xs font-bold text-slate-500 truncate">{selectedPR.PartName}</p></div>
                            <button onClick={() => setSelectedPR(null)} className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-lg transition-colors"><X size={18}/></button>
                        </div>
                        
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex border-b border-slate-200 bg-white shrink-0 px-2">
                                {[ { id: 'basic', label: '공정 제어', icon: ClipboardList }, { id: 'materials', label: '자재 현황', icon: Package }, { id: 'history', label: '활동 이력', icon: History } ].map(tab => (
                                    <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 text-[11px] font-black transition-all border-b-2 ${detailTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}><tab.icon size={13} /> {tab.label}</button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {detailTab === 'basic' && (
                                    <div className="space-y-3">
                                        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm space-y-2.5">
                                            <div className="flex justify-between items-center border-b border-slate-100 pb-2"><h3 className="text-[11px] font-black text-slate-800 flex items-center gap-1.5"><ClipboardList size={13} className="text-blue-500"/> 주문 정보 요약</h3></div>
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div className="col-span-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center"><span className="font-bold text-slate-400 uppercase tracking-tighter">고객사</span><span className="font-black text-indigo-700">{selectedPR.CustomerName || '미지정'}</span></div>
                                                <div className="px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center"><span className="font-bold text-slate-400 uppercase tracking-tighter">납기일</span><span className="font-black text-rose-600">{selectedPR.DueDate}</span></div>
                                                <div className="px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center"><span className="font-bold text-slate-400 uppercase tracking-tighter">등록일</span><span className="font-black text-slate-500">{selectedPR.CreatedAt?.toDate ? selectedPR.CreatedAt.toDate().toLocaleDateString() : '-'}</span></div>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm space-y-3">
                                            <h3 className="text-[11px] font-black text-slate-700 flex items-center gap-2 uppercase tracking-widest border-b border-slate-100 pb-2"><Calendar size={13} className="text-blue-500"/> 납기별 공정 제어</h3>
                                            {(selectedPR.Items && selectedPR.Items.length > 0 ? selectedPR.Items : [{ PartID: selectedPR.PartID, PartName: selectedPR.PartName, TargetQty: selectedPR.TargetQty, DueDate: selectedPR.DueDate, Status: selectedPR.Status }]).map((item, itemIdx) => {
                                                const schedules = (item.Schedules && item.Schedules.length > 0) ? item.Schedules : [{ date: item.DueDate || selectedPR.DueDate, qty: item.TargetQty || selectedPR.TargetQty, status: item.Status || selectedPR.Status }];
                                                return (
                                                    <div key={itemIdx} className="space-y-3 pb-2 border-b last:border-0">
                                                        <div className="px-1 flex justify-between items-end"><div><p className="text-[8px] font-black text-slate-400 leading-none mb-0.5 uppercase tracking-tighter">MODEL: {item.PartID}</p><p className="text-[10px] font-black text-slate-700 truncate">{item.PartName}</p></div><span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">총 {item.TargetQty} EA</span></div>
                                                        {schedules.map((sched, sIdx) => {
                                                            const currentStatus = sched.status || item.Status || selectedPR.Status || '';
                                                            const isLocked = currentStatus === 'QA_WAITING';
                                                            
                                                            // 로컬 선택 상태 관리를 위한 임시 키 (컴포넌트 내부에 상태를 두기엔 루프 안이라서 ref나 데이터 속성 활용 권장되나 여기선 즉시 반영 방식에서 '저장' 버튼 클릭 방식으로 로직만 분리)
                                                            return (
                                                                <div key={sIdx} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-3 shadow-inner">
                                                                    <div className="flex justify-between items-center gap-3">
                                                                        <div className="flex items-center gap-2 flex-1">
                                                                            <span className="text-[8px] font-black text-white bg-slate-800 px-1.5 py-0.5 rounded uppercase whitespace-nowrap">{sIdx + 1}차 납기</span>
                                                                            <div className="flex flex-1 gap-1">
                                                                                <select 
                                                                                    id={`select-${itemIdx}-${sIdx}`}
                                                                                    defaultValue={currentStatus} 
                                                                                    disabled={isLocked}
                                                                                    className={`flex-1 text-[10px] font-black p-1.5 rounded-lg border shadow-sm outline-none transition-all ${isLocked ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-300 focus:ring-1 focus:ring-indigo-500'}`}
                                                                                >
                                                                                    {!currentStatus && <option value="">알수없음</option>}
                                                                                    {currentStatus && !['PROD_PLANNING', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'SHIPPED'].includes(currentStatus) && (
                                                                                        <option value={currentStatus}>{PR_STATUS[currentStatus]?.label || currentStatus}</option>
                                                                                    )}
                                                                                    <option value="PROD_PLANNING">생산계획 저장</option>
                                                                                    <option value="IN_PRODUCTION">작업지시(생산중)</option>
                                                                                    <option value="PROD_COMPLETE">생산완료</option>
                                                                                    <option value="QA_WAITING">출하검사중</option>
                                                                                    <option value="SHIPPED">영업 이관(발송)</option>
                                                                                </select>
                                                                                {!isLocked && (
                                                                                    <button 
                                                                                        onClick={() => {
                                                                                            const nextVal = document.getElementById(`select-${itemIdx}-${sIdx}`).value;
                                                                                            if (!nextVal || nextVal === currentStatus) return;
                                                                                            if (nextVal === 'PROD_COMPLETE') {
                                                                                                setWoPR({...selectedPR, isSplit: true, itemIdx, scheduleIdx: sIdx, PartID: item.PartID, PartName: item.PartName, TargetQty: sched.qty, Status: currentStatus});
                                                                                                setIsWOModalOpen(true);
                                                                                            } else {
                                                                                                handleStatusChange(selectedPR.id, nextVal, '상태 변경 (저장)', itemIdx, sIdx);
                                                                                            }
                                                                                        }}
                                                                                        className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black hover:bg-indigo-700 shadow-sm"
                                                                                    >
                                                                                        저장
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-[9px] font-bold text-rose-500 whitespace-nowrap">{sched.date}</span>
                                                                    </div>
                                                                    <div className="flex items-end gap-2">
                                                                        <div className="grid grid-cols-2 gap-2 flex-1">
                                                                            <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                                                                                <label className="text-[7px] font-black text-slate-400 block mb-0.5 uppercase tracking-tighter">작업 시작</label>
                                                                                <input 
                                                                                    type="date" 
                                                                                    id={`start-${itemIdx}-${sIdx}`}
                                                                                    defaultValue={sched.startDate || ''} 
                                                                                    disabled={!sched._editing}
                                                                                    className={`w-full text-[10px] font-black outline-none bg-transparent ${!sched._editing ? 'text-slate-400' : 'text-slate-900'}`} 
                                                                                />
                                                                            </div>
                                                                            <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                                                                                <label className="text-[7px] font-black text-slate-400 block mb-0.5 uppercase tracking-tighter">작업 종료</label>
                                                                                <input 
                                                                                    type="date" 
                                                                                    id={`end-${itemIdx}-${sIdx}`}
                                                                                    defaultValue={sched.endDate || ''} 
                                                                                    disabled={!sched._editing}
                                                                                    className={`w-full text-[10px] font-black outline-none bg-transparent ${!sched._editing ? 'text-slate-400' : 'text-slate-900'}`} 
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <button 
                                                                            onClick={async () => {
                                                                                const startInput = document.getElementById(`start-${itemIdx}-${sIdx}`);
                                                                                const endInput = document.getElementById(`end-${itemIdx}-${sIdx}`);
                                                                                if (!sched._editing) {
                                                                                    const newItems = [...selectedPR.Items];
                                                                                    newItems[itemIdx].Schedules[sIdx]._editing = true;
                                                                                    setSelectedPR({...selectedPR, Items: newItems});
                                                                                } else {
                                                                                    const newStart = startInput.value;
                                                                                    const newEnd = endInput.value;
                                                                                    if (newStart === sched.startDate && newEnd === sched.endDate) {
                                                                                        const newItems = [...selectedPR.Items];
                                                                                        newItems[itemIdx].Schedules[sIdx]._editing = false;
                                                                                        setSelectedPR({...selectedPR, Items: newItems});
                                                                                        return;
                                                                                    }
                                                                                    const reason = window.prompt('일정 변경 사유를 입력하세요:');
                                                                                    if (!reason) return;
                                                                                    await handleUpdateScheduleItem(itemIdx, sIdx, { startDate: newStart, endDate: newEnd }, `일정 변경: ${newStart}~${newEnd} (${reason})`);
                                                                                }
                                                                            }}
                                                                            className={`px-3 py-2.5 rounded-lg text-[10px] font-black transition-all ${sched._editing ? 'bg-green-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                                                        >
                                                                            {sched._editing ? '저장' : '수정'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {detailTab === 'materials' && (
                                    <div className="bg-white rounded-[32px] p-5 border border-slate-200 flex flex-col h-[550px] shadow-sm text-left overflow-hidden">
                                        <div className="flex justify-between items-center mb-4 shrink-0"><h3 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-2"><Package size={16} className="text-amber-500"/> 실시간 자재 현황</h3><button onClick={() => fetchSelectedPRDetails(selectedPR)} className="p-1.5 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100"><RotateCcw size={14}/></button></div>
                                        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 no-scrollbar border-b shrink-0">{selectedPRBOM.map((group, idx) => (<button key={idx} onClick={() => setActiveScheduleTab(idx)} className={`px-3 py-1.5 rounded-xl text-left transition-all border-2 shrink-0 flex flex-col gap-0.5 min-w-[110px] ${activeScheduleTab === idx ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}><div className="flex items-center gap-1.5 overflow-hidden"><span className={`px-1 py-0.5 rounded text-[7px] font-black ${activeScheduleTab === idx ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{group.ScheduleIdx}차</span><span className="text-[9px] font-black truncate max-w-[80px]">{group.PartName}</span></div></button>))}</div>
                                        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">{selectedPRBOM.length > 0 && selectedPRBOM[activeScheduleTab] ? <div className="animate-in fade-in duration-300"><BOMCheckTree data={selectedPRBOM[activeScheduleTab].BOMTree} targetQty={selectedPRBOM[activeScheduleTab].SetQty} inventoryMap={Object.fromEntries(Object.entries(inventory).map(([id, onHand]) => [id.trim().toUpperCase(), onHand - (reservedMap[id.trim().toUpperCase()] || 0)]))} className="h-auto"/></div> : <div className="py-20 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">데이터 로드 중...</div>}</div>
                                    </div>
                                )}
                                {detailTab === 'history' && (
                                    <div className="bg-white rounded-[32px] p-5 border border-slate-200 shadow-sm min-h-[450px] text-left">
                                        <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 mb-5 uppercase tracking-tight"><History size={16} className="text-indigo-600"/> 생산 진행 이력</h3>
                                        <div className="space-y-1">{selectedPR.Logs && selectedPR.Logs.length > 0 ? selectedPR.Logs.map((log, lidx) => (<div key={lidx} className="relative pl-6 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0 flex flex-col group p-2"><div className="absolute left-[-9px] top-4 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div></div><div className="flex items-center justify-between mb-1"><span className="text-[9px] font-black text-indigo-600 px-1.5 py-0.5 bg-indigo-50 rounded border border-indigo-100 uppercase">{PR_STATUS[log.to]?.label || log.to}</span><span className="text-[8px] text-slate-300 font-bold tabular-nums">{new Date(log.timestamp).toLocaleString()}</span></div><p className="text-[11px] font-bold text-slate-700">{log.message}</p><p className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-tighter">BY: {log.user}</p></div>)) : <div className="py-20 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">이력이 없습니다.</div>}</div>
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
