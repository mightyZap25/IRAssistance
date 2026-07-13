import xmlrpc from 'xmlrpc';
const client = xmlrpc.createClient({ host: '100.67.238.32', port: 8069, path: '/xmlrpc/2/db' });
client.methodCall('list', [], (err, value) => {
    if (err) console.error(err);
    else console.log("Available databases:", value);
});
