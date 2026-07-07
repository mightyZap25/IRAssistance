import React, { useState } from 'react';
import { Play, Globe, CheckCircle2, Loader2, AlertTriangle, FileSpreadsheet, RefreshCw, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

function normalizePartId(id) {
    if (!id) return '';
    let normalized = String(id).trim().toUpperCase();
    normalized = normalized.replace(/[-_]v?\d+\.\d+$/i, '');
    return normalized;
}

export default function OdooBulkBOMSync() {
    const [sheetUrl, setSheetUrl] = useState('');
    const [spreadsheetId, setSpreadsheetId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, fetching_sheets, syncing, complete, error
    const [errorMsg, setErrorMsg] = useState('');
    const [overwriteExisting, setOverwriteExisting] = useState(false);
    
    // Progress state
    const [totalSheets, setTotalSheets] = useState(0);
    const [currentSheetIdx, setCurrentSheetIdx] = useState(0);
    const [currentSheetName, setCurrentSheetName] = useState('');
    
    // Logs
    const [logs, setLogs] = useState([]);

    const addLog = (type, message) => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), type, message }]);
    };

    const handleUrlChange = (e) => {
        const url = e.target.value;
        setSheetUrl(url);
        setErrorMsg('');
        
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
            setSpreadsheetId(match[1]);
        } else {
            setSpreadsheetId('');
        }
    };

    const parseSheetData = (tabName, wb) => {
        const worksheet = wb.Sheets[tabName];
        if (!worksheet) throw new Error(`시트 없음`);

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (!rows || rows.length === 0) throw new Error(`데이터 없음`);

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
            levelCol: headers.findIndex(h => { const l = h.toLowerCase(); return l === 'level' || l === 'lv' || l === 'lvl' || l.includes('레벨') || l.includes('계층'); }),
            category: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('category') || l.includes('카테고리') || l.includes('분류'); }),
            partId: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('part number') || l.includes('partid') || l.includes('품번') || l.includes('자재번호'); }),
            rev: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('rev') || l.includes('버전'); }),
            name: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('part name') || l.includes('품명') || l.includes('이름'); }),
            assyPart: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('assy') || l.includes('구분'); }),
            qty: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes("q'ty") || l.includes('qty') || l.includes('수량'); }),
            location: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('location') || l.includes('위치'); }),
            manufacturer: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('manufacturer') || l.includes('제조사'); }),
            supplier: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('supplier') || l.includes('공급사') || l.includes('구매처'); }),
            unitPrice: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('unit price') || l.includes('단가'); }),
            spec: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('mfn') || l.includes('spec') || l.includes('규격') || l.includes('스펙') || l.includes('model / code'); }),
        };

        if (colMap.partId === -1) colMap.partId = 0;
        if (colMap.name === -1) colMap.name = 1;

        const parsedAccumulated = [];
        const relationsAccumulated = [];
        const seenPartIds = new Set();
        const seenRelations = new Set();
        const parentStack = [];
        let absoluteRootParentId = null;
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

            if (colMap.levelCol !== -1 && row[colMap.levelCol] !== undefined && row[colMap.levelCol] !== null && String(row[colMap.levelCol]).trim() !== '') {
                const levelStr = String(row[colMap.levelCol]).trim();
                if (levelStr.includes('.')) {
                    level = levelStr.split('.').length;
                } else {
                    level = parseInt(levelStr.replace(/[^0-9]/g, ''), 10);
                }
            }

            // 들여쓰기 방식(계단식) 시트인 경우 열 위치로 레벨 추론
            if (isNaN(level) || level === -1) {
                for (let col = 0; col < 9; col++) {
                    if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
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
            
            let isAccessory = false;
            if (assyPartText === 'MECH-A' || assyPartText.includes('MECH-A')) {
                isAccessory = true;
            }

            if (!isAccessory && !absoluteRootParentId) {
                absoluteRootParentId = partId;
            }

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


            let finalCategory = categoryRaw;
            let finalClass = partClass;
            let finalTypeCode = 'A';

            if (partId && partId.startsWith('IR') && partId.length >= 5) {
                const catChar = partId.charAt(2).toUpperCase();
                const clsChar = partId.charAt(3).toUpperCase();
                const typeChar = partId.charAt(4).toUpperCase();
                
                if (catChar === 'E') finalCategory = '전자부품 (E)';
                else if (catChar === 'O') finalCategory = '구매품 (O)';
                else finalCategory = '기구부품 (M)';
                
                if (clsChar === 'A') finalClass = 'Assembly (A)';
                else if (clsChar === 'P') finalClass = 'Product (P)';
                else finalClass = 'Part (I)';
                
                finalTypeCode = typeChar;
            }

            const itemData = {
                PartID: partId,
                Name: name || 'Unnamed Item',
                Category: finalCategory,
                Class: finalClass,
                PartTypeCode: finalTypeCode,
                Rev: rev,
                Spec: String(row[colMap.spec] || '').trim(),
                UnitPrice: parseFloat(String(row[colMap.unitPrice] || '0').replace(/[^0-9.]/g, '')) || 0,
                Manufacturer: String(row[colMap.manufacturer] || '').trim(),
                Supplier: String(row[colMap.supplier] || '').trim(),
                Location: String(row[colMap.location] || '').trim(),
                Level: level
            };

            if (!seenPartIds.has(partId)) {
                seenPartIds.add(partId);
                parsedAccumulated.push(itemData);
            }
            parsedCountInTab++;

            if (isAccessory) {
                if (absoluteRootParentId) {
                    const relKey = `${absoluteRootParentId}_${partId}`;
                    if (!seenRelations.has(relKey)) {
                        seenRelations.add(relKey);
                        relationsAccumulated.push({
                            parentId: absoluteRootParentId,
                            childId: partId,
                            qty: qty,
                            location: itemData.Location,
                            note: `Lv Accessory`
                        });
                    }
                }
                continue;
            }

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
                        location: itemData.Location,
                        note: `Lv ${level}`
                    });
                }
            }
            parentStack.push({ partId: partId, level: level });
        }
        
        return { items: parsedAccumulated, relations: relationsAccumulated };
    };

    const handleStartSync = async () => {
        if (!spreadsheetId) {
            setErrorMsg("올바른 구글 시트 주소를 입력하세요.");
            return;
        }

        setStatus('fetching_sheets');
        setErrorMsg('');
        setLogs([]);
        addLog('info', '구글 시트 메타데이터를 다운로드하는 중입니다...');

        try {
            let finalId = spreadsheetId.trim();
            const match = finalId.match(/[-\w]{25,}/);
            if (match) {
                finalId = match[0];
            }

            const exportUrl = `/api/proxy-sheet/${finalId}`;
            const res = await fetch(exportUrl);
            if (!res.ok) throw new Error(`HTTP Error: ${res.status} - 시트 권한을 확인하세요.`);
            
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            
            if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error("시트 목록을 가져오지 못했습니다.");
            }

            const sheetsToProcess = workbook.SheetNames;
            setTotalSheets(sheetsToProcess.length);
            setStatus('syncing');
            addLog('success', `총 ${sheetsToProcess.length}개의 시트를 발견했습니다. 동기화를 시작합니다.`);

            for (let i = 0; i < sheetsToProcess.length; i++) {
                const sheetName = sheetsToProcess[i];
                setCurrentSheetIdx(i + 1);
                setCurrentSheetName(sheetName);
                
                try {
                    addLog('info', `[${i + 1}/${sheetsToProcess.length}] '${sheetName}' 시트 파싱 중...`);
                    // Delay slightly for UI responsiveness
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    const { items, relations } = parseSheetData(sheetName, workbook);
                    
                    if (items.length === 0) {
                        addLog('warning', `[${sheetName}] 유효한 데이터가 없어 건너뜁니다.`);
                        continue;
                    }
                    
                    addLog('info', `[${sheetName}] 품목 ${items.length}개, 관계 ${relations.length}개 발견. Odoo 전송 시작...`);
                    
                    const response = await fetch('/api/odoo/import-bom', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items, relations, overwriteExisting })
                    });
                    
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || 'Odoo 전송 실패');
                    }
                    
                    addLog('success', `[${sheetName}] Odoo 동기화 완료!`);
                } catch (sheetErr) {
                    addLog('error', `[${sheetName}] 처리 오류: ${sheetErr.message}`);
                }
            }

            setStatus('complete');
            addLog('success', '✅ 모든 시트의 Odoo 일괄 동기화가 완료되었습니다.');
            
        } catch (err) {
            console.error(err);
            setStatus('error');
            setErrorMsg("오류가 발생했습니다: " + err.message);
            addLog('error', `프로세스 중단: ${err.message}`);
        }
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <RefreshCw size={18} className="text-indigo-600" /> 
                    Odoo BOM 일괄 동기화 (Bulk Sync)
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-bold">
                    구글 시트 문서 내의 모든 탭을 순회하며 Odoo 품목 및 BOM(자재명세서)을 자동으로 생성하고 연결합니다. <br/>
                    <span className="text-indigo-600">※ 동일한 조립품은 중복 생성되지 않고 기존 객체를 재활용하여 연결됩니다.</span>
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700">Odoo BOM 구글 시트 주소 (URL)</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                type="text" 
                                value={sheetUrl}
                                onChange={handleUrlChange}
                                disabled={status === 'fetching_sheets' || status === 'syncing'}
                                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 disabled:opacity-50"
                            />
                        </div>
                        <button
                            onClick={handleStartSync}
                            disabled={!spreadsheetId || status === 'fetching_sheets' || status === 'syncing'}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-black text-sm flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                        >
                            {status === 'fetching_sheets' || status === 'syncing' ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Play size={16} />
                            )}
                            일괄 동기화 시작
                        </button>
                    </div>
                </div>

                <div className="flex items-center bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 shadow-sm transition-all hover:bg-indigo-50 cursor-pointer" onClick={() => setOverwriteExisting(!overwriteExisting)}>
                    <div className="flex-shrink-0">
                        <input 
                            type="checkbox" 
                            id="odooOverwrite"
                            checked={overwriteExisting}
                            onChange={(e) => { e.stopPropagation(); setOverwriteExisting(e.target.checked); }}
                            className="w-5 h-5 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500 cursor-pointer"
                        />
                    </div>
                    <div className="ml-3">
                        <label htmlFor="odooOverwrite" className="text-sm font-black text-indigo-900 cursor-pointer pointer-events-none">기존 항목 덮어쓰기 (강제 업데이트)</label>
                        <p className="text-xs text-indigo-700 mt-0.5">체크 시, Odoo에 이미 존재하는 품목도 시트의 최신 정보로 덮어씁니다.</p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-start gap-2">
                        <AlertTriangle size={16} className="shrink-0" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Progress Bar Area */}
                {(status === 'syncing' || status === 'complete') && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-black text-slate-700">
                                전체 진행 상황 ({currentSheetIdx} / {totalSheets})
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                                현재 처리 중: <span className="text-indigo-600">'{currentSheetName}'</span>
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(currentSheetIdx / totalSheets) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {/* Log Terminal */}
                {logs.length > 0 && (
                    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-inner flex flex-col h-64 border border-slate-800">
                        <div className="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700 shrink-0">
                            <FileSpreadsheet size={14} className="text-slate-400" />
                            <span className="text-xs font-black text-slate-300 tracking-wider">SYNC TERMINAL</span>
                        </div>
                        <div className="p-4 overflow-y-auto font-mono text-[11px] space-y-1.5 flex-1 custom-scrollbar">
                            {logs.map((log, idx) => (
                                <div key={idx} className="flex gap-3">
                                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                                    <span className={`
                                        ${log.type === 'info' ? 'text-blue-300' : ''}
                                        ${log.type === 'success' ? 'text-emerald-400 font-bold' : ''}
                                        ${log.type === 'warning' ? 'text-amber-300' : ''}
                                        ${log.type === 'error' ? 'text-rose-400 font-bold' : ''}
                                    `}>
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
