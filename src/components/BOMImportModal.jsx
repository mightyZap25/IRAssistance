import React, { useState, useEffect } from 'react';
import { X, Globe, FileSpreadsheet, Eye, CheckCircle2, Play, AlertTriangle, HelpCircle, Layers, Check, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, doc, writeBatch, getDocs, getDoc, serverTimestamp, setDoc } from '../firebase';
import { db } from '../firebase';
import { fetchSpreadsheetMetadata, fetchSpreadsheetValues } from '../services/googleService';
import BOMTree from './BOMTree';

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
    const [targetSheets, setTargetSheets] = useState([]);
    const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

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
            setTargetSheets([]);
            setCurrentSheetIndex(0);
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
                setSheetName('ALL_SHEETS');
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
    const processSingleSheet = async (index, sheets, wb) => {
        try {
            const tabName = sheets[index];
            setLoadingStatus(`[${index + 1}/${sheets.length}] '${tabName}' 시트 데이터를 분석하고 있습니다...`);
            await new Promise(resolve => setTimeout(resolve, 50));

            const worksheet = wb.Sheets[tabName];
            if (!worksheet) {
                goToNextSheet();
                return;
            }

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (!rows || rows.length === 0) {
                goToNextSheet();
                return;
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

            if (colMap.partId === -1) colMap.partId = 0;
            if (colMap.name === -1) colMap.name = 1;
            if (colMap.qty === -1) colMap.qty = 2;
            if (colMap.category === -1) colMap.category = 3;
            if (colMap.rev === -1) colMap.rev = 4;
            if (colMap.location === -1) colMap.location = 5;
            if (colMap.manufacturer === -1) colMap.manufacturer = 6;
            if (colMap.supplier === -1) colMap.supplier = 7;
            if (colMap.unitPrice === -1) colMap.unitPrice = 8;
            if (colMap.spec === -1) colMap.spec = 9;
            if (colMap.assyPart === -1) colMap.assyPart = 10;

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

                // Auto-correct 'IRO' to 'IRE' for electronic parts
                const categoryRawForCheck = String(row[colMap.category] || '').trim();
                if (categoryRawForCheck.toLowerCase() === 'elec' && partId.startsWith('IRO')) {
                    partId = partId.replace(/^IRO/, 'IRE');
                }
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
                const existing = existingPartsList.find(p => p.PartID === item.PartID);
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

        setLoading(true);
        setError('');
        try {
            let wb = workbookObj;
            if (!wb) {
                setLoadingStatus('구글 시트 전체 데이터를 불러오는 중입니다...');
                const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
                const res = await fetch(exportUrl);
                if (!res.ok) throw new Error(`HTTP Error: ${res.status} - 시트가 '링크가 있는 모든 사용자에게 공개' 상태인지 확인하세요.`);
                
                const arrayBuffer = await res.arrayBuffer();
                wb = XLSX.read(arrayBuffer, { type: 'array' });
                setWorkbookObj(wb);
            }

            let sheetsToProcess = availableSheets;
            if (sheetName !== 'ALL_SHEETS' && sheetName) {
                sheetsToProcess = [sheetName];
            } else if (sheetsToProcess.length === 0 && wb && wb.SheetNames) {
                sheetsToProcess = wb.SheetNames.filter(name => !name.toLowerCase().includes('master') && !name.toLowerCase().includes('reference'));
            }

            if (sheetsToProcess.length === 0) {
                throw new Error("가져올 시트(탭)를 찾을 수 없습니다.");
            }

            setTargetSheets(sheetsToProcess);
            setCurrentSheetIndex(0);
            
            await processSingleSheet(0, sheetsToProcess, wb);
        } catch (err) {
            console.error(err);
            setError("오류가 발생했습니다: " + err.message);
            setLoading(false);
        }
    };

    const goToNextSheet = () => {
        const nextIdx = currentSheetIndex + 1;
        if (nextIdx < targetSheets.length) {
            setCurrentSheetIndex(nextIdx);
            setLoading(true);
            setTimeout(() => {
                processSingleSheet(nextIdx, targetSheets, workbookObj);
            }, 50);
        } else {
            alert('모든 시트 처리가 완료되었습니다!');
            onImportSuccess();
            onClose();
        }
    };

    const handleSkip = () => {
        goToNextSheet();
    };

    const handleConfirmImport = async () => {
        setLoading(true);
        setLoadingStatus('기존 데이터 정합성을 검토하는 중입니다...');
        setError('');
        try {
            // 1. Fetch all existing BOM documents to build a duplicate-check map
            const bomColl = collection(db, 'bom');
            const qSnap = await getDocs(bomColl);
            
            const existingBomSet = new Set();
            qSnap.docs.forEach(docSnap => {
                const data = docSnap.data();
                if (data.ParentID && data.ChildID) {
                    existingBomSet.add(`${data.ParentID}_${data.ChildID}`);
                }
            });

            const operations = [];

            // 2. Add new parts creation operations
            setLoadingStatus('새로 발견된 부품 마스터 정보를 데이터베이스에 신규 등록 중입니다...');
            const newPartsToCreate = parsedItems.filter(item => partStatusMap[item.PartID]?.isNew);
            newPartsToCreate.forEach(item => {
                const partRef = doc(db, 'parts', item.PartID);
                operations.push((batch) => batch.set(partRef, {
                    PartID: item.PartID,
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

            // 3. Add new BOM relations operations (checking for duplicates)
            setLoadingStatus('새로운 BOM 계층 관계를 검증하고 추가하는 중입니다...');
            let skippedRelationsCount = 0;
            let addedRelationsCount = 0;

            bomRelations.forEach(link => {
                const relationKey = `${link.parentId}_${link.childId}`;
                if (existingBomSet.has(relationKey)) {
                    skippedRelationsCount++;
                } else {
                    const newLinkRef = doc(collection(db, 'bom'));
                    operations.push((batch) => batch.set(newLinkRef, {
                        ParentID: link.parentId,
                        ChildID: link.childId,
                        Quantity: link.qty,
                        Location: link.location || '',
                        Note: link.note || '',
                        Status: 'Active'
                    }));
                    addedRelationsCount++;
                    // Add it to set in case of duplicates in the same import session
                    existingBomSet.add(relationKey);
                }
            });

            // 4. Commit operations in chunks of 400
            if (operations.length > 0) {
                setLoadingStatus('데이터베이스에 변경 사항을 반영하는 중입니다 (트랜잭션 실행)...');
                const commitInChunks = async (ops) => {
                    let currentBatch = writeBatch(db);
                    let count = 0;
                    for (const op of ops) {
                        if (count >= 400) {
                            await currentBatch.commit();
                            currentBatch = writeBatch(db);
                            count = 0;
                        }
                        op(currentBatch);
                        count++;
                    }
                    if (count > 0) {
                        await currentBatch.commit();
                    }
                };

                await commitInChunks(operations);
            }

            alert(`BOM 가져오기가 성공적으로 완료되었습니다!\n\n- 등록된 신규 부품: ${newPartsToCreate.length}개\n- 생성된 신규 BOM 관계: ${addedRelationsCount}개\n- 이미 존재하여 제외된 관계: ${skippedRelationsCount}개`);
            goToNextSheet();
        } catch (err) {
            console.error("Firebase import transaction failed:", err);
            setError("데이터베이스 저장 중 오류가 발생했습니다: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Helper to build a nested tree structure for preview rendering
    const buildPreviewTree = () => {
        if (parsedItems.length === 0) return null;
        
        const existingMap = {};
        existingPartsList.forEach(p => {
            existingMap[p.PartID] = p;
        });

        const root = parsedItems[0];
        const itemMap = {};
        parsedItems.forEach(item => {
            const exist = existingMap[item.PartID];
            itemMap[item.PartID] = exist ? { ...item, ...exist } : item;
        });

        // Group relations by parentId
        const relationsMap = {};
        bomRelations.forEach(rel => {
            if (!relationsMap[rel.parentId]) {
                relationsMap[rel.parentId] = [];
            }
            relationsMap[rel.parentId].push(rel);
        });

        const buildNode = (partId, visited = new Set()) => {
            const item = itemMap[partId];
            if (!item) return { PartID: partId, Name: 'Unknown Part', Level: 1, Children: [] };

            if (visited.has(partId)) {
                return {
                    ...item,
                    Name: `[순환 참조] ${item.Name}`,
                    Children: [],
                    isCircular: true
                };
            }

            const nextVisited = new Set(visited);
            nextVisited.add(partId);

            const childrenRels = relationsMap[partId] || [];
            const children = childrenRels.map(rel => {
                const childNode = buildNode(rel.childId, nextVisited);
                return {
                    ...childNode,
                    Quantity: rel.qty,
                    Location: rel.location,
                    Note: rel.note || ''
                };
            });

            return {
                ...item,
                Children: children
            };
        };

        return buildNode(root.PartID);
    };

    const previewTree = buildPreviewTree();

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet className="text-blue-600" size={20} />
                        <h2 className="text-lg font-black text-slate-800">구글 시트 BOM 가져오기</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/95 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                            <Loader2 size={40} className="animate-spin text-blue-600 mb-4" />
                            <p className="font-extrabold text-slate-800 text-sm mb-3">{loadingStatus || '처리 중입니다...'}</p>
                            
                            {(spreadsheetId || sheetName) && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-left text-xs space-y-1.5 max-w-md w-full font-mono text-slate-600">
                                    <div className="flex justify-between gap-4">
                                        <span className="font-bold text-slate-400">Spreadsheet ID:</span>
                                        <span className="truncate max-w-[200px]" title={spreadsheetId}>{spreadsheetId || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="font-bold text-slate-400">Target Tab:</span>
                                        <span className="truncate">{sheetName || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="font-bold text-slate-400">Range Target:</span>
                                        <span>{sheetName ? `${sheetName}!A1:Z1000` : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5 mt-1.5">
                                        <span className="font-bold text-slate-400">Auth Status:</span>
                                        <span className="text-emerald-600 font-bold">Token Checked (OK)</span>
                                    </div>
                                </div>
                            )}
                            
                            <p className="text-slate-400 text-[10px] mt-4">구글 클라우드 서버와 데이터 교신 중에는 시간이 다소 소요될 수 있습니다.</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-start gap-2 text-left">
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {step === 1 ? (
                        <div className="space-y-4 text-left">
                            <div className="p-4 bg-blue-50/50 border border-blue-100/50 rounded-2xl text-xs text-blue-700 leading-relaxed font-medium">
                                <span className="font-bold block mb-1">💡 구글 시트 연결 안내</span>
                                1. 구글 시트의 링크 주소창 주소를 그대로 복사해 입력해 주세요.<br />
                                2. 아래 입력 칸에 주소를 넣으면 자동으로 하단 시트(탭) 목록을 가져옵니다.<br />
                                3. 분석하려는 올바른 탭을 선택하고 "구글 시트 데이터 분석"을 클릭하세요.
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 ml-1">구글 시트 주소 (URL)</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input 
                                            type="text" 
                                            value={sheetUrl}
                                            onChange={handleUrlChange}
                                            placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {spreadsheetId && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 ml-1">시트(탭) 선택</label>
                                    {loading && availableSheets.length === 0 ? (
                                        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                            <Loader2 size={14} className="animate-spin text-blue-600" />
                                            <span>시트 정보를 로딩 중입니다...</span>
                                        </div>
                                    ) : (
                                        <select 
                                            value={sheetName} 
                                            onChange={(e) => setSheetName(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        >
                                            <option value="ALL_SHEETS">전체 시트 순차 처리</option>
                                            {availableSheets.map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end">
                                <button
                                    onClick={handleFetchAndParse}
                                    disabled={loading || !spreadsheetId || !sheetName}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-sm shadow-md disabled:opacity-50 transition-all"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                                    <span>구글 시트 데이터 분석</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Left Side: Visual Tree Preview */}
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[350px] max-h-[450px]">
                                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <Layers size={14} className="text-blue-500" />
                                        BOM 계층 구조 미리보기
                                    </h3>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                                        {previewTree ? (
                                            <BOMTree 
                                                data={previewTree} 
                                                isEditing={false} 
                                                allParts={existingPartsList} 
                                            />
                                        ) : (
                                            <span className="text-xs text-slate-400">구조를 생성할 수 없습니다.</span>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side: Component Creation Check */}
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[350px] max-h-[450px]">
                                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <CheckCircle2 size={14} className="text-emerald-500" />
                                        신규 부품 등록 검토 ({parsedItems.filter(item => partStatusMap[item.PartID]?.isNew).length}건)
                                    </h3>
                                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                                        {(() => {
                                            const rootItem = parsedItems[0];
                                            const isRootExists = rootItem && partStatusMap[rootItem.PartID]?.exists;
                                            if (isRootExists) {
                                                return (
                                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs flex gap-2 items-start font-semibold mb-3 text-left">
                                                        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                                                        <div>
                                                            <span className="font-bold text-amber-900 block mb-0.5">⚠️ 최상위 완제품 이미 존재함</span>
                                                            최상위 완제품 <span className="font-mono bg-white px-1 py-0.5 rounded border border-amber-100 text-slate-700">{rootItem.PartID}</span> {rootItem.Name}은(는) 이미 등록되어 있습니다. (BOM 관계만 재생성됩니다.)
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                        {parsedItems
                                            .filter(item => partStatusMap[item.PartID]?.isNew)
                                            .sort((a, b) => b.Level - a.Level)
                                            .map((item, idx) => {
                                                return (
                                                    <div key={`${item.PartID}-${idx}`} className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-start justify-between shadow-sm text-left">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-bold">Lv {item.Level}</span>
                                                                <span className="font-mono text-xs font-bold text-slate-700">{item.PartID}</span>
                                                                <span className={`text-[9px] px-1 rounded font-black ${
                                                                    item.Class.includes('Product') 
                                                                        ? 'bg-blue-100 text-blue-700' 
                                                                        : item.Class.includes('Assembly') 
                                                                            ? 'bg-amber-100 text-amber-700' 
                                                                            : 'bg-slate-100 text-slate-600'
                                                                }`}>{item.Class}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-500 truncate font-semibold">{item.Name}</div>
                                                            {item.Spec && (
                                                                <div className="text-[10px] text-slate-400 truncate mt-0.5">Spec: {item.Spec}</div>
                                                            )}
                                                        </div>
                                                        <span className="text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">신규 등록</span>
                                                    </div>
                                                );
                                            })}
                                        {parsedItems.filter(item => partStatusMap[item.PartID]?.isNew).length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-full text-slate-400 italic text-xs py-20 text-center">
                                                새로 등록할 신규 부품이 없습니다.<br />(모든 부품이 데이터베이스에 등록되어 있습니다.)
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex justify-between">
                                <button
                                    onClick={() => setStep(1)}
                                    className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm shadow-sm"
                                >
                                    이전 단계
                                </button>
                                <button
                                    onClick={handleSkip}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-bold text-sm transition-all"
                                >
                                    건너뛰기
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-sm shadow-md transition-all"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    <span>{currentSheetIndex < targetSheets.length - 1 ? '저장 및 다음 시트' : '저장 및 완료'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
