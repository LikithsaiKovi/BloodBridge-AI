"""Donor intelligence API router."""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from database.db import donors_repo, new_id, now_iso
from database.models import DonorCreate
from ml.predict import predict_availability
from services.matching_service import auto_match_donor
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/donors", tags=["donors"])


@router.get("", response_model=List[dict])
def list_donors(
    blood_group: Optional[str] = None,
    city: Optional[str] = None,
    eligibility_status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    sort_by: str = "donor_score",
):
    if search:
        # Multi-field search
        all_donors = donors_repo.get_all(limit=limit * 3)
        query = search.lower()
        donors = [
            d for d in all_donors
            if query in str(d.get("name", "")).lower()
            or query in str(d.get("blood_group", "")).lower()
            or query in str(d.get("city", "")).lower()
            or query in str(d.get("donor_id", "")).lower()
        ]
        donors = donors[:limit]
    else:
        filters = {}
        if blood_group:
            filters["blood_group"] = blood_group
        if city:
            filters["city"] = city
        if eligibility_status:
            filters["eligibility_status"] = eligibility_status
        donors = donors_repo.get_all(filters=filters or None, limit=limit)

    # Sort
    reverse = sort_by in ["donor_score", "availability_probability", "total_donations"]
    donors.sort(key=lambda d: float(d.get(sort_by, 0) or 0), reverse=reverse)
    return donors


@router.post("", response_model=dict, status_code=201)
def create_donor(donor: DonorCreate):
    donor_dict = donor.model_dump()
    donor_dict["donor_id"] = f"D-{new_id()}"
    donor_dict["status"] = "active"
    donor_dict["badge"] = "New Hero"
    donor_dict["streak"] = 0
    donor_dict["created_at"] = now_iso()
    donor_dict["updated_at"] = now_iso()

    # Run ML prediction
    prob = predict_availability(donor_dict)
    donor_dict["availability_probability"] = prob
    donor_dict["donor_score"] = round(prob * 100, 1)

    # Compute CDR
    if donor_dict.get("total_calls", 0) > 0:
        donor_dict["calls_to_donations_ratio"] = round(
            donor_dict.get("total_donations", 0) / donor_dict["total_calls"], 2
        )

    saved = donors_repo.put(donor_dict)
    saved["auto_match"] = _safe_auto_match(donor_dict["donor_id"])
    logger.info("Created donor %s", donor_dict["donor_id"])
    return saved


@router.get("/heatmap")
def donor_heatmap():
    """Availability heatmap data by day and time."""
    # Compute from real donor data weighted by eligibility and availability scores
    donors = donors_repo.get_all(limit=1000)
    eligible_count = sum(1 for d in donors if d.get("eligibility_status") == "eligible")
    total = max(len(donors), 1)
    base_rate = eligible_count / total

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    times = ["9 AM", "12 PM", "3 PM", "6 PM"]

    # Day multipliers (weekdays higher than weekends)
    day_mult = {"Mon": 0.85, "Tue": 0.88, "Wed": 0.90, "Thu": 0.87, "Fri": 0.82, "Sat": 0.65, "Sun": 0.55}
    # Time multipliers
    time_mult = {"9 AM": 0.95, "12 PM": 0.75, "3 PM": 0.80, "6 PM": 0.85}

    heatmap = []
    for t in times:
        row = {"timeSlot": t}
        for d in days:
            value = int(base_rate * day_mult[d] * time_mult[t] * 100)
            row[d] = min(max(value, 10), 98)
        heatmap.append(row)
    return heatmap


@router.get("/stats/summary")
def donor_stats():
    donors = donors_repo.get_all(limit=1000)
    eligible = [d for d in donors if d.get("eligibility_status") == "eligible"]
    scores = [float(d.get("availability_probability") or 0) for d in donors if d.get("availability_probability")]

    return {
        "total_active_donors": len([d for d in donors if d.get("status") == "active"]),
        "eligible_now": len(eligible),
        "avg_availability_score": round(sum(scores) / len(scores) * 100, 1) if scores else 0,
        "blood_group_distribution": _blood_group_distribution(donors),
        "city_distribution": _city_distribution(donors),
        "badge_distribution": _badge_distribution(donors),
        "monthly_donations": sum(int(d.get("total_donations") or 0) for d in donors),
    }


@router.get("/{donor_id}", response_model=dict)
def get_donor(donor_id: str):
    donor = donors_repo.get_by_id("donor_id", donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    return donor


@router.post("/{donor_id}/predict")
def predict_donor(donor_id: str):
    """Run XGBoost prediction for a specific donor and update score."""
    donor = donors_repo.get_by_id("donor_id", donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")

    prob = predict_availability(donor)
    donors_repo.update("donor_id", donor_id, {
        "availability_probability": prob,
        "donor_score": round(prob * 100, 1),
    })
    return {
        "donor_id": donor_id,
        "availability_probability": prob,
        "donor_score": round(prob * 100, 1),
        "eligibility_status": donor.get("eligibility_status"),
        "prediction_model": "XGBoost v1.0",
    }


@router.put("/{donor_id}", response_model=dict)
def update_donor(donor_id: str, updates: dict):
    donor = donors_repo.get_by_id("donor_id", donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
        
    # Merge updates into donor to predict new score
    merged = donor.copy()
    merged.update(updates)
    
    prob = predict_availability(merged)
    updates["availability_probability"] = prob
    updates["donor_score"] = round(prob * 100, 1)

    updated = donors_repo.update("donor_id", donor_id, updates)
    if updated and any(k in updates for k in ["blood_group", "city", "latitude", "longitude", "eligibility_status", "status"]):
        updated["auto_match"] = _safe_auto_match(donor_id)
    return updated


def _safe_auto_match(donor_id: str) -> dict:
    try:
        return auto_match_donor(donor_id)
    except Exception as exc:
        logger.error("Auto-match failed for donor %s: %s", donor_id, exc)
        return {
            "donor_id": donor_id,
            "status": "failed",
            "reason": str(exc),
            "patients_processed": 0,
            "matches_created": 0,
        }


def _blood_group_distribution(donors: list) -> dict:
    dist = {}
    for d in donors:
        bg = d.get("blood_group", "Unknown")
        dist[bg] = dist.get(bg, 0) + 1
    return dist


def _city_distribution(donors: list) -> dict:
    dist = {}
    for d in donors:
        city = d.get("city", "Unknown")
        dist[city] = dist.get(city, 0) + 1
    return dict(sorted(dist.items(), key=lambda x: x[1], reverse=True)[:10])


def _badge_distribution(donors: list) -> dict:
    dist = {}
    for d in donors:
        badge = d.get("badge", "New Hero")
        dist[badge] = dist.get(badge, 0) + 1
    return dist


@router.delete("/{donor_id}")
def delete_donor(donor_id: str):
    donor = donors_repo.get_by_id("donor_id", donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    
    donors_repo.update("donor_id", donor_id, {"status": "inactive"})
    
    from database.db import get_collection
    users_repo = get_collection("users")
    user = users_repo.get_by_id("linked_donor_id", donor_id)
    if user:
        users_repo.delete("id", user["id"])
        
    return {"status": "success", "message": "Donor account removed"}
