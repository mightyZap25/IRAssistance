import pg from 'pg';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db_config.json'), 'utf8'));

async function check() {
    const client = new pg.Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    });
    try {
        await client.connect();
        const res = await client.query('SELECT data FROM "production_requests" LIMIT 5');
        console.log(JSON.stringify(res.rows.map(r => r.data), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
check();
