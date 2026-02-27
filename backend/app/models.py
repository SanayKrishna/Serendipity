"""
Database Models for Serendipity SNS
"""
from datetime import datetime, timedelta
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Index, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.database import Base


class User(Base):
    """
    User Model - Email/Password authenticated users.
    
    Users can create an account with username, email, and password.
    Each user can link to a device for backwards compatibility.
    """
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(15), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    profile_icon = Column(String(50), default='explorer_01', nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"


class Device(Base):
    """
    Device Model - User identification (supports both device ID and Supabase Auth).
    
    HYBRID AUTH SUPPORT:
    - auth_type='device': Legacy random device ID (fragile)
    - auth_type='supabase': Supabase anonymous user ID (permanent, linkable to email)
    
    Each user gets a unique ID for tracking ownership and rate limiting.
    """
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    device_id = Column(String(64), unique=True, nullable=False, index=True)
    auth_type = Column(String(20), default='device', nullable=False)  # 'device' or 'supabase'
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)  # Link to authenticated user
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Rate limiting counters (reset periodically)
    pins_created_today = Column(Integer, default=0)
    last_pin_reset = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    pins = relationship("Pin", back_populates="device")
    interactions = relationship("PinInteraction", back_populates="device")
    
    def __repr__(self):
        return f"<Device(id={self.id}, device_id='{self.device_id[:8]}...')>"


class Pin(Base):
    """
    Pin Model - Represents a location-based message hidden on the map.
    Users discover pins only when within 50 meters of the location.
    """
    __tablename__ = "pins"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Device ownership (for moderation and rate limiting)
    device_db_id = Column(Integer, ForeignKey('devices.id'), nullable=True)
    device = relationship("Device", back_populates="pins")
    
    # Message content
    content = Column(Text, nullable=False)
    
    # PostGIS geometry column - stores location as POINT with WGS84 coordinate system
    # SRID 4326 = WGS84 (standard GPS coordinates)
    geom = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False, index=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    expires_at = Column(
        DateTime, 
        default=lambda: datetime.utcnow() + timedelta(hours=72),  # Default +72 hours
        nullable=False,
        index=True  # Index for cleanup queries
    )
    
    # Engagement metrics
    likes = Column(Integer, default=0, nullable=False)
    dislikes = Column(Integer, default=0, nullable=False)
    reports = Column(Integer, default=0, nullable=False)  # Global safety reports
    passes_by = Column(Integer, default=0, nullable=False)  # People who walked within 20m but never opened
    
    # Status flags
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_suppressed = Column(Boolean, default=False, nullable=False, index=True)  # Visual suppression (reports > likes * 2)
    is_community = Column(Boolean, default=False, nullable=False, index=True)  # Community pins (10km radius) vs regular pins (50m)
    
    # Relationships
    interactions = relationship("PinInteraction", back_populates="pin", cascade="all, delete-orphan")
    
    # Composite index for optimized discovery queries
    __table_args__ = (
        Index('idx_pins_active_expires', 'is_active', 'expires_at'),
        Index('idx_pins_device_created', 'device_db_id', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Pin(id={self.id}, content='{self.content[:20]}...', is_active={self.is_active})>"
    
    def to_dict(self):
        """Convert model to dictionary for API response"""
        return {
            "id": self.id,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "likes": self.likes,
            "dislikes": self.dislikes,
            "reports": self.reports,
            "is_active": self.is_active,
            "is_suppressed": self.is_suppressed,
            "is_community": self.is_community
        }


class PinInteraction(Base):
    """
    Track user interactions with pins (likes/dislikes/reports).
    Ensures one interaction per device per pin.
    """
    __tablename__ = "pin_interactions"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    device_db_id = Column(Integer, ForeignKey('devices.id'), nullable=False)
    pin_id = Column(Integer, ForeignKey('pins.id', ondelete='CASCADE'), nullable=False)
    interaction_type = Column(String(10), nullable=False)  # 'like', 'dislike', or 'report'
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    device = relationship("Device", back_populates="interactions")
    pin = relationship("Pin", back_populates="interactions")
    
    # Ensure one interaction per device per pin
    __table_args__ = (
        UniqueConstraint('device_db_id', 'pin_id', name='uq_device_pin_interaction'),
        Index('idx_interaction_device_pin', 'device_db_id', 'pin_id'),
    )
    
    def __repr__(self):
        return f"<PinInteraction(device={self.device_db_id}, pin={self.pin_id}, type='{self.interaction_type}')>"
