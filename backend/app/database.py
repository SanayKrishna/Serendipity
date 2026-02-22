"""
Database connection and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# Create SQLAlchemy engine (using psycopg3 driver)
# Pool settings tuned for Railway free tier + Supabase free tier (max 25 connections):
#   pool_size=3   -> base persistent connections (one per worker thread)
#   max_overflow=4 -> burst capacity under load (total max = 7 per process)
#   pool_pre_ping   -> drop stale connections silently (especially after cold-start)
#   pool_recycle=300 -> refresh connections every 5 min to avoid Supabase idle timeout
engine = create_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+psycopg://"), 
    echo=False,  # Disabled in production to reduce log noise
    pool_size=3,
    max_overflow=4,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=30,  # Raise clearly if no connection available within 30s
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """
    Dependency that provides a database session.
    Ensures proper cleanup after each request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
