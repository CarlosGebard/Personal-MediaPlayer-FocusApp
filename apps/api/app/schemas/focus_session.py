from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FocusSessionCreate(BaseModel):
    duration_seconds: int = Field(..., ge=300, le=7200)
    goal_id: int | None = None


class FocusSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    goal_id: int | None
    duration_seconds: int
    paused_seconds: int
    status: str
    started_at: datetime
    ended_at: datetime | None


class FocusSessionsOut(BaseModel):
    items: list[FocusSessionOut]
    total: int
