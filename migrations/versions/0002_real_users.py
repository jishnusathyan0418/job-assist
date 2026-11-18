"""Private accounts, resume versions, saved jobs, and per-user authentication."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0002_real_users"
down_revision = "0001_demo"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    if conn.execute(
        sa.text(
            "SELECT count(*) FROM (SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1) d"
        )
    ).scalar():
        raise RuntimeError(
            "Case-insensitive email duplicates exist. Resolve them before upgrading; no records changed."
        )
    op.add_column("users", sa.Column("password_hash", sa.Text()))
    op.add_column("users", sa.Column("recovery_hash", sa.String(64)))
    op.add_column("users", sa.Column("last_search_at", sa.DateTime()))
    op.create_index(
        "uq_users_email_normalized", "users", [sa.text("lower(email)")], unique=True
    )
    op.add_column(
        "jobs",
        sa.Column("owner_id", UUID(), sa.ForeignKey("users.id", ondelete="CASCADE")),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "source_kind", sa.String(30), server_default="manual", nullable=False
        ),
    )
    op.add_column("jobs", sa.Column("source_board", sa.String(100)))
    op.add_column("jobs", sa.Column("last_verified_at", sa.DateTime()))
    op.drop_constraint("jobs_job_url_key", "jobs", type_="unique")
    op.drop_index("uq_jobs_platform_posting", table_name="jobs")
    scope = "coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)"
    op.create_index(
        "uq_jobs_scoped_url", "jobs", [sa.text(scope), "job_url"], unique=True
    )
    op.create_index(
        "uq_jobs_scoped_posting",
        "jobs",
        [sa.text(scope), "platform", "platform_job_id"],
        unique=True,
        postgresql_where=sa.text(
            "platform_job_id IS NOT NULL AND btrim(platform_job_id) <> ''"
        ),
    )
    op.create_table(
        "resumes",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column(
            "user_id",
            UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("media_type", sa.String(100), nullable=False),
        sa.Column("file_data", sa.LargeBinary(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=False),
        sa.Column("skills", JSONB(), nullable=False),
        sa.Column("preferred_roles", JSONB(), nullable=False),
        sa.Column("experience", sa.Text(), nullable=False),
        sa.Column("location", sa.String(255), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("confirmed_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_resumes_user_created", "resumes", ["user_id", "created_at"])
    op.create_table(
        "user_jobs",
        sa.Column(
            "user_id",
            UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "job_id",
            UUID(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("saved_at", sa.DateTime(), nullable=False),
        sa.Column("match_details", JSONB(), nullable=False),
        sa.Column("match_score", sa.Integer(), nullable=False),
    )
    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_sessions_user", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expiry", "user_sessions", ["expires_at"])
    op.create_table(
        "auth_attempts",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("bucket", sa.String(64), nullable=False),
        sa.Column("attempted_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_auth_attempts_bucket_time", "auth_attempts", ["bucket", "attempted_at"]
    )
    # Existing demo users remain passwordless and inaccessible to the new auth system.
    # Existing demo records remain untouched and are not assigned to new accounts.


def downgrade():
    raise RuntimeError(
        "Restore a reviewed backup to downgrade; private account and resume data must not be silently dropped."
    )
