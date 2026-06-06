import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1W2vw3bErVZaOYQagJYxUWeUzh4faTiddhm8JsRJZTSQ/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    for (let s = 1; s < Math.min(5, workbook.SheetNames.length); s++) {
        const sheetName = workbook.SheetNames[s];
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            console.log(`Row ${i}:`, rows[i]);
        }
    }
}
run().catch(console.error);
