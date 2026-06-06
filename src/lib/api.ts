/**
 * BloodBridge AI — Frontend API Client
 * Connects to FastAPI backend at localhost:8000
 */

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Patient {
  patient_id: string;
  name: string;
  blood_group: string;
  city: string;
  latitude?: number;
  longitude?: number;
  next_transfusion_date: string;
  last_transfusion_date?: string;
  urgency_level: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  phone?: string;
  age?: number;
  gender?: string;
  units_needed: number;
  hospital?: string;
  notes?: string;
  created_at?: string;
}

export interface Donor {
  donor_id: string;
  name?: string;
  blood_group: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  last_donation_date?: string;
  next_eligible_date?: string;
  eligibility_status: string;
  availability_probability: number;
  donor_score: number;
  total_donations: number;
  total_calls: number;
  calls_to_donations_ratio: number;
  frequency_in_days: number;
  donor_type: string;
  phone?: string;
  gender?: string;
  status: string;
  badge: string;
  streak: number;
}

export interface MatchResult {
  match_id: string;
  patient_id: string;
  donor_id: string;
  donor_name?: string;
  donor_blood_group?: string;
  donor_city?: string;
  donor_lat?: number;
  donor_lng?: number;
  match_score: number;
  blood_compatibility_score: number;
  distance_score: number;
  availability_score: number;
  eligibility_score: number;
  distance_km?: number;
  status: string;
  explanation?: string;
}

export interface BloodRequestResult {
  status: string;
  patient_id: string;
  patient_blood_group?: string;
  matches_found: number;
  messages_sent: number;
  messages_queued: number;
  donors_contacted: Array<{
    donor_id: string;
    donor_name?: string;
    blood_group?: string;
    distance_km?: number;
    match_score?: number;
    message_status: string;
  }>;
  reason?: string;
  timestamp?: string;
}

export interface ForecastData {
  chart_data: Array<{
    date: string;
    full_date: string;
    'A+': number;
    'O+': number;
    'B+': number;
    'AB+': number;
    predicted: number;
    confidence: number;
  }>;
  warnings: Array<{
    patient_id: string;
    patient_name: string;
    blood_group: string;
    days_until: number;
    warning_type: string;
    urgency: string;
  }>;
  shortage_alerts: Array<{
    blood_group: string;
    current_stock: number;
    required_stock: number;
    shortage: number;
    risk_level: string;
    days_until_critical: number;
  }>;
  upcoming_transfusions: Array<{
    patient_id: string;
    patient_name: string;
    blood_group: string;
    scheduled_date: string;
    days_until: number;
    urgency: string;
    units_needed: number;
    hospital: string;
    status: string;
  }>;
  kpis: {
    total_units_7d: number;
    critical_patients: number;
    scheduled_transfusions: number;
    ai_confidence: number;
  };
}

export interface AnalyticsData {
  total_donors: number;
  active_donors: number;
  total_patients: number;
  active_patients: number;
  total_matches: number;
  confirmed_matches: number;
  match_success_rate: number;
  prediction_accuracy: number;
  avg_availability_score: number;
  monthly_donations: number;
  retention_rate: number;
  response_rate: number;
  active_alerts: number;
  total_interactions: number;
  lives_impacted: number;
}

export interface ChatMessage {
  message: string;
  session_id?: string;
}

export interface ChatResponse {
  response: string;
  session_id: string;
  timestamp: string;
  sources?: string[];
}

// ─── API Client ───────────────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
    });
  }

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url.toString(), options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── Patient API ──────────────────────────────────────────────────────────────

export const patientsApi = {
  list: (params?: { status?: string; blood_group?: string; urgency?: string }) =>
    request<Patient[]>('GET', '/api/patients', undefined, params as any),

  get: (id: string) => request<Patient>('GET', `/api/patients/${id}`),

  create: (data: Partial<Patient>) => request<Patient>('POST', '/api/patients', data),

  update: (id: string, data: Partial<Patient>) =>
    request<Patient>('PUT', `/api/patients/${id}`, data),

  requestBlood: (id: string, params?: { top_n?: number; max_distance_km?: number }) =>
    request<BloodRequestResult>('POST', `/api/patients/${id}/request-blood`, undefined, params as any),

  forecast: (id: string) => request<any>('GET', `/api/patients/${id}/forecast`),

  stats: () => request<any>('GET', '/api/patients/stats/summary'),
};

// ─── Donor API ────────────────────────────────────────────────────────────────

export const donorsApi = {
  list: (params?: { blood_group?: string; city?: string; search?: string; limit?: number; sort_by?: string }) =>
    request<Donor[]>('GET', '/api/donors', undefined, params as any),

  get: (id: string) => request<Donor>('GET', `/api/donors/${id}`),

  create: (data: Partial<Donor>) => request<Donor>('POST', '/api/donors', data),

  update: (id: string, data: Record<string, any>) =>
    request<any>('PUT', `/api/donors/${id}`, data),

  predict: (id: string) => request<any>('POST', `/api/donors/${id}/predict`),

  heatmap: () => request<any[]>('GET', '/api/donors/heatmap'),

  stats: () => request<any>('GET', '/api/donors/stats/summary'),
};

// ─── Matching API ─────────────────────────────────────────────────────────────

export const matchesApi = {
  run: (patient_id: string, top_n = 10, max_distance_km = 100) =>
    request<{ patient_id: string; total_found: number; matches: MatchResult[] }>(
      'POST', '/api/matches/run', { patient_id, top_n, max_distance_km }
    ),

  runAutomation: () =>
    request<any>('POST', '/api/matches/automation/run'),

  list: (params?: { patient_id?: string; status?: string }) =>
    request<any[]>('GET', '/api/matches', undefined, params as any),

  confirm: (match_id: string, scheduled_date: string, notes?: string) =>
    request<any>('POST', `/api/matches/${match_id}/confirm`, { scheduled_date, notes }),

  decline: (match_id: string) =>
    request<any>('POST', `/api/matches/${match_id}/decline`),
};

// ─── Forecast API ─────────────────────────────────────────────────────────────

export const forecastsApi = {
  get: (days = 7) => request<ForecastData>('GET', '/api/forecasts', undefined, { days }),
  alerts: () => request<any>('GET', '/api/forecasts/alerts'),
  calendar: () => request<any>('GET', '/api/forecasts/calendar'),
};

// ─── Outreach API ─────────────────────────────────────────────────────────────

export const outreachApi = {
  generate: (data: {
    donor_id: string;
    patient_id?: string;
    language: string;
    message_type: string;
    channel?: string;
  }) => request<any>('POST', '/api/outreach/generate', data),

  send: (data: {
    donor_id: string;
    message: string;
    language: string;
    message_type: string;
    channel?: string;
  }) => request<any>('POST', '/api/outreach/send', data),

  history: (donor_id?: string) =>
    request<any[]>('GET', '/api/outreach/history', undefined, donor_id ? { donor_id } : {}),

  stats: () => request<any>('GET', '/api/outreach/stats'),
};

// ─── Analytics API ────────────────────────────────────────────────────────────

export const analyticsApi = {
  get: () => request<AnalyticsData>('GET', '/api/analytics'),
  trends: () => request<any>('GET', '/api/analytics/trends'),
};

// ─── Awareness AI Chat ────────────────────────────────────────────────────────

export const awarenessApi = {
  chat: (data: ChatMessage) => request<ChatResponse>('POST', '/api/awareness/chat', data),
  stats: () => request<any>('GET', '/api/awareness/stats'),
};

// ─── Settings API ────────────────────────────────────────────────────────

export interface SystemSettings {
  automation_enabled: boolean;
  max_match_distance_km: number;
  minimum_match_score: number;
  critical_match_range_km: number;
  donor_rest_period_days: number;
  reminder_hours_before: number;
  escalation_timeout_hours: number;
}

export const settingsApi = {
  get: () => request<SystemSettings>('GET', '/api/settings'),
  update: (data: Partial<SystemSettings>) => request<SystemSettings>('PATCH', '/api/settings', data),
};

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  check: () => request<any>('GET', '/health'),
};
