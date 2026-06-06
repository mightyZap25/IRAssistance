import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ClipboardList, Plus, X, AlertCircle, CheckCircle2, Clock, DollarSign,
    ChevronRight, Layers, Search, Package, Users, Calendar, TrendingUp, ShieldAlert, UserPlus, History, RotateCcw,
    Printer, Send
} from 'lucide-react';
import WorkOrderPrintModal from '../components/WorkOrderPrintModal';

// ─────────────────────────────────────────────────────────────
// 상태 및 상수 정의
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

const ACTIVE_STATUSES = ['DRAFT', 'REVIEW', 'CONFIRMED', 'PROD_WAITING', 'PROD_PLANNING', 'WORK_ORDER', 'IN_PRODUCTION', 'PROD_COMPLETE', 'QA_WAITING', 'QA_COMPLETE', 'SHIP_READY'];
const HISTORY_STATUSES = ['SHIPPED', 'ARCHIVED'];

const COLUMN_DEFS = {
    PRNumber:    { label: 'PR 번호',    default: true },
    PartName:    { label: '제품명',     default: true },
    CustomerName:{ label: '고객사',     default: true },
    TargetQty:   { label: '수량',       default: true },
    UnitPrice:   { label: '단가 (₩)',   default: true },
    TotalAmount: { label: '총 금액',    default: true },
    DueDate:     { label: '납기일',     default: true },
    Status:      { label: '상태',       default: true },
    CreatedAt:   { label: '등록일',     default: false },
};

const generatePRNumber = () => {
    const d = new Date();
    return `PR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
};

// ─────────────────────────────────────────────────────────────
// 신규 생산 의뢰 등록 모달
// ─────────────────────────────────────────────────────────────
function PRRegistrationModal({ isOpen, onClose, onSave }) {
    const [parts, setParts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [inventory, setInventory] = useState({});
    const [bomMap, setBomMap] = useState({});
    const [loading, setLoading] = useState(false);
    const [availabilityCheck, setAvailabilityCheck] = useState(null);
    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomerForm, setNewCustomerForm] = useState({ Name: '', Contact: '', Email: '' });
    const [addingCustomer, setAddingCustomer] = useState(false);
    const [selectedPartInfo, setSelectedPartInfo] = useState(null);
    const [availableVersions, setAvailableVersions] = useState([]);
    const [selectedMasterID, setSelectedMasterID] = useState('');

    const [form, setForm] = useState({
        PartDocID: '', PartName: '', PartID: '',
        bomId: '', bomVersion: '',
        CustomerID: '', CustomerName: '',
        TargetQty: 1, UnitPrice: 0, DueDate: '', Urgent: false, Remarks: ''
    });

    useEffect(() => {
        if (!isOpen) return;
        setForm({ 
            PartDocID: '', PartName: '', PartID: '', 
            bomId: '', bomVersion: '',
            CustomerID: '', CustomerName: '', 
            TargetQty: 1, UnitPrice: 0, DueDate: '', Urgent: false, Remarks: '' 
        });
        setAvailabilityCheck(null);
        setSelectedPartInfo(null);
        setAvailableVersions([]);
        setSelectedMasterID('');

        (async () => {
            const [pSnap, cSnap, invSnap, bomSnap] = await Promise.all([
                getDocs(query(collection(db, 'parts'), orderBy('Name', 'asc'))),
                getDocs(query(collection(db, 'customers'), orderBy('Name', 'asc'))),
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'bom')),
            ]);
            setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setCustomers(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            const inv = {};
            invSnap.docs.forEach(d => { inv[d.data().PartID] = d.data().OnHand || 0; });
            setInventory(inv);
            const bm = {};
            bomSnap.docs.forEach(d => {
                const data = d.data();
                if (!bm[data.ParentID]) bm[data.ParentID] = [];
                bm[data.ParentID].push(data);
            });
            setBomMap(bm);
        })();
    }, [isOpen]);

    const latestParts = useMemo(() =>
        parts.filter(p => p.IsLatestRevision !== false && (
            (p.Category && p.Category.includes('완제품')) || p.PartID?.startsWith('IRP')
        )),
    [parts]);

    const handlePartSelect = (partDocID) => {
        const part = parts.find(p => p.id === partDocID);
        if (!part) return;

        const masterID = part.MasterPartID || part.PartID.split('-').slice(0, -1).join('-');
        setSelectedMasterID(masterID);

        const versions = parts.filter(p => 
            (p.MasterPartID === masterID || p.PartID.startsWith(masterID + '-')) && 
            ((p.Category && p.Category.includes('완제품')) || p.PartID?.startsWith('IRP'))
        ).sort((a, b) => {
            const revA = a.Rev || '0';
            const revB = b.Rev || '0';
            return revB.localeCompare(revA, undefined, { numeric: true });
        });
        
        setAvailableVersions(versions);

        setForm(prev => ({ 
            ...prev, 
            PartDocID: partDocID, 
            PartName: part.Name || '', 
            PartID: part.PartID || '',
            bomId: part.PartID || '',
            bomVersion: part.Rev || ''
        }));
        setSelectedPartInfo(part);
        setAvailabilityCheck(null);
    };

    const handleVersionSelect = (partDocID) => {
        const part = parts.find(p => p.id === partDocID);
        if (!part) return;

        setForm(prev => ({ 
            ...prev, 
            PartDocID: partDocID, 
            PartID: part.PartID || '',
            bomId: part.PartID || '',
            bomVersion: part.Rev || ''
        }));
        setSelectedPartInfo(part);
        setAvailabilityCheck(null);
    };

    const checkAvailability = useCallback(() => {
        if (!form.PartID || form.TargetQty <= 0) return;
        const children = bomMap[form.PartID] || [];
        if (children.length === 0) {
            setAvailabilityCheck({ ok: true, shortages: [], message: 'BOM 자재 항목이 없습니다.' });
            return;
        }
        const shortages = [];
        children.forEach(child => {
            const req = (child.Quantity || 1) * form.TargetQty;
            const onHand = inventory[child.ChildID] || 0;
            if (onHand < req) {
                shortages.push({ partID: child.ChildID, req, onHand, shortage: req - onHand });
            }
        });
        setAvailabilityCheck({ ok: shortages.length === 0, shortages });
    }, [form.PartID, form.TargetQty, bomMap, inventory]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.PartDocID || !form.CustomerID || form.TargetQty <= 0) return alert('필수 항목을 모두 입력해주세요.');
        if (!form.DueDate) return alert('납기일을 입력해주세요.');
        setLoading(true);
        try {
            await onSave({ ...form, Status: 'CONFIRMED', TotalAmount: form.UnitPrice * form.TargetQty });
            onClose();
        } catch (err) {
            console.error(err);
            alert('생산 의뢰 등록 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 text-left">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-700 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <ClipboardList size={22} />
                        <div>
                            <h2 className="text-lg font-black tracking-tight">신규 생산 의뢰</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors"><X size={18}/></button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 text-left">
                        <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><Layers size={14} className="text-blue-500"/> 제품 정보</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">생산 대상 완제품</label>
                                <select
                                    value={latestParts.find(p => (p.MasterPartID || p.PartID.split('-').slice(0,-1).join('-')) === selectedMasterID)?.id || ''}
                                    onChange={e => handlePartSelect(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                                    required
                                >
                                    <option value="">완제품 선택</option>
                                    {latestParts.map(p => <option key={p.id} value={p.id}>[{p.PartID}] {p.Name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">BOM 버전 (Revision)</label>
                                <select
                                    value={form.PartDocID}
                                    onChange={e => handleVersionSelect(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                                    disabled={!selectedMasterID}
                                >
                                    {availableVersions.length > 0 ? (
                                        availableVersions.map(v => (
                                            <option key={v.id} value={v.id}>
                                                Rev {v.Rev || '1.0'} {v.IsLatestRevision !== false ? '(최신)' : ''}
                                            </option>
                                        ))
                                    ) : (
                                        <option value="">제품을 먼저 선택하세요</option>
                                    )}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-left">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">생산 수량</label>
                            <input type="number" min="1" value={form.TargetQty} onChange={e => setForm(prev => ({ ...prev, TargetQty: parseInt(e.target.value) || 0 }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold" required />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">판매 단가</label>
                            <input type="number" min="0" value={form.UnitPrice} onChange={e => setForm(prev => ({ ...prev, UnitPrice: parseInt(e.target.value) || 0 }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">납기 희망일</label>
                            <input type="date" value={form.DueDate} onChange={e => setForm(prev => ({ ...prev, DueDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold" required />
                        </div>
                    </div>

                    <div className="space-y-3 text-left">
                        <label className="text-xs font-bold text-slate-600 block">고객사</label>
                        <select
                            value={form.CustomerID}
                            onChange={e => {
                                const c = customers.find(x => x.id === e.target.value);
                                setForm(prev => ({ ...prev, CustomerID: c?.id || '', CustomerName: c?.Name || '' }));
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold"
                            required
                        >
                            <option value="">고객사 선택</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.Name}</option>)}
                        </select>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden text-left">
                        <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-100">
                            <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><Package size={14} className="text-amber-500"/> 자재 가용성 체크</h3>
                            <button type="button" onClick={checkAvailability} className="px-3 py-1.5 text-xs font-black bg-amber-500 text-white rounded-lg">검사 실행</button>
                        </div>
                        <div className="p-4 min-h-[60px]">
                            {availabilityCheck && (
                                <div className={`p-3 rounded-xl border ${availabilityCheck.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                    <p className="text-sm font-black">{availabilityCheck.ok ? '재고 충분' : '자재 부족'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100">취소</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600">{loading ? '등록 중...' : '의뢰 등록'}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────
export default function ProductionRequestsPage() {
    const { userProfile } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('ACTIVE'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedPR, setSelectedPR] = useState(null);
    const [transitionNote, setTransitionNote] = useState('');
    const [isPrintOpen, setIsPrintOpen] = useState(false);
    
    const handleERPSync = async () => {
        if (!window.confirm('이카운트(ECount) 등 외부 ERP로 생산 의뢰 데이터를 전송하시겠습니까? (현재는 Mocking 테스트입니다)')) return;
        setLoading(true);
        setTimeout(async () => {
            alert(`[ERP 전송 성공] 의뢰 번호 ${selectedPR.PRNumber} 가 외부 시스템에 성공적으로 등록되었습니다.`);
            try {
                const logEntry = {
                    from: selectedPR.Status, to: selectedPR.Status,
                    message: '외부 ERP 전송 완료 (Mock)',
                    user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString()
                };
                await updateDoc(doc(db, 'production_requests', selectedPR.id), { 
                    ERPSynced: true,
                    Logs: [logEntry, ...(selectedPR.Logs || [])] 
                });
                await fetchPRs();
            } catch(e){}
            setLoading(false);
        }, 1500);
    };
    const [selectedPRBOM, setSelectedPRBOM] = useState([]);
    const [inventory, setInventory] = useState({});

    useEffect(() => { fetchPRs(); }, []);
    useEffect(() => { if (selectedPR) fetchSelectedPRDetails(selectedPR.PartID); }, [selectedPR]);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            setPrs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchSelectedPRDetails = async (partID) => {
        try {
            const [bomSnap, invSnap, partsSnap] = await Promise.all([
                getDocs(query(collection(db, 'bom'), where('ParentID', '==', partID))),
                getDocs(collection(db, 'inventory')),
                getDocs(collection(db, 'parts'))
            ]);
            
            const partsMap = {};
            partsSnap.docs.forEach(d => { partsMap[d.data().PartID] = d.data().Name; });
            
            setSelectedPRBOM(bomSnap.docs.map(d => ({
                ...d.data(),
                ChildName: partsMap[d.data().ChildID] || d.data().ChildID
            })));
            
            const inv = {};
            invSnap.docs.forEach(d => { inv[d.data().PartID] = d.data().OnHand || 0; });
            setInventory(inv);
        } catch (err) { console.error(err); }
    };

    const handleStatusChange = async (prId, nextStatus, logMessage = '', reason = '') => {
        const pr = prs.find(p => p.id === prId);
        if (!pr) return;
        const currentStep = PR_STATUS[pr.Status]?.step || 0;
        const nextStep = PR_STATUS[nextStatus]?.step || 0;
        
        if (nextStep < currentStep && !reason) {
            const userReason = window.prompt('복구 사유를 입력하세요:');
            if (!userReason) return;
            reason = userReason;
        }

        const logEntry = {
            from: pr.Status, to: nextStatus,
            message: logMessage || (nextStep < currentStep ? `복구: ${reason}` : '상태 변경'),
            user: userProfile?.displayName || 'Unknown', timestamp: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, 'production_requests', prId), { Status: nextStatus, UpdatedAt: serverTimestamp(), Logs: [logEntry, ...(pr.Logs || [])] });
            setTransitionNote('');
            await fetchPRs();
            setSelectedPR(null);
        } catch (err) { console.error(err); }
    };

    const handleSavePR = async (formData) => {
        await addDoc(collection(db, 'production_requests'), { ...formData, PRNumber: generatePRNumber(), CreatedAt: serverTimestamp(), CreatedBy: userProfile?.uid });
        await fetchPRs();
    };

    const stats = useMemo(() => {
        let totalSales = 0, monthCount = 0, pendingCount = 0, urgentCount = 0;
        const now = new Date();
        prs.forEach(pr => {
            totalSales += pr.TotalAmount || 0;
            if (ACTIVE_STATUSES.includes(pr.Status)) pendingCount++;
            if (pr.Urgent) urgentCount++;
        });
        return { totalSales, monthCount, pendingCount, urgentCount };
    }, [prs]);

    const filteredData = useMemo(() => {
        const statusList = activeTab === 'ACTIVE' ? ACTIVE_STATUSES : HISTORY_STATUSES;
        let result = prs.filter(pr => statusList.includes(pr.Status));
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(pr => pr.PRNumber?.toLowerCase().includes(lower) || pr.PartName?.toLowerCase().includes(lower) || pr.CustomerName?.toLowerCase().includes(lower));
        }
        return result.map(pr => ({
            ...pr,
            Status: <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color}`}>{PR_STATUS[pr.Status]?.label}</span>,
            PRNumber: <span className="font-bold">{pr.PRNumber}</span>,
            TotalAmount: <span className="font-bold text-blue-600">₩{(pr.TotalAmount || 0).toLocaleString()}</span>,
            CreatedAt: pr.CreatedAt?.toDate ? pr.CreatedAt.toDate().toLocaleDateString() : '-'
        }));
    }, [prs, activeTab, searchTerm]);

    const isPRReadOnly = (status) => {
        const step = PR_STATUS[status]?.step || 0;
        return step >= 3 && step < 10;
    };

    return (
        <div className="h-full flex flex-col space-y-5">
            <div className="flex justify-between items-end">
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 의뢰 관리</h1><p className="text-sm font-bold text-slate-500 mt-1.5">생산 의뢰 및 판매 이력 추적</p></div>
                <button onClick={() => setIsCreateOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black transition-all flex items-center gap-2 shadow-lg"><Plus size={18}/> 신규 생산 의뢰</button>
            </div>

            <div className="grid grid-cols-4 gap-4 shrink-0 text-left">
                {[ { l: '처리 대기', v: stats.pendingCount, c: 'text-indigo-600', i: Clock }, { l: '긴급 처리', v: stats.urgentCount, c: 'text-rose-600', i: AlertCircle }, { l: '예상 매출', v: `₩${(stats.totalSales/1000000).toFixed(1)}M`, c: 'text-emerald-600', i: DollarSign } ].map((s, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl"><s.i size={22} className={s.c}/></div>
                        <div><p className="text-[10px] font-black text-slate-400 mb-0.5">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>{s.v}</p></div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex space-x-6">
                        {['ACTIVE', 'HISTORY'].map(t => <button key={t} onClick={() => setActiveTab(t)} className={`text-sm font-black pb-4 -mb-4 border-b-2 ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>{t === 'ACTIVE' ? '진행 중인 의뢰' : '판매 이력'}</button>)}
                    </div>
                    <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" placeholder="검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 text-sm font-bold bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-sm"/></div>
                </div>
                <div className="flex-1 overflow-hidden">
                    {loading ? <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div> : 
                    <MasterDataGrid data={filteredData} columnDefs={COLUMN_DEFS} onRowClick={row => setSelectedPR(prs.find(p => p.id === row.id))} />}
                </div>
            </div>

            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)} />
                    <div className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0 text-left">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-xs font-bold animate-pulse">긴급</span>}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>{PR_STATUS[selectedPR.Status]?.label}</span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2>
                                <p className="text-sm text-slate-500 font-bold">{selectedPR.PartName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"><X size={18}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-left">
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
                                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><ClipboardList size={14} className="text-blue-500"/> 기본 정보</h3>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-3 text-xs">
                                    <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">제품 정보 (Product Info)</p>
                                        <p className="font-black text-slate-800 text-sm">
                                            {selectedPR.PartName}
                                            <span className="text-[10px] font-mono font-bold text-blue-500 ml-2 bg-blue-50 px-1.5 py-0.5 rounded">[{selectedPR.PartID}]</span>
                                        </p>
                                    </div>
                                    <div className="pl-1">
                                        <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">요청 수량</p>
                                        <p className="font-black text-slate-800 text-sm">{selectedPR.TargetQty.toLocaleString()} <span className="text-[10px] text-slate-400">EA</span></p>
                                    </div>
                                    <div className="pl-1">
                                        <p className="font-bold text-slate-400 mb-1 uppercase tracking-tighter text-[10px]">납기일</p>
                                        <p className="font-black text-slate-800 text-sm">{selectedPR.DueDate}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><Package size={14} className="text-amber-500"/> 자재 가용성 현황</h3>
                                    <span className="text-[10px] font-bold text-slate-400">{selectedPRBOM.length} Items</span>
                                </div>
                                <div className="divide-y divide-slate-50 border-t border-slate-100">
                                    {selectedPRBOM.map((bom, idx) => (
                                        <div key={idx} className="flex items-center justify-between py-3 px-1 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className="text-xs font-bold text-slate-800 truncate">{bom.ChildName}</span>
                                                    <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter shrink-0">[{bom.ChildID}]</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8 shrink-0 ml-4">
                                                <div className="text-right">
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Required</p>
                                                    <p className="text-xs font-black text-slate-700">{(bom.Quantity * selectedPR.TargetQty).toLocaleString()} EA</p>
                                                </div>
                                                <div className="text-right w-16">
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Inventory</p>
                                                    <p className={`text-xs font-black ${inventory[bom.ChildID] >= (bom.Quantity * selectedPR.TargetQty) ? 'text-blue-600' : 'text-rose-500'}`}>
                                                        {inventory[bom.ChildID] || 0} EA
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {selectedPRBOM.length === 0 && (
                                    <div className="py-8 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                        No BOM data found
                                    </div>
                                )}
                            </div>
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                <h3 className="text-xs font-black text-slate-700">프로세스 제어</h3>
                                {isPRReadOnly(selectedPR.Status) ? <p className="text-xs text-slate-400 font-bold text-center py-2 bg-slate-50 rounded-xl">생산/QA 단계 수정 불가</p> : 
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button onClick={() => setIsPrintOpen(true)} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors">
                                            <Printer size={14} /> 작업 지시서 출력
                                        </button>
                                        <button onClick={handleERPSync} disabled={selectedPR.ERPSynced} className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors ${selectedPR.ERPSynced ? 'bg-emerald-100 text-emerald-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                            <Send size={14} /> {selectedPR.ERPSynced ? 'ERP 전송 완료' : 'ERP 연동 (Mock)'}
                                        </button>
                                    </div>
                                    {selectedPR.Status === 'CONFIRMED' && <button onClick={() => handleStatusChange(selectedPR.id, 'PROD_WAITING', transitionNote)} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black mt-2">생산 대기로 이관</button>}
                                    {selectedPR.Status === 'SHIP_READY' && <button onClick={() => handleStatusChange(selectedPR.id, 'SHIPPED', transitionNote)} className="w-full py-2.5 bg-green-600 text-white rounded-xl text-xs font-black">출하 완료 처리</button>}
                                </div>}
                                {PR_STATUS[selectedPR.Status]?.step > 0 && <button onClick={() => { const steps = Object.entries(PR_STATUS).sort((a,b) => a[1].step - b[1].step); const idx = steps.findIndex(s => s[0] === selectedPR.Status); if (idx > 0) handleStatusChange(selectedPR.id, steps[idx - 1][0]); }} className="w-full py-2.5 bg-white border border-rose-200 text-rose-500 rounded-xl text-xs font-black flex items-center justify-center gap-2"><RotateCcw size={14}/> 이전 단계 복구</button>}
                            </div>
                            {selectedPR.Logs && selectedPR.Logs.length > 0 && (
                                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                                    <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><History size={14}/> 로그</h3>
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
            <PRRegistrationModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSave={handleSavePR} />
            <WorkOrderPrintModal isOpen={isPrintOpen} onClose={() => setIsPrintOpen(false)} pr={selectedPR} bomList={selectedPRBOM} />
        </div>
    );
}
