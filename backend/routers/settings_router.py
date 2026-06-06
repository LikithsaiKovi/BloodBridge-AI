from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from pydantic import BaseModel
from database.db import settings_repo, now_iso
from config.settings import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    notification_start_hour: int
    notification_end_hour: int
    donor_reminder_after_hours: int
    donor_escalation_after_hours: int

@router.get("")
def get_settings():
    """Get dynamic system settings, falling back to environment variables."""
    # Fetch from DB
    db_settings_list = settings_repo.get_all(limit=100)
    db_settings = {s["setting_key"]: s["setting_value"] for s in db_settings_list}

    # Helper to parse int safely
    def get_int(key: str, default: int) -> int:
        val = db_settings.get(key)
        if val is not None:
            try:
                return int(val)
            except ValueError:
                pass
        return default

    return {
        "notification_start_hour": get_int("notification_start_hour", settings.notification_start_hour),
        "notification_end_hour": get_int("notification_end_hour", settings.notification_end_hour),
        "donor_reminder_after_hours": get_int("donor_reminder_after_hours", settings.donor_reminder_after_hours),
        "donor_escalation_after_hours": get_int("donor_escalation_after_hours", settings.donor_escalation_after_hours),
    }

@router.post("")
def update_settings(updates: SettingsUpdate):
    """Update dynamic system settings in the database."""
    # We store them as strings in the KV store
    kv_pairs = {
        "notification_start_hour": str(updates.notification_start_hour),
        "notification_end_hour": str(updates.notification_end_hour),
        "donor_reminder_after_hours": str(updates.donor_reminder_after_hours),
        "donor_escalation_after_hours": str(updates.donor_escalation_after_hours),
    }

    for key, value in kv_pairs.items():
        settings_repo.put({
            "setting_key": key,
            "setting_value": value,
            "updated_at": now_iso()
        })
    
    return {"status": "success", "settings": get_settings()}
