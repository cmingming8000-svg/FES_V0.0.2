import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { notFound } from './lib/http';
import { loadSession } from './middleware/auth';
import { errorHandler } from './middleware/errors';
import { apiLimiter, csrfGuard, noStore } from './middleware/security';
import { accountsRouter } from './routes/accounts';
import { agreementsRouter } from './routes/agreements';
import { auditRouter } from './routes/audit';
import { authRouter } from './routes/auth';
import { criteriaRouter } from './routes/criteria';
import { dataRouter } from './routes/data';
import { termsRouter } from './routes/terms';
import { tnaRouter } from './routes/tna';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      strictTransportSecurity: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  const api = express.Router();
  api.use(noStore, apiLimiter, express.json({ limit: '2mb' }), cookieParser(), csrfGuard, loadSession);
  api.use('/auth', authRouter);
  api.use('/', dataRouter);
  api.use('/cycles', termsRouter);
  api.use('/', criteriaRouter);
  api.use('/accounts', accountsRouter);
  api.use('/agreements', agreementsRouter);
  api.use('/audit', auditRouter);
  api.use('/tna', tnaRouter);
  api.use(() => {
    throw notFound('Unknown API endpoint');
  });
  app.use('/api', api);

  // Production: serve the built SPA from the same origin so cookies stay first-party.
  const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
  if (existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile(join(distDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
