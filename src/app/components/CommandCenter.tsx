import { useState, useEffect, useRef } from 'react';
import {
  Activity, AlertTriangle, Brain, CheckCircle, Clock, Cpu,
  Droplet, Heart, Radio, Shield, Sparkles, TrendingUp,
  Users, Wifi, WifiOff, Zap, Phone, Bell, Target, Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import SettingsPanel from './SettingsPanel';
import { analyticsApi, patientsApi, matchesApi, AnalyticsData, Patient } from '../../lib/api';
import { wsManager, LiveEvent } from '../../lib/websocket';

// ─── Types ────────────────────────────────────────────────────────────────────

type WsStatus = 'connected' | 'disconnected' | 'reconnecting';

// ─── Prediction Timeline Steps ────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { id: 1, label: 'Patient Added', desc: 'Patient profile created in registry', icon: Users, color: 'from-blue-500 to-cyan-500', status: 'completed' },
  { id: 2, label: 'Need Forecast', desc: 'AI predicts transfusion schedule', icon: Brain, color: 'from-purple-500 to-violet-500', status: 'completed' },
  { id: 3, label: 'Donor Matching', desc: 'ML model ranks top compatible donors', icon: Target, color: 'from-orange-500 to-amber-500', status: 'active' },
  { id: 4, label: 'Outreach', desc: 'Automated messages sent to donors', icon: Phone, color: 'from-pink-500 to-rose-500', status: 'pending' },
  { id: 5, label: 'Confirmation', desc: 'Donor confirmed, donation scheduled', icon: CheckCircle, color: 'from-green-500 to-emerald-500', status: 'pending' },
];

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, { border: string; bg: string; dot: string; icon: React.ElementType }> = {
  info: { border: 'border-blue-500', bg: 'bg-blue-500/10', dot: 'bg-blue-400', icon: Activity },
  success: { border: 'border-green-500', bg: 'bg-green-500/10', dot: 'bg-green-400', icon: CheckCircle },
  warning: { border: 'border-orange-500', bg: 'bg-orange-500/10', dot: 'bg-orange-400', icon: AlertTriangle },
  critical: { border: 'border-red-500', bg: 'bg-red-500/10', dot: 'bg-red-400', icon: Zap },
};

function getEventTypeIcon(type: string): React.ElementType {
  if (type.includes('match')) return Target;
  if (type.includes('patient')) return Heart;
  if (type.includes('donor')) return Users;
  if (type.includes('alert')) return Bell;
  if (type.includes('forecast')) return TrendingUp;
  if (type.includes('outreach')) return Phone;
  return Radio;
}

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = startRef.current;
    const end = value;
    const duration = 800;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
      else startRef.current = end;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span>{display}{suffix}</span>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-700 ${className}`} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [selectedUrgency, setSelectedUrgency] = useState<string>('critical');
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [criticalPatients, setCriticalPatients] = useState<Patient[]>([]);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [events, setEvents] = useState<(LiveEvent & { id: string })[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected');
  const [loading, setLoading] = useState(true);
  const eventIdRef = useRef(0);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsData, patients, allMatches] = await Promise.allSettled([
          analyticsApi.get(),
          patientsApi.list({ urgency: 'critical' }),
          matchesApi.list(),
        ]);

        if (analyticsData.status === 'fulfilled') setAnalytics(analyticsData.value);
        if (patients.status === 'fulfilled') setCriticalPatients(patients.value.slice(0, 3));
        if (allMatches.status === 'fulfilled') {
          const matches = allMatches.value;
          setTotalMatches(matches.length);
          setConfirmedCount(matches.filter((m: any) => m.status === 'confirmed').length);
          setPendingCount(matches.filter((m: any) => m.status === 'pending').length);
        }
      } catch {
        // show stale / empty state
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── WebSocket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    wsManager.connect();

    const offEvent = wsManager.on((event) => {
      setEvents((prev) => {
        const newEvent = { ...event, id: String(eventIdRef.current++) };
        return [newEvent, ...prev].slice(0, 15);
      });
    });

    const offStatus = wsManager.onStatus((status) => {
      setWsStatus(status);
    });

    return () => {
      offEvent();
      offStatus();
      wsManager.disconnect();
    };
  }, []);

  // ── KPI config ──────────────────────────────────────────────────────────────
  const kpis = [
    {
      label: 'Pending Donor Responses',
      value: pendingCount,
      suffix: '',
      icon: Droplet,
      color: 'from-red-500 to-pink-500',
      bg: 'bg-red-500/20',
      desc: 'Awaiting YES/NO reply',
    },
    {
      label: 'Critical Patients',
      value: criticalPatients.length,
      suffix: '',
      icon: Shield,
      color: 'from-orange-500 to-amber-500',
      bg: 'bg-orange-500/20',
      desc: 'Require immediate attention',
    },
    {
      label: 'Avg Donor Score',
      value: analytics ? Math.round(analytics.avg_availability_score * 100) : 0,
      suffix: '%',
      icon: TrendingUp,
      color: 'from-purple-500 to-violet-500',
      bg: 'bg-purple-500/20',
      desc: 'AI availability score',
    },
    {
      label: 'Confirmed Donations',
      value: confirmedCount,
      suffix: '',
      icon: Sparkles,
      color: 'from-green-500 to-emerald-500',
      bg: 'bg-green-500/20',
      desc: 'Donors confirmed via WhatsApp',
    },
  ];

  // ── Urgency color ───────────────────────────────────────────────────────────
  const urgencyBadge = (u: string) => {
    if (u === 'critical') return 'bg-red-500/20 text-red-400 border border-red-500/30';
    if (u === 'high') return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    if (u === 'medium') return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
    return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
  };

  function safeDate(dateStr: string) {
    if (!dateStr) return new Date();
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts[0].length === 2 && parts[2].length >= 4) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function daysLabel(dateStr: string) {
    const diff = Math.ceil((safeDate(dateStr).getTime() - Date.now()) / 86400000);
    if (diff < 0) return { label: 'OVERDUE', cls: 'text-red-400' };
    if (diff === 0) return { label: 'TODAY', cls: 'text-orange-400' };
    return { label: `${diff}d away`, cls: 'text-slate-300' };
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 p-8 shadow-2xl">
          {/* Decorative glows */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-purple-900/10 to-blue-900/10 pointer-events-none" />

          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <Cpu className="w-7 h-7 text-white" />
                </div>
                <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse inline-block" />
                  LIVE
                </Badge>
              </div>
              <h1 className="text-4xl font-semibold text-white mb-2">AI Command Center</h1>
              <p className="text-slate-400 text-lg max-w-xl">
                Real-time monitoring and intelligent orchestration for BloodBridge AI operations
              </p>
            </div>

            {/* WS Status & Controls */}
            <div className="flex items-center gap-4">
              <Button
                variant="default"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-500/30"
                onClick={async () => {
                  try {
                    await matchesApi.runAutomation();
                    alert('Global automation cycle triggered successfully. AI is now matching and messaging donors.');
                  } catch (e) {
                    alert('Automation trigger failed');
                  }
                }}
              >
                <Zap className="w-4 h-4 mr-2" />
                Engage Global Automation
              </Button>
              <Button 
                variant="outline" 
                className="bg-slate-800/50 border-slate-600 text-slate-300 hover:text-white"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-sm ${
                wsStatus === 'connected'
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : wsStatus === 'reconnecting'
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {wsStatus === 'connected' ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                    <Wifi className="w-4 h-4" />
                    <span className="text-sm font-medium">Live Connected</span>
                  </>
                ) : wsStatus === 'reconnecting' ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-bounce" />
                    <span className="text-sm font-medium">Reconnecting…</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4" />
                    <span className="text-sm font-medium">Disconnected</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Settings Panel ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KPI Row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="border-slate-700 bg-slate-800/60 backdrop-blur-sm hover:bg-slate-800 transition-all duration-300 overflow-hidden relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-lg`}>
                      <kpi.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {loading ? (
                    <>
                      <Skeleton className="h-8 w-24 mb-2" />
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-semibold text-white mb-1">
                        <AnimatedCounter value={kpi.value} suffix={kpi.suffix} />
                      </div>
                      <div className="text-sm font-medium text-slate-300 mb-0.5">{kpi.label}</div>
                      <div className="text-xs text-slate-500">{kpi.desc}</div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ── Main Grid ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6">

          {/* ── Left: Prediction Timeline ──────────────────────────────────── */}
          <div className="col-span-2">
            <Card className="border-slate-700 bg-slate-800/60 backdrop-blur-sm h-full">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Brain className="w-5 h-5 text-purple-400" />
                  AI Orchestration Timeline
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Global tracking of automated donor matching pipeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Timeline */}
                <div className="mb-8 relative border-l-2 border-slate-700 ml-5 space-y-6">
                  {TIMELINE_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <motion.div 
                        key={step.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="relative pl-8"
                      >
                        <div className={`absolute -left-[17px] top-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-800 border-2 ${step.status === 'completed' ? 'border-green-500' : step.status === 'active' ? 'border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'border-slate-600'}`}>
                          <Icon className={`w-4 h-4 ${step.status === 'completed' ? 'text-green-500' : step.status === 'active' ? 'text-purple-400' : 'text-slate-500'}`} />
                        </div>
                        <div className="flex-1 pt-1">
                          <h4 className={`text-sm font-semibold ${step.status === 'completed' || step.status === 'active' ? 'text-white' : 'text-slate-400'}`}>
                            {step.label}
                            {step.status === 'active' && <Badge className="ml-2 bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] px-1 py-0 h-4">IN PROGRESS</Badge>}
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">{step.desc}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Compact Stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Matches', value: totalMatches, icon: Target, color: 'from-blue-500 to-cyan-500' },
                    { label: 'Awaiting Reply', value: pendingCount, icon: Clock, color: 'from-yellow-500 to-orange-500' },
                    { label: 'Confirmed', value: confirmedCount, icon: CheckCircle, color: 'from-green-500 to-emerald-500' },
                    { label: 'Critical Alert', value: criticalPatients.length, icon: AlertTriangle, color: 'from-red-500 to-pink-500' },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-700 bg-slate-700/30">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-400 truncate">{item.label}</div>
                          <div className="text-xl font-semibold text-white">{loading ? '—' : item.value}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Live Event Feed ─────────────────────────────────────── */}
          <div>
            <Card className="border-slate-700 bg-slate-800/60 backdrop-blur-sm h-full flex flex-col">
              <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Radio className="w-5 h-5 text-blue-400" />
                  Live Event Feed
                  {wsStatus === 'connected' && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  )}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Real-time system events
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-4 pt-0">
                {wsStatus !== 'connected' && events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <p className="text-slate-400 text-sm">Connecting to live feed…</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
                    <AnimatePresence initial={false}>
                      {events.map((event) => {
                        const sev = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info;
                        const EventIcon = getEventTypeIcon(event.event_type);

                        return (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: -16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className={`p-3 rounded-xl border-l-2 ${sev.border} ${sev.bg} border border-slate-700/50`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${sev.dot} mt-1.5 flex-shrink-0`} />
                              <EventIcon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-sm font-medium text-white truncate">{event.title}</span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mt-0.5 line-clamp-2">{event.message}</p>
                                <p className="text-xs text-slate-600 mt-1">
                                  {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {events.length === 0 && (
                      <div className="text-center py-8 text-slate-500 text-sm">No events yet</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Bottom: AI Recommendations ────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-6">

          {/* Critical Patients Alert */}
          <Card className="border-slate-700 bg-slate-800/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Critical Patient Alerts
                <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-500/30">
                  AI Priority
                </Badge>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Patients requiring immediate donor matching
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex items-center gap-3 p-3 rounded-xl border border-slate-700">
                      <Skeleton className="w-12 h-12 rounded-xl" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : criticalPatients.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">No critical patients right now</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {criticalPatients.map((patient, i) => {
                    const day = daysLabel(patient.next_transfusion_date);
                    return (
                      <motion.div
                        key={patient.patient_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                          <span className="text-white font-bold text-sm">{patient.blood_group}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-white text-sm truncate">{patient.name}</span>
                            <span className="text-xs text-slate-500">P-{patient.patient_id.slice(-4)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>{patient.city}</span>
                            <span>•</span>
                            <span>{patient.units_needed} units</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-xs font-semibold ${day.cls}`}>{day.label}</div>
                          <Badge className={`text-xs mt-1 ${urgencyBadge(patient.urgency_level)}`}>
                            {patient.urgency_level}
                          </Badge>
                        </div>
                      </motion.div>
                    );
                  })}
                  <Button
                    className="w-full mt-1 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white border-0 shadow-lg shadow-red-500/20"
                    size="sm"
                    onClick={async () => {
                      try {
                        await Promise.all(criticalPatients.map(p => matchesApi.run(p.patient_id, 10, 100)));
                        alert('Emergency match completed for all critical patients');
                      } catch (err) {
                        alert('Failed to run emergency match');
                      }
                    }}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Run Emergency Match for All
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Match Success Metric */}
          <Card className="border-slate-700 bg-slate-800/60 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-green-400" />
                Match Intelligence Overview
                <Badge className="ml-auto bg-green-500/20 text-green-400 border-green-500/30">
                  AI Insight
                </Badge>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Aggregate matching performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Confirmed Matches Banner */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-3xl font-semibold text-white">{confirmedCount}</div>
                        <div className="text-sm text-slate-400">Confirmed Matches</div>
                      </div>
                    </div>
                  </div>

                  {/* Performance Bars */}
                  {[
                    { label: 'Blood Compatibility Score', value: analytics ? Math.round(analytics.match_success_rate) : 0, color: 'from-red-500 to-pink-500' },
                    { label: 'Donor Availability Match', value: analytics ? Math.round(analytics.avg_availability_score * 100) : 0, color: 'from-blue-500 to-cyan-500' },
                    { label: 'AI Prediction Accuracy', value: analytics ? Math.round(analytics.prediction_accuracy) : 0, color: 'from-purple-500 to-violet-500' },
                    { label: 'Outreach Response Rate', value: analytics ? Math.round(analytics.response_rate) : 0, color: 'from-orange-500 to-amber-500' },
                  ].map((metric, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-400">{metric.label}</span>
                        <span className="text-sm font-semibold text-white">{metric.value}%</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${metric.value}%` }}
                          transition={{ duration: 1, delay: i * 0.15, ease: 'easeOut' }}
                          className={`h-full bg-gradient-to-r ${metric.color} rounded-full`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
