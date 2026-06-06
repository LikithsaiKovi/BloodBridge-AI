import sqlite3
import os

DB_PATH = 'bloodbridge.db'

def update_donor_phones():
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found.")
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Update all donors with the provided phone number
    target_phone = '+918522831788'
    cursor.execute("UPDATE donors SET phone = ?", (target_phone,))
    updated_count = cursor.rowcount
    
    conn.commit()
    conn.close()
    
    print(f"Successfully updated {updated_count} donors with phone number {target_phone}.")

if __name__ == '__main__':
    update_donor_phones()
