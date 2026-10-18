import type { AgreementType, UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  hr_qa: 'HR / QA',
  dean: 'Dean',
  faculty: 'Faculty',
  student: 'Student',
};

export const ROLE_LABELS_LONG: Record<UserRole, string> = {
  hr_qa: 'HR / Quality Assurance (QA)',
  dean: 'Dean',
  faculty: 'Faculty',
  student: 'Student',
};

export const AGREEMENT_LABELS: Record<AgreementType, string> = {
  hr_qa_release: 'HR / QA Release',
  dean_oversight_signoff: "Dean's Oversight Sign-Off",
  faculty_acknowledgment: 'Faculty Acknowledgment',
};
