const pg = require('pg');

const testConn = async (host, user, password) => {
    console.log(`Testing ${user}@${host} with password ${password}...`);
    const pool = new pg.Pool({
        host: host,
        port: 15432,
        user: user,
        password: password,
        database: 'postgres',
        connectionTimeoutMillis: 3000
    });
    try {
        await pool.query('SELECT 1');
        console.log(`SUCCESS: ${user}@${host}`);
    } catch(e) {
        console.log(`FAILED: ${user}@${host} - ${e.message}`);
    } finally {
        await pool.end().catch(()=>{});
    }
}

async function main() {
    await testConn('192.168.0.2', 'irerp', 'IRERP060705!');
    await testConn('100.67.238.32', 'irerp', 'IRERP060705!');
    await testConn('192.168.0.7', 'postgres', 'postgres');
    await testConn('192.168.0.7', 'postgres', 'IRERP060705!');
}

main();
