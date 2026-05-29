import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, getDocs, query, where, writeBatch, runTransaction, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Save, AlertCircle, FileText, Plus, CheckCircle2, Search } from 'lucide-react';
import BOMSaveModal from './BOMSaveModal';

// Local helper for revision update
function getNextRevision(currentRev) {
    const parts = (currentRev || '1.0').split('.');
    if (parts.length < 2) return '1.1';
    const major = Number(parts[0]);
    const minor = Number(parts[1]);
    return `${major}.${minor + 1}`;
}

export default function PartFormModal({ mode = 'create', initialData = null, onClose, onSuccess }) {
    const isEdit = mode === 'edit';
    const [isRevisionUp, setIsRevisionUp] = useState(false);
    
    // Existing parts list for substitute mapping
    const [availableParts, setAvailableParts] = useState([]);
    const [substituteSearch, setSubstituteSearch] = useState('');

    const [formData, setFormData] = useState({
        PartID: '',
        Name: '',
        Category: '기구부품 (M)',
        Class: 'Part (I)',
        PartTypeCode: '',
        Spec: '',
        Unit: 'EA',
        Rev: '1.0',
        Maker: '', 
        Manufacturer: '',
        MPN: '',
        MFN: '',
        Owner: '',
        UnitPrice: 0,
        Currency: 'KRW',
        Description: '',
        Datasheet: '',
        Image: '',
        IsLatestRevision: true,
        MasterPartID: '',
        Lifecycle: 'Draft', // Draft, Active, ECN, Obsolete
        Supplier: '',
        DefaultLocation: '', // Default Bin/Location
        SubstitutePartIDs: [], // Alternative Parts Array
        // Mecha specific
        ProcessType: '가공',
        Material: '',
        Grade: '',
        Color: '',
        Safety: { CE: false, ROHS: false, UL: false, KC: false, REACH: false }
    });

    const [options, setOptions] = useState({ materials: [], grades: [], colors: [] });
    const [newInputs, setNewInputs] = useState({ material: '', grade: '', color: '' });
    const [showAddInputs, setShowAddInputs] = useState({ material: false, grade: false, color: false });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [detectedChanges, setDetectedChanges] = useState([]);

    useEffect(() => {
        // Load other parts for mapping substitutes
        async function loadPartsForSubs() {
            try {
                const snap = await getDocs(query(collection(db, 'parts'), where('IsLatestRevision', '==', true)));
                const list = [];
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    // Exclude current editing part from mapping onto itself
                    if (!isEdit || data.PartID !== initialData?.PartID) {
                        list.push({ PartID: data.PartID, Name: data.Name });
                    }
                });
                setAvailableParts(list);
            } catch (err) {
                console.error("Failed to load parts for substitutes:", err);
            }
        }
        loadPartsForSubs();

        if (isEdit && initialData) {
            setFormData(prev => ({
                ...prev,
                ...initialData,
                Safety: {
                    CE: false, ROHS: false, UL: false, KC: false, REACH: false,
                    ...(initialData.Safety || {})
                },
                Grade: initialData.Grade || '',
                Color: initialData.Color || '',
                SubstitutePartIDs: initialData.SubstitutePartIDs || [],
                DefaultLocation: initialData.DefaultLocation || '',
                Lifecycle: initialData.Lifecycle || 'Draft',
                Supplier: initialData.Supplier || ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                Rev: '1.0',
                IsLatestRevision: true,
                Lifecycle: 'Draft',
                Supplier: '',
                SubstitutePartIDs: [],
                DefaultLocation: ''
            }));
        }
        fetchOptions();
    }, [isEdit, initialData]);

    const fetchOptions = async () => {
        try {
            const snap = await getDocs(collection(db, 'metadata'));
            const mechaOptions = snap.docs.find(d => d.id === 'mecha_options');
            if (mechaOptions) {
                setOptions(mechaOptions.data());
            } else {
                const initialOptions = { materials: ['AL', 'SUS', 'PC', 'ABS'], grades: ['6061', '304', 'V0'], colors: ['Black', 'Silver', 'White'] };
                setOptions(initialOptions);
            }
        } catch (e) {
            console.error("Error fetching mecha options:", e);
        }
    };

    const updateOptions = async (field, newVal) => {
        if (!newVal || options[field + 's'].includes(newVal)) return;
        const updated = { ...options, [field + 's']: [...options[field + 's'], newVal] };
        setOptions(updated);
        try {
            const docRef = doc(db, 'metadata', 'mecha_options');
            await updateDoc(docRef, updated);
        } catch (e) {
            const { setDoc } = await import('firebase/firestore');
            const docRef = doc(db, 'metadata', 'mecha_options');
            await setDoc(docRef, updated);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox' && name.startsWith('safety_')) {
            const key = name.split('_')[1];
            setFormData(prev => ({
                ...prev,
                Safety: { ...prev.Safety, [key]: checked }
            }));
        } else if (['Material', 'Grade', 'Color'].includes(name) && value === 'ADD_NEW') {
            setShowAddInputs(prev => ({ ...prev, [name.toLowerCase()]: true }));
            setFormData(prev => ({ ...prev, [name]: '' }));
        } else if (name === 'UnitPrice') {
            const rawValue = value.replace(/[^0-9]/g, '');
            setFormData(prev => ({ ...prev, UnitPrice: rawValue }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddOption = (field) => {
        const val = newInputs[field];
        if (!val) return;
        setFormData(prev => ({ ...prev, [field.charAt(0).toUpperCase() + field.slice(1)]: val }));
        updateOptions(field, val);
        setNewInputs(prev => ({ ...prev, [field]: '' }));
        setShowAddInputs(prev => ({ ...prev, [field]: false }));
    };

    const toggleSubstitute = (partId) => {
        setFormData(prev => {
            const subs = prev.SubstitutePartIDs || [];
            if (subs.includes(partId)) {
                return { ...prev, SubstitutePartIDs: subs.filter(id => id !== partId) };
            } else {
                return { ...prev, SubstitutePartIDs: [...subs, partId] };
            }
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isEdit) {
            const changes = [];
            const fieldsToWatch = [
                'Name', 'Category', 'Class', 'PartTypeCode', 'Spec', 'Unit', 'Rev', 
                'Manufacturer', 'MPN', 'MFN', 'Owner', 'UnitPrice', 'Currency', 
                'Description', 'Datasheet', 'Image', 'ProcessType', 'Material', 
                'Grade', 'Color', 'DefaultLocation', 'Lifecycle'
            ];
            fieldsToWatch.forEach(field => {
                const oldVal = initialData[field];
                const newVal = formData[field];
                if (String(oldVal || '') !== String(newVal || '')) {
                    const labelMap = {
                        Name: '품명', Category: '카테고리', Class: '분류', PartTypeCode: '타입코드', Spec: '사양',
                        Unit: '단위', Rev: '리비전', Manufacturer: '제조사', MPN: '제조사품번', MFN: '모델번호',
                        Owner: '담당자', UnitPrice: '단가', Currency: '통화', Description: '비고',
                        Datasheet: '도면/데이터시트', Image: '이미지', ProcessType: '가공/구매',
                        Material: '재질', Grade: '등급', Color: '색상', DefaultLocation: '기본 보관 위치',
                        Lifecycle: '생애주기 상태'
                    };
                    const label = labelMap[field] || field;
                    changes.push({
                        field: label,
                        oldValue: String(oldVal || '(없음)'),
                        newValue: String(newVal || '(없음)')
                    });
                }
            });

            // Substitute change detection
            const oldSubs = initialData.SubstitutePartIDs || [];
            const newSubs = formData.SubstitutePartIDs || [];
            if (JSON.stringify([...oldSubs].sort()) !== JSON.stringify([...newSubs].sort())) {
                changes.push({
                    field: '대체 부품',
                    oldValue: oldSubs.length > 0 ? oldSubs.join(', ') : '(없음)',
                    newValue: newSubs.length > 0 ? newSubs.join(', ') : '(없음)'
                });
            }

            if (changes.length === 0 && !isRevisionUp) {
                alert("변경 사항이 없습니다.");
                onClose();
                return;
            }
            if (isRevisionUp) {
                changes.push({
                    field: '리비전',
                    oldValue: formData.Rev,
                    newValue: getNextRevision(formData.Rev) + ' (Up)'
                });
            }

            setDetectedChanges(changes);
            setIsSaveModalOpen(true);
        } else {
            handleFinalSubmit({ 
                updateType: 'Simple Update', 
                reason: 'Initial Create', 
                changes: [{
                    field: '신규 생성',
                    oldValue: '(없음)',
                    newValue: '부품 신규 등록'
                }] 
            });
        }
    };

    const handleFinalSubmit = async ({ reason, updateType, changes: passedChanges }) => {
        const finalChanges = passedChanges || detectedChanges;
        setIsSubmitting(true);
        setIsSaveModalOpen(false);
        try {
            if (isEdit) {
                const isAutoApproved = updateType === 'Simple Update';
                const shouldRevUpManually = isRevisionUp;

                if (shouldRevUpManually) {
                    // Mark old as not latest
                    const oldDocRef = doc(db, 'parts', initialData.id);
                    await updateDoc(oldDocRef, {
                        IsLatestRevision: false,
                        LastModified: new Date()
                    });

                    // Create new revision
                    const newRev = getNextRevision(formData.Rev);
                    const newPartID = `${formData.MasterPartID || formData.PartID.split('-')[0]}-${newRev}`;

                    // eslint-disable-next-line no-unused-vars
                    const { id, ...newPartData } = formData;
                    await addDoc(collection(db, 'parts'), {
                        ...newPartData,
                        PartID: newPartID,
                        Rev: newRev,
                        IsLatestRevision: true,
                        LastModified: new Date(),
                        UnitPrice: Number(newPartData.UnitPrice),
                    });

                    // Clone BOM links
                    const bomQuery = query(collection(db, 'bom'), where('ParentID', '==', initialData.PartID));
                    const bomSnap = await getDocs(bomQuery);
                    if (!bomSnap.empty) {
                        const bomBatch = writeBatch(db);
                        bomSnap.forEach(bomDoc => {
                            const newBomRef = doc(collection(db, 'bom'));
                            bomBatch.set(newBomRef, {
                                ...bomDoc.data(),
                                ParentID: newPartID
                            });
                        });
                        await bomBatch.commit();
                    }

                    // Log ECN
                    await addDoc(collection(db, 'ecns'), {
                        MasterPartID: formData.MasterPartID || formData.PartID.split('-')[0],
                        PartID: newPartID,
                        Rev: newRev,
                        CurrentRevision: newRev,
                        Reason: reason,
                        Type: updateType,
                        Status: updateType === 'ECN' ? 'Pending' : (isAutoApproved ? 'Approved' : 'Pending'),
                        CurrentStep: 0,
                        ApprovalHistory: [],
                        RequestedBy: 'User (Manual)',
                        CreatedAt: new Date(),
                        CreatedBy: 'User (Manual)',
                        ModifiedFields: ['Manual Revision Information Update'],
                        Changes: finalChanges
                    });
                } else {
                    const docRef = doc(db, 'parts', initialData.id);
                    // eslint-disable-next-line no-unused-vars
                    const { id, ...updateData } = formData;
                    await updateDoc(docRef, {
                        ...updateData,
                        LastModified: new Date(),
                        UnitPrice: Number(updateData.UnitPrice),
                    });

                    // Log ECN
                    await addDoc(collection(db, 'ecns'), {
                        MasterPartID: formData.MasterPartID || formData.PartID.split('-')[0],
                        PartID: formData.PartID,
                        Rev: formData.Rev,
                        CurrentRevision: formData.Rev,
                        Reason: reason,
                        Type: updateType,
                        Status: updateType === 'ECN' ? 'Pending' : (updateType === 'Simple Update' ? 'Approved' : 'Pending'),
                        CurrentStep: 0,
                        ApprovalHistory: [],
                        RequestedBy: 'User (Manual)',
                        CreatedAt: new Date(),
                        CreatedBy: 'User (Manual)',
                        ModifiedFields: ['Part Metadata Update'],
                        Changes: finalChanges
                    });
                }
                onSuccess();
            } else {
                // Concurrency Safe Auto-ID Generation using Firestore Transaction
                const catMap = { '기구부품 (M)': 'M', '전자부품 (E)': 'E', '구매품 (O)': 'O' };
                const catCode = catMap[formData.Category] || 'O';
                let classCode = formData.Class === 'Assembly (A)' || formData.Class === 'Product (P)' ? 'A' : 'I';
                const typeCode = (formData.PartTypeCode || 'X').toUpperCase().charAt(0);
                const counterKey = `${catCode}-${classCode}-${typeCode}`;

                const counterDocRef = doc(db, 'metadata', 'parts_counter');
                let nextSeq = '0001';

                await runTransaction(db, async (transaction) => {
                    const counterSnap = await transaction.get(counterDocRef);
                    let currentCounter = {};
                    if (counterSnap.exists()) {
                        currentCounter = counterSnap.data();
                    }
                    const prevVal = currentCounter[counterKey] || 0;
                    const newVal = prevVal + 1;
                    transaction.set(counterDocRef, { ...currentCounter, [counterKey]: newVal }, { merge: true });
                    nextSeq = String(newVal).padStart(4, '0');
                });

                const masterID = `IR${catCode}${classCode}${typeCode}${nextSeq}`;
                const partID = `${masterID}-1.0`;

                await addDoc(collection(db, 'parts'), {
                    ...formData,
                    PartID: partID,
                    MasterPartID: masterID,
                    Rev: '1.0',
                    IsLatestRevision: true,
                    Lifecycle: 'Draft', // First state is always Draft
                    Supplier: formData.Supplier,
                    LastModified: new Date(),
                    UnitPrice: Number(formData.UnitPrice),
                });

                // ECN Log
                await addDoc(collection(db, 'ecns'), {
                    MasterPartID: masterID,
                    PartID: partID,
                    PartName: formData.Name || formData.PartName || '',
                    Rev: '1.0',
                    CurrentRevision: '1.0',
                    Reason: 'Initial Creation (초도품 등록)',
                    Type: 'Initial Release',
                    Status: 'Pending',
                    CurrentStep: 0,
                    ApprovalHistory: [],
                    RequestedBy: 'User (Manual)',
                    CreatedAt: new Date(),
                    CreatedBy: 'User (Manual)',
                    ModifiedFields: ['Creation'],
                    Changes: finalChanges
                });

                onSuccess();
            }
        } catch (e) {
            console.error("Save Error", e);
            alert("저장 중 오류가 발생했습니다: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredSubs = availableParts.filter(p => {
        const term = substituteSearch.toLowerCase();
        return p.PartID.toLowerCase().includes(term) || p.Name.toLowerCase().includes(term);
    });

    return createPortal(
        (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 sm:p-6 animate-in fade-in duration-300 pointer-events-auto">
                <div className="bg-white dark:bg-slate-950 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] border border-slate-200/50 dark:border-slate-800/80">
                    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                    
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-blue-500">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-slate-800 italic tracking-tight leading-none">{isEdit ? 'Edit Part' : 'New Part'}</h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Inventory Registration</p>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} className="p-2 hover:bg-white hover:text-red-500 rounded-xl transition-all text-slate-400">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Scrollable Form Content */}
                    <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                        <div className="grid grid-cols-4 gap-4">
                            
                            {/* Part Name, Owner, Revision */}
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Part Name</label>
                                <input required name="Name" value={formData.Name} onChange={handleChange} className="w-full bg-blue-50/30 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Owner</label>
                                <input name="Owner" value={formData.Owner} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Revision</label>
                                <input name="Rev" value={formData.Rev} readOnly className="w-full bg-slate-100 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-500" />
                            </div>

                            {/* Category, Class, Part Type, Unit */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Category</label>
                                <select name="Category" value={formData.Category} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500">
                                    <option>기구부품 (M)</option>
                                    <option>전자부품 (E)</option>
                                    <option>구매품 (O)</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Class</label>
                                <select name="Class" value={formData.Class} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500">
                                    <option>Part (I)</option>
                                    <option>Assembly (A)</option>
                                    <option>Product (P)</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Part Type</label>
                                <select name="PartTypeCode" value={formData.PartTypeCode} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-indigo-700 outline-none focus:ring-1 focus:ring-indigo-500">
                                    <option value="">Select</option>
                                    <option value="A">A (Assembly Sub)</option>
                                    <option value="P">P (Plastic)</option>
                                    <option value="S">S (Sheet metal)</option>
                                    <option value="T">T (Turning cut)</option>
                                    <option value="D">D (Die casting/Sinter)</option>
                                    <option value="E">E (Extrusion)</option>
                                    <option value="R">R (Rubber/Silicon)</option>
                                    <option value="B">B (Board-PCB)</option>
                                    <option value="X">X (Bearing/Screw/Bond)</option>
                                    <option value="C">C (Motor/Sol/Switch)</option>
                                    <option value="W">W (Wire/Harness)</option>
                                    <option value="Q">Q (Analog/Digital Dev)</option>
                                    <option value="M">M (Electric Module)</option>
                                    <option value="L">L (Oil/Grease)</option>
                                    <option value="V">V (Bag/Sticker)</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Unit</label>
                                <input name="Unit" value={formData.Unit} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>

                            {/* Spec, Manufacturer, MPN, Model No */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Specification</label>
                                <input name="Spec" value={formData.Spec} onChange={handleChange} className="w-full bg-indigo-50/30 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Manufacturer</label>
                                <input name="Manufacturer" value={formData.Manufacturer || formData.Maker} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">MPN</label>
                                <input name="MPN" value={formData.MPN} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Model No (MFN)</label>
                                <input name="MFN" value={formData.MFN} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>

                            {/* Default Location & Lifecycle Status */}
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest text-emerald-600">Default Bin/Location (기본 보관 위치)</label>
                                <input name="DefaultLocation" value={formData.DefaultLocation} onChange={handleChange} placeholder="예: 창고 A-03" className="w-full bg-emerald-50/20 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Lifecycle Status (생애주기 상태)</label>
                                <select name="Lifecycle" value={formData.Lifecycle} disabled={true} className="w-full bg-slate-100 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-500 cursor-not-allowed outline-none">
                                    <option value="Draft">Draft (작성중)</option>
                                    <option value="Active">Active (양산중)</option>
                                    <option value="ECN">ECN (설계변경)</option>
                                    <option value="Obsolete">Obsolete (단종)</option>
                                </select>
                            </div>

                            {/* Unit Price, Description */}
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Unit Price</label>
                                <div className="flex gap-1 items-stretch h-10">
                                    <input
                                        type="text"
                                        name="UnitPrice"
                                        value={formData.UnitPrice === '' ? '' : Number(formData.UnitPrice).toLocaleString()}
                                        onChange={handleChange}
                                        placeholder="0"
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 text-[14px] font-bold text-green-700 focus:ring-2 focus:ring-green-500 outline-none text-right shadow-inner"
                                    />
                                    <select name="Currency" value={formData.Currency} onChange={handleChange} className="w-24 bg-slate-50 border border-slate-200 rounded-md p-2 text-[12px] font-black text-slate-600 outline-none">
                                        <option>KRW</option>
                                        <option>USD</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Description (Note)</label>
                                <input name="Description" value={formData.Description} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-500 focus:ring-1 focus:ring-blue-500 outline-none h-10" />
                            </div>

                            {/* Datasheet, Image URL */}
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest text-blue-500">Datasheet / Drawing URL</label>
                                <input name="Datasheet" value={formData.Datasheet} onChange={handleChange} placeholder="https://..." className="w-full bg-blue-50/20 border border-slate-200 rounded-md p-2 text-[13px] font-bold text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>
                            <div className="space-y-1 col-span-2">
                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest text-blue-500">Reference Image URL</label>
                                <input name="Image" value={formData.Image} onChange={handleChange} placeholder="https://..." className="w-full bg-blue-50/20 border border-slate-200 rounded-md p-2 text-[13px] font-bold text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none" />
                            </div>
                        </div>

                        {/* Safety Certifications (공통 인증 사항) */}
                        <div className="pt-4 border-t border-slate-100">
                            <label className="text-[11px] font-black text-slate-650 uppercase tracking-widest block mb-2 text-blue-600">Safety Certifications (제품 인증 정보)</label>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 flex flex-wrap gap-6">
                                {[
                                    { key: 'CE', label: 'CE (유럽 안전)' },
                                    { key: 'ROHS', label: 'RoHS (유해물질제한)' },
                                    { key: 'REACH', label: 'REACH (EU 화학물질)' },
                                    { key: 'KC', label: 'KC (국가통합인증)' },
                                    { key: 'UL', label: 'UL (미국 안전)' }
                                ].map(cert => (
                                    <label key={cert.key} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            name={`safety_${cert.key}`}
                                            checked={formData.Safety?.[cert.key] || false}
                                            onChange={handleChange}
                                            className="h-4.5 w-4.5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <span className={`text-xs font-black group-hover:text-blue-600 tracking-tight transition-colors ${formData.Safety?.[cert.key] ? 'text-blue-700 font-extrabold' : 'text-slate-600'}`}>
                                            {cert.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Substitute Part Selector Section */}
                        <div className="pt-4 border-t border-slate-100">
                            <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-2 text-indigo-600">Alternative Parts Mapping (대체 부품 연결)</label>
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-150 space-y-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input
                                        type="text"
                                        placeholder="대체 부품 이름 또는 ID 검색..."
                                        value={substituteSearch}
                                        onChange={e => setSubstituteSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium text-slate-700"
                                    />
                                </div>
                                
                                {/* Selected substitutes indicators */}
                                {formData.SubstitutePartIDs && formData.SubstitutePartIDs.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pb-2">
                                        {formData.SubstitutePartIDs.map(id => {
                                            const itemObj = availableParts.find(p => p.PartID === id);
                                            return (
                                                <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold shadow-sm">
                                                    {itemObj ? `${itemObj.Name} (${id})` : id}
                                                    <button type="button" onClick={() => toggleSubstitute(id)} className="hover:text-red-500 font-extrabold text-[10px]">✕</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Available parts dropdown/list */}
                                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-50 custom-scrollbar">
                                    {filteredSubs.length > 0 ? (
                                        filteredSubs.map(p => {
                                            const isSelected = formData.SubstitutePartIDs?.includes(p.PartID);
                                            return (
                                                <div
                                                    key={p.PartID}
                                                    onClick={() => toggleSubstitute(p.PartID)}
                                                    className={`p-2.5 text-xs flex justify-between items-center cursor-pointer transition-all ${isSelected ? 'bg-indigo-50/40 text-indigo-800 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                                >
                                                    <div>
                                                        <span className="font-bold">{p.Name}</span>
                                                        <span className="font-mono text-slate-400 ml-2">[{p.PartID}]</span>
                                                    </div>
                                                    {isSelected && <span className="text-indigo-600 font-black">✓</span>}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-4 text-center text-slate-400 text-xs italic">검색 결과가 없습니다.</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Category Specific (Mecha specs) */}
                        {formData.Category === '기구부품 (M)' && (
                            <div className="pt-3 border-t border-slate-100 space-y-3 animate-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-[10px] font-black text-slate-800 italic uppercase">Mecha Specs</h3>
                                    <div className="flex-1 h-px bg-slate-100"></div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-[11px] font-black text-slate-700 uppercase tracking-tighter">가공 / 구매</label>
                                        <select name="ProcessType" value={formData.ProcessType} onChange={handleChange} className="w-full bg-indigo-50/50 border border-indigo-100 rounded-md p-2 text-[14px] font-black text-indigo-700 outline-none h-10">
                                            <option>가공</option>
                                            <option>구매</option>
                                        </select>
                                    </div>

                                    {['material', 'grade', 'color'].map(field => {
                                        const fieldUpper = field.charAt(0).toUpperCase() + field.slice(1);
                                        return (
                                            <div key={field} className="space-y-1 group">
                                                <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">
                                                    {field.toUpperCase()}
                                                </label>
                                                <div className="relative h-10">
                                                    {!showAddInputs[field] ? (
                                                        <select
                                                            name={fieldUpper}
                                                            value={formData[fieldUpper]}
                                                            onChange={handleChange}
                                                            className="w-full bg-white border border-slate-200 rounded-md p-2 text-[14px] font-bold text-slate-800 outline-none hover:border-blue-400 transition-colors shadow-sm h-full"
                                                        >
                                                            <option value="">Select</option>
                                                            {options[field + 's']?.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                            <option value="ADD_NEW" className="text-blue-500 font-black">+ Add New...</option>
                                                        </select>
                                                    ) : (
                                                        <div className="flex gap-1 animate-in zoom-in-95 duration-200 h-full">
                                                            <input
                                                                placeholder={`New...`}
                                                                value={newInputs[field]}
                                                                onChange={(e) => setNewInputs(prev => ({ ...prev, [field]: e.target.value }))}
                                                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption(field))}
                                                                className="w-24 flex-1 bg-blue-50 border border-blue-200 rounded-md px-2 text-[12px] font-bold text-blue-900 outline-none focus:ring-1 focus:ring-blue-500 h-full"
                                                                autoFocus
                                                            />
                                                            <button type="button" onClick={() => handleAddOption(field)} className="flex-none px-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                                                <CheckCircle2 size={16} />
                                                            </button>
                                                            <button type="button" onClick={() => setShowAddInputs(prev => ({ ...prev, [field]: false }))} className="flex-none px-3 bg-slate-100 text-slate-400 rounded-md hover:bg-slate-200">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {isEdit && (
                            <div className="pt-4 border-t border-slate-100">
                                <label className="flex items-center gap-3 group cursor-pointer">
                                    <input type="checkbox" checked={isRevisionUp} onChange={e => setIsRevisionUp(e.target.checked)} className="w-5 h-5 rounded-lg border-2 border-slate-200 text-blue-600 focus:ring-blue-500 transition-all" />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-slate-700 group-hover:text-blue-600 transition-colors">Apply Revision Up (Manual)</span>
                                        <span className="text-[10px] font-bold text-slate-400 tracking-tight">Check this if this change requires a new revision number.</span>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
                        <button type="button" onClick={onClose} className="px-8 py-3 bg-white border border-slate-200 text-slate-500 font-black text-sm rounded-xl hover:bg-slate-100 transition-all uppercase tracking-wider">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-10 py-3 bg-slate-800 text-white font-black text-sm rounded-xl shadow-lg shadow-slate-200 hover:bg-slate-900 transition-all flex items-center gap-2 disabled:opacity-50">
                            {isSubmitting ? <><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> Saving...</> : <><Save size={18} /> {isEdit ? 'Update' : 'Create Part'}</>}
                        </button>
                    </div>
                    </form>
                </div>

                {isSaveModalOpen && (
                    <BOMSaveModal
                        isOpen={true}
                        onSave={handleFinalSubmit}
                        onClose={() => setIsSaveModalOpen(false)}
                        changes={detectedChanges}
                        title="Part Modification"
                        subTitle="Revision & Metadata Update"
                    />
                )}
            </div>
        ),
        document.body
    );
}
