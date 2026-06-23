const pg = require('pg');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.cwd(), 'db_config.json');

const loadDbConfig = () => {
    if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(raw);
    }
    throw new Error('db_config.json not found');
};

async function main() {
    const config = loadDbConfig();
    const activeProfile = config.currentProfile || 'local';
    const activeConfig = config[activeProfile];
    
    console.log(`Connecting to ${activeConfig.user}@${activeConfig.host}:${activeConfig.port}/${activeConfig.database}`);
    
    const pool = new pg.Pool({
        host: activeConfig.host,
        port: parseInt(activeConfig.port),
        user: activeConfig.user,
        password: activeConfig.password,
        database: activeConfig.database
    });

    try {
        // Test workspaces table existence
        console.log("Checking workspaces table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "workspaces" (
                id VARCHAR(255) PRIMARY KEY,
                data JSONB NOT NULL
            )
        `);
        console.log("Workspaces table exists/created.");

        // Try upsert
        const id = 'ws_test_' + Date.now();
        const data = { id, name: 'Test Workspace ' + new Date().toISOString() };
        await pool.query(
            `INSERT INTO "workspaces" (id, data) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(data)]
        );
        console.log("Upsert test successful! Inserted id:", id);

        // Retrieve all
        const res = await pool.query('SELECT * FROM "workspaces"');
        console.log("Current workspaces count:", res.rows.length);
        res.rows.forEach(row => {
            console.log(`- ${row.id}:`, row.data);
        });

    } catch (err) {
        console.error("Database query failed:", err);
    } finally {
        await pool.end();
    }
}

main().catch(console.error);
