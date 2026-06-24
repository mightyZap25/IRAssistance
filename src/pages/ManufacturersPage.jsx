import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, where } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import {
    Plus, X, Globe, MapPin, Building2, AlignLeft, Phone, Mail, Package,
    Tag, ChevronRight, Search, Loader2, User, ArrowDownCircle, ArrowUpCircle,
    ShoppingCart, FileText, RefreshCw, ExternalLink
} from 'lucide-react';
import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES } from '../services/userService';

const MANUFACTURER_COLUMN_DEFS = {
    Name: { label: '제조사명', default: true },
    Country: { label: '국가', default: true },
    Website: { label: '웹사이트', default: true },
    Description: { label: '비고', default: true },
    CreatedAt: { label: '등록일', default: false }
};

/* ─────────────────────────────── Modal ─────────────────────────────── */
const ManufacturerModal = ({ isOpen, onClose, targetData, onSave }) => {
    const [formData, setFormData] = useState({
        Name: '', Country: '', Address: '', ContactPerson: '', Phone: '', Website: '', Description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData(targetData
            ? { Name: targetData.Name || '', Country: targetData.Country || '', Address: targetData.Address || '', ContactPerson: targetData.ContactPerson || '', Phone: targetData.Phone || '', Website: targetData.Website || '', Description: targetData.Description || '' }
            : { Name: '', Country: '', Address: '', ContactPerson: '', Phone: '', Website: '', Description: '' }
        );
    }, [targetData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.Name.trim()) return alert('제조사명을 입력해주세요.');
        setLoading(true);
        try { await onSave(formData); onClose(); }
        catch (error) { alert('저장 실패'); }
        finally { setLoading(false); }
    };

    const Field = ({ label, children }) => (
        <div className="space-y-1.5">{label && <label className="text-xs font-black text-slate-700">{label}</label>}{children}</div>
    );
    const Input = ({ ...props }) => (
        <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" {...props} />
    );

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Building2 size={20} className="text-indigo-600" />
                        {targetData ? '제조사 정보 수정' : '신규 제조사 등록'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-all"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-4">
                    <Field label={<>제조사명 <span className="text-rose-500">*</span></>}>
                        <Input value={formData.Name} onChange={e => setFormData(p => ({ ...p, Name: e.target.value }))} placeholder="예: Samsung, TAIYO YUDEN" required />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="국가">
                            <Input value={formData.Country} onChange={e => setFormData(p => ({ ...p, Country: e.target.value }))} placeholder="대한민국, Japan" />
                        </Field>
                        <Field label="전화번호">
                            <Input value={formData.Phone} onChange={e => setFormData(p => ({ ...p, Phone: e.target.value }))} placeholder="02-000-0000" />
                        </Field>
                    </div>
                    <Field label="담당자">
                        <Input value={formData.ContactPerson} onChange={e => setFormData(p => ({ ...p, ContactPerson: e.target.value }))} placeholder="담당자 이름" />
                    </Field>
                    <Field label="주소">
                        <Input value={formData.Address} onChange={e => setFormData(p => ({ ...p, Address: e.target.value }))} placeholder="사업장 주소" />
                    </Field>
                    <Field label="웹사이트">
                        <Input type="url" value={formData.Website} onChange={e => setFormData(p => ({ ...p, Website: e.target.value }))} placeholder="https://..." />
                    </Field>
                    <Field label="비고">
                        <textarea value={formData.Description} onChange={e => setFormData(p => ({ ...p, Description: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none h-20" />
                    </Field>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200">취소</button>
                        <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md disabled:opacity-50 flex items-center gap-2">
                            {loading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {targetData ? '수정 저장' : '등록 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ─────────────────────────────── Detail Panel ─────────────────────────────── */
const ManufacturerDetailPanel = ({ manufacturer, onClose, onEdit, allParts }) => {
    const [partSearch, setPartSearch] = useState('');

    const relatedParts = useMemo(() => {
        if (!manufacturer || !allParts) return [];
        const name = manufacturer.Name?.trim().toLowerCase();
        return allParts.filter(p => (p.Manufacturer || '').trim().toLowerCase() === name);
    }, [manufacturer, allParts]);

    const filteredParts = useMemo(() => {
        if (!partSearch.trim()) return relatedParts;
        const q = partSearch.toLowerCase();
        return relatedParts.filter(p =>
            (p.Name || '').toLowerCase().includes(q) ||
            (p.PartID || '').toLowerCase().includes(q) ||
            (p.Spec || '').toLowerCase().includes(q)
        );
    }, [relatedParts, partSearch]);

    if (!manufacturer) return null;

    return (
        <div className="flex flex-col h-full bg-white border-l border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 text-white shrink-0">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center"><Building2 size={22} /></div>
                        <div>
                            <h2 className="text-base font-black">{manufacturer.Name}</h2>
                            <p className="text-blue-200 text-xs font-bold flex items-center gap-1">
                                <MapPin size={11} /> {manufacturer.Country || '국가 미기재'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => onEdit(manufacturer)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-xs font-black flex items-center gap-1 px-2">
                            <AlignLeft size={13} /> 수정
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* Simple Information Section */}
                <div className="p-5 space-y-5 border-b border-slate-100 bg-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-center">
                                <span className="text-xs font-black text-blue-700">{relatedParts.length}</span>
                                <span className="ml-1 text-[10px] font-bold text-blue-400">부품</span>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 text-center">
                                <span className="text-xs font-black text-emerald-700">{relatedParts.filter(p => p.Lifecycle === 'Active').length}</span>
                                <span className="ml-1 text-[10px] font-bold text-emerald-400">양산</span>
                            </div>
                        </div>
                        {manufacturer.Website && (
                            <a href={manufacturer.Website.startsWith('http') ? manufacturer.Website : `https://${manufacturer.Website}`}
                                target="_blank" rel="noreferrer"
                                className="text-[11px] font-black text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-1.5 transition-colors"
                            >
                                <Globe size={12} /> 공식 웹사이트
                            </a>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        {[
                            { icon: <MapPin size={13} />, label: '국가', value: manufacturer.Country },
                            { icon: <User size={13} />, label: '담당자', value: manufacturer.ContactPerson },
                            { icon: <Phone size={13} />, label: '연락처', value: manufacturer.Phone },
                            { icon: <Building2 size={13} />, label: '주소', value: manufacturer.Address, fullWidth: true },
                        ].map((item, i) => (
                            <div key={i} className={`flex items-center gap-2 ${item.fullWidth ? 'col-span-2' : ''}`}>
                                <div className="flex items-center gap-1.5 text-slate-400 shrink-0 min-w-[65px]">
                                    {item.icon}
                                    <span className="text-[10px] font-black uppercase tracking-tight">{item.label}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-700 truncate">
                                    {item.value || <span className="text-slate-300 font-medium italic">미기재</span>}
                                </p>
                            </div>
                        ))}
                    </div>

                    {manufacturer.Description && (
                        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50 mt-1">
                            <p className="text-xs text-slate-500 font-medium leading-relaxed italic">" {manufacturer.Description} "</p>
                        </div>
                    )}
                </div>

                {/* Parts List Section */}
                <div className="bg-slate-50/50 min-h-full">
                    <div className="p-4 flex items-center justify-between shrink-0 bg-white border-b border-slate-100">
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <Package size={16} className="text-indigo-600" /> 납품 부품 ({relatedParts.length})
                        </h3>
                    </div>
                    
                    <div className="p-4 pb-0 shrink-0">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={partSearch} onChange={e => setPartSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400/30"
                                placeholder="부품명, Part ID 검색..." />
                        </div>
                    </div>

                    <div className="p-4 space-y-0.5">
                        {filteredParts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                                <Package size={32} strokeWidth={1} className="mb-2" />
                                <p className="text-xs font-bold text-slate-400">{partSearch ? '검색 결과 없음' : '등록된 부품 없음'}</p>
                            </div>
                        ) : filteredParts.map(part => (
                            <div key={part.id} className="flex items-center gap-2 px-2 py-2 hover:bg-white rounded-md transition-colors group cursor-default border-b border-slate-50 last:border-0">
                                <div className={`w-1 h-4 rounded-full shrink-0 ${part.Lifecycle === 'Active' ? 'bg-emerald-400' : part.Lifecycle === 'Obsolete' ? 'bg-rose-400' : 'bg-orange-400'}`} />
                                <div className="flex-1 min-w-0 flex items-center gap-3">
                                    <span className="text-xs font-mono font-bold text-slate-400 group-hover:text-blue-600 transition-colors shrink-0 w-[85px]">{part.PartID}</span>
                                    <p className="text-[13px] font-bold text-slate-800 truncate flex-1">{part.Name}</p>
                                    {part.Spec && (
                                        <p className="text-[11px] text-slate-500 truncate w-32 text-right">{part.Spec}</p>
                                    )}
                                    {part.UnitPrice > 0 && (
                                        <p className="text-[11px] text-slate-900 font-black shrink-0 w-20 text-right">
                                            {Number(part.UnitPrice).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────────────── Main Page ─────────────────────────────── */
export default function ManufacturersPage() {
    const { userProfile } = useAuth();
    const [manufacturers, setManufacturers] = useState([]);
    const [allParts, setAllParts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'Name', direction: 'asc' });
    const [gridViewMode, setGridViewMode] = useState('list');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [selectedManufacturer, setSelectedManufacturer] = useState(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [mfSnap, partsSnap] = await Promise.all([
                getDocs(query(collection(db, 'manufacturers'), orderBy('Name', 'asc'))),
                getDocs(collection(db, 'parts'))
            ]);
            const mfList = [];
            mfSnap.forEach(d => mfList.push({ id: d.id, ...d.data() }));
            setManufacturers(mfList);

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

    const partCountByManufacturer = useMemo(() => {
        const map = {};
        allParts.forEach(p => {
            const name = (p.Manufacturer || '').trim().toLowerCase();
            if (name) map[name] = (map[name] || 0) + 1;
        });
        return map;
    }, [allParts]);

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const sortedList = useMemo(() => {
        return [...manufacturers].sort((a, b) => {
            if (sortConfig.key === 'CreatedAt') {
                const gt = val => val?.seconds ? val.seconds * 1000 : 0;
                return sortConfig.direction === 'asc' ? gt(a.CreatedAt) - gt(b.CreatedAt) : gt(b.CreatedAt) - gt(a.CreatedAt);
            }
            const aV = String(a[sortConfig.key] || ''), bV = String(b[sortConfig.key] || '');
            return sortConfig.direction === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV);
        });
    }, [manufacturers, sortConfig]);

    const handleSave = async (formData) => {
        if (editTarget) {
            await updateDoc(doc(db, 'manufacturers', editTarget.id), { ...formData, UpdatedAt: serverTimestamp(), UpdatedBy: userProfile?.uid });
        } else {
            await addDoc(collection(db, 'manufacturers'), { ...formData, CreatedAt: serverTimestamp(), CreatedBy: userProfile?.uid });
        }
        await fetchAll();
        if (selectedManufacturer && editTarget?.id === selectedManufacturer.id) {
            setSelectedManufacturer(prev => ({ ...prev, ...formData }));
        }
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`'${row.Name}' 제조사를 삭제하시겠습니까?`)) return;
        await deleteDoc(doc(db, 'manufacturers', row.id));
        setManufacturers(prev => prev.filter(m => m.id !== row.id));
        if (selectedManufacturer?.id === row.id) setSelectedManufacturer(null);
    };

    const openEdit = (row, e) => { if (e) e.stopPropagation(); setEditTarget(row); setIsModalOpen(true); };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 p-3">
            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent p-3 rounded-2xl border border-blue-100/50 flex justify-between items-center flex-none">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl text-white shadow-xl shadow-blue-200">
                        <Building2 size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">제조사 관리</h1>
                        <p className="text-slate-500 mt-0.5 text-xs font-bold">부품 원천 제조사 마스터 · 클릭 시 상세 및 납품 부품 확인</p>
                    </div>
                </div>
                <button onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
                    data-tour="manufacturers-register-btn"
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-md transition-all hover:scale-105">
                    <Plus size={16} /> 제조사 등록
                </button>
            </div>

            <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
                <div className={`bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/50 shadow-sm flex flex-col min-h-0 overflow-hidden transition-all duration-300 ${selectedManufacturer ? 'flex-[0_0_52%]' : 'flex-1'}`}>
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-slate-400 gap-2 font-bold">
                            <Loader2 size={20} className="animate-spin" /> 로드 중...
                        </div>
                    ) : (
                        <MasterDataGrid
                            data={sortedList}
                            columnDefs={MANUFACTURER_COLUMN_DEFS}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            rowKey="id"
                            onRowClick={(row) => setSelectedManufacturer(row)}
                            onEdit={(row) => openEdit(row)}
                            onDelete={handleDelete}
                            sortableColumns={['Name', 'Country', 'CreatedAt']}
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="제조사명, 국가 검색..."
                            enableFilter={true}
                            onFilteredDataChange={setFilteredData}
                            enableViewModeToggle={true}
                            viewMode={gridViewMode}
                            onViewModeChange={setGridViewMode}
                            cellRenderer={{
                                Name: (val) => (
                                    <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-slate-900">{val}</span>
                                        {partCountByManufacturer[(val || '').toLowerCase()] > 0 && (
                                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[9px] font-black">
                                                {partCountByManufacturer[(val || '').toLowerCase()]} 부품
                                            </span>
                                        )}
                                    </div>
                                ),
                                Country: (val) => <div className="flex items-center gap-1.5 text-slate-600 font-bold"><MapPin size={12} className="text-slate-400" />{val || <span className="text-slate-300 italic">미기재</span>}</div>,
                                Website: (val) => val ? <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline font-bold"><Globe size={12} /> Link</a> : <span className="text-slate-300">-</span>,
                                Description: (val) => <div className="max-w-xs truncate text-slate-500">{val}</div>,
                                CreatedAt: (val) => <span className="text-xs text-slate-400 font-bold">{val?.toDate ? val.toDate().toLocaleDateString() : 'N/A'}</span>
                            }}
                            cardRenderer={(row) => (
                                <div key={row.id} onClick={() => setSelectedManufacturer(row)}
                                    className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${selectedManufacturer?.id === row.id ? 'border-blue-400' : 'border-slate-200 hover:border-blue-200'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-indigo-400 shrink-0"><Building2 size={18} /></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-black text-slate-900 truncate">{row.Name}</h3>
                                                {partCountByManufacturer[(row.Name || '').toLowerCase()] > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[9px] font-black shrink-0">{partCountByManufacturer[(row.Name || '').toLowerCase()]} 부품</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1"><MapPin size={11} /> {row.Country || '국가 미상'}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        />
                    )}
                </div>

                {selectedManufacturer && (
                    <div className="flex-[0_0_48%] rounded-2xl overflow-hidden border border-slate-200 shadow-lg">
                        <ManufacturerDetailPanel
                            manufacturer={selectedManufacturer}
                            allParts={allParts}
                            onClose={() => setSelectedManufacturer(null)}
                            onEdit={(row) => openEdit(row)}
                        />
                    </div>
                )}
            </div>

            <ManufacturerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} targetData={editTarget} onSave={handleSave} />
        </div>
    );
}
