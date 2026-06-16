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
        const pRes = await client.query('SELECT id, data FROM purchasing');
        const pList = pRes.rows.filter(r => ['WAITING_INSPECTION'].includes(r.data.Status));
        
        let count = 0;
        for (const row of pList) {
            const data = row.data;
            
            const inspectionID = 'INS-' + Date.now() + Math.floor(Math.random() * 1000);
            const timestamp = data.UpdatedAt || data.CreatedAt || new Date().toISOString();
            
            const payload = {
                Type: 'INCOMING',
                RefPOID: data.id,
                PONumber: data.PONumber,
                PartID: data.Items?.[0]?.PartID || '',
                PartName: data.PartName,
                Qty: data.Qty,
                VendorID: data.VendorID,
                VendorName: data.VendorName,
                ID: inspectionID,
                Status: 'WAITING_INSPECTION',
                CreatedAt: timestamp,
                createdAt: timestamp,
                ReceivedAt: timestamp,
                result: 'Pending'
            };
            
            const newId = 'auto_' + Math.random().toString(36).substr(2, 9);
            await client.query(
                `INSERT INTO "receiving" (id, data) VALUES ($1, $2)`,
                [newId, payload]
            );
            count++;
        }
        
        console.log(`Successfully restored ${count} receiving records from purchasing.`);
    } catch(e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}
run();
