import { Router } from 'express';
import { z } from 'zod';
import { SYSTEM_CONTEXT, withTransaction } from '../db/pool';
import { conflict, forbidden, notFound, parseQuery } from '../lib/http';
import { requireRole } from '../middleware/auth';
import { getDepartmentTNA, getInstitutionalTNA } from '../services/tna';

export const tnaRouter = Router();

const query = z.object({
  cycleId: z.string().min(1).max(64),
  department: z.string().max(120).optional(),
  refresh: z.enum(['0', '1']).optional(),
});

// Snapshots aggregate institution data, so they are computed in the SYSTEM
// context after the RBAC checks below have scoped what the caller may request.
tnaRouter.get('/department', async (req, res) => {
  const user = requireRole(req, 'dean', 'hr_qa');
  const q = parseQuery(query, req);
  const result = await withTransaction(SYSTEM_CONTEXT, async client => {
    const deptName = user.role === 'dean' ? user.departmentName : q.department;
    if (user.role === 'dean' && q.department && q.department !== user.departmentName) throw forbidden();
    const department = (await client.query('SELECT id, name FROM departments WHERE name = $1', [deptName])).rows[0];
    if (!department) throw notFound('Department not found');
    if (user.role === 'dean' && !(await client.query('SELECT 1 FROM hr_qa_releases WHERE term_id = $1', [q.cycleId])).rowCount) {
      throw conflict('HR / QA has not released this Academic Term yet.');
    }
    return getDepartmentTNA(client, q.cycleId, department, user.id, user.role === 'hr_qa' && q.refresh === '1');
  });
  res.json(result);
});

tnaRouter.get('/institution', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const q = parseQuery(query, req);
  const result = await withTransaction(SYSTEM_CONTEXT, async client => {
    if (!(await client.query('SELECT 1 FROM academic_terms WHERE id = $1', [q.cycleId])).rowCount) throw notFound('Academic Term not found');
    return getInstitutionalTNA(client, q.cycleId, user.id, q.refresh === '1');
  });
  res.json(result);
});
