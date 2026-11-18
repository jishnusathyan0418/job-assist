from backend.timeutils import utcnow
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator

Status = Literal[
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
]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class JobInput(Input):
    platform: str = Field(min_length=1, max_length=100)
    platform_job_id: str | None = Field(default=None, max_length=255)
    company: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    job_url: str = Field(min_length=1, max_length=2048)
    description_raw: str | None = Field(default=None, max_length=30000)

    @field_validator("job_url")
    @classmethod
    def safe_url(cls, value):
        from urllib.parse import urlsplit, urlunsplit

        parsed = urlsplit(value)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ValueError("Enter an http or https URL without embedded credentials.")
        return urlunsplit(
            (
                parsed.scheme.lower(),
                parsed.netloc.lower(),
                parsed.path,
                parsed.query,
                "",
            )
        )

    @field_validator("platform_job_id", "location", "description_raw")
    @classmethod
    def empty_to_none(cls, value):
        return value or None

    @field_validator("platform")
    @classmethod
    def normalize_platform(cls, value):
        return value.lower()


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    platform: str
    platform_job_id: str | None
    company: str
    title: str
    location: str | None
    job_url: str
    description_raw: str | None
    description_structured: dict | None
    status: str | None
    discovered_at: datetime | None


def utc_date(value):
    if value:
        value = (
            value.astimezone(timezone.utc).replace(tzinfo=None)
            if value.tzinfo
            else value
        )
        if value > utcnow():
            raise ValueError("Application date cannot be in the future.")
    return value


class ApplicationInput(Input):
    job_id: UUID
    status: Status = "discovered"
    notes: str | None = Field(default=None, max_length=10000)
    applied_at: datetime | None = None
    _utc_date = field_validator("applied_at")(utc_date)


class ApplicationPatch(Input):
    status: Status | None = None
    notes: str | None = Field(default=None, max_length=10000)
    applied_at: datetime | None = None
    _utc_date = field_validator("applied_at")(utc_date)

    @field_validator("status")
    @classmethod
    def nonnull_status(cls, value):
        if value is None:
            raise ValueError("Status cannot be null.")
        return value


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=1024)
