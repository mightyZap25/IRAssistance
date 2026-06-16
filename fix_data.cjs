const http = require('http');

async function fetchJSON(path, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://localhost:5050${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                else resolve(data ? JSON.parse(data) : null);
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function run() {
    const txs = await fetchJSON('/api/db/transactions');
    
    const outTx = txs.find(t => t.id === 'auto_mqgsqghitg3yi');
    if (outTx) {
        outTx.PartID = 'IRMAA0039';
        outTx.Quantity = 10;
        await fetchJSON(`/api/db/transactions/${outTx.id}`, { method: 'POST', body: JSON.stringify(outTx) });
        console.log("Fixed outTx");
    }
    
    const qaIn = txs.find(t => t.id === 'auto_wqypwmqdm');
    if (qaIn) {
        qaIn.Reason = '생산 완료 (완제품 입고)';
        await fetchJSON(`/api/db/transactions/${qaIn.id}`, { method: 'POST', body: JSON.stringify(qaIn) });
        console.log("Fixed qaIn");
    }
}
run().catch(console.error);
