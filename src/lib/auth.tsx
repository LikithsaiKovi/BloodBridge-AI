/**
 * BloodBridge AI — Auth Context
 * Provides user state, login, logout, register across the entire app.
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'bb_token';
const USER_KEY  = 'bb_user';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'donor' | 'patient' | 'coordinator';

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  blood_group?: string;
  city?: string;
  phone?: string;
  avatar_initials?: string;
  linked_donor_id?: string;
  linked_patient_id?: string;
  donor_profile?: Record<string, any>;
  patient_profile?: Record<string, any>;
  created_at?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  blood_group?: string;
  city?: string;
  phone?: string;
  // Donor
  last_donation_date?: string;
  frequency_in_days?: number;
  // Patient
  next_transfusion_date?: string;
  hospital?: string;
  units_needed?: number;
  age?: number;
  gender?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<{ message: string }>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; dev_otp?: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ message: string }>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

async function apiCall(method: string, path: string, body?: unknown, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({ detail: res.statusText }));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser  = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const saveSession = (tkn: string, usr: AuthUser) => {
    setToken(tkn);
    setUser(usr);
    localStorage.setItem(TOKEN_KEY, tkn);
    localStorage.setItem(USER_KEY, JSON.stringify(usr));
  };

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiCall('POST', '/api/auth/login', { email, password });
    saveSession(data.token, data.user);
  }, []);

  const register = useCallback(async (formData: RegisterData) => {
    const data = await apiCall('POST', '/api/auth/register', formData);
    saveSession(data.token, data.user);
    return { message: data.message };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const refreshMe = useCallback(async () => {
    const tkn = localStorage.getItem(TOKEN_KEY);
    if (!tkn) return;
    try {
      const data = await apiCall('GET', '/api/auth/me', undefined, tkn);
      setUser(data);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
    } catch {
      logout();
    }
  }, [logout]);

  const forgotPassword = useCallback(async (email: string) => {
    return apiCall('POST', '/api/auth/forgot-password', { email });
  }, []);

  const resetPassword = useCallback(async (email: string, otp: string, newPassword: string) => {
    return apiCall('POST', '/api/auth/reset-password', { email, otp, new_password: newPassword });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshMe, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
