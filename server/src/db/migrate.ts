import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config';
import { sha256Hex } from '../lib/crypto';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

async function migrate(): Promise<void> {
  const client = new pg.Client({ connectionString: config.migrationDatabaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     text PRIMARY KEY,
        checksum    char(64) NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);

    const applied = new Map<string, string>(
      (await client.query<{ version: string; checksum: string }>('SELECT version, checksum FROM schema_migrations')).rows.map(r => [r.version, r.checksum]),
    );

    const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const checksum = sha256Hex(sql);
      const existing = applied.get(file);
      if (existing) {
        if (existing.trim() !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
        continue;
      }
      console.log(`Applying ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(`SELECT set_config('fes.app_role', $1, true)`, [config.dbAppRole ?? '']);
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('Migrations complete.');
  } finally {
    await client.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
