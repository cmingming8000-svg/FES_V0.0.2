import React from 'react';
import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '../auth';

export default function SessionTimeoutWarning() {
  const { sessionWarningSeconds, staySignedIn, logout } = useAuth();
  if (sessionWarningSeconds === null) return null;

  const minutes = Math.floor(sessionWarningSeconds / 60);
  const seconds = String(sessionWarningSeconds % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="session-timeout-title">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm rounded-xl shadow-2xl p-6 text-center" style={{ backgroundColor: '#EDEBE8', border: '2px solid #B87333' }}>
        <div className="mx-auto mb-3 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
          <Clock size={28} style={{ color: '#B87333' }} />
        </div>
        <h3 id="session-timeout-title" className="text-lg font-semibold mb-1" style={{ color: '#002366' }}>Are you still there?</h3>
        <p className="text-sm mb-4" style={{ color: '#4B5563' }}>For your security, you will be signed out due to inactivity in</p>
        <p className="text-4xl font-bold tabular-nums mb-5" style={{ color: sessionWarningSeconds <= 30 ? '#C41E3A' : '#002366' }} aria-live="polite">
          {minutes}:{seconds}
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => logout()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-black/5" style={{ borderColor: '#D5D8DC' }}>
            <LogOut size={14} />Sign out
          </button>
          <button onClick={staySignedIn} autoFocus className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: '#002366' }}>
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
