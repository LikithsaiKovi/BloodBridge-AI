import sqlite3
conn = sqlite3.connect('backend/bloodbridge.db')
conn.execute("DELETE FROM matches WHERE match_id NOT LIKE 'M-P-%'")
conn.commit()
print('Deleted legacy random-ID matches!')
