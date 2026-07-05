import xmlrpc from 'xmlrpc';
const url = 'http://100.67.238.32:8069';
const db = 'odoo';
const user = 'jogak@irrobot.com';
const pass = 'jogak0622#';

const client = xmlrpc.createClient({ host: '100.67.238.32', port: 8069, path: '/xmlrpc/2/common' });
client.methodCall('authenticate', [db, user, pass, {}], (err, value) => {
    if (err) console.error("Error:", err);
    else console.log("Success! UID:", value);
});
