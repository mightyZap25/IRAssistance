import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { Plus, X, Globe, MapPin, Building2, AlignLeft, ShieldCheck } from 'lucide-react';
import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES } from '../services/userService';

const MANUFACTURER_COLUMN_DEFS = {
    Name: { label: '제조사명', default: true },
    Country: { label: '국가', default: true },
    Website: { label: '웹사이트', default: true },
    Description: { label: '비고', default: true },
    CreatedAt: { label: '등록일', default: false }
};

const ManufacturerModal = ({ isOpen, onClose, targetData, onSave }) => {
    const [formData, setFormData] = useState({
        Name: '',
        Country: '',
        Website: '',
        Description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (targetData) {
            setFormData({
                Name: targetData.Name || '',
                Country: targetData.Country || '',
                Website: targetData.Website || '',
                Description: targetData.Description || ''
            });
        } else {
            setFormData({ Name: '', Country: '', Website: '', Description: '' });
        }
    }, [targetData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.Name.trim()) return alert('제조사명을 입력해주세요.');
        
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Save failed:', error);
            alert('저장 실패');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Building2 size={20} className="text-indigo-600" />
                            {targetData ? '제조사 정보 수정' : '신규 제조사 등록'}
                        </h2>
                        <p className="text-xs text-slate-500 font-bold mt-1">부품 생산 및 공급 원천 업체의 마스터 정보</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 shadow-sm border border-slate-200 transition-all"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">제조사명 (Name) <span className="text-rose-500">*</span></label>
                        <input
                            type="text"
                            value={formData.Name}
                            onChange={e => setFormData(prev => ({ ...prev, Name: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="예: Samsung, TAIYO YUDEN..."
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">국가 (Country)</label>
                        <input
                            type="text"
                            value={formData.Country}
                            onChange={e => setFormData(prev => ({ ...prev, Country: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="예: 대한민국, Japan, USA..."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">웹사이트 (Website)</label>
                        <input
                            type="url"
                            value={formData.Website}
                            onChange={e => setFormData(prev => ({ ...prev, Website: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="https://..."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">비고 (Description)</label>
                        <textarea
                            value={formData.Description}
                            onChange={e => setFormData(prev => ({ ...prev, Description: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none h-24"
                            placeholder="주요 취급 품목 등 특징 입력"
                        />
                    </div>
                    <div className="pt-2 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">취소</button>
                        <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all disabled:opacity-50 flex items-center gap-2">
                            {loading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {targetData ? '수정 사항 저장' : '신규 등록 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function ManufacturersPage() {
    const { userProfile } = useAuth();
    const [manufacturers, setManufacturers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // MasterDataGrid States
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredData, setFilteredData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'Name', direction: 'asc' });
    const [gridViewMode, setGridViewMode] = useState('list');
    
    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    useEffect(() => {
        fetchManufacturers();
    }, []);

    const fetchManufacturers = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'manufacturers'), orderBy('Name', 'asc'));
            const querySnapshot = await getDocs(q);
            const list = [];
            querySnapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            setManufacturers(list);
        } catch (error) {
            console.error("Error fetching manufacturers: ", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedList = useMemo(() => {
        return [...manufacturers].sort((a, b) => {
            if (sortConfig.key === 'CreatedAt') {
                const getTime = val => val?.seconds ? val.seconds * 1000 : (val instanceof Date ? val.getTime() : 0);
                return sortConfig.direction === 'asc' 
                    ? getTime(a.CreatedAt) - getTime(b.CreatedAt) 
                    : getTime(b.CreatedAt) - getTime(a.CreatedAt);
            }
            const aVal = String(a[sortConfig.key] || '');
            const bVal = String(b[sortConfig.key] || '');
            return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
    }, [manufacturers, sortConfig]);

    const handleSave = async (formData) => {
        if (editTarget) {
            await updateDoc(doc(db, 'manufacturers', editTarget.id), {
                ...formData,
                UpdatedAt: serverTimestamp(),
                UpdatedBy: userProfile?.uid
            });
        } else {
            await addDoc(collection(db, 'manufacturers'), {
                ...formData,
                CreatedAt: serverTimestamp(),
                CreatedBy: userProfile?.uid
            });
        }
        await fetchManufacturers();
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`'${row.Name}' 제조사를 정말 삭제하시겠습니까?`)) return;
        try {
            await deleteDoc(doc(db, 'manufacturers', row.id));
            setManufacturers(prev => prev.filter(m => m.id !== row.id));
        } catch (error) {
            console.error("Error deleting manufacturer: ", error);
            alert("삭제 실패");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 dark:text-slate-100 p-3">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent p-3 rounded-2xl border border-blue-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl text-white shadow-xl shadow-blue-200">
                        <Building2 size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">제조사 관리</h1>
                        <p className="text-slate-500 mt-1 text-xs font-bold">부품 원천 제조사 마스터 데이터</p>
                    </div>
                </div>
                <div className="relative z-10">
                        <button
                            onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-md transition-all hover:scale-105"
                        >
                            <Plus size={16} />
                            <span>제조사 등록</span>
                        </button>
                </div>
            </div>

            {/* List Content */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/50 shadow-sm flex-1 flex flex-col min-h-0 relative z-20 overflow-hidden">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">데이터를 로드하는 중...</div>
                ) : (
                    <MasterDataGrid
                        data={sortedList}
                        columnDefs={MANUFACTURER_COLUMN_DEFS}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        rowKey="id"
                        onRowClick={(row) => { setEditTarget(row); setIsModalOpen(true); }}
                        onEdit={(row) => { setEditTarget(row); setIsModalOpen(true); }}
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
                            Name: (val) => <span className="font-extrabold text-slate-900">{val}</span>,
                            Country: (val) => (
                                <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                                    <MapPin size={12} className="text-slate-400" />
                                    {val || <span className="text-slate-300 italic">미기재</span>}
                                </div>
                            ),
                            Website: (val) => val ? (
                                <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold hover:underline">
                                    <Globe size={12} /> Link
                                </a>
                            ) : <span className="text-slate-300">-</span>,
                            Description: (val) => <div className="max-w-xs truncate text-slate-500" title={val}>{val}</div>,
                            CreatedAt: (val) => <span className="text-xs text-slate-400 font-bold tracking-tight">{val?.toDate ? val.toDate().toLocaleDateString() : 'N/A'}</span>
                        }}
                        cardRenderer={(row) => (
                            <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative">
                                <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); setEditTarget(row); setIsModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><AlignLeft size={14} /></button>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-indigo-400">
                                        <Building2 size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0 pr-12">
                                        <h3 className="text-base font-black text-slate-900 truncate">{row.Name}</h3>
                                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                                            <div className="flex items-center gap-1"><MapPin size={12} /> {row.Country || '국가 미상'}</div>
                                            {row.Website && <a href={row.Website.startsWith('http') ? row.Website : `https://${row.Website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline"><Globe size={12} /> 웹사이트</a>}
                                        </div>
                                        <p className="mt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">{row.Description || '설명이 없습니다.'}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    />
                )}
            </div>

            <ManufacturerModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                targetData={editTarget}
                onSave={handleSave}
            />
        </div>
    );
}
