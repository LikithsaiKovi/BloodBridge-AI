"""
Seed real data from Dataset.csv for BloodBridge AI.
"""
import pandas as pd
import numpy as np
import math
from datetime import datetime
from database.db import donors_repo, patients_repo, now_iso, get_db
import logging

logger = logging.getLogger(__name__)

def safe_str(val):
    if pd.isna(val) or val is None:
        return None
    return str(val)

def safe_float(val):
    if pd.isna(val) or val is None:
        return None
    try:
        return float(val)
    except:
        return None

def safe_int(val):
    if pd.isna(val) or val is None:
        return None
    try:
        return int(float(val))
    except:
        return None

def safe_bool(val):
    if pd.isna(val) or val is None:
        return None
    if str(val).lower() in ('true', '1', 't', 'yes', 'y'):
        return 1
    return 0

def format_id(uid):
    if pd.isna(uid) or not uid:
        return None
    # Use first 8 chars of hash as requested
    s = str(uid).replace("\\x", "")
    return s[:8].upper()

def parse_date(date_str):
    if pd.isna(date_str) or not str(date_str).strip():
        return None
    try:
        dt = pd.to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except:
        return None

def get_badge(donations: int) -> str:
    if donations is None: return "New Hero"
    if donations >= 10: return "Blood Legend"
    elif donations >= 5: return "Platinum Hero"
    elif donations >= 3: return "Gold Donor"
    elif donations >= 1: return "Silver Donor"
    return "New Hero"

def seed_all():
    # Only seed if database is empty to prevent slow boot
    from config.settings import settings
    if settings.use_dynamodb:
        logger.info("Checking DynamoDB for existing data...")
        # Check if both donors and patients exist. If either is missing, we should seed.
        if len(donors_repo.get_all(limit=1)) > 0 and len(patients_repo.get_all(limit=1)) > 0:
            logger.info("DynamoDB already seeded, skipping seed_all().")
            return
        logger.info("Proceeding to seed DynamoDB...")
    else:
        with get_db() as conn:
            # Ensure tables exist before querying
            try:
                count = conn.execute("SELECT COUNT(*) FROM donors").fetchone()[0]
                if count > 0:
                    logger.info("SQLite database already seeded, skipping seed_all().")
                    return
            except Exception:
                pass # Tables don't exist yet
        
        logger.info("Dropping existing data from SQLite...")
        with get_db() as conn:
            try:
                conn.execute("DELETE FROM donors")
                conn.execute("DELETE FROM patients")
                conn.execute("DELETE FROM matches")
                conn.execute("DELETE FROM interactions")
                conn.commit()
            except Exception:
                pass
    
    logger.info("Reading Dataset.csv...")
    try:
        df = pd.read_csv('../Dataset.csv')
    except Exception as e:
        logger.error(f"Failed to load Dataset.csv: {e}")
        return

    logger.info(f"Loaded {len(df)} rows. Processing...")
    
    donors_count = 0
    patients_count = 0

    for idx, row in df.iterrows():
        role = safe_str(row.get('role'))
        if not role: continue
        
        uid = format_id(row.get('user_id'))
        if not uid: continue

        lat = safe_float(row.get('latitude'))
        lon = safe_float(row.get('longitude'))
        
        # If dataset lacks location, simulate realistic scattering around Hyderabad (approx 50km radius)
        if lat is None or lon is None:
            import random
            lat = 17.3850 + random.uniform(-0.5, 0.5)
            lon = 78.4867 + random.uniform(-0.5, 0.5)

        bg = safe_str(row.get('blood_group')) or "Unknown"
        gender = safe_str(row.get('gender'))

        # Common attributes
        common_attrs = {
            "name": f"User {uid}",  # Requested naming convention
            "blood_group": bg.replace(" Positive", "+").replace(" Negative", "-"),
            "latitude": lat,
            "longitude": lon,
            "gender": gender,
            "role_status": safe_bool(row.get('role_status')),
            "bridge_status": safe_bool(row.get('bridge_status')),
            "created_at": now_iso(),
            "updated_at": now_iso()
        }

        if role.lower() in ['patient', 'thalassemia patient']:
            patient = common_attrs.copy()
            patient["patient_id"] = f"P-{uid}"
            patient["next_transfusion_date"] = parse_date(row.get('expected_next_transfusion_date'))
            patient["expected_next_transfusion_date"] = parse_date(row.get('expected_next_transfusion_date'))
            patient["last_transfusion_date"] = parse_date(row.get('last_transfusion_date'))
            patient["registration_date"] = parse_date(row.get('registration_date'))
            patient["quantity_required"] = safe_float(row.get('quantity_required'))
            patient["units_needed"] = safe_int(row.get('quantity_required')) or 2
            patient["status_of_bridge"] = safe_bool(row.get('status_of_bridge'))
            
            # Determine urgency
            urgency = "medium"
            if patient["next_transfusion_date"]:
                try:
                    dt = datetime.strptime(patient["next_transfusion_date"], "%Y-%m-%d")
                    days = (dt - datetime.now()).days
                    if days <= 1: urgency = "critical"
                    elif days <= 3: urgency = "high"
                    elif days <= 7: urgency = "medium"
                    else: urgency = "low"
                except:
                    pass
            patient["urgency_level"] = urgency
            
            patients_repo.put(patient)
            patients_count += 1

        else:
            # Donor
            donor = common_attrs.copy()
            donor["donor_id"] = f"D-{uid}"
            donor["donor_type"] = role
            donor["bridge_id"] = format_id(row.get('bridge_id'))
            donor["bridge_gender"] = safe_str(row.get('bridge_gender'))
            donor["bridge_blood_group"] = safe_str(row.get('bridge_blood_group'))
            donor["last_contacted_date"] = parse_date(row.get('last_contacted_date'))
            donor["last_donation_date"] = parse_date(row.get('last_donation_date'))
            donor["next_eligible_date"] = parse_date(row.get('next_eligible_date'))
            donor["donations_till_date"] = safe_float(row.get('donations_till_date'))
            donor["total_donations"] = safe_int(row.get('donations_till_date')) or 0
            donor["eligibility_status"] = safe_str(row.get('eligibility_status')) or "eligible"
            donor["cycle_of_donations"] = safe_int(row.get('cycle_of_donations'))
            donor["total_calls"] = safe_int(row.get('total_calls')) or 0
            donor["frequency_in_days"] = safe_int(row.get('frequency_in_days')) or 90
            donor["status"] = safe_str(row.get('status')) or "active"
            donor["donated_earlier"] = safe_bool(row.get('donated_earlier'))
            donor["last_bridge_donation_date"] = parse_date(row.get('last_bridge_donation_date'))
            donor["calls_to_donations_ratio"] = safe_float(row.get('calls_to_donations_ratio')) or 0.0
            donor["user_donation_active_status"] = safe_str(row.get('user_donation_active_status'))
            donor["inactive_trigger_comment"] = safe_str(row.get('inactive_trigger_comment'))
            
            donor["badge"] = get_badge(donor["total_donations"])

            # Use ML predictor so inactive_trigger_comment is factored in immediately
            try:
                from ml.predict import predict_availability
                donor["availability_probability"] = predict_availability(donor)
            except Exception:
                donor["availability_probability"] = 0.5
                if donor.get("user_donation_active_status") == "Active":
                    donor["availability_probability"] += 0.2
                if donor.get("eligibility_status") == "eligible":
                    donor["availability_probability"] += 0.2

            donor["donor_score"] = min(99.0, donor["availability_probability"] * 100)
            
            donors_repo.put(donor)
            donors_count += 1

    logger.info(f"✅ Seeding complete: {patients_count} patients, {donors_count} donors.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_all()
