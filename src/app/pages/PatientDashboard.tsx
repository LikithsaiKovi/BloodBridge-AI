import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { patientsApi, matchesApi, forecastsApi, Patient, MatchResult } from '../../lib/api';
import { Calendar, Clock, Droplet, AlertTriangle, CheckCircle, Heart, Users, Phone, MapPin, TrendingUp, Bell, Activity, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { ProximityMap } from '../components/ProximityMap';
import { motion, AnimatePresence } from 'motion/react';

export default function PatientDashboard() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState('');

  const patientId = user?.linked_patient_id;
  const [profile, setProfile] = useState<any>(null);

  // New states for location confirmation
  const [confirmingLocation, setConfirmingLocation] = useState(false);
  const [confirmAddress, setConfirmAddress] = useState('');
  const [locationStatusMsg, setLocationStatusMsg] = useState('');

  // New state for account deletion
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!patientId) {
      setProfile({ error: true });
      return;
    }

    // Load Profile Fallback
    if (user?.patient_profile && Object.keys(user.patient_profile).length > 0) {
      setProfile(user.patient_profile);
    } else {
      patientsApi.get(patientId).then(data => {
        setProfile(data);
      }).catch(err => {
        console.error("Failed to load patient profile", err);
        setProfile({ error: true });
      });
    }

    matchesApi.list({ patient_id: patientId }).then(data => {
      setMatches(data);
      setLoadingMatches(false);
    }).catch(err => {
      console.error(err);
      setLoadingMatches(false);
    });

    patientsApi.forecast(patientId).then(data => {
      setSchedule(data.timeline || []);
    }).catch(err => console.error(err));
  }, [patientId, user]);

  if (!profile) {
    return <div className="flex h-[80vh] items-center justify-center text-lg text-gray-500">Loading profile...</div>;
  }

  if (profile.error) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-8">
        <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-xl border border-red-100">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl text-gray-900 font-bold mb-2">Profile Not Found</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your patient record could not be found. It may have been removed during a database reset.
          </p>
          <Button onClick={() => window.location.href = '/auth'} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600">
            Sign In Again
          </Button>
        </div>
      </div>
    );
  }

  const daysUntil = profile.next_transfusion_date 
    ? Math.ceil((new Date(profile.next_transfusion_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    : 0;

  const isOverdue = daysUntil < 0;
  
  const handleRequestBlood = async () => {
    setRequesting(true);
    try {
      const data = await patientsApi.requestBlood(patientId!, { top_n: 1, max_distance_km: 200 });
      setRequestSuccess(
        `Success! The BloodBridge AI has matched you with ${data.matches_found} compatible donors nearby and successfully sent WhatsApp alerts to ${data.messages_sent} of them. You will be notified when they reply.`
      );
      // Reload matches
      const newMatches = await matchesApi.list({ patient_id: patientId });
      setMatches(newMatches);
    } catch (err) {
      console.error("Failed to request blood", err);
    } finally {
      setRequesting(false);
      setTimeout(() => setRequestSuccess(''), 5000);
    }
  };

  const handleConfirmLocation = async () => {
    setConfirmingLocation(true);
    try {
      await patientsApi.confirmLocation(patientId!, {
        address: confirmAddress || profile.preferred_location_name || profile.hospital,
        latitude: profile.preferred_latitude,
        longitude: profile.preferred_longitude,
      });
      setLocationStatusMsg("✅ Location shared with confirmed donors!");
    } catch (err) {
      console.error("Failed to confirm location", err);
      setLocationStatusMsg("❌ Failed to share location.");
    } finally {
      setConfirmingLocation(false);
      setTimeout(() => setLocationStatusMsg(''), 5000);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      return;
    }
    setDeletingAccount(true);
    try {
      await patientsApi.delete(patientId!);
      window.location.href = '/auth'; // Redirect to sign in
    } catch (err) {
      console.error("Failed to delete account", err);
      setDeletingAccount(false);
      alert("Failed to delete account. Please try again.");
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 max-w-7xl mx-auto pb-24 lg:pb-8">
      
      {/* 1. Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center md:text-left">
            <Avatar className="w-20 h-20 border-4 border-white/20 shadow-lg hidden sm:block">
              <AvatarFallback className="bg-white/20 text-white text-2xl font-bold backdrop-blur-xl">
                {user?.avatar_initials || user?.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                <Badge variant="secondary" className="bg-white/20 text-white border-0 backdrop-blur-md">
                  <Shield className="w-3 h-3 mr-1" /> Thalassemia Patient
                </Badge>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Hi, {user?.name.split(' ')[0]}</h1>
              <div className="flex items-center justify-center md:justify-start gap-3">
                <Badge className="bg-gradient-to-r from-red-500 to-pink-500 text-white border-0 text-sm px-3 py-1">
                  {profile.blood_group}
                </Badge>
                <span className="text-blue-100 flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> {profile.city || 'Unknown City'}
                </span>
              </div>
            </div>
            {/* Delete Account Button */}
            <div className="absolute top-0 right-0 p-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="bg-red-500/10 text-red-100 hover:bg-red-500/20 border-red-500/30"
              >
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Button>
            </div>
          </div>

          <div className="w-full md:w-auto">
            <Card className="bg-white/10 border-white/20 backdrop-blur-md text-white">
              <CardContent className="p-6 text-center">
                <div className="text-sm font-medium text-blue-100 mb-1">Days until next transfusion</div>
                <div className={`text-5xl font-bold ${isOverdue ? 'text-red-400' : daysUntil <= 3 ? 'text-orange-400' : 'text-green-400'}`}>
                  {isOverdue ? 'OVERDUE' : daysUntil}
                </div>
                {profile.next_transfusion_date && !isOverdue && (
                  <div className="text-xs text-blue-200 mt-2">
                    Scheduled: {new Date(profile.next_transfusion_date).toLocaleDateString()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 2. Status Alert Banner */}
      <AnimatePresence>
        {daysUntil <= 7 && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-2xl flex items-center gap-4 ${
              daysUntil <= 3 ? 'bg-red-50 border-2 border-red-200 text-red-800' : 'bg-orange-50 border-2 border-orange-200 text-orange-800'
            }`}
          >
            <AlertTriangle className={`w-6 h-6 ${daysUntil <= 3 ? 'text-red-600 animate-pulse' : 'text-orange-600'}`} />
            <div>
              <p className="font-semibold">
                {daysUntil <= 3 ? `URGENT: Your transfusion is in ${daysUntil} day(s).` : `Notice: Your transfusion is coming up in ${daysUntil} days.`}
              </p>
              <p className="text-sm opacity-80">We are monitoring your matched donors and ensuring blood availability.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2.5 Day-of Transfusion Location Confirmation */}
      <AnimatePresence>
        {daysUntil <= 1 && !isOverdue && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-3xl bg-white border-2 border-red-100 shadow-xl"
          >
            <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <MapPin className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Confirm Transfusion Location</h3>
                  <p className="text-sm text-gray-600">Please confirm your hospital address so we can notify your confirmed donors.</p>
                </div>
              </div>
              <div className="flex-1 w-full md:max-w-md flex flex-col gap-2">
                <input 
                  type="text" 
                  value={confirmAddress} 
                  onChange={(e) => setConfirmAddress(e.target.value)}
                  placeholder={profile.preferred_location_name || profile.hospital || "Enter full hospital address..."}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                />
                <Button 
                  onClick={handleConfirmLocation} 
                  disabled={confirmingLocation}
                  className="bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-700 hover:to-pink-700 w-full"
                >
                  {confirmingLocation ? "Broadcasting..." : "Share Location with Donors"}
                </Button>
                {locationStatusMsg && <p className="text-sm text-center font-medium mt-1">{locationStatusMsg}</p>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Blood Group', value: profile.blood_group, icon: Droplet, color: 'from-red-500 to-pink-500' },
          { label: 'Units Needed', value: profile.units_needed || 2, icon: Activity, color: 'from-blue-500 to-indigo-500' },
          { label: 'Hospital', value: profile.hospital || 'Not Set', icon: Heart, color: 'from-green-500 to-emerald-500' },
          { label: 'Urgency', value: profile.urgency_level?.toUpperCase(), icon: AlertTriangle, color: profile.urgency_level === 'critical' ? 'from-red-500 to-red-600' : 'from-orange-400 to-orange-500' },
        ].map((kpi, i) => (
          <Card key={i} className="border-0 shadow-lg hover:shadow-xl transition-all">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center text-white shrink-0`}>
                <kpi.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-lg font-bold text-gray-900 truncate">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Matches & Request */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Request CTA */}
          <Card className="border-0 shadow-xl bg-gradient-to-br from-white to-red-50 overflow-hidden relative">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/3 -translate-y-1/4">
              <Heart className="w-64 h-64 text-red-600" />
            </div>
            <CardContent className="p-8 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Need Blood?</h3>
                  <p className="text-gray-600 max-w-xl">
                    Trigger our AI Matching Engine to instantly find and notify compatible donors in your area.
                  </p>
                </div>
                <div className="w-full md:w-auto shrink-0">
                  <Button 
                    size="lg"
                    onClick={handleRequestBlood}
                    disabled={requesting}
                    className="w-full md:w-auto min-w-[200px] bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white shadow-lg shadow-red-500/30 text-lg px-8 h-14 rounded-xl"
                  >
                    {requesting ? <><Activity className="w-5 h-5 mr-2 animate-spin" /> Messaging...</> : <><Phone className="w-5 h-5 mr-2" /> Request Blood</>}
                  </Button>
                </div>
              </div>

              {requestSuccess && (
                <div className="mt-6 p-4 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
                  <CheckCircle className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-green-800 font-medium leading-relaxed">
                    {requestSuccess}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matched Donors */}
          <Card className="border-0 shadow-xl">
            <CardHeader className="border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  My Matched Donors
                </CardTitle>
                <Badge variant="secondary">{matches.length} Matches</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMatches ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />)}
                </div>
              ) : matches.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No active donor matches currently.</p>
                  <p className="text-sm">Click the Request Match button above to find donors.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {matches.map((match, i) => (
                    <div key={match.match_id} className={`p-4 hover:bg-gray-50 transition-colors ${match.status === 'confirmed' ? 'bg-green-50/30' : ''}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-12 h-12">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
                              {match.donor_name ? match.donor_name.substring(0,2).toUpperCase() : 'D'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-gray-900">{match.donor_name || 'Anonymous Donor'}</p>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Badge variant="outline" className="text-xs bg-white text-red-600 border-red-200">{match.donor_blood_group || profile.blood_group}</Badge>
                              <span>{match.distance_km || '?'} km away</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className={
                            match.status === 'confirmed' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                            match.status === 'pending' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' :
                            'bg-gray-100 text-gray-700 hover:bg-gray-100'
                          }>
                            {match.status.toUpperCase()}
                          </Badge>
                          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-500">
                            <Activity className="w-3 h-3" /> Match Score: {Math.round((match.match_score || 0)*100)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Proximity Map */}
          {matches.length > 0 && profile.latitude && profile.longitude && (
            <div className="mt-6">
              <ProximityMap 
                patient={{ lat: profile.latitude, lng: profile.longitude, city: profile.city }}
                donors={matches.map(m => {
                  // Add a tiny random jitter (approx 2km radius) to prevent markers stacking perfectly on top of each other
                  const jitterLat = (Math.random() - 0.5) * 0.03;
                  const jitterLng = (Math.random() - 0.5) * 0.03;
                  return {
                    id: m.match_id,
                    lat: (m.donor_lat || 0) + jitterLat,
                    lng: (m.donor_lng || 0) + jitterLng,
                    name: m.donor_name || 'Anonymous',
                  type: 'donor',
                    status: m.status,
                    distance_km: m.distance_km || 10
                  };
                })}
              />
            </div>
          )}
        </div>

        {/* Right Column: Schedule & History & Contacts */}
        <div className="space-y-6">
          
          {/* Smart Schedule */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-indigo-600" />
                Smart Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-l-2 border-gray-100 ml-3 space-y-6 pb-2">
                {schedule.length > 0 ? schedule.map((s, i) => (
                  <div key={i} className="relative pl-6">
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 bg-white ${s.status === 'completed' ? 'border-green-500 bg-green-500' : 'border-gray-300'}`} />
                    <p className={`font-medium ${s.status === 'completed' ? 'text-gray-900' : 'text-gray-500'}`}>{s.action}</p>
                    <p className="text-xs text-gray-500">{s.date}</p>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500 pl-4">No upcoming transfusion dates scheduled.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Emergency Contacts */}
          <Card className="border-0 shadow-xl bg-slate-900 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Phone className="w-5 h-5 text-red-400" />
                Emergency Contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a href="tel:18001801104" className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Blood Bank Hotline</p>
                    <p className="text-xs text-slate-300">1800-180-1104</p>
                  </div>
                </div>
              </a>
              <a href="tel:+91800274343" className="flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Coordinator Support</p>
                    <p className="text-xs text-slate-300">+91-800-BRIDGE</p>
                  </div>
                </div>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
