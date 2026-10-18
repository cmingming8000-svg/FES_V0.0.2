import type { AuditChainVerification, AuditLogEntry } from '../../../src/types';
import type { DbClient } from '../db/pool';
import { canonicalJson, sha256Hex } from '../lib/crypto';

export const GENESIS_HASH = '0'.repeat(64);
// Serializes writers so each entry links to its true predecessor.
const AUDIT_CHAIN_LOCK = 872_001;

export interface AuditActor {
  userId?: string | null;
  label: string;
  role?: string | null;
}

export interface AuditEvent {
  actor: AuditActor;
  action: string;
  targetType?: string;
  targetId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  details?: string;
  ip?: string | null;
  userAgent?: string | null;
}

interface AuditRow {
  id: number;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_label: string;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_value: unknown;
  new_value: unknown;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  prev_hash: string;
  event_hash: string;
}

function computeEventHash(prevHash: string, row: Omit<AuditRow, 'id' | 'prev_hash' | 'event_hash'>): string {
  const payload = canonicalJson({
    occurredAt: row.occurred_at.toISOString(),
    actorUserId: row.actor_user_id,
    actorLabel: row.actor_label,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    details: row.details,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
  });
  return sha256Hex(`${prevHash}|${payload}`);
}

function toJsonb(value: unknown): string | null {
  return value === undefined || value === null ? null : canonicalJson(value);
}

/**
 * Append-only, SHA-256 hash-chained audit trail. Rows are protected by
 * database triggers (no UPDATE/DELETE/TRUNCATE) and by the runtime role's
 * grants; the hash chain additionally makes tampering by a privileged
 * database operator detectable via `verifyChain`.
 */
export const AuditService = {
  async record(client: DbClient, event: AuditEvent): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_CHAIN_LOCK]);
    const last = await client.query<{ event_hash: string }>('SELECT event_hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const prevHash = last.rows[0]?.event_hash ?? GENESIS_HASH;

    const oldValue = event.oldValue === undefined ? null : JSON.parse(canonicalJson(event.oldValue));
    const newValue = event.newValue === undefined ? null : JSON.parse(canonicalJson(event.newValue));
    const row = {
      occurred_at: new Date(),
      actor_user_id: event.actor.userId ?? null,
      actor_label: event.actor.label,
      actor_role: event.actor.role ?? null,
      action: event.action,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      old_value: oldValue,
      new_value: newValue,
      details: event.details ?? null,
      ip_address: event.ip ?? null,
      user_agent: event.userAgent ?? null,
    };
    const eventHash = computeEventHash(prevHash, row);

    await client.query(
      `INSERT INTO audit_log (occurred_at, actor_user_id, actor_label, actor_role, action, target_type, target_id,
                              old_value, new_value, details, ip_address, user_agent, prev_hash, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14)`,
      [
        row.occurred_at, row.actor_user_id, row.actor_label, row.actor_role, row.action, row.target_type, row.target_id,
        toJsonb(row.old_value), toJsonb(row.new_value), row.details, row.ip_address, row.user_agent, prevHash, eventHash,
      ],
    );
  },

  async list(client: DbClient, opts: { limit: number; beforeId?: number }): Promise<AuditLogEntry[]> {
    const { rows } = await client.query<AuditRow>(
      `SELECT * FROM audit_log WHERE ($1::bigint IS NULL OR id < $1) ORDER BY id DESC LIMIT $2`,
      [opts.beforeId ?? null, opts.limit],
    );
    return rows.map(r => ({
      id: String(r.id),
      timestamp: r.occurred_at.toISOString(),
      actor: r.actor_label,
      actorRole: r.actor_role ?? undefined,
      action: r.action,
      targetType: r.target_type ?? undefined,
      target: r.target_id ?? '',
      details: r.details ?? undefined,
      oldValue: r.old_value ?? undefined,
      newValue: r.new_value ?? undefined,
      ipAddress: r.ip_address ?? undefined,
      prevHash: r.prev_hash,
      eventHash: r.event_hash,
    }));
  },

  async verifyChain(client: DbClient): Promise<AuditChainVerification> {
    let prevHash = GENESIS_HASH;
    let lastId = 0;
    let checked = 0;
    for (;;) {
      const { rows } = await client.query<AuditRow>('SELECT * FROM audit_log WHERE id > $1 ORDER BY id LIMIT 1000', [lastId]);
      if (rows.length === 0) break;
      for (const r of rows) {
        if (r.prev_hash !== prevHash) {
          return { valid: false, checked, firstInvalidId: String(r.id), reason: 'Broken link: prev_hash does not match the preceding entry' };
        }
        const { id: _id, prev_hash: _p, event_hash: _e, ...fields } = r;
        if (computeEventHash(prevHash, fields) !== r.event_hash) {
          return { valid: false, checked, firstInvalidId: String(r.id), reason: 'Entry contents do not match its event hash' };
        }
        prevHash = r.event_hash;
        lastId = r.id;
        checked++;
      }
    }
    return { valid: true, checked };
  },
};
