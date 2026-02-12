from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.status import HTTP_404_NOT_FOUND

from app.db.session import get_db
from app.models.goal import Goal
from app.models.goallog import GoalLog
from app.models.user import User
from app.schemas.goallog import GoalLogCreate, GoalLogOut, GoalLogsOut, GoalLogUpdate
from app.services.auth import get_current_user


router = APIRouter(prefix="/api", tags=["goal_logs"], dependencies=[Depends(get_current_user)])


def _ensure_owns(goal: Goal | None, user_id: int) -> Goal:
    if not goal or goal.user_id != user_id:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.post(
    "/goals/{goal_id}/logs",
    response_model=GoalLogOut,
    status_code=201,
    summary="Create manual log",
    description="Creates a manual log entry for a goal.",
    responses={
        201: {"description": "Log created"},
        404: {"description": "Goal not found"},
    },
)
def create_goal_log(
    goal_id: int,
    payload: GoalLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)
    log = GoalLog(
        goal_id=goal.id,
        focus_session_id=None,
        date=payload.date,
        value=payload.value,
        source="manual",
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get(
    "/goals/{goal_id}/logs",
    response_model=GoalLogsOut,
    summary="List goal logs",
    description="Lists logs for a goal with pagination.",
    responses={404: {"description": "Goal not found"}},
)
def list_goal_logs(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)
    total = db.execute(
        select(func.count()).select_from(GoalLog).where(GoalLog.goal_id == goal.id)
    ).scalar_one()
    items = (
        db.execute(
            select(GoalLog)
            .where(GoalLog.goal_id == goal.id)
            .order_by(GoalLog.date.desc(), GoalLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return {"items": items, "total": total}


@router.patch(
    "/goals/{goal_id}/logs/{log_id}",
    response_model=GoalLogOut,
    summary="Update manual log",
    description="Updates a manual log entry value.",
    responses={
        404: {"description": "Goal or log not found"},
    },
)
def update_goal_log(
    goal_id: int,
    log_id: int,
    payload: GoalLogUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)
    log = db.get(GoalLog, log_id)
    if not log or log.goal_id != goal.id or log.focus_session_id is not None:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Log not found")

    log.value = payload.value
    db.commit()
    db.refresh(log)
    return log


@router.delete(
    "/goals/{goal_id}/logs/{log_id}",
    status_code=204,
    summary="Delete manual log",
    description="Deletes a manual log entry.",
    responses={404: {"description": "Goal or log not found"}},
)
def delete_goal_log(
    goal_id: int,
    log_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)
    log = db.get(GoalLog, log_id)
    if not log or log.goal_id != goal.id or log.focus_session_id is not None:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Log not found")
    db.delete(log)
    db.commit()
    return None


@router.get(
    "/logs",
    response_model=GoalLogsOut,
    summary="List logs by range",
    description="Lists logs filtered by date range.",
)
def list_logs_by_date_range(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    base = select(GoalLog).join(Goal, GoalLog.goal_id == Goal.id).where(Goal.user_id == user.id)
    if start_date:
        base = base.where(GoalLog.date >= start_date)
    if end_date:
        base = base.where(GoalLog.date <= end_date)

    total_query = (
        select(func.count())
        .select_from(GoalLog)
        .join(Goal, GoalLog.goal_id == Goal.id)
        .where(Goal.user_id == user.id)
    )
    if start_date:
        total_query = total_query.where(GoalLog.date >= start_date)
    if end_date:
        total_query = total_query.where(GoalLog.date <= end_date)

    total = db.execute(total_query).scalar_one()

    items = (
        db.execute(
            base.order_by(GoalLog.date.desc(), GoalLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return {"items": items, "total": total}
