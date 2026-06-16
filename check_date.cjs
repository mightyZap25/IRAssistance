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
    const missingDates = txs.filter(t => !t.Date);
    console.log(`Found ${missingDates.length} txs without Date.`);
    console.log(missingDates.slice(-5));
}
run().catch(console.error);
