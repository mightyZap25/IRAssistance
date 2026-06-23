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
        const res = await pool.query('SELECT * FROM "projects"');
        console.log("Number of projects:", res.rows.length);
        res.rows.forEach(row => {
            console.log(`\nID: ${row.id}`);
            console.log("Data:", JSON.stringify(row.data, null, 2));
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main().catch(console.error);
