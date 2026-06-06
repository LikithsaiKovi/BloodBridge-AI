import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth, RegisterData, UserRole } from '../../lib/auth';
import {
  Activity, Eye, EyeOff, Heart, Droplet, Shield, Mail, Lock, User, Phone, MapPin,
  ChevronRight, ChevronLeft, ArrowLeft, Loader2, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ───────────────────────────────────────────────────────────────────

type AuthView = 'signin' | 'register' | 'forgot' | 'reset' | 'verify';

// ─── Floating Blood Drop SVG ─────────────────────────────────────────────────

function FloatingDrop({
  size, x, y, delay, duration, opacity
}: {
  size: number; x: number; y: number; delay: number; duration: number; opacity: number;
}) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, opacity }}
      animate={{
        y: [0, -24, 0],
        rotate: [0, 8, -8, 0],
        scale: [1, 1.08, 1],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <svg width={size} height={size * 1.25} viewBox="0 0 40 50" fill="none">
        <path
          d="M20 2 C20 2 4 22 4 32 C4 41.9 11.2 48 20 48 C28.8 48 36 41.9 36 32 C36 22 20 2 20 2Z"
          fill="url(#dropGrad)"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        <ellipse cx="14" cy="28" rx="4" ry="6" fill="rgba(255,255,255,0.18)" transform="rotate(-15 14 28)" />
        <defs>
          <linearGradient id="dropGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EF233C" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#D90429" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

// ─── Left Brand Panel ─────────────────────────────────────────────────────────

function BrandPanel() {
  const drops = [
    { size: 55, x: 8,  y: 10, delay: 0,    duration: 6,   opacity: 0.55 },
    { size: 38, x: 75, y: 5,  delay: 1.2,  duration: 7.5, opacity: 0.40 },
    { size: 70, x: 60, y: 68, delay: 0.5,  duration: 8,   opacity: 0.45 },
    { size: 28, x: 20, y: 75, delay: 2,    duration: 5.5, opacity: 0.35 },
    { size: 44, x: 85, y: 35, delay: 1.5,  duration: 9,   opacity: 0.50 },
    { size: 32, x: 40, y: 88, delay: 0.8,  duration: 6.5, opacity: 0.30 },
    { size: 58, x: 5,  y: 50, delay: 2.5,  duration: 7,   opacity: 0.40 },
    { size: 22, x: 90, y: 80, delay: 3,    duration: 5,   opacity: 0.25 },
    { size: 48, x: 50, y: 20, delay: 1.8,  duration: 8.5, opacity: 0.45 },
  ];

  return (
    <div
      className="hidden md:flex relative flex-col justify-between h-full overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
    >
      {/* Animated drops */}
      {drops.map((d, i) => <FloatingDrop key={i} {...d} />)}

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Top logo mark */}
      <div className="relative z-10 p-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-lg shadow-red-900/40">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">BloodBridge</p>
            <p className="text-[#EF233C] text-xs font-semibold tracking-wider uppercase">AI Platform</p>
          </div>
        </div>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-start px-10 pb-4">
        {/* Glowing heart */}
        <motion.div
          className="mb-8 relative"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="absolute inset-0 blur-3xl bg-[#D90429]/30 rounded-full scale-150" />
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#D90429]/30 to-[#EF233C]/20 border border-white/10 flex items-center justify-center backdrop-blur-sm">
            <Heart className="w-10 h-10 text-[#EF233C] fill-[#EF233C]/40" />
          </div>
        </motion.div>

        <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
          Saving lives through<br />
          <span className="bg-gradient-to-r from-[#EF233C] to-[#ff6b6b] bg-clip-text text-transparent">
            AI‑powered
          </span>{' '}
          donor matching
        </h2>
        <p className="text-white/60 text-base leading-relaxed mb-8 max-w-sm">
          Connect donors, patients, and coordinators through intelligent blood-type matching powered by XGBoost predictive models.
        </p>

        {/* Feature pills */}
        <div className="flex flex-col gap-3">
          {[
            { emoji: '🧠', text: 'XGBoost AI Predictions' },
            { emoji: '🩸', text: 'Smart Donor Matching' },
            { emoji: '📊', text: 'Live Analytics Dashboard' },
          ].map((pill, i) => (
            <motion.div
              key={pill.text}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.15, duration: 0.5 }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/8 border border-white/10 backdrop-blur-sm w-fit"
            >
              <span className="text-lg">{pill.emoji}</span>
              <span className="text-white/80 text-sm font-medium">{pill.text}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom stats */}
      <div className="relative z-10 px-10 pb-10">
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: '12K+', label: 'Donors' },
            { value: '98%', label: 'Match Rate' },
            { value: '47ms', label: 'Avg Match' },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-extrabold text-white">{stat.value}</p>
              <p className="text-white/50 text-xs mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable Input ───────────────────────────────────────────────────────────

function InputField({
  label, type = 'text', placeholder, value, onChange, icon: Icon, rightElement, helper, required, min, max, step
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string | number;
  onChange: (v: string) => void;
  icon?: React.ElementType;
  rightElement?: React.ReactNode;
  helper?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-[#D90429] ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          className={`w-full rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm
            placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D90429]/25 focus:border-[#D90429]/50
            focus:bg-white transition-all duration-200 py-2.5 pr-4
            ${Icon ? 'pl-10' : 'pl-4'}
            ${rightElement ? 'pr-10' : ''}`}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {helper && <p className="text-xs text-gray-400">{helper}</p>}
    </div>
  );
}

// ─── SelectField ─────────────────────────────────────────────────────────────

function SelectField({
  label, value, onChange, options, icon: Icon, required
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ElementType;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-[#D90429] ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm
            focus:outline-none focus:ring-2 focus:ring-[#D90429]/25 focus:border-[#D90429]/50
            focus:bg-white transition-all duration-200 py-2.5 pr-4 appearance-none cursor-pointer
            ${Icon ? 'pl-10' : 'pl-4'}`}
        >
          <option value="">Select…</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          <ChevronRight className="w-4 h-4 rotate-90" />
        </div>
      </div>
    </div>
  );
}

// ─── Alert Box ────────────────────────────────────────────────────────────────

function AlertBox({ type, message }: { type: 'error' | 'success' | 'info'; message: string }) {
  const styles = {
    error:   'bg-red-50 border-red-200 text-red-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    info:    'bg-blue-50 border-blue-200 text-blue-700',
  };
  const icons = {
    error:   <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    success: <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    info:    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium ${styles[type]}`}
    >
      {icons[type]}
      <span>{message}</span>
    </motion.div>
  );
}

// ─── Primary Button ───────────────────────────────────────────────────────────

function PrimaryButton({
  onClick, loading, children, disabled, type = 'button'
}: {
  onClick?: () => void;
  loading?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl
        bg-gradient-to-r from-[#D90429] to-[#EF233C] text-white font-semibold text-sm
        shadow-lg shadow-red-500/25 hover:shadow-red-500/40
        hover:from-[#c00323] hover:to-[#d91a30]
        active:scale-[0.98] transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Blood Group Options ──────────────────────────────────────────────────────

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(g => ({ value: g, label: g }));
const FREQUENCIES  = [
  { value: '56',  label: 'Every 56 days (whole blood)' },
  { value: '84',  label: 'Every 84 days (plasma)' },
  { value: '90',  label: 'Every 90 days' },
  { value: '112', label: 'Every 112 days (platelets)' },
];
const GENDERS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other' },
];

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({
  role, emoji, title, subtitle, highlights, gradient, selected, onSelect
}: {
  role: UserRole;
  emoji: string;
  title: string;
  subtitle: string;
  highlights: string[];
  gradient: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.99 }}
      className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 relative overflow-hidden
        ${selected
          ? `border-transparent ring-2 ring-offset-1 shadow-lg scale-[1.02]`
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md bg-white'
        }`}
      style={selected ? {
        background: 'white',
        boxShadow: `0 8px 24px rgba(0,0,0,0.10)`,
      } : {}}
    >
      {/* Gradient accent bar when selected */}
      {selected && (
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      )}
      {/* Check mark */}
      {selected && (
        <div className={`absolute top-3 right-3 w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-2">{subtitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {highlights.map(h => (
              <span
                key={h}
                className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${selected ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-600'}`}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuthPage() {
  const navigate  = useNavigate();
  const auth      = useAuth();

  const [view,         setView        ] = useState<AuthView>('signin');
  const [step,         setStep        ] = useState(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [loading,      setLoading     ] = useState(false);
  const [error,        setError       ] = useState('');
  const [success,      setSuccess     ] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [devOtp,       setDevOtp      ] = useState('');

  // Form state — sign in
  const [siEmail,    setSiEmail   ] = useState('');
  const [siPassword, setSiPassword] = useState('');

  // Form state — register
  const [regName,        setRegName       ] = useState('');
  const [regEmail,       setRegEmail      ] = useState('');
  const [regPassword,    setRegPassword   ] = useState('');
  const [regPhone,       setRegPhone      ] = useState('');
  const [regCity,        setRegCity       ] = useState('');
  const [regPreferredLoc, setRegPreferredLoc] = useState('');
  const [currentLat,     setCurrentLat    ] = useState<number | undefined>();
  const [currentLon,     setCurrentLon    ] = useState<number | undefined>();
  const [locationStatus, setLocationStatus] = useState('');
  const [regBloodGroup,  setRegBloodGroup ] = useState('');
  const [regLastDonate,  setRegLastDonate ] = useState('');
  const [regFrequency,   setRegFrequency  ] = useState('');
  const [regNextTrans,   setRegNextTrans  ] = useState('');
  const [regHospital,    setRegHospital   ] = useState('');
  const [regUnits,       setRegUnits      ] = useState('');
  const [regAge,         setRegAge        ] = useState('');
  const [regGender,      setRegGender     ] = useState('');

  // Form state — forgot / reset
  const [fpEmail,        setFpEmail      ] = useState('');
  const [resetEmail,     setResetEmail   ] = useState('');
  const [resetOtp,       setResetOtp     ] = useState('');
  const [resetPassword,  setResetPassword] = useState('');

  // Clear errors on view change
  useEffect(() => { setError(''); setSuccess(''); }, [view]);

  // ── Navigate by role ──────────────────────────────────────────────────────
  function navigateByRole(role: UserRole) {
    if (role === 'donor')       navigate('/donor-dashboard');
    else if (role === 'patient') navigate('/patient-dashboard');
    else                         navigate('/command');
  }

  // ── Sign In ───────────────────────────────────────────────────────────────
  async function handleSignIn() {
    setError(''); setLoading(true);
    try {
      await auth.login(siEmail, siPassword);
      const role = auth.user?.role ?? 'coordinator';
      navigateByRole(role);
    } catch (e: any) {
      setError(e.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // After login the user state propagates async — watch for it
  useEffect(() => {
    if (auth.user && view === 'signin' && !loading) {
      navigateByRole(auth.user.role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  // ── Register ──────────────────────────────────────────────────────────────
  async function handleRegister() {
    setError(''); setLoading(true);
    try {
      if (!selectedRole) throw new Error('Please select a role.');
      if (regPassword.length < 6) throw new Error('Password must be at least 6 characters.');

      const payload: RegisterData = {
        name:     regName,
        email:    regEmail,
        password: regPassword,
        role:     selectedRole,
        phone:    regPhone   || undefined,
        city:     regCity    || undefined,
        latitude: currentLat,
        longitude: currentLon,
        preferred_location_name: regPreferredLoc || undefined,
      };

      if (selectedRole === 'donor') {
        payload.blood_group        = regBloodGroup   || undefined;
        payload.last_donation_date = regLastDonate   || undefined;
        payload.frequency_in_days  = regFrequency ? parseInt(regFrequency) : undefined;
      }
      if (selectedRole === 'patient') {
        payload.blood_group            = regBloodGroup  || undefined;
        payload.next_transfusion_date  = regNextTrans   || undefined;
        payload.hospital               = regHospital    || undefined;
        payload.units_needed           = regUnits       ? parseInt(regUnits) : undefined;
        payload.age                    = regAge         ? parseInt(regAge)   : undefined;
        payload.gender                 = regGender      || undefined;
      }

      await auth.register(payload);
      setSuccess(`Welcome to BloodBridge AI! Redirecting…`);
      setTimeout(() => {
        if (auth.user) navigateByRole(auth.user.role);
        else navigateByRole(selectedRole);
      }, 1500);
    } catch (e: any) {
      setError(e.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot Password ───────────────────────────────────────────────────────
  async function handleForgotPassword() {
    setError(''); setLoading(true);
    try {
      const res = await auth.forgotPassword(fpEmail);
      if (res.dev_otp) setDevOtp(res.dev_otp);
      setSuccess(`OTP sent! Check the box below.`);
      setResetEmail(fpEmail);
      setTimeout(() => setView('reset'), 2200);
    } catch (e: any) {
      setError(e.message || 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  }

  // ── Reset Password ────────────────────────────────────────────────────────
  async function handleResetPassword() {
    setError(''); setLoading(true);
    try {
      await auth.resetPassword(resetEmail, resetOtp, resetPassword);
      setSuccess('Password reset successfully! Redirecting to sign in…');
      setTimeout(() => { setView('signin'); setSuccess(''); }, 2000);
    } catch (e: any) {
      setError(e.message || 'Reset failed. Please check your OTP.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Role cards config ─────────────────────────────────────────────────────
  const roleCards = [
    {
      role:       'donor'       as UserRole,
      emoji:      '🩸',
      title:      'Blood Donor',
      subtitle:   'Register to donate and save lives',
      highlights: ['Track donations', 'Earn badges', 'Get matched'],
      gradient:   'from-[#D90429] to-[#EF233C]',
    },
    {
      role:       'patient'     as UserRole,
      emoji:      '💊',
      title:      'Thalassemia Patient',
      subtitle:   'Register to find compatible blood donors',
      highlights: ['AI matching', 'Transfusion schedule', 'Real-time alerts'],
      gradient:   'from-blue-500 to-indigo-600',
    },
    {
      role:       'coordinator' as UserRole,
      emoji:      '🏥',
      title:      'Coordinator / Admin',
      subtitle:   'Manage the full donor-patient network',
      highlights: ['Command center', 'Analytics', 'Outreach'],
      gradient:   'from-purple-500 to-violet-600',
    },
  ];

  const roleBadge = selectedRole
    ? roleCards.find(r => r.role === selectedRole)
    : null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT: Brand Panel ──────────────────────────────────────────────── */}
      <div className="w-0 md:w-[48%] lg:w-[52%] shrink-0">
        <div className="h-screen sticky top-0">
          <BrandPanel />
        </div>
      </div>

      {/* ── RIGHT: Form Panel ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-screen bg-white overflow-y-auto flex flex-col">
        {/* Mobile logo bar */}
        <div className="md:hidden flex items-center gap-3 px-6 pt-6 pb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-md">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900">BloodBridge AI</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 md:p-10 lg:p-14">
          <div className="w-full max-w-md">

            {/* ────────── SIGN IN ────────── */}
            <AnimatePresence mode="wait">
              {view === 'signin' && (
                <motion.div
                  key="signin"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col gap-6"
                >
                  {/* Header */}
                  <div className="flex flex-col gap-1.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D90429]/10 to-[#EF233C]/5 border border-[#D90429]/15 flex items-center justify-center mb-1">
                      <Heart className="w-6 h-6 text-[#D90429]" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-gray-900">Welcome back</h1>
                    <p className="text-gray-500 text-sm">Sign in to your BloodBridge account</p>
                  </div>

                  {/* Alerts */}
                  {error   && <AlertBox type="error"   message={error}   />}
                  {success && <AlertBox type="success" message={success} />}

                  {/* Fields */}
                  <div className="flex flex-col gap-4">
                    <InputField
                      label="Email address"
                      type="email"
                      placeholder="you@example.com"
                      value={siEmail}
                      onChange={setSiEmail}
                      icon={Mail}
                      required
                    />
                    <div className="flex flex-col gap-1.5">
                      <InputField
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={siPassword}
                        onChange={setSiPassword}
                        icon={Lock}
                        required
                        rightElement={
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        }
                      />
                      <div className="text-right mt-0.5">
                        <button
                          type="button"
                          onClick={() => setView('forgot')}
                          className="text-xs font-medium text-[#D90429] hover:text-[#EF233C] transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                    </div>
                  </div>

                  <PrimaryButton loading={loading} onClick={handleSignIn}>
                    {loading ? 'Signing in…' : 'Sign In'}
                  </PrimaryButton>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 font-medium">New to BloodBridge?</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <button
                    type="button"
                    onClick={() => { setView('register'); setStep(1); }}
                    className="w-full py-3 px-6 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm
                      hover:border-[#D90429]/40 hover:bg-[#D90429]/3 hover:text-[#D90429] transition-all duration-200"
                  >
                    Create an Account
                  </button>
                </motion.div>
              )}

              {/* ────────── REGISTER ────────── */}
              {view === 'register' && (
                <motion.div
                  key={`register-${step}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col gap-6"
                >
                  {/* Step 1: Role Selection */}
                  {step === 1 && (
                    <>
                      {/* Header */}
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setView('signin')}
                          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-1 w-fit"
                        >
                          <ArrowLeft className="w-4 h-4" /> Back to Sign In
                        </button>
                        <h1 className="text-2xl font-extrabold text-gray-900">Join BloodBridge AI</h1>
                        <p className="text-gray-500 text-sm">Choose your role to get started</p>
                      </div>

                      {/* Step indicator */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#D90429] flex items-center justify-center text-white text-xs font-bold">1</div>
                        <div className="flex-1 h-0.5 bg-gray-200 rounded-full" />
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold">2</div>
                      </div>
                      <p className="text-xs font-semibold text-gray-400 -mt-2">STEP 1 — SELECT ROLE</p>

                      {/* Role cards */}
                      <div className="flex flex-col gap-3">
                        {roleCards.map((card, i) => (
                          <motion.div
                            key={card.role}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                          >
                            <RoleCard
                              {...card}
                              selected={selectedRole === card.role}
                              onSelect={() => setSelectedRole(card.role)}
                            />
                          </motion.div>
                        ))}
                      </div>

                      {/* Alerts */}
                      {error && <AlertBox type="error" message={error} />}

                      {/* Continue */}
                      <AnimatePresence>
                        {selectedRole && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                          >
                            <PrimaryButton onClick={() => setStep(2)}>
                              Continue <ChevronRight className="w-4 h-4" />
                            </PrimaryButton>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {/* Step 2: Personal Details */}
                  {step === 2 && (
                    <>
                      {/* Header */}
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-1 w-fit"
                        >
                          <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                        <h1 className="text-2xl font-extrabold text-gray-900">Personal Details</h1>
                        <p className="text-gray-500 text-sm">Fill in your information to complete registration</p>
                      </div>

                      {/* Step indicator */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#D90429]/30 flex items-center justify-center text-[#D90429] text-xs font-bold">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 h-0.5 bg-[#D90429]/40 rounded-full" />
                        <div className="w-6 h-6 rounded-full bg-[#D90429] flex items-center justify-center text-white text-xs font-bold">2</div>
                      </div>

                      {/* Role badge */}
                      {roleBadge && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full w-fit bg-gradient-to-r ${roleBadge.gradient} bg-opacity-10`}
                          style={{ background: 'rgba(217,4,41,0.08)' }}
                        >
                          <span className="text-base">{roleBadge.emoji}</span>
                          <span className="text-sm font-semibold text-gray-700">{roleBadge.title}</span>
                        </div>
                      )}

                      {/* Alerts */}
                      {error   && <AlertBox type="error"   message={error}   />}
                      {success && <AlertBox type="success" message={success} />}

                      {/* Common fields */}
                      <div className="flex flex-col gap-4">
                        <InputField
                          label="Full Name"
                          placeholder="John Doe"
                          value={regName}
                          onChange={setRegName}
                          icon={User}
                          required
                        />
                        <InputField
                          label="Email address"
                          type="email"
                          placeholder="you@example.com"
                          value={regEmail}
                          onChange={setRegEmail}
                          icon={Mail}
                          required
                        />
                        <InputField
                          label="Password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Min. 6 characters"
                          value={regPassword}
                          onChange={setRegPassword}
                          icon={Lock}
                          required
                          helper="Use at least 6 characters with a mix of letters and numbers."
                          rightElement={
                            <button
                              type="button"
                              onClick={() => setShowPassword(v => !v)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          }
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <InputField
                            label="Phone"
                            type="tel"
                            placeholder="+1 234 567"
                            value={regPhone}
                            onChange={setRegPhone}
                            icon={Phone}
                          />
                          <InputField
                            label="City"
                            placeholder="Your city"
                            value={regCity}
                            onChange={setRegCity}
                            icon={MapPin}
                          />
                        </div>
                        <InputField
                          label="Preferred Location (Exact Address)"
                          placeholder="e.g. Apollo Hospital, Jubilee Hills"
                          value={regPreferredLoc}
                          onChange={setRegPreferredLoc}
                          icon={MapPin}
                        />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setLocationStatus('Fetching...');
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  setCurrentLat(pos.coords.latitude);
                                  setCurrentLon(pos.coords.longitude);
                                  setLocationStatus('📍 Location Saved');
                                },
                                () => setLocationStatus('❌ Location Denied')
                              );
                            }}
                            className="py-2.5 px-4 text-xs font-semibold rounded-xl border border-gray-200 bg-gray-50 hover:bg-[#D90429]/5 hover:text-[#D90429] hover:border-[#D90429]/30 transition-colors"
                          >
                            Get Current GPS Location
                          </button>
                          {locationStatus && <span className="text-xs text-gray-500 font-medium">{locationStatus}</span>}
                        </div>

                        {/* Donor-specific */}
                        {selectedRole === 'donor' && (
                          <>
                            <div className="border-t border-gray-100 pt-4">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Donor Details</p>
                              <div className="flex flex-col gap-4">
                                <SelectField
                                  label="Blood Group"
                                  value={regBloodGroup}
                                  onChange={setRegBloodGroup}
                                  options={BLOOD_GROUPS}
                                />
                                <InputField
                                  label="Last Donation Date"
                                  type="date"
                                  value={regLastDonate}
                                  onChange={setRegLastDonate}
                                  icon={Activity}
                                />
                                <SelectField
                                  label="Donation Frequency"
                                  value={regFrequency}
                                  onChange={setRegFrequency}
                                  options={FREQUENCIES}
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {/* Patient-specific */}
                        {selectedRole === 'patient' && (
                          <>
                            <div className="border-t border-gray-100 pt-4">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Patient Details</p>
                              <div className="flex flex-col gap-4">
                                <SelectField
                                  label="Blood Group"
                                  value={regBloodGroup}
                                  onChange={setRegBloodGroup}
                                  options={BLOOD_GROUPS}
                                  required
                                />
                                <InputField
                                  label="Next Transfusion Date"
                                  type="date"
                                  value={regNextTrans}
                                  onChange={setRegNextTrans}
                                  icon={Activity}
                                />
                                <InputField
                                  label="Full Hospital Address"
                                  placeholder="City General Hospital, 123 Main St, City, Zip"
                                  value={regHospital}
                                  onChange={setRegHospital}
                                  icon={Shield}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                  <InputField
                                    label="Units Needed"
                                    type="number"
                                    placeholder="1"
                                    value={regUnits}
                                    onChange={setRegUnits}
                                    min={1}
                                    max={5}
                                  />
                                  <InputField
                                    label="Age"
                                    type="number"
                                    placeholder="25"
                                    value={regAge}
                                    onChange={setRegAge}
                                    min={1}
                                    max={120}
                                  />
                                </div>
                                <SelectField
                                  label="Gender"
                                  value={regGender}
                                  onChange={setRegGender}
                                  options={GENDERS}
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <PrimaryButton loading={loading} onClick={handleRegister}>
                        {loading ? 'Creating account…' : 'Create Account'}
                      </PrimaryButton>
                    </>
                  )}
                </motion.div>
              )}

              {/* ────────── FORGOT PASSWORD ────────── */}
              {view === 'forgot' && (
                <motion.div
                  key="forgot"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col gap-6"
                >
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView('signin')}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-1 w-fit"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back to Sign In
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-1">
                      <RefreshCw className="w-6 h-6 text-orange-500" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-gray-900">Reset your password</h1>
                    <p className="text-gray-500 text-sm">
                      Enter your email and we'll send you a one-time passcode.
                    </p>
                  </div>

                  {error   && <AlertBox type="error"   message={error}   />}
                  {success && <AlertBox type="success" message={success} />}

                  {/* Dev OTP box */}
                  {devOtp && (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
                      <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-blue-700 mb-0.5">Development Mode — OTP:</p>
                        <p className="text-2xl font-mono font-extrabold text-blue-800 tracking-widest">{devOtp}</p>
                      </div>
                    </div>
                  )}

                  <InputField
                    label="Email address"
                    type="email"
                    placeholder="you@example.com"
                    value={fpEmail}
                    onChange={setFpEmail}
                    icon={Mail}
                    required
                  />

                  <PrimaryButton loading={loading} onClick={handleForgotPassword}>
                    {loading ? 'Sending OTP…' : 'Send Reset Code'}
                  </PrimaryButton>

                  <button
                    type="button"
                    onClick={() => setView('reset')}
                    className="text-center text-sm text-gray-500 hover:text-[#D90429] transition-colors"
                  >
                    Already have a code? Enter it here →
                  </button>
                </motion.div>
              )}

              {/* ────────── RESET PASSWORD ────────── */}
              {view === 'reset' && (
                <motion.div
                  key="reset"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col gap-6"
                >
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-1 w-fit"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mb-1">
                      <Lock className="w-6 h-6 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-gray-900">Enter your reset code</h1>
                    <p className="text-gray-500 text-sm">Enter the OTP sent to your email and choose a new password.</p>
                  </div>

                  {error   && <AlertBox type="error"   message={error}   />}
                  {success && <AlertBox type="success" message={success} />}

                  {/* Dev OTP reminder */}
                  {devOtp && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
                      <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <p className="text-xs text-blue-700 font-medium">
                        Dev OTP: <span className="font-mono font-extrabold text-blue-900 tracking-widest">{devOtp}</span>
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    <InputField
                      label="Email address"
                      type="email"
                      placeholder="you@example.com"
                      value={resetEmail}
                      onChange={setResetEmail}
                      icon={Mail}
                      required
                    />

                    {/* OTP input — large centered style */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-gray-700">
                        6-Digit OTP <span className="text-[#D90429]">*</span>
                      </label>
                      <input
                        type="number"
                        placeholder="000000"
                        value={resetOtp}
                        onChange={e => setResetOtp(e.target.value)}
                        maxLength={6}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-3xl font-mono
                          font-extrabold tracking-[0.35em] text-center placeholder-gray-300
                          focus:outline-none focus:ring-2 focus:ring-[#D90429]/25 focus:border-[#D90429]/50
                          focus:bg-white transition-all duration-200 py-4 px-4"
                      />
                      <p className="text-xs text-gray-400 text-center">Enter the 6-digit code from your email</p>
                    </div>

                    <InputField
                      label="New Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      value={resetPassword}
                      onChange={setResetPassword}
                      icon={Lock}
                      required
                      helper="Use at least 6 characters."
                      rightElement={
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      }
                    />
                  </div>

                  <PrimaryButton loading={loading} onClick={handleResetPassword}>
                    {loading ? 'Resetting…' : 'Reset Password'}
                  </PrimaryButton>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 mt-8">
              © {new Date().getFullYear()} BloodBridge AI — Saving lives through technology
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
