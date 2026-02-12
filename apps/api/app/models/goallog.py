from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GoalLog(Base):
    __tablename__ = "goal_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[int] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
    )
    focus_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("focus_sessions.id", ondelete="SET NULL")
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # minutos, unidades, o 1 (boolean)
    value: Mapped[int] = mapped_column(Integer, nullable=False)

    source: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # manual | focus | import | automation

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("goal_id", "date", "focus_session_id"),
    )
