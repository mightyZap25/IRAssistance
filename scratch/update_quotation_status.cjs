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
        console.log("Quotations found:", res.rows.length);
        for (const row of res.rows) {
            const data = row.data;
            data.Status = 'ACCEPTED';
            await pool.query('UPDATE "quotations" SET data = $1 WHERE id = $2', [JSON.stringify(data), row.id]);
            console.log(`Updated ${row.id} Status to ACCEPTED`);
        }
        console.log("Update Complete!");
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
