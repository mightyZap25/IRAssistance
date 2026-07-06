import xmlrpc from 'xmlrpc';

function execute_kw(model, method, args) {
    return new Promise((resolve, reject) => {
        const client = xmlrpc.createClient({ host: '100.67.238.32', port: 8069, path: '/xmlrpc/2/object' });
        client.methodCall('execute_kw', ['odoo', 2, 'jogak0622#', model, method, args, {}], (error, value) => {
            if (error) resolve({ error: error.message });
            else resolve(value);
        });
    });
}

async function test() {
    console.log("Fetching all products...");
    const products = await execute_kw('product.template', 'search_read', [
        [], 
        ['id', 'default_code', 'name', 'create_date']
    ]);
    
    console.log(`Total products: ${products.length}`);
    
    // Group by default_code to see patterns
    const patterns = {};
    const sampleCodes = [];
    
    for (const p of products) {
        let code = p.default_code || 'NONE';
        // check if it looks like a dummy code e.g. contains 0000
        if (code.includes('0000') || code.startsWith('IR-')) {
            if (!patterns[code]) patterns[code] = 1;
            else patterns[code]++;
        }
        if (sampleCodes.length < 10) sampleCodes.push(code);
    }
    
    console.log("Suspicious or dummy-like codes remaining:");
    for (const [code, count] of Object.entries(patterns)) {
        console.log(`- ${code}: ${count} items`);
    }
    
    console.log("Sample of current codes:", sampleCodes);
}
test();
