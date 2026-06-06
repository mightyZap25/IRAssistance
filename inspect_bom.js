import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1W2vw3bErVZaOYQagJYxUWeUzh4faTiddhm8JsRJZTSQ/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    // Dump all sheet names
    console.log("Sheets:", workbook.SheetNames);
    
    for (const sheetName of workbook.SheetNames) {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        // Just print first 15 rows
        for (let i = 0; i < Math.min(15, rows.length); i++) {
            console.log(`Row ${i}:`, rows[i]);
        }
    }
}
run().catch(console.error);
