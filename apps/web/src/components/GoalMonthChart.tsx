import React, { useEffect, useMemo, useState } from "react";
import { api, Goal } from "../lib/api";

const APP_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || "UTC";

type DayPoint = {
  day: number;
  minutes: number;
};

function todayInTimeZone(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value || "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value || "1");
  const day = Number(parts.find((p) => p.type === "day")?.value || "1");
  return new Date(year, month - 1, day);
}

function formatMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthRange(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end };
}

function buildMonthOptions(count = 12) {
  const options: string[] = [];
  const now = todayInTimeZone(APP_TIMEZONE);
  now.setDate(1);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now);
    d.setMonth(now.getMonth() - i);
    options.push(formatMonthKey(d));
  }
  return options;
}

function labelMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

export function GoalMonthChart() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [monthKey, setMonthKey] = useState(formatMonthKey(todayInTimeZone(APP_TIMEZONE)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [points, setPoints] = useState<DayPoint[]>([]);

  const monthOptions = useMemo(() => buildMonthOptions(12), []);

  useEffect(() => {
    api
      .goals(200, 0)
      .then((res) => {
        const timeGoals = res.items.filter((g) => g.goal_type === "time");
        setGoals(timeGoals);
        if (timeGoals.length > 0 && goalId === null) {
          setGoalId(timeGoals[0].id);
        }
      })
      .catch(() => {
        setGoals([]);
      });
  }, [goalId]);

  useEffect(() => {
    if (!goalId) return;
    load(goalId, monthKey);
  }, [goalId, monthKey]);

  async function load(selectedGoalId: number, selectedMonth: string) {
    setLoading(true);
    setError("");
    try {
      const { start, end } = monthRange(selectedMonth);
      const from = formatDateKey(start);
      const to = formatDateKey(end);
      const logs = await api.logsByDateRange({ start_date: from, end_date: to, limit: 500, offset: 0 });
      const byDay: Record<number, number> = {};
      for (const log of logs.items) {
        if (log.goal_id !== selectedGoalId) continue;
        const day = Number(log.date.split("-")[2] || "0");
        if (!day) continue;
        byDay[day] = (byDay[day] || 0) + log.value;
      }
      const daysInMonth = end.getDate();
      const nextPoints: DayPoint[] = [];
      for (let d = 1; d <= daysInMonth; d += 1) {
        nextPoints.push({ day: d, minutes: byDay[d] || 0 });
      }
      setPoints(nextPoints);
    } catch (err) {
      setError((err as Error).message || "Failed to load chart.");
    } finally {
      setLoading(false);
    }
  }

  const dataMax = Math.max(0, ...points.map((p) => p.minutes));
  const stepMinutes = 30;
  const maxMinutes = Math.max(stepMinutes, Math.ceil(dataMax / stepMinutes) * stepMinutes);
  const totalHours = points.reduce((acc, p) => acc + p.minutes, 0) / 60;

  const yTicks = useMemo(() => {
    const list: number[] = [];
    for (let t = 0; t <= maxMinutes; t += stepMinutes) {
      list.push(t);
    }
    return list;
  }, [maxMinutes]);

  return (
    <div className="card stats-card">
      <div className="stats-header">
        <div>
          <h3>Goal hours</h3>
          <div className="chat-subtitle">Hours completed for the selected goal in a month.</div>
        </div>
        <div className="chat-subtitle">{totalHours.toFixed(1)} h total</div>
      </div>

      <div className="stats-controls">
        <select
          className="chat-input chat-select chat-select--compact"
          value={goalId ?? ""}
          onChange={(event) => setGoalId(event.target.value ? Number(event.target.value) : null)}
          disabled={goals.length === 0}
        >
          {goals.length === 0 ? (
            <option value="">No time goals</option>
          ) : (
            goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))
          )}
        </select>
        <select
          className="chat-input chat-select chat-select--compact"
          value={monthKey}
          onChange={(event) => setMonthKey(event.target.value)}
        >
          {monthOptions.map((option) => (
            <option key={option} value={option}>
              {labelMonth(option)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="chat-subtitle">Loading chart...</div>
      ) : error ? (
        <div className="chat-subtitle">{error}</div>
      ) : (
        <div className="stats-chart-wrap">
          <div className="stats-y-axis">
            {yTicks.map((tick, index) => (
              <div key={`${tick}-${index}`} className="stats-y-tick">
                {tick}
              </div>
            ))}
          </div>
          <div className="stats-chart-area">
            <div className="stats-chart">
              {points.map((point) => {
                const height = maxMinutes > 0 ? (point.minutes / maxMinutes) * 100 : 0;
                return (
                  <div key={point.day} className="stats-bar">
                    <div className="stats-bar-fill" style={{ height: `${height}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="stats-day-labels">
              {points.map((point) => (
                <div key={`label-${point.day}`} className="stats-day-label">
                  {point.day % 5 === 0 ? point.day : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
