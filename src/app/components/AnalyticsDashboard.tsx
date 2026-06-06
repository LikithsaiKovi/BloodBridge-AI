import { useState, useEffect } from 'react';
import { Activity, TrendingUp, Users, Heart, CheckCircle, Clock, AlertTriangle, Droplet, Zap, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { analyticsApi } from '../../lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';

// Animated Counter
function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    const duration = 800;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [value]);

  return <span>{display}{suffix}</span>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [anRes, trendRes] = await Promise.allSettled([
          analyticsApi.get(),
          analyticsApi.trends()
        ]);
        if (anRes.status === 'fulfilled') setAnalytics(anRes.value);
        if (trendRes.status === 'fulfilled') setTrends(trendRes.value);
      } catch (err) {
        console.error("Failed to load analytics data", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const kpis = [
    { label: 'Total Donors', value: analytics?.total_donors || 0, icon: Users, color: 'from-blue-500 to-cyan-500' },
    { label: 'Total Patients', value: analytics?.total_patients || 0, icon: Heart, color: 'from-red-500 to-rose-500' },
    { label: 'Confirmed Donations', value: analytics?.confirmed_matches || 0, icon: CheckCircle, color: 'from-green-500 to-emerald-500' },
    { label: 'Match Success Rate', value: analytics ? Math.round(analytics.match_success_rate) : 0, suffix: '%', icon: Zap, color: 'from-purple-500 to-violet-500' },
    { label: 'AI Prediction Accuracy', value: analytics?.prediction_accuracy || 0, suffix: '%', icon: TrendingUp, color: 'from-orange-500 to-amber-500' },
    { label: 'Active Alerts', value: analytics?.active_alerts || 0, icon: AlertTriangle, color: 'from-rose-500 to-pink-500' },
  ];

  // Prepare Chart Data
  const trendData = trends?.labels?.map((label: string, i: number) => ({
    name: label,
    donations: trends.donations[i],
    patients: trends.patients_served[i],
    new_donors: trends.new_donors[i]
  })) || [];

  const urgencyData = analytics?.urgency_distribution ? [
    { name: 'Critical', value: analytics.urgency_distribution.critical, color: '#ef4444' },
    { name: 'High', value: analytics.urgency_distribution.high, color: '#f97316' },
    { name: 'Medium', value: analytics.urgency_distribution.medium, color: '#eab308' },
    { name: 'Low', value: analytics.urgency_distribution.low, color: '#3b82f6' }
  ] : [];

  const eligibilityData = analytics?.donor_eligibility ? [
    { name: 'Eligible', value: analytics.donor_eligibility.eligible, color: '#22c55e' },
    { name: 'Resting', value: analytics.donor_eligibility.resting, color: '#eab308' },
    { name: 'Not Eligible', value: analytics.donor_eligibility.not_eligible, color: '#ef4444' }
  ] : [];

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* 1. Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-8 shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                <Activity className="w-8 h-8 text-blue-200" />
                Analytics Overview
              </h1>
              <p className="text-blue-100 text-lg">Real-time operational metrics</p>
            </div>
            <Badge className="bg-white/20 text-white border-white/30 text-sm py-1.5 px-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </Badge>
          </div>
        </div>

        {/* 2. KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="hover:shadow-md transition-shadow border-slate-200 h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center shadow-sm flex-shrink-0`}>
                      <kpi.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ) : (
                    <div>
                      <div className="text-3xl font-bold text-slate-800">
                        <AnimatedCounter value={kpi.value} suffix={kpi.suffix} />
                      </div>
                      <div className="text-sm font-medium text-slate-500 mt-1">{kpi.label}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* 3. Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Main Trend Chart */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                Network Growth Trends
              </CardTitle>
              <CardDescription>Donations and patients served over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="w-full h-72" />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDonations" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Area type="monotone" dataKey="donations" name="Completed Donations" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorDonations)" />
                      <Area type="monotone" dataKey="patients" name="Patients Served" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorPatients)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Donor & Urgency Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Urgency Distribution */}
            <Card className="border-slate-200 shadow-sm flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-800 text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  Patient Urgency
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center">
                {loading ? (
                  <Skeleton className="w-full h-48" />
                ) : (
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={urgencyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={5} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                        <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {urgencyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Donor Eligibility */}
            <Card className="border-slate-200 shadow-sm flex flex-col">
              <CardHeader className="pb-0">
                <CardTitle className="text-slate-800 text-base flex items-center gap-2">
                  <Droplet className="w-4 h-4 text-blue-500" />
                  Donor Eligibility
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center -mt-4">
                {loading ? (
                  <Skeleton className="w-40 h-40 rounded-full" />
                ) : (
                  <div className="h-48 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={eligibilityData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {eligibilityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none mt-2">
                      <span className="text-2xl font-bold text-slate-800">{analytics?.total_donors}</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* 4. Match Pipeline Status */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-500" />
              Today's Match Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Pending Response', count: analytics?.match_status?.pending || 0, icon: Clock, bg: 'bg-yellow-50', text: 'text-yellow-700', iconColor: 'text-yellow-500' },
                { label: 'Confirmed', count: analytics?.match_status?.confirmed || 0, icon: CheckCircle, bg: 'bg-green-50', text: 'text-green-700', iconColor: 'text-green-500' },
                { label: 'Completed', count: analytics?.match_status?.completed || 0, icon: Droplet, bg: 'bg-blue-50', text: 'text-blue-700', iconColor: 'text-blue-500' },
                { label: 'Declined/Escalated', count: analytics?.match_status?.declined || 0, icon: AlertTriangle, bg: 'bg-red-50', text: 'text-red-700', iconColor: 'text-red-500' },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className={`p-4 rounded-xl ${stat.bg} border border-slate-100`}>
                    <Icon className={`w-6 h-6 mb-2 ${stat.iconColor}`} />
                    <div className={`text-3xl font-bold ${stat.text}`}>
                      {loading ? '—' : <AnimatedCounter value={stat.count} />}
                    </div>
                    <div className={`text-sm font-medium ${stat.text} opacity-80 mt-1`}>{stat.label}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 5. System Health */}
        <Card className="bg-slate-800 border-slate-700 text-white shadow-xl">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 mb-2 md:mb-0">
                <Activity className="w-5 h-5 text-slate-400" />
                <span className="font-medium text-slate-300">System Health</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8">
                {[
                  { label: 'AI Matching Engine', status: 'Operational', icon: Zap },
                  { label: 'WhatsApp Outreach', status: 'Connected', icon: Phone },
                  { label: 'Auto Escalation', status: 'Active', icon: Clock },
                  { label: 'WebSocket Feed', status: 'Live', icon: Activity },
                ].map((sys, i) => {
                  const Icon = sys.icon;
                  return (
                    <div key={i} className="flex items-center gap-2 bg-slate-700/50 px-3 py-1.5 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm text-slate-300 font-medium">{sys.label}:</span>
                      <span className="text-sm text-green-400">{sys.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
