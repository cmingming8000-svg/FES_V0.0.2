const pg = require('pg');
(async () => {
  const client = new pg.Client({ host: 'localhost', port: 5432, database: 'fes', user: 'fes_owner', password: 'fes_owner_dev_password' });
  try {
    await client.connect();
    const users = await client.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'fes%'");
    console.log('Roles:', users.rows);
    const dbs = await client.query("SELECT datname FROM pg_database WHERE datname LIKE 'fes%'");
    console.log('Databases:', dbs.rows);
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log('Tables:', tables.rows.map(r => r.tablename));
    const userCount = await client.query('SELECT count(*) FROM users').catch(e => ({error: e.message}));
    console.log('User count:', userCount);
    await client.end();
  } catch(e) {
    console.log('Error:', e.message);
    process.exit(1);
  }
})();