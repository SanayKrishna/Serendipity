"""
Run database migration: Add is_community column to pins table
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine

def run_migration():
    """Execute migration SQL"""
    migration_file = Path(__file__).parent.parent / 'migrations' / '004_add_community_pins.sql'
    
    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        return False
    
    # Read migration SQL
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql = f.read()
    
    print(f"📄 Running migration: {migration_file.name}")
    print(f"SQL:\n{sql}\n")
    
    try:
        with engine.begin() as conn:
            # Execute migration
            conn.execute(text(sql))
            print("✅ Migration completed successfully!")
            return True
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Starting database migration...")
    success = run_migration()
    sys.exit(0 if success else 1)
