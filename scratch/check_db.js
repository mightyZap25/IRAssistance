import pg from 'pg';

const client = new pg.Client({
    host: '100.67.238.32',
    port: 15432,
    user: 'irerp',
    password: 'irerp060705!',
    database: 'irerp'
});

async function main() {
    try {
        await client.connect();
        console.log("Connected to Odoo DB successfully.");
        
        // 1. Google Chat 서비스 계정 키 매개변수 조회
        const res = await client.query("SELECT key, value FROM ir_config_parameter WHERE key = 'google_chat_service_account_key'");
        if (res.rows.length > 0) {
            console.log("✅ google_chat_service_account_key Found!");
            console.log("Value length:", res.rows[0].value.length);
            try {
                const parsed = JSON.parse(res.rows[0].value);
                console.log("- Valid JSON Format: Yes");
                console.log("- client_email:", parsed.client_email);
                console.log("- has private_key:", !!parsed.private_key);
            } catch (err) {
                console.error("- Invalid JSON Format! Error:", err.message);
                console.log("- Raw value snippet:", res.rows[0].value.substring(0, 150));
            }
        } else {
            console.log("❌ google_chat_service_account_key NOT found in ir_config_parameter!");
        }

        // 2. 사용자 이메일 설정 확인
        const resUsers = await client.query(`
            SELECT u.id, partner.name, partner.email 
            FROM res_users u 
            JOIN res_partner partner ON u.partner_id = partner.id
            WHERE partner.email IS NOT NULL AND partner.email != ''
        `);
        console.log("\n--- Users with emails ---");
        resUsers.rows.forEach(row => {
            console.log(`User ID: ${row.id}, Name: ${row.name}, Email: ${row.email}`);
        });

    } catch (e) {
        console.error("DB Error:", e.message);
    } finally {
        await client.end();
    }
}

main();
