import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, getDocs, query, where, writeBatch, addDoc, updateDoc, runTransaction } from '../firebase';
import { db } from '../firebase';
import { 
    X, Save, FileText, Plus, CheckCircle2, 
    Settings2, Trash2, Tag, CheckSquare, MessageSquare, RefreshCw, 
    Truck, DollarSign, PenTool, Database, Link as LinkIcon, ClipboardList
} from 'lucide-react';
import BOMSaveModal from './BOMSaveModal';
import { getCustomFields, createCustomField, deactivateCustomField } from '../services/metadataService';
import { autoRegisterFromPart } from '../services/supplierAutoRegister';

// Local helper for revision update
function getNextRevision(currentRev) {
    const parts = (currentRev || '1.0').split('.');
    if (parts.length < 2) return '1.1';
    const major = Number(parts[0]);
    const minor = Number(parts[1]);
    return `${major}.${minor + 1}`;
}

const PART_TYPES = [
    { code: 'A', label: 'Assembly Sub' },
    { code: 'P', label: 'Plastic' },
    { code: 'S', label: 'Sheet metal' },
    { code: 'T', label: 'Turning cut' },
    { code: 'D', label: 'Die casting/Sinter' },
    { code: 'E', label: 'Extrusion' },
    { code: 'R', label: 'Rubber/Silicon' },
    { code: 'B', label: 'Board-PCB' },
    { code: 'X', label: 'Bearing/Screw/Bond' },
    { code: 'C', label: 'Motor/Sol/Switch' },
    { code: 'W', label: 'Wire/Harness' },
    { code: 'Q', label: 'Analog/Digital Dev' },
    { code: 'M', label: 'Electric Module' },
    { code: 'L', label: 'Oil/Grease' },
    { code: 'V', label: 'Bag/Sticker' }
];

export default function PartFormModal({ mode = 'create', initialData = null, onClose, onSuccess }) {
    const isEdit = mode === 'edit';
    const [isRevisionUp, setIsRevisionUp] = useState(false);
    
    // Existing parts list for substitute mapping
    const [availableParts, setAvailableParts] = useState([]);
    const [substituteSearch, setSubstituteSearch] = useState('');

    // Custom Fields States
    const [customFields, setCustomFields] = useState([]);
    const [customData, setCustomData] = useState({});
    const [isAddingField, setIsAddingField] = useState(false);
    const [newFieldForm, setNewFieldForm] = useState({ label: '', fieldType: 'text' });

    const [formData, setFormData] = useState({
        PartID: '',
        Name: '',
        Category: '기구부품 (M)',
        Class: 'Part (I)',
        PartTypeCode: 'A',
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
        LeadTime: 0,
        IsOverseas: false,
        Description: '',
        Datasheet: '',
        Image: '',
        IsLatestRevision: true,
        MasterPartID: '',
        Lifecycle: 'Draft', 
        Supplier: '',
        SubstitutePartIDs: [], 
        ProcessType: '가공',
        Material: '',
        Grade: '',
        Color: '',
        Safety: { CE: false, ROHS: false, UL: false, KC: false, REACH: false },
        SafetyLinks: { CE: '', ROHS: '', UL: '', KC: '', REACH: '' },
        CustomData: {}
    });

    const [options, setOptions] = useState({ materials: [], grades: [], colors: [] });
    const [newInputs, setNewInputs] = useState({ material: '', grade: '', color: '' });
    const [showAddInputs, setShowAddInputs] = useState({ material: false, grade: false, color: false });
    
    // Dynamic fields management
    const [visibleFields, setVisibleFields] = useState([]);
    const [showAddFieldMenu, setShowAddFieldMenu] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [detectedChanges, setDetectedChanges] = useState([]);

    // Part ID Auto-generation Helper (Will be used in transaction during submit, but preview is shown to user)
    const [partIdPreview, setPartIdPreview] = useState('[자동 생성 대기]');

    useEffect(() => {
        if (isEdit) return;
        setPartIdPreview('[자동 생성 대기]');
    }, [formData.Category, formData.Class, formData.PartTypeCode, formData.Rev, isEdit]);

    // QA Settings State
    const [qaSettings, setQaSettings] = useState({
        isTarget: false,
        useDocument: false,
        inspectionItems: []
    });

    useEffect(() => {
        async function loadPartsForSubs() {
            try {
                const snap = await getDocs(query(collection(db, 'parts'), where('IsLatestRevision', '==', true)));
                const list = [];
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (!isEdit || data.PartID !== initialData?.PartID) {
                        list.push({ PartID: data.PartID, Name: data.Name });
                    }
                });
                setAvailableParts(list);
            } catch (err) {
                console.error("Failed to load parts for substitutes:", err);
            }
        }
        
        async function loadQaSettings() {
            if (isEdit && initialData?.id) {
                try {
                    const qaDoc = await getDoc(doc(db, 'qa_target_parts', initialData.id));
                    if (qaDoc.exists()) {
                        const data = qaDoc.data();
                        setQaSettings({
                            isTarget: true,
                            useDocument: data.useDocument || false,
                            inspectionItems: data.inspectionItems || []
                        });
                    }
                } catch (e) {
                    console.error("Failed to load QA settings:", e);
                }
            }
        }

        loadPartsForSubs();
        loadQaSettings();
        fetchCustomFields();

        if (isEdit && initialData) {
            setFormData(prev => ({
                ...prev,
                ...initialData,
                Safety: { CE: false, ROHS: false, UL: false, KC: false, REACH: false, ...(initialData.Safety || {}) },
                SafetyLinks: { CE: '', ROHS: '', UL: '', KC: '', REACH: '', ...(initialData.SafetyLinks || {}) },
                CustomData: initialData.CustomData || {}
            }));
            setCustomData(initialData.CustomData || {});
            
            // Initialize visible fields based on existing values
            const initialVisible = [];
            if (initialData.Material) initialVisible.push('Material');
            if (initialData.Grade) initialVisible.push('Grade');
            if (initialData.Color) initialVisible.push('Color');
            if (initialData.CustomData) {
                Object.entries(initialData.CustomData).forEach(([key, val]) => {
                    if (val !== undefined && val !== null && val !== '') {
                        initialVisible.push(key);
                    }
                });
            }
            setVisibleFields(initialVisible);
        }
        fetchOptions();
    }, [isEdit, initialData]);

    const fetchCustomFields = async () => {
        try {
            const fields = await getCustomFields('parts');
            setCustomFields(fields);
        } catch (err) {
            console.error("Failed to load custom fields:", err);
        }
    };

    const handleAddCustomField = async () => {
        if (!newFieldForm.label.trim()) return;
        try {
            await createCustomField('parts', newFieldForm);
            setNewFieldForm({ label: '', fieldType: 'text' });
            setIsAddingField(false);
            fetchCustomFields();
        } catch (err) {
            alert("필드 추가에 실패했습니다.");
        }
    };

    const handleDeactivateField = async (fieldId) => {
        if (!window.confirm("이 항목을 삭제하시겠습니까? (기존 데이터는 보존됩니다)")) return;
        try {
            await deactivateCustomField(fieldId);
            fetchCustomFields();
        } catch (err) {
            alert("필드 삭제에 실패했습니다.");
        }
    };

    const toggleFieldVisibility = (fieldLabel) => {
        if (visibleFields.includes(fieldLabel)) {
            if (!window.confirm(`'${fieldLabel}' 항목을 화면에서 숨기시겠습니까? (입력된 값은 초기화됩니다)`)) return;
            setVisibleFields(prev => prev.filter(f => f !== fieldLabel));
            
            // Clear values
            if (['Material', 'Grade', 'Color'].includes(fieldLabel)) {
                setFormData(prev => ({ ...prev, [fieldLabel]: '' }));
            } else if (fieldLabel === 'Substitute') {
                setFormData(prev => ({ ...prev, SubstitutePartIDs: [] }));
            } else {
                setCustomData(prev => {
                    const next = { ...prev };
                    delete next[fieldLabel];
                    return next;
                });
                setFormData(prev => {
                    const nextCustomData = { ...prev.CustomData };
                    delete nextCustomData[fieldLabel];
                    return { ...prev, CustomData: nextCustomData };
                });
            }
        } else {
            setVisibleFields(prev => [...prev, fieldLabel]);
            setShowAddFieldMenu(false);
        }
    };

    const handleCustomDataChange = (fieldLabel, value) => {
        setCustomData(prev => ({ ...prev, [fieldLabel]: value }));
        setFormData(prev => ({
            ...prev,
            CustomData: { ...prev.CustomData, [fieldLabel]: value }
        }));
    };

    const fetchOptions = async () => {
        try {
            const snap = await getDocs(collection(db, 'metadata'));
            const mechaOptions = snap.docs.find(d => d.id === 'mecha_options');
            if (mechaOptions) setOptions(mechaOptions.data());
        } catch (e) {
            console.error("Error fetching mecha options:", e);
        }
    };

    const handleAddOption = async (field) => {
        const val = newInputs[field];
        if (!val) return;
        const updated = { ...options, [field + 's']: [...(options[field + 's'] || []), val] };
        setOptions(updated);
        try {
            await updateDoc(doc(db, 'metadata', 'mecha_options'), updated);
        } catch (e) {
            console.error("Failed to update options", e);
        }
        setFormData(prev => ({ ...prev, [field.charAt(0).toUpperCase() + field.slice(1)]: val }));
        setNewInputs(prev => ({ ...prev, [field]: '' }));
        setShowAddInputs(prev => ({ ...prev, [field]: false }));
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox' && name.startsWith('safety_')) {
            const key = name.split('_')[1];
            setFormData(prev => ({ ...prev, Safety: { ...prev.Safety, [key]: checked } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const toggleSubstitute = (partId) => {
        setFormData(prev => {
            const subs = prev.SubstitutePartIDs || [];
            return { ...prev, SubstitutePartIDs: subs.includes(partId) ? subs.filter(id => id !== partId) : [...subs, partId] };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isEdit) {
            const changes = [];
            const fieldsToWatch = [
                'Name', 'Category', 'Class', 'PartTypeCode', 'Spec', 'Unit', 'Rev', 
                'Manufacturer', 'MPN', 'MFN', 'Maker', 'Owner', 'UnitPrice', 'Currency', 
                'LeadTime', 'IsOverseas', 'Description', 'Datasheet', 'Image', 'ProcessType', 'Material', 
                'Grade', 'Color', 'Lifecycle', 'Supplier', 'SubstitutePartIDs', 'Safety', 'SafetyLinks'
            ];
            fieldsToWatch.forEach(field => {
                let oldVal = initialData[field];
                let newVal = formData[field];

                if (Array.isArray(oldVal) || Array.isArray(newVal)) {
                    const oldStr = (oldVal || []).sort().join(',');
                    const newStr = (newVal || []).sort().join(',');
                    if (oldStr !== newStr) {
                        changes.push(`${field}: ${(oldVal || []).length} items -> ${(newVal || []).length} items`);
                    }
                } else if (String(oldVal || '') !== String(newVal || '')) {
                    changes.push(`${field}: ${oldVal || 'None'} -> ${newVal || 'None'}`);
                }
            });

            if (isRevisionUp) {
                const nextRev = getNextRevision(formData.Rev);
                changes.push(`[REVISION UP] ${formData.Rev} -> ${nextRev}`);
            }

            setDetectedChanges(changes);
            setIsSaveModalOpen(true);
        } else {
            handleFinalSubmit();
        }
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        try {
            if (isEdit) {
                const batch = writeBatch(db);
                const partRef = doc(db, 'parts', initialData.id);
                const qaRef = doc(db, 'qa_target_parts', initialData.id);

                if (isRevisionUp) {
                    const newRev = getNextRevision(formData.Rev);
                    const newPartID = formData.PartID; 

                    const newPartData = { 
                        ...formData, 
                        PartID: newPartID,
                        Rev: newRev, 
                        IsLatestRevision: true, 
                        CreatedAt: new Date().toISOString() 
                    };
                    delete newPartData.id;
                    batch.set(doc(db, 'parts', newPartID), newPartData);
                    batch.update(partRef, { IsLatestRevision: false });
                    
                    // QA Settings Sync
                    if (qaSettings.isTarget) {
                        batch.set(qaRef, {
                            partId: newPartID,
                            partName: formData.Name,
                            spec: formData.Spec || '',
                            useDocument: qaSettings.useDocument,
                            inspectionItems: qaSettings.inspectionItems,
                            updatedAt: new Date()
                        });
                    } else {
                        batch.delete(qaRef);
                    }
                    
                    await batch.commit();
                } else {
                    batch.update(partRef, formData);
                    
                    // QA Settings Sync
                    if (qaSettings.isTarget) {
                        batch.set(qaRef, {
                            partId: initialData.PartID,
                            partName: formData.Name,
                            spec: formData.Spec || '',
                            useDocument: qaSettings.useDocument,
                            inspectionItems: qaSettings.inspectionItems,
                            updatedAt: new Date()
                        });
                    } else {
                        batch.delete(qaRef);
                    }
                    
                    await batch.commit();
                }
                // 공급사/제조사 자동 등록 (편집 후)
                try { await autoRegisterFromPart(formData); } catch (e) { console.warn('[AutoReg] 공급사/제조사 자동 등록 오류(무시):', e); }
            } else {
                // RUN TRANSACTION FOR SAFE AUTO-ID GENERATION (CONCURRENCY LOCK)
                const { runTransaction } = await import('firebase/firestore');
                await runTransaction(db, async (transaction) => {
                    const catCode = formData.Category.match(/\((.*?)\)/)?.[1] || 'M';
                    const classCode = formData.Class.match(/\((.*?)\)/)?.[1] || 'I';
                    const typeCode = formData.PartTypeCode || 'A';
                    const prefix = `IR${catCode}${classCode}${typeCode}`;

                    const counterRef = doc(db, 'metadata', 'part_counters');
                    const counterSnap = await transaction.get(counterRef);
                    
                    let nextSeqNum = 1;
                    let countersData = {};

                    if (counterSnap.exists()) {
                        countersData = counterSnap.data();
                        if (countersData[prefix]) {
                            nextSeqNum = countersData[prefix] + 1;
                        } else {
                            // If prefix not in counters, fallback to query once to initialize
                            const partsRef = collection(db, 'parts');
                            const q = query(
                                partsRef,
                                where('PartID', '>=', prefix),
                                where('PartID', '<=', prefix + '\uf8ff')
                            );
                            const querySnap = await getDocs(q);
                            let maxSeq = 0;
                            querySnap.forEach(docSnap => {
                                const pid = docSnap.data().PartID;
                                if (pid && pid.startsWith(prefix)) {
                                    const masterID = pid.split('-')[0];
                                    const seqStr = masterID.slice(prefix.length);
                                    const seq = parseInt(seqStr, 10);
                                    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                                }
                            });
                            nextSeqNum = maxSeq + 1;
                        }
                    } else {
                        // If counter doc doesn't exist at all, fallback to query once
                        const partsRef = collection(db, 'parts');
                        const q = query(
                            partsRef,
                            where('PartID', '>=', prefix),
                            where('PartID', '<=', prefix + '\uf8ff')
                        );
                        const querySnap = await getDocs(q);
                        let maxSeq = 0;
                        querySnap.forEach(docSnap => {
                            const pid = docSnap.data().PartID;
                            if (pid && pid.startsWith(prefix)) {
                                const masterID = pid.split('-')[0];
                                const seqStr = masterID.slice(prefix.length);
                                const seq = parseInt(seqStr, 10);
                                if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
                            }
                        });
                        nextSeqNum = maxSeq + 1;
                    }

                    const nextSeq = nextSeqNum.toString().padStart(4, '0');
                    const newPartID = `${prefix}${nextSeq}`; // 리비전을 덧붙이지 않음

                    // Create new document docRef with explicit PartID
                    const newDocRef = doc(db, 'parts', newPartID);
                    const finalPartData = {
                        ...formData,
                        PartID: newPartID,
                        MasterPartID: newPartID,
                        CreatedAt: new Date().toISOString()
                    };
                    
                    transaction.set(newDocRef, finalPartData);
                    transaction.set(counterRef, { ...countersData, [prefix]: nextSeqNum }, { merge: true });

                    // QA Settings Sync (New Part)
                    if (qaSettings.isTarget) {
                        const qaRef = doc(db, 'qa_target_parts', newPartID);
                        transaction.set(qaRef, {
                            partId: newPartID,
                            partName: formData.Name,
                            spec: formData.Spec || '',
                            useDocument: qaSettings.useDocument,
                            inspectionItems: qaSettings.inspectionItems,
                            updatedAt: new Date()
                        });
                    }
                });
                // 공급사/제조사 자동 등록 (신규 등록 후)
                try { await autoRegisterFromPart(formData); } catch (e) { console.warn('[AutoReg] 공급사/제조사 자동 등록 오류(무시):', e); }
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Save failed:", error);
            alert("저장 실패: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredSubs = availableParts.filter(p => p.Name.toLowerCase().includes(substituteSearch.toLowerCase()) || p.PartID.toLowerCase().includes(substituteSearch.toLowerCase()));

    const renderCustomFieldInput = (field) => {
        const val = customData[field.label] || '';
        const commonClass = "flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[13px] font-bold text-slate-800 outline-none hover:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 shadow-sm transition-all";
        if (field.fieldType === 'checkbox') {
            return (
                <div className="flex-1 flex items-center gap-2 h-10 px-1">
                    <input type="checkbox" checked={!!val} onChange={(e) => handleCustomDataChange(field.label, e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-500">Enabled</span>
                </div>
            );
        }
        if (field.fieldType === 'memo') return <textarea value={val} onChange={(e) => handleCustomDataChange(field.label, e.target.value)} className={commonClass + " h-20 resize-none"} placeholder={`${field.label} 내용을 입력하세요...`} />;
        return <input type={field.fieldType === 'number' ? 'number' : 'text'} value={val} onChange={(e) => handleCustomDataChange(field.label, e.target.value)} className={commonClass} placeholder={`${field.label} 입력...`} />;
    };

    const sectionTitleClass = "text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2 mb-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100";
    const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 w-28 flex-shrink-0";
    const inputClass = "flex-1 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-[13px] font-bold text-slate-800 outline-none hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm max-w-[280px]";

    const renderDynamicField = (label) => {
        const isSpec = ['Material', 'Grade', 'Color'].includes(label);
        const isSubstitute = label === 'Substitute';
        const commonWrapperClass = "flex items-center gap-1 animate-in slide-in-from-left-2 group";
        
        if (isSubstitute) {
            return (
                <div key={label} className="flex flex-col gap-1 animate-in slide-in-from-left-2 group bg-white/40 p-2 rounded-2xl border border-slate-100/50">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                            <LinkIcon size={12} className="text-indigo-500"/>
                            <label className={labelClass}>Substitute Parts</label>
                        </div>
                        <button type="button" onClick={() => toggleFieldVisibility(label)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        {/* Selected Tags */}
                        {formData.SubstitutePartIDs?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 p-1.5 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                                {formData.SubstitutePartIDs.map(id => {
                                    const part = availableParts.find(p => p.PartID === id);
                                    return (
                                        <div key={id} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-indigo-200 rounded-lg shadow-sm">
                                            <span className="text-[10px] font-black text-indigo-600">{id}</span>
                                            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{part?.Name}</span>
                                            <button type="button" onClick={() => toggleSubstitute(id)} className="hover:text-rose-500 transition-colors"><X size={10}/></button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        {/* Search & Results */}
                        <div className="relative">
                            <input 
                                value={substituteSearch} 
                                onChange={(e) => setSubstituteSearch(e.target.value)} 
                                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-[12px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner"
                                placeholder="Search parts by ID or Name..."
                            />
                            {substituteSearch && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl z-20 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                    {filteredSubs.length > 0 ? filteredSubs.map(p => (
                                        <button
                                            key={p.PartID}
                                            type="button"
                                            onClick={() => { toggleSubstitute(p.PartID); setSubstituteSearch(''); }}
                                            className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold flex items-center justify-between hover:bg-indigo-50 transition-all ${formData.SubstitutePartIDs?.includes(p.PartID) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-black text-[10px] tracking-tight">{p.PartID}</span>
                                                <span className="opacity-70">{p.Name}</span>
                                            </div>
                                            {formData.SubstitutePartIDs?.includes(p.PartID) && <CheckCircle2 size={14} className="text-indigo-600"/>}
                                        </button>
                                    )) : (
                                        <div className="p-3 text-center text-[10px] font-bold text-slate-400">No parts found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        if (isSpec) {
            const field = label.toLowerCase();
            const fieldUpper = label;
            return (
                <div key={label} className={commonWrapperClass}>
                    <div className="flex items-center gap-1 flex-1 max-w-[392px]">
                        <label className={labelClass}>{label}</label>
                        {!showAddInputs[field] ? (
                            <select name={fieldUpper} value={formData[fieldUpper]} onChange={handleChange} className={inputClass}>
                                <option value="">Select</option>
                                {options[field + 's']?.map(o => <option key={o} value={o}>{o}</option>)}
                                <option value="ADD_NEW" className="text-blue-500 font-black">+ Add Option...</option>
                            </select>
                        ) : (
                            <div className="flex-1 flex gap-1 animate-in zoom-in-95">
                                <input value={newInputs[field]} onChange={(e) => setNewInputs(p => ({ ...p, [field]: e.target.value }))} className="flex-1 bg-blue-50 border border-blue-200 rounded-lg px-2 text-xs font-bold" autoFocus />
                                <button type="button" onClick={() => handleAddOption(field)} className="px-2 bg-blue-600 text-white rounded-lg"><CheckCircle2 size={16} /></button>
                                <button type="button" onClick={() => setShowAddInputs(p => ({ ...p, [field]: false }))} className="px-2 bg-slate-200 text-slate-500 rounded-lg"><X size={16} /></button>
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={() => toggleFieldVisibility(label)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                </div>
            );
        } else {
            const fieldDef = customFields.find(f => f.label === label);
            if (!fieldDef) return null;
            return (
                <div key={fieldDef.id} className={`${commonWrapperClass} ${fieldDef.fieldType === 'memo' ? 'items-start' : 'items-center'}`}>
                    <div className="w-28 flex-shrink-0 flex items-center gap-1">
                        {fieldDef.fieldType === 'checkbox' ? <CheckSquare size={12}/> : fieldDef.fieldType === 'memo' ? <MessageSquare size={12}/> : <Tag size={12}/>}
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{fieldDef.label}</label>
                    </div>
                    <div className="flex-1 flex items-center gap-1 max-w-[392px]">
                        {renderCustomFieldInput(fieldDef)}
                        <button type="button" onClick={() => toggleFieldVisibility(label)} className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                    </div>
                </div>
            );
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[1000] flex items-center justify-center p-4 overflow-hidden">
            <div className="bg-white rounded-[2rem] w-full max-w-6xl max-h-[95vh] shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 border border-white/20">
                {/* Header */}
                <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-900 rounded-xl shadow-xl shadow-slate-200">
                            <FileText className="text-white" size={18} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tighter">{isEdit ? 'Edit Part Profile' : 'Register New Part'}</h2>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-0.5">Master Data Management System</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {isEdit && (
                            <div className="px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100">
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">Rev: {formData.Rev}</span>
                            </div>
                        )}
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"><X size={20} /></button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {/* Primary Info: Basic Identification, Manufacturing, and Custom Fields */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        {/* Section 1: Identification */}
                        <div className="bg-slate-50/50 p-3 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-1">
                            <h3 className={sectionTitleClass}><Database size={14} className="text-indigo-500" /> Basic Identification</h3>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Part ID</label>
                                    <input 
                                        name="PartID" 
                                        value={isEdit ? formData.PartID : partIdPreview} 
                                        readOnly 
                                        className={inputClass + " bg-indigo-50/30 text-indigo-650 cursor-not-allowed font-mono font-black tracking-tight border-indigo-200/50"} 
                                        placeholder="Auto-generated PartID" 
                                    />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Part Name (Official)</label>
                                    <input name="Name" value={formData.Name} onChange={handleChange} required className={inputClass} placeholder="Enter full part name" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Status / Lifecycle</label>
                                    <div className="flex-1 relative max-w-[280px]">
                                        <select 
                                            name="Lifecycle" 
                                            value={formData.Lifecycle} 
                                            onChange={handleChange} 
                                            disabled={['Active', 'Obsolete', 'ECN Pending', 'ECN'].includes(formData.Lifecycle)}
                                            className={`${inputClass} w-full pl-7 disabled:opacity-85 disabled:cursor-not-allowed ${
                                                formData.Lifecycle === 'Obsolete' ? 'bg-red-50 border-red-200 text-red-600' :
                                                formData.Lifecycle === 'Draft' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                                formData.Lifecycle === 'Active' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                                                formData.Lifecycle === 'RND' ? 'bg-purple-50 border-purple-200 text-purple-600' :
                                                (formData.Lifecycle === 'ECN Pending' || formData.Lifecycle === 'ECN') ? 'bg-blue-50 border-blue-200 text-blue-600' :
                                                'bg-white'
                                            }`}
                                        >
                                            {['Active', 'Obsolete', 'ECN Pending', 'ECN'].includes(formData.Lifecycle) ? (
                                                <>
                                                    {formData.Lifecycle === 'Active' && <option value="Active">Active (승인완료/양산)</option>}
                                                    {formData.Lifecycle === 'Obsolete' && <option value="Obsolete">Obsolete (폐기/단종)</option>}
                                                    {formData.Lifecycle === 'ECN Pending' && <option value="ECN Pending">ECN Pending (설계변경/수정중)</option>}
                                                    {formData.Lifecycle === 'ECN' && <option value="ECN">ECN (설계변경 진행중)</option>}
                                                </>
                                            ) : (
                                                <>
                                                    <option value="Draft">Draft (대기/개발중)</option>
                                                    <option value="RND">RND (연구소용)</option>
                                                </>
                                            )}
                                        </select>
                                        <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                                            formData.Lifecycle === 'Obsolete' ? 'bg-red-500' :
                                            formData.Lifecycle === 'Draft' ? 'bg-orange-500' :
                                            formData.Lifecycle === 'Active' ? 'bg-emerald-500' :
                                            formData.Lifecycle === 'RND' ? 'bg-purple-500' :
                                            (formData.Lifecycle === 'ECN Pending' || formData.Lifecycle === 'ECN') ? 'bg-blue-500' :
                                            'bg-slate-300'
                                        }`} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Category</label>
                                    <select name="Category" value={formData.Category} onChange={handleChange} className={inputClass}>
                                        <option>기구부품 (M)</option>
                                        <option>전자부품 (E)</option>
                                        <option>구매품 (O)</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Classification</label>
                                    <select name="Class" value={formData.Class} onChange={handleChange} disabled className={`${inputClass} bg-slate-50 text-slate-500 cursor-not-allowed`}>
                                        <option value="Part (I)">Part (I)</option>
                                        <option value="Assembly (A)">Assembly (A)</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Part Type</label>
                                    <select name="PartTypeCode" value={formData.PartTypeCode} onChange={handleChange} className={inputClass}>
                                        {PART_TYPES.map(t => (
                                            <option key={t.code} value={t.code}>{t.label} ({t.code})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Base Unit</label>
                                    <select name="Unit" value={formData.Unit} onChange={handleChange} className={inputClass}>
                                        <option>EA</option><option>SET</option><option>M</option><option>KG</option><option>L</option><option>MM</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Revision</label>
                                    <input name="Rev" value={formData.Rev} onChange={handleChange} className={inputClass} placeholder="1.0" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>담당 부서</label>
                                    <select name="Owner" value={formData.Owner} onChange={handleChange} className={inputClass}>
                                        <option value="">부서 선택</option>
                                        <option value="회로">회로</option>
                                        <option value="기구">기구</option>
                                        <option value="HW">HW</option>
                                        <option value="구매">구매</option>
                                        <option value="QA">QA</option>
                                        <option value="공통">공통</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Manufacturing & Sourcing */}
                        <div className="bg-slate-50/50 p-3 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-1">
                            <h3 className={sectionTitleClass}><Truck size={14} className="text-amber-500" /> Manufacturing & Sourcing</h3>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Manufacturer</label>
                                    <input name="Manufacturer" value={formData.Manufacturer} onChange={handleChange} className={inputClass} placeholder="제조사명" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>공급사</label>
                                    <input name="Maker" value={formData.Maker} onChange={handleChange} className={inputClass} placeholder="공급사 입력" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>MPN (Part No.)</label>
                                    <input name="MPN" value={formData.MPN} onChange={handleChange} className={inputClass} placeholder="제조사 품번" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>MFN (Model No.)</label>
                                    <input name="MFN" value={formData.MFN} onChange={handleChange} className={inputClass} placeholder="모델 번호" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Supplier</label>
                                    <input name="Supplier" value={formData.Supplier} onChange={handleChange} className={inputClass} placeholder="공급사" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Estimated Unit Price</label>
                                    <div className="flex-1 flex gap-2">
                                        <select name="Currency" value={formData.Currency} onChange={handleChange} className="w-20 bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-black text-slate-700 outline-none flex-none">
                                            <option>KRW</option><option>USD</option><option>EUR</option><option>JPY</option><option>CNY</option>
                                        </select>
                                        <input name="UnitPrice" value={formData.UnitPrice} onChange={handleChange} className="flex-1 bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none hover:border-indigo-300 transition-all shadow-sm max-w-[120px]" placeholder="0" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 mt-2">
                                    <label className={labelClass}>해외 수입품 (Overseas)</label>
                                    <div className="flex-1 flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                name="IsOverseas" 
                                                checked={formData.IsOverseas || false} 
                                                onChange={e => setFormData(prev => ({...prev, IsOverseas: e.target.checked}))}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" 
                                            />
                                            <span className="text-[10px] font-bold text-slate-600">수입 자재 여부</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Lead Time (Days)</label>
                                    <div className="flex-1 flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            name="LeadTime" 
                                            value={formData.LeadTime} 
                                            onChange={handleChange} 
                                            className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-slate-700 outline-none hover:border-indigo-300 transition-all shadow-sm max-w-[120px]" 
                                            placeholder="0" 
                                        />
                                        <span className="text-[10px] font-bold text-slate-400">일 (Days)</span>
                                    </div>
                                </div>
                                 {/* Compliance Certs UI Refined */}
                                 <div className="mt-1 p-2 bg-white/50 rounded-2xl border border-slate-100 flex flex-col gap-2">
                                     <label className={labelClass}>Compliance Certs</label>
                                     <div className="grid grid-cols-3 gap-1.5">
                                         {[
                                             { id: 'CE', label: 'CE', active: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-200', inactive: 'bg-slate-100 text-slate-400' },
                                             { id: 'ROHS', label: 'RoHS', active: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-200', inactive: 'bg-slate-100 text-slate-400' },
                                             { id: 'UL', label: 'UL', active: 'bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-rose-200', inactive: 'bg-slate-100 text-slate-400' },
                                             { id: 'KC', label: 'KC', active: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-200', inactive: 'bg-slate-100 text-slate-400' },
                                             { id: 'REACH', label: 'REACH', active: 'bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-teal-200', inactive: 'bg-slate-100 text-slate-400' }
                                         ].map(cert => (
                                             <button
                                                 key={cert.id}
                                                 type="button"
                                                 onClick={() => {
                                                     setFormData(prev => ({
                                                         ...prev,
                                                         Safety: { ...prev.Safety, [cert.id]: !prev.Safety[cert.id] }
                                                     }));
                                                 }}
                                                 className={`py-1.5 px-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center border border-transparent shadow-sm hover:scale-[1.02] active:scale-95 ${
                                                     formData.Safety[cert.id] ? cert.active : cert.inactive
                                                 }`}
                                             >
                                                 {cert.label}
                                             </button>
                                         ))}
                                     </div>
                                     
                                     {/* Certification and Material Sheet Link Inputs */}
                                     {Object.keys(formData.Safety || {}).some(key => formData.Safety[key]) && (
                                         <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-left">
                                             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">인증서 / 물성시트 링크 (URL)</span>
                                             {Object.entries(formData.Safety || {}).map(([key, isActive]) => {
                                                 if (!isActive) return null;
                                                 const label = key === 'ROHS' ? 'RoHS' : key;
                                                 return (
                                                     <div key={key} className="flex items-center gap-1.5">
                                                         <span className="text-[9px] font-black text-slate-500 w-12 shrink-0">{label}</span>
                                                         <input 
                                                             type="text" 
                                                             value={formData.SafetyLinks?.[key] || ''} 
                                                             onChange={(e) => {
                                                                 const val = e.target.value;
                                                                 setFormData(prev => ({
                                                                     ...prev,
                                                                     SafetyLinks: {
                                                                         ...(prev.SafetyLinks || {}),
                                                                         [key]: val
                                                                     }
                                                                 }));
                                                             }}
                                                             placeholder="인증서 또는 물성시트 링크 URL"
                                                             className="flex-1 bg-white border border-slate-200 rounded-lg py-1 px-2 text-[11px] font-bold text-slate-700 outline-none hover:border-indigo-300 focus:ring-1 focus:ring-indigo-500 shadow-sm"
                                                         />
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     )}
                                 </div>
                            </div>
                        </div>

                        {/* Section 4: Additional Specs & Custom Items */}
                        <div className="bg-slate-50/50 p-3 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className={sectionTitleClass}><PenTool size={14} className="text-rose-500" /> Additional Specs</h3>
                                <div className="relative">
                                    <button type="button" onClick={() => setShowAddFieldMenu(!showAddFieldMenu)} className="flex items-center gap-1 px-2 py-1 bg-white text-indigo-600 border border-indigo-200 rounded-xl text-[10px] font-black hover:bg-indigo-50 transition-all shadow-sm">
                                        <Plus size={10} /> Add
                                    </button>
                                    {showAddFieldMenu && (
                                        <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl z-10 py-2 animate-in fade-in zoom-in-95 overflow-hidden">
                                            <div className="px-3 py-1 border-b border-slate-50">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">사용 가능한 필드</span>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                {[
                                                    { label: 'Material', type: 'spec' },
                                                    { label: 'Grade', type: 'spec' },
                                                    { label: 'Color', type: 'spec' },
                                                    { label: 'Substitute', type: 'spec' },
                                                    ...customFields.map(f => ({ label: f.label, type: 'custom' }))
                                                ].filter(item => !visibleFields.includes(item.label)).map(item => (
                                                    <button key={item.label} type="button" onClick={() => toggleFieldVisibility(item.label)} className="w-full text-left px-4 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                                                        {item.label}
                                                    </button>
                                                ))}
                                                <div className="border-t border-slate-50 mt-1 pt-1">
                                                    <button type="button" onClick={() => { setIsAddingField(true); setShowAddFieldMenu(false); }} className="w-full text-left px-4 py-1.5 text-[10px] font-black text-indigo-500 hover:bg-indigo-50 transition-all flex items-center gap-2">
                                                        <Settings2 size={12} /> 새로운 필드 정의...
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isAddingField && (
                                <div className="bg-white border border-indigo-100 rounded-2xl p-3 flex flex-col gap-2 animate-in slide-in-from-top-2 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <label className={labelClass}>필드 이름</label>
                                        <input placeholder="예: 시리얼 번호" value={newFieldForm.label} onChange={(e) => setNewFieldForm(prev => ({ ...prev, label: e.target.value }))} className={inputClass} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className={labelClass}>데이터 타입</label>
                                        <select value={newFieldForm.fieldType} onChange={(e) => setNewFieldForm(prev => ({ ...prev, fieldType: e.target.value }))} className={inputClass}>
                                            <option value="text">텍스트</option><option value="number">숫자</option><option value="checkbox">체크박스</option><option value="date">날짜</option><option value="memo">메모</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-1">
                                        <button type="button" onClick={() => setIsAddingField(false)} className="px-3 py-1.5 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black">취소</button>
                                        <button type="button" onClick={handleAddCustomField} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black shadow-lg hover:bg-indigo-700 transition-all">생성</button>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                    <label className={labelClass}>Process Type</label>
                                    <select name="ProcessType" value={formData.ProcessType} onChange={handleChange} className="flex-1 bg-indigo-50/50 border border-indigo-100 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-700 outline-none hover:bg-indigo-100 transition-all max-w-[280px]">
                                        <option>가공</option><option>구매</option><option>조립</option><option>외주</option>
                                    </select>
                                </div>
                                
                                {visibleFields.map(label => renderDynamicField(label))}
                            </div>
                        </div>
                    </div>

                    {/* Section 5: QA & Quality Standards */}
                    <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className={sectionTitleClass}><ShieldCheck size={14} className="text-teal-600" /> QA & Quality Standards (수입검사 기준)</h3>
                            <button 
                                type="button" 
                                onClick={() => setQaSettings(p => ({ ...p, isTarget: !p.isTarget }))}
                                className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all border ${qaSettings.isTarget ? 'bg-teal-600 border-teal-600 text-white shadow-lg shadow-teal-100' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                            >
                                {qaSettings.isTarget ? '✓ 수입검사 대상 품목' : '수입검사 미대상'}
                            </button>
                        </div>

                        {qaSettings.isTarget && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                {/* Doc Replacement Toggle */}
                                <div className="lg:col-span-2">
                                    <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:bg-teal-50/30 transition-all group">
                                        <input 
                                            type="checkbox" 
                                            checked={qaSettings.useDocument}
                                            onChange={e => setQaSettings(p => ({ ...p, useDocument: e.target.checked }))}
                                            className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-slate-800 group-hover:text-teal-600 transition-colors">도면 또는 Datasheet/Specsheet로 대체</span>
                                            <span className="text-[9px] font-bold text-slate-400">개별 검사 항목 대신 첨부된 문서를 기준으로 검사합니다.</span>
                                        </div>
                                    </label>
                                </div>

                                {!qaSettings.useDocument && (
                                    <div className="lg:col-span-2 space-y-3">
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">세부 검사항목 및 기준값</span>
                                            <button 
                                                type="button" 
                                                onClick={() => setQaSettings(p => ({ ...p, inspectionItems: [...p.inspectionItems, { id: Date.now(), name: '', standard: '' }] }))}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-white border border-teal-200 text-teal-600 rounded-lg text-[10px] font-black hover:bg-teal-50 transition-all"
                                            >
                                                <Plus size={12} /> 항목 추가
                                            </button>
                                        </div>

                                        {qaSettings.inspectionItems.length === 0 ? (
                                            <div className="py-8 bg-white border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-350">
                                                <ClipboardList size={24} className="mb-2 opacity-30" />
                                                <p className="text-[10px] font-bold">등록된 검사 항목이 없습니다.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {qaSettings.inspectionItems.map(item => (
                                                    <div key={item.id} className="flex gap-2 animate-in slide-in-from-left-1">
                                                        <div className="flex-1 grid grid-cols-2 gap-2 bg-white border border-slate-200 p-2 rounded-xl">
                                                            <input 
                                                                type="text" 
                                                                placeholder="검사항목 (예: 외관)" 
                                                                value={item.name}
                                                                onChange={e => setQaSettings(p => ({ ...p, inspectionItems: p.inspectionItems.map(i => i.id === item.id ? { ...i, name: e.target.value } : i) }))}
                                                                className="w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                                                            />
                                                            <input 
                                                                type="text" 
                                                                placeholder="기준값 (예: 스크래치 없을 것)" 
                                                                value={item.standard}
                                                                onChange={e => setQaSettings(p => ({ ...p, inspectionItems: p.inspectionItems.map(i => i.id === item.id ? { ...i, standard: e.target.value } : i) }))}
                                                                className="w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none border-l border-slate-100 pl-2"
                                                            />
                                                        </div>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setQaSettings(p => ({ ...p, inspectionItems: p.inspectionItems.filter(i => i.id !== item.id) }))}
                                                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section 6: Documentation & Notes */}
                    <div className="bg-slate-50/50 p-3 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                        <h3 className={sectionTitleClass}><ClipboardList size={14} className="text-slate-500" /> Documentation & Extended Info</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-2">
                            <div className="flex items-start gap-1">
                                <label className={labelClass}>Detailed Specs</label>
                                <textarea name="Spec" value={formData.Spec} onChange={handleChange} className={inputClass + " h-16 resize-none flex-1 !max-w-none"} placeholder="상세 사양 또는 특성 정보를 입력하세요" />
                            </div>
                            <div className="flex items-start gap-1">
                                <label className={labelClass}>Description</label>
                                <textarea name="Description" value={formData.Description} onChange={handleChange} className={inputClass + " h-16 resize-none flex-1 !max-w-none"} placeholder="기타 비고 및 참고사항" />
                            </div>
                            <div className="flex items-center gap-1">
                                <label className={labelClass}><LinkIcon size={10} className="inline mr-1"/> Datasheet URL</label>
                                <input name="Datasheet" value={formData.Datasheet} onChange={handleChange} className={inputClass + " flex-1 !max-w-none"} placeholder="https://..." />
                            </div>
                            <div className="flex items-center gap-1">
                                <label className={labelClass}><LinkIcon size={10} className="inline mr-1"/> Image URL</label>
                                <input name="Image" value={formData.Image} onChange={handleChange} className={inputClass + " flex-1 !max-w-none"} placeholder="https://..." />
                            </div>
                        </div>
                    </div>

                    {/* Revision Control */}
                    {isEdit && (
                        <div className="p-3 bg-rose-50/30 rounded-2xl border border-rose-100">
                            <label className="flex items-center gap-3 group cursor-pointer">
                                <input type="checkbox" checked={isRevisionUp} onChange={e => setIsRevisionUp(e.target.checked)} className="w-5 h-5 rounded border-2 border-slate-300 text-rose-600 focus:ring-rose-500/20 transition-all" />
                                <div className="flex flex-col">
                                    <span className="text-[12px] font-black text-slate-800 group-hover:text-rose-600 transition-colors">Generate New Revision (Minor Up)</span>
                                    <span className="text-[9px] font-bold text-slate-400">Current version will be archived. New version: {getNextRevision(formData.Rev)}.</span>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Form Submission Footer */}
                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-6 py-2 bg-white border border-slate-200 text-slate-500 font-black text-xs rounded-xl hover:bg-slate-50 transition-all uppercase tracking-[0.2em]">Discard</button>
                        <button type="submit" disabled={isSubmitting} className="px-10 py-2 bg-slate-900 text-white font-black text-xs rounded-xl shadow-xl shadow-slate-300 hover:bg-black transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50">
                            {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} 
                            {isEdit ? 'Submit Changes' : 'Register Master Part'}
                        </button>
                    </div>
                </form>

                {isSaveModalOpen && <BOMSaveModal isOpen={true} onSave={handleFinalSubmit} onClose={() => setIsSaveModalOpen(false)} changes={detectedChanges} title="Metadata Update" subTitle="Audit Log & Revision History" />}
            </div>
        </div>,
        document.body
    );
}
