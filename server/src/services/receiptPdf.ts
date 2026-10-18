import { jsPDF } from 'jspdf';
import type { AgreementRow } from './agreements';

const ROLE_LABELS: Record<string, string> = {
  hr_qa: 'HR / Quality Assurance (QA)',
  dean: 'Dean',
  faculty: 'Faculty',
  student: 'Student',
};

/** Printable certificate for an executed e-signature (RA 8792). */
export function renderAgreementReceipt(a: AgreementRow): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 14) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFillColor(0, 35, 102);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SIGNED AGREEMENT RECEIPT', margin, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Faculty Evaluation System (FES) - Electronic Signature Certificate', margin, 23);
  y = 42;

  doc.setTextColor(0, 35, 102);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(a.terms_text.split('\n')[0], contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 6 + 2;

  const rows: Array<[string, string]> = [
    ['Tracking ID', a.tracking_id],
    ['Signer', a.signer_name],
    ['Role', ROLE_LABELS[a.signer_role] ?? a.signer_role],
    ['Institutional ID', a.signer_institutional_id],
    ...(a.department_name ? [['Department', a.department_name] as [string, string]] : []),
    ...(a.faculty_id && a.faculty_id !== a.signer_institutional_id ? [['Faculty ID', a.faculty_id] as [string, string]] : []),
    ['Academic Term', `${a.term_display_name} (${a.term_id})`],
    ['Signed (UTC)', a.signed_at.toISOString().replace('T', ' ').replace('Z', ' UTC')],
    ['Terms Version', a.terms_version],
  ];

  doc.setFillColor(248, 246, 241);
  doc.roundedRect(margin, y, contentWidth, rows.length * 6.5 + 4, 2, 2, 'F');
  y += 6;
  doc.setFontSize(9.5);
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text(`${label}:`, margin + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 40, y);
    y += 6.5;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 35, 102);
  doc.text('Document SHA-256', margin, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(26, 26, 26);
  doc.text(a.document_hash, margin, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 35, 102);
  doc.text('Signature Image SHA-256', margin, y + 1);
  y += 6;
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(26, 26, 26);
  doc.text(a.signature_sha256, margin, y);
  y += 10;

  doc.setDrawColor(184, 115, 51);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 35, 102);
  doc.text('Agreement Terms (exact text signed)', margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(26, 26, 26);
  for (const clause of a.terms_text.split('\n').slice(1)) {
    const lines = doc.splitTextToSize(clause, contentWidth - 4);
    ensureSpace(lines.length * 4.6 + 2);
    doc.text(lines, margin + 2, y);
    y += lines.length * 4.6 + 2;
  }
  y += 6;

  ensureSpace(42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 35, 102);
  doc.text('Electronic Signature', margin, y);
  y += 3;
  doc.setDrawColor(213, 216, 220);
  doc.rect(margin, y, 84, 30);
  try {
    doc.addImage(a.signature_png, 'PNG', margin + 1, y + 1, 82, 28);
  } catch {
    doc.setFontSize(8);
    doc.text('[signature image unavailable]', margin + 4, y + 15);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text(a.signer_name, margin, y + 35);
  y += 41;

  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  const footer = doc.splitTextToSize(
    'This certificate records an electronic signature executed in the Faculty Evaluation System and has the legal effect ' +
      'provided under RA 8792 (Electronic Commerce Act of 2000). The document hash is computed over the exact agreement ' +
      'text, signer identity, academic term and signature image; any alteration invalidates it. Authorized FES users can ' +
      'verify this receipt by its Tracking ID. Handle in accordance with RA 10173 (Data Privacy Act of 2012).',
    contentWidth,
  );
  ensureSpace(footer.length * 3.6);
  doc.text(footer, margin, y);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`${a.tracking_id}  |  Page ${i} of ${pages}`, margin, pageHeight - 10);
  }

  return Buffer.from(doc.output('arraybuffer'));
}
