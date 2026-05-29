import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { Plus, X, Briefcase, MapPin, AlignLeft, Phone, Mail, User, Settings2 } from 'lucide-react';
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

const VendorModal = ({ isOpen, onClose, targetData, onSave }) => {
    const [formData, setFormData] = useState({
        Name: '',
        Category: '부품공급',
        ContactPerson: '',
        Phone: '',
        Email: '',
        Address: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (targetData) {
            setFormData({
                Name: targetData.Name || '',
                Category: targetData.Category || '부품공급',
                ContactPerson: targetData.ContactPerson || '',
                Phone: targetData.Phone || '',
                Email: targetData.Email || '',
                Address: targetData.Address || ''
            });
        } else {
            setFormData({ Name: '', Category: '부품공급', ContactPerson: '', Phone: '', Email: '', Address: '' });
        }
    }, [targetData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.Name.trim()) return alert('업체명을 입력해주세요.');
        
        setLoading(true);
        try {
            await onSave(formData, targetData);
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
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <Briefcase size={20} className="text-teal-600" />
                            {targetData ? '공급업체 정보 수정' : '신규 공급업체 등록'}
                        </h2>
                        <p className="text-xs text-slate-500 font-bold mt-1">원자재 납품 및 외주가공 협력사 정보</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 shadow-sm border border-slate-200 transition-all"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">업체명 (Name) <span className="text-rose-500">*</span></label>
                        <input
                            type="text"
                            value={formData.Name}
                            onChange={e => setFormData(prev => ({ ...prev, Name: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                            placeholder="예: (주)한국테크"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">유형 (Category)</label>
                        <select
                            value={formData.Category}
                            onChange={e => setFormData(prev => ({ ...prev, Category: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                        >
                            {VENDOR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">담당자 (Contact Person)</label>
                            <input
                                type="text"
                                value={formData.ContactPerson}
                                onChange={e => setFormData(prev => ({ ...prev, ContactPerson: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                                placeholder="담당자 이름"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">전화번호 (Phone)</label>
                            <input
                                type="text"
                                value={formData.Phone}
                                onChange={e => setFormData(prev => ({ ...prev, Phone: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                                placeholder="02-000-0000"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">이메일 (Email)</label>
                        <input
                            type="email"
                            value={formData.Email}
                            onChange={e => setFormData(prev => ({ ...prev, Email: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                            placeholder="contact@company.com"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">주소 (Address)</label>
                        <input
                            type="text"
                            value={formData.Address}
                            onChange={e => setFormData(prev => ({ ...prev, Address: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                            placeholder="사업장 주소 입력"
                        />
                    </div>
                    <div className="pt-2 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">취소</button>
                        <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-200 transition-all disabled:opacity-50 flex items-center gap-2">
                            {loading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {targetData ? '수정 사항 저장' : '신규 등록 완료'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function VendorsPage() {
    const { userProfile } = useAuth();
    const [vendors, setVendors] = useState([]);
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
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'vendors'), orderBy('Name', 'asc'));
            const querySnapshot = await getDocs(q);
            const list = [];
            querySnapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            setVendors(list);
        } catch (error) {
            console.error("Error fetching vendors: ", error);
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
        return [...vendors].sort((a, b) => {
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
    }, [vendors, sortConfig]);

    const handleSave = async (formData, oldData) => {
        try {
            if (oldData) {
                // Audit Trail: Record changes
                const changes = [];
                for (const key in formData) {
                    if (formData[key] !== oldData[key]) {
                        changes.push({ field: key, oldValue: oldData[key] || '', newValue: formData[key] });
                    }
                }
                
                const batch = writeBatch(db);
                
                // Update vendor
                const vendorRef = doc(db, 'vendors', oldData.id);
                batch.update(vendorRef, {
                    ...formData,
                    UpdatedAt: serverTimestamp(),
                    UpdatedBy: userProfile?.uid
                });
                
                // Write audit log if there are changes
                if (changes.length > 0) {
                    const auditRef = doc(collection(db, 'audit_logs'));
                    batch.set(auditRef, {
                        collectionName: 'vendors',
                        documentId: oldData.id,
                        documentName: formData.Name,
                        action: 'UPDATE',
                        changes,
                        timestamp: serverTimestamp(),
                        userId: userProfile?.uid,
                        userName: userProfile?.displayName || userProfile?.Name || 'Unknown'
                    });
                }
                
                await batch.commit();
            } else {
                await addDoc(collection(db, 'vendors'), {
                    ...formData,
                    CreatedAt: serverTimestamp(),
                    CreatedBy: userProfile?.uid
                });
            }
            await fetchVendors();
        } catch (error) {
            console.error("Transaction failed:", error);
            throw error;
        }
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`'${row.Name}' 공급업체를 정말 삭제하시겠습니까?`)) return;
        try {
            const batch = writeBatch(db);
            batch.delete(doc(db, 'vendors', row.id));
            
            // Audit Trail for deletion
            const auditRef = doc(collection(db, 'audit_logs'));
            batch.set(auditRef, {
                collectionName: 'vendors',
                documentId: row.id,
                documentName: row.Name,
                action: 'DELETE',
                timestamp: serverTimestamp(),
                userId: userProfile?.uid,
                userName: userProfile?.displayName || userProfile?.Name || 'Unknown'
            });

            await batch.commit();
            setVendors(prev => prev.filter(v => v.id !== row.id));
        } catch (error) {
            console.error("Error deleting vendor: ", error);
            alert("삭제 실패");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 dark:text-slate-100 p-3">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-3 rounded-2xl border border-teal-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-teal-600 to-emerald-600 rounded-2xl text-white shadow-xl shadow-teal-200">
                        <Briefcase size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-slate-900">공급사 관리</h1>
                        <p className="text-slate-500 mt-1 text-xs font-bold">외주가공 및 원자재 납품 업체 마스터</p>
                    </div>
                </div>
                <div className="relative z-10 flex items-center gap-2">
                        <button
                            onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
                            className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-md transition-all hover:scale-105"
                        >
                            <Plus size={16} />
                            <span>업체 등록</span>
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
                        columnDefs={VENDOR_COLUMN_DEFS}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        rowKey="id"
                        onRowClick={(row) => { setEditTarget(row); setIsModalOpen(true); }}
                        onEdit={(row) => { setEditTarget(row); setIsModalOpen(true); }}
                        onDelete={handleDelete}
                        sortableColumns={['Name', 'Category', 'CreatedAt']}
                        enableSearch={true}
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        searchPlaceholder="업체명, 담당자, 연락처 검색..."
                        enableFilter={true}
                        onFilteredDataChange={setFilteredData}
                        enableViewModeToggle={true}
                        viewMode={gridViewMode}
                        onViewModeChange={setGridViewMode}
                        cellRenderer={{
                            Name: (val) => <span className="font-extrabold text-slate-900">{val}</span>,
                            Category: (val) => (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                    val === '부품공급' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                    val === '외주가공' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                    'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>{val || '기타'}</span>
                            ),
                            ContactPerson: (val) => (
                                <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                                    <User size={12} className="text-slate-400" />
                                    {val || <span className="text-slate-300 italic">미기재</span>}
                                </div>
                            ),
                            Phone: (val) => (
                                <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                                    <Phone size={12} className="text-slate-400" />
                                    {val || <span className="text-slate-300">-</span>}
                                </div>
                            ),
                            Email: (val) => (
                                <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                                    <Mail size={12} className="text-slate-400" />
                                    {val ? <a href={`mailto:${val}`} onClick={e => e.stopPropagation()} className="hover:text-teal-600 hover:underline">{val}</a> : <span className="text-slate-300">-</span>}
                                </div>
                            ),
                            Address: (val) => <div className="max-w-xs truncate text-slate-500" title={val}>{val || '-'}</div>,
                            CreatedAt: (val) => <span className="text-xs text-slate-400 font-bold tracking-tight">{val?.toDate ? val.toDate().toLocaleDateString() : 'N/A'}</span>
                        }}
                        cardRenderer={(row) => (
                            <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-teal-200 transition-all group relative">
                                <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); setEditTarget(row); setIsModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"><AlignLeft size={14} /></button>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-teal-500">
                                        <Briefcase size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0 pr-12">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                                                row.Category === '부품공급' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                row.Category === '외주가공' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                                'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}>{row.Category || '기타'}</span>
                                            <h3 className="text-base font-black text-slate-900 truncate">{row.Name}</h3>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                            {row.ContactPerson && <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium"><User size={12} className="text-slate-400"/> {row.ContactPerson}</div>}
                                            {row.Phone && <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium"><Phone size={12} className="text-slate-400"/> {row.Phone}</div>}
                                            {row.Email && <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium"><Mail size={12} className="text-slate-400"/> <a href={`mailto:${row.Email}`} onClick={e => e.stopPropagation()} className="truncate hover:underline">{row.Email}</a></div>}
                                            {row.Address && <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium sm:col-span-2 truncate"><MapPin size={12} className="text-slate-400 shrink-0"/> <span className="truncate">{row.Address}</span></div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    />
                )}
            </div>

            <VendorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                targetData={editTarget}
                onSave={handleSave}
            />
        </div>
    );
}
