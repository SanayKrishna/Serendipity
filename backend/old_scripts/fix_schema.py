"""
Quick script to add missing device_db_id column to pins table
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

# Check if column exists
cur.execute("""
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name='pins' AND column_name='device_db_id'
""")
result = cur.fetchone()

if result:
    print("✓ Column device_db_id already exists")
else:
    print("Adding device_db_id column...")
    try:
        # Add the column
        cur.execute("""
            ALTER TABLE pins 
            ADD COLUMN device_db_id INTEGER REFERENCES devices(id)
        """)
        conn.commit()
        print("✓ Column device_db_id added successfully")
    except Exception as e:
        print(f"✗ Error: {e}")
        conn.rollback()

# Create index if needed
try:
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_pins_device_created 
        ON pins(device_db_id, created_at)
    """)
    conn.commit()
    print("✓ Index created successfully")
except Exception as e:
    print(f"Note: {e}")

cur.close()
conn.close()
print("\nDatabase schema fixed!")
