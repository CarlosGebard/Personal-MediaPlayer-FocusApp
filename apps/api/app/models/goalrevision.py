from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GoalRevision(Base):
    __tablename__ = "goal_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    goal_id: Mapped[int] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
    )

    # para time: minutos / día
    # para count: unidades / día
    # para boolean: siempre 1
    target_value: Mapped[int] = mapped_column(Integer, nullable=False)

    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
