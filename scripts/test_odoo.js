import xmlrpc from 'xmlrpc';

const url = 'http://100.67.238.32:8069';
const db = 'odoo';

function authenticate(username, password) {
    return new Promise((resolve, reject) => {
        const client = xmlrpc.createClient({ host: '100.67.238.32', port: 8069, path: '/xmlrpc/2/common' });
        client.methodCall('authenticate', [db, username, password, {}], (error, value) => {
            if (error) {
                resolve({ username, success: false, error: error.message });
            } else if (!value) {
                resolve({ username, success: false, error: 'Authentication failed (returned false)' });
            } else {
                resolve({ username, success: true, uid: value });
            }
        });
    });
}

async function test() {
    const res1 = await authenticate('jogak@irrobot.com', 'jogak0622#');
    console.log(res1);
    
    const res2 = await authenticate('jogak@mightyzap.com', 'jogak0622#');
    console.log(res2);
}

test();
