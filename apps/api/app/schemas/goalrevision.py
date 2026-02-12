from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class GoalRevisionCreate(BaseModel):
    target_value: int = Field(..., ge=1)
    valid_from: date
    valid_to: date | None = None


class GoalRevisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    goal_id: int
    target_value: int
    valid_from: date
    valid_to: date | None
    created_at: datetime


class GoalRevisionsOut(BaseModel):
    items: list[GoalRevisionOut]
    total: int
