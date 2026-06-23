const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'db_config.json');
let dbConfig = {};
try {
    const raw = fs.readFileSync(configPath, 'utf8');
    dbConfig = JSON.parse(raw);
} catch (e) {
    console.error("Failed to read db_config.json, falling back to default.", e);
}

const activeProfile = dbConfig.currentProfile || 'local';
const activeConfig = dbConfig[activeProfile] || {};

const pool = new Pool({
  host: activeConfig.host || '192.168.0.2',
  port: parseInt(activeConfig.port || '15432'),
  user: activeConfig.user || 'irerp',
  password: activeConfig.password || 'IRERP060705!',
  database: activeConfig.database || 'postgres',
});

async function run() {
  try {
    const tableCheck = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'users'
        );
    `);
    
    if (!tableCheck.rows[0].exists) {
        console.log("users table does not exist yet.");
        return;
    }

    const res = await pool.query('SELECT * FROM "users"');
    console.log(`[Profile: ${activeProfile}] Total users found in database:`, res.rows.length);
    
    let found = false;
    for (const row of res.rows) {
      console.log(`ID: ${row.id}, Email: ${row.data.email}, Role: ${row.data.role}`);
      if (row.data.email === 'jogak@irrobot.com') {
        const updatedData = { ...row.data, role: 'admin', department: 'Master Admin' };
        await pool.query('UPDATE "users" SET data = $1 WHERE id = $2', [JSON.stringify(updatedData), row.id]);
        console.log(`Successfully updated jogak@irrobot.com user role to 'admin' (Master)!`);
        found = true;
      }
    }

    if (!found) {
        console.log("jogak@irrobot.com not found in 'users' table.");
    }
  } catch (err) {
    console.error("Error executing database operation:", err);
  } finally {
    await pool.end();
  }
}

run();
