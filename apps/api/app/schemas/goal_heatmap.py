from datetime import date
from typing import Literal
from pydantic import BaseModel, Field


class HeatmapValue(BaseModel):
    date: date
    count: int


class GoalHeatmapOut(BaseModel):
    goal_id: int
    from_date: date = Field(..., alias="from")
    to_date: date = Field(..., alias="to")
    unit: Literal["day"]
    values: list[HeatmapValue]

    model_config = {
        "populate_by_name": True
    }
