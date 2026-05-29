import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Factory, AlertTriangle, CheckCircle2, Clock, X, ChevronRight, Zap, List, LayoutGrid, Package, AlertCircle, ShieldAlert, TrendingUp } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// 상태 정의 (생산 실행 관련)
// ─────────────────────────────────────────────────────────────
const PR_STATUS = {
    DRAFT:         { label: '임시저장',   color: 'bg-slate-100 text-slate-500 border-slate-200' },
    REVIEW:        { label: '생산검토',   color: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
    CONFIRMED:     { label: '의뢰확정',   color: 'bg-blue-50 text-blue-600 border-blue-200' },
    PROD_WAITING:  { label: '생산대기',   color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    PROD_PLANNING: { label: '생산계획',   color: 'bg-violet-50 text-violet-600 border-violet-200' },
    WORK_ORDER:    { label: '작업지시',   color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200' },
    IN_PRODUCTION: { label: '생산중',     color: 'bg-orange-50 text-orange-600 border-orange-200' },
    PROD_COMPLETE: { label: '생산완료',   color: 'bg-teal-50 text-teal-600 border-teal-200' },
    QA_WAITING:    { label: 'QA검사대기', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    QA_COMPLETE:   { label: 'QA검사완료', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    SHIP_READY:    { label: '출하준비',   color: 'bg-cyan-50 text-cyan-600 border-cyan-200' },
    SHIPPED:       { label: '출하완료',   color: 'bg-green-50 text-green-600 border-green-200' },
};

const EXECUTION_STATUSES = ['PROD_WAITING', 'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'];

// 칸반 컬럼 정의
const KANBAN_COLUMNS = [
    { key: 'PROD_WAITING',  label: '생산 대기',  color: 'border-indigo-300 bg-indigo-50', headColor: 'bg-indigo-500 text-white' },
    { key: 'WORK_ORDER',    label: '작업 지시',  color: 'border-fuchsia-300 bg-fuchsia-50', headColor: 'bg-fuchsia-500 text-white' },
    { key: 'IN_PRODUCTION', label: '생산 중',    color: 'border-orange-300 bg-orange-50', headColor: 'bg-orange-500 text-white' },
    { key: 'QA_WAITING',    label: 'QA 검사',    color: 'border-purple-300 bg-purple-50', headColor: 'bg-purple-500 text-white' },
    { key: 'SHIP_READY',    label: '출하 준비',  color: 'border-cyan-300 bg-cyan-50', headColor: 'bg-cyan-500 text-white' },
];

// 상태 전이 가능 목록
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
// WO 상세 모달 (생산 완료 처리 + 재고 자동차감)
// ─────────────────────────────────────────────────────────────
function WODetailModal({ pr, onClose, onRefresh }) {
    const { userProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [actualQty, setActualQty] = useState(pr?.TargetQty || 0);
    const [defectQty, setDefectQty] = useState(0);
    const [defectReason, setDefectReason] = useState('');
    const [shortageCheck, setShortageCheck] = useState(null); // null | []
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

            // 즉시 부족 체크
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

            // 1. PR 상태 업데이트
            batch.update(doc(db, 'production_requests', pr.id), {
                Status: 'QA_WAITING',
                ActualQty: actualQty,
                DefectQty: defectQty,
                DefectReason: defectReason,
                CompletedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });

            // 2. QA 검사 자동 이관 (receiving 컬렉션)
            const receivingRef = doc(collection(db, 'receiving'));
            batch.set(receivingRef, {
                PR_ID: pr.id,
                PRNumber: pr.PRNumber,
                PartID: pr.PartID,
                PartName: pr.PartName,
                Qty: actualQty,
                DefectQty: defectQty,
                Status: 'WAITING_INSPECTION',
                Type: 'SHIPPING',
                CustomerName: pr.CustomerName,
                ReceivedAt: serverTimestamp(),
                ReceivedBy: userProfile?.uid,
                SourceType: 'PRODUCTION'
            });

            // 3. BOM 기반 재고 자동차감 (Backflushing)
            for (const bom of bomItems) {
                const deductQty = (bom.Quantity || 1) * actualQty;
                const invData = inventory[bom.ChildID];
                if (invData?.ref) {
                    batch.update(invData.ref, {
                        OnHand: (invData.onHand || 0) - deductQty,
                        UpdatedAt: serverTimestamp()
                    });
                }
                const txRef = doc(collection(db, 'transactions'));
                batch.set(txRef, {
                    PartID: bom.ChildID,
                    Type: 'Out',
                    Quantity: deductQty,
                    Date: serverTimestamp(),
                    RefDoc: pr.PRNumber,
                    Reason: '생산 완료 원자재 역산 차감',
                    CreatedBy: userProfile?.uid || 'System'
                });
            }

            await batch.commit();
            alert('생산 완료 처리 및 QA 이관, 재고 차감이 완료되었습니다!');
            onRefresh();
            onClose();
        } catch (err) {
            console.error(err);
            alert('처리 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!pr) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b bg-gradient-to-r from-orange-500 to-orange-600 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <Factory size={22}/>
                        <div>
                            <h2 className="text-lg font-black">생산 완료 처리 (Work Order Completion)</h2>
                            <p className="text-orange-200 text-xs mt-0.5">{pr.PRNumber} | {pr.PartName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl"><X size={18}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* 자재 부족 경고 */}
                    {shortageCheck && shortageCheck.some(s => !s.ok) && (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-rose-700 mb-3">
                                <ShieldAlert size={18}/>
                                <p className="text-sm font-black">🚨 재고 부족 경고! 완료 처리 전 확인 필요</p>
                            </div>
                            <div className="space-y-2">
                                {shortageCheck.filter(s => !s.ok).map((s, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white rounded-xl px-3 py-2 border border-rose-100">
                                        <span className="text-xs font-mono font-bold text-rose-700">{s.partID}</span>
                                        <div className="flex gap-3 text-xs font-bold">
                                            <span className="text-slate-500">현재: {s.onHand}</span>
                                            <span className="text-slate-500">필요: {s.req}</span>
                                            <span className="bg-rose-600 text-white px-2 py-0.5 rounded-full">부족: {s.shortage}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 생산 실적 입력 */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200">
                        <h3 className="text-xs font-black text-slate-700 mb-3">생산 실적 입력</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">실제 완료 수량 (Actual Qty)</label>
                                <input
                                    type="number" min="0" max={pr.TargetQty}
                                    value={actualQty}
                                    onChange={e => setActualQty(parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">목표 수량: {pr.TargetQty} EA</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">불량 수량 (Defect Qty)</label>
                                <input
                                    type="number" min="0"
                                    value={defectQty}
                                    onChange={e => setDefectQty(parseInt(e.target.value) || 0)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400"
                                />
                            </div>
                        </div>
                        {defectQty > 0 && (
                            <div className="mt-3">
                                <label className="text-xs font-bold text-slate-500 mb-1 block">불량 사유 (Defect Reason)</label>
                                <input
                                    type="text" value={defectReason}
                                    onChange={e => setDefectReason(e.target.value)}
                                    placeholder="불량 원인을 입력하세요..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400"
                                />
                            </div>
                        )}
                    </div>

                    {/* BOM 자재 차감 예정 목록 */}
                    {bomItems.length > 0 && (
                        <div className="bg-white rounded-2xl p-4 border border-slate-200">
                            <h3 className="text-xs font-black text-slate-700 mb-3 flex items-center gap-2"><Package size={14} className="text-slate-500"/> 완료 시 자동 차감 예정 원자재 (BOM 역산)</h3>
                            <div className="space-y-2">
                                {bomItems.map((b, i) => {
                                    const req = (b.Quantity || 1) * actualQty;
                                    const onHand = inventory[b.ChildID]?.onHand || 0;
                                    const ok = onHand >= req;
                                    return (
                                        <div key={i} className={`flex justify-between items-center rounded-xl px-3 py-2 ${ok ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}>
                                            <span className="text-xs font-mono font-bold text-slate-700">{b.ChildID}</span>
                                            <div className="flex gap-3 text-xs font-bold">
                                                <span className={ok ? 'text-emerald-600' : 'text-rose-600'}>현재고: {onHand}</span>
                                                <span className="text-slate-600">→ 차감: {req}</span>
                                                <span className={ok ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}>잔여: {onHand - req}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {bomItems.length === 0 && <p className="text-xs text-slate-400 text-center py-2">BOM 정보가 없습니다.</p>}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200">취소</button>
                    <button
                        onClick={handleComplete}
                        disabled={loading || actualQty <= 0}
                        className="px-5 py-2 rounded-xl text-xs font-black text-white bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-200 disabled:opacity-50"
                    >
                        {loading ? '처리 중...' : '생산 완료 확정 → QA 이관'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 칸반 카드
// ─────────────────────────────────────────────────────────────
function KanbanCard({ pr, onClick }) {
    const delayed = isDelayed(pr.DueDate);
    return (
        <div
            onClick={() => onClick(pr)}
            className={`bg-white rounded-xl p-3 border shadow-sm cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 ${delayed ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-mono font-black text-slate-500">{pr.PRNumber}</span>
                <div className="flex items-center gap-1">
                    {pr.Urgent && <AlertCircle size={11} className="text-rose-500 animate-pulse"/>}
                    {delayed && <AlertTriangle size={11} className="text-rose-500"/>}
                </div>
            </div>
            <p className="text-sm font-black text-slate-800 mb-1 leading-tight">{pr.PartName}</p>
            <p className="text-xs font-bold text-slate-500 mb-2">{pr.CustomerName}</p>
            <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600">{pr.TargetQty} EA</span>
                <span className={`text-[10px] font-bold ${delayed ? 'text-rose-600' : 'text-slate-400'}`}>{pr.DueDate}</span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 메인 생산 실행 페이지
// ─────────────────────────────────────────────────────────────
export default function ProductionExecutionPage() {
    const { userProfile } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('SPLIT'); // SPLIT | KANBAN
    const [selectedPR, setSelectedPR] = useState(null);
    const [isWOModalOpen, setIsWOModalOpen] = useState(false);
    const [woPR, setWoPR] = useState(null);

    useEffect(() => { fetchPRs(); }, []);

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

    const stats = useMemo(() => {
        const inProd = prs.filter(p => p.Status === 'IN_PRODUCTION').length;
        const delayed = prs.filter(p => isDelayed(p.DueDate) && !['SHIPPED'].includes(p.Status)).length;
        const waiting = prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status)).length;
        const qaWaiting = prs.filter(p => p.Status === 'QA_WAITING').length;
        return { inProd, delayed, waiting, qaWaiting };
    }, [prs]);

    const waitingPRs = prs.filter(p => ['PROD_WAITING', 'PROD_PLANNING'].includes(p.Status));
    const activePRs = prs.filter(p => ['WORK_ORDER', 'IN_PRODUCTION'].includes(p.Status));

    const handleStatusChange = async (prId, nextStatus) => {
        if (!window.confirm(`상태를 '${PR_STATUS[nextStatus]?.label}'(으)로 변경하시겠습니까?`)) return;
        await updateDoc(doc(db, 'production_requests', prId), { Status: nextStatus, UpdatedAt: serverTimestamp() });
        await fetchPRs();
        setSelectedPR(null);
    };

    const handleCardClick = (pr) => setSelectedPR(pr);

    return (
        <div className="h-full flex flex-col space-y-5">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 계획 관리</h1>
                    <p className="text-sm font-bold text-slate-500 mt-1.5">현장 생산 실행, 작업 지시 및 완료 처리</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('SPLIT')}
                        className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-colors ${viewMode === 'SPLIT' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <List size={15}/> 스플릿 뷰
                    </button>
                    <button
                        onClick={() => setViewMode('KANBAN')}
                        className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-colors ${viewMode === 'KANBAN' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <LayoutGrid size={15}/> 칸반 보드
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-500 border border-indigo-100"><Clock size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">계획 대기</p>
                        <p className="text-2xl font-black text-indigo-600">{stats.waiting}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-orange-50 rounded-xl text-orange-500 border border-orange-100"><Factory size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">생산 진행 중</p>
                        <p className="text-2xl font-black text-orange-600">{stats.inProd}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-rose-50 rounded-xl text-rose-500 border border-rose-100"><AlertTriangle size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">납기 지연</p>
                        <p className="text-2xl font-black text-rose-600">{stats.delayed}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-purple-50 rounded-xl text-purple-500 border border-purple-100"><TrendingUp size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">QA 검사 대기</p>
                        <p className="text-2xl font-black text-purple-600">{stats.qaWaiting}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"/>
                </div>
            ) : viewMode === 'SPLIT' ? (
                /* ─── 스플릿 뷰 ─── */
                <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
                    {/* 좌: 계획 대기 */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 bg-indigo-50/50 shrink-0">
                            <h2 className="text-sm font-black text-indigo-700 flex items-center gap-2"><Clock size={16}/> 계획 대기 중 ({waitingPRs.length}건)</h2>
                            <p className="text-xs text-indigo-500 font-medium mt-0.5">작업 지시 전 검토 및 계획 수립 단계</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {waitingPRs.length === 0 && <p className="text-xs text-slate-400 text-center py-8">계획 대기 중인 의뢰가 없습니다.</p>}
                            {waitingPRs.map(pr => (
                                <div
                                    key={pr.id}
                                    onClick={() => handleCardClick(pr)}
                                    className={`bg-white rounded-xl p-4 border cursor-pointer hover:shadow-md transition-all ${isDelayed(pr.DueDate) ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-200 hover:border-indigo-200'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-mono text-slate-400">{pr.PRNumber}</span>
                                        <div className="flex items-center gap-1">
                                            {pr.Urgent && <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-bold animate-pulse">긴급</span>}
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color}`}>{PR_STATUS[pr.Status]?.label}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-slate-800">{pr.PartName}</p>
                                    <p className="text-xs font-bold text-slate-500 mt-0.5">{pr.CustomerName}</p>
                                    <div className="flex justify-between items-center mt-3">
                                        <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded-lg">{pr.TargetQty} EA</span>
                                        <span className={`text-xs font-bold flex items-center gap-1 ${isDelayed(pr.DueDate) ? 'text-rose-600' : 'text-slate-500'}`}>
                                            {isDelayed(pr.DueDate) && <AlertTriangle size={11}/>}
                                            납기: {pr.DueDate}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 우: 생산 진행 중 */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 bg-orange-50/50 shrink-0">
                            <h2 className="text-sm font-black text-orange-700 flex items-center gap-2"><Factory size={16}/> 생산 진행 중 ({activePRs.length}건)</h2>
                            <p className="text-xs text-orange-500 font-medium mt-0.5">작업 지시 발행 후 현장 생산 단계</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {activePRs.length === 0 && <p className="text-xs text-slate-400 text-center py-8">현재 생산 진행 중인 작업이 없습니다.</p>}
                            {activePRs.map(pr => {
                                const delayed = isDelayed(pr.DueDate);
                                const progress = pr.ActualQty ? Math.min(100, Math.round((pr.ActualQty / pr.TargetQty) * 100)) : 0;
                                return (
                                    <div
                                        key={pr.id}
                                        onClick={() => handleCardClick(pr)}
                                        className={`bg-white rounded-xl p-4 border cursor-pointer hover:shadow-md transition-all ${delayed ? 'border-rose-300 ring-1 ring-rose-100' : 'border-slate-200 hover:border-orange-200'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-mono text-slate-400">{pr.PRNumber}</span>
                                            <div className="flex items-center gap-1">
                                                {delayed && <span className="text-[9px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded animate-pulse">납기지연</span>}
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color}`}>{PR_STATUS[pr.Status]?.label}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm font-black text-slate-800">{pr.PartName}</p>
                                        <p className="text-xs font-bold text-slate-500 mt-0.5">{pr.CustomerName}</p>
                                        <div className="mt-3">
                                            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                                <span>진행률</span>
                                                <span>{pr.ActualQty || 0} / {pr.TargetQty} EA</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2">
                                                <div className={`h-2 rounded-full transition-all ${delayed ? 'bg-rose-500' : 'bg-orange-500'}`} style={{ width: `${progress}%` }}/>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                /* ─── 칸반 보드 뷰 ─── */
                <div className="flex-1 flex gap-4 min-h-0 overflow-x-auto pb-2">
                    {KANBAN_COLUMNS.map(col => {
                        const colPrs = prs.filter(p => p.Status === col.key);
                        return (
                            <div key={col.key} className={`flex-shrink-0 w-64 rounded-2xl border-2 ${col.color} flex flex-col min-h-0`}>
                                <div className={`px-4 py-3 rounded-t-xl ${col.headColor} flex justify-between items-center shrink-0`}>
                                    <span className="text-xs font-black">{col.label}</span>
                                    <span className="text-xs font-bold bg-white/30 px-2 py-0.5 rounded-full">{colPrs.length}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                    {colPrs.length === 0 && (
                                        <div className="text-center py-6 text-xs text-slate-400 font-medium">없음</div>
                                    )}
                                    {colPrs.map(pr => (
                                        <KanbanCard key={pr.id} pr={pr} onClick={handleCardClick}/>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 상세 슬라이드 패널 */}
            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)}/>
                    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded text-xs font-bold animate-pulse">긴급</span>}
                                    {isDelayed(selectedPR.DueDate) && <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded text-xs font-bold">납기지연</span>}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2>
                                <p className="text-sm font-bold text-slate-500">{selectedPR.PartName} | {selectedPR.CustomerName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                                <div><p className="font-bold text-slate-400 mb-0.5">Part ID</p><p className="font-mono font-black text-emerald-600">{selectedPR.PartID}</p></div>
                                <div><p className="font-bold text-slate-400 mb-0.5">목표 수량</p><p className="font-black text-slate-800">{selectedPR.TargetQty} EA</p></div>
                                <div><p className="font-bold text-slate-400 mb-0.5">납기일</p><p className={`font-black ${isDelayed(selectedPR.DueDate) ? 'text-rose-600' : 'text-slate-800'}`}>{selectedPR.DueDate}</p></div>
                                <div><p className="font-bold text-slate-400 mb-0.5">완료 수량</p><p className="font-black text-orange-600">{selectedPR.ActualQty || 0} EA</p></div>
                            </div>

                            {/* 상태 전이 액션 */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                <h3 className="text-xs font-black text-slate-700">다음 단계 처리</h3>
                                {NEXT_STATUS_MAP[selectedPR.Status] && selectedPR.Status !== 'IN_PRODUCTION' && (
                                    <button
                                        onClick={() => handleStatusChange(selectedPR.id, NEXT_STATUS_MAP[selectedPR.Status].next)}
                                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
                                    >
                                        <Zap size={14}/>
                                        {NEXT_STATUS_MAP[selectedPR.Status].label}
                                    </button>
                                )}
                                {selectedPR.Status === 'IN_PRODUCTION' && (
                                    <button
                                        onClick={() => { setWoPR(selectedPR); setIsWOModalOpen(true); }}
                                        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-md shadow-orange-200 flex items-center justify-center gap-2"
                                    >
                                        <Factory size={14}/> 생산 완료 처리 (재고차감 + QA이관)
                                    </button>
                                )}
                                {selectedPR.Status === 'QA_WAITING' && (
                                    <p className="text-xs text-purple-600 font-bold text-center bg-purple-50 p-3 rounded-xl border border-purple-100">QA 검사 페이지에서 합격/불합격 처리됩니다.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {isWOModalOpen && woPR && (
                <WODetailModal
                    pr={woPR}
                    onClose={() => { setIsWOModalOpen(false); setWoPR(null); }}
                    onRefresh={() => { fetchPRs(); setSelectedPR(null); }}
                />
            )}
        </div>
    );
}
