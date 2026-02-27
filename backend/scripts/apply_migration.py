#!/usr/bin/env python3
"""
Apply a SQL migration file against the DATABASE_URL in backend/.env
Usage: python scripts/apply_migration.py ../migrations/007_add_users_table.sql
"""
import sys
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    print('Missing python-dotenv; please install dependencies (pip install python-dotenv)')
    raise

try:
    import psycopg
except Exception:
    print('Missing psycopg; ensure backend dependencies are installed')
    raise

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / '.env'

if not ENV_PATH.exists():
    print(f"ERROR: .env not found at {ENV_PATH}. Create it or ensure DATABASE_URL is set in the environment.")
    sys.exit(2)

load_dotenv(dotenv_path=ENV_PATH)
DB_URL = os.getenv('DATABASE_URL')
if not DB_URL:
    print('ERROR: DATABASE_URL not set in .env')
    sys.exit(2)

if len(sys.argv) < 2:
    print('Usage: python scripts/apply_migration.py <path/to/migration.sql>')
    sys.exit(2)

migration_file = Path(sys.argv[1])
if not migration_file.exists():
    migration_file = ROOT / sys.argv[1]
    if not migration_file.exists():
        print('Migration file not found:', sys.argv[1])
        sys.exit(2)

sql = migration_file.read_text(encoding='utf-8')

print('Connecting to database...')
print('Using DATABASE_URL from', ENV_PATH)

try:
    with psycopg.connect(DB_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            print('Applying migration:', migration_file)
            cur.execute(sql)
        conn.commit()
    print('Migration applied successfully.')
except Exception as e:
    print('Migration failed:', e)
    sys.exit(1)
