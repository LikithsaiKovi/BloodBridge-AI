import { useState, useEffect } from 'react';
import { Users, Search, MapPin, Award, Activity, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { donorsApi, Donor } from '../../lib/api';

export default function DonorIntelligence() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [predictingId, setPredictingId] = useState<string | null>(null);

  const loadDonors = async (query = '') => {
    setLoading(true);
    try {
      const data = await donorsApi.list({ search: query || undefined, limit: 50, sort_by: 'donor_score' });
      setDonors(data);
    } catch (err) {
      console.error('Failed to load donors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDonors();
    donorsApi.heatmap().then(setHeatmap).catch(() => {});
    donorsApi.stats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadDonors(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const runPrediction = async (donorId: string) => {
    setPredictingId(donorId);
    try {
      const result = await donorsApi.predict(donorId);
      setDonors(prev => prev.map(d => d.donor_id === donorId
        ? { ...d, availability_probability: result.availability_probability, donor_score: result.donor_score }
        : d
      ));
    } catch (err) {
      console.error('Prediction failed:', err);
    } finally {
      setPredictingId(null);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'from-green-500 to-emerald-500';
    if (score >= 60) return 'from-blue-500 to-cyan-500';
    if (score >= 40) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-pink-500';
  };

  const getHeatmapColor = (value: number) => {
    if (value >= 80) return 'bg-green-500';
    if (value >= 70) return 'bg-emerald-400';
    if (value >= 60) return 'bg-yellow-400';
    if (value >= 50) return 'bg-orange-400';
    return 'bg-red-400';
  };

  const getBadgeEmoji = (badge: string) => {
    const map: Record<string, string> = { 'Blood Legend': '🏆', 'Platinum Hero': '💎', 'Gold Donor': '🥇', 'Silver Donor': '🥈', 'New Hero': '🌟' };
    return map[badge] || '🌟';
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                <Users className="w-7 h-7" />
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-xl">XGBoost Predictions</Badge>
            </div>
            <h1 className="text-4xl font-semibold mb-3">Donor Availability Intelligence</h1>
            <p className="text-white/90 text-lg max-w-2xl">AI-powered donor ranking with real-time XGBoost availability predictions</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: 'Total Active Donors', value: stats.total_active_donors?.toLocaleString(), icon: Users, color: 'from-blue-500 to-cyan-500', change: 'Live' },
              { label: 'Eligible Now', value: stats.eligible_now?.toString(), icon: Activity, color: 'from-green-500 to-emerald-500', change: 'Ready' },
              { label: 'Avg AI Score', value: `${stats.avg_availability_score}%`, icon: TrendingUp, color: 'from-purple-500 to-pink-500', change: 'XGBoost' },
              { label: 'Total Donations', value: stats.monthly_donations?.toLocaleString(), icon: Award, color: 'from-orange-500 to-red-500', change: 'All time' },
            ].map((metric, i) => (
              <Card key={i} className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                <div className={`absolute inset-0 bg-gradient-to-br ${metric.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center shadow-lg`}>
                      <metric.icon className="w-6 h-6 text-white" />
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-0 text-xs">{metric.change}</Badge>
                  </div>
                  <div className="text-3xl font-semibold text-gray-900 mb-1">{metric.value || '—'}</div>
                  <div className="text-sm text-gray-600">{metric.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Search */}
        <Card className="border-0 shadow-lg shadow-gray-200/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search by name, donor ID, blood group, or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base border-gray-200"
                />
              </div>
              <Button variant="outline" className="h-12 px-6" onClick={() => loadDonors(searchQuery)}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Top Donors */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">AI-Ranked Donors</h2>
              <p className="text-gray-600">Sorted by XGBoost availability probability score</p>
            </div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-0">
              {loading ? 'Loading...' : `${donors.length} Donors`}
            </Badge>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {donors.map((donor, i) => (
                <Card key={donor.donor_id} className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className={`absolute inset-0 bg-gradient-to-br ${getScoreColor(donor.donor_score)} opacity-0 group-hover:opacity-5 transition-opacity`} />
                  <CardContent className="p-6">
                    {/* Rank + Header */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 mb-1">
                          #{i + 1}
                        </div>
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-semibold text-sm">
                            {(donor.name || 'D').split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 truncate">{donor.name || 'Anonymous Donor'}</h3>
                          <Badge variant="outline" className="text-xs shrink-0">{donor.donor_id}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {donor.city || 'Unknown'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Award className="w-3 h-3" />
                            {donor.total_donations} donations
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{getBadgeEmoji(donor.badge)} {donor.badge} · 🔥 {donor.streak} streak</div>
                      </div>
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-lg shrink-0">
                        <span className="text-white font-bold text-sm">{donor.blood_group}</span>
                      </div>
                    </div>

                    {/* AI Score */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">XGBoost Availability Score</span>
                        <span className="text-lg font-semibold text-gray-900">{donor.donor_score}%</span>
                      </div>
                      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${getScoreColor(donor.donor_score)} transition-all duration-700 rounded-full`}
                          style={{ width: `${donor.donor_score}%` }} />
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50">
                        <div className="text-xs text-gray-600 mb-1">Eligibility</div>
                        <div className={`text-sm font-semibold ${donor.eligibility_status === 'eligible' ? 'text-green-700' : 'text-orange-700'}`}>
                          {donor.eligibility_status === 'eligible' ? '✅ Eligible' : '⏳ Not Eligible'}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50">
                        <div className="text-xs text-gray-600 mb-1">Last Donation</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {donor.last_donation_date ? new Date(donor.last_donation_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Never'}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-gray-100">
                      <Button className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-lg text-xs h-9">
                        Contact
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 text-xs h-9"
                        onClick={() => runPrediction(donor.donor_id)}
                        disabled={predictingId === donor.donor_id}
                      >
                        {predictingId === donor.donor_id ? (
                          <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Predicting...</>
                        ) : (
                          <><Activity className="w-3 h-3 mr-1" /> Re-predict</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Heatmap */}
        {heatmap.length > 0 && (
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Donor Availability Heatmap
              </CardTitle>
              <CardDescription>Probability of donor availability by day and time (based on eligibility data)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Time</th>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <th key={day} className="p-3 text-center text-sm font-medium text-gray-700">{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmap.map((row, i) => (
                      <tr key={i}>
                        <td className="p-3 text-sm font-medium text-gray-700">{row.timeSlot}</td>
                        {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map(day => (
                          <td key={day} className="p-2">
                            <div className={`w-full h-12 rounded-lg ${getHeatmapColor(row[day])} flex items-center justify-center text-white font-semibold text-sm shadow-sm hover:scale-105 transition-transform cursor-default`}>
                              {row[day]}%
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-600">Availability:</span>
                {[{ color: 'bg-red-400', label: 'Low (<50%)' }, { color: 'bg-yellow-400', label: 'Medium (50-70%)' }, { color: 'bg-green-500', label: 'High (>70%)' }].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded ${item.color}`} />
                    <span className="text-xs text-gray-600">{item.label}</span>
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
