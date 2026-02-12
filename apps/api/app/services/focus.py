from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.focussession import FocusSession
from app.models.goallog import GoalLog

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def elapsed_seconds(session: FocusSession, now: datetime) -> int:
    paused_seconds = session.paused_seconds or 0
    effective_now = now
    if session.status == "paused" and session.ended_at:
        effective_now = session.ended_at
    elapsed = int((effective_now - session.started_at).total_seconds()) - paused_seconds
    return max(0, elapsed)


def is_expired(session: FocusSession, now: datetime) -> bool:
    return elapsed_seconds(session, now) >= session.duration_seconds


def active_session(db: Session, user_id: int) -> FocusSession | None:
    return (
        db.execute(
            select(FocusSession)
            .where(FocusSession.user_id == user_id)
            .where(FocusSession.status.in_(["running", "paused"]))
            .order_by(FocusSession.started_at.desc())
        )
        .scalars()
        .first()
    )

def create_focus_log(db: Session, session: FocusSession) -> None:
    if not session.goal_id:
        return
    minutes = max(1, session.duration_seconds // 60)
    log = GoalLog(
        goal_id=session.goal_id,
        focus_session_id=session.id,
        date=session.started_at.date(),
        value=minutes,
        source="focus",
    )
    db.add(log)
