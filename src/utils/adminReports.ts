import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { store, BENCHMARK, THRESHOLD } from '../store';

// Shared style constants
const ROYAL_BLUE = 'FF002366';
const COPPER = 'FFB87333';
const LIGHT_CREAM = 'FFF8F6F1';
const WHITE = 'FFFFFFFF';
const GRAY_TEXT = 'FF666666';
const GREEN = 'FF2E8B57';
const RED = 'FFC41E3A';

const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROYAL_BLUE } };
const headerFont: Partial<ExcelJS.Font> = { color: { argb: WHITE }, bold: true, size: 11 };
const borderStyle: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  left: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  bottom: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  right: { style: 'thin', color: { argb: 'FFD5D8DC' } },
};

function getRatingColor(avg: number): string {
  if (avg >= 4.5) return GREEN;
  if (avg >= BENCHMARK) return ROYAL_BLUE;
  if (avg >= 2) return COPPER;
  return RED;
}

function getRatingLabel(avg: number): string {
  if (avg >= 4.5) return 'Excellent';
  if (avg >= BENCHMARK) return 'Good';
  if (avg >= 2) return 'Needs Improvement';
  return 'Critical';
}

// ============================
// FACULTY PERFORMANCE SUMMARY (Excel) - For HR/Admin
// ============================
export async function exportFacultyPerformanceSummary(cycleId?: string): Promise<void> {
  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);
  const allFaculty = store.getFaculty();

  try {
    if (!cycle) throw new Error('Evaluation cycle not found');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FES - Faculty Evaluation System';
    workbook.created = new Date();

    const generationTimestamp = new Date().toLocaleString();

    // ============================
    // SHEET 1: ALL FACULTY
    // ============================
    const facultySheet = workbook.addWorksheet('All Faculty');
    facultySheet.columns = [
      { width: 30 },  // Faculty Name
      { width: 20 },  // Department
      { width: 15 },  // Title
      { width: 14 },  // Submissions
      { width: 14 },  // Average
      { width: 18 },  // Status
      { width: 20 },  // Acknowledgment
      { width: 15 },  // Student ID Visible
    ];

    facultySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const facultyHeaders = ['Faculty Name', 'Department', 'Title', 'Submissions', 'Average', 'Status', 'Acknowledgment', 'Student IDs'];
    facultySheet.getRow(1).values = facultyHeaders;
    facultySheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    allFaculty.forEach((f, i) => {
      const metrics = store.getFacultyMetrics(f.id, effectiveCycleId);
      const belowThreshold = metrics.totalSubmissions < THRESHOLD;
      const status = belowThreshold ? 'Insufficient Data' : getRatingLabel(metrics.overallAverage);
      const avgColor = belowThreshold ? GRAY_TEXT : getRatingColor(metrics.overallAverage);
      const rowNum = i + 2;
      const r = facultySheet.getRow(rowNum);
      r.values = [
        f.name, 
        f.department,
        f.title,
        metrics.totalSubmissions, 
        belowThreshold ? 'N/A' : metrics.overallAverage.toFixed(2), 
        status, 
        f.acknowledgmentStatus.replace(/_/g, ' '),
        'HR / QA View Only'
      ];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(5).alignment = { horizontal: 'center' };
      r.getCell(5).font = { size: 10, bold: true, color: { argb: avgColor } };
      r.getCell(6).alignment = { horizontal: 'center' };
      r.getCell(7).alignment = { horizontal: 'center' };
      r.getCell(8).alignment = { horizontal: 'center' };
      r.getCell(8).font = { size: 9, italic: true, color: { argb: GRAY_TEXT } };
      
      // Color code acknowledgment status
      if (f.acknowledgmentStatus === 'acknowledged') {
        r.getCell(7).font = { size: 10, color: { argb: GREEN } };
      } else {
        r.getCell(7).font = { size: 10, color: { argb: COPPER } };
      }
    });

    facultySheet.autoFilter = { from: 'A1', to: `H${allFaculty.length + 1}` };

    // ============================
    // SHEET 2: DEPARTMENT SUMMARY
    // ============================
    const deptSheet = workbook.addWorksheet('Department Summary');
    deptSheet.columns = [
      { width: 30 },  // Department
      { width: 15 },  // Faculty Count
      { width: 15 },  // Total Submissions
      { width: 15 },  // Department Average
      { width: 20 },  // Acknowledged
    ];

    deptSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const deptHeaders = ['Department', 'Faculty Count', 'Total Submissions', 'Department Average', 'Acknowledged'];
    deptSheet.getRow(1).values = deptHeaders;
    deptSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const departments = store.getDepartments();
    departments.forEach((dept, i) => {
      const deptFaculty = allFaculty.filter(f => f.department === dept);
      const deptMetrics = store.getDepartmentMetrics(dept, effectiveCycleId);
      const acknowledged = deptFaculty.filter(f => f.acknowledgmentStatus === 'acknowledged').length;
      
      const r = deptSheet.getRow(i + 2);
      r.values = [
        dept,
        deptFaculty.length,
        deptMetrics.totalSubmissions,
        deptMetrics.institutionAverage.toFixed(2),
        `${acknowledged}/${deptFaculty.length}`
      ];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(4).font = { size: 10, bold: true, color: { argb: getRatingColor(deptMetrics.institutionAverage) } };
      r.getCell(5).alignment = { horizontal: 'center' };
    });

    deptSheet.autoFilter = { from: 'A1', to: `E${departments.length + 1}` };

    // ============================
    // SHEET 3: COMPLIANCE TRACKING
    // ============================
    const complianceSheet = workbook.addWorksheet('Compliance Tracking');
    complianceSheet.columns = [
      { width: 30 },  // Faculty Name
      { width: 20 },  // Department
      { width: 20 },  // Acknowledgment Status
      { width: 20 },  // Days Since Ack
      { width: 20 },  // Needs Reminder
    ];

    complianceSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const complianceHeaders = ['Faculty Name', 'Department', 'Acknowledgment Status', 'Days Since Ack', 'Needs Reminder'];
    complianceSheet.getRow(1).values = complianceHeaders;
    complianceSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    allFaculty.forEach((f, i) => {
      const metrics = store.getFacultyMetrics(f.id, effectiveCycleId);
      const daysSinceAck = f.acknowledgedAt 
        ? Math.floor((new Date().getTime() - new Date(f.acknowledgedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const needsReminder = f.acknowledgmentStatus === 'pending_review' && metrics.totalSubmissions >= THRESHOLD;
      
      const r = complianceSheet.getRow(i + 2);
      r.values = [
        f.name,
        f.department,
        f.acknowledgmentStatus.replace(/_/g, ' '),
        daysSinceAck !== null ? `${daysSinceAck} days` : 'N/A',
        needsReminder ? 'YES' : 'NO'
      ];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(5).alignment = { horizontal: 'center' };
      r.getCell(5).font = { size: 10, bold: true, color: { argb: needsReminder ? RED : GREEN } };
    });

    complianceSheet.autoFilter = { from: 'A1', to: `E${allFaculty.length + 1}` };

    // ============================
    // SAVE AND DOWNLOAD
    // ============================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FES_Faculty_Performance_Summary_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Error generating faculty performance summary:', error);
    alert(`Failed to generate report: ${errorMessage}`);
  }
}

// ============================
// EVALUATION CYCLE COMPLETION (PDF)
// ============================
export async function exportCycleCompletionPDF(cycleId?: string): Promise<void> {
  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);
  const allFaculty = store.getFaculty();
  const allEvaluations = store.getEvaluations().filter(e => e.cycleId === effectiveCycleId);

  try {
    if (!cycle) throw new Error('Evaluation cycle not found');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;
    const generationTimestamp = new Date().toLocaleString();

    const checkPageBreak = (requiredSpace: number) => {
      if (yPos + requiredSpace > 280) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    const addSectionHeader = (title: string) => {
      checkPageBreak(20);
      yPos += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 35, 102);
      doc.text(title, margin, yPos);
      yPos += 3;
      doc.setDrawColor(184, 115, 51);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);
    };

    // ===== HEADER =====
    doc.setFillColor(0, 35, 102);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('ACADEMIC TERM COMPLETION REPORT', margin, 15);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(cycle.displayName, margin, 23);
    doc.setFontSize(8);
    doc.text(`Generated: ${generationTimestamp}`, pageWidth - margin - 60, 23);
    yPos = 45;
    doc.setTextColor(0, 0, 0);

    // ===== OVERVIEW =====
    addSectionHeader('Academic Term Overview');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Academic Term: ${cycle.displayName}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Period: ${cycle.startDate} to ${cycle.endDate}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Status: ${cycle.status}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Total Evaluations: ${allEvaluations.length}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Total Faculty: ${allFaculty.length}`, margin + 2, yPos);
    yPos += 8;

    // ===== DEPARTMENT BREAKDOWN =====
    addSectionHeader('Department Breakdown');
    
    // Table header
    checkPageBreak(10);
    doc.setFillColor(0, 35, 102);
    doc.rect(margin, yPos, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Department', margin + 2, yPos + 5);
    doc.text('Faculty', margin + 70, yPos + 5);
    doc.text('Evaluations', margin + 100, yPos + 5);
    doc.text('Average', margin + 140, yPos + 5);
    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const departments = store.getDepartments();
    departments.forEach((dept, i) => {
      checkPageBreak(7);
      const deptFaculty = allFaculty.filter(f => f.department === dept);
      const deptEvals = allEvaluations.filter(e => deptFaculty.some(f => f.id === e.facultyId));
      const deptMetrics = store.getDepartmentMetrics(dept, effectiveCycleId);
      
      if (i % 2 === 0) {
        doc.setFillColor(248, 246, 241);
        doc.rect(margin, yPos, contentWidth, 6, 'F');
      }
      
      doc.setFontSize(9);
      doc.text(dept, margin + 2, yPos + 4);
      doc.text(deptFaculty.length.toString(), margin + 70, yPos + 4);
      doc.text(deptEvals.length.toString(), margin + 100, yPos + 4);
      
      if (deptMetrics.institutionAverage >= BENCHMARK) {
        doc.setTextColor(46, 139, 87);
      } else {
        doc.setTextColor(196, 30, 58);
      }
      doc.text(deptMetrics.institutionAverage.toFixed(2), margin + 140, yPos + 4);
      doc.setTextColor(0, 0, 0);
      
      yPos += 7;
    });

    // ===== COMPLIANCE =====
    yPos += 5;
    addSectionHeader('Compliance Status');
    
    const acknowledged = allFaculty.filter(f => f.acknowledgmentStatus === 'acknowledged').length;
    const pending = allFaculty.filter(f => f.acknowledgmentStatus !== 'acknowledged').length;
    const completionRate = allFaculty.length > 0 ? (acknowledged / allFaculty.length * 100).toFixed(1) : '0.0';

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Acknowledged: ${acknowledged}/${allFaculty.length} (${completionRate}%)`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Pending: ${pending}`, margin + 2, yPos);
    yPos += 8;

    // ===== FOOTER =====
    yPos += 10;
    checkPageBreak(15);
    doc.setDrawColor(0, 35, 102);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Faculty Evaluation System (FES) - Academic Term Completion Report', margin, yPos);

    const fileName = `FES_Term_Completion_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating cycle completion PDF:', error);
    alert('Failed to generate PDF report. Please try again.');
  }
}
