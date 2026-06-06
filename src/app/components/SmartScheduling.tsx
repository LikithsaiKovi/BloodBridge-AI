import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Calendar, Clock, Users, CheckCircle, AlertCircle, Bell, MessageSquare, TrendingUp, Phone, Mail, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Progress } from './ui/progress';
import { matchesApi, outreachApi, patientsApi } from '../../lib/api';

export default function SmartScheduling() {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [matchesData, patientsData] = await Promise.all([
        matchesApi.list(),
        patientsApi.list()
      ]);
      setMatches(matchesData);
      setPatients(patientsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Dynamically group matches into "blood reservations" by patient
  const bloodReservations = patients.map(p => {
    const patientMatches = matches.filter(m => m.patient_id === p.patient_id);
    const hasConfirmed = patientMatches.some(m => m.status === 'confirmed');
    return {
      id: p.patient_id,
      patient: p.name,
      bloodGroup: p.blood_group,
      unitsNeeded: p.units_needed || 1,
      scheduledDate: p.next_transfusion_date?.split('T')[0] || 'Unknown',
      requestDate: p.created_at?.split('T')[0] || 'Unknown',
      status: hasConfirmed ? 'confirmed' : (patientMatches.length > 0 ? 'pending' : 'no_matches'),
      priority: p.urgency_level,
      donors: patientMatches.map(m => ({
        name: m.donor_name || 'Anonymous',
        status: m.status,
        confirmDate: m.scheduled_date
      }))
    };
  }).filter(r => r.donors.length > 0);

  // Group confirmed matches by date for the calendar
  const upcomingMap: Record<string, any[]> = {};
  matches.filter(m => m.status === 'confirmed' && m.scheduled_date).forEach(m => {
    const p = patients.find(pat => pat.patient_id === m.patient_id);
    const date = m.scheduled_date;
    if (!upcomingMap[date]) upcomingMap[date] = [];
    upcomingMap[date].push({
      time: '10:00 AM', // Default time as we don't have exact slots
      donor: m.donor_name,
      patient: p?.name || 'Unknown',
      bloodGroup: m.donor_blood_group,
      status: m.status
    });
  });

  const upcomingDonations = Object.entries(upcomingMap).map(([date, slots]) => ({
    date,
    slots
  })).sort((a, b) => a.date.localeCompare(b.date));

  const outreachTimeline = [
    {
      timestamp: '2026-06-07 10:00 AM',
      method: 'Call',
      status: 'scheduled',
      donorsReached: 0,
      responses: 0
    }
  ];

  const donorConfirmations = matches.map(m => ({
    donor: m.donor_name || 'Anonymous',
    status: m.status,
    time: m.updated_at ? new Date(m.updated_at).toLocaleString() : 'Recently',
    reliability: Math.round((m.availability_score || 0.95) * 100)
  }));

  const escalationWorkflow = [
    {
      trigger: 'No Response (24h)',
      action: 'Send SMS Reminder',
      automationLevel: 'Automated',
      successRate: 78
    },
    {
      trigger: 'No Response (48h)',
      action: 'Phone Call by Coordinator',
      automationLevel: 'Semi-Automated',
      successRate: 85
    },
    {
      trigger: 'Donor Declined',
      action: 'Trigger Backup Donor List',
      automationLevel: 'Automated',
      successRate: 92
    },
    {
      trigger: 'Critical Shortage (72h)',
      action: 'Broadcast to All Eligible Donors',
      automationLevel: 'Manual Approval',
      successRate: 68
    }
  ];

  const statusColors = {
    confirmed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', gradient: 'from-green-500 to-emerald-500' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', gradient: 'from-yellow-500 to-orange-500' },
    contacted: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', gradient: 'from-blue-500 to-cyan-500' },
    scheduled: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', gradient: 'from-purple-500 to-pink-500' }
  };

  const navigate = useNavigate();

  const activeReservations = bloodReservations.length;
  const confirmedDonors = matches.filter(m => m.status === 'confirmed').length;
  const pendingConfirmations = matches.filter(m => m.status === 'pending').length;
  const outreachSuccessRate = matches.length > 0 ? Math.round((confirmedDonors / matches.length) * 100) + '%' : '0%';

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-red-600 to-pink-600 p-8 text-white shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight mb-1">Smart Scheduling Center</h1>
                <p className="text-white/80">AI-powered donor coordination & reservation system</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: 'Active Reservations', value: activeReservations, trend: '+0', icon: Calendar, color: 'from-blue-500 to-cyan-500' },
            { label: 'Confirmed Donors', value: confirmedDonors, trend: '+0', icon: CheckCircle, color: 'from-green-500 to-emerald-500' },
            { label: 'Pending Confirmations', value: pendingConfirmations, trend: '+0', icon: Clock, color: 'from-yellow-500 to-orange-500' },
            { label: 'Outreach Success Rate', value: outreachSuccessRate, trend: '+0%', icon: TrendingUp, color: 'from-purple-500 to-pink-500' }
          ].map((stat, i) => (
            <Card key={i} className="border-0 shadow-lg shadow-gray-200/50 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">
                    {stat.trend}
                  </Badge>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Blood Reservation System */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-600" />
                  Blood Reservation System
                </CardTitle>
                <CardDescription>Active blood requests with donor matching status</CardDescription>
              </div>
              <Button onClick={() => navigate('/matching')} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-lg">
                New Reservation
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {bloodReservations.map((reservation, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-white border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-300 cursor-pointer"
                  onClick={() => setSelectedRequest(selectedRequest === i ? null : i)}
                >
                  <div className="flex items-start gap-6">
                    {/* Blood Group Badge */}
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D90429] to-[#EF233C] flex items-center justify-center shadow-lg flex-shrink-0`}>
                      <span className="text-white font-semibold text-xl">{reservation.bloodGroup}</span>
                    </div>

                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg text-gray-900">{reservation.patient}</h3>
                            <Badge variant="outline" className="text-xs">{reservation.id}</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(reservation.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {reservation.unitsNeeded} units needed
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${statusColors[reservation.status as keyof typeof statusColors].bg} ${statusColors[reservation.status as keyof typeof statusColors].text} border-0`}>
                            {reservation.status.toUpperCase()}
                          </Badge>
                          {reservation.priority === 'high' && (
                            <Badge className="bg-red-100 text-red-700 border-0">
                              HIGH PRIORITY
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Donor Status */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        {reservation.donors.map((donor, j) => (
                          <div key={j} className="p-3 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white text-xs font-semibold">
                                  {donor.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{donor.name}</div>
                              </div>
                            </div>
                            <Badge className={`w-full justify-center text-xs ${statusColors[donor.status as keyof typeof statusColors].bg} ${statusColors[donor.status as keyof typeof statusColors].text} border-0`}>
                              {donor.status}
                            </Badge>
                          </div>
                        ))}
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Completion</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {reservation.donors.filter(d => d.status === 'confirmed').length} / {reservation.donors.length} confirmed
                          </span>
                        </div>
                        <Progress
                          value={(reservation.donors.filter(d => d.status === 'confirmed').length / reservation.donors.length) * 100}
                          className="h-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Donation Schedule */}
        <Card className="border-0 shadow-xl shadow-gray-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Upcoming Donation Schedule
            </CardTitle>
            <CardDescription>Confirmed and pending donation appointments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {upcomingDonations.map((day, i) => (
                <div key={i}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </h3>
                      <p className="text-sm text-gray-600">{day.slots.length} scheduled donations</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {day.slots.map((slot, j) => (
                      <div key={j} className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-200 hover:border-gray-300 transition-all">
                        <div className="w-20 text-center">
                          <div className="text-sm font-semibold text-gray-900">{slot.time}</div>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="flex-1 flex items-center gap-4">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-semibold">
                              {slot.donor.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{slot.donor}</div>
                            <div className="text-sm text-gray-600">Donating to {slot.patient}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className="bg-gradient-to-r from-[#D90429] to-[#EF233C] text-white border-0">
                              {slot.bloodGroup}
                            </Badge>
                            <Badge className={`${statusColors[slot.status as keyof typeof statusColors].bg} ${statusColors[slot.status as keyof typeof statusColors].text} border-0`}>
                              {slot.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Automated Outreach Timeline */}
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                Automated Outreach Timeline
              </CardTitle>
              <CardDescription>Multi-channel donor communication workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {outreachTimeline.map((stage, i) => {
                  const isCompleted = stage.status === 'completed';
                  const isInProgress = stage.status === 'in-progress';

                  return (
                    <div key={i} className="relative">
                      {i !== outreachTimeline.length - 1 && (
                        <div className="absolute left-6 top-14 w-0.5 h-12 bg-gray-200" />
                      )}
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ${
                          isCompleted
                            ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                            : isInProgress
                            ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                            : 'bg-gradient-to-br from-gray-300 to-gray-400'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle className="w-6 h-6 text-white" />
                          ) : isInProgress ? (
                            <Clock className="w-6 h-6 text-white" />
                          ) : (
                            <Bell className="w-6 h-6 text-white" />
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900">{stage.stage}</h4>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                isCompleted
                                  ? 'bg-green-100 text-green-700 border-green-200'
                                  : isInProgress
                                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                                  : 'bg-gray-100 text-gray-700 border-gray-200'
                              }`}
                            >
                              {stage.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 mb-2">{stage.timestamp}</div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium">
                              {stage.method}
                            </div>
                            {stage.status !== 'scheduled' && (
                              <div className="text-gray-600">
                                {stage.responses}/{stage.donorsReached} responded
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Donor Confirmation Tracker */}
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                Donor Confirmation Tracker
              </CardTitle>
              <CardDescription>Real-time confirmation status and reliability scores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {donorConfirmations.map((confirmation, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-500 text-white font-semibold">
                          {confirmation.donor.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 mb-1">{confirmation.donor}</div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${statusColors[confirmation.status as keyof typeof statusColors].bg} ${statusColors[confirmation.status as keyof typeof statusColors].text} border-0`}>
                            {confirmation.status}
                          </Badge>
                          <span className="text-xs text-gray-500">{confirmation.time}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-gray-900 mb-1">{confirmation.reliability}%</div>
                        <div className="text-xs text-gray-600">Reliability</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Escalation Workflow */}
        <Card className="border-0 shadow-xl shadow-gray-200/50 bg-gradient-to-br from-orange-50 to-red-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle>Escalation Workflow Visualization</CardTitle>
                <CardDescription>Automated response strategies for different scenarios</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {escalationWorkflow.map((workflow, i) => (
                <div key={i} className="p-6 rounded-2xl bg-white border-2 border-gray-200">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-1">{workflow.trigger}</h4>
                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700 border-gray-200">
                        {workflow.automationLevel}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">{workflow.action}</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Success Rate</span>
                      <span className="text-sm font-semibold text-gray-900">{workflow.successRate}%</span>
                    </div>
                    <Progress value={workflow.successRate} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
