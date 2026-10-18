# PROJECT_CONTEXT.md — Faculty Evaluation System (FES)

> **Master Single Source of Truth.** This document defines the business rules, architecture, rubrics, TypeScript models, workflows, and compliance mandates for the Faculty Evaluation System (FES) platform. All code, architecture decisions, data models, and business logic MUST conform to this document. If code and this document disagree, this document wins. Update this file first whenever a system rule changes.

## Table of Contents
1. [Business & System Overview](#1-business--system-overview)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Repository File Structure](#3-repository-file-structure)
4. [Evaluation Criteria & Rubric Structure](#4-evaluation-criteria--rubric-structure)
5. [Data Models & TypeScript Interfaces](#5-data-models--typescript-interfaces)
6. [Core Workflows & Policies](#6-core-workflows--policies)
   - [6.1 Student Evaluation & PII Anonymization](#61-student-evaluation--pii-anonymization)
   - [6.2 Two-Tier Release & Oversight Workflow](#62-two-tier-release--oversight-workflow)
   - [6.3 E-Signatures & Audit Trails](#63-e-signatures--audit-trails)
7. [Reporting & Export System](#7-reporting--export-system)
8. [Security & Compliance Guardrails](#8-security--compliance-guardrails)
9. [Quick Reference & Terminologies](#9-quick-reference--terminologies)

---

## 1. Business & System Overview

| Field             | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| **System Name**   | Faculty Evaluation System (FES)                                   |
| **Domain**        | Higher Education Institutional Management (Philippines)            |
| **Core Philosophy** | Designed for professional development and continuous institutional improvement rather than punitive measures. HR retains verification visibility through student IDs, while student evaluation ratings remain strictly anonymized. |

### Core Modules
1. **Student Evaluation Module** — Secure three-step evaluation flow (Program $\rightarrow$ Subject $\rightarrow$ Professor) with automated PII regex redaction.
2. **HR / QA Administration Dashboard** — Tabbed interface managing system-wide academic terms, faculty data, criteria editors, TNA analytics, and audit logs.
3. **Dean Department Oversight** — Departmental aggregate reviews, drill-downs into individual faculty metrics, and comparative analytics.
4. **Faculty Dashboard & Acknowledgment** — Access to personal evaluation metrics, automated professional development insights, and e-signature sign-offs.

---

## 2. Tech Stack & Architecture

| Layer / Category   | Technology / Package                                    |
| ------------------ | ------------------------------------------------------- |
| **Framework**      | React 18, TypeScript, Vite                              |
| **Styling**        | Tailwind CSS                                            |
| **Routing**        | React Router DOM (`v6.30.6`)                            |
| **Data Viz**       | Recharts (`v2.15.4`)                                    |
| **UI Enhancements**| Lucide React (`v0.294.0`), Framer Motion, Confetti      |
| **State / Storage**| PostgreSQL 16 — relational schema with foreign keys, indexes, row-level security and append-only audit tables (`server/migrations/`) |
| **Report Exports** | `jspdf` (`v4.2.1`), `exceljs` (`v4.4.0`)                  |
| **Backend & Sync** | Node.js / Express 5 API (`server/`), `pg`, Argon2id (`@node-rs/argon2`), `zod` validation, Resend transactional email |

---

## 3. Repository File Structure

- **Core Configuration:** `.gitignore`, `index.html`, `package.json`, `PROJECT_SUMMARY.md`, `README.md`, `.cursorrules`, `PROJECT_CONTEXT.md`, `.env.example`, `docker-compose.yml`
- **Application Entry & State:** `src/App.tsx`, `src/auth.tsx` (server session + inactivity monitor), `src/store.ts` (role-scoped cache of API data), `src/api/client.ts`, `src/types.ts` (API contract shared with the server), `src/constants.ts`
- **Layout & Navigation:** `src/components/Layout.tsx`, `src/components/Login.tsx`, `src/components/SessionTimeoutWarning.tsx`, `src/pages/AccountRecovery.tsx`
- **Modals & Interactive Tools:** `src/components/ConfirmDialog.tsx`, `src/components/SignaturePad.tsx`, `src/components/AgreementSignModal.tsx`, `src/components/BulkImport.tsx`
- **Reporting & Print Modules:** 
  - `src/components/AdminPrintReport.tsx`
  - `src/components/DeanPrintReport.tsx`
  - `src/components/FacultyPrintReport.tsx`
- **Utilities & Security:** `src/utils/pii.ts` (automated regex PII redactor, also applied server-side), `src/utils/tnaEngine.ts` (deterministic individual TNA rules), `src/utils/terminology.ts`
- **Backend (`server/`):** `migrations/` (SQL schema), `src/routes/` (auth, data, terms, criteria, accounts, agreements, audit, tna), `src/services/` (`AuditService`, agreements & receipt PDFs, TNA snapshots, bootstrap scoping, accounts, mail), `src/security/` (Argon2id passwords, sessions), `src/middleware/` (RBAC, CSRF, rate limits), `scripts/smoke-test.ts`

---

## 4. Evaluation Criteria & Rubric Structure

All evaluation items map strictly to four core institutional domains. Ratings use a **1 to 5 scale** (1 = Poor, 2 = Needs Improvement, 3 = Good/Benchmark, 4 = Very Good, 5 = Excellent).

| Evaluation Domain | Focus / Description |
| ----------------- | ------------------- |
| **Teaching Style** | Effective/engaging methods, clear presentation, active participation. |
| **Mastery of Subject** | Deep knowledge, accurate answers, theory-to-application connection. |
| **Punctuality** | On-class timeliness, prompt feedback/grades, consistent office hours. |
| **Professionalism** | Respectful communication, fairness, integrity, commitment to student success. |

---

## 5. Data Models & TypeScript Interfaces

TypeScript identifiers are kept stable for the codebase; user-facing labels and database tables use institutional terminology: `EvaluationCycle` = **Academic Term / Semester** (`academic_terms`), `SubQuestion` = **Performance Indicator** (`performance_indicators`), `DeanRelease` = **Dean's Oversight Sign-Off** (`dean_oversight_signoffs`), `AdminRelease` = **HR / QA Release** (`hr_qa_releases`). The canonical definitions live in `src/types.ts`.

### User Structure
```typescript
export type UserRole = 'hr_qa' | 'faculty' | 'student' | 'dean'; // 'hr_qa' = HR / Quality Assurance (QA)

export interface User {
  id: string;
  username: string;
  password: string; // Server-side only: salted Argon2id hash; never sent to the browser
  role: UserRole;
  displayName: string;
  facultyId?: string;
  department?: string;
}

export interface SubQuestion {
  id: string;
  criterionId: string;
  text: string;
  order: number;
}

export interface AdminRelease {
  releasedAt: string;
  releasedBy: string;
  termId: string;
}

export interface DeanRelease {
  signedOffAt: string;
  signedOffBy: string;
  comments?: string;
}

export interface Evaluation {
  id: string;
  facultyId: string;
  courseId: string;
  cycleId: string;
  ratings: Record<string, number>;
  feedback: string;
  submittedAt: string;
  studentId?: string; // Stored for HR / QA verification only, hidden from faculty and deans
}

export interface EvaluationCycle {
  id: string;
  name: string;
  displayName: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'upcoming' | 'completed' | 'archived';
  verificationStatus?: 'pending_verification' | 'verified' | 'released';
  verifiedAt?: string;
  verifiedBy?: string;
  adminRelease?: AdminRelease;
  deanReleases?: Record<string, DeanRelease>;
}
```
