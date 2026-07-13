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
    const products = await execute_kw('product.template', 'search_read', [[['default_code', 'in', ['IRMAA0042']]], ['default_code', 'name']]);
    console.log("IRMAA0042 product:", products[0]);

    if (products[0]) {
        const boms = await execute_kw('mrp.bom', 'search_read', [[['product_tmpl_id', '=', products[0].id]], ['product_tmpl_id', 'bom_line_ids']]);
        console.log("BOMs for IRMAA0042:", boms);
    }
}
test();
