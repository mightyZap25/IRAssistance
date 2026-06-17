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
        const res = await pool.query('SELECT * FROM "quotations"');
        console.log("Quotations Row Count:", res.rows.length);
        res.rows.forEach((row, i) => {
            console.log(`Row ${i + 1}:`, JSON.stringify(row.data, null, 2));
        });
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
