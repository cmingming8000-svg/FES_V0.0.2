import pg from 'pg';
import { config } from '../config';

// Return DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
pg.types.setTypeParser(1082, (v: string) => v);
// NUMERIC → number (averages and thresholds are small, bounded values).
pg.types.setTypeParser(1700, (v: string) => Number(v));
// BIGINT (identity ids, counts) → number.
pg.types.setTypeParser(20, (v: string) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', err => {
  console.error('Unexpected PostgreSQL pool error', err);
});

export type DbClient = pg.PoolClient;

/**
 * Security context applied to every transaction. It feeds the row-level
 * security policies on `evaluations` / `evaluation_ratings`.
 */
export interface DbContext {
  role: 'system' | 'student' | 'faculty' | 'dean' | 'hr_qa';
  userId?: string;
  departmentId?: string | null;
  facultyId?: string | null;
  studentId?: string | null;
}

export const SYSTEM_CONTEXT: DbContext = { role: 'system' };

export async function withTransaction<T>(ctx: DbContext, fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('fes.role', $1, true),
              set_config('fes.user_id', $2, true),
              set_config('fes.department_id', $3, true),
              set_config('fes.faculty_id', $4, true),
              set_config('fes.student_id', $5, true)`,
      [ctx.role, ctx.userId ?? '', ctx.departmentId ?? '', ctx.facultyId ?? '', ctx.studentId ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
