import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc } from '../firebase';
import { Plus, PenTool, Trash2, HelpCircle, Layers } from 'lucide-react';
import PartFormModal from '../components/PartFormModal';
import BulkPartImportModal from '../components/BulkPartImportModal';
import PartsDetailPanel from '../components/PartsDetailPanel';
import RoleGuard from '../components/common/RoleGuard';
import { USER_ROLES, hasPermission } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import MasterDataGrid from '../components/common/MasterDataGrid';

const ALL_COLUMN_DEFS = {
    PartID: { label: 'Part ID', default: true },
    Name: { label: '부품명', default: true },
    Spec: { label: '규격', default: false },
    Category: { label: '대분류', default: true },
    Class: { label: '분류', default: false },
    PartTypeCode: { label: '타입코드', default: false },
    Rev: { label: '리비전', default: true },
    Unit: { label: '단위', default: false },
    Maker: { label: '공급사', default: false },
    Manufacturer: { label: '제조업체', default: true },
    MPN: { label: '제조사품번', default: false },
    MFN: { label: '모델번호', default: false },
    Owner: { label: '담당자', default: false },
    UnitPrice: { label: '단가', default: false },
    Currency: { label: '통화', default: false },
    DefaultLocation: { label: '기본 보관 위치', default: false },
    Lifecycle: { label: '생애주기 상태', default: true },
    ProcessType: { label: '가공/구매', default: false },
    Material: { label: '재질', default: false },
    Grade: { label: '등급', default: false },
    Color: { label: '색상', default: false },
    Description: { label: '비고', default: false },
    IsOverseas: { label: '수입품', default: false },
    LeadTime: { label: '리드타임(일)', default: false }
};

export default function PartsPage() {
    const [parts, setParts] = useState([]);
    const [allBoms, setAllBoms] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); 
    const [selectedPartId, setSelectedPartId] = useState(null);
    const [isModifying, setIsModifying] = useState(false);

    const [filteredParts, setFilteredParts] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'PartID', direction: 'asc' });
    const [showOverseasOnly, setShowOverseasOnly] = useState(false);

    const { userProfile } = useAuth();
    const hasEngineerRole = userProfile && hasPermission(userProfile.role, USER_ROLES.ENGINEER);
    const hasManagerRole = userProfile && hasPermission(userProfile.role, USER_ROLES.MANAGER);

    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [formModalMode, setFormModalMode] = useState('create');
    const [editTarget, setEditTarget] = useState(null);

    useEffect(() => {
        fetchPartsAndBoms();
    }, [isModifying]);

    async function fetchPartsAndBoms() {
        setLoading(true);
        try {
            const partsSnap = await getDocs(collection(db, 'parts'));
            const partsData = [];
            partsSnap.forEach(docSnap => {
                partsData.push({ ...docSnap.data(), id: docSnap.id });
            });
            partsData.sort((a, b) => (b.CreatedAt?.seconds || 0) - (a.CreatedAt?.seconds || 0));
            setParts(partsData);

            const bomSnap = await getDocs(collection(db, 'bom'));
            const bomData = [];
            bomSnap.forEach(docSnap => {
                bomData.push(docSnap.data());
            });
            setAllBoms(bomData);
        } catch (error) {
            console.error("Error loading parts list:", error);
        } finally {
            setLoading(false);
        }
    }

    const openCreateModal = () => {
        setFormModalMode('create');
        setEditTarget(null);
        setIsFormModalOpen(true);
    };

    const openEditModal = (part) => {
        setSelectedPartId(null);
        setFormModalMode('edit');
        setEditTarget(part);
        setIsFormModalOpen(true);
    };

    const handleDelete = async (partId) => {
        if (!window.confirm("정말 이 부품을 삭제하시겠습니까? (복구 불가)")) return;
        try {
            await deleteDoc(doc(db, 'parts', partId));
            setParts(prev => prev.filter(p => p.id !== partId));
            if (selectedPartId && parts.find(p => p.id === partId)?.PartID === selectedPartId) {
                setSelectedPartId(null);
            }
        } catch (error) {
            console.error("Error deleting part:", error);
            alert("삭제 실패");
        }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedParts = React.useMemo(() => {
        return [...parts].sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return sortConfig.direction === 'asc' 
                ? String(aVal).localeCompare(String(bVal)) 
                : String(bVal).localeCompare(String(aVal));
        });
    }, [parts, sortConfig]);

    const latestParts = React.useMemo(() => {
        let list = sortedParts.filter(p => p.IsLatestRevision !== false);
        if (showOverseasOnly) {
            list = list.filter(p => p.IsOverseas === true);
        }
        return list;
    }, [sortedParts, showOverseasOnly]);

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 dark:text-slate-100">
            
            {/* Header section with sophisticated glass card background */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-3 rounded-xl border border-indigo-100/35 dark:border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="absolute right-0 top-0 w-48 h-48 bg-indigo-500/5 blur-3xl rounded-full -mr-10 -mt-5 pointer-events-none"></div>
                <div className="relative">
                    <h1 className="text-xl font-black tracking-tight leading-tight bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
                        부품 관리 (Part List)
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-xs font-bold uppercase tracking-wider">
                        Master Data Control Center
                    </p>
                </div>
                <div className="relative flex items-center gap-2">
                    <button
                        onClick={() => setShowOverseasOnly(!showOverseasOnly)}
                        className={`flex items-center gap-2 font-extrabold py-2.5 px-3 rounded-2xl transition-all shadow-md transform ${showOverseasOnly ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-slate-600 border-slate-200'} border`}
                    >
                        <span>✈️ 해외수입물품 보기</span>
                    </button>
                    <RoleGuard requiredRole={USER_ROLES.ENGINEER}>
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold py-2.5 px-3 rounded-2xl transition-all shadow-lg shadow-emerald-200 dark:shadow-none hover:scale-[1.02] transform"
                        >
                            <Layers size={18} />
                            <span>일괄 추가 (Import)</span>
                        </button>
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-2.5 px-3 rounded-2xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none hover:scale-[1.02] transform"
                        >
                            <Plus size={18} />
                            <span>부품 등록</span>
                        </button>
                    </RoleGuard>
                </div>
            </div>

            {/* Main Combined Content Area: Filter + List */}
            <div className="flex-1 min-h-0 relative z-20 overflow-hidden">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-450 font-bold bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-[1.8rem]">데이터를 로드하고 있습니다...</div>
                ) : (
                    <div className="h-full flex flex-col bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
                        <MasterDataGrid
                            data={latestParts}
                            columnDefs={ALL_COLUMN_DEFS}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            onRowClick={(row) => setSelectedPartId(row.PartID)}
                            rowKey="id"
                            sortableColumns={['PartID', 'Name', 'Spec', 'UnitPrice']}
                            
                            // 공통화 속성 적용
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="부품명, Part ID 검색..."
                            
                            enableFilter={true}
                            onFilteredDataChange={setFilteredParts}
                            
                            enableViewModeToggle={true}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            cardRenderer={(part) => (
                                <div
                                    key={part.id}
                                    onClick={() => setSelectedPartId(part.PartID)}
                                    className={`bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm rounded-[1.8rem] p-3 border shadow-md hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[220px] ${selectedPartId === part.PartID ? 'border-indigo-500 shadow-indigo-200/50' : 'border-slate-200/50 dark:border-slate-800/80'}`}
                                >
                                    {/* Category Gradient tag */}
                                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500/0 via-indigo-500/40 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex gap-1.5">
                                                    {part.Lifecycle === 'Draft' ? (
                                                <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-orange-100 animate-pulse">대기/개발중</span>
                                            ) : part.Lifecycle === 'RND' ? (
                                                <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-purple-100">연구소용</span>
                                            ) : (part.Lifecycle === 'ECN' || part.Lifecycle === 'ECN Pending') ? (
                                                <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-blue-100 animate-pulse">설계변경/수정중</span>
                                            ) : part.Lifecycle === 'Obsolete' ? (
                                                <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-rose-500 to-red-600 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-rose-100">폐기/단종</span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-emerald-100">승인완료/양산</span>
                                            )}
                                        </div>
                                    </div>
 
                                    <div className="space-y-2 flex-grow">
                                        <div className="text-[10px] font-mono font-bold text-slate-400">{part.PartID}</div>
                                        <div>
                                            <div className="text-[9px] font-black text-slate-450 uppercase tracking-wider">부품명</div>
                                            <h3 className="font-extrabold text-slate-850 dark:text-slate-200 text-sm leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mt-0.5">{part.Name}</h3>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                            <div className="text-[9px] font-black text-purple-400 dark:text-purple-500 uppercase tracking-wider">규격 (Spec)</div>
                                            <div className="text-xs font-bold text-slate-600 dark:text-slate-350 mt-0.5">{part.Spec || '-'}</div>
                                        </div>
                                    </div>
 
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">보관위치</span>
                                            <span className="font-extrabold text-emerald-600 dark:text-emerald-500 mt-0.5">{part.DefaultLocation || '-'}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">부품단가</span>
                                            <span className="font-black text-slate-800 dark:text-slate-100 mt-0.5">{part.UnitPrice ? `$${Number(part.UnitPrice).toLocaleString()}` : '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            cellRenderer={{
                                Category: (val) => <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-wider">{val?.split(' ')[0] || val}</span>,
                                Lifecycle: (val) => (
                                    val === 'Obsolete' ? (
                                        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-rose-500 to-red-600 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-rose-100">폐기/단종</span>
                                    ) : val === 'Draft' ? (
                                        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-orange-100 animate-pulse">대기/개발중</span>
                                    ) : val === 'RND' ? (
                                        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-purple-100">연구소용</span>
                                    ) : val === 'Active' ? (
                                        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-emerald-100">승인완료/양산</span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-blue-100 animate-pulse">설계변경/수정중</span>
                                    )
                                ),
                                UnitPrice: (val) => val ? `${Number(val).toLocaleString()}` : '-',
                                Description: (val) => <div className="max-w-xs truncate" title={val}>{val || '-'}</div>,
                                IsOverseas: (val) => val ? <span className="text-amber-600 font-black">수입</span> : <span className="text-slate-300">내수</span>,
                                LeadTime: (val) => val ? `${val} 일` : '-'
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Sliding Detail Panel (Portal Overlay) */}
            <PartsDetailPanel
                inline={false}
                isOpen={!!selectedPartId}
                partId={selectedPartId}
                parts={parts}
                filteredParts={filteredParts}
                onPartSelect={setSelectedPartId}
                allBoms={allBoms}
                onClose={() => setSelectedPartId(null)}
                onEdit={openEditModal}
                onStatusChange={() => setIsModifying(!isModifying)}
            />

            {/* Form Modal */}
            {isFormModalOpen && (
                <PartFormModal
                    mode={formModalMode}
                    initialData={editTarget}
                    onClose={() => setIsFormModalOpen(false)}
                    onSuccess={() => {
                        setIsFormModalOpen(false);
                        setIsModifying(!isModifying);
                    }}
                />
            )}

            {/* Bulk Import Modal */}
            {isImportModalOpen && (
                <BulkPartImportModal
                    onClose={() => setIsImportModalOpen(false)}
                    onSuccess={() => {
                        setIsImportModalOpen(false);
                        setIsModifying(!isModifying);
                    }}
                />
            )}
        </div>
    );
}
