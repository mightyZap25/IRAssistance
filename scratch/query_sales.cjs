const pg = require('pg');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../db_config.json'), 'utf8'));
const activeProfile = config.currentProfile || 'local';
const activeConfig = config[activeProfile];

const pool = new pg.Pool({
    host: activeConfig.host,
    port: isNaN(parseInt(activeConfig.port)) ? 15432 : parseInt(activeConfig.port),
    user: activeConfig.user,
    password: activeConfig.password,
    database: activeConfig.database
});

async function run() {
    try {
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema='public'
        `);
        console.log("Existing Tables:", tables.rows.map(r => r.table_name));

        // quotations 조회
        try {
            const qRes = await pool.query('SELECT count(*) FROM "quotations"');
            console.log("Quotations Count:", qRes.rows[0].count);
        } catch(e) {
            console.log("Quotations Table Error:", e.message);
        }

        // billing 조회
        try {
            const bRes = await pool.query('SELECT count(*) FROM "billing"');
            console.log("Billing Count:", bRes.rows[0].count);
        } catch(e) {
            console.log("Billing Table Error:", e.message);
        }
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
