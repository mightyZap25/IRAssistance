import React, { useState, useEffect, useRef } from 'react';
import { 
    Layers, Package, ChevronRight, ChevronDown, 
    Search, Edit3, Download, Save, X, Plus, Trash2, ArrowLeft, Home, Ban, CheckCircle2,
    DollarSign, Clock, GitCompare, FileSpreadsheet
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from '../firebase';
import { db } from '../firebase';
import { getBOMStructure, getPreviousRevision, compareBOMs } from '../services/bomService';
import BOMStructurePanel from '../components/BOMStructurePanel';
import PartsDetailPanel from '../components/PartsDetailPanel';
import BOMSaveModal from '../components/BOMSaveModal';
import BOMExportModal from '../components/BOMExportModal';
import BOMImportModal from '../components/BOMImportModal';
import CategoryManagerModal from '../components/CategoryManagerModal';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, USER_ROLES } from '../services/userService';
import { createNotificationByRoute } from '../services/notificationService';

const BOMPage = () => {
    const { userProfile } = useAuth();
    const [products, setProducts] = useState([]);
    const [assemblies, setAssemblies] = useState([]);
    const [allParts, setAllParts] = useState([]);
    const [allBoms, setAllBoms] = useState([]);
    const [bomFolders, setBomFolders] = useState([]);
    
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [bomData, setBomData] = useState(null);
    const [originalStructure, setOriginalStructure] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Navigation & Drill-down State
    const [navStack, setNavStack] = useState([]); 
    
    const [isProductOpen, setIsProductOpen] = useState(true);
    const [isAssemblyOpen, setIsAssemblyOpen] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState({});
    const toggleGroup = (id) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    const [searchTerm, setSearchTerm] = useState('');
    const [showObsolete, setShowObsolete] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    
    // New BOM Creation State
    const [isCreatingNew, setIsNewCreating] = useState(false);
    const [newBOMType, setNewBOMType] = useState(null); // 'product' or 'assembly'

    const [expandAllTrigger, setExpandAllTrigger] = useState(0);
    const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);
    
    const [selectedPartIdForDetail, setSelectedPartIdForDetail] = useState(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    // Diff/Comparison State
    const [diffData, setDiffData] = useState(null);
    const [isComparing, setIsComparing] = useState(false);

    // Spec Management State
    const [specLabels, setSpecLabels] = useState([]);
    const [editingSpecs, setEditingSpecs] = useState([]); // [{label: '', value: ''}]
    const [activeLabelDropdown, setActiveLabelDropdown] = useState(null);

    // Where-Used (상위 사용처) State
    const [whereUsedList, setWhereUsedList] = useState([]);

    const isProduct = bomData && (
        (bomData.Class || '').toLowerCase().includes('product') ||
        (bomData.Category || '').toLowerCase().includes('완제품') ||
        (bomData.PartID || '').startsWith('IRP')
    );

    useEffect(() => {
        fetchMasters();
        fetchSpecLabels();
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        try {
            const snap = await getDocs(query(collection(db, 'parts'), where('Class', 'in', ['BOM_Category', 'BOM_Series'])));
            setBomFolders(snap.docs.map(d => ({
                id: d.id,
                type: d.data().Class === 'BOM_Category' ? 'category' : 'series',
                name: d.data().Name,
                parentId: d.data().ParentFolderId || null
            })));
        } catch (err) {
            console.error("Error fetching folders:", err);
        }
    };

    const fetchMasters = async () => {
        setLoading(true);
        try {
            const partsRef = collection(db, 'parts');
            const querySnapshot = await getDocs(partsRef);
            
            const allPartsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(p => p.Class !== 'BOM_Category' && p.Class !== 'BOM_Series');
            
            allPartsData.sort((a, b) => (a.PartID || '').localeCompare(b.PartID || ''));
            setAllParts(allPartsData);

            const prodList = allPartsData.filter(p => 
                !p.Class?.toLowerCase().includes('part') && (
                    (p.Class?.toLowerCase().includes('product') || p.Class?.toLowerCase().includes('(p)')) ||
                    p.PartID?.startsWith('IRP')
                )
            );

            const assyList = allPartsData.filter(p => 
                !p.Class?.toLowerCase().includes('part') && (
                    (p.Class?.toLowerCase().includes('assembly') || p.Class?.toLowerCase().includes('(a)')) ||
                    p.PartID?.startsWith('IRA')
                )
            );

            setProducts(prodList);
            setAssemblies(assyList);

            const bomSnap = await getDocs(collection(db, 'bom'));
            const bomDataList = bomSnap.docs.map(doc => doc.data());
            setAllBoms(bomDataList);

        } catch (error) {
            console.error("Error fetching masters:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSpecLabels = async () => {
        try {
            const snap = await getDocs(collection(db, 'spec_labels'));
            const labels = snap.docs.map(d => d.data().label || d.data().Name || '');
            labels.sort();
            setSpecLabels(labels);
        } catch (err) {
            console.error("Error fetching spec labels:", err);
        }
    };

    // When Master is selected, reset Nav Stack
    useEffect(() => {
        if (selectedMaster) {
            setNavStack([{ PartID: selectedMaster.PartID, Name: selectedMaster.Name }]);
            setIsNewCreating(false);
            setIsEditMode(false);
            setDiffData(null);
            setIsComparing(false);
        } else if (!isCreatingNew) {
            setNavStack([]);
            setBomData(null);
        }
    }, [selectedMaster]);

    // Parse Spec whenever bomData changes
    useEffect(() => {
        if (bomData) {
            try {
                let parsedSpecs = [];
                if (bomData.Spec && typeof bomData.Spec === 'string' && bomData.Spec.startsWith('[') && bomData.Spec.endsWith(']')) {
                    parsedSpecs = JSON.parse(bomData.Spec);
                } else if (bomData.Spec) {
                    parsedSpecs = [{ label: '', value: bomData.Spec }];
                }
                
                // Filter out empty rows where both label and value are empty
                parsedSpecs = parsedSpecs.filter(s => s.label?.trim() !== '' || s.value?.trim() !== '');
                
                setEditingSpecs(parsedSpecs);
            } catch (e) {
                setEditingSpecs([]);
            }
        }
    }, [bomData]);

    // Calculate Where-Used for Assemblies (Recursive Tree)
    useEffect(() => {
        if (selectedMaster && selectedMaster.PartID) {
            const isSubAssembly = selectedMaster.PartID.startsWith('IRA') || (selectedMaster.Class || '').toLowerCase().includes('assembly');
            if (isSubAssembly && allBoms.length > 0) {
                const buildWhereUsedTree = (childId, depth = 0, visited = new Set()) => {
                    if (visited.has(childId) || depth > 10) return []; // 순환 참조 및 무한 루프 방지
                    const nextVisited = new Set(visited);
                    nextVisited.add(childId);

                    const parents = allBoms.filter(b => b.ChildID === childId);
                    return parents.map(b => {
                        const parentPart = allParts.find(p => p.PartID === b.ParentID);
                        return {
                            ParentID: b.ParentID,
                            ParentName: parentPart ? parentPart.Name : '알 수 없는 상위품',
                            Quantity: b.Quantity || 1,
                            Level: depth,
                            Parents: buildWhereUsedTree(b.ParentID, depth + 1, nextVisited)
                        };
                    });
                };

                const usageTree = buildWhereUsedTree(selectedMaster.PartID);
                setWhereUsedList(usageTree);
            } else {
                setWhereUsedList([]);
            }
        }
    }, [selectedMaster, allBoms, allParts]);

    // Fetch BOM when Nav Stack changes
    useEffect(() => {
        if (navStack.length > 0 && !isCreatingNew) {
            const currentRoot = navStack[navStack.length - 1];
            fetchBOM(currentRoot.PartID, navStack.length === 1);
        }
    }, [navStack, isCreatingNew]);

    const fetchBOM = async (partId, isRoot = false) => {
        setLoading(true);
        try {
            const structure = await getBOMStructure(partId);
            // selectedMaster의 카테고리/시리즈 정보를 bomData에 병합
            if (selectedMaster) {
                structure.ProductCategoryId = selectedMaster.ProductCategoryId || null;
                structure.ProductSeriesId = selectedMaster.ProductSeriesId || null;
            }
            setBomData(structure);
            if (isRoot) {
                // Store initial structure for later comparison
                setOriginalStructure(JSON.parse(JSON.stringify(structure)));
            }
            setExpandAllTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Error fetching BOM structure:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleNodeClick = (node) => {
        if (!node) return;
        const partId = node.PartID || '';
        const nodeClass = (node.Class || '').toLowerCase();
        
        const isAssembly = 
            partId.startsWith('IRA') || 
            partId.startsWith('IRP') || 
            nodeClass.includes('assembly') || 
            nodeClass.includes('product');

        if (isAssembly) {
            if (partId !== navStack[navStack.length - 1]?.PartID) {
                setNavStack(prev => [...prev, { PartID: partId, Name: node.Name }]);
            }
            return;
        }
        setSelectedPartIdForDetail(partId);
    };

    const handleBack = () => {
        if (navStack.length > 1) {
            setNavStack(prev => prev.slice(0, -1));
        }
    };

    const handleBreadcrumbClick = (idx) => {
        setNavStack(prev => prev.slice(0, idx + 1));
    };

    // --- Revision Comparison ---
    const handleComparePrevious = async () => {
        if (!bomData) return;
        setLoading(true);
        try {
            console.log("Comparing current BOM:", bomData.PartID);
            const prevPart = await getPreviousRevision(bomData.PartID);
            if (!prevPart) {
                alert('이전 리비전 데이터가 없습니다.');
                return;
            }
            console.log("Found previous revision:", prevPart.PartID);
            const prevStructure = await getBOMStructure(prevPart.PartID);
            const diffs = compareBOMs(prevStructure, bomData);
            setDiffData(diffs);
            setIsComparing(true);
            setExpandAllTrigger(prev => prev + 1);
        } catch (err) {
            console.error("비교 실패 상세 에러:", err);
            alert(`비교 중 오류가 발생했습니다: ${err.message || '알 수 없는 에러'}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Spec Editing Logic ---
    const addSpecRow = () => {
        setEditingSpecs([...editingSpecs, { label: '', value: '' }]);
    };

    const removeSpecRow = (idx) => {
        const next = editingSpecs.filter((_, i) => i !== idx);
        setEditingSpecs(next);
    };

    const updateSpecRow = (idx, field, value) => {
        const next = [...editingSpecs];
        next[idx][field] = value;
        setEditingSpecs(next);
    };

    const handleLabelSelect = async (idx, label) => {
        if (label === '(추가)') {
            const newLabel = prompt('새 레이블을 입력하세요:');
            if (newLabel && !specLabels.includes(newLabel)) {
                try {
                    await addDoc(collection(db, 'spec_labels'), { label: newLabel, createdAt: serverTimestamp() });
                    setSpecLabels(prev => [...prev, newLabel].sort());
                    updateSpecRow(idx, 'label', newLabel);
                } catch (err) {
                    console.error("Error saving new label:", err);
                }
            } else if (newLabel) {
                updateSpecRow(idx, 'label', newLabel);
            }
        } else {
            updateSpecRow(idx, 'label', label);
        }
        setActiveLabelDropdown(null);
    };

    // --- Tree Editing Handlers ---
    const handleQtyChange = (partId, qty) => {
        const updateNode = (node) => {
            if (node.PartID === partId) return { ...node, Quantity: qty, isModified: true };
            if (node.Children) return { ...node, Children: node.Children.map(updateNode) };
            return node;
        };
        setBomData(updateNode(bomData));
    };

    const handleLocationChange = (partId, loc) => {
        const updateNode = (node) => {
            if (node.PartID === partId) return { ...node, Location: loc, isModified: true };
            if (node.Children) return { ...node, Children: node.Children.map(updateNode) };
            return node;
        };
        setBomData(updateNode(bomData));
    };

    const handleNoteChange = (partId, note) => {
        const updateNode = (node) => {
            if (node.PartID === partId) return { ...node, Note: note, isModified: true };
            if (node.Children) return { ...node, Children: node.Children.map(updateNode) };
            return node;
        };
        setBomData(updateNode(bomData));
    };

    const handleDeleteNode = (partId, isNew, type) => {
        const updateNode = (node) => {
            if (node.PartID === partId) {
                if (type === 'delete') return { ...node, isDeleted: true, isModified: true };
                if (type === 'discontinue') return { ...node, isDiscontinued: true, isModified: true };
                if (type === 'restore') return { ...node, isDeleted: false, isDiscontinued: false, isModified: true };
            }
            if (node.Children) return { ...node, Children: node.Children.map(updateNode) };
            return node;
        };
        setBomData(updateNode(bomData));
    };

    const handleAddChild = async (parentID, childPartID, qty, loc, note) => {
        const selectedPart = allParts.find(p => p.PartID === childPartID);
        if (!selectedPart) return;

        let childrenNodes = [];
        const isAssembly = selectedPart.Category?.includes('조립품') || selectedPart.PartID?.startsWith('IRA');
        
        if (isAssembly) {
            try {
                const structure = await getBOMStructure(childPartID);
                if (structure && structure.Children) {
                    const markAsNew = (nodes) => {
                        return nodes.map(node => ({
                            ...node,
                            isNew: true,
                            Children: node.Children ? markAsNew(node.Children) : []
                        }));
                    };
                    childrenNodes = markAsNew(structure.Children);
                }
            } catch (err) {
                console.error("하위 BOM 로딩 에러:", err);
            }
        }

        const newChild = {
            ...selectedPart,
            Quantity: qty,
            Location: loc,
            Note: note,
            isNew: true,
            Children: childrenNodes
        };

        const updateNode = (node) => {
            if (node.PartID === parentID) {
                return { ...node, Children: [...(node.Children || []), newChild], isModified: true };
            }
            if (node.Children) return { ...node, Children: node.Children.map(updateNode) };
            return node;
        };
        setBomData(updateNode(bomData));
        setExpandAllTrigger(prev => prev + 1);
    };

    const handleReorder = (parentId, oldIdx, newIdx) => {
        const updateNode = (node) => {
            if (node.PartID === parentId) {
                const newChildren = [...node.Children];
                const [movedItem] = newChildren.splice(oldIdx, 1);
                newChildren.splice(newIdx, 0, movedItem);
                return { ...node, Children: newChildren, isModified: true };
            }
            if (node.Children) return { ...node, Children: node.Children.map(updateNode) };
            return node;
        };
        setBomData(updateNode(bomData));
    };

    // --- New BOM Creation Logic ---
    const handleStartNewBOM = (type, categoryId = null, seriesId = null) => {
        const tempPartID = type === 'product' ? 'IRP-NEW' : 'IRA-NEW';
        const newTemplate = {
            PartID: tempPartID,
            Name: `신규 ${type === 'product' ? '완제품' : '조립품'}`,
            Rev: '1.0',
            Spec: '',
            Description: '',
            Class: type === 'product' ? 'Product (P)' : 'Assembly (A)',
            Category: type === 'product' ? '완제품 (P)' : '조립품 (A)',
            Status: 'Draft',
            Children: []
        };

        if (categoryId) {
            newTemplate.ProductCategoryId = categoryId;
            const selectedCat = bomFolders.find(f => f.id === categoryId);
            if (selectedCat && selectedCat.name.toLowerCase().includes('actuator')) {
                const defaultSpecs = [
                    { label: '정격부하', value: '' },
                    { label: '속도', value: '' },
                    { label: 'Stroke', value: '' },
                    { label: '최소 입력전압', value: '' },
                    { label: '최대 입력전압', value: '' },
                    { label: '통신 방식', value: 'PT' },
                    { label: '프로토콜', value: 'IRPROTOCOL' }
                ];
                newTemplate.Spec = JSON.stringify(defaultSpecs);
                setEditingSpecs(defaultSpecs);
            }
        }
        if (seriesId) newTemplate.ProductSeriesId = seriesId;
        
        setSelectedMaster(null);
        setIsNewCreating(true);
        setNewBOMType(type);
        setBomData(newTemplate);
        setNavStack([{ PartID: tempPartID, Name: newTemplate.Name }]);
        setIsEditMode(true);
    };

    const handleAddCategory = async () => {
        const name = prompt('새 카테고리 이름을 입력하세요 (예: Actuator, Board):');
        if (!name?.trim()) return;
        try {
            const docRef = await addDoc(collection(db, 'bom_folders'), {
                type: 'category',
                name: name.trim(),
                createdAt: serverTimestamp()
            });
            setBomFolders(prev => [...prev, { id: docRef.id, type: 'category', name: name.trim() }]);
        } catch (err) {
            console.error("카테고리 추가 에러:", err);
            alert("카테고리를 추가하지 못했습니다.");
        }
    };

    const handleAddSeries = async (categoryId) => {
        const name = prompt('새 시리즈 이름을 입력하세요 (예: 12LF 시리즈):');
        if (!name?.trim()) return;
        try {
            const docRef = await addDoc(collection(db, 'bom_folders'), {
                type: 'series',
                name: name.trim(),
                parentId: categoryId,
                createdAt: serverTimestamp()
            });
            setBomFolders(prev => [...prev, { id: docRef.id, type: 'series', name: name.trim(), parentId: categoryId }]);
        } catch (err) {
            console.error("시리즈 추가 에러:", err);
            alert("시리즈를 추가하지 못했습니다.");
        }
    };

    const handleDeriveBOM = () => {
        if (!bomData) return;
        
        const type = bomData.PartID.startsWith('IRP') ? 'product' : 'assembly';
        const tempPartID = type === 'product' ? 'IRP-DERIV-NEW' : 'IRA-DERIV-NEW';
        
        const derivedBOM = {
            ...bomData,
            PartID: tempPartID,
            Name: `${bomData.Name} (파생)`,
            Rev: '1.0',
            Status: 'Draft',
            isDerivative: true,
            BasePartID: bomData.PartID,
            BasePartName: bomData.Name,
            isNew: true
        };

        // Deep copy children and mark as new for saving
        const markAsNew = (nodes) => {
            return nodes.map(node => ({
                ...node,
                isNew: true,
                isModified: true,
                Children: node.Children ? markAsNew(node.Children) : []
            }));
        };
        derivedBOM.Children = markAsNew(bomData.Children || []);

        setSelectedMaster(null);
        setIsNewCreating(true);
        setNewBOMType(type);
        setBomData(derivedBOM);
        setNavStack([{ PartID: tempPartID, Name: derivedBOM.Name }]);
        setIsEditMode(true);
    };

    const handleCancelCreate = () => {
        setIsNewCreating(false);
        setBomData(null);
        setNavStack([]);
        setIsEditMode(false);
    };

    const handleDiscontinueMaster = async () => {
        if (!bomData || !bomData.id) {
            alert('단종 처리할 품목 정보가 올바르지 않습니다.');
            return;
        }
        
        const canDiscontinue = userProfile && hasPermission(userProfile.role, USER_ROLES.MANAGER);
        if (!canDiscontinue) {
            alert('단종 처리 권한이 없습니다. (MANAGER 이상)');
            return;
        }

        const isConfirm = window.confirm(
            `[${bomData.PartID}] ${bomData.Name}\n\n이 품목을 정말로 단종(Discontinue) 처리하시겠습니까?\n단종 처리 시 목록에서 숨겨지며, 데이터베이스에는 영구 보존됩니다.`
        );

        if (isConfirm) {
            setLoading(true);
            try {
                const partRef = doc(db, 'parts', bomData.id);
                await updateDoc(partRef, { Status: 'Obsolete' });
                
                alert('단종 처리가 완료되었습니다.');
                setIsEditMode(false);
                setSelectedMaster(null);
                setBomData(null);
                setNavStack([]);
                fetchMasters();
            } catch (err) {
                console.error("단종 처리 실패:", err);
                alert("단종 처리 중 오류가 발생했습니다.");
                setLoading(false);
            }
        }
    };

    const handleConfirmMaster = async () => {
        if (!selectedMaster || !selectedMaster.id) return;
        
        const canConfirm = userProfile && hasPermission(userProfile.role, USER_ROLES.MANAGER);
        if (!canConfirm) {
            alert('승인 권한이 없습니다. (MANAGER 이상)');
            return;
        }

        const isConfirm = window.confirm(`이 부품(${selectedMaster.PartID})을 승인(Confirm)하여 정식 사용 가능 상태(Active)로 전환하시겠습니까?`);
        if (!isConfirm) return;

        setLoading(true);
        try {
            const partRef = doc(db, 'parts', selectedMaster.id);
            const confirmerLog = {
                uid: userProfile?.id || userProfile?.uid || 'Unknown',
                name: userProfile?.displayName || 'Unknown',
                email: userProfile?.email || 'Unknown',
                date: new Date().toISOString()
            };

            await updateDoc(partRef, {
                Status: 'Active',
                ConfirmedBy: confirmerLog,
                confirmedAt: serverTimestamp()
            });

            alert('승인이 완료되었습니다.');
            const updatedDoc = await getDoc(partRef);
            if(updatedDoc.exists()) {
                setBomData(prev => ({...prev, Status: 'Active', ConfirmedBy: confirmerLog}));
                setSelectedMaster({ id: updatedDoc.id, ...updatedDoc.data() });
            }
            fetchMasters(); 
        } catch (err) {
            console.error("승인 실패:", err);
            alert("승인 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const validateActuatorSpecs = () => {
        if (!bomData) return true;
        const selectedCat = bomFolders.find(f => f.id === bomData.ProductCategoryId);
        const isActuator = (bomData.Category && bomData.Category.toLowerCase().includes('actuator')) || 
                           (selectedCat && selectedCat.name.toLowerCase().includes('actuator'));
        
        if (isActuator) {
            const requiredSpecs = [
                '정격부하',
                '속도',
                'Stroke',
                '최소 입력전압',
                '최대 입력전압',
                '통신 방식',
                '프로토콜'
            ];
            
            for (const req of requiredSpecs) {
                const found = editingSpecs.find(s => s.label?.trim().toLowerCase() === req.toLowerCase());
                if (!found || !found.value || found.value.trim() === '') {
                    alert(`카테고리가 Actuator인 경우 '${req}' 사양은 필수 입력 항목입니다.`);
                    return false;
                }
            }
        }
        return true;
    };

    const mergeActuatorSpecs = (currentSpecs) => {
        const requiredSpecs = [
            { label: '정격부하', value: '' },
            { label: '속도', value: '' },
            { label: 'Stroke', value: '' },
            { label: '최소 입력전압', value: '' },
            { label: '최대 입력전압', value: '' },
            { label: '통신 방식', value: 'PT' },
            { label: '프로토콜', value: 'IRPROTOCOL' }
        ];
        
        const nextSpecs = [...currentSpecs];
        requiredSpecs.forEach(req => {
            const exists = nextSpecs.some(s => s.label?.trim().toLowerCase() === req.label.toLowerCase());
            if (!exists) {
                nextSpecs.push({ ...req });
            }
        });
        return nextSpecs.filter(s => s.label?.trim() !== '' || s.value?.trim() !== '');
    };

    const handleSaveBOM = async (ecnData) => {
        console.log("Saving BOM with ECN:", ecnData);
        setLoading(true);
        try {
            const validSpecs = editingSpecs.filter(s => s.label || s.value);
            const specString = validSpecs.length > 0 ? JSON.stringify(validSpecs) : '';
            
            const currentUserLog = {
                uid: userProfile?.id || userProfile?.uid || 'Unknown',
                name: userProfile?.displayName || 'Unknown',
                email: userProfile?.email || 'Unknown',
                date: new Date().toISOString()
            };

            const batch = writeBatch(db);

            if (isCreatingNew) {
                const finalPartId = bomData.PartID.includes('NEW') ? `NEW-${Date.now()}` : bomData.PartID;
                
                const newPartData = {
                    PartID: finalPartId,
                    Name: bomData.Name,
                    Class: bomData.Class,
                    Category: bomData.Category,
                    Rev: '1.0',
                    Spec: specString,
                    Description: bomData.Description || '',
                    Status: 'Draft',
                    CreatedBy: currentUserLog,
                    createdAt: serverTimestamp()
                };

                if (bomData.isDerivative) {
                    newPartData.BasePartID = bomData.BasePartID;
                    newPartData.BasePartName = bomData.BasePartName;
                }

                if (bomData.ProductCategoryId) newPartData.ProductCategoryId = bomData.ProductCategoryId;
                if (bomData.ProductSeriesId) newPartData.ProductSeriesId = bomData.ProductSeriesId;

                // parts 문서 ID를 실제 품번(finalPartId)으로 지정하여 저장
                const newPartRef = doc(db, 'parts', finalPartId);
                batch.set(newPartRef, newPartData);

                // Save initial BOM structure (Children)
                if (bomData.Children && bomData.Children.length > 0) {
                    bomData.Children.forEach(child => {
                        // bom 관계 문서 ID를 ParentID_ChildID로 지정
                        const customBomId = `${finalPartId}_${child.PartID}`;
                        const bomRef = doc(db, 'bom', customBomId);
                        batch.set(bomRef, {
                            ParentID: finalPartId,
                            ChildID: child.PartID,
                            Quantity: child.Quantity,
                            Location: child.Location || '',
                            Note: child.Note || '',
                            Status: 'Active'
                        });
                    });
                }
            } else if (selectedMaster && selectedMaster.id) {
                if (ecnData && ecnData.updateType === 'ECN') {
                    // ECN 기안 시에는 실제 부품과 BOM 구조를 즉시 업데이트하지 않고, 오직 ecnDraft 문서만 DB에 셋업합니다.
                    // 기존 부품의 Status를 Pending(설변 진행 중)으로 변경합니다.
                    const partRef = doc(db, 'parts', selectedMaster.id);
                    batch.update(partRef, { Status: 'Pending' });

                    const diffs = compareBOMs(navStack[0].originalStructure || {}, bomData);
                    const ecnRef = doc(collection(db, 'ecn_draft_items'));
                    // Fetch derivative models
                    const derivQuery = query(collection(db, 'parts'), where('BasePartID', '==', bomData.PartID));
                    const derivSnap = await getDocs(derivQuery);
                    const derivatives = derivSnap.docs.map(d => {
                        const data = d.data();
                        return { PartID: data.PartID, Name: data.Name, Action: 'Pending' };
                    });

                    const ecnDraft = {
                        Title: `[BOM Update] ${bomData.Name}`,
                        Derivatives: derivatives,
                        HasStatusChange: false,
                        InventoryAction: 'Use As Is',
                        Type: 'BOM Change',
                        PartID: bomData.PartID,
                        PartName: bomData.Name,
                        MasterPartID: bomData.MasterPartID || bomData.PartID.split('-')[0],
                        Rev: bomData.Rev || '1.0',
                        CurrentRevision: bomData.Rev || '1.0',
                        Reason: ecnData.reason,
                        Status: 'Draft',
                        CreatedAt: serverTimestamp(),
                        Changes: diffs.map(d => `${d.type.toUpperCase()}: ${d.partId} (${d.name}) ${d.details || ''}`),
                        ProposedChanges: { Spec: specString, Description: bomData.Description },
                        ProposedBOM: [] 
                    };

                    // Only include direct children for the proposed BOM update
                    if (bomData.Children) {
                        ecnDraft.ProposedBOM = bomData.Children
                            .filter(c => !c.isDeleted)
                            .map(c => ({
                                ChildID: c.PartID,
                                Quantity: c.Quantity,
                                Location: c.Location || '',
                                Note: c.Note || ''
                            }));
                    }
                    
                    batch.set(ecnRef, ecnDraft);
                } else {
                    // 단순 업데이트 시에는 기존 부품과 BOM 구조를 즉시 업데이트합니다.
                    const partRef = doc(db, 'parts', selectedMaster.id);
                    const updateData = {
                        Spec: specString,
                        Description: bomData.Description || '',
                        LastUpdatedBy: currentUserLog
                    };
                    if (bomData.ProductCategoryId !== undefined) updateData.ProductCategoryId = bomData.ProductCategoryId;
                    if (bomData.ProductSeriesId !== undefined) updateData.ProductSeriesId = bomData.ProductSeriesId;
                    batch.update(partRef, updateData);

                    // --- Update BOM relationships (Recursive) ---
                    const processBOMNodes = async (parentNode) => {
                        if (!parentNode.Children) return;
                        for (const child of parentNode.Children) {
                            // DB에 기존 관계가 있는지 쿼리
                            const bomQuery = query(
                                collection(db, 'bom'), 
                                where('ParentID', '==', parentNode.PartID), 
                                where('ChildID', '==', child.PartID)
                            );
                            const bomSnap = await getDocs(bomQuery);

                            if (child.isDeleted) {
                                // 삭제된 노드면 db에서 해당 관계 삭제 (또는 Status를 Obsolete으로 변경. 여기선 완전 삭제로 구현)
                                bomSnap.docs.forEach(d => {
                                    batch.delete(doc(db, 'bom', d.id));
                                });
                            } else if (child.isNew || bomSnap.empty) {
                                // 신규 추가된 자식 (bom 관계 문서 ID를 ParentID_ChildID로 지정)
                                const customBomId = `${parentNode.PartID}_${child.PartID}`;
                                const newBomRef = doc(db, 'bom', customBomId);
                                batch.set(newBomRef, {
                                    ParentID: parentNode.PartID,
                                    ChildID: child.PartID,
                                    Quantity: child.Quantity,
                                    Location: child.Location || '',
                                    Note: child.Note || '',
                                    Status: 'Active'
                                });
                            } else if (child.isModified) {
                                // 기존 데이터 수정 (수량, 로케이션 등)
                                bomSnap.docs.forEach(d => {
                                    batch.update(doc(db, 'bom', d.id), {
                                        Quantity: child.Quantity,
                                        Location: child.Location || '',
                                        Note: child.Note || ''
                                    });
                                });
                            }

                            // 재귀적으로 자식의 자식도 처리
                            if (!child.isDeleted) {
                                await processBOMNodes(child);
                            }
                        }
                    };

                    await processBOMNodes(bomData);
                }
            }

            await batch.commit();

            if (ecnData?.updateType !== 'ECN' && selectedMaster && selectedMaster.id) {
                const updatedMasterSnap = await getDoc(doc(db, 'parts', selectedMaster.id));
                if (updatedMasterSnap.exists()) {
                    setSelectedMaster({ id: updatedMasterSnap.id, ...updatedMasterSnap.data() });
                }
            }

            // BOM 변경 알림 전송
            try {
                const partId = isCreatingNew ? (bomData.PartID.includes('NEW') ? bomData.PartID : bomData.PartID) : bomData.PartID;
                if (ecnData && ecnData.updateType === 'ECN') {
                    await createNotificationByRoute('/eco', 'ECO 대기 등록', `부품 [${partId}] ${bomData.Name}에 대한 설계변경 내역이 ECO 대기 리스트에 등록되었습니다.`);
                } else {
                    const action = isCreatingNew ? '신규 등록' : 'BOM 수정';
                    await createNotificationByRoute('/bom', `BOM ${action}`, `BOM [${partId}] ${bomData.Name}이(가) ${action}되었습니다.`);
                }
            } catch (notiErr) {
                console.warn("Failed to send BOM notification:", notiErr);
            }

            if (ecnData?.updateType === 'ECN') {
                alert('BOM 변경 사항이 ECO 대기 리스트에 임시 등록되었습니다. ECO 결재선 지정을 위해 ECO 승인서를 작성해주세요.');
            } else {
                alert('BOM 변경 사항이 성공적으로 저장되었습니다.');
            }
        } catch (error) {
            console.error("Error saving BOM:", error);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
            setIsSaveModalOpen(false);
            setIsEditMode(false);
            setIsNewCreating(false);
            fetchMasters();
        }
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.PartID.toLowerCase().includes(searchTerm.toLowerCase()) || 
            p.Name.toLowerCase().includes(searchTerm.toLowerCase());
        const status = (p.Lifecycle || p.Status || '').toLowerCase();
        const isObsolete = status === 'obsolete' || status === 'discontinued';
        if (!showObsolete && isObsolete) return false;
        return matchesSearch;
    });

    const filteredAssemblies = assemblies.filter(a => {
        const matchesSearch = a.PartID.toLowerCase().includes(searchTerm.toLowerCase()) || 
            a.Name.toLowerCase().includes(searchTerm.toLowerCase());
        const status = (a.Lifecycle || a.Status || '').toLowerCase();
        const isObsolete = status === 'obsolete' || status === 'discontinued';
        if (!showObsolete && isObsolete) return false;
        return matchesSearch;
    });

    // Recursive Component for Where-Used Tree (Toggleable & Colorful)
    const WhereUsedTreeNode = ({ node, idx }) => {
        const [isOpen, setIsOpen] = useState(true);
        const hasChildren = node.Parents && node.Parents.length > 0;
        const isProduct = node.ParentID.startsWith('IRP');

        return (
            <div className={`${node.Level > 0 ? 'mt-0.5 ml-3 pl-3 border-l-2 border-slate-200' : 'mt-1'}`}>
                <div 
                    onClick={() => hasChildren && setIsOpen(!isOpen)}
                    className="flex items-start gap-1.5 group py-1 px-1.5 hover:bg-white rounded cursor-pointer transition-all border border-transparent hover:border-slate-200 hover:shadow-sm"
                >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                        {hasChildren ? (
                            isOpen ? <ChevronDown size={14} className="text-slate-400 group-hover:text-blue-500" /> : <ChevronRight size={14} className="text-slate-400 group-hover:text-blue-500" />
                        ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
                        )}
                    </div>
                    
                    <div className="flex flex-col flex-1 min-w-0 leading-tight">
                        <div className={`text-[9px] font-black flex items-center gap-1 w-max ${
                            isProduct ? 'text-blue-600' : 'text-amber-600'
                        }`}>
                            {isProduct ? <Package size={10} /> : <Layers size={10} />}
                            {node.ParentID}
                        </div>
                        <div className="text-[11px] font-bold text-slate-700 truncate mt-0.5">{node.ParentName}</div>
                    </div>
                    
                    <div className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-1.5 rounded shadow-sm opacity-0 group-hover:opacity-100 group-hover:text-blue-600 group-hover:border-blue-200 transition-all">
                        {node.Quantity} EA
                    </div>
                </div>

                {hasChildren && isOpen && (
                    <div className="relative">
                        {node.Parents.map((parentNode, pIdx) => (
                            <WhereUsedTreeNode key={`${parentNode.ParentID}-${pIdx}`} node={parentNode} idx={pIdx} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] overflow-hidden gap-3 animate-fade-in text-slate-800 dark:text-slate-100">
            {/* Header section with sophisticated glass card background */}
            <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-3 rounded-xl border border-indigo-100/35 dark:border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-none relative overflow-hidden">
                <div className="absolute right-0 top-0 w-48 h-48 bg-indigo-500/5 blur-3xl rounded-full -mr-10 -mt-5 pointer-events-none"></div>
                <div className="relative">
                    <h1 className="text-xl font-black tracking-tight leading-tight bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
                        BOM 관리 (BOM List)
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-xs font-bold uppercase tracking-wider">
                        Bill of Materials Control Center
                    </p>
                </div>
                <div className="relative flex items-center gap-2">
                    <button 
                        onClick={() => setIsCategoryModalOpen(true)}
                        data-tour="bom-category-manager-btn"
                        className="flex items-center gap-2 bg-white/50 hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold py-2 px-3 rounded-xl transition-colors border border-slate-200/50 dark:border-slate-700 shadow-sm text-sm"
                    >
                        <Layers size={16} className="text-indigo-500" />
                        <span>분류(카테고리) 관리</span>
                    </button>
                </div>
            </div>

            <div className="flex flex-1 bg-slate-50 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                {/* Left Sidebar */}
                <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full overflow-hidden">
                <div className="p-4 border-b border-slate-100 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Part ID 또는 품명 검색..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 mt-2 px-1">
                        <input
                            type="checkbox"
                            id="show-obsolete-checkbox"
                            checked={showObsolete}
                            onChange={(e) => setShowObsolete(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor="show-obsolete-checkbox" className="text-xs text-slate-600 font-bold cursor-pointer select-none">
                            단종/폐기 포함
                        </label>
                    </div>
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        data-tour="bom-import-btn"
                        className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-650 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-bold text-xs shadow-md shadow-blue-100 hover:scale-[1.01] active:scale-[0.99] transition-all"
                    >
                        <FileSpreadsheet size={14} />
                        <span>구글 시트 BOM 가져오기</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2 custom-scrollbar text-left">
                    {/* Products Group */}
                    <div className="group/section">
                        <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                            <button 
                                onClick={() => setIsProductOpen(!isProductOpen)}
                                className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider flex-1 text-left"
                            >
                                <Package size={14} className="text-blue-500" />
                                완제품 (Products)
                                {isProductOpen ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleStartNewBOM('product'); }}
                                data-tour="bom-register-btn"
                                className="p-1 text-blue-600 hover:bg-blue-100 rounded ml-1"
                                title="신규 완제품 생성"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        {isProductOpen && (
                            <div className="mt-1 space-y-1 ml-2">
                                {/* 카테고리 렌더링 */}
                                {bomFolders.filter(f => f.type === 'category').map(cat => (
                                    <div key={cat.id} className="mb-2">
                                        <div className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-md group/cat cursor-pointer">
                                            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700">
                                                <Layers size={12} className="text-blue-500" />
                                                {cat.name}
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleStartNewBOM('product', cat.id); }} 
                                                className="text-blue-500 hover:bg-blue-100 rounded p-1"
                                                title="이 카테고리에 신규 완제품 생성"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                        
                                        {/* 시리즈 렌더링 */}
                                        <div className="ml-3 pl-2 border-l-2 border-slate-100 mt-1 space-y-1">
                                            {bomFolders.filter(f => f.type === 'series' && f.parentId === cat.id).map(ser => (
                                                <div key={ser.id}>
                                                    <div className="flex items-center justify-between px-2 py-1 hover:bg-slate-50 rounded-md group/ser cursor-pointer">
                                                        <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-600">
                                                            <Package size={10} className="text-indigo-400" />
                                                            {ser.name}
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleStartNewBOM('product', cat.id, ser.id); }} 
                                                            className="text-indigo-500 hover:bg-indigo-100 rounded p-1"
                                                            title="신규 완제품 추가"
                                                        >
                                                            <Plus size={10} />
                                                        </button>
                                                    </div>

                                                    {/* 완제품 렌더링 */}
                                                    <div className="ml-3 mt-1 space-y-0.5">
                                                        {filteredProducts.filter(p => p.ProductSeriesId === ser.id).map(p => (
                                                            <button
                                                                key={p.id}
                                                                onClick={() => setSelectedMaster(p)}
                                                                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center justify-between gap-2 overflow-hidden ${
                                                                    selectedMaster?.id === p.id 
                                                                    ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' 
                                                                    : 'text-slate-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                                                    <span className="truncate text-[11px] font-bold w-full">{p.Name}</span>
                                                                    <span className="text-[9px] opacity-60 shrink-0">{p.PartID}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {/* 미분류 완제품 (카테고리 없는 것들) */}
                                {filteredProducts.filter(p => !p.ProductSeriesId).length > 0 && (
                                    <div className="mt-3">
                                        <div className="px-2 py-1 flex justify-between items-center group/unassigned">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">미분류 완제품</div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleStartNewBOM('product'); }}
                                                className="text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded p-1"
                                                title="미분류 신규 완제품 생성"
                                            >
                                                <Plus size={10} />
                                            </button>
                                        </div>
                                        <div className="space-y-0.5 mt-1">
                                            {filteredProducts.filter(p => !p.ProductSeriesId).map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => setSelectedMaster(p)}
                                                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center justify-between gap-2 overflow-hidden ${
                                                        selectedMaster?.id === p.id 
                                                        ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' 
                                                        : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                                        <span className="truncate text-[11px] font-bold w-full">{p.Name}</span>
                                                        <span className="text-[9px] opacity-60 shrink-0">{p.PartID}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Assemblies Group */}
                    <div className="group/section">
                        <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                            <button 
                                onClick={() => setIsAssemblyOpen(!isAssemblyOpen)}
                                className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider flex-1 text-left"
                            >
                                <Layers size={14} className="text-amber-500" />
                                조립품 (Sub-Assemblies)
                                {isAssemblyOpen ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleStartNewBOM('assembly'); }}
                                data-tour="bom-register-btn"
                                className="p-1 text-amber-600 hover:bg-amber-100 rounded opacity-0 group-hover/section:opacity-100 transition-opacity ml-1"
                                title="신규 조립품 BOM 생성"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        {isAssemblyOpen && (
                            <div className="mt-1 space-y-1 ml-2">
                                {filteredAssemblies.map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => setSelectedMaster(a)}
                                        className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center justify-between gap-2 overflow-hidden ${
                                            selectedMaster?.id === a.id 
                                            ? 'bg-amber-50 text-amber-700 font-bold border border-amber-100' 
                                            : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                            <span className="truncate text-xs font-bold w-full">{a.Name}</span>
                                            <span className="text-[9px] opacity-60 shrink-0">{a.PartID}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Main Content */}
            <div className="flex-1 min-h-0 relative flex flex-col">
                {loading && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-slate-600">처리 중...</span>
                        </div>
                    </div>
                )}

                {bomData ? (
                    <div className="p-4 max-w-[1600px] mx-auto h-full w-full flex flex-col gap-3 overflow-hidden">
                        {/* Breadcrumbs & Actions */}
                        <div className="flex justify-between items-start shrink-0">
                            <div className="flex items-center gap-4 text-left">
                                {navStack.length > 1 && (
                                    <button onClick={handleBack} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 shadow-sm transition-all"><ArrowLeft size={20} /></button>
                                )}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-tighter">Rev {bomData.Rev || '1.0'}</span>
                                        <span className="text-slate-400 font-mono text-xs">{bomData.PartID}</span>
                                        {(() => {
                                            const lifecycleStatus = bomData.Lifecycle || bomData.Status;
                                            if (!lifecycleStatus) return null;
                                            const statusUpper = lifecycleStatus.toUpperCase();
                                            let colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                            let label = '승인완료/양산';
                                            
                                            if (statusUpper === 'DRAFT') {
                                                colorClass = 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse';
                                                label = '대기/개발중';
                                            } else if (statusUpper === 'RND') {
                                                colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
                                                label = '연구소용';
                                            } else if (statusUpper === 'OBSOLETE' || statusUpper === 'DISCONTINUED') {
                                                colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
                                                label = '폐기/단종';
                                            } else if (statusUpper === 'ECN' || statusUpper === 'ECN PENDING' || statusUpper === 'PENDING') {
                                                colorClass = 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
                                                label = '설계변경';
                                            }
                                            return (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-tighter ml-2 ${colorClass}`}>
                                                    {label}
                                                </span>
                                            );
                                        })()}
                                        {bomData.isDerivative && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-tighter ml-2" title={`기본 모델: ${bomData.BasePartID}`}>Derived</span>
                                        )}
                                        {isComparing && <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-tighter ml-2">Diff Mode</span>}
                                    </div>
                                    <h1 className="text-xl font-black text-slate-800 italic">{bomData.Name}</h1>
                                </div>
                            </div>
                            
                            <div className="flex gap-2">
                                {!isEditMode ? (
                                    <>
                                        {bomData && (() => {
                                            const statusUpper = (bomData.Lifecycle || bomData.Status || '').toUpperCase();
                                            return statusUpper !== 'OBSOLETE' && statusUpper !== 'DISCONTINUED';
                                        })() && (
                                            <button 
                                                onClick={handleDiscontinueMaster} 
                                                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-100 transition-all rounded-lg"
                                            >
                                                <Ban size={16} /> 단종 처리
                                            </button>
                                        )}
                                        <button onClick={handleDeriveBOM} data-tour="bom-derive-btn" className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-md shadow-emerald-100 transition-all">
                                            <GitCompare size={16} /> 파생발의
                                        </button>
                                        <button onClick={handleComparePrevious} data-tour="bom-compare-btn" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm transition-all">
                                            <GitCompare size={16} /> 이전 리비전과 비교
                                        </button>
                                        {bomData && (() => {
                                            const statusUpper = (bomData.Lifecycle || bomData.Status || '').toUpperCase();
                                            const isPending = statusUpper === 'PENDING' || statusUpper === 'ECN' || statusUpper === 'ECN PENDING';
                                            
                                            if (isPending) {
                                                return (
                                                    <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-400 rounded-lg font-bold text-xs border border-slate-200 cursor-not-allowed">
                                                        설계변경 진행 중
                                                    </div>
                                                );
                                            }
                                            return (
                                                <button 
                                                    onClick={() => {
                                                        setIsEditMode(true);
                                                        const selectedCat = bomFolders.find(f => f.id === bomData.ProductCategoryId);
                                                        const isActuator = (bomData.Category && bomData.Category.toLowerCase().includes('actuator')) || 
                                                                           (selectedCat && selectedCat.name.toLowerCase().includes('actuator'));
                                                        
                                                        if (isActuator) {
                                                            const merged = mergeActuatorSpecs(editingSpecs);
                                                            setBomData({...bomData, Spec: JSON.stringify(merged)});
                                                            setEditingSpecs(merged);
                                                        }
                                                    }} 
                                                    data-tour="bom-edit-btn"
                                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm shadow-md shadow-indigo-100 transition-all"
                                                >
                                                    <Edit3 size={16} /> 수정
                                                </button>
                                            );
                                        })()}
                                        <button onClick={() => setIsExportModalOpen(true)} data-tour="bom-export-btn" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm">
                                            <Download size={16} /> 내보내기
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => { setIsEditMode(false); setIsNewCreating(false); setDiffData(null); setIsComparing(false); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold text-sm shadow-sm">
                                            <X size={16} /> 취소
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (validateActuatorSpecs()) {
                                                    setIsSaveModalOpen(true);
                                                }
                                            }} 
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm shadow-md"
                                        >
                                            <Save size={16} /> 변경 사항 저장
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Main Grid */}
                        <div className="grid grid-cols-5 gap-4 flex-1 min-h-0 overflow-hidden">
                            <div className="col-span-2 bg-white rounded-2xl border border-slate-200 p-5 overflow-y-auto custom-scrollbar text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Master Info & Specs</label>
                                <div className="space-y-4">
                                    {isCreatingNew && (
                                        <>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Part ID</label>
                                                <input 
                                                    type="text" 
                                                    value={bomData.PartID} 
                                                    onChange={(e) => setBomData({...bomData, PartID: e.target.value})}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    placeholder="품번을 입력하세요 (예: IRP-001)"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">품명 (Part Name)</label>
                                                <input 
                                                    type="text" 
                                                    value={bomData.Name} 
                                                    onChange={(e) => setBomData({...bomData, Name: e.target.value})}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    placeholder="품명을 입력하세요"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {bomData.isDerivative && (
                                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                            <label className="text-[9px] font-black text-emerald-600 uppercase mb-1 block">Base Model (기본 모델)</label>
                                            <div className="text-xs font-bold text-emerald-800">{bomData.BasePartName}</div>
                                            <div className="text-[10px] font-medium text-emerald-600/70">{bomData.BasePartID}</div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Class</label>
                                            <span className="text-xs font-bold text-slate-700">{bomData.Class}</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Category</label>
                                            <span className="text-xs font-bold text-slate-700">{bomData.Category}</span>
                                        </div>
                                    </div>
                                    {/* 카테고리 / 시리즈: 완제품(Product)인 경우에만 렌더링 */}
                                    {isProduct && (
                                        isEditMode ? (
                                            <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Category (카테고리)</label>
                                                    <select
                                                        value={bomData.ProductCategoryId || ''}
                                                        onChange={(e) => {
                                                            const newCatId = e.target.value;
                                                            let newSpec = bomData.Spec;
                                                            
                                                            // 카테고리가 Actuator인 경우 기본 스펙 주입
                                                            const selectedCat = bomFolders.find(f => f.id === newCatId);
                                                            if (selectedCat && selectedCat.name.toLowerCase().includes('actuator')) {
                                                                const merged = mergeActuatorSpecs(editingSpecs);
                                                                newSpec = JSON.stringify(merged);
                                                                setEditingSpecs(merged);
                                                            }
                                                            
                                                            setBomData({...bomData, ProductCategoryId: newCatId, ProductSeriesId: '', Spec: newSpec});
                                                        }}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    >
                                                        <option value="">카테고리 선택 (선택 안하면 미분류)</option>
                                                        {bomFolders.filter(f => f.type === 'category').map(cat => (
                                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Series (시리즈)</label>
                                                    <select
                                                        value={bomData.ProductSeriesId || ''}
                                                        onChange={(e) => setBomData({...bomData, ProductSeriesId: e.target.value})}
                                                        disabled={!bomData.ProductCategoryId}
                                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="">{bomData.ProductCategoryId ? '시리즈 선택 (선택 안하면 카테고리 수준)' : '먼저 카테고리를 선택하세요'}</option>
                                                        {bomFolders.filter(f => f.type === 'series' && f.parentId === bomData.ProductCategoryId).map(ser => (
                                                            <option key={ser.id} value={ser.id}>{ser.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            (() => {
                                                const catFolder = bomData.ProductCategoryId
                                                    ? bomFolders.find(f => f.id === bomData.ProductCategoryId)
                                                    : null;
                                                const serFolder = bomData.ProductSeriesId
                                                    ? bomFolders.find(f => f.id === bomData.ProductSeriesId)
                                                    : null;
                                                if (!catFolder && !serFolder) return null;
                                                return (
                                                    <div className="flex gap-2">
                                                        {catFolder && (
                                                            <div className="flex-1 p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                                                                <label className="text-[9px] font-black text-indigo-400 uppercase mb-0.5 block">Category (카테고리)</label>
                                                                <span className="text-xs font-bold text-indigo-700">{catFolder.name}</span>
                                                            </div>
                                                        )}
                                                        {serFolder && (
                                                            <div className="flex-1 p-2.5 bg-purple-50 rounded-xl border border-purple-100">
                                                                <label className="text-[9px] font-black text-purple-400 uppercase mb-0.5 block">Series (시리즈)</label>
                                                                <span className="text-xs font-bold text-purple-700">{serFolder.name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()
                                        )
                                    )}
                                    
                                    <div className="h-px bg-slate-100"></div>
                                    
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Specifications</label>
                                            {isEditMode && <button onClick={addSpecRow} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Plus size={14} /></button>}
                                        </div>
                                        <div className="space-y-2">
                                            {editingSpecs
                                                .filter(spec => isEditMode || (spec.value && spec.value.trim() !== ''))
                                                .map((spec, idx) => (
                                                    <div key={idx} className="flex gap-2 items-center">
                                                        {isEditMode ? (
                                                            <input type="text" value={spec.label} onChange={(e) => updateSpecRow(idx, 'label', e.target.value)} className="w-24 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 text-[10px] font-bold outline-none" placeholder="Label" />
                                                        ) : (
                                                            <span className="w-24 px-2.5 py-1.5 bg-slate-100/50 dark:bg-slate-900/40 rounded border border-slate-200/50 dark:border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-wider min-h-[32px] flex items-center shrink-0">{spec.label || '-'}</span>
                                                        )}
                                                        
                                                        {spec.label === '통신' || spec.label === '통신 방식' ? (
                                                            isEditMode ? (
                                                                <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1.5 items-center bg-slate-50/50 border border-slate-100 rounded p-2">
                                                                    {['PT', 'PWM', 'RS485', 'CAN'].map(opt => {
                                                                        const values = (spec.value || '').split(',').map(v => v.trim()).filter(Boolean);
                                                                        const isChecked = values.includes(opt);
                                                                        return (
                                                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold text-slate-700">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isChecked}
                                                                                    onChange={(e) => {
                                                                                        let nextValues;
                                                                                        if (e.target.checked) {
                                                                                            nextValues = [...values, opt];
                                                                                        } else {
                                                                                            nextValues = values.filter(v => v !== opt);
                                                                                        }
                                                                                        updateSpecRow(idx, 'value', nextValues.join(', '));
                                                                                    }}
                                                                                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                                                                />
                                                                                <span>{opt}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="flex-1 flex flex-wrap gap-1.5 items-center min-h-[32px]">
                                                                    {(() => {
                                                                        const values = (spec.value || '').split(',').map(v => v.trim()).filter(Boolean);
                                                                        if (values.length === 0) return <span className="text-xs font-bold text-slate-400">-</span>;
                                                                        return values.map(v => (
                                                                            <span key={v} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-lg border border-blue-100/50">
                                                                                {v}
                                                                            </span>
                                                                        ));
                                                                    })()}
                                                                </div>
                                                            )
                                                        ) : spec.label === 'Protocol' || spec.label === '프로토콜' ? (
                                                            isEditMode ? (
                                                                <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1.5 items-center bg-slate-50/50 border border-slate-100 rounded p-2">
                                                                    {['PWM', 'IRPROTOCOL', 'Modbus RTU', 'CANopen'].map(opt => {
                                                                        const values = (spec.value || '').split(',').map(v => v.trim()).filter(Boolean);
                                                                        const isChecked = values.includes(opt);
                                                                        return (
                                                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold text-slate-700">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isChecked}
                                                                                    onChange={(e) => {
                                                                                        let nextValues;
                                                                                        if (e.target.checked) {
                                                                                            nextValues = [...values, opt];
                                                                                        } else {
                                                                                            nextValues = values.filter(v => v !== opt);
                                                                                        }
                                                                                        updateSpecRow(idx, 'value', nextValues.join(', '));
                                                                                    }}
                                                                                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                                                                />
                                                                                <span>{opt}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="flex-1 flex flex-wrap gap-1.5 items-center min-h-[32px]">
                                                                    {(() => {
                                                                        const values = (spec.value || '').split(',').map(v => v.trim()).filter(Boolean);
                                                                        if (values.length === 0) return <span className="text-xs font-bold text-slate-400">-</span>;
                                                                        return values.map(v => (
                                                                            <span key={v} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-lg border border-indigo-100/50">
                                                                                {v}
                                                                            </span>
                                                                        ));
                                                                    })()}
                                                                </div>
                                                            )
                                                        ) : (
                                                            isEditMode ? (
                                                                <input type="text" value={spec.value} onChange={(e) => updateSpecRow(idx, 'value', e.target.value)} className="flex-1 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 text-xs font-bold outline-none" placeholder="Value" />
                                                            ) : (
                                                                <div className="flex-1 flex flex-wrap gap-1.5 items-center min-h-[32px]">
                                                                    {(() => {
                                                                        const values = (spec.value || '').split(',').map(v => v.trim()).filter(Boolean);
                                                                        if (values.length === 0) return <span className="text-xs font-bold text-slate-400">-</span>;
                                                                        return values.map(v => (
                                                                            <span key={v} className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-lg border border-emerald-100/50">
                                                                                {v}
                                                                            </span>
                                                                        ));
                                                                    })()}
                                                                </div>
                                                            )
                                                        )}
                                                        
                                                        {isEditMode && <button onClick={() => removeSpecRow(idx)} className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 size={14} /></button>}
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-3 min-h-0" data-tour="bom-structure">
                                <BOMStructurePanel 
                                    bomData={bomData}
                                    isEditMode={isEditMode}
                                    onNodeClick={handleNodeClick}
                                    allParts={allParts}
                                    expandAllTrigger={expandAllTrigger}
                                    collapseAllTrigger={collapseAllTrigger}
                                    onExpandAll={() => setExpandAllTrigger(prev => prev + 1)}
                                    onCollapseAll={() => setCollapseAllTrigger(prev => prev + 1)}
                                    onQtyChange={handleQtyChange}
                                    onLocationChange={handleLocationChange}
                                    onNoteChange={handleNoteChange}
                                    onDelete={handleDeleteNode}
                                    onAddChild={handleAddChild}
                                    onReorder={handleReorder}
                                    showObsolete={showObsolete}
                                    diffData={diffData}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Layers size={48} className="mb-4 opacity-20" />
                        <p className="font-bold text-sm">BOM을 선택하여 시작하세요</p>
                    </div>
                )}
            </div>

            <BOMSaveModal 
                isOpen={isSaveModalOpen} 
                onClose={() => setIsSaveModalOpen(false)} 
                onSave={handleSaveBOM} 
                changes={bomData ? compareBOMs(originalStructure || {}, bomData).map(d => `${d.type.toUpperCase()}: ${d.partId} (${d.name})`) : []} 
            />
            <BOMExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} rootPart={selectedMaster} bomData={bomData} />
            <BOMImportModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
                onImportSuccess={fetchMasters} 
                allParts={allParts} 
            />
            
            {selectedPartIdForDetail && (
                <PartsDetailPanel 
                    partId={selectedPartIdForDetail}
                    parts={allParts}
                    allBoms={allBoms}
                    onClose={() => setSelectedPartIdForDetail(null)}
                />
            )}
            
            {isCategoryModalOpen && (
                <CategoryManagerModal
                    onClose={() => setIsCategoryModalOpen(false)}
                    onUpdate={() => fetchFolders()}
                />
            )}
            </div>
        </div>
    );
};

export default BOMPage;
