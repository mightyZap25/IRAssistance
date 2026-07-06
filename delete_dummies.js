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
    console.log("Finding dummy products...");
    const products = await execute_kw('product.template', 'search_read', [
        [['default_code', 'in', ['IR-SG-0000', 'IR-FG-0000']]], 
        ['id', 'default_code', 'name', 'bom_ids']
    ]);
    
    console.log(`Found ${products.length} dummy products.`);
    if (products.length === 0) return;

    // Collect BOM IDs to delete first
    const bomIds = new Set();
    for (const p of products) {
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

    const productIds = products.map(p => p.id);
    console.log(`Deleting ${productIds.length} dummy products...`);
    const delProducts = await execute_kw('product.template', 'unlink', [productIds]);
    console.log("Product deletion result:", delProducts);
}
test();
