import sqlite3
conn = sqlite3.connect('backend/bloodbridge.db')
for m in conn.execute("SELECT match_id, donor_id FROM matches WHERE patient_id='P-9ACEF9FD'").fetchall():
    print(m[0], m[1])
