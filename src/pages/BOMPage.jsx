import React, { useState, useEffect, useRef } from 'react';
import { 
    Layers, Package, ChevronRight, ChevronDown, 
    Search, Edit3, Download, Save, X, Plus, Trash2, ArrowLeft, Home, Ban, CheckCircle2 
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getBOMStructure } from '../services/bomService';
import BOMStructurePanel from '../components/BOMStructurePanel';
import PartsDetailPanel from '../components/PartsDetailPanel';
import BOMSaveModal from '../components/BOMSaveModal';
import BOMExportModal from '../components/BOMExportModal';
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
            const q = query(partsRef, orderBy('PartID', 'asc'));
            const querySnapshot = await getDocs(q);
            
            const allPartsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
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
            const q = query(collection(db, 'spec_labels'), orderBy('label', 'asc'));
            const snap = await getDocs(q);
            setSpecLabels(snap.docs.map(d => d.data().label));
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
            fetchBOM(currentRoot.PartID);
        }
    }, [navStack, isCreatingNew]);

    const fetchBOM = async (partId) => {
        setLoading(true);
        try {
            const structure = await getBOMStructure(partId);
            setBomData(structure);
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
                    // 재귀적으로 새로 추가된 노드임을 표시
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
        setExpandAllTrigger(prev => prev + 1); // 추가 후 하위 트리가 보이도록 전체 펼치기 트리거
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

            if (isCreatingNew) {
                // 신규 생성
                const finalPartId = bomData.PartID !== 'IRP-NEW' && bomData.PartID !== 'IRA-NEW' ? bomData.PartID : `NEW-${Date.now()}`;
                
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

                await setDoc(doc(db, 'parts', finalPartId), newPartData);
                console.log("신규 부품 생성됨:", finalPartId);
            } else if (selectedMaster && selectedMaster.id) {
                const partRef = doc(db, 'parts', selectedMaster.id);
                await updateDoc(partRef, {
                    Spec: specString,
                    Description: bomData.Description || '',
                    LastUpdatedBy: currentUserLog
                });
            }
        } catch (error) {
            console.error("Error saving specs:", error);
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
                                        {(p.Lifecycle || p.Status) && (
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black border shrink-0 ${
                                                (p.Lifecycle || p.Status) === 'Draft' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                (p.Lifecycle || p.Status) === 'ECN' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                ((p.Lifecycle || p.Status) === 'Obsolete' || (p.Lifecycle || p.Status) === 'Discontinued') ? 'bg-red-100 text-red-700 border-red-200' :
                                                'bg-emerald-100 text-emerald-700 border-emerald-200'
                                            }`}>
                                                {(p.Lifecycle || p.Status) === 'Draft' ? '대기' :
                                                 (p.Lifecycle || p.Status) === 'ECN' ? '설계변경' :
                                                 ((p.Lifecycle || p.Status) === 'Obsolete' || (p.Lifecycle || p.Status) === 'Discontinued') ? '단종' : '양산'}
                                            </span>
                                        )}
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
                                        {(a.Lifecycle || a.Status) && (
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black border shrink-0 ${
                                                (a.Lifecycle || a.Status) === 'Draft' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                (a.Lifecycle || a.Status) === 'ECN' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                ((a.Lifecycle || a.Status) === 'Obsolete' || (a.Lifecycle || a.Status) === 'Discontinued') ? 'bg-red-50 text-red-600 border-red-100' :
                                                'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            }`}>
                                                {(a.Lifecycle || a.Status) === 'Draft' ? '대기' :
                                                 (a.Lifecycle || a.Status) === 'ECN' ? '설계변경' :
                                                 ((a.Lifecycle || a.Status) === 'Obsolete' || (a.Lifecycle || a.Status) === 'Discontinued') ? '단종' : '양산'}
                                            </span>
                                        )}
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
                            <span className="text-sm font-bold text-slate-600">BOM 구조를 불러오는 중...</span>
                        </div>
                    </div>
                )}

                {bomData ? (
                    <div className="p-4 max-w-[1600px] mx-auto h-full w-full flex flex-col gap-3 overflow-hidden">
                        {/* Breadcrumbs */}
                        <div className="flex flex-col gap-4 shrink-0">
                            {navStack.length > 1 && (
                                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm overflow-x-auto no-print">
                                    {navStack.map((item, idx) => (
                                        <React.Fragment key={`${item.PartID}-${idx}`}>
                                            {idx > 0 && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                                            <button 
                                                onClick={() => handleBreadcrumbClick(idx)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                                    idx === navStack.length - 1 
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                {idx === 0 && <Home size={14} className={idx === navStack.length - 1 ? 'text-blue-600' : 'text-slate-400'} />}
                                                <span className={`font-mono ${idx === navStack.length - 1 ? 'text-blue-500' : 'text-slate-400'} text-[10px]`}>
                                                    {item.PartID}
                                                </span>
                                                {item.Name}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-4 text-left">
                                    {!isCreatingNew && navStack.length > 1 && (
                                        <button 
                                            onClick={handleBack}
                                            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all shadow-sm"
                                        >
                                            <ArrowLeft size={20} />
                                        </button>
                                    )}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            {bomData.Status && (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                                    bomData.Status === 'Draft' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                    bomData.Status === 'ECN' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                    (bomData.Status === 'Obsolete' || bomData.Status === 'Discontinued') ? 'bg-red-100 text-red-700 border-red-200' :
                                                    'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                }`}>
                                                    {bomData.Status === 'Draft' ? '대기' : 
                                                     bomData.Status === 'ECN' ? '설계변경' : 
                                                     (bomData.Status === 'Obsolete' || bomData.Status === 'Discontinued') ? '단종' : '양산'}
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                bomData.Category?.includes('완제품') || bomData.PartID?.startsWith('IRP')
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {bomData.Category?.includes('완제품') || bomData.PartID?.startsWith('IRP') ? 'Product' : 'Assembly'}
                                            </span>
                                            {isCreatingNew ? (
                                                <input 
                                                    type="text"
                                                    placeholder="Part ID 입력 (예: IRP-001)"
                                                    className="bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                                    defaultValue={bomData.PartID}
                                                />
                                            ) : (
                                                <span className="text-slate-400 font-mono text-sm">{bomData.PartID}</span>
                                            )}
                                        </div>
                                        {isEditMode ? (
                                            <input 
                                                type="text"
                                                className="text-xl font-black text-slate-800 italic bg-slate-100 border-none rounded-lg px-3 py-1 w-full outline-none focus:ring-2 focus:ring-blue-500"
                                                defaultValue={bomData.Name}
                                                placeholder="제품명을 입력하세요..."
                                            />
                                        ) : (
                                            <h1 className="text-xl font-black text-slate-800 italic text-left flex items-center gap-3">
                                                {bomData.Name}
                                                {(bomData.Status || bomData.Lifecycle) && (
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border shrink-0 ${
                                                        (bomData.Status || bomData.Lifecycle) === 'Draft' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                        (bomData.Status || bomData.Lifecycle) === 'ECN' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                        ((bomData.Status || bomData.Lifecycle) === 'Obsolete' || (bomData.Status || bomData.Lifecycle) === 'Discontinued') ? 'bg-red-100 text-red-700 border-red-200' :
                                                        'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                    }`}>
                                                        {(bomData.Status || bomData.Lifecycle) === 'Draft' ? '대기' : 
                                                         (bomData.Status || bomData.Lifecycle) === 'ECN' ? '설계변경' : 
                                                         ((bomData.Status || bomData.Lifecycle) === 'Obsolete' || (bomData.Status || bomData.Lifecycle) === 'Discontinued') ? '단종' : '양산'}
                                                    </span>
                                                )}
                                            </h1>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex gap-2">
                                    {!isEditMode ? (
                                        <>
                                            {(bomData.Status === 'Draft' || bomData.Status === 'ECN') && userProfile && hasPermission(userProfile.role, USER_ROLES.MANAGER) && (
                                                <button onClick={handleConfirmMaster} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-bold text-sm shadow-sm transition-colors">
                                                    <CheckCircle2 size={16} /> 승인 처리
                                                </button>
                                            )}
                                            <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm">
                                                <Edit3 size={16} /> 수정
                                            </button>
                                            <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm">
                                                <Download size={16} /> 내보내기
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {!isCreatingNew && (
                                                <button 
                                                    onClick={handleDiscontinueMaster}
                                                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-sm shadow-sm transition-colors"
                                                    title="이 마스터 품목을 더 이상 사용하지 않음(단종) 처리합니다."
                                                >
                                                    <Ban size={16} /> 단종 처리
                                                </button>
                                            )}
                                            <button 
                                                onClick={isCreatingNew ? handleCancelCreate : () => setIsEditMode(false)} 
                                                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm"
                                            >
                                                <X size={16} /> 취소
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (isCreatingNew) {
                                                        handleSaveBOM(null);
                                                    } else {
                                                        setIsSaveModalOpen(true);
                                                    }
                                                }} 
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm shadow-md shadow-blue-100"
                                            >
                                                <Save size={16} /> {isCreatingNew ? '임시 저장 (Draft)' : '저장 (ECN)'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2-Column Content */}
                        <div className="grid grid-cols-5 gap-4 flex-1 min-h-0 overflow-hidden">
                            {/* Left Column: Information (Metadata) */}
                            <div className="col-span-2 flex flex-col overflow-y-auto pr-2 custom-scrollbar h-full text-left min-w-0 pb-4">
                                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-5 min-h-0 h-full shrink-0">
                                    {/* Revision & Status Control */}
                                    <div className="shrink-0 space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Revision Control</label>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold text-slate-500">Current:</span>
                                                <select className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                                                    <option>Rev {bomData.Rev || '1.0'} {isCreatingNew ? '(Initial)' : '(Active)'}</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Lifecycle Status</label>
                                            <div className="flex items-center">
                                                <span className={`px-3 py-1.5 rounded-xl text-xs font-black border w-full text-center ${
                                                    (bomData.Status || bomData.Lifecycle) === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    (bomData.Status || bomData.Lifecycle) === 'ECN' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    ((bomData.Status || bomData.Lifecycle) === 'Obsolete' || (bomData.Status || bomData.Lifecycle) === 'Discontinued') ? 'bg-red-50 text-red-700 border-red-200' :
                                                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                }`}>
                                                    {(bomData.Status || bomData.Lifecycle) === 'Draft' ? '대기' : 
                                                     (bomData.Status || bomData.Lifecycle) === 'ECN' ? '설계변경' : 
                                                     ((bomData.Status || bomData.Lifecycle) === 'Obsolete' || (bomData.Status || bomData.Lifecycle) === 'Discontinued') ? '단종' : '양산'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-slate-100 w-full shrink-0"></div>

                                    {/* Structured Product Specification or Where-Used */}
                                    { (selectedMaster?.PartID?.startsWith('IRA') || (selectedMaster?.Class || '').toLowerCase().includes('assembly')) ? (
                                        <div className="flex flex-col flex-1 min-h-0 text-left">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Where Used (사용처)</label>
                                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                                                {whereUsedList.length > 0 ? (
                                                    <div className="pb-4">
                                                        {whereUsedList.map((node, idx) => (
                                                            <WhereUsedTreeNode key={`${node.ParentID}-${idx}`} node={node} idx={idx} />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-500 italic bg-slate-50 p-4 rounded-xl text-center mt-2">
                                                        이 서브 어셈블리를 사용하는<br/>상위 BOM이 없습니다.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col flex-1 min-h-0 text-left">
                                        <div className="flex justify-between items-center mb-4">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Specification</label>
                                        {isEditMode && (
                                            <button onClick={addSpecRow} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                                                <Plus size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 custom-scrollbar pr-1">
                                        {isEditMode ? (
                                            <>
                                            <datalist id="spec-labels-list">
                                                {specLabels.map(l => <option key={l} value={l} />)}
                                            </datalist>
                                            {editingSpecs.map((spec, idx) => (
                                                <div key={idx} className="flex gap-2 items-center group w-full">
                                                    <div className="w-28 shrink-0">
                                                        <input 
                                                            type="text"
                                                            list="spec-labels-list"
                                                            value={spec.label}
                                                            onChange={(e) => updateSpecRow(idx, 'label', e.target.value)}
                                                            placeholder="레이블명"
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                    <input 
                                                        type="text"
                                                        value={spec.value} 
                                                        onChange={(e) => updateSpecRow(idx, 'value', e.target.value)}
                                                        className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="데이터 입력..."
                                                    />
                                                    <button onClick={() => removeSpecRow(idx)} className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <X size={14}/>
                                                    </button>
                                                </div>
                                            ))}
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                {editingSpecs.filter(s => s.label || s.value).length > 0 ? (
                                                    editingSpecs.filter(s => s.label || s.value).map((s, i) => (
                                                        <div key={i} className="flex border-b border-slate-50 pb-1.5 items-center w-full">
                                                            <span className="w-16 shrink-0 text-[9px] font-black text-slate-400 uppercase truncate mt-0.5">{s.label}</span>
                                                            <span className="flex-1 min-w-0 text-[11px] font-bold text-slate-700 whitespace-pre-wrap break-words">{s.value}</span>
                                                        </div>
                                                    ))
                                                ) : <div className="text-[11px] text-slate-400 italic">사양 정보가 없습니다.</div>}
                                            </div>
                                        )}
                                    </div>
                                    </div>
                                    )}

                                    <div className="h-px bg-slate-100 w-full shrink-0"></div>

                                    <div className="flex flex-col shrink-0 h-[80px] text-left">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Remark & Notes</label>
                                    {isEditMode ? (
                                        <textarea 
                                            className="w-full flex-1 bg-slate-50 border-none rounded-xl p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-h-0 resize-none custom-scrollbar"
                                            value={bomData.Description || ''}
                                            onChange={(e) => setBomData({ ...bomData, Description: e.target.value })}
                                            placeholder="참고 사항..."
                                        />
                                    ) : (
                                        <div className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-xl flex-1 overflow-y-auto custom-scrollbar">
                                            {bomData.Description || '비고 사항이 없습니다.'}
                                        </div>
                                    )}
                                    </div>

                                    {/* Audit Trail (생성자/승인자 기록) */}
                                    {(bomData.CreatedBy || bomData.ConfirmedBy) && (
                                        <>
                                            <div className="h-px bg-slate-100 w-full shrink-0 my-1"></div>
                                            <div className="shrink-0 flex flex-col gap-1.5 text-[10px] text-slate-500 font-medium pb-1">
                                                {bomData.CreatedBy && (
                                                    <div className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100">
                                                        <span>생성: <b>{bomData.CreatedBy.name}</b> ({bomData.CreatedBy.email})</span>
                                                        <span>{new Date(bomData.CreatedBy.date).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                                {bomData.ConfirmedBy && (
                                                    <div className="flex justify-between items-center bg-emerald-50 px-2.5 py-1.5 rounded border border-emerald-100 text-emerald-600">
                                                        <span>승인: <b>{bomData.ConfirmedBy.name}</b> ({bomData.ConfirmedBy.email})</span>
                                                        <span>{new Date(bomData.ConfirmedBy.date).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: BOM Assembly Structure */}
                            <div className="col-span-3 h-full flex flex-col min-h-0 overflow-hidden min-w-0">
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
                                    showObsolete={showObsolete}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                            <Layers size={40} />
                        </div>
                        <div className="text-center">
                            <div className="font-bold text-lg text-slate-600 text-left">BOM을 선택하거나 새로 생성해주세요</div>
                            <p className="text-sm">좌측 목록에서 선택하거나 [+] 버튼을 눌러 신규 설계를 시작하세요.</p>
                        </div>
                    </div>
                )}
            </div>

            {selectedPartIdForDetail && (
                <PartsDetailPanel 
                    partId={selectedPartIdForDetail}
                    parts={allParts}
                    allBoms={allBoms}
                    onClose={() => setSelectedPartIdForDetail(null)}
                    onPartSelect={(id) => setSelectedPartIdForDetail(id)}
                />
            )}

            <BOMSaveModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={handleSaveBOM} changes={[]} />
            <BOMExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} rootPart={selectedMaster} bomData={bomData} />
        </div>
    );
};

export default BOMPage;
