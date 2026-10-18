import { jsPDF } from 'jspdf';
import { store, BENCHMARK } from '../store';

export async function exportFacultyPDF(facultyId: string, cycleId?: string): Promise<void> {
  const faculty = store.getFacultyById(facultyId);
  if (!faculty) { 
    alert('Faculty not found'); 
    return; 
  }

  const allCycles = store.getCycles();
  const activeCycle = store.getActiveCycle();
  const effectiveCycleId = cycleId || activeCycle?.id;
  const cycle = allCycles.find(c => c.id === effectiveCycleId);
  
  // Fetch current criteria and sub-questions
  const criteria = store.getCriteria();
  const subQuestions = store.getSubQuestions();
  
  // Calculate metrics based on current criteria
  const metrics = store.getFacultyMetrics(facultyId, effectiveCycleId);

  if (!metrics || metrics.totalSubmissions === 0) { 
    alert('No evaluation data available for this period'); 
    return; 
  }

  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;
    const trackingId = `FES-${Date.now()}-${facultyId}`;
    const generationTimestamp = new Date().toLocaleString();

    // Helper function to check if we need a new page
    const checkPageBreak = (requiredSpace: number) => {
      if (yPos + requiredSpace > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    // Helper function to add section header
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

    // ===== PAGE 1: HEADER =====
    doc.setFillColor(0, 35, 102);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('FACULTY EVALUATION REPORT', margin, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Faculty Evaluation System', margin, 23);
    doc.setFontSize(8);
    doc.text(`Generated: ${generationTimestamp}`, pageWidth - margin - 60, 23);
    yPos = 45;
    doc.setTextColor(0, 0, 0);

    // ===== REPORT METADATA =====
    doc.setFillColor(248, 246, 241);
    doc.roundedRect(margin, yPos, contentWidth, 28, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 35, 102);
    doc.text('Report Information', margin + 3, yPos + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(`Tracking ID: ${trackingId}`, margin + 3, yPos + 11);
    doc.text(`Criteria: ${criteria.length} | Performance Indicators: ${subQuestions.length}`, margin + 3, yPos + 16);
    doc.text(`Status: ${faculty.acknowledgmentStatus === 'acknowledged' ? 'Acknowledged' : 'Pending'}`, margin + 3, yPos + 21);
    yPos += 33;

    // ===== FACULTY INFORMATION =====
    addSectionHeader('Faculty Information');
    
    const infoData = [
      ['Name', faculty.name],
      ['Department', faculty.department],
      ['Title', faculty.title],
      ['Academic Term', cycle?.displayName || 'N/A'],
      ['Total Submissions', metrics.totalSubmissions.toString()],
      ['Overall Average', `${metrics.overallAverage.toFixed(2)} / 5.0`]
    ];

    infoData.forEach(([label, value]) => {
      checkPageBreak(7);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', margin + 2, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value, margin + 45, yPos);
      yPos += 6;
    });
    yPos += 3;

    // ===== E-SIGNATURE ACKNOWLEDGMENT (RA 8792) =====
    const acknowledgment = store.findAgreement('faculty_acknowledgment', effectiveCycleId, { facultyId });
    if (acknowledgment) {
      addSectionHeader('Faculty Acknowledgment');
      checkPageBreak(18);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`E-signed by ${acknowledgment.signerName} on ${new Date(acknowledgment.signedAt).toUTCString()}`, margin + 2, yPos);
      yPos += 5;
      doc.text(`Receipt Tracking ID: ${acknowledgment.trackingId}`, margin + 2, yPos);
      yPos += 5;
      doc.setFont('courier', 'normal');
      doc.text(`SHA-256: ${acknowledgment.documentHash}`, margin + 2, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 8;
    }

    // ===== CRITERIA PERFORMANCE =====
    addSectionHeader('Criteria Performance Breakdown');
    
    // Define column positions for consistent alignment
    const col1Start = margin;
    const col2Start = margin + 120;
    const col3Start = margin + 145;
    
    // Table header
    checkPageBreak(10);
    doc.setFillColor(0, 35, 102);
    doc.rect(margin, yPos, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Criterion / Performance Indicator', col1Start + 2, yPos + 5);
    doc.text('Average', col2Start + 2, yPos + 5);
    doc.text('Rating', col3Start + 2, yPos + 5);
    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Add criteria and sub-questions
    criteria.forEach((crit) => {
      const critAvg = metrics.criteriaAverages[crit.id] || 0;
      const rating = critAvg >= 4.5 ? 'Excellent' : critAvg >= BENCHMARK ? 'Good' : critAvg >= 2 ? 'Needs Improvement' : 'Critical';
      
      // Check if we need space for criterion row
      checkPageBreak(8);
      
      // Criterion row with background
      doc.setFillColor(245, 230, 211);
      doc.rect(margin, yPos, contentWidth, 7, 'F');
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      
      // Split criterion name if too long
      const critNameLines = doc.splitTextToSize(crit.name, 115);
      doc.text(critNameLines[0], col1Start + 2, yPos + 4);
      
      // Average score
      doc.text(critAvg.toFixed(2), col2Start + 2, yPos + 4);
      
      // Rating with color
      if (critAvg >= BENCHMARK) {
        doc.setTextColor(46, 139, 87);
      } else {
        doc.setTextColor(196, 30, 58);
      }
      doc.text(rating, col3Start + 2, yPos + 4);
      doc.setTextColor(0, 0, 0);
      
      yPos += 7;
      
      // Sub-questions for this criterion
      const critSQs = subQuestions.filter(sq => sq.criterionId === crit.id);
      critSQs.forEach((sq) => {
        const sqAvg = metrics.subQuestionAverages[sq.id] || 0;
        const sqRating = sqAvg >= 4.5 ? 'Excellent' : sqAvg >= BENCHMARK ? 'Good' : sqAvg >= 2 ? 'Needs Improvement' : 'Critical';
        
        // Split text into lines
        const sqTextLines = doc.splitTextToSize(sq.text, 110);
        const rowHeight = Math.max(6, sqTextLines.length * 4 + 2);
        
        // Check if we need a new page
        checkPageBreak(rowHeight);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        
        // Draw sub-question text with arrow
        let textY = yPos + 3;
        sqTextLines.forEach((line: string, lineIdx: number) => {
          if (lineIdx === 0) {
            doc.text('→ ' + line, col1Start + 6, textY);
          } else {
            doc.text('  ' + line, col1Start + 6, textY);
          }
          textY += 4;
        });
        
        // Average score - vertically centered
        doc.text(sqAvg.toFixed(2), col2Start + 2, yPos + rowHeight / 2);
        
        // Rating with color - vertically centered
        if (sqAvg >= BENCHMARK) {
          doc.setTextColor(46, 139, 87);
        } else {
          doc.setTextColor(196, 30, 58);
        }
        doc.text(sqRating, col3Start + 2, yPos + rowHeight / 2);
        doc.setTextColor(0, 0, 0);
        
        yPos += rowHeight;
      });
    });

    // ===== COURSE/SUBJECT PERFORMANCE =====
    yPos += 5;
    addSectionHeader('Course/Subject Performance');
    
    // Define column positions for course table
    const courseCol1Start = margin;
    const courseCol2Start = margin + 80;
    const courseCol3Start = margin + 130;
    
    // Table header
    checkPageBreak(10);
    doc.setFillColor(0, 35, 102);
    doc.rect(margin, yPos, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Course/Subject', courseCol1Start + 2, yPos + 5);
    doc.text('Submissions', courseCol2Start + 2, yPos + 5);
    doc.text('Average', courseCol3Start + 2, yPos + 5);
    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    Object.entries(metrics.courseBreakdown).forEach(([course, data]) => {
      checkPageBreak(7);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(course, courseCol1Start + 2, yPos + 4);
      doc.text(data.count.toString(), courseCol2Start + 2, yPos + 4);
      
      if (data.average >= BENCHMARK) {
        doc.setTextColor(46, 139, 87);
      } else {
        doc.setTextColor(196, 30, 58);
      }
      doc.text(data.average.toFixed(2), courseCol3Start + 2, yPos + 4);
      doc.setTextColor(0, 0, 0);
      
      yPos += 7;
    });

    // ===== STUDENT FEEDBACK =====
    if (metrics.feedback.length > 0) {
      yPos += 5;
      addSectionHeader('Student Feedback');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text('(PII-Redacted for anonymity)', margin, yPos);
      yPos += 5;
      doc.setTextColor(0, 0, 0);
      
      metrics.feedback.forEach((fb, index) => {
        // Split feedback text into lines
        const feedbackLines = doc.splitTextToSize(fb.feedback, contentWidth - 10);
        const feedbackHeight = feedbackLines.length * 4 + 12;
        
        // Check if we need a new page
        checkPageBreak(feedbackHeight);
        
        // Draw feedback box
        doc.setFillColor(248, 246, 241);
        doc.setDrawColor(184, 115, 51);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, yPos, contentWidth, feedbackHeight, 1, 1, 'FD');
        
        // Draw left border accent
        doc.setFillColor(184, 115, 51);
        doc.rect(margin, yPos, 2, feedbackHeight, 'F');
        
        // Feedback text
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(26, 26, 26);
        let textY = yPos + 5;
        feedbackLines.forEach((line: string) => {
          doc.text(line, margin + 5, textY);
          textY += 4;
        });
        
        // Metadata
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Course: ${fb.courseId} | Submitted: ${new Date(fb.submittedAt).toLocaleDateString()}`, margin + 5, yPos + feedbackHeight - 3);
        
        yPos += feedbackHeight + 3;
      });
    }

    // ===== DEPARTMENT COMPARISON =====
    yPos += 5;
    addSectionHeader('Department Comparison');
    
    const deptMetrics = store.getDepartmentMetrics(faculty.department, effectiveCycleId);
    // Faculty only receive their own rows; the anonymous rank comes from server aggregates.
    const serverRank = store.getTermStats(effectiveCycleId)?.facultyRank;
    const peers = store.getFacultyByDepartment(faculty.department)
      .map(f => ({ id: f.id, ...store.getFacultyMetrics(f.id, effectiveCycleId) }))
      .filter(f => f.totalSubmissions > 0)
      .sort((a, b) => b.overallAverage - a.overallAverage);
    const rank = serverRank?.rank ?? peers.findIndex(f => f.id === facultyId) + 1;
    const peerCount = serverRank?.of ?? peers.length;
    const percentile = peerCount > 0 && rank > 0 ? Math.round((1 - (rank - 1) / peerCount) * 100) : 0;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Department: ${faculty.department}`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Department Average: ${deptMetrics.institutionAverage.toFixed(2)}/5.0`, margin + 2, yPos);
    yPos += 5;
    doc.text(`Your Average: ${metrics.overallAverage.toFixed(2)}/5.0`, margin + 2, yPos);
    yPos += 5;
    
    const difference = metrics.overallAverage - deptMetrics.institutionAverage;
    doc.text(`Difference: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}`, margin + 2, yPos);
    if (difference >= 0) {
      doc.setTextColor(46, 139, 87);
    } else {
      doc.setTextColor(196, 30, 58);
    }
    doc.text(`(${difference >= 0 ? 'Above' : 'Below'} Department Average)`, margin + 60, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 5;
    
    doc.text(`Anonymous Ranking: Top ${100 - percentile}% of department`, margin + 2, yPos);
    yPos += 8;

    // ===== PROFESSIONAL DEVELOPMENT RECOMMENDATIONS =====
    yPos += 5;
    addSectionHeader('Professional Development Recommendations');
    
    // Identify strengths and areas for improvement
    const strengths = criteria.filter(c => (metrics.criteriaAverages[c.id] || 0) >= 4.0);
    const improvements = criteria.filter(c => {
      const avg = metrics.criteriaAverages[c.id] || 0;
      return avg > 0 && avg < BENCHMARK;
    });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(46, 139, 87);
    doc.text('Strengths:', margin + 2, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
    
    if (strengths.length > 0) {
      strengths.forEach(c => {
        checkPageBreak(5);
        const avg = metrics.criteriaAverages[c.id] || 0;
        doc.text(`• ${c.name} (${avg.toFixed(2)}/5.0)`, margin + 5, yPos);
        yPos += 5;
      });
    } else {
      doc.text('• Continue maintaining high standards across all criteria', margin + 5, yPos);
      yPos += 5;
    }
    
    yPos += 3;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(196, 30, 58);
    doc.text('Areas for Improvement:', margin + 2, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
    
    if (improvements.length > 0) {
      improvements.forEach(c => {
        checkPageBreak(5);
        const avg = metrics.criteriaAverages[c.id] || 0;
        doc.text(`• ${c.name} (${avg.toFixed(2)}/5.0) - Consider targeted professional development`, margin + 5, yPos);
        yPos += 5;
      });
    } else {
      doc.text('• All criteria meet or exceed benchmark - excellent performance', margin + 5, yPos);
      yPos += 5;
    }
    
    yPos += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Recommendation: Schedule a meeting with your Dean to discuss these results and create a', margin + 2, yPos);
    yPos += 4;
    doc.text('personalized professional development plan for the next evaluation cycle.', margin + 2, yPos);
    doc.setTextColor(0, 0, 0);

    // ===== FOOTER =====
    yPos += 5;
    checkPageBreak(15);
    doc.setDrawColor(0, 35, 102);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Faculty Evaluation System (FES)', margin, yPos);
    doc.text(`Tracking ID: ${trackingId}`, pageWidth - margin - 50, yPos);

    // Save PDF
    const fileName = `FES_${faculty.name.replace(/[^a-zA-Z0-9]/g, '_')}_${cycle?.displayName.replace(/[^a-zA-Z0-9]/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
  } catch (error) {
    console.error('Error generating PDF report:', error);
    alert('Failed to generate PDF report. Please try again.');
  }
}
