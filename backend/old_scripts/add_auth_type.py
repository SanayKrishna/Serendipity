"""
Add auth_type column to devices table for Supabase Auth Support

This migration adds support for hybrid authentication:
- auth_type='device': Legacy random device ID
- auth_type='supabase': Supabase anonymous user ID (permanent, linkable)
"""
import psycopg

conn = psycopg.connect(
    host="localhost",
    port=5432,
    user="postgres",
    password="",
    dbname="serendipity_db"
)

cur = conn.cursor()

print("=" * 50)
print("Adding auth_type column to devices table")
print("=" * 50)

# Check if column exists
cur.execute("""
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='devices' AND column_name='auth_type'
""")
result = cur.fetchone()

if result:
    print("\n✓ Column auth_type already exists")
else:
    print("\nAdding auth_type column...")
    try:
        cur.execute("""
            ALTER TABLE devices 
            ADD COLUMN auth_type VARCHAR(20) DEFAULT 'device' NOT NULL
        """)
        conn.commit()
        print("✓ Column auth_type added successfully!")
    except Exception as e:
        print(f"✗ Error: {e}")
        conn.rollback()

# Verify table structure
print("\n" + "=" * 50)
print("Current devices table structure:")
print("=" * 50)
cur.execute("""
    SELECT column_name, data_type, column_default
    FROM information_schema.columns 
    WHERE table_name='devices'
    ORDER BY ordinal_position
""")
for col in cur.fetchall():
    print(f"  {col[0]}: {col[1]} (default: {col[2]})")

cur.close()
conn.close()

print("\n✅ Database migration complete!")
