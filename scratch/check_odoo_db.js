import pg from 'pg';

const possibleConfigs = [
    { host: '100.67.238.32', port: 5432, user: 'odoo', password: 'odoo', database: 'odoo' },
    { host: '100.67.238.32', port: 5432, user: 'postgres', password: 'odoo', database: 'odoo' },
    { host: '100.67.238.32', port: 5432, user: 'postgres', password: 'postgres', database: 'odoo' },
    { host: '100.67.238.32', port: 5432, user: 'postgres', password: 'irerp060705!', database: 'odoo' },
    { host: '100.67.238.32', port: 5432, user: 'irerp', password: 'irerp060705!', database: 'odoo' }
];

async function testConfig(config) {
    console.log(`Testing connection to ${config.user}@${config.host}:${config.port}/${config.database}...`);
    const client = new pg.Client({ ...config, connectionTimeoutMillis: 3000 });
    try {
        await client.connect();
        console.log(`✅ Success! Connected using config:`, { ...config, password: '***' });
        
        // ir_config_parameter 조회
        const res = await client.query("SELECT key, value FROM ir_config_parameter WHERE key = 'google_chat_service_account_key'");
        if (res.rows.length > 0) {
            console.log("  -> google_chat_service_account_key Found!");
            console.log("  -> Value length:", res.rows[0].value.length);
            try {
                const parsed = JSON.parse(res.rows[0].value);
                console.log("  -> client_email:", parsed.client_email);
                console.log("  -> has private_key:", !!parsed.private_key);
            } catch (err) {
                console.log("  -> Invalid JSON format in DB:", err.message);
            }
        } else {
            console.log("  -> google_chat_service_account_key NOT found in ir_config_parameter.");
        }
        
        await client.end();
        return true;
    } catch (err) {
        console.log(`  -> Failed: ${err.message}`);
        try { await client.end(); } catch(e) {}
        return false;
    }
}

async function main() {
    for (const config of possibleConfigs) {
        const success = await testConfig(config);
        if (success) {
            console.log("Found working database connection. Exiting.");
            return;
        }
    }
    console.log("Could not connect to Odoo DB on port 5432 with common credentials.");
}

main();
