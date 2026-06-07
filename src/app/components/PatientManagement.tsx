import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, AlertTriangle, Calendar, CheckCircle, ChevronRight,
  Clock, Hospital, MapPin, Phone, Plus, Search, Shield,
  Users, X, Droplet, Loader2, FileText, Heart, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { patientsApi, Patient } from '../../lib/api';
import { wsManager } from '../../lib/websocket';

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const URGENCY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

const URGENCY_STYLE: Record<string, { badge: string; border: string; bg: string; icon: string }> = {
  critical: { badge: 'bg-red-100 text-red-700 border border-red-200', border: 'border-l-red-500', bg: 'bg-red-50', icon: '🔴' },
  high:     { badge: 'bg-orange-100 text-orange-700 border border-orange-200', border: 'border-l-orange-500', bg: 'bg-orange-50', icon: '🟠' },
  medium:   { badge: 'bg-yellow-100 text-yellow-700 border border-yellow-200', border: 'border-l-yellow-500', bg: 'bg-yellow-50', icon: '🟡' },
  low:      { badge: 'bg-blue-100 text-blue-700 border border-blue-200', border: 'border-l-blue-500', bg: 'bg-blue-50', icon: '🔵' },
};

const BLOOD_GROUP_COLORS: Record<string, string> = {
  'A+': 'from-red-500 to-rose-500',
  'A-': 'from-red-600 to-red-400',
  'B+': 'from-orange-500 to-amber-500',
  'B-': 'from-orange-600 to-orange-400',
  'AB+': 'from-purple-500 to-violet-500',
  'AB-': 'from-purple-600 to-purple-400',
  'O+': 'from-blue-500 to-cyan-500',
  'O-': 'from-blue-600 to-blue-400',
};

const FORECAST_TIMELINE = [
  { step: 'Find Donors', desc: 'AI scans compatible donors', icon: Search, color: 'from-blue-500 to-cyan-500' },
  { step: 'Contact', desc: 'Automated outreach sent', icon: Phone, color: 'from-purple-500 to-pink-500' },
  { step: 'Confirm', desc: 'Donors confirm availability', icon: CheckCircle, color: 'from-green-500 to-emerald-500' },
  { step: 'Reminder', desc: '24-hr reminder dispatched', icon: Clock, color: 'from-orange-500 to-amber-500' },
  { step: 'Donation Day', desc: 'Blood donation completed', icon: Heart, color: 'from-red-500 to-pink-500' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDate(dateStr: string) {
  if (!dateStr) return new Date();
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 2 && parts[2].length >= 4) {
      // DD-MM-YYYY format
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

function daysUntil(dateStr: string) {
  const diff = Math.ceil((safeDate(dateStr).getTime() - Date.now()) / 86400000);
  return isNaN(diff) ? 0 : diff;
}

function DaysBadge({ dateStr }: { dateStr: string }) {
  const d = daysUntil(dateStr);
  if (d < 0) return <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">OVERDUE</span>;
  if (d === 0) return <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">TODAY</span>;
  if (d <= 3) return <span className="text-xs font-semibold text-orange-500">{d} day{d !== 1 ? 's' : ''}</span>;
  return <span className="text-xs text-gray-500">{d} days</span>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { id: number; msg: string; type: 'success' | 'error' }

let toastId = 0;

// ─── Add Patient Form ─────────────────────────────────────────────────────────

interface AddFormProps {
  onSuccess: (p: Patient) => void;
  onCancel: () => void;
}

function AddPatientForm({ onSuccess, onCancel }: AddFormProps) {
  const [form, setForm] = useState({
    name: '', blood_group: 'A+', city: '', next_transfusion_date: '', units_needed: 1,
    hospital: '', phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.city || !form.next_transfusion_date) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await patientsApi.create({
        ...form,
        units_needed: Number(form.units_needed),
        urgency_level: 'medium',
        status: 'active',
      });
      onSuccess(created);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create patient');
    } finally {
      setSaving(false);
    }
  };

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <Card className="border-0 shadow-lg shadow-blue-100/50 bg-gradient-to-br from-blue-50 to-indigo-50 mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-gray-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              Add New Patient
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="col-span-2">
                <label className={labelCls}>Full Name *</label>
                <input className={inputCls} value={form.name} onChange={f('name')} placeholder="e.g. Priya Sharma" required />
              </div>
              <div>
                <label className={labelCls}>Blood Group *</label>
                <select className={inputCls} value={form.blood_group} onChange={f('blood_group')}>
                  {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Units Needed</label>
                <input className={inputCls} type="number" min={1} max={10} value={form.units_needed} onChange={f('units_needed')} />
              </div>
              <div>
                <label className={labelCls}>City *</label>
                <input className={inputCls} value={form.city} onChange={f('city')} placeholder="Mumbai" required />
              </div>
              <div>
                <label className={labelCls}>Hospital</label>
                <input className={inputCls} value={form.hospital} onChange={f('hospital')} placeholder="KEM Hospital" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} value={form.phone} onChange={f('phone')} placeholder="+91 9000000000" />
              </div>
              <div>
                <label className={labelCls}>Next Transfusion Date *</label>
                <input className={inputCls} type="date" value={form.next_transfusion_date} onChange={f('next_transfusion_date')} required />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-r from-[#D90429] to-[#EF233C] hover:from-[#c0021f] hover:to-[#d4162e] text-white border-0 shadow-lg shadow-red-200"
              >
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : <><Plus className="w-4 h-4 mr-2" />Add Patient</>}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Patient Detail Panel ─────────────────────────────────────────────────────

interface DetailPanelProps {
  patient: Patient;
  onClose: () => void;
  onFindDonors: (id: string) => void;
  matchingId: string | null;
}

function PatientDetailPanel({ patient, onClose, onFindDonors, matchingId }: DetailPanelProps) {
  const [forecast, setForecast] = useState<any>(null);

  useEffect(() => {
    patientsApi.forecast(patient.patient_id)
      .then(setForecast)
      .catch(() => {});
  }, [patient.patient_id]);

  const sty = URGENCY_STYLE[patient.urgency_level] ?? URGENCY_STYLE.low;
  const bloodGradient = BLOOD_GROUP_COLORS[patient.blood_group] ?? 'from-gray-400 to-gray-500';
  const days = daysUntil(patient.next_transfusion_date);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
      />

      {/* Slide-in Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className={`relative bg-gradient-to-br ${bloodGradient} p-6 text-white flex-shrink-0`}>
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center font-bold text-xl shadow-lg">
                {patient.blood_group}
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <h2 className="text-2xl font-semibold mb-1">{patient.name}</h2>
            <p className="text-white/80 text-sm">Patient ID: P-{patient.patient_id.slice(-4)}</p>
            <div className="flex items-center gap-2 mt-3">
              <Badge className="bg-white/20 text-white border-0 text-xs">{patient.urgency_level.toUpperCase()}</Badge>
              <Badge className="bg-white/20 text-white border-0 text-xs">{patient.status.toUpperCase()}</Badge>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Blood Group', value: patient.blood_group, icon: Droplet },
              { label: 'Units Needed', value: `${patient.units_needed} units`, icon: Activity },
              { label: 'City', value: patient.city, icon: MapPin },
              { label: 'Hospital', value: patient.hospital ?? '—', icon: Hospital },
              { label: 'Phone', value: patient.phone ?? '—', icon: Phone },
              { label: 'Transfusion Date', value: safeDate(patient.next_transfusion_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), icon: Calendar },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <item.icon className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Countdown */}
          <div className={`p-4 rounded-2xl border-l-4 ${sty.border} ${sty.bg} border border-gray-100`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Next Transfusion</p>
                <p className="text-xs text-gray-500">
                  {safeDate(patient.next_transfusion_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <div className="text-right">
                <DaysBadge dateStr={patient.next_transfusion_date} />
                <div className="text-xs text-gray-400 mt-0.5">{patient.units_needed} units required</div>
              </div>
            </div>
            <Progress value={Math.max(0, 100 - days * 5)} className="h-1.5 mt-3" />
          </div>

          {/* Smart Schedule Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Smart Schedule Timeline
            </h3>

            {forecast ? (
              <div className="space-y-0">
                {FORECAST_TIMELINE.map((stage, idx) => {
                  const isLast = idx === FORECAST_TIMELINE.length - 1;
                  const currentIdx = forecast?.current_stage_idx ?? 0;
                  const isActive = idx === currentIdx;
                  const isDone = idx < currentIdx;
                  const Icon = stage.icon;
                  return (
                    <div key={idx} className="relative flex items-start gap-3">
                      {!isLast && (
                        <div className={`absolute left-4 top-9 w-0.5 h-8 ${isDone ? 'bg-green-300' : 'bg-gray-200'}`} />
                      )}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDone ? 'bg-gradient-to-br from-green-500 to-emerald-500' :
                        isActive ? `bg-gradient-to-br ${stage.color}` :
                        'bg-gray-100'
                      }`}>
                        <Icon className={`w-4 h-4 ${isDone || isActive ? 'text-white' : 'text-gray-400'}`} />
                      </div>
                      <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium ${isDone ? 'text-green-700' : isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                            {stage.step}
                          </span>
                          {isActive && <Badge className="text-xs bg-blue-100 text-blue-700 border-0 animate-pulse">Active</Badge>}
                          {isDone && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{stage.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {FORECAST_TIMELINE.map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            )}
          </div>

          {/* Notes */}
          {patient.notes && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-xs font-medium text-amber-700 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{patient.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <Button
            className="flex-1 bg-gradient-to-r from-[#D90429] to-[#EF233C] hover:from-[#c0021f] hover:to-[#d4162e] text-white border-0 shadow-lg shadow-red-200"
            onClick={() => onFindDonors(patient.patient_id)}
            disabled={matchingId === patient.patient_id}
          >
            {matchingId === patient.patient_id ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Messaging...</>
            ) : (
              <><Phone className="w-4 h-4 mr-2" />Message Donors</>
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientManagement() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);
  const liveAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState('');
  const [filterBlood, setFilterBlood] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{title: string, text: string} | null>(null);

  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const pushToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = toastId++;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [patientsRes, statsRes] = await Promise.allSettled([
        patientsApi.list(),
        patientsApi.stats(),
      ]);
      if (patientsRes.status === 'fulfilled') setPatients(patientsRes.value);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    } catch {
      // no-op
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── WebSocket: auto-refresh on donor events ─────────────────────────────────
  useEffect(() => {
    wsManager.connect();
    const unsub = wsManager.on((event) => {
      if (event.event_type === 'donor_confirmed' || event.event_type === 'donor_declined') {
        const msg = event.event_type === 'donor_confirmed'
          ? `✅ ${event.message}`
          : `⚠️ ${event.message}`;
        setLiveAlert(msg);
        if (liveAlertTimer.current) clearTimeout(liveAlertTimer.current);
        liveAlertTimer.current = setTimeout(() => setLiveAlert(null), 5000);
        // Silently reload patient list to reflect new status
        load(true);
      }
    });
    return () => { unsub(); };
  }, [load]);

  // ── Filter + Sort ───────────────────────────────────────────────────────────
  const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const filtered = patients
    .filter(p => {
      const q = search.toLowerCase();
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.blood_group.toLowerCase().includes(q) || p.city.toLowerCase().includes(q);
      const matchB = !filterBlood || p.blood_group === filterBlood;
      const matchU = !filterUrgency || p.urgency_level === filterUrgency;
      return matchQ && matchB && matchU;
    })
    .sort((a, b) => (urgencyOrder[a.urgency_level] ?? 4) - (urgencyOrder[b.urgency_level] ?? 4));

  // ── Find Donors ─────────────────────────────────────────────────────────────
  const handleFindDonors = async (patientId: string) => {
    setMatchingId(patientId);
    try {
      const result = await patientsApi.requestBlood(patientId, { top_n: 3, max_distance_km: 200 });
      setSuccessModal({
        title: "Messages Sent Successfully! 🚀",
        text: `BloodBridge AI has successfully matched and dispatched WhatsApp messages to ${result.messages_sent} donors (out of ${result.matches_found} compatible donors found nearby). You will be notified instantly when they reply.`
      });
    } catch (err: any) {
      pushToast(err.message ?? 'Blood request failed', 'error');
    } finally {
      setMatchingId(null);
    }
  };

  // ── Add patient success ─────────────────────────────────────────────────────
  const handleAdded = (p: Patient) => {
    setPatients(prev => [p, ...prev]);
    setShowAddForm(false);
    pushToast(`Patient ${p.name} added successfully!`);
  };

  // ── KPI data ────────────────────────────────────────────────────────────────
  const kpiData = [
    {
      label: 'Total Patients',
      value: loading ? '—' : String(stats?.total_patients ?? patients.length),
      icon: Users,
      color: 'from-blue-500 to-indigo-500',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
    },
    {
      label: 'Critical',
      value: loading ? '—' : String(stats?.critical_patients ?? patients.filter(p => p.urgency_level === 'critical').length),
      icon: AlertTriangle,
      color: 'from-red-500 to-rose-500',
      bg: 'bg-red-50',
      text: 'text-red-700',
    },
    {
      label: 'High Priority',
      value: loading ? '—' : String(stats?.high_priority ?? patients.filter(p => p.urgency_level === 'high').length),
      icon: Shield,
      color: 'from-orange-500 to-amber-500',
      bg: 'bg-orange-50',
      text: 'text-orange-700',
    },
    {
      label: 'Scheduled Today',
      value: loading ? '—' : String(stats?.scheduled_today ?? patients.filter(p => daysUntil(p.next_transfusion_date) === 0).length),
      icon: Calendar,
      color: 'from-green-500 to-emerald-500',
      bg: 'bg-green-50',
      text: 'text-green-700',
    },
  ];

  const selectCls = 'border border-gray-200 rounded-xl px-3 h-10 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer';

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Live WhatsApp Alert Banner ────────────────────────────────────── */}
        <AnimatePresence>
          {liveAlert && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] px-6 py-3 rounded-2xl shadow-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-semibold flex items-center gap-3"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              {liveAlert}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Toast Notifications ──────────────────────────────────────────── */}
        <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
                  toast.type === 'success'
                    ? 'bg-green-600 text-white'
                    : 'bg-red-600 text-white'
                }`}
              >
                {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {toast.msg}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                  <Heart className="w-7 h-7" />
                </div>
                <Badge className="bg-white/20 text-white border-0 backdrop-blur-xl">
                  Thalassemia Registry
                </Badge>
              </div>
              <h1 className="text-4xl font-semibold mb-2">Patient Management</h1>
              <p className="text-white/85 text-lg max-w-2xl">
                Thalassemia patient registry and transfusion scheduling
              </p>
            </div>
            <Button
              onClick={() => setShowAddForm(v => !v)}
              className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-lg border-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Patient
            </Button>
          </div>
        </div>

        {/* ── KPI Row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiData.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 overflow-hidden relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                      <kpi.icon className={`w-5 h-5 ${kpi.text}`} />
                    </div>
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-lg`}>
                      <kpi.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {loading ? (
                    <>
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-semibold text-gray-900 mb-0.5">{kpi.value}</div>
                      <div className="text-sm text-gray-500">{kpi.label}</div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ── Add Patient Form ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {showAddForm && (
            <AddPatientForm onSuccess={handleAdded} onCancel={() => setShowAddForm(false)} />
          )}
        </AnimatePresence>

        {/* ── Search & Filter Bar ──────────────────────────────────────────── */}
        <Card className="border-0 shadow-lg shadow-gray-200/50">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="flex-1 min-w-48 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name, blood group or city…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-10 border-gray-200"
                />
              </div>

              {/* Blood Group Filter */}
              <select
                className={selectCls}
                value={filterBlood}
                onChange={e => setFilterBlood(e.target.value)}
              >
                <option value="">All Blood Groups</option>
                {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              {/* Urgency Filter */}
              <select
                className={selectCls}
                value={filterUrgency}
                onChange={e => setFilterUrgency(e.target.value)}
              >
                <option value="">All Urgency</option>
                {URGENCY_LEVELS.map(u => (
                  <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                ))}
              </select>

              {/* Results count */}
              <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-0 ml-auto">
                {filtered.length} patients
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* ── Patient List ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Patient Registry</h2>
              <p className="text-sm text-gray-500">Sorted by urgency level</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(n => (
                <Card key={n} className="border-0 shadow-lg shadow-gray-200/50">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-14 h-14 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                      <Skeleton className="h-9 w-28 rounded-xl" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-0 shadow-lg shadow-gray-200/50">
              <CardContent className="p-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">No patients found.</p>
                {search || filterBlood || filterUrgency ? (
                  <Button variant="link" className="mt-2 text-blue-600" onClick={() => { setSearch(''); setFilterBlood(''); setFilterUrgency(''); }}>
                    Clear filters
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {filtered.map((patient, i) => {
                  const sty = URGENCY_STYLE[patient.urgency_level] ?? URGENCY_STYLE.low;
                  const gradient = BLOOD_GROUP_COLORS[patient.blood_group] ?? 'from-gray-400 to-gray-500';

                  return (
                    <motion.div
                      key={patient.patient_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: Math.min(i * 0.04, 0.3) }}
                    >
                      <Card className={`border-0 shadow-md shadow-gray-200/40 hover:shadow-lg transition-all duration-300 border-l-4 ${sty.border} overflow-hidden`}>
                        <CardContent className="p-5">
                          <div className="flex items-center gap-4">
                            {/* Blood Group Badge */}
                            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md flex-shrink-0`}>
                              <span className="text-white font-bold text-sm">{patient.blood_group}</span>
                            </div>

                            {/* Main Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-semibold text-gray-900">{patient.name}</h3>
                                <span className="text-xs text-gray-400">P-{patient.patient_id.slice(-4)}</span>
                                <Badge className={`text-xs ${sty.badge}`}>{patient.urgency_level}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{patient.city}</span>
                                {patient.hospital && <span className="flex items-center gap-1"><Hospital className="w-3.5 h-3.5" />{patient.hospital}</span>}
                                <span className="flex items-center gap-1"><Droplet className="w-3.5 h-3.5" />{patient.units_needed} units</span>
                              </div>
                            </div>

                            {/* Countdown */}
                            <div className="text-center flex-shrink-0 px-3">
                              <div className="text-xs text-gray-400 mb-0.5">Transfusion</div>
                              <DaysBadge dateStr={patient.next_transfusion_date} />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                size="sm"
                                className="bg-gradient-to-r from-[#D90429] to-[#EF233C] hover:from-[#c0021f] hover:to-[#d4162e] text-white border-0 text-xs shadow-md shadow-red-200"
                                onClick={() => handleFindDonors(patient.patient_id)}
                                disabled={matchingId === patient.patient_id}
                              >
                                {matchingId === patient.patient_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Phone className="w-3 h-3 mr-1" />
                                )}
                                Message Donors
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-gray-200"
                                onClick={() => setSelectedPatient(patient)}
                              >
                                <ChevronRight className="w-3 h-3 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── Legend ───────────────────────────────────────────────────────── */}
        <Card className="border-0 shadow-md shadow-gray-100/50 bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Urgency Legend:</span>
              {URGENCY_LEVELS.map(u => {
                const s = URGENCY_STYLE[u];
                return (
                  <div key={u} className="flex items-center gap-1.5">
                    <span>{s.icon}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.badge}`}>{u}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── Patient Detail Panel ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPatient && (
          <PatientDetailPanel
            patient={selectedPatient}
            onClose={() => setSelectedPatient(null)}
            onFindDonors={handleFindDonors}
            matchingId={matchingId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
