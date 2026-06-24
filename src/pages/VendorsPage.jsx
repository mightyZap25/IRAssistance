import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, where, writeBatch, limit } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import {
    Plus, X, Briefcase, MapPin, AlignLeft, Phone, Mail, User, Package,
    Tag, ChevronRight, Search, Loader2, ArrowDownCircle, ArrowUpCircle,
    ShoppingCart, FileText, History, RefreshCw, Trash2
} from 'lucide-react';
import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES } from '../services/userService';

const VENDOR_CATEGORIES = ['부품공급', '외주가공', '기타'];

const VENDOR_COLUMN_DEFS = {
    Name: { label: '업체명', default: true },
    Category: { label: '유형', default: true },
    ContactPerson: { label: '담당자', default: true },
    Phone: { label: '전화번호', default: true },
    Email: { label: '이메일', default: true },
    Address: { label: '주소', default: false },
    CreatedAt: { label: '등록일', default: false }
};

/* ─────────────────────────────── Modal ─────────────────────────────── */
const VendorModal = ({ isOpen, onClose, targetData, onSave }) => {
    const [formData, setFormData] = useState({ 
        Name: '', 
        Category: '부품공급', 
        Address: '',
        Contacts: [{ name: '', title: '', phone: '', email: '' }]
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (targetData) {
            setFormData({
                Name: targetData.Name || '',
                Category: targetData.Category || '부품공급',
                Address: targetData.Address || '',
                Contacts: targetData.Contacts && targetData.Contacts.length > 0 
                    ? targetData.Contacts 
                    : [{ 
                        name: targetData.ContactPerson || '', 
                        title: '담당자',
                        phone: targetData.Phone || '', 
                        email: targetData.Email || '' 
                      }]
            });
        } else {
            setFormData({ 
                Name: '', 
                Category: '부품공급', 
                Address: '', 
                Contacts: [{ name: '', title: '', phone: '', email: '' }] 
            });
        }
    }, [targetData, isOpen]);

    if (!isOpen) return null;

    const handleContactChange = (index, field, value) => {
        const newContacts = [...formData.Contacts];
        newContacts[index][field] = value;
        setFormData({ ...formData, Contacts: newContacts });
    };

    const addContact = () => {
        setFormData({
            ...formData,
            Contacts: [...formData.Contacts, { name: '', title: '', phone: '', email: '' }]
        });
    };

    const removeContact = (index) => {
        if (formData.Contacts.length <= 1) return;
        setFormData({
            ...formData,
            Contacts: formData.Contacts.filter((_, i) => i !== index)
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.Name.trim()) return alert('업체명을 입력해주세요.');
        setLoading(true);
        try { 
            // 호환성을 위해 첫 번째 담당자 정보를 최상위 필드에도 복사
            const primary = formData.Contacts[0] || {};
            const payload = {
                ...formData,
                ContactPerson: primary.name || '',
                Phone: primary.phone || '',
                Email: primary.email || ''
            };
            await onSave(payload, targetData); 
            onClose(); 
        }
        catch (err) { console.error(err); alert('저장 실패'); }
        finally { setLoading(false); }
    };

    const Input = ({ ...props }) => <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all placeholder:text-slate-300 placeholder:font-normal" {...props} />;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Briefcase size={20} className="text-teal-600" />
                        {targetData ? '공급업체 정보 수정' : '신규 공급업체 등록'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">업체명 <span className="text-rose-500">*</span></label>
                            <Input value={formData.Name} onChange={e => setFormData(p => ({ ...p, Name: e.target.value }))} placeholder="예: (주)한국테크" required />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">유형</label>
                            <select value={formData.Category} onChange={e => setFormData(p => ({ ...p, Category: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500">
                                {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">사업장 주소</label>
                        <Input value={formData.Address} onChange={e => setFormData(p => ({ ...p, Address: e.target.value }))} placeholder="전체 주소 입력" />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Contact Persons (담당자 리스트)</label>
                            <button type="button" onClick={addContact} className="text-[10px] font-black text-teal-600 hover:bg-teal-50 px-2 py-1 rounded-lg border border-teal-100 flex items-center gap-1 transition-colors">
                                <Plus size={10} /> 담당자 추가
                            </button>
                        </div>
                        <div className="space-y-2">
                            {formData.Contacts.map((contact, idx) => (
                                <div key={idx} className="flex items-center gap-2 group">
                                    <div className="flex-1 grid grid-cols-4 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 group-hover:border-teal-100 transition-colors">
                                        <input className="bg-transparent px-2 py-1 text-xs font-bold text-slate-800 outline-none border-r border-slate-200" placeholder="이름" value={contact.name} onChange={e => handleContactChange(idx, 'name', e.target.value)} />
                                        <input className="bg-transparent px-2 py-1 text-xs font-bold text-slate-800 outline-none border-r border-slate-200" placeholder="직급 (예: 과장)" value={contact.title} onChange={e => handleContactChange(idx, 'title', e.target.value)} />
                                        <input className="bg-transparent px-2 py-1 text-xs font-bold text-slate-800 outline-none border-r border-slate-200 font-mono" placeholder="전화번호" value={contact.phone} onChange={e => handleContactChange(idx, 'phone', e.target.value)} />
                                        <input className="bg-transparent px-2 py-1 text-xs font-bold text-slate-800 outline-none" placeholder="이메일" value={contact.email} onChange={e => handleContactChange(idx, 'email', e.target.value)} />
                                    </div>
                                    <button type="button" onClick={() => removeContact(idx)} className={`p-2 text-slate-300 hover:text-rose-500 transition-colors ${formData.Contacts.length <= 1 ? 'invisible' : ''}`}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-50">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">취소</button>
                        <button type="submit" disabled={loading} className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-200 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95">
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {targetData ? '수정 내용 저장' : '공급업체 등록'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ─────────────────────────────── Detail Panel ─────────────────────────────── */
const VendorDetailPanel = ({ vendor, onClose, onEdit, allParts }) => {
    const [tab, setTab] = useState('info');
    const [partSearch, setPartSearch] = useState('');
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    // 납품 부품 - Maker 또는 Supplier 매칭
    const relatedParts = useMemo(() => {
        if (!vendor || !allParts) return [];
        const name = vendor.Name?.trim().toLowerCase();
        return allParts.filter(p => {
            const maker = (p.Maker || '').trim().toLowerCase();
            const supplier = (p.Supplier || '').trim().toLowerCase();
            return maker === name || supplier === name;
        });
    }, [vendor, allParts]);

    const filteredParts = useMemo(() => {
        if (!partSearch.trim()) return relatedParts;
        const q = partSearch.toLowerCase();
        return relatedParts.filter(p =>
            (p.Name || '').toLowerCase().includes(q) ||
            (p.PartID || '').toLowerCase().includes(q) ||
            (p.Spec || '').toLowerCase().includes(q)
        );
    }, [relatedParts, partSearch]);

    // 거래 이력 로드
    const loadHistory = async () => {
        if (historyLoaded || historyLoading) return;
        setHistoryLoading(true);
        try {
            const name = vendor.Name?.trim();
            const nameLower = name.toLowerCase();
            const poSnap = await getDocs(query(collection(db, 'purchasing'), orderBy('CreatedAt', 'desc'), limit(50)));
            const poItems = []; poSnap.forEach(d => { if ((d.data().VendorName || '').toLowerCase() === nameLower) poItems.push({ id: d.id, type: 'PO', ...d.data() }); });
            const txSnap = await getDocs(query(collection(db, 'transactions'), orderBy('Date', 'desc'), limit(100)));
            const txItems = []; txSnap.forEach(d => { if ((d.data().CustomerName || '').toLowerCase() === nameLower) txItems.push({ id: d.id, type: 'TX', ...d.data() }); });
            const quotSnap = await getDocs(query(collection(db, 'quotations'), orderBy('createdAt', 'desc'), limit(50)));
            const quotItems = []; quotSnap.forEach(d => { if ((d.data().vendorName || d.data().VendorName || '').toLowerCase() === nameLower) quotItems.push({ id: d.id, type: 'QUOT', ...d.data() }); });
            setHistory([...poItems, ...txItems, ...quotItems].sort((a, b) => {
                const getTs = item => { const v = item.CreatedAt || item.Date || item.createdAt; return v?.seconds ? v.seconds : new Date(v || 0).getTime() / 1000; };
                return getTs(b) - getTs(a);
            }));
            setHistoryLoaded(true);
        } catch (err) { console.error('History load error:', err); }
        finally { setHistoryLoading(false); }
    };

    useEffect(() => { setHistory([]); setHistoryLoaded(false); setTab('info'); }, [vendor?.id]);

    const handleTabChange = (key) => { setTab(key); if (key === 'history') loadHistory(); };

    if (!vendor) return null;

    const catColor = { '부품공급': 'from-teal-600 to-emerald-700', '외주가공': 'from-purple-600 to-indigo-700', '기타': 'from-slate-600 to-slate-700' }[vendor.Category] || 'from-teal-600 to-emerald-700';

    const tabs = [
        { key: 'info', label: '기본 정보', icon: <Briefcase size={13} /> },
        { key: 'parts', label: `납품 부품 (${relatedParts.length})`, icon: <Package size={13} /> },
        { key: 'history', label: '거래 이력', icon: <History size={13} /> },
    ];

    const formatDate = (val) => {
        if (!val) return '-';
        const d = val?.toDate ? val.toDate() : val?.seconds ? new Date(val.seconds * 1000) : new Date(val);
        return isNaN(d) ? '-' : d.toLocaleDateString('ko-KR');
    };

    return (
        <div className="flex flex-col h-full bg-white border-l border-slate-200 overflow-hidden">
            {/* Header */}
            <div className={`bg-gradient-to-r ${catColor} p-4 text-white shrink-0`}>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center"><Briefcase size={22} /></div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-black">{vendor.Category || '기타'}</span>
                            </div>
                            <h2 className="text-base font-black">{vendor.Name}</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => onEdit(vendor)} className="p-1.5 hover:bg-white/20 rounded-lg text-xs font-black flex items-center gap-1 px-2"><AlignLeft size={13} /> 수정</button>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg"><X size={16} /></button>
                    </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 mt-3 overflow-x-auto custom-scrollbar-none">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => handleTabChange(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition-all ${tab === t.key ? 'bg-white text-teal-700 shadow-sm' : 'text-white/70 hover:bg-white/20'}`}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
                {/* 1. Info Tab */}
                {tab === 'info' && (
                    <div className="p-5 space-y-6">
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Company Info</h3>
                            <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                                <div className="flex items-center gap-2 shrink-0 w-[140px]">
                                    <Briefcase size={14} className="text-teal-600" />
                                    <span className="text-xs font-black text-slate-800 truncate">{vendor.Name}</span>
                                </div>
                                <div className="w-px h-3 bg-slate-200 shrink-0"></div>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <MapPin size={13} className="text-slate-400" />
                                    <p className="text-xs font-bold text-slate-500 truncate">{vendor.Address || '주소 정보 없음'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Primary Contact</h3>
                            <div className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                <div className="flex items-center gap-2 w-[120px] shrink-0">
                                    <User size={14} className="text-teal-600" />
                                    <span className="text-xs font-black text-slate-800 truncate">{vendor.ContactPerson || '담당자 미상'}</span>
                                </div>
                                <div className="w-px h-3 bg-slate-100 shrink-0"></div>
                                <div className="flex items-center gap-2 w-[130px] shrink-0">
                                    <Phone size={13} className="text-slate-300" />
                                    <span className="text-xs font-bold text-slate-600 font-mono">{vendor.Phone || '-'}</span>
                                </div>
                                <div className="w-px h-3 bg-slate-100 shrink-0"></div>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Mail size={13} className="text-slate-300" />
                                    <span className="text-xs font-bold text-slate-500 truncate">{vendor.Email || '-'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 px-1">
                            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                                <div className="text-[10px] font-black text-teal-400 uppercase tracking-widest mb-1">납품 품목</div>
                                <div className="text-xl font-black text-teal-700">{relatedParts.length}</div>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">양산 부품</div>
                                <div className="text-xl font-black text-blue-700">{relatedParts.filter(p => p.Lifecycle === 'Active').length}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Parts Tab */}
                {tab === 'parts' && (
                    <div className="flex flex-col h-full bg-slate-50/30">
                        <div className="px-4 py-3 border-b border-slate-100 bg-white sticky top-0 z-10">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" value={partSearch} onChange={e => setPartSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-400/30"
                                    placeholder="부품명, Part ID 검색..." />
                            </div>
                        </div>
                        <div className="p-4 space-y-0.5">
                            {filteredParts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                                    <Package size={32} strokeWidth={1} className="mb-2" />
                                    <p className="text-xs font-bold text-slate-400">데이터가 없습니다.</p>
                                </div>
                            ) : filteredParts.map(part => (
                                <div key={part.id} className="flex items-center gap-2 px-2 py-2.5 hover:bg-white rounded-lg transition-colors group cursor-default border-b border-slate-50 last:border-0 bg-white/40">
                                    <div className={`w-1 h-4 rounded-full shrink-0 ${part.Lifecycle === 'Active' ? 'bg-emerald-400' : part.Lifecycle === 'Obsolete' ? 'bg-rose-400' : 'bg-orange-400'}`} />
                                    <div className="flex-1 min-w-0 flex items-center gap-3">
                                        <span className="text-xs font-mono font-bold text-slate-400 group-hover:text-teal-600 transition-colors shrink-0 w-[85px]">{part.PartID}</span>
                                        <p className="text-[13px] font-bold text-slate-800 truncate flex-1">{part.Name}</p>
                                        {part.Spec && <p className="text-[11px] text-slate-500 truncate w-32 text-right">{part.Spec}</p>}
                                        {part.UnitPrice > 0 && <p className="text-[11px] text-slate-900 font-black shrink-0 w-20 text-right">{Number(part.UnitPrice).toLocaleString()}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. History Tab */}
                {tab === 'history' && (
                    <div className="flex flex-col p-4 space-y-2">
                        {historyLoading ? (
                            <div className="py-20 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
                        ) : history.length === 0 ? (
                            <div className="py-20 text-center text-slate-300 font-bold text-xs uppercase tracking-widest">거래 내역이 없습니다.</div>
                        ) : history.map((item, i) => (
                            <div key={item.id + i} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:border-teal-100 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${item.type === 'PO' ? 'bg-blue-50 text-blue-600' : item.type === 'TX' ? 'bg-orange-50 text-orange-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {item.type}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400">{formatDate(item.CreatedAt || item.Date || item.createdAt)}</span>
                                </div>
                                <h4 className="text-sm font-black text-slate-800 truncate">{item.PartName || item.PONumber || item.Subject}</h4>
                                <div className="flex items-center gap-3 mt-2 text-[11px] font-bold text-slate-500">
                                    {item.type === 'TX' && <span>{item.Type === 'In' ? '입고' : '출고'} {(item.Quantity || 0).toLocaleString()} EA</span>}
                                    {item.type === 'PO' && <span>{(item.Qty || 0).toLocaleString()} EA | ₩{(item.TotalPrice || 0).toLocaleString()}</span>}
                                    {item.Status && <span className="ml-auto text-teal-600 uppercase text-[10px]">{item.Status}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─────────────────────────────── Main Page ─────────────────────────────── */
export default function VendorsPage() {
    const { userProfile } = useAuth();
    const [vendors, setVendors] = useState([]);
    const [allParts, setAllParts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'Name', direction: 'asc' });
    const [gridViewMode, setGridViewMode] = useState('list');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [selectedVendor, setSelectedVendor] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [vendorSnap, partsSnap] = await Promise.all([
                getDocs(query(collection(db, 'vendors'), orderBy('Name', 'asc'))),
                getDocs(collection(db, 'parts'))
            ]);
            const vendorList = [];
            vendorSnap.forEach(d => vendorList.push({ id: d.id, ...d.data() }));
            setVendors(vendorList);

            const partsList = [];
            partsSnap.forEach(d => {
                const data = d.data();
                if (data.IsLatestRevision !== false) partsList.push({ id: d.id, ...data });
            });
            setAllParts(partsList);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const partCountByVendor = useMemo(() => {
        const map = {};
        allParts.forEach(p => {
            const maker = (p.Maker || '').trim().toLowerCase();
            const supplier = (p.Supplier || '').trim().toLowerCase();
            if (maker) map[maker] = (map[maker] || 0) + 1;
            if (supplier && supplier !== maker) map[supplier] = (map[supplier] || 0) + 1;
        });
        return map;
    }, [allParts]);

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const sortedList = useMemo(() => {
        return [...vendors].sort((a, b) => {
            if (sortConfig.key === 'CreatedAt') {
                const gt = val => val?.seconds ? val.seconds * 1000 : 0;
                return sortConfig.direction === 'asc' ? gt(a.CreatedAt) - gt(b.CreatedAt) : gt(b.CreatedAt) - gt(a.CreatedAt);
            }
            const aV = String(a[sortConfig.key] || ''), bV = String(b[sortConfig.key] || '');
            return sortConfig.direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
        });
    }, [vendors, sortConfig]);

    const handleSave = async (formData, oldData) => {
        try {
            if (oldData) {
                const changes = Object.keys(formData).filter(k => formData[k] !== oldData[k]).map(k => ({ field: k, oldValue: oldData[k] || '', newValue: formData[k] }));
                const batch = writeBatch(db);
                batch.update(doc(db, 'vendors', oldData.id), { ...formData, UpdatedAt: serverTimestamp(), UpdatedBy: userProfile?.uid });
                if (changes.length > 0) {
                    batch.set(doc(collection(db, 'audit_logs')), { collectionName: 'vendors', documentId: oldData.id, documentName: formData.Name, action: 'UPDATE', changes, timestamp: serverTimestamp(), userId: userProfile?.uid, userName: userProfile?.displayName || 'Unknown' });
                }
                await batch.commit();
            } else {
                await addDoc(collection(db, 'vendors'), { ...formData, CreatedAt: serverTimestamp(), CreatedBy: userProfile?.uid });
            }
            await fetchAll();
            if (selectedVendor && oldData?.id === selectedVendor.id) {
                setSelectedVendor(prev => ({ ...prev, ...formData }));
            }
        } catch (error) {
            console.error('Save failed:', error); throw error;
        }
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`'${row.Name}' 공급업체를 삭제하시겠습니까?`)) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, 'vendors', row.id));
        batch.set(doc(collection(db, 'audit_logs')), { collectionName: 'vendors', documentId: row.id, documentName: row.Name, action: 'DELETE', timestamp: serverTimestamp(), userId: userProfile?.uid });
        await batch.commit();
        setVendors(prev => prev.filter(v => v.id !== row.id));
        if (selectedVendor?.id === row.id) setSelectedVendor(null);
    };

    const openEdit = (row, e) => { if (e) e.stopPropagation(); setEditTarget(row); setIsModalOpen(true); };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-3 rounded-2xl border border-teal-100/50 flex justify-between items-center flex-none">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-teal-600 to-emerald-600 rounded-2xl text-white shadow-xl shadow-teal-200">
                        <Briefcase size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">공급사 관리</h1>
                        <p className="text-slate-500 mt-0.5 text-xs font-bold">협력사 마스터 · 클릭 시 담당자 정보·납품 부품·거래 이력 확인</p>
                    </div>
                </div>
                <button onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
                    data-tour="vendors-register-btn"
                    className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-md transition-all hover:scale-105">
                    <Plus size={16} /> 업체 등록
                </button>
            </div>

            <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
                <div className={`bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/50 shadow-sm flex flex-col min-h-0 overflow-hidden transition-all duration-300 ${selectedVendor ? 'flex-[0_0_52%]' : 'flex-1'}`}>
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-slate-400 gap-2 font-bold">
                            <Loader2 size={20} className="animate-spin" /> 로드 중...
                        </div>
                    ) : (
                        <MasterDataGrid
                            data={sortedList}
                            columnDefs={VENDOR_COLUMN_DEFS}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            rowKey="id"
                            onRowClick={(row) => setSelectedVendor(row)}
                            onEdit={(row) => openEdit(row)}
                            onDelete={handleDelete}
                            sortableColumns={['Name', 'Category', 'CreatedAt']}
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="업체명, 담당자 검색..."
                            enableFilter={true}
                            onFilteredDataChange={setFilteredData}
                            enableViewModeToggle={true}
                            viewMode={gridViewMode}
                            onViewModeChange={setGridViewMode}
                            cellRenderer={{
                                Name: (val) => (
                                    <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-slate-900">{val}</span>
                                        {partCountByVendor[(val || '').toLowerCase()] > 0 && (
                                            <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-600 text-[9px] font-black">{partCountByVendor[(val || '').toLowerCase()]} 부품</span>
                                        )}
                                    </div>
                                ),
                                Category: (val) => (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${val === '부품공급' ? 'bg-blue-50 text-blue-600 border-blue-100' : val === '외주가공' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{val || '기타'}</span>
                                ),
                                ContactPerson: (val) => <div className="flex items-center gap-1.5 text-slate-600 font-bold"><User size={12} className="text-slate-400" />{val || <span className="text-slate-300 italic">미기재</span>}</div>,
                                Phone: (val) => <div className="flex items-center gap-1.5 text-slate-600 font-bold"><Phone size={12} className="text-slate-400" />{val || <span className="text-slate-300">-</span>}</div>,
                                Email: (val) => <div className="flex items-center gap-1.5 text-slate-600 font-bold"><Mail size={12} className="text-slate-400" />{val ? <a href={`mailto:${val}`} onClick={e => e.stopPropagation()} className="hover:text-teal-600 hover:underline">{val}</a> : <span className="text-slate-300">-</span>}</div>,
                                Address: (val) => <div className="max-w-xs truncate text-slate-500">{val || '-'}</div>,
                                CreatedAt: (val) => <span className="text-xs text-slate-400 font-bold">{val?.toDate ? val.toDate().toLocaleDateString() : 'N/A'}</span>
                            }}
                            cardRenderer={(row) => (
                                <div key={row.id} onClick={() => setSelectedVendor(row)}
                                    className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${selectedVendor?.id === row.id ? 'border-teal-400' : 'border-slate-200 hover:border-teal-200'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-teal-500 shrink-0"><Briefcase size={18} /></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${row.Category === '부품공급' ? 'bg-blue-50 text-blue-600 border-blue-100' : row.Category === '외주가공' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{row.Category || '기타'}</span>
                                                <h3 className="text-sm font-black text-slate-900 truncate">{row.Name}</h3>
                                                {partCountByVendor[(row.Name || '').toLowerCase()] > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-600 text-[9px] font-black shrink-0">{partCountByVendor[(row.Name || '').toLowerCase()]} 부품</span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 gap-1 mt-1.5">
                                                {row.ContactPerson && <div className="text-xs text-slate-500 font-medium flex items-center gap-1"><User size={11} className="shrink-0" />{row.ContactPerson}</div>}
                                                {row.Phone && <div className="text-xs text-slate-500 font-medium flex items-center gap-1"><Phone size={11} className="shrink-0" />{row.Phone}</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        />
                    )}
                </div>

                {selectedVendor && (
                    <div className="flex-[0_0_48%] rounded-2xl overflow-hidden border border-slate-200 shadow-lg">
                        <VendorDetailPanel
                            vendor={selectedVendor}
                            allParts={allParts}
                            onClose={() => setSelectedVendor(null)}
                            onEdit={(row) => openEdit(row)}
                        />
                    </div>
                )}
            </div>

            <VendorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} targetData={editTarget} onSave={handleSave} />
        </div>
    );
}
