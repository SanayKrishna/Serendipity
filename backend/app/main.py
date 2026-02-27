"""
Serendipity SNS - FastAPI Backend
Location-based social network where messages are discovered by proximity.

Features:
- Rate limiting to prevent spam
- Content filtering for inappropriate content
- Device-based user tracking
- Structured logging
- Duplicate pin prevention
- Expired pin cleanup
"""
from datetime import datetime, timedelta
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Depends, HTTPException, Query, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from sqlalchemy.exc import IntegrityError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import os
import hashlib
import unicodedata
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from app.database import get_db
from app.utils.email import send_welcome_email
from app.models import Pin, Device, PinInteraction, User
from app.schemas import (
    PinCreate, 
    PinResponse, 
    PinDiscovery, 
    DiscoverResponse, 
    PinLikeResponse,
    MessageResponse,
    CleanupResponse,
    UserStatsResponse,
    PinStatsResponse,
    UsernameCheckRequest,
    UsernameCheckResponse,
    SignUpRequest,
    LoginRequest,
    AuthResponse,
)
from app.config import settings
from app.utils.content_filter import validate_content
from app.utils.rate_limiter import limiter, RATE_LIMITS
from app.utils.logging_middleware import RequestLoggingMiddleware, log_event, log_error

# Password hashing — use bcrypt directly (passlib 1.7.4 is broken with bcrypt 4.x)
import bcrypt as _bcrypt
import secrets

# ============================================
# SENTRY ERROR MONITORING (no-op if DSN not set)
# ============================================
_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        # Capture 10% of transactions for performance monitoring (free quota-friendly)
        traces_sample_rate=0.1,
        # Capture full request/response context on errors
        send_default_pii=False,
        environment=os.getenv("ENVIRONMENT", "production"),
    )
    log_event("SENTRY", "Sentry error monitoring initialised")


# ============================================
# LIFESPAN CONTEXT MANAGER
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events."""
    # Startup
    log_event("STARTUP", f"Serendipity SNS API starting in {settings.ENVIRONMENT} mode")
    
    # Create tables if they don't exist
    # Note: Tables are created via migrations in Supabase SQL Editor
    # Base.metadata.create_all(bind=engine)  # Commented out - runs synchronously and blocks async lifespan
    log_event("DATABASE", "Database tables already exist (managed via migrations)")
    
    yield
    
    # Shutdown
    log_event("SHUTDOWN", "Serendipity SNS API shutting down")


# ============================================
# APP INITIALIZATION
# ============================================

app = FastAPI(
    title="Serendipity SNS API",
    description="""
    🌟 Location-based social network where messages are discovered by proximity.
    
    ## Core Features
    - **Discover**: Find hidden messages within 50 meters of your location
    - **Pin**: Leave messages at your current location
    - **Engage**: Like/dislike pins to extend their lifespan
    
    ## The Serendipity Philosophy
    No map view. No markers. Just the joy of unexpected discovery.
    
    ## Security Features
    - Rate limiting to prevent spam
    - Content filtering for inappropriate content
    - Device-based tracking for accountability
    """,
    version="1.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add logging middleware
app.add_middleware(RequestLoggingMiddleware)

# CORS middleware - configured by environment (allow web testing from localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development (including localhost:8081 for web testing)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_or_create_device(db: Session, device_id: str, auth_type: str = 'device') -> Device:
    """
    Get existing device or create new one.
    
    HYBRID AUTH SUPPORT:
    - auth_type='device': Legacy random device ID
    - auth_type='supabase': Supabase anonymous user ID (permanent, linkable)
    """
    device = db.query(Device).filter(Device.device_id == device_id).first()
    
    if not device:
        device = Device(device_id=device_id, auth_type=auth_type)
        db.add(device)
        db.commit()
        db.refresh(device)
        log_event("DEVICE", f"New {auth_type} user registered", device_id=device_id[:8])
    else:
        # Update last seen and potentially upgrade auth_type
        device.last_seen = datetime.utcnow()
        # If upgrading from device to supabase, update the auth_type
        if device.auth_type == 'device' and auth_type == 'supabase':
            device.auth_type = 'supabase'
            log_event("DEVICE", "Upgraded to Supabase auth", device_id=device_id[:8])
        db.commit()
    
    return device


def check_device_rate_limit(db: Session, device: Device) -> bool:
    """
    Check if device has exceeded daily pin creation limit.
    Returns True if within limit, False if exceeded.
    """
    # Reset counter if it's a new day
    if device.last_pin_reset and device.last_pin_reset.date() < datetime.utcnow().date():
        device.pins_created_today = 0
        device.last_pin_reset = datetime.utcnow()
        db.commit()
    
    # Check limit (20 pins per day)
    return device.pins_created_today < 20


def check_duplicate_pin(db: Session, device: Device, lat: float, lon: float) -> bool:
    """
    Check if device has created a pin at this location recently (within 100m and 1 hour).
    Returns True if it's a duplicate, False otherwise.
    """
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    
    query = text("""
        SELECT COUNT(*) FROM pins 
        WHERE device_db_id = :device_id 
        AND created_at > :time_threshold
        AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
            100
        )
    """)
    
    result = db.execute(query, {
        "device_id": device.id,
        "time_threshold": one_hour_ago,
        "lat": lat,
        "lon": lon
    }).scalar()
    
    return result > 0


def update_suppression_status(db: Session, pin: Pin) -> bool:
    """
    Update pin suppression status based on formula: reports > likes * 2
    Returns True if suppression status changed, False otherwise.
    """
    should_suppress = pin.reports > (pin.likes * 2)
    changed = pin.is_suppressed != should_suppress
    pin.is_suppressed = should_suppress
    return changed


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/", response_model=MessageResponse, tags=["Health"])
async def root():
    """Root endpoint - API health check"""
    return MessageResponse(
        message="🌟 Serendipity SNS API is running! Visit /docs for documentation.",
        success=True
    )


@app.head("/health", tags=["Health"])
@app.get("/health", response_model=MessageResponse, tags=["Health"])
async def health_check(db: Session = Depends(get_db)):
    """Health check with database connectivity test — used by monitoring tools."""
    try:
        # Test database connection
        db.execute(text("SELECT 1"))
        return MessageResponse(
            message="API and Database are healthy",
            success=True
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {str(e)}")


@app.head("/health/fast", tags=["Health"])
@app.get("/health/fast", response_model=MessageResponse, tags=["Health"])
async def health_check_fast():
    """
    ⚡ Instant health check — no database query.
    Used by keep-warm pings, load-balancers, or CI smoke tests.
    Returns 200 as long as the process is alive.
    """
    return MessageResponse(message="API is alive", success=True)


# ============================================
# AUTHENTICATION ENDPOINTS
# ============================================

def generate_token() -> str:
    """Generate a simple session token (32 bytes hex)"""
    return secrets.token_hex(32)


def _pre_hash(password: str) -> bytes:
    """SHA-256 pre-hash so bcrypt never sees more than 64 bytes regardless of
    how long the original password is.  SHA-256 always produces a 32-byte
    digest; we encode it as a 64-char hex string (64 ASCII bytes) which is
    well under bcrypt's hard 72-byte limit."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest().encode('ascii')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash.
    Tries the current scheme (SHA-256 -> bcrypt) first, then falls back to the
    legacy scheme (raw password -> bcrypt via passlib) so accounts created
    before this change continue to work."""
    hashed_bytes = hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
    # Current scheme: SHA-256 pre-hash
    try:
        if _bcrypt.checkpw(_pre_hash(plain_password), hashed_bytes):
            return True
    except Exception:
        pass
    # Legacy scheme: raw password (handles accounts hashed with old passlib code)
    try:
        return _bcrypt.checkpw(plain_password.encode('utf-8'), hashed_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using SHA-256 + bcrypt.
    SHA-256 pre-hashing removes bcrypt's 72-byte limit so passwords of any
    length are accepted."""
    salt = _bcrypt.gensalt()
    return _bcrypt.hashpw(_pre_hash(password), salt).decode('utf-8')


@app.post("/auth/check-username", response_model=UsernameCheckResponse, tags=["Authentication"])
async def check_username(request: UsernameCheckRequest, db: Session = Depends(get_db)):
    """
    🔍 Check if a username is available.
    Used for real-time validation during sign up.
    """
    try:
        existing_user = db.query(User).filter(User.username == request.username.lower()).first()
        
        if existing_user:
            return UsernameCheckResponse(
                available=False,
                message=f"Username '{request.username}' is already taken"
            )
        
        return UsernameCheckResponse(
            available=True,
            message=f"Username '{request.username}' is available"
        )
    except Exception as e:
        log_error("USERNAME_CHECK", f"Failed to check username: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check username: {str(e)}")


@app.post("/auth/signup", response_model=AuthResponse, tags=["Authentication"])
async def signup(
    request: SignUpRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    📝 Create a new user account.
    
    - **email**: Valid email address
    - **username**: Unique username (3-15 chars, lowercase alphanumeric)
    - **password**: Secure password (min 8 characters, max 64)
    - **profile_icon**: Selected profile icon ID (default: shippo)
    """
    try:
        # Strip ALL invisible Unicode format/control characters that mobile keyboards
        # inject (zero-width spaces, word joiners, soft hyphens, etc.) PLUS edge whitespace.
        # unicodedata categories: Cf = format chars, Cc = control chars — all invisible.
        # Strip ALL invisible Unicode format/control characters that mobile
        # keyboards inject (zero-width spaces, word joiners, soft hyphens, etc.)
        password_clean = ''.join(
            ch for ch in request.password
            if unicodedata.category(ch) not in ('Cf', 'Cc')
        ).strip()

        # No length limit — SHA-256 pre-hashing inside get_password_hash()
        # means bcrypt never sees more than 64 bytes regardless of password length.

        # Check if username already exists
        existing_user = db.query(User).filter(User.username == request.username.lower()).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Check if email already exists
        existing_email = db.query(User).filter(User.email == request.email.lower()).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create new user
        password_hash = get_password_hash(password_clean)
        new_user = User(
            username=request.username.lower(),
            email=request.email.lower(),
            password_hash=password_hash,
            profile_icon=request.profile_icon,
            created_at=datetime.utcnow(),
            last_login=datetime.utcnow(),
            is_active=True
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # Generate session token
        token = generate_token()
        
        log_event("SIGNUP", f"New user created: {new_user.username}", user_id=new_user.id)

        # Fire welcome email in the background (non-blocking; safe no-op if SMTP unconfigured)
        background_tasks.add_task(
            send_welcome_email,
            to_email=new_user.email,
            username=new_user.username,
        )
        
        return AuthResponse(
            user_id=new_user.id,
            username=new_user.username,
            email=new_user.email,
            profile_icon=new_user.profile_icon,
            token=token,
            message="Account created successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        log_error("SIGNUP", f"Failed to create user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create account: {str(e)}")


@app.post("/auth/login", response_model=AuthResponse, tags=["Authentication"])
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    🔐 Login with username or email.
    
    - **identifier**: Username or email address
    - **password**: User's password
    """
    try:
        # Check if identifier is email or username
        identifier = request.identifier.lower()
        
        # Try to find user by email first (contains @)
        if '@' in identifier:
            user = db.query(User).filter(User.email == identifier).first()
        else:
            user = db.query(User).filter(User.username == identifier).first()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username/email or password")
        
        # Clean password the same way it was cleaned at signup
        login_password = ''.join(
            ch for ch in request.password
            if unicodedata.category(ch) not in ('Cf', 'Cc')
        ).strip()

        if not verify_password(login_password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid username/email or password")
        
        # Update last login
        user.last_login = datetime.utcnow()
        db.commit()
        
        # Generate session token
        token = generate_token()
        
        log_event("LOGIN", f"User logged in: {user.username}", user_id=user.id)
        
        return AuthResponse(
            user_id=user.id,
            username=user.username,
            email=user.email,
            profile_icon=user.profile_icon,
            token=token,
            message="Login successful"
        )
    except HTTPException:
        raise
    except Exception as e:
        log_error("LOGIN", f"Login failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


# ============================================
# DISCOVER ENDPOINT
# ============================================

@app.get("/discover", response_model=DiscoverResponse, tags=["Discovery"])
@limiter.limit(RATE_LIMITS['discover'])
async def discover_pins(
    request: Request,
    lat: float = Query(..., ge=-90, le=90, description="Your latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Your longitude"),
    radius: Optional[int] = Query(None, ge=10, le=2000, description="Search radius in meters (default: from config)"),
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    🔍 Discover hidden pins within 50 meters of your location.
    
    This is the core "serendipity" mechanic - you can only find messages
    by physically being near them.
    
    - **lat**: Your current latitude (GPS)
    - **lon**: Your current longitude (GPS)
    
    Returns a list of nearby pins with their distance from you.
    """
    try:
        # Get current user's device (if provided)
        current_device = None
        if x_device_id:
            auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
            current_device = db.query(Device).filter(
                Device.device_id == x_device_id,
                Device.auth_type == auth_type
            ).first()
        
        # Create a geography point from user's coordinates
        query = text("""
            SELECT 
                p.id,
                p.content,
                p.likes,
                p.dislikes,
                p.reports,
                COALESCE(p.passes_by, 0) as passes_by,
                p.is_suppressed,
                p.is_community,
                p.device_db_id,
                p.expires_at,
                ST_Y(p.geom::geometry) as latitude,
                ST_X(p.geom::geometry) as longitude,
                ST_Distance(
                    p.geom::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                ) as distance_meters
            FROM pins p
            WHERE 
                p.is_active = true
                AND p.expires_at > NOW()
                AND ST_DWithin(
                    p.geom::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    :radius
                )
            ORDER BY distance_meters ASC
            LIMIT 50
        """)
        
        result = db.execute(
            query, 
            {"lat": lat, "lon": lon, "radius": radius if radius is not None else settings.DISCOVERY_RADIUS_METERS}
        )
        # Note: passes_by column may not exist yet until migration runs – handled with getattr
        
        pins = []
        for row in result:
            is_own_pin = current_device is not None and row.device_db_id == current_device.id
            pins.append(PinDiscovery(
                id=row.id,
                content=row.content,
                latitude=round(row.latitude, 7),
                longitude=round(row.longitude, 7),
                distance_meters=round(row.distance_meters, 2),
                likes=row.likes,
                dislikes=row.dislikes,
                reports=row.reports,
                passes_by=row.passes_by if hasattr(row, 'passes_by') else 0,
                is_suppressed=row.is_suppressed,
                is_community=row.is_community,
                is_own_pin=is_own_pin,
                expires_at=row.expires_at
            ))
        
        if pins:
            message = f"✨ Found {len(pins)} hidden message(s) nearby!"
            log_event("DISCOVERY", f"User found {len(pins)} pins", lat=lat, lon=lon)
        else:
            message = "No messages discovered yet. Keep exploring!"
        
        return DiscoverResponse(
            pins=pins,
            count=len(pins),
            message=message
        )
        
    except Exception as e:
        log_error("DISCOVERY", f"Discovery failed: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Discovery failed: {str(e)}"
        )


# ============================================
# PIN CREATION ENDPOINT
# ============================================

@app.post("/pin", response_model=PinResponse, tags=["Pins"])
@limiter.limit(RATE_LIMITS['pin_create'])
async def create_pin(
    request: Request,
    pin_data: PinCreate,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    📍 Leave a hidden message at your current location.
    
    The message will be discoverable by others who come within 50 meters
    of this location. Messages expire after 72 hours by default.
    
    **Headers:**
    - X-Device-ID: Unique device/user identifier (optional but recommended)
    - X-Auth-Type: 'device' or 'supabase' (optional, defaults to 'device')
    
    **Body:**
    - **content**: Your message (max 500 characters)
    - **lat**: Location latitude
    - **lon**: Location longitude
    """
    try:
        # Validate and sanitize content
        is_valid, sanitized_content, error_msg = validate_content(pin_data.content)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Get or create device (supports both device ID and Supabase auth)
        device = None
        if x_device_id:
            auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
            device = get_or_create_device(db, x_device_id, auth_type)
            
            # Check device rate limit
            if not check_device_rate_limit(db, device):
                raise HTTPException(
                    status_code=429, 
                    detail="Daily pin limit exceeded. Try again tomorrow!"
                )
            
            # Check for duplicate pins
            if check_duplicate_pin(db, device, pin_data.lat, pin_data.lon):
                raise HTTPException(
                    status_code=400,
                    detail="You've already left a message near this location recently. Wait a bit or move to a new spot!"
                )
        
        # Create PostGIS POINT geometry
        point_wkt = f"SRID=4326;POINT({pin_data.lon} {pin_data.lat})"
        
        # Clamp duration: min 1h, max 730h (1 month)
        expiry_hours = max(1, min(pin_data.duration_hours, 730))

        # Create new pin
        new_pin = Pin(
            content=sanitized_content,
            geom=point_wkt,
            device_db_id=device.id if device else None,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=expiry_hours),
            likes=0,
            dislikes=0,
            reports=0,
            passes_by=0,
            is_active=True,
            is_suppressed=False,
            is_community=pin_data.is_community
        )
        
        db.add(new_pin)
        
        # Update device counter
        if device:
            device.pins_created_today += 1
        
        db.commit()
        db.refresh(new_pin)
        
        log_event("PIN_CREATED", "New pin created", pin_id=new_pin.id, device=x_device_id[:8] if x_device_id else "anonymous")
        
        return PinResponse(
            id=new_pin.id,
            content=new_pin.content,
            created_at=new_pin.created_at,
            expires_at=new_pin.expires_at,
            likes=new_pin.likes,
            dislikes=new_pin.dislikes,
            reports=new_pin.reports,
            passes_by=new_pin.passes_by,
            is_active=new_pin.is_active,
            is_suppressed=new_pin.is_suppressed,
            is_community=new_pin.is_community
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        log_error("PIN_CREATE", f"Failed to create pin: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create pin: {str(e)}"
        )


# ============================================
# LIKE/DISLIKE ENDPOINTS
# ============================================

@app.post("/pin/{pin_id}/like", response_model=PinLikeResponse, tags=["Engagement"])
@limiter.limit(RATE_LIMITS['like'])
async def like_pin(
    request: Request,
    pin_id: int,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    👍 Like a pin to extend its lifespan.
    
    When a pin reaches **3 likes** or **6 likes**, its expiry is extended by 24 hours.
    Each device can only like a pin once.
    
    **Headers:**
    - X-Device-ID: Unique device/user identifier (optional but enforces one-like-per-device)
    - X-Auth-Type: 'device' or 'supabase' (optional)
    
    - **pin_id**: The ID of the pin to like
    """
    try:
        pin = db.query(Pin).filter(Pin.id == pin_id, Pin.is_active).first()
        
        if not pin:
            raise HTTPException(status_code=404, detail="Pin not found or inactive")
        
        # Check if device already interacted
        if x_device_id:
            auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
            device = get_or_create_device(db, x_device_id, auth_type)
            
            existing_interaction = db.query(PinInteraction).filter(
                PinInteraction.device_db_id == device.id,
                PinInteraction.pin_id == pin_id
            ).first()
            
            if existing_interaction:
                if existing_interaction.interaction_type == 'like':
                    return PinLikeResponse(
                        id=pin.id,
                        likes=pin.likes,
                        dislikes=pin.dislikes,
                        reports=pin.reports,
                        is_suppressed=pin.is_suppressed,
                        expires_at=pin.expires_at,
                        extended=False,
                        message="You've already liked this pin"
                    )
                else:
                    # Change from dislike to like
                    existing_interaction.interaction_type = 'like'
                    pin.likes += 1
                    pin.dislikes -= 1
                    update_suppression_status(db, pin)
                    db.commit()
                    return PinLikeResponse(
                        id=pin.id,
                        likes=pin.likes,
                        dislikes=pin.dislikes,
                        reports=pin.reports,
                        is_suppressed=pin.is_suppressed,
                        expires_at=pin.expires_at,
                        extended=False,
                        message="Changed your vote to like"
                    )
            
            # Create new interaction
            interaction = PinInteraction(
                device_db_id=device.id,
                pin_id=pin_id,
                interaction_type='like'
            )
            db.add(interaction)
        
        # Increment likes
        pin.likes += 1
        extended = False
        
        # Check suppression status after like count changes
        update_suppression_status(db, pin)
        
        # ── Like-extension rule ─────────────────────────────────────────────
        # Every new like pushes the expiry forward by exactly 7 days,
        # capped at created_at + 1 year (hard limit).
        ONE_YEAR = timedelta(days=365)
        LIKE_BONUS = timedelta(days=7)
        max_expiry = pin.created_at + ONE_YEAR
        new_expiry = pin.expires_at + LIKE_BONUS
        if new_expiry > max_expiry:
            new_expiry = max_expiry
        extended = new_expiry > pin.expires_at
        if extended:
            pin.expires_at = new_expiry
            message = f"🎉 Pin liked! Lifespan extended by 7 days (now expires {pin.expires_at.strftime('%Y-%m-%d')})"
            log_event("PIN_EXTENDED", "Pin lifespan extended by like", pin_id=pin_id, likes=pin.likes, expires_at=str(pin.expires_at))
        else:
            message = f"👍 Pin liked! (already at 1-year maximum — {pin.likes} total likes)"
            log_event("PIN_LIKE", "Pin liked (at max lifespan)", pin_id=pin_id, likes=pin.likes)
        
        db.commit()
        db.refresh(pin)
        
        return PinLikeResponse(
            id=pin.id,
            likes=pin.likes,
            dislikes=pin.dislikes,
            reports=pin.reports,
            is_suppressed=pin.is_suppressed,
            expires_at=pin.expires_at,
            extended=extended,
            message=message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        log_error("LIKE", f"Failed to like pin: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to like pin: {str(e)}"
        )


@app.post("/pin/{pin_id}/dislike", response_model=PinLikeResponse, tags=["Engagement"])
@limiter.limit(RATE_LIMITS['dislike'])
async def dislike_pin(
    request: Request,
    pin_id: int,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    👎 Dislike a pin.
    
    Dislikes are tracked but don't affect pin lifespan directly.
    Each device can only dislike a pin once.
    
    **Headers:**
    - X-Device-ID: Unique device/user identifier (optional but enforces one-dislike-per-device)
    - X-Auth-Type: 'device' or 'supabase' (optional)
    
    - **pin_id**: The ID of the pin to dislike
    """
    try:
        pin = db.query(Pin).filter(Pin.id == pin_id, Pin.is_active).first()
        
        if not pin:
            raise HTTPException(status_code=404, detail="Pin not found or inactive")
        
        # Check if device already interacted
        if x_device_id:
            auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
            device = get_or_create_device(db, x_device_id, auth_type)
            
            existing_interaction = db.query(PinInteraction).filter(
                PinInteraction.device_db_id == device.id,
                PinInteraction.pin_id == pin_id
            ).first()
            
            if existing_interaction:
                if existing_interaction.interaction_type == 'dislike':
                    return PinLikeResponse(
                        id=pin.id,
                        likes=pin.likes,
                        dislikes=pin.dislikes,
                        reports=pin.reports,
                        is_suppressed=pin.is_suppressed,
                        expires_at=pin.expires_at,
                        extended=False,
                        message="You've already disliked this pin"
                    )
                else:
                    # Change from like to dislike
                    existing_interaction.interaction_type = 'dislike'
                    pin.likes -= 1
                    pin.dislikes += 1
                    update_suppression_status(db, pin)
                    db.commit()
                    return PinLikeResponse(
                        id=pin.id,
                        likes=pin.likes,
                        dislikes=pin.dislikes,
                        reports=pin.reports,
                        is_suppressed=pin.is_suppressed,
                        expires_at=pin.expires_at,
                        extended=False,
                        message="Changed your vote to dislike"
                    )
            
            # Create new interaction
            interaction = PinInteraction(
                device_db_id=device.id,
                pin_id=pin_id,
                interaction_type='dislike'
            )
            db.add(interaction)
        
        # Increment dislikes
        pin.dislikes += 1
        
        db.commit()
        db.refresh(pin)
        
        return PinLikeResponse(
            id=pin.id,
            likes=pin.likes,
            dislikes=pin.dislikes,
            reports=pin.reports,
            is_suppressed=pin.is_suppressed,
            expires_at=pin.expires_at,
            extended=False,
            message=f"👎 Pin disliked ({pin.dislikes} total dislikes)"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        log_error("DISLIKE", f"Failed to dislike pin: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to dislike pin: {str(e)}"
        )


@app.post("/pin/{pin_id}/report", response_model=PinLikeResponse, tags=["Engagement"])
@limiter.limit(RATE_LIMITS['dislike'])
async def report_pin(
    request: Request,
    pin_id: int,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    🚩 Report a pin for safety concerns (spam, scam, inappropriate content).
    
    This is different from dislike - reports are global safety flags.
    Formula: Pin becomes visually suppressed when reports > likes × 2.
    Suppressed pins appear small, black, and transparent but are not deleted.
    Each device can only report a pin once.
    
    **Headers:**
    - X-Device-ID: Unique device/user identifier (optional but enforces one-report-per-device)
    - X-Auth-Type: 'device' or 'supabase' (optional)
    
    - **pin_id**: The ID of the pin to report
    """
    try:
        pin = db.query(Pin).filter(Pin.id == pin_id, Pin.is_active).first()
        
        if not pin:
            raise HTTPException(status_code=404, detail="Pin not found or inactive")
        
        # Check if device already reported
        if x_device_id:
            auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
            device = get_or_create_device(db, x_device_id, auth_type)
            
            existing_report = db.query(PinInteraction).filter(
                PinInteraction.device_db_id == device.id,
                PinInteraction.pin_id == pin_id,
                PinInteraction.interaction_type == 'report'
            ).first()
            
            if existing_report:
                return PinLikeResponse(
                    id=pin.id,
                    likes=pin.likes,
                    dislikes=pin.dislikes,
                    reports=pin.reports,
                    is_suppressed=pin.is_suppressed,
                    expires_at=pin.expires_at,
                    extended=False,
                    message="You've already reported this pin"
                )
            
            # Create new report interaction
            interaction = PinInteraction(
                device_db_id=device.id,
                pin_id=pin_id,
                interaction_type='report'
            )
            db.add(interaction)
            
            try:
                # Flush to catch unique constraint violations before incrementing counts
                db.flush()
            except IntegrityError as e:
                db.rollback()
                # Race condition - another request already reported this pin
                if "uq_device_pin_interaction" in str(e.orig) or "UniqueViolation" in str(e.orig):
                    # Refresh pin to get current data
                    db.refresh(pin)
                    return PinLikeResponse(
                        id=pin.id,
                        likes=pin.likes,
                        dislikes=pin.dislikes,
                        reports=pin.reports,
                        is_suppressed=pin.is_suppressed,
                        expires_at=pin.expires_at,
                        extended=False,
                        message="You've already reported this pin"
                    )
                raise  # Re-raise if it's a different integrity error
        
        # Increment reports
        pin.reports += 1
        
        # Check suppression formula: reports > likes * 2
        suppression_changed = update_suppression_status(db, pin)
        
        db.commit()
        db.refresh(pin)
        
        if suppression_changed and pin.is_suppressed:
            message = f"🚩 Pin reported and suppressed ({pin.reports} reports, {pin.likes} likes)"
            log_event("PIN_SUPPRESSED", "Pin suppressed by reports", pin_id=pin_id, reports=pin.reports, likes=pin.likes)
        else:
            message = f"🚩 Pin reported ({pin.reports} total reports)"
        
        return PinLikeResponse(
            id=pin.id,
            likes=pin.likes,
            dislikes=pin.dislikes,
            reports=pin.reports,
            is_suppressed=pin.is_suppressed,
            expires_at=pin.expires_at,
            extended=False,
            message=message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        log_error("REPORT", f"Failed to report pin: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to report pin: {str(e)}"
        )


# ============================================
# PASS-BY ENDPOINT (increment silently when user walks within 20m but never opened)
# ============================================

@app.post("/pin/{pin_id}/passby", tags=["Engagement"])
@limiter.limit("60/minute")
async def record_pass_by(
    request: Request,
    pin_id: int,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    👣 Silently record that a user passed within 20m of a pin without opening it.
    Increments the creator's 'passes_by' counter once per device per pin per session.
    Called automatically by the client when the 20m threshold is crossed and the pin
    is later moved out of range without any interaction.
    """
    try:
        pin = db.query(Pin).filter(Pin.id == pin_id, Pin.is_active).first()
        if not pin:
            return {"message": "Pin not found or inactive", "passes_by": 0}

        # Increment counter (no interaction uniqueness needed — server just counts)
        pin.passes_by = (pin.passes_by or 0) + 1

        # If device header present, record a ghost_pin (first time device walked near this pin)
        if x_device_id:
            try:
                auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
                device = get_or_create_device(db, x_device_id, auth_type)

                # Insert ghost_pin if not already recorded for this (device, pin) pair
                db.execute(text(
                    """
                    INSERT INTO public.ghost_pins (device_db_id, pin_id, first_seen_at)
                    VALUES (:device_db_id, :pin_id, now())
                    ON CONFLICT (device_db_id, pin_id) DO NOTHING
                    """
                ), {"device_db_id": device.id, "pin_id": pin_id})
            except Exception as e:
                # Log but do not fail the entire pass-by recording for ghost insert errors
                log_error("GHOST_PINS", f"Failed to insert ghost_pin: {str(e)}")

        db.commit()
        log_event("PASS_BY", "Pass-by recorded", pin_id=pin_id)
        return {"message": "Pass-by recorded", "passes_by": pin.passes_by}
    except Exception as e:
        db.rollback()
        log_error("PASS_BY", f"Failed to record pass-by: {str(e)}")
        return {"message": "Failed to record", "passes_by": 0}


# ============================================
# PER-PIN STATS ENDPOINT (Diary sync with 30-second server-side cooldown)
# ============================================

# In-memory cooldown store: device_id -> {pin_id -> last_sync_timestamp}
_stats_cooldown: dict = {}
_STATS_COOLDOWN_SECONDS = 30

@app.get("/pin/{pin_id}/stats", response_model=PinStatsResponse, tags=["User"])
async def get_pin_stats(
    request: Request,
    pin_id: int,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
):
    """
    📊 Fetch live stats for a specific pin (for the Diary sync button).
    Enforces a 30-second server-side cooldown per device per pin to prevent spam.
    Returns an 'expired' flag instead of crashing when the pin's timer hits zero.
    """
    import time
    now = time.time()

    # Server-side rate limiting: 30 seconds per (device, pin) pair
    if x_device_id:
        device_cooldowns = _stats_cooldown.setdefault(x_device_id, {})
        last_sync = device_cooldowns.get(pin_id, 0)
        if now - last_sync < _STATS_COOLDOWN_SECONDS:
            remaining = int(_STATS_COOLDOWN_SECONDS - (now - last_sync))
            raise HTTPException(
                status_code=429,
                detail=f"Stats sync on cooldown. Wait {remaining}s.",
                headers={"Retry-After": str(remaining)}
            )
        device_cooldowns[pin_id] = now

    try:
        pin = db.query(Pin).filter(Pin.id == pin_id).first()
        if not pin:
            raise HTTPException(status_code=404, detail="Pin not found")

        # Check if pin has expired (timer hit zero while user was watching)
        is_expired = not pin.is_active or pin.expires_at <= datetime.utcnow()

        return PinStatsResponse(
            id=pin.id,
            likes=pin.likes,
            dislikes=pin.dislikes,
            passes_by=pin.passes_by or 0,
            is_active=pin.is_active,
            expires_at=pin.expires_at,
            expired=is_expired,
        )
    except HTTPException:
        raise
    except Exception as e:
        log_error("PIN_STATS", f"Failed to get pin stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pin stats: {str(e)}")


# ============================================
# DELETE PIN ENDPOINT
# ============================================

@app.delete("/pin/{pin_id}", tags=["Pins"])
@limiter.limit(RATE_LIMITS['like'])
async def delete_pin(
    request: Request,
    pin_id: int,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    🗑️ Delete your own pin.
    
    Users can only delete pins they created. This is a permanent deletion.
    
    **Headers:**
    - X-Device-ID: Your device/user identifier (required)
    - X-Auth-Type: 'device' or 'supabase' (optional, defaults to 'device')
    
    **Params:**
    - **pin_id**: ID of the pin to delete
    """
    try:
        if not x_device_id:
            raise HTTPException(status_code=401, detail="Device ID required to delete pins")
        
        # Get device
        auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
        device = db.query(Device).filter(Device.device_id == x_device_id, Device.auth_type == auth_type).first()
        
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        
        # Get pin and verify ownership
        pin = db.query(Pin).filter(Pin.id == pin_id, Pin.is_active).first()
        
        if not pin:
            raise HTTPException(status_code=404, detail="Pin not found")
        
        # Check ownership
        if pin.device_db_id != device.id:
            raise HTTPException(status_code=403, detail="You can only delete your own pins")
        
        # Delete the pin (cascade will handle interactions)
        db.delete(pin)
        db.commit()
        
        log_event("PIN_DELETED", "User deleted their own pin", pin_id=pin_id, device=x_device_id[:8])
        
        return {"message": "Pin deleted successfully", "pin_id": pin_id}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        log_error("DELETE_PIN", f"Failed to delete pin: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to delete pin: {str(e)}"
        )


# ============================================
# CLEANUP ENDPOINT
# ============================================

@app.post("/admin/cleanup", response_model=CleanupResponse, tags=["Admin"])
async def cleanup_expired_pins(
    db: Session = Depends(get_db),
    hard_delete: bool = Query(False, description="Permanently delete expired pins (default: soft delete)")
):
    """
    🧹 Clean up expired pins.
    
    This endpoint can be called periodically (e.g., by a cron job) to:
    - Soft delete: Mark expired pins as inactive
    - Hard delete: Permanently remove expired pins (use with caution)
    
    - **hard_delete**: If True, permanently deletes pins. If False, marks as inactive.
    """
    try:
        now = datetime.utcnow()
        
        if hard_delete:
            # Hard delete expired pins (and their interactions via CASCADE)
            result = db.query(Pin).filter(
                Pin.expires_at < now
            ).delete(synchronize_session=False)
            action = "permanently deleted"
        else:
            # Soft delete - just mark as inactive
            result = db.query(Pin).filter(
                Pin.expires_at < now,
                Pin.is_active
            ).update({"is_active": False}, synchronize_session=False)
            action = "marked as inactive"
        
        db.commit()
        
        log_event("CLEANUP", f"{result} expired pins {action}")
        
        return CleanupResponse(
            deleted_count=result,
            message=f"🧹 Cleanup complete: {result} expired pins {action}",
            success=True
        )
        
    except Exception as e:
        db.rollback()
        log_error("CLEANUP", f"Cleanup failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Cleanup failed: {str(e)}"
        )


# ============================================
# UTILITY ENDPOINTS (for development/testing)
# ============================================

@app.get("/pins/all", response_model=list[PinResponse], tags=["Development"])
async def get_all_pins(
    db: Session = Depends(get_db),
    include_expired: bool = Query(False, description="Include expired pins")
):
    """
    📋 Get all pins (Development/Testing endpoint)
    
    This endpoint is for development purposes only.
    In production, this should be removed or restricted.
    """
    query = db.query(Pin)
    
    if not include_expired:
        query = query.filter(
            Pin.is_active,
            Pin.expires_at > datetime.utcnow()
        )
    
    pins = query.order_by(Pin.created_at.desc()).limit(100).all()
    
    return [
        PinResponse(
            id=pin.id,
            content=pin.content,
            created_at=pin.created_at,
            expires_at=pin.expires_at,
            likes=pin.likes,
            dislikes=pin.dislikes,
            reports=pin.reports,
            is_active=pin.is_active,
            is_suppressed=pin.is_suppressed
        )
        for pin in pins
    ]


@app.get("/stats", response_model=dict, tags=["Development"])
async def get_stats(db: Session = Depends(get_db)):
    """
    📊 Get API statistics (Development endpoint)
    """
    now = datetime.utcnow()
    
    total_pins = db.query(func.count(Pin.id)).scalar()
    active_pins = db.query(func.count(Pin.id)).filter(
        Pin.is_active,
        Pin.expires_at > now
    ).scalar()
    total_devices = db.query(func.count(Device.id)).scalar()
    total_interactions = db.query(func.count(PinInteraction.id)).scalar()
    
    return {
        "total_pins": total_pins,
        "active_pins": active_pins,
        "expired_pins": total_pins - active_pins,
        "total_devices": total_devices,
        "total_interactions": total_interactions,
        "environment": settings.ENVIRONMENT,
        "discovery_radius_meters": settings.DISCOVERY_RADIUS_METERS,
        "pin_expiry_hours": settings.PIN_DEFAULT_EXPIRY_HOURS
    }


# ============================================
# USER STATS ENDPOINT
# ============================================

@app.get("/user/stats", response_model=UserStatsResponse, tags=["User"])
async def get_user_stats(
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    📊 Get user statistics (liked/disliked/created counts).
    """
    if not x_device_id:
        return UserStatsResponse(
            liked_count=0,
            disliked_count=0,
            pins_created=0,
            pins_discovered=0,
            message="No device ID provided"
        )
    
    try:
        auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
        device = get_or_create_device(db, x_device_id, auth_type)
        
        liked_count = db.query(func.count(PinInteraction.id)).filter(
            PinInteraction.device_db_id == device.id,
            PinInteraction.interaction_type == 'like'
        ).scalar() or 0
        
        disliked_count = db.query(func.count(PinInteraction.id)).filter(
            PinInteraction.device_db_id == device.id,
            PinInteraction.interaction_type == 'dislike'
        ).scalar() or 0
        
        pins_created = db.query(func.count(Pin.id)).filter(
            Pin.device_db_id == device.id
        ).scalar() or 0
        
        communities_created = db.query(func.count(Pin.id)).filter(
            Pin.device_db_id == device.id,
            Pin.is_community
        ).scalar() or 0
        
        pins_discovered = db.query(func.count(PinInteraction.id)).filter(
            PinInteraction.device_db_id == device.id
        ).scalar() or 0
        
        return UserStatsResponse(
            liked_count=liked_count,
            disliked_count=disliked_count,
            pins_created=pins_created,
            pins_discovered=pins_discovered,
            communities_created=communities_created,
            message="Stats retrieved successfully"
        )
    except Exception as e:
        log_error("USER_STATS", f"Failed to get user stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get user stats: {str(e)}")


@app.get("/user/created-pins", response_model=list[PinResponse], tags=["User"])
async def get_user_created_pins(
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of pins to return")
):
    """
    📦 Return pins created by the requesting device.

    Requires `X-Device-ID` header to identify the device (or creates the device record).
    """

    if not x_device_id:
        raise HTTPException(status_code=401, detail="Device ID required")

    try:
        auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
        device = get_or_create_device(db, x_device_id, auth_type)

        pins = db.query(Pin).filter(Pin.device_db_id == device.id).order_by(Pin.created_at.desc()).limit(limit).all()

        return [
            PinResponse(
                id=pin.id,
                content=pin.content,
                created_at=pin.created_at,
                expires_at=pin.expires_at,
                likes=pin.likes,
                dislikes=pin.dislikes,
                reports=pin.reports,
                passes_by=pin.passes_by or 0,
                is_active=pin.is_active,
                is_suppressed=pin.is_suppressed,
                is_community=pin.is_community,
            )
            for pin in pins
        ]
    except Exception as e:
        log_error("USER_CREATED_PINS", f"Failed to fetch created pins: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch created pins: {str(e)}")


@app.get("/user/created-pins/search", response_model=list[PinResponse], tags=["User"])
async def search_user_created_pins(
    q: str = Query(..., min_length=1, description="Search query"),
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of pins to return")
):
    """
    🔎 Full-text search over pins created by the requesting device.

    Uses Postgres full-text search (plainto_tsquery) and the existing GIN index on pins.content.
    """
    if not x_device_id:
        raise HTTPException(status_code=401, detail="Device ID required")

    try:
        auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
        device = get_or_create_device(db, x_device_id, auth_type)

        # Use Postgres full-text search; order by rank then newest
        sql = text("""
            SELECT p.*,
                   ts_rank_cd(to_tsvector('english', p.content), plainto_tsquery(:q)) AS rank
            FROM public.pins p
            WHERE p.device_db_id = :device_id
              AND to_tsvector('english', p.content) @@ plainto_tsquery(:q)
            ORDER BY rank DESC, p.created_at DESC
            LIMIT :limit
        """)

        rows = db.execute(sql, {"q": q, "device_id": device.id, "limit": limit}).mappings().all()

        results = []
        for r in rows:
            results.append(
                PinResponse(
                    id=r['id'],
                    content=r['content'],
                    created_at=r['created_at'],
                    expires_at=r['expires_at'],
                    likes=r.get('likes', 0),
                    dislikes=r.get('dislikes', 0),
                    reports=r.get('reports', 0),
                    passes_by=r.get('passes_by', 0),
                    is_active=r.get('is_active', True),
                    is_suppressed=r.get('is_suppressed', False),
                    is_community=r.get('is_community', False),
                )
            )

        return results
    except Exception as e:
        log_error("USER_CREATED_PINS_SEARCH", f"Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/user/ghost-pins", response_model=list[PinResponse], tags=["User"])
async def get_user_ghost_pins(
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of pins to return")
):
    """
    👻 List ghost pins (pins the device has passed by).

    Returns pins recorded in `ghost_pins` for the requesting device, ordered by first seen.
    """
    if not x_device_id:
        raise HTTPException(status_code=401, detail="Device ID required")

    try:
        auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
        device = get_or_create_device(db, x_device_id, auth_type)

        sql = text("""
            SELECT p.*
            FROM public.ghost_pins g
            JOIN public.pins p ON p.id = g.pin_id
            WHERE g.device_db_id = :device_id
            ORDER BY g.first_seen_at DESC
            LIMIT :limit
        """)

        rows = db.execute(sql, {"device_id": device.id, "limit": limit}).mappings().all()

        results = []
        for r in rows:
            results.append(
                PinResponse(
                    id=r['id'],
                    content=r['content'],
                    created_at=r['created_at'],
                    expires_at=r['expires_at'],
                    likes=r.get('likes', 0),
                    dislikes=r.get('dislikes', 0),
                    reports=r.get('reports', 0),
                    passes_by=r.get('passes_by', 0),
                    is_active=r.get('is_active', True),
                    is_suppressed=r.get('is_suppressed', False),
                    is_community=r.get('is_community', False),
                )
            )

        return results
    except Exception as e:
        log_error("USER_GHOST_PINS", f"Failed to fetch ghost pins: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch ghost pins: {str(e)}")


@app.get("/community/stats", tags=["Community"])
async def get_community_stats(
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(None, alias="X-Device-ID"),
    x_auth_type: Optional[str] = Header('device', alias="X-Auth-Type")
):
    """
    📊 Get community statistics.
    Returns total community pins and user's own community pin count.
    """
    try:
        total_community_pins = db.query(func.count(Pin.id)).filter(
            Pin.is_community,
            Pin.is_active
        ).scalar() or 0
        
        user_community_pins = 0
        if x_device_id:
            auth_type = x_auth_type if x_auth_type in ('device', 'supabase') else 'device'
            device = get_or_create_device(db, x_device_id, auth_type)
            user_community_pins = db.query(func.count(Pin.id)).filter(
                Pin.device_db_id == device.id,
                Pin.is_community,
                Pin.is_active
            ).scalar() or 0
        
        return {
            "total_community_pins": total_community_pins,
            "user_community_pins": user_community_pins,
            "message": "Community stats retrieved"
        }
    except Exception as e:
        log_error("COMMUNITY_STATS", f"Failed to get community stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get community stats: {str(e)}")


# ============================================
# RUN WITH UVICORN
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
