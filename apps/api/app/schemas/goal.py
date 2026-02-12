from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.goaltype import GoalType


class GoalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    goal_type: GoalType
    is_active: bool = True


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    goal_type: GoalType | None = None
    is_active: bool | None = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    goal_type: GoalType
    is_active: bool
    created_at: datetime


class GoalsOut(BaseModel):
    items: list[GoalOut]
    total: int



