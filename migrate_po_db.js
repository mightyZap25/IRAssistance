
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'db_config.json');

const loadDbConfig = () => {
    if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.currentProfile && parsed[parsed.currentProfile]) {
            return parsed[parsed.currentProfile];
        }
    }
    throw new Error('db_config.json not found or invalid');
};

async function migrate() {
    const config = loadDbConfig();
    const pool = new pg.Pool({
        host: config.host,
        port: parseInt(config.port) || 15432,
        user: config.user,
        password: config.password,
        database: config.database,
    });

    console.log(`Connecting to ${config.user}@${config.host}:${config.port}/${config.database}...`);

    try {
        const res = await pool.query(`
            UPDATE "purchasing"
            SET data = jsonb_set(data, '{Status}', '"RFQ_SENT"')
            WHERE data->>'Status' = 'DRAFT'
        `);
        console.log(`Updated ${res.rowCount} records from DRAFT to RFQ_SENT.`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
