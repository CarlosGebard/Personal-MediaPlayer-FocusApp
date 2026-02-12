from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class GoalLogCreate(BaseModel):
    date: date
    value: int = Field(..., ge=1)


class GoalLogUpdate(BaseModel):
    value: int = Field(..., ge=1)


class GoalLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    goal_id: int
    focus_session_id: int | None
    date: date
    value: int
    source: str
    created_at: datetime


class GoalLogsOut(BaseModel):
    items: list[GoalLogOut]
    total: int
