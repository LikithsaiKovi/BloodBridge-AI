import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

from config.settings import settings
from database.db import patients_repo, donors_repo, interactions_repo, matches_repo, now_iso, new_id
from services.matching_service import find_top_donors, normalize_blood_group
from services.whatsapp_service import send_sms, send_message

logger = logging.getLogger(__name__)


def run_outreach_automation() -> Dict:
    """
    Hourly automation job:
    1. Sends any queued messages that are now inside allowed notification hours.
    2. Sends one reminder for old pending requests.
    3. Escalates stale requests after a reminder has already been sent.
    4. Matches critical/high patients and sends one consolidated donor message.
    5. Sends the daily coordinator digest once at the configured morning hour.
    """
    logger.info("Starting Smart Outreach Automation Job...")

    queued_results = process_queued_messages()
    reminder_results = send_pending_reminders()
    escalation_results = escalate_expired_matches()
    digest_results = send_daily_coordinator_digest()
    
    # Zero-Touch Automations
    verification_results = verify_completed_donations()
    reactivation_results = reactivate_resting_donors()
    emergency_results = trigger_emergency_blasts()

    patients = _patients_due_for_outreach()
    logger.info("Found %d patients due for outreach.", len(patients))

    donor_matches: Dict[str, List[Dict]] = {}
    for patient in patients:
        try:
            matches = find_top_donors(patient["patient_id"], max_distance_km=200, top_n=3)
            for match in matches[:3]:
                donor = donors_repo.get_by_id("donor_id", match.donor_id)
                if not _donor_can_receive_outreach(donor):
                    continue
                if _recently_contacted(donor):
                    logger.info("Skipping donor %s because they were contacted recently.", donor.get("name"))
                    continue

                donor_matches.setdefault(match.donor_id, []).append(_match_detail(patient, match))
        except Exception as exc:
            logger.error("Error matching for patient %s: %s", patient.get("patient_id"), exc)

    actions_taken = []
    messages_sent = 0
    messages_queued = 0

    for donor_id, matches in donor_matches.items():
        donor = donors_repo.get_by_id("donor_id", donor_id)
        if not donor or not donor.get("phone") or not matches:
            continue

        message_body = _build_consolidated_message(donor, matches, reminder=False)
        is_critical = any(_is_critical_patient_match(match) for match in matches)
        result = _send_or_queue_donor_message(
            donor=donor,
            matches=matches,
            message_body=message_body,
            message_type="initial",
            force_send=is_critical,
        )

        if result["status"] == "sent":
            messages_sent += 1
        elif result["status"] == "queued":
            messages_queued += 1

        actions_taken.append({
            "donor_name": donor.get("name", "Hero"),
            "matches_count": len(matches),
            "status": result["status"],
        })

    return {
        "status": "success",
        "patients_processed": len(patients),
        "messages_sent": messages_sent,
        "messages_queued": messages_queued,
        "queued": queued_results,
        "reminders": reminder_results,
        "escalations": escalation_results,
        "verifications": verification_results,
        "reactivations": reactivation_results,
        "emergency_blasts": emergency_results,
        "coordinator_digest": digest_results,
        "details": actions_taken,
        "timestamp": now_iso(),
    }


def request_blood_for_patient(patient_id: str, top_n: int = 3, max_distance_km: float = 200.0) -> Dict:
    """
    One-click patient request: find the best exact blood-group donors and send
    one WhatsApp alert to each selected donor.
    """
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        raise ValueError(f"Patient {patient_id} not found")
    if patient.get("status") != "active":
        return {
            "status": "skipped",
            "reason": "patient_inactive",
            "patient_id": patient_id,
            "matches_found": 0,
            "messages_sent": 0,
            "messages_queued": 0,
            "donors_contacted": [],
        }

    patient_bg = normalize_blood_group(patient.get("blood_group"))
    same_group_matches = _existing_same_group_matches(patient, patient_bg, top_n)

    if len(same_group_matches) < top_n:
        new_matches = find_top_donors(patient_id, max_distance_km=max_distance_km, top_n=max(top_n * 4, 12))
        existing_donor_ids = {match["donor_id"] for match in same_group_matches}
        for match in new_matches:
            donor_bg = normalize_blood_group(match.donor_blood_group)
            if donor_bg == patient_bg and match.donor_id not in existing_donor_ids:
                same_group_matches.append({
                    "match_id": match.match_id,
                    "donor_id": match.donor_id,
                    "match_score": match.match_score,
                    "distance_km": match.distance_km,
                })
                existing_donor_ids.add(match.donor_id)
            if len(same_group_matches) >= top_n:
                break

    messages_sent = 0
    messages_queued = 0
    donors_contacted = []

    for match in same_group_matches:
        donor = donors_repo.get_by_id("donor_id", match["donor_id"])
        if not _donor_can_receive_outreach(donor):
            continue

        detail = _match_detail_from_request_match(patient, match)
        message_body = _build_direct_patient_request_message(donor, detail)
        result = _send_or_queue_donor_message(
            donor=donor,
            matches=[detail],
            message_body=message_body,
            message_type="patient_request",
            force_send=True, # Always force send on manual button click
        )

        if result["status"] == "sent":
            messages_sent += 1
        elif result["status"] == "queued":
            messages_queued += 1

        donors_contacted.append({
            "donor_id": donor["donor_id"],
            "donor_name": donor.get("name", "Donor"),
            "blood_group": donor.get("blood_group"),
            "distance_km": detail["distance_km"],
            "match_score": match.get("match_score"),
            "message_status": result["status"],
        })

    return {
        "status": "success",
        "patient_id": patient_id,
        "patient_blood_group": patient.get("blood_group"),
        "matches_found": len(same_group_matches),
        "messages_sent": messages_sent,
        "messages_queued": messages_queued,
        "donors_contacted": donors_contacted,
        "timestamp": now_iso(),
    }


def process_queued_messages() -> Dict:
    """Send queued WhatsApp messages once quiet hours end."""
    if not _within_notification_hours():
        return {"processed": 0, "sent": 0, "status": "outside_notification_hours"}

    queued = interactions_repo.get_all(filters={"response_status": "queued"}, limit=200)
    queued_groups: Dict[tuple, List[Dict]] = {}
    for interaction in queued:
        key = (interaction["donor_id"], interaction["message"], interaction.get("message_type", "initial"))
        queued_groups.setdefault(key, []).append(interaction)

    sent = 0
    for (donor_id, message, _message_type), interactions in queued_groups.items():
        donor = donors_repo.get_by_id("donor_id", donor_id)
        if not donor or not donor.get("phone"):
            continue

        result = send_sms(donor["phone"], message)
        if result.get("status") in ("sent", "simulated"):
            for interaction in interactions:
                interactions_repo.update("interaction_id", interaction["interaction_id"], {
                    "response_status": "sent",
                    "timestamp": now_iso(),
                })
            donors_repo.update("donor_id", donor["donor_id"], {"last_contacted_date": now_iso()})
            sent += 1

    return {"processed": len(queued_groups), "sent": sent}


# ─── Zero-Touch Automations ───────────────────────────────────────────────────

def verify_completed_donations() -> Dict:
    """Send SMS to donors 24h after their scheduled donation date to verify completion."""
    now = datetime.utcnow()
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Find confirmed matches scheduled for yesterday or earlier that haven't been verified
    unverified_matches = matches_repo.get_all(filters={"status": "confirmed"}, limit=1000)
    sent_count = 0
    
    for match in unverified_matches:
        scheduled = str(match.get("scheduled_date") or "")[:10]
        if not scheduled or scheduled > yesterday:
            continue
            
        # Ensure we haven't asked already
        if _has_interaction(match["donor_id"], match["patient_id"], "verification"):
            continue
            
        donor = donors_repo.get_by_id("donor_id", match["donor_id"])
        patient = patients_repo.get_by_id("patient_id", match["patient_id"])
        if not donor or not donor.get("phone") or not patient:
            continue
            
        # Change status to pending verification
        matches_repo.update("match_id", match["match_id"], {"status": "verification_pending"})
        
        msg = (
            f"[BloodBridge AI Verification]\n"
            f"Hi {donor.get('name', 'Hero')}, checking in! Were you able to complete your donation "
            f"for {_mask_name(patient.get('name', 'Patient'))} on {scheduled}?\n\n"
            f"Reply DONE or RESCHEDULE."
        )
        
        send_sms(donor["phone"], msg)
        interactions_repo.put({
            "interaction_id": f"V-{new_id()}",
            "donor_id": donor["donor_id"],
            "patient_id": patient["patient_id"],
            "message": msg,
            "language": "English",
            "message_type": "verification",
            "channel": "SMS",
            "response_status": "sent",
            "timestamp": now_iso(),
        })
        sent_count += 1
        
    return {"verifications_sent": sent_count}


def reactivate_resting_donors() -> Dict:
    """Reactivate donors who have completed their 90-day resting period."""
    now = datetime.utcnow()
    reactivated = 0
    
    donors = donors_repo.get_all(filters={"eligibility_status": "resting"}, limit=1000)
    for donor in donors:
        last_donation = str(donor.get("last_donation_date") or "")[:10]
        if not last_donation:
            continue
            
        try:
            last_date = datetime.strptime(last_donation, "%Y-%m-%d")
            days_since = (now - last_date).days
            if days_since >= 90:
                # Reactivate!
                donors_repo.update("donor_id", donor["donor_id"], {"eligibility_status": "eligible"})
                
                # Send Welcome Back SMS
                if donor.get("phone"):
                    msg = (
                        "[BloodBridge AI]\n"
                        f"Welcome back, {donor.get('name', 'Hero')}! 🩸\n"
                        "Your 90-day rest period is over. You are now eligible to save a life again! "
                        "Reply READY to enter the active matching pool."
                    )
                    send_sms(donor["phone"], msg)
                    interactions_repo.put({
                        "interaction_id": f"W-{new_id()}",
                        "donor_id": donor["donor_id"],
                        "message": msg,
                        "language": "English",
                        "message_type": "reactivation",
                        "channel": "SMS",
                        "response_status": "sent",
                        "timestamp": now_iso(),
                    })
                reactivated += 1
        except Exception:
            pass
            
    return {"reactivated_donors": reactivated}


def trigger_emergency_blasts() -> Dict:
    """If a patient is critical and has NO pending matches, blast top 20 nearby donors."""
    now = datetime.utcnow()
    blasts = 0
    
    patients = patients_repo.get_all(filters={"status": "active"}, limit=1000)
    for patient in patients:
        urgency = patient.get("urgency_level")
        needed_by = patient.get("next_transfusion_date")
        
        # Only Critical patients
        is_critical = urgency == "critical"
        if not is_critical and needed_by:
            try:
                tx_dt = datetime.strptime(str(needed_by)[:10], "%Y-%m-%d")
                if (tx_dt - now).days <= 1:
                    is_critical = True
            except Exception:
                pass
                
        if not is_critical:
            continue
            
        # Check if there are already pending/confirmed matches
        active_matches = matches_repo.get_all(filters={"patient_id": patient["patient_id"]}, limit=100)
        has_active = any(m.get("status") in ["pending", "confirmed"] for m in active_matches)
        if has_active:
            continue
            
        # Check if we blasted recently (within 12 hours)
        recent_interactions = interactions_repo.get_all(filters={"patient_id": patient["patient_id"]}, limit=500)
        recent_blasts = [i for i in recent_interactions if i.get("message_type") == "blast"]
        if recent_blasts:
            last_blast = max(_parse_utc(i.get("timestamp")) or datetime.min for i in recent_blasts)
            if (now - last_blast).total_seconds() < 12 * 3600:
                continue
                
        # Trigger Blast!
        logger.warning("🚨 Triggering Emergency Blast for Patient %s", patient["patient_id"])
        top_matches = find_top_donors(patient["patient_id"], max_distance_km=50.0, top_n=20)
        
        blast_msg = (
            "🚨 [URGENT BLOODBRIDGE BLAST] 🚨\n"
            f"Patient {_mask_name(patient.get('name'))} ({patient.get('blood_group')}) urgently needs blood at "
            f"{patient.get('hospital', 'a nearby hospital')} TODAY.\n\n"
            "We are contacting multiple donors simultaneously. First to reply YES gets the match!"
        )
        
        sent = 0
        for match in top_matches:
            donor = donors_repo.get_by_id("donor_id", match.donor_id)
            if not _donor_can_receive_outreach(donor):
                continue
                
            # Create a pending match for them
            matches_repo.put({
                "match_id": f"M-{new_id()}",
                "patient_id": patient["patient_id"],
                "donor_id": donor["donor_id"],
                "match_score": match.match_score,
                "status": "pending",
                "created_at": now_iso()
            })
                
            send_sms(donor["phone"], blast_msg)
            interactions_repo.put({
                "interaction_id": f"B-{new_id()}",
                "donor_id": donor["donor_id"],
                "patient_id": patient["patient_id"],
                "message": blast_msg,
                "language": "English",
                "message_type": "blast",
                "channel": "SMS",
                "response_status": "sent",
                "timestamp": now_iso(),
            })
            sent += 1
            
        if sent > 0:
            blasts += 1
            
    return {"blasts_triggered": blasts}

# ──────────────────────────────────────────────────────────────────────────────


def send_pending_reminders() -> Dict:
    """Send one consolidated polite reminder before a pending match can expire."""
    from routers.settings_router import get_settings
    now = datetime.utcnow()
    dynamic_settings = get_settings()
    reminder_cutoff = now - timedelta(hours=dynamic_settings["donor_reminder_after_hours"])
    pending_matches = matches_repo.get_all(filters={"status": "pending"}, limit=1000)

    donor_matches: Dict[str, List[Dict]] = {}
    for match in pending_matches:
        created_at = _parse_utc(match.get("created_at"))
        if not created_at or created_at > reminder_cutoff:
            continue
        if _has_interaction(match["donor_id"], match["patient_id"], "reminder"):
            continue

        patient = patients_repo.get_by_id("patient_id", match["patient_id"])
        donor = donors_repo.get_by_id("donor_id", match["donor_id"])
        if not patient or not _donor_can_receive_outreach(donor):
            continue

        donor_matches.setdefault(match["donor_id"], []).append(_match_detail_from_records(patient, match))

    sent = 0
    queued = 0
    for donor_id, matches in donor_matches.items():
        donor = donors_repo.get_by_id("donor_id", donor_id)
        if not donor or not donor.get("phone"):
            continue

        message_body = _build_consolidated_message(donor, matches, reminder=True)
        is_critical = any(_is_critical_patient_match(match) for match in matches)
        result = _send_or_queue_donor_message(
            donor=donor,
            matches=matches,
            message_body=message_body,
            message_type="reminder",
            force_send=is_critical,
        )
        sent += 1 if result["status"] == "sent" else 0
        queued += 1 if result["status"] == "queued" else 0

    return {"donors_reminded": len(donor_matches), "sent": sent, "queued": queued}


def escalate_expired_matches() -> Dict:
    """
    Escalate pending matches after the configured timeout, but only after a
    reminder has been attempted. Declined/expired donors are excluded by the
    matching service when it creates the next donor set.
    """
    from routers.settings_router import get_settings
    logger.info("Checking for expired pending matches...")
    now = datetime.utcnow()
    dynamic_settings = get_settings()
    limit_time = now - timedelta(hours=dynamic_settings["donor_escalation_after_hours"])

    pending_matches = matches_repo.get_all(filters={"status": "pending"}, limit=1000)
    escalations_triggered = 0
    details = []

    for match in pending_matches:
        created_at = _parse_utc(match.get("created_at"))
        if not created_at or created_at > limit_time:
            continue

        if not _has_sent_interaction(match["donor_id"], match["patient_id"], "reminder"):
            continue

        try:
            matches_repo.update("match_id", match["match_id"], {
                "status": "declined",
                "notes": "Escalated: No response from donor after reminder",
            })

            interactions_repo.put({
                "interaction_id": f"I-{new_id()}",
                "donor_id": match["donor_id"],
                "patient_id": match["patient_id"],
                "message": "System match expired after reminder",
                "language": "English",
                "message_type": "escalation",
                "channel": "System",
                "response": "No Response",
                "response_status": "expired",
                "timestamp": now_iso(),
            })

            from services.automation_service import request_blood_for_patient
            request_blood_for_patient(match["patient_id"], top_n=1)

            escalations_triggered += 1
            details.append({
                "patient_id": match["patient_id"],
                "expired_donor_id": match["donor_id"],
                "status": "escalated",
            })
        except Exception as exc:
            logger.error("Error escalating match %s: %s", match.get("match_id"), exc)

    return {"escalations_triggered": escalations_triggered, "details": details}


def send_daily_coordinator_digest() -> Dict:
    """Send the coordinator one daily SMS status summary at the morning hour."""
    from routers.settings_router import get_settings
    coordinator_phone = settings.coordinator_phone
    if not coordinator_phone:
        return {"status": "skipped", "reason": "coordinator_phone_not_configured"}

    local_now = _local_now()
    dynamic_settings = get_settings()
    if local_now.hour != dynamic_settings["notification_start_hour"]:
        return {"status": "skipped", "reason": "not_digest_hour"}

    today_key = local_now.strftime("%Y-%m-%d")
    existing = [
        i for i in interactions_repo.get_all(filters={"donor_id": "COORDINATOR"}, limit=100)
        if i.get("message_type") == "daily_digest" and str(i.get("created_at", "")).startswith(today_key)
    ]
    if existing:
        return {"status": "skipped", "reason": "already_sent_today"}

    patients = patients_repo.get_all(limit=1000)
    matches = matches_repo.get_all(limit=1000)
    critical_patients = sum(
        1 for p in patients
        if p.get("status") == "active" and p.get("urgency_level") in ("critical", "high")
    )
    pending_confirmations = sum(1 for m in matches if m.get("status") == "pending")
    successful_matches = sum(1 for m in matches if m.get("status") == "confirmed")

    message = (
        "BloodBridge AI Daily Status\n"
        f"Critical/high patients: {critical_patients}\n"
        f"Pending donor confirmations: {pending_confirmations}\n"
        f"Successful matches: {successful_matches}\n"
        f"Generated at {local_now.strftime('%I:%M %p')}"
    )

    result = send_sms(coordinator_phone, message)
    status = "sent" if result.get("status") in ("sent", "simulated") else "failed"

    interactions_repo.put({
        "interaction_id": f"DIGEST-{new_id()}",
        "donor_id": "COORDINATOR",
        "patient_id": None,
        "message": message,
        "language": "English",
        "message_type": "daily_digest",
        "channel": "SMS",
        "response_status": status,
        "timestamp": now_iso(),
    })

    return {"status": status, "critical_patients": critical_patients, "pending_confirmations": pending_confirmations}


def _patients_due_for_outreach() -> List[Dict]:
    patients = patients_repo.get_all(limit=1000)
    now = datetime.utcnow()
    due = []

    for patient in patients:
        if patient.get("status") != "active":
            continue
        next_tx = patient.get("next_transfusion_date")
        if not next_tx:
            continue
        try:
            tx_dt = datetime.strptime(str(next_tx)[:10], "%Y-%m-%d")
            days_until = (tx_dt - now).days
            urgency = patient.get("urgency_level")
            if 0 <= days_until <= 3 or urgency in ("critical", "high"):
                due.append(patient)
        except Exception:
            continue

    return due


def _send_or_queue_donor_message(
    donor: Dict,
    matches: List[Dict],
    message_body: str,
    message_type: str,
    force_send: bool = False,
) -> Dict:
    can_send_now = force_send or _within_notification_hours()
    status = "queued"
    response_status = "queued"

    if can_send_now:
        result = send_sms(donor["phone"], message_body)
        if result.get("status") in ("sent", "simulated"):
            status = "sent"
            response_status = "sent"
            donors_repo.update("donor_id", donor["donor_id"], {"last_contacted_date": now_iso()})
        else:
            status = "failed"
            response_status = result.get("error", "failed")

    for match in matches:
        interactions_repo.put({
            "interaction_id": f"MSG-{new_id()}",
            "donor_id": donor["donor_id"],
            "patient_id": match["patient_id"],
            "message": message_body,
            "language": "English",
            "message_type": message_type,
            "channel": "SMS",
            "response_status": response_status,
            "timestamp": now_iso(),
        })

    return {"status": status, "matches_count": len(matches)}


def _build_consolidated_message(donor: Dict, matches: List[Dict], reminder: bool) -> str:
    """Build an SMS-friendly plain text message (no WhatsApp markdown)."""
    donor_name = donor.get("name", "Hero")
    count = len(matches)
    title = "BloodBridge AI Reminder" if reminder else "BloodBridge AI Alert"
    intro = "This is a gentle reminder for" if reminder else "you are a compatible match for"

    msg_lines = [
        f"[{title}]",
        f"Hi {donor_name}, {intro} {count} patient(s) needing blood:",
        "",
    ]

    for idx, match in enumerate(matches, 1):
        match_line = (
            f"{idx}. Patient {_mask_name(match['patient_name'])} ({match['blood_group']}) "
            f"in {match['city']}, needed by {match['needed_by']}, "
            f"{match['distance_km']}km away [{match['urgency'].upper()}]"
        )
            
        msg_lines.append(match_line)

    msg_lines.extend([
        "",
        "Reply YES 1 (for patient 1), YES 2 (for patient 2), or NO to decline all.",
        "Thank you for saving a life.",
    ])

    return "\n".join(msg_lines)


def _build_direct_patient_request_message(donor: Dict, match: Dict) -> str:
    """Build an SMS-friendly plain text direct request message."""
    donor_name = donor.get("name", "Hero")
    distance_text = f"{match['distance_km']}km" if isinstance(match.get("distance_km"), (int, float)) else "nearby"
    
    msg_lines = [
        "[BloodBridge AI Alert]",
        f"Hi {donor_name}, a patient needs your help.",
        f"Patient: {_mask_name(match.get('patient_name', 'Patient'))}",
        f"Blood Group: {match['blood_group']}",
        f"Units needed: {match.get('units_needed', 2)}",
        f"Hospital: {match.get('hospital', match['city'])}",
        f"Needed by: {match['needed_by']}",
        f"Distance: {distance_text}",
        f"Urgency: {match['urgency'].upper()}",
    ]
        
    msg_lines.extend([
        "",
        "Reply YES to accept or NO to decline."
    ])
    return "\n".join(msg_lines)


def _match_detail(patient: Dict, match) -> Dict:
    return {
        "match_id": match.match_id,
        "patient_id": patient["patient_id"],
        "patient_name": patient.get("name", "Patient"),
        "blood_group": patient.get("blood_group", "O+"),
        "city": patient.get("city", "Nearby Hospital"),
        "needed_by": str(patient.get("next_transfusion_date") or "")[:10],
        "distance_km": match.distance_km,
        "urgency": patient.get("urgency_level", "critical"),
        "preferred_location_name": patient.get("preferred_location_name"),
        "preferred_latitude": patient.get("preferred_latitude"),
        "preferred_longitude": patient.get("preferred_longitude"),
    }


def _existing_same_group_matches(patient: Dict, patient_bg: str, top_n: int) -> List[Dict]:
    existing = matches_repo.get_all(filters={"patient_id": patient["patient_id"], "status": "pending"}, limit=100)
    same_group = []
    for match in existing:
        donor = donors_repo.get_by_id("donor_id", match["donor_id"])
        if not donor or normalize_blood_group(donor.get("blood_group")) != patient_bg:
            continue
        same_group.append({
            "match_id": match["match_id"],
            "donor_id": match["donor_id"],
            "match_score": float(match.get("match_score") or 0),
            "distance_km": None,
        })
    same_group.sort(key=lambda match: match["match_score"], reverse=True)
    return same_group[:top_n]


def _match_detail_from_request_match(patient: Dict, match: Dict) -> Dict:
    return {
        "match_id": match["match_id"],
        "patient_id": patient["patient_id"],
        "patient_name": patient.get("name", "Patient"),
        "blood_group": patient.get("blood_group", "O+"),
        "city": patient.get("city", "Nearby Hospital"),
        "hospital": patient.get("hospital", patient.get("city", "Nearby Hospital")),
        "units_needed": patient.get("units_needed", 2),
        "needed_by": str(patient.get("next_transfusion_date") or "")[:10],
        "distance_km": match.get("distance_km"),
        "urgency": patient.get("urgency_level", "critical"),
        "preferred_location_name": patient.get("preferred_location_name"),
        "preferred_latitude": patient.get("preferred_latitude"),
        "preferred_longitude": patient.get("preferred_longitude"),
    }


def _match_detail_from_records(patient: Dict, match: Dict) -> Dict:
    return {
        "match_id": match["match_id"],
        "patient_id": patient["patient_id"],
        "patient_name": patient.get("name", "Patient"),
        "blood_group": patient.get("blood_group", "O+"),
        "city": patient.get("city", "Nearby Hospital"),
        "needed_by": str(patient.get("next_transfusion_date") or "")[:10],
        "distance_km": "nearby",
        "urgency": patient.get("urgency_level", "critical"),
        "preferred_location_name": patient.get("preferred_location_name"),
        "preferred_latitude": patient.get("preferred_latitude"),
        "preferred_longitude": patient.get("preferred_longitude"),
    }


def _donor_can_receive_outreach(donor: Optional[Dict]) -> bool:
    return bool(
        donor
        and donor.get("status") == "active"
        and donor.get("eligibility_status") == "eligible"
        and donor.get("phone")
    )


def _recently_contacted(donor: Dict) -> bool:
    last_contact = donor.get("last_contacted_date")
    if not last_contact:
        return False
    last_contact_dt = _parse_utc(last_contact)
    if not last_contact_dt:
        return False
    return (datetime.utcnow() - last_contact_dt).days < 2


def _within_notification_hours() -> bool:
    from routers.settings_router import get_settings
    local_now = _local_now()
    dynamic_settings = get_settings()
    return dynamic_settings["notification_start_hour"] <= local_now.hour < dynamic_settings["notification_end_hour"]


def _local_now() -> datetime:
    try:
        return datetime.now(ZoneInfo(settings.notification_timezone))
    except Exception:
        return datetime.utcnow()


def _is_critical_patient_match(match: Dict) -> bool:
    if match.get("urgency") == "critical":
        return True
    needed_by = match.get("needed_by")
    if not needed_by:
        return False
    try:
        tx_dt = datetime.strptime(str(needed_by)[:10], "%Y-%m-%d")
        return (tx_dt - datetime.utcnow()).total_seconds() < 24 * 3600
    except Exception:
        return False


def _has_interaction(donor_id: str, patient_id: str, message_type: str) -> bool:
    interactions = interactions_repo.get_all(filters={"donor_id": donor_id, "patient_id": patient_id}, limit=100)
    return any(i.get("message_type") == message_type for i in interactions)


def _has_sent_interaction(donor_id: str, patient_id: str, message_type: str) -> bool:
    interactions = interactions_repo.get_all(filters={"donor_id": donor_id, "patient_id": patient_id}, limit=100)
    return any(
        i.get("message_type") == message_type and i.get("response_status") == "sent"
        for i in interactions
    )


def _parse_utc(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:19], "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return None


def _mask_name(name: str) -> str:
    if not name or len(name) <= 2:
        return "Patient"
    return name[0] + "*" * (len(name) - 2) + name[-1]

async def process_donor_reply(phone: str, body: str):
    """
    Process incoming WhatsApp/SMS replies from donors.
    Handles YES/NO cascading logic and WebSockets.
    """
    import re
    from database.db import donors_repo, interactions_repo, matches_repo, patients_repo, now_iso
    from websocket.live_events import broadcast_event
    from services.whatsapp_service import send_whatsapp_message

    # Normalize phone
    clean_phone = phone.replace("whatsapp:", "").strip()
    if len(clean_phone) == 10:
        clean_phone = f"+91{clean_phone}"

    # Find donor
    all_donors = donors_repo.get_all(limit=1000)
    donor = next((d for d in all_donors if d.get("phone") == clean_phone), None)
    if not donor:
        logger.warning("Reply from unknown number: %s", clean_phone)
        return

    # Find latest interaction awaiting response
    interactions = interactions_repo.get_all(filters={"donor_id": donor["donor_id"]}, limit=50)
    interactions.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    pending_interaction = next((i for i in interactions if i.get("response_status") == "sent" and i.get("patient_id")), None)

    if not pending_interaction:
        logger.info("No pending interaction found for donor %s", donor["donor_id"])
        # Send a generic fallback
        send_whatsapp_message(donor["phone"], "Thanks for messaging BloodBridge AI! We don't have any active blood requests for you right now, but we appreciate your willingness to help. Have a great day! ❤️")
        return

    patient_id = pending_interaction["patient_id"]
    match_id = pending_interaction.get("match_id") # We need to make sure match_id is stored in interaction, or look up match

    # Find active match
    matches = matches_repo.get_all(filters={"patient_id": patient_id, "donor_id": donor["donor_id"]}, limit=10)
    pending_match = next((m for m in matches if m.get("status") in ("contacted", "pending")), None)

    text = body.strip().upper()
    is_yes = bool(re.search(r'\b(YES|Y|SURE|OKAY|ACCEPT)\b', text))
    is_no = bool(re.search(r'\b(NO|N|BUSY|CANT|DECLINE)\b', text))

    patient = patients_repo.get_by_id("patient_id", patient_id)

    if is_yes:
        # Accept
        if pending_match:
            matches_repo.update("match_id", pending_match["match_id"], {"status": "confirmed"})
        interactions_repo.update("interaction_id", pending_interaction["interaction_id"], {"response_status": "accepted"})
        
        # Broadcast to UI
        await broadcast_event("donor_confirmed", "Donor Accepted!", f"{donor.get('name')} accepted the request for {patient.get('name', 'Patient')}", "success")
        
        # Reply
        send_whatsapp_message(donor["phone"], "🎉 Amazing! Thank you for accepting. The coordinator will contact you shortly to schedule the donation. You are a lifesaver!")
        
    elif is_no:
        # Decline
        if pending_match:
            matches_repo.update("match_id", pending_match["match_id"], {"status": "declined"})
        interactions_repo.update("interaction_id", pending_interaction["interaction_id"], {"response_status": "declined"})
        
        # Broadcast
        await broadcast_event("donor_declined", "Donor Declined", f"{donor.get('name')} is unable to donate right now.", "warning")
        
        # Reply
        send_whatsapp_message(donor["phone"], "No problem at all! We understand you are busy. We will reach out to the next matching donor. Have a good day! ❤️")
        
        # Cascade! Ask next donor
        logger.info("Cascading to next donor for patient %s", patient_id)
        from services.matching_service import find_top_donors
        
        # Get all previously contacted donors for this patient
        all_patient_matches = matches_repo.get_all(filters={"patient_id": patient_id}, limit=100)
        contacted_donor_ids = {m["donor_id"] for m in all_patient_matches if m.get("status") != "cancelled"}
        
        # Find 10 donors to ensure we get one not yet contacted
        new_matches = find_top_donors(patient_id, max_distance_km=200, top_n=10)
        next_donor = None
        for m in new_matches:
            if m.donor_id not in contacted_donor_ids:
                next_donor_record = donors_repo.get_by_id("donor_id", m.donor_id)
                if _donor_can_receive_outreach(next_donor_record):
                    next_donor = next_donor_record
                    break
        
        if next_donor:
            # Create match
            match_doc = {
                "match_id": f"M-{new_id()}",
                "patient_id": patient_id,
                "donor_id": next_donor["donor_id"],
                "match_score": 0.85, # approx
                "status": "contacted",
                "created_at": now_iso()
            }
            matches_repo.put(match_doc)
            detail = _match_detail_from_records(patient, match_doc)
            msg_body = _build_direct_patient_request_message(next_donor, detail)
            _send_or_queue_donor_message(next_donor, [detail], msg_body, "patient_request", force_send=True)
            await broadcast_event("new_match", "Cascading to Next Donor", f"Asking {next_donor.get('name')} for help...", "info")
    else:
        # Unrecognized
        send_whatsapp_message(donor["phone"], "Sorry, I didn't understand that. Please reply YES to accept or NO to decline.")

def notify_donors_of_final_location(patient_id: str, address: str, lat: float, lon: float) -> dict:
    from database.db import patients_repo, matches_repo, donors_repo, interactions_repo, new_id, now_iso
    from services.whatsapp_service import send_whatsapp_message
    
    patient = patients_repo.get_by_id("patient_id", patient_id)
    if not patient:
        return {"status": "error", "message": "Patient not found"}
        
    matches = matches_repo.get_all(filters={"patient_id": patient_id, "status": "confirmed"})
    messages_sent = 0
    
    for match in matches:
        donor = donors_repo.get_by_id("donor_id", match["donor_id"])
        if donor and donor.get("phone"):
            donor_name = donor.get("name", "Hero")
            patient_name = patient.get("name", "Patient")
            
            msg_lines = [
                "[BloodBridge AI - Transfusion Confirmed]",
                f"Hi {donor_name}, your transfusion for {patient_name} is confirmed!",
                f"Location: {address}",
            ]
            if lat and lon:
                msg_lines.append(f"🗺️ Maps: https://maps.google.com/?q={lat},{lon}")
            msg_lines.extend([
                "",
                "Please arrive on time. Thank you for saving a life! ❤️"
            ])
            
            msg_body = "\n".join(msg_lines)
            result = send_whatsapp_message(donor["phone"], msg_body)
            
            interactions_repo.put({
                "interaction_id": f"FINAL-{new_id()}",
                "donor_id": donor["donor_id"],
                "patient_id": patient_id,
                "message": msg_body,
                "language": "English",
                "message_type": "final_location",
                "channel": "WhatsApp",
                "response_status": result.get("status", "failed"),
                "timestamp": now_iso(),
            })
            messages_sent += 1
            
    return {"status": "success", "messages_sent": messages_sent}
