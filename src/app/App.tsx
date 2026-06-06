import {
  BrowserRouter as Router, Routes, Route, Link,
  useLocation, useNavigate, Navigate
} from 'react-router';
import {
  Activity, Brain, Users, Heart, LayoutDashboard,
  Zap, Shield, ChevronRight, Wifi, WifiOff,
  Menu, X, LogOut, Droplet, TrendingUp
} from 'lucide-react';
import ThalassemiaHub from './components/ThalassemiaHub';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import DemandForecast from './components/DemandForecast';
import DonorIntelligence from './components/DonorIntelligence';
import SmartScheduling from './components/SmartScheduling';
import { cn } from './components/ui/utils';
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { AiSchedulingBot } from './components/AiSchedulingBot';
import { wsManager } from '../lib/websocket';
import { AuthProvider, useAuth, UserRole } from '../lib/auth';

// Lazy load heavy pages
const CommandCenter     = lazy(() => import('./components/CommandCenter'));
const PatientManagement = lazy(() => import('./components/PatientManagement'));
const MatchingEngine    = lazy(() => import('./components/MatchingEngine'));
const OutreachCenter    = lazy(() => import('./components/OutreachCenter'));
const AuthPage          = lazy(() => import('./pages/AuthPage'));
const DonorDashboard    = lazy(() => import('./pages/DonorDashboard'));
const PatientDashboard  = lazy(() => import('./pages/PatientDashboard'));

// ─── Role-based nav config ────────────────────────────────────────────────────

const donorNav = [
  { path: '/donor-dashboard', icon: Heart,          label: 'My Dashboard',      color: 'from-[#D90429] to-[#EF233C]' },
  { path: '/',                icon: Brain,           label: 'Thalassemia Hub',   color: 'from-purple-500 to-pink-500' },
];

const patientNav = [
  { path: '/patient-dashboard', icon: Shield,       label: 'My Dashboard',      color: 'from-blue-500 to-indigo-500' },
  { path: '/',                  icon: Brain,         label: 'Thalassemia Hub',   color: 'from-purple-500 to-pink-500' },
];

const coordinatorNavGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/command', icon: LayoutDashboard, label: 'Command Center',     color: 'from-slate-600 to-slate-800' },
      { path: '/',        icon: Heart,           label: 'Thalassemia Hub',    color: 'from-[#D90429] to-[#EF233C]' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/patients', icon: Shield,   label: 'Patient Management', color: 'from-blue-500 to-indigo-500' },
      { path: '/donors',   icon: Users,    label: 'Donor Intelligence',  color: 'from-blue-500 to-cyan-500' },
      { path: '/matching', icon: Zap,      label: 'Matching Engine',     color: 'from-[#D90429] to-[#EF233C]' },
      { path: '/analytics',icon: TrendingUp,label: 'Analytics',          color: 'from-purple-500 to-violet-500' },
    ],
  },
];

// ─── Protected Route ──────────────────────────────────────────────────────────

function ProtectedRoute({
  children, allowedRoles,
}: { children: React.ReactNode; allowedRoles?: UserRole[] }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const redirects: Record<UserRole, string> = {
      donor: '/donor-dashboard', patient: '/patient-dashboard', coordinator: '/command',
    };
    return <Navigate to={redirects[user.role]} replace />;
  }
  return <>{children}</>;
}

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────

function NavItem({ item, onClick }: { item: { path: string; icon: any; label: string; color: string }; onClick?: () => void }) {
  const location = useLocation();
  const Icon = item.icon;
  const isActive = location.pathname === item.path;
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden',
        isActive ? 'bg-white shadow-lg shadow-gray-200/50' : 'hover:bg-white/70'
      )}
    >
      {isActive && <div className={cn('absolute inset-0 bg-gradient-to-r opacity-5', item.color)} />}
      <div className={cn(
        'relative w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0',
        isActive ? `bg-gradient-to-br ${item.color} shadow-lg` : 'bg-gray-100 group-hover:bg-gray-200'
      )}>
        <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-gray-600')} />
      </div>
      <span className={cn('font-medium text-sm', isActive ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900')}>
        {item.label}
      </span>
      {isActive && <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
    </Link>
  );
}

// ─── Sidebar Content ──────────────────────────────────────────────────────────

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    wsManager.connect();
    const unsub = wsManager.onStatus(s => setWsConnected(s === 'connected'));
    return () => { unsub(); };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/auth');
    onClose?.();
  };

  const role = user?.role ?? 'coordinator';
  const roleLabel = role === 'donor' ? 'Blood Donor' : role === 'patient' ? 'Thalassemia Patient' : 'Coordinator';
  const roleColor = role === 'donor' ? 'text-red-600 bg-red-50' : role === 'patient' ? 'text-blue-600 bg-blue-50' : 'text-purple-600 bg-purple-50';

  const flatDonorNav    = donorNav;
  const flatPatientNav  = patientNav;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-gray-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-lg shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 text-sm leading-tight">BloodBridge AI</h1>
            <p className="text-xs text-gray-500 truncate">Predictive Care Platform</p>
          </div>
          <div className="flex items-center gap-1 shrink-0" title={wsConnected ? 'Live' : 'Connecting'}>
            {wsConnected
              ? <><Wifi className="w-3.5 h-3.5 text-green-500" /><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /></>
              : <WifiOff className="w-3.5 h-3.5 text-gray-400" />}
          </div>
          {onClose && (
            <button onClick={onClose} className="ml-1 p-1 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* User chip */}
        {user && (
          <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center text-white text-sm font-bold shrink-0">
                {user.avatar_initials || user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', roleColor)}>{roleLabel}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {role === 'donor' && flatDonorNav.map(item => (
          <NavItem key={item.path} item={item} onClick={onClose} />
        ))}

        {role === 'patient' && flatPatientNav.map(item => (
          <NavItem key={item.path} item={item} onClick={onClose} />
        ))}

        {role === 'coordinator' && coordinatorNavGroups.map(group => (
          <div key={group.label} className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1.5">{group.label}</p>
            {group.items.map(item => <NavItem key={item.path} item={item} onClick={onClose} />)}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200/80 space-y-2">
        {/* AI badge */}
        <div className="bg-gradient-to-br from-[#D90429]/8 to-[#EF233C]/8 rounded-xl p-3 border border-[#D90429]/15">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-md shrink-0">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs text-gray-900">XGBoost AI Active</p>
              <p className="text-xs text-gray-500">Donor predictions live</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>
        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group"
        >
          <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors">
            <LogOut className="w-4 h-4" />
          </div>
          <span className="font-medium text-sm">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar Wrapper (desktop fixed + mobile drawer) ─────────────────────────

function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">BloodBridge AI</span>
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div className={cn(
        'lg:hidden fixed top-0 left-0 h-screen w-72 bg-white z-50 shadow-2xl transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen w-64 xl:w-72 bg-gradient-to-b from-white to-gray-50 border-r border-gray-200/80 z-30">
        <SidebarContent />
      </div>
    </>
  );
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-lg animate-pulse">
          <Activity className="w-6 h-6 text-white" />
        </div>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

// ─── App Shell (with nav) ─────────────────────────────────────────────────────

function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Sidebar />
      {/* Content: offset for sidebar on desktop, offset for top bar on mobile */}
      <div className="lg:ml-64 xl:ml-72 pt-14 lg:pt-0 relative">
        {children}
        {user?.role === 'coordinator' && <AiSchedulingBot />}
      </div>
    </div>
  );
}

// ─── Role Redirect ────────────────────────────────────────────────────────────

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role === 'donor')       return <Navigate to="/donor-dashboard" replace />;
  if (user.role === 'patient')     return <Navigate to="/patient-dashboard" replace />;
  return <Navigate to="/command" replace />;
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Role redirect from root */}
            <Route path="/dashboard" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />

            {/* Donor-only */}
            <Route path="/donor-dashboard" element={
              <ProtectedRoute allowedRoles={['donor']}>
                <AppShell><DonorDashboard /></AppShell>
              </ProtectedRoute>
            } />

            {/* Patient-only */}
            <Route path="/patient-dashboard" element={
              <ProtectedRoute allowedRoles={['patient']}>
                <AppShell><PatientDashboard /></AppShell>
              </ProtectedRoute>
            } />

            {/* Shared — Thalassemia Hub (all roles) */}
            <Route path="/" element={
              <ProtectedRoute>
                <AppShell><ThalassemiaHub /></AppShell>
              </ProtectedRoute>
            } />

            {/* Coordinator-only operations */}
            <Route path="/command" element={
              <ProtectedRoute allowedRoles={['coordinator']}>
                <AppShell><CommandCenter /></AppShell>
              </ProtectedRoute>
            } />
            <Route path="/patients" element={
              <ProtectedRoute allowedRoles={['coordinator']}>
                <AppShell><PatientManagement /></AppShell>
              </ProtectedRoute>
            } />
            <Route path="/donors" element={
              <ProtectedRoute allowedRoles={['coordinator']}>
                <AppShell><DonorIntelligence /></AppShell>
              </ProtectedRoute>
            } />
            <Route path="/matching" element={
              <ProtectedRoute allowedRoles={['coordinator']}>
                <AppShell><MatchingEngine /></AppShell>
              </ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute allowedRoles={['coordinator']}>
                <AppShell><AnalyticsDashboard /></AppShell>
              </ProtectedRoute>
            } />


            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}
