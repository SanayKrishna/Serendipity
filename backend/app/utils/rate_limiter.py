"""
Rate Limiting Utility
Implements request rate limiting using slowapi.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

# Custom key function that tries device ID first, falls back to IP
def get_device_identifier(request: Request) -> str:
    """
    Get a unique identifier for rate limiting.
    Prefers X-Device-ID header, falls back to IP address.
    """
    device_id = request.headers.get('X-Device-ID')
    if device_id:
        return f"device:{device_id}"
    return f"ip:{get_remote_address(request)}"


# Create limiter instance
limiter = Limiter(key_func=get_device_identifier)

# Rate limit configurations
RATE_LIMITS = {
    'pin_create': "10/hour",      # 10 pins per hour
    'like': "60/minute",          # 60 likes per minute
    'dislike': "60/minute",       # 60 dislikes per minute  
    'discover': "120/minute",     # 120 discover requests per minute
    'default': "200/minute",      # Default for other endpoints
}

__all__ = ['limiter', 'get_device_identifier', 'RATE_LIMITS']
