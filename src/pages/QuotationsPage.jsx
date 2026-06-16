import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, deleteDoc, doc, addDoc, serverTimestamp, where, updateDoc } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
    FileText, Plus, Search, Filter, Trash2, Edit2, 
    FileDown, Send, CheckCircle2, Clock, X, Building2,
    Calculator, Package, User, Calendar, Save, Trash
} from 'lucide-react';
import MasterDataGrid from '../components/common/MasterDataGrid';
import QuoteEmailModal from '../components/QuoteEmailModal';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const QUOTE_STATUS = {
    DRAFT: { label: '작성 중', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    SENT: { label: '발송 완료', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    ACCEPTED: { label: '승인됨 (수주)', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    REJECTED: { label: '반려/취소', color: 'bg-rose-50 text-rose-600 border-rose-200' }
};

const COLUMN_DEFS = {
    QuoteNo: { label: '견적 번호', default: true },
    CustomerName: { label: '고객사', default: true },
    Title: { label: '견적 건명', default: true },
    TotalAmount: { label: '총액', default: true },
    Date: { label: '견적일자', default: true },
    ValidUntil: { label: '유효기간', default: false },
    Status: { label: '상태', default: true },
    ownerName: { label: '담당자', default: true }
};

const generateQuoteNo = () => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `QT-${yyyy}${mm}${dd}-${random}`;
};

const QuoteModal = ({ isOpen, onClose, onSave, currentUser, editingQuote }) => {
    const [customers, setCustomers] = useState([]);
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        QuoteNo: generateQuoteNo(),
        CustomerID: '',
        CustomerName: '',
        Title: '',
        Date: new Date().toISOString().split('T')[0],
        ValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        Status: 'DRAFT',
        Items: [],
        TotalAmount: 0,
        Note: '',
        // Enhanced Fields
        CompanyInfo: {
            Name: '주식회사 아이알에이 (IRAssistance)',
            CEO: '홍길동',
            BizNo: '123-45-67890',
            Address: '서울특별시 강남구 테헤란로 123, 10층',
            Contact: '02-1234-5678'
        },
        BankInfo: {
            Bank: '신한은행',
            Account: '110-123-456789',
            Holder: '주식회사 아이알에이'
        },
        Terms: '1. 유효기간: 견적일로부터 30일 이내\n2. 결제조건: 검수 후 14일 이내 현금 결제\n3. 납기: 발주 후 4주 이내'
    });

    useEffect(() => {
        if (isOpen) {
            fetchDependencies();
            if (editingQuote) {
                setFormData(prev => ({ 
                    ...prev, 
                    ...editingQuote,
                    CompanyInfo: editingQuote.CompanyInfo || prev.CompanyInfo,
                    BankInfo: editingQuote.BankInfo || prev.BankInfo,
                    Terms: editingQuote.Terms || prev.Terms
                }));
            } else {
                setFormData({
                    QuoteNo: generateQuoteNo(),
                    CustomerID: '',
                    CustomerName: '',
                    Title: '',
                    Date: new Date().toISOString().split('T')[0],
                    ValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    Status: 'DRAFT',
                    Items: [],
                    TotalAmount: 0,
                    Note: '',
                    CompanyInfo: {
                        Name: '주식회사 아이알에이 (IRAssistance)',
                        CEO: '홍길동',
                        BizNo: '123-45-67890',
                        Address: '서울특별시 강남구 테헤란로 123, 10층',
                        Contact: '02-1234-5678'
                    },
                    BankInfo: {
                        Bank: '신한은행',
                        Account: '110-123-456789',
                        Holder: '주식회사 아이알에이'
                    },
                    Terms: '1. 유효기간: 견적일로부터 30일 이내\n2. 결제조건: 검수 후 14일 이내 현금 결제\n3. 납기: 발주 후 4주 이내'
                });
            }
        }
    }, [isOpen, editingQuote]);

    const fetchDependencies = async () => {
        setLoading(true);
        try {
            const [cSnap, pSnap] = await Promise.all([
                getDocs(query(collection(db, 'customers'), orderBy('Name', 'asc'))),
                getDocs(query(collection(db, 'parts'), where('IsLatestRevision', '==', true)))
            ]);
            setCustomers(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setParts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Dependency fetch failed", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCustomerChange = (e) => {
        const c = customers.find(x => x.id === e.target.value);
        setFormData(prev => ({ ...prev, CustomerID: c?.id || '', CustomerName: c?.Name || '' }));
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            Items: [...prev.Items, { id: Date.now(), PartID: '', Name: '', Spec: '', Qty: 1, UnitPrice: 0, Amount: 0 }]
        }));
    };

    const removeItem = (id) => {
        setFormData(prev => {
            const newItems = prev.Items.filter(item => item.id !== id);
            const total = newItems.reduce((sum, item) => sum + item.Amount, 0);
            return { ...prev, Items: newItems, TotalAmount: total };
        });
    };

    const updateItem = (id, field, value) => {
        setFormData(prev => {
            const newItems = prev.Items.map(item => {
                if (item.id !== id) return item;
                
                let updated = { ...item, [field]: value };
                
                if (field === 'PartID') {
                    const p = parts.find(x => x.PartID === value);
                    if (p) {
                        updated.Name = p.Name;
                        updated.Spec = p.Spec;
                        updated.UnitPrice = Number(p.UnitPrice) || 0;
                    }
                }
                
                updated.Amount = updated.Qty * updated.UnitPrice;
                return updated;
            });
            
            const total = newItems.reduce((sum, item) => sum + item.Amount, 0);
            return { ...prev, Items: newItems, TotalAmount: total };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.CustomerID || formData.Items.length === 0) return alert('고객사와 품목을 최소 1개 이상 입력해주세요.');
        
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error(error);
            alert('저장 중 오류 발생');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl w-full max-w-6xl h-[95vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <FileText className="text-indigo-600"/> {editingQuote ? '견적서 수정' : '신규 견적서 작성'}
                        </h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{editingQuote ? 'UPDATE EXISTING QUOTATION' : 'NEW SALES QUOTATION GENERATOR'}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-xl transition-all"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
                    <div className="grid grid-cols-3 gap-8">
                        {/* Left: Basic & Customer Info */}
                        <div className="col-span-2 space-y-6">
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3 mb-4">
                                    <Building2 size={16} className="text-indigo-600"/> 기본 및 고객 정보
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">고객사 선택</label>
                                        <select 
                                            value={formData.CustomerID} 
                                            onChange={handleCustomerChange} 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500" 
                                            required
                                        >
                                            <option value="">고객사를 선택하세요</option>
                                            {customers.map(c => <option key={c.id} value={c.id}>{c.Name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">견적 일자</label>
                                        <input 
                                            type="date"
                                            value={formData.Date}
                                            onChange={e => setFormData({...formData, Date: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="space-y-1.5 col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">견적 건명</label>
                                        <input 
                                            type="text"
                                            value={formData.Title}
                                            onChange={e => setFormData({...formData, Title: e.target.value})}
                                            placeholder="예: 2026년도 모듈 공급 견적"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Items Section */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                    <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                                        <Package size={16} className="text-indigo-600"/> 견적 세부 품목
                                    </h3>
                                    <button 
                                        type="button" 
                                        onClick={addItem}
                                        className="flex items-center gap-1.5 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all"
                                    >
                                        <Plus size={14}/> 품목 추가
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-white border-b border-slate-50">
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">부품 ID</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">품목명 / 규격</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-20 text-center">수량</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-right">단가 (₩)</th>
                                                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-right">금액 (₩)</th>
                                                <th className="px-4 py-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {formData.Items.map((item) => (
                                                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                                                    <td className="px-4 py-2">
                                                        <select 
                                                            value={item.PartID}
                                                            onChange={e => updateItem(item.id, 'PartID', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none"
                                                        >
                                                            <option value="">품목 선택</option>
                                                            {parts.map(p => <option key={p.id} value={p.PartID}>[{p.PartID}] {p.Name}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-black text-slate-700 truncate max-w-[150px]">{item.Name || '-'}</span>
                                                            <span className="text-[9px] font-medium text-slate-400 truncate max-w-[150px]">{item.Spec || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input 
                                                            type="number"
                                                            min="1"
                                                            value={item.Qty}
                                                            onChange={e => updateItem(item.id, 'Qty', parseInt(e.target.value) || 0)}
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-black text-center outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input 
                                                            type="number"
                                                            min="0"
                                                            value={item.UnitPrice}
                                                            onChange={e => updateItem(item.id, 'UnitPrice', parseInt(e.target.value) || 0)}
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-black text-right outline-none"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <span className="text-[11px] font-black text-slate-900">₩ {item.Amount.toLocaleString()}</span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <button type="button" onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={14}/></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Amount</p>
                                        <p className="text-xl font-black text-indigo-600">₩ {formData.TotalAmount.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Company & Bank Info */}
                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3 mb-4">
                                    <User size={16} className="text-indigo-600"/> 공급자 정보 (Provider)
                                </h3>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">회사명</label>
                                        <input 
                                            type="text"
                                            value={formData.CompanyInfo.Name}
                                            onChange={e => setFormData({...formData, CompanyInfo: {...formData.CompanyInfo, Name: e.target.value}})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">대표자</label>
                                            <input 
                                                type="text"
                                                value={formData.CompanyInfo.CEO}
                                                onChange={e => setFormData({...formData, CompanyInfo: {...formData.CompanyInfo, CEO: e.target.value}})}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">사업자번호</label>
                                            <input 
                                                type="text"
                                                value={formData.CompanyInfo.BizNo}
                                                onChange={e => setFormData({...formData, CompanyInfo: {...formData.CompanyInfo, BizNo: e.target.value}})}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">주소</label>
                                        <input 
                                            type="text"
                                            value={formData.CompanyInfo.Address}
                                            onChange={e => setFormData({...formData, CompanyInfo: {...formData.CompanyInfo, Address: e.target.value}})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3 mb-4">
                                    <Calculator size={16} className="text-indigo-600"/> 입금 계좌 정보 (Bank)
                                </h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">은행명</label>
                                            <input 
                                                type="text"
                                                value={formData.BankInfo.Bank}
                                                onChange={e => setFormData({...formData, BankInfo: {...formData.BankInfo, Bank: e.target.value}})}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">예금주</label>
                                            <input 
                                                type="text"
                                                value={formData.BankInfo.Holder}
                                                onChange={e => setFormData({...formData, BankInfo: {...formData.BankInfo, Holder: e.target.value}})}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">계좌번호</label>
                                        <input 
                                            type="text"
                                            value={formData.BankInfo.Account}
                                            onChange={e => setFormData({...formData, BankInfo: {...formData.BankInfo, Account: e.target.value}})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">견적 조건 (Terms & Conditions)</label>
                                <textarea 
                                    rows="4"
                                    value={formData.Terms}
                                    onChange={e => setFormData({...formData, Terms: e.target.value})}
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-[11px] font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-slate-200 shrink-0 flex gap-3">
                    <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-2xl text-xs font-black bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all uppercase tracking-widest">취소 (Cancel)</button>
                    <button type="submit" disabled={loading} className="flex-[2] py-3.5 rounded-2xl text-xs font-black bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                        {loading ? '처리 중...' : <><Save size={16}/> {editingQuote ? '견적서 수정하기 (Update)' : '견적서 저장하기 (Save)'}</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default function QuotationsPage() {
    const { currentUser, userProfile } = useAuth();
    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingQuote, setEditingQuote] = useState(null);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [selectedQuoteForEmail, setSelectedQuoteForEmail] = useState(null);

    useEffect(() => {
        fetchQuotes();
    }, []);

    const fetchQuotes = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'quotations'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setQuotes(snap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                Date: doc.data().Date || '',
                TotalAmount: doc.data().TotalAmount || 0
            })));
        } catch (error) {
            console.error("Failed to fetch quotes", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveQuote = async (data) => {
        try {
            if (data.id) {
                const { id, ...updateData } = data;
                await updateDoc(doc(db, 'quotations', id), {
                    ...updateData,
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, 'quotations'), {
                    ...data,
                    ownerUid: currentUser.uid,
                    ownerEmail: currentUser.email,
                    ownerName: userProfile?.name || currentUser.displayName || '영업담당',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            fetchQuotes();
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const handleEdit = (quote) => {
        setEditingQuote(quote);
        setIsModalOpen(true);
    };

    const handleOpenEmailModal = (quote) => {
        setSelectedQuoteForEmail(quote);
        setIsEmailModalOpen(true);
    };

    const handleSendQuoteEmail = async ({ subject, content, recipients }) => {
        if (!selectedQuoteForEmail) return;
        try {
            await handleStatusChange(selectedQuoteForEmail.id, 'SENT');
        } catch (err) {
            console.error('상태 변경 실패:', err);
        }
    };

    const handleDelete = async (id) => {
        if(!window.confirm('이 견적서를 영구 삭제하시겠습니까?')) return;
        try {
            await deleteDoc(doc(db, 'quotations', id));
            setQuotes(quotes.filter(q => q.id !== id));
        } catch (error) {
            console.error(error);
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        const quote = quotes.find(q => q.id === id);
        if (!quote) return;

        try {
            await updateDoc(doc(db, 'quotations', id), {
                Status: newStatus,
                updatedAt: serverTimestamp()
            });

            // When accepted, create a billing record
            if (newStatus === 'ACCEPTED') {
                await addDoc(collection(db, 'billing'), {
                    QuoteID: id,
                    InvoiceNo: `INV-${quote.QuoteNo.split('-').slice(1).join('-')}`,
                    CustomerID: quote.CustomerID,
                    CustomerName: quote.CustomerName,
                    Amount: quote.TotalAmount,
                    PaidAmount: 0,
                    DueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days later
                    Status: 'PENDING',
                    createdAt: serverTimestamp()
                });
                alert('수주 승인 처리되었습니다. 청구 내역이 생성되었습니다.');
            }

            fetchQuotes();
        } catch (error) {
            console.error("Status change failed", error);
            alert('상태 변경 중 오류 발생');
        }
    };

    const handlePrintQuote = (quote) => {
        const company = quote.CompanyInfo || { Name: '(주) IRAssistance', CEO: '-', BizNo: '-', Address: '-', Contact: '-' };
        const bank = quote.BankInfo || { Bank: '-', Account: '-', Holder: '-' };
        const items = quote.Items || [];
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>견적서_${quote.QuoteNo}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
                        body { font-family: 'Noto+Sans+KR', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
                        .title { font-size: 42px; font-weight: 900; letter-spacing: -1px; color: #000; }
                        .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                        .section-title { font-size: 12px; font-weight: 900; text-transform: uppercase; color: #888; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-bottom: 15px; }
                        .info-box p { margin: 4px 0; font-size: 14px; }
                        .info-box strong { color: #000; }
                        
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th { background: #f8f9fa; padding: 12px 10px; font-size: 11px; font-weight: 900; text-transform: uppercase; color: #666; border-bottom: 2px solid #000; text-align: left; }
                        td { padding: 15px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
                        .text-right { text-align: right; }
                        .text-center { text-align: center; }
                        
                        .total-section { display: flex; justify-content: flex-end; margin-top: 20px; margin-bottom: 50px; }
                        .total-box { background: #000; color: #fff; padding: 20px 40px; border-radius: 10px; text-align: right; }
                        .total-label { font-size: 12px; font-weight: 400; opacity: 0.7; }
                        .total-amount { font-size: 28px; font-weight: 900; margin-top: 5px; }
                        
                        .bottom-grid { display: grid; grid-template-cols: 2fr 1fr; gap: 40px; }
                        .terms p { font-size: 12px; color: #666; white-space: pre-line; }
                        .bank-box { background: #f8f9fa; padding: 20px; border-radius: 10px; }
                        .bank-box h4 { margin: 0 0 10px 0; font-size: 12px; font-weight: 900; color: #000; }
                        .bank-box p { margin: 4px 0; font-size: 12px; color: #444; }
                        
                        @media print {
                            body { padding: 0; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="title">QUOTATION</div>
                            <p style="margin-top: 10px; font-size: 14px; font-weight: bold; color: #666;">No: ${quote.QuoteNo} | Date: ${quote.Date}</p>
                        </div>
                        <div style="text-align: right;">
                            <img src="/logo.png" alt="" style="height: 40px; margin-bottom: 10px; display: none;">
                            <div style="font-size: 20px; font-weight: 900;">${company.Name}</div>
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-box">
                            <div class="section-title">Bill To (고객사)</div>
                            <p style="font-size: 18px; font-weight: 900; margin-bottom: 10px;">${quote.CustomerName}</p>
                            <p><strong>건명:</strong> ${quote.Title}</p>
                            <p><strong>유효기한:</strong> ${quote.ValidUntil}</p>
                        </div>
                        <div class="info-box">
                            <div class="section-title">From (공급자)</div>
                            <p><strong>대표자:</strong> ${company.CEO}</p>
                            <p><strong>사업자번호:</strong> ${company.BizNo}</p>
                            <p><strong>주소:</strong> ${company.Address}</p>
                            <p><strong>연락처:</strong> ${company.Contact}</p>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th width="150">부품 ID</th>
                                <th>품목명 및 규격</th>
                                <th width="80" class="text-center">수량</th>
                                <th width="120" class="text-right">단가 (₩)</th>
                                <th width="120" class="text-right">금액 (₩)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    <td style="font-family: monospace; font-weight: bold; color: #666;">${item.PartID || '-'}</td>
                                    <td>
                                        <div style="font-weight: bold;">${item.Name || '-'}</div>
                                        <div style="font-size: 11px; color: #888;">${item.Spec || '-'}</div>
                                    </td>
                                    <td class="text-center">${item.Qty || 0}</td>
                                    <td class="text-right">${(item.UnitPrice || 0).toLocaleString()}</td>
                                    <td class="text-right" style="font-weight: bold;">${(item.Amount || 0).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                            ${items.length === 0 ? '<tr><td colspan="5" class="text-center" style="padding: 40px; color: #ccc;">품목 내역이 없습니다.</td></tr>' : ''}
                        </tbody>
                    </table>

                    <div class="total-section">
                        <div class="total-box">
                            <div class="total-label">합계 금액 (VAT 별도)</div>
                            <div class="total-amount">₩ ${(quote.TotalAmount || 0).toLocaleString()}</div>
                        </div>
                    </div>

                    <div class="bottom-grid">
                        <div class="terms">
                            <div class="section-title">Terms & Conditions (견적 조건)</div>
                            <p>${quote.Terms || '-'}</p>
                            <p style="margin-top: 20px; color: #aaa; font-size: 11px;">* 본 견적서는 시스템에 의해 자동으로 발행되었으며, 별도의 인감이 없어도 유효합니다.</p>
                        </div>
                        <div class="bank-box">
                            <h4>Payment Details</h4>
                            <p><strong>은행:</strong> ${bank.Bank}</p>
                            <p><strong>계좌:</strong> ${bank.Account}</p>
                            <p><strong>예금주:</strong> ${bank.Holder}</p>
                        </div>
                    </div>

                    <script>
                        window.onload = () => {
                            setTimeout(() => {
                                window.print();
                                // window.close(); // 사용자가 PDF 저장 여부를 선택할 수 있도록 닫지 않음
                            }, 500);
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const filteredQuotes = useMemo(() => {
        return quotes.filter(q => 
            (q.QuoteNo || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
            (q.CustomerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (q.Title || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [quotes, searchTerm]);

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex justify-between items-end bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <FileText className="text-indigo-600" size={32} />
                        견적서 발행 및 관리
                    </h1>
                    <p className="text-slate-500 text-sm mt-1.5 font-medium">고객사 대상 견적서 작성, PDF 발행 및 승인 상태를 관리합니다.</p>
                </div>
                <button 
                    onClick={() => { setEditingQuote(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-sm shadow-md shadow-indigo-100 transition-all transform hover:scale-[1.02]"
                >
                    <Plus size={18} />
                    새 견적서 작성
                </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div className="relative w-80">
                        <input 
                            type="text"
                            placeholder="견적 번호, 고객사, 건명 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-500 font-bold">로딩 중...</div>
                    ) : filteredQuotes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-3">
                            <FileText size={48} className="opacity-10"/>
                            <p className="text-sm font-bold uppercase tracking-widest italic">No Quotations Found</p>
                        </div>
                    ) : (
                        <MasterDataGrid 
                            data={filteredQuotes}
                            columnDefs={COLUMN_DEFS}
                            idField="id"
                            actionRenderer={(row) => (
                                <div className="flex gap-2">
                                    {(row.Status === 'DRAFT' || row.Status === 'SENT') && (
                                        <button
                                            onClick={() => handleOpenEmailModal(row)}
                                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                                            title={row.Status === 'SENT' ? '이메일 재발송' : '견적서 이메일 발행'}
                                        >
                                            <Send size={16}/>
                                        </button>
                                    )}
                                    {row.Status === 'SENT' && (
                                        <button onClick={() => handleStatusChange(row.id, 'ACCEPTED')} className="text-slate-400 hover:text-emerald-600 transition-colors" title="수주 승인"><CheckCircle2 size={16}/></button>
                                    )}
                                    <button onClick={() => handleEdit(row)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="수정"><Edit2 size={16}/></button>
                                    <button onClick={() => handlePrintQuote(row)} className="text-slate-400 hover:text-emerald-600 transition-colors" title="PDF 다운로드"><FileDown size={16}/></button>
                                    <button onClick={() => handleDelete(row.id)} className="text-slate-400 hover:text-rose-600 transition-colors" title="삭제"><Trash2 size={16}/></button>
                                </div>
                            )}
                            cellRenderer={{
                                QuoteNo: (val) => <span className="font-mono font-black text-indigo-600">{val}</span>,
                                CustomerName: (val) => <div className="flex items-center gap-1.5 font-black text-slate-800"><Building2 size={14} className="text-slate-400"/>{val}</div>,
                                TotalAmount: (val) => <span className="font-black text-slate-800">₩ {(val || 0).toLocaleString()}</span>,
                                Status: (val) => {
                                    const info = QUOTE_STATUS[val] || QUOTE_STATUS.DRAFT;
                                    return <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-widest ${info.color}`}>{info.label}</span>
                                }
                            }}
                        />
                    )}
                </div>
            </div>

            <QuoteModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveQuote}
                currentUser={currentUser}
                editingQuote={editingQuote}
            />
            <QuoteEmailModal
                isOpen={isEmailModalOpen}
                onClose={() => { setIsEmailModalOpen(false); setSelectedQuoteForEmail(null); }}
                quoteData={selectedQuoteForEmail}
                onSend={handleSendQuoteEmail}
            />
        </div>
    );
}
