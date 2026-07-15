import OdooClient from '../odoo_rpc.js';
import dotenv from 'dotenv';
dotenv.config();

const ODOO_URL = 'http://100.67.238.32:8069';
const ODOO_DB = 'odoo';
const ODOO_USER = 'admin';
const ODOO_PASS = 'mighthak0622#';

async function main() {
    console.log(`Connecting to Odoo at ${ODOO_URL} (DB: ${ODOO_DB}, User: ${ODOO_USER})...`);
    const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
    try {
        console.log("Authenticating with Odoo API...");
        await odoo.authenticate();
        console.log("Authentication successful! UID:", odoo.uid);
        
        // ir.config_parameter에서 google_chat_service_account_key 검색
        const params = await odoo.execute_kw('ir.config_parameter', 'search_read', [
            [['key', '=', 'google_chat_service_account_key']]
        ], { fields: ['key', 'value'] });
        
        if (params && params.length > 0) {
            console.log("✅ google_chat_service_account_key Found in Odoo:");
            const val = params[0].value;
            console.log("Value length:", val.length);
            try {
                const parsed = JSON.parse(val);
                console.log("- client_email:", parsed.client_email);
                console.log("- private_key length:", parsed.private_key?.length);
            } catch (err) {
                console.error("❌ Invalid JSON format in Odoo parameter!");
                console.log("Raw snippet:", val.substring(0, 100));
            }
        } else {
            console.log("❌ google_chat_service_account_key NOT found in Odoo parameters!");
        }

        // 전체 Odoo 사용자 이메일 설정 조회
        const users = await odoo.execute_kw('res.users', 'search_read', [
            [['share', '=', false]]
        ], { fields: ['id', 'name', 'login', 'email'] });
        console.log("\n--- Odoo Users ---");
        users.forEach(u => {
            console.log(`ID: ${u.id}, Name: ${u.name}, Login: ${u.login}, Email: ${u.email}`);
        });

    } catch (e) {
        console.error("Odoo Error:", e.message || e);
    }
}

main();
