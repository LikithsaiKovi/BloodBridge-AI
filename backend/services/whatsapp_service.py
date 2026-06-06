"""
BloodBridge AI — Messaging Service
Supports SMS (default, zero setup for donors) and WhatsApp (optional upgrade).

SMS via Twilio:
  - Donors receive a plain text message on any mobile number
  - ZERO opt-in or setup required from donors
  - Just set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM in .env

WhatsApp via Twilio (optional, requires approved Business Account):
  - Set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 in .env
  - Sandbox requires donors to text "join <code>" first — NOT recommended for prod
"""
import logging
import httpx
from typing import Dict, Any
from config.settings import settings

logger = logging.getLogger(__name__)

TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"

# ─── Internal Helpers ──────────────────────────────────────────────────────────

def _is_twilio_configured() -> bool:
    sid = (settings.twilio_account_sid or "").strip()
    token = (settings.twilio_auth_token or "").strip()
    return (
        sid.startswith("AC") and sid != "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" and
        len(token) > 10 and token != "your_auth_token_here"
    )


def _normalize_phone(phone: str, prefix: str = "") -> str:
    """Normalize a phone number to E.164 format (+91XXXXXXXXXX)."""
    p = phone.strip().lstrip("0")
    # Strip any existing channel prefix (whatsapp:)
    if p.startswith("whatsapp:"):
        p = p[len("whatsapp:"):]
    # Add country code if missing
    if not p.startswith("+"):
        if len(p) == 10:
            p = f"+91{p}"
        elif len(p) == 12 and p.startswith("91"):
            p = f"+{p}"
        else:
            p = f"+{p}"
    if prefix:
        return f"{prefix}{p}"
    return p


def _post_to_twilio(from_: str, to: str, body: str) -> Dict[str, Any]:
    """Internal helper to call Twilio Messages API."""
    sid = (settings.twilio_account_sid or "").strip()
    token = (settings.twilio_auth_token or "").strip()
    from_ = from_.strip()
    url = TWILIO_MESSAGES_URL.format(sid=sid)

    try:
        with httpx.Client() as client:
            response = client.post(
                url,
                data={"From": from_, "To": to, "Body": body},
                auth=(sid, token),
                timeout=10.0,
            )
        res = response.json()
        if response.status_code >= 400:
            logger.error("Twilio error %d: %s", response.status_code, res.get("message"))
            return {"status": "failed", "error": res.get("message", "Unknown error"), "code": res.get("code")}
        logger.info("✅ Message sent. SID: %s", res.get("sid"))
        return {"status": "sent", "message_sid": res.get("sid")}
    except Exception as e:
        logger.error("Twilio request failed: %s", e)
        return {"status": "failed", "error": str(e)}


# ─── Primary: SMS (Recommended — Zero donor setup) ────────────────────────────

def send_sms(to_phone: str, body: str) -> Dict[str, Any]:
    """
    Send a plain SMS via Twilio.
    REQUIRES: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM in .env
    NO opt-in needed from donors — message arrives as a standard text message.
    """
    to = _normalize_phone(to_phone)
    from_sms = (settings.twilio_sms_from or "").strip()

    # Automatically use WhatsApp if configured
    if settings.twilio_whatsapp_from:
        return send_whatsapp(to_phone, body)

    if not _is_twilio_configured() or not from_sms or from_sms == "+10000000000":
        logger.info("📱 [SIMULATED SMS] To: %s\n%s", to, body)
        return {"status": "simulated", "channel": "sms", "to": to, "body": body}

    # Remove any WhatsApp markdown formatting for plain SMS
    sms_body = (
        body.replace("*", "")   # Bold
            .replace("_", "")   # Italic
    )

    logger.info("Sending SMS to %s...", to)
    result = _post_to_twilio(from_sms, to, sms_body)
    result["channel"] = "sms"
    result["to"] = to
    return result


# ─── Optional: WhatsApp (Requires approved Business API, NOT sandbox) ─────────

def send_whatsapp(to_phone: str, body: str) -> Dict[str, Any]:
    """
    Send a WhatsApp message via Twilio Business API.
    REQUIRES: Approved WhatsApp Business sender (NOT sandbox).
    Set TWILIO_WHATSAPP_FROM=whatsapp:+<your_approved_number> in .env.
    """
    to = _normalize_phone(to_phone, prefix="whatsapp:")
    from_wa = settings.twilio_whatsapp_from or ""
    if from_wa and not from_wa.startswith("whatsapp:"):
        from_wa = f"whatsapp:{from_wa}"

    if not _is_twilio_configured() or not from_wa:
        logger.info("💬 [SIMULATED WHATSAPP] To: %s\n%s", to, body)
        return {"status": "simulated", "channel": "whatsapp", "to": to, "body": body}

    logger.info("Sending WhatsApp to %s...", to)
    result = _post_to_twilio(from_wa, to, body)
    result["channel"] = "whatsapp"
    result["to"] = to
    return result


# ─── Auto-Channel: Smart fallback ─────────────────────────────────────────────

def send_message(to_phone: str, body: str, prefer_whatsapp: bool = False) -> Dict[str, Any]:
    """
    Smart sender: defaults to SMS (no donor setup needed).
    Set prefer_whatsapp=True only when using approved WhatsApp Business API.
    """
    if prefer_whatsapp and settings.twilio_whatsapp_from:
        return send_whatsapp(to_phone, body)
    return send_sms(to_phone, body)


# Backwards-compatible alias used by automation_service.py
send_whatsapp_message = send_sms
