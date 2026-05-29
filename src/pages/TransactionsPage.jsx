import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import {
    History, ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown,
    Filter, Download, Plus, X, Search, Package, Users, Calendar,
    RefreshCw, FileText, AlertTriangle
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// 기간 필터 옵션
// ─────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
    { key: '1w', label: '최근 1주' },
    { key: '1m', label: '최근 1개월' },
    { key: '3m', label: '최근 3개월' },
    { key: 'all', label: '전체' },
];

const COLUMN_DEFS = {
    Type:      { label: '구분',       default: true  },
    Date:      { label: '일자',       default: true  },
    PartID:    { label: '품번',       default: true  },
    PartName:  { label: '품명',       default: true  },
    Quantity:  { label: '수량',       default: true  },
    RefDoc:    { label: '참조 문서',  default: true  },
    Reason:    { label: '사유',       default: true  },
    CreatedBy: { label: '처리자',     default: false },
};

// 수동 입출고 등록 모달
function ManualTransactionModal({ isOpen, onClose, onSave, parts }) {
    const [form, setForm] = useState({ PartID: '', Type: 'In', Quantity: 1, Reason: '', RefDoc: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) setForm({ PartID: '', Type: 'In', Quantity: 1, Reason: '', RefDoc: '' });
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.PartID || form.Quantity <= 0) return alert('품번과 수량을 정확히 입력해주세요.');
        setLoading(true);
        try {
            await onSave(form);
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
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                <div className={`flex justify-between items-center p-5 border-b text-white ${form.Type === 'In' ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-orange-500 to-orange-600'}`}>
                    <div className="flex items-center gap-3">
                        {form.Type === 'In' ? <ArrowDownCircle size={22}/> : <ArrowUpCircle size={22}/>}
                        <div>
                            <h2 className="text-base font-black">수동 입출고 등록</h2>
                            <p className={`text-xs mt-0.5 ${form.Type === 'In' ? 'text-blue-200' : 'text-orange-200'}`}>재고 조정, 보정 등 수기 입력 시 사용</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl"><X size={18}/></button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* 입/출고 선택 */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, Type: 'In' }))}
                            className={`py-3 rounded-xl text-sm font-black border-2 transition-all flex items-center justify-center gap-2 ${form.Type === 'In' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                        >
                            <ArrowDownCircle size={18}/> 입고 (IN)
                        </button>
                        <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, Type: 'Out' }))}
                            className={`py-3 rounded-xl text-sm font-black border-2 transition-all flex items-center justify-center gap-2 ${form.Type === 'Out' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                        >
                            <ArrowUpCircle size={18}/> 출고 (OUT)
                        </button>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1 block">품번 (Part ID) <span className="text-rose-500">*</span></label>
                        <select
                            value={form.PartID}
                            onChange={e => setForm(prev => ({ ...prev, PartID: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">품번을 선택하세요</option>
                            {parts.map(p => <option key={p.PartID || p.id} value={p.PartID}>[{p.PartID}] {p.Name}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">수량 <span className="text-rose-500">*</span></label>
                            <input
                                type="number" min="1" value={form.Quantity}
                                onChange={e => setForm(prev => ({ ...prev, Quantity: parseInt(e.target.value) || 0 }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">참조 문서 번호</label>
                            <input
                                type="text" value={form.RefDoc}
                                onChange={e => setForm(prev => ({ ...prev, RefDoc: e.target.value }))}
                                placeholder="PO-2024..., PR-2024..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1 block">사유 / 비고 <span className="text-rose-500">*</span></label>
                        <input
                            type="text" value={form.Reason}
                            onChange={e => setForm(prev => ({ ...prev, Reason: e.target.value }))}
                            placeholder="예) 재고 보정, 실사 조정, 반품 처리..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0"/>
                        <p className="text-xs font-bold text-amber-700">수동 입출고 등록은 창고 재고에 즉시 반영됩니다. 사유를 정확히 기록해주세요.</p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200">취소</button>
                        <button
                            type="submit" disabled={loading}
                            className={`px-5 py-2 rounded-xl text-xs font-black text-white shadow-md flex items-center gap-2 ${form.Type === 'In' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'}`}
                        >
                            {loading ? '등록 중...' : `${form.Type === 'In' ? '입고' : '출고'} 등록`}
                        </button>
                    </div>
                </form>
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
    const [loading, setLoading] = useState(true);

    // 필터 상태
    const [activeTab, setActiveTab] = useState('ALL');    // ALL | IN | OUT | SALES
    const [period, setPeriod] = useState('1m');
    const [searchTerm, setSearchTerm] = useState('');
    const [isManualOpen, setIsManualOpen] = useState(false);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [txSnap, partsSnap] = await Promise.all([
                getDocs(query(collection(db, 'transactions'), orderBy('Date', 'desc'))),
                getDocs(collection(db, 'parts')),
            ]);
            const partsMap = {};
            partsSnap.docs.forEach(d => {
                const data = d.data();
                if (data.PartID) partsMap[data.PartID] = data.Name || '-';
            });
            setParts(partsSnap.docs.map(d => d.data()).filter(p => p.PartID).sort((a, b) => (a.Name || '').localeCompare(b.Name || '')));

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

    // 필터링 및 데이터 가공
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
        if (activeTab === 'IN')    result = result.filter(t => t.Type === 'In');
        if (activeTab === 'OUT')   result = result.filter(t => t.Type === 'Out');
        if (activeTab === 'SALES') result = result.filter(t => t.CustomerName || t.Reason?.includes('출하') || t.Reason?.includes('고객'));

        // 검색 필터
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(t =>
                t.PartID?.toLowerCase().includes(lower) ||
                t.PartName?.toLowerCase().includes(lower) ||
                t.RefDoc?.toLowerCase().includes(lower) ||
                t.Reason?.toLowerCase().includes(lower)
            );
        }

        // 렌더용 포맷
        return result.map(t => {
            const dateObj = t.Date?.toDate ? t.Date.toDate() : (t.Date ? new Date(t.Date) : null);
            const dateStr = dateObj ? dateObj.toLocaleDateString('ko-KR') : '-';
            const timeStr = dateObj ? dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

            return {
                ...t,
                Type: t.Type === 'In'
                    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200"><ArrowDownCircle size={11}/> 입고</span>
                    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-orange-50 text-orange-700 border border-orange-200"><ArrowUpCircle size={11}/> 출고</span>,
                Date: <div><p className="text-xs font-bold text-slate-800">{dateStr}</p><p className="text-[10px] text-slate-400">{timeStr}</p></div>,
                PartID: <span className="font-mono text-xs font-bold text-blue-600">{t.PartID}</span>,
                PartName: <div><p className="text-xs font-bold text-slate-800">{t.PartName}</p></div>,
                Quantity: <span className={`text-sm font-black ${t.Type === 'In' ? 'text-blue-600' : 'text-orange-600'}`}>
                    {t.Type === 'In' ? '+' : '-'}{(t.Quantity || 0).toLocaleString()}
                </span>,
                RefDoc: t.RefDoc ? <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">{t.RefDoc}</span> : <span className="text-slate-300 text-xs">-</span>,
                Reason: <span className="text-xs text-slate-600 font-medium">{t.Reason || '-'}</span>,
                CreatedBy: <span className="text-[10px] text-slate-400 font-medium">{t.CreatedBy || 'System'}</span>,
            };
        });
    }, [transactions, activeTab, period, searchTerm]);

    const handleSaveManual = async (formData) => {
        await addDoc(collection(db, 'transactions'), {
            ...formData,
            Date: serverTimestamp(),
            CreatedBy: userProfile?.uid || 'Manual',
            ManualEntry: true,
        });
        await fetchAll();
    };

    const handleExportCSV = () => {
        const header = ['구분', '일자', '품번', '품명', '수량', '참조문서', '사유'];
        const cutoff = getPeriodDate();
        let result = transactions;
        if (cutoff) result = result.filter(t => {
            const d = t.Date?.toDate ? t.Date.toDate() : null;
            return d && d >= cutoff;
        });
        if (activeTab === 'IN')    result = result.filter(t => t.Type === 'In');
        if (activeTab === 'OUT')   result = result.filter(t => t.Type === 'Out');
        if (activeTab === 'SALES') result = result.filter(t => t.CustomerName || t.Reason?.includes('출하'));
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(t => t.PartID?.toLowerCase().includes(lower) || t.PartName?.toLowerCase().includes(lower));
        }

        const rows = result.map(t => {
            const d = t.Date?.toDate ? t.Date.toDate() : null;
            return [
                t.Type === 'In' ? '입고' : '출고',
                d ? d.toLocaleDateString('ko-KR') : '-',
                t.PartID || '-',
                t.PartName || '-',
                t.Quantity || 0,
                t.RefDoc || '-',
                t.Reason || '-',
            ].join(',');
        });

        const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `수불원장_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.csv`;
        link.click();
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
                        onClick={handleExportCSV}
                        className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-black hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2"
                    >
                        <Download size={16}/> CSV 내보내기
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
                        />
                    )}
                </div>
            </div>

            <ManualTransactionModal
                isOpen={isManualOpen}
                onClose={() => setIsManualOpen(false)}
                onSave={handleSaveManual}
                parts={parts}
            />
        </div>
    );
}
