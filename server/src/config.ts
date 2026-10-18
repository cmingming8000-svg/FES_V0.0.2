import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform(v => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MIGRATION_DATABASE_URL: z.string().optional(),
  DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).optional(),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(15).max(30).default(15),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  COOKIE_SECURE: bool.default('true'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(15).max(30).default(30),
  INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('FES Notifications <no-reply@example.edu.ph>'),
  SEED_DEMO_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid server configuration:\n' + parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  migrationDatabaseUrl: env.MIGRATION_DATABASE_URL || env.DATABASE_URL,
  dbAppRole: env.DB_APP_ROLE,
  appBaseUrl: env.APP_BASE_URL.replace(/\/$/, ''),
  appOrigin: new URL(env.APP_BASE_URL).origin,
  session: {
    idleMinutes: env.SESSION_IDLE_MINUTES,
    absoluteHours: env.SESSION_ABSOLUTE_HOURS,
    cookieSecure: env.COOKIE_SECURE ?? true,
    // The __Host- prefix forces Secure, Path=/ and no Domain attribute.
    cookieName: (env.COOKIE_SECURE ?? true) ? '__Host-fes_sid' : 'fes_sid',
  },
  trustProxy: env.TRUST_PROXY,
  lockout: {
    maxFailedAttempts: env.LOGIN_MAX_FAILED_ATTEMPTS,
    lockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
  },
  tokens: {
    passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    inviteTtlHours: env.INVITE_TTL_HOURS,
  },
  mail: {
    resendApiKey: env.RESEND_API_KEY || undefined,
    from: env.MAIL_FROM,
  },
  seedDemoPassword: env.SEED_DEMO_PASSWORD,
} as const;
