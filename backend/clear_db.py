import sqlite3
import os
from backend.config import settings

def clear_audit_logs():
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        print(f"[ASIPE Cleanup] Database file '{db_path}' does not exist.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Purge all audit log entries
    cursor.execute("DELETE FROM audit_logs;")
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()

    print(f"[ASIPE Cleanup] Successfully purged {deleted_count} records from 'audit_logs' table in {db_path}.")

if __name__ == "__main__":
    clear_audit_logs()
