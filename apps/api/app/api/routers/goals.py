from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_404_NOT_FOUND

from app.db.session import get_db
from app.models.goal import Goal
from app.models.goallog import GoalLog
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalOut, GoalsOut, GoalUpdate
from app.services.auth import get_current_user
from app.schemas.goal_heatmap import GoalHeatmapOut


router = APIRouter(prefix="/api/goals", tags=["goals"], dependencies=[Depends(get_current_user)])


def _ensure_owns(goal: Goal | None, user_id: int) -> Goal:
    if not goal or goal.user_id != user_id:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.post(
    "",
    response_model=GoalOut,
    status_code=201,
    summary="Create goal",
    description="Creates a goal for the authenticated user.",
    responses={
        201: {"description": "Goal created"},
        400: {"description": "Invalid data"},
    },
)
def create_goal(
    payload: GoalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = Goal(
        user_id=user.id,
        name=payload.name.strip(),
        goal_type=payload.goal_type.name,
        is_active=payload.is_active,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.get(
    "",
    response_model=GoalsOut,
    summary="List goals",
    description="Lists goals for the authenticated user with pagination.",
)
def list_goals(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    total = db.execute(
        select(func.count()).select_from(Goal).where(Goal.user_id == user.id)
    ).scalar_one()
    items = (
        db.execute(
            select(Goal)
            .where(Goal.user_id == user.id)
            .order_by(Goal.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return {"items": items, "total": total}


@router.get(
    "/{goal_id}",
    response_model=GoalOut,
    summary="Get goal",
    description="Gets a goal by id.",
    responses={404: {"description": "Goal not found"}},
)
def get_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)
    return goal


@router.patch(
    "/{goal_id}",
    response_model=GoalOut,
    summary="Update goal",
    description="Updates goal fields partially.",
    responses={
        400: {"description": "Invalid data"},
        404: {"description": "Goal not found"},
    },
)
def update_goal(
    goal_id: int,
    payload: GoalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="Name is required")
        goal.name = name
    if payload.goal_type is not None:
        goal.goal_type = payload.goal_type
    if payload.is_active is not None:
        goal.is_active = payload.is_active

    db.commit()
    db.refresh(goal)
    return goal


@router.delete(
    "/{goal_id}",
    status_code=204,
    summary="Delete goal",
    description="Deletes a goal for the authenticated user.",
    responses={404: {"description": "Goal not found"}},
)
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)
    db.delete(goal)
    db.commit()
    return None


@router.get(
    "/{goal_id}/heatmap",
    response_model=GoalHeatmapOut,
    summary="Goal heatmap",
    description="Returns per-day counts for a goal in a date range.",
    responses={400: {"description": "Invalid date range"}, 404: {"description": "Goal not found"}},
)
def goal_heatmap(
    goal_id: int,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if from_date > to_date:
        raise HTTPException(status_code=HTTP_400_BAD_REQUEST, detail="'from' must be <= 'to'")

    goal = _ensure_owns(db.get(Goal, goal_id), user.id)

    rows = db.execute(
        select(GoalLog.date, func.count())
        .where(GoalLog.goal_id == goal.id)
        .where(GoalLog.date >= from_date)
        .where(GoalLog.date <= to_date)
        .group_by(GoalLog.date)
        .order_by(GoalLog.date)
    ).all()
    counts_by_date = {row[0]: int(row[1]) for row in rows}

    values = []
    day = from_date
    while day <= to_date:
        values.append({"date": day, "count": counts_by_date.get(day, 0)})
        day += timedelta(days=1)

    return GoalHeatmapOut(
    goal_id=goal.id,
    **{
        "from": from_date,
        "to": to_date,
    },
    unit="day",
    values=values,
)
