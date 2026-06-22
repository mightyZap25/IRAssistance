import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../db_config.json'), 'utf8'));

async function run() {
    const client = new pg.Client(config);
    try {
        await client.connect();
        
        // Find parts
        const res = await client.query(`SELECT id, data FROM "parts" WHERE data->>'Name' ILIKE '%test%' OR data->>'PartID' ILIKE '%test%'`);
        console.log(`Found ${res.rows.length} parts with 'test' in Name or PartID`);
        
        for (const row of res.rows) {
            console.log(`ID: ${row.id}, PartID: ${row.data.PartID}, Name: ${row.data.Name}`);
            if (row.data.PartID === 'IRMU0001') {
                console.log(`-> Keeping ${row.data.PartID}`);
            } else {
                console.log(`-> Will delete ${row.data.PartID}`);
                await client.query(`DELETE FROM "parts" WHERE id = $1`, [row.id]);
                console.log(`   Deleted.`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
