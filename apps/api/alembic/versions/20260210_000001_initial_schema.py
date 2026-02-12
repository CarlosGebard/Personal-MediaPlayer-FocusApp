"""initial schema

Revision ID: 20260210_000001
Revises:
Create Date: 2026-02-10 00:00:01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260210_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    goal_type_enum = sa.Enum(
        "time",
        "count",
        "boolean",
        name="goal_type",
    )

    op.create_table(
        "goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("goal_type", goal_type_enum, nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "focus_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "goal_id",
            sa.Integer(),
            sa.ForeignKey("goals.id", ondelete="SET NULL"),
        ),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "paused_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "goal_revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "goal_id",
            sa.Integer(),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("target_value", sa.Integer(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "goal_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "goal_id",
            sa.Integer(),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "focus_session_id",
            sa.Integer(),
            sa.ForeignKey("focus_sessions.id", ondelete="SET NULL"),
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("goal_id", "date", "focus_session_id"),
    )


def downgrade() -> None:
    op.drop_table("goal_logs")
    op.drop_table("goal_revisions")
    op.drop_table("focus_sessions")
    op.drop_table("goals")
    op.drop_table("users")
    op.drop_table("system_settings")

    goal_type_enum = sa.Enum(
        "time",
        "count",
        "boolean",
        name="goal_type",
    )
    goal_type_enum.drop(op.get_bind(), checkfirst=True)
