import { api, downloadFile } from './api/client';
import { BENCHMARK, DEAN_OVERSIGHT_WINDOW_DAYS, THRESHOLD } from './constants';
import type {
  AdminRelease, AgreementSummary, AgreementTemplate, AgreementType, AuditChainVerification, AuditLogEntry, BootstrapPayload,
  BulkImportResult, BulkImportRow, Criterion, DeanRelease, DepartmentTNA, Evaluation, EvaluationCycle, EventType, Faculty,
  FacultyMetrics, InstitutionalTNA, Program, PublicUser, Student, SubQuestion, Subject, TermStats, TNASnapshotResponse,
  TNATemplate, UserRole,
} from './types';

export interface AccountRequest {
  role: UserRole;
  name: string;
  institutionalId: string;
  email: string;
  username?: string;
  password?: string;
  department?: string;
  title?: string;
  programId?: string;
  subjects?: string[];
}

const EMPTY: BootstrapPayload = {
  user: undefined as unknown as PublicUser,
  departments: [], programs: [], subjects: [], faculty: [], students: [], cycles: [], criteria: [], subQuestions: [],
  evaluations: [], loadedCycleIds: [], agreements: [], evaluatedSubjectIds: [], termStats: {}, tnaTemplates: [],
};

const ALL_EVENTS: EventType[] = ['criteria_changed', 'cycle_changed', 'submission_added', 'data_refresh', 'acknowledgment_changed', 'training_changed', 'verification_changed'];

/**
 * Client-side cache of the role-scoped data the API returns for the signed-in
 * user. The server decides what each role may see; this class only reads that
 * snapshot and computes presentation metrics. Mutations go to the API and the
 * snapshot is refreshed afterwards.
 */
class DataStore {
  private data: BootstrapPayload = EMPTY;
  private listeners: Map<EventType, Set<() => void>> = new Map();
  private pendingCycleLoads = new Map<string, Promise<void>>();
  private lastRefresh = 0;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  async hydrate(): Promise<void> {
    const extra = this.data.loadedCycleIds.filter(id => id !== this.getActiveCycle()?.id);
    this.data = await api<BootstrapPayload>('/bootstrap');
    this.lastRefresh = Date.now();
    await Promise.all(extra.map(id => this.ensureCycleLoaded(id, false)));
    this.emitAll();
  }

  clear(): void {
    this.data = EMPTY;
    this.pendingCycleLoads.clear();
    this.emitAll();
  }

  get isHydrated(): boolean {
    return !!this.data.user;
  }

  /** Re-fetches when the tab regains focus, so changes by other users appear. */
  async refreshIfStale(maxAgeMs = 60_000): Promise<void> {
    if (this.isHydrated && Date.now() - this.lastRefresh > maxAgeMs) await this.hydrate();
  }

  /** Loads evaluations for an additional Academic Term (e.g. when viewing an archived term). */
  async ensureCycleLoaded(cycleId: string | undefined, emit = true): Promise<void> {
    if (!cycleId || !this.isHydrated || this.data.user.role === 'student' || this.data.loadedCycleIds.includes(cycleId)) return;
    let pending = this.pendingCycleLoads.get(cycleId);
    if (!pending) {
      pending = api<{ cycleId: string; evaluations: Evaluation[]; termStats: Record<string, TermStats> }>(`/evaluations?cycleId=${encodeURIComponent(cycleId)}`)
        .then(res => {
          this.data = {
            ...this.data,
            evaluations: [...this.data.evaluations.filter(e => e.cycleId !== cycleId), ...res.evaluations],
            termStats: { ...this.data.termStats, ...res.termStats },
            loadedCycleIds: [...this.data.loadedCycleIds, cycleId],
          };
        })
        .finally(() => this.pendingCycleLoads.delete(cycleId));
      this.pendingCycleLoads.set(cycleId, pending);
    }
    await pending;
    if (emit) this.emitAll();
  }

  subscribe(event: EventType, callback: () => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event: EventType): void {
    this.listeners.get(event)?.forEach(cb => cb());
  }

  private emitAll(): void {
    const called = new Set<() => void>();
    for (const event of ALL_EVENTS) {
      this.listeners.get(event)?.forEach(cb => {
        if (!called.has(cb)) {
          called.add(cb);
          cb();
        }
      });
    }
  }

  private get role(): UserRole | undefined {
    return this.data.user?.role;
  }

  // ---------------------------------------------------------------------------
  // Institutional structure
  // ---------------------------------------------------------------------------
  getDepartments(): string[] { return [...this.data.departments]; }
  getFaculty(): Faculty[] { return this.data.faculty.map(f => ({ ...f, courses: [...f.courses] })); }
  getFacultyById(id: string): Faculty | undefined { return this.data.faculty.find(f => f.id === id); }
  getFacultyByDepartment(dept: string): Faculty[] { return this.data.faculty.filter(f => f.department === dept); }
  getFacultyCourses(facultyId: string): string[] { return [...(this.getFacultyById(facultyId)?.courses ?? [])]; }
  getPrograms(): Program[] { return [...this.data.programs]; }
  getSubjects(): Subject[] { return [...this.data.subjects]; }
  getSubjectsByProgram(programId: string): Subject[] { return this.data.subjects.filter(s => s.programId === programId); }
  getSubjectById(subjectId: string): Subject | undefined { return this.data.subjects.find(s => s.id === subjectId); }
  getFacultyBySubject(subjectId: string): Faculty | undefined {
    const subject = this.getSubjectById(subjectId);
    return subject ? this.getFacultyById(subject.facultyId) : undefined;
  }
  getStudents(): Student[] { return [...this.data.students]; }
  getStudentById(id: string): Student | undefined { return this.data.students.find(s => s.id === id); }

  // ---------------------------------------------------------------------------
  // Academic Terms and the two-tier release workflow
  // ---------------------------------------------------------------------------
  getCycles(): EvaluationCycle[] { return this.data.cycles.map(c => ({ ...c })); }
  getActiveCycle(): EvaluationCycle | undefined { return this.data.cycles.find(c => c.status === 'active'); }
  private cycle(cycleId?: string): EvaluationCycle | undefined {
    const id = cycleId || this.getActiveCycle()?.id;
    return this.data.cycles.find(c => c.id === id);
  }

  async addCycle(cycle: Pick<EvaluationCycle, 'name' | 'displayName' | 'startDate' | 'endDate'>): Promise<void> {
    await api('/cycles', { method: 'POST', body: cycle });
    await this.hydrate();
  }
  async activateCycle(cycleId: string): Promise<void> { await api(`/cycles/${cycleId}/activate`, { method: 'POST' }); await this.hydrate(); }
  async archiveCycle(cycleId: string): Promise<void> { await api(`/cycles/${cycleId}/archive`, { method: 'POST' }); await this.hydrate(); }
  async unarchiveCycle(cycleId: string): Promise<void> { await api(`/cycles/${cycleId}/unarchive`, { method: 'POST' }); await this.hydrate(); }
  async removeCycle(cycleId: string): Promise<void> { await api(`/cycles/${cycleId}`, { method: 'DELETE' }); await this.hydrate(); }

  async getAgreementTemplate(type: AgreementType, cycleId: string): Promise<AgreementTemplate> {
    return api<AgreementTemplate>(`/agreements/template/${type}?cycleId=${encodeURIComponent(cycleId)}`);
  }

  /** Tier 1: HR / QA release — faculty gain access immediately. */
  async adminReleaseCycle(cycleId: string, signature: string): Promise<AgreementSummary> {
    const summary = await api<AgreementSummary>(`/cycles/${cycleId}/release`, { method: 'POST', body: { signature, accepted: true } });
    await this.hydrate();
    return summary;
  }

  /** Tier 2: Dean's Oversight Sign-Off — review only, never gates faculty access. */
  async deanOversightSignOff(cycleId: string, signature: string, comments?: string): Promise<AgreementSummary> {
    const summary = await api<AgreementSummary>(`/cycles/${cycleId}/oversight-signoff`, { method: 'POST', body: { signature, accepted: true, comments: comments || undefined } });
    await this.hydrate();
    return summary;
  }

  async acknowledgeResults(cycleId: string, signature: string): Promise<AgreementSummary> {
    const summary = await api<AgreementSummary>(`/cycles/${cycleId}/acknowledge`, { method: 'POST', body: { signature, accepted: true } });
    await this.hydrate();
    return summary;
  }

  async sendReminder(facultyId: string, cycleId?: string): Promise<void> {
    const id = cycleId || this.getActiveCycle()?.id;
    if (!id) throw new Error('No active Academic Term');
    await api(`/cycles/${id}/reminders`, { method: 'POST', body: { facultyId } });
    await this.hydrate();
  }

  isCycleAdminReleased(cycleId?: string): boolean { return !!this.cycle(cycleId)?.adminRelease; }
  isCycleDeanReleased(cycleId: string | undefined, department: string): boolean { return !!this.cycle(cycleId)?.deanReleases?.[department]; }
  getCycleAdminRelease(cycleId?: string): AdminRelease | undefined { return this.cycle(cycleId)?.adminRelease; }
  getCycleDeanRelease(cycleId: string | undefined, department: string): DeanRelease | undefined { return this.cycle(cycleId)?.deanReleases?.[department]; }

  /** Dean's 7-day oversight window, counted from the HR / QA release. */
  getDeanOversightDeadline(cycleId: string | undefined, department: string): { deadline: Date; daysRemaining: number; isOverdue: boolean } | null {
    const release = this.getCycleAdminRelease(cycleId);
    if (!release || this.isCycleDeanReleased(cycleId, department)) return null;
    const deadline = new Date(new Date(release.releasedAt).getTime() + DEAN_OVERSIGHT_WINDOW_DAYS * 86_400_000);
    const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
    return { deadline, daysRemaining, isOverdue: daysRemaining < 0 };
  }

  getAgreements(): AgreementSummary[] { return [...this.data.agreements]; }
  findAgreement(type: AgreementType, cycleId: string | undefined, match: { department?: string; facultyId?: string } = {}): AgreementSummary | undefined {
    const id = cycleId || this.getActiveCycle()?.id;
    return this.data.agreements.find(a =>
      a.type === type && a.termId === id &&
      (match.department === undefined || a.department === match.department) &&
      (match.facultyId === undefined || a.facultyId === match.facultyId));
  }
  async downloadAgreementReceipt(agreement: AgreementSummary): Promise<void> {
    await downloadFile(`/agreements/${agreement.id}/receipt.pdf`, `${agreement.trackingId}.pdf`);
  }

  // ---------------------------------------------------------------------------
  // Criteria and Performance Indicators
  // ---------------------------------------------------------------------------
  getCriteria(): Criterion[] { return [...this.data.criteria].sort((a, b) => a.order - b.order); }
  getSubQuestions(): SubQuestion[] { return [...this.data.subQuestions].sort((a, b) => a.order - b.order); }
  getSubQuestionsForCriterion(criterionId: string): SubQuestion[] {
    return this.data.subQuestions.filter(sq => sq.criterionId === criterionId).sort((a, b) => a.order - b.order);
  }
  async addCriterion(name: string): Promise<void> { await api('/criteria', { method: 'POST', body: { name } }); await this.hydrate(); }
  async removeCriterion(criterionId: string): Promise<void> { await api(`/criteria/${criterionId}`, { method: 'DELETE' }); await this.hydrate(); }
  async addSubQuestion(criterionId: string, text: string): Promise<void> { await api(`/criteria/${criterionId}/indicators`, { method: 'POST', body: { text } }); await this.hydrate(); }
  async removeSubQuestion(id: string): Promise<void> { await api(`/indicators/${id}`, { method: 'DELETE' }); await this.hydrate(); }
  async updateSubQuestion(id: string, text: string): Promise<void> { await api(`/indicators/${id}`, { method: 'PATCH', body: { text } }); await this.hydrate(); }

  // ---------------------------------------------------------------------------
  // Student evaluation
  // ---------------------------------------------------------------------------
  isSubjectEvaluatedByStudent(_studentId: string, subjectId: string): boolean {
    return this.data.evaluatedSubjectIds.includes(subjectId);
  }
  getAvailableSubjectsForStudent(studentId: string): Subject[] {
    const student = this.getStudentById(studentId);
    if (!student) return [];
    return student.enrolledSubjects
      .filter(id => !this.isSubjectEvaluatedByStudent(studentId, id))
      .map(id => this.getSubjectById(id))
      .filter((s): s is Subject => s !== undefined);
  }
  /** The server binds the professor and term, and applies PII redaction to the comment. */
  async submitEvaluation(input: { subjectId: string; ratings: Record<string, number>; feedback: string }): Promise<void> {
    await api('/evaluations', { method: 'POST', body: input });
    await this.hydrate();
  }

  // ---------------------------------------------------------------------------
  // Evaluations and metrics
  // ---------------------------------------------------------------------------
  getEvaluations(): Evaluation[] { return [...this.data.evaluations]; }
  getEvaluationsForFaculty(facultyId: string, cycleId?: string, courseId?: string): Evaluation[] {
    return this.data.evaluations.filter(e => e.facultyId === facultyId && (!cycleId || e.cycleId === cycleId) && (!courseId || e.courseId === courseId));
  }
  getEvaluationsForDepartment(dept: string, cycleId?: string): Evaluation[] {
    const ids = new Set(this.getFacultyByDepartment(dept).map(f => f.id));
    return this.data.evaluations.filter(e => ids.has(e.facultyId) && (!cycleId || e.cycleId === cycleId));
  }
  getTermStats(cycleId?: string): TermStats | undefined {
    const id = cycleId || this.getActiveCycle()?.id;
    return id ? this.data.termStats[id] : undefined;
  }

  getFacultyMetrics(facultyId: string, cycleId?: string, courseId?: string): FacultyMetrics {
    const evals = this.getEvaluationsForFaculty(facultyId, cycleId, courseId);
    const criteria = this.getCriteria();
    const subQuestions = this.getSubQuestions();
    const sqTotals: Record<string, { total: number; count: number }> = {};
    const scoreDistribution = Array(5).fill(0);
    const courseTotals: Record<string, { count: number; total: number }> = {};

    evals.forEach(ev => {
      let evalTotal = 0, evalCount = 0;
      Object.entries(ev.ratings).forEach(([sqId, rating]) => {
        if (!sqTotals[sqId]) sqTotals[sqId] = { total: 0, count: 0 };
        sqTotals[sqId].total += rating;
        sqTotals[sqId].count++;
        if (rating >= 1 && rating <= 5) scoreDistribution[rating - 1]++;
        evalTotal += rating;
        evalCount++;
      });
      if (!courseTotals[ev.courseId]) courseTotals[ev.courseId] = { count: 0, total: 0 };
      courseTotals[ev.courseId].count++;
      courseTotals[ev.courseId].total += evalCount > 0 ? evalTotal / evalCount : 0;
    });

    const sqAvgs: Record<string, number> = {};
    subQuestions.forEach(sq => { const d = sqTotals[sq.id]; sqAvgs[sq.id] = d && d.count > 0 ? d.total / d.count : 0; });
    const critAvgs: Record<string, number> = {};
    criteria.forEach(c => {
      const critSQs = subQuestions.filter(sq => sq.criterionId === c.id);
      critAvgs[c.id] = critSQs.length === 0 ? 0 : critSQs.reduce((sum, sq) => sum + (sqAvgs[sq.id] || 0), 0) / critSQs.length;
    });

    const overallAverage = evals.length > 0
      ? evals.reduce((sum, ev) => { const vals = Object.values(ev.ratings); return sum + (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0); }, 0) / evals.length
      : 0;
    const courseBreakdown: FacultyMetrics['courseBreakdown'] = {};
    Object.entries(courseTotals).forEach(([course, d]) => { courseBreakdown[course] = { count: d.count, average: d.count > 0 ? d.total / d.count : 0 }; });

    return {
      totalSubmissions: evals.length,
      overallAverage,
      criteriaAverages: critAvgs,
      subQuestionAverages: sqAvgs,
      scoreDistribution,
      feedback: evals.map(e => ({ feedback: e.feedback, courseId: e.courseId, submittedAt: e.submittedAt })),
      courseBreakdown,
    };
  }

  /** True when this user holds the department's evaluation rows; otherwise server aggregates are used. */
  private hasDepartmentRows(dept: string): boolean {
    return this.role === 'hr_qa' || (this.role === 'dean' && this.data.user.department === dept);
  }

  getDepartmentMetrics(dept: string, cycleId?: string) {
    const facultyInDept = this.getFacultyByDepartment(dept);
    if (!this.hasDepartmentRows(dept)) {
      const agg = this.getTermStats(cycleId)?.departments[dept];
      return {
        totalSubmissions: agg?.totalSubmissions ?? 0,
        institutionAverage: agg?.average ?? 0,
        totalFaculty: agg?.totalFaculty ?? facultyInDept.length,
        criteriaAverages: agg?.criteriaAverages ?? {},
        facultyCompletion: [] as Array<{ faculty: Faculty; submissions: number; acknowledgmentStatus: Faculty['acknowledgmentStatus'] }>,
      };
    }

    const evals = this.getEvaluationsForDepartment(dept, cycleId);
    const criteria = this.getCriteria();
    const subQuestions = this.getSubQuestions();
    const sqTotals: Record<string, { total: number; count: number }> = {};
    let totalScore = 0, totalRatings = 0;
    evals.forEach(ev => {
      Object.entries(ev.ratings).forEach(([sqId, rating]) => {
        if (!sqTotals[sqId]) sqTotals[sqId] = { total: 0, count: 0 };
        sqTotals[sqId].total += rating;
        sqTotals[sqId].count++;
        totalScore += rating;
        totalRatings++;
      });
    });
    const sqAvgs: Record<string, number> = {};
    subQuestions.forEach(sq => { const d = sqTotals[sq.id]; sqAvgs[sq.id] = d && d.count > 0 ? d.total / d.count : 0; });
    const criteriaAverages: Record<string, number> = {};
    criteria.forEach(c => {
      const critSQs = subQuestions.filter(sq => sq.criterionId === c.id);
      criteriaAverages[c.id] = critSQs.length === 0 ? 0 : critSQs.reduce((s, sq) => s + (sqAvgs[sq.id] || 0), 0) / critSQs.length;
    });
    return {
      totalSubmissions: evals.length,
      institutionAverage: totalRatings > 0 ? totalScore / totalRatings : 0,
      totalFaculty: facultyInDept.length,
      criteriaAverages,
      facultyCompletion: facultyInDept.map(f => ({ faculty: f, submissions: evals.filter(e => e.facultyId === f.id).length, acknowledgmentStatus: f.acknowledgmentStatus })),
    };
  }

  /** Mean of faculty averages (faculty with ≥ THRESHOLD submissions) across the institution. */
  getInstitutionAverage(cycleId?: string): number {
    if (this.role !== 'hr_qa') return this.getTermStats(cycleId)?.institutionAverage ?? 0;
    const metrics = this.data.faculty.map(f => this.getFacultyMetrics(f.id, cycleId)).filter(m => m.totalSubmissions >= THRESHOLD);
    return metrics.length > 0 ? metrics.reduce((s, m) => s + m.overallAverage, 0) / metrics.length : 0;
  }

  // ---------------------------------------------------------------------------
  // Dean analytics
  // ---------------------------------------------------------------------------
  getDeanFacultyDrilldown(facultyId: string, cycleId?: string) {
    const faculty = this.getFacultyById(facultyId);
    if (!faculty) return null;
    const metrics = this.getFacultyMetrics(facultyId, cycleId);
    const subQuestions = this.getSubQuestions();
    return {
      faculty,
      metrics,
      criteriaBreakdown: this.getCriteria().map(c => ({
        criterionId: c.id,
        criterionName: c.name,
        average: metrics.criteriaAverages[c.id] || 0,
        subQuestions: subQuestions.filter(sq => sq.criterionId === c.id).map(sq => ({ subQuestionId: sq.id, text: sq.text, average: metrics.subQuestionAverages[sq.id] || 0 })),
      })),
      courseBreakdown: Object.entries(metrics.courseBreakdown).map(([courseId, d]) => ({ courseId, submissions: d.count, average: d.average })),
      feedbackThemes: this.analyzeFeedbackThemes(metrics.feedback.map(f => f.feedback)),
      acknowledgmentStatus: faculty.acknowledgmentStatus,
    };
  }

  getDeanComparativeAnalytics(department: string, cycleId?: string) {
    const metrics = this.getFacultyByDepartment(department)
      .map(f => { const m = this.getFacultyMetrics(f.id, cycleId); return { facultyId: f.id, name: f.name, average: m.overallAverage, submissions: m.totalSubmissions }; })
      .filter(m => m.submissions >= THRESHOLD);
    if (metrics.length === 0) return null;
    const sorted = [...metrics].sort((a, b) => b.average - a.average);
    const top25 = sorted[Math.floor(sorted.length * 0.25)]?.average || 0;
    const bottom25 = sorted[Math.floor(sorted.length * 0.75)]?.average || 0;
    const departmentAverage = this.getDepartmentMetrics(department, cycleId).institutionAverage;
    const institutionAverage = this.getInstitutionAverage(cycleId);
    return {
      facultyRankings: sorted.map((m, i) => ({
        ...m,
        rank: i + 1,
        percentile: m.average >= top25 ? 'Top 25%' : m.average <= bottom25 ? 'Bottom 25%' : 'Middle 50%',
      })),
      departmentAverage,
      institutionAverage,
      difference: departmentAverage - institutionAverage,
    };
  }

  getDeanEarlyWarnings(department: string, cycleId?: string) {
    const warnings: Array<{ facultyId: string; name: string; type: string; severity: 'high' | 'medium' | 'low'; message: string }> = [];
    this.getFacultyByDepartment(department).forEach(f => {
      const m = this.getFacultyMetrics(f.id, cycleId);
      if (m.totalSubmissions < THRESHOLD && m.totalSubmissions > 0) {
        warnings.push({ facultyId: f.id, name: f.name, type: 'Low Submissions', severity: 'medium', message: `Only ${m.totalSubmissions} submissions (need ${THRESHOLD})` });
      }
      if (m.totalSubmissions >= THRESHOLD && m.overallAverage < BENCHMARK) {
        warnings.push({ facultyId: f.id, name: f.name, type: 'Below Benchmark', severity: 'high', message: `Average ${m.overallAverage.toFixed(2)} below ${BENCHMARK} benchmark` });
      }
      if (f.acknowledgmentStatus !== 'acknowledged') {
        warnings.push({ facultyId: f.id, name: f.name, type: 'Pending Acknowledgment', severity: 'low', message: `Status: ${f.acknowledgmentStatus.replace(/_/g, ' ')}` });
      }
    });
    const order = { high: 0, medium: 1, low: 2 };
    return warnings.sort((a, b) => order[a.severity] - order[b.severity]);
  }

  /** Keyword tally only; comments are never altered. */
  analyzeFeedbackThemes(feedback: string[]) {
    const themes: Record<string, number> = {};
    const keywords: Record<string, string[]> = {
      Engaging: ['engaging', 'interesting', 'captivating', 'dynamic'],
      Clear: ['clear', 'understandable', 'well-explained', 'organized'],
      Pacing: ['pacing', 'speed', 'tempo', 'fast', 'slow'],
      Approachable: ['approachable', 'available', 'helpful', 'accessible'],
      Fair: ['fair', 'reasonable', 'balanced', 'just'],
      Passionate: ['passionate', 'enthusiastic', 'energetic', 'dedicated'],
      Knowledgeable: ['knowledgeable', 'expert', 'skilled', 'competent'],
      Professional: ['professional', 'respectful', 'courteous', 'polite'],
    };
    feedback.forEach(fb => {
      const lower = fb.toLowerCase();
      Object.entries(keywords).forEach(([theme, words]) => { if (words.some(w => lower.includes(w))) themes[theme] = (themes[theme] || 0) + 1; });
    });
    return Object.entries(themes)
      .map(([theme, count]) => ({ theme, count, percentage: ((count / feedback.length) * 100).toFixed(1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  getDeanAcknowledgmentTracking(department: string, cycleId?: string) {
    return this.getFacultyByDepartment(department).map(f => {
      const m = this.getFacultyMetrics(f.id, cycleId);
      return {
        facultyId: f.id,
        name: f.name,
        status: f.acknowledgmentStatus,
        submissions: m.totalSubmissions,
        average: m.overallAverage,
        acknowledgedAt: f.acknowledgedAt,
        daysSinceAcknowledgment: f.acknowledgedAt ? Math.floor((Date.now() - new Date(f.acknowledgedAt).getTime()) / 86_400_000) : null,
        needsReminder: f.acknowledgmentStatus === 'pending_review' && m.totalSubmissions >= THRESHOLD,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Training Needs Analysis
  // ---------------------------------------------------------------------------
  getTNATemplates(): TNATemplate[] { return [...this.data.tnaTemplates]; }
  async fetchDepartmentTNA(cycleId: string, department?: string, refresh = false): Promise<TNASnapshotResponse<DepartmentTNA>> {
    const q = new URLSearchParams({ cycleId, ...(department ? { department } : {}), ...(refresh ? { refresh: '1' } : {}) });
    return api(`/tna/department?${q}`);
  }
  async fetchInstitutionalTNA(cycleId: string, refresh = false): Promise<TNASnapshotResponse<InstitutionalTNA>> {
    const q = new URLSearchParams({ cycleId, ...(refresh ? { refresh: '1' } : {}) });
    return api(`/tna/institution?${q}`);
  }

  // ---------------------------------------------------------------------------
  // HR / QA administration
  // ---------------------------------------------------------------------------
  async getAuditLog(limit = 100): Promise<AuditLogEntry[]> { return api(`/audit?limit=${limit}`); }
  async verifyAuditChain(): Promise<AuditChainVerification> { return api('/audit/verify'); }

  async createAccount(request: AccountRequest): Promise<{ username: string; message: string }> {
    const result = await api<{ username: string; message: string }>('/accounts', { method: 'POST', body: request });
    await this.hydrate();
    return result;
  }
  async bulkImportAccounts(rows: BulkImportRow[]): Promise<BulkImportResult> {
    const result = await api<BulkImportResult>('/accounts/bulk', { method: 'POST', body: { rows } });
    await this.hydrate();
    return result;
  }
}

export const store = new DataStore();
export { BENCHMARK, THRESHOLD };
