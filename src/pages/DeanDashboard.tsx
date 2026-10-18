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
