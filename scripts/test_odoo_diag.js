import xmlrpc from 'xmlrpc';
import dotenv from 'dotenv';
dotenv.config();

const ODOO_URL  = process.env.ODOO_URL  || 'http://100.67.238.32:8069';
const ODOO_DB   = process.env.ODOO_DB   || 'odoo';
const ODOO_USER = process.env.ODOO_USER || 'jogak@mightyzap.com';
const ODOO_API_KEY = process.env.ODOO_API_KEY;
const ODOO_PASS = process.env.ODOO_PASS || 'jogak0622#';

console.log('=== Odoo 연결 진단 ===');
console.log('URL  :', ODOO_URL);
console.log('DB   :', ODOO_DB);
console.log('USER :', ODOO_USER);
console.log('API_KEY:', ODOO_API_KEY ? ODOO_API_KEY.substring(0, 10) + '...' : '없음');
console.log('');

const parsedUrl = new URL(ODOO_URL);
const clientOptions = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port) || 80,
    path: '/xmlrpc/2/common'
};

function tryAuth(label, password) {
    return new Promise((resolve) => {
        console.log(`[시도] ${label} 로 인증 중... (password: ${password ? password.substring(0,8)+'...' : 'null'})`);
        const client = xmlrpc.createClient(clientOptions);
        client.methodCall('authenticate', [ODOO_DB, ODOO_USER, password, {}], (error, value) => {
            if (error) {
                console.log(`[실패] 오류: ${error.message}`);
                resolve(false);
            } else if (!value) {
                console.log(`[실패] Odoo가 false 반환 → 계정/비밀번호/DB 불일치`);
                resolve(false);
            } else {
                console.log(`[성공] UID = ${value}`);
                resolve(true);
            }
        });
    });
}

async function main() {
    if (ODOO_API_KEY) await tryAuth('API KEY', ODOO_API_KEY);
    await tryAuth('PASS (jogak0622#)', ODOO_PASS);
}

main().catch(e => console.error('예외:', e));
