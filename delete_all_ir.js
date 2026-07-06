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
    console.log("Finding all IR products...");
    // Find products where default_code starts with 'IR' or '12Lf'
    const products = await execute_kw('product.template', 'search_read', [
        [], 
        ['id', 'default_code', 'bom_ids']
    ]);
    
    const toDelete = products.filter(p => p.default_code && (p.default_code.startsWith('IR') || p.default_code.includes('Lf')));
    
    console.log(`Found ${toDelete.length} products to wipe.`);
    if (toDelete.length === 0) return;

    const bomIds = new Set();
    for (const p of toDelete) {
        if (p.bom_ids && p.bom_ids.length > 0) {
            p.bom_ids.forEach(id => bomIds.add(id));
        }
    }

    const bomArray = Array.from(bomIds);
    if (bomArray.length > 0) {
        console.log(`Deleting ${bomArray.length} linked BOMs...`);
        const delBoms = await execute_kw('mrp.bom', 'unlink', [bomArray]);
        console.log("BOM deletion result:", delBoms);
    }

    const productIds = toDelete.map(p => p.id);
    console.log(`Deleting ${productIds.length} products...`);
    const delProducts = await execute_kw('product.template', 'unlink', [productIds]);
    console.log("Product deletion result:", delProducts);
}
test();
