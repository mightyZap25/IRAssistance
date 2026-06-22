import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, getDocs, writeBatch, doc, getDoc, serverTimestamp, updateDoc, arrayUnion, addDoc } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getNextRevision } from '../services/bomService';
import MasterDataGrid from '../components/common/MasterDataGrid';
import { 
    Clock, CheckCircle2, XCircle, Info, ChevronRight, User, Calendar, Tag, 
    AlertCircle, ArrowRight, Minus, Plus, Edit3, MessageSquare, ShieldCheck, 
    Trash2, ClipboardList, CheckSquare, PlusCircle
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { createNotificationByRoute } from '../services/notificationService';

const DEFAULT_APPROVAL_STEPS = [
    { step: 0, label: '연구소 담당자', approverId: '', approverName: '' },
    { step: 1, label: '생산 담당자', approverId: '', approverName: '' },
    { step: 2, label: 'QA 담당자', approverId: '', approverName: '' },
    { step: 3, label: '영업 담당자', approverId: '', approverName: '' },
    { step: 4, label: '대표', approverId: '', approverName: '' }
];

const ECN_COLUMN_DEFS = {
    ECNNumber: { label: '문서번호', default: true },
    Title: { label: '승인서 제목', default: true },
    ECNType: { label: '구분', default: true },
    PublishDate: { label: '발행일자', default: true },
    Status: { label: '상태', default: true },
    CurrentStep: { label: '결재 현황', default: true },
    RequestedBy: { label: '기안자', default: true },
    CreatedAt: { label: '기안 일시', default: true },
};

const DRAFT_COLUMN_DEFS = {
    Type: { label: '분류', default: true },
    PartID: { label: '품번', default: true },
    PartName: { label: '품명', default: true },
    Rev: { label: '현재 Rev', default: true },
    Reason: { label: '변경 요약/사유', default: true },
    RequestedBy: { label: '발의자', default: true },
};

const ECNPage = () => {
    const { userProfile } = useAuth();
    const location = useLocation();
    
    // View Mode: PENDING (결재대기함), HISTORY (처리완료함), DRAFT_ITEMS (설변 대기 리스트)
    const [viewMode, setViewMode] = useState('PENDING'); 
    const [ecnList, setEcnList] = useState([]);
    const [draftItems, setDraftItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [selectedEcn, setSelectedEcn] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [approvalComment, setApprovalComment] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // ECN 승인서 작성 모달 상태
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedDraftIds, setSelectedDraftIds] = useState([]);
    const [formTitle, setFormTitle] = useState('');
    const [formPublishDate, setFormPublishDate] = useState(new Date().toISOString().slice(0, 10));
    const [formCategory, setFormCategory] = useState('Actuator');
    const [formModelSeries, setFormModelSeries] = useState('');
    const [formCommMethod, setFormCommMethod] = useState([]);
    const [formStroke, setFormStroke] = useState([]);
    const [candidateTargetModels, setCandidateTargetModels] = useState([]);
    const [matchedTargetModelIDs, setMatchedTargetModelIDs] = useState([]);
    const [selectedTargetModels, setSelectedTargetModels] = useState([]);
    const [applyToAllSeries, setApplyToAllSeries] = useState(false);
    const [individualRevBump, setIndividualRevBump] = useState(false);
    const [individualRevs, setIndividualRevs] = useState({});
    
    const [formModelsText, setFormModelsText] = useState('');
    const [formECNType, setFormECNType] = useState('정규');
    const [formSpecChange, setFormSpecChange] = useState(false);
    const [formSpecChangeContent, setFormSpecChangeContent] = useState('');
    const [formImprovement, setFormImprovement] = useState('');
    const [formNote, setFormNote] = useState('');
    const [formRevNo, setFormRevNo] = useState('2.0');
    const [customApprovalSteps, setCustomApprovalSteps] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [bomFolders, setBomFolders] = useState([]);

    const [filteredData, setFilteredData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'CreatedAt', direction: 'desc' });
    const [gridViewMode, setGridViewMode] = useState('list');

    useEffect(() => {
        fetchECNs();
        fetchDraftItemsAndUsers();
    }, [viewMode]);

    // 모달이 열리면 리스트와 bom_folders를 가져오기
    useEffect(() => {
        if (!isCreateModalOpen) return;
        const fetchData = async () => {
            try {
                // Fetch parts from local REST API
                const partsResp = await fetch('http://localhost:5050/api/db/parts');
                if (!partsResp.ok) throw new Error(`HTTP ${partsResp.status} for parts`);
                const partsData = await partsResp.json();
                setAllProducts(partsData);

                // Construct bomFolders from parts with Class 'BOM_Category' or 'BOM_Series'
                const mockBomFolders = partsData.filter(p => p.Class === 'BOM_Category' || p.Class === 'BOM_Series').map(p => ({
                    id: p.id,
                    name: p.Name,
                    type: p.Class === 'BOM_Category' ? 'category' : 'series',
                    parentId: p.ParentFolderId || null
                }));

                // Fetch bom_folders from local REST API (in case there are any)
                const foldersResp = await fetch('http://localhost:5050/api/db/bom_folders');
                if (!foldersResp.ok) throw new Error(`HTTP ${foldersResp.status} for bom_folders`);
                const foldersData = await foldersResp.json();
                
                setBomFolders([...mockBomFolders, ...foldersData]);
            } catch (err) {
                console.error("Error fetching data from local API:", err);
            }
        };
        fetchData();
    }, [isCreateModalOpen]);

    // 분류(Category)에 따른 동적 시리즈(Series) 옵션 추출 (Actuator 전용)
    const seriesOptions = React.useMemo(() => {
        if (formCategory !== 'Actuator') return [];

        const seriesSet = new Set();
        
        // Actuator 카테고리 ID들 식별 (bom_folders 기반)
        const actuatorCats = bomFolders.filter(f => f.type === 'category' && (
            f.name?.toLowerCase().includes('actuator') || f.name?.includes('액추')
        ));
        const actuatorCatIds = actuatorCats.map(f => f.id);

        // 1. bom_folders에서 Actuator 카테고리 하위 시리즈 추출
        actuatorCats.forEach(actuatorCat => {
            bomFolders.filter(f => f.type === 'series' && f.parentId === actuatorCat.id).forEach(s => {
                if (s.name) seriesSet.add(s.name);
            });
        });
        
        console.log('Collected series options:', Array.from(seriesSet).length, Array.from(seriesSet));
        
        return Array.from(seriesSet).sort().map(name => ({ id: name, name: name }));
    }, [allProducts, bomFolders, formCategory]);

    // 시리즈 및 필터 변경 시 대상 모델 추출 로직
    useEffect(() => {
        if (!isCreateModalOpen || allProducts.length === 0) {
            setCandidateTargetModels([]);
            setMatchedTargetModelIDs([]);
            setSelectedTargetModels([]);
            return;
        }
        
        let seriesModels = [];

        // BOM 폴더 ID 식별 (Board 카테고리 포함 한글)
        const boardCatIds = bomFolders.filter(f => f.type === 'category' && (
            f.name?.toLowerCase().includes('board') || f.name?.toLowerCase().includes('pcb') || f.name?.includes('보드')
        )).map(f => f.id);
        const actuatorCatIds = bomFolders.filter(f => f.type === 'category' && (
            f.name?.toLowerCase().includes('actuator') || f.name?.includes('액추')
        )).map(f => f.id);

        if (formCategory === 'Board') {
            // Board는 시리즈 필터 없이 모든 완제품 보드를 가져옴
            seriesModels = allProducts.filter(p => {
                if (p.ProductCategoryId && boardCatIds.includes(p.ProductCategoryId)) return true;

                const cat = (p.Category || '').toLowerCase();
                const cls = (p.Class || '').toLowerCase();
                const name = (p.Name || '').toLowerCase();
                
                // 이름이나 클래스, 카테고리에 board, pcb, pcba 가 포함된 부품들
                const isBoard = name.includes('board') || name.includes('pcb') || cat.includes('board') || cls.includes('board');
                
                // BOM_Category 등의 설정용 데이터는 제외
                return isBoard && cls !== 'bom_category' && cls !== 'bom_series';
            });
        } else if (formCategory === 'Actuator') {
            if (!formModelSeries) {
                setCandidateTargetModels([]);
                setMatchedTargetModelIDs([]);
                setSelectedTargetModels([]);
                return;
            }

            // 선택된 series 찾기
            const prefix = formModelSeries;
            const seriesFolder = bomFolders.find(f => f.name === prefix && f.type === 'series');
            
            seriesModels = allProducts.filter(p => {
                const isActuatorByBOM = p.ProductCategoryId && actuatorCatIds.includes(p.ProductCategoryId);
                
                const cat = (p.Category || '').toLowerCase();
                const cls = (p.Class || '').toLowerCase();
                const isProductLegacy = cat.includes('완제품') || cat.includes('product') || cat.includes('actuator') || cls.includes('actuator') || (p.PartID && p.PartID.match(/^(12|17|22|32)/));
                const isActuatorLegacy = cls.includes('actuator') || cat.includes('actuator') || cls === '' || !cls;
                
                if (!isActuatorByBOM && (!isProductLegacy || !isActuatorLegacy)) return false;

                // bom_folders 기준 매칭
                if (seriesFolder && p.ProductSeriesId === seriesFolder.id) return true;
                
                // fallback (PartID prefix 매칭)
                return (p.PartID && p.PartID.startsWith(prefix)) || (p.Name && p.Name.startsWith(prefix));
            });
        }

        // 이름순 정렬
        seriesModels.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
        setCandidateTargetModels(seriesModels);

        // 통신 및 스트로크 필터에 맞는 모델 ID 추출
        let matchedIDs = [];
        seriesModels.forEach(model => {
            let isCommMatched = false;
            let isStrokeMatched = false;
            const modelName = model.Name || '';

            // 통신 필터 (아무것도 선택 안했으면 필터 적용 안함 = 모두 매칭)
            if (formCommMethod.length === 0) {
                isCommMatched = true;
            } else {
                isCommMatched = formCommMethod.some(method => {
                    const methodUpper = method.toUpperCase();
                    return model.Spec && typeof model.Spec === 'string' && model.Spec.toUpperCase().includes(methodUpper);
                });
            }

            // Stroke 필터 (아무것도 선택 안했으면 필터 적용 안함 = 모두 매칭)
            if (formStroke.length === 0) {
                isStrokeMatched = true;
            } else {
                isStrokeMatched = formStroke.some(stroke => {
                    const numOnly = stroke.replace('mm', '');
                    const regex = new RegExp(`${numOnly}\\s*mm`, 'i');
                    return model.Spec && typeof model.Spec === 'string' && model.Spec.match(regex);
                });
            }

            if (isCommMatched && isStrokeMatched) {
                matchedIDs.push(model.PartID);
            }
        });
        
        setMatchedTargetModelIDs(matchedIDs);

        const finalSelectedIDs = applyToAllSeries ? seriesModels.map(m => m.PartID) : matchedIDs;
        setSelectedTargetModels(finalSelectedIDs);

        // 최대 Rev 계산 및 개별 Rev 초기화
        let maxRevVal = 0;
        const newIndivRevs = {};

        seriesModels.forEach(m => {
            const revNum = parseFloat(m.Rev || '1.0');
            // 선택된 모델들 중에서만 최대 리비전 계산
            if (finalSelectedIDs.includes(m.PartID)) {
                if (!isNaN(revNum) && revNum > maxRevVal) {
                    maxRevVal = revNum;
                }
            }
            // 모든 후보 모델에 대해 +0.1 한 값을 개별 리비전 초기값으로 세팅
            newIndivRevs[m.PartID] = isNaN(revNum) ? '1.1' : (revNum + 0.1).toFixed(1);
        });

        if (maxRevVal === 0) maxRevVal = 1.0;
        
        // 필터나 선택 대상이 바뀌면 전체 formRevNo 자동 업데이트
        setFormRevNo((maxRevVal + 0.1).toFixed(1));
        setIndividualRevs(newIndivRevs);

    }, [formModelSeries, formCommMethod, formStroke, applyToAllSeries, isCreateModalOpen, allProducts]);

    // URL 파라미터 감지 (외부 링크 연동용)
    useEffect(() => {
        if (ecnList.length > 0) {
            const params = new URLSearchParams(location.search);
            const ecnId = params.get('id');
            if (ecnId) {
                const target = ecnList.find(e => e.id === ecnId);
                if (target) {
                    setSelectedEcn(target);
                    setIsDetailsModalOpen(true);
                }
            }
        }
    }, [location.search, ecnList]);

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

    const fetchECNs = async () => {
        setLoading(true);
        try {
            let q;
            if (viewMode === 'PENDING') {
                q = query(collection(db, 'ecns'), where('Status', '==', 'Pending'));
            } else {
                q = query(collection(db, 'ecns'), where('Status', 'in', ['Approved', 'Rejected']));
            }
            const querySnapshot = await getDocs(q);
            const list = [];
            querySnapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });

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

    const fetchDraftItemsAndUsers = async () => {
        try {
            // ecn_draft_items 중 대기(Draft) 상태인 항목 조회
            const draftSnap = await getDocs(query(collection(db, 'ecn_draft_items'), where('Status', '==', 'Draft')));
            const list = [];
            draftSnap.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setDraftItems(list);

            // 전체 유저 정보 조회 (결재선 지정용)
            const usersSnap = await getDocs(collection(db, 'users'));
            const uList = [];
            usersSnap.forEach((doc) => {
                const uData = doc.data();
                uList.push({
                    uid: doc.id,
                    email: uData.email || '',
                    displayName: uData.displayName || uData.Name || '알 수 없는 사용자',
                    role: uData.role || ''
                });
            });
            setUsers(uList);
        } catch (err) {
            console.error("Error fetching draft items and users:", err);
        }
    };

    // ECN 승인서 기안용 문서번호 자동 생성
    const generateECNNumber = async () => {
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const ecnsSnap = await getDocs(collection(db, 'ecns'));
        const todayEcns = ecnsSnap.docs.filter(d => (d.data().ECNNumber || '').startsWith(`ECN-${todayStr}`));
        const nextSeq = (todayEcns.length + 1).toString().padStart(4, '0');
        return `ECN-${todayStr}-${nextSeq}`;
    };

    // ECN 기안 제출
    const handleSubmitECN = async () => {
        if (!formTitle.trim()) { alert('승인서 제목을 입력해주세요.'); return; }
        if (selectedDraftIds.length === 0) { alert('설계변경 대기 리스트에서 하나 이상의 대상을 선택해주세요.'); return; }
        
        // 결재선 검증 (비어 있는 결재자가 있는지)
        const hasEmptyApprover = customApprovalSteps.some(step => !step.approverId);
        if (hasEmptyApprover) {
            alert('모든 결재 단계의 결재자를 지정해주세요.');
            return;
        }

        try {
            setLoading(true);
            const batch = writeBatch(db);
            const ecnNum = await generateECNNumber();
            const newEcnRef = doc(collection(db, 'ecns'));

            const selectedItems = draftItems.filter(item => selectedDraftIds.includes(item.id));

            const newEcnDoc = {
                ECNNumber: ecnNum,
                Title: formTitle.trim(),
                PublishDate: formPublishDate,
                Category: formCategory,
                Series: formModelSeries,
                CommMethod: formCommMethod,
                StrokeLength: formStroke,
                ECNType: formECNType,
                SpecChange: formSpecChange,
                SpecChangeContent: formSpecChangeContent,
                Improvement: formImprovement,
                Note: formNote,
                RevNo: formRevNo,
                TargetNewRev: individualRevBump ? '개별 계산' : formRevNo,
                TargetRevs: individualRevBump ? individualRevs : {},
                TargetModels: selectedTargetModels.filter(id => matchedTargetModelIDs.includes(id)),
                SeriesModels: selectedTargetModels.filter(id => !matchedTargetModelIDs.includes(id)),
                Status: 'Pending',
                CurrentStep: 0,
                ApprovalHistory: [],
                ApprovalSteps: customApprovalSteps,
                RequestedBy: userProfile?.displayName || userProfile?.Name || 'Unknown',
                CreatedAt: serverTimestamp(),
                Items: selectedItems 
            };

            batch.set(newEcnRef, newEcnDoc);

            // 대기 항목들의 상태를 'Pending ECN'으로 변경하여 묶임 상태 명시
            selectedItems.forEach(item => {
                const itemRef = doc(db, 'ecn_draft_items', item.id);
                batch.update(itemRef, { Status: 'Pending ECN', ECNNumber: ecnNum });
            });

            await batch.commit();
            alert(`설계변경 승인서 기안이 완료되었습니다. (문서번호: ${ecnNum})`);
            setIsCreateModalOpen(false);
            
            // 폼 초기화
            setFormTitle('');
            setFormCategory('Actuator');
            setFormModelSeries('');
            setFormCommMethod(['PT', 'RS485', 'Modbus RTU', 'CAN', 'TTL', 'None']);
            setFormStroke(['27mm', '40mm', '53mm', 'None']);
            setFormECNType('정규');
            setFormSpecChange(false);
            setFormSpecChangeContent('');
            setFormImprovement('');
            setFormNote('');
            setFormRevNo('2.0');
            setSelectedDraftIds([]);

            fetchECNs();
            fetchDraftItemsAndUsers();
        } catch (error) {
            console.error("ECN 제출 실패:", error);
            alert("ECN 승인서 저장 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const isUserTurn = (ecn) => {
        if (!userProfile || ecn.Status !== 'Pending') return false;
        const currentStepIdx = ecn.CurrentStep || 0;
        
        // 지정 결재선 존재 시, 해당 단계 approverId가 일치하는지 판별
        if (ecn.ApprovalSteps && ecn.ApprovalSteps.length > 0) {
            const currentStepApprover = ecn.ApprovalSteps[currentStepIdx];
            return userProfile.uid === currentStepApprover?.approverId || userProfile.role === 'admin';
        }
        
        return userProfile.role === 'admin';
    };

    // ECN 결재 승인
    const handleApprove = async (ecn) => {
        const currentStepIdx = ecn.CurrentStep || 0;
        const totalSteps = ecn.ApprovalSteps ? ecn.ApprovalSteps.length : DEFAULT_APPROVAL_STEPS.length;
        const isFinalStep = currentStepIdx === totalSteps - 1;
        const stepsList = ecn.ApprovalSteps || DEFAULT_APPROVAL_STEPS;

        if (!window.confirm(isFinalStep ? '최종 승인하시겠습니까? 관련 부품 및 BOM 변경 내용이 실시간 반영되고 새 리비전이 발행됩니다.' : `${stepsList[currentStepIdx].label} 단계 승인을 진행하시겠습니까?`)) return;

        try {
            const batch = writeBatch(db);
            const ecnRef = doc(db, 'ecns', ecn.id);
            
            const approvalRecord = {
                step: currentStepIdx,
                stepName: stepsList[currentStepIdx].label,
                approver: userProfile?.displayName || userProfile?.Name || 'Unknown',
                approverId: userProfile?.uid,
                timestamp: new Date(),
                comment: approvalComment,
                status: 'Approved'
            };

            if (isFinalStep) {
                // 최종 승인 시 설계변경 내역 일괄 반영
                const targetModels = ecn.TargetModels || [];
                const seriesModels = ecn.SeriesModels || [];
                const allModelsToProcess = [...targetModels, ...seriesModels];

                // 1. 모델들의 리비전 업데이트
                for (const modelId of allModelsToProcess) {
                    const partsQuery = query(collection(db, 'parts'), where('PartID', '==', modelId));
                    const partsSnap = await getDocs(partsQuery);

                    if (!partsSnap.empty) {
                        const partDoc = partsSnap.docs[0];
                        const partRef = partDoc.ref;
                        const oldPartData = partDoc.data();
                        
                        let nextRev = '1.0';
                        if (ecn.TargetNewRev && ecn.TargetNewRev !== '개별 계산') {
                            nextRev = String(ecn.TargetNewRev);
                        } else {
                            nextRev = getNextRevision(oldPartData.Revision || oldPartData.Rev || '1.0');
                        }

                        // 부품 ID 유지, 리비전만 증가
                        batch.update(partRef, {
                            Rev: nextRev,
                            Revision: nextRev,
                            LastModified: serverTimestamp()
                        });
                        
                        // 기존 BOM 레코드의 Revision 필드 업데이트
                        const bomQuery = query(collection(db, 'bom'), where('ParentID', '==', modelId));
                        const bomSnap = await getDocs(bomQuery);
                        bomSnap.forEach(bomDoc => {
                            batch.update(bomDoc.ref, { Revision: nextRev });
                        });
                    }
                }

                // 2. 구체적인 Draft Item 내역 (BOM 변경 등) 적용
                if (ecn.Items && ecn.Items.length > 0) {
                    for (const item of ecn.Items) {
                        if (item.Type === 'BOM Change' && item.ProposedBOM && Array.isArray(item.ProposedBOM)) {
                            const bomQuery = query(collection(db, 'bom'), where('ParentID', '==', item.PartID));
                            const bomSnap = await getDocs(bomQuery);
                            bomSnap.forEach(bomDoc => {
                                batch.delete(doc(db, 'bom', bomDoc.id));
                            });

                            let nextRev = '1.0';
                            if (ecn.TargetNewRev && ecn.TargetNewRev !== '개별 계산') {
                                nextRev = String(ecn.TargetNewRev);
                            } else {
                                nextRev = getNextRevision(item.Rev || '1.0');
                            }

                            item.ProposedBOM.forEach((pBom) => {
                                const newBomRef = doc(collection(db, 'bom'));
                                batch.set(newBomRef, {
                                    ParentID: item.PartID,
                                    ChildID: pBom.ChildID,
                                    Quantity: pBom.Quantity,
                                    Location: pBom.Location || '',
                                    Note: pBom.Note || '',
                                    Revision: nextRev,
                                    CreatedAt: serverTimestamp()
                                });
                            });
                        }

                        // ecn_draft_items 승인 처리 완료 상태 변경
                        const draftItemRef = doc(db, 'ecn_draft_items', item.id);
                        batch.update(draftItemRef, { Status: 'Approved' });
                    }
                }

                batch.update(ecnRef, {
                    Status: 'Approved',
                    CurrentStep: currentStepIdx + 1,
                    ProcessedAt: serverTimestamp(),
                    ApprovalHistory: arrayUnion(approvalRecord),
                    ApprovedBy: userProfile?.displayName || userProfile?.Name || 'System'
                });
            } else {
                batch.update(ecnRef, {
                    CurrentStep: currentStepIdx + 1,
                    ApprovalHistory: arrayUnion(approvalRecord)
                });
            }

            await batch.commit();

            // 알림 발송
            try {
                if (isFinalStep) {
                    await createNotificationByRoute('/parts', 'ECN 최종 승인 완료', `ECN [${ecn.ECNNumber || ecn.id}] 설계변경 건이 최종 승인되었습니다.`);
                } else {
                    await createNotificationByRoute('/ecn', 'ECN 결재 승인', `ECN [${ecn.ECNNumber || ecn.id}] 건이 ${stepsList[currentStepIdx].label} 단계를 통과하였습니다.`);
                }
            } catch (notiErr) {
                console.warn("Failed to send ECN approval notification:", notiErr);
            }

            alert(isFinalStep ? '최종 승인이 완료되었습니다.' : '승인되었습니다. 다음 단계로 전달됩니다.');
            setApprovalComment('');
            setIsDetailsModalOpen(false);
            fetchECNs();
        } catch (error) {
            console.error("Error approving ECN: ", error);
            alert('승인 처리 중 오류가 발생했습니다.');
        }
    };

    // ECN 결재 반려
    const handleReject = async (ecn) => {
        const reason = approvalComment.trim();
        if (!reason) {
            alert('반려 사유를 결재 의견란에 먼저 입력해주세요.');
            return;
        }

        if (!window.confirm('해당 ECN 요청을 반려 처리하시겠습니까?')) return;

        try {
            const batch = writeBatch(db);
            const ecnRef = doc(db, 'ecns', ecn.id);
            const currentStepIdx = ecn.CurrentStep || 0;
            const stepsList = ecn.ApprovalSteps || DEFAULT_APPROVAL_STEPS;
            
            const rejectRecord = {
                step: currentStepIdx,
                stepName: stepsList[currentStepIdx].label,
                approver: userProfile?.displayName || userProfile?.Name || 'Unknown',
                approverId: userProfile?.uid,
                timestamp: new Date(),
                comment: reason,
                status: 'Rejected'
            };

            batch.update(ecnRef, {
                Status: 'Rejected',
                ProcessedAt: serverTimestamp(),
                RejectedBy: userProfile?.displayName || userProfile?.Name || 'System',
                RejectReason: reason,
                ApprovalHistory: arrayUnion(rejectRecord)
            });

            // 묶인 품목 대기 상태(Draft) 및 품목 원상태 복구
            if (ecn.Items && ecn.Items.length > 0) {
                for (const item of ecn.Items) {
                    const draftItemRef = doc(db, 'ecn_draft_items', item.id);
                    batch.update(draftItemRef, { Status: 'Draft' });

                    const partsQuery = query(collection(db, 'parts'), where('PartID', '==', item.PartID));
                    const partsSnap = await getDocs(partsQuery);
                    if (!partsSnap.empty) {
                        batch.update(partsSnap.docs[0].ref, { Status: 'Approved' });
                    }
                }
            }

            await batch.commit();

            // 반려 알림 발송
            try {
                await createNotificationByRoute('/ecn', 'ECN 결재 반려', `ECN [${ecn.ECNNumber || ecn.id}] 건이 반려 처리되었습니다. 사유: ${reason}`);
            } catch (notiErr) {
                console.warn("Failed to send ECN rejection notification:", notiErr);
            }

            alert('반려 처리되었습니다. 관련 품목들은 설계변경 대기 리스트로 원복되었습니다.');
            setApprovalComment('');
            setIsDetailsModalOpen(false);
            fetchECNs();
        } catch (error) {
            console.error("Error rejecting ECN: ", error);
            alert('반려 처리 중 오류가 발생했습니다.');
        }
    };

    const StatusTag = ({ status }) => {
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

    const StepIndicator = ({ currentStep, steps, status }) => {
        const list = steps && steps.length > 0 ? steps : DEFAULT_APPROVAL_STEPS;
        return (
            <div className="flex items-center gap-1 w-full">
                {list.map((step, idx) => (
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
                        {idx < list.length - 1 && <div className="w-1" />}
                    </React.Fragment>
                ))}
            </div>
        );
    };

    const openCreateModal = () => {
        if (draftItems.length === 0) {
            alert('현재 설계변경 대기 리스트에 등록된 품목이 없습니다.');
            return;
        }
        // 기본 5개 단계 초기화 및 유저 매핑
        setCustomApprovalSteps(DEFAULT_APPROVAL_STEPS.map(step => ({
            ...step,
            approverId: users.find(u => u.role === step.role)?.uid || '',
            approverName: users.find(u => u.role === step.role)?.displayName || ''
        })));
        setIsCreateModalOpen(true);
    };

    const handleAddApprovalStep = () => {
        const nextStepIdx = customApprovalSteps.length;
        setCustomApprovalSteps([
            ...customApprovalSteps,
            { step: nextStepIdx, label: `추가 결재자 ${nextStepIdx + 1}`, approverId: '', approverName: '' }
        ]);
    };

    const handleRemoveApprovalStep = (idx) => {
        const filtered = customApprovalSteps.filter((_, i) => i !== idx).map((step, newIdx) => ({
            ...step,
            step: newIdx
        }));
        setCustomApprovalSteps(filtered);
    };

    const handleStepApproverChange = (idx, approverUid) => {
        const targetUser = users.find(u => u.uid === approverUid);
        const updated = [...customApprovalSteps];
        updated[idx].approverId = approverUid;
        updated[idx].approverName = targetUser ? targetUser.displayName : '';
        setCustomApprovalSteps(updated);
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
                            ECN 설계변경 결재 시스템
                        </h1>
                        <p className="text-slate-500 font-medium mt-3 ml-1">품목 및 BOM의 변경 내역을 통합한 설계변경 승인서 작성 및 결재 진행</p>
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
                        <button
                            onClick={() => setViewMode('DRAFT_ITEMS')}
                            className={`px-4 py-3 rounded-xl text-sm font-black transition-all duration-300 relative ${
                                viewMode === 'DRAFT_ITEMS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            설변 대기 리스트
                            {draftItems.length > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border border-white animate-bounce">
                                    {draftItems.length}
                                </span>
                            )}
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
                ) : viewMode === 'DRAFT_ITEMS' ? (
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col flex-1 min-h-0 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                                    <ClipboardList className="text-indigo-600" size={18} /> 설계변경 임시 대기 목록 ({draftItems.length})
                                </h3>
                                <p className="text-slate-400 text-xs mt-1">부품 스펙 수정 및 BOM 변경 기안 후 아직 승인서 결재선이 지정되지 않은 임시 변경 데이터들입니다.</p>
                            </div>
                            <button
                                onClick={openCreateModal}
                                className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all flex items-center gap-2"
                            >
                                <PlusCircle size={16} /> ECN 승인서 작성
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-auto border border-slate-100 rounded-2xl">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">분류</th>
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">대상 품번</th>
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">품명</th>
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">현재 Rev</th>
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">변경 요약 및 사유</th>
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">기안자</th>
                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">발의일</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {draftItems.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="p-20 text-center text-slate-400 text-sm font-bold">
                                                현재 설계변경 대기 상태의 품목 내역이 없습니다.
                                            </td>
                                        </tr>
                                    ) : (
                                        draftItems.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 text-[9px] font-black rounded border uppercase ${
                                                        item.Type === 'BOM Change' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                                                    }`}>{item.Type === 'BOM Change' ? 'BOM 구조' : '단일 파트'}</span>
                                                </td>
                                                <td className="p-3 font-extrabold text-xs text-indigo-600">{item.PartID}</td>
                                                <td className="p-3 font-semibold text-xs text-slate-700 truncate max-w-[150px]">{item.PartName}</td>
                                                <td className="p-3 text-xs text-slate-500 font-bold">Rev {item.Rev}</td>
                                                <td className="p-3 text-xs text-slate-600 font-medium truncate max-w-[300px]" title={item.Reason}>{item.Reason || '사유 없음'}</td>
                                                <td className="p-3 text-xs text-slate-500 font-bold">{item.RequestedBy}</td>
                                                <td className="p-3 text-xs text-slate-400 font-bold">
                                                    {item.CreatedAt?.toDate ? item.CreatedAt.toDate().toLocaleDateString() : 'N/A'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : ecnList.length === 0 ? (
                    <div className="bg-white rounded-[40px] border-2 border-dashed border-slate-200 p-32 text-center shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 border border-slate-100">
                            <Clock size={48} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 mb-3 tracking-tight">표시할 결재 안건이 없습니다.</h3>
                        <p className="text-slate-400 font-medium max-w-xs mx-auto">새로운 설계 변경 요청이 기안되면 여기에 표시됩니다.</p>
                    </div>
                ) : (
                    <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm flex-1 flex flex-col min-h-0 relative z-20 overflow-hidden mt-3 mx-1">
                        <MasterDataGrid
                            data={sortedList}
                            columnDefs={ECN_COLUMN_DEFS}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            onRowClick={(row) => { setSelectedEcn(row); setIsDetailsModalOpen(true); }}
                            rowKey="id"
                            sortableColumns={['ECNNumber', 'Title', 'ECNType', 'PublishDate', 'Status', 'RequestedBy', 'CreatedAt']}
                            enableSearch={true}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            searchPlaceholder="문서번호, 제목, 기안자 검색..."
                            enableFilter={true}
                            onFilteredDataChange={setFilteredData}
                            enableViewModeToggle={true}
                            viewMode={gridViewMode}
                            onViewModeChange={setGridViewMode}
                            cellRenderer={{
                                Status: (val, row) => <StatusTag status={row.Status} />,
                                ECNType: (val) => <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black rounded uppercase tracking-widest border border-slate-200 shrink-0">{val || 'ECN'}</span>,
                                CurrentStep: (val, row) => (
                                    <div className="scale-[0.65] origin-left w-64 -my-3 flex items-center">
                                        <StepIndicator currentStep={val || 0} steps={row.ApprovalSteps} status={row.Status} />
                                    </div>
                                ),
                                CreatedAt: (val, row) => {
                                    const timeVal = viewMode === 'HISTORY' ? row.ProcessedAt : val;
                                    return <span className="text-xs text-slate-500 font-bold tracking-tight">{timeVal?.toDate ? timeVal.toDate().toLocaleDateString() : 'N/A'}</span>;
                                },
                                Title: (val, row) => (
                                    <div className="flex items-center gap-2 max-w-[300px]">
                                        {isUserTurn(row) && <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse shrink-0" />}
                                        <span className="font-extrabold text-slate-900 truncate">{val || 'ECN Request'}</span>
                                    </div>
                                )
                            }}
                            cardRenderer={(ecn) => (
                                <div key={ecn.id} onClick={() => { setSelectedEcn(ecn); setIsDetailsModalOpen(true); }} className="bg-white rounded-lg border border-slate-200 p-2 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-300 group relative overflow-hidden flex items-center cursor-pointer">
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
                                                <StatusTag status={ecn.Status} />
                                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black rounded uppercase tracking-widest border border-slate-200 shrink-0">{ecn.ECNNumber || 'ECN'}</span>
                                                <h3 className="text-sm font-black text-slate-900 truncate shrink max-w-[250px]">{ecn.Title || 'ECN Request'}</h3>
                                                <div className="flex items-center gap-2 text-xs truncate shrink min-w-0 ml-2 hidden xl:flex text-slate-400">
                                                    <span>(총 {ecn.Items?.length || 0}건 묶음)</span>
                                                    <span className="ml-1"><User className="text-slate-400 inline" size={10} /> {ecn.RequestedBy}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-1 max-w-[250px] hidden lg:block shrink-0 px-4">
                                            <StepIndicator currentStep={ecn.CurrentStep || 0} steps={ecn.ApprovalSteps} status={ecn.Status} />
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

            {/* 설계변경 승인서 기안 작성 모달 */}
            {isCreateModalOpen && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90%] overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <ClipboardList size={22} className="text-indigo-600" /> 설계변경(ECN) 승인서 작성 기안
                                </h2>
                                <p className="text-slate-400 text-xs mt-1">대기 중인 부품 및 BOM의 변경 내역을 묶어서 통합 결재선을 발행합니다.</p>
                            </div>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto flex flex-col lg:flex-row gap-6 lg:gap-0">
                            <div className="flex-1 space-y-6 lg:pr-6">
                                {/* 1. ECN 정보 작성 */}
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4 shadow-sm">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">승인서 제목</label>
                                        <input 
                                            type="text" 
                                            value={formTitle}
                                            onChange={(e) => setFormTitle(e.target.value)}
                                            placeholder="설계변경 승인서 제목을 적으세요..."
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">발행일자</label>
                                        <input 
                                            type="date" 
                                            value={formPublishDate}
                                            onChange={(e) => setFormPublishDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                    
                                    <div className="md:col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">적용 분류</label>
                                        <select 
                                            value={formCategory}
                                            onChange={(e) => {
                                                setFormCategory(e.target.value);
                                                setFormModelSeries('');
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100"
                                        >
                                            <option value="Actuator">Actuator</option>
                                            <option value="Board">Board</option>
                                            <option value="Mechanical Parts">Mechanical Parts</option>
                                            <option value="ETC">기타 부품군</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">시리즈 선택</label>
                                        <select 
                                            value={formModelSeries}
                                            onChange={(e) => setFormModelSeries(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100"
                                        >
                                            <option value="">시리즈 선택</option>
                                            {seriesOptions.map(series => (
                                                <option key={series.id} value={series.id}>{series.name}</option>
                                            ))}
                                            {/* DB에 없는 경우를 위한 수동 입력 옵션 방어 */}
                                            {seriesOptions.length === 0 && <option disabled>해당 분류의 시리즈 없음</option>}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">구분 (Type)</label>
                                        <div className="flex gap-2 bg-slate-200 p-1 rounded-xl">
                                            <button 
                                                type="button"
                                                onClick={() => setFormECNType('정규')}
                                                className={`flex-1 py-1 rounded-lg text-xs font-black transition-all ${formECNType === '정규' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                            >
                                                정규
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setFormECNType('임시')}
                                                className={`flex-1 py-1 rounded-lg text-xs font-black transition-all ${formECNType === '임시' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                            >
                                                임시
                                            </button>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">통신 방법</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {['PT', 'RS485', 'CAN', 'TTL'].map(method => (
                                                <label key={method} className="flex items-center gap-1.5 cursor-pointer bg-white border border-slate-200 px-2 py-0.5 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                                                    <input 
                                                        type="checkbox"
                                                        checked={formCommMethod.includes(method)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setFormCommMethod(prev => [...prev, method]);
                                                            else setFormCommMethod(prev => prev.filter(m => m !== method));
                                                        }}
                                                        className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                                                    />
                                                    <span className="text-[10px] font-bold text-slate-700">{method === 'PT' ? 'PT (IRPROTOCOL)' : method}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Stroke 길이</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {['27mm', '40mm', '53mm'].map(stroke => (
                                                <label key={stroke} className="flex items-center gap-1.5 cursor-pointer bg-white border border-slate-200 px-2 py-0.5 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                                                    <input 
                                                        type="checkbox"
                                                        checked={formStroke.includes(stroke)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setFormStroke(prev => [...prev, stroke]);
                                                            else setFormStroke(prev => prev.filter(s => s !== stroke));
                                                        }}
                                                        className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                                                    />
                                                    <span className="text-[11px] font-bold text-slate-700">{stroke}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">적용 대상 모델 (완제품)</label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input 
                                                type="checkbox"
                                                checked={applyToAllSeries}
                                                onChange={(e) => setApplyToAllSeries(e.target.checked)}
                                                className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                                            />
                                            <span className="text-[10px] font-bold bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-600">시리즈 전체 적용</span>
                                        </label>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto">
                                        {candidateTargetModels.length === 0 ? (
                                            <p className="text-xs text-slate-400 text-center py-4">선택된 시리즈에 해당하는 완제품이 없습니다.</p>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                {candidateTargetModels.map(model => {
                                                    const isMatched = matchedTargetModelIDs.includes(model.PartID);
                                                    return (
                                                    <label key={model.PartID} className={`flex items-center gap-2 cursor-pointer p-1.5 rounded-lg transition-colors ${
                                                        isMatched ? 'hover:bg-indigo-50 bg-white border border-slate-100 shadow-sm' : 'hover:bg-slate-100 opacity-60'
                                                    }`}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedTargetModels.includes(model.PartID)}
                                                            disabled={applyToAllSeries}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedTargetModels(prev => [...prev, model.PartID]);
                                                                } else {
                                                                    setSelectedTargetModels(prev => prev.filter(id => id !== model.PartID));
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300 disabled:opacity-50"
                                                        />
                                                        <span className={`text-xs flex-1 truncate ${isMatched ? 'font-black text-slate-800' : 'font-bold text-slate-500'}`}>{model.Name}</span>
                                                        
                                                        {individualRevBump ? (
                                                            <div className="ml-auto flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                                                <span className="text-[9px] font-bold text-slate-400 hidden sm:inline">Rev {model.Rev || '1.0'} →</span>
                                                                <input 
                                                                    type="text"
                                                                    value={individualRevs[model.PartID] || ''}
                                                                    onChange={(e) => setIndividualRevs(prev => ({...prev, [model.PartID]: e.target.value}))}
                                                                    disabled={!selectedTargetModels.includes(model.PartID)}
                                                                    className="w-10 sm:w-12 text-center sm:text-right text-[10px] font-black bg-white border border-indigo-200 px-1 py-0.5 rounded text-indigo-700 outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span className="ml-auto shrink-0 text-[10px] font-black bg-slate-200 px-1.5 py-0.5 rounded text-slate-500">Rev {model.Rev || '1.0'}</span>
                                                        )}
                                                    </label>
                                                )})}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Revision No. (계획)</label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input 
                                                type="checkbox"
                                                checked={individualRevBump}
                                                onChange={(e) => setIndividualRevBump(e.target.checked)}
                                                className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"
                                            />
                                            <span className="text-[10px] font-bold text-slate-500">개별 +0.1 증가</span>
                                        </label>
                                    </div>
                                    <input 
                                        type="text" 
                                        value={formRevNo}
                                        onChange={(e) => setFormRevNo(e.target.value)}
                                        placeholder="예: 2.0"
                                        disabled={individualRevBump}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-800 outline-none focus:bg-white disabled:opacity-50 disabled:bg-slate-100"
                                    />
                                    {individualRevBump && (
                                        <p className="text-[10px] font-bold text-slate-500 mt-1.5 px-1">체크된 대상들의 현재 리비전에서 각각 0.1씩 증가합니다.</p>
                                    )}
                                </div>
                                <div className="md:col-span-3 border-t border-slate-100 pt-3">
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input 
                                            type="checkbox" 
                                            checked={formSpecChange}
                                            onChange={(e) => setFormSpecChange(e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-bold text-slate-700">공표 사양 변경 발생 유무</span>
                                    </label>
                                    {formSpecChange && (
                                        <textarea 
                                            value={formSpecChangeContent}
                                            onChange={(e) => setFormSpecChangeContent(e.target.value)}
                                            placeholder="사양서 도면이나 공표 자료의 구체적인 스펙 변경 내역을 작성하세요..."
                                            className="w-full h-16 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-700 focus:bg-white"
                                        />
                                    )}
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">개선 효과 (Improvement Effect)</label>
                                    <textarea 
                                        value={formImprovement}
                                        onChange={(e) => setFormImprovement(e.target.value)}
                                        placeholder="신뢰성 개선, 단가 인하, 조립성 향상 등 설계변경에 의한 효과를 적으세요..."
                                        className="w-full h-16 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-700 focus:bg-white"
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Note (기타 특기 사항)</label>
                                    <input 
                                        type="text"
                                        value={formNote}
                                        onChange={(e) => setFormNote(e.target.value)}
                                        placeholder="그 외 재고 폐기 계획이나 특별 참고 사항을 적으세요..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 outline-none focus:bg-white"
                                    />
                                </div>
                            </div>

                            {/* 2. 대상 기안 항목 다중 선택 */}
                            <div className="border-t border-slate-100 pt-4">
                                <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3">설계변경 리스트 추가 대상 지정</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto p-1 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                                    {draftItems.map((item) => {
                                        const isSelected = selectedDraftIds.includes(item.id);
                                        return (
                                            <div 
                                                key={item.id} 
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedDraftIds(selectedDraftIds.filter(id => id !== item.id));
                                                    } else {
                                                        setSelectedDraftIds([...selectedDraftIds, item.id]);
                                                    }
                                                }}
                                                className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                                                    isSelected ? 'bg-indigo-50/50 border-indigo-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                                                }`}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {}} // 부모 div 클릭 핸들러로 대행
                                                    className="w-4 h-4 rounded text-indigo-600 mt-0.5 shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-1.5 py-0.5 text-[8px] font-black rounded border uppercase ${
                                                            item.Type === 'BOM Change' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                                                        }`}>{item.Type === 'BOM Change' ? 'BOM 변경' : '파트 변경'}</span>
                                                        <span className="text-xs font-black text-indigo-600">{item.PartID}</span>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-slate-800 truncate">{item.PartName}</p>
                                                    <p className="text-[10px] text-slate-500 font-semibold mt-1">사유: {item.Reason}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            </div> {/* End of left column */}

                            {/* 3. 결재선 지정 (동적) */}
                            <div className="w-full lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-6">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">결재 설정</h4>
                                    <button 
                                        type="button"
                                        onClick={handleAddApprovalStep}
                                        className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 flex items-center gap-1.5"
                                    >
                                        + 결재 단계 추가
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {customApprovalSteps.map((step, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                            <span className="text-xs font-black text-indigo-600 shrink-0 w-8">{idx + 1}단계</span>
                                            <div className="flex-1 grid grid-cols-2 gap-2">
                                                <input 
                                                    type="text" 
                                                    value={step.label}
                                                    onChange={(e) => {
                                                        const updated = [...customApprovalSteps];
                                                        updated[idx].label = e.target.value;
                                                        setCustomApprovalSteps(updated);
                                                    }}
                                                    placeholder="결재선 라벨 (예: 설계검토)"
                                                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                                                />
                                                <select 
                                                    value={step.approverId}
                                                    onChange={(e) => handleStepApproverChange(idx, e.target.value)}
                                                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800 outline-none focus:border-indigo-500"
                                                >
                                                    <option value="">-- 결재 유저 선택 --</option>
                                                    {users.map(u => (
                                                        <option key={u.uid} value={u.uid}>
                                                            {u.displayName} ({u.email}) [{u.role || '유저'}]
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveApprovalStep(idx)}
                                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-200 rounded-b-3xl shrink-0">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all">취소</button>
                            <button onClick={handleSubmitECN} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all flex items-center gap-1.5">
                                <ShieldCheck size={16} /> 승인서 기안 제출
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 설계변경 상세 결재 모달 */}
            {isDetailsModalOpen && selectedEcn && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90%] overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
                            <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-md uppercase tracking-wider">{selectedEcn.ECNNumber}</span>
                                    <StatusTag status={selectedEcn.Status} />
                                </div>
                                <div className="flex items-center gap-4 flex-wrap">
                                    <h2 className="text-base font-bold text-slate-900 tracking-tight">{selectedEcn.Title}</h2>
                                    <div className="flex items-start ml-3 lg:border-l border-slate-200 lg:pl-4">
                                        {(selectedEcn.ApprovalSteps || DEFAULT_APPROVAL_STEPS).map((step, idx) => {
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
                                                        {step.approverName ? <span className="text-[8px] text-slate-500 truncate w-full text-center mt-0.5">{step.approverName}</span> : isCurrent ? <span className="text-[8px] text-indigo-400 mt-0.5">대기중</span> : null}
                                                    </div>
                                                    {idx < (selectedEcn.ApprovalSteps || DEFAULT_APPROVAL_STEPS).length - 1 && (
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
                            <button onClick={() => setIsDetailsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors ml-4"><XCircle size={24} /></button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto space-y-6">
                            {/* 1. 승인서 메타 데이터 표 */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-150 shadow-sm">
                                <div>
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">발행일자</label>
                                    <p className="font-bold text-xs text-slate-800">{selectedEcn.PublishDate}</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">적용 시리즈</label>
                                    <p className="font-bold text-xs text-slate-800">{selectedEcn.Series}</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">통신 방법</label>
                                    <p className="font-bold text-xs text-slate-800">{Array.isArray(selectedEcn.CommMethod) ? selectedEcn.CommMethod.join(', ') : selectedEcn.CommMethod}</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">구분 및 Revision No.</label>
                                    <p className="font-bold text-xs text-slate-800">{selectedEcn.ECNType} / Rev {selectedEcn.TargetNewRev || selectedEcn.RevNo}</p>
                                </div>
                                <div>
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">기안자</label>
                                    <p className="font-bold text-xs text-slate-800">{selectedEcn.RequestedBy}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">BOM 설계변경 대상 모델</label>
                                    <p className="font-bold text-xs text-slate-800 break-words">{selectedEcn.TargetModels?.length > 0 ? selectedEcn.TargetModels.join(', ') : '없음'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">리비전 동기화 대상 모델 (시리즈 전체)</label>
                                    <p className="font-bold text-xs text-slate-400 break-words">{selectedEcn.SeriesModels?.length > 0 ? selectedEcn.SeriesModels.join(', ') : '없음'}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">공표사양변경유무</label>
                                    <p className="font-bold text-xs text-slate-800">
                                        {selectedEcn.SpecChangeFlag ? `있음 (${selectedEcn.SpecChangeContent})` : '없음'}
                                    </p>
                                </div>
                                <div className="md:col-span-4 border-t border-slate-200/60 pt-2">
                                    <label className="text-[9px] font-semibold text-slate-500 block mb-1">개선 효과</label>
                                    <p className="text-xs font-semibold text-slate-700">{selectedEcn.ImprovementEffect || '내용 없음'}</p>
                                </div>
                                {selectedEcn.Note && (
                                    <div className="md:col-span-4">
                                        <label className="text-[9px] font-semibold text-slate-500 block mb-1">Note</label>
                                        <p className="text-xs font-semibold text-slate-500 italic">{selectedEcn.Note}</p>
                                    </div>
                                )}
                            </div>

                            {/* 2. 기안 묶음 설계변경 항목들 */}
                            <div>
                                <h4 className="text-sm font-extrabold text-slate-800 mb-3 flex items-center gap-1.5">
                                    <CheckSquare size={16} className="text-indigo-600" /> 설계변경 대상 목록 ({selectedEcn.Items?.length || 0}건)
                                </h4>
                                <div className="space-y-4">
                                    {selectedEcn.Items?.map((item, idx) => (
                                        <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-[9px] font-black rounded border uppercase ${
                                                        item.Type === 'BOM Change' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                                                    }`}>{item.Type === 'BOM Change' ? 'BOM 구조 변경' : '부품 스펙 변경'}</span>
                                                    <span className="font-extrabold text-xs text-indigo-600">{item.PartID}</span>
                                                    <span className="font-extrabold text-xs text-slate-700">{item.PartName}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400">발의자: {item.RequestedBy}</span>
                                            </div>
                                            <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-bold text-slate-600 leading-relaxed">
                                                변경 사유: {item.Reason || '사유 요약 없음'}
                                            </div>
                                            {/* 상세 변경 내역 (Diff) */}
                                            {item.Changes && item.Changes.length > 0 && (
                                                <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                                                    <div className="bg-slate-50 px-3 py-1.5 font-black text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-150">세부 변경 내역</div>
                                                    <div className="divide-y divide-slate-100 px-3 py-1.5 font-bold text-slate-600 space-y-1">
                                                        {item.Changes.map((change, cIdx) => (
                                                            <div key={cIdx} className="flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                                                                <span>{change}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ECN 결재선 히스토리 */}
                            {selectedEcn.ApprovalHistory && selectedEcn.ApprovalHistory.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-extrabold text-slate-800 mb-3">결재 진행 이력</h4>
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                        {selectedEcn.ApprovalHistory.map((hist, idx) => (
                                            <div key={idx} className="flex justify-between items-start border-b border-slate-200/60 pb-2.5 last:border-b-0 last:pb-0">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                                                            hist.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                                                        }`}>{hist.status}</span>
                                                        <span className="text-xs font-black text-slate-700">{hist.stepName}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 font-semibold mt-1">의견: {hist.comment || '의견 없음'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-slate-700">{hist.approver}</p>
                                                    <p className="text-[8px] text-slate-400 font-bold mt-0.5">
                                                        {hist.timestamp instanceof Date ? hist.timestamp.toLocaleString() : new Date(hist.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 결재 처리 단락 */}
                            {isUserTurn(selectedEcn) && (
                                <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-6">
                                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                                        <ShieldCheck size={16} className="text-indigo-600" /> 결재 처리 (승인 / 반려)
                                    </h4>
                                    <div className="space-y-3">
                                        <textarea
                                            autoFocus
                                            value={approvalComment}
                                            onChange={(e) => setApprovalComment(e.target.value)}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            placeholder="승인 의견 또는 반려 사유를 입력하세요"
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

                        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-200 rounded-b-3xl shrink-0">
                            <button onClick={() => setIsDetailsModalOpen(false)} className="px-5 py-2 bg-slate-800 text-white rounded-lg font-medium text-sm hover:bg-slate-700 transition-all">화면 닫기</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default ECNPage;
