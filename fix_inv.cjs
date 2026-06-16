const http = require('http');

async function fetchJSON(path, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://localhost:5050${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data ? JSON.parse(data) : null));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function run() {
    const inv = await fetchJSON('/api/db/inventory');
    const partInv = inv.find(i => i.id === 'IRMAA0039' || i.PartID === 'IRMAA0039');
    console.log("Current Inventory for IRMAA0039:", partInv);
    
    // Decrease by 10
    if (partInv) {
        partInv.OnHand -= 10;
        await fetchJSON(`/api/db/inventory/${partInv.id}`, { method: 'POST', body: JSON.stringify(partInv) });
        console.log("Fixed inventory OnHand to:", partInv.OnHand);
    }
}
run().catch(console.error);
