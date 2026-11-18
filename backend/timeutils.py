from datetime import datetime, timezone


def utcnow() -> datetime:
    """UTC stored without a timezone, compatible with the original PostgreSQL columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
