import * as XLSX from 'xlsx';

async function run() {
    const res = await fetch("https://docs.google.com/spreadsheets/d/1W2vw3bErVZaOYQagJYxUWeUzh4faTiddhm8JsRJZTSQ/export?format=xlsx");
    const arrayBuffer = await res.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    console.log(workbook.SheetNames.slice(0, 5));
}
run().catch(console.error);
