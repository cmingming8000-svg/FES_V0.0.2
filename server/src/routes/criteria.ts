import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool';
import { clientIp, notFound, parseBody, userAgent } from '../lib/http';
import { actorFor, contextFor, requireRole } from '../middleware/auth';
import { AuditService } from '../services/audit';

export const criteriaRouter = Router();

const nameSchema = z.object({ name: z.string().trim().min(2).max(120) });
const textSchema = z.object({ text: z.string().trim().min(3).max(300) });

criteriaRouter.post('/criteria', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const { name } = parseBody(nameSchema, req);
  const id = `crit-${randomUUID().slice(0, 8)}`;
  await withTransaction(contextFor(user), async client => {
    await client.query(
      `INSERT INTO criteria (id, name, sort_order)
       VALUES ($1, $2, COALESCE((SELECT max(sort_order) FROM criteria WHERE archived_at IS NULL), 0) + 1)`,
      [id, name],
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'criterion_added', targetType: 'criterion', targetId: id, newValue: { name },
      details: `Added criterion "${name}"`, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(201).json({ id });
});

/** Criteria are archived, not deleted, so historical ratings stay intact. */
criteriaRouter.delete('/criteria/:id', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  await withTransaction(contextFor(user), async client => {
    const crit = (await client.query('SELECT id, name FROM criteria WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [req.params.id])).rows[0];
    if (!crit) throw notFound('Criterion not found');
    const indicators = await client.query(
      'UPDATE performance_indicators SET archived_at = now() WHERE criterion_id = $1 AND archived_at IS NULL RETURNING id, text',
      [crit.id],
    );
    await client.query('UPDATE criteria SET archived_at = now() WHERE id = $1', [crit.id]);
    await client.query(
      `UPDATE criteria c SET sort_order = o.rn
         FROM (SELECT id, row_number() OVER (ORDER BY sort_order, name) AS rn FROM criteria WHERE archived_at IS NULL) o
        WHERE c.id = o.id`,
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'criterion_removed', targetType: 'criterion', targetId: crit.id,
      oldValue: { name: crit.name, indicators: indicators.rows },
      details: `Archived criterion "${crit.name}" and ${indicators.rowCount} Performance Indicator(s)`, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(204).end();
});

criteriaRouter.post('/criteria/:id/indicators', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const { text } = parseBody(textSchema, req);
  const id = `pi-${randomUUID().slice(0, 8)}`;
  await withTransaction(contextFor(user), async client => {
    const crit = (await client.query('SELECT id, name FROM criteria WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [req.params.id])).rows[0];
    if (!crit) throw notFound('Criterion not found');
    await client.query(
      `INSERT INTO performance_indicators (id, criterion_id, text, sort_order)
       VALUES ($1, $2, $3, COALESCE((SELECT max(sort_order) FROM performance_indicators WHERE criterion_id = $2 AND archived_at IS NULL), 0) + 1)`,
      [id, crit.id, text],
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'indicator_added', targetType: 'performance_indicator', targetId: id,
      newValue: { criterionId: crit.id, text }, details: `Added Performance Indicator to "${crit.name}"`, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(201).json({ id });
});

criteriaRouter.patch('/indicators/:id', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  const { text } = parseBody(textSchema, req);
  await withTransaction(contextFor(user), async client => {
    const pi = (await client.query('SELECT id, text, criterion_id FROM performance_indicators WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [req.params.id])).rows[0];
    if (!pi) throw notFound('Performance Indicator not found');
    await client.query('UPDATE performance_indicators SET text = $2 WHERE id = $1', [pi.id, text]);
    await AuditService.record(client, {
      actor: actorFor(user), action: 'indicator_edited', targetType: 'performance_indicator', targetId: pi.id,
      oldValue: { text: pi.text }, newValue: { text }, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(204).end();
});

criteriaRouter.delete('/indicators/:id', async (req, res) => {
  const user = requireRole(req, 'hr_qa');
  await withTransaction(contextFor(user), async client => {
    const pi = (await client.query('SELECT id, text, criterion_id FROM performance_indicators WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [req.params.id])).rows[0];
    if (!pi) throw notFound('Performance Indicator not found');
    await client.query('UPDATE performance_indicators SET archived_at = now() WHERE id = $1', [pi.id]);
    await client.query(
      `UPDATE performance_indicators p SET sort_order = o.rn
         FROM (SELECT id, row_number() OVER (ORDER BY sort_order) AS rn FROM performance_indicators WHERE criterion_id = $1 AND archived_at IS NULL) o
        WHERE p.id = o.id`,
      [pi.criterion_id],
    );
    await AuditService.record(client, {
      actor: actorFor(user), action: 'indicator_removed', targetType: 'performance_indicator', targetId: pi.id,
      oldValue: { criterionId: pi.criterion_id, text: pi.text }, ip: clientIp(req), userAgent: userAgent(req),
    });
  });
  res.status(204).end();
});
