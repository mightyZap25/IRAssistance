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
        const res = await client.query('SELECT id, data FROM "qa_shipping_inspections"');
        let count = 0;
        for (const row of res.rows) {
            const data = row.data;
            if (data.Type === 'INCOMING' || data.PONumber) {
                // This is an incoming inspection!
                // Insert back into receiving
                await client.query(
                    `INSERT INTO "receiving" (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                    [row.id, data]
                );
                // Delete from qa_shipping_inspections
                await client.query(`DELETE FROM "qa_shipping_inspections" WHERE id = $1`, [row.id]);
                count++;
            }
        }
        console.log(`Successfully recovered ${count} receiving records.`);
    } catch(e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
run();
