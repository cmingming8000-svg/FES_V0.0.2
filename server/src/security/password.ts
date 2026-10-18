import { hash, verify } from '@node-rs/argon2';

// OWASP-recommended Argon2id baseline (m=19 MiB, t=2, p=1). Salts are generated per hash.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** Burns the same verification cost for unknown users so login timing does not reveal valid usernames. */
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= hashPassword('fes-timing-equalizer-not-a-real-password');
  await verifyPassword(await dummyHash, plain);
}

export const PASSWORD_POLICY_TEXT = 'Passwords must be 10–128 characters and include at least one letter and one number.';

export function passwordPolicyError(password: string, username?: string): string | null {
  if (password.length < 10 || password.length > 128) return PASSWORD_POLICY_TEXT;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_POLICY_TEXT;
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'Password must not contain your username.';
  return null;
}
