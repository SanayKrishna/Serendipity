"""
Pydantic Schemas for API Request/Response validation
"""
from datetime import datetime
from typing import List
from pydantic import BaseModel, Field


# ============================================
# PIN SCHEMAS
# ============================================

class PinCreate(BaseModel):
    """Schema for creating a new pin"""
    content: str = Field(..., min_length=1, max_length=500, description="Message content")
    lat: float = Field(..., ge=-90, le=90, description="Latitude (-90 to 90)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (-180 to 180)")
    is_community: bool = Field(False, description="Community pin (10km radius) vs regular pin (50m)")
    duration_hours: int = Field(24, ge=1, le=168, description="How many hours until pin self-destructs (1–168)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "content": "I found a beautiful sunset spot here!",
                "lat": 35.6762,
                "lon": 139.6503
            }
        }


class PinResponse(BaseModel):
    """Schema for pin response"""
    id: int
    content: str
    created_at: datetime
    expires_at: datetime
    likes: int
    dislikes: int
    reports: int
    passes_by: int = 0
    is_active: bool
    is_suppressed: bool
    is_community: bool
    
    class Config:
        from_attributes = True


class PinDiscovery(BaseModel):
    """Schema for discovered pin (with coordinates for absolute positioning)"""
    id: int
    content: str
    latitude: float = Field(..., description="Pin latitude")
    longitude: float = Field(..., description="Pin longitude")
    distance_meters: float = Field(..., description="Distance from user in meters")
    likes: int
    dislikes: int
    reports: int
    passes_by: int = 0
    is_suppressed: bool
    is_community: bool
    is_own_pin: bool = Field(default=False, description="Whether this pin belongs to the current user")
    expires_at: datetime
    
    class Config:
        from_attributes = True


class DiscoverResponse(BaseModel):
    """Response schema for discover endpoint"""
    pins: List[PinDiscovery]
    count: int
    message: str


class UserStatsResponse(BaseModel):
    """Response schema for user statistics"""
    liked_count: int = Field(0, description="Number of pins the user liked")
    disliked_count: int = Field(0, description="Number of pins the user disliked")
    pins_created: int = Field(0, description="Number of pins the user created")
    pins_discovered: int = Field(0, description="Total unique pins discovered")
    communities_created: int = Field(0, description="Number of community pins the user created")
    message: str = "User stats retrieved"


class PinLikeResponse(BaseModel):
    """Response schema for like/dislike/report actions"""
    id: int
    likes: int
    dislikes: int
    reports: int
    is_suppressed: bool
    expires_at: datetime
    extended: bool = Field(..., description="Whether expiry was extended")
    message: str


# ============================================
# LOCATION SCHEMAS
# ============================================

class LocationQuery(BaseModel):
    """Schema for location-based queries"""
    lat: float = Field(..., ge=-90, le=90, description="Latitude (-90 to 90)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (-180 to 180)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "lat": 35.6762,
                "lon": 139.6503
            }
        }


# ============================================
# GENERAL SCHEMAS
# ============================================

class MessageResponse(BaseModel):
    """Generic message response"""
    message: str
    success: bool = True


class CleanupResponse(BaseModel):
    """Response for cleanup operations"""
    deleted_count: int = Field(..., description="Number of pins cleaned up")
    message: str
    success: bool = True


class PinStatsResponse(BaseModel):
    """Response for per-pin stats sync (used by Diary screen)"""
    id: int
    likes: int
    dislikes: int
    passes_by: int
    is_active: bool
    expires_at: datetime
    expired: bool = Field(False, description="True when pin has just expired")
