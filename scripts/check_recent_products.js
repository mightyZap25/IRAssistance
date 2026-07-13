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
    const products = await execute_kw('product.template', 'search_read', [
        [], 
        ['default_code', 'name', 'create_date']
    ]);
    // Sort by create_date descending manually since kwargs for sort might be tricky
    products.sort((a, b) => new Date(b.create_date) - new Date(a.create_date));
    console.log("Last 20 created products:");
    for (const p of products.slice(0, 20)) {
        console.log(`- ID: ${p.id}, Code: ${p.default_code}, Name: ${p.name}, Created: ${p.create_date}`);
    }
}
test();
