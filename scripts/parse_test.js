import XLSX from 'xlsx';

async function test() {
    const url = 'https://docs.google.com/spreadsheets/d/1PyOyjCnZ1JeUtujmjhojF5b0eagexNz4iQ_MY3hPyUg/export?format=xlsx';
    console.log('Fetching...');
    const res = await fetch(url);
    if (!res.ok) {
        console.error('Fetch failed:', res.status, res.statusText);
        return;
    }
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    const sheetName = workbook.SheetNames[0];
    console.log('First sheet:', sheetName);
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    for (let i = 0; i < Math.min(15, rows.length); i++) {
        console.log(`Row ${i}:`, JSON.stringify(rows[i]));
    }
}
test();
