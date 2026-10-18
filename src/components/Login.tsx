import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api/client';
import { LogIn, Shield, AlertCircle, Calendar } from 'lucide-react';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  useEffect(() => {
    api<{ displayName: string | null }>('/public/active-term').then(r => setActiveTerm(r.displayName)).catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #D5D8DC 0%, #EDEBE8 100%)' }}>
      <div className="w-full max-w-md">
        {activeTerm && (
          <div className="mb-4 rounded-xl p-3 flex items-center gap-2 shadow-sm" style={{ backgroundColor: '#EDEBE8', border: '1px solid #B87333' }}>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <Calendar size={16} style={{ color: '#B87333' }} className="flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#B87333' }}>Current Academic Term / Semester</p>
              <p className="text-sm font-semibold" style={{ color: '#002366' }}>{activeTerm}</p>
            </div>
          </div>
        )}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, #002366, #003399)', border: '3px solid #B87333' }}>
            <span className="text-4xl font-bold" style={{ fontFamily: 'Georgia, serif', color: '#B87333' }}>W</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#002366' }}>FES</h1>
          <p className="text-sm" style={{ color: '#1A1A1A' }}>Faculty Evaluation System</p>
        </div>
        <div className="rounded-xl shadow-lg p-8" style={{ backgroundColor: '#EDEBE8' }}>{children}</div>
        <p className="text-[10px] text-center mt-4" style={{ color: '#6B7280' }}>Protected under RA 10173 (Data Privacy Act of 2012). Unauthorized access is prohibited and logged.</p>
      </div>
    </div>
  );
}

export default function Login() {
  const { login, isLoading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await login(username, password)) return;
    setPassword('');
  };

  return (
    <AuthShell>
      <div className="flex items-center gap-2 mb-6"><Shield size={20} style={{ color: '#B87333' }} /><h2 className="text-lg font-semibold" style={{ color: '#002366' }}>Secure Login</h2></div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
          <input id="username" type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} placeholder="Enter username" required />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }} placeholder="Enter password" required />
        </div>
        {error && <div role="alert" className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: '#FEE2E2', color: '#C41E3A' }}><AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span></div>}
        <button type="submit" disabled={isLoading} className="w-full py-2.5 rounded-lg font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#002366' }}>
          {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><LogIn size={18} />Sign In</>}
        </button>
      </form>
      <div className="mt-5 flex justify-between text-xs">
        <Link to="/forgot-password" className="hover:underline" style={{ color: '#002366' }}>Forgot password?</Link>
        <Link to="/recover-username" className="hover:underline" style={{ color: '#002366' }}>Forgot username?</Link>
      </div>
    </AuthShell>
  );
}
