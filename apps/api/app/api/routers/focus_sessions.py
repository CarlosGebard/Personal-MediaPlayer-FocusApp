from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_409_CONFLICT

from app.db.session import get_db
from app.models.focussession import FocusSession
from app.models.user import User
from app.schemas.focus_session import FocusSessionCreate, FocusSessionOut, FocusSessionsOut
from app.services.focus import utcnow, is_expired, active_session, create_focus_log
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/focus", tags=["focus_sessions"], dependencies=[Depends(get_current_user)])

def _ensure_owns_session(session: FocusSession | None, user_id: int) -> FocusSession:
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post(
    "/sessions",
    response_model=FocusSessionOut,
    status_code=201,
    summary="Create focus session",
    description="Creates a focus session. Returns conflict if an active session exists.",
    responses={
        201: {"description": "Session created"},
        400: {"description": "Invalid data"},
        409: {"description": "Active session exists"},
    },
)
def create_session(
    payload: FocusSessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.duration_seconds % 60 != 0:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Duration must be in 60 second steps")

    existing = active_session(db, user.id)
    if existing:
        now = utcnow()
        if not is_expired(existing, now):
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Active session exists")
        existing.status = "completed"
        existing.ended_at = now
        create_focus_log(db, existing)
        db.commit()

    session = FocusSession(
        user_id=user.id,
        goal_id=payload.goal_id,
        duration_seconds=payload.duration_seconds,
        paused_seconds=0,
        status="running",
        started_at=utcnow(),
        ended_at=None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.post(
    "/sessions/{session_id}/complete",
    response_model=FocusSessionOut,
    summary="Complete session",
    description="Marks the session as completed and creates a log if applicable.",
    responses={
        400: {"description": "Session already finished"},
        404: {"description": "Session not found"},
    },
)
def complete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _ensure_owns_session(db.get(FocusSession, session_id), user.id)
    if session.status in {"completed", "canceled"}:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Session already finished")

    now = utcnow()

    session.status = "completed"
    session.ended_at = now
    create_focus_log(db, session)
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/sessions/{session_id}/pause",
    response_model=FocusSessionOut,
    summary="Pause session",
    description="Pauses a running focus session.",
    responses={
        400: {"description": "Session is not running"},
        404: {"description": "Session not found"},
    },
)
def pause_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _ensure_owns_session(db.get(FocusSession, session_id), user.id)
    if session.status != "running":
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Session is not running")
    session.status = "paused"
    session.ended_at = utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/sessions/{session_id}/resume",
    response_model=FocusSessionOut,
    summary="Resume session",
    description="Resumes a paused focus session.",
    responses={
        400: {"description": "Session is not paused"},
        404: {"description": "Session not found"},
    },
)
def resume_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _ensure_owns_session(db.get(FocusSession, session_id), user.id)
    if session.status != "paused":
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Session is not paused")
    now = utcnow()
    if session.ended_at:
        session.paused_seconds += int((now - session.ended_at).total_seconds())
    session.status = "running"
    session.ended_at = None
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/sessions/{session_id}/cancel",
    response_model=FocusSessionOut,
    summary="Cancel session",
    description="Cancels a focus session.",
    responses={
        400: {"description": "Session already finished"},
        404: {"description": "Session not found"},
    },
)
def cancel_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = _ensure_owns_session(db.get(FocusSession, session_id), user.id)
    if session.status in {"completed", "canceled"}:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Session already finished")
    session.status = "canceled"
    session.ended_at = utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.get(
    "/sessions",
    response_model=FocusSessionsOut,
    summary="List sessions",
    description="Lists sessions with pagination.",
)
def list_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    total = db.execute(
        select(func.count()).select_from(FocusSession).where(FocusSession.user_id == user.id)
    ).scalar_one()
    items = (
        db.execute(
            select(FocusSession)
            .where(FocusSession.user_id == user.id)
            .order_by(FocusSession.started_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return {"items": items, "total": total}


@router.get(
    "/sessions/current",
    response_model=FocusSessionOut,
    status_code=200,
    summary="Current session",
    description="Returns the current active session if any.",
)
def get_current_session(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = active_session(db, user.id)
    if not session:
        return Response(status_code=204)

    now = utcnow()
    if is_expired(session, now):
        session.status = "completed"
        session.ended_at = now
        create_focus_log(db, session)
        db.commit()
        return Response(status_code=204)

    return session
