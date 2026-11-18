"""Adopt the learning schema or create a fresh V1 database without dropping data."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0001_demo"
down_revision = None
branch_labels = None
depends_on = None

STATUSES = "'discovered','matched','ready_for_review','application_started','applied','assessment','interview','rejected','withdrawn','offer','manual_action_required','failed'"


def upgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = set(inspector.get_table_names())
    definitions = {
        "users": [
            ("id", UUID(), False),
            ("email", sa.String(255), False),
            ("full_name", sa.String(255), False),
            ("target_role", sa.String(255), True),
            ("location_pref", sa.String(255), True),
            ("remote_pref", sa.String(50), True),
            ("experience_level", sa.String(50), True),
            ("daily_limit", sa.Integer(), True),
            ("created_at", sa.DateTime(), True),
        ],
        "jobs": [
            ("id", UUID(), False),
            ("platform", sa.String(), False),
            ("platform_job_id", sa.String(), True),
            ("company", sa.String(), False),
            ("title", sa.String(), False),
            ("location", sa.String(), True),
            ("job_url", sa.Text(), False),
            ("description_raw", sa.Text(), True),
            ("description_structured", JSONB(), True),
            ("status", sa.String(), True),
            ("discovered_at", sa.DateTime(), True),
        ],
        "applications": [
            ("id", UUID(), False),
            ("user_id", UUID(), False),
            ("job_id", UUID(), False),
            ("resume_version_id", UUID(), True),
            ("status", sa.String(50), True),
            ("applied_at", sa.DateTime(), True),
            ("notes", sa.Text(), True),
            ("match_score", sa.Numeric(5, 2), True),
            ("match_details", JSONB(), True),
            ("created_at", sa.DateTime(), True),
            ("updated_at", sa.DateTime(), True),
        ],
    }
    # Refuse unknown shapes before doing any DDL. PostgreSQL rolls the whole revision back on failure.
    for table, fields in definitions.items():
        if table not in tables:
            continue
        columns = {c["name"]: c for c in inspector.get_columns(table)}
        for name, datatype, nullable in fields:
            if (
                name not in columns
                or columns[name]["type"]._type_affinity != datatype._type_affinity
            ):
                raise RuntimeError(
                    f"Incompatible existing column: {table}.{name}. Review schema before migration."
                )
            if not nullable and columns[name]["nullable"]:
                raise RuntimeError(
                    f"Existing {table}.{name} must be NOT NULL before migration."
                )
        if inspector.get_pk_constraint(table)["constrained_columns"] != ["id"]:
            raise RuntimeError(f"Existing {table} must have id as its primary key.")
    if "jobs" in tables:
        duplicates = connection.execute(
            sa.text(
                "SELECT count(*) FROM (SELECT platform, platform_job_id FROM jobs WHERE platform_job_id IS NOT NULL AND btrim(platform_job_id) <> '' GROUP BY platform, platform_job_id HAVING count(*) > 1) d"
            )
        ).scalar()
        if duplicates:
            raise RuntimeError(
                "Duplicate platform/job-ID pairs exist. Resolve them manually; no records were changed."
            )
    for table, fields in definitions.items():
        if table in tables:
            continue
        constraints = []
        if table == "users":
            constraints = [
                sa.UniqueConstraint("email", name="users_email_key"),
                sa.CheckConstraint(
                    "remote_pref IN ('remote','hybrid','onsite','any')",
                    name="users_remote_pref_check",
                ),
                sa.CheckConstraint(
                    "experience_level IN ('fresher','junior','mid','senior')",
                    name="users_experience_level_check",
                ),
            ]
        if table == "jobs":
            constraints = [sa.UniqueConstraint("job_url", name="jobs_job_url_key")]
        if table == "applications":
            constraints = [
                sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
                sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
                sa.UniqueConstraint(
                    "user_id", "job_id", name="applications_user_id_job_id_key"
                ),
                sa.CheckConstraint(
                    f"status IN ({STATUSES})", name="applications_status_check"
                ),
            ]
        op.create_table(
            table,
            *(
                sa.Column(name, datatype, nullable=nullable, primary_key=name == "id")
                for name, datatype, nullable in fields
            ),
            *constraints,
        )
    # Verify integrity constraints on adopted tables, instead of silently accepting weaker schemas.
    inspector = sa.inspect(connection)
    for table, required in [
        ("jobs", {"job_url"}),
        ("users", {"email"}),
        ("applications", {"user_id", "job_id"}),
    ]:
        unique_sets = [
            set(c["column_names"]) for c in inspector.get_unique_constraints(table)
        ]
        if required not in unique_sets:
            raise RuntimeError(
                f"Missing unique constraint on {table}: {sorted(required)}. Review schema first."
            )
    fks = inspector.get_foreign_keys("applications")
    for column, target in [("user_id", "users"), ("job_id", "jobs")]:
        if not any(
            f["constrained_columns"] == [column]
            and f["referred_table"] == target
            and f["referred_columns"] == ["id"]
            for f in fks
        ):
            raise RuntimeError(
                f"Missing applications.{column} foreign key. Review schema first."
            )
    if connection.execute(
        sa.text(
            f"SELECT count(*) FROM applications WHERE status IS NOT NULL AND status NOT IN ({STATUSES})"
        )
    ).scalar():
        raise RuntimeError(
            "Unsupported application statuses exist. No records were changed."
        )
    if not any(
        c["name"] == "applications_status_check"
        for c in inspector.get_check_constraints("applications")
    ):
        op.create_check_constraint(
            "applications_status_check", "applications", f"status IN ({STATUSES})"
        )
    if "is_demo" not in {c["name"] for c in inspector.get_columns("jobs")}:
        op.add_column(
            "jobs",
            sa.Column(
                "is_demo", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )
    if "uq_jobs_platform_posting" not in {
        i["name"] for i in inspector.get_indexes("jobs")
    }:
        op.create_index(
            "uq_jobs_platform_posting",
            "jobs",
            ["platform", "platform_job_id"],
            unique=True,
            postgresql_where=sa.text(
                "platform_job_id IS NOT NULL AND btrim(platform_job_id) <> ''"
            ),
        )
    op.create_table(
        "application_status_history",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column(
            "application_id",
            UUID(),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_status", sa.String(50)),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_application_status_history_application_id",
        "application_status_history",
        ["application_id"],
    )
    op.create_table(
        "owner_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_owner_sessions_expires_at", "owner_sessions", ["expires_at"])
    op.create_table(
        "login_attempts",
        sa.Column("id", UUID(), primary_key=True),
        sa.Column("attempted_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_login_attempts_attempted_at", "login_attempts", ["attempted_at"]
    )
    for table, column in [
        ("jobs", "company"),
        ("applications", "user_id"),
        ("applications", "job_id"),
        ("applications", "status"),
    ]:
        name = f"idx_{table}_{column}"
        if name not in {i["name"] for i in inspector.get_indexes(table)}:
            op.create_index(name, table, [column])


def downgrade():
    raise RuntimeError(
        "V1 adoption is intentionally non-destructive. Restore a reviewed backup to roll back."
    )
