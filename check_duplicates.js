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
    const duplicates = [];
    
    for (const p of products) {
        if (!p.default_code) continue;
        if (!countByCode[p.default_code]) {
            countByCode[p.default_code] = { count: 1, names: [p.name] };
        } else {
            countByCode[p.default_code].count++;
            countByCode[p.default_code].names.push(p.name);
            duplicates.push(p.default_code);
        }
    }
    
    const uniqueDupes = [...new Set(duplicates)];
    console.log("Duplicate product codes found:", uniqueDupes.length);
    for (const code of uniqueDupes.slice(0, 5)) {
        console.log(`- ${code}: ${countByCode[code].count} copies, names: ${countByCode[code].names.join(', ')}`);
    }

    const boms = await execute_kw('mrp.bom', 'search_read', [[], ['product_tmpl_id']]);
    const bomCountByTmpl = {};
    const dupBoms = [];
    for (const b of boms) {
        const tmplId = b.product_tmpl_id[0];
        if (!bomCountByTmpl[tmplId]) bomCountByTmpl[tmplId] = 1;
        else {
            bomCountByTmpl[tmplId]++;
            dupBoms.push(tmplId);
        }
    }
    const uniqueDupBoms = [...new Set(dupBoms)];
    console.log("Duplicate BOMs for same product found:", uniqueDupBoms.length);
}
test();
