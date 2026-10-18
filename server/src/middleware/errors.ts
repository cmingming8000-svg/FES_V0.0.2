import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http';

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  users_username_key: 'That username is already in use.',
  users_institutional_id_key: 'An account with that Student ID / Employee Number already exists.',
  users_email_key: 'That email address is already registered.',
  users_faculty_id_key: 'That faculty member already has a login account.',
  users_student_id_key: 'That student already has a login account.',
  faculty_pkey: 'A faculty member with that Employee Number already exists.',
  students_pkey: 'A student with that Student ID already exists.',
  evaluations_one_per_student_subject_term: 'You have already evaluated this subject for the current Academic Term.',
  academic_terms_single_active: 'Another Academic Term is already active.',
  criteria_active_name_key: 'A criterion with that name already exists.',
  hr_qa_releases_pkey: 'This Academic Term has already been released by HR / QA.',
  dean_oversight_signoffs_pkey: "The Dean's Oversight Sign-Off for this department and term is already on file.",
  faculty_acknowledgments_pkey: 'You have already acknowledged your results for this Academic Term.',
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    return;
  }

  const pgErr = err as PgError;
  if (pgErr?.code === '23505') {
    res.status(409).json({ error: { message: CONSTRAINT_MESSAGES[pgErr.constraint ?? ''] ?? 'That record already exists.', code: 'conflict' } });
    return;
  }
  if (pgErr?.code === '23503') {
    res.status(409).json({ error: { message: 'The record is referenced by other data and cannot be changed.', code: 'conflict' } });
    return;
  }
  if (pgErr?.code === '23514' || pgErr?.code === '22P02' || pgErr?.code === '22007') {
    res.status(400).json({ error: { message: 'The submitted data is not valid.', code: 'bad_request' } });
    return;
  }
  if (pgErr?.code === 'FES01') {
    res.status(403).json({ error: { message: 'This record is immutable and cannot be modified.', code: 'immutable_record' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Request payload is too large.', code: 'payload_too_large' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Malformed JSON body.', code: 'bad_request' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'An unexpected error occurred.', code: 'internal_error' } });
}
