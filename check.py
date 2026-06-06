import sqlite3
conn = sqlite3.connect('backend/bloodbridge.db')
matches = conn.execute('SELECT match_id, donor_id, patient_id FROM matches WHERE patient_id="P-9ACEF9FD"').fetchall()
print('Total matches for patient:', len(matches))
print('Unique match IDs for patient:', len(set(m[0] for m in matches)))
print('Unique donor IDs for patient:', len(set(m[1] for m in matches)))
