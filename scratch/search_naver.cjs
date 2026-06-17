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
        const tables = [
            'quotations', 'billing', 'production_requests', 'transactions', 'purchasing', 'customers'
        ];
        
        for (const t of tables) {
            try {
                const res = await pool.query(`SELECT id, data FROM "${t}"`);
                const matches = res.rows.filter(row => {
                    const str = JSON.stringify(row.data).toLowerCase();
                    return str.includes('네이버') || str.includes('naver');
                });
                if (matches.length > 0) {
                    console.log(`Found in Table [${t}]:`, matches.length, "rows");
                    matches.forEach(m => {
                        console.log(`- ID: ${m.id}, Data:`, JSON.stringify(m.data, null, 2));
                    });
                }
            } catch(e) {
                console.log(`Table [${t}] Error:`, e.message);
            }
        }
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
