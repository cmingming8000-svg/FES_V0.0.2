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
