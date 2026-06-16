const http = require('http');

async function fetchJSON(path) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://localhost:5050${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data ? JSON.parse(data) : null));
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    const txs = await fetchJSON('/api/db/transactions');
    const irmaa0039Txs = txs.filter(t => t.PartID === 'IRMAA0039');
    console.log("IRMAA0039 transactions:");
    irmaa0039Txs.forEach(t => console.log(`[${t.id}] Type: ${t.Type}, Qty: ${t.Quantity}, Reason: ${t.Reason}, Ref: ${t.RefDoc}, Date: ${t.Date || t.Timestamp || t.createdAt}`));
}
run().catch(console.error);
