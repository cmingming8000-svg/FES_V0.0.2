import { config } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email via Resend. Without RESEND_API_KEY (development) the
 * message is printed to the server console so links can be followed locally.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (!config.mail.resendApiKey) {
    if (config.isProduction) throw new Error('RESEND_API_KEY is not configured');
    console.info(`\n[mail:dev] To: ${message.to}\n[mail:dev] Subject: ${message.subject}\n${message.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mail.from, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!res.ok) throw new Error(`Email delivery failed with status ${res.status}`);
}

/** Fire-and-forget delivery for flows whose HTTP response must not depend on email success. */
export function sendMailInBackground(message: MailMessage): void {
  sendMail(message).catch(err => console.error(`Failed to send "${message.subject}" email:`, err));
}

export function maskEmail(email: string): string {
  const [local, domain = ''] = email.split('@');
  const [host, ...rest] = domain.split('.');
  const maskPart = (s: string) => (s.length <= 1 ? '•' : `${s[0]}${'•'.repeat(Math.min(Math.max(s.length - 1, 2), 6))}`);
  return `${maskPart(local)}@${maskPart(host ?? '')}${rest.length ? '.' + rest.join('.') : ''}`;
}
