"""Patient management API router."""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from database.db import patients_repo, new_id, now_iso
from database.models import Patient, PatientCreate, PatientUpdate
from services.forecast_service import compute_forecast
from services.matching_service import auto_match_patient
from services.automation_service import request_blood_for_patient
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("", response_model=List[dict])
def list_patients(
    status: Optional[str] = None,
    blood_group: Optional[str] = None,
    urgency: Optional[str] = None,
    limit: int = Query(default=100, le=500),
):
    filters = {}
    if status:
        filters["status"] = status
    if blood_group:
        filters["blood_group"] = blood_group
    if urgency:
        filters["urgency_level"] = urgency
    patients = patients_repo.get_all(filters=filters or None, limit=limit)

    # Sort by urgency
    urgency_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    patients.sort(key=lambda p: urgency_order.get(p.get("urgency_level", "low"), 3))
    return patients


@router.post("", response_model=dict, status_code=201)
def create_patient(patient: PatientCreate):
    patient_dict = patient.model_dump()
    patient_dict["patient_id"] = f"P-{new_id()}"
    patient_dict["status"] = "active"
    patient_dict["created_at"] = now_iso()
    patient_dict["updated_at"] = now_iso()

    # Auto-compute urgency from next transfusion date
    if patient.next_transfusion_date:
        from datetime import datetime
        try:
            tx_dt = datetime.strptime(patient.next_transfusion_date[:10], "%Y-%m-%d")
            days = (tx_dt - datetime.utcnow()).days
            if days <= 1:
                patient_dict["urgency_level"] = "critical"
            elif days <= 3:
                patient_dict["urgency_level"] = "high"
            elif days <= 7:
                patient_dict["urgency_level"] = "medium"
            else:
                patient_dict["urgency_level"] = "low"
        except:
            pass

    saved = patients_repo.put(patient_dict)
    saved["auto_match"] = _safe_auto_match(patient_dict["patient_id"])
    logger.info("Created patient %s", patient_dict["patient_id"])
    return saved


@router.get("/{patient_id}", response_model=dict)
def get_patient(patient_id: str):
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("/{patient_id}/request-blood", response_model=dict)
def request_blood(patient_id: str, top_n: int = 3, max_distance_km: float = 200.0):
    """One-click request: match same-blood-group donors and send WhatsApp alerts."""
    try:
        return request_blood_for_patient(patient_id, top_n=top_n, max_distance_km=max_distance_km)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Blood request failed for patient %s: %s", patient_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{patient_id}", response_model=dict)
def update_patient(patient_id: str, updates: PatientUpdate):
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    updated = patients_repo.update("patient_id", patient_id, update_dict)
    if updated and any(k in update_dict for k in ["next_transfusion_date", "urgency_level", "status", "units_needed"]):
        updated["auto_match"] = _safe_auto_match(patient_id)
    return updated


@router.delete("/{patient_id}")
def delete_patient(patient_id: str):
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    patients_repo.update("patient_id", patient_id, {"status": "inactive"})
    return {"message": "Patient deactivated"}


def _safe_auto_match(patient_id: str) -> dict:
    try:
        return auto_match_patient(patient_id)
    except Exception as exc:
        logger.error("Auto-match failed for patient %s: %s", patient_id, exc)
        return {
            "patient_id": patient_id,
            "status": "failed",
            "reason": str(exc),
            "matches_created": 0,
        }


@router.get("/{patient_id}/forecast")
def patient_forecast(patient_id: str):
    """Get blood demand forecast for a specific patient."""
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    from datetime import datetime, timedelta
    next_tx = patient.get("next_transfusion_date")
    if not next_tx:
        return {"warnings": [], "schedule": []}

    try:
        tx_dt = datetime.strptime(str(next_tx)[:10], "%Y-%m-%d")
        days_until = (tx_dt - datetime.utcnow()).days
    except:
        return {"warnings": [], "schedule": []}

    warnings = []
    for threshold, label in [(5, "5_day"), (3, "3_day"), (1, "1_day")]:
        if days_until <= threshold:
            warnings.append({
                "type": label,
                "message": f"Blood needed within {days_until} day(s)",
                "severity": "critical" if days_until <= 1 else "high" if days_until <= 3 else "warning",
            })
            break

    # Smart scheduling timeline
    schedule = []
    for offset, action in [
        (-5, "Find matching donors"),
        (-4, "Contact top 10 donors"),
        (-3, "Confirm donor"),
        (-1, "Send reminder to donor"),
        (0, "Donation day"),
    ]:
        action_date = tx_dt + timedelta(days=offset)
        schedule.append({
            "date": action_date.strftime("%b %d, %Y"),
            "action": action,
            "status": "completed" if action_date < datetime.utcnow() else "upcoming",
            "days_from_now": (action_date - datetime.utcnow()).days,
        })

    # Determine actual current stage based on matches
    from database.db import matches_repo
    matches = matches_repo.get_all(filters={"patient_id": patient_id})
    active_matches = [m for m in matches if m.get("status") in ["pending", "confirmed", "verification_pending", "completed"]]
    
    current_stage_idx = 0
    if active_matches:
        best_status = active_matches[0].get("status")
        if best_status == "completed":
            current_stage_idx = 4
        elif best_status == "verification_pending":
            current_stage_idx = 3
        elif best_status == "confirmed":
            current_stage_idx = 3
        elif best_status == "pending":
            current_stage_idx = 2

    return {
        "patient_id": patient_id,
        "blood_group": patient.get("blood_group"),
        "next_transfusion_date": next_tx,
        "days_until_transfusion": days_until,
        "urgency_level": patient.get("urgency_level"),
        "warnings": warnings,
        "smart_schedule": schedule,
        "current_stage_idx": current_stage_idx
    }


@router.get("/stats/summary")
def patient_stats():
    """Summary statistics for the patient dashboard."""
    all_patients = patients_repo.get_all(limit=1000)
    from datetime import datetime
    now = datetime.utcnow()

    stats = {
        "total": len(all_patients),
        "active": sum(1 for p in all_patients if p.get("status") == "active"),
        "critical": sum(1 for p in all_patients if p.get("urgency_level") == "critical"),
        "high": sum(1 for p in all_patients if p.get("urgency_level") == "high"),
        "medium": sum(1 for p in all_patients if p.get("urgency_level") == "medium"),
        "low": sum(1 for p in all_patients if p.get("urgency_level") == "low"),
        "blood_groups": {},
    }

    for p in all_patients:
        bg = p.get("blood_group", "Unknown")
        stats["blood_groups"][bg] = stats["blood_groups"].get(bg, 0) + 1

    return stats


class LocationConfirmRequest(BaseModel):
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

@router.post("/{patient_id}/confirm-location")
def confirm_location(patient_id: str, request: LocationConfirmRequest):
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
        
    patients_repo.update("patient_id", patient_id, {
        "preferred_location_name": request.address,
        "preferred_latitude": request.latitude,
        "preferred_longitude": request.longitude
    })
    
    from services.automation_service import notify_donors_of_final_location
    res = notify_donors_of_final_location(patient_id, request.address, request.latitude, request.longitude)
    return res

@router.delete("/{patient_id}")
def delete_patient(patient_id: str):
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    # Soft delete
    patients_repo.update("patient_id", patient_id, {"status": "inactive"})
    
    # Also delete associated user record if any
    from database.db import get_collection
    users_repo = get_collection("users")
    user = users_repo.get_by_id("linked_patient_id", patient_id)
    if user:
        users_repo.delete("id", user["id"])
        
    return {"status": "success", "message": "Patient account removed"}
