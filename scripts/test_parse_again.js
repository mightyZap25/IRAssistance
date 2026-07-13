import XLSX from 'xlsx';

async function test() {
    const url = 'https://docs.google.com/spreadsheets/d/1PyOyjCnZ1JeUtujmjhojF5b0eagexNz4iQ_MY3hPyUg/export?format=xlsx';
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    
    const tabName = wb.SheetNames[0];
    const worksheet = wb.Sheets[tabName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

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

        const itemData = {
            PartID: partId,
            Name: name || 'Unnamed Item',
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
                    note: `Lv ${level}`
                });
            }
        }
        parentStack.push({ partId: partId, level: level });
    }
    
    console.log(`Parsed ${parsedAccumulated.length} items, ${relationsAccumulated.length} relations.`);
    console.log("Relations:", relationsAccumulated.slice(0, 5));
}
test();
