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
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, USER_ROLES } from '../services/userService';

const BOMPage = () => {
    const { userProfile } = useAuth();
    const [products, setProducts] = useState([]);
    const [assemblies, setAssemblies] = useState([]);
    const [allParts, setAllParts] = useState([]);
    const [allBoms, setAllBoms] = useState([]);
    
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [bomData, setBomData] = useState(null);
    const [originalStructure, setOriginalStructure] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Navigation & Drill-down State
    const [navStack, setNavStack] = useState([]); 
    
    const [isProductOpen, setIsProductOpen] = useState(true);
    const [isAssemblyOpen, setIsAssemblyOpen] = useState(true);
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

    // Diff/Comparison State
    const [diffData, setDiffData] = useState(null);
    const [isComparing, setIsComparing] = useState(false);

    // Spec Management State
    const [specLabels, setSpecLabels] = useState([]);
    const [editingSpecs, setEditingSpecs] = useState([]); // [{label: '', value: ''}]
    const [activeLabelDropdown, setActiveLabelDropdown] = useState(null);

    // Where-Used (상위 사용처) State
    const [whereUsedList, setWhereUsedList] = useState([]);

    // Initial Load
    useEffect(() => {
        fetchMasters();
        fetchSpecLabels();
    }, []);

    const fetchMasters = async () => {
        setLoading(true);
        try {
            const partsRef = collection(db, 'parts');
            const querySnapshot = await getDocs(partsRef);
            
            const allPartsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            allPartsData.sort((a, b) => (a.PartID || '').localeCompare(b.PartID || ''));
            setAllParts(allPartsData);

            const prodList = allPartsData.filter(p => 
                (p.Class?.toLowerCase().includes('product') || p.Class?.toLowerCase().includes('(p)')) ||
                p.PartID?.startsWith('IRP')
            );

            const assyList = allPartsData.filter(p => 
                (p.Class?.toLowerCase().includes('assembly') || p.Class?.toLowerCase().includes('(a)')) ||
                p.PartID?.startsWith('IRA')
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
                    parsedSpecs = [{ label: 'General', value: bomData.Spec }];
                } else {
                    parsedSpecs = [{ label: '', value: '' }];
                }
                setEditingSpecs(parsedSpecs);
            } catch (e) {
                setEditingSpecs([{ label: 'General', value: bomData.Spec || '' }]);
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
        setEditingSpecs(next.length ? next : [{ label: '', value: '' }]);
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
    const handleStartNewBOM = (type) => {
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
        
        setSelectedMaster(null);
        setIsNewCreating(true);
        setNewBOMType(type);
        setBomData(newTemplate);
        setNavStack([{ PartID: tempPartID, Name: newTemplate.Name }]);
        setIsEditMode(true);
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
        if (!selectedMaster || !selectedMaster.id) return;
        
        const isConfirm = window.confirm(
            `[${selectedMaster.PartID}] ${selectedMaster.Name}\n\n이 품목을 정말로 단종(Discontinue) 처리하시겠습니까?\n단종 처리 시 목록에서 숨겨지며, 데이터베이스에는 영구 보존됩니다.`
        );

        if (isConfirm) {
            setLoading(true);
            try {
                const partRef = doc(db, 'parts', selectedMaster.id);
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

                batch.set(doc(db, 'parts', finalPartId), newPartData);

                // Save initial BOM structure (Children)
                if (bomData.Children && bomData.Children.length > 0) {
                    bomData.Children.forEach(child => {
                        const bomRef = doc(collection(db, 'bom'));
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
                const partRef = doc(db, 'parts', selectedMaster.id);
                batch.update(partRef, {
                    Spec: specString,
                    Description: bomData.Description || '',
                    LastUpdatedBy: currentUserLog
                });

                // ECN Auto-drafting
                if (ecnData && ecnData.updateType === 'ECN') {
                    const diffs = compareBOMs(navStack[0].originalStructure || {}, bomData);
                    const ecnRef = doc(collection(db, 'ecns'));
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
                        Status: 'Pending',
                        CurrentStep: 0,
                        ApprovalHistory: [],
                        RequestedBy: userProfile?.displayName || userProfile?.Name || 'Unknown',
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
                }
            }

            await batch.commit();
            if (ecnData?.updateType === 'ECN') {
                alert('BOM 변경 사항이 저장되었으며 ECN 초안이 자동으로 기안되었습니다.');
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
        <div className="flex h-[calc(100vh-140px)] bg-slate-50 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
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
                                className="p-1 text-blue-600 hover:bg-blue-100 rounded opacity-0 group-hover/section:opacity-100 transition-opacity ml-1"
                                title="신규 완제품 BOM 생성"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        {isProductOpen && (
                            <div className="mt-1 space-y-1 ml-2">
                                {filteredProducts.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedMaster(p)}
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 overflow-hidden ${
                                            selectedMaster?.id === p.id 
                                            ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' 
                                            : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium w-full">{p.Name}</div>
                                            <div className="text-[10px] opacity-60 truncate w-full">{p.PartID}</div>
                                        </div>
                                    </button>
                                ))}
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
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 overflow-hidden ${
                                            selectedMaster?.id === a.id 
                                            ? 'bg-amber-50 text-amber-700 font-bold border border-amber-100' 
                                            : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{a.Name}</div>
                                            <div className="text-[10px] opacity-60">{a.PartID}</div>
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
                                        <button onClick={handleDeriveBOM} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-md shadow-emerald-100 transition-all">
                                            <GitCompare size={16} /> 파생발의
                                        </button>
                                        <button onClick={handleComparePrevious} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm transition-all">
                                            <GitCompare size={16} /> 이전 리비전과 비교
                                        </button>
                                        <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm shadow-md shadow-indigo-100 transition-all">
                                            <Edit3 size={16} /> 수정 시작
                                        </button>
                                        <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm">
                                            <Download size={16} /> 내보내기
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => { setIsEditMode(false); setIsNewCreating(false); setDiffData(null); setIsComparing(false); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold text-sm shadow-sm">
                                            <X size={16} /> 취소
                                        </button>
                                        <button onClick={() => setIsSaveModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm shadow-md">
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
                                    
                                    <div className="h-px bg-slate-100"></div>
                                    
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Specifications</label>
                                            {isEditMode && <button onClick={addSpecRow} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Plus size={14} /></button>}
                                        </div>
                                        <div className="space-y-2">
                                            {editingSpecs.map((spec, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <input type="text" value={spec.label} onChange={(e) => updateSpecRow(idx, 'label', e.target.value)} disabled={!isEditMode} className="w-24 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 text-[10px] font-bold outline-none" placeholder="Label" />
                                                    <input type="text" value={spec.value} onChange={(e) => updateSpecRow(idx, 'value', e.target.value)} disabled={!isEditMode} className="flex-1 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 text-xs font-bold outline-none" placeholder="Value" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-3 min-h-0">
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
        </div>
    );
};

export default BOMPage;
