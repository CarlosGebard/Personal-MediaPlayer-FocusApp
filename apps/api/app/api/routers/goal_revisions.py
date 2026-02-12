from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.status import HTTP_404_NOT_FOUND

from app.db.session import get_db
from app.models.goal import Goal
from app.models.goalrevision import GoalRevision
from app.models.user import User
from app.schemas.goalrevision import GoalRevisionCreate, GoalRevisionOut, GoalRevisionsOut
from app.services.auth import get_current_user


router = APIRouter(prefix="/api/goals/{goal_id}/revisions", tags=["goal_revisions"], dependencies=[Depends(get_current_user)])


def _ensure_owns(goal: Goal | None, user_id: int) -> Goal:
    if not goal or goal.user_id != user_id:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.post(
    "",
    response_model=GoalRevisionOut,
    status_code=201,
    summary="Create goal revision",
    description="Creates a new revision for a goal.",
    responses={
        201: {"description": "Revision created"},
        404: {"description": "Goal not found"},
    },
)
def create_revision(
    goal_id: int,
    payload: GoalRevisionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)

    current = (
        db.execute(
            select(GoalRevision)
            .where(GoalRevision.goal_id == goal.id)
            .where(GoalRevision.valid_to.is_(None))
            .order_by(GoalRevision.valid_from.desc())
        )
        .scalars()
        .first()
    )
    if current and payload.valid_from:
        current.valid_to = payload.valid_from

    revision = GoalRevision(
        goal_id=goal.id,
        target_value=payload.target_value,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return revision


@router.get(
    "",
    response_model=GoalRevisionsOut,
    summary="List revisions",
    description="Lists revisions for a goal.",
    responses={404: {"description": "Goal not found"}},
)
def list_revisions(
    goal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    goal = _ensure_owns(db.get(Goal, goal_id), user.id)

    total = db.execute(
        select(func.count()).select_from(GoalRevision).where(GoalRevision.goal_id == goal.id)
    ).scalar_one()
    items = (
        db.execute(
            select(GoalRevision)
            .where(GoalRevision.goal_id == goal.id)
            .order_by(GoalRevision.valid_from.desc())
        )
        .scalars()
        .all()
    )
    return {"items": items, "total": total}
