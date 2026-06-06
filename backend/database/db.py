"""
SQLite database layer (local dev) with DynamoDB-compatible interface.
Swap use_dynamodb=true in .env for AWS deployment.
"""
import sqlite3
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from contextlib import contextmanager
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

DB_PATH = settings.db_path

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'donor',
    blood_group TEXT,
    city TEXT,
    phone TEXT,
    linked_donor_id TEXT,
    linked_patient_id TEXT,
    avatar_initials TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    otp TEXT NOT NULL,
    secret TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT
);


CREATE TABLE IF NOT EXISTS patients (
    patient_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    blood_group TEXT NOT NULL,
    city TEXT,
    latitude REAL,
    longitude REAL,
    next_transfusion_date TEXT,
    last_transfusion_date TEXT,
    expected_next_transfusion_date TEXT,
    registration_date TEXT,
    urgency_level TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'active',
    phone TEXT,
    age INTEGER,
    gender TEXT,
    units_needed INTEGER DEFAULT 2,
    quantity_required REAL,
    hospital TEXT,
    notes TEXT,
    role_status INTEGER,
    bridge_status INTEGER,
    status_of_bridge INTEGER,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS donors (
    donor_id TEXT PRIMARY KEY,
    name TEXT,
    blood_group TEXT NOT NULL,
    city TEXT,
    latitude REAL,
    longitude REAL,
    last_donation_date TEXT,
    next_eligible_date TEXT,
    eligibility_status TEXT DEFAULT 'eligible',
    availability_probability REAL DEFAULT 0.5,
    donor_score REAL DEFAULT 0.5,
    total_donations INTEGER DEFAULT 0,
    donations_till_date REAL,
    total_calls INTEGER DEFAULT 0,
    calls_to_donations_ratio REAL DEFAULT 0.0,
    frequency_in_days INTEGER DEFAULT 90,
    cycle_of_donations INTEGER,
    donor_type TEXT DEFAULT 'Regular Donor',
    phone TEXT,
    gender TEXT,
    status TEXT DEFAULT 'active',
    badge TEXT DEFAULT 'New Hero',
    streak INTEGER DEFAULT 0,
    last_contacted_date TEXT,
    donated_earlier INTEGER,
    last_bridge_donation_date TEXT,
    user_donation_active_status INTEGER,
    role_status INTEGER,
    inactive_trigger_comment TEXT,
    bridge_status INTEGER,
    bridge_id TEXT,
    bridge_gender TEXT,
    bridge_blood_group TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    donor_id TEXT NOT NULL,
    match_score REAL,
    blood_compatibility_score REAL,
    distance_score REAL,
    availability_score REAL,
    eligibility_score REAL,
    status TEXT DEFAULT 'pending',
    scheduled_date TEXT,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS predictions (
    prediction_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    forecast_date TEXT NOT NULL,
    predicted_need INTEGER,
    blood_group TEXT,
    urgency_level TEXT,
    warning_type TEXT,
    confidence REAL,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS interactions (
    interaction_id TEXT PRIMARY KEY,
    donor_id TEXT NOT NULL,
    patient_id TEXT,
    message TEXT NOT NULL,
    language TEXT DEFAULT 'English',
    message_type TEXT DEFAULT 'initial',
    channel TEXT DEFAULT 'WhatsApp',
    response TEXT,
    response_status TEXT DEFAULT 'sent',
    timestamp TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
    schedule_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    donor_id TEXT,
    match_id TEXT,
    action TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT
);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize all tables."""
    with get_db() as conn:
        conn.executescript(SCHEMA_SQL)
    logger.info("✅ Database initialized at %s", DB_PATH)


def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def new_id(prefix: str = "") -> str:
    uid = str(uuid.uuid4())[:8].upper()
    return f"{prefix}{uid}" if prefix else uid


# ─── Generic Repository ────────────────────────────────────────────────────────

class Repository:
    def __init__(self, table: str):
        self.table = table

    def _row_to_dict(self, row) -> Dict:
        return dict(row)

    def get_all(self, filters: Dict = None, limit: int = 500) -> List[Dict]:
        with get_db() as conn:
            if filters:
                conditions = " AND ".join(f"{k}=?" for k in filters)
                values = list(filters.values())
                rows = conn.execute(
                    f"SELECT * FROM {self.table} WHERE {conditions} LIMIT ?",
                    values + [limit]
                ).fetchall()
            else:
                rows = conn.execute(
                    f"SELECT * FROM {self.table} LIMIT ?", [limit]
                ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_by_id(self, pk_name: str, pk_value: str) -> Optional[Dict]:
        with get_db() as conn:
            row = conn.execute(
                f"SELECT * FROM {self.table} WHERE {pk_name}=?", [pk_value]
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def put(self, data: Dict) -> Dict:
        data["updated_at"] = now_iso()
        if "created_at" not in data or not data.get("created_at"):
            data["created_at"] = now_iso()
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" * len(data))
        values = list(data.values())
        with get_db() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO {self.table} ({columns}) VALUES ({placeholders})",
                values
            )
        return data

    def update(self, pk_name: str, pk_value: str, updates: Dict) -> Optional[Dict]:
        updates["updated_at"] = now_iso()
        set_clause = ", ".join(f"{k}=?" for k in updates)
        values = list(updates.values()) + [pk_value]
        with get_db() as conn:
            conn.execute(
                f"UPDATE {self.table} SET {set_clause} WHERE {pk_name}=?",
                values
            )
        return self.get_by_id(pk_name, pk_value)

    def delete(self, pk_name: str, pk_value: str) -> bool:
        with get_db() as conn:
            conn.execute(
                f"DELETE FROM {self.table} WHERE {pk_name}=?", [pk_value]
            )
        return True

    def search(self, column: str, query: str, limit: int = 50) -> List[Dict]:
        with get_db() as conn:
            rows = conn.execute(
                f"SELECT * FROM {self.table} WHERE {column} LIKE ? LIMIT ?",
                [f"%{query}%", limit]
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def count(self, filters: Dict = None) -> int:
        with get_db() as conn:
            if filters:
                conditions = " AND ".join(f"{k}=?" for k in filters)
                values = list(filters.values())
                row = conn.execute(
                    f"SELECT COUNT(*) FROM {self.table} WHERE {conditions}", values
                ).fetchone()
            else:
                row = conn.execute(f"SELECT COUNT(*) FROM {self.table}").fetchone()
        return row[0] if row else 0

    def raw_query(self, sql: str, params: list = None) -> List[Dict]:
        with get_db() as conn:
            rows = conn.execute(sql, params or []).fetchall()
        return [self._row_to_dict(r) for r in rows]


# ─── Table-specific Repositories ──────────────────────────────────────────────

patients_repo = Repository("patients")
donors_repo = Repository("donors")
matches_repo = Repository("matches")
predictions_repo = Repository("predictions")
interactions_repo = Repository("interactions")
schedules_repo = Repository("schedules")
users_repo = Repository("users")
reset_tokens_repo = Repository("password_reset_tokens")
settings_repo = Repository("system_settings")
