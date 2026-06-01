import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Factory, AlertTriangle, CheckCircle2, Clock, X, ChevronRight, Zap, List, LayoutGrid, Package, AlertCircle, ShieldAlert, TrendingUp, RotateCcw, History, Calendar } from 'lucide-react';

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
    { key: 'PROD_WAITING',  label: '생산 대기',  color: 'border-indigo-300 bg-indigo-50', headColor: 'bg-indigo-500 text-white' },
    { key: 'WORK_ORDER',    label: '작업 지시',  color: 'border-fuchsia-300 bg-fuchsia-50', headColor: 'bg-fuchsia-500 text-white' },
    { key: 'IN_PRODUCTION', label: '생산 중',    color: 'border-orange-300 bg-orange-50', headColor: 'bg-orange-500 text-white' },
    { key: 'QA_WAITING',    label: 'QA 검사',    color: 'border-purple-300 bg-purple-50', headColor: 'bg-purple-500 text-white' },
    { key: 'SHIP_READY',    label: '출하 준비',  color: 'border-cyan-300 bg-cyan-50', headColor: 'bg-cyan-500 text-white' },
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

// ─────────────────────────────────────────────────────────────
// WO 상세 모달
// ─────────────────────────────────────────────────────────────
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
                Status: 'QA_WAITING',
                ActualQty: actualQty,
                DefectQty: defectQty,
                DefectReason: defectReason,
                CompletedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid,
                Logs: [{
                    from: pr.Status,
                    to: 'QA_WAITING',
                    message: `생산 완료 처리: 양품 ${actualQty} / 불량 ${defectQty} (${defectReason || '사유 없음'})`,
                    user: userProfile?.displayName || 'Unknown',
                    timestamp: new Date().toISOString()
                }, ...(pr.Logs || [])]
            });

            const receivingRef = doc(collection(db, 'receiving'));
            batch.set(receivingRef, {
                PR_ID: pr.id, PRNumber: pr.PRNumber, PartID: pr.PartID, PartName: pr.PartName,
                Qty: actualQty, DefectQty: defectQty, Status: 'WAITING_INSPECTION', Type: 'SHIPPING',
                CustomerName: pr.CustomerName, ReceivedAt: serverTimestamp(), ReceivedBy: userProfile?.uid, SourceType: 'PRODUCTION'
            });

            for (const bom of bomItems) {
                const deductQty = (bom.Quantity || 1) * actualQty;
                const invData = inventory[bom.ChildID];
                if (invData?.ref) {
                    batch.update(invData.ref, { OnHand: (invData.onHand || 0) - deductQty, UpdatedAt: serverTimestamp() });
                }
                const txRef = doc(collection(db, 'transactions'));
                batch.set(txRef, {
                    PartID: bom.ChildID, Type: 'Out', Quantity: deductQty, Date: serverTimestamp(),
                    RefDoc: pr.PRNumber, Reason: '생산 완료 원자재 역산 차감', CreatedBy: userProfile?.uid || 'System'
                });
            }

            await batch.commit();
            alert('생산 완료 처리 및 QA 이관 완료!');
            onRefresh();
            onClose();
        } catch (err) {
            console.error(err);
            alert('처리 중 오류 발생');
        } finally {
            setLoading(false);
        }
    };

    if (!pr) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Factory className="text-orange-500"/> 생산 완료 보고</h2>
                        <p className="text-xs font-bold text-slate-400 mt-1">{pr.PRNumber} | {pr.PartName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">실제 생산 수량 (Actual Qty)</label>
                                <input type="number" value={actualQty} onChange={e => setActualQty(parseInt(e.target.value) || 0)} className="w-full bg-white border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">불량 수량 (Defect Qty)</label>
                                <input type="number" value={defectQty} onChange={e => setDefectQty(parseInt(e.target.value) || 0)} className="w-full bg-white border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" />
                            </div>
                        </div>
                        {defectQty > 0 && (
                            <div className="mt-4">
                                <label className="text-xs font-bold text-slate-500 mb-1 block">불량 사유</label>
                                <input type="text" value={defectReason} onChange={e => setDefectReason(e.target.value)} placeholder="불량 원인을 입력하세요..." className="w-full bg-white border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400 shadow-sm" />
                            </div>
                        )}
                    </div>
                    {bomItems.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-slate-700 flex items-center gap-2 ml-1"><Package size={14} className="text-slate-400"/> 자재 자동차감 현황</h3>
                            <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {bomItems.map((b, i) => {
                                    const req = (b.Quantity || 1) * actualQty;
                                    const onHand = inventory[b.ChildID]?.onHand || 0;
                                    const ok = onHand >= req;
                                    return (
                                        <div key={i} className={`flex justify-between items-center p-3 rounded-xl border ${ok ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-100'}`}>
                                            <span className="text-xs font-mono font-black text-slate-700">{b.ChildID}</span>
                                            <div className="flex gap-4 text-[11px] font-bold">
                                                <span className={ok ? 'text-slate-500' : 'text-rose-600'}>재고: {onHand}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-blue-600">차감: {req}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl text-sm font-black bg-slate-100 text-slate-600 hover:bg-slate-200">취소</button>
                        <button onClick={handleComplete} disabled={loading} className="flex-[2] py-3.5 rounded-2xl text-sm font-black bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-100 disabled:opacity-50">
                            {loading ? '처리 중...' : '생산 완료 보고 및 QA 이관'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function KanbanCard({ pr, onClick }) {
    const delayed = isDelayed(pr.DueDate);
    return (
        <div onClick={() => onClick(pr)} className={`bg-white rounded-xl p-3 border shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 ${delayed ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-mono font-black text-slate-500">{pr.PRNumber}</span>
                {pr.Urgent && <AlertCircle size={11} className="text-rose-500 animate-pulse"/>}
            </div>
            <p className="text-sm font-black text-slate-800 mb-1 leading-tight">{pr.PartName}</p>
            <p className="text-[11px] font-bold text-slate-500 mb-2">{pr.CustomerName}</p>
            <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                <span className="text-[11px] font-black text-slate-600">{pr.TargetQty} EA</span>
                <span className={`text-[10px] font-black ${delayed ? 'text-rose-600' : 'text-slate-400'}`}>{pr.DueDate}</span>
            </div>
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
    const [transitionNote, setTransitionNote] = useState('');
    const [scheduleForm, setScheduleForm] = useState({ startDate: '', endDate: '' });

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) setScheduleForm({ startDate: selectedPR.ProdStartDate || '', endDate: selectedPR.ProdEndDate || '' }); }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setPrs(all.filter(pr => EXECUTION_STATUSES.includes(pr.Status)));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (prId, nextStatus, logMessage = '', reason = '') => {
        const pr = prs.find(p => p.id === prId) || selectedPR;
        const currentStep = PR_STATUS[pr.Status]?.step || 0;
        const nextStep = PR_STATUS[nextStatus]?.step || 0;

        if (nextStep < currentStep && !reason) {
            const userReason = window.prompt('이전 단계로 되돌리는 사유를 입력해주세요:');
            if (!userReason) return;
            reason = userReason;
        }

        if (!logMessage && !reason) {
            if (!window.confirm(`상태를 '${PR_STATUS[nextStatus]?.label}'(으)로 변경하시겠습니까?`)) return;
        }

        const logEntry = {
            from: pr.Status, to: nextStatus,
            message: logMessage || (nextStep < currentStep ? `단계 복구: ${reason}` : '상태 변경'),
            user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, 'production_requests', prId), { Status: nextStatus, UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(pr.Logs || [])] });
            setTransitionNote('');
            await fetchPRs();
            setSelectedPR(null);
        } catch (err) {
            console.error(err);
            alert('상태 변경 실패');
        }
    };

    const handleUpdateSchedule = async () => {
        if (!selectedPR) return;
        try {
            await updateDoc(doc(db, 'production_requests', selectedPR.id), {
                ProdStartDate: scheduleForm.startDate, ProdEndDate: scheduleForm.endDate, UpdatedAt: serverTimestamp(),
                Logs: [{ from: selectedPR.Status, to: selectedPR.Status, message: `생산 일정 수정: ${scheduleForm.startDate} ~ ${scheduleForm.endDate}`, user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString() }, ...(selectedPR.Logs || [])]
            });
            alert('일정 수정 완료');
            await fetchPRs();
            setSelectedPR(null);
        } catch (err) {
            console.error(err);
            alert('일정 수정 실패');
        }
    };

    const handleCardClick = (pr) => setSelectedPR(pr);

    const stats = useMemo(() => {
        const inProd = prs.filter(p => p.Status === 'IN_PRODUCTION').length;
        const delayed = prs.filter(p => isDelayed(p.DueDate) && !['SHIPPED'].includes(p.Status)).length;
        const waiting = prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status)).length;
        const qaWaiting = prs.filter(p => p.Status === 'QA_WAITING').length;
        return { inProd, delayed, waiting, qaWaiting };
    }, [prs]);

    const waitingPRs = prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status));
    const activePRs = prs.filter(p => ['WORK_ORDER', 'IN_PRODUCTION'].includes(p.Status));

    return (
        <div className="h-full flex flex-col space-y-5">
            <div className="flex justify-between items-end">
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 계획 관리</h1><p className="text-sm font-bold text-slate-500 mt-1.5">현장 생산 실행, 작업 지시 및 완료 처리</p></div>
                <div className="flex gap-2">
                    <button onClick={() => setViewMode('SPLIT')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${viewMode === 'SPLIT' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}><List size={15}/> 스플릿 뷰</button>
                    <button onClick={() => setViewMode('KANBAN')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${viewMode === 'KANBAN' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}><LayoutGrid size={15}/> 칸반 보드</button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4 shrink-0">
                {[ { l: '계획 대기', v: stats.waiting, c: 'text-indigo-600', b: 'bg-indigo-50', i: Clock }, { l: '생산 진행 중', v: stats.inProd, c: 'text-orange-600', b: 'bg-orange-50', i: Factory }, { l: '납기 지연', v: stats.delayed, c: 'text-rose-600', b: 'bg-rose-50', i: AlertTriangle }, { l: 'QA 검사 대기', v: stats.qaWaiting, c: 'text-purple-600', b: 'bg-purple-50', i: TrendingUp } ].map((s, idx) => (
                    <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${s.c.replace('text-', 'text-')} ${s.b}`}><s.i size={22}/></div>
                        <div><p className="text-[10px] font-black text-slate-400 mb-0.5">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>{s.v}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p></div>
                    </div>
                ))}
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"/></div>
            ) : viewMode === 'SPLIT' ? (
                <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 bg-indigo-50/50 shrink-0"><h2 className="text-sm font-black text-indigo-700 flex items-center gap-2"><Clock size={16}/> 계획 대기 중 ({waitingPRs.length}건)</h2></div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {waitingPRs.map(pr => <div key={pr.id} onClick={() => handleCardClick(pr)} className={`bg-white rounded-xl p-4 border cursor-pointer hover:shadow-md transition-all ${isDelayed(pr.DueDate) ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-200 hover:border-indigo-200'}`}>
                                <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-mono text-slate-400">{pr.PRNumber}</span><span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color}`}>{PR_STATUS[pr.Status]?.label}</span></div>
                                <p className="text-sm font-black text-slate-800">{pr.PartName}</p><p className="text-xs font-bold text-slate-500">{pr.CustomerName}</p>
                            </div>)}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 bg-orange-50/50 shrink-0"><h2 className="text-sm font-black text-orange-700 flex items-center gap-2"><Factory size={16}/> 생산 진행 중 ({activePRs.length}건)</h2></div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {activePRs.map(pr => <div key={pr.id} onClick={() => handleCardClick(pr)} className={`bg-white rounded-xl p-4 border cursor-pointer hover:shadow-md transition-all ${isDelayed(pr.DueDate) ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-200 hover:border-orange-200'}`}>
                                <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-mono text-slate-400">{pr.PRNumber}</span><span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color}`}>{PR_STATUS[pr.Status]?.label}</span></div>
                                <p className="text-sm font-black text-slate-800">{pr.PartName}</p><p className="text-xs font-bold text-slate-500">{pr.CustomerName}</p>
                            </div>)}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex gap-4 min-h-0 overflow-x-auto pb-2">
                    {KANBAN_COLUMNS.map(col => <div key={col.key} className={`flex-shrink-0 w-64 rounded-2xl border-2 ${col.color} flex flex-col min-h-0`}>
                        <div className={`px-4 py-3 rounded-t-xl ${col.headColor} flex justify-between items-center shrink-0`}><span className="text-xs font-black">{col.label}</span><span className="text-xs font-bold bg-white/30 px-2 py-0.5 rounded-full">{prs.filter(p => p.Status === col.key).length}</span></div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">{prs.filter(p => p.Status === col.key).map(pr => <KanbanCard key={pr.id} pr={pr} onClick={handleCardClick}/>)}</div>
                    </div>)}
                </div>
            )}

            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)}/>
                    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded text-xs font-bold animate-pulse">긴급</span>}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2>
                                <p className="text-sm font-bold text-slate-50">{selectedPR.PartName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-left">
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
                                {NEXT_STATUS_MAP[selectedPR.Status] && selectedPR.Status !== 'IN_PRODUCTION' && (
                                    <button onClick={() => handleStatusChange(selectedPR.id, NEXT_STATUS_MAP[selectedPR.Status].next, transitionNote)} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2"><Zap size={14}/> {NEXT_STATUS_MAP[selectedPR.Status].label}</button>
                                )}
                                {selectedPR.Status === 'IN_PRODUCTION' && (
                                    <button onClick={() => { setWoPR(selectedPR); setIsWOModalOpen(true); }} className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2"><Factory size={14}/> 생산 완료 보고</button>
                                )}
                                {PR_STATUS[selectedPR.Status]?.step > 3 && (
                                    <button onClick={() => { const steps = Object.entries(PR_STATUS).sort((a,b) => a[1].step - b[1].step); const idx = steps.findIndex(s => s[0] === selectedPR.Status); if (idx > 0) handleStatusChange(selectedPR.id, steps[idx - 1][0]); }} className="w-full py-2.5 bg-white border border-rose-200 text-rose-500 rounded-xl text-xs font-black flex items-center justify-center gap-2"><RotateCcw size={14}/> 이전 단계로 되돌리기</button>
                                )}
                            </div>
                            {selectedPR.Logs && selectedPR.Logs.length > 0 && (
                                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><History size={14}/> 히스토리</h3>
                                    <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar">{selectedPR.Logs.map((log, lidx) => (
                                        <div key={lidx} className="border-l-2 border-slate-100 pl-3 py-1">
                                            <div className="flex justify-between items-center"><span className="text-[10px] font-black text-blue-600">{PR_STATUS[log.to]?.label}</span><span className="text-[9px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span></div>
                                            <p className="text-[11px] font-bold text-slate-700">{log.message}</p>
                                        </div>
                                    ))}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {isWOModalOpen && woPR && <WODetailModal pr={woPR} onClose={() => { setIsWOModalOpen(false); setWoPR(null); }} onRefresh={() => { fetchPRs(); setSelectedPR(null); }}/>}
        </div>
    );
}
