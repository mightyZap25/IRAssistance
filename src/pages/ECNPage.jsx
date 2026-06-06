import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, writeBatch, doc, getDoc, serverTimestamp, updateDoc, arrayUnion, addDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getNextRevision } from '../services/bomService';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { Clock, CheckCircle2, XCircle, Info, ChevronRight, User, Calendar, Tag, AlertCircle, ArrowRight, Minus, Plus, Edit3, MessageSquare, ShieldCheck } from 'lucide-react';

import { useLocation } from 'react-router-dom';

const ECN_COLUMN_DEFS = {
    Title: { label: '요청명 (Title)', default: true },
    Type: { label: '구분', default: true },
    PartID: { label: '품번 (Part ID)', default: true },
    PartName: { label: '품명 (Name)', default: true },
    Status: { label: '상태 (Status)', default: true },
    CurrentStep: { label: '결재 현황', default: true },
    RequestedBy: { label: '기안자', default: true },
    CreatedAt: { label: '요청/처리 일시', default: true },
};

const APPROVAL_STEPS = [
    { id: 0, label: '연구소 담당자', role: 'ENGINEER_LEAD' },
    { id: 1, label: '생산 담당자', role: 'PRODUCTION_MANAGER' },
    { id: 2, label: 'QA 담당자', role: 'QA_MANAGER' },
    { id: 3, label: '영업 담당자', role: 'SALES_MANAGER' },
    { id: 4, label: '대표', role: 'CEO' }
];

const ECNPage = () => {
    const { userProfile } = useAuth();
    const location = useLocation();
    const [viewMode, setViewMode] = useState('PENDING'); // PENDING or HISTORY
    const [ecnList, setEcnList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEcn, setSelectedEcn] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [approvalComment, setApprovalComment] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchECNs();
    }, []);

    // URL 파라미터 감지 (이슈 링크 연동용)
    useEffect(() => {
        if (ecnList.length > 0) {
            const params = new URLSearchParams(location.search);
            const ecnId = params.get('id');
            if (ecnId) {
                const target = ecnList.find(e => e.id === ecnId);
                if (target) {
                    setSelectedEcn(target);
                    setIsModalOpen(true);
                }
            }
        }
    }, [location.search, ecnList]);

    const [filteredData, setFilteredData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'CreatedAt', direction: 'desc' });
    const [gridViewMode, setGridViewMode] = useState('list');

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedList = React.useMemo(() => {
        return [...ecnList].sort((a, b) => {
            const getTime = (val) => {
                if (!val) return 0;
                if (val.seconds) return val.seconds * 1000;
                if (val instanceof Date) return val.getTime();
                return 0;
            };
            if (sortConfig.key === 'CreatedAt') {
                const aTime = viewMode === 'PENDING' ? getTime(a.CreatedAt) : getTime(a.ProcessedAt || a.CreatedAt);
                const bTime = viewMode === 'PENDING' ? getTime(b.CreatedAt) : getTime(b.ProcessedAt || b.CreatedAt);
                return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
            }
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            return sortConfig.direction === 'asc' 
                ? String(aVal).localeCompare(String(bVal)) 
                : String(bVal).localeCompare(String(aVal));
        });
    }, [ecnList, sortConfig, viewMode]);

    useEffect(() => {
        const fixLegacyDraftParts = async () => {
            try {
                const partsSnap = await getDocs(query(collection(db, 'parts'), where('IsLatestRevision', '==', true)));
                const pendingEcnsSnap = await getDocs(query(collection(db, 'ecns'), where('Status', '==', 'Pending')));
                const pendingPartIds = new Set(pendingEcnsSnap.docs.map(d => d.data().PartID));

                let createdAny = false;
                for (const pDoc of partsSnap.docs) {
                    const pData = pDoc.data();
                    // If it's Draft or Pending and has no pending ECN, create one
                    if ((pData.Lifecycle === 'Draft' || pData.Status === 'Pending') && !pendingPartIds.has(pData.PartID)) {
                        await addDoc(collection(db, 'ecns'), {
                            MasterPartID: pData.MasterPartID || pData.PartID.split('-')[0],
                            PartID: pData.PartID,
                            PartName: pData.Name || pData.PartName || '명칭 없음',
                            Rev: pData.Rev || '1.0',
                            CurrentRevision: pData.Rev || '1.0',
                            Reason: '누락된 초도품/설계변경 승인 처리 (시스템 자동 복구)',
                            Type: 'Initial Release',
                            Status: 'Pending',
                            CurrentStep: 0,
                            ApprovalHistory: [],
                            RequestedBy: 'System Migration',
                            CreatedAt: serverTimestamp(),
                            Changes: [{ field: 'Lifecycle', oldValue: 'Draft', newValue: 'Active' }]
                        });
                        createdAny = true;
                    }
                }
                if (createdAny) fetchECNs();
            } catch (err) {
                console.error('Migration failed', err);
            }
        };
        
        fixLegacyDraftParts();
        fetchECNs();
    }, [viewMode]);

    const fetchECNs = async () => {
        setLoading(true);
        try {
            let q;
            if (viewMode === 'PENDING') {
                q = query(
                    collection(db, 'ecns'),
                    where('Status', '==', 'Pending')
                );
            } else {
                q = query(
                    collection(db, 'ecns'),
                    where('Status', 'in', ['Approved', 'Rejected'])
                );
            }
            const querySnapshot = await getDocs(q);
            const list = [];
            querySnapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });

            // Client-side sorting as a fallback for index latency
            list.sort((a, b) => {
                const getTime = (val) => {
                    if (!val) return 0;
                    if (val.seconds) return val.seconds * 1000;
                    if (val instanceof Date) return val.getTime();
                    return 0;
                };

                const timeA = viewMode === 'PENDING' ? getTime(a.CreatedAt) : getTime(a.ProcessedAt || a.CreatedAt);
                const timeB = viewMode === 'PENDING' ? getTime(b.CreatedAt) : getTime(b.ProcessedAt || b.CreatedAt);
                return timeB - timeA;
            });

            setEcnList(list);
        } catch (error) {
            console.error("Error fetching ECNs: ", error);
        }
        setLoading(false);
    };

    const isUserTurn = (ecn) => {
        if (!userProfile || ecn.Status !== 'Pending') return false;
        const currentStepIdx = ecn.CurrentStep || 0;
        // 사용자 요청에 따라 현재 로그인된 계정에 무조건 마스터 권한(결재 승인/반려 가능) 부여
        const isMaster = true; 
        return isMaster || userProfile.role === APPROVAL_STEPS[currentStepIdx]?.role;
    };

    const handleApprove = async (ecn) => {
        const currentStepIdx = ecn.CurrentStep || 0;
        const isFinalStep = currentStepIdx === APPROVAL_STEPS.length - 1;

        if (currentStepIdx === 3 && ecn.Derivatives && ecn.Derivatives.length > 0) {
            const hasPending = ecn.Derivatives.some(d => d.Action === 'Pending');
            if (hasPending) {
                alert('영업부서는 모든 파생 모델에 대해 [진행] 또는 [미진행]을 선택해야 합니다.');
                return;
            }
        }

        if (!window.confirm(isFinalStep ? '최종 승인하시겠습니까? 리비전이 자동으로 상승하고 BOM이 업데이트됩니다.' : `${APPROVAL_STEPS[currentStepIdx].label} 단계 승인을 진행하시겠습니까?`)) return;

        try {
            const batch = writeBatch(db);
            const ecnRef = doc(db, 'ecns', ecn.id);
            
            const approvalRecord = {
                step: currentStepIdx,
                stepName: APPROVAL_STEPS[currentStepIdx].label,
                approver: userProfile?.displayName || userProfile?.Name || 'Unknown',
                approverId: userProfile?.uid,
                timestamp: new Date(),
                comment: approvalComment,
                status: 'Approved'
            };

            // Save Derivatives and ECO options
            if (ecn.Derivatives) batch.update(ecnRef, { Derivatives: ecn.Derivatives });
            if (ecn.HasStatusChange !== undefined) batch.update(ecnRef, { HasStatusChange: ecn.HasStatusChange });
            if (ecn.InventoryAction) batch.update(ecnRef, { InventoryAction: ecn.InventoryAction });

            if (isFinalStep) {
                // Final Approval Logic
                const partsQuery = query(collection(db, 'parts'), where('PartID', '==', ecn.PartID));
                const partsSnap = await getDocs(partsQuery);
                
                if (partsSnap.empty) {
                    alert('대상 부품을 찾을 수 없습니다.');
                    return;
                }

                const partDoc = partsSnap.docs[0];
                const partRef = partDoc.ref;
                const oldPartData = partDoc.data();
                const nextRev = getNextRevision(oldPartData.Revision || oldPartData.Rev || '1.0');
                const masterId = oldPartData.MasterPartID || oldPartData.PartID.split('-')[0];
                const newPartId = `${masterId}-${nextRev}`;

                batch.update(partRef, { IsLatestRevision: false });

                batch.set(doc(db, 'parts', newPartId), {
                    ...oldPartData,
                    PartID: newPartId,
                    MasterPartID: masterId,
                    Rev: nextRev,
                    Revision: nextRev,
                    Status: 'Approved',
                    Lifecycle: 'Active',
                    IsLatestRevision: true,
                    CreatedAt: serverTimestamp(),
                    LastModified: serverTimestamp(),
                    ...(ecn.ProposedChanges || {})
                });

                if (ecn.ProposedBOM && Array.isArray(ecn.ProposedBOM)) {
                    const bomQuery = query(collection(db, 'bom'), where('ParentID', '==', oldPartData.PartID));
                    const bomSnap = await getDocs(bomQuery);
                    bomSnap.forEach(bomDoc => {
                        batch.delete(doc(db, 'bom', bomDoc.id));
                    });

                    ecn.ProposedBOM.forEach((item) => {
                        const newBomRef = doc(collection(db, 'bom'));
                        batch.set(newBomRef, {
                            ParentID: newPartId,
                            ChildID: item.ChildID,
                            Quantity: item.Quantity,
                            Revision: nextRev,
                            CreatedAt: serverTimestamp()
                        });
                    });
                }

                batch.update(ecnRef, {
                    Status: 'Approved',
                    CurrentStep: currentStepIdx + 1,
                    ProcessedAt: serverTimestamp(),
                    ApprovalHistory: arrayUnion(approvalRecord),
                    ApprovedBy: userProfile?.displayName || userProfile?.Name || 'System',
                    NewPartID: newPartId,
                    ApprovedRevision: nextRev
                });
            } else {
                batch.update(ecnRef, {
                    CurrentStep: currentStepIdx + 1,
                    ApprovalHistory: arrayUnion(approvalRecord)
                });
            }

            await batch.commit();
            alert(isFinalStep ? '최종 승인이 완료되었습니다.' : '승인되었습니다. 다음 단계로 전달됩니다.');
            setApprovalComment('');
            setIsModalOpen(false);
            fetchECNs();
        } catch (error) {
            console.error("Error approving ECN: ", error);
            alert('승인 처리 중 오류가 발생했습니다.');
        }
    };

    const handleReject = async (ecn) => {
        const reason = window.prompt('반려 사유를 입력해주세요:');
        if (reason === null) return;

        try {
            const ecnRef = doc(db, 'ecns', ecn.id);
            const currentStepIdx = ecn.CurrentStep || 0;
            
            const rejectRecord = {
                step: currentStepIdx,
                stepName: APPROVAL_STEPS[currentStepIdx].label,
                approver: userProfile?.displayName || userProfile?.Name || 'Unknown',
                approverId: userProfile?.uid,
                timestamp: new Date(),
                comment: reason,
                status: 'Rejected'
            };

            await updateDoc(ecnRef, {
                Status: 'Rejected',
                ProcessedAt: serverTimestamp(),
                RejectedBy: userProfile?.displayName || userProfile?.Name || 'System',
                RejectReason: reason,
                ApprovalHistory: arrayUnion(rejectRecord)
            });

            alert('반려 처리되었습니다.');
            setIsModalOpen(false);
            fetchECNs();
        } catch (error) {
            console.error("Error rejecting ECN: ", error);
            alert('반려 처리 중 오류가 발생했습니다.');
        }
    };

    const StatusTag = ({ status, step }) => {
        const styles = {
            Pending: "bg-amber-100 text-amber-700 border-amber-200",
            Approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
            Rejected: "bg-rose-100 text-rose-700 border-rose-200"
        };
        
        let label = status;
        if (status === 'Pending') {
            label = '결재 진행 중';
        } else if (status === 'Approved') {
            label = '승인 완료';
        } else if (status === 'Rejected') {
            label = '반려됨';
        }

        return (
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${styles[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {label}
            </span>
        );
    };

    const StepIndicator = ({ currentStep, status }) => {
        return (
            <div className="flex items-center gap-1 w-full">
                {APPROVAL_STEPS.map((step, idx) => (
                    <React.Fragment key={idx}>
                        <div className="flex flex-col items-center gap-1 flex-1">
                            <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                                status === 'Rejected' && idx === currentStep ? 'bg-rose-500' :
                                idx < currentStep ? 'bg-emerald-500' : 
                                idx === currentStep ? 'bg-indigo-600 animate-pulse' : 'bg-slate-200'
                            }`} />
                            <span className={`text-[8px] font-bold whitespace-nowrap ${
                                idx === currentStep ? 'text-indigo-600' : 'text-slate-400'
                            }`}>{step.label}</span>
                        </div>
                        {idx < APPROVAL_STEPS.length - 1 && <div className="w-1" />}
                    </React.Fragment>
                ))}
            </div>
        );
    };

    return (
        <div className="p-3 bg-slate-50 h-[calc(100vh-7.5rem)] flex flex-col font-sans relative overflow-hidden">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-3">
                    <div>
                        <h1 className="text-lg font-black text-slate-900 flex items-center gap-4 tracking-tight">
                            <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl text-white shadow-xl shadow-indigo-200">
                                <ShieldCheck size={32} strokeWidth={2.5} />
                            </div>
                            ECN 결재 시스템
                        </h1>
                        <p className="text-slate-500 font-medium mt-3 ml-1">설계 변경 통보(ECN)에 대한 5단계 순차 결재 및 리비전 관리</p>
                    </div>

                    <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200">
                        <button
                            onClick={() => setViewMode('PENDING')}
                            className={`px-4 py-3 rounded-xl text-sm font-black transition-all duration-300 ${
                                viewMode === 'PENDING' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            결재 대기함
                        </button>
                        <button
                            onClick={() => setViewMode('HISTORY')}
                            className={`px-4 py-3 rounded-xl text-sm font-black transition-all duration-300 ${
                                viewMode === 'HISTORY' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            처리 완료함
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40">
                        <div className="relative">
                            <div className="animate-spin rounded-full h-14 w-14 border-[4px] border-slate-200 border-t-indigo-600"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <ShieldCheck className="text-indigo-600 animate-pulse" size={24} />
                            </div>
                        </div>
                        <p className="mt-6 text-slate-500 font-black tracking-widest uppercase text-xs">데이터를 불러오는 중</p>
                    </div>
                ) : ecnList.length === 0 ? (
                    <div className="bg-white rounded-[40px] border-2 border-dashed border-slate-200 p-32 text-center shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 border border-slate-100">
                            <Clock size={48} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 mb-3 tracking-tight">표시할 결재 안건이 없습니다.</h3>
                        <p className="text-slate-400 font-medium max-w-xs mx-auto">새로운 설계 변경 요청이 들어오면 여기에 표시됩니다.</p>
                    </div>
                ) : (
                    <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm flex-1 flex flex-col min-h-0 relative z-20 overflow-hidden mt-3 mx-1">
                        <MasterDataGrid
                            data={sortedList}
                            columnDefs={ECN_COLUMN_DEFS}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            onRowClick={(row) => { setSelectedEcn(row); setIsModalOpen(true); }}
                            rowKey="id"
                            sortableColumns={['Title', 'Type', 'PartID', 'PartName', 'Status', 'RequestedBy', 'CreatedAt']}
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="결재 제목, 품번, 기안자 검색..."
                            enableFilter={true}
                            onFilteredDataChange={setFilteredData}
                            enableViewModeToggle={true}
                            viewMode={gridViewMode}
                            onViewModeChange={setGridViewMode}
                            cellRenderer={{
                                Status: (val, row) => <StatusTag status={row.Status} step={row.CurrentStep} />,
                                Type: (val) => <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black rounded uppercase tracking-widest border border-slate-200 shrink-0">{val || 'ECN'}</span>,
                                CurrentStep: (val, row) => (
                                    <div className="scale-[0.65] origin-left w-64 -my-3 flex items-center">
                                        <StepIndicator currentStep={val || 0} status={row.Status} />
                                    </div>
                                ),
                                CreatedAt: (val, row) => {
                                    const timeVal = viewMode === 'HISTORY' ? row.ProcessedAt : val;
                                    return <span className="text-xs text-slate-500 font-bold tracking-tight">{timeVal?.toDate ? timeVal.toDate().toLocaleDateString() : 'N/A'}</span>;
                                },
                                Title: (val, row) => (
                                    <div className="flex items-center gap-2 max-w-[200px]">
                                        {isUserTurn(row) && <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse shrink-0" />}
                                        <span className="font-extrabold text-slate-900 truncate">{val || 'ECN Request'}</span>
                                    </div>
                                )
                            }}
                            cardRenderer={(ecn) => (
                                <div key={ecn.id} onClick={() => { setSelectedEcn(ecn); setIsModalOpen(true); }} className="bg-white rounded-lg border border-slate-200 p-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-300 group relative overflow-hidden flex items-center cursor-pointer">
                                    {isUserTurn(ecn) && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600" />}
                                    <div className="flex items-center justify-between gap-4 w-full pl-2">
                                        <div className="flex items-center gap-3 flex-[1.5] min-w-0">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all group-hover:scale-110 shadow-inner ${
                                                ecn.Status === 'Pending' ? 'bg-amber-50 text-amber-500 border border-amber-100' :
                                                ecn.Status === 'Approved' ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' : 'bg-rose-50 text-rose-500 border border-rose-100'
                                            }`}>
                                                {ecn.Status === 'Pending' ? <Clock size={16} /> : ecn.Status === 'Approved' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                            </div>
                                            <div className="flex items-center gap-3 min-w-0 truncate">
                                                <StatusTag status={ecn.Status} step={ecn.CurrentStep} />
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black rounded uppercase tracking-widest border border-slate-200 shrink-0">{ecn.Type || 'ECN'}</span>
                                                <h3 className="text-sm font-black text-slate-900 truncate shrink max-w-[150px]">{ecn.Title || 'ECN Request'}</h3>
                                                <div className="flex items-center gap-2 text-xs truncate shrink min-w-0 ml-2 hidden xl:flex">
                                                    <div className="flex items-center gap-1 text-slate-700 font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-100 whitespace-nowrap">
                                                        <Tag className="text-indigo-500" size={10} />
                                                        <span>{ecn.PartName || '품명 미지정'}</span>
                                                        <span className="text-slate-400 font-medium text-[9px] ml-0.5">({ecn.PartID})</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-slate-500 whitespace-nowrap"><User className="text-slate-400" size={10} /> <span>{ecn.RequestedBy}</span></div>
                                                    <div className="flex items-center gap-1 text-slate-400 whitespace-nowrap"><Calendar size={10} /> <span>{ecn.CreatedAt?.toDate ? ecn.CreatedAt.toDate().toLocaleDateString() : 'N/A'}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 max-w-[250px] hidden lg:block shrink-0 px-4">
                                            <StepIndicator currentStep={ecn.CurrentStep || 0} status={ecn.Status} />
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 lg:pl-4 lg:border-l border-slate-100">
                                            {viewMode === 'HISTORY' && (
                                                <div className="text-right hidden sm:block mr-2">
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <span className="text-xs font-black text-slate-800">{ecn.ApprovedBy || ecn.RejectedBy || 'N/A'}</span>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${ecn.Status === 'Approved' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                    </div>
                                                    <p className="text-[9px] text-slate-400 mt-0.5">{ecn.ProcessedAt?.toDate ? ecn.ProcessedAt.toDate().toLocaleDateString() : ''}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        />
                    </div>
                )}
            </div>

            {isModalOpen && selectedEcn && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-start justify-center pt-[5%] pb-[2%] px-[4%]">
                    <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95%]">
                        <div className="flex justify-between items-center p-2 border-b border-slate-100 shrink-0">
                            <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-md uppercase tracking-wider">{selectedEcn.Type}</span>
                                    <StatusTag status={selectedEcn.Status} step={selectedEcn.CurrentStep} />
                                </div>
                                <div className="flex items-center gap-4 flex-wrap">
                                    <h2 className="text-base font-bold text-slate-900 tracking-tight">{selectedEcn.Title || 'ECN 상세 내역'}</h2>
                                    <div className="flex items-start ml-3 lg:border-l border-slate-200 lg:pl-4">
                                        {APPROVAL_STEPS.map((step, idx) => {
                                            const history = selectedEcn.ApprovalHistory?.find(h => h.step === idx);
                                            const isCurrent = (selectedEcn.CurrentStep || 0) === idx && selectedEcn.Status === 'Pending';
                                            const isPast = (selectedEcn.CurrentStep || 0) > idx || selectedEcn.Status === 'Approved';
                                            
                                            return (
                                                <React.Fragment key={idx}>
                                                    <div className="flex flex-col items-center w-16">
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 mb-1 z-10 bg-white ${
                                                            history?.status === 'Rejected' ? 'border-rose-500 text-rose-500' :
                                                            isPast ? 'border-emerald-500 text-emerald-500' : 
                                                            isCurrent ? 'border-indigo-600 text-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200 text-slate-300'
                                                        }`}>
                                                            {isPast ? <CheckCircle2 size={12} /> : history?.status === 'Rejected' ? <XCircle size={12} /> : <span className="text-[8px] font-bold">{idx + 1}</span>}
                                                        </div>
                                                        <span className={`text-[8px] font-bold whitespace-nowrap ${isCurrent ? 'text-indigo-600' : isPast ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</span>
                                                        {history ? <span className="text-[8px] text-slate-500 truncate w-full text-center mt-0.5">{history.approver}</span> : isCurrent ? <span className="text-[8px] text-indigo-400 mt-0.5">대기중</span> : null}
                                                    </div>
                                                    {idx < APPROVAL_STEPS.length - 1 && (
                                                        <div className={`w-10 h-0.5 mt-2 -mx-4 ${
                                                            (selectedEcn.CurrentStep || 0) > idx && history?.status !== 'Rejected' ? 'bg-emerald-500' : 'bg-slate-200'
                                                        }`} />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors ml-4"><XCircle size={24} /></button>
                        </div>

                        <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">대상 품목 명칭</label>
                                    <p className="font-semibold text-slate-800 text-xs truncate">{selectedEcn.PartName || '품명 미지정'}</p>
                                    <p className="text-[9px] text-indigo-600 mt-0.5 font-medium">{selectedEcn.PartID}</p>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm md:col-span-2">
                                    <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">리비전 변동 (Revision Plan)</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="text-center">
                                            <p className="text-[8px] font-medium text-slate-500 mb-0.5">Current</p>
                                            <p className="font-bold text-slate-700 text-sm">Rev {selectedEcn.CurrentRevision || '1.0'}</p>
                                        </div>
                                        <div className="text-slate-300">
                                            <ArrowRight size={14} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[8px] font-medium text-indigo-500 mb-0.5">Proposed</p>
                                            <p className="font-bold text-indigo-600 text-sm">Rev {getNextRevision(selectedEcn.CurrentRevision || '1.0')}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">기안 정보</label>
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <User size={10} className="text-slate-400" />
                                        <p className="font-semibold text-[11px] text-slate-800">{selectedEcn.RequestedBy}</p>
                                    </div>
                                    <p className="text-[8px] text-slate-500">{selectedEcn.CreatedAt?.toDate ? selectedEcn.CreatedAt.toDate().toLocaleString() : ''}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <section>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Edit3 size={12} className="text-slate-500" />
                                        <h4 className="text-[11px] font-bold text-slate-800">변경 사유 및 요청 배경</h4>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl text-slate-700 text-[11px] leading-relaxed">
                                        {selectedEcn.Reason || '사유가 입력되지 않았습니다.'}
                                    </div>
                                </section>

                                {/* 상세 변경 내역 (Diff) - 객체/문자열 병합 처리 */}
                                {selectedEcn.Changes && selectedEcn.Changes.length > 0 && (
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <AlertCircle size={16} className="text-slate-500" />
                                            <h4 className="text-sm font-bold text-slate-800">상세 변경 내역</h4>
                                        </div>
                                        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">항목(Field)</th>
                                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">기존 (Before)</th>
                                                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">변경 (After)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {selectedEcn.Changes.map((change, idx) => {
                                                        const isObj = typeof change === 'object' && change !== null;
                                                        const field = isObj ? change.field : '변경 내역';
                                                        const oldValue = isObj ? change.oldValue : '-';
                                                        const newValue = isObj ? change.newValue : change;
                                                        
                                                        return (
                                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                                <td className="px-4 py-3 whitespace-nowrap"><span className="text-sm font-medium text-slate-700">{field}</span></td>
                                                                <td className="px-4 py-3 whitespace-nowrap"><span className="text-sm text-rose-600 line-through">{oldValue}</span></td>
                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                    <div className="flex items-center gap-2">
                                                                        <ArrowRight className="text-slate-300" size={14} />
                                                                        <span className="text-sm text-emerald-600 font-medium">{newValue}</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                )}

                                <section>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Minus size={16} className="text-slate-500" />
                                        <h4 className="text-sm font-bold text-slate-800">BOM 구조 변경 내역</h4>
                                    </div>
                                    {selectedEcn.ProposedBOM && selectedEcn.ProposedBOM.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {selectedEcn.ProposedBOM.map((item, idx) => (
                                                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-1.5 rounded-md ${item.isDeleted ? 'bg-rose-50 text-rose-500' : item.isNew ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-500'}`}>
                                                            {item.isDeleted ? <Minus size={16} /> : item.isNew ? <Plus size={16} /> : <Edit3 size={16} />}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-800">{item.ChildID}</p>
                                                            <p className="text-[10px] text-slate-500">수량: {item.Quantity} EA</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                                                        item.isDeleted ? 'bg-rose-50 text-rose-600' : item.isNew ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'
                                                    }`}>
                                                        {item.isDeleted ? 'Removed' : item.isNew ? 'Added' : 'Existing'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-sm text-slate-500">
                                            BOM 구조의 직접적인 변경 사항이 없습니다.
                                        </div>
                                    )}
                                </section>

                                {/* Derivative Models & ECO Extra Fields */}
                                {selectedEcn.Derivatives && selectedEcn.Derivatives.length > 0 && (
                                    <section className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 shadow-sm mt-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <AlertCircle size={16} className="text-indigo-600" />
                                            <h4 className="text-sm font-bold text-indigo-900">파생 모델 연동 검토 (Derivative Models)</h4>
                                        </div>
                                        <div className="space-y-2">
                                            {selectedEcn.Derivatives.map((deriv, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{deriv.Name}</p>
                                                        <p className="text-[10px] text-slate-500">{deriv.PartID}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            disabled={!isUserTurn(selectedEcn) || selectedEcn.CurrentStep !== 3}
                                                            onClick={() => {
                                                                const newDerivs = [...selectedEcn.Derivatives];
                                                                newDerivs[idx].Action = 'Proceed';
                                                                setSelectedEcn({...selectedEcn, Derivatives: newDerivs});
                                                            }}
                                                            className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${deriv.Action === 'Proceed' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                        >
                                                            진행 (Proceed)
                                                        </button>
                                                        <button 
                                                            disabled={!isUserTurn(selectedEcn) || selectedEcn.CurrentStep !== 3}
                                                            onClick={() => {
                                                                const newDerivs = [...selectedEcn.Derivatives];
                                                                newDerivs[idx].Action = 'Skip';
                                                                setSelectedEcn({...selectedEcn, Derivatives: newDerivs});
                                                            }}
                                                            className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${deriv.Action === 'Skip' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                        >
                                                            미진행 (Skip)
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {isUserTurn(selectedEcn) && selectedEcn.CurrentStep === 3 && (
                                            <p className="text-[10px] text-indigo-500 font-bold mt-2 text-right">* 영업부서는 파생 모델 진행 여부를 필수로 선택해야 합니다.</p>
                                        )}
                                    </section>
                                )}

                                {/* ECO Additional Options */}
                                {isUserTurn(selectedEcn) && (
                                    <section className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4 flex gap-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedEcn.HasStatusChange || false}
                                                onChange={(e) => setSelectedEcn({...selectedEcn, HasStatusChange: e.target.checked})}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                            />
                                            <span className="text-sm font-bold text-slate-700">현상 변경 여부 (Status Change)</span>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-700">재고 처리 방식:</span>
                                            <select 
                                                value={selectedEcn.InventoryAction || 'Use As Is'}
                                                onChange={(e) => setSelectedEcn({...selectedEcn, InventoryAction: e.target.value})}
                                                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="Use As Is">그대로 사용 (Use As Is)</option>
                                                <option value="Running Change">자연 소진 후 변경 (Running Change)</option>
                                                <option value="Immediate Change">즉시 변경 (Immediate Change)</option>
                                                <option value="Rework">재작업 (Rework)</option>
                                                <option value="Scrap">폐기 (Scrap)</option>
                                            </select>
                                        </div>
                                    </section>
                                )}

                                {isUserTurn(selectedEcn) && (
                                    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-6">
                                        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                                            <ShieldCheck size={16} className="text-indigo-600" /> 결재 처리
                                        </h4>
                                        <div className="space-y-3">
                                            <textarea
                                                value={approvalComment}
                                                onChange={(e) => setApprovalComment(e.target.value)}
                                                placeholder="결재 의견을 입력하세요"
                                                className="w-full h-16 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                                            />
                                            <div className="grid grid-cols-2 gap-2 max-w-sm">
                                                <button onClick={() => handleReject(selectedEcn)} className="px-4 py-2.5 bg-white text-rose-600 border border-rose-200 rounded-lg font-medium text-sm hover:bg-rose-50 transition-all">반려 처리</button>
                                                <button onClick={() => handleApprove(selectedEcn)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-all">승인 완료</button>
                                            </div>
                                        </div>
                                    </section>
                                )}
                            </div>
                        </div>
                        <div className="bg-slate-50 px-3 py-4 flex justify-end gap-3 border-t border-slate-200 rounded-b-2xl shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 bg-slate-800 text-white rounded-lg font-medium text-sm hover:bg-slate-700 transition-all">화면 닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ECNPage;
