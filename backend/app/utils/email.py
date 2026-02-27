"""
Email utility — welcome/confirmation emails via SMTP.

Required environment variables (set in Railway or .env):
    SMTP_HOST      — e.g. smtp.gmail.com  (default: localhost)
    SMTP_PORT      — e.g. 587 for STARTTLS, 465 for SSL  (default: 587)
    SMTP_USER      — sender account username
    SMTP_PASS      — sender account password / app-password
    FROM_EMAIL     — display sender address  (default: SMTP_USER)
    FROM_NAME      — display sender name     (default: Serendipity)

If SMTP_USER is not set the function is a no-op so the app still works
without email configuration during local development.
"""

import os
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

_SMTP_HOST  = os.getenv("SMTP_HOST", "localhost")
_SMTP_PORT  = int(os.getenv("SMTP_PORT", "587"))
_SMTP_USER  = os.getenv("SMTP_USER", "")
_SMTP_PASS  = os.getenv("SMTP_PASS", "")
_FROM_EMAIL = os.getenv("FROM_EMAIL", _SMTP_USER)
_FROM_NAME  = os.getenv("FROM_NAME", "Serendipity")

# Use STARTTLS unless port is 465 (implicit SSL)
_USE_TLS    = (_SMTP_PORT == 465)
_USE_STARTTLS = not _USE_TLS


# ── Templates ─────────────────────────────────────────────────────────────────

_WELCOME_PLAIN = """\
こんにちは {username}!

Welcome to Serendipity — the social network for wanderers.

Your account has been created successfully.
Start dropping pins, exploring your neighbourhood, and sharing what you find.

If you did not register for this account, please ignore this email.

— The Serendipity Team
"""

_WELCOME_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Serendipity</title>
  <style>
    body {{ font-family: 'Georgia', serif; background: #F5F0E8; margin: 0; padding: 0; }}
    .wrapper {{ max-width: 520px; margin: 40px auto; background: #FDFAF5;
                border-radius: 12px; overflow: hidden;
                box-shadow: 0 2px 12px rgba(0,0,0,0.08); }}
    .header {{ background: #2D5A3D; padding: 32px 40px; text-align: center; }}
    .header h1 {{ color: #F5F0E8; font-size: 26px; margin: 0; letter-spacing: 2px; }}
    .header p  {{ color: #A3C4A0; font-size: 13px; margin: 6px 0 0; letter-spacing: 1px; }}
    .body {{ padding: 32px 40px; }}
    .greeting {{ font-size: 22px; color: #1A1A1A; margin-bottom: 16px; }}
    .text {{ font-size: 15px; color: #4A4A4A; line-height: 1.7; margin-bottom: 16px; }}
    .highlight {{ color: #2D5A3D; font-weight: bold; }}
    .divider {{ border: none; border-top: 1px solid #E8E0D0; margin: 24px 0; }}
    .footer {{ font-size: 12px; color: #999; text-align: center; padding: 16px 40px 28px; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Serendipity</h1>
      <p>The social network for wanderers</p>
    </div>
    <div class="body">
      <p class="greeting">こんにちは, <span class="highlight">{username}</span>!</p>
      <p class="text">
        Your explorer identity has been created. You're now part of a community of
        curious wanderers who drop pins, share moments, and discover the world
        together — one serendipitous encounter at a time.
      </p>
      <p class="text">
        Open the app, choose your starting point, and begin your journey.
        Every step might lead somewhere unexpected.
      </p>
      <hr class="divider">
      <p class="text" style="font-size:13px; color:#888;">
        If you didn't register for Serendipity, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      &copy; Serendipity &mdash; sent with care
    </div>
  </div>
</body>
</html>
"""


# ── Main function ─────────────────────────────────────────────────────────────

async def send_welcome_email(to_email: str, username: str) -> None:
    """
    Send a welcome/confirmation email to a newly registered user.

    This is intended to be called as a FastAPI BackgroundTask so that the
    signup HTTP response is not delayed by network I/O.

    The function is a safe no-op when SMTP_USER is not configured, which
    lets the app run in development without an email server.
    """
    if not _SMTP_USER:
        log.debug(
            "SMTP_USER not set — skipping welcome email to %s", to_email
        )
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Welcome to Serendipity 🌿"
        msg["From"]    = f"{_FROM_NAME} <{_FROM_EMAIL}>"
        msg["To"]      = to_email

        plain = _WELCOME_PLAIN.format(username=username)
        html  = _WELCOME_HTML.format(username=username)

        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html,  "html",  "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=_SMTP_HOST,
            port=_SMTP_PORT,
            username=_SMTP_USER,
            password=_SMTP_PASS,
            use_tls=_USE_TLS,
            start_tls=_USE_STARTTLS,
        )

        log.info("✉️  Welcome email sent to %s", to_email)

    except Exception as exc:  # pragma: no cover
        # Never crash the signup flow because of an email failure
        log.error("Failed to send welcome email to %s: %s", to_email, exc)
