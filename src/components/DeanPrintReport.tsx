import React from 'react';
import { store, BENCHMARK, THRESHOLD } from '../store';
import type { Criterion } from '../types';

interface DeanPrintReportProps { department: string; cycleName: string; criteria: Criterion[]; cycleId?: string; }

export default function DeanPrintReport({ department, cycleName, criteria, cycleId: requestedCycleId }: DeanPrintReportProps) {
  const cycleId = requestedCycleId || store.getActiveCycle()?.id;
  const faculty = store.getFacultyByDepartment(department);
  const deptMetrics = store.getDepartmentMetrics(department, cycleId);
  const acknowledged = faculty.filter(f => f.acknowledgmentStatus === 'acknowledged').length;
  const critData = criteria.map(c => ({ name: c.name, avg: deptMetrics.criteriaAverages[c.id] || 0 }));

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
          <div><h1 style={styles.title}>Department Evaluation Report</h1><p style={styles.subtitle}>{department} Department</p></div>
          <div style={{ textAlign: 'right' }}><p style={{ margin: 0, fontSize: '10pt', color: '#6B7280' }}>Report Generated</p><p style={{ margin: '4px 0 0 0', fontSize: '12pt', fontWeight: 'bold', color: '#002366' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
        </div>
      </div>
      <div style={styles.section}><h2 style={styles.sectionTitle}>Department Overview</h2><table style={styles.table}><tbody><tr><th style={{ ...styles.th, width: '40%' }}>Department</th><td style={styles.td}>{department}</td></tr><tr><th style={styles.th}>Academic Term / Semester</th><td style={styles.td}>{cycleName}</td></tr><tr><th style={styles.th}>Total Faculty</th><td style={styles.td}>{faculty.length}</td></tr><tr><th style={styles.th}>Total Submissions</th><td style={styles.td}>{deptMetrics.totalSubmissions}</td></tr><tr><th style={styles.th}>Department Average</th><td style={{ ...styles.td, fontWeight: 'bold', color: '#002366' }}>{deptMetrics.institutionAverage.toFixed(2)} / 5.00</td></tr></tbody></table></div>
      <div style={styles.section}><h2 style={styles.sectionTitle}>Faculty Performance Summary</h2><table style={styles.table}><thead><tr><th style={styles.th}>Faculty Name</th><th style={{ ...styles.th, width: '15%', textAlign: 'center' }}>Submissions</th><th style={{ ...styles.th, width: '15%', textAlign: 'center' }}>Average</th><th style={{ ...styles.th, width: '20%', textAlign: 'center' }}>Status</th></tr></thead><tbody>{faculty.map((f, i) => { const metrics = store.getFacultyMetrics(f.id, cycleId); const belowThreshold = metrics.totalSubmissions < THRESHOLD; return (<tr key={f.id} style={{ backgroundColor: i % 2 === 0 ? '#F8F6F1' : 'white' }}><td style={styles.td}>{f.name}</td><td style={{ ...styles.td, textAlign: 'center' }}>{metrics.totalSubmissions}</td><td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: belowThreshold ? '#9CA3AF' : metrics.overallAverage >= BENCHMARK ? '#2E8B57' : '#C41E3A' }}>{belowThreshold ? '—' : metrics.overallAverage.toFixed(2)}</td><td style={{ ...styles.td, textAlign: 'center' }}>{belowThreshold ? 'Insufficient Data' : metrics.overallAverage >= 4.5 ? 'Excellent' : metrics.overallAverage >= BENCHMARK ? 'Good' : 'Below Benchmark'}</td></tr>); })}</tbody></table></div>
      <div style={styles.footer}><p>Faculty Evaluation System (FES) • {department} Department Report • Confidential</p></div>
    </div>
  );
}
