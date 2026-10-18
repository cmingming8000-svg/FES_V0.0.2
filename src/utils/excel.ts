import ExcelJS from 'exceljs';
import { store, BENCHMARK } from '../store';

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
      sheet.getRow(i).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_CREAM } };
      });
    }
  }
}

export async function exportFacultyReport(facultyId: string, cycleId?: string): Promise<void> {
  const faculty = store.getFacultyById(facultyId);
  if (!faculty) return;

  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);

  const criteria = store.getCriteria();
  const subQuestions = store.getSubQuestions();
  const metrics = store.getFacultyMetrics(facultyId, effectiveCycleId);

  try {
    if (!faculty) throw new Error('Faculty not found');
    if (!metrics || metrics.totalSubmissions === 0) throw new Error('No evaluation data available');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FES - Faculty Evaluation System';
    workbook.created = new Date();

    const trackingId = `FES-${Date.now()}-${facultyId}`;
    const generationTimestamp = new Date().toLocaleString();
    const deptMetrics = store.getDepartmentMetrics(faculty.department, effectiveCycleId);

    // ============================
    // SHEET 1: COVER
    // ============================
    const coverSheet = workbook.addWorksheet('Cover');
    coverSheet.columns = [{ width: 35 }, { width: 45 }];

    // Title
    coverSheet.mergeCells('A1:B1');
    const titleCell = coverSheet.getCell('A1');
    titleCell.value = 'FES Faculty Evaluation Report';
    titleCell.font = { bold: true, size: 18, color: { argb: ROYAL_BLUE } };

    coverSheet.mergeCells('A2:B2');
    const subtitleCell = coverSheet.getCell('A2');
    subtitleCell.value = 'Professional Development Portfolio';
    subtitleCell.font = { bold: true, size: 13, color: { argb: COPPER }, italic: true };

    // Report Metadata Section
    let row = 4;
    coverSheet.mergeCells(`A${row}:B${row}`);
    coverSheet.getCell(`A${row}`).value = 'Report Metadata';
    coverSheet.getCell(`A${row}`).font = sectionHeaderFont;
    coverSheet.getCell(`A${row}`).border = thickBorderBottom;
    coverSheet.getCell(`B${row}`).border = thickBorderBottom;
    row++;

    const metadataRows: [string, string][] = [
      ['Tracking ID', trackingId],
      ['Generated', generationTimestamp],
      ['Criteria Count', `${criteria.length} criteria`],
      ['Performance Indicators', `${subQuestions.length} Performance Indicators`],
      ['Status', faculty.acknowledgmentStatus === 'acknowledged' ? 'Faculty Signed & Acknowledged' : 'Pending Acknowledgment'],
    ];
    metadataRows.forEach(([label, value]) => {
      const r = coverSheet.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).value = value;
      r.getCell(2).font = { size: 10 };
      r.eachCell(cell => { cell.border = borderStyle; });
      row++;
    });

    // Faculty Information Section
    row++;
    coverSheet.mergeCells(`A${row}:B${row}`);
    coverSheet.getCell(`A${row}`).value = 'Faculty Information';
    coverSheet.getCell(`A${row}`).font = sectionHeaderFont;
    coverSheet.getCell(`A${row}`).border = thickBorderBottom;
    coverSheet.getCell(`B${row}`).border = thickBorderBottom;
    row++;

    const facultyInfoRows: [string, string][] = [
      ['Faculty Name', faculty.name],
      ['Department', faculty.department],
      ['Title', faculty.title],
      ['Academic Term', cycle?.displayName || 'N/A'],
    ];
    facultyInfoRows.forEach(([label, value]) => {
      const r = coverSheet.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).value = value;
      r.getCell(2).font = { size: 10 };
      r.eachCell(cell => { cell.border = borderStyle; });
      row++;
    });

    // Performance Summary Section
    row++;
    coverSheet.mergeCells(`A${row}:B${row}`);
    coverSheet.getCell(`A${row}`).value = 'Performance Summary';
    coverSheet.getCell(`A${row}`).font = sectionHeaderFont;
    coverSheet.getCell(`A${row}`).border = thickBorderBottom;
    coverSheet.getCell(`B${row}`).border = thickBorderBottom;
    row++;

    const perfRows: [string, string | number][] = [
      ['Total Submissions', metrics.totalSubmissions],
      ['Overall Average', `${metrics.overallAverage.toFixed(2)} / 5.00`],
      ['Courses Evaluated', Object.keys(metrics.courseBreakdown).length],
      ['Acknowledgment Status', faculty.acknowledgmentStatus.replace(/_/g, ' ').toUpperCase()],
    ];
    perfRows.forEach(([label, value]) => {
      const r = coverSheet.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).value = value;
      r.getCell(2).font = { size: 10 };
      r.eachCell(cell => { cell.border = borderStyle; });
      row++;
    });

    // Benchmark Comparison Section
    row++;
    coverSheet.mergeCells(`A${row}:B${row}`);
    coverSheet.getCell(`A${row}`).value = 'Benchmark Comparison';
    coverSheet.getCell(`A${row}`).font = sectionHeaderFont;
    coverSheet.getCell(`A${row}`).border = thickBorderBottom;
    coverSheet.getCell(`B${row}`).border = thickBorderBottom;
    row++;

    const benchmarkRows: [string, string | number, string?][] = [
      ['Faculty Average', metrics.overallAverage.toFixed(2)],
      ['Department Average', deptMetrics.institutionAverage.toFixed(2)],
      ['Difference', (metrics.overallAverage - deptMetrics.institutionAverage).toFixed(2), metrics.overallAverage >= deptMetrics.institutionAverage ? GREEN : RED],
    ];
    benchmarkRows.forEach(([label, value, color]) => {
      const r = coverSheet.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).value = value;
      r.getCell(2).font = { size: 10, bold: true, color: { argb: color || ROYAL_BLUE } };
      r.eachCell(cell => { cell.border = borderStyle; });
      row++;
    });

    // ============================
    // SHEET 2: CRITERIA ANALYSIS
    // ============================
    const criteriaSheet = workbook.addWorksheet('Criteria Analysis');
    criteriaSheet.columns = [
      { width: 55 },  // Criterion / Sub-Question
      { width: 14 },  // Type
      { width: 12 },  // Avg Score
      { width: 18 },  // Rating
    ];

    // Freeze header row
    criteriaSheet.views = [{ state: 'frozen', ySplit: 2 }];

    // Criteria structure note
    criteriaSheet.mergeCells('A1:D1');
    criteriaSheet.getCell('A1').value = `Current Criteria Structure: ${criteria.length} criteria, ${subQuestions.length} Performance Indicators (as of ${generationTimestamp})`;
    criteriaSheet.getCell('A1').font = { italic: true, size: 9, color: { argb: GRAY_TEXT } };

    // Table header
    const critHeaders = ['Criterion / Performance Indicator', 'Type', 'Avg Score', 'Rating'];
    criteriaSheet.getRow(2).values = critHeaders;
    criteriaSheet.getRow(2).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    let rowNum = 3;
    criteria.forEach(crit => {
      const critAvg = metrics.criteriaAverages[crit.id] || 0;
      const rating = getRatingLabel(critAvg);
      const ratingColor = getRatingColor(critAvg);

      // Criterion row
      const critRow = criteriaSheet.getRow(rowNum);
      critRow.values = [crit.name, 'CRITERION', critAvg.toFixed(2), rating];
      critRow.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM_TINT } };
      });
      critRow.getCell(3).alignment = { horizontal: 'center' };
      critRow.getCell(3).font = { bold: true, size: 10, color: { argb: ratingColor } };
      critRow.getCell(4).alignment = { horizontal: 'center' };
      critRow.getCell(4).font = { bold: true, size: 10, color: { argb: ratingColor } };
      rowNum++;

      // Sub-questions
      const critSQs = subQuestions.filter(sq => sq.criterionId === crit.id);
      critSQs.forEach(sq => {
        const sqAvg = metrics.subQuestionAverages[sq.id] || 0;
        const sqRating = getRatingLabel(sqAvg);
        const sqRatingColor = getRatingColor(sqAvg);

        const sqRow = criteriaSheet.getRow(rowNum);
        sqRow.values = [`    ${sq.text}`, 'Indicator', sqAvg.toFixed(2), sqRating];
        sqRow.eachCell(cell => {
          cell.border = borderStyle;
          cell.font = { size: 9 };
        });
        sqRow.getCell(2).alignment = { horizontal: 'center' };
        sqRow.getCell(3).alignment = { horizontal: 'center' };
        sqRow.getCell(3).font = { size: 9, bold: true, color: { argb: sqRatingColor } };
        sqRow.getCell(4).alignment = { horizontal: 'center' };
        sqRow.getCell(4).font = { size: 9, color: { argb: sqRatingColor } };
        rowNum++;
      });
    });

    // Add auto-filter
    criteriaSheet.autoFilter = { from: 'A2', to: `D${rowNum - 1}` };

    // ============================
    // SHEET 3: COURSE PERFORMANCE
    // ============================
    const courseSheet = workbook.addWorksheet('Course-Subject Performance');
    courseSheet.columns = [
      { width: 22 },  // Course/Subject
      { width: 16 },  // Submissions
      { width: 16 },  // Average Score
      { width: 18 },  // Rating
    ];

    courseSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const courseHeaders = ['Course/Subject', 'Submissions', 'Average Score', 'Rating'];
    courseSheet.getRow(1).values = courseHeaders;
    courseSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    let courseRow = 2;
    Object.entries(metrics.courseBreakdown).forEach(([course, data]) => {
      const rating = getRatingLabel(data.average);
      const ratingColor = getRatingColor(data.average);
      const r = courseSheet.getRow(courseRow);
      r.values = [course, data.count, data.average.toFixed(2), rating];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(3).font = { size: 10, bold: true, color: { argb: ratingColor } };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(4).font = { size: 10, color: { argb: ratingColor } };
      courseRow++;
    });

    applyAlternatingRows(courseSheet, 2, courseRow - 1);
    courseSheet.autoFilter = { from: 'A1', to: `D${courseRow - 1}` };

    // ============================
    // SHEET 4: STUDENT FEEDBACK
    // ============================
    const feedbackSheet = workbook.addWorksheet('Student Feedback');
    feedbackSheet.columns = [
      { width: 16 },  // Course
      { width: 65 },  // Feedback
      { width: 18 },  // Date
    ];

    feedbackSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const feedbackHeaders = ['Course', 'Feedback (PII-Redacted)', 'Date'];
    feedbackSheet.getRow(1).values = feedbackHeaders;
    feedbackSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    metrics.feedback.forEach((fb, i) => {
      const r = feedbackSheet.getRow(i + 2);
      r.values = [fb.courseId, fb.feedback, new Date(fb.submittedAt).toLocaleDateString()];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      r.getCell(3).alignment = { horizontal: 'center' };
      r.height = 30;
    });

    applyAlternatingRows(feedbackSheet, 2, metrics.feedback.length + 1);
    feedbackSheet.autoFilter = { from: 'A1', to: `C${metrics.feedback.length + 1}` };

    // ============================
    // SHEET 5: SCORE DISTRIBUTION
    // ============================
    const summarySheet = workbook.addWorksheet('Score Distribution');
    summarySheet.columns = [
      { width: 38 },  // Metric
      { width: 16 },  // Count
      { width: 16 },  // Percentage
    ];

    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    const summaryHeaders = ['Metric', 'Count', 'Percentage'];
    summarySheet.getRow(1).values = summaryHeaders;
    summarySheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const totalRatings = metrics.scoreDistribution.reduce((a, b) => a + b, 0);
    const starLabels = ['1 - Critical', '2 - Needs Improvement', '3 - Good', '4 - Very Good', '5 - Excellent'];
    const starColors = [RED, COPPER, 'FF94A3B8', 'FF3B82F6', GREEN];

    summarySheet.getRow(2).values = ['Total Feedback Entries', metrics.feedback.length, ''];
    summarySheet.getRow(2).eachCell(cell => { cell.border = borderStyle; cell.font = { bold: true, size: 10 }; });

    metrics.scoreDistribution.forEach((count, i) => {
      const pct = totalRatings > 0 ? ((count / totalRatings) * 100).toFixed(1) + '%' : '0.0%';
      const r = summarySheet.getRow(i + 3);
      r.values = [`Score ${starLabels[i]}`, count, pct];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(1).font = { size: 10, color: { argb: starColors[i] } };
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(3).alignment = { horizontal: 'center' };
    });

    // Overall average row
    const avgRow = summarySheet.getRow(metrics.scoreDistribution.length + 3);
    avgRow.values = ['Overall Average', metrics.overallAverage.toFixed(2), ''];
    avgRow.eachCell(cell => {
      cell.border = borderStyle;
      cell.font = { bold: true, size: 10, color: { argb: getRatingColor(metrics.overallAverage) } };
    });
    avgRow.getCell(2).alignment = { horizontal: 'center' };

    summarySheet.autoFilter = { from: 'A1', to: `C${metrics.scoreDistribution.length + 3}` };

    // ============================
    // SHEET 6: DEPARTMENT COMPARISON
    // ============================
    const deptSheet = workbook.addWorksheet('Department Comparison');
    deptSheet.columns = [
      { width: 35 },  // Metric
      { width: 20 },  // Value
    ];

    deptSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const deptHeaders = ['Metric', 'Value'];
    deptSheet.getRow(1).values = deptHeaders;
    deptSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const deptComparisonMetrics = store.getDepartmentMetrics(faculty.department, effectiveCycleId);
    // Faculty only receive their own rows; the anonymous rank comes from server aggregates.
    const serverRank = store.getTermStats(effectiveCycleId)?.facultyRank;
    const peers = store.getFacultyByDepartment(faculty.department)
      .map(f => ({ id: f.id, ...store.getFacultyMetrics(f.id, effectiveCycleId) }))
      .filter(f => f.totalSubmissions > 0)
      .sort((a, b) => b.overallAverage - a.overallAverage);
    const rank = serverRank?.rank ?? peers.findIndex(f => f.id === facultyId) + 1;
    const peerCount = serverRank?.of ?? peers.length;
    const percentile = peerCount > 0 && rank > 0 ? Math.round((1 - (rank - 1) / peerCount) * 100) : 0;
    const difference = metrics.overallAverage - deptComparisonMetrics.institutionAverage;

    const deptRows: [string, string | number][] = [
      ['Department', faculty.department],
      ['Your Average', metrics.overallAverage.toFixed(2)],
      ['Department Average', deptComparisonMetrics.institutionAverage.toFixed(2)],
      ['Difference', `${difference >= 0 ? '+' : ''}${difference.toFixed(2)}`],
      ['Anonymous Ranking', `Top ${100 - percentile}% of department`],
      ['Total Faculty in Department', deptComparisonMetrics.totalFaculty],
      ['Faculty with Evaluations', peerCount],
    ];

    deptRows.forEach((row, i) => {
      const r = deptSheet.getRow(i + 2);
      r.values = row;
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      r.getCell(1).font = { size: 10, bold: true };
    });

    deptSheet.autoFilter = { from: 'A1', to: `B${deptRows.length + 1}` };

    // ============================
    // SHEET 7: PROFESSIONAL DEVELOPMENT
    // ============================
    const devSheet = workbook.addWorksheet('Professional Development');
    devSheet.columns = [
      { width: 30 },  // Category
      { width: 50 },  // Recommendation
    ];

    devSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const devHeaders = ['Category', 'Recommendation'];
    devSheet.getRow(1).values = devHeaders;
    devSheet.getRow(1).eachCell(cell => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Identify strengths and areas for improvement
    const strengths = criteria.filter(c => (metrics.criteriaAverages[c.id] || 0) >= 4.0);
    const improvements = criteria.filter(c => {
      const avg = metrics.criteriaAverages[c.id] || 0;
      return avg > 0 && avg < BENCHMARK;
    });

    let devRow = 2;
    
    // Strengths section
    const strengthHeader = devSheet.getRow(devRow);
    strengthHeader.values = ['STRENGTHS', ''];
    strengthHeader.eachCell(cell => {
      cell.border = borderStyle;
      cell.font = { size: 10, bold: true, color: { argb: GREEN } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    });
    devRow++;

    if (strengths.length > 0) {
      strengths.forEach(c => {
        const avg = metrics.criteriaAverages[c.id] || 0;
        const r = devSheet.getRow(devRow);
        r.values = [c.name, `Score: ${avg.toFixed(2)}/5.0 - Continue maintaining high standards`];
        r.eachCell(cell => {
          cell.border = borderStyle;
          cell.font = { size: 10 };
        });
        devRow++;
      });
    } else {
      const r = devSheet.getRow(devRow);
      r.values = ['General', 'Continue maintaining high standards across all criteria'];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      devRow++;
    }

    // Areas for improvement section
    devRow++;
    const improvementHeader = devSheet.getRow(devRow);
    improvementHeader.values = ['AREAS FOR IMPROVEMENT', ''];
    improvementHeader.eachCell(cell => {
      cell.border = borderStyle;
      cell.font = { size: 10, bold: true, color: { argb: RED } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    });
    devRow++;

    if (improvements.length > 0) {
      improvements.forEach(c => {
        const avg = metrics.criteriaAverages[c.id] || 0;
        const r = devSheet.getRow(devRow);
        r.values = [c.name, `Score: ${avg.toFixed(2)}/5.0 - Consider targeted professional development`];
        r.eachCell(cell => {
          cell.border = borderStyle;
          cell.font = { size: 10 };
        });
        devRow++;
      });
    } else {
      const r = devSheet.getRow(devRow);
      r.values = ['General', 'All criteria meet or exceed benchmark - excellent performance'];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      devRow++;
    }

    // Recommendations section
    devRow++;
    const recHeader = devSheet.getRow(devRow);
    recHeader.values = ['NEXT STEPS', ''];
    recHeader.eachCell(cell => {
      cell.border = borderStyle;
      cell.font = { size: 10, bold: true, color: { argb: ROYAL_BLUE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    });
    devRow++;

    const recommendations = [
      'Schedule a meeting with your Dean to discuss these results',
      'Create a personalized professional development plan for next cycle',
      'Consider peer observation or mentoring opportunities',
      'Review student feedback themes for actionable insights',
      'Set specific, measurable goals for improvement areas'
    ];

    recommendations.forEach(rec => {
      const r = devSheet.getRow(devRow);
      r.values = ['Action Item', rec];
      r.eachCell(cell => {
        cell.border = borderStyle;
        cell.font = { size: 10 };
      });
      devRow++;
    });

    devSheet.autoFilter = { from: 'A1', to: `B${devRow - 1}` };
    
    // ============================
    // SAVE AND DOWNLOAD
    // ============================
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FES_${faculty.name.replace(/[^a-zA-Z0-9]/g, '_')}_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 200);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Error generating Excel report:', error);
    alert(`Failed to generate Excel report: ${errorMessage}`);
  }
}
