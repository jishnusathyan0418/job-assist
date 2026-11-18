from backend.timeutils import utcnow
import hashlib
import secrets
from datetime import timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import HTTPException
from sqlalchemy import delete, func, select, text
from backend.models import LoginAttempt, OwnerSession

COOKIE = "job_demo_session"
hasher = PasswordHasher()


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_session(request, db):
    token = request.cookies.get(COOKIE)
    session = db.get(OwnerSession, digest(token)) if token else None
    if session and session.expires_at > utcnow():
        return session
    return None


def check_origin(request):
    if request.headers.get("origin") != request.app.state.settings.origin:
        raise HTTPException(403, "Request origin is not allowed.")


def require_owner(request, db):
    session = current_session(request, db)
    if not session:
        raise HTTPException(401, "Sign in as the owner to make changes.")
    check_origin(request)
    if not secrets.compare_digest(
        request.headers.get("x-csrf-token", ""), session.csrf_token
    ):
        raise HTTPException(403, "Session verification failed. Refresh and try again.")
    return session


def login(request, db, payload):
    check_origin(request)
    settings = request.app.state.settings
    if not settings.owner_password_hash:
        raise HTTPException(503, "Owner sign-in has not been configured.")
    now = utcnow()
    db.execute(text("SELECT pg_advisory_xact_lock(74019231)"))
    db.execute(
        delete(LoginAttempt).where(
            LoginAttempt.attempted_at < now - timedelta(minutes=15)
        )
    )
    if db.scalar(select(func.count()).select_from(LoginAttempt)) >= 10:
        raise HTTPException(
            429,
            "Too many sign-in attempts. Try again in 15 minutes.",
            headers={"Retry-After": "900"},
        )
    db.add(LoginAttempt(attempted_at=now))
    db.commit()
    try:
        valid_password = hasher.verify(settings.owner_password_hash, payload.password)
    except (VerificationError, InvalidHashError):
        valid_password = False
    if (
        not valid_password
        or payload.email.strip().lower() != settings.owner_email.lower()
    ):
        raise HTTPException(401, "Email or password is incorrect.")
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.execute(delete(OwnerSession).where(OwnerSession.expires_at <= now))
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(OwnerSession).where(OwnerSession.token_hash == digest(old)))
    db.add(
        OwnerSession(
            token_hash=digest(token),
            csrf_token=csrf,
            expires_at=now + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    return token, csrf
