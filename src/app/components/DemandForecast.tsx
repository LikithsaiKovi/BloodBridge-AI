import { useState, useEffect } from 'react';
import { Calendar, TrendingUp, AlertTriangle, Brain, Activity, Clock, Droplet, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { forecastsApi, ForecastData } from '../../lib/api';

export default function DemandForecast() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadForecast = async () => {
    setLoading(true);
    try {
      const data = await forecastsApi.get(7);
      setForecast(data);
    } catch (err) {
      console.error('Failed to load forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadForecast(); }, []);

  const urgencyBg: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
  };

  const riskColors: Record<string, string> = {
    critical: 'from-red-600 to-pink-600',
    high: 'from-orange-500 to-red-500',
    medium: 'from-yellow-500 to-orange-500',
    low: 'from-blue-400 to-cyan-500',
  };

  const riskBg: Record<string, string> = {
    critical: 'bg-red-600',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-400',
  };

  const kpis = forecast?.kpis;
  const chartData = forecast?.chart_data || [];
  const upcoming = forecast?.upcoming_transfusions || [];
  const alerts = forecast?.shortage_alerts || [];
  const warnings = forecast?.warnings || [];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-pink-600 to-red-600 p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                  <TrendingUp className="w-7 h-7" />
                </div>
                <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-xl">AI-Powered Analytics</Badge>
              </div>
              <Button onClick={loadForecast} variant="outline" className="bg-white/20 border-white/30 text-white hover:bg-white/30 gap-2">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <h1 className="text-4xl font-semibold mb-3">Blood Demand Forecast Center</h1>
            <p className="text-white/90 text-lg max-w-2xl">Real-time predictive intelligence from patient transfusion schedules</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: 'Transfusions (7 days)', value: loading ? '—' : upcoming.length.toString(), trend: 'Scheduled', icon: Activity, color: 'from-blue-500 to-cyan-500' },
            { label: 'Units Required (7 days)', value: loading ? '—' : (kpis?.total_units_7d || 0).toString(), trend: 'Total', icon: Droplet, color: 'from-red-500 to-pink-500' },
            { label: 'AI Confidence', value: loading ? '—' : `${kpis?.ai_confidence || 94}%`, trend: 'Today', icon: Brain, color: 'from-purple-500 to-pink-500' },
            { label: 'Critical Patients', value: loading ? '—' : (kpis?.critical_patients || 0).toString(), trend: '≤1 day', icon: AlertTriangle, color: 'from-orange-500 to-red-500' },
          ].map((stat, i) => (
            <Card key={i} className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">{stat.trend}</Badge>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">
                  {loading ? <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" /> : stat.value}
                </div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Warning Banners */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.slice(0, 3).map((w, i) => (
              <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border-2 ${w.warning_type === '1_day' ? 'bg-red-50 border-red-200' : w.warning_type === '3_day' ? 'bg-orange-50 border-orange-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <AlertTriangle className={`w-5 h-5 ${w.warning_type === '1_day' ? 'text-red-600' : w.warning_type === '3_day' ? 'text-orange-600' : 'text-yellow-600'}`} />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900">{w.patient_name}</span>
                  <span className="text-gray-600 ml-2">({w.blood_group}) needs blood in {w.days_until <= 0 ? 'TODAY!' : `${w.days_until} day(s)`}</span>
                </div>
                <Badge className={`${w.warning_type === '1_day' ? 'bg-red-600' : w.warning_type === '3_day' ? 'bg-orange-500' : 'bg-yellow-500'} text-white border-0`}>
                  {w.warning_type.replace('_', '-').toUpperCase()} WARNING
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2 border-0 shadow-xl shadow-gray-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                7-Day Demand Forecast
              </CardTitle>
              <CardDescription>AI-predicted blood requirements from patient schedules</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-80 bg-gray-100 rounded-xl animate-pulse" />
              ) : chartData.length > 0 ? (
                <ChartContainer
                  config={{ "O+": { label: "O+", color: "#EF233C" }, "A+": { label: "A+", color: "#D90429" }, "B+": { label: "B+", color: "#8B5CF6" }, "AB+": { label: "AB+", color: "#EC4899" } }}
                  className="h-80"
                >
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="O+" stackId="1" stroke="#EF233C" fill="#EF233C" fillOpacity={0.8} />
                    <Area type="monotone" dataKey="A+" stackId="1" stroke="#D90429" fill="#D90429" fillOpacity={0.8} />
                    <Area type="monotone" dataKey="B+" stackId="1" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.8} />
                    <Area type="monotone" dataKey="AB+" stackId="1" stroke="#EC4899" fill="#EC4899" fillOpacity={0.8} />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No forecast data yet. Add patients with transfusion dates.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                Prediction Confidence
              </CardTitle>
              <CardDescription>AI model accuracy over next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-80 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <ChartContainer config={{ confidence: { label: "Confidence", color: "#8B5CF6" } }} className="h-80">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" domain={[50, 100]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="confidence" fill="url(#colorGradient)" radius={[8, 8, 0, 0]} />
                    <defs>
                      <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#EC4899" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Transfusions */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Upcoming Transfusions
                </CardTitle>
                <CardDescription>Real patient transfusion schedule for next 7 days</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-0">
                {upcoming.length} Scheduled
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : upcoming.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No upcoming transfusions. Add patients with scheduled dates.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((tx, i) => {
                  const urgency = tx.urgency as keyof typeof urgencyBg;
                  const urgencyGrad: Record<string, string> = { critical: 'from-red-500 to-pink-500', high: 'from-orange-500 to-yellow-500', medium: 'from-blue-500 to-cyan-500', low: 'from-gray-400 to-gray-500' };
                  return (
                    <div key={i} className="p-4 rounded-2xl bg-white border border-gray-200 hover:shadow-lg transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${urgencyGrad[urgency] || urgencyGrad.medium} flex items-center justify-center shadow-lg flex-shrink-0`}>
                          <span className="text-white font-semibold">{tx.blood_group}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900">{tx.patient_name}</h4>
                            <Badge variant="outline" className="text-xs">{tx.patient_id}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(tx.scheduled_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tx.days_until <= 0 ? 'TODAY' : `${tx.days_until} days`}</span>
                            <span className="flex items-center gap-1"><Droplet className="w-3 h-3" />{tx.units_needed} units</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={urgencyBg[urgency] || urgencyBg.medium}>{tx.urgency?.toUpperCase()}</Badge>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{tx.status}</Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shortage Alerts */}
        {alerts.length > 0 && (
          <Card className="border-0 shadow-xl shadow-gray-200/50 bg-gradient-to-br from-red-50 to-pink-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-lg">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle>AI Shortage Predictions</CardTitle>
                  <CardDescription>Anticipated blood shortages based on patient demand vs. simulated stock</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {alerts.slice(0, 4).map((alert, i) => (
                  <div key={i} className="p-6 rounded-2xl bg-white border-2 border-gray-200">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${riskColors[alert.risk_level] || riskColors.medium} flex items-center justify-center shadow-lg`}>
                        <span className="text-white font-semibold text-2xl">{alert.blood_group}</span>
                      </div>
                      <Badge className={`${riskBg[alert.risk_level] || riskBg.medium} text-white border-0`}>
                        {alert.risk_level?.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {[['Current Stock', `${alert.current_stock} units`], ['Required Stock', `${alert.required_stock} units`], ['Shortage', `-${alert.shortage} units`]].map(([label, val], j) => (
                        <div key={j} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{label}</span>
                          <span className={`text-sm font-semibold ${label === 'Shortage' ? 'text-red-600' : 'text-gray-900'}`}>{val}</span>
                        </div>
                      ))}
                      <div className="pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-600" />
                          <span className="text-sm text-gray-700">Critical in <span className="font-semibold text-red-600">{alert.days_until_critical} day(s)</span></span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
