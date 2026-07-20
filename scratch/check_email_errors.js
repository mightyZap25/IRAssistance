import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: '192.168.0.7',
  port: 15432,
  user: 'irerp',
  password: 'irerp060705!',
  database: 'postgres'
});

async function checkEmails() {
  try {
    await client.connect();
    console.log('Connected to Odoo DB (postgres)');

    // 최근 메일 10개 가져오기
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('Tables:', res.rows.map(r => r.table_name).slice(0, 50).join(', '));

    console.log('--- Recent Emails ---');
    if (res.rows.length === 0) {
      console.log('No emails found in mail_mail table.');
    } else {
      res.rows.forEach(row => {
        console.log(`\nID: ${row.id}`);
        console.log(`State: ${row.state}`);
        console.log(`Date: ${row.create_date}`);
        console.log(`From: ${row.email_from}`);
        console.log(`To: ${row.email_to}`);
        console.log(`Subject: ${row.subject}`);
        console.log(`Failure Reason: ${row.failure_reason}`);
      });
    }

  } catch (err) {
    console.error('Error connecting to DB:', err);
  } finally {
    await client.end();
  }
}

checkEmails();
