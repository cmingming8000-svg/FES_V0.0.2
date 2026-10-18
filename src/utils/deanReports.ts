import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { store, BENCHMARK, THRESHOLD } from '../store';

// Shared style constants
const ROYAL_BLUE = 'FF002366';
const COPPER = 'FFB87333';
const CREAM_TINT = 'FFF5E6D3';
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
// DEPARTMENT FACULTY REPORT (Excel)
// ============================
export async function exportDepartmentFacultyReport(department: string, cycleId?: string): Promise<void> {
  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);
  const faculty = store.getFacultyByDepartment(department);

  try {
    if (!cycle) throw new Error('Evaluation cycle not found');
    if (faculty.length === 0) throw new Error('No faculty found in department');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FES - Faculty Evaluation System';
    workbook.created = new Date();

    const generationTimestamp = new Date().toLocaleString();

    // ============================
    // SHEET 1: FACULTY SUMMARY
    // ============================
    const facultySheet = workbook.addWorksheet('Faculty Summary');
    facultySheet.columns = [
      { width: 30 },  // Faculty Name
      { width: 15 },  // Title
      { width: 14 },  // Submissions
      { width: 14 },  // Average
      { width: 18 },  // Status
      { width: 20 },  // Acknowledgment
      { width: 25 },  // Courses Taught
    ];

    facultySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const facultyHeaders = ['Faculty Name', 'Title', 'Submissions', 'Average', 'Status', 'Acknowledgment', 'Courses Taught'];
    facultySheet.getRow(1).values = facultyHeaders;
    facultySheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    faculty.forEach((f, i) => {
      const metrics = store.getFacultyMetrics(f.id, effectiveCycleId);
      const belowThreshold = metrics.totalSubmissions < THRESHOLD;
      const status = belowThreshold ? 'Insufficient Data' : getRatingLabel(metrics.overallAverage);
      const avgColor = belowThreshold ? GRAY_TEXT : getRatingColor(metrics.overallAverage);
      const rowNum = i + 2;
      const r = facultySheet.getRow(rowNum);
      r.values = [
        f.name, 
        f.title,
        metrics.totalSubmissions, 
        belowThreshold ? 'N/A' : metrics.overallAverage.toFixed(2), 
        status, 
        f.acknowledgmentStatus.replace(/_/g, ' '),
        f.courses.join(', ')
      ];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(4).font = { size: 10, bold: true, color: { argb: avgColor } };
      r.getCell(5).alignment = { horizontal: 'center' };
      r.getCell(6).alignment = { horizontal: 'center' };
      // Color code acknowledgment status
      if (f.acknowledgmentStatus === 'acknowledged') {
        r.getCell(6).font = { size: 10, color: { argb: GREEN } };
      } else {
        r.getCell(6).font = { size: 10, color: { argb: COPPER } };
      }
      r.getCell(7).alignment = { wrapText: true };
    });

    facultySheet.autoFilter = { from: 'A1', to: `G${faculty.length + 1}` };

    // ============================
    // SHEET 2: FACULTY DEVELOPMENT NEEDS
    // ============================
    const devSheet = workbook.addWorksheet('Development Needs');
    devSheet.columns = [
      { width: 30 },  // Faculty Name
      { width: 50 },  // Development Needs
      { width: 20 },  // Priority
    ];

    devSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const devHeaders = ['Faculty Name', 'Development Needs', 'Priority'];
    devSheet.getRow(1).values = devHeaders;
    devSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const criteria = store.getCriteria();
    let devRow = 2;

    faculty.forEach(f => {
      const metrics = store.getFacultyMetrics(f.id, effectiveCycleId);
      if (metrics.totalSubmissions < THRESHOLD) return;

      const improvements = criteria.filter(c => {
        const avg = metrics.criteriaAverages[c.id] || 0;
        return avg > 0 && avg < BENCHMARK;
      });

      if (improvements.length > 0) {
        const needs = improvements.map(c => {
          const avg = metrics.criteriaAverages[c.id] || 0;
          return `${c.name} (${avg.toFixed(2)})`;
        }).join('; ');

        const priority = improvements.some(c => (metrics.criteriaAverages[c.id] || 0) < 2.0) ? 'HIGH' : 'MEDIUM';

        const r = devSheet.getRow(devRow);
        r.values = [f.name, needs, priority];
        r.eachCell(cell => {
          cell.border = borderStyle;
          cell.font = { size: 10 };
        });
        r.getCell(2).alignment = { wrapText: true };
        r.getCell(3).alignment = { horizontal: 'center' };
        r.getCell(3).font = { size: 10, bold: true, color: { argb: priority === 'HIGH' ? RED : COPPER } };
        devRow++;
      }
    });

    if (devRow === 2) {
      const r = devSheet.getRow(devRow);
      r.values = ['All Faculty', 'No immediate development needs identified - all criteria meet benchmark', 'N/A'];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10, italic: true };
      });
    }

    devSheet.autoFilter = { from: 'A1', to: `C${Math.max(devRow, 2)}` };

    // ============================
    // SAVE AND DOWNLOAD
    // ============================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FES_${department.replace(/\s+/g, '_')}_Faculty_Report_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Error generating department faculty report:', error);
    alert(`Failed to generate report: ${errorMessage}`);
  }
}

// ============================
// DEPARTMENT PERFORMANCE SUMMARY (PDF)
// ============================
export async function exportDepartmentPerformancePDF(department: string, cycleId?: string): Promise<void> {
  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);
  const faculty = store.getFacultyByDepartment(department);
  const deptMetrics = store.getDepartmentMetrics(department, effectiveCycleId);
  const criteria = store.getCriteria();

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
    doc.text('DEPARTMENT PERFORMANCE SUMMARY', margin, 15);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(department, margin, 23);
    doc.setFontSize(8);
    doc.text(`Generated: ${generationTimestamp}`, pageWidth - margin - 60, 23);
    yPos = 45;
    doc.setTextColor(0, 0, 0);

    // ===== EXECUTIVE SUMMARY =====
    addSectionHeader('Executive Summary');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Academic Term: ${cycle.displayName}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Total Faculty: ${faculty.length}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Total Submissions: ${deptMetrics.totalSubmissions}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Department Average: ${deptMetrics.institutionAverage.toFixed(2)}/5.0`, margin + 2, yPos);
    yPos += 8;

    // ===== FACULTY PERFORMANCE =====
    addSectionHeader('Faculty Performance');
    
    // Table header
    checkPageBreak(10);
    doc.setFillColor(0, 35, 102);
    doc.rect(margin, yPos, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Faculty', margin + 2, yPos + 5);
    doc.text('Submissions', margin + 80, yPos + 5);
    doc.text('Average', margin + 110, yPos + 5);
    doc.text('Status', margin + 140, yPos + 5);
    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    faculty.forEach((f, i) => {
      checkPageBreak(7);
      const metrics = store.getFacultyMetrics(f.id, effectiveCycleId);
      const belowThreshold = metrics.totalSubmissions < THRESHOLD;
      
      if (i % 2 === 0) {
        doc.setFillColor(248, 246, 241);
        doc.rect(margin, yPos, contentWidth, 6, 'F');
      }
      
      doc.setFontSize(9);
      doc.text(f.name, margin + 2, yPos + 4);
      doc.text(metrics.totalSubmissions.toString(), margin + 80, yPos + 4);
      
      if (belowThreshold) {
        doc.setTextColor(156, 163, 175);
        doc.text('—', margin + 110, yPos + 4);
      } else {
        if (metrics.overallAverage >= BENCHMARK) {
          doc.setTextColor(46, 139, 87);
        } else {
          doc.setTextColor(196, 30, 58);
        }
        doc.text(metrics.overallAverage.toFixed(2), margin + 110, yPos + 4);
      }
      
      doc.setTextColor(0, 0, 0);
      const status = belowThreshold ? 'Insufficient Data' : getRatingLabel(metrics.overallAverage);
      doc.text(status, margin + 140, yPos + 4);
      
      yPos += 7;
    });

    // ===== CRITERIA ANALYSIS =====
    yPos += 5;
    addSectionHeader('Criteria Performance');
    
    criteria.forEach(c => {
      checkPageBreak(7);
      const avg = deptMetrics.criteriaAverages[c.id] || 0;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(c.name, margin + 2, yPos + 4);
      
      if (avg >= BENCHMARK) {
        doc.setTextColor(46, 139, 87);
      } else {
        doc.setTextColor(196, 30, 58);
      }
      doc.text(avg.toFixed(2), margin + 120, yPos + 4);
      doc.setTextColor(0, 0, 0);
      
      yPos += 7;
    });

    // ===== RECOMMENDATIONS =====
    yPos += 5;
    addSectionHeader('Recommendations');
    
    const lowCriteria = criteria.filter(c => {
      const avg = deptMetrics.criteriaAverages[c.id] || 0;
      return avg > 0 && avg < BENCHMARK;
    });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    if (lowCriteria.length > 0) {
      doc.text('Areas requiring attention:', margin + 2, yPos);
      yPos += 5;
      lowCriteria.forEach(c => {
        checkPageBreak(5);
        const avg = deptMetrics.criteriaAverages[c.id] || 0;
        doc.text(`• ${c.name} (${avg.toFixed(2)}/5.0) - Consider department-wide training`, margin + 5, yPos);
        yPos += 5;
      });
    } else {
      doc.text('✓ All criteria meet or exceed benchmark - excellent department performance', margin + 2, yPos);
      yPos += 5;
    }

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
    doc.text('Faculty Evaluation System (FES) - Department Report', margin, yPos);

    const fileName = `FES_${department.replace(/\s+/g, '_')}_Performance_Summary_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating department performance PDF:', error);
    alert('Failed to generate PDF report. Please try again.');
  }
}
