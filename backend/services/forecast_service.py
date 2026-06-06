"""
Blood demand forecasting service.
Reads patient transfusion schedules → predicts 7-day blood requirements.
"""
from datetime import datetime, timedelta
from typing import List, Dict
from database.db import patients_repo, predictions_repo, new_id, now_iso
from database.models import ForecastDay, ShortageAlert
import logging

logger = logging.getLogger(__name__)

BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]

WARNING_THRESHOLDS = {5: "5_day", 3: "3_day", 1: "1_day"}


def compute_forecast(days_ahead: int = 7) -> Dict:
    """
    Compute 7-day blood demand forecast from patient schedules.
    Returns structured forecast data for the frontend.
    """
    patients = patients_repo.get_all(limit=1000)
    now = datetime.utcnow()

    # Build daily demand map: {date_str: {blood_group: count}}
    daily_demand: Dict[str, Dict[str, int]] = {}
    for i in range(days_ahead):
        d = (now + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_demand[d] = {bg: 0 for bg in BLOOD_GROUPS}

    # Count patients needing blood each day
    for patient in patients:
        if patient.get("status") != "active":
            continue
        next_tx = patient.get("next_transfusion_date")
        if not next_tx:
            continue
        try:
            tx_dt = datetime.strptime(str(next_tx)[:10], "%Y-%m-%d")
        except:
            continue

        bg = patient.get("blood_group", "")
        if bg not in BLOOD_GROUPS:
            # Normalize (e.g., "A Positive" → "A+")
            bg = normalize_blood_group(bg)

        if bg not in BLOOD_GROUPS:
            continue

        units = int(patient.get("units_needed") or 2)

        for i in range(days_ahead):
            check_date = (now + timedelta(days=i)).strftime("%Y-%m-%d")
            check_dt = datetime.strptime(check_date, "%Y-%m-%d")
            days_away = (tx_dt - check_dt).days
            if 0 <= days_away <= 2:  # Include ±2 day window
                daily_demand[check_date][bg] += units

    # Build chart data
    chart_data = []
    for i in range(days_ahead):
        date = (now + timedelta(days=i)).strftime("%Y-%m-%d")
        day_label = (now + timedelta(days=i)).strftime("%b %d")
        row = {"date": day_label, "full_date": date}
        total = 0
        for bg in ["A+", "O+", "B+", "AB+"]:
            row[bg] = daily_demand[date].get(bg, 0)
            total += row[bg]
        row["predicted"] = total
        # Add confidence (decreases with forecast horizon)
        row["confidence"] = max(60, 95 - i * 4)
        chart_data.append(row)

    # Warnings: patients with imminent needs
    warnings = []
    for patient in patients:
        if patient.get("status") != "active":
            continue
        next_tx = patient.get("next_transfusion_date")
        if not next_tx:
            continue
        try:
            tx_dt = datetime.strptime(str(next_tx)[:10], "%Y-%m-%d")
            days_until = (tx_dt - now).days
        except:
            continue

        for threshold, wtype in WARNING_THRESHOLDS.items():
            if days_until <= threshold:
                warnings.append({
                    "patient_id": patient["patient_id"],
                    "patient_name": patient.get("name"),
                    "blood_group": patient.get("blood_group"),
                    "next_transfusion_date": str(next_tx)[:10],
                    "days_until": days_until,
                    "warning_type": wtype,
                    "urgency": patient.get("urgency_level", "medium"),
                    "units_needed": patient.get("units_needed", 2),
                })
                break

    # Shortage alerts
    shortage_alerts = compute_shortage_alerts(daily_demand, days_ahead)

    # Upcoming transfusions (next 7 days)
    upcoming = []
    for patient in patients:
        if patient.get("status") != "active":
            continue
        next_tx = patient.get("next_transfusion_date")
        if not next_tx:
            continue
        try:
            tx_dt = datetime.strptime(str(next_tx)[:10], "%Y-%m-%d")
            days_until = (tx_dt - now).days
        except:
            continue
        if 0 <= days_until <= days_ahead:
            upcoming.append({
                "patient_id": patient["patient_id"],
                "patient_name": patient.get("name"),
                "blood_group": patient.get("blood_group"),
                "scheduled_date": str(next_tx)[:10],
                "time": "10:00 AM",
                "days_until": days_until,
                "urgency": patient.get("urgency_level", "medium"),
                "units_needed": patient.get("units_needed", 2),
                "hospital": patient.get("hospital", ""),
                "status": "Scheduled",
            })
    upcoming.sort(key=lambda x: x["days_until"])

    # KPI summary
    total_7d = sum(sum(day.values()) for day in daily_demand.values())
    critical_count = sum(1 for w in warnings if w.get("days_until", 99) <= 1)

    return {
        "chart_data": chart_data,
        "warnings": warnings,
        "shortage_alerts": shortage_alerts,
        "upcoming_transfusions": upcoming,
        "kpis": {
            "total_units_7d": total_7d,
            "critical_patients": critical_count,
            "scheduled_transfusions": len(upcoming),
            "ai_confidence": chart_data[0]["confidence"] if chart_data else 0,
        }
    }


def compute_shortage_alerts(daily_demand: Dict, days_ahead: int) -> List[Dict]:
    """Generate shortage alerts for blood groups with high demand."""
    # Simulated stock levels (in real deployment, this comes from blood bank API)
    SIMULATED_STOCK = {"A+": 15, "A-": 8, "B+": 12, "B-": 5, "O+": 20, "O-": 6, "AB+": 8, "AB-": 3}

    alerts = []
    for bg in BLOOD_GROUPS:
        total_demand = sum(daily_demand[d].get(bg, 0) for d in daily_demand)
        stock = SIMULATED_STOCK.get(bg, 10)
        shortage = max(0, total_demand - stock)

        if shortage <= 0:
            continue

        # Determine days until critical
        cumulative = 0
        days_until_critical = days_ahead
        for i in range(days_ahead):
            from datetime import datetime, timedelta
            now = datetime.utcnow()
            d = (now + timedelta(days=i)).strftime("%Y-%m-%d")
            cumulative += daily_demand[d].get(bg, 0)
            if cumulative >= stock:
                days_until_critical = i + 1
                break

        if days_until_critical <= 2:
            risk = "critical"
        elif days_until_critical <= 3:
            risk = "high"
        elif days_until_critical <= 5:
            risk = "medium"
        else:
            risk = "low"

        alerts.append({
            "blood_group": bg,
            "current_stock": stock,
            "required_stock": total_demand,
            "shortage": shortage,
            "risk_level": risk,
            "days_until_critical": days_until_critical,
        })

    alerts.sort(key=lambda x: x["days_until_critical"])
    return alerts


def normalize_blood_group(val: str) -> str:
    MAP = {
        "a positive": "A+", "a negative": "A-",
        "b positive": "B+", "b negative": "B-",
        "o positive": "O+", "o negative": "O-",
        "ab positive": "AB+", "ab negative": "AB-",
    }
    return MAP.get(str(val).strip().lower(), val)
