import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, doc, updateDoc, where, getDoc, setDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import PartsDetailPanel from '../components/PartsDetailPanel';
import { USER_ROLES, hasPermission } from '../services/userService';
import * as XLSX from 'xlsx';
import {
    History, ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown,
    Filter, Download, Plus, X, Search, Package, Users, Calendar,
    RefreshCw, FileText, AlertTriangle, Edit2, Barcode, HelpCircle, Eye, CornerDownRight
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// 기간 필터 옵션
// ─────────────────────────────────
const PERIOD_OPTIONS = [
    { key: '1w', label: '1주일' },
    { key: '1m', label: '1개월' },
    { key: '3m', label: '3개월' },
    { key: 'all', label: '전체' }
];

const COLUMN_DEFS = {
    Type:         { label: '구분',         default: true  },
    Date:         { label: '일자',         default: true  },
    PartID:       { label: '품번',         default: true  },
    PartName:     { label: '품명',         default: true  },
    Quantity:     { label: '수량',         default: true  },
    CustomerName: { label: '거래처/고객사', default: true  },
    Location:     { label: '보관 위치',     default: true  },
    LotNumber:    { label: 'LOT 번호',     default: true  },
    RefDoc:       { label: '참조 문서',    default: false },
    Reason:       { label: '사유',         default: true  },
    CreatedBy:    { label: '처리자',       default: false },
};

// 수동 입출고 등록 모달
function ManualTransactionModal({ isOpen, onClose, onSave, parts, inventoryMap }) {
    const [form, setForm] = useState({
        PartID: '',
        Type: 'In',
        Quantity: 1,
        Reason: '',
        RefDoc: '',
        Location: '',
        LotNumber: '',
        CustomerName: ''
    });
    const [loading, setLoading] = useState(false);
    const [onHandStock, setOnHandStock] = useState(0);
    const [showScannerSim, setShowScannerSim] = useState(false);

    // Part ID 변경 시 현재고 및 기본 로케이션 자동 매핑
    useEffect(() => {
        if (form.PartID) {
            const currentPart = parts.find(p => p.PartID === form.PartID);
            const stock = inventoryMap[form.PartID]?.OnHand || 0;
            setOnHandStock(stock);
            
            // 기본 보관 위치 자동 완성
            if (currentPart?.DefaultLocation && !form.Location) {
                setForm(prev => ({ ...prev, Location: currentPart.DefaultLocation }));
            }
        } else {
            setOnHandStock(0);
        }
    }, [form.PartID, parts, inventoryMap]);

    useEffect(() => {
        if (isOpen) {
            const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const randHex = Math.floor(1000 + Math.random() * 9000);
            setForm({
                PartID: '',
                Type: 'In',
                Quantity: 1,
                Reason: '',
                RefDoc: '',
                Location: '',
                LotNumber: `LOT-${todayStr}-${randHex}`,
                CustomerName: ''
            });
            setShowScannerSim(false);
        }
    }, [isOpen]);

    const handleBarcodeScan = (scannedPartID) => {
        const foundPart = parts.find(p => p.PartID === scannedPartID);
        if (foundPart) {
            const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const randHex = Math.floor(1000 + Math.random() * 9000);
            setForm(prev => ({
                ...prev,
                PartID: scannedPartID,
                Location: foundPart.DefaultLocation || '',
                LotNumber: `LOT-${todayStr}-${randHex}`,
                Reason: prev.Reason || '바코드 QR 스캔 입고'
            }));
            // 시각적 피드백 효과를 위해 시뮬레이터창 일시적 강조 가능
            alert(`바코드 스캔 완료: [${foundPart.PartID}] ${foundPart.Name}`);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.PartID || form.Quantity <= 0) return alert('품번과 수량을 정확히 입력해주세요.');

        // 마이너스 재고 검증
        let isNegative = false;
        if (form.Type === 'Out' && form.Quantity > onHandStock) {
            const confirmProceed = window.confirm(
                `[경고] 출고 수량(${form.Quantity} EA)이 현재고(${onHandStock} EA)보다 많습니다.\n` +
                `이대로 진행할 경우 재고가 마이너스(-${form.Quantity - onHandStock} EA)가 됩니다.\n` +
                `비정상 트랜잭션으로 강제 진행하시겠습니까?`
            );
            if (!confirmProceed) return;
            isNegative = true;
        }

        setLoading(true);
        try {
            await onSave({
                ...form,
                NegativeStockDetected: isNegative
            });
            onClose();
        } catch (err) {
            console.error(err);
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className={`flex justify-between items-center p-6 text-white shrink-0 ${form.Type === 'In' ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-orange-500 to-amber-600'}`}>
                    <div className="flex items-center gap-3">
                        {form.Type === 'In' ? <ArrowDownCircle size={24}/> : <ArrowUpCircle size={24}/>}
                        <div>
                            <h2 className="text-lg font-black">수동 입출고 및 수불 등록</h2>
                            <p className={`text-xs mt-0.5 ${form.Type === 'In' ? 'text-blue-100' : 'text-orange-100'}`}>창고 로케이션 및 LOT 이력을 포함한 재고 조정</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowScannerSim(!showScannerSim)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold transition-all"
                        >
                            <Barcode size={14}/> 스캐너 시뮬레이터 {showScannerSim ? '닫기' : '열기'}
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl"><X size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Scanner Simulation Area */}
                    {showScannerSim && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                    <Barcode size={16} className="text-indigo-600 animate-pulse"/>
                                    스마트폰 / PDA QR 바코드 스캐너 시뮬레이션
                                </h3>
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">데모 모드</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-normal mb-3">아래 실물 부품의 바코드를 스캔(클릭)하면, 품번과 로케이션 및 가상 제조 LOT 번호가 양식에 자동 입력됩니다.</p>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                                {parts.map(p => (
                                    <button
                                        key={p.PartID}
                                        type="button"
                                        onClick={() => handleBarcodeScan(p.PartID)}
                                        className="text-left px-3 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-bold transition-all flex justify-between items-center group"
                                    >
                                        <div>
                                            <p className="text-[9px] font-mono text-slate-400 group-hover:text-indigo-500">{p.PartID}</p>
                                            <p className="text-slate-800 text-xs truncate max-w-[180px]">{p.Name}</p>
                                        </div>
                                        <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.5 rounded uppercase">{p.DefaultLocation || 'No loc'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* 입/출고 선택 */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, Type: 'In' }))}
                                className={`py-3.5 rounded-2xl text-sm font-black border-2 transition-all flex items-center justify-center gap-2 ${form.Type === 'In' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-md shadow-blue-100' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                            >
                                <ArrowDownCircle size={18}/> 입고 (IN)
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, Type: 'Out' }))}
                                className={`py-3.5 rounded-2xl text-sm font-black border-2 transition-all flex items-center justify-center gap-2 ${form.Type === 'Out' ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-md shadow-orange-100' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                            >
                                <ArrowUpCircle size={18}/> 출고 (OUT)
                            </button>
                        </div>

                        {/* 품번 선택 및 현재고 요약 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">품번 (Part ID) <span className="text-rose-500">*</span></label>
                                <select
                                    value={form.PartID}
                                    onChange={e => setForm(prev => ({ ...prev, PartID: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">품번을 선택하세요...</option>
                                    {parts.map(p => <option key={p.PartID} value={p.PartID}>[{p.PartID}] {p.Name}</option>)}
                                </select>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-center h-[50px]">
                                <span className="text-[10px] font-black text-slate-450 uppercase tracking-wider block">현재 전산 재고</span>
                                <span className={`text-base font-black mt-0.5 ${onHandStock === 0 ? 'text-red-500' : 'text-slate-800'}`}>
                                    {onHandStock.toLocaleString()} <span className="text-xs font-bold text-slate-500">EA</span>
                                </span>
                            </div>
                        </div>

                        {/* 수량, 거래처/고객사 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">수량 <span className="text-rose-500">*</span></label>
                                <input
                                    type="number" min="1" value={form.Quantity}
                                    onChange={e => setForm(prev => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">고객사 / 협력업체</label>
                                <input
                                    type="text" value={form.CustomerName}
                                    onChange={e => setForm(prev => ({ ...prev, CustomerName: e.target.value }))}
                                    placeholder="거래처명 입력 (납품처/공급사)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* 창고 로케이션, LOT 번호 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">보관 로케이션 (Location) <span className="text-rose-500">*</span></label>
                                <input
                                    type="text" value={form.Location}
                                    onChange={e => setForm(prev => ({ ...prev, Location: e.target.value }))}
                                    placeholder="예: RACK-A1, BIN-12"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">제조 LOT 번호 <span className="text-rose-500">*</span></label>
                                <input
                                    type="text" value={form.LotNumber}
                                    onChange={e => setForm(prev => ({ ...prev, LotNumber: e.target.value }))}
                                    placeholder="LOT 번호 자동 생성됨"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    required
                                />
                            </div>
                        </div>

                        {/* 참조 문서, 사유 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">참조 문서 번호</label>
                                <input
                                    type="text" value={form.RefDoc}
                                    onChange={e => setForm(prev => ({ ...prev, RefDoc: e.target.value }))}
                                    placeholder="PO-2024..., PR-2024..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">입출고 사유 / 비고 <span className="text-rose-500">*</span></label>
                                <input
                                    type="text" value={form.Reason}
                                    onChange={e => setForm(prev => ({ ...prev, Reason: e.target.value }))}
                                    placeholder="예) 입고 검사 완료 입고, 생산 불출, 자재 정기 실사..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                        </div>

                        {/* 마이너스 재고 및 비정상 트랜잭션 경고 */}
                        {form.Type === 'Out' && form.Quantity > onHandStock && (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800 animate-pulse">
                                <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0"/>
                                <div>
                                    <p className="text-xs font-black">재고 부족 경고 (Negative Inventory Warning)</p>
                                    <p className="text-[11px] font-semibold mt-0.5 text-red-650 leading-normal">
                                        현재 보유한 전산 재고({onHandStock} EA)보다 많은 수량({form.Quantity} EA)을 출고하려 합니다.
                                        진행 시 재고 원장이 마이너스 수치로 기록되며, 비정상 트랜잭션 경보가 최고 관리자에게 즉시 전달됩니다.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="bg-amber-50 border border-amber-250 rounded-2xl p-4 flex items-start gap-3">
                            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0"/>
                            <p className="text-xs font-bold text-amber-700 leading-normal">
                                이 거래를 승인하면 지정된 로케이션 재고가 즉시 가감 반영됩니다. 
                                등록 후에는 수정 권한이 통제되며 변경 로그(Audit Trail)가 남으므로 사유와 참조 번호를 정밀히 확인해주십시오.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">취소</button>
                            <button
                                type="submit" disabled={loading}
                                className={`px-6 py-3 rounded-xl text-xs font-black text-white shadow-md transition-all flex items-center gap-2 ${form.Type === 'In' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'}`}
                            >
                                {loading ? '등록 중...' : `${form.Type === 'In' ? '입고' : '출고'} 내역 확정`}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────
export default function TransactionsPage() {
    const { userProfile } = useAuth();
    const [transactions, setTransactions] = useState([]);
    const [parts, setParts] = useState([]);
    const [allBoms, setAllBoms] = useState([]);
    const [inventoryMap, setInventoryMap] = useState({});
    const [loading, setLoading] = useState(true);

    // 필터 상태
    const [activeTab, setActiveTab] = useState('ALL');    // ALL | IN | OUT | SALES
    const [period, setPeriod] = useState('1m');
    const [searchTerm, setSearchTerm] = useState('');
    const [isManualOpen, setIsManualOpen] = useState(false);
    
    // 추가 기능 상태
    const [selectedPartId, setSelectedPartId] = useState(null);
    const [selectedTx, setSelectedTx] = useState(null);
    const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editTargetTx, setEditTargetTx] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [txSnap, partsSnap, bomSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'transactions'), orderBy('Date', 'desc'))),
                getDocs(collection(db, 'parts')),
                getDocs(collection(db, 'bom')),
                getDocs(collection(db, 'inventory')),
            ]);
            const partsMap = {};
            partsSnap.docs.forEach(d => {
                const data = d.data();
                if (data.PartID) partsMap[data.PartID] = data.Name || '-';
            });
            setParts(partsSnap.docs.map(d => d.data()).filter(p => p.PartID).sort((a, b) => (a.Name || '').localeCompare(b.Name || '')));
            setAllBoms(bomSnap.docs.map(d => d.data()));

            const invMap = {};
            invSnap.docs.forEach(d => {
                const data = d.data();
                if (data.PartID) invMap[data.PartID] = data;
            });
            setInventoryMap(invMap);

            const txList = txSnap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                PartName: partsMap[d.data().PartID] || d.data().PartID || '-',
            }));
            setTransactions(txList);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // 기간 필터 계산
    const getPeriodDate = () => {
        const now = new Date();
        if (period === '1w') return new Date(now.setDate(now.getDate() - 7));
        if (period === '1m') return new Date(now.setMonth(now.getMonth() - 1));
        if (period === '3m') return new Date(now.setMonth(now.getMonth() - 3));
        return null;
    };

    // 통계 계산
    const stats = useMemo(() => {
        const cutoff = getPeriodDate();
        const filtered = cutoff
            ? transactions.filter(t => {
                const d = t.Date?.toDate ? t.Date.toDate() : (t.Date ? new Date(t.Date) : null);
                return d && d >= cutoff;
            })
            : transactions;

        let totalIn = 0, totalOut = 0, inCount = 0, outCount = 0;
        filtered.forEach(t => {
            if (t.Type === 'In') { totalIn += (t.Quantity || 0); inCount++; }
            else { totalOut += (t.Quantity || 0); outCount++; }
        });
        return { totalIn, totalOut, inCount, outCount, total: filtered.length };
    }, [transactions, period]);

    // 필터링 및 데이터 가공 (원시 데이터 유지)
    const filteredData = useMemo(() => {
        const cutoff = getPeriodDate();
        let result = transactions;

        // 기간 필터
        if (cutoff) {
            result = result.filter(t => {
                const d = t.Date?.toDate ? t.Date.toDate() : (t.Date ? new Date(t.Date) : null);
                return d && d >= cutoff;
            });
        }

        // 탭 필터
        if (activeTab === 'IN')    result = result.filter(t => String(t.Type).toUpperCase() === 'IN');
        if (activeTab === 'OUT')   result = result.filter(t => String(t.Type).toUpperCase() === 'OUT');
        if (activeTab === 'SALES') result = result.filter(t => t.CustomerName || t.Reason?.includes('출하') || t.Reason?.includes('고객'));

        // 검색 필터
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(t =>
                t.PartID?.toLowerCase().includes(lower) ||
                t.PartName?.toLowerCase().includes(lower) ||
                t.RefDoc?.toLowerCase().includes(lower) ||
                t.Reason?.toLowerCase().includes(lower) ||
                t.Location?.toLowerCase().includes(lower) ||
                t.LotNumber?.toLowerCase().includes(lower) ||
                t.CustomerName?.toLowerCase().includes(lower)
            );
        }

        return result;
    }, [transactions, activeTab, period, searchTerm]);

    const cellRenderer = {
        Type: (val, row) => {
            const isIncoming = String(row.Type).toUpperCase() === 'IN';
            return isIncoming
                ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200"><ArrowDownCircle size={11}/> 입고</span>
                : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-50 text-orange-700 border border-orange-200"><ArrowUpCircle size={11}/> 출고</span>;
        },
        Date: (val, row) => {
            const dateObj = val?.toDate ? val.toDate() : (val ? new Date(val) : null);
            const dateStr = dateObj ? dateObj.toLocaleDateString('ko-KR') : '-';
            const timeStr = dateObj ? dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
            return <div><p className="text-xs font-bold text-slate-800">{dateStr}</p><p className="text-[10px] text-slate-400">{timeStr}</p></div>;
        },
        PartID: (val, row) => (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPartId(row.PartID);
                }}
                className="font-mono text-xs font-bold text-blue-600 hover:text-indigo-600 hover:underline text-left cursor-pointer"
            >
                {val}
            </button>
        ),
        PartName: (val, row) => (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPartId(row.PartID);
                }}
                className="text-xs font-bold text-slate-800 hover:text-indigo-650 hover:underline text-left cursor-pointer"
            >
                {val}
            </button>
        ),
        Quantity: (val, row) => {
            const displayVal = val !== undefined && val !== null ? val : (row.Qty !== undefined && row.Qty !== null ? row.Qty : 0);
            const isIncoming = String(row.Type).toUpperCase() === 'IN';
            return (
                <span className={`text-sm font-black ${isIncoming ? 'text-blue-600' : 'text-orange-600'}`}>
                    {isIncoming ? '+' : '-'}{Number(displayVal).toLocaleString()}
                </span>
            );
        },
        RefDoc: (val) => val ? <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">{val}</span> : <span className="text-slate-300 text-xs">-</span>,
        Reason: (val) => <span className="text-xs text-slate-600 font-medium">{val || '-'}</span>,
        CreatedBy: (val) => <span className="text-[10px] text-slate-400 font-medium">{val || 'System'}</span>,
        Location: (val) => val ? <span className="text-xs text-emerald-600 font-black">{val}</span> : <span className="text-slate-300 text-xs">-</span>,
        LotNumber: (val) => val ? <span className="font-mono text-xs font-bold text-slate-600">{val}</span> : <span className="text-slate-300 text-xs">-</span>,
    };

    const sendAlertToAdmins = async (title, message) => {
        try {
            const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'manager']));
            const snap = await getDocs(q);
            const promises = snap.docs.map(docSnap => {
                const uData = docSnap.data();
                if (uData.email) {
                    return addDoc(collection(db, 'notifications'), {
                        userEmail: uData.email,
                        title: `[수불 이상 경고] ${title}`,
                        message: message,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                }
                return Promise.resolve();
            });
            await Promise.all(promises);
        } catch (err) {
            console.error("Alert broadcast failed:", err);
        }
    };

    const handleSaveTransaction = async (formData) => {
        const isNegative = formData.NegativeStockDetected || false;
        const isUnauthorized = userProfile?.role !== 'admin' && userProfile?.role !== 'manager';
        
        const tData = {
            ...formData,
            Date: serverTimestamp(),
            CreatedBy: userProfile?.displayName || userProfile?.uid || 'System',
            CreatedByEmail: userProfile?.email || '',
            ManualEntry: true,
            Abnormal: isNegative || isUnauthorized,
            AbnormalReason: isNegative && isUnauthorized 
                ? 'Negative stock & Unauthorized manual adjustment'
                : isNegative 
                    ? 'Negative stock adjustment' 
                    : isUnauthorized 
                        ? 'Unauthorized manual adjustment' 
                        : ''
        };

        await addDoc(collection(db, 'transactions'), tData);
        
        // Update real-time inventory count
        const invRef = doc(db, 'inventory', formData.PartID);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
            const currentOnHand = Number(invSnap.data().OnHand || 0);
            let newTotal = currentOnHand;
            if (formData.Type === 'In') {
                newTotal += Number(formData.Quantity || 0);
            } else if (formData.Type === 'Out') {
                newTotal -= Number(formData.Quantity || 0);
            }
            await updateDoc(invRef, {
                OnHand: newTotal,
                Location: formData.Location || invSnap.data().Location || '-',
                LastUpdated: serverTimestamp()
            });
        } else {
            let newTotal = 0;
            if (formData.Type === 'In') newTotal = Number(formData.Quantity || 0);
            else if (formData.Type === 'Out') newTotal = -Number(formData.Quantity || 0);
            await setDoc(invRef, {
                PartID: formData.PartID,
                OnHand: newTotal,
                Location: formData.Location || '-',
                LastUpdated: serverTimestamp()
            });
        }

        // Alerts dispatch
        if (isNegative) {
            await sendAlertToAdmins(
                "부족 재고 출고 발생",
                `부품 [${formData.PartID}]에 대해 현재 전산고를 초과하는 출고(${formData.Quantity} EA)가 처리되어 마이너스 재고가 발생했습니다. (처리자: ${tData.CreatedBy})`
            );
        }
        if (isUnauthorized) {
            await sendAlertToAdmins(
                "비권한자 재고 보정 감지",
                `관리자 권한이 없는 사용자 ${tData.CreatedBy} (${userProfile?.role || 'Guest'})가 품목 [${formData.PartID}]에 수동 수불 조정(${formData.Type === 'In' ? '입고' : '출고'}, ${formData.Quantity} EA)을 수행했습니다.`
            );
        }

        await fetchAll();
    };

    const handleSaveManual = async (formData) => {
        await handleSaveTransaction(formData);
    };

    const handleSaveRevision = async (originalTx, newForm, revisionReason) => {
        await addDoc(collection(db, 'transaction_revisions'), {
            TransactionId: originalTx.id,
            PartID: originalTx.PartID,
            RevisedBy: userProfile?.uid || 'System',
            RevisedByName: userProfile?.displayName || 'System',
            RevisionDate: serverTimestamp(),
            RevisionReason: revisionReason,
            Before: {
                Quantity: originalTx.Quantity,
                Location: originalTx.Location || '',
                LotNumber: originalTx.LotNumber || '',
                Reason: originalTx.Reason || '',
                CustomerName: originalTx.CustomerName || '',
                RefDoc: originalTx.RefDoc || ''
            },
            After: {
                Quantity: newForm.Quantity,
                Location: newForm.Location,
                LotNumber: newForm.LotNumber,
                Reason: newForm.Reason,
                CustomerName: newForm.CustomerName,
                RefDoc: newForm.RefDoc
            }
        });

        await updateDoc(doc(db, 'transactions', originalTx.id), {
            Quantity: newForm.Quantity,
            Location: newForm.Location,
            LotNumber: newForm.LotNumber,
            Reason: newForm.Reason,
            CustomerName: newForm.CustomerName,
            RefDoc: newForm.RefDoc,
            LastRevisedAt: serverTimestamp(),
            LastRevisedBy: userProfile?.displayName || 'Manager'
        });

        const invRef = doc(db, 'inventory', originalTx.PartID);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
            const currentOnHand = Number(invSnap.data().OnHand || 0);
            let revertedOnHand = currentOnHand;
            if (originalTx.Type === 'In') {
                revertedOnHand -= Number(originalTx.Quantity || 0);
            } else if (originalTx.Type === 'Out') {
                revertedOnHand += Number(originalTx.Quantity || 0);
            }
            let finalOnHand = revertedOnHand;
            if (originalTx.Type === 'In') {
                finalOnHand += Number(newForm.Quantity || 0);
            } else if (originalTx.Type === 'Out') {
                finalOnHand -= Number(newForm.Quantity || 0);
            }

            await updateDoc(invRef, {
                OnHand: finalOnHand,
                Location: newForm.Location || invSnap.data().Location || '-',
                LastUpdated: serverTimestamp()
            });
        }

        await fetchAll();
    };

    const handleExportExcel = () => {
        const dataToExport = filteredData.map(t => {
            const dateObj = t.Date?.toDate ? t.Date.toDate() : (t.Date ? new Date(t.Date) : null);
            const dateStr = dateObj ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}` : '-';
            
            return {
                '구분': t.Type === 'In' ? '입고' : '출고',
                '일자': dateStr,
                '품번': t.PartID || '-',
                '품명': t.PartName || '-',
                '수량': t.Quantity || 0,
                '거래처/고객사': t.CustomerName || '-',
                '보관 위치': t.Location || '-',
                'LOT 번호': t.LotNumber || '-',
                '참조문서': t.RefDoc || '-',
                '사유': t.Reason || '-',
                '처리자': t.CreatedBy || 'System',
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "수불 원장");

        // Auto-fit column widths
        const maxLens = {};
        if (dataToExport.length > 0) {
            Object.keys(dataToExport[0]).forEach(key => {
                maxLens[key] = key.length * 2;
            });
            dataToExport.forEach(row => {
                Object.keys(row).forEach(key => {
                    const val = String(row[key] || '');
                    let len = 0;
                    for (let i = 0; i < val.length; i++) {
                        len += val.charCodeAt(i) > 128 ? 2 : 1;
                    }
                    maxLens[key] = Math.max(maxLens[key] || 10, len + 2);
                });
            });
            worksheet['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] }));
        }

        XLSX.writeFile(workbook, `수불원장_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`);
    };

    const hasEditPermission = userProfile && (userProfile.role === 'admin' || userProfile.role === 'manager');
    const handleOpenEdit = (row) => {
        const orig = transactions.find(t => t.id === row.id);
        if (orig) {
            setEditTargetTx(orig);
            setIsEditOpen(true);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-5">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">입출고 내역 (수불 원장)</h1>
                    <p className="text-sm font-bold text-slate-500 mt-1.5">자재 및 완제품의 모든 입출고 이력 추적 및 수불 관리</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportExcel}
                        className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-black hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2"
                    >
                        <Download size={16}/> Excel 내보내기
                    </button>
                    <button
                        onClick={() => setIsBarcodeScannerOpen(true)}
                        className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-black hover:bg-slate-900 shadow-sm transition-all flex items-center gap-2"
                    >
                        <Barcode size={16}/> 바코드 스캔 등록
                    </button>
                    <button
                        onClick={() => setIsManualOpen(true)}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 shadow-md shadow-blue-200 transition-all flex items-center gap-2"
                    >
                        <Plus size={18}/> 수동 입출고 등록
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-500 border border-slate-100"><FileText size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">조회 기간 총 건수</p>
                        <p className="text-2xl font-black text-slate-800">{stats.total.toLocaleString()}<span className="text-sm font-bold text-slate-500 ml-1">건</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-500 border border-blue-100"><ArrowDownCircle size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">입고 ({stats.inCount}건)</p>
                        <p className="text-2xl font-black text-blue-600">+{stats.totalIn.toLocaleString()}<span className="text-sm font-bold text-slate-500 ml-1">EA</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-orange-50 rounded-xl text-orange-500 border border-orange-100"><ArrowUpCircle size={22}/></div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">출고 ({stats.outCount}건)</p>
                        <p className="text-2xl font-black text-orange-600">-{stats.totalOut.toLocaleString()}<span className="text-sm font-bold text-slate-500 ml-1">EA</span></p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className={`p-3 rounded-xl border ${stats.totalIn - stats.totalOut >= 0 ? 'bg-emerald-50 text-emerald-500 border-emerald-100' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>
                        {stats.totalIn - stats.totalOut >= 0 ? <TrendingUp size={22}/> : <TrendingDown size={22}/>}
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 mb-0.5">순 증감 (입고 - 출고)</p>
                        <p className={`text-2xl font-black ${stats.totalIn - stats.totalOut >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {stats.totalIn - stats.totalOut >= 0 ? '+' : ''}{(stats.totalIn - stats.totalOut).toLocaleString()}<span className="text-sm font-bold text-slate-500 ml-1">EA</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Toolbar */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-3">
                    {/* Tabs */}
                    <div className="flex justify-between items-center">
                        <div className="flex gap-1">
                            {[
                                { key: 'ALL',   label: '전체 내역' },
                                { key: 'IN',    label: '입고만' },
                                { key: 'OUT',   label: '출고만' },
                                { key: 'SALES', label: '고객 출하 내역' },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-black transition-colors ${
                                        activeTab === tab.key
                                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                                            : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <button onClick={fetchAll} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors" title="새로고침">
                            <RefreshCw size={16}/>
                        </button>
                    </div>

                    {/* 필터바 */}
                    <div className="flex gap-3 items-center">
                        {/* 기간 필터 */}
                        <div className="flex gap-1">
                            {PERIOD_OPTIONS.map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setPeriod(opt.key)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors border ${
                                        period === opt.key
                                            ? 'bg-slate-800 text-white border-slate-800'
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <div className="w-px h-5 bg-slate-200 mx-1"/>

                        {/* 검색 */}
                        <div className="relative flex-1 max-w-sm">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input
                                type="text"
                                placeholder="품번, 품명, 참조문서, 사유 검색..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                            />
                        </div>

                        {/* 결과 수 표시 */}
                        <p className="text-xs font-bold text-slate-400 ml-auto">{filteredData.length.toLocaleString()}건 표시 중</p>
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/>
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <History size={40} className="mb-3 opacity-30"/>
                            <p className="text-sm font-bold">해당 조건의 입출고 내역이 없습니다.</p>
                            <p className="text-xs font-medium mt-1">기간이나 탭 필터를 변경해 보세요.</p>
                        </div>
                    ) : (
                        <MasterDataGrid
                            data={filteredData}
                            columnDefs={COLUMN_DEFS}
                            cellRenderer={cellRenderer}
                            onRowClick={row => setSelectedTx(transactions.find(t => t.id === row.id))}
                            onEdit={hasEditPermission ? handleOpenEdit : null}
                            rowKey="id"
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="품번, 품명, 참조문서 검색..."
                            />
                            )}
                            </div>

            </div>

            <ManualTransactionModal
                isOpen={isManualOpen}
                onClose={() => setIsManualOpen(false)}
                onSave={handleSaveManual}
                parts={parts}
                inventoryMap={inventoryMap}
            />

            {selectedPartId && (
                <PartsDetailPanel
                    partId={selectedPartId}
                    parts={parts}
                    filteredParts={parts.map(p => p.PartID)}
                    onPartSelect={setSelectedPartId}
                    allBoms={allBoms}
                    onClose={() => setSelectedPartId(null)}
                />
            )}

            <BarcodeScannerModal
                isOpen={isBarcodeScannerOpen}
                onClose={() => setIsBarcodeScannerOpen(false)}
                onSave={handleSaveTransaction}
                parts={parts}
                inventoryMap={inventoryMap}
            />

            <EditTransactionModal
                isOpen={isEditOpen}
                onClose={() => { setIsEditOpen(false); setEditTargetTx(null); }}
                transaction={editTargetTx}
                onSave={handleSaveRevision}
            />

            <TransactionDetailPanel
                isOpen={!!selectedTx}
                onClose={() => setSelectedTx(null)}
                transaction={selectedTx}
            />

            <style>{`
                @keyframes scan {
                    0%, 100% { top: 0%; }
                    50% { top: 100%; }
                }
            `}</style>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 바코드 QR 스캔 모달 (Simulated Scanner)
// ─────────────────────────────────────────────────────────────
function BarcodeScannerModal({ isOpen, onClose, onSave, parts, inventoryMap }) {
    const [type, setType] = useState('In');
    const [scannedPart, setScannedPart] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [location, setLocation] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [reason, setReason] = useState('');
    const [refDoc, setRefDoc] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [onHandStock, setOnHandStock] = useState(0);
    const [loading, setLoading] = useState(false);

    const playBeep = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } catch (e) { console.error(e); }
    };

    const handleScanPart = (part) => {
        playBeep();
        setScannedPart(part);
        const stock = inventoryMap[part.PartID]?.OnHand || 0;
        setOnHandStock(stock);
        setLocation(part.DefaultLocation || '');
        
        const todayStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        const randHex = Math.floor(1000 + Math.random() * 9000);
        setLotNumber(`LOT-${todayStr}-${randHex}`);
        setReason(type === 'In' ? '바코드 QR 스캔 입고' : '바코드 QR 스캔 출고');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!scannedPart || quantity <= 0) return alert('스캔한 품목과 수량을 입력해주세요.');

        let isNegative = false;
        if (type === 'Out' && quantity > onHandStock) {
            const confirmProceed = window.confirm(
                `[경고] 출고 수량(${quantity} EA)이 현재고(${onHandStock} EA)보다 많습니다.\n` +
                `이대로 진행할 경우 재고가 마이너스(-${quantity - onHandStock} EA)가 됩니다.\n` +
                `비정상 트랜잭션으로 강제 진행하시겠습니까?`
            );
            if (!confirmProceed) return;
            isNegative = true;
        }

        setLoading(true);
        try {
            await onSave({
                PartID: scannedPart.PartID,
                Type: type,
                Quantity: quantity,
                Location: location,
                LotNumber: lotNumber,
                Reason: reason,
                RefDoc: refDoc,
                CustomerName: customerName,
                NegativeStockDetected: isNegative
            });
            setScannedPart(null);
            setQuantity(1);
            setLocation('');
            setLotNumber('');
            setReason('');
            setRefDoc('');
            setCustomerName('');
            onClose();
        } catch (err) {
            console.error(err);
            alert('등록 실패');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] md:h-[650px] transform transition-all animate-in zoom-in-95 duration-200">
                {/* Left: Barcode Scanner Viewport Simulation */}
                <div className="w-full md:w-1/2 bg-slate-950 flex flex-col relative p-5 justify-between">
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-10">
                        <div className="w-64 h-48 border-2 border-emerald-500 rounded-2xl relative overflow-hidden flex items-center justify-center bg-emerald-500/5">
                            <div className="absolute left-0 right-0 h-[2px] bg-red-500 shadow-md shadow-red-500/80 top-0 animate-[scan_2s_ease-in-out_infinite]"></div>
                            <Barcode size={48} className="text-white/20" />
                        </div>
                        <p className="text-[11px] text-emerald-400 font-bold uppercase tracking-widest mt-4 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800/30">
                            PDA / CAMERA SCANNER SIMULATOR ACTIVE
                        </p>
                    </div>

                    <div className="z-10 flex justify-between items-center text-white">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">바코드 시뮬레이터</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-2 py-0.5 rounded-full">REALTIME</span>
                    </div>

                    <div className="z-10 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-2xl p-4 mt-auto">
                        <p className="text-[10px] text-slate-400 font-bold mb-2.5">
                            아래 부품 바코드를 클릭하여 가상 리더기로 스캔(태그)하세요:
                        </p>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                            {parts.map(p => (
                                <button
                                    key={p.PartID}
                                    type="button"
                                    onClick={() => handleScanPart(p)}
                                    className={`text-left px-3 py-2 bg-slate-950 hover:bg-emerald-950/20 border rounded-xl text-xs transition-all flex justify-between items-center group ${scannedPart?.PartID === p.PartID ? 'border-emerald-500 bg-emerald-950/15' : 'border-slate-800 hover:border-emerald-800/50'}`}
                                >
                                    <div>
                                        <p className="text-[9px] font-mono text-slate-500 group-hover:text-emerald-400">{p.PartID}</p>
                                        <p className="text-slate-200 text-xs font-bold truncate max-w-[120px]">{p.Name}</p>
                                    </div>
                                    <Barcode size={16} className="text-slate-600 group-hover:text-emerald-400 shrink-0 ml-1" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Input Form and Status */}
                <form onSubmit={handleSubmit} className="w-full md:w-1/2 flex flex-col bg-white h-full justify-between">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Barcode className="text-slate-800"/> 고속 입출고 바코드 스캔
                            </h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5">스캔된 부품의 트랜잭션을 실시간 수집 및 승인</p>
                        </div>
                        <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"><X size={18}/></button>
                    </div>

                    <div className="p-6 flex-1 overflow-y-auto space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => { setType('In'); if(scannedPart) setReason('바코드 QR 스캔 입고'); }}
                                className={`py-3.5 rounded-2xl text-xs font-black border-2 transition-all flex items-center justify-center gap-2 ${type === 'In' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-md shadow-blue-100' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                            >
                                <ArrowDownCircle size={16}/> 입고 (IN)
                            </button>
                            <button
                                type="button"
                                onClick={() => { setType('Out'); if(scannedPart) setReason('바코드 QR 스캔 출고'); }}
                                className={`py-3.5 rounded-2xl text-xs font-black border-2 transition-all flex items-center justify-center gap-2 ${type === 'Out' ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-md shadow-orange-100' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                            >
                                <ArrowUpCircle size={16}/> 출고 (OUT)
                            </button>
                        </div>

                        {scannedPart ? (
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[9px] font-mono font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full inline-block">SCANNED SUCCESSFULLY</p>
                                        <h3 className="text-base font-black text-slate-800 mt-1.5">{scannedPart.Name}</h3>
                                        <p className="text-xs text-slate-500 font-bold font-mono">{scannedPart.PartID}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-slate-400 uppercase">현재고</p>
                                        <p className="text-lg font-black text-slate-800">{onHandStock.toLocaleString()} <span className="text-xs text-slate-500">EA</span></p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-emerald-100/60 text-xs">
                                    <div>
                                        <span className="font-bold text-slate-400 block">기본 로케이션</span>
                                        <span className="font-black text-emerald-600">{scannedPart.DefaultLocation || '-'}</span>
                                    </div>
                                    <div>
                                        <span className="font-bold text-slate-400 block">규격 사양</span>
                                        <span className="font-bold text-slate-600 truncate block">{scannedPart.Spec || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400">
                                <Barcode size={40} className="mb-2 opacity-30 animate-pulse text-indigo-500" />
                                <p className="text-xs font-black text-slate-700">대기 중 (Awaiting Barcode Scan)</p>
                                <p className="text-[11px] text-slate-400 mt-1 text-center">오른쪽의 시뮬레이터에서 부품 바코드를 터치하여 스캔을 모방하세요.</p>
                            </div>
                        )}

                        {scannedPart && (
                            <div className="space-y-3.5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">수량 (Quantity) <span className="text-rose-500">*</span></label>
                                        <input
                                            type="number" min="1" value={quantity}
                                            onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">보관 로케이션 <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text" value={location}
                                            onChange={e => setLocation(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">제조 LOT 번호 <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text" value={lotNumber}
                                            onChange={e => setLotNumber(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">거래처 / 고객사</label>
                                        <input
                                            type="text" value={customerName}
                                            onChange={e => setCustomerName(e.target.value)}
                                            placeholder="협력업체 또는 고객사명"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">참조 문서</label>
                                        <input
                                            type="text" value={refDoc}
                                            onChange={e => setRefDoc(e.target.value)}
                                            placeholder="PO-2024..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">입출고 사유 <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text" value={reason}
                                            onChange={e => setReason(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-2 justify-end">
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-650 bg-slate-100 hover:bg-slate-200 transition-all">취소</button>
                        <button
                            type="submit"
                            disabled={loading || !scannedPart}
                            className={`px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-md transition-all flex items-center gap-2 ${type === 'In' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'} disabled:opacity-40 disabled:shadow-none`}
                        >
                            {loading ? '등록 중...' : '확인 및 재고 등록'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 원장 수정용 모달 (Edit Transaction Modal)
// ─────────────────────────────────────────────────────────────
function EditTransactionModal({ isOpen, onClose, transaction, onSave }) {
    const [form, setForm] = useState({
        Quantity: 0,
        Location: '',
        LotNumber: '',
        Reason: '',
        RefDoc: '',
        CustomerName: ''
    });
    const [revisionReason, setRevisionReason] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && transaction) {
            setForm({
                Quantity: transaction.Quantity || 0,
                Location: transaction.Location || '',
                LotNumber: transaction.LotNumber || '',
                Reason: transaction.Reason || '',
                RefDoc: transaction.RefDoc || '',
                CustomerName: transaction.CustomerName || ''
            });
            setRevisionReason('');
        }
    }, [isOpen, transaction]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!revisionReason.trim()) return alert('수정 사유를 상세하게 입력해주십시오. (Audit Trail 강제)');
        setLoading(true);
        try {
            await onSave(transaction, form, revisionReason.trim());
            onClose();
        } catch (e) {
            console.error(e);
            alert('수정 실패');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !transaction) return null;

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-base font-black text-slate-805 flex items-center gap-2">
                            <Edit2 size={16} className="text-indigo-600"/> 입출고 원장 데이터 수정
                        </h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">휴먼 에러로 인한 오기입 정정 및 변경 이력 추적</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"><X size={18}/></button>
                </div>

                <div className="p-6 space-y-4 flex-1">
                    <div className="bg-indigo-50/55 border border-indigo-100 rounded-xl p-3.5 flex justify-between items-center text-xs">
                        <div>
                            <span className="text-[9px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full inline-block mb-1">원장 대상 정보</span>
                            <p className="font-mono font-black text-slate-750">품번: {transaction.PartID}</p>
                            <p className="font-bold text-slate-600">구분: {transaction.Type === 'In' ? '입고 (IN)' : '출고 (OUT)'}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase">최초 처리자</p>
                            <p className="font-bold text-slate-705">{transaction.CreatedBy || 'System'}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">수량 (Quantity) <span className="text-rose-500">*</span></label>
                            <input
                                type="number" min="1" value={form.Quantity}
                                onChange={e => setForm(prev => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">보관 위치 <span className="text-rose-500">*</span></label>
                            <input
                                type="text" value={form.Location}
                                onChange={e => setForm(prev => ({ ...prev, Location: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">제조 LOT 번호 <span className="text-rose-500">*</span></label>
                            <input
                                type="text" value={form.LotNumber}
                                onChange={e => setForm(prev => ({ ...prev, LotNumber: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">거래처 / 고객사</label>
                            <input
                                type="text" value={form.CustomerName}
                                onChange={e => setForm(prev => ({ ...prev, CustomerName: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">참조 문서</label>
                            <input
                                type="text" value={form.RefDoc}
                                onChange={e => setForm(prev => ({ ...prev, RefDoc: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">사유 / 비고 <span className="text-rose-500">*</span></label>
                            <input
                                type="text" value={form.Reason}
                                onChange={e => setForm(prev => ({ ...prev, Reason: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <AlertTriangle size={12}/> 수정 승인 사유 입력 (Audit Trail 필수) <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                            value={revisionReason}
                            onChange={setRevisionReason}
                            placeholder="예: 수량 오입력 정정, 바코드 스캔 오류 수정 등 구체적 기입..."
                            rows="2"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                            required
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-650 bg-slate-100 hover:bg-slate-200 transition-all">취소</button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-100 transition-all"
                    >
                        {loading ? '처리 중...' : '원장 수정 반영 및 로깅'}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────
// 상세 이력 및 변경 타임라인 사이드 패널 (Transaction Detail Panel)
// ─────────────────────────────────────────────────────────────
function TransactionDetailPanel({ isOpen, onClose, transaction }) {
    const [revisions, setRevisions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && transaction) {
            fetchRevisions();
        } else {
            setRevisions([]);
        }
    }, [isOpen, transaction]);

    const fetchRevisions = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'transaction_revisions'),
                where('TransactionId', '==', transaction.id)
            );
            const snap = await getDocs(q);
            const list = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => {
                const timeA = a.RevisionDate?.seconds || 0;
                const timeB = b.RevisionDate?.seconds || 0;
                return timeB - timeA;
            });
            setRevisions(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !transaction) return null;

    const dateObj = transaction.Date?.toDate ? transaction.Date.toDate() : (transaction.Date ? new Date(transaction.Date) : null);
    const dateStr = dateObj ? dateObj.toLocaleString('ko-KR') : '-';

    return createPortal(
        <div className="relative z-[9999]">
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[140]" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-slate-50 shadow-2xl z-[150] flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${transaction.Type === 'In' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                {transaction.Type === 'In' ? '입고 (IN)' : '출고 (OUT)'}
                            </span>
                            {transaction.NegativeStockDetected && (
                                <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[9px] font-black animate-pulse">부족재고강제출고</span>
                            )}
                            {transaction.Abnormal && (
                                <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[9px] font-black">이상감지</span>
                            )}
                        </div>
                        <h2 className="text-lg font-black text-slate-900">수불 상세 정보 및 Audit Trail</h2>
                        <p className="text-xs text-slate-400 font-medium font-mono mt-0.5">ID: {transaction.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                        <h3 className="text-xs font-black text-slate-700 border-b pb-2">기본 이력 정보</h3>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                            <div><p className="font-bold text-slate-400 mb-0.5">품번 (Part ID)</p><p className="font-mono font-black text-blue-600">{transaction.PartID}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">품명 (Part Name)</p><p className="font-black text-slate-800">{transaction.PartName}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">수량 (Quantity)</p><p className="font-black text-slate-850">{transaction.Quantity?.toLocaleString()} EA</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">일자 (Date)</p><p className="font-black text-slate-805">{dateStr}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">보관 위치 (Location)</p><p className="font-black text-emerald-600">{transaction.Location || '-'}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">제조 LOT 번호</p><p className="font-mono font-black text-slate-700">{transaction.LotNumber || '-'}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">참조 문서 번호</p><p className="font-mono font-bold text-slate-650">{transaction.RefDoc || '-'}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">거래처 / 고객사</p><p className="font-black text-slate-800">{transaction.CustomerName || '-'}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">처리자</p><p className="font-bold text-slate-600">{transaction.CreatedBy || 'System'}</p></div>
                            <div><p className="font-bold text-slate-400 mb-0.5">등록 구분</p><p className="font-bold text-slate-600">{transaction.ManualEntry ? '수동 입력' : '자동 기록'}</p></div>
                        </div>
                        {transaction.Reason && (
                            <div className="pt-2 border-t">
                                <p className="text-[10px] font-bold text-slate-400 mb-0.5">사유 / 비고</p>
                                <p className="text-xs font-semibold text-slate-750 bg-slate-50 border rounded-lg p-2 leading-relaxed">{transaction.Reason}</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="text-xs font-black text-slate-700">변경 이력 (Audit Trail Timeline)</h3>
                            <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{revisions.length}건 수정됨</span>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-500" /></div>
                        ) : revisions.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-6">수정 이력이 없는 최초 보관 문서입니다.</p>
                        ) : (
                            <div className="space-y-4 pl-1 pt-1.5 relative before:absolute before:left-[11px] before:top-[12px] before:bottom-3 before:w-[1.5px] before:bg-slate-200">
                                {revisions.map((rev, idx) => {
                                    const revDate = rev.RevisionDate?.toDate ? rev.RevisionDate.toDate() : new Date();
                                    const revDateStr = revDate.toLocaleString('ko-KR');
                                    
                                    return (
                                        <div key={rev.id} className="relative pl-6 flex flex-col text-xs">
                                            <span className="absolute left-[7.5px] top-[3px] w-2 h-2 rounded-full bg-rose-500 ring-4 ring-rose-100" />
                                            
                                            <div className="flex justify-between font-bold text-slate-800">
                                                <span className="text-slate-900">수정자: {rev.RevisedByName || 'Manager'}</span>
                                                <span className="text-[10px] text-slate-400">{revDateStr}</span>
                                            </div>
                                            <p className="text-[10px] text-rose-600 font-black mt-0.5">수정 사유: {rev.RevisionReason}</p>
                                            
                                            <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 mt-2 space-y-1.5 text-[10px] leading-relaxed">
                                                <p className="font-bold text-slate-400">변경 내역 diff:</p>
                                                
                                                <div className="grid grid-cols-2 gap-2 text-slate-650">
                                                    {rev.Before.Quantity !== rev.After.Quantity && (
                                                        <div className="col-span-2 flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-350" />
                                                            <span>수량: <del className="text-red-500">{rev.Before.Quantity}</del> → <ins className="text-emerald-600 no-underline font-bold">{rev.After.Quantity}</ins> EA</span>
                                                        </div>
                                                    )}
                                                    {rev.Before.Location !== rev.After.Location && (
                                                        <div className="col-span-2 flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-350" />
                                                            <span>보관 위치: <del className="text-red-500">{rev.Before.Location || '공란'}</del> → <ins className="text-emerald-600 no-underline font-bold">{rev.After.Location}</ins></span>
                                                        </div>
                                                    )}
                                                    {rev.Before.LotNumber !== rev.After.LotNumber && (
                                                        <div className="col-span-2 flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-350" />
                                                            <span>LOT 번호: <del className="text-red-500">{rev.Before.LotNumber || '공란'}</del> → <ins className="text-emerald-600 no-underline font-bold">{rev.After.LotNumber}</ins></span>
                                                        </div>
                                                    )}
                                                    {rev.Before.Reason !== rev.After.Reason && (
                                                        <div className="col-span-2 flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-350" />
                                                            <span>사유: <del className="text-red-500">{rev.Before.Reason || '공란'}</del> → <ins className="text-emerald-600 no-underline font-bold">{rev.After.Reason}</ins></span>
                                                        </div>
                                                    )}
                                                    {rev.Before.CustomerName !== rev.After.CustomerName && (
                                                        <div className="col-span-2 flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-350" />
                                                            <span>고객사: <del className="text-red-500">{rev.Before.CustomerName || '공란'}</del> → <ins className="text-emerald-600 no-underline font-bold">{rev.After.CustomerName}</ins></span>
                                                        </div>
                                                    )}
                                                    {rev.Before.RefDoc !== rev.After.RefDoc && (
                                                        <div className="col-span-2 flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-350" />
                                                            <span>참조문서: <del className="text-red-500">{rev.Before.RefDoc || '공란'}</del> → <ins className="text-emerald-600 no-underline font-bold">{rev.After.RefDoc}</ins></span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
