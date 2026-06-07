import { useState, useEffect } from 'react';
import {
  Brain,
  MapPin,
  Droplets,
  Clock,
  AlertTriangle,
  CheckCircle,
  Phone,
  CalendarCheck,
  ChevronDown,
  Loader2,
  Zap,
  Target,
  Activity,
  Shield,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Progress } from './ui/progress';
import { motion } from 'motion/react';
import { patientsApi, matchesApi, Patient, MatchResult } from '../../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function daysUntil(dateStr: string): number {
  const target = safeDate(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(level: string) {
  switch (level) {
    case 'critical': return 'bg-red-100 text-red-700 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default: return 'bg-green-100 text-green-700 border-green-200';
  }
}

function bloodGroupColor(bg: string) {
  const map: Record<string, string> = {
    'O+': 'from-[#D90429] to-[#EF233C]',
    'O-': 'from-red-800 to-red-600',
    'A+': 'from-blue-600 to-blue-400',
    'A-': 'from-blue-800 to-blue-600',
    'B+': 'from-purple-600 to-purple-400',
    'B-': 'from-purple-800 to-purple-600',
    'AB+': 'from-orange-500 to-amber-400',
    'AB-': 'from-orange-700 to-orange-500',
  };
  return map[bg] || 'from-gray-600 to-gray-400';
}

// ─── SVG Score Gauge ──────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-gray-800">{pct}%</span>
    </div>
  );
}

// ─── Score Breakdown Bar ──────────────────────────────────────────────────────

interface ScoreBarProps {
  label: string;
  value: number;
  weight: number;
  gradient: string;
}

function ScoreBar({ label, value, weight, gradient }: ScoreBarProps) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{weight}%</span>
          <span className="text-xs font-semibold text-gray-800">{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Confirm Match Modal (inline lightweight) ─────────────────────────────────

function ConfirmModal({
  matchId,
  donorName,
  onClose,
  onConfirmed,
}: {
  matchId: string;
  donorName: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleConfirm() {
    setLoading(true);
    setErr('');
    try {
      await matchesApi.confirm(matchId, date);
      onConfirmed();
    } catch (e: any) {
      setErr(e.message || 'Failed to confirm');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl p-6 w-80"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Confirm Match</h3>
        <p className="text-sm text-gray-600 mb-4">
          Schedule donation with <span className="font-medium">{donorName}</span>
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 bg-gradient-to-r from-[#D90429] to-[#EF233C] text-white border-0"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            Confirm
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Skeleton Cards ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card className="border-0 shadow-md animate-pulse">
      <CardContent className="p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-2/3" />
            <div className="h-2 bg-gray-100 rounded w-1/2" />
          </div>
          <div className="w-14 h-14 rounded-full bg-gray-200" />
        </div>
        <div className="space-y-2">
          <div className="h-2 bg-gray-100 rounded" />
          <div className="h-2 bg-gray-100 rounded w-4/5" />
          <div className="h-2 bg-gray-100 rounded w-3/5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MatchingEngine() {
  // Patient state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Match params
  const [maxDistance, setMaxDistance] = useState(100);
  const [topN, setTopN] = useState(10);

  // Match results
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchRan, setMatchRan] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{ matchId: string; donorName: string } | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    patientsApi.list().then(data => {
      setPatients(data);
      if (data.length) setSelectedPatient(data[0]);
    }).catch(() => {}).finally(() => setPatientsLoading(false));
  }, []);

  async function runMatch() {
    if (!selectedPatient) return;
    setMatchLoading(true);
    setMatchError('');
    setMatchRan(true);
    try {
      const res = await matchesApi.run(selectedPatient.patient_id, topN, maxDistance);
      setMatchResults(res.matches || []);
    } catch (e: any) {
      setMatchError(e.message || 'Matching failed');
      setMatchResults([]);
    } finally {
      setMatchLoading(false);
    }
  }

  const days = selectedPatient ? daysUntil(selectedPatient.next_transfusion_date) : 0;

  return (
    <div className="min-h-screen p-8 bg-gray-50/50">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#D90429] via-[#EF233C] to-rose-500 p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute top-8 right-12 opacity-10">
            <Brain className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-lg">
                <Brain className="w-7 h-7" />
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-xl">
                Powered by XGBoost + Rules Engine
              </Badge>
            </div>
            <h1 className="text-4xl font-semibold mb-2">AI Matching Engine</h1>
            <p className="text-white/90 text-lg max-w-2xl">
              Intelligently rank and match blood donors to patients using multi-factor AI scoring
            </p>
          </div>
        </div>

        {/* ── Split Layout ── */}
        <div className="grid grid-cols-5 gap-6">

          {/* ════ LEFT PANEL ════ */}
          <div className="col-span-2 space-y-5">

            {/* Patient Selector */}
            <Card className="border-0 shadow-lg shadow-gray-200/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4 text-[#D90429]" />
                  Select Patient
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {patientsLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 py-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading patients…</span>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setDropdownOpen(o => !o)}
                      className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white hover:border-red-300 transition-colors"
                    >
                      <span className="font-medium text-gray-800 truncate">
                        {selectedPatient?.name || 'Choose a patient…'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {dropdownOpen && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                        {patients.map(p => (
                          <button
                            key={p.patient_id}
                            onClick={() => { setSelectedPatient(p); setDropdownOpen(false); setMatchRan(false); setMatchResults([]); }}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-red-50 transition-colors ${selectedPatient?.patient_id === p.patient_id ? 'bg-red-50 font-medium text-red-700' : 'text-gray-700'}`}
                          >
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r ${bloodGroupColor(p.blood_group)} text-white`}>
                              {p.blood_group}
                            </span>
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full border ${urgencyColor(p.urgency_level)}`}>
                              {p.urgency_level}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Patient Card */}
                {selectedPatient && (
                  <motion.div
                    key={selectedPatient.patient_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-100"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback className={`bg-gradient-to-br ${bloodGroupColor(selectedPatient.blood_group)} text-white font-semibold`}>
                          {selectedPatient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{selectedPatient.name}</h3>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {selectedPatient.city}
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-xl bg-gradient-to-br ${bloodGroupColor(selectedPatient.blood_group)} text-white font-bold text-sm shadow-md`}>
                        {selectedPatient.blood_group}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100">
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <Clock className="w-3 h-3" />
                          Next Transfusion
                        </div>
                        <div className="text-xs font-semibold text-gray-800">
                          {safeDate(selectedPatient.next_transfusion_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                        <div className={`text-xs mt-0.5 font-medium ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-orange-600' : 'text-green-600'}`}>
                          {days <= 0 ? 'Today!' : `${days}d remaining`}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-gray-100">
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <Droplets className="w-3 h-3" />
                          Units Needed
                        </div>
                        <div className="text-xl font-bold text-gray-900">{selectedPatient.units_needed}</div>
                        <div className="text-xs text-gray-500">units</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <Badge className={`text-xs border ${urgencyColor(selectedPatient.urgency_level)}`} variant="outline">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {(selectedPatient.urgency_level || 'medium').charAt(0).toUpperCase() + (selectedPatient.urgency_level || 'medium').slice(1)} Priority
                      </Badge>
                      {selectedPatient.hospital && (
                        <Badge variant="outline" className="text-xs text-gray-600 border-gray-200">
                          {selectedPatient.hospital}
                        </Badge>
                      )}
                    </div>

                    <Button
                      onClick={runMatch}
                      disabled={matchLoading}
                      className="w-full bg-gradient-to-r from-[#D90429] to-[#EF233C] hover:from-red-700 hover:to-red-500 text-white border-0 shadow-lg shadow-red-200 h-11 text-sm font-semibold"
                    >
                      {matchLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Running AI Match…
                        </>
                      ) : (
                        <>
                          <Brain className="w-4 h-4 mr-2" />
                          Run AI Match
                        </>
                      )}
                    </Button>
                  </motion.div>
                )}
              </CardContent>
            </Card>

            {/* Match Parameters */}
            <Card className="border-0 shadow-lg shadow-gray-200/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <SlidersHorizontal className="w-4 h-4 text-gray-600" />
                  Match Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-5">
                {/* Distance Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Max Distance</label>
                    <span className="text-sm font-semibold text-[#D90429]">{maxDistance} km</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={10}
                    value={maxDistance}
                    onChange={e => setMaxDistance(Number(e.target.value))}
                    className="w-full accent-[#D90429] h-2 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>10 km</span>
                    <span>200 km</span>
                  </div>
                </div>

                {/* Top N Donors */}
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">Top N Donors</label>
                  <div className="flex gap-2">
                    {[5, 10, 15].map(n => (
                      <button
                        key={n}
                        onClick={() => setTopN(n)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                          topN === n
                            ? 'bg-gradient-to-r from-[#D90429] to-[#EF233C] text-white border-transparent shadow-lg'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-red-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <Zap className="w-3 h-3 inline mr-1" />
                    AI considers blood compatibility, proximity, availability probability, and donation eligibility.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ════ RIGHT PANEL ════ */}
          <div className="col-span-3">
            <Card className="border-0 shadow-lg shadow-gray-200/50 h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="w-4 h-4 text-[#D90429]" />
                    Ranked Donors
                  </CardTitle>
                  {matchResults.length > 0 && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">
                      {matchResults.length} matches found
                    </Badge>
                  )}
                </div>
                {selectedPatient && matchRan && !matchLoading && (
                  <CardDescription>
                    Results for <span className="font-medium text-gray-700">{selectedPatient.name}</span>
                    {' '}({selectedPatient.blood_group}) · within {maxDistance} km
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">

                {/* Empty State */}
                {!matchRan && !matchLoading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <motion.div
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-20 h-20 rounded-full bg-gradient-to-br from-red-100 to-rose-100 flex items-center justify-center mb-4 shadow-lg"
                    >
                      <Brain className="w-10 h-10 text-[#D90429]" />
                    </motion.div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Ready to Match</h3>
                    <p className="text-sm text-gray-500 max-w-xs">
                      Select a patient on the left and click <strong>Run AI Match</strong> to find optimal donors.
                    </p>
                  </div>
                )}

                {/* Loading */}
                {matchLoading && (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                  </div>
                )}

                {/* Error */}
                {matchError && !matchLoading && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {matchError}
                  </div>
                )}

                {/* Results */}
                {!matchLoading && matchResults.length > 0 && (
                  <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-1">
                    {matchResults
                      .slice()
                      .sort((a, b) => b.match_score - a.match_score)
                      .map((match, idx) => {
                        const isConfirmed = confirmedIds.has(match.match_id);
                        return (
                          <motion.div
                            key={match.match_id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.06 }}
                          >
                            <Card className={`border shadow-md transition-all duration-300 hover:shadow-xl ${isConfirmed ? 'border-green-300 bg-green-50/30' : 'border-gray-100'}`}>
                              <CardContent className="p-5">
                                {/* Top Row */}
                                <div className="flex items-start gap-3 mb-4">
                                  {/* Rank */}
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow flex-shrink-0 ${
                                    idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                                    idx === 1 ? 'bg-gradient-to-br from-gray-400 to-gray-500' :
                                    idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                                    'bg-gradient-to-br from-slate-400 to-slate-500'
                                  }`}>
                                    #{idx + 1}
                                  </div>

                                  {/* Avatar */}
                                  <Avatar className="w-10 h-10 flex-shrink-0">
                                    <AvatarFallback className={`bg-gradient-to-br ${bloodGroupColor(match.donor_blood_group || 'O+')} text-white text-xs font-semibold`}>
                                      {(match.donor_name || 'DN').split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="font-semibold text-gray-900 text-sm">
                                        {match.donor_name || `Donor ${match.donor_id.slice(-4)}`}
                                      </h3>
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-gradient-to-r ${bloodGroupColor(match.donor_blood_group || '')} text-white`}>
                                        {match.donor_blood_group || '?'}
                                      </span>
                                      {isConfirmed && (
                                        <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs">
                                          <CheckCircle className="w-3 h-3 mr-1" />
                                          Confirmed
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                                      <span className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {match.donor_city || 'Unknown'}
                                      </span>
                                      {match.distance_km !== undefined && match.distance_km !== null && (
                                        <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300 text-blue-700 px-2 py-0.5 ml-1 shadow-sm" title="Calculated via GPS Longitude/Latitude">
                                          <MapPin className="w-3 h-3 inline mr-1" />
                                          {match.distance_km.toFixed(1)} km away
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  {/* Score Gauge */}
                                  <ScoreGauge score={match.match_score} />
                                </div>

                                {/* Score Breakdown */}
                                <div className="mb-3">
                                  <ScoreBar label="Blood Compatibility" value={match.blood_compatibility_score} weight={40} gradient="from-[#D90429] to-[#EF233C]" />
                                  <ScoreBar label="Distance" value={match.distance_score} weight={25} gradient="from-blue-500 to-blue-400" />
                                  <ScoreBar label="Availability" value={match.availability_score} weight={25} gradient="from-green-500 to-emerald-400" />
                                  <ScoreBar label="Eligibility" value={match.eligibility_score} weight={10} gradient="from-purple-500 to-violet-400" />
                                </div>

                                {/* Explanation */}
                                {match.explanation && (
                                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3 italic border border-gray-100">
                                    {match.explanation}
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2 pt-1">
                                  <Button
                                    size="sm"
                                    className="flex-1 bg-gradient-to-r from-[#D90429] to-[#EF233C] text-white border-0 shadow-sm text-xs h-8"
                                    disabled={isConfirmed}
                                    onClick={() => setConfirmModal({ matchId: match.match_id, donorName: match.donor_name || 'Donor' })}
                                  >
                                    <CalendarCheck className="w-3 h-3 mr-1" />
                                    {isConfirmed ? 'Confirmed' : 'Confirm Match'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 border-gray-200 text-gray-600 text-xs h-8"
                                  >
                                    <Phone className="w-3 h-3 mr-1" />
                                    Contact
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                  </div>
                )}

                {/* No results */}
                {matchRan && !matchLoading && !matchError && matchResults.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <Users className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium">No donors found</p>
                    <p className="text-sm text-gray-400 mt-1">Try increasing the max distance or changing filters.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── How AI Scoring Works ── */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-[#D90429]" />
              How AI Scoring Works
            </CardTitle>
            <CardDescription>Multi-factor XGBoost model trained on historical donation outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  icon: Droplets,
                  label: 'Blood Compatibility',
                  weight: '40%',
                  color: 'from-[#D90429] to-[#EF233C]',
                  bg: 'from-red-50 to-rose-50',
                  border: 'border-red-100',
                  formula: 'ABO/Rh match + antigen compatibility',
                  desc: 'Exact blood group match scores 1.0; compatible groups score 0.6–0.9',
                },
                {
                  icon: MapPin,
                  label: 'Distance Score',
                  weight: '25%',
                  color: 'from-blue-500 to-blue-400',
                  bg: 'from-blue-50 to-sky-50',
                  border: 'border-blue-100',
                  formula: '1 − (dist / max_dist)',
                  desc: 'Exponential decay: closer donors score higher up to a proximity cap',
                },
                {
                  icon: Activity,
                  label: 'Availability',
                  weight: '25%',
                  color: 'from-green-500 to-emerald-400',
                  bg: 'from-green-50 to-emerald-50',
                  border: 'border-green-100',
                  formula: 'ML probability × response_rate',
                  desc: 'Predicted from historical patterns, preferred time slots, call response',
                },
                {
                  icon: Shield,
                  label: 'Eligibility',
                  weight: '10%',
                  color: 'from-purple-500 to-violet-400',
                  bg: 'from-purple-50 to-violet-50',
                  border: 'border-purple-100',
                  formula: 'next_eligible_date vs. today',
                  desc: 'Binary eligibility check with days-until-eligible soft penalty',
                },
              ].map((factor, i) => (
                <div key={i} className={`p-4 rounded-2xl bg-gradient-to-br ${factor.bg} border ${factor.border} relative overflow-hidden`}>
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${factor.color} flex items-center justify-center shadow-md mb-3`}>
                    <factor.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-gray-900">{factor.label}</h4>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${factor.color} text-white`}>
                      {factor.weight}
                    </span>
                  </div>
                  <code className="text-xs text-gray-500 bg-white/70 px-2 py-1 rounded-md block mb-2 font-mono">
                    {factor.formula}
                  </code>
                  <p className="text-xs text-gray-600 leading-relaxed">{factor.desc}</p>
                  {/* Weight visual */}
                  <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${factor.color} rounded-full`}
                      style={{ width: factor.weight }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <ConfirmModal
          matchId={confirmModal.matchId}
          donorName={confirmModal.donorName}
          onClose={() => setConfirmModal(null)}
          onConfirmed={() => {
            setConfirmedIds(prev => new Set([...prev, confirmModal.matchId]));
            setConfirmModal(null);
          }}
        />
      )}
    </div>
  );
}
