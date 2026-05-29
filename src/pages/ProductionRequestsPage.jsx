import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import {
    ClipboardList, Plus, X, AlertCircle, CheckCircle2, Clock, DollarSign,
    ChevronRight, Layers, Search, Package, Users, Calendar, TrendingUp, ShieldAlert, UserPlus
} from 'lucide-react';

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
    const [availabilityCheck, setAvailabilityCheck] = useState(null); // null | { ok: bool, shortages: [] }
    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomerForm, setNewCustomerForm] = useState({ Name: '', Contact: '', Email: '' });
    const [addingCustomer, setAddingCustomer] = useState(false);
    const [selectedPartInfo, setSelectedPartInfo] = useState(null);

    const [form, setForm] = useState({
        PartDocID: '', PartName: '', PartID: '',
        CustomerID: '', CustomerName: '',
        TargetQty: 1, UnitPrice: 0, DueDate: '', Urgent: false, Remarks: ''
    });

    useEffect(() => {
        if (!isOpen) return;
        setForm({ PartDocID: '', PartName: '', PartID: '', CustomerID: '', CustomerName: '', TargetQty: 1, UnitPrice: 0, DueDate: '', Urgent: false, Remarks: '' });
        setAvailabilityCheck(null);
        setSelectedPartInfo(null);
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
        setForm(prev => ({ ...prev, PartDocID: partDocID, PartName: part?.Name || '', PartID: part?.PartID || '' }));
        setSelectedPartInfo(part || null);
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
        const sufficient = [];
        children.forEach(child => {
            const req = (child.Quantity || 1) * form.TargetQty;
            const onHand = inventory[child.ChildID] || 0;
            if (onHand < req) {
                shortages.push({ partID: child.ChildID, req, onHand, shortage: req - onHand });
            } else {
                sufficient.push({ partID: child.ChildID, req, onHand });
            }
        });
        setAvailabilityCheck({ ok: shortages.length === 0, shortages, sufficient });
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-700 text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <ClipboardList size={22} />
                        <div>
                            <h2 className="text-lg font-black tracking-tight">신규 생산 의뢰 (Production Request)</h2>
                            <p className="text-blue-200 text-xs font-medium mt-0.5">수주 정보를 입력하고 자재 가용성을 확인하세요</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors"><X size={18}/></button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* 1. 제품 선택 */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                        <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><Layers size={14} className="text-blue-500"/> 제품 정보 (사양 확인 필수)</h3>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">생산 대상 완제품 <span className="text-rose-500">*</span></label>
                            <select
                                value={form.PartDocID}
                                onChange={e => handlePartSelect(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="">완제품을 선택하세요 (최신 리비전만 표시)</option>
                                {latestParts.map(p => (
                                    <option key={p.id} value={p.id}>[{p.PartID}] {p.Name} (Rev {p.Rev || '1.0'})</option>
                                ))}
                            </select>
                        </div>

                        {selectedPartInfo && (
                            <div className="grid grid-cols-3 gap-3 bg-blue-50/60 border border-blue-100 rounded-xl p-3">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-0.5">Part ID</p>
                                    <p className="text-sm font-mono font-black text-blue-700">{selectedPartInfo.PartID}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-0.5">리비전</p>
                                    <p className="text-sm font-bold text-slate-700">Rev {selectedPartInfo.Rev || '1.0'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-0.5">분류</p>
                                    <p className="text-sm font-bold text-slate-700">{selectedPartInfo.Category || '-'}</p>
                                </div>
                                {selectedPartInfo.Specification && (
                                    <div className="col-span-3">
                                        <p className="text-[10px] font-bold text-slate-400 mb-0.5">스펙 (Specification)</p>
                                        <p className="text-xs font-medium text-slate-600 bg-white rounded-lg p-2 border border-blue-100">{selectedPartInfo.Specification}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 2. 수량 및 납기일 */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">생산 수량 (Qty) <span className="text-rose-500">*</span></label>
                            <input
                                type="number" min="1" value={form.TargetQty}
                                onChange={e => { setForm(prev => ({ ...prev, TargetQty: parseInt(e.target.value) || 0 })); setAvailabilityCheck(null); }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">예상 판매 단가 (₩)</label>
                            <input
                                type="number" min="0" value={form.UnitPrice}
                                onChange={e => setForm(prev => ({ ...prev, UnitPrice: parseInt(e.target.value) || 0 }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">납기 희망일 <span className="text-rose-500">*</span></label>
                            <input
                                type="date" value={form.DueDate}
                                onChange={e => setForm(prev => ({ ...prev, DueDate: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    </div>

                    {/* 3. 고객사 */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-600 flex items-center gap-1">고객사 (Customer) <span className="text-rose-500">*</span></label>
                            <button
                                type="button"
                                onClick={() => { setShowAddCustomer(v => !v); setNewCustomerForm({ Name: '', Contact: '', Email: '' }); }}
                                className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                            >
                                <UserPlus size={13}/> {showAddCustomer ? '취소' : '+ 고객사 추가'}
                            </button>
                        </div>

                        {!showAddCustomer ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    {customers.length === 0 ? (
                                        <div className="w-full bg-slate-50 border border-dashed border-slate-300 rounded-xl px-3 py-3 text-xs font-bold text-slate-400 text-center">
                                            등록된 고객사가 없습니다.<br/>
                                            <span className="text-blue-500 cursor-pointer underline" onClick={() => setShowAddCustomer(true)}>고객사 추가</span>를 눌러주세요.
                                        </div>
                                    ) : (
                                        <select
                                            value={form.CustomerID}
                                            onChange={e => {
                                                const c = customers.find(x => x.id === e.target.value);
                                                setForm(prev => ({ ...prev, CustomerID: c?.id || '', CustomerName: c?.Name || '' }));
                                            }}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                        >
                                            <option value="">고객사 선택</option>
                                            {customers.map(c => <option key={c.id} value={c.id}>{c.Name}</option>)}
                                        </select>
                                    )}
                                </div>
                                <div className="flex items-center">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={form.Urgent} onChange={e => setForm(prev => ({ ...prev, Urgent: e.target.checked }))} className="w-4 h-4 rounded text-rose-500 border-slate-300" />
                                        <span className="text-sm font-bold text-rose-600 flex items-center gap-1"><AlertCircle size={14}/> 긴급 (Urgent)</span>
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
                                <p className="text-xs font-black text-blue-700 flex items-center gap-2"><UserPlus size={14}/> 신규 고객사 빠른 등록</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-blue-600 mb-1 block">고객사명 <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            value={newCustomerForm.Name}
                                            onChange={e => setNewCustomerForm(prev => ({ ...prev, Name: e.target.value }))}
                                            placeholder="예) (주)한국전자"
                                            className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-600 mb-1 block">담당자 연락처</label>
                                        <input
                                            type="text"
                                            value={newCustomerForm.Contact}
                                            onChange={e => setNewCustomerForm(prev => ({ ...prev, Contact: e.target.value }))}
                                            placeholder="010-0000-0000"
                                            className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-blue-600 mb-1 block">이메일</label>
                                        <input
                                            type="email"
                                            value={newCustomerForm.Email}
                                            onChange={e => setNewCustomerForm(prev => ({ ...prev, Email: e.target.value }))}
                                            placeholder="contact@company.com"
                                            className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setShowAddCustomer(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">취소</button>
                                    <button
                                        type="button"
                                        disabled={!newCustomerForm.Name || addingCustomer}
                                        onClick={async () => {
                                            if (!newCustomerForm.Name.trim()) return;
                                            setAddingCustomer(true);
                                            try {
                                                const newRef = await addDoc(collection(db, 'customers'), {
                                                    Name: newCustomerForm.Name.trim(),
                                                    Contact: newCustomerForm.Contact,
                                                    Email: newCustomerForm.Email,
                                                    CreatedAt: serverTimestamp()
                                                });
                                                const newCustomer = { id: newRef.id, Name: newCustomerForm.Name.trim() };
                                                setCustomers(prev => [...prev, newCustomer].sort((a,b) => a.Name.localeCompare(b.Name)));
                                                setForm(prev => ({ ...prev, CustomerID: newRef.id, CustomerName: newCustomerForm.Name.trim() }));
                                                setShowAddCustomer(false);
                                            } catch(e) {
                                                console.error(e);
                                                alert('고객사 등록 중 오류가 발생했습니다.');
                                            } finally {
                                                setAddingCustomer(false);
                                            }
                                        }}
                                        className="px-4 py-1.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1"
                                    >
                                        {addingCustomer ? '저장 중...' : <><UserPlus size={12}/> 고객사 등록 후 선택</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1 block">특별 요청 사항 / 비고</label>
                        <textarea
                            value={form.Remarks} onChange={e => setForm(prev => ({ ...prev, Remarks: e.target.value }))}
                            rows={2} placeholder="특별 요청 사항이나 비고를 입력하세요..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    {/* 4. 자재 가용성 체크 */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-100">
                            <h3 className="text-xs font-black text-slate-700 flex items-center gap-2"><Package size={14} className="text-amber-500"/> 자재 가용성 사전 검사 (BOM 기반)</h3>
                            <button
                                type="button"
                                onClick={checkAvailability}
                                disabled={!form.PartID || form.TargetQty <= 0}
                                className="px-3 py-1.5 text-xs font-black bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1"
                            >
                                <Search size={12}/> 가용성 검사 실행
                            </button>
                        </div>

                        <div className="p-4">
                            {!availabilityCheck && (
                                <p className="text-xs text-slate-400 font-medium text-center py-2">제품과 수량을 선택 후 "가용성 검사 실행"을 누르세요.</p>
                            )}
                            {availabilityCheck && availabilityCheck.ok && (
                                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <CheckCircle2 size={18}/>
                                    <p className="text-sm font-black">재고 충분! 즉시 생산 의뢰 가능합니다.</p>
                                    {availabilityCheck.message && <p className="text-xs text-emerald-500 ml-1">{availabilityCheck.message}</p>}
                                </div>
                            )}
                            {availabilityCheck && !availabilityCheck.ok && (
                                <div>
                                    <div className="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3">
                                        <ShieldAlert size={18}/>
                                        <p className="text-sm font-black">⚠ 자재 부족! 아래 항목의 구매 발주(PO)가 필요합니다.</p>
                                    </div>
                                    <div className="space-y-2">
                                        {availabilityCheck.shortages.map((s, i) => (
                                            <div key={i} className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                                                <span className="text-xs font-mono font-bold text-rose-700">{s.partID}</span>
                                                <div className="flex items-center gap-4 text-xs font-bold">
                                                    <span className="text-slate-500">현재고: <span className="text-rose-600">{s.onHand}개</span></span>
                                                    <span className="text-slate-500">필요: <span className="text-slate-800">{s.req}개</span></span>
                                                    <span className="bg-rose-600 text-white px-2 py-0.5 rounded-full">부족: {s.shortage}개</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                    <div className="text-sm font-black text-slate-600">
                        {form.UnitPrice > 0 && form.TargetQty > 0 && (
                            <span>예상 총 금액: <span className="text-blue-600">₩{(form.UnitPrice * form.TargetQty).toLocaleString()}</span></span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200">취소</button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200 flex items-center gap-2"
                        >
                            {loading ? '등록 중...' : '생산 의뢰 확정 등록'}
                        </button>
                    </div>
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
    const [activeTab, setActiveTab] = useState('ACTIVE'); // ACTIVE | HISTORY
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedPR, setSelectedPR] = useState(null);

    useEffect(() => { fetchPRs(); }, []);

    const fetchPRs = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'production_requests'), orderBy('CreatedAt', 'desc')));
            setPrs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const stats = useMemo(() => {
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        let totalSales = 0, monthCount = 0, pendingCount = 0, urgentCount = 0;
        prs.forEach(pr => {
            totalSales += pr.TotalAmount || 0;
            const created = pr.CreatedAt?.toDate?.();
            if (created && created.getMonth() === thisMonth && created.getFullYear() === thisYear) monthCount++;
            if (ACTIVE_STATUSES.includes(pr.Status)) pendingCount++;
            if (pr.Urgent && ACTIVE_STATUSES.includes(pr.Status)) urgentCount++;
        });
        return { totalSales, monthCount, pendingCount, urgentCount };
    }, [prs]);

    const filteredData = useMemo(() => {
        const statusList = activeTab === 'ACTIVE' ? ACTIVE_STATUSES : HISTORY_STATUSES;
        let result = prs.filter(pr => statusList.includes(pr.Status));
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(pr =>
                pr.PRNumber?.toLowerCase().includes(lower) ||
                pr.PartName?.toLowerCase().includes(lower) ||
                pr.CustomerName?.toLowerCase().includes(lower)
            );
        }
        return result.map(pr => ({
            ...pr,
            Status: (
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black border ${PR_STATUS[pr.Status]?.color || 'bg-slate-100'}`}>
                    {PR_STATUS[pr.Status]?.label || pr.Status}
                </span>
            ),
            PRNumber: (
                <span className="font-bold text-slate-800 flex items-center gap-1">
                    {pr.PRNumber}
                    {pr.Urgent && <AlertCircle size={12} className="text-rose-500"/>}
                </span>
            ),
            UnitPrice: pr.UnitPrice > 0 ? `₩${pr.UnitPrice.toLocaleString()}` : '-',
            TotalAmount: pr.TotalAmount > 0 ? <span className="font-bold text-blue-600">₩{pr.TotalAmount.toLocaleString()}</span> : '-',
            CreatedAt: pr.CreatedAt?.toDate ? pr.CreatedAt.toDate().toLocaleDateString() : '-',
        }));
    }, [prs, activeTab, searchTerm]);

    const handleSavePR = async (formData) => {
        const PRNumber = generatePRNumber();
        await addDoc(collection(db, 'production_requests'), {
            ...formData,
            PRNumber,
            CreatedAt: serverTimestamp(),
            CreatedBy: userProfile?.uid,
        });
        await fetchPRs();
    };

    const handleStatusChange = async (prId, nextStatus) => {
        if (!window.confirm(`상태를 '${PR_STATUS[nextStatus]?.label}'(으)로 변경하시겠습니까?`)) return;
        await updateDoc(doc(db, 'production_requests', prId), { Status: nextStatus, UpdatedAt: serverTimestamp() });
        await fetchPRs();
        setSelectedPR(null);
    };

    return (
        <div className="h-full flex flex-col space-y-5">
            {/* Page Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">생산 의뢰 관리</h1>
                    <p className="text-sm font-bold text-slate-500 mt-1.5">고객 수주 기반의 생산 의뢰 등록 및 판매 이력 추적</p>
                </div>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 shadow-md shadow-blue-200 transition-all flex items-center gap-2"
                >
                    <Plus size={18}/> 신규 생산 의뢰
                </button>
            </div>

            {/* Dashboard KPIs */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-500 border border-blue-100"><ClipboardList size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">이번 달 신규 의뢰</p>
                        <p className="text-2xl font-black text-blue-600">{stats.monthCount}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-500 border border-indigo-100"><Clock size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">처리 대기 중</p>
                        <p className="text-2xl font-black text-indigo-600">{stats.pendingCount}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-rose-50 rounded-xl text-rose-500 border border-rose-100"><AlertCircle size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">긴급 처리 필요</p>
                        <p className="text-2xl font-black text-rose-600">{stats.urgentCount}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500 border border-emerald-100"><DollarSign size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">누적 예상 매출</p>
                        <p className="text-xl font-black text-emerald-600">₩{(stats.totalSales / 1000000).toFixed(1)}<span className="text-sm font-bold text-slate-500 ml-1">M</span></p>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div className="flex space-x-6">
                        {[
                            { key: 'ACTIVE', label: '진행 중인 의뢰' },
                            { key: 'HISTORY', label: '출하 / 판매 이력' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`text-sm font-black pb-4 -mb-4 border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="PR번호, 제품명, 고객사 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-64 text-sm font-bold bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder-slate-400 shadow-sm"
                    />
                </div>

                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <MasterDataGrid
                            data={filteredData}
                            columnDefs={COLUMN_DEFS}
                            onRowClick={row => {
                                const original = prs.find(p => p.id === row.id);
                                setSelectedPR(original);
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Detail Side Panel */}
            {selectedPR && createPortal(
                <div className="relative z-[9999]">
                    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={() => setSelectedPR(null)} />
                    <div className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200">
                        {/* Panel Header */}
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedPR.Urgent && <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-600 rounded text-xs font-bold flex items-center gap-1 animate-pulse"><AlertCircle size={11}/> 긴급</span>}
                                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${PR_STATUS[selectedPR.Status]?.color}`}>
                                        {PR_STATUS[selectedPR.Status]?.label}
                                    </span>
                                </div>
                                <h2 className="text-xl font-black text-slate-900">{selectedPR.PRNumber}</h2>
                                <p className="text-sm text-slate-500 font-bold mt-0.5">{selectedPR.CustomerName}</p>
                            </div>
                            <button onClick={() => setSelectedPR(null)} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
                        </div>

                        {/* Panel Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                                <h3 className="text-xs font-black text-slate-700 mb-2">기본 정보</h3>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div><p className="font-bold text-slate-400 mb-0.5">제품명</p><p className="font-black text-slate-800">{selectedPR.PartName}</p></div>
                                    <div><p className="font-bold text-slate-400 mb-0.5">Part ID</p><p className="font-mono font-black text-blue-600">{selectedPR.PartID}</p></div>
                                    <div><p className="font-bold text-slate-400 mb-0.5">생산 수량</p><p className="font-black text-slate-800">{selectedPR.TargetQty} EA</p></div>
                                    <div><p className="font-bold text-slate-400 mb-0.5">납기 희망일</p><p className="font-black text-slate-800">{selectedPR.DueDate}</p></div>
                                    <div><p className="font-bold text-slate-400 mb-0.5">예상 단가</p><p className="font-black text-slate-800">₩{(selectedPR.UnitPrice || 0).toLocaleString()}</p></div>
                                    <div><p className="font-bold text-slate-400 mb-0.5">예상 총 금액</p><p className="font-black text-blue-600">₩{(selectedPR.TotalAmount || 0).toLocaleString()}</p></div>
                                </div>
                                {selectedPR.Remarks && (
                                    <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-amber-600 mb-1">특별 요청 사항</p>
                                        <p className="text-xs font-medium text-slate-700">{selectedPR.Remarks}</p>
                                    </div>
                                )}
                            </div>

                            {/* 상태 변경 */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                                <h3 className="text-xs font-black text-slate-700 mb-3">상태 변경 (Status Transition)</h3>
                                {selectedPR.Status === 'CONFIRMED' && (
                                    <button onClick={() => handleStatusChange(selectedPR.id, 'PROD_WAITING')} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200">생산 대기로 이관</button>
                                )}
                                {selectedPR.Status === 'PROD_WAITING' && (
                                    <button onClick={() => handleStatusChange(selectedPR.id, 'PROD_PLANNING')} className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-black shadow-md shadow-violet-200">생산 계획 수립 시작</button>
                                )}
                                {selectedPR.Status === 'SHIP_READY' && (
                                    <button onClick={() => handleStatusChange(selectedPR.id, 'SHIPPED')} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black shadow-md shadow-green-200">출하 완료 처리</button>
                                )}
                                {selectedPR.Status === 'SHIPPED' && (
                                    <button onClick={() => handleStatusChange(selectedPR.id, 'ARCHIVED')} className="w-full py-2.5 bg-slate-500 hover:bg-slate-600 text-white rounded-xl text-xs font-black">아카이브</button>
                                )}
                                {!['CONFIRMED','PROD_WAITING','SHIP_READY','SHIPPED'].includes(selectedPR.Status) && (
                                    <p className="text-xs text-slate-400 text-center py-2">생산 실행 페이지에서 상태가 변경됩니다.</p>
                                )}
                            </div>

                            {/* 상태 파이프라인 표시 */}
                            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                                <h3 className="text-xs font-black text-slate-700 mb-3">생산 파이프라인 현황</h3>
                                <div className="space-y-1.5">
                                    {Object.entries(PR_STATUS).map(([key, info]) => (
                                        <div key={key} className={`flex items-center gap-2 p-2 rounded-lg ${selectedPR.Status === key ? 'bg-blue-50 border border-blue-100' : ''}`}>
                                            <div className={`w-2 h-2 rounded-full ${selectedPR.Status === key ? 'bg-blue-500' : info.step < (PR_STATUS[selectedPR.Status]?.step || 0) ? 'bg-emerald-400' : 'bg-slate-200'}`}/>
                                            <span className={`text-[11px] font-bold ${selectedPR.Status === key ? 'text-blue-700' : info.step < (PR_STATUS[selectedPR.Status]?.step || 0) ? 'text-emerald-600 line-through' : 'text-slate-400'}`}>
                                                {info.label}
                                            </span>
                                            {selectedPR.Status === key && <ChevronRight size={12} className="text-blue-500 ml-auto"/>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <PRRegistrationModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSave={handleSavePR}
            />
        </div>
    );
}
