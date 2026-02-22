"""
Add GiST Spatial Index for PostGIS Performance

The Problem: ST_DWithin queries get slower as pins increase.
The Fix: Add a proper GiST spatial index on the geometry column.

This script is idempotent - safe to run multiple times.
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
print("Adding GiST Spatial Index for PostGIS Performance")
print("=" * 50)

# Check existing indexes
cur.execute("""
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'pins' AND indexdef LIKE '%gist%'
""")
existing = cur.fetchall()

if existing:
    print("\n✓ GiST spatial index already exists:")
    for idx in existing:
        print(f"  - {idx[0]}")
else:
    print("\nCreating GiST spatial index on pins.geom...")
    try:
        # Create GiST index for spatial queries (ST_DWithin, ST_Distance)
        cur.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pins_geom_gist 
            ON pins USING GIST (geom)
        """)
        conn.commit()
        print("✓ GiST spatial index created successfully!")
    except Exception as e:
        print(f"Note: {e}")
        conn.rollback()
        
        # Try without CONCURRENTLY (may lock table briefly)
        try:
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_pins_geom_gist 
                ON pins USING GIST (geom)
            """)
            conn.commit()
            print("✓ GiST spatial index created (non-concurrent)!")
        except Exception as e2:
            print(f"✗ Error: {e2}")

# Also add geography cast index for better ST_DWithin performance
print("\nAdding geography index for ST_DWithin optimization...")
try:
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_pins_geom_geography 
        ON pins USING GIST ((geom::geography))
    """)
    conn.commit()
    print("✓ Geography index created successfully!")
except Exception as e:
    print(f"Note: Geography index may already exist or not needed: {e}")
    conn.rollback()

# Verify indexes
print("\n" + "=" * 50)
print("Current indexes on pins table:")
print("=" * 50)
cur.execute("""
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'pins'
    ORDER BY indexname
""")
for idx in cur.fetchall():
    print(f"  {idx[0]}")

cur.close()
conn.close()

print("\n✅ Spatial indexing complete! ST_DWithin queries will now be fast.")
