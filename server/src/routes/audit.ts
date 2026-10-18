import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool';
import { parseQuery } from '../lib/http';
import { contextFor, requireRole } from '../middleware/auth';
import { AuditService } from '../services/audit';

export const auditRouter = Router();

auditRouter.get('/', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const { limit, beforeId } = parseQuery(
    z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), beforeId: z.coerce.number().int().positive().optional() }),
    req,
  );
  res.json(await withTransaction(contextFor(user), client => AuditService.list(client, { limit, beforeId })));
});

auditRouter.get('/verify', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  res.json(await withTransaction(contextFor(user), client => AuditService.verifyChain(client)));
});
