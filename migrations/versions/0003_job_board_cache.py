"""Durable public provider snapshots; no personal resume information."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003_job_board_cache"
down_revision = "0002_real_users"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "job_board_cache",
        sa.Column("board", sa.String(100), primary_key=True),
        sa.Column("postings", JSONB(), nullable=False),
        sa.Column("fetched_at", sa.DateTime()),
        sa.Column("retry_at", sa.DateTime()),
        sa.Column("lease_until", sa.DateTime()),
        sa.Column("last_error", sa.Text()),
    )


def downgrade():
    op.drop_table("job_board_cache")
