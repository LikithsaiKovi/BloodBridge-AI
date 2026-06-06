import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import patients_repo
from services.matching_service import find_top_donors

print("Running matches for all patients...")
patients = patients_repo.get_all(limit=10)
count = 0
for p in patients:
    try:
        find_top_donors(p["patient_id"], max_distance_km=200, top_n=5)
        count += 1
    except Exception as e:
        print(f"Error for {p['patient_id']}: {e}")

print(f"Matched {count} patients.")
