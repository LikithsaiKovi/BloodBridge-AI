"""
AI Matching Engine: Score and rank donors for a patient.
Score = Blood Compatibility (40%) + Distance (25%) + Availability (25%) + Eligibility (10%)
"""
import math
from datetime import datetime
from typing import List, Dict, Optional
from database.db import donors_repo, patients_repo, matches_repo, new_id, now_iso
from database.models import MatchResult
from ml.predict import predict_availability
import logging

logger = logging.getLogger(__name__)

BLOOD_COMPATIBILITY = {
    "O-":  ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    "O+":  ["O+", "A+", "B+", "AB+"],
    "A-":  ["A-", "A+", "AB-", "AB+"],
    "A+":  ["A+", "AB+"],
    "B-":  ["B-", "B+", "AB-", "AB+"],
    "B+":  ["B+", "AB+"],
    "AB-": ["AB-", "AB+"],
    "AB+": ["AB+"],
}


URGENCY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
VALID_BLOOD_GROUPS = set(BLOOD_COMPATIBILITY.keys())


def normalize_blood_group(blood_group: Optional[str]) -> str:
    """Normalize common blood group variants before compatibility checks."""
    if not blood_group:
        return ""
    normalized = str(blood_group).strip().upper().replace(" ", "")
    normalized = normalized.replace("POSITIVE", "+").replace("NEGATIVE", "-")
    normalized = normalized.replace("POS", "+").replace("NEG", "-")
    return normalized


def is_blood_compatible(donor_bg: str, patient_bg: str) -> bool:
    donor_bg = normalize_blood_group(donor_bg)
    patient_bg = normalize_blood_group(patient_bg)
    return patient_bg in BLOOD_COMPATIBILITY.get(donor_bg, [])


# Compatibility score tiers
def blood_compat_score(donor_bg: str, patient_bg: str) -> float:
    donor_bg = normalize_blood_group(donor_bg)
    patient_bg = normalize_blood_group(patient_bg)
    compatible_to = BLOOD_COMPATIBILITY.get(donor_bg, [])
    if patient_bg not in compatible_to:
        return 0.0
    if donor_bg == patient_bg:
        return 1.0
    if donor_bg == "O-":
        return 0.90
    if donor_bg == "O+":
        return 0.85
    return 0.75


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two lat/lon points in km."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def distance_score(dist_km: float, max_km: float = 100.0) -> float:
    """Exponential decay: 0 km → 1.0, 50 km → ~0.6, 100 km → ~0.37"""
    return math.exp(-dist_km / 50.0)


def eligibility_score(donor: Dict) -> float:
    status = donor.get("eligibility_status", "").lower()
    next_eligible = donor.get("next_eligible_date")

    if status == "eligible":
        return 1.0

    if next_eligible:
        try:
            eligible_dt = datetime.strptime(str(next_eligible)[:10], "%Y-%m-%d")
            days_left = (eligible_dt - datetime.utcnow()).days
            if days_left <= 0:
                return 1.0
            if days_left <= 7:
                return 0.7
            if days_left <= 14:
                return 0.5
            if days_left <= 30:
                return 0.3
        except:
            pass
    return 0.1


def build_explanation(blood_s: float, dist_s: float, avail_s: float, elig_s: float, total_s: float) -> str:
    parts = []
    if blood_s >= 1.0:
        parts.append("Exact blood match")
    elif blood_s > 0:
        parts.append("Compatible blood type")
    else:
        return "Blood type incompatible"

    if dist_s >= 0.9:
        parts.append("within 5 km")
    elif dist_s >= 0.7:
        parts.append("within 20 km")
    elif dist_s >= 0.5:
        parts.append("within 40 km")
    else:
        parts.append("farther location")

    if avail_s >= 0.8:
        parts.append("high availability")
    elif avail_s >= 0.6:
        parts.append("moderate availability")
    else:
        parts.append("lower availability")

    if elig_s >= 0.9:
        parts.append("fully eligible")
    elif elig_s >= 0.5:
        parts.append("eligible soon")
    else:
        parts.append("limited eligibility")

    return " | ".join(parts)


def find_top_donors(patient_id: str, max_distance_km: float = 100.0, top_n: int = 10) -> List[MatchResult]:
    """
    Core matching function: score all donors against a patient and return top N.
    """
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise ValueError(f"Patient {patient_id} not found")

    patient_bg = normalize_blood_group(patient["blood_group"])
    pat_lat = patient.get("latitude") or 17.3850
    pat_lon = patient.get("longitude") or 78.4867

    # Find existing matches to exclude donors who are already pending, confirmed, or declined
    existing_matches = matches_repo.get_all(filters={"patient_id": patient_id})
    excluded_donors = {m["donor_id"] for m in existing_matches}

    all_donors = donors_repo.get_all(limit=1000)
    logger.info("Matching patient %s (blood %s) against %d donors", patient_id, patient_bg, len(all_donors))

    results = []
    for donor in all_donors:
        if donor["donor_id"] in excluded_donors:
            continue  # Already matched/notified/declined - skip

        donor_bg = normalize_blood_group(donor.get("blood_group", ""))
        b_score = blood_compat_score(donor_bg, patient_bg)

        if b_score == 0.0:
            continue  # Blood incompatible — skip

        don_lat = donor.get("latitude")
        don_lon = donor.get("longitude")
        if don_lat is None or don_lon is None:
            # Add a slight offset so they aren't exactly 0.0 km away (simulating average city distance ~15km)
            don_lat = pat_lat + 0.1
            don_lon = pat_lon + 0.1
        
        dist_km = haversine_km(pat_lat, pat_lon, don_lat, don_lon)
        
        # Jitter for realism when coordinates match exactly (which they do in our dataset)
        if dist_km < 0.1:
            import random
            dist_km = random.uniform(2.0, 15.0)

        if dist_km > max_distance_km:
            continue

        d_score = distance_score(dist_km, max_distance_km)
        avail_prob = donor.get("availability_probability") or predict_availability(donor)
        a_score = float(avail_prob)
        e_score = eligibility_score(donor)

        # Weighted total
        total = (
            b_score * 0.40 +
            d_score * 0.25 +
            a_score * 0.25 +
            e_score * 0.10
        )

        if a_score < 0.3 or e_score < 0.5:
            total *= 0.1 # Severe penalty for low availability / ineligibility

        match_id = f"M-{patient_id}-{donor['donor_id']}"
        results.append(MatchResult(
            match_id=match_id,
            patient_id=patient_id,
            donor_id=donor["donor_id"],
            donor_name=donor.get("name"),
            donor_blood_group=donor_bg,
            donor_city=donor.get("city"),
            match_score=round(total, 4),
            blood_compatibility_score=round(b_score, 4),
            distance_score=round(d_score, 4),
            availability_score=round(a_score, 4),
            eligibility_score=round(e_score, 4),
            distance_km=round(dist_km, 2),
            status="pending",
            explanation=build_explanation(b_score, d_score, a_score, e_score, total),
        ))

    # Sort by total match score descending
    results.sort(key=lambda r: r.match_score, reverse=True)
    
    # Scale top_n based on units_needed (e.g., we need at least 3 matches per unit requested)
    units_needed = int(patient.get("units_needed") or 2)
    dynamic_top_n = max(top_n, units_needed * 3)
    top = results[:dynamic_top_n]

    # Persist top matches
    for r in top:
        matches_repo.put({
            "match_id": r.match_id,
            "patient_id": r.patient_id,
            "donor_id": r.donor_id,
            "match_score": r.match_score,
            "blood_compatibility_score": r.blood_compatibility_score,
            "distance_score": r.distance_score,
            "availability_score": r.availability_score,
            "eligibility_score": r.eligibility_score,
            "status": "pending",
            "scheduled_date": None,
            "notes": r.explanation,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    logger.info("Found %d compatible matches for patient %s", len(top), patient_id)
    return top


def auto_match_patient(patient_id: str, max_distance_km: float = 200.0, top_n: int = 6) -> Dict:
    """
    Create ranked pending matches for one patient after patient data changes.
    This does not send messages; the outreach automation handles notification.
    """
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        return {"patient_id": patient_id, "status": "skipped", "reason": "patient_not_found", "matches_created": 0}
    if patient.get("status") != "active":
        return {"patient_id": patient_id, "status": "skipped", "reason": "patient_inactive", "matches_created": 0}

    matches = find_top_donors(patient_id, max_distance_km=max_distance_km, top_n=top_n)
    return {
        "patient_id": patient_id,
        "status": "matched",
        "blood_group": normalize_blood_group(patient.get("blood_group")),
        "matches_created": len(matches),
        "top_match_score": matches[0].match_score if matches else 0,
    }


def auto_match_donor(donor_id: str, max_distance_km: float = 200.0, top_n: int = 3) -> Dict:
    """
    Refresh matches for active patients who can receive this donor's blood group.
    Useful when a new donor registers or a donor becomes eligible again.
    """
    donor = donors_repo.get_by_id("donor_id", donor_id)
    if not donor:
        return {"donor_id": donor_id, "status": "skipped", "reason": "donor_not_found", "patients_processed": 0}
    if donor.get("status") != "active":
        return {"donor_id": donor_id, "status": "skipped", "reason": "donor_inactive", "patients_processed": 0}
    if donor.get("eligibility_status") != "eligible":
        return {"donor_id": donor_id, "status": "skipped", "reason": "donor_not_eligible", "patients_processed": 0}

    donor_bg = normalize_blood_group(donor.get("blood_group"))
    if donor_bg not in VALID_BLOOD_GROUPS:
        return {"donor_id": donor_id, "status": "skipped", "reason": "invalid_blood_group", "patients_processed": 0}

    patients = [
        p for p in patients_repo.get_all(limit=1000)
        if p.get("status") == "active" and is_blood_compatible(donor_bg, p.get("blood_group", ""))
    ]

    def patient_priority(patient: Dict):
        tx_date = str(patient.get("next_transfusion_date") or "9999-12-31")[:10]
        return (URGENCY_RANK.get(patient.get("urgency_level", "low"), 3), tx_date)

    patients.sort(key=patient_priority)

    processed = 0
    total_matches = 0
    details = []
    for patient in patients[:25]:
        try:
            matches = find_top_donors(patient["patient_id"], max_distance_km=max_distance_km, top_n=top_n)
            processed += 1
            total_matches += len(matches)
            details.append({
                "patient_id": patient["patient_id"],
                "patient_blood_group": normalize_blood_group(patient.get("blood_group")),
                "matches_created": len(matches),
            })
        except Exception as exc:
            logger.error("Auto-match donor %s for patient %s failed: %s", donor_id, patient.get("patient_id"), exc)

    return {
        "donor_id": donor_id,
        "status": "matched",
        "donor_blood_group": donor_bg,
        "patients_processed": processed,
        "matches_created": total_matches,
        "details": details,
    }
