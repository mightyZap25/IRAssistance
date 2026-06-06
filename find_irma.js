import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1W2vw3bErVZaOYQagJYxUWeUzh4faTiddhm8JsRJZTSQ/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            if (rows[i].includes('IRMAA0039')) {
                console.log(`Found IRMAA0039 in sheet ${sheetName} at row ${i}`);
                console.log(rows[i]);
            }
        }
    }
}
run().catch(console.error);
