/**
 * BloodBridge AI — Donor Dashboard
 * Red/Orange gamified donor experience
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth';
import { donorsApi, matchesApi } from '../../lib/api';
import {
  Droplet, Award, Calendar, TrendingUp, Flame, Star, Clock,
  CheckCircle, AlertCircle, Heart, Activity, Zap, Gift,
  ChevronRight, RefreshCw, User, ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Skeleton } from '../components/ui/skeleton';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DonorProfile {
  donor_id: string;
  name?: string;
  blood_group: string;
  total_donations: number;
  streak: number;
  eligibility_status: string;
  next_eligible_date?: string;
  donor_score: number;
  availability_probability: number;
  badge: string;
  frequency_in_days: number;
  last_donation_date?: string;
  city?: string;
}

interface PendingMatch {
  match_id: string;
  patient_id: string;
  donor_id: string;
  patient_blood_group?: string;
  patient_city?: string;
  match_score: number;
  distance_km?: number;
  status: string;
  urgency?: string;
  days_until?: number;
}

interface PredictionResult {
  availability_probability: number;
  donor_score: number;
  prediction_label: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BADGE_TIERS = [
  { key: 'new_hero',       label: 'New Hero',       emoji: '🌟', minDonations: 1  },
  { key: 'silver_donor',   label: 'Silver Donor',   emoji: '🥈', minDonations: 3  },
  { key: 'gold_donor',     label: 'Gold Donor',     emoji: '🥇', minDonations: 5  },
  { key: 'platinum_hero',  label: 'Platinum Hero',  emoji: '💎', minDonations: 8  },
  { key: 'blood_legend',   label: 'Blood Legend',   emoji: '🏆', minDonations: 10 },
];

function getBadgeTier(totalDonations: number) {
  let current = BADGE_TIERS[0];
  for (const tier of BADGE_TIERS) {
    if (totalDonations >= tier.minDonations) current = tier;
  }
  return current;
}

function getNextBadgeTier(totalDonations: number) {
  for (const tier of BADGE_TIERS) {
    if (totalDonations < tier.minDonations) return tier;
  }
  return null;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function getDaysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── SVG Circle Gauge ─────────────────────────────────────────────────────────

function CircleGauge({
  value,
  size = 120,
  strokeWidth = 10,
  color = '#ffffff',
  label,
  sublabel,
  dark = false,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  dark?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={dark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)'}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center" style={{ marginTop: -(size / 2 + 8) }}>
        <span className="text-2xl font-bold" style={{ color }}>{value}%</span>
      </div>
      {label && <p className="text-sm font-semibold text-center" style={{ color }}>{label}</p>}
      {sublabel && <p className="text-xs opacity-75 text-center" style={{ color }}>{sublabel}</p>}
    </div>
  );
}

// ─── Relative Score Arc ───────────────────────────────────────────────────────

function ScoreArc({ score, size = 140 }: { score: number; size?: number }) {
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={12} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color} strokeWidth={12}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-500 font-medium">/ 100</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DonorDashboard() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();

  const [donorProfile, setDonorProfile] = useState<DonorProfile | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [matchActions, setMatchActions] = useState<Record<string, 'accepting' | 'declining' | 'done'>>({});
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [availForm, setAvailForm] = useState({ status: 'eligible', date: '', inactive_trigger_comment: '' });
  const [shareMatch, setShareMatch] = useState<PendingMatch | null>(null);

  const firstName = user?.name?.split(' ')[0] ?? 'Donor';
  const initials = user?.avatar_initials ?? user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'D';

  // Load donor profile — either from auth context or API
  const loadDonorProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      // Prefer auth context profile; fall back to API if linked_donor_id available
      if (user?.donor_profile && Object.keys(user.donor_profile).length > 0) {
        setDonorProfile(user.donor_profile as DonorProfile);
      } else if (user?.linked_donor_id) {
        const data = await donorsApi.get(user.linked_donor_id);
        setDonorProfile(data as DonorProfile);
      }
    } catch (err) {
      console.error('Failed to load donor profile', err);
    } finally {
      setLoadingProfile(false);
    }
  }, [user]);

  // Load AI prediction
  const loadPrediction = useCallback(async (donorId: string) => {
    setLoadingPrediction(true);
    try {
      const data = await donorsApi.predict(donorId);
      setPrediction(data);
    } catch (err) {
      console.error('Prediction failed', err);
    } finally {
      setLoadingPrediction(false);
    }
  }, []);

  // Load pending matches for this donor
  const loadMatches = useCallback(async (donorId: string) => {
    setLoadingMatches(true);
    try {
      const data = await matchesApi.list({ status: 'pending' });
      // Filter for this donor
      const filtered = (data as PendingMatch[]).filter(m => m.donor_id === donorId);
      setPendingMatches(filtered.slice(0, 3));
    } catch (err) {
      console.error('Failed to load matches', err);
    } finally {
      setLoadingMatches(false);
    }
  }, []);


  useEffect(() => {
    loadDonorProfile();
  }, [loadDonorProfile]);

  useEffect(() => {
    if (donorProfile?.donor_id) {
      loadPrediction(donorProfile.donor_id);
      loadMatches(donorProfile.donor_id);
    }
  }, [donorProfile, loadPrediction, loadMatches]);

  const handleAccept = async (matchId: string) => {
    setMatchActions(prev => ({ ...prev, [matchId]: 'accepting' }));
    try {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      await matchesApi.confirm(matchId, tomorrow, 'Accepted by donor');
      setMatchActions(prev => ({ ...prev, [matchId]: 'done' }));
    } catch {
      setMatchActions(prev => { const n = { ...prev }; delete n[matchId]; return n; });
    }
  };

  const handleDecline = async (matchId: string) => {
    setMatchActions(prev => ({ ...prev, [matchId]: 'declining' }));
    try {
      await matchesApi.decline(matchId);
      setMatchActions(prev => ({ ...prev, [matchId]: 'done' }));
      const match = pendingMatches.find(m => m.match_id === matchId);
      if (match) setShareMatch(match);
    } catch {
      setMatchActions(prev => { const n = { ...prev }; delete n[matchId]; return n; });
    }
  };

  const handleRefreshPrediction = async () => {
    if (!donorProfile?.donor_id) return;
    setPredictionLoading(true);
    try {
      const data = await donorsApi.predict(donorProfile.donor_id);
      setPrediction(data);
    } finally {
      setPredictionLoading(false);
    }
  };

  const handleOpenAvailabilityModal = () => {
    if (profile) {
      setAvailForm({
        status: profile.eligibility_status || 'eligible',
        date: profile.next_eligible_date ? profile.next_eligible_date.split('T')[0] : '',
        inactive_trigger_comment: profile.inactive_trigger_comment || '',
      });
    }
    setShowAvailabilityModal(true);
  };

  const handleSaveAvailability = async () => {
    if (!donorProfile?.donor_id) return;
    setUpdatingAvailability(true);
    try {
      const payload: Record<string, any> = {
        eligibility_status: availForm.status,
        inactive_trigger_comment: availForm.inactive_trigger_comment || '',
      };
      // Send the date if specified; if cleared, send null or empty string to reset
      payload.next_eligible_date = availForm.date || null;

      const updated = await donorsApi.update(donorProfile.donor_id, payload);
      setDonorProfile(updated as DonorProfile);

      // Sync prediction state with the newly updated profile
      setPrediction({
        availability_probability: updated.availability_probability,
        donor_score: updated.donor_score,
        prediction_label: updated.eligibility_status,
      } as PredictionResult);

      // Refresh the user profile in Auth context
      await refreshMe();

      setShowAvailabilityModal(false);
    } catch (err) {
      console.error('Failed to update availability', err);
      alert('Failed to save. Please try again.');
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const profile = donorProfile;
  const score = prediction?.donor_score ?? profile?.donor_score ?? 0;
  const availScore = Math.round((prediction?.availability_probability ?? profile?.availability_probability ?? 0) * 100);
  const currentBadge = getBadgeTier(profile?.total_donations ?? 0);
  const nextBadge = getNextBadgeTier(profile?.total_donations ?? 0);
  const progressToNext = nextBadge
    ? Math.min(100, Math.round(((profile?.total_donations ?? 0) / nextBadge.minDonations) * 100))
    : 100;

  // Milestone timeline items
  const milestones = [
    { label: 'Joined the mission 🌟',       threshold: 1,  emoji: '🌟' },
    { label: 'Silver Donor earned 🥈',       threshold: 3,  emoji: '🥈' },
    { label: 'Gold Donor earned 🥇',         threshold: 5,  emoji: '🥇' },
    { label: 'Blood Legend achieved 🏆',     threshold: 10, emoji: '🏆' },
  ];
  const totalDonations = profile?.total_donations ?? 0;

  const eligibilityColor =
    profile?.eligibility_status === 'eligible' ? 'text-green-600 bg-green-50 border-green-200'
    : 'text-orange-600 bg-orange-50 border-orange-200';

  const eligibilityIcon = profile?.eligibility_status === 'eligible'
    ? <CheckCircle className="w-3 h-3" />
    : <Clock className="w-3 h-3" />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-rose-50 p-4 md:p-6 lg:p-8 space-y-6">

      {/* ── 1. HERO WELCOME BANNER ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#D90429] via-[#EF233C] to-orange-500 p-6 md:p-8 shadow-2xl shadow-red-200"
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full bg-orange-400/20" />
        </div>

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Left: Identity */}
          <div className="flex items-start gap-4">
            <Avatar className="w-16 h-16 md:w-20 md:h-20 ring-4 ring-white/30 shadow-xl flex-shrink-0">
              <AvatarFallback className="bg-white/20 text-white text-xl md:text-2xl font-bold backdrop-blur-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white/20 text-white border-white/30 text-xs font-medium">
                  Blood Donor
                </Badge>
                {profile?.blood_group && (
                  <Badge className="bg-red-900/40 text-white border-red-800/40 text-xs font-bold">
                    <Droplet className="w-3 h-3 mr-1" />
                    {profile.blood_group}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                Welcome back, {firstName}!
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
                  <span className="text-base">{currentBadge.emoji}</span>
                  <span className="text-white text-xs font-semibold">{currentBadge.label}</span>
                </div>
                {(profile?.streak ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 bg-orange-500/30 rounded-full px-3 py-1">
                    <Flame className="w-3.5 h-3.5 text-orange-200" />
                    <span className="text-white text-xs font-semibold">{profile?.streak} donation streak</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Score Circle */}
          <div className="flex flex-col items-center gap-2 self-center md:self-auto bg-white/10 rounded-2xl px-6 py-4 backdrop-blur-sm border border-white/20">
            {loadingProfile ? (
              <div className="w-24 h-24 rounded-full bg-white/20 animate-pulse" />
            ) : (
              <>
                <div className="relative flex items-center justify-center w-24 h-24">
                  <svg width="96" height="96" className="-rotate-90">
                    <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                    <circle
                      cx="48" cy="48" r="38" fill="none" stroke="white" strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 38}
                      strokeDashoffset={2 * Math.PI * 38 * (1 - score / 100)}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-bold text-white">{score}</span>
                  </div>
                </div>
                <p className="text-white/80 text-xs font-medium text-center">AI Donor Score</p>
                <p className="text-white/60 text-xs text-center">XGBoost Powered</p>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── 2. KPI ROW ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <Heart className="w-5 h-5 text-white" />,
            gradient: 'from-[#D90429] to-[#EF233C]',
            label: 'Total Donations',
            value: loadingProfile ? null : (profile?.total_donations ?? 0),
            sub: 'lifetime',
          },
          {
            icon: <Flame className="w-5 h-5 text-white" />,
            gradient: 'from-orange-500 to-red-500',
            label: 'Current Streak',
            value: loadingProfile ? null : (profile?.streak ?? 0),
            sub: 'donations',
          },
          {
            icon: <CheckCircle className="w-5 h-5 text-white" />,
            gradient: profile?.eligibility_status === 'eligible'
              ? 'from-green-500 to-emerald-500'
              : 'from-orange-400 to-amber-500',
            label: 'Eligibility',
            value: loadingProfile ? null : undefined,
            badge: profile?.eligibility_status,
            badgeClass: eligibilityColor,
            badgeIcon: eligibilityIcon,
          },
          {
            icon: <Calendar className="w-5 h-5 text-white" />,
            gradient: 'from-blue-500 to-indigo-500',
            label: 'Next Eligible',
            value: loadingProfile ? null : undefined,
            dateStr: profile?.next_eligible_date,
            sub: (() => {
              const d = getDaysUntil(profile?.next_eligible_date);
              return d !== null ? (d <= 0 ? 'Ready now!' : `in ${d} days`) : '';
            })(),
          },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow-lg`}>
                    {kpi.icon}
                  </div>
                </div>
                <p className="text-xs text-gray-500 font-medium mb-1">{kpi.label}</p>
                {kpi.value === null ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : kpi.value !== undefined ? (
                  <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                ) : kpi.badge ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${kpi.badgeClass}`}>
                    {kpi.badgeIcon}{kpi.badge}
                  </span>
                ) : kpi.dateStr ? (
                  <p className="text-sm font-bold text-gray-900 leading-tight">{formatDate(kpi.dateStr)}</p>
                ) : (
                  <Skeleton className="h-6 w-20" />
                )}
                {kpi.sub && <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── 3 & 4. AVAILABILITY SCORE + MATCHED REQUESTS ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Availability Score (2/3 width) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card className="h-full border-0 shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-gray-900">AI Availability Score</CardTitle>
                  <p className="text-xs text-gray-500 mt-0.5">Your AI-Predicted Availability Score</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshPrediction}
                  disabled={predictionLoading || loadingPrediction}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${predictionLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-8">
                {/* Score arc */}
                <div className="flex-shrink-0">
                  {loadingPrediction || loadingProfile ? (
                    <div className="w-36 h-36 rounded-full bg-gray-100 animate-pulse" />
                  ) : (
                    <ScoreArc score={availScore} size={148} />
                  )}
                </div>

                {/* Stats */}
                <div className="flex-1 space-y-4 w-full">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-gray-600 font-medium">Availability Likelihood</span>
                      <span className="font-bold text-gray-900">{availScore}%</span>
                    </div>
                    <Progress
                      value={availScore}
                      className="h-2.5 rounded-full"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                      {availScore >= 70 ? '🟢 High — You\'re likely available to donate soon!'
                        : availScore >= 40 ? '🟡 Moderate — Consider updating your schedule'
                        : '🔴 Low — You may not be available in the near term'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-3 border border-red-100">
                      <p className="text-xs text-gray-500">Donation Frequency</p>
                      <p className="text-lg font-bold text-gray-900">
                        {profile?.frequency_in_days ? `${profile.frequency_in_days}d` : 'N/A'}
                      </p>
                      <p className="text-xs text-gray-400">avg interval</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100">
                      <p className="text-xs text-gray-500">AI Model</p>
                      <p className="text-sm font-bold text-blue-700">XGBoost</p>
                      <p className="text-xs text-gray-400">Predictive ML</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 italic">
                    Based on your donation history, frequency, and eligibility patterns.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <Button
                  className="w-full bg-gradient-to-r from-[#D90429] to-orange-500 hover:from-[#b8001f] hover:to-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-red-200/50 transition-all"
                  onClick={handleOpenAvailabilityModal}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Update My Availability
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Matched Requests (1/3 width) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="h-full border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                Matched Requests
              </CardTitle>
              <p className="text-xs text-gray-500">Pending requests for your blood group</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingMatches ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-7 w-full" />
                  </div>
                ))
              ) : pendingMatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">No pending requests right now.</p>
                  <p className="text-xs text-gray-400 mt-1">Stay ready! We'll notify you. 💪</p>
                </div>
              ) : (
                pendingMatches.map((match) => {
                  const action = matchActions[match.match_id];
                  const isDone = action === 'done';
                  return (
                    <div
                      key={match.match_id}
                      className={`rounded-xl border p-3 transition-all ${isDone ? 'bg-green-50 border-green-200 opacity-60' : 'border-gray-100 hover:border-red-200'}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-bold">
                          <Droplet className="w-3 h-3 mr-1" />
                          {match.patient_blood_group ?? profile?.blood_group ?? '—'}
                        </Badge>
                        {match.distance_km !== undefined && (
                          <span className="text-xs text-gray-400">{match.distance_km?.toFixed(1)} km</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-0.5">
                        📍 {match.patient_city ?? 'Nearby city'}
                      </p>
                      <div className="flex items-center gap-1 mb-2.5">
                        <div className={`w-2 h-2 rounded-full ${
                          match.urgency === 'critical' ? 'bg-red-500 animate-pulse'
                          : match.urgency === 'high' ? 'bg-orange-500'
                          : 'bg-yellow-500'
                        }`} />
                        <span className="text-xs text-gray-500 capitalize">
                          {match.urgency ?? 'Standard'} urgency
                        </span>
                        {match.days_until !== undefined && (
                          <span className="text-xs text-gray-400 ml-auto">
                            in {match.days_until}d
                          </span>
                        )}
                      </div>
                      {isDone ? (
                        <p className="text-xs text-green-600 font-medium text-center py-1">
                          ✅ Response recorded
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg"
                            onClick={() => handleAccept(match.match_id)}
                            disabled={!!action}
                          >
                            {action === 'accepting' ? '...' : 'Accept'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs rounded-lg border-gray-200"
                            onClick={() => handleDecline(match.match_id)}
                            disabled={!!action}
                          >
                            {action === 'declining' ? '...' : 'Decline'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── 5. IMPACT TIMELINE ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#D90429]" />
              Your Impact Timeline
            </CardTitle>
            <p className="text-xs text-gray-500">Donation milestones you've achieved</p>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Horizontal connector line */}
              <div className="hidden sm:block absolute top-6 left-8 right-8 h-0.5 bg-gradient-to-r from-gray-200 via-red-300 to-gray-200 z-0" />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
                {milestones.map((m, i) => {
                  const achieved = totalDonations >= m.threshold;
                  const isCurrent = achieved && (
                    i === milestones.length - 1 ||
                    totalDonations < milestones[i + 1].threshold
                  );
                  return (
                    <div key={i} className={`flex flex-col items-center text-center gap-2 p-3 rounded-2xl transition-all ${
                      isCurrent ? 'bg-gradient-to-b from-red-50 to-orange-50 border-2 border-red-200 shadow-lg shadow-red-100' : ''
                    }`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-md transition-all ${
                        achieved
                          ? 'bg-gradient-to-br from-[#D90429] to-orange-500 shadow-red-200'
                          : 'bg-gray-100 opacity-40 grayscale'
                      }`}>
                        {m.emoji}
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${achieved ? 'text-gray-900' : 'text-gray-400'}`}>
                          {m.threshold === 1 ? '1st' : `${m.threshold}+`} Donation{m.threshold > 1 ? 's' : ''}
                        </p>
                        <p className={`text-xs mt-0.5 ${achieved ? 'text-gray-600' : 'text-gray-300'} leading-tight`}>
                          {m.label}
                        </p>
                      </div>
                      {isCurrent && (
                        <Badge className="bg-red-500 text-white border-0 text-xs animate-pulse">
                          You are here!
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress to next milestone */}
              {nextBadge && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-gray-600 font-medium">
                      Progress to {nextBadge.emoji} {nextBadge.label}
                    </span>
                    <span className="font-bold text-[#D90429]">
                      {totalDonations} / {nextBadge.minDonations}
                    </span>
                  </div>
                  <Progress value={progressToNext} className="h-2 rounded-full" />
                  <p className="text-xs text-gray-400 mt-1.5">
                    🎯 {nextBadge.minDonations - totalDonations} more donation{nextBadge.minDonations - totalDonations !== 1 ? 's' : ''} to unlock {nextBadge.label}!
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── 6. BADGE SHOWCASE ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Badge Showcase
            </CardTitle>
            <p className="text-xs text-gray-500">Your donor achievement badges</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {BADGE_TIERS.map((tier) => {
                const earned = totalDonations >= tier.minDonations;
                const isCurrent = currentBadge.key === tier.key;
                return (
                  <div key={tier.key} className={`flex flex-col items-center gap-2 p-3 rounded-2xl text-center transition-all ${
                    isCurrent
                      ? 'bg-gradient-to-b from-red-50 to-orange-50 border-2 border-[#D90429] shadow-lg shadow-red-100/50'
                      : earned
                        ? 'bg-gray-50 border border-gray-200'
                        : 'opacity-40 grayscale'
                  }`}>
                    <div className={`text-3xl transition-all ${
                      isCurrent ? 'drop-shadow-[0_0_8px_rgba(217,4,41,0.5)] scale-110' : ''
                    }`}>
                      {tier.emoji}
                    </div>
                    <p className={`text-xs font-semibold leading-tight ${
                      isCurrent ? 'text-[#D90429]' : earned ? 'text-gray-700' : 'text-gray-300'
                    }`}>
                      {tier.label}
                    </p>
                    <p className="text-xs text-gray-400">{tier.minDonations}+ donations</p>
                    {isCurrent && (
                      <Badge className="bg-[#D90429] text-white border-0 text-xs px-1.5">
                        Current
                      </Badge>
                    )}
                    {earned && !isCurrent && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── 7. QUICK ACTIONS ROW ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: <User className="w-5 h-5 text-white" />,
              gradient: 'from-slate-600 to-slate-700',
              label: 'View My Profile',
              sub: 'Update your details',
              path: '/donors',
            },
            {
              icon: <Heart className="w-5 h-5 text-white" />,
              gradient: 'from-[#D90429] to-[#EF233C]',
              label: 'Thalassemia Hub',
              sub: 'Patient overview',
              path: '/',
            },
            {
              icon: <Clock className="w-5 h-5 text-white" />,
              gradient: 'from-orange-500 to-amber-500',
              label: 'Donation History',
              sub: 'View past donations',
              path: '/donors',
            },
            {
              icon: <Activity className="w-5 h-5 text-white" />,
              gradient: 'from-blue-500 to-indigo-500',
              label: 'Update Availability',
              sub: 'Set your schedule',
              action: handleOpenAvailabilityModal,
            },
          ].map((actionItem, i) => (
            <button
              key={i}
              onClick={() => actionItem.action ? actionItem.action() : navigate(actionItem.path!)}
              className="group flex items-center gap-4 bg-white rounded-2xl p-4 shadow-md hover:shadow-xl border border-gray-100 hover:border-gray-200 transition-all duration-300 hover:-translate-y-0.5 text-left w-full"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${actionItem.gradient} flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform`}>
                {actionItem.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{actionItem.label}</p>
                <p className="text-xs text-gray-400 truncate">{actionItem.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      </motion.div>

      {/* Availability Update Modal */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D90429] to-orange-500 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Update Availability</h3>
                <p className="text-xs text-gray-500">AI score will recalculate automatically on save</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Eligibility Status</label>
                <select
                  value={availForm.status}
                  onChange={(e) => setAvailForm({ ...availForm, status: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-gray-50"
                >
                  <option value="eligible">✅ Eligible to Donate</option>
                  <option value="ineligible">❌ Currently Ineligible</option>
                  <option value="temporarily_deferred">⏳ Temporarily Deferred</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Next Eligible Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={availForm.date}
                  onChange={(e) => setAvailForm({ ...availForm, date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-gray-50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Reason for Unavailability <span className="text-gray-400 font-normal">(affects AI score)</span>
                </label>
                <textarea
                  value={availForm.inactive_trigger_comment}
                  onChange={(e) => setAvailForm({ ...availForm, inactive_trigger_comment: e.target.value })}
                  placeholder="e.g. out of station, pregnant, busy with exams, travelling..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none bg-gray-50 resize-none"
                />
                <p className="text-xs text-orange-500 mt-1">⚠️ Keywords like 'surgery', 'pregnant', or 'travel' will lower your AI availability score.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAvailabilityModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-[#D90429] to-orange-500 text-white shadow-lg"
                onClick={handleSaveAvailability}
                disabled={updatingAvailability}
              >
                {updatingAvailability ? '⏳ Saving...' : '💾 Save Updates'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* SHARE REFERRAL MODAL */}
      <AnimatePresence>
        {shareMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Heart className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold">Refer a Hero</h3>
                <p className="text-blue-100 text-sm mt-1">
                  You can't donate right now, but your network can save a life!
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <p className="text-sm text-gray-700 italic">
                    "Urgent: A patient near {shareMatch.patient_city || 'my city'} needs {shareMatch.patient_blood_group || profile?.blood_group || 'blood'} immediately. I am currently unavailable to donate. Can anyone from my network help? Register at bloodbridge.ai to match."
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Button 
                    className="w-full bg-[#25D366] hover:bg-[#20b858] text-white h-12 text-md rounded-xl"
                    onClick={() => {
                      const text = encodeURIComponent(`Urgent: A patient near ${shareMatch.patient_city || 'my city'} needs ${shareMatch.patient_blood_group || profile?.blood_group || 'blood'} immediately. I am currently unavailable to donate. Can anyone from my network help? Register at https://bloodbridge.ai to match.`);
                      window.open(`https://wa.me/?text=${text}`, '_blank');
                      setShareMatch(null);
                    }}
                  >
                    Share on WhatsApp
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full h-12 text-md rounded-xl text-gray-600 border-gray-200"
                    onClick={() => setShareMatch(null)}
                  >
                    Skip for now
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
