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
