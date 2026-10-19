/**
 * Development seed: loads the prototype's demo institution into PostgreSQL.
 * Refuses to run in production. All demo accounts share SEED_DEMO_PASSWORD.
 */
import pg from 'pg';
import { stripPII } from '../../../src/utils/pii';
import { config } from '../config';
import { hashPassword } from '../security/password';
import { AuditService } from '../services/audit';

if (config.isProduction) {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}

const DEMO_PASSWORD = config.seedDemoPassword || 'Fes-Demo-2026!';

const DEPARTMENTS = [
  { id: 'CS', name: 'Computer Science' },
  { id: 'MATH', name: 'Mathematics' },
  { id: 'PHYS', name: 'Physics' },
];

const PROGRAMS = [
  { id: 'BSCS', name: 'BS Computer Science', dept: 'CS' },
  { id: 'BSMATH', name: 'BS Mathematics', dept: 'MATH' },
  { id: 'BSPHYS', name: 'BS Physics', dept: 'PHYS' },
];

const FACULTY = [
  { id: 'F001', name: 'Dr. Sarah Chen', dept: 'CS', title: 'Associate Professor', courses: ['CS101', 'CS201', 'CS301'] },
  { id: 'F002', name: 'Dr. James Wilson', dept: 'CS', title: 'Professor', courses: ['CS401', 'CS350'] },
  { id: 'F003', name: 'Dr. Maria Garcia', dept: 'MATH', title: 'Assistant Professor', courses: ['MATH101', 'MATH201'] },
  { id: 'F004', name: 'Dr. Robert Kim', dept: 'MATH', title: 'Professor', courses: ['MATH301'] },
  { id: 'F005', name: 'Dr. Emily Thompson', dept: 'PHYS', title: 'Associate Professor', courses: ['PHYS101', 'PHYS301'] },
  { id: 'F006', name: 'Dr. Michael Brown', dept: 'CS', title: 'Assistant Professor', courses: ['CS150', 'CS250'] },
  { id: 'F007', name: 'Dr. Lisa Anderson', dept: 'MATH', title: 'Associate Professor', courses: ['MATH150', 'MATH250'] },
  { id: 'F008', name: 'Dr. David Martinez', dept: 'PHYS', title: 'Assistant Professor', courses: ['PHYS201'] },
  { id: 'F009', name: 'Dr. Jennifer Lee', dept: 'CS', title: 'Lecturer', courses: ['CS101'] },
  { id: 'F010', name: 'Dr. Thomas Wright', dept: 'MATH', title: 'Professor', courses: ['MATH301', 'MATH401'] },
  { id: 'F011', name: 'Dr. Amanda Clark', dept: 'PHYS', title: 'Associate Professor', courses: ['PHYS101', 'PHYS201'] },
];

const SUBJECTS = [
  ['CS101', 'Introduction to Programming', 'BSCS', 'F001'], ['CS150', 'Digital Logic Design', 'BSCS', 'F006'],
  ['CS201', 'Data Structures', 'BSCS', 'F001'], ['CS250', 'Computer Organization', 'BSCS', 'F006'],
  ['CS301', 'Algorithms', 'BSCS', 'F001'], ['CS350', 'Software Engineering', 'BSCS', 'F002'],
  ['CS401', 'Database Systems', 'BSCS', 'F002'], ['MATH101', 'Calculus I', 'BSMATH', 'F003'],
  ['MATH150', 'Discrete Mathematics', 'BSMATH', 'F007'], ['MATH201', 'Calculus II', 'BSMATH', 'F003'],
  ['MATH250', 'Linear Algebra', 'BSMATH', 'F007'], ['MATH301', 'Differential Equations', 'BSMATH', 'F004'],
  ['MATH401', 'Advanced Calculus', 'BSMATH', 'F010'], ['PHYS101', 'General Physics I', 'BSPHYS', 'F005'],
  ['PHYS201', 'Modern Physics', 'BSPHYS', 'F008'], ['PHYS301', 'Quantum Mechanics', 'BSPHYS', 'F005'],
] as const;

const STUDENTS: Array<[string, string, string, string[]]> = [
  ['C24-001', 'Alice Johnson', 'BSCS', ['CS101', 'CS201', 'MATH101']], ['C24-002', 'Bob Smith', 'BSCS', ['CS101', 'CS150', 'CS201']],
  ['C24-003', 'Carol Davis', 'BSCS', ['CS201', 'CS250', 'MATH201']], ['C24-004', 'David Lee', 'BSCS', ['CS301', 'CS350', 'MATH201']],
  ['C24-005', 'Emma Wilson', 'BSCS', ['CS101', 'CS301', 'PHYS101']], ['C24-006', 'Frank Brown', 'BSCS', ['CS401', 'MATH101', 'PHYS101']],
  ['C24-007', 'Grace Taylor', 'BSMATH', ['MATH150', 'MATH201', 'PHYS101']], ['C24-008', 'Henry Martinez', 'BSMATH', ['MATH201', 'MATH250', 'MATH401']],
  ['C24-009', 'Ivy Anderson', 'BSMATH', ['MATH101', 'MATH201', 'PHYS101']], ['C24-010', 'Jack Thomas', 'BSPHYS', ['PHYS101', 'PHYS201', 'MATH301']],
  ['C24-011', 'Karen White', 'BSPHYS', ['PHYS101', 'PHYS301', 'MATH201']], ['C24-012', 'Laura Palmer', 'BSPHYS', ['PHYS201', 'PHYS301', 'MATH101']],
  ['C24-013', 'Michael Chen', 'BSCS', ['CS101', 'CS201', 'CS301']], ['C24-014', 'Sophia Rodriguez', 'BSCS', ['CS150', 'CS250', 'MATH150']],
  ['C24-015', 'Daniel Kim', 'BSMATH', ['MATH101', 'MATH201', 'MATH401']], ['C24-016', 'Olivia Patel', 'BSMATH', ['MATH150', 'MATH250', 'MATH401']],
  ['C24-017', 'Ethan Nguyen', 'BSPHYS', ['PHYS101', 'PHYS201', 'PHYS301']], ['C24-018', 'Ava Williams', 'BSCS', ['CS201', 'CS350', 'CS401']],
  ['C24-019', 'Noah Garcia', 'BSMATH', ['MATH201', 'MATH301', 'MATH401']], ['C24-020', 'Isabella Lopez', 'BSPHYS', ['PHYS101', 'PHYS201', 'MATH201']],
  ['C24-021', 'Liam Johnson', 'BSCS', ['CS101', 'CS150', 'CS201']], ['C24-022', 'Mia Thompson', 'BSMATH', ['MATH101', 'MATH150', 'MATH201']],
  ['C24-023', 'James Wilson', 'BSPHYS', ['PHYS201', 'PHYS301', 'MATH301']], ['C24-024', 'Charlotte Davis', 'BSCS', ['CS250', 'CS301', 'CS350']],
  ['C24-025', 'Ryan Martinez', 'BSCS', ['CS101', 'CS201', 'CS301']],
];

const TERMS = [
  ['cyc-001', 'Spring 2026 Midterm', 'AY 2025–2026 | Second Semester', '2026-03-01', '2026-03-31', 'active'],
  ['cyc-002', 'Spring 2026 Final', 'AY 2025–2026 | Second Semester Final', '2026-05-15', '2026-06-15', 'upcoming'],
  ['cyc-003', 'Fall 2025 Final', 'AY 2025–2026 | First Semester', '2025-12-01', '2025-12-31', 'completed'],
  ['cyc-004', 'Fall 2025 Midterm', 'AY 2025–2026 | First Semester Midterm', '2025-10-01', '2025-10-31', 'archived'],
] as const;

const CRITERIA = [
  { id: 'crit-teaching', name: 'Teaching Style', indicators: ['Uses effective and engaging teaching methods', 'Presents material in a clear and organized manner', 'Encourages active participation and critical thinking'] },
  { id: 'crit-mastery', name: 'Mastery of Subject', indicators: ['Demonstrates deep knowledge of the subject matter', 'Answers questions accurately and confidently', 'Connects theory to real-world applications effectively'] },
  { id: 'crit-punctuality', name: 'Punctuality', indicators: ['Starts and ends class on time', 'Returns graded assignments and feedback promptly', 'Meets scheduled office hours consistently'] },
  { id: 'crit-professionalism', name: 'Professionalism', indicators: ['Maintains respectful and professional communication', 'Demonstrates fairness and integrity in all interactions', 'Shows commitment to student success and development'] },
];
const indicatorId = (critId: string, i: number) => `sq-${critId.replace('crit-', '')}-${i + 1}`;

// Pre-approved micro-recommendation templates for individual faculty insights.
const TNA_TEMPLATES: Record<string, string[]> = {
  'crit-teaching': [
    'Attend the institutional workshop on active-learning and student-engagement strategies.',
    'Arrange a peer classroom observation with a highly rated colleague and debrief on lesson structure.',
  ],
  'crit-mastery': [
    'Complete a subject-matter refresher or continuing-education module in your discipline.',
    'Integrate at least one industry or real-world case study per unit, reviewed with your Dean.',
  ],
  'crit-punctuality': [
    'Publish a fixed consultation schedule and a grading-turnaround commitment in the course syllabus.',
    'Use the learning management system to schedule feedback deadlines and class reminders.',
  ],
  'crit-professionalism': [
    'Complete the institutional module on professional ethics and respectful student communication.',
    'Review assessment fairness practices (rubrics, transparent grading criteria) with your Dean.',
  ],
};

const FEEDBACK = [
  'Excellent teaching style, very engaging lectures.', 'Could improve on pacing, sometimes moves too fast.',
  'Great at explaining complex concepts clearly.', 'Assessments are fair and well-structured.',
  'The workload is manageable and well-distributed.', 'Very approachable during office hours.',
  'Lectures could use more real-world examples.', 'Excellent use of visual aids in presentations.',
  'Sometimes the material feels overwhelming.', 'Very passionate about the subject matter.',
];

type Base = number[]; // 12 ratings: teaching×3, mastery×3, punctuality×3, professionalism×3
const FACULTY_EVALS: Array<[string, number, Base]> = [
  ['F001', 14, [5, 5, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5]], ['F002', 12, [4, 4, 4, 4, 4, 4, 2, 2, 3, 3, 3, 3]],
  ['F003', 11, [2, 2, 1, 3, 3, 2, 2, 3, 2, 1, 2, 1]], ['F004', 10, [4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 4, 4]],
  ['F005', 10, [4, 3, 4, 3, 3, 3, 3, 3, 3, 2, 2, 1]], ['F006', 13, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]],
  ['F007', 11, [4, 3, 4, 3, 4, 3, 3, 4, 3, 4, 3, 4]], ['F008', 10, [4, 4, 3, 4, 4, 4, 4, 3, 4, 4, 4, 4]],
  ['F009', 12, [5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5]], ['F010', 11, [4, 3, 4, 4, 4, 3, 3, 4, 3, 4, 4, 4]],
  ['F011', 13, [5, 4, 5, 5, 5, 4, 4, 5, 4, 5, 4, 5]],
];

async function seed(): Promise<void> {
  const client = new pg.Client({ connectionString: config.migrationDatabaseUrl });
  await client.connect();
  try {
    const existing = await client.query('SELECT count(*)::int AS n FROM users');
    if (existing.rows[0].n > 0) {
      console.log('Database already contains users; skipping seed.');
      return;
    }

    await client.query('BEGIN');
    await client.query(`SELECT set_config('fes.role', 'system', true)`);
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    for (const d of DEPARTMENTS) await client.query('INSERT INTO departments (id, name) VALUES ($1, $2)', [d.id, d.name]);
    for (const p of PROGRAMS) await client.query('INSERT INTO programs (id, name, department_id) VALUES ($1, $2, $3)', [p.id, p.name, p.dept]);
    for (const f of FACULTY) await client.query('INSERT INTO faculty (id, name, title, department_id) VALUES ($1, $2, $3, $4)', [f.id, f.name, f.title, f.dept]);
    for (const [id, name, program, faculty] of SUBJECTS) {
      await client.query('INSERT INTO subjects (id, code, name, program_id, faculty_id) VALUES ($1, $1, $2, $3, $4)', [id, name, program, faculty]);
    }
    for (const f of FACULTY) for (const c of f.courses) await client.query('INSERT INTO faculty_courses (faculty_id, subject_id) VALUES ($1, $2)', [f.id, c]);
    for (const [id, name, program, subjects] of STUDENTS) {
      await client.query('INSERT INTO students (id, name, program_id) VALUES ($1, $2, $3)', [id, name, program]);
      for (const s of subjects) await client.query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ($1, $2)', [id, s]);
    }
    for (const t of TERMS) {
      await client.query('INSERT INTO academic_terms (id, name, display_name, start_date, end_date, status) VALUES ($1, $2, $3, $4, $5, $6)', [...t]);
    }
    for (const [ci, c] of CRITERIA.entries()) {
      await client.query('INSERT INTO criteria (id, name, sort_order) VALUES ($1, $2, $3)', [c.id, c.name, ci + 1]);
      for (const [ii, text] of c.indicators.entries()) {
        await client.query('INSERT INTO performance_indicators (id, criterion_id, text, sort_order) VALUES ($1, $2, $3, $4)', [indicatorId(c.id, ii), c.id, text, ii + 1]);
      }
      for (const [ti, rec] of (TNA_TEMPLATES[c.id] ?? []).entries()) {
        await client.query('INSERT INTO tna_templates (id, criterion_id, recommendation, sort_order) VALUES ($1, $2, $3, $4)', [`tpl-${c.id}-${ti + 1}`, c.id, rec, ti + 1]);
      }
    }

    const users: Array<{ username: string; email: string; role: string; name: string; institutionalId: string; dept?: string; facultyId?: string; studentId?: string }> = [
      { username: 'admin', email: 'hrqa@fes.example.edu.ph', role: 'hr_qa', name: 'HR / QA Officer', institutionalId: 'HR-0001' },
      { username: 'faculty', email: 'sarah.chen@fes.example.edu.ph', role: 'faculty', name: 'Dr. Sarah Chen', institutionalId: 'F001', dept: 'CS', facultyId: 'F001' },
      { username: 'faculty2', email: 'jennifer.lee@fes.example.edu.ph', role: 'faculty', name: 'Dr. Jennifer Lee', institutionalId: 'F009', dept: 'CS', facultyId: 'F009' },
      { username: 'faculty3', email: 'thomas.wright@fes.example.edu.ph', role: 'faculty', name: 'Dr. Thomas Wright', institutionalId: 'F010', dept: 'MATH', facultyId: 'F010' },
      { username: 'faculty4', email: 'amanda.clark@fes.example.edu.ph', role: 'faculty', name: 'Dr. Amanda Clark', institutionalId: 'F011', dept: 'PHYS', facultyId: 'F011' },
      { username: 'M001', email: 'patricia.moore@fes.example.edu.ph', role: 'dean', name: 'Dr. Patricia Moore', institutionalId: 'M001', dept: 'CS' },
      { username: 'M002', email: 'william.chang@fes.example.edu.ph', role: 'dean', name: 'Dr. William Chang', institutionalId: 'M002', dept: 'MATH' },
      { username: 'M003', email: 'elizabeth.brown@fes.example.edu.ph', role: 'dean', name: 'Dr. Elizabeth Brown', institutionalId: 'M003', dept: 'PHYS' },
      ...STUDENTS.map(([id, name, program]) => ({
        username: id, email: `${id.toLowerCase()}@students.fes.example.edu.ph`, role: 'student', name, institutionalId: id,
        dept: PROGRAMS.find(p => p.id === program)!.dept, studentId: id,
      })),
    ];
    for (const u of users) {
      await client.query(
        `INSERT INTO users (username, email, password_hash, role, display_name, institutional_id, department_id, faculty_id, student_id, password_changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [u.username, u.email, passwordHash, u.role, u.name, u.institutionalId, u.dept ?? null, u.facultyId ?? null, u.studentId ?? null],
      );
    }

    // Seed evaluations for the active term. Each enrolled student evaluates a
    // subject at most once. Distribute evaluations across enrolled students fairly.
    const indicatorIds = CRITERIA.flatMap(c => c.indicators.map((_, i) => indicatorId(c.id, i)));
    let seeded = 0;
    for (const [facultyId, count, base] of FACULTY_EVALS) {
      const faculty = FACULTY.find(f => f.id === facultyId)!;
      const used = new Set<string>();
      let attemptCount = 0;
      const maxAttempts = count * 5;
      for (let i = 0; i < count && attemptCount < maxAttempts; i++, attemptCount++) {
        const course = faculty.courses[i % faculty.courses.length];
        const ownsSubject = SUBJECTS.some(([id, , , fid]) => id === course && fid === facultyId);
        let student = undefined;
        if (ownsSubject) {
          const enrolled = STUDENTS.filter(([sid, , , subs]) => subs.includes(course));
          student = enrolled.find(([sid]) => !used.has(`${sid}:${course}`));
        }
        if (student) {
          used.add(`${student[0]}:${course}`);
          const { rows } = await client.query(
            `INSERT INTO evaluations (term_id, faculty_id, subject_id, student_id, feedback, submitted_at) VALUES ('cyc-001', $1, $2, $3, $4, $5) RETURNING id`,
            [facultyId, course, student[0], stripPII(FEEDBACK[i % FEEDBACK.length]), new Date(Date.UTC(2026, 2, 5 + i, 2))],
          );
          await client.query(
            'INSERT INTO evaluation_ratings (evaluation_id, indicator_id, rating) SELECT $1, unnest($2::text[]), unnest($3::smallint[])',
            [rows[0].id, indicatorIds, base],
          );
          seeded++;
        }
      }
    }

    await AuditService.record(client as unknown as pg.PoolClient, {
      actor: { label: 'system' }, action: 'system_seeded', targetType: 'database', targetId: 'fes',
      details: `Development seed: ${FACULTY.length} faculty, ${STUDENTS.length} students, ${TERMS.length} terms, ${seeded} evaluations`,
    });
    await client.query('COMMIT');
    console.log(`Seed complete. ${users.length} demo accounts created; password for all: ${DEMO_PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
