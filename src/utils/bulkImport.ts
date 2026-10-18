import type { BulkImportRow, UserRole } from '../types';

export const BULK_TEMPLATE_HEADERS = ['role', 'institutional_id', 'name', 'email', 'username', 'department', 'program', 'title', 'subjects'];

export const BULK_TEMPLATE_CSV = [
  BULK_TEMPLATE_HEADERS.join(','),
  'student,C25-001,Juan Dela Cruz,c25-001@students.example.edu.ph,,,BSCS,,"CS101;CS201"',
  'faculty,F120,Dr. Maria Santos,maria.santos@example.edu.ph,msantos,Computer Science,,Assistant Professor,"CS150"',
  'dean,M010,Dr. Jose Reyes,jose.reyes@example.edu.ph,,Mathematics,,,',
  'hr_qa,HR-0102,Ana Lim,ana.lim@example.edu.ph,,,,,',
].join('\r\n');

const HEADER_ALIASES: Record<string, string> = {
  role: 'role', type: 'role', account_type: 'role',
  institutional_id: 'institutionalId', id: 'institutionalId', student_id: 'institutionalId', employee_number: 'institutionalId', employee_no: 'institutionalId',
  name: 'name', full_name: 'name',
  email: 'email', email_address: 'email',
  username: 'username',
  department: 'department',
  program: 'programId', program_id: 'programId',
  title: 'title',
  subjects: 'subjects', courses: 'subjects', enrolled_subjects: 'subjects',
};

const ROLE_ALIASES: Record<string, UserRole> = {
  student: 'student', faculty: 'faculty', dean: 'dean',
  hr_qa: 'hr_qa', 'hr/qa': 'hr_qa', 'hr / qa': 'hr_qa', hr: 'hr_qa', qa: 'hr_qa',
};

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, r => {
    const values: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = r.getCell(c).value;
      values.push(v === null || v === undefined ? '' : typeof v === 'object' && 'text' in v ? String(v.text) : String(v));
    }
    rows.push(values);
  });
  return rows;
}

export interface ParsedImport {
  rows: BulkImportRow[];
  problems: Array<{ row: number; message: string }>;
}

export async function parseImportFile(file: File): Promise<ParsedImport> {
  const isExcel = /\.xlsx$/i.test(file.name);
  if (!isExcel && !/\.csv$/i.test(file.name)) throw new Error('Please upload a .csv or .xlsx file');
  if (file.size > 5 * 1024 * 1024) throw new Error('The file is larger than 5 MB');
  const table = isExcel ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
  if (table.length < 2) throw new Error('The file has no data rows');

  const headers = table[0].map(h => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s-]+/g, '_')]);
  if (!headers.includes('role') || !headers.includes('institutionalId') || !headers.includes('name') || !headers.includes('email')) {
    throw new Error('Missing required columns: role, institutional_id, name, email');
  }

  const rows: BulkImportRow[] = [];
  const problems: ParsedImport['problems'] = [];
  table.slice(1).forEach((cells, i) => {
    const rec: Record<string, string> = {};
    headers.forEach((key, c) => { if (key) rec[key] = (cells[c] ?? '').trim(); });
    const role = ROLE_ALIASES[(rec.role ?? '').toLowerCase()];
    if (!role) problems.push({ row: i + 2, message: `Unknown role "${rec.role}"` });
    rows.push({
      role: role ?? (rec.role as UserRole),
      institutionalId: rec.institutionalId ?? '',
      name: rec.name ?? '',
      email: rec.email ?? '',
      ...(rec.username ? { username: rec.username } : {}),
      ...(rec.department ? { department: rec.department } : {}),
      ...(rec.programId ? { programId: rec.programId } : {}),
      ...(rec.title ? { title: rec.title } : {}),
      ...(rec.subjects ? { subjects: rec.subjects.split(/[;,|]/).map(s => s.trim()).filter(Boolean) } : {}),
    });
  });
  return { rows, problems };
}
