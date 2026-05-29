import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Plus, Trash2, Save, AlertCircle, Copy, ChevronDown, ChevronRight, CheckCircle2, LayoutGrid, List, Link } from 'lucide-react';

const DEFAULT_ROW = {
    Name: '',
    Owner: '',
    Category: '기구부품 (M)',
    Class: 'Part (I)',
    PartTypeCode: 'X',
    Spec: '',
    Unit: 'EA',
    Manufacturer: '',
    MPN: '',
    MFN: '',
    UnitPrice: 0,
    Currency: 'KRW',
    Description: '',
    Material: '',
    Grade: '',
    Color: '',
    ProcessType: '가공',
    Datasheet: '',
    Image: '',
    Safety: { CE: false, ROHS: false, UL: false, KC: false }
};

export default function BulkPartImportModal({ onClose, onSuccess }) {
    const [rows, setRows] = useState([{ ...DEFAULT_ROW, id: Date.now() }]);
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [viewMode, setViewMode] = useState('accordion'); // 'accordion' or 'grid'
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [showLinkInputs, setShowLinkInputs] = useState({}); // Track which rows have link inputs visible
    const listRef = useRef(null);

    // Combobox options
    const [manufacturers, setManufacturers] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [colors, setColors] = useState([]);
    const [addingNew, setAddingNew] = useState({}); // Track which fields are in "add new" mode

    // Load manufacturers, materials, and colors from Firestore
    useEffect(() => {
        async function loadOptions() {
            try {
                // Load manufacturers
                const mfgSnapshot = await getDocs(collection(db, 'manufacturers'));
                const mfgData = mfgSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setManufacturers(mfgData.sort((a, b) => (a.Name || '').localeCompare(b.Name || '')));

                // Load materials and colors from metadata
                const metaSnapshot = await getDocs(collection(db, 'metadata'));
                const mechaOptions = metaSnapshot.docs.find(d => d.id === 'mecha_options');
                if (mechaOptions) {
                    const data = mechaOptions.data();
                    setMaterials((data.materials || []).sort());
                    setColors((data.colors || []).sort());
                }
            } catch (error) {
                console.error('Error loading options:', error);
            }
        }
        loadOptions();
    }, []);

    // Initial expand for accordion mode
    useEffect(() => {
        if (viewMode === 'accordion' && rows.length > 0 && expandedRowId === null) {
            setExpandedRowId(rows[0].id);
        }
    }, [rows, viewMode]);

    const addRow = () => {
        const newId = Date.now();
        setRows(prev => [...prev, { ...DEFAULT_ROW, id: newId }]);
        if (viewMode === 'accordion') {
            setExpandedRowId(newId);
        }
        setTimeout(() => {
            if (listRef.current) {
                listRef.current.scrollTop = listRef.current.scrollHeight;
            }
        }, 100);
    };

    const deleteRow = (id, e) => {
        if (e) e.stopPropagation();
        if (rows.length === 1) {
            alert("최소 1개의 항목은 있어야 합니다.");
            return;
        }
        setRows(prev => prev.filter(row => row.id !== id));
        if (expandedRowId === id) {
            setExpandedRowId(null);
        }
    };

    const duplicateRow = (index, e) => {
        if (e) e.stopPropagation();
        const newId = Date.now();
        const newRow = { ...rows[index], id: newId };
        const newRows = [...rows];
        newRows.splice(index + 1, 0, newRow);
        setRows(newRows);
        if (viewMode === 'accordion') {
            setExpandedRowId(newId);
        }
    };

    const toggleRow = (id) => {
        setExpandedRowId(prev => prev === id ? null : id);
    };

    const handleChange = (id, field, value) => {
        setRows(prev => prev.map(row =>
            row.id === id ? { ...row, [field]: value } : row
        ));
    };

    const handleSafetyChange = (id, cert, checked) => {
        setRows(prev => prev.map(row =>
            row.id === id ? { ...row, Safety: { ...row.Safety, [cert]: checked } } : row
        ));
    };

    const validate = () => {
        const newErrors = {};
        rows.forEach((row) => {
            if (!row.Name.trim()) {
                newErrors[row.id] = '품명은 필수입니다.';
            }
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) {
            const firstErrorId = Object.keys(errors)[0];
            if (firstErrorId && viewMode === 'accordion') {
                setExpandedRowId(Number(firstErrorId));
            }
            return;
        }

        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);
            const combinations = [...new Set(rows.map(r => {
                const catMap = { '기구부품 (M)': 'M', '전자부품 (E)': 'E', '구매품 (O)': 'O' };
                const catCode = catMap[r.Category] || 'O';
                let classCode = 'I';
                if (r.Class === 'Assembly (A)' || r.Class === 'Product (P)') classCode = 'A';
                const typeCode = (r.PartTypeCode || 'X').toUpperCase().charAt(0);
                return `${catCode}${classCode}${typeCode}`;
            }))];

            const sequences = {};
            for (const comb of combinations) {
                const prefix = `IR${comb}`;
                const q = query(collection(db, 'parts'),
                    where('MasterPartID', '>=', prefix),
                    where('MasterPartID', '<=', prefix + '\uf8ff')
                );
                const snap = await getDocs(q);
                sequences[comb] = snap.docs.length;
            }

            for (const r of rows) {
                const catMap = { '기구부품 (M)': 'M', '전자부품 (E)': 'E', '구매품 (O)': 'O' };
                const catCode = catMap[r.Category] || 'O';
                let classCode = 'I';
                if (r.Class === 'Assembly (A)' || r.Class === 'Product (P)') classCode = 'A';
                const typeCode = (r.PartTypeCode || 'X').toUpperCase().charAt(0);
                const comb = `${catCode}${classCode}${typeCode}`;

                sequences[comb]++;
                const nextSeq = String(sequences[comb]).padStart(4, '0');
                const masterID = `IR${comb}${nextSeq}`;
                const partID = `${masterID}-1.0`;

                const newDocRef = doc(collection(db, 'parts'));
                batch.set(newDocRef, {
                    ...r,
                    PartID: partID,
                    MasterPartID: masterID,
                    Rev: '1.0',
                    IsLatestRevision: true,
                    CreatedAt: new Date(),
                    LastModified: new Date(),
                    UnitPrice: Number(r.UnitPrice) || 0,
                    Datasheet: r.Datasheet || '',
                    Image: r.Image || '',
                });

                const ecnRef = doc(collection(db, 'ecns'));
                batch.set(ecnRef, {
                    MasterPartID: masterID,
                    PartID: partID,
                    Rev: '1.0',
                    Reason: 'Bulk Import',
                    Type: 'Simple Update',
                    Status: 'Approved',
                    CreatedAt: new Date(),
                    CreatedBy: 'User (Bulk)',
                    ModifiedFields: ['Creation'],
                    Changes: ['[신규] 부품이 일괄 등록으로 생성되었습니다.']
                });
            }

            await batch.commit();
            onSuccess();
        } catch (error) {
            console.error("Bulk Import Error:", error);
            alert("일괄 저장 중 오류가 발생했습니다.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed top-0 bottom-0 right-0 left-64 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-[76vw] max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <Plus size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">부품 일괄 등록</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bulk Registration</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* View Mode Toggle */}
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('accordion')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'accordion' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <List size={14} />
                                상세
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <LayoutGrid size={14} />
                                그리드
                            </button>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 text-slate-400 rounded-xl transition-all">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-slate-50/30" ref={listRef}>
                    {viewMode === 'accordion' ? (
                        // Accordion View
                        <div className="space-y-3">
                            {rows.map((row, index) => {
                                const isExpanded = expandedRowId === row.id;
                                const hasError = errors[row.id];

                                return (
                                    <div
                                        key={row.id}
                                        className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded ? 'shadow-xl border-blue-200 ring-1 ring-blue-100' : 'shadow-sm border-slate-200 hover:border-blue-300'}`}
                                    >
                                        <div
                                            className={`px-5 py-3 flex items-center gap-4 cursor-pointer select-none ${isExpanded ? 'bg-blue-50/30 border-b border-blue-50' : 'hover:bg-slate-50'}`}
                                            onClick={() => toggleRow(row.id)}
                                        >
                                            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${hasError ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-500'}`}>
                                                {index + 1}
                                            </div>

                                            <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                                                {isExpanded ? (
                                                    <div className="col-span-12 grid grid-cols-12 gap-2">
                                                        <div className="col-span-10">
                                                            <input
                                                                value={row.Name}
                                                                onChange={e => handleChange(row.id, 'Name', e.target.value)}
                                                                className={`w-full px-3 py-2 text-sm font-bold border rounded-lg outline-none focus:ring-2 transition-all ${hasError ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-blue-100'}`}
                                                                placeholder="부품명 입력 중..."
                                                                autoFocus
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <input
                                                                value={row.Owner}
                                                                onChange={e => handleChange(row.id, 'Owner', e.target.value)}
                                                                className="w-full px-3 py-2 text-sm font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                                                                placeholder="담당자"
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className={`col-span-4 font-bold text-sm truncate ${!row.Name && 'text-slate-300 italic'}`}>
                                                            {row.Name || '부품명 미입력'}
                                                        </div>
                                                        <div className="col-span-3 text-xs text-slate-500 truncate">
                                                            {row.Spec || '-'}
                                                        </div>
                                                        <div className="col-span-3 text-xs text-slate-500 truncate">
                                                            {row.Manufacturer || '-'}
                                                        </div>
                                                        <div className="col-span-2 text-xs font-bold text-slate-600 text-right">
                                                            {row.UnitPrice > 0 && `₩${Number(row.UnitPrice).toLocaleString()}`}
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {isExpanded ? <ChevronDown size={16} className="text-blue-500" /> : <ChevronRight size={16} className="text-slate-300" />}
                                                <button
                                                    onClick={(e) => duplicateRow(index, e)}
                                                    className="p-1.5 text-slate-300 hover:text-blue-500 rounded-lg hover:bg-blue-50"
                                                    title="복사"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => deleteRow(row.id, e)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50"
                                                    title="삭제"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="p-4 animate-in slide-in-from-top-2 duration-200">
                                                <div className="grid grid-cols-12 gap-2">
                                                    {/* Row 1: Manufacturer, Category, Class, Type, Unit, Spec, Safety */}
                                                    <div className="col-span-2 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Manufacturer</label>
                                                        <select
                                                            value={row.Manufacturer}
                                                            onChange={e => {
                                                                if (e.target.value === '__ADD_NEW__') {
                                                                    setAddingNew(prev => ({ ...prev, [`${row.id}_manufacturer`]: true }));
                                                                    handleChange(row.id, 'Manufacturer', '');
                                                                } else {
                                                                    handleChange(row.id, 'Manufacturer', e.target.value);
                                                                }
                                                            }}
                                                            className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50"
                                                        >
                                                            <option value="">선택...</option>
                                                            {manufacturers.map(m => (
                                                                <option key={m.id} value={m.Name}>{m.Name}</option>
                                                            ))}
                                                            <option value="__ADD_NEW__">➕ Add New...</option>
                                                        </select>
                                                        {addingNew[`${row.id}_manufacturer`] && (
                                                            <input
                                                                value={row.Manufacturer}
                                                                onChange={e => handleChange(row.id, 'Manufacturer', e.target.value)}
                                                                onBlur={async (e) => {
                                                                    const value = e.target.value.trim();
                                                                    if (value && !manufacturers.find(m => m.Name === value)) {
                                                                        try {
                                                                            const { addDoc, collection } = await import('firebase/firestore');
                                                                            const docRef = await addDoc(collection(db, 'manufacturers'), { Name: value });
                                                                            setManufacturers(prev => [...prev, { id: docRef.id, Name: value }].sort((a, b) => a.Name.localeCompare(b.Name)));
                                                                        } catch (error) {
                                                                            console.error('Error adding manufacturer:', error);
                                                                        }
                                                                    }
                                                                    setAddingNew(prev => ({ ...prev, [`${row.id}_manufacturer`]: false }));
                                                                }}
                                                                className="w-full px-2 py-1.5 text-xs font-bold border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 mt-1"
                                                                placeholder="새 제조사 입력..."
                                                                autoFocus
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                                                        <select value={row.Category} onChange={e => handleChange(row.id, 'Category', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50">
                                                            <option>기구부품 (M)</option>
                                                            <option>전자부품 (E)</option>
                                                            <option>구매품 (O)</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Class</label>
                                                        <select value={row.Class} onChange={e => handleChange(row.id, 'Class', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50">
                                                            <option>Part (I)</option>
                                                            <option>Assembly (A)</option>
                                                            <option>Product (P)</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-2 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                                                        <select value={row.PartTypeCode} onChange={e => handleChange(row.id, 'PartTypeCode', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50">
                                                            <option value="A">A - Assembly (Sub)</option>
                                                            <option value="P">P - Plastic</option>
                                                            <option value="S">S - Sheet metal</option>
                                                            <option value="T">T - Turning cut part</option>
                                                            <option value="D">D - Die casting, Sinter</option>
                                                            <option value="E">E - Extrusion part</option>
                                                            <option value="R">R - Rubber, Silicon</option>
                                                            <option value="B">B - Board-PCB / Bond, Tape</option>
                                                            <option value="C">C - Component (Motor, Solenoid, Switch)</option>
                                                            <option value="W">W - Wire, Connector, Harness</option>
                                                            <option value="Q">Q - Analog/Digital Device</option>
                                                            <option value="M">M - Electric Module</option>
                                                            <option value="L">L - Oil, Grease</option>
                                                            <option value="V">V - Poly bag, Sticker etc</option>
                                                            <option value="X">X - Bearing, Screw, Washer</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Unit</label>
                                                        <input value={row.Unit} onChange={e => handleChange(row.id, 'Unit', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100" placeholder="EA" />
                                                    </div>
                                                    <div className="col-span-2 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Spec</label>
                                                        <input value={row.Spec} onChange={e => handleChange(row.id, 'Spec', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100" placeholder="규격/사양" />
                                                    </div>
                                                    <div className="col-span-3 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Safety</label>
                                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                            {['CE', 'ROHS', 'UL', 'KC'].map(cert => (
                                                                <label key={cert} className="flex items-center gap-0.5 cursor-pointer">
                                                                    <input type="checkbox" checked={row.Safety[cert]} onChange={e => handleSafetyChange(row.id, cert, e.target.checked)} className="h-3 w-3 rounded border-slate-200 text-blue-500 focus:ring-blue-500" />
                                                                    <span className="text-[15px] font-bold text-slate-600">{cert}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Price, Currency, ProcessType, Material, Color, Image URL, Datasheet URL, Description */}
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Price</label>
                                                        <input type="number" value={row.UnitPrice} onChange={e => handleChange(row.id, 'UnitPrice', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold text-right border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-100 text-green-700" />
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">통화</label>
                                                        <select value={row.Currency} onChange={e => handleChange(row.id, 'Currency', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50">
                                                            <option>KRW</option>
                                                            <option>USD</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">가공/구매</label>
                                                        <select value={row.ProcessType} onChange={e => handleChange(row.id, 'ProcessType', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50">
                                                            <option>가공</option>
                                                            <option>구매</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Material</label>
                                                        <select
                                                            value={row.Material}
                                                            onChange={e => {
                                                                if (e.target.value === '__ADD_NEW__') {
                                                                    setAddingNew(prev => ({ ...prev, [`${row.id}_material`]: true }));
                                                                    handleChange(row.id, 'Material', '');
                                                                } else {
                                                                    handleChange(row.id, 'Material', e.target.value);
                                                                }
                                                            }}
                                                            className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50"
                                                        >
                                                            <option value="">선택...</option>
                                                            {materials.map(m => (
                                                                <option key={m} value={m}>{m}</option>
                                                            ))}
                                                            <option value="__ADD_NEW__">➕ Add New...</option>
                                                        </select>
                                                        {addingNew[`${row.id}_material`] && (
                                                            <input
                                                                value={row.Material}
                                                                onChange={e => handleChange(row.id, 'Material', e.target.value)}
                                                                onBlur={async (e) => {
                                                                    const value = e.target.value.trim();
                                                                    if (value && !materials.includes(value)) {
                                                                        try {
                                                                            const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
                                                                            await updateDoc(doc(db, 'metadata', 'mecha_options'), {
                                                                                materials: arrayUnion(value)
                                                                            });
                                                                            setMaterials(prev => [...prev, value].sort());
                                                                        } catch (error) {
                                                                            console.error('Error adding material:', error);
                                                                        }
                                                                    }
                                                                    setAddingNew(prev => ({ ...prev, [`${row.id}_material`]: false }));
                                                                }}
                                                                className="w-full px-2 py-1.5 text-xs font-bold border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 mt-1"
                                                                placeholder="새 재질 입력..."
                                                                autoFocus
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="col-span-1 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Color</label>
                                                        <select
                                                            value={row.Color}
                                                            onChange={e => {
                                                                if (e.target.value === '__ADD_NEW__') {
                                                                    setAddingNew(prev => ({ ...prev, [`${row.id}_color`]: true }));
                                                                    handleChange(row.id, 'Color', '');
                                                                } else {
                                                                    handleChange(row.id, 'Color', e.target.value);
                                                                }
                                                            }}
                                                            className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50"
                                                        >
                                                            <option value="">선택...</option>
                                                            {colors.map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                            <option value="__ADD_NEW__">➕ Add New...</option>
                                                        </select>
                                                        {addingNew[`${row.id}_color`] && (
                                                            <input
                                                                value={row.Color}
                                                                onChange={e => handleChange(row.id, 'Color', e.target.value)}
                                                                onBlur={async (e) => {
                                                                    const value = e.target.value.trim();
                                                                    if (value && !colors.includes(value)) {
                                                                        try {
                                                                            const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
                                                                            await updateDoc(doc(db, 'metadata', 'mecha_options'), {
                                                                                colors: arrayUnion(value)
                                                                            });
                                                                            setColors(prev => [...prev, value].sort());
                                                                        } catch (error) {
                                                                            console.error('Error adding color:', error);
                                                                        }
                                                                    }
                                                                    setAddingNew(prev => ({ ...prev, [`${row.id}_color`]: false }));
                                                                }}
                                                                className="w-full px-2 py-1.5 text-xs font-bold border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 mt-1"
                                                                placeholder="새 색상 입력..."
                                                                autoFocus
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="col-span-2 space-y-1">
                                                        <label className="text-[10px] font-bold text-blue-400 uppercase">Image URL</label>
                                                        <input value={row.Image} onChange={e => handleChange(row.id, 'Image', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-blue-50/20" placeholder="https://..." />
                                                    </div>
                                                    <div className="col-span-2 space-y-1">
                                                        <label className="text-[10px] font-bold text-blue-400 uppercase">Datasheet URL</label>
                                                        <input value={row.Datasheet} onChange={e => handleChange(row.id, 'Datasheet', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-blue-50/20" placeholder="https://..." />
                                                    </div>
                                                    <div className="col-span-3 space-y-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                                                        <input value={row.Description} onChange={e => handleChange(row.id, 'Description', e.target.value)} className="w-full px-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100" placeholder="비고" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Grid View
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs">
                                <thead className="sticky top-0 bg-slate-50 z-10">
                                    <tr className="border-b-2 border-slate-200">
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] w-12">#</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[200px]">Part Name *</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">Owner</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[120px]">Category</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">Class</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">Type</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[150px]">Spec</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">Material</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">Color</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[80px]">Unit</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">가공/구매</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[150px]">Manufacturer</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[100px]">Price</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[80px]">Currency</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[150px]">Description</th>
                                        <th className="px-1.5 py-2 text-left font-bold text-slate-600 uppercase text-[10px] min-w-[80px] sticky right-0 bg-slate-50">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => {
                                        const hasError = errors[row.id];
                                        return (
                                            <tr key={row.id} className={`border-b border-slate-100 hover:bg-blue-50/30 ${hasError ? 'bg-red-50/50' : ''}`}>
                                                <td className="px-1 py-1 text-slate-500 font-bold">{index + 1}</td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Name} onChange={e => handleChange(row.id, 'Name', e.target.value)} className={`w-full px-2 py-1.5 border rounded ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'} text-xs font-bold focus:ring-1 focus:ring-blue-400 outline-none`} placeholder="부품명" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Owner} onChange={e => handleChange(row.id, 'Owner', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="담당자" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <select value={row.Category} onChange={e => handleChange(row.id, 'Category', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400 outline-none">
                                                        <option>기구부품 (M)</option>
                                                        <option>전자부품 (E)</option>
                                                        <option>구매품 (O)</option>
                                                    </select>
                                                </td>
                                                <td className="px-1 py-1">
                                                    <select value={row.Class} onChange={e => handleChange(row.id, 'Class', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400 outline-none">
                                                        <option>Part (I)</option>
                                                        <option>Assembly (A)</option>
                                                        <option>Product (P)</option>
                                                    </select>
                                                </td>
                                                <td className="px-1 py-1">
                                                    <select value={row.PartTypeCode} onChange={e => handleChange(row.id, 'PartTypeCode', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400 outline-none">
                                                        <option value="X">X</option>
                                                        <option value="A">A</option>
                                                        <option value="P">P</option>
                                                        <option value="S">S</option>
                                                        <option value="T">T</option>
                                                        <option value="D">D</option>
                                                    </select>
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Spec} onChange={e => handleChange(row.id, 'Spec', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="규격" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Material} onChange={e => handleChange(row.id, 'Material', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="재질" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Color} onChange={e => handleChange(row.id, 'Color', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="색상" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Unit} onChange={e => handleChange(row.id, 'Unit', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="EA" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <select value={row.ProcessType} onChange={e => handleChange(row.id, 'ProcessType', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400 outline-none">
                                                        <option>가공</option>
                                                        <option>구매</option>
                                                    </select>
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Manufacturer} onChange={e => handleChange(row.id, 'Manufacturer', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="제조사" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input type="number" value={row.UnitPrice} onChange={e => handleChange(row.id, 'UnitPrice', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs text-right focus:ring-1 focus:ring-blue-400 outline-none" />
                                                </td>
                                                <td className="px-1 py-1">
                                                    <select value={row.Currency} onChange={e => handleChange(row.id, 'Currency', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white focus:ring-1 focus:ring-blue-400 outline-none">
                                                        <option>KRW</option>
                                                        <option>USD</option>
                                                    </select>
                                                </td>
                                                <td className="px-1 py-1">
                                                    <input value={row.Description} onChange={e => handleChange(row.id, 'Description', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-400 outline-none" placeholder="비고" />
                                                </td>
                                                <td className="px-1 py-1 sticky right-0 bg-white">
                                                    <div className="flex gap-1">
                                                        <button onClick={() => duplicateRow(index)} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="복사">
                                                            <Copy size={14} />
                                                        </button>
                                                        <button onClick={() => deleteRow(row.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="삭제">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <button
                        onClick={addRow}
                        className="mt-4 flex items-center justify-center gap-2 w-full py-4 bg-white border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 font-bold hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all group"
                    >
                        <Plus size={20} className="group-hover:scale-110 transition-transform" />
                        <span>부품 추가 (Add Part)</span>
                    </button>
                </div>

                {/* Footer */}
                <div className="px-6 py-5 bg-white border-t border-slate-100 flex justify-between items-center z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                        <AlertCircle size={16} />
                        <span>총 {rows.length}개 항목</span>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-6 py-2.5 bg-slate-100 text-slate-500 font-black text-sm rounded-xl hover:bg-slate-200 transition-all">
                            닫기
                        </button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="px-8 py-2.5 bg-blue-600 text-white font-black text-sm rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50">
                            {isSubmitting ? '저장 중...' : '일괄 저장'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
