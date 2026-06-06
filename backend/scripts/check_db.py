import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config.settings import settings
import sqlite3

print('DB path:', settings.db_path)
conn = sqlite3.connect(settings.db_path)
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print('Tables:', [t[0] for t in tables])
for t in tables:
    count = conn.execute(f"SELECT COUNT(*) FROM {t[0]}").fetchone()[0]
    print(f"  {t[0]}: {count} rows")

# Check donor phones
donors = conn.execute("SELECT name, phone, eligibility_status FROM donors LIMIT 5").fetchall()
print('\nSample donors:', donors)

# Check match statuses
statuses = conn.execute("SELECT status, COUNT(*) FROM matches GROUP BY status").fetchall()
print('Match statuses:', statuses)

# Check analytics table if exists
conn.close()
