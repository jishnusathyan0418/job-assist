"""Real user authentication, independent of the retired owner-only demo login."""

import secrets
import hashlib
from datetime import timedelta
from threading import BoundedSemaphore
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import HTTPException
from sqlalchemy import select, delete, func, text
from backend.models import User, UserSession, AuthAttempt
from backend.timeutils import utcnow

COOKIE = "jobspace_session"
hasher = PasswordHasher()
hash_slots = BoundedSemaphore(2)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(24))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def hash_password(value):
    with hash_slots:
        return hasher.hash(value)


def verify(password_hash, password):
    with hash_slots:
        try:
            return hasher.verify(password_hash or DUMMY_HASH, password) and bool(
                password_hash
            )
        except (VerificationError, InvalidHashError):
            return False


def check_origin(request):
    if request.headers.get("origin") != request.app.state.settings.origin:
        raise HTTPException(
            403, "Open the app at its configured address, refresh, and try again."
        )


def rate_limit(db, action, email, ip):
    now = utcnow()
    window = now - timedelta(minutes=15)
    buckets = [
        (digest(action + ":email:" + email.lower()), 10),
        (digest(action + ":ip:" + ip), 30),
    ]
    if action == "register":
        buckets = [(digest(action + ":ip:" + ip), 10)]
    for bucket, limit in sorted(buckets):
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:bucket, 0))"),
            {"bucket": bucket},
        )
        count = db.scalar(
            select(func.count())
            .select_from(AuthAttempt)
            .where(AuthAttempt.bucket == bucket, AuthAttempt.attempted_at >= window)
        )
        if count >= limit:
            raise HTTPException(
                429,
                "Too many attempts. Try again in 15 minutes.",
                headers={"Retry-After": "900"},
            )
    db.execute(delete(AuthAttempt).where(AuthAttempt.attempted_at < window))
    for bucket, _ in buckets:
        db.add(AuthAttempt(bucket=bucket, attempted_at=now))
    db.commit()


def current_session(request, db):
    token = request.cookies.get(COOKIE)
    session = db.get(UserSession, digest(token)) if token else None
    return session if session and session.expires_at > utcnow() else None


def require_user(request, db, write=False):
    session = current_session(request, db)
    if not session:
        raise HTTPException(401, "Please sign in to access your private workspace.")
    user = db.get(User, session.user_id)
    if not user or not user.password_hash:
        raise HTTPException(401, "Please sign in again.")
    if write:
        check_origin(request)
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), session.csrf_token
        ):
            raise HTTPException(
                403, "Session verification failed. Refresh and try again."
            )
    return user


def issue_session(request, response, db, user):
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(UserSession).where(UserSession.token_hash == digest(old)))
    db.execute(delete(UserSession).where(UserSession.expires_at <= utcnow()))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(
        UserSession(
            token_hash=digest(token),
            user_id=user.id,
            csrf_token=csrf,
            expires_at=utcnow()
            + timedelta(hours=request.app.state.settings.session_hours),
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=request.app.state.settings.session_hours * 3600,
        httponly=True,
        secure=request.app.state.settings.secure_cookie,
        samesite="strict",
        path="/",
    )
    return {
        "authenticated": True,
        "csrf_token": csrf,
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name},
    }
