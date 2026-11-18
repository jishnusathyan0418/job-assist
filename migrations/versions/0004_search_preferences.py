"""User-confirmed eligibility preferences; no guessed experience defaults."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004_search_preferences"
down_revision = "0003_job_board_cache"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("resumes", sa.Column("search_preferences", JSONB(), nullable=True))


def downgrade():
    raise RuntimeError(
        "Restore a reviewed backup; confirmed user preferences must not be silently dropped."
    )
