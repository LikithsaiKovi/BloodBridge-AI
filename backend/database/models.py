from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ─── Patient Models ────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name: str
    blood_group: str
    city: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    next_transfusion_date: str
    last_transfusion_date: Optional[str] = None
    urgency_level: str = "medium"
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    units_needed: int = 2
    hospital: Optional[str] = None
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    next_transfusion_date: Optional[str] = None
    urgency_level: Optional[str] = None
    status: Optional[str] = None
    units_needed: Optional[int] = None
    notes: Optional[str] = None


class Patient(PatientCreate):
    patient_id: str
    status: str = "active"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ─── Donor Models ──────────────────────────────────────────────────────────────

class DonorCreate(BaseModel):
    name: Optional[str] = None
    blood_group: str
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_donation_date: Optional[str] = None
    next_eligible_date: Optional[str] = None
    eligibility_status: str = "eligible"
    donor_type: str = "Regular Donor"
    phone: Optional[str] = None
    gender: Optional[str] = None
    total_donations: int = 0
    total_calls: int = 0
    frequency_in_days: int = 90


class Donor(DonorCreate):
    donor_id: str
    availability_probability: float = 0.5
    donor_score: float = 0.5
    calls_to_donations_ratio: float = 0.0
    status: str = "active"
    badge: str = "New Hero"
    streak: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ─── Match Models ──────────────────────────────────────────────────────────────

class MatchRequest(BaseModel):
    patient_id: str
    max_distance_km: float = 50.0
    top_n: int = 10


class MatchResult(BaseModel):
    match_id: str
    patient_id: str
    donor_id: str
    donor_name: Optional[str] = None
    donor_blood_group: Optional[str] = None
    donor_city: Optional[str] = None
    match_score: float
    blood_compatibility_score: float
    distance_score: float
    availability_score: float
    eligibility_score: float
    distance_km: Optional[float] = None
    status: str = "pending"
    explanation: Optional[str] = None


class MatchConfirm(BaseModel):
    scheduled_date: str
    notes: Optional[str] = None


# ─── Forecast Models ───────────────────────────────────────────────────────────

class ForecastDay(BaseModel):
    date: str
    blood_group: str
    predicted_need: int
    confidence: float
    warning_type: Optional[str] = None  # "5_day", "3_day", "1_day"


class ShortageAlert(BaseModel):
    blood_group: str
    current_demand: int
    days_until_critical: int
    risk_level: str  # critical, high, medium, low
    patient_count: int


# ─── Outreach Models ───────────────────────────────────────────────────────────

class OutreachGenerateRequest(BaseModel):
    donor_id: str
    patient_id: Optional[str] = None
    language: str = "English"
    message_type: str = "initial"  # initial, reminder, thank_you, follow_up
    channel: str = "WhatsApp"


class OutreachSendRequest(BaseModel):
    donor_id: str
    patient_id: Optional[str] = None
    message: str
    language: str = "English"
    message_type: str = "initial"
    channel: str = "WhatsApp"


class OutreachResponse(BaseModel):
    interaction_id: str
    donor_id: str
    message: str
    language: str
    message_type: str
    channel: str
    timestamp: str
    response_status: str = "sent"


# ─── Analytics Models ──────────────────────────────────────────────────────────

class AnalyticsKPIs(BaseModel):
    total_donors: int
    total_patients: int
    total_matches: int
    confirmed_matches: int
    prediction_accuracy: float
    avg_availability_score: float
    monthly_donations: int
    retention_rate: float
    response_rate: float
    active_alerts: int


# ─── Awareness Chat ────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    sources: Optional[List[str]] = None


# ─── Schedule Models ───────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    patient_id: str
    donor_id: Optional[str] = None
    match_id: Optional[str] = None
    action: str
    scheduled_date: str
    notes: Optional[str] = None


# ─── WebSocket Events ──────────────────────────────────────────────────────────

class LiveEvent(BaseModel):
    event_type: str  # donor_found, donor_confirmed, patient_risk_alert, donation_completed
    title: str
    message: str
    severity: str = "info"  # info, warning, critical, success
    data: Optional[dict] = None
    timestamp: Optional[str] = None
