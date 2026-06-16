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
    const prs = await fetchJSON('/api/db/production_requests');
    let fixed = 0;
    for (const pr of prs) {
        let modified = false;
        if (pr.Items) {
            for (const item of pr.Items) {
                if (item.Schedules) {
                    for (const s of item.Schedules) {
                        if (s._editing || s._editingStart || s._editingEnd) {
                            delete s._editing;
                            delete s._editingStart;
                            delete s._editingEnd;
                            modified = true;
                        }
                    }
                }
            }
        }
        if (modified) {
            await fetchJSON(`/api/db/production_requests/${pr.id}`, { method: 'POST', body: JSON.stringify(pr) });
            fixed++;
        }
    }
}
run().catch(console.error);
async function getPR() { const prs = await fetchJSON("/api/db/production_requests"); const pr = prs.find(p => p.Items && p.Items.some(i => i.PartID === "IRMAA0081")); console.log(JSON.stringify(pr.Items.find(i => i.PartID === "IRMAA0081"), null, 2)); } getPR().catch(console.error);
