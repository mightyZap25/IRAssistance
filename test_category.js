import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1W2vw3bErVZaOYQagJYxUWeUzh4faTiddhm8JsRJZTSQ/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = '12Lf-12F-27';
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    
    const headers = rows[0].map(h => String(h || '').trim());
    const colCategory = headers.findIndex(h => h.toLowerCase().includes('category'));
    const colPartId = headers.findIndex(h => h.toLowerCase().includes('part number'));

    for (let i = 1; i < 20; i++) {
        const row = rows[i];
        if (!row) continue;
        const cat = String(row[colCategory] || '').trim();
        const part = String(row[colPartId] || '').trim();
        if (part.startsWith('IRO')) {
            console.log(`Row ${i} - Cat: "${cat}", Part: "${part}"`);
            if (cat.toLowerCase() === 'elec') {
                console.log(` -> MATCH! Replacing: ${part.replace(/^IRO/, 'IRE')}`);
            } else {
                console.log(` -> NO MATCH! cat.toLowerCase() is: "${cat.toLowerCase()}"`);
            }
        }
    }
}
run().catch(console.error);
