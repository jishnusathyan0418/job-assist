import os
from alembic import context
from backend.config import database_url
from backend.database import make_engine
from backend.models import Base

url = os.getenv("MIGRATION_DATABASE_URL") or database_url()
if url.startswith(("postgres://", "postgresql://")):
    url = "postgresql+psycopg2://" + url.split("://", 1)[1]
if context.is_offline_mode():
    raise RuntimeError(
        "This migration inspects existing tables; run it online against PostgreSQL."
    )
engine = make_engine(url)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()
