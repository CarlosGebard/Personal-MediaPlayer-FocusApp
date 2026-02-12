import React, { useEffect, useMemo, useState } from "react";
import { api, Goal, GoalRevision } from "../lib/api";

const APP_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || "UTC";

type DayBucket = {
  key: string;
  label: string;
  date: Date;
};

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

function buildWindow(endDate: Date): DayBucket[] {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - 9);

  const days: DayBucket[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push({
      key: formatDateKey(d),
      label: `${d.getDate()}`,
      date: new Date(d),
    });
  }
  return days;
}

function getActiveTarget(revisions: GoalRevision[], dayKey: string): number {
  let chosen: GoalRevision | null = null;
  for (const rev of revisions) {
    const starts = rev.valid_from <= dayKey;
    const ends = rev.valid_to === null || rev.valid_to >= dayKey;
    if (!starts || !ends) continue;
    if (!chosen || rev.valid_from > chosen.valid_from) {
      chosen = rev;
    }
  }
  return chosen?.target_value ?? 0;
}

export function GoalCompletionTable() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [revisionsByGoal, setRevisionsByGoal] = useState<Record<number, GoalRevision[]>>({});
  const [logsByGoalDate, setLogsByGoalDate] = useState<Record<string, number>>({});
  const [windowEnd, setWindowEnd] = useState<Date>(() => {
    const d = todayInTimeZone(APP_TIMEZONE);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const days = useMemo(() => buildWindow(windowEnd), [windowEnd]);
  const displayDays = useMemo(() => [...days].reverse(), [days]);

  useEffect(() => {
    loadGoalsAndRevisions();
  }, []);

  useEffect(() => {
    if (goals.length === 0) return;
    loadRangeLogs(days[0].key, days[days.length - 1].key);
  }, [goals, days]);

  async function loadGoalsAndRevisions() {
    setLoading(true);
    setError("");
    try {
      const goalsResp = await api.goals(200, 0);
      const activeGoals = goalsResp.items.filter((g) => g.is_active);
      setGoals(activeGoals);

      const revisionsResp = await Promise.all(
        activeGoals.map((goal) => api.goalRevisions(goal.id))
      );
      const map: Record<number, GoalRevision[]> = {};
      activeGoals.forEach((goal, index) => {
        map[goal.id] = revisionsResp[index].items;
      });
      setRevisionsByGoal(map);
    } catch (err) {
      setError((err as Error).message || "Failed to load goals.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRangeLogs(start: string, end: string) {
    setLoading(true);
    setError("");
    try {
      const logsResp = await api.logsByDateRange({
        start_date: start,
        end_date: end,
        limit: 500,
        offset: 0,
      });
      const buckets: Record<string, number> = {};
      for (const log of logsResp.items) {
        const key = `${log.goal_id}|${log.date}`;
        buckets[key] = (buckets[key] || 0) + log.value;
      }
      setLogsByGoalDate(buckets);
    } catch (err) {
      setError((err as Error).message || "Failed to load period logs.");
    } finally {
      setLoading(false);
    }
  }

  function shiftBackTenDays() {
    setWindowEnd((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 10);
      return next;
    });
  }

  function shiftForwardTenDays() {
    const today = todayInTimeZone(APP_TIMEZONE);
    today.setHours(0, 0, 0, 0);
    setWindowEnd((prev) => {
      const candidate = new Date(prev);
      candidate.setDate(prev.getDate() + 10);
      if (candidate > today) return today;
      return candidate;
    });
  }

  const atTodayWindow = useMemo(() => {
    const today = todayInTimeZone(APP_TIMEZONE);
    today.setHours(0, 0, 0, 0);
    return windowEnd.getTime() >= today.getTime();
  }, [windowEnd]);

  return (
    <div className="card stats-table-card">
      <div className="stats-table-header">
        <div>
          <h3>Target Checks</h3>
          <div className="chat-subtitle">Every 10 days, marks `X` when target is completed.</div>
        </div>
        <div className="stats-table-nav">
          <button className="btn btn-ghost btn-sm" type="button" onClick={shiftBackTenDays}>
            ← 10d
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={shiftForwardTenDays}
            disabled={atTodayWindow}
          >
            10d →
          </button>
        </div>
      </div>

      <div className="chat-subtitle">
        {displayDays[0].key} → {displayDays[displayDays.length - 1].key}
      </div>

      {loading ? (
        <div className="chat-subtitle">Loading table...</div>
      ) : error ? (
        <div className="chat-subtitle">{error}</div>
      ) : goals.length === 0 ? (
        <div className="chat-subtitle">No active goals.</div>
      ) : (
        <div className="stats-table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Habit</th>
                {displayDays.map((d) => (
                  <th key={d.key}>{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => (
                <tr key={goal.id}>
                  <td>{goal.name}</td>
                  {displayDays.map((day) => {
                    const done = logsByGoalDate[`${goal.id}|${day.key}`] || 0;
                    const target =
                      goal.goal_type === "boolean"
                        ? 1
                        : getActiveTarget(revisionsByGoal[goal.id] || [], day.key);
                    const hit = target > 0 && done >= target;
                    return (
                      <td
                        key={`${goal.id}-${day.key}`}
                        title={`${done}/${target}`}
                        className={hit ? "ok" : ""}
                      >
                        {hit ? "X" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
