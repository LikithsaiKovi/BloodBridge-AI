"""
Donor availability prediction using trained XGBoost model.
"""
import os
import json
import joblib
import logging
import numpy as np
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "donor_model.pkl")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.pkl")
FEATURES_PATH = os.path.join(MODEL_DIR, "feature_names.json")

_model = None
_scaler = None
_feature_names = None


def load_model():
    global _model, _scaler, _feature_names
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            logger.warning("No trained model found. Using heuristic predictor.")
            return False
        _model = joblib.load(MODEL_PATH)
        _scaler = joblib.load(SCALER_PATH)
        with open(FEATURES_PATH) as f:
            _feature_names = json.load(f)
        logger.info("✅ XGBoost model loaded")
    return True


def compute_features(donor: Dict) -> Dict:
    """Extract features from a donor dict."""
    # Use the dataset's anchor date to evaluate historical donor intelligence accurately
    # Otherwise, because the system clock is 2026, all historical donors appear to have >300 days of inactivity,
    # causing recency_score = 0 and destroying the ML model's accuracy.
    ref_date = datetime(2025, 8, 1)

    last_donation_date = donor.get("last_donation_date")
    next_eligible_date = donor.get("next_eligible_date")

    # Days since last donation
    if last_donation_date:
        try:
            last_dt = datetime.strptime(str(last_donation_date)[:10], "%Y-%m-%d")
            days_since = max(0, (ref_date - last_dt).days)
        except:
            days_since = 365
    else:
        days_since = 365

    # Days until eligible
    if next_eligible_date:
        try:
            eligible_dt = datetime.strptime(str(next_eligible_date)[:10], "%Y-%m-%d")
            days_until = max(0, (eligible_dt - ref_date).days)
        except:
            days_until = 0
    else:
        days_until = 0

    donations = int(donor.get("total_donations", 0) or 0)
    total_calls = int(donor.get("total_calls", 0) or 0)
    frequency = int(donor.get("frequency_in_days", 90) or 90)
    cdr = float(donor.get("calls_to_donations_ratio", 0) or 0)
    eligibility = 1 if donor.get("eligibility_status", "").lower() == "eligible" else 0

    recency = max(0, 1 - (days_since / max(frequency, 1)))
    is_active = 1 if donor.get("status", "active").lower() == "active" else 0
    donated_before = 1 if donations > 0 else 0

    # NLP adjustment score based on inactive trigger comment
    comment = str(donor.get("inactive_trigger_comment") or "").lower()
    if not comment or comment in ("nan", "", "none"):
        comment_score = 1.0
    elif any(w in comment for w in ["pregnant", "surgery", "disease", "health", "unwell", "relocated", "medical"]):
        comment_score = 0.1
    elif any(w in comment for w in ["busy", "exam", "travel", "out of station", "fever", "sick"]):
        comment_score = 0.4
    elif "temporarily" in comment:
        comment_score = 0.7
    else:
        comment_score = 1.0

    return {
        "donations_till_date": donations,
        "frequency_in_days": frequency,
        "total_calls": total_calls,
        "calls_to_donations_ratio": cdr,
        "eligibility_status_clean": eligibility,
        "days_since_last_donation": days_since,
        "days_until_eligible": days_until,
        "recency_score": recency,
        "days_since_contacted": 999,  # default
        "is_active": is_active,
        "donated_before": donated_before,
        "comment_score": comment_score,
    }


def heuristic_predict(features: Dict) -> float:
    """Fallback heuristic when model not trained yet."""
    score = 0.40

    if features["eligibility_status_clean"] == 1:
        score += 0.20
    else:
        score -= 0.15

    if features["donations_till_date"] > 0:
        score += min(features["donations_till_date"] * 0.02, 0.15)

    if features["calls_to_donations_ratio"] > 0.7:
        score += 0.10
    elif features["calls_to_donations_ratio"] > 0.5:
        score += 0.05

    score += features["recency_score"] * 0.10

    if features["is_active"] == 1:
        score += 0.05

    score -= features["days_until_eligible"] * 0.005

    return max(0.05, min(0.98, score))


def predict_availability(donor: Dict) -> float:
    """
    Predict donor availability probability (0.0 to 1.0).
    Returns probability rounded to 3 decimal places.
    """
    features = compute_features(donor)

    if not load_model():
        return heuristic_predict(features)

    try:
        X = np.array([[features[f] for f in _feature_names]], dtype=float)
        X_scaled = _scaler.transform(X)
        prob = float(_model.predict_proba(X_scaled)[0][1])
    except Exception as e:
        logger.error("Prediction error: %s", e)
        prob = heuristic_predict(features)

    # NLP adjustment based on inactive trigger comment
    comment = str(donor.get("inactive_trigger_comment") or "").lower()
    if comment and comment != "nan":
        if any(w in comment for w in ["pregnant", "surgery", "disease", "health", "unwell", "relocated", "medical"]):
            prob *= 0.1  # Severe penalty
        elif any(w in comment for w in ["busy", "exam", "travel", "out of station", "fever", "sick"]):
            prob *= 0.4  # Moderate penalty
        elif "temporarily" in comment:
            prob *= 0.7

    return round(max(0.01, min(0.99, prob)), 3)


def predict_batch(donors: list) -> list:
    """Predict availability for a list of donors."""
    return [predict_availability(d) for d in donors]
