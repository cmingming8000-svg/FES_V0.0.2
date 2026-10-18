import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { store } from './store';
import Layout from './components/Layout';
import Login from './components/Login';
import StudentDashboard from './pages/StudentDashboard';
import FacultyDashboard from './pages/FacultyDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DeanDashboard from './pages/DeanDashboard';
import AccountCreation from './pages/AccountCreation';
import { ForgotPassword, RecoverUsername, ResetPassword } from './pages/AccountRecovery';
import type { UserRole } from './types';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: UserRole[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return <DashboardWithLayout>{children}</DashboardWithLayout>;
}

function DashboardWithLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [viewingCycleId, setViewingCycleId] = useState<string>('');
  const showFilter = user?.role !== 'student';

  useEffect(() => {
    if (viewingCycleId) store.ensureCycleLoaded(viewingCycleId).catch(() => undefined);
  }, [viewingCycleId]);

  const enhancedChildren = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, { viewingCycleId, onViewingCycleChange: setViewingCycleId })
    : children;

  return (
    <Layout viewingCycleId={viewingCycleId} onViewingCycleChange={showFilter ? setViewingCycleId : undefined}>
      {enhancedChildren}
    </Layout>
  );
}

function AppRoutes() {
  const { user, initializing } = useAuth();
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#D5D8DC' }}>
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: '#002366', borderTopColor: 'transparent' }} />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/recover-username" element={<RecoverUsername />} />
      <Route path="/" element={<ProtectedRoute allowedRoles={['hr_qa', 'faculty', 'student', 'dean']}><DashboardRouterWrapper /></ProtectedRoute>} />
      <Route path="/create-account" element={<ProtectedRoute allowedRoles={['hr_qa']}><AccountCreation /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DashboardRouterWrapper({ viewingCycleId = '', onViewingCycleChange = () => {} }: { viewingCycleId?: string; onViewingCycleChange?: (cycleId: string) => void }) {
  return <DashboardRouter viewingCycleId={viewingCycleId} onViewingCycleChange={onViewingCycleChange} />;
}

function DashboardRouter({ viewingCycleId, onViewingCycleChange }: { viewingCycleId: string; onViewingCycleChange: (cycleId: string) => void }) {
  const { user } = useAuth();
  switch (user?.role) {
    case 'hr_qa': return <AdminDashboard viewingCycleId={viewingCycleId} onViewingCycleChange={onViewingCycleChange} />;
    case 'faculty': return <FacultyDashboard viewingCycleId={viewingCycleId} onViewingCycleChange={onViewingCycleChange} />;
    case 'student': return <StudentDashboard viewingCycleId={viewingCycleId} onViewingCycleChange={onViewingCycleChange} />;
    case 'dean': return <DeanDashboard viewingCycleId={viewingCycleId} onViewingCycleChange={onViewingCycleChange} />;
    default: return <Navigate to="/login" replace />;
  }
}

export default function App() {
  return (<BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>);
}
