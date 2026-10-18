import { Router } from 'express';
import { z } from 'zod';
import type { BulkImportResult } from '../../../src/types';
import { withTransaction } from '../db/pool';
import { clientIp, parseBody, userAgent } from '../lib/http';
import { actorFor, contextFor, requireRole } from '../middleware/auth';
import { accountInputSchema, createAccount, createAccountsBulk, loadLookups, sendInviteEmail, MAX_BULK_ROWS } from '../services/accounts';
import { AuditService } from '../services/audit';

export const accountsRouter = Router();

accountsRouter.post('/', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const input = parseBody(accountInputSchema, req);
  const account = await withTransaction(contextFor(user), async client => {
    const created = await createAccount(client, input, await loadLookups(client));
    await AuditService.record(client, {
      actor: actorFor(user), action: 'account_created', targetType: 'user', targetId: created.userId,
      newValue: { role: created.role, username: created.username, institutionalId: created.institutionalId, invited: !!created.inviteToken },
      details: `Created ${created.role} account for ${created.displayName}`, ip: clientIp(req), userAgent: userAgent(req),
    });
    return created;
  });
  sendInviteEmail(account);
  res.status(201).json({
    username: account.username,
    message: account.inviteToken
      ? `Account created. An invitation to set a password was emailed to ${account.email}.`
      : 'Account created successfully.',
  });
});

accountsRouter.post('/bulk', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const { rows } = parseBody(z.object({ rows: z.array(z.unknown()).max(MAX_BULK_ROWS) }), req);
  const created = await withTransaction(contextFor(user), async client => {
    const accounts = await createAccountsBulk(client, rows);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'accounts_bulk_imported', targetType: 'user', targetId: `${accounts.length} accounts`,
      newValue: { count: accounts.length, byRole: accounts.reduce<Record<string, number>>((m, a) => ({ ...m, [a.role]: (m[a.role] ?? 0) + 1 }), {}) },
      details: `Bulk onboarding created ${accounts.length} account(s); invitations emailed`, ip: clientIp(req), userAgent: userAgent(req),
    });
    return accounts;
  });
  created.forEach(sendInviteEmail);
  res.status(201).json({
    created: created.length,
    rows: created.map((a, i) => ({ row: i + 2, institutionalId: a.institutionalId, username: a.username, role: a.role })),
  } satisfies BulkImportResult);
});
