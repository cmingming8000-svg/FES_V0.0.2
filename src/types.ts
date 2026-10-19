export type UserRole = 'hr_qa' | 'faculty' | 'student' | 'dean';

export interface User {
  id: string;
  username: string;
  password: string; // Server-side only: Argon2id hash, never sent to the browser
  role: UserRole;
  displayName: string;
  facultyId?: string;
  department?: string;
}

/** The authenticated user as returned by the API (credentials stripped). */
export interface PublicUser extends Omit<User, 'password'> {
  institutionalId: string; // Student ID / Employee Number
  email?: string;
  studentId?: string;
}

/** A Performance Indicator (displayed as "Performance Indicator"; stored in `performance_indicators`). */
export interface SubQuestion {
  id: string;
  criterionId: string;
  text: string;
  order: number;
}

export interface Faculty {
  id: string;
  name: string;
  department: string;
  title: string;
  courses: string[];
  /** Status for the currently active Academic Term. */
  acknowledgmentStatus: 'pending_review' | 'pending_acknowledgment' | 'acknowledged';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  lastReminderSent?: string;
}

export interface Program {
  id: string;
  name: string;
  department: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  programId: string;
  facultyId: string;
}

export interface Student {
  id: string;
  name: string;
  programId: string;
  enrolledSubjects: string[];
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

/** An Academic Term / Semester (stored in `academic_terms`). */
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

export interface Criterion {
  id: string;
  name: string;
  order: number;
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

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  target: string;
  details?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  prevHash: string;
  eventHash: string;
}

export interface AuditChainVerification {
  valid: boolean;
  checked: number;
  firstInvalidId?: string;
  reason?: string;
}

export type EventType = 'criteria_changed' | 'cycle_changed' | 'submission_added' | 'data_refresh' | 'acknowledgment_changed' | 'training_changed' | 'dispute_submitted' | 'dispute_resolved' | 'verification_changed';

export interface FacultyMetrics {
  totalSubmissions: number;
  overallAverage: number;
  criteriaAverages: Record<string, number>;
  subQuestionAverages: Record<string, number>;
  scoreDistribution: number[];
  feedback: Array<{ feedback: string; courseId: string; submittedAt: string }>;
  courseBreakdown: Record<string, { count: number; average: number }>;
}

// ---------------------------------------------------------------------------
// E-signatures & agreements (RA 8792)
// ---------------------------------------------------------------------------
export type AgreementType = 'hr_qa_release' | 'dean_oversight_signoff' | 'faculty_acknowledgment';

export interface AgreementTemplate {
  type: AgreementType;
  version: string;
  title: string;
  clauses: string[];
}

export interface AgreementSummary {
  id: string;
  trackingId: string;
  type: AgreementType;
  termId: string;
  termDisplayName: string;
  department?: string;
  facultyId?: string;
  signerName: string;
  signerRole: UserRole;
  signerInstitutionalId: string;
  signedAt: string;
  termsVersion: string;
  documentHash: string;
}

export interface AgreementVerification {
  valid: boolean;
  trackingId: string;
  type: AgreementType;
  signerName: string;
  signedAt: string;
  documentHash: string;
  recomputedHash: string;
}

// ---------------------------------------------------------------------------
// Training Needs Analysis
// ---------------------------------------------------------------------------
export interface TNATemplate {
  id: string;
  criterionId: string;
  threshold: number;
  recommendation: string;
  order: number;
}

export interface IndividualRecommendation {
  criterionId: string;
  criterionName: string;
  average: number;
  recommendations: string[];
}

export interface TNADeficit {
  criterionId: string;
  criterionName: string;
  average: number;
  deficit: number;
  severity: 'critical' | 'high' | 'medium';
  subQuestionDeficits: Array<{
    subQuestionId: string;
    subQuestionText: string;
    average: number;
    deficit: number;
  }>;
}

export interface DepartmentTNA {
  department: string;
  cycleId: string;
  generatedAt: string;
  overallAverage: number;
  totalSubmissions: number;
  deficits: TNADeficit[];
  feedbackThemes: {
    positive: string[];
    negative: string[];
    sentimentRatio: number;
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  priorityScore: number;
}

export interface InstitutionalTNA {
  cycleId: string;
  generatedAt: string;
  departments: DepartmentTNA[];
  institutionalAverage: number;
  totalSubmissions: number;
  criticalDepartments: string[];
  crossDepartmentalThemes: {
    strengths: string[];
    weaknesses: string[];
  };
  strategicRecommendations: {
    institutionWide: string[];
    departmentSpecific: Record<string, string[]>;
  };
}

export interface TNASnapshotResponse<T> {
  snapshot: T;
  generatedAt: string;
  cached: boolean;
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// Aggregates the server computes on behalf of roles that cannot read
// institution-wide evaluation rows (deans, faculty).
// ---------------------------------------------------------------------------
export interface DepartmentAggregate {
  totalSubmissions: number;
  totalFaculty: number;
  average: number;
  criteriaAverages: Record<string, number>;
}

export interface TermStats {
  institutionAverage: number;
  departments: Record<string, DepartmentAggregate>;
  facultyRank?: { rank: number; of: number };
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------
export interface SessionInfo {
  idleTimeoutSeconds: number;
  expiresAt: string;
}

export interface MeResponse {
  user: PublicUser;
  session: SessionInfo;
}

export interface BootstrapPayload {
  user: PublicUser;
  departments: string[];
  programs: Program[];
  subjects: Subject[];
  faculty: Faculty[];
  students: Student[];
  cycles: EvaluationCycle[];
  criteria: Criterion[];
  subQuestions: SubQuestion[];
  evaluations: Evaluation[];
  loadedCycleIds: string[];
  agreements: AgreementSummary[];
  evaluatedSubjectIds: string[];
  termStats: Record<string, TermStats>;
  tnaTemplates: TNATemplate[];
}

export interface BulkImportRow {
  role: UserRole;
  institutionalId: string;
  name: string;
  email: string;
  username?: string;
  department?: string;
  programId?: string;
  title?: string;
  subjects?: string[];
}

export interface BulkImportResult {
  created: number;
  rows: Array<{ row: number; institutionalId: string; username: string; role: UserRole }>;
}

/** An account as listed for HR / QA management (credentials never included). */
export interface ManagedAccount {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  institutionalId: string;
  department: string | null;
  isActive: boolean;
  hasPassword: boolean; // false while an invitation is still pending
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

// Dean Analytics Types
export interface DeanFacultyDrilldown {
  faculty: Faculty;
  metrics: FacultyMetrics;
  criteriaBreakdown: Array<{
    criterionId: string;
    criterionName: string;
    average: number;
    subQuestions: Array<{
      subQuestionId: string;
      text: string;
      average: number;
    }>;
  }>;
  courseBreakdown: Array<{
    courseId: string;
    submissions: number;
    average: number;
  }>;
  feedbackThemes: Array<{
    theme: string;
    count: number;
    percentage: string;
  }>;
  acknowledgmentStatus: Faculty['acknowledgmentStatus'];
}

export interface DeanComparativeAnalytics {
  facultyRankings: Array<{
    facultyId: string;
    name: string;
    average: number;
    submissions: number;
    rank: number;
    percentile: string;
  }>;
  departmentAverage: number;
  institutionAverage: number;
  difference: number;
}

export interface DeanEarlyWarning {
  facultyId: string;
  name: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface DeanAcknowledgmentTracking {
  facultyId: string;
  name: string;
  status: Faculty['acknowledgmentStatus'];
  submissions: number;
  average: number;
  acknowledgedAt?: string;
  daysSinceAcknowledgment: number | null;
  needsReminder: boolean;
}
