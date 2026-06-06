import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, query, where, writeBatch, doc, addDoc, updateDoc, arrayUnion } from '../firebase';
import { db } from '../firebase';
import { X, Plus, Trash2, Save, AlertCircle, Copy, ChevronDown, ChevronRight, CheckCircle2, LayoutGrid, List, Link, Upload, FileSpreadsheet, ClipboardPaste, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';

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

const FIELD_MAP = {
    'PartID': ['ID', '부품번호', 'Part ID', 'PartID', '품번'],
    'Name': ['품명', '부품명', '이름', 'Name', 'Part Name', 'Item Name'],
    'Spec': ['규격', '사양', 'Spec', 'Specification', 'Size', '가공방법(Tooling)/\n구매품목(Item)'],
    'Category': ['카테고리', '구분', 'Category', 'Classification', '대분류', '종류'],
    'Class': ['클래스', 'Class', 'Part/Assy', '분류'],
    'PartTypeCode': ['타입', 'Type', 'PartTypeCode', '코드', '타입코드'],
    'Unit': ['단위', 'Unit', 'UNIT'],
    'Manufacturer': ['제조사', 'Maker', 'Manufacturer', '제조업체'],
    'Maker': ['공급사', 'Vendor', 'Maker'],
    'UnitPrice': ['단가', '가격', 'Price', 'UnitPrice', 'Cost', 'Unit price\n[Won]', 'Unit price\n[USD $]', 'Price\n[Won]'],
    'Currency': ['통화', 'Currency'],
    'Description': ['비고', '설명', 'Description', 'Remark'],
    'Material': ['재질', 'Material'],
    'Grade': ['등급', 'Grade'],
    'Color': ['색상', 'Color'],
    'ProcessType': ['공정', '가공/구매', 'ProcessType', 'Process Type'],
    'Owner': ['담당자', 'Owner', 'Manager', '담당부서'],
    'MPN': ['MPN', '제조사부품번호', '제조사품번'],
    'MFN': ['MFN', '도번', '모델번호'],
    'Rev': ['리비전', 'Revision', 'Rev'],
    'CE': ['CE'],
    'RoHS': ['RoHS'],
    'UL': ['UL'],
    'KC': ['KC']
};

export default function BulkPartImportModal({ onClose, onSuccess }) {
    const [rows, setRows] = useState([{ ...DEFAULT_ROW, id: Date.now() }]);
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [viewMode, setViewMode] = useState('grid'); // Default to grid for bulk tasks
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [isDragging, setIsDragging] = useState(false);
    const listRef = useRef(null);
    const fileInputRef = useRef(null);

    // Mapping states
    const [mappingData, setMappingData] = useState(null); // { headers: [], data: [] }
    const [columnMap, setColumnMap] = useState({}); // { systemField: excelHeader }

    // Combobox options
    const [manufacturers, setManufacturers] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [colors, setColors] = useState([]);

    useEffect(() => {
        async function loadOptions() {
            try {
                const mfgSnapshot = await getDocs(collection(db, 'manufacturers'));
                const mfgData = mfgSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setManufacturers(mfgData.sort((a, b) => (a.Name || '').localeCompare(b.Name || '')));

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

    // Global Paste Support
    const handlePaste = useCallback((e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const pasteData = e.clipboardData.getData('text');
        if (!pasteData) return;

        processRawData(pasteData);
    }, [rows]);

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    const processRawData = (text) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const newRows = lines.map((line, idx) => {
            const cells = line.split('\t'); // TSV from Excel
            return {
                ...DEFAULT_ROW,
                id: Date.now() + idx + Math.random(),
                Name: cells[0]?.trim() || '',
                Spec: cells[1]?.trim() || '',
                Manufacturer: cells[2]?.trim() || '',
                UnitPrice: Number(cells[3]?.replace(/[^0-9.-]+/g, "")) || 0,
                Description: cells[4]?.trim() || '',
            };
        });

        if (newRows.length > 0) {
            setRows(prev => {
                if (prev.length === 1 && !prev[0].Name) return newRows;
                return [...prev, ...newRows];
            });
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length < 2) {
                alert("데이터가 충분하지 않습니다.");
                return;
            }

            const headers = data[0].map(h => String(h).trim());
            const rowsData = data.slice(1);

            // Auto mapping
            const initialMap = {};
            Object.keys(FIELD_MAP).forEach(sysField => {
                const aliases = FIELD_MAP[sysField];
                const foundHeader = headers.find(h => aliases.some(a => h.toLowerCase() === a.toLowerCase()));
                if (foundHeader) initialMap[sysField] = foundHeader;
            });

            setMappingData({ headers, data: rowsData });
            setColumnMap(initialMap);
        };
        reader.readAsBinaryString(file);
    };

    const applyMapping = () => {
        const newRows = mappingData.data.map((excelRow, idx) => {
            const row = { ...DEFAULT_ROW, id: Date.now() + idx + Math.random() };
            Object.entries(columnMap).forEach(([sysField, excelHeader]) => {
                const headerIndex = mappingData.headers.indexOf(excelHeader);
                if (headerIndex !== -1) {
                    let val = excelRow[headerIndex];
                    if (sysField === 'UnitPrice') {
                        val = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.-]+/g, "")) || 0;
                    }
                    if (sysField === 'Category') {
                        // Attempt to normalize category
                        if (String(val).includes('M')) val = '기구부품 (M)';
                        else if (String(val).includes('E')) val = '전자부품 (E)';
                        else if (String(val).includes('O')) val = '구매품 (O)';
                    }
                    row[sysField] = val !== undefined ? val : row[sysField];
                }
            });
            return row;
        });

        setRows(prev => {
            if (prev.length === 1 && !prev[0].Name) return newRows;
            return [...prev, ...newRows];
        });
        setMappingData(null);
        // Clear input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const addRow = () => {
        const newId = Date.now();
        setRows(prev => [...prev, { ...DEFAULT_ROW, id: newId }]);
        if (viewMode === 'accordion') {
            setExpandedRowId(newId);
        }
    };

    const deleteRow = (id, e) => {
        if (e) e.stopPropagation();
        setRows(prev => prev.filter(row => row.id !== id));
        if (expandedRowId === id) setExpandedRowId(null);
    };

    const duplicateRow = (index, e) => {
        if (e) e.stopPropagation();
        const newId = Date.now() + Math.random();
        const newRow = { ...rows[index], id: newId };
        const newRows = [...rows];
        newRows.splice(index + 1, 0, newRow);
        setRows(newRows);
        if (viewMode === 'accordion') setExpandedRowId(newId);
    };

    const toggleRow = (id) => {
        setExpandedRowId(prev => prev === id ? null : id);
    };

    const handleChange = (id, field, value) => {
        setRows(prev => prev.map(row =>
            row.id === id ? { ...row, [field]: value } : row
        ));
    };

    const validate = () => {
        const newErrors = {};
        const validCategories = ['기구부품 (M)', '전자부품 (E)', '구매품 (O)'];
        
        rows.forEach((row) => {
            const rowErrors = [];
            if (!row.Name?.trim()) rowErrors.push('품명 누락');
            if (!validCategories.includes(row.Category)) rowErrors.push('구분 오류');
            
            if (rowErrors.length > 0) {
                newErrors[row.id] = rowErrors.join(', ');
            }
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) {
            alert("입력 데이터에 오류가 있습니다. 하이라이트된 항목을 확인해주세요.");
            return;
        }

        setIsSubmitting(true);
        try {
            const CHUNK_SIZE = 400; // Chunk for safety
            for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);

                // Prepare sequences for this chunk
                const combinations = [...new Set(chunk.map(r => {
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

                for (const r of chunk) {
                    let partID = r.PartID;
                    let masterPartID = r.MasterPartID;
                    let rev = r.Rev || '1.0';

                    if (r.PartID && r.PartID.includes('-')) {
                        const parts = r.PartID.split('-');
                        masterPartID = parts[0];
                        rev = parts[1] || '1.0';
                        partID = masterPartID; // 리비전 제외
                    } else if (r.PartID) {
                        masterPartID = r.PartID;
                        partID = masterPartID; // 리비전 제외
                    } else {
                        const catMap = { '기구부품 (M)': 'M', '전자부품 (E)': 'E', '구매품 (O)': 'O' };
                        const catCode = catMap[r.Category] || 'O';
                        let classCode = 'I';
                        if (r.Class === 'Assembly (A)' || r.Class === 'Product (P)') classCode = 'A';
                        const typeCode = (r.PartTypeCode || 'X').toUpperCase().charAt(0);
                        const comb = `${catCode}${classCode}${typeCode}`;

                        sequences[comb]++;
                        const nextSeq = String(sequences[comb]).padStart(4, '0');
                        masterPartID = `IR${comb}${nextSeq}`;
                        partID = masterPartID; // 리비전 제외
                    }

                    const safety = {
                        CE: r.CE === true || String(r.CE).toUpperCase() === 'Y' || (r.Safety && r.Safety.CE === true),
                        ROHS: r.ROHS === true || String(r.ROHS).toUpperCase() === 'Y' || (r.Safety && r.Safety.ROHS === true),
                        UL: r.UL === true || String(r.UL).toUpperCase() === 'Y' || (r.Safety && r.Safety.UL === true),
                        KC: r.KC === true || String(r.KC).toUpperCase() === 'Y' || (r.Safety && r.Safety.KC === true),
                        REACH: false
                    };

                    const newDocRef = doc(db, 'parts', partID);
                    batch.set(newDocRef, {
                        ...r,
                        PartID: partID,
                        MasterPartID: masterPartID,
                        Rev: rev,
                        IsLatestRevision: true,
                        CreatedAt: new Date(),
                        LastModified: new Date(),
                        UnitPrice: Number(r.UnitPrice) || 0,
                        Safety: safety,
                        SafetyLinks: { CE: "", ROHS: "", UL: "", KC: "", REACH: "" },
                        Lifecycle: r.Lifecycle || "Active"
                    });

                    const ecnRef = doc(collection(db, 'ecns'));
                    batch.set(ecnRef, {
                        MasterPartID: masterPartID,
                        PartID: partID,
                        Rev: rev,
                        Reason: 'Bulk Import',
                        Type: 'Simple Update',
                        Status: 'Approved',
                        CreatedAt: new Date(),
                        CreatedBy: 'System (Bulk)',
                        ModifiedFields: ['Creation'],
                        Changes: [`[신규] 부품(${masterPartID})이 일괄 임포트로 등록되었습니다.`]
                    });
                }
                await batch.commit();
            }
            onSuccess();
        } catch (error) {
            console.error("Bulk Import Error:", error);
            alert("데이터 저장 중 오류가 발생했습니다: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => { setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload({ target: { files: [file] } });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-[90vw] h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white/50 backdrop-blur">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200">
                            <Upload size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">지능형 부품 임포트</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-widest">Intelligent Engine v2</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bulk Data Migration</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-100 rounded-xl p-1">
                            <button onClick={() => setViewMode('accordion')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'accordion' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={14} /> 상세 모드</button>
                            <button onClick={() => setViewMode('grid')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={14} /> 그리드 모드</button>
                        </div>
                        <button onClick={onClose} className="p-3 hover:bg-slate-100 text-slate-400 rounded-2xl transition-all"><X size={24} /></button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-slate-50/30">
                    {/* Drag & Drop Zone */}
                    {!mappingData && (
                        <div className="flex flex-col gap-6">
                            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                                <div className="flex-1 w-full">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">구글 스프레드시트 URL 일괄 추가</label>
                                    <input 
                                        type="text" 
                                        placeholder="https://docs.google.com/spreadsheets/d/.../edit 형식의 시트 주소를 붙여넣으세요"
                                        id="sheet-url-input"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const urlVal = document.getElementById('sheet-url-input')?.value?.trim();
                                        if (!urlVal) {
                                            alert("구글 시트 URL을 입력해주세요.");
                                            return;
                                        }
                                        setIsSubmitting(true);
                                        try {
                                            let csvUrl = urlVal;
                                            if (urlVal.includes('/edit')) {
                                                csvUrl = urlVal.split('/edit')[0] + '/export?format=csv';
                                                if (urlVal.includes('gid=')) {
                                                    const gid = urlVal.split('gid=')[1]?.split('&')[0];
                                                    if (gid) csvUrl += `&gid=${gid}`;
                                                }
                                            }
                                            console.log("[Google Sheets Import] Fetching CSV:", csvUrl);
                                            const res = await fetch(csvUrl);
                                            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                                            const text = await res.text();
                                            
                                            // Split by lines and parse CSV
                                            const lines = [];
                                            let row = [""];
                                            let inQuotes = false;
                                            for (let i = 0; i < text.length; i++) {
                                                const c = text[i];
                                                const next = text[i+1];
                                                if (c === '"') {
                                                    if (inQuotes && next === '"') {
                                                        row[row.length - 1] += '"';
                                                        i++;
                                                    } else {
                                                        inQuotes = !inQuotes;
                                                    }
                                                } else if (c === ',' && !inQuotes) {
                                                    row.push("");
                                                } else if ((c === '\r' || c === '\n') && !inQuotes) {
                                                    if (c === '\r' && next === '\n') i++;
                                                    lines.push(row);
                                                    row = [""];
                                                } else {
                                                    row[row.length - 1] += c;
                                                }
                                            }
                                            if (row.length > 1 || row[0] !== "") lines.push(row);

                                            if (lines.length < 2) {
                                                alert("시트에 유효한 데이터가 없습니다.");
                                                return;
                                            }

                                            const headers = lines[0].map(h => String(h).trim());
                                            const rowsData = lines.slice(1);

                                            // Auto mapping
                                            const initialMap = {};
                                            Object.keys(FIELD_MAP).forEach(sysField => {
                                                const aliases = FIELD_MAP[sysField];
                                                const foundHeader = headers.find(h => aliases.some(a => h.toLowerCase() === a.toLowerCase()));
                                                if (foundHeader) initialMap[sysField] = foundHeader;
                                            });

                                            setMappingData({ headers, data: rowsData });
                                            setColumnMap(initialMap);
                                        } catch (err) {
                                            console.error(err);
                                            alert("시트를 가져오는 도중 오류가 발생했습니다. 링크 공유 설정이 '링크가 있는 모든 사용자에게 공개' 상태인지 확인해주세요.");
                                        } finally {
                                            setIsSubmitting(false);
                                        }
                                    }}
                                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl transition-all shadow-lg shadow-blue-200 self-end"
                                >
                                    시트 불러오기
                                </button>
                            </div>

                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-3 border-dashed rounded-[2rem] p-12 flex flex-col items-center justify-center transition-all cursor-pointer group relative overflow-hidden ${isDragging ? 'border-blue-500 bg-blue-50 scale-[0.98]' : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/50'}`}
                            >
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls,.csv" />
                                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 transition-all duration-500 ${isDragging ? 'bg-blue-600 text-white scale-110 rotate-12' : 'bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
                                    <FileSpreadsheet size={40} />
                                </div>
                                <h3 className="text-xl font-black text-slate-800 mb-2">엑셀 파일을 이곳에 드롭하거나 클릭하여 선택하세요</h3>
                                <p className="text-slate-400 font-bold mb-6 text-sm">표준 엑셀 양식 및 사용자 정의 양식 모두 자동 인식 가능합니다.</p>
                                
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-500 border border-slate-100"><Check size={14} className="text-green-500" /> 컬럼 자동 매핑</div>
                                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-500 border border-slate-100"><ClipboardPaste size={14} className="text-blue-500" /> Ctrl+V 붙여넣기 지원</div>
                                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-500 border border-slate-100"><AlertCircle size={14} className="text-orange-500" /> 실시간 유효성 검사</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mapping Wizard */}
                    {mappingData && (
                        <div className="mb-8 bg-slate-900 rounded-[2rem] p-10 text-white shadow-2xl animate-in slide-in-from-top-8 duration-500">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/40"><ClipboardPaste size={28} /></div>
                                    <div>
                                        <h3 className="text-2xl font-black italic tracking-tight">SMART MAPPING WIZARD</h3>
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] opacity-80">엑셀 열과 시스템 필드를 매칭해주세요</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setMappingData(null)} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-bold transition-all border border-white/10">매핑 취소</button>
                                    <button onClick={applyMapping} className="px-10 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"><Check size={20} /> 데이터 분석 실행</button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                                {Object.keys(FIELD_MAP).map(sysField => (
                                    <div key={sysField} className="group flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-blue-500/30 hover:bg-white/10 transition-all">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{sysField}</label>
                                            {columnMap[sysField] && <Check size={12} className="text-green-400" />}
                                        </div>
                                        <select
                                            value={columnMap[sysField] || ''}
                                            onChange={e => setColumnMap(prev => ({ ...prev, [sysField]: e.target.value }))}
                                            className="w-full bg-slate-800 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                                        >
                                            <option value="">-- 매핑 제외 --</option>
                                            {mappingData.headers.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Editor Area */}
                    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-xs font-black text-slate-500 shadow-sm">{rows.length}</span>
                                <h4 className="text-sm font-black text-slate-700">임포트 대기 목록</h4>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setRows([{ ...DEFAULT_ROW, id: Date.now() }])} className="p-2 text-slate-400 hover:text-red-500 transition-all" title="초기화"><RotateCcw size={18} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto">
                            {viewMode === 'grid' ? (
                                <table className="w-full border-collapse text-[11px] table-fixed">
                                    <thead className="bg-slate-50/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter w-12">#</th>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter w-64">Part Name *</th>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter w-40">Category</th>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter w-48">Spec / Info</th>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter w-40">Manufacturer</th>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter w-32">Price (KRW)</th>
                                            <th className="px-4 py-3 text-left font-black text-slate-400 uppercase tracking-tighter">Description</th>
                                            <th className="px-4 py-3 text-center font-black text-slate-400 uppercase tracking-tighter w-24 sticky right-0 bg-slate-50/80 backdrop-blur">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {rows.map((row, index) => {
                                            const hasError = errors[row.id];
                                            return (
                                                <tr key={row.id} className={`group hover:bg-blue-50/30 transition-colors ${hasError ? 'bg-red-50/50' : ''}`}>
                                                    <td className="px-4 py-2 text-slate-400 font-bold">{index + 1}</td>
                                                    <td className="px-2 py-1">
                                                        <div className="relative">
                                                            <input 
                                                                value={row.Name} 
                                                                onChange={e => handleChange(row.id, 'Name', e.target.value)} 
                                                                className={`w-full px-3 py-2 border-2 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-bold transition-all ${hasError?.includes('품명') ? 'border-red-300 bg-red-50 text-red-600' : 'border-transparent group-hover:border-slate-100'}`} 
                                                                placeholder="부품명 입력..."
                                                            />
                                                            {hasError?.includes('품명') && <AlertTriangle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-1">
                                                        <select 
                                                            value={row.Category} 
                                                            onChange={e => handleChange(row.id, 'Category', e.target.value)} 
                                                            className={`w-full px-2 py-2 border-2 rounded-xl outline-none bg-transparent transition-all ${hasError?.includes('구분') ? 'border-red-200 text-red-500' : 'border-transparent group-hover:border-slate-100'}`}
                                                        >
                                                            <option>기구부품 (M)</option>
                                                            <option>전자부품 (E)</option>
                                                            <option>구매품 (O)</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-2 py-1"><input value={row.Spec} onChange={e => handleChange(row.id, 'Spec', e.target.value)} className="w-full px-3 py-2 border-2 border-transparent group-hover:border-slate-100 rounded-xl outline-none bg-transparent" placeholder="규격/사양" /></td>
                                                    <td className="px-2 py-1"><input value={row.Manufacturer} onChange={e => handleChange(row.id, 'Manufacturer', e.target.value)} className="w-full px-3 py-2 border-2 border-transparent group-hover:border-slate-100 rounded-xl outline-none bg-transparent" placeholder="제조사" /></td>
                                                    <td className="px-2 py-1"><input type="number" value={row.UnitPrice} onChange={e => handleChange(row.id, 'UnitPrice', e.target.value)} className="w-full px-3 py-2 border-2 border-transparent group-hover:border-slate-100 rounded-xl text-right text-green-600 font-black bg-transparent" /></td>
                                                    <td className="px-2 py-1"><input value={row.Description} onChange={e => handleChange(row.id, 'Description', e.target.value)} className="w-full px-3 py-2 border-2 border-transparent group-hover:border-slate-100 rounded-xl outline-none bg-transparent italic text-slate-400" placeholder="추가 설명..." /></td>
                                                    <td className="px-4 py-2 sticky right-0 bg-white/50 backdrop-blur group-hover:bg-blue-50/50 transition-colors">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => duplicateRow(index)} className="p-2 text-slate-300 hover:text-blue-600 hover:bg-white rounded-lg transition-all shadow-none hover:shadow-sm"><Copy size={14} /></button>
                                                            <button onClick={() => deleteRow(row.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-white rounded-lg transition-all shadow-none hover:shadow-sm"><Trash2 size={14} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-6 space-y-4">
                                    {rows.map((row, index) => {
                                        const isExpanded = expandedRowId === row.id;
                                        const hasError = errors[row.id];
                                        return (
                                            <div key={row.id} className={`bg-white rounded-2xl border transition-all ${isExpanded ? 'ring-2 ring-blue-500/20 border-blue-200' : 'border-slate-100 hover:border-slate-300'} ${hasError ? 'border-red-200' : ''}`}>
                                                <div className="px-6 py-4 flex items-center gap-4 cursor-pointer" onClick={() => toggleRow(row.id)}>
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${hasError ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
                                                    <div className="flex-1 font-bold text-slate-700">{row.Name || <span className="text-slate-300 italic">품명 미입력</span>}</div>
                                                    <div className="text-xs text-slate-400">{row.Category}</div>
                                                    <div className="flex items-center gap-1">
                                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </div>
                                                </div>
                                                {isExpanded && (
                                                    <div className="px-6 pb-6 pt-2 grid grid-cols-4 gap-4 animate-in slide-in-from-top-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-black text-slate-400 uppercase">Part Name</label>
                                                            <input value={row.Name} onChange={e => handleChange(row.id, 'Name', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-black text-slate-400 uppercase">Category</label>
                                                            <select value={row.Category} onChange={e => handleChange(row.id, 'Category', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none">
                                                                <option>기구부품 (M)</option>
                                                                <option>전자부품 (E)</option>
                                                                <option>구매품 (O)</option>
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-black text-slate-400 uppercase">Spec</label>
                                                            <input value={row.Spec} onChange={e => handleChange(row.id, 'Spec', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-black text-slate-400 uppercase">Manufacturer</label>
                                                            <input value={row.Manufacturer} onChange={e => handleChange(row.id, 'Manufacturer', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-center">
                            <button onClick={addRow} className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm group">
                                <Plus size={18} className="group-hover:rotate-90 transition-transform" />
                                <span>새 항목 추가</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-10 py-8 bg-white border-t border-slate-100 flex justify-between items-center relative z-20">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Processed</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-slate-900 leading-none">{rows.length.toLocaleString()}</span>
                                <span className="text-sm font-bold text-slate-400">Items</span>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-slate-100"></div>
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full animate-pulse ${Object.keys(errors).length === 0 ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'}`}></div>
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{Object.keys(errors).length === 0 ? 'All Data Valid' : `${Object.keys(errors).length} Errors Found`}</span>
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                        <button type="button" onClick={onClose} className="px-10 py-4 bg-slate-100 text-slate-500 font-black text-sm rounded-2xl hover:bg-slate-200 transition-all">나가기</button>
                        <button 
                            onClick={handleSubmit} 
                            disabled={isSubmitting || rows.length === 0} 
                            className="px-12 py-4 bg-blue-600 text-white font-black text-sm rounded-2xl shadow-2xl shadow-blue-500/40 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:grayscale disabled:scale-100"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>DATABASE COMMIT...</span>
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    <span>최종 일괄 저장 실행</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
