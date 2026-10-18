import { config } from './config';
import { createApp } from './app';
import { pool } from './db/pool';
import { purgeExpiredSessionsAndTokens } from './security/sessions';

if (config.isProduction && !config.mail.resendApiKey) {
  console.warn('WARNING: RESEND_API_KEY is not set; password reset and invitation emails cannot be delivered.');
}

const server = createApp().listen(config.port, () => {
  console.log(`FES API listening on http://localhost:${config.port} (${config.env})`);
});

const cleanup = setInterval(() => {
  purgeExpiredSessionsAndTokens().catch(err => console.error('Session cleanup failed:', err));
}, 60 * 60_000);

function shutdown(): void {
  clearInterval(cleanup);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
