"""
Fix broken donor/patient links after reseed.
For each user whose linked_donor_id/linked_patient_id no longer exists in DB,
re-create the record from the user's own data.
"""
from database.db import get_db, donors_repo, patients_repo, users_repo
from ml.predict import predict_availability
import random, hashlib, datetime

def now_iso():
    return datetime.datetime.utcnow().isoformat() + "Z"

def short_id(seed: str) -> str:
    return hashlib.md5(seed.encode()).hexdigest()[:8].upper()

with get_db() as conn:
    users = conn.execute("SELECT * FROM users").fetchall()
    for row in users:
        u = dict(row)
        role = u.get("role")
        email = u.get("email", "")

        if role == "donor":
            did = u.get("linked_donor_id")
            if did:
                exists = conn.execute("SELECT 1 FROM donors WHERE donor_id=?", [did]).fetchone()
                if not exists:
                    print(f"Repairing donor link for {email} -> {did}")
                    lat = 17.3850 + random.uniform(-0.3, 0.3)
                    lon = 78.4867 + random.uniform(-0.3, 0.3)
                    donor_data = {
                        "donor_id": did,
                        "name": u.get("name", "Donor"),
                        "blood_group": u.get("blood_group", "O+"),
                        "city": u.get("city", "Hyderabad"),
                        "latitude": round(lat, 6),
                        "longitude": round(lon, 6),
                        "phone": u.get("phone"),
                        "gender": u.get("gender"),
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
                    prob = predict_availability(donor_data)
                    donor_data["availability_probability"] = prob
                    donor_data["donor_score"] = round(prob * 100, 1)
                    donors_repo.put(donor_data)
                    print(f"  Created donor {did} with score {donor_data['donor_score']}")

        elif role == "patient":
            pid = u.get("linked_patient_id")
            if pid:
                exists = conn.execute("SELECT 1 FROM patients WHERE patient_id=?", [pid]).fetchone()
                if not exists:
                    print(f"Repairing patient link for {email} -> {pid}")
                    lat = 17.3850 + random.uniform(-0.3, 0.3)
                    lon = 78.4867 + random.uniform(-0.3, 0.3)
                    patient_data = {
                        "patient_id": pid,
                        "name": u.get("name", "Patient"),
                        "blood_group": u.get("blood_group", "O+"),
                        "city": u.get("city", "Hyderabad"),
                        "latitude": round(lat, 6),
                        "longitude": round(lon, 6),
                        "phone": u.get("phone"),
                        "gender": u.get("gender"),
                        "urgency_level": "medium",
                        "status": "active",
                        "units_needed": 2,
                        "notes": "Re-linked after DB reseed",
                        "created_at": now_iso(),
                        "updated_at": now_iso(),
                    }
                    patients_repo.put(patient_data)
                    print(f"  Created patient {pid}")

print("Done!")
