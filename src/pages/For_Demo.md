## src/pages/AccountCreation.tsx
```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../store';
import { errorMessage } from '../api/client';
import type { UserRole } from '../types';
import { ROLE_LABELS_LONG } from '../utils/terminology';
import BulkImport from '../components/BulkImport';
import { UserPlus, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

const ROLES: UserRole[] = ['faculty', 'student', 'dean', 'hr_qa'];
const TITLES = ['Professor', 'Associate Professor', 'Assistant Professor', 'Instructor', 'Lecturer'];
const EMPTY_FORM = { name: '', institutionalId: '', email: '', username: '', password: '', confirmPassword: '', department: '', title: '', programId: '', subjects: [] as string[] };

const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm outline-none';
const inputStyle = { backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' };

export default function AccountCreation() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole>('faculty');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const programs = store.getPrograms();
  const subjects = store.getSubjects();
  const departments = store.getDepartments();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
  const toggleSubject = (id: string) => setFormData(prev => ({ ...prev, subjects: prev.subjects.includes(id) ? prev.subjects.filter(s => s !== id) : [...prev.subjects, id] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (formData.password && formData.password !== formData.confirmPassword) { setMessage({ type: 'error', text: 'Passwords do not match' }); return; }
    setIsSubmitting(true);
    try {
      const result = await store.createAccount({
        role: selectedRole,
        name: formData.name.trim(),
        institutionalId: formData.institutionalId.trim(),
        email: formData.email.trim(),
        username: formData.username.trim() || undefined,
        password: formData.password || undefined,
        department: selectedRole === 'faculty' || selectedRole === 'dean' ? formData.department : undefined,
        title: selectedRole === 'faculty' ? formData.title : undefined,
        programId: selectedRole === 'student' ? formData.programId : undefined,
        subjects: selectedRole === 'faculty' || selectedRole === 'student' ? formData.subjects : undefined,
      });
      setMessage({ type: 'success', text: `${result.message} Username: ${result.username}` });
      setFormData(EMPTY_FORM);
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const subjectChoices = selectedRole === 'student' && formData.programId ? subjects.filter(s => s.programId === formData.programId) : subjects;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><button onClick={() => navigate('/')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90" style={{ backgroundColor: '#D5D8DC', color: '#1A1A1A' }}><ArrowLeft size={16} />Back to Dashboard</button><h2 className="text-2xl font-bold" style={{ color: '#002366' }}>Account Management</h2></div>
      <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#002366' }}>Create a Single Account</h3>
        <div className="mb-6"><label className="block text-sm font-medium mb-3">Account Type *</label><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{ROLES.map(role => (<button key={role} type="button" onClick={() => setSelectedRole(role)} className="px-4 py-3 rounded-lg text-sm font-medium" style={{ backgroundColor: selectedRole === role ? '#002366' : '#F8F6F1', color: selectedRole === role ? '#FFFFFF' : '#1A1A1A', border: selectedRole === role ? '2px solid #002366' : '2px solid #D5D8DC' }}>{ROLE_LABELS_LONG[role]}</button>))}</div></div>
        {message && (<div role={message.type === 'error' ? 'alert' : 'status'} className="mb-6 p-4 rounded-lg flex items-start gap-3" style={{ backgroundColor: message.type === 'success' ? '#D1FAE5' : '#FEE2E2', border: `1px solid ${message.type === 'success' ? '#2E8B57' : '#C41E3A'}` }}>{message.type === 'success' ? <CheckCircle size={20} style={{ color: '#2E8B57' }} /> : <AlertCircle size={20} style={{ color: '#C41E3A' }} />}<p className="text-sm" style={{ color: message.type === 'success' ? '#2E8B57' : '#C41E3A' }}>{message.text}</p></div>)}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-2">Full Name *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={inputClass} style={inputStyle} required /></div>
            <div><label className="block text-sm font-medium mb-2">{selectedRole === 'student' ? 'Student ID' : 'Employee Number'} *</label><input type="text" name="institutionalId" value={formData.institutionalId} onChange={handleInputChange} className={inputClass} style={inputStyle} placeholder={selectedRole === 'student' ? 'C25-001' : selectedRole === 'faculty' ? 'F120' : selectedRole === 'dean' ? 'M010' : 'HR-0102'} required /></div>
            <div><label className="block text-sm font-medium mb-2">Institutional Email *</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} style={inputStyle} placeholder="name@school.edu.ph" required /></div>
            {(selectedRole === 'faculty' || selectedRole === 'dean') && (<div><label className="block text-sm font-medium mb-2">Department *</label><select name="department" value={formData.department} onChange={handleInputChange} className={inputClass} style={inputStyle} required><option value="">Select Department</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div>)}
            {selectedRole === 'faculty' && (<div><label className="block text-sm font-medium mb-2">Title *</label><select name="title" value={formData.title} onChange={handleInputChange} className={inputClass} style={inputStyle} required><option value="">Select Title</option>{TITLES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>)}
            {selectedRole === 'student' && (<div><label className="block text-sm font-medium mb-2">Program *</label><select name="programId" value={formData.programId} onChange={handleInputChange} className={inputClass} style={inputStyle} required><option value="">Select Program</option>{programs.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>)}
          </div>
          {(selectedRole === 'faculty' || selectedRole === 'student') && (
            <div>
              <label className="block text-sm font-medium mb-2">{selectedRole === 'faculty' ? 'Courses Taught' : 'Enrolled Subjects'}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                {subjectChoices.map(s => (<label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={formData.subjects.includes(s.id)} onChange={() => toggleSubject(s.id)} />{s.code} — {s.name}</label>))}
              </div>
            </div>
          )}
          <div className="border-t pt-6" style={{ borderColor: '#D5D8DC' }}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: '#002366' }}>Login Credentials</h3>
            <p className="text-xs mb-4" style={{ color: '#6B7280' }}>Leave the password blank to email the user a secure invitation to set their own password (recommended). Passwords are stored only as salted Argon2id hashes.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium mb-2">Username</label><input type="text" name="username" value={formData.username} onChange={handleInputChange} className={inputClass} style={inputStyle} placeholder="Defaults to the ID" autoComplete="off" /></div>
              <div><label className="block text-sm font-medium mb-2">Initial Password</label><input type="password" name="password" value={formData.password} onChange={handleInputChange} className={inputClass} style={inputStyle} autoComplete="new-password" minLength={10} /></div>
              <div><label className="block text-sm font-medium mb-2">Confirm Password</label><input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} className={inputClass} style={inputStyle} autoComplete="new-password" disabled={!formData.password} /></div>
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>{isSubmitting ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating Account...</> : <><UserPlus size={18} />Create Account</>}</button>
        </form>
      </div>
      <BulkImport />
    </div>
  );
}

```

## src/pages/AccountRecovery.tsx
```tsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle, KeyRound, Mail, Search as UserSearch } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { AuthShell } from '../components/Login';

const inputClass = 'w-full px-4 py-2.5 rounded-lg border outline-none';
const inputStyle = { backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' };

function Notice({ kind, children }: { kind: 'success' | 'error'; children: React.ReactNode }) {
  const ok = kind === 'success';
  return (
    <div role={ok ? 'status' : 'alert'} className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: ok ? '#D1FAE5' : '#FEE2E2', color: ok ? '#2E8B57' : '#C41E3A' }}>
      {ok ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
      <div>{children}</div>
    </div>
  );
}

function BackToLogin() {
  return <Link to="/login" className="mt-5 inline-flex items-center gap-1 text-xs hover:underline" style={{ color: '#002366' }}><ArrowLeft size={12} />Back to sign in</Link>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>
      {busy ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );
}

export function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setDone((await api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { identifier } })).message); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}><KeyRound size={20} style={{ color: '#B87333' }} />Reset your password</h2>
      <p className="text-xs mb-5" style={{ color: '#4B5563' }}>Enter your username or registered email. We will send a single-use link that expires in 30 minutes.</p>
      {done ? <Notice kind="success">{done}</Notice> : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium mb-1">Username or email</label>
            <input id="identifier" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} className={inputClass} style={inputStyle} required />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <SubmitButton busy={busy}><Mail size={16} />Send reset link</SubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}

export function RecoverUsername() {
  const [institutionalId, setInstitutionalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ message: string; hint?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setDone(await api<{ message: string; hint?: string }>('/auth/username/recover', { method: 'POST', body: { institutionalId } })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}><UserSearch size={20} style={{ color: '#B87333' }} />Recover your username</h2>
      <p className="text-xs mb-5" style={{ color: '#4B5563' }}>Enter your Student ID or Employee Number. Your username will be emailed to the address on file.</p>
      {done ? (
        <Notice kind="success">{done.message}{done.hint && <p className="mt-1 font-mono text-xs">{done.hint}</p>}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="institutional-id" className="block text-sm font-medium mb-1">Student ID / Employee Number</label>
            <input id="institutional-id" value={institutionalId} onChange={e => setInstitutionalId(e.target.value)} className={inputClass} style={inputStyle} placeholder="e.g. C24-001 or F001" required />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <SubmitButton busy={busy}><Mail size={16} />Email my username</SubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const isInvite = params.get('invite') === '1';
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setValid(false); return; }
    api<{ valid: boolean }>(`/auth/password/token?token=${encodeURIComponent(token)}`).then(r => setValid(r.valid)).catch(() => setValid(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    try {
      setDone((await api<{ message: string }>('/auth/password/reset', { method: 'POST', body: { token, password } })).message);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}><KeyRound size={20} style={{ color: '#B87333' }} />{isInvite ? 'Set your password' : 'Choose a new password'}</h2>
      <p className="text-xs mb-5" style={{ color: '#4B5563' }}>Use 10–128 characters with at least one letter and one number. All other sessions will be signed out.</p>
      {valid === null && <p className="text-sm">Checking link…</p>}
      {valid === false && <Notice kind="error">This link is invalid or has expired. <Link to="/forgot-password" className="underline">Request a new one</Link>.</Notice>}
      {done && <Notice kind="success">{done}</Notice>}
      {valid && !done && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium mb-1">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Confirm password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} style={inputStyle} required />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <SubmitButton busy={busy}>Save password</SubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}

```

## src/pages/AdminDashboard.tsx
```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { store, BENCHMARK, THRESHOLD } from '../store';
import { exportFacultyReport } from '../utils/excel';
import { exportFacultyPDF } from '../utils/pdf';
import { exportFacultyPerformanceSummary, exportCycleCompletionPDF } from '../utils/adminReports';
import ConfirmDialog from '../components/ConfirmDialog';
import AgreementSignModal from '../components/AgreementSignModal';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth';
import type { Faculty, EvaluationCycle, Criterion, AuditLogEntry, AuditChainVerification, InstitutionalTNA, TNASnapshotResponse, ManagedAccount, UserRole } from '../types';
import { LayoutDashboard, Users, Calendar, ListChecks, ScrollText, Plus, Trash2, Search, AlertTriangle, CheckCircle, Shield, FileSpreadsheet, GraduationCap, Sparkles, Download, BarChart3, MessageSquare, Printer, UserPlus, FileText, ChevronDown, RefreshCw, ShieldCheck, Archive, ArchiveRestore, X } from 'lucide-react';
import AdminPrintReport from '../components/AdminPrintReport';
import BulkImport from '../components/BulkImport';

type Tab = 'overview' | 'faculty' | 'cycles' | 'criteria' | 'tna' | 'accounts' | 'audit';

interface AdminDashboardProps { viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function AdminDashboard({ viewingCycleId, onViewingCycleChange }: AdminDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditVerification, setAuditVerification] = useState<AuditChainVerification | null>(null);
  const [institutionalTNA, setInstitutionalTNA] = useState<TNASnapshotResponse<InstitutionalTNA> | null>(null);
  const [tnaLoading, setTnaLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleDisplayName, setNewCycleDisplayName] = useState('');
  const [newCycleStart, setNewCycleStart] = useState('');
  const [newCycleEnd, setNewCycleEnd] = useState('');
  const [newCriterionName, setNewCriterionName] = useState('');
  const [newSubQs, setNewSubQs] = useState<Record<string, string>>({});
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'danger' | 'warning' | 'info'; title: string; message: string; onConfirm: () => void }>({ open: false, type: 'warning', title: '', message: '', onConfirm: () => {} });
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [showAdminSignModal, setShowAdminSignModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [, setDataVersion] = useState(0);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState<'all' | UserRole>('all');
  const [accountBusyId, setAccountBusyId] = useState<string | null>(null);
  const [manageMessage, setManageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accountFormTab, setAccountFormTab] = useState<'create' | 'manage'>('create');
  const [selectedAccountRole, setSelectedAccountRole] = useState<'faculty' | 'student' | 'dean' | 'hr_qa'>('faculty');
  const [accountFormData, setAccountFormData] = useState({ name: '', institutionalId: '', email: '', username: '', password: '', confirmPassword: '', department: '', title: '', programId: '', subjects: [] as string[] });
  const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const programs = store.getPrograms();
  const subjects = store.getSubjects();
  const departments = store.getDepartments();

  const activeCycle = cycles.find(c => c.status === 'active');
  const cycleId = viewingCycleId || activeCycle?.id;
  const viewingCycle = cycles.find(c => c.id === cycleId);

  const loadData = useCallback(() => { setFaculty(store.getFaculty()); setCycles(store.getCycles()); setCriteria(store.getCriteria()); setDataVersion(v => v + 1); }, []);
  useEffect(() => { loadData(); const unsubs = (['criteria_changed', 'cycle_changed', 'submission_added', 'acknowledgment_changed', 'data_refresh'] as const).map(e => store.subscribe(e, loadData)); return () => unsubs.forEach(u => u()); }, [loadData]);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try { await action(); } catch (err) { setActionError(errorMessage(err)); }
  };

  const loadAudit = useCallback(async () => {
    try { setAuditLog(await store.getAuditLog(200)); } catch (err) { setActionError(errorMessage(err)); }
  }, []);
  useEffect(() => { if (activeTab === 'audit') { setAuditVerification(null); loadAudit(); } }, [activeTab, loadAudit]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try { setAccounts(await store.listAccounts()); } catch (err) { setManageMessage({ type: 'error', text: errorMessage(err) }); }
    finally { setAccountsLoading(false); }
  }, []);
  useEffect(() => { if (activeTab === 'accounts' && accountFormTab === 'manage') { setManageMessage(null); loadAccounts(); } }, [activeTab, accountFormTab, loadAccounts]);

  const runAccountAction = async (accountId: string, action: () => Promise<{ message: string }>) => {
    setManageMessage(null);
    setAccountBusyId(accountId);
    try { setManageMessage({ type: 'success', text: (await action()).message }); await loadAccounts(); }
    catch (err) { setManageMessage({ type: 'error', text: errorMessage(err) }); }
    finally { setAccountBusyId(null); }
  };

  const loadTNA = useCallback(async (refresh = false) => {
    if (!cycleId) return;
    setTnaLoading(true);
    try { setInstitutionalTNA(await store.fetchInstitutionalTNA(cycleId, refresh)); }
    catch (err) { setActionError(errorMessage(err)); }
    finally { setTnaLoading(false); }
  }, [cycleId]);
  useEffect(() => { if (activeTab === 'tna') loadTNA(); }, [activeTab, loadTNA]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-export-menu]')) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showExportMenu]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [{ id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> }, { id: 'faculty', label: 'Faculty', icon: <Users size={16} /> }, { id: 'cycles', label: 'Academic Terms', icon: <Calendar size={16} /> }, { id: 'criteria', label: 'Criteria & Indicators', icon: <ListChecks size={16} /> }, { id: 'tna', label: 'TNA', icon: <GraduationCap size={16} /> }, { id: 'accounts', label: 'Account Management', icon: <Users size={16} /> }, { id: 'audit', label: 'Audit Trail', icon: <ScrollText size={16} /> }];

  const facultyWithMetrics = faculty.filter(f => store.getFacultyMetrics(f.id, cycleId).totalSubmissions >= THRESHOLD);
  const flaggedFaculty = facultyWithMetrics.filter(f => store.getFacultyMetrics(f.id, cycleId).overallAverage < BENCHMARK);
  const acknowledgedCount = faculty.filter(f => f.acknowledgmentStatus === 'acknowledged').length;
  const topRated = [...facultyWithMetrics].sort((a, b) => store.getFacultyMetrics(b.id, cycleId).overallAverage - store.getFacultyMetrics(a.id, cycleId).overallAverage).slice(0, 3);

  const handlePrint = () => { setIsPrintMode(true); setTimeout(() => { window.print(); setIsPrintMode(false); }, 100); };

  const isAdminReleased = store.isCycleAdminReleased(cycleId);
  const adminReleaseInfo = store.getCycleAdminRelease(cycleId);
  const releaseAgreement = store.findAgreement('hr_qa_release', cycleId);
  const canRelease = !isAdminReleased && !!viewingCycle && viewingCycle.status !== 'upcoming';

  if (isPrintMode) return (<AdminPrintReport cycleName={viewingCycle?.displayName || 'Current Academic Term'} criteria={criteria} cycleId={cycleId} />);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 p-1 rounded-xl overflow-x-auto flex-1" style={{ backgroundColor: '#EDEBE8' }}>{tabs.map(tab => (<button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedFaculty(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap" style={{ backgroundColor: activeTab === tab.id ? '#002366' : 'transparent', color: activeTab === tab.id ? '#FFFFFF' : '#1A1A1A' }}>{tab.icon}{tab.label}</button>))}</div>
        <div className="flex gap-2 flex-wrap">
           {canRelease && (<button onClick={() => setShowAdminSignModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: '#B87333', color: '#FFFFFF' }}><Shield size={14} />HR / QA Release</button>)}
           {isAdminReleased && (<div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: '#D1FAE5', color: '#2E8B57' }} title={adminReleaseInfo ? `Released by ${adminReleaseInfo.releasedBy}` : undefined}><CheckCircle size={14} />Released {adminReleaseInfo?.releasedAt ? new Date(adminReleaseInfo.releasedAt).toLocaleDateString() : ''}{releaseAgreement && <button onClick={() => runAction(() => store.downloadAgreementReceipt(releaseAgreement))} className="ml-1 underline flex items-center gap-0.5" title={releaseAgreement.trackingId}><Download size={12} />Receipt</button>}</div>)}
           <div className="relative" data-export-menu>
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: '#002366', color: '#FFFFFF' }}>
              <Download size={14} />Export Reports <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg z-50" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D5D8DC' }}>
                <div className="py-1">
                  <button onClick={async () => { await exportFacultyPerformanceSummary(cycleId); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileSpreadsheet size={16} style={{ color: '#002366' }} />
                    <div>
                      <div className="font-medium">Faculty Summary (Excel)</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>All faculty with compliance tracking</div>
                    </div>
                  </button>
                  <button onClick={async () => { await exportCycleCompletionPDF(cycleId); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileText size={16} style={{ color: '#C41E3A' }} />
                    <div>
                      <div className="font-medium">Academic Term Completion (PDF)</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Department breakdown & compliance</div>
                    </div>
                  </button>
                  <button onClick={() => { handlePrint(); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <Printer size={16} style={{ color: '#6B7280' }} />
                    <div>
                      <div className="font-medium">Print Report</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Browser print dialog</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {actionError && (<div role="alert" className="rounded-xl p-3 flex items-center justify-between gap-2" style={{ backgroundColor: '#FEE2E2', border: '1px solid #C41E3A', color: '#C41E3A' }}><span className="text-sm flex items-center gap-2"><AlertTriangle size={16} />{actionError}</span><button onClick={() => setActionError(null)} aria-label="Dismiss"><X size={16} /></button></div>)}
      {activeTab === 'overview' && !selectedFaculty && (<div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Total Submissions</p><p className="text-2xl font-bold" style={{ color: '#002366' }}>{store.getEvaluations().filter(e => e.cycleId === cycleId).length}</p></div>
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Faculty</p><p className="text-2xl font-bold" style={{ color: '#B87333' }}>{faculty.length}</p></div>
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Acknowledged</p><p className="text-2xl font-bold" style={{ color: '#2E8B57' }}>{acknowledgedCount}/{faculty.length}</p></div>
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Below Benchmark</p><p className="text-2xl font-bold" style={{ color: '#C41E3A' }}>{flaggedFaculty.length}</p></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><h3 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Top Rated Faculty</h3><div className="space-y-2">{topRated.map((f, i) => { const m = store.getFacultyMetrics(f.id, cycleId); return (<div key={f.id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}><div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: ['#002366', '#B87333', '#C41E3A'][i] }}>{i + 1}</span><span className="text-sm font-medium">{f.name}</span></div><span className="text-sm font-bold" style={{ color: '#2E8B57' }}>{m.overallAverage.toFixed(2)}</span></div>); })}</div></div>
          <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><h3 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Completion by Program</h3><div className="space-y-3">{store.getPrograms().map(program => { const pf = faculty.filter(f => f.department === program.department); const ts = pf.reduce((sum, f) => sum + store.getFacultyMetrics(f.id, cycleId).totalSubmissions, 0); const fwt = pf.filter(f => store.getFacultyMetrics(f.id, cycleId).totalSubmissions >= THRESHOLD).length; const cr = pf.length > 0 ? Math.round((fwt / pf.length) * 100) : 0; return (<div key={program.id} className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}><div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">{program.name}</span><span className="text-sm font-bold" style={{ color: cr >= 80 ? '#2E8B57' : cr >= 50 ? '#B87333' : '#C41E3A' }}>{cr}%</span></div><div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#D5D8DC' }}><div className="h-full rounded-full" style={{ width: `${cr}%`, backgroundColor: cr >= 80 ? '#2E8B57' : cr >= 50 ? '#B87333' : '#C41E3A' }} /></div></div>); })}</div></div>
        </div>
        {flaggedFaculty.length > 0 && (<div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#FEE2E2', border: '1px solid #C41E3A' }}><h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#C41E3A' }}><AlertTriangle size={16} />Below Benchmark (Average &lt; {BENCHMARK.toFixed(1)})</h3><div className="space-y-2">{flaggedFaculty.map(f => { const m = store.getFacultyMetrics(f.id, cycleId); return (<div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-white/50"><span className="text-sm">{f.name} ({f.department})</span><span className="text-sm font-bold" style={{ color: '#C41E3A' }}>{m.overallAverage.toFixed(2)}</span></div>); })}</div></div>)}
      </div>)}
      {activeTab === 'faculty' && !selectedFaculty && (<div className="space-y-4"><div className="relative max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} /><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search faculty..." className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} /></div><div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: '#EDEBE8' }}><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ backgroundColor: '#002366' }}><th className="text-left px-4 py-3 text-white font-medium">Name</th><th className="text-left px-4 py-3 text-white font-medium">Dept</th><th className="text-center px-4 py-3 text-white font-medium">Submissions</th><th className="text-center px-4 py-3 text-white font-medium">Avg</th><th className="text-center px-4 py-3 text-white font-medium">Actions</th></tr></thead><tbody>{faculty.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((f, i) => { const m = store.getFacultyMetrics(f.id, cycleId); const hasData = m.totalSubmissions > 0; return (<tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}><td className="px-4 py-3 font-medium">{f.name}</td><td className="px-4 py-3 text-xs" style={{ color: '#4B5563' }}>{f.department}</td><td className="px-4 py-3 text-center">{m.totalSubmissions}</td><td className="px-4 py-3 text-center font-bold" style={{ color: !hasData ? '#9CA3AF' : m.overallAverage >= 4.5 ? '#2E8B57' : m.overallAverage < BENCHMARK ? '#C41E3A' : '#1A1A1A' }}>{!hasData ? '—' : m.overallAverage.toFixed(2)}</td><td className="px-4 py-3 text-center"><div className="flex items-center justify-center gap-1"><button onClick={() => setSelectedFaculty(f)} className="px-2 py-1 rounded text-xs font-medium text-white hover:opacity-80" style={{ backgroundColor: '#002366' }}>View</button><button onClick={() => exportFacultyReport(f.id, cycleId)} className="px-2 py-1 rounded text-xs text-white hover:opacity-80" style={{ backgroundColor: '#2E8B57' }}><FileSpreadsheet size={12} /></button></div></td></tr>); })}</tbody></table></div></div></div>)}
      {activeTab === 'faculty' && selectedFaculty && (() => { const metrics = store.getFacultyMetrics(selectedFaculty.id, cycleId); const subjects = store.getFacultyCourses(selectedFaculty.id); return (<div className="space-y-6"><div className="flex items-center justify-between flex-wrap gap-3"><div className="flex items-center gap-3"><button onClick={() => setSelectedFaculty(null)} className="px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90" style={{ backgroundColor: '#D5D8DC', color: '#1A1A1A' }}>← Back</button><div><h2 className="text-xl font-bold" style={{ color: '#002366' }}>{selectedFaculty.name}</h2><p className="text-sm" style={{ color: '#4B5563' }}>{selectedFaculty.title} • {selectedFaculty.department}</p></div></div><div className="flex items-center gap-2"><button onClick={async () => await exportFacultyReport(selectedFaculty.id, cycleId)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#2E8B57' }}><Download size={16} /> Export XLSX</button><button onClick={async () => await exportFacultyPDF(selectedFaculty.id, cycleId)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#B87333' }}><Download size={16} /> Export PDF</button></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium" style={{ color: '#4B5563' }}>Total Submissions</p><p className="text-2xl font-bold" style={{ color: '#002366' }}>{metrics.totalSubmissions}</p></div><div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium" style={{ color: '#4B5563' }}>Overall Average</p><p className="text-2xl font-bold" style={{ color: '#002366' }}>{metrics.overallAverage.toFixed(2)}</p></div><div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium" style={{ color: '#4B5563' }}>Courses/Subjects</p><p className="text-2xl font-bold" style={{ color: '#002366' }}>{Object.keys(metrics.courseBreakdown).length}</p></div></div><div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#002366' }}><BarChart3 size={16} style={{ color: '#B87333' }} />Performance by Course/Subject</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ backgroundColor: '#002366' }}><th className="text-left px-4 py-2 text-white font-medium">Course/Subject</th><th className="text-center px-4 py-2 text-white font-medium">Submissions</th><th className="text-center px-4 py-2 text-white font-medium">Average</th><th className="text-center px-4 py-2 text-white font-medium">Status</th></tr></thead><tbody>{subjects.map((subject, i) => { const subjectMetrics = store.getFacultyMetrics(selectedFaculty.id, cycleId, subject); const hasData = subjectMetrics.totalSubmissions > 0; return (<tr key={subject} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}><td className="px-4 py-2 font-medium">{subject}</td><td className="px-4 py-2 text-center">{subjectMetrics.totalSubmissions}</td><td className="px-4 py-2 text-center font-bold" style={{ color: !hasData ? '#9CA3AF' : subjectMetrics.overallAverage >= 4.5 ? '#2E8B57' : subjectMetrics.overallAverage < BENCHMARK ? '#C41E3A' : '#1A1A1A' }}>{!hasData ? '—' : subjectMetrics.overallAverage.toFixed(2)}</td><td className="px-4 py-2 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: !hasData ? '#D5D8DC' : subjectMetrics.overallAverage >= 4.5 ? '#D1FAE5' : subjectMetrics.overallAverage >= BENCHMARK ? '#F5E6D3' : '#FEE2E2', color: !hasData ? '#6B7280' : subjectMetrics.overallAverage >= 4.5 ? '#2E8B57' : subjectMetrics.overallAverage >= BENCHMARK ? '#B87333' : '#C41E3A' }}>{!hasData ? 'No Data' : subjectMetrics.overallAverage >= 4.5 ? 'Excellent' : subjectMetrics.overallAverage >= BENCHMARK ? 'Good' : 'Below Benchmark'}</span></td></tr>); })}</tbody></table></div></div><div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#002366' }}><MessageSquare size={16} style={{ color: '#B87333' }} />Evaluation Details (HR / QA View — Student IDs Visible)</h3><div className="space-y-2 max-h-80 overflow-y-auto">{store.getEvaluationsForFaculty(selectedFaculty.id, cycleId).map((ev, i) => { const student = store.getStudentById(ev.studentId || ''); const avgRating = Object.values(ev.ratings).reduce((a, b) => a + b, 0) / Object.values(ev.ratings).length; return (<div key={i} className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#F8F6F1', border: '1px solid #D5D8DC' }}><div className="flex items-center justify-between mb-1"><span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#002366', color: '#FFFFFF' }}>Student: {ev.studentId || 'Unknown'}</span><span className="text-xs" style={{ color: '#4B5563' }}>{ev.courseId} • {new Date(ev.submittedAt).toLocaleDateString()}</span></div>{student && <p className="text-xs mb-1" style={{ color: '#B87333' }}>Name: {student.name} | Program: {student.programId}</p>}<div className="flex items-center gap-2 mb-1"><span className="text-xs font-medium" style={{ color: '#4B5563' }}>Avg Rating:</span><span className="text-xs font-bold" style={{ color: avgRating >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{avgRating.toFixed(2)}/5.0</span></div>{ev.feedback && <p className="text-xs italic" style={{ color: '#1A1A1A' }}>"{ev.feedback}"</p>}</div>); })}</div></div></div>); })()}
      {activeTab === 'cycles' && (
        <div className="space-y-6">
          <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#002366' }}><Plus size={16} style={{ color: '#B87333' }} />Create Academic Term / Semester</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <input type="text" value={newCycleName} onChange={e => setNewCycleName(e.target.value)} placeholder="Internal name (e.g. AY2026-S1)" className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
              <input type="text" value={newCycleDisplayName} onChange={e => setNewCycleDisplayName(e.target.value)} placeholder="Display name (e.g. AY 2026–2027 | First Semester)" className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
              <input type="date" aria-label="Start date" value={newCycleStart} onChange={e => setNewCycleStart(e.target.value)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
              <input type="date" aria-label="End date" value={newCycleEnd} onChange={e => setNewCycleEnd(e.target.value)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
            </div>
            <button
              onClick={() => runAction(async () => {
                if (!(newCycleName && newCycleDisplayName && newCycleStart && newCycleEnd)) throw new Error('Please complete all Academic Term fields.');
                await store.addCycle({ name: newCycleName, displayName: newCycleDisplayName, startDate: newCycleStart, endDate: newCycleEnd });
                setNewCycleName(''); setNewCycleDisplayName(''); setNewCycleStart(''); setNewCycleEnd('');
              })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}
            >Create Academic Term</button>
          </div>
          <div className="space-y-3">
            {cycles.map(cycle => {
              const released = store.isCycleAdminReleased(cycle.id);
              return (
                <div key={cycle.id} className="rounded-xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: '#EDEBE8' }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#002366' }}>{cycle.displayName}</p>
                    <p className="text-xs" style={{ color: '#4B5563' }}>{cycle.startDate} — {cycle.endDate}{released ? ' • Released by HR / QA' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: cycle.status === 'active' ? '#D1FAE5' : cycle.status === 'upcoming' ? '#F5E6D3' : cycle.status === 'archived' ? '#FEE2E2' : '#D5D8DC', color: cycle.status === 'active' ? '#2E8B57' : cycle.status === 'upcoming' ? '#B87333' : cycle.status === 'archived' ? '#C41E3A' : '#4B5563' }}>{cycle.status}</span>
                    {(cycle.status === 'upcoming' || cycle.status === 'completed') && (
                      <button onClick={() => setConfirmDialog({ open: true, type: 'info', title: 'Activate Academic Term', message: `Activate "${cycle.displayName}"? The currently active term will be marked completed and students will evaluate under the new term.`, onConfirm: () => { setConfirmDialog(prev => ({ ...prev, open: false })); runAction(() => store.activateCycle(cycle.id)); } })} className="px-3 py-1 rounded text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#2E8B57' }}>Activate</button>
                    )}
                    {cycle.status === 'completed' && (
                      <button onClick={() => runAction(() => store.archiveCycle(cycle.id))} title="Archive" className="px-2 py-1 rounded text-xs text-white hover:opacity-90" style={{ backgroundColor: '#B87333' }}><Archive size={12} /></button>
                    )}
                    {cycle.status === 'archived' && (
                      <button onClick={() => runAction(() => store.unarchiveCycle(cycle.id))} title="Unarchive" className="px-2 py-1 rounded text-xs text-white hover:opacity-90" style={{ backgroundColor: '#B87333' }}><ArchiveRestore size={12} /></button>
                    )}
                    {cycle.status !== 'active' && (
                      <button onClick={() => setConfirmDialog({ open: true, type: 'danger', title: 'Remove Academic Term', message: `Remove "${cycle.displayName}"? Terms with evaluations or signatures cannot be removed and should be archived instead.`, onConfirm: () => { setConfirmDialog(prev => ({ ...prev, open: false })); runAction(() => store.removeCycle(cycle.id)); } })} title="Remove" className="px-2 py-1 rounded text-xs text-white hover:opacity-90" style={{ backgroundColor: '#C41E3A' }}><Trash2 size={12} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === 'criteria' && (
        <div className="space-y-6">
          <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#002366' }}><Plus size={16} style={{ color: '#B87333' }} />Add New Criterion</h3>
            <div className="flex gap-3">
              <input type="text" value={newCriterionName} onChange={e => setNewCriterionName(e.target.value)} placeholder="Criterion name" className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
              <button onClick={() => runAction(async () => { if (newCriterionName.trim()) { await store.addCriterion(newCriterionName.trim()); setNewCriterionName(''); } })} className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>Add</button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: '#6B7280' }}>Removed criteria and Performance Indicators are archived, so ratings already submitted remain intact and auditable.</p>
          </div>
          <div className="space-y-3">
            {criteria.map(crit => {
              const subQs = store.getSubQuestionsForCriterion(crit.id);
              const isExpanded = expandedCriteria.has(crit.id);
              return (
                <div key={crit.id} className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: '#EDEBE8' }}>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#002366' }}>{crit.order}</span>
                      <div><span className="text-sm font-semibold">{crit.name}</span><p className="text-xs" style={{ color: '#9CA3AF' }}>{subQs.length} Performance Indicator(s)</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setExpandedCriteria(prev => { const n = new Set(prev); if (n.has(crit.id)) n.delete(crit.id); else n.add(crit.id); return n; })} className="px-2 py-1 rounded text-xs font-medium hover:opacity-80" style={{ backgroundColor: '#F5E6D3', color: '#B87333' }}>{isExpanded ? 'Hide' : 'Manage'} Indicators</button>
                      <button onClick={() => setConfirmDialog({ open: true, type: 'warning', title: 'Archive Criterion', message: `Archive "${crit.name}" and its ${subQs.length} Performance Indicator(s)? Historical ratings are kept.`, onConfirm: () => { setConfirmDialog(prev => ({ ...prev, open: false })); runAction(() => store.removeCriterion(crit.id)); } })} className="px-2 py-1 rounded text-xs text-white hover:opacity-90" style={{ backgroundColor: '#C41E3A' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t" style={{ borderColor: '#D5D8DC' }}>
                      <div className="mt-3 space-y-2">
                        {subQs.map(sq => (
                          <div key={sq.id} className="p-2.5 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold w-6 text-center flex-shrink-0" style={{ color: '#B87333' }}>{sq.order}.</span>
                              <span className="text-xs flex-1">{sq.text}</span>
                              <button onClick={() => runAction(() => store.removeSubQuestion(sq.id))} aria-label="Archive indicator" className="px-2 py-1 rounded text-xs text-white hover:opacity-90" style={{ backgroundColor: '#C41E3A' }}><Trash2 size={10} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input type="text" value={newSubQs[crit.id] || ''} onChange={e => setNewSubQs(prev => ({ ...prev, [crit.id]: e.target.value }))} placeholder="New Performance Indicator..." className="flex-1 px-3 py-2 rounded-lg border text-xs outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                        <button onClick={() => runAction(async () => { const text = newSubQs[crit.id]?.trim(); if (text) { await store.addSubQuestion(crit.id, text); setNewSubQs(prev => ({ ...prev, [crit.id]: '' })); } })} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}><Plus size={12} />Add</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === 'tna' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-bold" style={{ color: '#002366' }}>Institutional Training Needs Analysis</h3>
            <button onClick={() => loadTNA(true)} disabled={tnaLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}><RefreshCw size={12} className={tnaLoading ? 'animate-spin' : ''} />Regenerate snapshot</button>
          </div>
          <div className="rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: '#F5E6D3', border: '1px solid #B87333' }}>
            <Sparkles size={16} style={{ color: '#B87333' }} />
            <p className="text-xs"><strong>Macro-level TNA:</strong> analyzed at Department and Institution level and stored as a snapshot for this Academic Term; it is reused until evaluations or the rubric change. Individual faculty receive deterministic, pre-approved recommendations instead.{institutionalTNA && <span style={{ color: '#6B7280' }}> — {institutionalTNA.cached ? 'Cached snapshot' : 'Generated'} {new Date(institutionalTNA.generatedAt).toLocaleString()}</span>}</p>
          </div>
          {!institutionalTNA && <p className="text-sm italic" style={{ color: '#6B7280' }}>{tnaLoading ? 'Loading analysis…' : 'No analysis available.'}</p>}
          {institutionalTNA && (() => {
            const t = institutionalTNA.snapshot;
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Institutional Average</p><p className="text-2xl font-bold" style={{ color: t.institutionalAverage >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{t.institutionalAverage.toFixed(2)}</p></div>
                  <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Evaluations Analyzed</p><p className="text-2xl font-bold" style={{ color: '#002366' }}>{t.totalSubmissions}</p></div>
                  <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><p className="text-xs font-medium mb-1" style={{ color: '#4B5563' }}>Departments with Critical Needs</p><p className="text-2xl font-bold" style={{ color: t.criticalDepartments.length ? '#C41E3A' : '#2E8B57' }}>{t.criticalDepartments.length}</p></div>
                </div>
                <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
                  <h4 className="text-sm font-semibold mb-2" style={{ color: '#002366' }}>Strategic Recommendations</h4>
                  <ul className="text-xs space-y-1 list-disc pl-4">{t.strategicRecommendations.institutionWide.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
                <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
                  <h4 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#002366' }}><AlertTriangle size={16} style={{ color: '#C41E3A' }} />Department Deficits Below Benchmark ({BENCHMARK.toFixed(1)}/5.0)</h4>
                  <div className="space-y-4">
                    {t.departments.map((d, i) => (
                      <div key={d.department} className="p-4 rounded-lg" style={{ backgroundColor: '#F8F6F1', border: '1px solid #D5D8DC' }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#002366' }}>{i + 1}</span><p className="font-semibold text-sm" style={{ color: '#002366' }}>{d.department}</p></div>
                          <span className="text-xs font-bold" style={{ color: d.overallAverage >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>Avg {d.overallAverage.toFixed(2)} • {d.totalSubmissions} evaluations • Priority {d.priorityScore.toFixed(1)}</span>
                        </div>
                        {d.deficits.length === 0 ? <p className="text-xs italic" style={{ color: '#2E8B57' }}>✓ All criteria meet the benchmark.</p> : (
                          <div className="space-y-1.5">
                            {d.deficits.map(x => (
                              <div key={x.criterionId} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: '#FFFFFF' }}>
                                <span className="text-xs font-medium">{x.criterionName}</span>
                                <span className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase" style={{ color: x.severity === 'critical' ? '#C41E3A' : '#B87333' }}>{x.severity}</span><span className="text-xs font-bold" style={{ color: '#C41E3A' }}>{x.average.toFixed(2)}</span></span>
                              </div>
                            ))}
                          </div>
                        )}
                        <ul className="mt-2 text-[11px] space-y-0.5 list-disc pl-4" style={{ color: '#4B5563' }}>{[...d.recommendations.immediate, ...d.recommendations.shortTerm].map((r, j) => <li key={j}>{r}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
          <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <h4 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Department Summary</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ backgroundColor: '#002366' }}><th className="text-left px-4 py-2 text-white font-medium">Department</th><th className="text-center px-4 py-2 text-white font-medium">Overall Avg</th><th className="text-center px-4 py-2 text-white font-medium">Criteria Below Benchmark</th><th className="text-center px-4 py-2 text-white font-medium">Status</th></tr></thead>
                <tbody>
                  {departments.map((dept, i) => {
                    const dm = store.getDepartmentMetrics(dept, cycleId);
                    const lowCrit = criteria.filter(c => (dm.criteriaAverages[c.id] || 0) < BENCHMARK && (dm.criteriaAverages[c.id] || 0) > 0);
                    return (
                      <tr key={dept} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}>
                        <td className="px-4 py-2 font-medium">{dept}</td>
                        <td className="px-4 py-2 text-center font-bold" style={{ color: dm.institutionAverage >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{dm.institutionAverage.toFixed(2)}</td>
                        <td className="px-4 py-2 text-center">{lowCrit.length}</td>
                        <td className="px-4 py-2 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: lowCrit.length === 0 ? '#D1FAE5' : '#FEE2E2', color: lowCrit.length === 0 ? '#2E8B57' : '#C41E3A' }}>{lowCrit.length === 0 ? '✓ On Track' : '⚠ Needs Attention'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
       )}
       {activeTab === 'accounts' && (
         <div className="space-y-6">
           <div className="flex gap-2 mb-4">
             <button onClick={() => setAccountFormTab('create')} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: accountFormTab === 'create' ? '#002366' : '#D5D8DC', color: accountFormTab === 'create' ? '#FFFFFF' : '#1A1A1A' }}>Create Account</button>
             <button onClick={() => setAccountFormTab('manage')} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: accountFormTab === 'manage' ? '#002366' : '#D5D8DC', color: accountFormTab === 'manage' ? '#FFFFFF' : '#1A1A1A' }}>Manage Accounts</button>
           </div>
           {accountFormTab === 'create' && (
             <div className="space-y-6">
               <div className="rounded-xl p-6 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
                 <h3 className="text-sm font-semibold mb-4" style={{ color: '#002366' }}>Create a Single Account</h3>
                 <div className="mb-6"><label className="block text-sm font-medium mb-3">Account Type *</label><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{['faculty', 'student', 'dean', 'hr_qa'].map(role => (<button key={role} type="button" onClick={() => { setSelectedAccountRole(role as any); setAccountMessage(null); }} className="px-4 py-3 rounded-lg text-sm font-medium" style={{ backgroundColor: selectedAccountRole === role ? '#002366' : '#F8F6F1', color: selectedAccountRole === role ? '#FFFFFF' : '#1A1A1A', border: selectedAccountRole === role ? '2px solid #002366' : '2px solid #D5D8DC' }}>{role === 'hr_qa' ? 'HR / QA' : role.charAt(0).toUpperCase() + role.slice(1)}</button>))}</div></div>
                 {accountMessage && (<div className="mb-6 p-4 rounded-lg flex items-start gap-3" style={{ backgroundColor: accountMessage.type === 'success' ? '#D1FAE5' : '#FEE2E2', border: `1px solid ${accountMessage.type === 'success' ? '#2E8B57' : '#C41E3A'}` }}><span className="text-sm flex-1">{accountMessage.text}</span></div>)}
                 <form onSubmit={async (e) => { e.preventDefault(); setAccountMessage(null); if (accountFormData.password && accountFormData.password !== accountFormData.confirmPassword) { setAccountMessage({ type: 'error', text: 'Passwords do not match' }); return; } setAccountSubmitting(true); try { const result = await store.createAccount({ role: selectedAccountRole, name: accountFormData.name.trim(), institutionalId: accountFormData.institutionalId.trim(), email: accountFormData.email.trim(), username: accountFormData.username.trim() || undefined, password: accountFormData.password || undefined, department: ['faculty', 'dean'].includes(selectedAccountRole) ? accountFormData.department : undefined, title: selectedAccountRole === 'faculty' ? accountFormData.title : undefined, programId: selectedAccountRole === 'student' ? accountFormData.programId : undefined, subjects: ['faculty', 'student'].includes(selectedAccountRole) ? accountFormData.subjects : undefined }); setAccountMessage({ type: 'success', text: `${result.message} Username: ${result.username}` }); setAccountFormData({ name: '', institutionalId: '', email: '', username: '', password: '', confirmPassword: '', department: '', title: '', programId: '', subjects: [] }); loadData(); } catch (err) { setAccountMessage({ type: 'error', text: errorMessage(err) }); } finally { setAccountSubmitting(false); } }} className="space-y-4">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <input type="text" name="name" value={accountFormData.name} onChange={e => setAccountFormData({...accountFormData, name: e.target.value})} placeholder="Full Name *" required className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                     <input type="text" name="institutionalId" value={accountFormData.institutionalId} onChange={e => setAccountFormData({...accountFormData, institutionalId: e.target.value})} placeholder="Institutional ID *" required className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                     <input type="email" name="email" value={accountFormData.email} onChange={e => setAccountFormData({...accountFormData, email: e.target.value})} placeholder="Email *" required className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                     <input type="text" name="username" value={accountFormData.username} onChange={e => setAccountFormData({...accountFormData, username: e.target.value})} placeholder="Username (auto-generated if empty)" className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                     {['faculty', 'dean'].includes(selectedAccountRole) && (
                       <select name="department" value={accountFormData.department} onChange={e => setAccountFormData({...accountFormData, department: e.target.value})} required className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                         <option value="">Select Department *</option>
                         {departments.map(d => <option key={d} value={d}>{d}</option>)}
                       </select>
                     )}
                     {selectedAccountRole === 'faculty' && (
                       <select name="title" value={accountFormData.title} onChange={e => setAccountFormData({...accountFormData, title: e.target.value})} required className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                         <option value="">Select Title *</option>
                         {['Professor', 'Associate Professor', 'Assistant Professor', 'Instructor', 'Lecturer'].map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                     )}
                     {selectedAccountRole === 'student' && (
                       <select name="programId" value={accountFormData.programId} onChange={e => setAccountFormData({...accountFormData, programId: e.target.value})} required className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                         <option value="">Select Program *</option>
                         {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                     )}
                     <input type="password" name="password" value={accountFormData.password} onChange={e => setAccountFormData({...accountFormData, password: e.target.value})} placeholder="Password (optional, sent via email)" className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                     <input type="password" name="confirmPassword" value={accountFormData.confirmPassword} onChange={e => setAccountFormData({...accountFormData, confirmPassword: e.target.value})} placeholder="Confirm Password" className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />                   </div>
                   {['faculty', 'student'].includes(selectedAccountRole) && (
                     <div>
                       <label className="block text-sm font-medium mb-2">Subjects</label>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2" style={{ backgroundColor: '#F8F6F1', borderRadius: '0.5rem' }}>
                         {(selectedAccountRole === 'student' && accountFormData.programId ? subjects.filter(s => s.programId === accountFormData.programId) : subjects).map(s => (
                           <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm">
                             <input type="checkbox" checked={accountFormData.subjects.includes(s.id)} onChange={() => setAccountFormData({...accountFormData, subjects: accountFormData.subjects.includes(s.id) ? accountFormData.subjects.filter(x => x !== s.id) : [...accountFormData.subjects, s.id]})} />
                             {s.code}
                           </label>
                         ))}
                       </div>
                     </div>
                   )}
                   <button type="submit" disabled={accountSubmitting} className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>Create Account</button>
                 </form>
               </div>
               <BulkImport />
             </div>
           )}
          {accountFormTab === 'manage' && (() => {
            const roleLabel = (role: UserRole) => role === 'hr_qa' ? 'HR / QA' : role.charAt(0).toUpperCase() + role.slice(1);
            const q = accountSearch.trim().toLowerCase();
            const visibleAccounts = accounts.filter(a =>
              (accountRoleFilter === 'all' || a.role === accountRoleFilter) &&
              (!q || [a.username, a.displayName, a.institutionalId, a.email ?? '', a.department ?? ''].some(v => v.toLowerCase().includes(q))));
            return (
              <div className="space-y-4">
                <div className="rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3" style={{ backgroundColor: '#EDEBE8' }}>
                  <div className="relative flex-1 min-w-[220px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                    <input type="text" value={accountSearch} onChange={e => setAccountSearch(e.target.value)} placeholder="Search by name, username, ID, email or department" className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} />
                  </div>
                  <select value={accountRoleFilter} onChange={e => setAccountRoleFilter(e.target.value as 'all' | UserRole)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                    <option value="all">All roles</option>
                    {(['faculty', 'student', 'dean', 'hr_qa'] as const).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                  <button onClick={() => { setManageMessage(null); loadAccounts(); }} disabled={accountsLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border hover:bg-black/5 disabled:opacity-50" style={{ borderColor: '#D5D8DC' }}><RefreshCw size={12} className={accountsLoading ? 'animate-spin' : ''} />Refresh</button>
                </div>
                {manageMessage && (
                  <div className="p-3 rounded-lg flex items-start gap-3" style={{ backgroundColor: manageMessage.type === 'success' ? '#D1FAE5' : '#FEE2E2', border: `1px solid ${manageMessage.type === 'success' ? '#2E8B57' : '#C41E3A'}` }}>
                    <span className="text-sm flex-1">{manageMessage.text}</span>
                    <button onClick={() => setManageMessage(null)} aria-label="Dismiss"><X size={14} /></button>
                  </div>
                )}
                <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: '#EDEBE8' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr style={{ backgroundColor: '#002366' }}>{['Username', 'Name', 'Role', 'Department', 'Status', 'Last Sign-in', 'Actions'].map((h, idx) => <th key={h} className={`${idx < 2 ? 'text-left' : 'text-center'} px-4 py-3 text-white font-medium`}>{h}</th>)}</tr></thead>
                      <tbody>
                        {accountsLoading && accounts.length === 0 ? (
                          <tr style={{ backgroundColor: '#F8F6F1' }}><td colSpan={7} className="px-4 py-3 text-center text-xs" style={{ color: '#9CA3AF' }}>Loading accounts…</td></tr>
                        ) : visibleAccounts.length === 0 ? (
                          <tr style={{ backgroundColor: '#F8F6F1' }}><td colSpan={7} className="px-4 py-3 text-center text-xs" style={{ color: '#9CA3AF' }}>{accounts.length === 0 ? 'No accounts available' : 'No accounts match your filters'}</td></tr>
                        ) : (
                          visibleAccounts.map((account, i) => {
                            const isSelf = account.id === user?.id;
                            const busy = accountBusyId === account.id;
                            const status = !account.isActive ? { label: 'Inactive', bg: '#FEE2E2', fg: '#C41E3A' }
                              : account.lockedUntil ? { label: 'Locked', bg: '#FEF3C7', fg: '#B45309' }
                              : !account.hasPassword ? { label: 'Invite pending', bg: '#E3F2FD', fg: '#0D47A1' }
                              : { label: 'Active', bg: '#D1FAE5', fg: '#2E8B57' };
                            return (
                              <tr key={account.id} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}>
                                <td className="px-4 py-3 font-medium">{account.username}{isSelf && <span className="ml-1 text-xs" style={{ color: '#9CA3AF' }}>(you)</span>}</td>
                                <td className="px-4 py-3"><div>{account.displayName}</div><div className="text-xs" style={{ color: '#9CA3AF' }}>{account.institutionalId}{account.email ? ` · ${account.email}` : ''}</div></td>
                                <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#E3F2FD', color: '#0D47A1' }}>{roleLabel(account.role)}</span></td>
                                <td className="px-4 py-3 text-center text-xs" style={{ color: '#4B5563' }}>{account.department ?? '—'}</td>
                                <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: status.bg, color: status.fg }} title={account.lockedUntil ? `Locked until ${new Date(account.lockedUntil).toLocaleString()}` : undefined}>{status.label}</span></td>
                                <td className="px-4 py-3 text-center text-xs" style={{ color: '#4B5563' }}>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : 'Never'}</td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                    {account.isActive && account.email && (
                                      <button disabled={busy} onClick={() => runAccountAction(account.id, () => store.sendAccountPasswordLink(account.id))} className="px-2 py-1 rounded text-xs text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>{account.hasPassword ? 'Reset password' : 'Resend invite'}</button>
                                    )}
                                    {account.isActive && account.lockedUntil && (
                                      <button disabled={busy} onClick={() => runAccountAction(account.id, () => store.unlockAccount(account.id))} className="px-2 py-1 rounded text-xs text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#B45309' }}>Unlock</button>
                                    )}
                                    {account.isActive ? (
                                      <button disabled={busy || isSelf} title={isSelf ? 'You cannot deactivate your own account' : undefined} onClick={() => setConfirmDialog({ open: true, type: 'danger', title: 'Deactivate Account', message: `Deactivate ${account.displayName} (${account.username})? They will be signed out immediately and unable to sign in until reactivated. Their evaluation records are kept.`, onConfirm: () => { setConfirmDialog(prev => ({ ...prev, open: false })); runAccountAction(account.id, () => store.setAccountActive(account.id, false)); } })} className="px-2 py-1 rounded text-xs text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#C41E3A' }}>Deactivate</button>
                                    ) : (
                                      <button disabled={busy} onClick={() => runAccountAction(account.id, () => store.setAccountActive(account.id, true))} className="px-2 py-1 rounded text-xs text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#2E8B57' }}>Reactivate</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-xs" style={{ color: '#9CA3AF' }}>Showing {visibleAccounts.length} of {accounts.length} account(s). Every action is recorded in the Audit Trail.</p>
                </div>
              </div>
            );
          })()}
         </div>
       )}
       {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-3" style={{ backgroundColor: '#EDEBE8' }}>
            <div>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: '#002366' }}><ShieldCheck size={16} style={{ color: '#B87333' }} />Immutable Audit Trail</p>
              <p className="text-xs" style={{ color: '#4B5563' }}>Append-only and SHA-256 hash-chained: each entry seals the one before it, so any alteration is detectable.</p>
              {auditVerification && (
                <p className="text-xs mt-1 font-medium" style={{ color: auditVerification.valid ? '#2E8B57' : '#C41E3A' }}>
                  {auditVerification.valid ? `✓ Chain verified — ${auditVerification.checked} entries intact` : `✗ Integrity failure at entry #${auditVerification.firstInvalidId}: ${auditVerification.reason}`}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => runAction(loadAudit)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-black/5" style={{ borderColor: '#D5D8DC' }}><RefreshCw size={12} />Refresh</button>
              <button onClick={() => runAction(async () => setAuditVerification(await store.verifyAuditChain()))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}><ShieldCheck size={12} />Verify integrity</button>
            </div>
          </div>
          <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: '#EDEBE8' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ backgroundColor: '#002366' }}>{['Timestamp', 'Actor', 'Action', 'Target', 'Details', 'IP', 'Event Hash'].map(h => <th key={h} className="text-left px-3 py-3 text-white font-medium text-xs">{h}</th>)}</tr></thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={entry.id} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }} className="align-top">
                      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: '#4B5563' }}>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs font-medium">{entry.actor}</td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap" style={{ backgroundColor: '#F5E6D3', color: '#B87333' }}>{entry.action}</span></td>
                      <td className="px-3 py-2 text-xs" style={{ color: '#4B5563' }}>{entry.targetType ? `${entry.targetType}: ` : ''}{entry.target}</td>
                      <td className="px-3 py-2 text-xs" style={{ color: '#4B5563' }}>
                        {entry.details || '—'}
                        {(entry.oldValue !== undefined || entry.newValue !== undefined) && (
                          <details className="mt-1"><summary className="cursor-pointer text-[10px]" style={{ color: '#002366' }}>old / new values</summary><pre className="text-[10px] whitespace-pre-wrap break-all">{JSON.stringify({ old: entry.oldValue, new: entry.newValue }, null, 1)}</pre></details>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono" style={{ color: '#6B7280' }}>{entry.ipAddress ?? '—'}</td>
                      <td className="px-3 py-2 text-[10px] font-mono" style={{ color: '#6B7280' }} title={entry.eventHash}>{entry.eventHash.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {showAdminSignModal && cycleId && (
        <AgreementSignModal
          type="hr_qa_release"
          cycleId={cycleId}
          description="Releasing grants each faculty member immediate access to their own results and opens the Dean's 7-day oversight window. Student submissions for this term close upon release."
          onSign={signature => store.adminReleaseCycle(cycleId, signature)}
          onClose={() => setShowAdminSignModal(false)}
        />
      )}
      <ConfirmDialog isOpen={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} type={confirmDialog.type} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
}

```

## src/pages/DeanDashboard.tsx
```tsx
import React, { useState, useEffect } from 'react';
import { store, BENCHMARK, THRESHOLD } from '../store';
import { useAuth } from '../auth';
import { errorMessage } from '../api/client';
import { exportDeanReport } from '../utils/deanReport';
import { exportDepartmentFacultyReport, exportDepartmentPerformancePDF } from '../utils/deanReports';
import type { Criterion, DepartmentTNA, TNASnapshotResponse } from '../types';
import { DEAN_OVERSIGHT_WINDOW_DAYS } from '../constants';
import { Users, TrendingUp, Shield, Award, CheckCircle, Download, AlertTriangle, Printer, Eye, Clock, XCircle, FileSpreadsheet, FileText, ChevronDown, Database } from 'lucide-react';
import DeanPrintReport from '../components/DeanPrintReport';
import AgreementSignModal from '../components/AgreementSignModal';

interface DeanDashboardProps { viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function DeanDashboard({ viewingCycleId }: DeanDashboardProps) {
  const { user } = useAuth();
  const department = user?.department || '';
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [, setDataVersion] = useState(0);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string | null>(null);
  const [tna, setTna] = useState<TNASnapshotResponse<DepartmentTNA> | null>(null);
  const [tnaError, setTnaError] = useState<string | null>(null);

  const activeCycle = store.getActiveCycle();
  const cycleId = viewingCycleId || activeCycle?.id;
  const allCycles = store.getCycles();
  const viewingCycle = allCycles.find(c => c.id === cycleId);
  const faculty = store.getFacultyByDepartment(department);
  const deptMetrics = store.getDepartmentMetrics(department, cycleId);
  const acknowledged = faculty.filter(f => store.findAgreement('faculty_acknowledgment', cycleId, { facultyId: f.id })).length;
  const isAdminReleased = store.isCycleAdminReleased(cycleId);
  const isDeanReleased = store.isCycleDeanReleased(cycleId, department);
  const deanSignOff = store.getCycleDeanRelease(cycleId, department);
  const deanSignOffAgreement = store.findAgreement('dean_oversight_signoff', cycleId, { department });
  const oversightDeadline = store.getDeanOversightDeadline(cycleId, department);

  const [showDeanSignModal, setShowDeanSignModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    const refresh = () => { setCriteria(store.getCriteria()); setDataVersion(v => v + 1); };
    refresh();
    const unsubs = (['submission_added', 'acknowledgment_changed', 'criteria_changed', 'cycle_changed', 'data_refresh'] as const).map(e => store.subscribe(e, refresh));
    return () => unsubs.forEach(u => u());
  }, []);

  // Department TNA is a cached server-side snapshot for this Academic Term.
  useEffect(() => {
    setTna(null);
    setTnaError(null);
    if (!isAdminReleased || !cycleId) return;
    store.fetchDepartmentTNA(cycleId).then(setTna).catch(err => setTnaError(errorMessage(err)));
  }, [isAdminReleased, cycleId]);

  const comparativeAnalytics = isAdminReleased ? store.getDeanComparativeAnalytics(department, cycleId) : null;
  const earlyWarnings = isAdminReleased ? store.getDeanEarlyWarnings(department, cycleId) : [];
  const acknowledgmentTracking = isAdminReleased ? store.getDeanAcknowledgmentTracking(department, cycleId) : [];
  const facultyDrilldown = selectedFacultyId && isAdminReleased ? store.getDeanFacultyDrilldown(selectedFacultyId, cycleId) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-export-menu]')) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showExportMenu]);

  const facultyPerformance = faculty.map(f => { 
    const metrics = store.getFacultyMetrics(f.id, cycleId); 
    return { 
      id: f.id, 
      name: f.name, 
      totalSubmissions: metrics.totalSubmissions, 
      overallAverage: metrics.overallAverage, 
      acknowledgmentStatus: store.findAgreement('faculty_acknowledgment', cycleId, { facultyId: f.id }) ? 'acknowledged' : 'pending_review'
    }; 
  });

  const handleExport = async () => { await exportDeanReport(department, cycleId); };
  const handlePrint = () => { setIsPrintMode(true); setTimeout(() => { window.print(); setIsPrintMode(false); }, 100); };

  const handleSendReminder = async (facultyId: string) => {
    try { await store.sendReminder(facultyId, cycleId); }
    catch (err) { alert(errorMessage(err)); }
  };

  if (isPrintMode) return (<DeanPrintReport department={department} cycleName={viewingCycle?.displayName || 'Current Academic Term'} criteria={criteria} cycleId={cycleId} />);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#002366' }}>Department Overview</h2>
          <p className="text-sm" style={{ color: '#4B5563' }}>{department} Department • {user?.displayName}</p>
          {viewingCycle && <p className="text-xs mt-1" style={{ color: '#B87333' }}>Viewing: {viewingCycle.displayName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" data-export-menu>
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#2E8B57' }}>
              <Download size={14} />Export Reports <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg z-50" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D5D8DC' }}>
                <div className="py-1">
                  <button onClick={async () => { await handleExport(); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileSpreadsheet size={16} style={{ color: '#2E8B57' }} />
                    <div>
                      <div className="font-medium">Department Report (Excel)</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Overview with all departments</div>
                    </div>
                  </button>
                  <button onClick={async () => { await exportDepartmentFacultyReport(department, cycleId); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileSpreadsheet size={16} style={{ color: '#B87333' }} />
                    <div>
                      <div className="font-medium">Faculty Report (Excel)</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Detailed faculty metrics</div>
                    </div>
                  </button>
                  <button onClick={async () => { await exportDepartmentPerformancePDF(department, cycleId); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileText size={16} style={{ color: '#002366' }} />
                    <div>
                      <div className="font-medium">Performance Summary (PDF)</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Professional format with charts</div>
                    </div>
                  </button>
                  <button onClick={() => { handlePrint(); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <Printer size={16} style={{ color: '#6B7280' }} />
                    <div>
                      <div className="font-medium">Print Report</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Browser print dialog</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="rounded-xl p-3 flex items-center gap-2" style={{ backgroundColor: '#F5E6D3', border: '1px solid #B87333' }}>
        <Shield size={16} style={{ color: '#B87333' }} />
        <p className="text-xs"><strong>Privacy Notice:</strong> Department-level aggregated metrics and individual faculty data are shown for oversight purposes.</p>
      </div>

      {/* HR / QA Release Status */}
      {!isAdminReleased && (
        <div className="rounded-xl p-5 flex items-center gap-3" style={{ backgroundColor: '#FEF3C7', border: '2px solid #B87333' }}>
          <Shield size={24} style={{ color: '#B87333' }} />
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: '#B87333' }}>⏳ Pending HR / QA Release</p>
            <p className="text-xs mt-1" style={{ color: '#4B5563' }}>HR / Quality Assurance has not yet released results for this Academic Term. Department metrics become available for your oversight review as soon as the release is signed.</p>
          </div>
        </div>
      )}

      {/* Dean's Oversight Sign-Off — 7-day review window; faculty access is not gated on it */}
      {isAdminReleased && !isDeanReleased && oversightDeadline && (
        <div className="rounded-xl p-5" style={{ backgroundColor: oversightDeadline.isOverdue ? '#FEE2E2' : '#EDEBE8', border: `2px solid ${oversightDeadline.isOverdue ? '#C41E3A' : '#002366'}` }}>
          <div className="flex items-center gap-3 mb-4">
            {oversightDeadline.isOverdue ? <XCircle size={24} style={{ color: '#C41E3A' }} /> : <Clock size={24} style={{ color: '#002366' }} />}
            <div>
              <p className="font-bold text-sm" style={{ color: oversightDeadline.isOverdue ? '#C41E3A' : '#002366' }}>
                {oversightDeadline.isOverdue ? "⚠️ Dean's Oversight Sign-Off Overdue" : "📋 Dean's Oversight Sign-Off"}
              </p>
              <p className="text-xs mt-1" style={{ color: '#4B5563' }}>
                {oversightDeadline.isOverdue
                  ? `The ${DEAN_OVERSIGHT_WINDOW_DAYS}-day oversight window ended ${Math.abs(oversightDeadline.daysRemaining)} day(s) ago. Please complete your review and sign.`
                  : `${oversightDeadline.daysRemaining} day(s) remain in the ${DEAN_OVERSIGHT_WINDOW_DAYS}-day oversight window (due ${oversightDeadline.deadline.toLocaleDateString()}). Faculty already have access to their own results.`}
              </p>
            </div>
          </div>
          <button onClick={() => setShowDeanSignModal(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>
            Review & Sign Oversight Sign-Off
          </button>
        </div>
      )}

      {/* Dean's Oversight Sign-Off completed */}
      {isAdminReleased && isDeanReleased && (
        <div className="rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap" style={{ backgroundColor: '#D1FAE5', border: '1px solid #2E8B57' }}>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} style={{ color: '#2E8B57' }} />
            <p className="text-xs font-medium" style={{ color: '#2E8B57' }}>
              ✓ Dean's Oversight Sign-Off completed by {deanSignOff?.signedOffBy}{deanSignOff ? ` on ${new Date(deanSignOff.signedOffAt).toLocaleDateString()}` : ''}.
            </p>
          </div>
          {deanSignOffAgreement && (
            <button onClick={() => store.downloadAgreementReceipt(deanSignOffAgreement)} className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#2E8B57' }}>
              <Download size={12} />Signed Receipt
            </button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      {isAdminReleased && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} style={{ color: '#002366' }} />
              <span className="text-xs font-medium" style={{ color: '#4B5563' }}>Total Submissions</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#002366' }}>{deptMetrics.totalSubmissions}</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <div className="flex items-center gap-2 mb-1">
              <Award size={16} style={{ color: '#2E8B57' }} />
              <span className="text-xs font-medium" style={{ color: '#4B5563' }}>Dept Average</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#2E8B57' }}>{deptMetrics.institutionAverage.toFixed(2)}</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} style={{ color: '#B87333' }} />
              <span className="text-xs font-medium" style={{ color: '#4B5563' }}>Faculty Count</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#B87333' }}>{deptMetrics.totalFaculty}</p>
          </div>
          <div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={16} style={{ color: '#C41E3A' }} />
              <span className="text-xs font-medium" style={{ color: '#4B5563' }}>Acknowledged</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#C41E3A' }}>{acknowledged}/{faculty.length}</p>
          </div>
        </div>
      )}

      {/* Early Warning Indicators */}
      {isAdminReleased && earlyWarnings.length > 0 && (
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#FEE2E2', border: '1px solid #C41E3A' }}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#C41E3A' }}>
            <AlertTriangle size={16} />Early Warning Indicators
          </h3>
          <div className="space-y-2">
            {earlyWarnings.slice(0, 5).map((warning, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" 
                        style={{ backgroundColor: warning.severity === 'high' ? '#C41E3A' : warning.severity === 'medium' ? '#B87333' : '#9CA3AF' }}>
                    {warning.severity === 'high' ? '!' : warning.severity === 'medium' ? '⚠' : '•'}
                  </span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{warning.name}</p>
                    <p className="text-xs" style={{ color: '#4B5563' }}>{warning.type}: {warning.message}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedFacultyId(warning.facultyId)} className="px-2 py-1 rounded text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>
                  <Eye size={12} /> View
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparative Analytics */}
      {isAdminReleased && comparativeAnalytics && (
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#002366' }}>
            <TrendingUp size={16} style={{ color: '#B87333' }} />Comparative Analytics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
              <p className="text-xs" style={{ color: '#4B5563' }}>Department Average</p>
              <p className="text-xl font-bold" style={{ color: '#002366' }}>{comparativeAnalytics.departmentAverage.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
              <p className="text-xs" style={{ color: '#4B5563' }}>Institution Average</p>
              <p className="text-xl font-bold" style={{ color: '#002366' }}>{comparativeAnalytics.institutionAverage.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: comparativeAnalytics.difference >= 0 ? '#D1FAE5' : '#FEE2E2' }}>
              <p className="text-xs" style={{ color: '#4B5563' }}>Difference</p>
              <p className="text-xl font-bold" style={{ color: comparativeAnalytics.difference >= 0 ? '#2E8B57' : '#C41E3A' }}>
                {comparativeAnalytics.difference >= 0 ? '+' : ''}{comparativeAnalytics.difference.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#002366' }}>
                  <th className="text-left px-4 py-2 text-white font-medium">Rank</th>
                  <th className="text-left px-4 py-2 text-white font-medium">Faculty</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Average</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Percentile</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {comparativeAnalytics.facultyRankings.map((f, i) => (
                  <tr key={f.facultyId} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}>
                    <td className="px-4 py-2 font-medium">#{f.rank}</td>
                    <td className="px-4 py-2">{f.name}</td>
                    <td className="px-4 py-2 text-center font-bold" style={{ color: f.average >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>
                      {f.average.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" 
                            style={{ 
                              backgroundColor: f.percentile === 'Top 25%' ? '#D1FAE5' : f.percentile === 'Bottom 25%' ? '#FEE2E2' : '#F5E6D3',
                              color: f.percentile === 'Top 25%' ? '#2E8B57' : f.percentile === 'Bottom 25%' ? '#C41E3A' : '#B87333'
                            }}>
                        {f.percentile}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => setSelectedFacultyId(f.facultyId)} className="px-2 py-1 rounded text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Faculty Performance Summary */}
      {isAdminReleased && (
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Faculty Performance Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#002366' }}>
                  <th className="text-left px-4 py-2 text-white font-medium">Faculty</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Submissions</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Average</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Status</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {facultyPerformance.map((f, i) => (
                  <tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}>
                    <td className="px-4 py-2 font-medium">{f.name}</td>
                    <td className="px-4 py-2 text-center">{f.totalSubmissions}</td>
                    <td className="px-4 py-2 text-center font-bold" style={{ color: f.totalSubmissions < THRESHOLD ? '#9CA3AF' : f.overallAverage >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>
                      {f.totalSubmissions < THRESHOLD ? '—' : f.overallAverage.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" 
                            style={{ backgroundColor: f.acknowledgmentStatus === 'acknowledged' ? '#D1FAE5' : '#F5E6D3', color: f.acknowledgmentStatus === 'acknowledged' ? '#2E8B57' : '#B87333' }}>
                        {f.acknowledgmentStatus === 'acknowledged' ? '✓ Ack' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => setSelectedFacultyId(f.id)} className="px-2 py-1 rounded text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Faculty Drilldown Modal */}
      {facultyDrilldown && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedFacultyId(null)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl p-6" style={{ backgroundColor: '#EDEBE8' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#002366' }}>
              Faculty Drilldown: {facultyDrilldown.faculty.name}
            </h3>
            
            {/* Metrics Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                <p className="text-xs" style={{ color: '#4B5563' }}>Total Submissions</p>
                <p className="text-xl font-bold" style={{ color: '#002366' }}>{facultyDrilldown.metrics.totalSubmissions}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                <p className="text-xs" style={{ color: '#4B5563' }}>Overall Average</p>
                <p className="text-xl font-bold" style={{ color: '#002366' }}>{facultyDrilldown.metrics.overallAverage.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                <p className="text-xs" style={{ color: '#4B5563' }}>Courses Taught</p>
                <p className="text-xl font-bold" style={{ color: '#002366' }}>{facultyDrilldown.courseBreakdown.length}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                <p className="text-xs" style={{ color: '#4B5563' }}>Status</p>
                <p className="text-sm font-bold" style={{ color: facultyDrilldown.acknowledgmentStatus === 'acknowledged' ? '#2E8B57' : '#B87333' }}>
                  {facultyDrilldown.acknowledgmentStatus.replace(/_/g, ' ')}
                </p>
              </div>
            </div>

            {/* Criteria Breakdown */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Criteria Breakdown</h4>
              <div className="space-y-3">
                {facultyDrilldown.criteriaBreakdown.map((crit) => (
                  <div key={crit.criterionId} className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{crit.criterionName}</p>
                      <p className="text-sm font-bold" style={{ color: crit.average >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>
                        {crit.average.toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {crit.subQuestions.map((sq) => (
                        <div key={sq.subQuestionId} className="flex items-center justify-between text-xs">
                          <span style={{ color: '#4B5563' }}>{sq.text}</span>
                          <span className="font-bold" style={{ color: sq.average >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>
                            {sq.average.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Course Breakdown */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Course Performance</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#002366' }}>
                      <th className="text-left px-4 py-2 text-white font-medium">Course</th>
                      <th className="text-center px-4 py-2 text-white font-medium">Submissions</th>
                      <th className="text-center px-4 py-2 text-white font-medium">Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facultyDrilldown.courseBreakdown.map((course, i) => (
                      <tr key={course.courseId} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}>
                        <td className="px-4 py-2 font-medium">{course.courseId}</td>
                        <td className="px-4 py-2 text-center">{course.submissions}</td>
                        <td className="px-4 py-2 text-center font-bold" style={{ color: course.average >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>
                          {course.average.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Feedback Themes */}
            {facultyDrilldown.feedbackThemes.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3" style={{ color: '#002366' }}>Feedback Themes</h4>
                <div className="space-y-2">
                  {facultyDrilldown.feedbackThemes.map((theme, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: '#F8F6F1' }}>
                      <span className="text-sm">{theme.theme}</span>
                      <span className="text-xs font-bold" style={{ color: '#B87333' }}>{theme.count} ({theme.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedFacultyId(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledgment Tracking */}
      {isAdminReleased && acknowledgmentTracking.length > 0 && (
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#002366' }}>
            <Clock size={16} style={{ color: '#B87333' }} />Acknowledgment Tracking
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#002366' }}>
                  <th className="text-left px-4 py-2 text-white font-medium">Faculty</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Status</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Days Since Ack</th>
                  <th className="text-center px-4 py-2 text-white font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {acknowledgmentTracking.map((track, i) => (
                  <tr key={track.facultyId} style={{ backgroundColor: i % 2 === 0 ? '#EDEBE8' : '#F8F6F1' }}>
                    <td className="px-4 py-2 font-medium">{track.name}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" 
                            style={{ 
                              backgroundColor: track.status === 'acknowledged' ? '#D1FAE5' : '#F5E6D3',
                              color: track.status === 'acknowledged' ? '#2E8B57' : '#B87333'
                            }}>
                        {track.status === 'acknowledged' ? '✓ Ack' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {track.daysSinceAcknowledgment !== null ? `${track.daysSinceAcknowledgment} days` : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {track.needsReminder && (
                        <button onClick={() => handleSendReminder(track.facultyId)} className="px-2 py-1 rounded text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#B87333' }}>
                          Send Reminder
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Department Training Needs Analysis (cached server snapshot) */}
      {isAdminReleased && (tna || tnaError) && (
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8', border: `1px solid ${tna && tna.snapshot.deficits.length > 0 ? '#C41E3A' : '#D5D8DC'}` }}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#002366' }}>
              <AlertTriangle size={16} style={{ color: '#C41E3A' }} />Department Training Needs Analysis
            </h3>
            {tna && <span className="text-[10px] flex items-center gap-1" style={{ color: '#6B7280' }}><Database size={11} />{tna.cached ? 'Cached snapshot' : 'Snapshot generated'} · {new Date(tna.generatedAt).toLocaleString()}</span>}
          </div>
          {tnaError && <p className="text-xs" style={{ color: '#C41E3A' }}>{tnaError}</p>}
          {tna && tna.snapshot.deficits.length === 0 && <p className="text-sm italic" style={{ color: '#6B7280' }}>All criteria meet the {BENCHMARK.toFixed(1)}/5.0 benchmark for this Academic Term.</p>}
          {tna && tna.snapshot.deficits.length > 0 && (
            <>
              <div className="space-y-2 mb-4">
                {tna.snapshot.deficits.map(d => (
                  <div key={d.criterionId} className="p-3 rounded-lg" style={{ backgroundColor: '#FFFFFF' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{d.criterionName}</span>
                      <span className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: d.severity === 'critical' ? '#FEE2E2' : d.severity === 'high' ? '#FEF3C7' : '#F5E6D3', color: d.severity === 'critical' ? '#C41E3A' : '#B87333' }}>{d.severity}</span>
                        <span className="text-sm font-bold" style={{ color: '#C41E3A' }}>{d.average.toFixed(2)}</span>
                      </span>
                    </div>
                    {d.subQuestionDeficits.length > 0 && (
                      <ul className="mt-1 text-[11px] space-y-0.5" style={{ color: '#4B5563' }}>
                        {d.subQuestionDeficits.map(i => <li key={i.subQuestionId}>→ {i.subQuestionText} ({i.average.toFixed(2)})</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {([['Immediate', tna.snapshot.recommendations.immediate], ['Short-term', tna.snapshot.recommendations.shortTerm], ['Long-term', tna.snapshot.recommendations.longTerm]] as const).map(([label, items]) => (
                  <div key={label} className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}>
                    <p className="font-semibold mb-1" style={{ color: '#002366' }}>{label}</p>
                    <ul className="space-y-1 list-disc pl-4">{items.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {showDeanSignModal && cycleId && (
        <AgreementSignModal
          type="dean_oversight_signoff"
          cycleId={cycleId}
          allowComments
          description={`Confirm your oversight review of the ${department} department's results. This sign-off does not affect faculty access.`}
          onSign={(signature, comments) => store.deanOversightSignOff(cycleId, signature, comments)}
          onClose={() => setShowDeanSignModal(false)}
        />
      )}
    </div>
  );
}

```

## src/pages/FacultyDashboard.tsx
```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { store, BENCHMARK, THRESHOLD } from '../store';
import { useAuth } from '../auth';
import { exportFacultyReport } from '../utils/excel';
import { exportFacultyPDF } from '../utils/pdf';
import type { FacultyMetrics, Criterion, SubQuestion } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, PieChart, Pie } from 'recharts';
import { RefreshCw, Shield, BarChart3, MessageSquare, TrendingUp, BookOpen, ChevronDown, ChevronUp, Award, Printer, CheckCircle, Download, FileSpreadsheet, FileText, Lightbulb } from 'lucide-react';
import FacultyPrintReport from '../components/FacultyPrintReport';
import AgreementSignModal from '../components/AgreementSignModal';
import { buildIndividualRecommendations } from '../utils/tnaEngine';

// Ordered to match donutData (5★ first).
const STAR_COLORS = ['#10B981', '#3B82F6', '#94A3B8', '#F59E0B', '#DC2626'];

interface FacultyDashboardProps { viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function FacultyDashboard({ viewingCycleId, onViewingCycleChange }: FacultyDashboardProps) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<FacultyMetrics | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [subQuestions, setSubQuestions] = useState<SubQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState('all');
  const [showFeedback, setShowFeedback] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [pieChartView, setPieChartView] = useState<string>('overall');
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const facultyId = user?.facultyId || '';
  const faculty = store.getFacultyById(facultyId);
  const facultyCourses = store.getFacultyCourses(facultyId);
  const activeCycle = store.getActiveCycle();
  const cycleId = viewingCycleId || activeCycle?.id;
  const allCycles = store.getCycles();
  const viewingCycle = allCycles.find(c => c.id === cycleId);

  const loadData = useCallback(() => {
    setLoading(true); setCriteria(store.getCriteria()); setSubQuestions(store.getSubQuestions());
    const courseId = courseFilter === 'all' ? undefined : courseFilter;
    setMetrics(store.getFacultyMetrics(facultyId, cycleId, courseId)); setLoading(false);
  }, [courseFilter, cycleId, facultyId]);

  useEffect(() => { loadData(); const unsubs = [store.subscribe('submission_added', loadData), store.subscribe('criteria_changed', loadData), store.subscribe('acknowledgment_changed', loadData), store.subscribe('cycle_changed', loadData)]; return () => unsubs.forEach(u => u()); }, [loadData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-export-menu]')) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showExportMenu]);

  const handlePrint = () => { setIsPrintMode(true); setTimeout(() => { window.print(); setIsPrintMode(false); }, 100); };

  const performanceSummary = metrics ? (() => {
    const lowCriteria = criteria.filter(c => (metrics.criteriaAverages[c.id] || 0) < BENCHMARK);
    const highCriteria = criteria.filter(c => (metrics.criteriaAverages[c.id] || 0) >= 4);
    let summary = `Based on ${metrics.totalSubmissions} evaluations, your overall performance is ${metrics.overallAverage.toFixed(2)}/5.0. `;
    if (highCriteria.length > 0) summary += `You excel in ${highCriteria.map(c => c.name).join(', ')}. `;
    if (lowCriteria.length > 0) summary += `Areas for improvement: ${lowCriteria.map(c => c.name).join(', ')} scored below the ${BENCHMARK.toFixed(1)}/5.0 benchmark. `;
    return summary;
  })() : '';

  const criteriaBarData = criteria.map(c => ({ name: c.name, score: metrics?.criteriaAverages[c.id] || 0 }));
  const getScoreDistribution = (courseId?: string) => {
    if (!metrics) return [0, 0, 0, 0, 0];
    if (!courseId || courseId === 'all' || courseId === 'overall') return metrics.scoreDistribution;
    const evals = store.getEvaluationsForFaculty(facultyId, cycleId, courseId);
    const dist = [0, 0, 0, 0, 0];
    evals.forEach(ev => { Object.values(ev.ratings).forEach(rating => { if (rating >= 1 && rating <= 5) dist[rating - 1]++; }); });
    return dist;
  };
  const currentDistribution = getScoreDistribution(pieChartView);
  const totalRatings = currentDistribution.reduce((a, b) => a + b, 0);
  const currentAverage = totalRatings > 0 ? currentDistribution.reduce((sum, count, idx) => sum + count * (idx + 1), 0) / totalRatings : 0;
  const donutData = [{ name: '5★', value: currentDistribution[4], percentage: totalRatings > 0 ? ((currentDistribution[4] / totalRatings) * 100).toFixed(1) : '0' }, { name: '4★', value: currentDistribution[3], percentage: totalRatings > 0 ? ((currentDistribution[3] / totalRatings) * 100).toFixed(1) : '0' }, { name: '3★', value: currentDistribution[2], percentage: totalRatings > 0 ? ((currentDistribution[2] / totalRatings) * 100).toFixed(1) : '0' }, { name: '2★', value: currentDistribution[1], percentage: totalRatings > 0 ? ((currentDistribution[1] / totalRatings) * 100).toFixed(1) : '0' }, { name: '1★', value: currentDistribution[0], percentage: totalRatings > 0 ? ((currentDistribution[0] / totalRatings) * 100).toFixed(1) : '0' }];
  const breakdownData = criteria.map(c => ({ criterion: c, subQuestions: subQuestions.filter(sq => sq.criterionId === c.id).map(sq => ({ sq, score: metrics?.subQuestionAverages[sq.id] || 0 })) }));
  const belowThreshold = !metrics || metrics.totalSubmissions < THRESHOLD;
  const isAdminReleased = store.isCycleAdminReleased(cycleId);
  const ackAgreement = store.findAgreement('faculty_acknowledgment', cycleId, { facultyId });
  const isAcknowledged = !!ackAgreement;
  const insights = metrics ? buildIndividualRecommendations(metrics, criteria, store.getTNATemplates()) : [];

  if (isPrintMode && metrics) return (<FacultyPrintReport facultyId={facultyId} metrics={metrics} criteria={criteria} subQuestions={subQuestions} cycleName={viewingCycle?.displayName || 'Current Academic Term'} cycleId={cycleId} />);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-2xl font-bold" style={{ color: '#002366' }}>{faculty?.name}</h2><p className="text-sm" style={{ color: '#4B5563' }}>{faculty?.title} • {faculty?.department}</p>{viewingCycle && <p className="text-xs mt-1" style={{ color: '#B87333' }}>Viewing: {viewingCycle.displayName}</p>}</div>
        <div className="flex items-center gap-2">
          <div className="relative" data-export-menu>
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: '#2E8B57' }}>
              <Download size={14} />Export Reports <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg z-50" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D5D8DC' }}>
                <div className="py-1">
                  <button onClick={async () => { await exportFacultyReport(facultyId, cycleId); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileSpreadsheet size={16} style={{ color: '#2E8B57' }} />
                    <div>
                      <div className="font-medium">Export Excel Report</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Complete data with all sheets</div>
                    </div>
                  </button>
                  <button onClick={async () => { await exportFacultyPDF(facultyId, cycleId); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <FileText size={16} style={{ color: '#B87333' }} />
                    <div>
                      <div className="font-medium">Export PDF Report</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Professional format with charts</div>
                    </div>
                  </button>
                  <button onClick={() => { handlePrint(); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50" style={{ color: '#1A1A1A' }}>
                    <Printer size={16} style={{ color: '#002366' }} />
                    <div>
                      <div className="font-medium">Print Report</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>Browser print dialog</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
        </div>
      </div>
      {!isAdminReleased && (<div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: '#FEF3C7', border: '2px solid #B87333' }}><Shield size={20} style={{ color: '#B87333' }} /><div><p className="font-semibold text-sm" style={{ color: '#B87333' }}>⏳ Pending HR / QA Release</p><p className="text-xs" style={{ color: '#4B5563' }}>Your results for this Academic Term are awaiting release by HR / Quality Assurance. They become available to you immediately once HR / QA signs the release.</p></div></div>)}
      {isAdminReleased && (<div className="flex items-center gap-2"><label className="text-sm font-medium">Course/Subject:</label><select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}><option value="all">All Courses/Subjects</option>{facultyCourses.map(c => <option key={c} value={c}>{c}</option>)}</select></div>)}
      {belowThreshold && isAdminReleased && (<div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#F8F6F1', border: '2px dashed #B87333' }}><Shield size={48} className="mx-auto mb-3" style={{ color: '#B87333' }} /><h3 className="text-lg font-semibold mb-2" style={{ color: '#002366' }}>Insufficient Data</h3><p className="text-sm" style={{ color: '#4B5563' }}>{metrics ? `${THRESHOLD - metrics.totalSubmissions} more submissions needed` : 'Loading...'}</p></div>)}
      {metrics && !belowThreshold && isAdminReleased && (<><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><div className="flex items-center gap-2 mb-1"><MessageSquare size={16} style={{ color: '#B87333' }} /><span className="text-xs font-medium" style={{ color: '#4B5563' }}>Total Submissions</span></div><p className="text-2xl font-bold" style={{ color: '#002366' }}>{metrics.totalSubmissions}</p></div><div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><div className="flex items-center gap-2 mb-1"><TrendingUp size={16} style={{ color: '#2E8B57' }} /><span className="text-xs font-medium" style={{ color: '#4B5563' }}>Overall Average</span></div><p className="text-2xl font-bold" style={{ color: '#002366' }}>{metrics.overallAverage.toFixed(2)}</p><p className="text-xs" style={{ color: '#4B5563' }}>out of 5.0</p></div><div className="rounded-xl p-4 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><div className="flex items-center gap-2 mb-1"><BookOpen size={16} style={{ color: '#002366' }} /><span className="text-xs font-medium" style={{ color: '#4B5563' }}>Courses/Subjects Evaluated</span></div><p className="text-2xl font-bold" style={{ color: '#002366' }}>{Object.keys(metrics.courseBreakdown).length}</p></div></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#002366' }}><BarChart3 size={16} style={{ color: '#B87333' }} />Criteria Performance (avg / 5.0)</h3><ResponsiveContainer width="100%" height={250}><BarChart data={criteriaBarData} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#D5D8DC" /><XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#1A1A1A' }} width={100} /><Tooltip contentStyle={{ backgroundColor: '#EDEBE8', border: '1px solid #D5D8DC', borderRadius: '8px' }} /><ReferenceLine x={BENCHMARK} stroke="#C41E3A" strokeDasharray="5 5" strokeWidth={2} label={{ value: `${BENCHMARK} Benchmark`, position: 'top', fill: '#C41E3A', fontSize: 10 }} /><Bar dataKey="score" radius={[0, 4, 4, 0]}>{criteriaBarData.map((entry, i) => (<Cell key={i} fill={entry.score >= BENCHMARK ? '#2E8B57' : '#C41E3A'} />))}</Bar></BarChart></ResponsiveContainer><button onClick={() => setShowBreakdown(!showBreakdown)} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ backgroundColor: '#F5E6D3', color: '#B87333' }}>{showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showBreakdown ? 'Hide' : 'Show'} Performance Indicator Breakdown</button>{showBreakdown && (<div className="mt-3 space-y-3">{breakdownData.map(({ criterion, subQuestions: sqs }) => (<div key={criterion.id} className="rounded-lg p-3" style={{ backgroundColor: '#F8F6F1' }}><p className="text-xs font-bold mb-2" style={{ color: '#002366' }}>{criterion.name} (Avg: {(metrics.criteriaAverages[criterion.id] || 0).toFixed(2)})</p><div className="space-y-1.5">{sqs.map(({ sq, score }) => (<div key={sq.id} className="flex items-center gap-2"><span className="text-[10px] flex-1 truncate" style={{ color: '#4B5563' }}>{sq.text}</span><div className="w-20 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#D5D8DC' }}><div className="h-full rounded-full" style={{ width: `${(score / 5) * 100}%`, backgroundColor: score >= BENCHMARK ? '#2E8B57' : '#C41E3A' }} /></div><span className="text-[10px] font-bold w-8 text-right" style={{ color: score >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{score.toFixed(2)}</span></div>))}</div></div>))}</div>)}</div>
        <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#002366' }}><BarChart3 size={16} style={{ color: '#B87333' }} />Score Distribution</h3><select value={pieChartView} onChange={e => setPieChartView(e.target.value)} className="px-2 py-1 rounded-lg border text-xs outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}><option value="overall">Overall</option>{facultyCourses.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div className="flex items-center gap-4"><div className="relative"><ResponsiveContainer width={180} height={180}><PieChart><Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>{donutData.map((_, i) => (<Cell key={i} fill={STAR_COLORS[i]} />))}</Pie></PieChart></ResponsiveContainer><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold" style={{ color: '#002366' }}>{currentAverage.toFixed(1)}</span><span className="text-[10px]" style={{ color: '#4B5563' }}>avg score</span></div></div><div className="flex-1 space-y-1.5">{donutData.map((d, i) => (<div key={i} className="flex items-center gap-2 text-xs"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STAR_COLORS[i] }} /><span>{d.name}</span><span className="font-bold">{d.value}</span><span style={{ color: '#9CA3AF' }}>({d.percentage}%)</span></div>))}</div></div></div>
      </div>
      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#F8F6F1' }}><h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: '#002366' }}><TrendingUp size={16} style={{ color: '#B87333' }} />Performance Summary</h3><p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{performanceSummary}</p></div>

      {insights.length > 0 && (<div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8', border: '1px solid #B87333' }}><h3 className="text-sm font-semibold flex items-center gap-2 mb-1" style={{ color: '#002366' }}><Lightbulb size={16} style={{ color: '#B87333' }} />Professional Development Insights</h3><p className="text-[11px] mb-3" style={{ color: '#6B7280' }}>Pre-approved recommendations for criteria below the {BENCHMARK.toFixed(1)} benchmark. Discuss a development plan with your Dean.</p><div className="space-y-3">{insights.map(r => (<div key={r.criterionId} className="p-3 rounded-lg" style={{ backgroundColor: '#F8F6F1' }}><p className="text-xs font-bold mb-1" style={{ color: '#C41E3A' }}>{r.criterionName} — {r.average.toFixed(2)} / 5.0</p><ul className="text-xs space-y-1 list-disc pl-4" style={{ color: '#1A1A1A' }}>{r.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}</ul></div>))}</div></div>)}

      <div className="rounded-xl p-5 shadow-sm" style={{ backgroundColor: '#EDEBE8', border: `2px solid ${isAcknowledged ? '#2E8B57' : '#B87333'}` }}><div className="flex items-center justify-between flex-wrap gap-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isAcknowledged ? '#D1FAE5' : '#F5E6D3' }}>{isAcknowledged ? <CheckCircle size={20} style={{ color: '#2E8B57' }} /> : <Award size={20} style={{ color: '#B87333' }} />}</div><div><p className="text-sm font-semibold" style={{ color: '#002366' }}>Evaluation Acknowledgment</p><p className="text-xs" style={{ color: '#4B5563' }}>Status: <span className="font-medium" style={{ color: isAcknowledged ? '#2E8B57' : '#B87333' }}>{isAcknowledged ? `🟢 Acknowledged ${new Date(ackAgreement!.signedAt).toLocaleDateString()}` : '🟡 Pending'}</span></p>{ackAgreement && <p className="text-[10px] font-mono mt-0.5" style={{ color: '#6B7280' }}>{ackAgreement.trackingId}</p>}</div></div><div className="flex gap-2">{ackAgreement ? (<button onClick={() => store.downloadAgreementReceipt(ackAgreement)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#2E8B57' }}><Download size={14} />Signed Receipt</button>) : (<button onClick={() => setShowSignModal(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>Sign & Acknowledge</button>)}</div></div></div>
      <div className="rounded-xl shadow-sm" style={{ backgroundColor: '#EDEBE8' }}><button onClick={() => setShowFeedback(!showFeedback)} className="w-full p-4 flex items-center justify-between text-left"><h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#002366' }}><MessageSquare size={16} style={{ color: '#B87333' }} />Student Feedback ({metrics.feedback.length} entries)</h3><span className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: '#F5E6D3', color: '#B87333' }}>{showFeedback ? 'Hide' : 'Show'}</span></button>{showFeedback && (<div className="px-4 pb-4 space-y-2">{metrics.feedback.map((fb, i) => (<div key={i} className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#F8F6F1' }}><p>{fb.feedback}</p><p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Course/Subject: {fb.courseId} • {new Date(fb.submittedAt).toLocaleDateString()}</p></div>))}</div>)}</div></>)}
      {showSignModal && cycleId && (
        <AgreementSignModal
          type="faculty_acknowledgment"
          cycleId={cycleId}
          description="Please review the terms and sign to acknowledge receipt of your evaluation results."
          onSign={signature => store.acknowledgeResults(cycleId, signature)}
          onClose={() => setShowSignModal(false)}
        />
      )}
    </div>
  );
}

```

## src/pages/StudentDashboard.tsx
```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { store } from '../store';
import { useAuth } from '../auth';
import { errorMessage } from '../api/client';
import { detectPII } from '../utils/pii';
import type { EvaluationCycle, Criterion, SubQuestion, Program, Subject } from '../types';
import { CheckCircle, AlertTriangle, Send, Shield, Eye, BookOpen, User, Clock, GraduationCap } from 'lucide-react';

interface StudentDashboardProps { viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function StudentDashboard(_props: StudentDashboardProps) {
  const { user } = useAuth();
  const studentId = user?.studentId || '';
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [subQuestions, setSubQuestions] = useState<SubQuestion[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [boundFacultyId, setBoundFacultyId] = useState('');
  const [boundFacultyName, setBoundFacultyName] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [piiDetected, setPiiDetected] = useState<string[]>([]);
  const [showPiiWarning, setShowPiiWarning] = useState(true);
  const activeCycle = cycles.find(c => c.status === 'active');

  const loadData = useCallback(() => {
    setCycles(store.getCycles()); setCriteria(store.getCriteria()); setSubQuestions(store.getSubQuestions());
    setPrograms(store.getPrograms()); setAvailableSubjects(store.getAvailableSubjectsForStudent(studentId));
  }, [studentId]);

  useEffect(() => { loadData(); const unsubs = [store.subscribe('criteria_changed', loadData), store.subscribe('cycle_changed', loadData), store.subscribe('submission_added', loadData)]; return () => unsubs.forEach(u => u()); }, [loadData]);
  useEffect(() => { setPiiDetected(detectPII(feedback)); }, [feedback]);

  const subjectsForProgram = selectedProgram ? availableSubjects.filter(s => s.programId === selectedProgram) : [];
  const handleProgramSelect = (programId: string) => { setSelectedProgram(programId); setSelectedSubject(''); setBoundFacultyId(''); setBoundFacultyName(''); setRatings({}); };
  const handleSubjectSelect = (subjectId: string) => { setSelectedSubject(subjectId); const faculty = store.getFacultyBySubject(subjectId); if (faculty) { setBoundFacultyId(faculty.id); setBoundFacultyName(faculty.name); } setRatings({}); };
  const handleRatingChange = (sqId: string, value: string) => { const rating = parseInt(value); if (!isNaN(rating) && rating >= 1 && rating <= 5) setRatings(prev => ({ ...prev, [sqId]: rating })); else if (value === '') setRatings(prev => { const n = { ...prev }; delete n[sqId]; return n; }); };
  const allRated = subQuestions.every(sq => ratings[sq.id] !== undefined);

  const handleSubmit = async () => {
    if (!selectedSubject || !boundFacultyId || !allRated || !activeCycle) return;
    setSubmitting(true); setSubmitResult(null);
    try {
      // Comments are kept verbatim; the server applies automated PII redaction before storage.
      await store.submitEvaluation({ subjectId: selectedSubject, ratings, feedback });
      setSubmitResult({ kind: 'success', message: 'Evaluation submitted successfully! Your response is confidential.' });
      setSelectedProgram(''); setSelectedSubject(''); setBoundFacultyId(''); setBoundFacultyName(''); setRatings({}); setFeedback('');
    } catch (err) {
      setSubmitResult({ kind: 'error', message: errorMessage(err, 'Submission failed. Please try again.') });
    } finally { setSubmitting(false); }
  };

  const subQsByCriterion = criteria.map(c => ({ criterion: c, subQuestions: subQuestions.filter(sq => sq.criterionId === c.id) }));

  return (
    <div className="space-y-6">
      {activeCycle && (<div className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: '#F5E6D3', border: '1px solid #B87333' }}><Clock size={20} style={{ color: '#B87333' }} /><div><p className="font-semibold text-sm" style={{ color: '#002366' }}>Active Academic Term / Semester</p><p className="text-xs">{activeCycle.displayName} — {activeCycle.startDate} to {activeCycle.endDate}</p></div></div>)}
      {!activeCycle && (<div className="rounded-xl p-4 text-sm" style={{ backgroundColor: '#F8F6F1', border: '1px dashed #B87333' }}>There is no Academic Term open for evaluation right now.</div>)}
      {submitResult?.kind === 'success' && (<div role="status" className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: '#D1FAE5', border: '1px solid #2E8B57' }}><CheckCircle size={20} style={{ color: '#2E8B57' }} /><p className="text-sm font-medium" style={{ color: '#2E8B57' }}>{submitResult.message}</p></div>)}
      {submitResult?.kind === 'error' && (<div role="alert" className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: '#FEE2E2', border: '1px solid #C41E3A' }}><AlertTriangle size={20} style={{ color: '#C41E3A' }} /><p className="text-sm font-medium" style={{ color: '#C41E3A' }}>{submitResult.message}</p></div>)}
      <div className="rounded-xl shadow-md p-6" style={{ backgroundColor: '#EDEBE8' }}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#002366' }}><Shield size={22} style={{ color: '#B87333' }} />Submit Evaluation</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div><label className="block text-sm font-medium mb-1"><GraduationCap size={14} className="inline mr-1" style={{ color: '#B87333' }} />1. Select Program</label><select value={selectedProgram} onChange={e => handleProgramSelect(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}><option value="">-- Choose your program --</option>{programs.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}</select></div>
          <div><label className="block text-sm font-medium mb-1"><BookOpen size={14} className="inline mr-1" style={{ color: '#B87333' }} />2. Select Course/Subject</label><select value={selectedSubject} onChange={e => handleSubjectSelect(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} disabled={!selectedProgram}><option value="">-- Choose a course/subject --</option>{subjectsForProgram.map(s => (<option key={s.id} value={s.id}>{s.code} - {s.name}</option>))}</select>{!selectedProgram && <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Select a program first</p>}{selectedProgram && subjectsForProgram.length === 0 && <p className="text-xs mt-1" style={{ color: '#2E8B57' }}>✓ All courses/subjects evaluated!</p>}</div>
          <div><label className="block text-sm font-medium mb-1"><User size={14} className="inline mr-1" style={{ color: '#B87333' }} />3. Assigned Professor</label><input type="text" value={boundFacultyName} disabled className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ backgroundColor: '#D5D8DC', borderColor: '#D5D8DC', color: boundFacultyName ? '#1A1A1A' : '#9CA3AF' }} placeholder="Select a subject first..." />{boundFacultyName && <p className="text-xs mt-1" style={{ color: '#2E8B57' }}>✓ Professor locked</p>}</div>
        </div>
        {selectedSubject && boundFacultyId && (<div className="mb-4 flex items-center gap-1 text-sm" style={{ color: '#1A1A1A' }}><Eye size={14} style={{ color: '#B87333' }} />Rate each Performance Indicator on a scale of 1–5 (1 = Poor, 2 = Needs Improvement, 3 = Good, 4 = Very Good, 5 = Excellent)</div>)}
        {selectedSubject && boundFacultyId && (<div className="space-y-4 mb-6">{subQsByCriterion.map(({ criterion, subQuestions: sqs }) => (<div key={criterion.id} className="rounded-lg p-3" style={{ backgroundColor: '#F8F6F1' }}><h4 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#002366' }}>{criterion.name}</h4><div className="space-y-2">{sqs.map(sq => (<div key={sq.id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded"><div className="flex items-center gap-2 flex-1 min-w-0"><span className="text-xs" style={{ color: '#1A1A1A' }}>{sq.text}</span></div><select aria-label={sq.text} value={ratings[sq.id] || ''} onChange={e => handleRatingChange(sq.id, e.target.value)} className="px-2 py-1 rounded border text-sm outline-none min-w-[80px]" style={{ backgroundColor: '#EDEBE8', borderColor: '#D5D8DC' }}><option value="">--</option>{[1, 2, 3, 4, 5].map(n => (<option key={n} value={n}>{n}</option>))}</select></div>))}</div></div>))}</div>)}
        {selectedSubject && boundFacultyId && (<div className="mb-6"><label className="block text-sm font-medium mb-1">Additional Feedback (Optional)</label><textarea value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={2000} className="w-full px-3 py-2.5 rounded-lg border outline-none resize-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} rows={4} placeholder="Share your thoughts..." /><p className="text-[10px] mt-1" style={{ color: '#6B7280' }}>Your comment is shown to the professor exactly as written. Names, emails, phone numbers, IDs and links are automatically redacted.</p>{piiDetected.length > 0 && showPiiWarning && (<div className="mt-2 p-3 rounded-lg flex items-start gap-2" style={{ backgroundColor: '#FEF3C7', border: '1px solid #B87333' }}><AlertTriangle size={16} style={{ color: '#B87333' }} className="flex-shrink-0 mt-0.5" /><div className="flex-1"><p className="text-xs font-medium" style={{ color: '#B87333' }}>Potential PII detected: {piiDetected.join(', ')}</p><p className="text-xs mt-1" style={{ color: '#4B5563' }}>This will be automatically redacted.</p></div><button onClick={() => setShowPiiWarning(false)} className="text-xs underline" style={{ color: '#B87333' }}>Dismiss</button></div>)}</div>)}
        {selectedSubject && boundFacultyId && (<button onClick={handleSubmit} disabled={!allRated || submitting} className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: '#002366' }}>{submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send size={18} />Submit Confidential Evaluation</>}</button>)}
      </div>
    </div>
  );
}

```

## src/components/Login.tsx
```tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api/client';
import { LogIn, Shield, AlertCircle, Calendar } from 'lucide-react';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  useEffect(() => {
    api<{ displayName: string | null }>('/public/active-term').then(r => setActiveTerm(r.displayName)).catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #D5D8DC 0%, #EDEBE8 100%)' }}>
      <div className="w-full max-w-md">
        {activeTerm && (
          <div className="mb-4 rounded-xl p-3 flex items-center gap-2 shadow-sm" style={{ backgroundColor: '#EDEBE8', border: '1px solid #B87333' }}>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <Calendar size={16} style={{ color: '#B87333' }} className="flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#B87333' }}>Current Academic Term / Semester</p>
              <p className="text-sm font-semibold" style={{ color: '#002366' }}>{activeTerm}</p>
            </div>
          </div>
        )}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #002366, #003399)', border: '3px solid #B87333' }}>
            <span className="text-4xl font-bold" style={{ fontFamily: 'Georgia, serif', color: '#B87333' }}>W</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#002366' }}>FES</h1>
          <p className="text-sm" style={{ color: '#1A1A1A' }}>Faculty Evaluation System</p>
        </div>
        <div className="rounded-xl shadow-lg p-8" style={{ backgroundColor: '#EDEBE8' }}>{children}</div>
        <p className="text-[10px] text-center mt-4" style={{ color: '#6B7280' }}>Protected under RA 10173 (Data Privacy Act of 2012). Unauthorized access is prohibited and logged.</p>
      </div>
    </div>
  );
}

export default function Login() {
  const { login, isLoading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await login(username, password)) return;
    setPassword('');
  };

  return (
    <AuthShell>
      <div className="flex items-center gap-2 mb-6"><Shield size={20} style={{ color: '#B87333' }} /><h2 className="text-lg font-semibold" style={{ color: '#002366' }}>Secure Login</h2></div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
          <input id="username" type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} placeholder="Enter username" required />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} placeholder="Enter password" required />
        </div>
        {error && <div role="alert" className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: '#FEE2E2', color: '#C41E3A' }}><AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span></div>}
        <button type="submit" disabled={isLoading} className="w-full py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>
          {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><LogIn size={18} />Sign In</>}
        </button>
      </form>
      <div className="mt-5 flex justify-between text-xs">
        <Link to="/forgot-password" className="hover:underline" style={{ color: '#002366' }}>Forgot password?</Link>
        <Link to="/recover-username" className="hover:underline" style={{ color: '#002366' }}>Forgot username?</Link>
      </div>
    </AuthShell>
  );
}

```

## src/components/SignaturePad.tsx
```tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Undo } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (signature: string | null) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({ onSignatureChange, width = 400, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [hasSignature, setHasSignature] = useState(false);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev.slice(-10), imageData]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#002366';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    saveState();
  }, [saveState]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const signature = canvas.toDataURL('image/png');
      onSignatureChange(signature);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange(null);
    saveState();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (history.length > 1) {
      const previousState = history[history.length - 2];
      ctx.putImageData(previousState, 0, 0);
      setHistory(prev => prev.slice(0, -1));
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const isEmpty = imageData.data.every((value, index) => index % 4 === 3 ? value === 0 : value === 255);
      if (isEmpty) { setHasSignature(false); onSignatureChange(null); }
      else { const signature = canvas.toDataURL('image/png'); onSignatureChange(signature); }
    }
  };

  return (
    <div className="space-y-3">
      <div className="border-2 rounded-lg overflow-hidden" style={{ borderColor: '#D5D8DC', backgroundColor: '#FFFFFF' }}>
        <canvas ref={canvasRef} width={width} height={height} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} style={{ width: '100%', height: `${height}px`, cursor: 'crosshair', touchAction: 'none' }} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={undo} disabled={history.length <= 1} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#D5D8DC', color: '#1A1A1A' }}><Undo size={14} />Undo</button>
        <button type="button" onClick={clear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: '#C41E3A', color: '#FFFFFF' }}><Eraser size={14} />Clear</button>
      </div>
      {!hasSignature && (<p className="text-xs italic" style={{ color: '#9CA3AF' }}>Please sign in the box above using your mouse, stylus, or finger</p>)}
    </div>
  );
}

```

## src/components/Layout.tsx
```tsx
import React, { useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../auth';
import { store } from '../store';
import type { EvaluationCycle } from '../types';
import { ROLE_LABELS } from '../utils/terminology';
import SessionTimeoutWarning from './SessionTimeoutWarning';
import { LogOut, BookOpen, Users, BarChart3, Settings, GraduationCap, Calendar } from 'lucide-react';

interface LayoutProps { children: ReactNode; viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function Layout({ children, viewingCycleId, onViewingCycleChange }: LayoutProps) {
  const { user, logout } = useAuth();
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<EvaluationCycle | undefined>();

  useEffect(() => {
    const load = () => { setCycles(store.getCycles()); setActiveCycle(store.getActiveCycle()); };
    load();
    return store.subscribe('cycle_changed', load);
  }, []);

  const getRoleIcon = () => {
    switch (user?.role) {
      case 'hr_qa': return <Settings size={16} />;
      case 'faculty': return <BookOpen size={16} />;
      case 'student': return <GraduationCap size={16} />;
      case 'dean': return <BarChart3 size={16} />;
      default: return <Users size={16} />;
    }
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'hr_qa': return { bg: '#C41E3A', text: '#FFFFFF' };
      case 'faculty': return { bg: '#002366', text: '#FFFFFF' };
      case 'student': return { bg: '#2E8B57', text: '#FFFFFF' };
      case 'dean': return { bg: '#B87333', text: '#FFFFFF' };
      default: return { bg: '#1A1A1A', text: '#FFFFFF' };
    }
  };

  const badge = getRoleBadgeColor();
  const isViewingArchived = viewingCycleId && viewingCycleId !== activeCycle?.id;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#D5D8DC' }}>
      <SessionTimeoutWarning />
      <nav className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#002366' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #002366, #003399)', border: '2px solid #B87333' }}>
                <span className="text-lg font-bold" style={{ fontFamily: 'Georgia, serif', color: '#B87333' }}>W</span>
              </div>
              <div><h1 className="text-white font-bold text-base leading-tight">FES</h1><p className="text-[10px] leading-tight" style={{ color: '#B87333' }}>Faculty Evaluation System</p></div>
            </div>
            {activeCycle && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(46,139,87,0.2)', border: '1px solid rgba(46,139,87,0.5)' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-bold text-green-300">ACTIVE TERM:</span>
                <span className="text-xs font-semibold text-white">{activeCycle.displayName}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: badge.bg, color: badge.text }}>{getRoleIcon()}<span className="hidden sm:inline">{user ? ROLE_LABELS[user.role] : ''}</span></div>
                <span className="text-white text-xs hidden lg:block">{user?.displayName}</span>
              </div>
              <button onClick={() => logout()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}><LogOut size={14} /><span className="hidden sm:inline">Logout</span></button>
            </div>
          </div>
        </div>
      </nav>
      {onViewingCycleChange && cycles.length > 0 && (
        <div className="sticky top-14 z-40 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={14} style={{ color: '#B87333' }} />
              <label htmlFor="viewing-term" className="text-xs font-medium">Academic Term / Semester:</label>
              <select id="viewing-term" value={viewingCycleId || activeCycle?.id || ''} onChange={e => onViewingCycleChange(e.target.value)} className="px-2 py-1 rounded-lg border text-xs outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                {cycles.filter(c => c.status !== 'upcoming').map(c => (<option key={c.id} value={c.id}>{c.displayName} {c.id === activeCycle?.id ? '(Active)' : c.status === 'archived' ? '(Archived)' : ''}</option>))}
              </select>
            </div>
            {isViewingArchived && <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: '#FEF3C7', border: '1px solid #B87333' }}><span className="text-xs">⚠️</span><span className="text-xs font-medium" style={{ color: '#B87333' }}>Viewing a previous Academic Term</span></div>}
          </div>
        </div>
      )}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">{children}</main>
      <footer className="py-4 text-center text-xs" style={{ backgroundColor: '#1A1A1A', color: '#9CA3AF' }}>
        <p>FES © 2026 — Faculty Evaluation System. Student responses are confidential under RA 10173; e-signatures are governed by RA 8792.</p>
      </footer>
    </div>
  );
}

```

## src/components/ConfirmDialog.tsx
```tsx
import React, { useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../auth';
import { store } from '../store';
import type { EvaluationCycle } from '../types';
import { ROLE_LABELS } from '../utils/terminology';
import SessionTimeoutWarning from './SessionTimeoutWarning';
import { LogOut, BookOpen, Users, BarChart3, Settings, GraduationCap, Calendar } from 'lucide-react';

interface LayoutProps { children: ReactNode; viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function Layout({ children, viewingCycleId, onViewingCycleChange }: LayoutProps) {
  const { user, logout } = useAuth();
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<EvaluationCycle | undefined>();

  useEffect(() => {
    const load = () => { setCycles(store.getCycles()); setActiveCycle(store.getActiveCycle()); };
    load();
    return store.subscribe('cycle_changed', load);
  }, []);

  const getRoleIcon = () => {
    switch (user?.role) {
      case 'hr_qa': return <Settings size={16} />;
      case 'faculty': return <BookOpen size={16} />;
      case 'student': return <GraduationCap size={16} />;
      case 'dean': return <BarChart3 size={16} />;
      default: return <Users size={16} />;
    }
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'hr_qa': return { bg: '#C41E3A', text: '#FFFFFF' };
      case 'faculty': return { bg: '#002366', text: '#FFFFFF' };
      case 'student': return { bg: '#2E8B57', text: '#FFFFFF' };
      case 'dean': return { bg: '#B87333', text: '#FFFFFF' };
      default: return { bg: '#1A1A1A', text: '#FFFFFF' };
    }
  };

  const badge = getRoleBadgeColor();
  const isViewingArchived = viewingCycleId && viewingCycleId !== activeCycle?.id;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#D5D8DC' }}>
      <SessionTimeoutWarning />
      <nav className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#002366' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #002366, #003399)', border: '2px solid #B87333' }}>
                <span className="text-lg font-bold" style={{ fontFamily: 'Georgia, serif', color: '#B87333' }}>W</span>
              </div>
              <div><h1 className="text-white font-bold text-base leading-tight">FES</h1><p className="text-[10px] leading-tight" style={{ color: '#B87333' }}>Faculty Evaluation System</p></div>
            </div>
            {activeCycle && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(46,139,87,0.2)', border: '1px solid rgba(46,139,87,0.5)' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-bold text-green-300">ACTIVE TERM:</span>
                <span className="text-xs font-semibold text-white">{activeCycle.displayName}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: badge.bg, color: badge.text }}>{getRoleIcon()}<span className="hidden sm:inline">{user ? ROLE_LABELS[user.role] : ''}</span></div>
                <span className="text-white text-xs hidden lg:block">{user?.displayName}</span>
              </div>
              <button onClick={() => logout()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}><LogOut size={14} /><span className="hidden sm:inline">Logout</span></button>
            </div>
          </div>
        </div>
      </nav>
      {onViewingCycleChange && cycles.length > 0 && (
        <div className="sticky top-14 z-40 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={14} style={{ color: '#B87333' }} />
              <label htmlFor="viewing-term" className="text-xs font-medium">Academic Term / Semester:</label>
              <select id="viewing-term" value={viewingCycleId || activeCycle?.id || ''} onChange={e => onViewingCycleChange(e.target.value)} className="px-2 py-1 rounded-lg border text-xs outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                {cycles.filter(c => c.status !== 'upcoming').map(c => (<option key={c.id} value={c.id}>{c.displayName} {c.id === activeCycle?.id ? '(Active)' : c.status === 'archived' ? '(Archived)' : ''}</option>))}
              </select>
            </div>
            {isViewingArchived && <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: '#FEF3C7', border: '1px solid #B87333' }}><span className="text-xs">⚠️</span><span className="text-xs font-medium" style={{ color: '#B87333' }}>Viewing a previous Academic Term</span></div>}
          </div>
        </div>
      )}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">{children}</main>
      <footer className="py-4 text-center text-xs" style={{ backgroundColor: '#1A1A1A', color: '#9CA3AF' }}>
        <p>FES © 2026 — Faculty Evaluation System. Student responses are confidential under RA 10173; e-signatures are governed by RA 8792.</p>
      </footer>
    </div>
  );
}

```