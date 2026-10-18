import React, { useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../auth';
import { store } from '../store';
import type { EvaluationCycle } from '../types';
import { ROLE_LABELS } from '../utils/terminology';
import SessionTimeoutWarning from './SessionTimeoutWarning';
import { LogOut, BookOpen, Users, BarChart3, Settings, GraduationCap, Calendar } from 'lucide-react';

interface LayoutProps { children: ReactNode; viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void; }

export default function Layout({ children, viewingCycleId, onViewingCycleChange }: LayoutProps) {
  const { user, logout } = useAuth();
  const [cycles, setCycles] = useState<EvaluationCycle[]>([]);
  const [activeCycle, setActiveCycle] = useState<EvaluationCycle | undefined>();

  useEffect(() => {
    const load = () => { setCycles(store.getCycles()); setActiveCycle(store.getActiveCycle()); };
    load();
    return store.subscribe('cycle_changed', load);
  }, []);

  const getRoleIcon = () => {
    switch (user?.role) {
      case 'hr_qa': return <Settings size={16} />;
      case 'faculty': return <BookOpen size={16} />;
      case 'student': return <GraduationCap size={16} />;
      case 'dean': return <BarChart3 size={16} />;
      default: return <Users size={16} />;
    }
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'hr_qa': return { bg: '#C41E3A', text: '#FFFFFF' };
      case 'faculty': return { bg: '#002366', text: '#FFFFFF' };
      case 'student': return { bg: '#2E8B57', text: '#FFFFFF' };
      case 'dean': return { bg: '#B87333', text: '#FFFFFF' };
      default: return { bg: '#1A1A1A', text: '#FFFFFF' };
    }
  };

  const badge = getRoleBadgeColor();
  const isViewingArchived = viewingCycleId && viewingCycleId !== activeCycle?.id;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#D5D8DC' }}>
      <SessionTimeoutWarning />
      <nav className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#002366' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #002366, #003399)', border: '2px solid #B87333' }}>
                <span className="text-lg font-bold" style={{ fontFamily: 'Georgia, serif', color: '#B87333' }}>W</span>
              </div>
              <div><h1 className="text-white font-bold text-base leading-tight">FES</h1><p className="text-[10px] leading-tight" style={{ color: '#B87333' }}>Faculty Evaluation System</p></div>
            </div>
            {activeCycle && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(46,139,87,0.2)', border: '1px solid rgba(46,139,87,0.5)' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-bold text-green-300">ACTIVE TERM:</span>
                <span className="text-xs font-semibold text-white">{activeCycle.displayName}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: badge.bg, color: badge.text }}>{getRoleIcon()}<span className="hidden sm:inline">{user ? ROLE_LABELS[user.role] : ''}</span></div>
                <span className="text-white text-xs hidden lg:block">{user?.displayName}</span>
              </div>
              <button onClick={() => logout()} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-90" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}><LogOut size={14} /><span className="hidden sm:inline">Logout</span></button>
            </div>
          </div>
        </div>
      </nav>
      {onViewingCycleChange && cycles.length > 0 && (
        <div className="sticky top-14 z-40 shadow-sm" style={{ backgroundColor: '#EDEBE8' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={14} style={{ color: '#B87333' }} />
              <label htmlFor="viewing-term" className="text-xs font-medium">Academic Term / Semester:</label>
              <select id="viewing-term" value={viewingCycleId || activeCycle?.id || ''} onChange={e => onViewingCycleChange(e.target.value)} className="px-2 py-1 rounded-lg border text-xs outline-none" style={{ backgroundColor: '#F8F6F1', borderColor: '#D5D8DC' }}>
                {cycles.filter(c => c.status !== 'upcoming').map(c => (<option key={c.id} value={c.id}>{c.displayName} {c.id === activeCycle?.id ? '(Active)' : c.status === 'archived' ? '(Archived)' : ''}</option>))}
              </select>
            </div>
            {isViewingArchived && <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: '#FEF3C7', border: '1px solid #B87333' }}><span className="text-xs">⚠️</span><span className="text-xs font-medium" style={{ color: '#B87333' }}>Viewing a previous Academic Term</span></div>}
          </div>
        </div>
      )}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">{children}</main>
      <footer className="py-4 text-center text-xs" style={{ backgroundColor: '#1A1A1A', color: '#9CA3AF' }}>
        <p>FES © 2026 — Faculty Evaluation System. Student responses are confidential under RA 10173; e-signatures are governed by RA 8792.</p>
      </footer>
    </div>
  );
}
