import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, UNAUTHORIZED_EVENT, api, errorMessage } from './api/client';
import { store } from './store';
import type { MeResponse, PublicUser } from './types';

interface AuthContextType {
  user: PublicUser | null;
  initializing: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: (reason?: string) => Promise<void>;
  /** Seconds until automatic sign-out while the inactivity warning is showing, otherwise null. */
  sessionWarningSeconds: number | null;
  staySignedIn: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const WARNING_WINDOW_MS = 2 * 60_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const ACTIVITY_KEY = 'fes:lastActivity';
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionWarningSeconds, setSessionWarningSeconds] = useState<number | null>(null);
  const idleTimeoutMs = useRef(15 * 60_000);
  const lastActivity = useRef(Date.now());
  const lastHeartbeat = useRef(Date.now());
  const warningVisible = useRef(false);

  const endSession = useCallback((message: string | null) => {
    store.clear();
    setUser(null);
    setSessionWarningSeconds(null);
    warningVisible.current = false;
    setError(message);
  }, []);

  const startSession = useCallback(async (me: MeResponse) => {
    idleTimeoutMs.current = me.session.idleTimeoutSeconds * 1000;
    lastActivity.current = Date.now();
    lastHeartbeat.current = Date.now();
    await store.hydrate();
    setUser(me.user);
  }, []);

  useEffect(() => {
    api<MeResponse>('/auth/me')
      .then(startSession)
      .catch(() => undefined)
      .finally(() => setInitializing(false));
  }, [startSession]);

  useEffect(() => {
    const onUnauthorized = () => endSession('Your session has expired. Please sign in again.');
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [endSession]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await startSession(await api<MeResponse>('/auth/login', { method: 'POST', body: { username, password } }));
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err, 'Authentication failed'));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [startSession]);

  const logout = useCallback(async (reason?: string) => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    localStorage.removeItem(ACTIVITY_KEY);
    endSession(reason ?? null);
  }, [endSession]);

  const heartbeat = useCallback(() => {
    lastHeartbeat.current = Date.now();
    api('/auth/heartbeat', { method: 'POST' }).catch(() => undefined);
  }, []);

  const recordActivity = useCallback((now = Date.now()) => {
    lastActivity.current = now;
    try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* storage unavailable */ }
    if (now - lastHeartbeat.current > HEARTBEAT_INTERVAL_MS) heartbeat();
  }, [heartbeat]);

  const staySignedIn = useCallback(() => {
    warningVisible.current = false;
    setSessionWarningSeconds(null);
    recordActivity();
    heartbeat();
  }, [recordActivity, heartbeat]);

  // Inactivity monitor (shared across tabs via localStorage).
  useEffect(() => {
    if (!user) return;
    let throttle = 0;
    const onActivity = () => {
      if (warningVisible.current) return; // require an explicit "Stay signed in"
      const now = Date.now();
      if (now - throttle < 5_000) return;
      throttle = now;
      recordActivity(now);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(e.newValue));
        if (warningVisible.current && Date.now() - lastActivity.current < idleTimeoutMs.current - WARNING_WINDOW_MS) {
          warningVisible.current = false;
          setSessionWarningSeconds(null);
        }
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') store.refreshIfStale().catch(() => undefined);
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleTimeoutMs.current) {
        window.clearInterval(timer);
        logout(`You were signed out after ${Math.round(idleTimeoutMs.current / 60_000)} minutes of inactivity.`);
      } else if (idle >= idleTimeoutMs.current - WARNING_WINDOW_MS) {
        warningVisible.current = true;
        setSessionWarningSeconds(Math.ceil((idleTimeoutMs.current - idle) / 1000));
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [user, logout, recordActivity]);

  return (
    <AuthContext.Provider value={{ user, initializing, isLoading, error, login, logout, sessionWarningSeconds, staySignedIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
