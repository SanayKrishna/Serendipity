"""
Database Initialization Script for Serendipity SNS

This script:
1. Connects to the system 'postgres' database
2. Checks if 'serendipity_db' exists, creates it if not
3. Connects to 'serendipity_db' and enables PostGIS extension
4. Initializes all SQLAlchemy tables
"""
import sys
import psycopg
from psycopg import sql

# Add parent directory to path for imports
sys.path.insert(0, str(__file__).replace('\\app\\init_db.py', '').replace('/app/init_db.py', ''))

from app.config import settings
from app.database import engine, Base
from app.models import Pin, Device, PinInteraction  # noqa: F401 - Import ALL models to register them with Base


def connect_to_system_db():
    """
    Step 1: Connect to the system 'postgres' database.
    Returns a connection object.
    """
    print("=" * 60)
    print("STEP 1: Connecting to system 'postgres' database...")
    print("=" * 60)
    
    try:
        conn = psycopg.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            dbname="postgres",
            autocommit=True
        )
        print(f"✓ Connected to PostgreSQL at {settings.DB_HOST}:{settings.DB_PORT}")
        return conn
    except psycopg.Error as e:
        print(f"✗ Failed to connect to PostgreSQL: {e}")
        raise


def check_and_create_database(conn):
    """
    Step 2: Check if 'serendipity_db' exists. Create it if not.
    """
    print("\n" + "=" * 60)
    print("STEP 2: Checking if database exists...")
    print("=" * 60)
    
    cursor = conn.cursor()
    db_name = settings.DB_NAME
    
    # Check if database exists
    cursor.execute(
        "SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s",
        (db_name,)
    )
    exists = cursor.fetchone()
    
    if exists:
        print(f"✓ Database '{db_name}' already exists")
    else:
        print(f"→ Database '{db_name}' does not exist. Creating...")
        try:
            # Use sql.Identifier to safely quote the database name
            cursor.execute(
                sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name))
            )
            print(f"✓ Database '{db_name}' created successfully")
        except psycopg.Error as e:
            print(f"✗ Failed to create database: {e}")
            raise
    
    cursor.close()


def enable_postgis_extension():
    """
    Step 3: Connect to 'serendipity_db' and enable PostGIS extension.
    """
    print("\n" + "=" * 60)
    print("STEP 3: Enabling PostGIS extension...")
    print("=" * 60)
    
    try:
        conn = psycopg.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            dbname=settings.DB_NAME,
            autocommit=True
        )
        cursor = conn.cursor()
        
        # Enable PostGIS extension
        cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        print("✓ PostGIS extension enabled")
        
        # Verify PostGIS is working
        cursor.execute("SELECT PostGIS_Version();")
        version = cursor.fetchone()[0]
        print(f"✓ PostGIS version: {version}")
        
        cursor.close()
        conn.close()
    except psycopg.Error as e:
        print(f"✗ Failed to enable PostGIS: {e}")
        print("\n⚠ IMPORTANT: Make sure PostGIS is installed on your system!")
        print("  For Windows, download from: https://postgis.net/windows_downloads/")
        raise


def initialize_tables():
    """
    Step 4: Initialize SQLAlchemy tables.
    """
    print("\n" + "=" * 60)
    print("STEP 4: Initializing SQLAlchemy tables...")
    print("=" * 60)
    
    try:
        # Create all tables defined in models
        Base.metadata.create_all(bind=engine)
        print("✓ All tables created successfully")
        
        # List created tables
        print("\n→ Tables in database:")
        for table_name in Base.metadata.tables.keys():
            print(f"  • {table_name}")
            
    except Exception as e:
        print(f"✗ Failed to create tables: {e}")
        raise


def main():
    """
    Main initialization function.
    Runs all setup steps in order.
    """
    print("\n")
    print("╔" + "═" * 58 + "╗")
    print("║" + " SERENDIPITY SNS - DATABASE INITIALIZATION ".center(58) + "║")
    print("╚" + "═" * 58 + "╝")
    print()
    
    try:
        # Step 1: Connect to system database
        conn = connect_to_system_db()
        
        # Step 2: Check and create application database
        check_and_create_database(conn)
        conn.close()
        
        # Step 3: Enable PostGIS extension
        enable_postgis_extension()
        
        # Step 4: Initialize tables
        initialize_tables()
        
        print("\n" + "=" * 60)
        print("✓ DATABASE INITIALIZATION COMPLETE!")
        print("=" * 60)
        print("\nYou can now start the FastAPI server with:")
        print("  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000")
        print()
        
    except Exception as e:
        print(f"\n✗ INITIALIZATION FAILED: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
