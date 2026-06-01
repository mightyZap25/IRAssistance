import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, addDoc, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { 
    CreditCard, Search, Filter, RefreshCw, 
    Plus, DollarSign, Clock, CheckCircle2, 
    AlertCircle, Building2, FileText, Calendar,
    ArrowDownLeft, MoreHorizontal, Download
} from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';

const BILLING_STATUS = {
    PENDING: { label: '미수금', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    PARTIAL: { label: '부분 입금', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    PAID: { label: '완납', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    OVERDUE: { label: '기한 초과', color: 'bg-rose-50 text-rose-600 border-rose-200' }
};

const COLUMN_DEFS = {
    InvoiceNo: { label: '청구 번호', default: true },
    CustomerName: { label: '고객사', default: true },
    Amount: { label: '청구 금액', default: true },
    PaidAmount: { label: '입금액', default: true },
    Balance: { label: '잔액', default: true },
    DueDate: { label: '지급 기한', default: true },
    Status: { label: '상태', default: true },
};

const RegisterDepositModal = ({ isOpen, onClose, onSave, billing }) => {
    const [amount, setAmount] = useState(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && billing) {
            setAmount(billing.Balance || 0);
        }
    }, [isOpen, billing]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (amount <= 0) return alert('입금액을 입력해주세요.');
        
        setLoading(true);
        try {
            await onSave(billing.id, amount, date);
            onClose();
        } catch (error) {
            console.error(error);
            alert('입금 등록 중 오류 발생');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !billing) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <DollarSign className="text-emerald-600"/> 입금 내역 등록
                        </h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">RECORD NEW DEPOSIT TRANSACTION</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl transition-all"><X size={20}/></button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Billing Target</p>
                        <p className="text-sm font-black text-slate-800">{billing.CustomerName}</p>
                        <p className="text-[11px] font-mono text-emerald-600 mt-0.5">{billing.InvoiceNo}</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">입금 금액 (₩)</label>
                        <input 
                            type="number"
                            value={amount}
                            onChange={e => setAmount(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500"
                            required
                        />
                        <p className="text-[10px] text-rose-500 font-bold px-1">미수금 잔액: ₩ {billing.Balance.toLocaleString()}</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">입금 일자</label>
                        <input 
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-500"
                            required
                        />
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-slate-100 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-xs font-black bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all uppercase tracking-widest">취소</button>
                    <button type="submit" disabled={loading} className="flex-[2] py-3 rounded-2xl text-xs font-black bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all uppercase tracking-widest">
                        {loading ? '처리 중...' : '입금 확정 (Confirm)'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default function BillingPage() {
    const [billings, setBillings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedBilling, setSelectedBilling] = useState(null);
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

    useEffect(() => {
        fetchBillings();
    }, []);

    const fetchBillings = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'billing'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setBillings(snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                Amount: doc.data().Amount || 0,
                PaidAmount: doc.data().PaidAmount || 0,
                Balance: (doc.data().Amount || 0) - (doc.data().PaidAmount || 0)
            })));
        } catch (error) {
            console.error("Failed to fetch billings", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveDeposit = async (id, amount, date) => {
        const billing = billings.find(b => b.id === id);
        if (!billing) return;

        const newPaidAmount = billing.PaidAmount + amount;
        let newStatus = 'PARTIAL';
        if (newPaidAmount >= billing.Amount) {
            newStatus = 'PAID';
        }

        try {
            await updateDoc(doc(db, 'billing', id), {
                PaidAmount: newPaidAmount,
                Status: newStatus,
                updatedAt: serverTimestamp(),
                lastDepositDate: date
            });

            // Log this transaction in global transactions collection
            await addDoc(collection(db, 'transactions'), {
                Type: 'REVENUE',
                Amount: amount,
                Date: date,
                RefID: id,
                RefNo: billing.InvoiceNo,
                CustomerName: billing.CustomerName,
                Reason: `Invoice ${billing.InvoiceNo} Payment`,
                CreatedAt: serverTimestamp()
            });

            fetchBillings();
        } catch (error) {
            console.error("Deposit registration failed", error);
            throw error;
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        // Simulate external bank/payment system sync
        setTimeout(async () => {
            alert('은행 입금 내역과 동기화가 완료되었습니다. (8건의 새로운 입금 매칭됨)');
            setIsSyncing(false);
            fetchBillings();
        }, 2000);
    };

    const filteredBillings = useMemo(() => {
        return billings.filter(b => 
            (b.InvoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (b.CustomerName || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [billings, searchTerm]);

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <CreditCard className="text-emerald-600" size={32} />
                        수금 및 영수증 관리
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">입금 트래킹, 결제 시스템 동기화 및 영수증(계산서) 발행을 관리합니다.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-5 py-3 rounded-2xl font-black text-sm transition-all shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? '동기화 중...' : '결제 시스템 동기화'}
                    </button>
                    <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-md shadow-emerald-100 transition-all">
                        <Plus size={18} />
                        수동 입금 등록
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-6 shrink-0">
                {[
                    { label: '당월 입금액', value: '₩ 42.5M', icon: ArrowDownLeft, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: '미수금 총액', value: '₩ 18.2M', icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: '연체 건수', value: '3 건', icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50' },
                    { label: '매칭 대기', value: '12 건', icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' }
                ].map((s, i) => (
                    <div key={i} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className={`p-3 ${s.bg} ${s.color} rounded-2xl`}>
                            <s.icon size={22} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                            <p className={`text-xl font-black ${s.color.replace('text-', 'text-slate-900')}`}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div className="relative w-80">
                        <input 
                            type="text"
                            placeholder="청구 번호, 고객사 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    </div>
                    <div className="flex gap-2">
                        <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"><Filter size={18}/></button>
                        <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"><Download size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-500 font-bold">로딩 중...</div>
                    ) : filteredBillings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-3">
                            <CreditCard size={48} className="opacity-10"/>
                            <p className="text-sm font-bold uppercase tracking-widest italic">No Billing Data Found</p>
                        </div>
                    ) : (
                        <MasterDataGrid 
                            data={filteredBillings}
                            columnDefs={COLUMN_DEFS}
                            idField="id"
                            cellRenderer={{
                                InvoiceNo: (val) => <span className="font-mono font-black text-emerald-600">{val}</span>,
                                CustomerName: (val) => <div className="flex items-center gap-1.5 font-black text-slate-800"><Building2 size={14} className="text-slate-400"/>{val}</div>,
                                Amount: (val) => <span className="font-black text-slate-800">₩ {val.toLocaleString()}</span>,
                                PaidAmount: (val) => <span className="font-black text-emerald-600">₩ {val.toLocaleString()}</span>,
                                Balance: (val) => <span className={`font-black ${val > 0 ? 'text-rose-500' : 'text-slate-400'}`}>₩ {val.toLocaleString()}</span>,
                                Status: (val) => {
                                    const info = BILLING_STATUS[val] || BILLING_STATUS.PENDING;
                                    return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-widest ${info.color}`}>{info.label}</span>
                                }
                            }}
                            actionRenderer={(row) => (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => { setSelectedBilling(row); setIsDepositModalOpen(true); }}
                                        className="text-slate-400 hover:text-emerald-600 transition-colors" title="입금 등록"><DollarSign size={16}/></button>
                                    <button className="text-slate-400 hover:text-blue-600 transition-colors" title="상세보기"><FileText size={16}/></button>
                                    <button className="text-slate-400 hover:text-slate-600 transition-colors"><MoreHorizontal size={16}/></button>
                                </div>
                            )}
                        />
                    )}
                </div>
            </div>

            <RegisterDepositModal 
                isOpen={isDepositModalOpen}
                onClose={() => { setIsDepositModalOpen(false); setSelectedBilling(null); }}
                onSave={handleSaveDeposit}
                billing={selectedBilling}
            />
        </div>
    );
}
