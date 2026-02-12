from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.focussession import FocusSession
from app.models.goallog import GoalLog
from app.models.goal import Goal
from app.models.user import User
from app.schemas.stats import DailyStatsOut, WeeklyDayStats, WeeklyStatsOut, YearlyMonthStats, YearlyStatsOut
from app.services.auth import get_current_user


router = APIRouter(prefix="/api/stats", tags=["stats"], dependencies=[Depends(get_current_user)])


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _daily_aggregates(db: Session, user_id: int, target_date: date) -> tuple[int, int, int, int]:
    goal_value_sum = (
        db.execute(
            select(func.coalesce(func.sum(GoalLog.value), 0))
            .join(Goal, GoalLog.goal_id == Goal.id)
            .where(Goal.user_id == user_id)
            .where(GoalLog.date == target_date)
        )
        .scalar_one()
    )
    goal_logs_count = (
        db.execute(
            select(func.count())
            .select_from(GoalLog)
            .join(Goal, GoalLog.goal_id == Goal.id)
            .where(Goal.user_id == user_id)
            .where(GoalLog.date == target_date)
        )
        .scalar_one()
    )
    focus_seconds = (
        db.execute(
            select(func.coalesce(func.sum(FocusSession.duration_seconds), 0))
            .where(FocusSession.user_id == user_id)
            .where(func.date(FocusSession.started_at) == target_date)
        )
        .scalar_one()
    )
    focus_sessions_count = (
        db.execute(
            select(func.count())
            .select_from(FocusSession)
            .where(FocusSession.user_id == user_id)
            .where(func.date(FocusSession.started_at) == target_date)
        )
        .scalar_one()
    )
    return int(goal_value_sum), int(goal_logs_count), int(focus_seconds), int(focus_sessions_count)


@router.get(
    "/daily",
    response_model=DailyStatsOut,
    summary="Daily stats",
    description="Returns aggregated daily statistics.",
)
def daily_stats(
    date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target_date = date or _utc_today()
    goal_value_sum, goal_logs_count, focus_seconds, focus_sessions_count = _daily_aggregates(
        db, user.id, target_date
    )
    return {
        "date": target_date,
        "goal_value_sum": goal_value_sum,
        "goal_logs_count": goal_logs_count,
        "focus_seconds": focus_seconds,
        "focus_sessions_count": focus_sessions_count,
    }


@router.get(
    "/weekly",
    response_model=WeeklyStatsOut,
    summary="Weekly stats",
    description="Returns aggregated stats for the current week.",
)
def weekly_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    today = _utc_today()
    start_date = today - timedelta(days=today.weekday())
    end_date = start_date + timedelta(days=6)

    days: list[WeeklyDayStats] = []
    total_goal_value = 0
    total_focus_seconds = 0

    for i in range(7):
        day = start_date + timedelta(days=i)
        goal_value_sum, _, focus_seconds, _ = _daily_aggregates(db, user.id, day)
        total_goal_value += goal_value_sum
        total_focus_seconds += focus_seconds
        days.append(
            WeeklyDayStats(
                date=day,
                goal_value_sum=goal_value_sum,
                focus_seconds=focus_seconds,
            )
        )

    return {
        "start_date": start_date,
        "end_date": end_date,
        "goal_value_sum": total_goal_value,
        "focus_seconds": total_focus_seconds,
        "days": days,
    }


@router.get(
    "/yearly",
    response_model=YearlyStatsOut,
    summary="Yearly stats",
    description="Returns aggregated stats for the current year.",
)
def yearly_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    year = _utc_today().year
    months: list[YearlyMonthStats] = []
    total_goal_value = 0
    total_focus_seconds = 0

    for month in range(1, 13):
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)

        goal_value_sum = (
            db.execute(
                select(func.coalesce(func.sum(GoalLog.value), 0))
                .join(Goal, GoalLog.goal_id == Goal.id)
                .where(Goal.user_id == user.id)
                .where(GoalLog.date >= start)
                .where(GoalLog.date < end)
            )
            .scalar_one()
        )
        focus_seconds = (
            db.execute(
                select(func.coalesce(func.sum(FocusSession.duration_seconds), 0))
                .where(FocusSession.user_id == user.id)
                .where(FocusSession.started_at >= start)
                .where(FocusSession.started_at < end)
            )
            .scalar_one()
        )

        total_goal_value += int(goal_value_sum)
        total_focus_seconds += int(focus_seconds)
        months.append(
            YearlyMonthStats(
                month=month,
                goal_value_sum=int(goal_value_sum),
                focus_seconds=int(focus_seconds),
            )
        )

    return {
        "year": year,
        "goal_value_sum": total_goal_value,
        "focus_seconds": total_focus_seconds,
        "months": months,
    }
