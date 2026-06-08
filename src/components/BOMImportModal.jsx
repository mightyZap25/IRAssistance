import React, { useState, useEffect } from 'react';
import { X, Globe, FileSpreadsheet, Eye, CheckCircle2, Play, AlertTriangle, HelpCircle, Layers, Check, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, doc, writeBatch, getDocs, serverTimestamp } from '../firebase';
import { db } from '../firebase';
import BOMTree from './BOMTree';

// Helper to normalize Part IDs for robust comparison (strips out revision suffixes like -1.0, _v1.1)
function normalizePartId(id) {
    if (!id) return '';
    let normalized = String(id).trim().toUpperCase();
    // Remove revision suffixes if present (e.g., -1.0, -1.1, _1.0)
    normalized = normalized.replace(/[-_]v?\d+\.\d+$/i, '');
    return normalized;
}

export default function BOMImportModal({ isOpen, onClose, onImportSuccess, allParts: existingPartsList }) {
    const [sheetUrl, setSheetUrl] = useState('');
    const [sheetName, setSheetName] = useState('');
    const [availableSheets, setAvailableSheets] = useState([]);
    
    const [step, setStep] = useState(1); // 1: URL & Tab input, 2: Preview & Validation
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [error, setError] = useState('');
    
    // Parsed Data State
    const [parsedItems, setParsedItems] = useState([]);
    const [bomRelations, setBomRelations] = useState([]); // Array of { parentId, childId, qty, location, note }
    const [partStatusMap, setPartStatusMap] = useState({}); // partId -> { exists: bool, data: obj, isNew: bool }
    
    const [spreadsheetId, setSpreadsheetId] = useState('');
    const [workbookObj, setWorkbookObj] = useState(null);

    useEffect(() => {
        if (!isOpen) {
            // Reset states
            setSheetUrl('');
            setSheetName('');
            setAvailableSheets([]);
            setStep(1);
            setLoading(false);
            setLoadingStatus('');
            setError('');
            setParsedItems([]);
            setBomRelations([]);
            setPartStatusMap({});
            setSpreadsheetId('');
            setWorkbookObj(null);
        }
    }, [isOpen]);

    // Extract Spreadsheet ID from Google Sheet URL
    const handleUrlChange = async (e) => {
        const url = e.target.value;
        setSheetUrl(url);
        setError('');
        
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
            const spId = match[1];
            setSpreadsheetId(spId);
            fetchSheetsList(spId);
        } else {
            setAvailableSheets([]);
            setSpreadsheetId('');
        }
    };

    const fetchSheetsList = async (spId) => {
        setLoading(true);
        setLoadingStatus('구글 시트 엑셀 데이터를 다운로드하여 분석 중입니다...');
        setError('');
        try {
            const exportUrl = `https://docs.google.com/spreadsheets/d/${spId}/export?format=xlsx`;
            const res = await fetch(exportUrl);
            if (!res.ok) throw new Error(`HTTP Error: ${res.status} - 시트가 '링크가 있는 모든 사용자에게 공개' 상태인지 확인하세요.`);
            
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            
            if (workbook && workbook.SheetNames) {
                setAvailableSheets(workbook.SheetNames);
                setSheetName(''); // Clear or set default
            } else {
                throw new Error("시트 목록을 가져오지 못했습니다.");
            }
        } catch (err) {
            console.error("Failed to fetch sheet metadata via XLSX:", err);
            setError("구글 시트 탭 목록을 가져오는데 실패했습니다. 올바른 주소 및 시트 공유 권한을 확인해 주세요.");
        } finally {
            setLoading(false);
        }
    };

    // Parse the fetched Google Sheet cells
    const processSingleSheet = async (tabName, wb) => {
        try {
            setLoadingStatus(`'${tabName}' 시트 데이터를 분석하고 있습니다...`);
            await new Promise(resolve => setTimeout(resolve, 50));

            const worksheet = wb.Sheets[tabName];
            if (!worksheet) {
                throw new Error(`'${tabName}' 시트를 찾을 수 없습니다.`);
            }

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (!rows || rows.length === 0) {
                throw new Error(`'${tabName}' 시트에 데이터가 없습니다.`);
            }

            let headerRowIdx = -1;
            for (let i = 0; i < rows.length; i++) {
                const rowArr = rows[i] || [];
                const rowStr = rowArr.map(c => String(c || '').toLowerCase()).join(' ');
                if (rowStr.includes('part number') || rowStr.includes('partname') || rowStr.includes('assy /')) {
                    headerRowIdx = i;
                    break;
                }
            }

            if (headerRowIdx === -1) headerRowIdx = 0;

            const rawHeaders = rows[headerRowIdx] || [];
            const headers = [];
            for (let j = 0; j < rawHeaders.length; j++) {
                headers.push(rawHeaders[j] ? String(rawHeaders[j]).trim() : '');
            }

            const colMap = {
                levelCol: headers.findIndex(h => { const l = h.toLowerCase(); return l === 'level' || l === 'lv' || l === 'lvl' || l.includes('레벨') || l.includes('계층') || l.includes('단계') || l.includes('등급'); }),
                category: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('category') || l.includes('카테고리') || l.includes('분류') || l.includes('subsys'); }),
                partId: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('part number') || l.includes('partid') || l.includes('part id') || l.includes('품번') || l.includes('도면번호') || l.includes('자재번호') || l.includes('파트넘버'); }),
                rev: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('rev') || l.includes('리비전') || l.includes('버전'); }),
                name: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('part name') || l.includes('partname') || l.includes('description') || l.includes('desc') || l.includes('품명') || l.includes('부품명') || l.includes('이름'); }),
                assyPart: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('assy') || l.includes('class') || l.includes('구분'); }),
                qty: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes("q'ty") || l.includes('qty') || l.includes('quantity') || l.includes('수량') || l.includes('수'); }),
                location: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('location') || l.includes('e-comp') || l.includes('위치') || l.includes('로케이션'); }),
                manufacturer: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('manufacturer') || l.includes('maker') || l.includes('제조사') || l.includes('메이커'); }),
                supplier: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('supplier') || l.includes('vendor') || l.includes('공급사') || l.includes('구매처'); }),
                unitPrice: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('unit price') || l.includes('price') || l.includes('단가') || l.includes('가격'); }),
                spec: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('manufacturer no') || l.includes('mfn') || l.includes('spec') || l.includes('규격') || l.includes('스펙'); }),
            };

            // Defaults if not found
            if (colMap.partId === -1) colMap.partId = 0;
            if (colMap.name === -1) colMap.name = 1;

            const parsedAccumulated = [];
            const relationsAccumulated = [];
            const seenPartIds = new Set();
            const seenRelations = new Set();
            const parentStack = [];
            let parsedCountInTab = 0;

            for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                let partIdRaw = row[colMap.partId];
                let level = -1;

                if (!partIdRaw && colMap.levelCol === -1) {
                    for (let col = 0; col < 10; col++) {
                        if (row[col] !== undefined && String(row[col]).trim() !== '') {
                            partIdRaw = row[col];
                            level = col + 1;
                            break;
                        }
                    }
                }

                if (!partIdRaw) continue;
                let partId = String(partIdRaw).trim();
                if (!partId || partId.toLowerCase() === 'n/a') continue;

                if (colMap.levelCol !== -1 && row[colMap.levelCol] !== undefined && String(row[colMap.levelCol]).trim() !== '') {
                    const levelStr = String(row[colMap.levelCol]).trim();
                    if (levelStr.includes('.')) {
                        level = levelStr.split('.').length;
                    } else {
                        level = parseInt(levelStr.replace(/[^0-9]/g, ''), 10);
                    }
                }

                if (isNaN(level) || level === -1) {
                    for (let col = 0; col < 9; col++) {
                        if (row[col] !== undefined && String(row[col]).trim() !== '') {
                            level = col + 1;
                            break;
                        }
                    }
                }

                if (level === -1) continue;

                const name = String(row[colMap.name] || '').trim();
                const categoryRaw = String(row[colMap.category] || '').trim();
                const rev = String(row[colMap.rev] || '1.0').trim();
                
                const assyPartText = String(row[colMap.assyPart] || '').trim().toUpperCase();
                const isAssembly = assyPartText.startsWith('A') || assyPartText.includes('ASSY') || partId.startsWith('IRA') || partId.startsWith('IRP');
                
                let partClass = 'Part (I)';
                if (isAssembly) {
                    if (parsedCountInTab === 0) {
                        partClass = 'Product (P)';
                    } else {
                        partClass = 'Assembly (A)';
                    }
                }
                
                const qtyRaw = String(row[colMap.qty] || '1').replace(/,/g, '');
                const qty = parseFloat(qtyRaw) || 1;

                const location = String(row[colMap.location] || '').trim();
                const manufacturer = String(row[colMap.manufacturer] || '').trim();
                const supplier = String(row[colMap.supplier] || '').trim();
                
                const priceRaw = String(row[colMap.unitPrice] || '0').replace(/[^0-9.]/g, '');
                const unitPrice = parseFloat(priceRaw) || 0;
                const spec = String(row[colMap.spec] || '').trim();

                const itemData = {
                    PartID: partId,
                    Name: name || 'Unnamed Item',
                    Category: categoryRaw,
                    Class: partClass,
                    Rev: rev,
                    Spec: spec,
                    UnitPrice: unitPrice,
                    Manufacturer: manufacturer,
                    Supplier: supplier,
                    Location: location,
                    Level: level
                };

                if (!seenPartIds.has(partId)) {
                    seenPartIds.add(partId);
                    parsedAccumulated.push(itemData);
                }
                parsedCountInTab++;

                while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
                    parentStack.pop();
                }

                if (parentStack.length > 0) {
                    const parent = parentStack[parentStack.length - 1];
                    const relKey = `${parent.partId}_${partId}`;
                    if (!seenRelations.has(relKey)) {
                        seenRelations.add(relKey);
                        relationsAccumulated.push({
                            parentId: parent.partId,
                            childId: partId,
                            qty: qty,
                            location: location,
                            note: `Lv ${level}`
                        });
                    }
                }

                parentStack.push({ partId: partId, level: level });
            }

            const statusMap = {};
            for (const item of parsedAccumulated) {
                const targetId = normalizePartId(item.PartID);
                const existing = existingPartsList.find(p => {
                    const dbId = normalizePartId(p.PartID);
                    const dbMaster = p.MasterPartID ? normalizePartId(p.MasterPartID) : dbId;
                    return dbId === targetId || dbMaster === targetId;
                });
                statusMap[item.PartID] = {
                    exists: !!existing,
                    data: existing || null,
                    isNew: !existing
                };
            }

            setParsedItems(parsedAccumulated);
            setBomRelations(relationsAccumulated);
            setPartStatusMap(statusMap);
            setStep(2);
        } catch (err) {
            console.error(err);
            setError("데이터 분석 중 오류가 발생했습니다: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchAndParse = async () => {
        if (!spreadsheetId) {
            setError("올바른 구글 시트 주소를 입력하세요.");
            return;
        }
        if (!sheetName) {
            setError("가져올 시트를 선택해 주세요.");
            return;
        }

        setLoading(true);
        setError('');
        try {
            let wb = workbookObj;
            if (!wb) {
                const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
                const res = await fetch(exportUrl);
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();
                wb = XLSX.read(arrayBuffer, { type: 'array' });
                setWorkbookObj(wb);
            }
            await processSingleSheet(sheetName, wb);
        } catch (err) {
            console.error(err);
            setError("오류가 발생했습니다: " + err.message);
            setLoading(false);
        }
    };

    const handleConfirmImport = async () => {
        setLoading(true);
        setLoadingStatus('기존 데이터 정합성을 검토하는 중입니다...');
        setError('');
        try {
            const bomColl = collection(db, 'bom');
            const qSnap = await getDocs(bomColl);
            const existingBomMap = new Map();
            qSnap.docs.forEach(docSnap => {
                const data = docSnap.data();
                if (data.ParentID && data.ChildID) {
                    const pId = normalizePartId(data.ParentID);
                    const cId = normalizePartId(data.ChildID);
                    existingBomMap.set(`${pId}_${cId}`, docSnap.ref);
                }
            });

            const operations = [];

            // 1. Create new parts
            const newPartsToCreate = parsedItems.filter(item => partStatusMap[item.PartID]?.isNew);
            newPartsToCreate.forEach(item => {
                const finalPartId = normalizePartId(item.PartID); // 새 정책에 따라 PartID에서 리비전 제거
                const partRef = doc(db, 'parts', finalPartId);
                operations.push((batch) => batch.set(partRef, {
                    PartID: finalPartId,
                    MasterPartID: finalPartId,
                    Name: item.Name,
                    Class: item.Class,
                    Category: item.Category,
                    Rev: item.Rev || '1.0',
                    Spec: item.Spec || '',
                    UnitPrice: item.UnitPrice || 0,
                    Manufacturer: item.Manufacturer || '',
                    Supplier: item.Supplier || '',
                    DefaultLocation: item.Location || '',
                    Lifecycle: 'Active',
                    Status: 'Active',
                    IsLatestRevision: true,
                    CreatedAt: serverTimestamp()
                }));
            });

            // 2. Create or Update BOM relations
            let addedRelationsCount = 0;
            let updatedRelationsCount = 0;
            
            bomRelations.forEach(link => {
                const pId = normalizePartId(link.parentId);
                const cId = normalizePartId(link.childId);
                const relationKey = `${pId}_${cId}`;
                
                if (existingBomMap.has(relationKey)) {
                    // Update existing BOM relation (Qty, Location, Note)
                    const existingRef = existingBomMap.get(relationKey);
                    operations.push((batch) => batch.update(existingRef, {
                        Quantity: link.qty,
                        Location: link.location || '',
                        Note: link.note || ''
                    }));
                    updatedRelationsCount++;
                } else {
                    const newLinkRef = doc(collection(db, 'bom'));
                    operations.push((batch) => batch.set(newLinkRef, {
                        ParentID: pId, // DB에는 정규화된 ID를 저장
                        ChildID: cId,
                        Quantity: link.qty,
                        Location: link.location || '',
                        Note: link.note || '',
                        Status: 'Active'
                    }));
                    addedRelationsCount++;
                    existingBomMap.set(relationKey, newLinkRef);
                }
            });

            if (operations.length > 0) {
                let currentBatch = writeBatch(db);
                let count = 0;
                for (const op of operations) {
                    if (count >= 400) {
                        await currentBatch.commit();
                        currentBatch = writeBatch(db);
                        count = 0;
                    }
                    op(currentBatch);
                    count++;
                }
                if (count > 0) await currentBatch.commit();
            }

            alert(`BOM 가져오기가 성공적으로 완료되었습니다!\n\n- 등록된 신규 품목: ${newPartsToCreate.length}개\n- 생성된 신규 BOM 관계: ${addedRelationsCount}개\n- 갱신된 기존 BOM 관계: ${updatedRelationsCount}개`);
            onImportSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            setError("데이터베이스 저장 중 오류가 발생했습니다: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const buildPreviewTree = () => {
        if (parsedItems.length === 0) return null;
        const root = parsedItems[0];
        const itemMap = {};
        parsedItems.forEach(item => {
            const targetId = normalizePartId(item.PartID);
            const exist = existingPartsList.find(p => {
                const dbId = normalizePartId(p.PartID);
                const dbMaster = p.MasterPartID ? normalizePartId(p.MasterPartID) : dbId;
                return dbId === targetId || dbMaster === targetId;
            });
            itemMap[item.PartID] = exist ? { ...item, ...exist } : item;
        });
        const relationsMap = {};
        bomRelations.forEach(rel => {
            if (!relationsMap[rel.parentId]) relationsMap[rel.parentId] = [];
            relationsMap[rel.parentId].push(rel);
        });

        const buildNode = (partId, visited = new Set()) => {
            const item = itemMap[partId];
            if (!item) return { PartID: partId, Name: 'Unknown Part', Level: 1, Children: [] };
            if (visited.has(partId)) return { ...item, Name: `[순환 참조] ${item.Name}`, Children: [], isCircular: true };
            
            const nextVisited = new Set(visited);
            nextVisited.add(partId);
            const children = (relationsMap[partId] || []).map(rel => ({
                ...buildNode(rel.childId, nextVisited),
                Quantity: rel.qty,
                Location: rel.location,
                Note: rel.note || ''
            }));
            return { ...item, Children: children };
        };
        return buildNode(root.PartID);
    };

    const previewTree = buildPreviewTree();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet className="text-blue-600" size={20} />
                        <h2 className="text-lg font-black text-slate-800">구글 시트 BOM 가져오기 (단일 시트)</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 text-center">
                            <Loader2 size={40} className="animate-spin text-blue-600 mb-4" />
                            <p className="font-bold text-slate-800">{loadingStatus || '처리 중입니다...'}</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-start gap-2">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {step === 1 ? (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500">구글 시트 주소 (URL)</label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        type="text" 
                                        value={sheetUrl}
                                        onChange={handleUrlChange}
                                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                                    />
                                </div>
                            </div>

                            {spreadsheetId && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500">가져올 시트(탭) 선택</label>
                                    <select 
                                        value={sheetName} 
                                        onChange={(e) => setSheetName(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                                    >
                                        <option value="">시트를 선택하세요</option>
                                        {availableSheets.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="pt-4 flex justify-end">
                                <button
                                    onClick={handleFetchAndParse}
                                    disabled={loading || !spreadsheetId || !sheetName}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-sm disabled:opacity-50"
                                >
                                    <Play size={16} />
                                    <span>시트 데이터 분석</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col h-[400px]">
                                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <Layers size={14} className="text-blue-500" />
                                        BOM 계층 구조 미리보기 (탭: {sheetName})
                                    </h3>
                                    <div className="flex-1 overflow-y-auto">
                                        {previewTree ? (
                                            <BOMTree data={previewTree} isEditing={false} allParts={existingPartsList} />
                                        ) : (
                                            <span className="text-xs text-slate-400">구조를 생성할 수 없습니다.</span>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col h-[400px]">
                                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <CheckCircle2 size={14} className="text-emerald-500" />
                                        신규 등록 예정 부품 ({parsedItems.filter(item => partStatusMap[item.PartID]?.isNew).length}건)
                                    </h3>
                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                        {parsedItems
                                            .filter(item => partStatusMap[item.PartID]?.isNew)
                                            .sort((a, b) => b.Level - a.Level)
                                            .map((item, idx) => {
                                                const isElectronic = (item.Category || '').includes('전자') || (item.PartID || '').startsWith('IRE');
                                                const isMechanical = (item.Category || '').includes('기구') || (item.PartID || '').startsWith('IRM');
                                                const isProduct = item.Class.includes('Product');
                                                const isAssembly = item.Class.includes('Assembly');

                                                let cardStyle = "bg-white border-slate-100";
                                                let nameStyle = "text-slate-700";
                                                let classBadge = "bg-slate-500 text-white";
                                                let className = "단품";

                                                if (isProduct) {
                                                    cardStyle = "bg-blue-50/50 border-blue-100";
                                                    nameStyle = "text-blue-800";
                                                    classBadge = "bg-blue-600 text-white";
                                                    className = "완제품";
                                                } else if (isAssembly) {
                                                    cardStyle = "bg-amber-50/50 border-amber-100";
                                                    nameStyle = "text-amber-800";
                                                    classBadge = "bg-amber-500 text-white";
                                                    className = "조립품";
                                                }

                                                return (
                                                    <div key={idx} className={`border rounded-xl p-3 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md ${cardStyle}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-black">Lv {item.Level}</span>
                                                                <span className="font-mono text-xs font-black text-slate-800 tracking-tighter">{item.PartID}</span>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                {isElectronic && (
                                                                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-black">전자부품</span>
                                                                )}
                                                                {isMechanical && (
                                                                    <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-black">기구부품</span>
                                                                )}
                                                                {!isElectronic && !isMechanical && item.Category && (
                                                                    <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-black">{item.Category}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className={`text-xs font-black truncate ${nameStyle}`}>{item.Name}</div>
                                                            <div className="flex items-center justify-between mt-1.5 gap-2">
                                                                <select 
                                                                    value={item.Class}
                                                                    onChange={(e) => {
                                                                        const newClass = e.target.value;
                                                                        setParsedItems(prev => prev.map(p => 
                                                                            p.PartID === item.PartID ? { ...p, Class: newClass } : p
                                                                        ));
                                                                    }}
                                                                    className={`text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-tight outline-none cursor-pointer border ${classBadge}`}
                                                                >
                                                                    <option value="Product (P)" className="bg-white text-slate-800">완제품 (Product)</option>
                                                                    <option value="Assembly (A)" className="bg-white text-slate-800">조립품 (Assembly)</option>
                                                                    <option value="Part (I)" className="bg-white text-slate-800">단품 (Part)</option>
                                                                </select>
                                                                {item.Spec && (
                                                                    <span className="text-[9px] text-slate-400 font-bold truncate flex-1 text-right" title={item.Spec}>
                                                                        {item.Spec}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex justify-between">
                                <button
                                    onClick={() => setStep(1)}
                                    className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm"
                                >
                                    이전 단계
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-sm shadow-md"
                                >
                                    <Check size={16} />
                                    <span>BOM 데이터 저장하기</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
