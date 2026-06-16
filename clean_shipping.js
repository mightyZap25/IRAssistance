import pg from 'pg';
import fs from 'fs';

const raw = fs.readFileSync('db_config.json', 'utf8');
const configObj = JSON.parse(raw);
const activeProfile = configObj.currentProfile || 'local';
const activeConfig = configObj[activeProfile];

const pool = new pg.Pool({
    host: activeConfig.host,
    port: activeConfig.port,
    user: activeConfig.user,
    password: activeConfig.password,
    database: activeConfig.database,
});

async function run() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, data FROM qa_shipping_inspections');
        let count = 0;
        for (const row of res.rows) {
            const data = row.data;
            // Delete records that were wrongly migrated (the bug we fixed) 
            // because they are corrupted or incoming inspections
            if (data.migrated === true) {
                await client.query(`DELETE FROM qa_shipping_inspections WHERE id = $1`, [row.id]);
                count++;
            }
        }
        console.log(`Successfully deleted ${count} useless migrated records from qa_shipping_inspections.`);
    } catch(e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
run();
