import ExcelJS from 'exceljs';
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
const sectionHeaderFont: Partial<ExcelJS.Font> = { color: { argb: ROYAL_BLUE }, bold: true, size: 12 };
const borderStyle: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  left: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  bottom: { style: 'thin', color: { argb: 'FFD5D8DC' } },
  right: { style: 'thin', color: { argb: 'FFD5D8DC' } },
};
const thickBorderBottom: Partial<ExcelJS.Borders> = {
  ...borderStyle,
  bottom: { style: 'medium', color: { argb: COPPER } },
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

function applyAlternatingRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let i = startRow; i <= endRow; i++) {
    if (i % 2 === 0) {
      sheet.getRow(i).eachCell((cell: any) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_CREAM } };
      });
    }
  }
}

export async function exportDeanReport(department: string, cycleId?: string): Promise<void> {
  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);
  const faculty = store.getFacultyByDepartment(department);
  const deptMetrics = store.getDepartmentMetrics(department, effectiveCycleId);
  const criteria = store.getCriteria();
  const subQuestions = store.getSubQuestions();

  try {
    if (!cycle) throw new Error('Evaluation cycle not found');
    if (deptMetrics.totalSubmissions === 0) throw new Error('No evaluation data available');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FES - Faculty Evaluation System';
    workbook.created = new Date();

    const generationTimestamp = new Date().toLocaleString();

    // ============================
    // SHEET 1: DEPARTMENT OVERVIEW
    // ============================
    const overviewSheet = workbook.addWorksheet('Department Overview');
    overviewSheet.columns = [{ width: 35 }, { width: 45 }];

    // Title
    overviewSheet.mergeCells('A1:B1');
    const titleCell = overviewSheet.getCell('A1');
    titleCell.value = 'FES Department Report';
    titleCell.font = { bold: true, size: 18, color: { argb: ROYAL_BLUE } };

    overviewSheet.mergeCells('A2:B2');
    const subtitleCell = overviewSheet.getCell('A2');
    subtitleCell.value = `${department} Department`;
    subtitleCell.font = { bold: true, size: 13, color: { argb: COPPER }, italic: true };

    // Overview Section
    let row = 4;
    overviewSheet.mergeCells(`A${row}:B${row}`);
    overviewSheet.getCell(`A${row}`).value = 'Department Summary';
    overviewSheet.getCell(`A${row}`).font = sectionHeaderFont;
    overviewSheet.getCell(`A${row}`).border = thickBorderBottom;
    overviewSheet.getCell(`B${row}`).border = thickBorderBottom;
    row++;

    const overviewRows: [string, string | number][] = [
      ['Department', department],
      ['Academic Term', cycle?.displayName || 'N/A'],
      ['Total Faculty', deptMetrics.totalFaculty],
      ['Total Submissions', deptMetrics.totalSubmissions],
      ['Department Average', `${deptMetrics.institutionAverage.toFixed(2)} / 5.00`],
      ['Report Generated', generationTimestamp],
    ];
    overviewRows.forEach(([label, value]) => {
      const r = overviewSheet.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).value = value;
      r.getCell(2).font = { size: 10 };
      r.eachCell((cell: any) => { cell.border = borderStyle; });
      row++;
    });

    // Criteria Structure Note
    row++;
    overviewSheet.mergeCells(`A${row}:B${row}`);
    overviewSheet.getCell(`A${row}`).value = `Criteria Structure: ${criteria.length} criteria, ${subQuestions.length} Performance Indicators (as of ${generationTimestamp})`;
    overviewSheet.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: GRAY_TEXT } };

    // ============================
    // SHEET 2: FACULTY SUMMARY
    // ============================
    const facultySheet = workbook.addWorksheet('Faculty Summary');
    facultySheet.columns = [
      { width: 30 },  // Faculty Name
      { width: 14 },  // Submissions
      { width: 14 },  // Average
      { width: 18 },  // Status
      { width: 20 },  // Acknowledgment
    ];

    facultySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const facultyHeaders = ['Faculty Name', 'Submissions', 'Average', 'Status', 'Acknowledgment'];
    facultySheet.getRow(1).values = facultyHeaders;
    facultySheet.getRow(1).eachCell((cell: any) => {
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
      r.values = [f.name, metrics.totalSubmissions, belowThreshold ? 'N/A' : metrics.overallAverage.toFixed(2), status, f.acknowledgmentStatus.replace(/_/g, ' ')];
      r.eachCell((cell: any) => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(3).font = { size: 10, bold: true, color: { argb: avgColor } };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(5).alignment = { horizontal: 'center' };
      // Color code acknowledgment status
      if (f.acknowledgmentStatus === 'acknowledged') {
        r.getCell(5).font = { size: 10, color: { argb: GREEN } };
      } else {
        r.getCell(5).font = { size: 10, color: { argb: COPPER } };
      }
    });

    applyAlternatingRows(facultySheet, 2, faculty.length + 1);
    facultySheet.autoFilter = { from: 'A1', to: `E${faculty.length + 1}` };

    // ============================
    // SHEET 3: CRITERIA PERFORMANCE
    // ============================
    const criteriaSheet = workbook.addWorksheet('Criteria Performance');
    criteriaSheet.columns = [
      { width: 55 },  // Criterion / Sub-Question
      { width: 14 },  // Type
      { width: 18 },  // Department Average
      { width: 18 },  // Rating
    ];

    criteriaSheet.views = [{ state: 'frozen', ySplit: 2 }];

    // Criteria structure note
    criteriaSheet.mergeCells('A1:D1');
    criteriaSheet.getCell('A1').value = `Current Criteria Structure: ${criteria.length} criteria, ${subQuestions.length} Performance Indicators (as of ${generationTimestamp})`;
    criteriaSheet.getCell('A1').font = { italic: true, size: 9, color: { argb: GRAY_TEXT } };

    // Table header
    const critHeaders = ['Criterion / Performance Indicator', 'Type', 'Dept Average', 'Rating'];
    criteriaSheet.getRow(2).values = critHeaders;
    criteriaSheet.getRow(2).eachCell((cell: any) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    let critRowNum = 3;
    criteria.forEach(crit => {
      const critAvg = deptMetrics.criteriaAverages[crit.id] || 0;
      const rating = getRatingLabel(critAvg);
      const ratingColor = getRatingColor(critAvg);

      // Criterion row
      const critRow = criteriaSheet.getRow(critRowNum);
      critRow.values = [crit.name, 'CRITERION', critAvg.toFixed(2), rating];
      critRow.eachCell((cell: any) => {
        cell.border = borderStyle;
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM_TINT } };
      });
      critRow.getCell(3).alignment = { horizontal: 'center' };
      critRow.getCell(3).font = { bold: true, size: 10, color: { argb: ratingColor } };
      critRow.getCell(4).alignment = { horizontal: 'center' };
      critRow.getCell(4).font = { bold: true, size: 10, color: { argb: ratingColor } };
      critRowNum++;

      // Sub-questions
      const critSQs = subQuestions.filter(sq => sq.criterionId === crit.id);
      critSQs.forEach(sq => {
        const sqAvg = deptMetrics.criteriaAverages[crit.id] || 0; // Use department-level data
        const sqRow = criteriaSheet.getRow(critRowNum);
        sqRow.values = [`    ${sq.text}`, 'Indicator', '', ''];
        sqRow.eachCell((cell: any) => {
          cell.border = borderStyle;
          cell.font = { size: 9, italic: true, color: { argb: GRAY_TEXT } };
        });
        critRowNum++;
      });
    });

    criteriaSheet.autoFilter = { from: 'A2', to: `D${critRowNum - 1}` };

    // ============================
    // SHEET 4: DEPARTMENT TNA
    // ============================
    const tnaSheet = workbook.addWorksheet('Training Needs');
    tnaSheet.columns = [
      { width: 35 },  // Criterion
      { width: 18 },  // Department Average
      { width: 14 },  // Benchmark
      { width: 14 },  // Gap
      { width: 20 },  // Priority
    ];

    tnaSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const tnaHeaders = ['Criterion', 'Dept Average', 'Benchmark', 'Gap', 'Priority'];
    tnaSheet.getRow(1).values = tnaHeaders;
    tnaSheet.getRow(1).eachCell((cell: any) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Sort criteria by average (lowest first for TNA)
    const criteriaTNA = criteria
      .map(c => ({
        name: c.name,
        avg: deptMetrics.criteriaAverages[c.id] || 0,
      }))
      .sort((a, b) => a.avg - b.avg);

    let tnaRowNum = 2;
    criteriaTNA.forEach(c => {
      const gap = (c.avg - BENCHMARK).toFixed(2);
      const priority = c.avg < BENCHMARK ? 'HIGH' : c.avg < 4.0 ? 'MEDIUM' : 'LOW';
      const priorityColor = c.avg < BENCHMARK ? RED : c.avg < 4.0 ? COPPER : GREEN;

      const r = tnaSheet.getRow(tnaRowNum);
      r.values = [c.name, c.avg.toFixed(2), BENCHMARK.toFixed(2), gap, priority];
      r.eachCell((cell: any) => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(2).font = { size: 10, bold: true, color: { argb: getRatingColor(c.avg) } };
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(4).font = { size: 10, bold: true, color: { argb: parseFloat(gap) < 0 ? RED : GREEN } };
      r.getCell(5).alignment = { horizontal: 'center' };
      r.getCell(5).font = { size: 10, bold: true, color: { argb: priorityColor } };
      tnaRowNum++;
    });

    applyAlternatingRows(tnaSheet, 2, tnaRowNum - 1);
    tnaSheet.autoFilter = { from: 'A1', to: `E${tnaRowNum - 1}` };

    // ============================
    // SAVE AND DOWNLOAD
    // ============================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FES_${department.replace(/\s+/g, '_')}_Department_Report_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Error generating Dean report:', error);
    alert(`Failed to generate department report: ${errorMessage}`);
  }
}
