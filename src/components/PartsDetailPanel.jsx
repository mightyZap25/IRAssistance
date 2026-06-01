import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, getDocs, limit, query, where, updateDoc, doc } from 'firebase/firestore';
import { X, Clock, ArrowRightLeft, Layers, FileText, ShieldCheck, User, Sparkles, AlertTriangle, Paperclip, PenTool } from 'lucide-react';
import RoleGuard from './common/RoleGuard';
import { USER_ROLES } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

// Recursive Tree Node component with luxurious visual cues (gradient connectors, soft shadow nodes)
function ImpactTreeNode({ node }) {
    const [isOpen, setIsOpen] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className="pl-6 relative mt-3 first:mt-0">
            {/* Elegant connection lines */}
            <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500/35 via-purple-500/20 to-transparent"></div>
            <div className="absolute left-2.5 top-5 w-4 h-0.5 bg-indigo-500/35"></div>

            <div className="flex items-center justify-between p-3.5 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-150/70 dark:border-slate-800/80 hover:border-indigo-300/60 dark:hover:border-indigo-800/80 hover:shadow-md transition-all duration-300 relative group">
                <div className="flex items-center gap-3">
                    {hasChildren && (
                        <button 
                            onClick={() => setIsOpen(!isOpen)} 
                            className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
                        >
                            <span className="text-[9px] font-bold">{isOpen ? '▼' : '▶'}</span>
                        </button>
                    )}
                    <div>
                        <div className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2">
                            {node.ParentName}
                            {node.isTopLevel && (
                                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[8px] font-black uppercase tracking-wider shadow-sm">완제품 (Top-Level)</span>
                            )}
                        </div>
                        <div className="text-[9px] font-mono font-bold text-slate-400 mt-0.5">{node.ParentID}</div>
                    </div>
                </div>
                <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-xl border border-indigo-100/40 dark:border-indigo-950">
                    소요량: {node.Quantity}
                </div>
            </div>
            {hasChildren && isOpen && (
                <div className="mt-1">
                    {node.children.map((child, idx) => (
                        <ImpactTreeNode key={idx} node={child} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function PartsDetailPanel({ partId, parts, filteredParts = [], onPartSelect = () => {}, allBoms, onClose, onEdit, onStatusChange, inline = false }) {
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState('substitutes');
    const [detailData, setDetailData] = useState({ usedIn: [], transactions: [], history: [], revisions: [], substitutes: [], impactTree: [] });
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [selectedRevId, setSelectedRevId] = useState(null);
    const [expandedEcnId, setExpandedEcnId] = useState(null);
    const [localSearchTerm, setLocalSearchTerm] = useState('');
    const [dbPartsList, setDbPartsList] = useState([]);
    const [isDbPartsLoading, setIsDbPartsLoading] = useState(false);

    // Fetch whole parts from DB for left side panel list to make it fully independent
    async function fetchDbPartsList() {
        setIsDbPartsLoading(true);
        try {
            const partsSnap = await getDocs(collection(db, 'parts'));
            const partsData = [];
            partsSnap.forEach(docSnap => {
                partsData.push({ ...docSnap.data(), id: docSnap.id });
            });
            partsData.sort((a, b) => (b.CreatedAt?.seconds || 0) - (a.CreatedAt?.seconds || 0));
            setDbPartsList(partsData);
        } catch (e) {
            console.error("Error fetching db parts list inside modal:", e);
        } finally {
            setIsDbPartsLoading(false);
        }
    }

    useEffect(() => {
        fetchDbPartsList();
    }, [partId, parts]);

    // Reset selected revision when moving to a different part
    useEffect(() => {
        setSelectedRevId(null);
    }, [partId]);

    // Initial load and revision switches
    useEffect(() => {
        const targetId = selectedRevId || partId;
        fetchPartDetails(targetId);
    }, [partId, selectedRevId]);

    // Build recursive parent BOM trees
    function buildImpactTree(targetPartId, visited = new Set()) {
        if (!targetPartId || visited.has(targetPartId)) return [];
        visited.add(targetPartId);

        const parents = allBoms.filter(b => b.ChildID === targetPartId);
        const paths = [];

        parents.forEach(p => {
            if (!p.ParentID) return;
            const parentPart = parts.find(pt => pt.PartID === p.ParentID);
            const parentName = parentPart ? parentPart.Name : p.ParentID;
            const isTop = !allBoms.some(b => b.ChildID === p.ParentID);

            paths.push({
                ParentID: p.ParentID,
                ParentName: parentName,
                Quantity: p.Quantity,
                isTopLevel: isTop || (parentPart?.Class === 'Product (P)' || parentPart?.Class === 'Product (A)'),
                children: buildImpactTree(p.ParentID, new Set(visited))
            });
        });

        return paths;
    }

    async function fetchPartDetails(targetId) {
        setIsDetailLoading(true);
        try {
            const partSnap = parts.find(p => p.PartID === targetId);
            if (!partSnap) return;

            // 1. Used In
            const usedInList = allBoms.filter(b => b.ChildID === targetId);
            const resolvedUsedIn = usedInList.map(item => {
                const found = parts.find(p => p.PartID === item.ParentID);
                return { ...item, ParentName: found ? found.Name : item.ParentID };
            });

            // 2. Transactions
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('PartID', '==', targetId), limit(50)));
            const txList = [];
            txSnap.forEach(docSnap => txList.push({ ...docSnap.data(), id: docSnap.id }));
            txList.sort((a, b) => new Date(b.Date) - new Date(a.Date));

            // 3. ECN History
            const histSnap = await getDocs(query(collection(db, 'ecns'), where('PartID', '==', targetId)));
            const histList = [];
            histSnap.forEach(docSnap => histList.push({ ...docSnap.data(), id: docSnap.id }));
            histList.sort((a, b) => (b.CreatedAt?.seconds || 0) - (a.CreatedAt?.seconds || 0));

            // 4. Revisions
            const revList = parts.filter(p => p.MasterPartID && partSnap.MasterPartID && p.MasterPartID === partSnap.MasterPartID);
            revList.sort((a, b) => {
                const revA = String(a.Rev || '1.0').split('.').map(Number);
                const revB = String(b.Rev || '1.0').split('.').map(Number);
                if (revA[0] !== revB[0]) return revB[0] - revA[0];
                return revB[1] - revA[1];
            });

            // 5. Substitutes
            const subPartIDs = partSnap.SubstitutePartIDs || [];
            const resolvedSubs = subPartIDs.map(subId => {
                const found = parts.find(p => p.PartID === subId);
                return { PartID: subId, Name: found ? found.Name : 'Unknown Part' };
            });

            // 6. Impact Tree
            const impactTreeData = buildImpactTree(targetId);

            setDetailData({
                usedIn: resolvedUsedIn,
                transactions: txList,
                history: histList,
                revisions: revList,
                substitutes: resolvedSubs,
                impactTree: impactTreeData
            });

        } catch (e) {
            console.error("Error loading part details:", e);
        } finally {
            setIsDetailLoading(false);
        }
    }

    const handleApprove = async (partDocId) => {
        if (!window.confirm("이 부품 등록을 승인하시겠습니까?")) return;
        try {
            const partRef = doc(db, 'parts', partDocId);
            await updateDoc(partRef, {
                Lifecycle: 'Active',
                ApprovedBy: userProfile?.displayName || 'Manager',
                ApprovedAt: new Date()
            });
            alert("승인이 완료되었습니다.");
            if (onStatusChange) onStatusChange();
        } catch (err) {
            console.error("Approval fail:", err);
            alert("승인 처리 중 오류 발생");
        }
    };

    const currentViewingPart = (detailData.revisions || []).find(r => r.PartID === (selectedRevId || partId)) || parts.find(p => p.PartID === partId);

    if (!currentViewingPart) return null;

    const content = (
        <div className={`flex flex-col transform transition-all duration-300 ${inline ? 'h-full w-full' : 'relative bg-white/90 dark:bg-slate-950/90 backdrop-blur-lg rounded-[2rem] shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden border border-white/20 dark:border-slate-800/80 animate-in zoom-in-95'}`}>
            
            {/* Header */}
            <div className="px-8 py-5 border-b border-slate-150/40 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">부품 세부 마스터 뷰</h2>
                            {currentViewingPart.Lifecycle === 'Draft' && (
                                <span className="px-3 py-1.5 rounded-xl bg-gradient-to-br from-orange-400 via-orange-500 to-amber-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-orange-200/50 dark:shadow-none border border-orange-300/30 animate-pulse flex items-center gap-1.5 ring-1 ring-white/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm"></div>
                                    대기/개발중 (Draft)
                                </span>
                            )}
                            {(currentViewingPart.Lifecycle === 'ECN' || currentViewingPart.Lifecycle === 'ECN Pending') && (
                                <span className="px-3 py-1.5 rounded-xl bg-gradient-to-br from-blue-400 via-indigo-500 to-violet-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-blue-200/50 dark:shadow-none border border-blue-300/30 animate-pulse flex items-center gap-1.5 ring-1 ring-white/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm"></div>
                                    설계변경/수정중 (ECN)
                                </span>
                            )}
                            {currentViewingPart.Lifecycle === 'Obsolete' && (
                                <span className="px-3 py-1.5 rounded-xl bg-gradient-to-br from-slate-500 via-slate-600 to-slate-800 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-slate-200/50 dark:shadow-none border border-slate-400/30 flex items-center gap-1.5 ring-1 ring-white/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shadow-sm"></div>
                                    폐기/단종 (Obsolete)
                                </span>
                            )}
                            {currentViewingPart.Lifecycle === 'Active' && (
                                <span className="px-3 py-1.5 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-none border border-emerald-300/30 flex items-center gap-1.5 ring-1 ring-white/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm"></div>
                                    승인완료/양산 (Active)
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Single Object Control Center</p>
                    </div>
                </div>

                <div className="flex gap-2.5 items-center">
                    {(currentViewingPart.Lifecycle === 'Draft' || currentViewingPart.Lifecycle === 'ECN' || currentViewingPart.Lifecycle === 'ECN Pending') && (
                        <RoleGuard requiredRole={USER_ROLES.MANAGER}>
                            <button
                                onClick={() => handleApprove(currentViewingPart.id)}
                                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:scale-[1.02] active:scale-[0.98] text-white font-black rounded-xl transition-all text-xs flex items-center gap-2 shadow-xl shadow-emerald-200/40 dark:shadow-none border border-emerald-400/30"
                            >
                                <ShieldCheck size={16} /> 승인(Approve)
                            </button>
                        </RoleGuard>
                    )}
                    <RoleGuard requiredRole={USER_ROLES.ENGINEER}>
                        <button
                            onClick={() => { onEdit(currentViewingPart); }}
                            className="px-4.5 py-2.5 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-indigo-900/50 font-black rounded-xl transition-all text-xs flex items-center gap-1.5 shadow-sm hover:shadow-md hover:border-indigo-300"
                        >
                            <PenTool size={14} />
                            <span>수정</span>
                        </button>
                    </RoleGuard>
                    {!inline && (
                        <button
                            onClick={onClose}
                            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all"
                        >
                            <X size={22} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className={`p-6 overflow-hidden flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 ${inline ? 'h-full' : ''}`}>
                
                {/* 1단: 좌측 부품 DB 리스트 영역 (인라인 모드일 때는 숨김) */}
                {!inline && (
                    <div className="lg:col-span-3 flex flex-col gap-4 border-r border-slate-150/40 dark:border-slate-800/80 pr-6 h-[calc(90vh-10rem)] overflow-hidden">
                        <div className="flex-shrink-0">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 px-1">부품 DB 목록</h3>
                            <div className="relative group">
                                <input
                                    type="text"
                                    placeholder="부품명, ID로 검색..."
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-bold text-slate-700 dark:text-slate-200 text-xs outline-none shadow-inner"
                                    value={localSearchTerm}
                                    onChange={(e) => setLocalSearchTerm(e.target.value)}
                                />
                                <div className="absolute right-3 top-2.5 text-slate-300 group-focus-within:text-indigo-400 transition-colors">
                                    <Sparkles size={14} />
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5 pr-1.5">
                            {isDbPartsLoading && dbPartsList.length === 0 ? (
                                <div className="text-xs text-slate-400 italic text-center py-12 flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span>DB에서 목록을 불러오는 중...</span>
                                </div>
                            ) : (() => {
                                const baseList = dbPartsList.length > 0 ? dbPartsList : parts;
                                // 최신 리비전 위주로만 브라우징
                                const activeBaseList = baseList.filter(p => p.IsLatestRevision !== false);
                                const localFilteredParts = activeBaseList.filter(p => {
                                    const term = localSearchTerm.toLowerCase();
                                    return p.Name?.toLowerCase().includes(term) || p.PartID?.toLowerCase().includes(term);
                                });
                                
                                if (localFilteredParts.length === 0) {
                                    return <div className="text-xs text-slate-400 italic text-center py-12">검색 결과가 없습니다.</div>;
                                }
                                
                                return localFilteredParts.map(part => {
                                    const isSelected = part.PartID === currentViewingPart.PartID;
                                    return (
                                        <div
                                            key={part.id}
                                            onClick={() => {
                                                onPartSelect(part.PartID);
                                                setSelectedRevId(null);
                                            }}
                                            className={`py-3 px-4 rounded-2xl border transition-all cursor-pointer group flex flex-col gap-1.5 ${isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 shadow-md shadow-indigo-100/50 dark:shadow-none' : 'bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-850/60 hover:border-indigo-200/50'}`}
                                        >
                                            <div className="flex justify-between items-center w-full">
                                                <div className="text-[9px] font-mono font-black text-slate-400 group-hover:text-indigo-400 transition-colors">{part.PartID}</div>
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${part.Lifecycle === 'Obsolete' ? 'bg-red-50 text-red-500' : part.Lifecycle === 'Draft' ? 'bg-orange-50 text-orange-500' : part.Lifecycle === 'Active' ? 'bg-emerald-50 text-emerald-500' : (part.Lifecycle === 'ECN' || part.Lifecycle === 'ECN Pending') ? 'bg-blue-50 text-blue-500' : 'bg-slate-50 text-slate-400'}`}>
                                                    {part.Lifecycle === 'Draft' ? '대기' : (part.Lifecycle === 'ECN' || part.Lifecycle === 'ECN Pending') ? '변경' : part.Lifecycle === 'Obsolete' ? '단종' : '양산'}
                                                </span>
                                            </div>
                                            <div className={`text-[11px] font-black truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {part.Name}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}

                {/* 2단: 중앙 상세 스펙 정보 영역 */}
                <div className={`${inline ? 'lg:col-span-7' : 'lg:col-span-5'} space-y-6 ${inline ? 'h-full' : 'h-[calc(90vh-10rem)]'} overflow-y-auto pr-3 custom-scrollbar`}>
                        
                        {/* Title and Revision Selector */}
                        <div className="bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/30 dark:from-slate-900 dark:via-slate-900/80 dark:to-indigo-950/20 p-6 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/80 flex flex-col justify-between items-start gap-5 shadow-sm w-full relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>
                            <div className="w-full relative z-10">
                                <div>
                                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">부품명 (Part Name)</div>
                                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2 leading-tight tracking-tight">{currentViewingPart.Name}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-8 mt-5 pt-5 border-t border-slate-200/80 dark:border-slate-800/60 w-full">
                                    <div className="flex-1 min-w-[140px]">
                                        <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest block mb-1">규격 (Specification)</span>
                                        <span className="text-sm font-extrabold text-slate-700 dark:text-slate-300 leading-snug">{currentViewingPart.Spec || '-'}</span>
                                    </div>
                                    <div className="border-l border-slate-200 dark:border-slate-800/60 pl-8">
                                        <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest block mb-1">리비전 (Revision)</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-base font-mono font-black text-slate-800 dark:text-slate-100">Rev {currentViewingPart.Rev}</span>
                                            {currentViewingPart.IsLatestRevision && (
                                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-white text-[8px] font-black uppercase tracking-wider shadow-sm shadow-emerald-200 dark:shadow-none">LATEST</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center w-full mt-2 p-3 bg-white/50 dark:bg-slate-950/50 rounded-2xl border border-white dark:border-slate-800/50 relative z-10 shadow-sm">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">리비전 전환</div>
                                <select
                                    value={selectedRevId || partId}
                                    onChange={(e) => setSelectedRevId(e.target.value)}
                                    className="text-xs font-mono font-black text-indigo-600 bg-transparent outline-none cursor-pointer hover:text-indigo-800 transition-colors pr-2"
                                >
                                    {detailData.revisions.map(rv => (
                                        <option key={rv.PartID} value={rv.PartID} className="dark:bg-slate-900">
                                            Revision {rv.Rev} {rv.IsLatestRevision ? '(Current Latest)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Info Grid (Integrated Specification) */}
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-6 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-5">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
                                <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Layers size={14} /> 부품 상세 제원 마스터 정보
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                                <CompactInfoItem label="부품 ID (Part ID)" value={currentViewingPart.PartID} />
                                <CompactInfoItem label="대분류 (Category)" value={currentViewingPart.Category} />
                                <CompactInfoItem label="분류 (Class)" value={currentViewingPart.Class} />
                                <CompactInfoItem label="타입코드 (Type)" value={currentViewingPart.PartTypeCode} />
                                <CompactInfoItem label="리비전 (Rev)" value={currentViewingPart.Rev} />
                                <CompactInfoItem 
                                    label="상태 (Lifecycle)" 
                                    value={
                                        currentViewingPart.Lifecycle === 'Obsolete' ? (
                                            <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-slate-600 to-slate-800 text-white text-[9px] font-black uppercase tracking-wider shadow-sm border border-slate-500/30">폐기/단종</span>
                                        ) : currentViewingPart.Lifecycle === 'Draft' ? (
                                            <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-400 to-amber-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-orange-100 border border-orange-300/30 animate-pulse">대기/개발중</span>
                                        ) : currentViewingPart.Lifecycle === 'Active' ? (
                                            <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-emerald-100 border border-emerald-400/30">승인완료/양산</span>
                                        ) : (
                                            <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-blue-100 border border-blue-400/30 animate-pulse">설계변경/수정중</span>
                                        )
                                    } 
                                />
                                <CompactInfoItem label="제조사 (Maker)" value={currentViewingPart.Maker} />
                                <CompactInfoItem label="제조업체 (Manufacturer)" value={currentViewingPart.Manufacturer} />
                                <CompactInfoItem label="제조품번 (MPN)" value={currentViewingPart.MPN} />
                                <CompactInfoItem label="모델번호 (MFN)" value={currentViewingPart.MFN} />
                                <CompactInfoItem label="가공/구매 (Process)" value={currentViewingPart.ProcessType} />
                                <CompactInfoItem label="재질 (Material)" value={currentViewingPart.Material} />
                                <CompactInfoItem label="등급 (Grade)" value={currentViewingPart.Grade} />
                                <CompactInfoItem label="색상 (Color)" value={currentViewingPart.Color} />
                                <CompactInfoItem label="담당자 (Owner)" value={currentViewingPart.Owner} isSpecial />
                                <CompactInfoItem label="보관위치 (Location)" value={currentViewingPart.DefaultLocation} highlight isSpecial />
                                <CompactInfoItem label="단가 (Price)" value={currentViewingPart.UnitPrice ? `${currentViewingPart.Currency || 'USD'} ${Number(currentViewingPart.UnitPrice).toLocaleString()}` : '-'} isSpecial />
                                <CompactInfoItem label="조달 기간 (Lead Time)" value={currentViewingPart.LeadTime ? `${currentViewingPart.LeadTime} 일 (Days)` : '-'} isSpecial />
                                <CompactInfoItem label="단위 (Unit)" value={currentViewingPart.Unit} />
                                <CompactInfoItem label="등록일 (Created At)" value={currentViewingPart.CreatedAt ? (currentViewingPart.CreatedAt.seconds ? new Date(currentViewingPart.CreatedAt.seconds * 1000).toLocaleDateString() : new Date(currentViewingPart.CreatedAt).toLocaleDateString()) : '-'} />
                                <CompactInfoItem label="보유 인증 (Safety)" value={
                                    (() => {
                                        const certs = [];
                                        if (currentViewingPart.Safety?.ROHS) certs.push('RoHS');
                                        if (currentViewingPart.Safety?.CE) certs.push('CE');
                                        if (currentViewingPart.Safety?.REACH) certs.push('REACH');
                                        if (currentViewingPart.Safety?.KC) certs.push('KC');
                                        if (currentViewingPart.Safety?.UL) certs.push('UL');
                                        return certs.length > 0 ? certs.join(', ') : 'N/A (미인증)';
                                    })()
                                } highlight={currentViewingPart.Safety && Object.values(currentViewingPart.Safety).some(Boolean)} />
                            </div>
                        </div>

                        {/* Details (Description & attachments) */}
                        <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/80 shadow-sm space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800/60">
                                <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                    <FileText size={14} /> 비고 및 첨부 문서
                                </h3>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <div className="text-[9px] text-slate-450 font-black uppercase tracking-[0.15em] mb-2 px-1">Description (Note)</div>
                                    <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl leading-relaxed border border-slate-150/50 dark:border-slate-800/50 min-h-[60px] font-medium italic">
                                        {currentViewingPart.Description ? `"${currentViewingPart.Description}"` : '추가 설명이 등록되지 않았습니다.'}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {currentViewingPart.Datasheet ? (
                                        <a href={currentViewingPart.Datasheet} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[10px] font-black shadow-sm group">
                                            <Paperclip size={12} className="group-hover:rotate-45 transition-transform" /> 📄 Datasheet
                                        </a>
                                    ) : (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-600 px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-850 rounded-xl flex items-center gap-2 font-bold opacity-60"><X size={12} /> No Datasheet</span>
                                    )}

                                    {currentViewingPart.Image ? (
                                        <a href={currentViewingPart.Image} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all text-[10px] font-black shadow-sm group">
                                            <Sparkles size={12} className="group-hover:scale-110 transition-transform" /> 🖼️ Reference Image
                                        </a>
                                    ) : (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-600 px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-150 dark:border-slate-850 rounded-xl flex items-center gap-2 font-bold opacity-60"><X size={12} /> No Image</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3단: 우측 관계 탭 정보 영역 */}
                    <div className="lg:col-span-4 flex flex-col h-[calc(90vh-10rem)]">
                        
                        {/* Interactive HSL Tab Headers */}
                        <div className="flex flex-wrap p-1.5 bg-slate-100 dark:bg-slate-800/40 rounded-2xl mb-4 gap-1 flex-shrink-0">
                            {[
                                { id: 'substitutes', label: '대체품' },
                                { id: 'impact', label: '파급 효과' },
                                { id: 'usedIn', label: 'BOM 사용처' },
                                { id: 'inOut', label: '수불 이력' },
                                { id: 'history', label: '변경 이력' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-900 shadow-md text-indigo-650 dark:text-indigo-400 font-extrabold border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Interactive Tab Box with loading state */}
                        <div className="flex-1 bg-white/50 dark:bg-slate-900/30 backdrop-blur-md rounded-3xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm overflow-hidden flex flex-col relative">
                            {isDetailLoading && (
                                <div className="absolute inset-0 bg-white/70 dark:bg-slate-950/70 backdrop-blur-sm z-10 flex items-center justify-center text-slate-500 text-sm font-bold">
                                    Loading details...
                                </div>
                            )}

                            {/* Substitutes Tab */}
                            {activeTab === 'substitutes' && (
                                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Substitute Parts (대체 매핑)</h4>
                                    {detailData.substitutes && detailData.substitutes.length > 0 ? (
                                        <ul className="space-y-3">
                                            {detailData.substitutes.map((sub, idx) => (
                                                <li key={idx} className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-150/70 dark:border-slate-850 hover:shadow-sm transition-all">
                                                    <div>
                                                        <div className="font-extrabold text-slate-850 dark:text-slate-200 text-xs">{sub.Name}</div>
                                                        <div className="text-[9px] font-mono font-bold text-slate-400 mt-0.5">{sub.PartID}</div>
                                                    </div>
                                                    <span className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full border border-indigo-100/40 dark:border-indigo-950">대체 활성</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-600 text-xs italic">
                                            매핑된 대체품이 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Impact Analysis Tab */}
                            {activeTab === 'impact' && (
                                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">BOM Impact Analysis</h4>
                                    <p className="text-[9px] text-slate-400 mb-4 leading-normal">본 품목 수정 시 최종 완제품(Top-Level)까지 파급 효과를 미치는 다차 계층 경로 구조입니다.</p>
                                    {detailData.impactTree && detailData.impactTree.length > 0 ? (
                                        <div className="space-y-3">
                                            {detailData.impactTree.map((node, idx) => (
                                                <ImpactTreeNode key={idx} node={node} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-600 text-xs italic">
                                            BOM 사용처가 없어 파급 효과를 주는 완제품 경로가 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* BOM Used In Tab */}
                            {activeTab === 'usedIn' && (
                                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Parent Assemblies (직접 사용처)</h4>
                                    {detailData.usedIn && detailData.usedIn.length > 0 ? (
                                        <ul className="space-y-3">
                                            {detailData.usedIn.map((item, idx) => (
                                                <li key={idx} className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-150/70 dark:border-slate-850 hover:shadow-sm transition-all">
                                                    <div>
                                                        <div className="font-extrabold text-slate-850 dark:text-slate-200 text-xs">{item.ParentName}</div>
                                                        <div className="text-[9px] font-mono font-bold text-slate-400 mt-0.5">{item.ParentID}</div>
                                                    </div>
                                                    <div className="text-[10px] font-black text-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">x {item.Quantity}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-600 text-xs italic">
                                            상위 BOM 사용처가 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* In/Out History Tab */}
                            {activeTab === 'inOut' && (
                                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Stock Transactions (수불 기록)</h4>
                                    {detailData.transactions && detailData.transactions.length > 0 ? (
                                        <div className="space-y-3">
                                            {detailData.transactions.map(tx => {
                                                const partRev = tx.PartID.split('-').pop();
                                                return (
                                                    <div key={tx.id} className="p-3.5 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-150/70 dark:border-slate-850 flex justify-between items-center">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider ${tx.Type === 'In' ? 'bg-indigo-500 text-white' : 'bg-orange-500 text-white'}`}>{tx.Type === 'In' ? '입고' : '출고'}</span>
                                                                <span className="text-[9px] font-mono font-bold text-slate-450">{tx.Date}</span>
                                                                <span className="text-[9px] font-mono font-black text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 rounded">Rev {partRev}</span>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{tx['거래처'] || '내부 이동'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-extrabold text-slate-850 dark:text-slate-200 text-sm">
                                                                {(() => {
                                                                    const qty = tx.Quantity || tx.수량 || tx.Qty || 0;
                                                                    return Number(qty).toLocaleString();
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-600 text-xs italic">
                                            기록된 입출고 이력이 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* History Tab (ECN logs) */}
                            {activeTab === 'history' && (
                                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">ECN Change Logs</h4>
                                    {detailData.history && detailData.history.length > 0 ? (
                                        <div className="space-y-3">
                                            {detailData.history.map(hist => {
                                                const isExpanded = expandedEcnId === hist.id;
                                                return (
                                                    <div key={hist.id} className="bg-white dark:bg-slate-900/60 border border-slate-150/70 dark:border-slate-850 rounded-2xl shadow-sm hover:border-indigo-400/50 transition-all duration-300">
                                                        <div
                                                            className="p-3.5 cursor-pointer"
                                                            onClick={() => setExpandedEcnId(isExpanded ? null : hist.id)}
                                                        >
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${hist.Status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                        {hist.Status}
                                                                    </span>
                                                                    <span className="text-[9px] font-mono font-black text-indigo-600 bg-indigo-50 px-1.5 rounded">REV {hist.Rev}</span>
                                                                    <span className="text-[9px] text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                                                                </div>
                                                                <span className="text-[9px] font-bold text-slate-400">
                                                                    {hist.CreatedAt?.toDate ? hist.CreatedAt.toDate().toLocaleDateString() : new Date(hist.CreatedAt).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-350 italic mb-2">"{hist.Reason}"</p>
                                                            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400">
                                                                <span>By: {hist.CreatedBy}</span>
                                                                <span className="truncate">Fields: {hist.ModifiedFields?.join(', ')}</span>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-100 dark:border-slate-800 mt-2">
                                                                <div className="mt-3 space-y-2">
                                                                    <h5 className="text-[10px] font-black text-slate-500 uppercase mb-2">변경 내역</h5>
                                                                    {hist.Changes && Object.keys(hist.Changes).length > 0 ? (
                                                                        <div className="space-y-2">
                                                                            {Object.entries(hist.Changes).map(([field, change]) => (
                                                                                <div key={field} className="bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl">
                                                                                    <div className="text-[9px] font-black text-slate-600 dark:text-slate-400 mb-1">{field}</div>
                                                                                    <div className="flex items-center gap-2 text-[10px]">
                                                                                        <span className="text-red-500 line-through">{change.OldValue || '-'}</span>
                                                                                        <span className="text-slate-400">→</span>
                                                                                        <span className="text-green-600 font-bold">{change.NewValue || '-'}</span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-[10px] text-slate-400 italic p-2 bg-slate-50 rounded">상세 정보 없음</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-600 text-xs italic">
                                            기록된 ECN 변경 로그가 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
    );

    if (inline) {
        return content;
    }

    return createPortal(
        (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
                {/* Glass Backdrop */}
                <div 
                    className="absolute inset-0 bg-slate-900/50 backdrop-blur-md transition-opacity"
                    onClick={onClose}
                ></div>
                {content}
            </div>
        ),
        document.body
    );
}

// Info Field Component with premium layout styling and interactive row hover effects
function CompactInfoItem({ label, value, highlight = false, isSpecial = false }) {
    return (
        <div className={`py-2 px-3 flex justify-between items-center text-xs gap-3 transition-all rounded-xl duration-200 group ${isSpecial ? 'bg-indigo-50/40 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30 my-0.5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/20'}`}>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.1em] flex-shrink-0">{label}</span>
            <span className={`font-black text-right truncate max-w-[200px] transition-colors ${highlight ? 'text-emerald-600 dark:text-emerald-400' : isSpecial ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'} ${isSpecial ? 'text-[13px]' : 'text-[11px]'}`} title={value}>
                {value || '-'}
            </span>
        </div>
    );
}
