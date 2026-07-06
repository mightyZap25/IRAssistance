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
    const products = await execute_kw('product.template', 'search_read', [[], ['default_code', 'name']]);
    
    const countByCode = {};
    const countByName = {};
    const dupCodes = [];
    const dupNames = [];
    
    for (const p of products) {
        if (p.default_code) {
            if (!countByCode[p.default_code]) countByCode[p.default_code] = 1;
            else { countByCode[p.default_code]++; dupCodes.push(p.default_code); }
        }
        if (p.name) {
            if (!countByName[p.name]) countByName[p.name] = 1;
            else { countByName[p.name]++; dupNames.push(p.name); }
        }
    }
    
    console.log("Unique Duplicate Codes:", [...new Set(dupCodes)].length);
    console.log("Unique Duplicate Names:", [...new Set(dupNames)].length);
    
    const uniqueNames = [...new Set(dupNames)].slice(0, 3);
    for (const name of uniqueNames) {
        console.log(`Name "${name}" appears ${countByName[name]} times.`);
    }
}
test();
