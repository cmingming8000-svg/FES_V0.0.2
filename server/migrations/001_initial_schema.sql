-- =============================================================================
-- FES — Faculty Evaluation System: initial relational schema
-- Terminology: Academic Term / Semester, HR / Quality Assurance (QA),
-- Dean's Oversight Sign-Off, Performance Indicators.
-- Compliance: RA 8792 (e-signatures, SHA-256 document hashing, non-repudiation)
--             RA 10173 (student PII protection; verbatim, regex-redacted comments)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('student', 'faculty', 'dean', 'hr_qa');
CREATE TYPE term_status AS ENUM ('upcoming', 'active', 'completed', 'archived');
CREATE TYPE agreement_type AS ENUM ('hr_qa_release', 'dean_oversight_signoff', 'faculty_acknowledgment');
CREATE TYPE token_purpose AS ENUM ('password_reset', 'account_invite');
CREATE TYPE tna_scope AS ENUM ('department', 'institution');

-- -----------------------------------------------------------------------------
-- Institutional structure
-- -----------------------------------------------------------------------------
CREATE TABLE departments (
  id          text PRIMARY KEY CHECK (id ~ '^[A-Z0-9_-]{2,16}$'),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE programs (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  department_id  text NOT NULL REFERENCES departments(id) ON DELETE RESTRICT
);
CREATE INDEX programs_department_idx ON programs (department_id);

CREATE TABLE faculty (
  id             text PRIMARY KEY,                -- Employee Number
  name           text NOT NULL,
  title          text NOT NULL,
  department_id  text NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faculty_department_idx ON faculty (department_id);

CREATE TABLE subjects (
  id          text PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  program_id  text NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  faculty_id  text NOT NULL REFERENCES faculty(id) ON DELETE RESTRICT  -- professor evaluated for this subject
);
CREATE INDEX subjects_program_idx ON subjects (program_id);
CREATE INDEX subjects_faculty_idx ON subjects (faculty_id);

CREATE TABLE faculty_courses (
  faculty_id  text NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  subject_id  text NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  PRIMARY KEY (faculty_id, subject_id)
);
CREATE INDEX faculty_courses_subject_idx ON faculty_courses (subject_id);

CREATE TABLE students (
  id          text PRIMARY KEY,                   -- Student ID
  name        text NOT NULL,
  program_id  text NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_program_idx ON students (program_id);

CREATE TABLE student_enrollments (
  student_id  text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id  text NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  PRIMARY KEY (student_id, subject_id)
);
CREATE INDEX student_enrollments_subject_idx ON student_enrollments (subject_id);

-- -----------------------------------------------------------------------------
-- Identity, credentials, sessions
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username             text NOT NULL,
  email                text,
  password_hash        text,                       -- Argon2id PHC string; NULL until an invite is accepted
  role                 user_role NOT NULL,
  display_name         text NOT NULL,
  institutional_id     text NOT NULL,              -- Student ID / Employee Number
  department_id        text REFERENCES departments(id) ON DELETE RESTRICT,
  faculty_id           text UNIQUE REFERENCES faculty(id) ON DELETE RESTRICT,
  student_id           text UNIQUE REFERENCES students(id) ON DELETE RESTRICT,
  is_active            boolean NOT NULL DEFAULT true,
  failed_login_count   integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until         timestamptz,
  password_changed_at  timestamptz,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_password_hash_format CHECK (password_hash IS NULL OR password_hash LIKE '$argon2%' OR password_hash LIKE '$2%'),
  CONSTRAINT users_role_links CHECK (
    (role = 'student' AND student_id IS NOT NULL AND faculty_id IS NULL) OR
    (role = 'faculty' AND faculty_id IS NOT NULL AND student_id IS NULL AND department_id IS NOT NULL) OR
    (role = 'dean'    AND department_id IS NOT NULL AND student_id IS NULL AND faculty_id IS NULL) OR
    (role = 'hr_qa'   AND student_id IS NULL AND faculty_id IS NULL)
  )
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE UNIQUE INDEX users_institutional_id_key ON users (lower(institutional_id));
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_department_idx ON users (department_id);

CREATE TABLE sessions (
  id            char(64) PRIMARY KEY,              -- SHA-256 of the opaque cookie token (raw token never stored)
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,              -- absolute lifetime
  revoked_at    timestamptz,
  ip_address    text,
  user_agent    text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE auth_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    char(64) NOT NULL UNIQUE,          -- SHA-256 of the emailed token
  purpose       token_purpose NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  requested_ip  text
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- -----------------------------------------------------------------------------
-- Academic Terms, criteria, Performance Indicators
-- -----------------------------------------------------------------------------
CREATE TABLE academic_terms (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  display_name  text NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  status        term_status NOT NULL DEFAULT 'upcoming',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_terms_dates CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX academic_terms_single_active ON academic_terms ((true)) WHERE status = 'active';

CREATE TABLE criteria (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  sort_order   integer NOT NULL,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX criteria_active_name_key ON criteria (lower(name)) WHERE archived_at IS NULL;

CREATE TABLE performance_indicators (
  id            text PRIMARY KEY,
  criterion_id  text NOT NULL REFERENCES criteria(id) ON DELETE RESTRICT,
  text          text NOT NULL,
  sort_order    integer NOT NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX performance_indicators_active_idx ON performance_indicators (criterion_id, sort_order) WHERE archived_at IS NULL;

-- -----------------------------------------------------------------------------
-- Student evaluations (immutable once submitted)
-- -----------------------------------------------------------------------------
CREATE TABLE evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id       text NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  faculty_id    text NOT NULL REFERENCES faculty(id) ON DELETE RESTRICT,
  subject_id    text NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  student_id    text REFERENCES students(id) ON DELETE RESTRICT,  -- HR/QA verification only; never exposed to faculty or deans
  feedback      text NOT NULL DEFAULT '' CHECK (char_length(feedback) <= 5000),  -- verbatim, regex PII-redacted
  submitted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX evaluations_one_per_student_subject_term ON evaluations (term_id, subject_id, student_id) WHERE student_id IS NOT NULL;
CREATE INDEX evaluations_term_faculty_idx ON evaluations (term_id, faculty_id);
CREATE INDEX evaluations_faculty_idx ON evaluations (faculty_id);

CREATE TABLE evaluation_ratings (
  evaluation_id  uuid NOT NULL REFERENCES evaluations(id) ON DELETE RESTRICT,
  indicator_id   text NOT NULL REFERENCES performance_indicators(id) ON DELETE RESTRICT,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  PRIMARY KEY (evaluation_id, indicator_id)
);
CREATE INDEX evaluation_ratings_indicator_idx ON evaluation_ratings (indicator_id);

-- -----------------------------------------------------------------------------
-- E-signatures (RA 8792) and the two-tier release workflow
-- -----------------------------------------------------------------------------
CREATE TABLE agreements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id              text NOT NULL UNIQUE,   -- FES-[timestamp]-[hash prefix]
  agreement_type           agreement_type NOT NULL,
  term_id                  text NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  term_display_name        text NOT NULL,
  signer_user_id           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signer_name              text NOT NULL,
  signer_role              user_role NOT NULL,
  signer_institutional_id  text NOT NULL,
  department_id            text REFERENCES departments(id) ON DELETE RESTRICT,
  faculty_id               text REFERENCES faculty(id) ON DELETE RESTRICT,
  terms_version            text NOT NULL,
  terms_text               text NOT NULL,          -- exact text the signer agreed to
  signature_png            text NOT NULL CHECK (signature_png LIKE 'data:image/png;base64,%' AND char_length(signature_png) <= 600000),
  signature_sha256         char(64) NOT NULL,
  signed_at                timestamptz NOT NULL,
  ip_address               text,
  user_agent               text,
  document_hash            char(64) NOT NULL       -- SHA-256 over the canonical agreement record
);
CREATE INDEX agreements_term_idx ON agreements (term_id, agreement_type);
CREATE INDEX agreements_signer_idx ON agreements (signer_user_id);

CREATE TABLE hr_qa_releases (
  term_id       text PRIMARY KEY REFERENCES academic_terms(id) ON DELETE RESTRICT,
  released_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  released_at   timestamptz NOT NULL,
  agreement_id  uuid NOT NULL UNIQUE REFERENCES agreements(id) ON DELETE RESTRICT
);

CREATE TABLE dean_oversight_signoffs (
  term_id        text NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  department_id  text NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  signed_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signed_at      timestamptz NOT NULL,
  comments       text CHECK (comments IS NULL OR char_length(comments) <= 2000),
  agreement_id   uuid NOT NULL UNIQUE REFERENCES agreements(id) ON DELETE RESTRICT,
  PRIMARY KEY (term_id, department_id)
);

CREATE TABLE faculty_acknowledgments (
  term_id          text NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  faculty_id       text NOT NULL REFERENCES faculty(id) ON DELETE RESTRICT,
  acknowledged_by  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  acknowledged_at  timestamptz NOT NULL,
  agreement_id     uuid NOT NULL UNIQUE REFERENCES agreements(id) ON DELETE RESTRICT,
  PRIMARY KEY (term_id, faculty_id)
);

CREATE TABLE acknowledgment_reminders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term_id     text NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  faculty_id  text NOT NULL REFERENCES faculty(id) ON DELETE RESTRICT,
  sent_by     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acknowledgment_reminders_lookup_idx ON acknowledgment_reminders (term_id, faculty_id, sent_at DESC);

-- -----------------------------------------------------------------------------
-- Immutable, hash-chained audit trail
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at    timestamptz NOT NULL,
  actor_user_id  uuid REFERENCES users(id) ON DELETE RESTRICT,
  actor_label    text NOT NULL,
  actor_role     text,
  action         text NOT NULL,
  target_type    text,
  target_id      text,
  old_value      jsonb,
  new_value      jsonb,
  details        text,
  ip_address     text,
  user_agent     text,
  prev_hash      char(64) NOT NULL,                -- event_hash of the preceding row (genesis = 64 zeros)
  event_hash     char(64) NOT NULL UNIQUE          -- SHA-256(prev_hash || canonical event JSON)
);
CREATE INDEX audit_log_occurred_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_action_idx ON audit_log (action);

-- -----------------------------------------------------------------------------
-- Training Needs Analysis
-- -----------------------------------------------------------------------------
CREATE TABLE tna_templates (
  id              text PRIMARY KEY,
  criterion_id    text NOT NULL REFERENCES criteria(id) ON DELETE RESTRICT,
  threshold       numeric(3,2) NOT NULL DEFAULT 3.00 CHECK (threshold > 0 AND threshold <= 5),
  recommendation  text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tna_templates_criterion_idx ON tna_templates (criterion_id);

CREATE TABLE tna_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              tna_scope NOT NULL,
  term_id            text NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  department_id      text REFERENCES departments(id) ON DELETE RESTRICT,
  input_fingerprint  char(64) NOT NULL,            -- SHA-256 of the inputs; snapshot reused while unchanged
  payload            jsonb NOT NULL,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  generated_by       uuid REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT tna_snapshots_scope_department CHECK ((scope = 'department') = (department_id IS NOT NULL))
);
CREATE UNIQUE INDEX tna_snapshots_key ON tna_snapshots (scope, term_id, COALESCE(department_id, ''));

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------
CREATE FUNCTION fes_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FES: % on % is prohibited (append-only record)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'FES01';
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log', 'agreements', 'hr_qa_releases', 'dean_oversight_signoffs',
    'faculty_acknowledgments', 'acknowledgment_reminders', 'evaluations', 'evaluation_ratings'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fes_reject_mutation()', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION fes_reject_mutation()', t || '_no_truncate', t);
  END LOOP;
END
$$;

CREATE FUNCTION fes_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fes_touch_updated_at();
CREATE TRIGGER academic_terms_touch_updated_at BEFORE UPDATE ON academic_terms FOR EACH ROW EXECUTE FUNCTION fes_touch_updated_at();
CREATE TRIGGER performance_indicators_touch_updated_at BEFORE UPDATE ON performance_indicators FOR EACH ROW EXECUTE FUNCTION fes_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row-level security (defense in depth behind the API's RBAC checks).
-- The API sets fes.role / fes.department_id / fes.faculty_id / fes.student_id
-- per transaction; an unset context matches no rows (fail closed).
-- -----------------------------------------------------------------------------
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations FORCE ROW LEVEL SECURITY;

CREATE POLICY evaluations_select ON evaluations FOR SELECT USING (
  current_setting('fes.role', true) IN ('system', 'hr_qa')
  OR (
    current_setting('fes.role', true) = 'dean'
    AND EXISTS (SELECT 1 FROM hr_qa_releases r WHERE r.term_id = evaluations.term_id)
    AND EXISTS (SELECT 1 FROM faculty f WHERE f.id = evaluations.faculty_id AND f.department_id = current_setting('fes.department_id', true))
  )
  OR (
    current_setting('fes.role', true) = 'faculty'
    AND evaluations.faculty_id = current_setting('fes.faculty_id', true)
    AND EXISTS (SELECT 1 FROM hr_qa_releases r WHERE r.term_id = evaluations.term_id)
  )
  OR (
    current_setting('fes.role', true) = 'student'
    AND evaluations.student_id = current_setting('fes.student_id', true)
  )
);

CREATE POLICY evaluations_insert ON evaluations FOR INSERT WITH CHECK (
  current_setting('fes.role', true) = 'system'
  OR (current_setting('fes.role', true) = 'student' AND student_id = current_setting('fes.student_id', true))
);

ALTER TABLE evaluation_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_ratings FORCE ROW LEVEL SECURITY;

CREATE POLICY evaluation_ratings_select ON evaluation_ratings FOR SELECT USING (
  EXISTS (SELECT 1 FROM evaluations e WHERE e.id = evaluation_ratings.evaluation_id)
);

CREATE POLICY evaluation_ratings_insert ON evaluation_ratings FOR INSERT WITH CHECK (
  current_setting('fes.role', true) = 'system'
  OR (
    current_setting('fes.role', true) = 'student'
    AND EXISTS (
      SELECT 1 FROM evaluations e
      WHERE e.id = evaluation_ratings.evaluation_id
        AND e.student_id = current_setting('fes.student_id', true)
    )
  )
);

-- -----------------------------------------------------------------------------
-- Least-privilege grants for the runtime role (set by the migration runner via
-- `SET fes.app_role`). Append-only tables receive SELECT/INSERT only.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  app_role text := current_setting('fes.app_role', true);
BEGIN
  IF app_role IS NULL OR app_role = '' THEN
    RAISE NOTICE 'fes.app_role not set; skipping runtime grants';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE NOTICE 'Role % does not exist; skipping runtime grants', app_role;
    RETURN;
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON departments, programs, faculty, subjects, faculty_courses, students, '
    'student_enrollments, users, sessions, auth_tokens, academic_terms, criteria, performance_indicators, '
    'tna_templates, tna_snapshots TO %I', app_role);
  EXECUTE format(
    'GRANT SELECT, INSERT ON evaluations, evaluation_ratings, agreements, hr_qa_releases, dean_oversight_signoffs, '
    'faculty_acknowledgments, acknowledgment_reminders, audit_log TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
END
$$;
