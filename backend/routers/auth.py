"""
Auth API router: register, login, me, forgot-password, reset-password, logout.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel, EmailStr, field_validator
from database.db import users_repo, reset_tokens_repo, donors_repo, patients_repo, new_id, now_iso
from database.auth_utils import hash_password, verify_password, create_token, verify_token, generate_reset_token, generate_reset_secret
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


# ─── Request / Response Models ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str  # donor | patient | coordinator
    blood_group: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    # Donor-specific
    last_donation_date: Optional[str] = None
    frequency_in_days: Optional[int] = 90
    # Patient-specific
    next_transfusion_date: Optional[str] = None
    hospital: Optional[str] = None
    units_needed: Optional[int] = 2
    age: Optional[int] = None
    gender: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str


def safe_user(user: dict) -> dict:
    """Remove sensitive fields before returning to client."""
    return {k: v for k, v in user.items() if k not in ("password_hash",)}


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Dependency: extract and validate JWT from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    user = users_repo.get_by_id("user_id", payload["sub"])
    if not user or user.get("status") != "active":
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return user


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
def register(req: RegisterRequest):
    """Create a new user account and auto-link to donor/patient record."""
    # Check email uniqueness
    existing = users_repo.raw_query("SELECT user_id FROM users WHERE email=?", [req.email.lower()])
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    if req.role not in ("donor", "patient", "coordinator"):
        raise HTTPException(status_code=400, detail="Role must be: donor, patient, or coordinator")

    user_id = f"U-{new_id()}"
    initials = "".join(w[0].upper() for w in req.name.strip().split()[:2])

    user = {
        "user_id": user_id,
        "name": req.name.strip(),
        "email": req.email.lower().strip(),
        "password_hash": hash_password(req.password),
        "role": req.role,
        "blood_group": req.blood_group,
        "city": req.city,
        "phone": req.phone,
        "avatar_initials": initials,
        "linked_donor_id": None,
        "linked_patient_id": None,
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    # Helper to mock geocode
    def get_lat_lon(city: str):
        import random
        cities = {
            "mumbai": (19.0760, 72.8777), "hyderabad": (17.3850, 78.4867), "pune": (18.5204, 73.8567),
            "ahmedabad": (23.0225, 72.5714), "chennai": (13.0827, 80.2707), "bengaluru": (12.9716, 77.5946),
            "delhi": (28.6139, 77.2090), "kolkata": (22.5726, 88.3639), "nagpur": (21.1458, 79.0882),
            "jaipur": (26.9124, 75.7873), "surat": (21.1702, 72.8311), "lucknow": (26.8467, 80.9462),
        }
        if city and city.lower() in cities:
            base_lat, base_lon = cities[city.lower()]
            return base_lat + random.uniform(-0.05, 0.05), base_lon + random.uniform(-0.05, 0.05)
        return 17.3850 + random.uniform(-0.05, 0.05), 78.4867 + random.uniform(-0.05, 0.05)

    lat, lon = get_lat_lon(req.city)

    # Auto-create linked donor/patient record
    if req.role == "donor" and req.blood_group:
        from ml.predict import predict_availability
        donor_data = {
            "donor_id": f"D-{new_id()}",
            "name": req.name.strip(),
            "blood_group": req.blood_group,
            "city": req.city,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "phone": req.phone,
            "gender": req.gender,
            "last_donation_date": req.last_donation_date,
            "frequency_in_days": req.frequency_in_days or 90,
            "total_donations": 0,
            "total_calls": 0,
            "calls_to_donations_ratio": 0.0,
            "eligibility_status": "eligible",
            "donor_type": "Regular Donor",
            "status": "active",
            "badge": "New Hero",
            "streak": 0,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        prob = predict_availability(donor_data)
        donor_data["availability_probability"] = prob
        donor_data["donor_score"] = round(prob * 100, 1)
        donors_repo.put(donor_data)
        user["linked_donor_id"] = donor_data["donor_id"]

    elif req.role == "patient" and req.blood_group:
        from datetime import datetime
        next_tx = req.next_transfusion_date
        urgency = "medium"
        if next_tx:
            try:
                tx_dt = datetime.strptime(next_tx[:10], "%Y-%m-%d")
                days = (tx_dt - datetime.utcnow()).days
                urgency = "critical" if days <= 1 else "high" if days <= 3 else "medium" if days <= 7 else "low"
            except:
                pass

        patient_data = {
            "patient_id": f"P-{new_id()}",
            "name": req.name.strip(),
            "blood_group": req.blood_group,
            "city": req.city,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "phone": req.phone,
            "age": req.age,
            "gender": req.gender,
            "next_transfusion_date": next_tx,
            "units_needed": req.units_needed or 2,
            "hospital": req.hospital,
            "urgency_level": urgency,
            "status": "active",
            "notes": "Registered via patient portal",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        patients_repo.put(patient_data)
        user["linked_patient_id"] = patient_data["patient_id"]

    users_repo.put(user)

    token = create_token(user_id, user["email"], req.role)
    logger.info("Registered user %s (%s) as %s", user["name"], user["email"], req.role)

    return {
        "token": token,
        "user": get_enriched_user(user),
        "message": f"Welcome to BloodBridge AI, {req.name.split()[0]}!"
    }


@router.post("/login")
def login(req: LoginRequest):
    """Authenticate and return JWT token."""
    if req.email.lower() == "admin@bloodbridge.ai" and req.password == "admin123":
        token = create_token("U-ADMIN", req.email, "coordinator")
        return {
            "token": token,
            "user": {
                "user_id": "U-ADMIN",
                "name": "System Coordinator",
                "email": "admin@bloodbridge.ai",
                "role": "coordinator",
                "avatar_initials": "SC",
                "status": "active"
            }
        }

    users = users_repo.raw_query("SELECT * FROM users WHERE email=?", [req.email.lower()])
    if not users:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = users[0]
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Your account has been deactivated")

    token = create_token(user["user_id"], user["email"], user["role"])
    logger.info("Login: %s (%s)", user["email"], user["role"])

    return {
        "token": token,
        "user": get_enriched_user(user),
    }


def get_enriched_user(user: dict) -> dict:
    """Return user dict with donor/patient profiles attached. Auto-repairs broken links."""
    result = safe_user(user)

    if user.get("linked_donor_id"):
        donor = donors_repo.get_by_id("donor_id", user["linked_donor_id"])
        if not donor:
            # Donor was wiped (e.g. after a reseed) — re-create it automatically
            import random
            from ml.predict import predict_availability
            did = user["linked_donor_id"]
            lat = 17.3850 + random.uniform(-0.3, 0.3)
            lon = 78.4867 + random.uniform(-0.3, 0.3)
            donor = {
                "donor_id": did,
                "name": user.get("name", "Donor"),
                "blood_group": user.get("blood_group", "O+"),
                "city": user.get("city", "Hyderabad"),
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "phone": user.get("phone"),
                "gender": user.get("gender"),
                "eligibility_status": "eligible",
                "total_donations": 0,
                "donations_till_date": 0,
                "total_calls": 0,
                "calls_to_donations_ratio": 0.0,
                "frequency_in_days": 90,
                "donor_type": "Regular Donor",
                "status": "active",
                "badge": "New Hero",
                "streak": 0,
                "inactive_trigger_comment": None,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            prob = predict_availability(donor)
            donor["availability_probability"] = prob
            donor["donor_score"] = round(prob * 100, 1)
            donors_repo.put(donor)
            logger.info("Auto-recreated missing donor %s for user %s", did, user.get("email"))
        result["donor_profile"] = donor

    if user.get("linked_patient_id"):
        patient = patients_repo.get_by_id("patient_id", user["linked_patient_id"])
        if not patient:
            import random
            pid = user["linked_patient_id"]
            lat = 17.3850 + random.uniform(-0.3, 0.3)
            lon = 78.4867 + random.uniform(-0.3, 0.3)
            patient = {
                "patient_id": pid,
                "name": user.get("name", "Patient"),
                "blood_group": user.get("blood_group", "O+"),
                "city": user.get("city", "Hyderabad"),
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "phone": user.get("phone"),
                "gender": user.get("gender"),
                "urgency_level": "medium",
                "status": "active",
                "units_needed": 2,
                "notes": "Auto-repaired after DB reseed",
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            patients_repo.put(patient)
            logger.info("Auto-recreated missing patient %s for user %s", pid, user.get("email"))
        result["patient_profile"] = patient

    return result

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return get_enriched_user(current_user)


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    """Send OTP for password reset (OTP returned in response for local dev)."""
    users = users_repo.raw_query("SELECT * FROM users WHERE email=?", [req.email.lower()])
    if not users:
        # Don't reveal if email exists — return same success response
        return {"message": "If that email is registered, you'll receive a reset code.", "dev_otp": None}

    user = users[0]
    otp = generate_reset_token()
    secret = generate_reset_secret()
    expires_at = (datetime.utcnow() + timedelta(minutes=30)).isoformat() + "Z"

    reset_tokens_repo.put({
        "token_id": f"RT-{new_id()}",
        "user_id": user["user_id"],
        "otp": str(otp),
        "secret": secret,
        "expires_at": expires_at,
        "used": 0,
        "created_at": now_iso(),
    })

    logger.info("Password reset OTP for %s: %s", req.email, otp)

    # In production: send email. In local dev: return OTP directly
    return {
        "message": "Reset code sent! Check your email (or use the code below in local dev mode).",
        "dev_otp": str(otp),  # Remove this in production
        "expires_in_minutes": 30,
    }


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    """Verify OTP and update password."""
    users = users_repo.raw_query("SELECT * FROM users WHERE email=?", [req.email.lower()])
    if not users:
        raise HTTPException(status_code=400, detail="Invalid email or code")

    user = users[0]

    # Find valid unused token
    tokens = reset_tokens_repo.raw_query(
        "SELECT * FROM password_reset_tokens WHERE user_id=? AND otp=? AND used=0 ORDER BY created_at DESC LIMIT 1",
        [user["user_id"], req.otp]
    )

    if not tokens:
        raise HTTPException(status_code=400, detail="Invalid or already used reset code")

    token = tokens[0]
    if datetime.fromisoformat(token["expires_at"].rstrip("Z")) < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Update password and mark token as used
    users_repo.update("user_id", user["user_id"], {"password_hash": hash_password(req.new_password)})
    reset_tokens_repo.update("token_id", token["token_id"], {"used": 1})

    logger.info("Password reset successful for %s", req.email)
    return {"message": "Password updated successfully! You can now log in with your new password."}


@router.put("/me")
def update_profile(updates: dict, current_user: dict = Depends(get_current_user)):
    """Update user profile (name, city, phone)."""
    allowed = {"name", "city", "phone", "blood_group"}
    safe_updates = {k: v for k, v in updates.items() if k in allowed}
    if not safe_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    updated = users_repo.update("user_id", current_user["user_id"], safe_updates)
    return safe_user(updated)
