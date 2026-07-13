import xmlrpc from 'xmlrpc';
import dotenv from 'dotenv';
dotenv.config();

const client = xmlrpc.createClient({ host: '100.67.238.32', port: 8069, path: '/xmlrpc/2/common' });
client.methodCall('authenticate', [process.env.ODOO_DB, process.env.ODOO_USER, process.env.ODOO_PASS, {}], (err, uid) => {
    if (err || !uid) return console.error("Auth Error:", err);
    
    const objClient = xmlrpc.createClient({ host: '100.67.238.32', port: 8069, path: '/xmlrpc/2/object' });
    objClient.methodCall('execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASS, 'product.template', 'fields_get', [], {attributes: ['selection', 'type']}], (err, fields) => {
        if (err) console.error("Error:", err);
        else {
            if (fields.type) console.log("TYPE field:", fields.type);
            if (fields.detailed_type) console.log("DETAILED_TYPE field:", fields.detailed_type);
        }
    });
});
