import pg from 'pg';
(async () => {
  // Try common postgres passwords
  const passwords = ['', 'postgres', 'admin', 'password', 'fes_owner_dev_password'];
  for (const pwd of passwords) {
    const client = new pg.Client({ host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', password: pwd });
    try {
      await client.connect();
      const users = await client.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'fes%' OR rolname = 'postgres'");
      console.log('Connected with postgres password:', JSON.stringify(pwd), 'Roles:', users.rows);
      const dbs = await client.query("SELECT datname FROM pg_database WHERE datname LIKE 'fes%'");
      console.log('Databases:', dbs.rows);
      await client.end();
      process.exit(0);
    } catch(e) {
      // try next
    }
  }
  console.log('Could not connect as postgres with any common password');
  process.exit(1);
})();