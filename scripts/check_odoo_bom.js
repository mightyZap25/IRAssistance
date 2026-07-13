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
    console.log("Checking products...");
    const products = await execute_kw('product.template', 'search_read', [[['default_code', 'in', ['IRMAA0157', 'IRMAA0156']]], ['default_code', 'name']]);
    console.log("Products found:", products);

    console.log("Checking BOMs...");
    const boms = await execute_kw('mrp.bom', 'search_read', [[], ['product_tmpl_id']]);
    console.log("Total BOMs:", boms.length);
    console.log("Sample BOMs:", boms.slice(0, 3));
}
test();
