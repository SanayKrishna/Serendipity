"""
Configuration module - loads secrets from .env file
"""
import os
from typing import List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings:
    # Database settings
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "serendipity_db")
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # API Settings
    API_VERSION: str = "v1"
    MAX_CONTENT_LENGTH: int = int(os.getenv("MAX_CONTENT_LENGTH", "500"))
    
    # Discovery settings
    DISCOVERY_RADIUS_METERS: int = int(os.getenv("DISCOVERY_RADIUS", "50"))
    PIN_DEFAULT_EXPIRY_HOURS: int = int(os.getenv("PIN_EXPIRY_HOURS", "87600"))  # 10 years (permanent landmark model)
    LIKE_EXTENSION_HOURS: int = int(os.getenv("LIKE_EXTENSION_HOURS", "24"))
    PASSIVE_DISCOVERY_RADIUS_METERS: int = int(os.getenv("PASSIVE_DISCOVERY_RADIUS", "15"))  # Ghost entry threshold
    COMMUNITY_NOTIFICATION_RADIUS_KM: int = int(os.getenv("COMMUNITY_NOTIFICATION_RADIUS", "10"))  # Geofence radius
    
    # Rate limiting
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    
    # CORS settings - restrict in production!
    @property
    def CORS_ORIGINS(self) -> List[str]:
        if self.ENVIRONMENT == "production":
            # In production, only allow specific origins
            origins = os.getenv("CORS_ORIGINS", "")
            return [o.strip() for o in origins.split(",") if o.strip()]
        # In development, allow all
        return ["*"]
    
    @property
    def DATABASE_URL(self) -> str:
        """SQLAlchemy database URL for the application database"""
        # Allow a single DATABASE_URL to be provided (convenient for deployments)
        db_url = os.getenv("DATABASE_URL")
        if db_url:
            return db_url
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    
    @property
    def SYSTEM_DATABASE_URL(self) -> str:
        """PostgreSQL system database URL for initial setup"""
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/postgres"

settings = Settings()
