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
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        const tables = res.rows.map(r => r.table_name);
        console.log('--- PostgreSQL Public Tables ---');
        console.log(tables);

        for (const table of tables) {
            const countRes = await client.query(`SELECT count(*) FROM "${table}"`);
            console.log(`Table "${table}": ${countRes.rows[0].count} rows`);
            if (countRes.rows[0].count > 0) {
                const sampleRes = await client.query(`SELECT * FROM "${table}" LIMIT 1`);
                console.log(`Sample from "${table}":`, JSON.stringify(sampleRes.rows[0], null, 2));
            }
        }
    } catch (err) {
        console.error('Database connection error:', err);
    } finally {
        await client.end();
    }
}

check();
