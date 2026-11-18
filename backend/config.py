import os
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from dotenv import dotenv_values, load_dotenv
from sqlalchemy.engine import URL

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    origin: str
    secure_cookie: bool
    owner_email: str
    owner_password_hash: str
    demo_user_id: UUID
    session_hours: int
    groq_api_key: str = ""
    groq_model: str = ""
    groq_zero_data_retention_confirmed: bool = False


def database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if value:
        if value.startswith(("postgres://", "postgresql://")):
            value = "postgresql+psycopg2://" + value.split("://", 1)[1]
        return value
    return URL.create(
        "postgresql+psycopg2",
        username=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME"),
    ).render_as_string(hide_password=False)


def _groq_setting(name: str) -> str:
    value = os.getenv(name)
    if value and value.strip():
        return value
    for env_file in (ROOT / ".env", ROOT / "backend" / ".env"):
        value = dotenv_values(env_file).get(name)
        if value and value.strip():
            return value
    return ""


def get_settings() -> Settings:
    origin = os.getenv("APP_ORIGIN", "http://localhost:8000").rstrip("/")
    secure = os.getenv("COOKIE_SECURE", "true").lower() == "true"
    if not secure and not origin.startswith(("http://localhost:", "http://127.0.0.1:")):
        raise RuntimeError(
            "COOKIE_SECURE=false is only supported for local development."
        )
    return Settings(
        database_url(),
        origin,
        secure,
        os.getenv("OWNER_EMAIL", "owner@example.com"),
        os.getenv("OWNER_PASSWORD_HASH", ""),
        UUID(os.getenv("DEMO_USER_ID", "00000000-0000-4000-8000-000000000001")),
        int(os.getenv("SESSION_HOURS", "8")),
        _groq_setting("GROQ_API_KEY"),
        _groq_setting("GROQ_MODEL"),
        _groq_setting("GROQ_ZERO_DATA_RETENTION_CONFIRMED").lower() == "true",
    )
