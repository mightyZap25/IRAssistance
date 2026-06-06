import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1KdC0iI2jntpwhuYqYZ8w4iQturh5EdOWwWPwvwJam1k/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    for (let i = 0; i < 5; i++) {
        console.log(rows[i]);
    }
}
run().catch(console.error);
