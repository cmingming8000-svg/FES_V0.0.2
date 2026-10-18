import React from 'react';
import { store, BENCHMARK } from '../store';
import type { Criterion } from '../types';

interface AdminPrintReportProps { cycleName: string; criteria: Criterion[]; cycleId?: string; }

export default function AdminPrintReport({ cycleName, criteria, cycleId: requestedCycleId }: AdminPrintReportProps) {
  const faculty = store.getFaculty();
  const cycleId = requestedCycleId || store.getActiveCycle()?.id;
  const totalEvaluations = store.getEvaluations().filter(e => e.cycleId === cycleId).length;
  const deptData = store.getDepartments().map(dept => {
    const deptFaculty = faculty.filter(f => f.department === dept);
    const metrics = deptFaculty.map(f => store.getFacultyMetrics(f.id, cycleId));
    const totalSubs = metrics.reduce((sum, m) => sum + m.totalSubmissions, 0);
    const avgScore = metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.overallAverage, 0) / metrics.length : 0;
    return { name: dept, faculty: deptFaculty.length, submissions: totalSubs, average: avgScore };
  });
  const critData = criteria.map(c => {
    let total = 0, count = 0;
    faculty.forEach(f => { const avg = store.getFacultyMetrics(f.id, cycleId).criteriaAverages[c.id] || 0; if (avg > 0) { total += avg; count++; } });
    return { name: c.name, avg: count > 0 ? total / count : 0 };
  });

  const styles = {
    page: { fontFamily: 'Georgia, serif', color: '#1A1A1A', lineHeight: 1.6, padding: '0', maxWidth: '8.5in', margin: '0 auto', backgroundColor: 'white' },
    header: { borderBottom: '3px solid #002366', paddingBottom: '20px', marginBottom: '30px' },
    title: { fontSize: '28pt', fontWeight: 'bold', color: '#002366', margin: '0 0 8px 0', fontFamily: 'Georgia, serif' },
    subtitle: { fontSize: '14pt', color: '#B87333', margin: '0', fontStyle: 'italic' },
    section: { marginBottom: '30px', breakInside: 'avoid' as any },
    sectionTitle: { fontSize: '16pt', fontWeight: 'bold', color: '#002366', borderBottom: '2px solid #B87333', paddingBottom: '8px', marginBottom: '15px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '15px', fontSize: '11pt' },
    th: { backgroundColor: '#002366', color: 'white', padding: '10px', textAlign: 'left' as const, fontWeight: 'bold', border: '1px solid #002366' },
    td: { padding: '10px', border: '1px solid #D5D8DC' },
    footer: { borderTop: '2px solid #002366', paddingTop: '15px', marginTop: '40px', fontSize: '9pt', color: '#6B7280', textAlign: 'center' as const },
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div><h1 style={styles.title}>Institution-Wide Evaluation Report</h1><p style={styles.subtitle}>FES HR / Quality Assurance Summary</p></div>
          <div style={{ textAlign: 'right' }}><p style={{ margin: 0, fontSize: '10pt', color: '#6B7280' }}>Report Generated</p><p style={{ margin: '4px 0 0 0', fontSize: '12pt', fontWeight: 'bold', color: '#002366' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
        </div>
      </div>
      <div style={styles.section}><h2 style={styles.sectionTitle}>System Overview</h2><table style={styles.table}><tbody><tr><th style={{ ...styles.th, width: '40%' }}>Academic Term / Semester</th><td style={styles.td}>{cycleName}</td></tr><tr><th style={styles.th}>Total Faculty</th><td style={styles.td}>{faculty.length}</td></tr><tr><th style={styles.th}>Total Evaluations</th><td style={styles.td}>{totalEvaluations}</td></tr></tbody></table></div>
      <div style={styles.section}><h2 style={styles.sectionTitle}>Department Summary</h2><table style={styles.table}><thead><tr><th style={styles.th}>Department</th><th style={{ ...styles.th, width: '15%', textAlign: 'center' }}>Faculty</th><th style={{ ...styles.th, width: '20%', textAlign: 'center' }}>Submissions</th><th style={{ ...styles.th, width: '20%', textAlign: 'center' }}>Average</th></tr></thead><tbody>{deptData.map((dept, i) => (<tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F8F6F1' : 'white' }}><td style={styles.td}>{dept.name}</td><td style={{ ...styles.td, textAlign: 'center' }}>{dept.faculty}</td><td style={{ ...styles.td, textAlign: 'center' }}>{dept.submissions}</td><td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: dept.average >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{dept.average.toFixed(2)}</td></tr>))}</tbody></table></div>
      <div style={styles.section}><h2 style={styles.sectionTitle}>Institutional Criteria Averages</h2><table style={styles.table}><thead><tr><th style={styles.th}>Criterion</th><th style={{ ...styles.th, width: '20%', textAlign: 'center' }}>Average</th></tr></thead><tbody>{critData.map((c, i) => (<tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F8F6F1' : 'white' }}><td style={styles.td}>{c.name}</td><td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: c.avg >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{c.avg.toFixed(2)}</td></tr>))}</tbody></table></div>
      <div style={styles.footer}><p>Faculty Evaluation System (FES) • Confidential • HR / QA Access Only</p></div>
    </div>
  );
}
