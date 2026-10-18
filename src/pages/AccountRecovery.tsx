import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle, KeyRound, Mail, Search as UserSearch } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { AuthShell } from '../components/Login';

const inputClass = 'w-full px-4 py-2.5 rounded-lg border outline-none';
const inputStyle = { backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' };

function Notice({ kind, children }: { kind: 'success' | 'error'; children: React.ReactNode }) {
  const ok = kind === 'success';
  return (
    <div role={ok ? 'status' : 'alert'} className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ backgroundColor: ok ? '#D1FAE5' : '#FEE2E2', color: ok ? '#2E8B57' : '#C41E3A' }}>
      {ok ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
      <div>{children}</div>
    </div>
  );
}

function BackToLogin() {
  return <Link to="/login" className="mt-5 inline-flex items-center gap-1 text-xs hover:underline" style={{ color: '#002366' }}><ArrowLeft size={12} />Back to sign in</Link>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>
      {busy ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );
}

export function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setDone((await api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { identifier } })).message); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}><KeyRound size={20} style={{ color: '#B87333' }} />Reset your password</h2>
      <p className="text-xs mb-5" style={{ color: '#4B5563' }}>Enter your username or registered email. We will send a single-use link that expires in 30 minutes.</p>
      {done ? <Notice kind="success">{done}</Notice> : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium mb-1">Username or email</label>
            <input id="identifier" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} className={inputClass} style={inputStyle} required />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <SubmitButton busy={busy}><Mail size={16} />Send reset link</SubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}

export function RecoverUsername() {
  const [institutionalId, setInstitutionalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ message: string; hint?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setDone(await api<{ message: string; hint?: string }>('/auth/username/recover', { method: 'POST', body: { institutionalId } })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}><UserSearch size={20} style={{ color: '#B87333' }} />Recover your username</h2>
      <p className="text-xs mb-5" style={{ color: '#4B5563' }}>Enter your Student ID or Employee Number. Your username will be emailed to the address on file.</p>
      {done ? (
        <Notice kind="success">{done.message}{done.hint && <p className="mt-1 font-mono text-xs">{done.hint}</p>}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="institutional-id" className="block text-sm font-medium mb-1">Student ID / Employee Number</label>
            <input id="institutional-id" value={institutionalId} onChange={e => setInstitutionalId(e.target.value)} className={inputClass} style={inputStyle} placeholder="e.g. C24-001 or F001" required />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <SubmitButton busy={busy}><Mail size={16} />Email my username</SubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const isInvite = params.get('invite') === '1';
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setValid(false); return; }
    api<{ valid: boolean }>(`/auth/password/token?token=${encodeURIComponent(token)}`).then(r => setValid(r.valid)).catch(() => setValid(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    try {
      setDone((await api<{ message: string }>('/auth/password/reset', { method: 'POST', body: { token, password } })).message);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: '#002366' }}><KeyRound size={20} style={{ color: '#B87333' }} />{isInvite ? 'Set your password' : 'Choose a new password'}</h2>
      <p className="text-xs mb-5" style={{ color: '#4B5563' }}>Use 10–128 characters with at least one letter and one number. All other sessions will be signed out.</p>
      {valid === null && <p className="text-sm">Checking link…</p>}
      {valid === false && <Notice kind="error">This link is invalid or has expired. <Link to="/forgot-password" className="underline">Request a new one</Link>.</Notice>}
      {done && <Notice kind="success">{done}</Notice>}
      {valid && !done && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium mb-1">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} style={inputStyle} required />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Confirm password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} style={inputStyle} required />
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <SubmitButton busy={busy}>Save password</SubmitButton>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}
