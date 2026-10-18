const COMMON_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Karen', 'Laura', 'Sarah', 'James', 'Maria', 'Robert', 'Emily', 'Patricia', 'William', 'Elizabeth', 'John', 'Mary', 'Michael', 'Jennifer', 'Thomas', 'Jessica', 'Daniel', 'Amanda', 'Christopher', 'Ashley', 'Johnson', 'Smith', 'Davis', 'Lee', 'Wilson', 'Brown', 'Taylor', 'Martinez', 'Anderson', 'White', 'Palmer', 'Chen', 'Garcia', 'Kim', 'Thompson', 'Moore', 'Chang'];

const PII_PATTERNS = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  { pattern: /\bC24-\d{3}\b/g, replacement: '[REDACTED_STUDENT_ID]' },
  { pattern: /https?:\/\/[^\s]+/g, replacement: '[REDACTED_URL]' },
];

export function stripPII(text: string): string {
  if (!text) return text;
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) result = result.replace(pattern, replacement);
  for (const name of COMMON_NAMES) {
    const namePattern = new RegExp(`\\b${name}\\b`, 'gi');
    result = result.replace(namePattern, '[REDACTED_NAME]');
  }
  return result;
}

export function detectPII(text: string): string[] {
  if (!text) return [];
  const detected: string[] = [];
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text)) detected.push('Email address');
  if (/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) detected.push('Phone number');
  if (/\bC24-\d{3}\b/.test(text)) detected.push('Student ID');
  if (/https?:\/\/[^\s]+/.test(text)) detected.push('URL');
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) detected.push('SSN');
  for (const name of COMMON_NAMES) {
    const namePattern = new RegExp(`\\b${name}\\b`, 'gi');
    if (namePattern.test(text)) { detected.push(`Possible name: ${name}`); break; }
  }
  return detected;
}
