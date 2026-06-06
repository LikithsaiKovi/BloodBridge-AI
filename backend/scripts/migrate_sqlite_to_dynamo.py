import sys
import os
import sqlite3
import json

# Add backend dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import settings
from database.dynamo_db import init_dynamodb, get_dynamodb_resource, TABLE_PKS, _float_to_decimal

def get_sqlite_rows(table_name):
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        rows = cursor.execute(f"SELECT * FROM {table_name}").fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Skipping {table_name}: {e}")
        return []
    finally:
        conn.close()

def migrate_table(table_name, pk_name, dynamodb):
    table = dynamodb.Table(table_name)
    rows = get_sqlite_rows(table_name)
    if not rows:
        print(f"No data to migrate for {table_name}.")
        return

    print(f"Migrating {len(rows)} items to DynamoDB table {table_name}...")
    
    with table.batch_writer() as batch:
        for i, row in enumerate(rows):
            try:
                item = _float_to_decimal(row)
                batch.put_item(Item=item)
                if (i + 1) % 50 == 0:
                    print(f"  Migrated {i + 1}/{len(rows)}...")
            except Exception as e:
                print(f"  Error migrating item {row.get(pk_name)}: {e}")
                
    print(f"Successfully migrated {table_name}!\n")

def main():
    print("--- SQLite to DynamoDB Migration Script ---")
    print(f"Reading from: {settings.db_path}")
    print(f"Writing to: AWS DynamoDB ({settings.aws_region})")
    
    # 1. Ensure tables exist in DynamoDB
    print("\nInitializing DynamoDB tables...")
    init_dynamodb()
    
    dynamodb = get_dynamodb_resource()
    
    # 2. Migrate each table
    print("\nStarting migration...")
    for table_name, pk_name in TABLE_PKS.items():
        migrate_table(table_name, pk_name, dynamodb)
        
    print("Migration complete! You can now set USE_DYNAMODB=True in your .env file.")

if __name__ == "__main__":
    main()
