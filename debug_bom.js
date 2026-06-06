import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1W2vw3bErVZaOYQagJYxUWeUzh4faTiddhm8JsRJZTSQ/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    
    let headerRowIdx = 0;
    const rawHeaders = rows[headerRowIdx] || [];
    const headers = [];
    for (let j = 0; j < rawHeaders.length; j++) {
        headers.push(rawHeaders[j] ? String(rawHeaders[j]).trim() : '');
    }

    const colMap = {
        levelCol: headers.findIndex(h => { const l = h.toLowerCase(); return l === 'level' || l === 'lv' || l === 'lvl' || l.includes('레벨') || l.includes('계층') || l.includes('단계') || l.includes('등급'); }),
        partId: headers.findIndex(h => { const l = h.toLowerCase(); return l.includes('part number') || l.includes('partid') || l.includes('part id') || l.includes('품번') || l.includes('도면번호') || l.includes('자재번호') || l.includes('파트넘버'); }),
    };

    console.log("colMap.levelCol:", colMap.levelCol);
    console.log("colMap.partId:", colMap.partId);

    const parsedAccumulated = [];
    const relationsAccumulated = [];
    const parentStack = []; 

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const partIdRaw = row[colMap.partId];
        if (!partIdRaw) continue;
        const partId = String(partIdRaw).trim();

        let level = -1;
        if (colMap.levelCol !== -1 && row[colMap.levelCol] !== undefined && String(row[colMap.levelCol]).trim() !== '') {
            const levelStr = String(row[colMap.levelCol]).trim();
            if (levelStr.includes('.')) level = levelStr.split('.').length;
            else level = parseInt(levelStr.replace(/[^0-9]/g, ''), 10);
        }

        if (isNaN(level) || level === -1) {
            for (let col = 0; col < 9; col++) {
                if (row[col] !== undefined && String(row[col]).trim() !== '') {
                    level = col + 1;
                    break;
                }
            }
        }

        parsedAccumulated.push({ partId, level });

        while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
            parentStack.pop();
        }

        if (parentStack.length > 0) {
            const parent = parentStack[parentStack.length - 1];
            relationsAccumulated.push({ parentId: parent.partId, childId: partId, level });
        }

        parentStack.push({ partId: partId, level: level });
    }

    console.log("Parsed parts:", parsedAccumulated.slice(0, 5));
    console.log("Total parts:", parsedAccumulated.length);
    console.log("Relations:", relationsAccumulated.slice(0, 5));
    console.log("Total relations:", relationsAccumulated.length);
}
run().catch(console.error);
