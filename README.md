# Faculty Evaluation System (FES)

React 18 + TypeScript frontend with a Node.js / Express 5 API on PostgreSQL 16. Business rules, terminology and data models are defined in [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md); coding rules are in [`.cursorrules`](.cursorrules).

## Local development

Prerequisites: Node.js 20+ and Docker.

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run db:up                 # PostgreSQL on localhost:5433 (owner + least-privilege app role)
npm run db:migrate
npm run db:seed               # development demo data only; refused when NODE_ENV=production
npm run dev                   # API on :4000, web on http://localhost:5173 (Vite proxies /api)
```

Demo accounts created by the seed all use the password in `SEED_DEMO_PASSWORD` (default `Fes-Demo-2026!`):

| Role | Usernames |
| --- | --- |
| HR / QA | `admin` |
| Dean | `M001` (Computer Science), `M002` (Mathematics), `M003` (Physics) |
| Faculty | `faculty`, `faculty2`, `faculty3`, `faculty4` |
| Student | `C24-001` … `C24-025` |

Without `RESEND_API_KEY`, password-reset, invitation and username-recovery emails are printed to the API console so their links can be followed locally.

Other scripts: `npm run typecheck` (frontend + server), `npm run build` (SPA into `dist/`), `npm start` (API, also serving `dist/` when present), `npm run test:smoke` (end-to-end API checks — run against a freshly seeded database because it signs and releases the active term).

To reset the local database: `docker compose down -v`, then `db:up`, `db:migrate`, `db:seed`.

## Architecture

- **Server-authoritative data.** `GET /api/bootstrap` returns only what the signed-in role may see: HR / QA everything (including student IDs), Deans their department after HR / QA release, Faculty their own results after release, Students their enrollments. Cross-department comparisons for Deans and Faculty are delivered as server-computed aggregates. `src/store.ts` is a read cache of that payload; every mutation is an API call.
- **Defense in depth.** Route-level RBAC (`requireRole`) plus PostgreSQL row-level security on `evaluations` / `evaluation_ratings`, driven by a per-transaction security context (`fes.role`, `fes.department_id`, …). An unset context matches no rows.
- **Two-tier release.** HR / QA release (e-signed) immediately grants faculty access and closes the term to new submissions. The Dean's Oversight Sign-Off is due within 7 days and never gates faculty access.
- **E-signatures (RA 8792).** Each signature stores the exact agreement text, signer identity, term, signature image and a SHA-256 document hash; tracking IDs are `FES-[timestamp]-[hash prefix]`. Receipts are rendered server-side as PDFs from the stored record (`GET /api/agreements/:id/receipt.pdf`) and can be verified via `GET /api/agreements/verify/:trackingId`.
- **Audit trail.** `audit_log` is append-only (UPDATE/DELETE/TRUNCATE blocked by triggers; the runtime role only has SELECT/INSERT) and SHA-256 hash-chained; HR / QA can verify the chain from the Audit Trail tab.
- **Privacy (RA 10173).** Comments are never rewritten; `src/utils/pii.ts` redacts PII on the server before storage.
- **TNA.** Department / institution analyses are cached in `tna_snapshots` keyed by term and an input fingerprint. Individual faculty insights are deterministic, pre-approved templates (`tna_templates`, `src/utils/tnaEngine.ts`).

## Security controls

| Control | Implementation |
| --- | --- |
| Password storage | Argon2id (m=19 MiB, t=2, p=1), per-hash salt |
| Sessions | Opaque 256-bit token in an `HttpOnly; Secure; SameSite=Strict` `__Host-` cookie; only its SHA-256 is stored; 15-minute idle timeout (configurable 15–30), 12-hour absolute lifetime |
| Inactivity UX | Client monitor with a 2-minute countdown warning, synchronized across tabs |
| Brute force | Lockout after 5 consecutive failures (15 min); rate limits per IP+account and per IP |
| CSRF | SameSite=Strict + mandatory `X-FES-Request` header + Origin check |
| Recovery | Single-use reset tokens (30 min), invitation tokens (72 h), generic responses, masked email hints |
| Headers | Helmet with a strict CSP (production static hosting), HSTS in production, `Cache-Control: no-store` on the API |

## Production notes

- Run migrations with the owner role (`MIGRATION_DATABASE_URL`) and the API with a separate, non-owner, non-superuser role (`DATABASE_URL`, `DB_APP_ROLE`) — this is what makes the append-only guarantees hold against the application itself. A PostgreSQL superuser can still disable triggers; the audit hash chain makes such tampering detectable, and should be complemented by off-host log shipping / WORM backups.
- Serve over HTTPS on a single origin (the API serves `dist/`), set `APP_BASE_URL` to that origin and `TRUST_PROXY` to the number of proxies in front of the API.
- Configure `RESEND_API_KEY` and `MAIL_FROM`; in production, emails are not printed to the console, so without a key reset/invite emails fail (the failure is logged and the API still returns its generic response).
- Rate-limit counters are in memory; use a shared store (e.g. Redis) when running more than one API instance.
