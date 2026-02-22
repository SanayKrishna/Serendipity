"""
Content Filtering Utility
Provides basic profanity filtering and content sanitization.
"""
import re
import html
from typing import Tuple

# Basic list of blocked words (MINIMAL - only truly offensive slurs)
# In production, use a more comprehensive list or external service
BLOCKED_WORDS = {
    # Only block severe slurs - removed common words that might be in legitimate messages
    'nigger', 'fag', 'cunt',
    # Removed most profanity - people should be able to express themselves
    # Removed spam indicators - too many false positives
}

# Patterns that indicate spam or malicious content (RELAXED - allow most content)
SPAM_PATTERNS = [
    # Removed URL check - allow URLs
    # Removed email check - allow emails
    # Removed phone number check - allow phone numbers
    r'(.)\1{15,}',  # Only block VERY excessive repeated characters (15+)
    # Removed all caps check - allow emphasis
]

# Leet speak mappings for bypass detection
LEET_MAP = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
    '7': 't', '@': 'a', '$': 's', '!': 'i',
}


def normalize_text(text: str) -> str:
    """Normalize text for comparison (lowercase, remove leet speak)."""
    normalized = text.lower()
    
    # Replace leet speak
    for leet, char in LEET_MAP.items():
        normalized = normalized.replace(leet, char)
    
    # Remove common separator characters
    normalized = re.sub(r'[._\-\s]+', '', normalized)
    
    return normalized


def contains_blocked_content(content: str) -> Tuple[bool, str]:
    """
    Check if content contains blocked words or patterns.
    Returns (is_blocked, reason).
    """
    normalized = normalize_text(content)
    
    # Check blocked words
    for word in BLOCKED_WORDS:
        if word in normalized:
            return True, "Content contains inappropriate language"
    
    # Check spam patterns
    for pattern in SPAM_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            return True, "Content appears to be spam"
    
    return False, ""


def sanitize_content(content: str) -> str:
    """
    Sanitize user input to prevent injection attacks.
    - Escapes HTML entities
    - Strips excessive whitespace
    - Limits consecutive newlines
    """
    # Escape HTML entities
    sanitized = html.escape(content)
    
    # Normalize whitespace (preserve single newlines for formatting)
    sanitized = re.sub(r'[ \t]+', ' ', sanitized)
    sanitized = re.sub(r'\n{3,}', '\n\n', sanitized)
    
    # Strip leading/trailing whitespace
    sanitized = sanitized.strip()
    
    return sanitized


def validate_content(content: str) -> Tuple[bool, str, str]:
    """
    Full content validation pipeline.
    Returns (is_valid, sanitized_content, error_message).
    """
    # Check length
    if len(content) < 1:
        return False, "", "Message cannot be empty"
    
    if len(content) > 500:
        return False, "", "Message exceeds maximum length of 500 characters"
    
    # Sanitize
    sanitized = sanitize_content(content)
    
    # Check for blocked content
    is_blocked, reason = contains_blocked_content(sanitized)
    if is_blocked:
        return False, "", reason
    
    # Check for meaningful content (not just punctuation or whitespace)
    # Allow short messages - just need at least 1 alphanumeric character
    if len(re.sub(r'[^\w]', '', sanitized)) < 1:
        return False, "", "Message must contain at least one letter or number"
    
    return True, sanitized, ""


# Export functions
__all__ = ['validate_content', 'sanitize_content', 'contains_blocked_content']
