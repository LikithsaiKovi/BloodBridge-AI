from database.db import get_db

with get_db() as conn:
    p = conn.execute("SELECT latitude, longitude FROM patients WHERE patient_id='P-A7287517'").fetchone()
    d = conn.execute("SELECT latitude, longitude FROM donors WHERE donor_id='D-86188DDC'").fetchone()
    print("Patient:", dict(p) if p else None)
    print("Donor:", dict(d) if d else None)
