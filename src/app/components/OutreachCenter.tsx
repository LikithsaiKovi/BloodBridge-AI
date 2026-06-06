import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Globe,
  Sparkles,
  Search,
  Copy,
  CheckCircle,
  Loader2,
  Flame,
  Trophy,
  Award,
  Clock,
  TrendingUp,
  Users,
  Percent,
  Languages,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { donorsApi, outreachApi, Donor } from '../../lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OutreachMessage {
  id: string;
  donor_id: string;
  message: string;
  language: string;
  message_type: string;
  direction: 'sent' | 'received';
  timestamp: string;
  status?: string;
}

interface GeneratedMessage {
  title?: string;
  body?: string;
  message?: string;
  language: string;
  message_type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'english', label: 'English', flag: '🇬🇧' },
  { code: 'hindi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'telugu', label: 'Telugu', flag: '🇮🇳' },
  { code: 'marathi', label: 'Marathi', flag: '🇮🇳' },
];

const MESSAGE_TYPES = [
  { code: 'initial_request', label: 'Initial Request' },
  { code: 'reminder', label: 'Reminder' },
  { code: 'thank_you', label: 'Thank You' },
  { code: 'follow_up', label: 'Follow-Up' },
];

const BADGE_COLORS: Record<string, string> = {
  'Blood Hero': 'from-yellow-400 to-amber-500',
  'Life Saver': 'from-[#D90429] to-[#EF233C]',
  'Regular Donor': 'from-blue-500 to-blue-400',
  'New Donor': 'from-green-500 to-emerald-400',
  'Champion': 'from-purple-500 to-violet-500',
};

const BLOOD_GRADIENT: Record<string, string> = {
  'O+': 'from-[#D90429] to-[#EF233C]',
  'O-': 'from-red-800 to-red-600',
  'A+': 'from-blue-600 to-blue-400',
  'A-': 'from-blue-800 to-blue-600',
  'B+': 'from-purple-600 to-purple-400',
  'B-': 'from-purple-800 to-purple-600',
  'AB+': 'from-orange-500 to-amber-400',
  'AB-': 'from-orange-700 to-orange-500',
};

function bloodGradient(bg: string) {
  return BLOOD_GRADIENT[bg] || 'from-gray-600 to-gray-400';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function scorePct(score: number) {
  if (score <= 1) return Math.round(score * 100);
  return Math.round(score);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  suffix?: string;
}

function KpiCard({ icon: Icon, label, value, color, suffix }: KpiProps) {
  return (
    <Card className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity`} />
      <CardContent className="p-5">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md mb-3`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {value}{suffix}
        </div>
        <div className="text-xs text-gray-500 mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: OutreachMessage }) {
  const isSent = msg.direction !== 'received';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`max-w-[80%] ${isSent ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
            isSent
              ? 'bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white rounded-br-sm'
              : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
          }`}
        >
          {msg.message}
        </div>
        <div className={`flex items-center gap-2 px-1 ${isSent ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs text-gray-400">{formatTimestamp(msg.timestamp)}</span>
          <Badge variant="outline" className="text-xs px-1.5 py-0 border-gray-200 text-gray-500">
            {msg.language}
          </Badge>
          <Badge variant="outline" className="text-xs px-1.5 py-0 border-purple-200 text-purple-600">
            {msg.message_type?.replace('_', ' ')}
          </Badge>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OutreachCenter() {
  // Donors
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donorSearch, setDonorSearch] = useState('');
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [donorsLoading, setDonorsLoading] = useState(true);

  // KPIs
  const [stats, setStats] = useState<any>(null);

  // Message compose
  const [language, setLanguage] = useState('english');
  const [messageType, setMessageType] = useState('initial_request');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedMessage | null>(null);
  const [generateError, setGenerateError] = useState('');
  const [copied, setCopied] = useState(false);

  // Send
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // History
  const [history, setHistory] = useState<OutreachMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<Donor[]>([]);

  // ── Load initial data ──
  useEffect(() => {
    donorsApi.list({ limit: 50 }).then(data => {
      setDonors(data);
      if (data.length) setSelectedDonor(data[0]);
    }).catch(() => {}).finally(() => setDonorsLoading(false));

    outreachApi.stats().then(setStats).catch(() => {});

    donorsApi.list({ sort_by: 'donor_score', limit: 5 }).then(setLeaderboard).catch(() => {});
  }, []);

  // ── Load history when donor changes ──
  useEffect(() => {
    if (!selectedDonor) return;
    setHistoryLoading(true);
    setHistory([]);
    outreachApi.history(selectedDonor.donor_id)
      .then(data => setHistory(data || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
    setGenerated(null);
    setSendSuccess(false);
  }, [selectedDonor?.donor_id]);

  // ── Scroll to bottom on history update ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const filteredDonors = donors.filter(d =>
    !donorSearch ||
    d.name?.toLowerCase().includes(donorSearch.toLowerCase()) ||
    d.blood_group?.toLowerCase().includes(donorSearch.toLowerCase()) ||
    d.city?.toLowerCase().includes(donorSearch.toLowerCase())
  );

  async function handleGenerate() {
    if (!selectedDonor) return;
    setGenerating(true);
    setGenerateError('');
    setGenerated(null);
    setSendSuccess(false);
    try {
      const res = await outreachApi.generate({
        donor_id: selectedDonor.donor_id,
        language,
        message_type: messageType,
      });
      setGenerated({ ...res, language, message_type: messageType });
    } catch (e: any) {
      setGenerateError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!selectedDonor || !generated) return;
    const body = generated.body || generated.message || '';
    setSending(true);
    try {
      await outreachApi.send({
        donor_id: selectedDonor.donor_id,
        message: body,
        language,
        message_type: messageType,
      });
      // Add optimistically to history
      const newMsg: OutreachMessage = {
        id: Date.now().toString(),
        donor_id: selectedDonor.donor_id,
        message: body,
        language,
        message_type: messageType,
        direction: 'sent',
        timestamp: new Date().toISOString(),
      };
      setHistory(prev => [...prev, newMsg]);
      setSendSuccess(true);
      setGenerated(null);
    } catch (e: any) {
      // Silently fail — show in button
    } finally {
      setSending(false);
    }
  }

  function handleCopy() {
    const text = generated?.body || generated?.message || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const kpiItems = [
    { icon: Send, label: 'Total Messages Sent', value: stats?.total_messages ?? stats?.total_sent ?? '—', color: 'from-purple-500 to-violet-500' },
    { icon: Percent, label: 'Response Rate', value: stats?.response_rate ?? stats?.response_rate_pct ?? '—', color: 'from-blue-500 to-blue-400', suffix: typeof (stats?.response_rate ?? stats?.response_rate_pct) === 'number' ? '%' : '' },
    { icon: Languages, label: 'Languages Used', value: stats?.languages_used ?? LANGUAGES.length, color: 'from-green-500 to-emerald-400' },
    { icon: TrendingUp, label: 'Success Rate', value: stats?.success_rate ?? stats?.success_rate_pct ?? '—', color: 'from-orange-500 to-amber-400', suffix: typeof (stats?.success_rate ?? stats?.success_rate_pct) === 'number' ? '%' : '' },
  ];

  const rankMedals = ['🥇', '🥈', '🥉'];

  return (
    <div className="min-h-screen p-8 bg-gray-50/50">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-violet-600 to-pink-600 p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute top-6 right-12 opacity-10">
            <Globe className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-lg">
                <MessageSquare className="w-7 h-7" />
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-xl">
                Multilingual AI
              </Badge>
            </div>
            <h1 className="text-4xl font-semibold mb-2">AI Outreach Center</h1>
            <p className="text-white/90 text-lg max-w-2xl">
              Engage donors with AI-crafted multilingual messages across WhatsApp, SMS, and calls
            </p>
          </div>
        </div>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-4 gap-5">
          {kpiItems.map((kpi, i) => (
            <KpiCard key={i} icon={kpi.icon} label={kpi.label} value={kpi.value} color={kpi.color} suffix={kpi.suffix} />
          ))}
        </div>

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* ════ LEFT: Donor Selector ════ */}
          <div className="col-span-1 space-y-4">
            <Card className="border-0 shadow-lg shadow-gray-200/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4 text-purple-600" />
                  Select Donor
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={donorSearch}
                    onChange={e => setDonorSearch(e.target.value)}
                    placeholder="Search donors…"
                    className="pl-9 h-9 text-sm border-gray-200"
                  />
                </div>

                {/* List */}
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                  {donorsLoading ? (
                    <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  ) : filteredDonors.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No donors found</p>
                  ) : (
                    filteredDonors.map(donor => (
                      <button
                        key={donor.donor_id}
                        onClick={() => setSelectedDonor(donor)}
                        className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                          selectedDonor?.donor_id === donor.donor_id
                            ? 'bg-purple-50 border-2 border-purple-200'
                            : 'hover:bg-gray-50 border-2 border-transparent'
                        }`}
                      >
                        <Avatar className="w-8 h-8 flex-shrink-0">
                          <AvatarFallback className={`bg-gradient-to-br ${bloodGradient(donor.blood_group)} text-white text-xs font-semibold`}>
                            {(donor.name || 'D').split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-800 truncate">{donor.name || `Donor ${donor.donor_id.slice(-4)}`}</div>
                          <div className="text-xs text-gray-400">{donor.blood_group} · {scorePct(donor.donor_score)}%</div>
                        </div>
                        <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-colors ${selectedDonor?.donor_id === donor.donor_id ? 'text-purple-500' : 'text-gray-300'}`} />
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Donor Card */}
            <AnimatePresence mode="wait">
              {selectedDonor && (
                <motion.div
                  key={selectedDonor.donor_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Card className="border-0 shadow-lg shadow-gray-200/50 overflow-hidden">
                    <div className={`h-2 bg-gradient-to-r ${bloodGradient(selectedDonor.blood_group)}`} />
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className={`bg-gradient-to-br ${bloodGradient(selectedDonor.blood_group)} text-white font-bold`}>
                            {(selectedDonor.name || 'D').split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm">{selectedDonor.name || `Donor ${selectedDonor.donor_id.slice(-4)}`}</h3>
                          <p className="text-xs text-gray-500">{selectedDonor.city || 'Unknown city'}</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg bg-gradient-to-br ${bloodGradient(selectedDonor.blood_group)} text-white font-bold text-sm shadow`}>
                          {selectedDonor.blood_group}
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100">
                          <div className="text-xs text-purple-600 mb-0.5">Donor Score</div>
                          <div className="text-lg font-bold text-purple-800">{scorePct(selectedDonor.donor_score)}%</div>
                        </div>
                        <div className="p-2 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100">
                          <div className="text-xs text-orange-600 mb-0.5">Streak 🔥</div>
                          <div className="text-lg font-bold text-orange-800">{selectedDonor.streak ?? 0}</div>
                        </div>
                      </div>

                      {/* Eligibility + Badge */}
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs border ${
                            selectedDonor.eligibility_status === 'eligible'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-orange-50 text-orange-700 border-orange-200'
                          }`}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {selectedDonor.eligibility_status}
                        </Badge>
                        {selectedDonor.badge && (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ background: 'linear-gradient(to right, #f59e0b20, #d9742220)' }}
                          >
                            <Trophy className="w-3 h-3 mr-1 text-amber-500" />
                            {selectedDonor.badge}
                          </Badge>
                        )}
                        {(selectedDonor.streak ?? 0) > 0 && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                            <Flame className="w-3 h-3 mr-1" />
                            {selectedDonor.streak} streak
                          </Badge>
                        )}
                      </div>

                      {/* Donor score bar */}
                      <div className="mt-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full transition-all"
                            style={{ width: `${scorePct(selectedDonor.donor_score)}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ════ CENTER: Message Composer ════ */}
          <div className="col-span-2 space-y-4">
            <Card className="border-0 shadow-lg shadow-gray-200/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Compose AI Message
                </CardTitle>
                <CardDescription>Select language and message type, then generate</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Language Tabs */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Language</label>
                  <div className="flex gap-2 flex-wrap">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => setLanguage(lang.code)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                          language === lang.code
                            ? 'bg-gradient-to-r from-purple-600 to-violet-500 text-white border-transparent shadow-lg'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-purple-200'
                        }`}
                      >
                        <span>{lang.flag}</span>
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Type Tabs */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Message Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {MESSAGE_TYPES.map(mt => (
                      <button
                        key={mt.code}
                        onClick={() => setMessageType(mt.code)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                          messageType === mt.code
                            ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-transparent shadow-lg'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-pink-200'
                        }`}
                      >
                        {mt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !selectedDonor}
                  className="w-full bg-gradient-to-r from-purple-600 to-violet-500 hover:from-purple-700 hover:to-violet-600 text-white border-0 shadow-lg shadow-purple-200 h-11 font-semibold"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating AI Message…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate AI Message
                    </>
                  )}
                </Button>

                {generateError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    {generateError}
                  </div>
                )}

                {/* Message Preview */}
                <AnimatePresence>
                  {generated && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-2 border-purple-100 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-50 to-white">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-purple-100 bg-white flex items-center justify-between">
                          {generated.title && (
                            <h4 className="font-semibold text-gray-800 text-sm">{generated.title}</h4>
                          )}
                          <div className="flex items-center gap-2 ml-auto">
                            <Badge variant="outline" className="text-xs border-purple-200 text-purple-600">
                              <Globe className="w-3 h-3 mr-1" />
                              {LANGUAGES.find(l => l.code === generated.language)?.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs border-pink-200 text-pink-600">
                              {MESSAGE_TYPES.find(m => m.code === generated.message_type)?.label}
                            </Badge>
                          </div>
                        </div>

                        {/* WhatsApp-style bubble */}
                        <div className="p-4 bg-[#e5ddd5] min-h-24">
                          <div className="max-w-sm bg-[#dcf8c6] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm ml-auto">
                            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                              {generated.body || generated.message || ''}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-xs text-gray-500">
                                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <CheckCircle className="w-3 h-3 text-blue-500" />
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="px-4 py-3 bg-white border-t border-purple-100 flex gap-2">
                          <Button
                            onClick={handleSend}
                            disabled={sending || sendSuccess}
                            className={`flex-1 border-0 shadow-md h-9 text-sm font-semibold ${
                              sendSuccess
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:opacity-90'
                            } text-white`}
                          >
                            {sending ? (
                              <><Loader2 className="w-3 h-3 animate-spin mr-1" />Sending…</>
                            ) : sendSuccess ? (
                              <><CheckCircle className="w-3 h-3 mr-1" />Sent!</>
                            ) : (
                              <><Send className="w-3 h-3 mr-1" />Send Message</>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleCopy}
                            className="h-9 px-3 border-gray-200 text-gray-600 text-sm"
                          >
                            {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* ── Conversation History ── */}
            <Card className="border-0 shadow-lg shadow-gray-200/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="w-4 h-4 text-gray-600" />
                    Conversation History
                  </CardTitle>
                  {history.length > 0 && (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-0 text-xs">
                      {history.length} messages
                    </Badge>
                  )}
                </div>
                {selectedDonor && (
                  <CardDescription>
                    Chat with {selectedDonor.name || `Donor ${selectedDonor.donor_id.slice(-4)}`}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div
                  className="min-h-40 max-h-64 overflow-y-auto rounded-xl bg-[#ece5dd] p-3"
                  style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)', backgroundSize: '20px 20px' }}
                >
                  {historyLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading history…</span>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-400">No messages yet</p>
                      <p className="text-xs text-gray-300 mt-1">Generate and send a message above</p>
                    </div>
                  ) : (
                    <>
                      {history.map((msg, i) => (
                        <ChatBubble key={msg.id || i} msg={msg} />
                      ))}
                      <div ref={chatEndRef} />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Gamification: Donor Hero Leaderboard ── */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle>Donor Hero Leaderboard</CardTitle>
                <CardDescription>Top 5 donors ranked by AI donor score</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Loading leaderboard…</div>
            ) : (
              <div className="grid grid-cols-5 gap-4">
                {leaderboard.map((donor, idx) => (
                  <motion.div
                    key={donor.donor_id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.08 }}
                    className={`relative p-4 rounded-2xl border-2 transition-all hover:shadow-lg ${
                      idx === 0
                        ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200 shadow-md'
                        : idx === 1
                        ? 'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200'
                        : idx === 2
                        ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200'
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    {/* Medal or rank */}
                    <div className="absolute -top-2 -right-2">
                      {idx < 3 ? (
                        <span className="text-2xl">{rankMedals[idx]}</span>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="w-12 h-12 mx-auto mb-2">
                      <AvatarFallback className={`bg-gradient-to-br ${bloodGradient(donor.blood_group)} text-white font-bold`}>
                        {(donor.name || 'D').split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="text-center">
                      <h4 className="text-xs font-semibold text-gray-800 leading-tight truncate">
                        {donor.name || `Donor ${donor.donor_id.slice(-4)}`}
                      </h4>
                      {donor.badge && (
                        <div className="flex items-center justify-center gap-1 mt-1 mb-2">
                          <Award className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          <span className="text-xs text-amber-700 truncate">{donor.badge}</span>
                        </div>
                      )}
                      {(donor.streak ?? 0) > 0 && (
                        <div className="flex items-center justify-center gap-0.5 mb-2">
                          <Flame className="w-3 h-3 text-orange-500" />
                          <span className="text-xs text-orange-600 font-medium">{donor.streak}</span>
                        </div>
                      )}
                    </div>

                    {/* Score bar */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Score</span>
                        <span className="text-xs font-bold text-gray-800">{scorePct(donor.donor_score)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${
                            idx === 0 ? 'from-yellow-400 to-amber-500' :
                            idx === 1 ? 'from-gray-400 to-gray-500' :
                            idx === 2 ? 'from-orange-400 to-orange-600' :
                            'from-purple-500 to-violet-500'
                          }`}
                          style={{ width: `${scorePct(donor.donor_score)}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
