from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class DailyStatsOut(BaseModel):
    date: date
    goal_value_sum: int
    goal_logs_count: int
    focus_seconds: int
    focus_sessions_count: int


class WeeklyDayStats(BaseModel):
    date: date
    goal_value_sum: int
    focus_seconds: int


class WeeklyStatsOut(BaseModel):
    start_date: date
    end_date: date
    goal_value_sum: int
    focus_seconds: int
    days: list[WeeklyDayStats]


class YearlyMonthStats(BaseModel):
    month: int
    goal_value_sum: int
    focus_seconds: int


class YearlyStatsOut(BaseModel):
    year: int
    goal_value_sum: int
    focus_seconds: int
    months: list[YearlyMonthStats]
