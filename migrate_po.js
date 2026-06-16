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
        const res = await client.query('SELECT id, data FROM "purchasing"');
        let count = 0;
        for (const row of res.rows) {
            const data = row.data;
            let changed = false;

            if (!data.PONumber || data.PONumber === '-') {
                if (data.PRNumber && data.PRNumber !== '-') {
                    data.PONumber = data.PRNumber;
                } else {
                    data.PONumber = 'PO-MIGRATED-' + row.id.substring(0, 6);
                }
                changed = true;
            }

            if (data.PRNumber !== undefined) {
                delete data.PRNumber;
                changed = true;
            }

            if (changed) {
                await client.query('UPDATE "purchasing" SET data = $1 WHERE id = $2', [data, row.id]);
                count++;
            }
        }
        console.log(`Successfully migrated ${count} purchasing records.`);
    } catch(e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
run();
