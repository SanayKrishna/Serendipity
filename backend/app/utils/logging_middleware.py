"""
Logging Middleware
Structured logging for API requests and responses.
"""
import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger("serendipity")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging all HTTP requests and responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())[:8]
        
        # Record start time
        start_time = time.time()
        
        # Get client info
        client_ip = request.client.host if request.client else "unknown"
        device_id = request.headers.get('X-Device-ID', 'anonymous')[:8] if request.headers.get('X-Device-ID') else 'anonymous'
        
        # Log incoming request
        logger.info(
            f"[{request_id}] → {request.method} {request.url.path} | "
            f"IP: {client_ip} | Device: {device_id}"
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log response
            logger.info(
                f"[{request_id}] ← {response.status_code} | "
                f"Duration: {duration_ms:.2f}ms"
            )
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            
            return response
            
        except Exception as e:
            # Log error
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"[{request_id}] ✗ Error: {str(e)} | "
                f"Duration: {duration_ms:.2f}ms"
            )
            raise


def log_event(event_type: str, message: str, **kwargs):
    """Log a custom application event."""
    extra_info = " | ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    logger.info(f"[{event_type.upper()}] {message}" + (f" | {extra_info}" if extra_info else ""))


def log_error(error_type: str, message: str, **kwargs):
    """Log an error event."""
    extra_info = " | ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    logger.error(f"[{error_type.upper()}] {message}" + (f" | {extra_info}" if extra_info else ""))


__all__ = ['RequestLoggingMiddleware', 'log_event', 'log_error', 'logger']
