from backend.timeutils import utcnow
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    LargeBinary,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


APPLICATION_STATUSES = (
    "discovered",
    "matched",
    "ready_for_review",
    "application_started",
    "applied",
    "assessment",
    "interview",
    "rejected",
    "withdrawn",
    "offer",
    "manual_action_required",
    "failed",
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(Text)
    recovery_hash: Mapped[str | None] = mapped_column(String(64))
    last_search_at: Mapped[datetime | None] = mapped_column(DateTime)
    target_role: Mapped[str | None] = mapped_column(String(255))
    location_pref: Mapped[str | None] = mapped_column(String(255))
    remote_pref: Mapped[str | None] = mapped_column(String(50))
    experience_level: Mapped[str | None] = mapped_column(String(50))
    daily_limit: Mapped[int | None] = mapped_column(Integer, default=10)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=utcnow)
    __table_args__ = (
        CheckConstraint(
            "remote_pref IN ('remote','hybrid','onsite','any')",
            name="users_remote_pref_check",
        ),
        CheckConstraint(
            "experience_level IN ('fresher','junior','mid','senior')",
            name="users_experience_level_check",
        ),
    )


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    platform: Mapped[str] = mapped_column(String)
    platform_job_id: Mapped[str | None] = mapped_column(String)
    company: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    location: Mapped[str | None] = mapped_column(String)
    job_url: Mapped[str] = mapped_column(Text)
    description_raw: Mapped[str | None] = mapped_column(Text)
    description_structured: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    status: Mapped[str | None] = mapped_column(String, default="discovered")
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime, default=utcnow)
    owner_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    source_kind: Mapped[str] = mapped_column(
        String(30), default="manual", server_default="manual"
    )
    source_board: Mapped[str | None] = mapped_column(String(100))
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    __table_args__ = (
        Index(
            "uq_jobs_scoped_url",
            text("coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            "job_url",
            unique=True,
        ),
        Index(
            "uq_jobs_scoped_posting",
            text("coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            "platform",
            "platform_job_id",
            unique=True,
            postgresql_where=text(
                "platform_job_id IS NOT NULL AND btrim(platform_job_id) <> ''"
            ),
        ),
        Index("idx_jobs_company", "company"),
    )


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    job_id: Mapped[UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    resume_version_id: Mapped[UUID | None]
    status: Mapped[str | None] = mapped_column(String(50), default="discovered")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    match_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    match_details: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=utcnow)
    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="applications_user_id_job_id_key"),
        CheckConstraint(
            "status IN (" + ",".join(repr(s) for s in APPLICATION_STATUSES) + ")",
            name="applications_status_check",
        ),
        Index("idx_applications_user_id", "user_id"),
        Index("idx_applications_job_id", "job_id"),
        Index("idx_applications_status", "status"),
    )


class StatusHistory(Base):
    __tablename__ = "application_status_history"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    application_id: Mapped[UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    previous_status: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50))
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OwnerSession(Base):
    __tablename__ = "owner_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Resume(Base):
    __tablename__ = "resumes"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100))
    file_data: Mapped[bytes] = mapped_column(LargeBinary)
    extracted_text: Mapped[str] = mapped_column(Text)
    skills: Mapped[list] = mapped_column(JSONB, default=list)
    preferred_roles: Mapped[list] = mapped_column(JSONB, default=list)
    experience: Mapped[str] = mapped_column(Text, default="")
    search_preferences: Mapped[dict | None] = mapped_column(JSONB)
    location: Mapped[str] = mapped_column(String(255), default="")
    country: Mapped[str] = mapped_column(String(2), default="in")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserJob(Base):
    __tablename__ = "user_jobs"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True
    )
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    match_details: Mapped[dict] = mapped_column(JSONB, default=dict)
    match_score: Mapped[int] = mapped_column(Integer, default=0)


class UserSession(Base):
    __tablename__ = "user_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class AuthAttempt(Base):
    __tablename__ = "auth_attempts"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    bucket: Mapped[str] = mapped_column(String(64))
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class JobBoardCache(Base):
    __tablename__ = "job_board_cache"
    board: Mapped[str] = mapped_column(String(100), primary_key=True)
    postings: Mapped[list] = mapped_column(JSONB, default=list)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime)
    retry_at: Mapped[datetime | None] = mapped_column(DateTime)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime)
    last_error: Mapped[str | None] = mapped_column(Text)
