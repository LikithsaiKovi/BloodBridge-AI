import sys, sqlite3
sys.path.insert(0, '.')
from config.settings import settings

db = settings.db_path
print('DB:', db)
conn = sqlite3.connect(db)

tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    n = t[0]
    c = conn.execute(f"SELECT COUNT(*) FROM {n}").fetchone()[0]
    print(f"  {n}: {c} rows")

print()
phones = conn.execute("SELECT phone, COUNT(*) as cnt FROM donors GROUP BY phone ORDER BY cnt DESC LIMIT 5").fetchall()
print("Top donor phones:", [(p[0], p[1]) for p in phones])

statuses = conn.execute("SELECT status, COUNT(*) FROM matches GROUP BY status").fetchall()
print("Match statuses:", [(s[0], s[1]) for s in statuses])

inter = conn.execute("SELECT response_status, COUNT(*) FROM interactions GROUP BY response_status").fetchall()
print("Interaction statuses:", [(i[0], i[1]) for i in inter])

donor_elig = conn.execute("SELECT eligibility_status, COUNT(*) FROM donors GROUP BY eligibility_status").fetchall()
print("Donor eligibility:", [(d[0], d[1]) for d in donor_elig])

conn.close()
