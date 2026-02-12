import React, { useEffect, useMemo, useState } from "react";
import { api, GoalRevision } from "../lib/api";
import { GoalMonthChart } from "./GoalMonthChart";
import { GoalCompletionTable } from "./GoalCompletionTable";
import { GifPicker } from "./GifPicker";
import { CollapsibleSection } from "./CollapsibleSection";

type HeatmapMeta = {
  from: string;
  to: string;
  totalGoals: number;
};

type DayCell = {
  date: Date;
  key: string;
  count: number;
};

const APP_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || "UTC";

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);

  const dates: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

function getIntensity(count: number, totalGoals: number) {
  if (totalGoals === 0) return 0;
  return count / totalGoals;
}

function getColor(intensity: number) {
  if (intensity === 0) return "#1e293b";
  if (intensity < 0.25) return "#14532d";
  if (intensity < 0.5) return "#166534";
  if (intensity < 0.75) return "#15803d";
  return "#16a34a";
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

type Props = {
  gifName: string;
  onGifChange: (value: string) => void;
};

export function HeatmapView({ gifName, onGifChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<HeatmapMeta>({
    from: "",
    to: "",
    totalGoals: 0,
  });
  const [cells, setCells] = useState<DayCell[]>([]);
  const [windowEnd, setWindowEnd] = useState<Date>(() => startOfDay(todayInTimeZone(APP_TIMEZONE)));
  const [mobileWindowEnd, setMobileWindowEnd] = useState<Date>(() =>
    startOfDay(todayInTimeZone(APP_TIMEZONE))
  );
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    loadHeatmap();
  }, [windowEnd, mobileWindowEnd, isMobile]);

  async function loadHeatmap() {
    setLoading(true);
    setError("");

    try {
      const goalsResponse = await api.goals(200, 0);
      const activeGoals = goalsResponse.items.filter(g => g.is_active);

      if (activeGoals.length === 0) {
        setMeta({ from: "", to: "", totalGoals: 0 });
        setCells([]);
        return;
      }

      let dates: Date[];
      if (isMobile) {
        const end = startOfDay(mobileWindowEnd);
        const start = new Date(end);
        start.setDate(end.getDate() - 59);
        dates = generateDateRange(start, end);
      } else {
        const end = startOfDay(windowEnd);
        const start = new Date(end);
        start.setMonth(end.getMonth() - 6);
        start.setDate(start.getDate() + 1);
        dates = generateDateRange(start, end);
      }

      if (dates.length === 0) {
        setMeta({ from: "", to: "", totalGoals: activeGoals.length });
        setCells([]);
        return;
      }

      const from = formatDateKey(dates[0]);
      const to = formatDateKey(dates[dates.length - 1]);

      const revisionsResponses = await Promise.all(
        activeGoals.map((goal) => api.goalRevisions(goal.id))
      );
      const revisionsByGoal: Record<number, GoalRevision[]> = {};
      activeGoals.forEach((goal, index) => {
        revisionsByGoal[goal.id] = revisionsResponses[index].items;
      });

      const limit = 500;
      let offset = 0;
      let total = 0;
      const logsByGoalDate: Record<string, number> = {};
      do {
        const logsResp = await api.logsByDateRange({
          start_date: from,
          end_date: to,
          limit,
          offset,
        });
        total = logsResp.total;
        for (const log of logsResp.items) {
          const key = `${log.goal_id}|${log.date}`;
          logsByGoalDate[key] = (logsByGoalDate[key] || 0) + log.value;
        }
        offset += logsResp.items.length;
      } while (offset < total);

      const computedCells = dates.map(date => {
        const key = formatDateKey(date);
        let completedGoals = 0;
        for (const goal of activeGoals) {
          const done = logsByGoalDate[`${goal.id}|${key}`] || 0;
          const target =
            goal.goal_type === "boolean"
              ? 1
              : getActiveTarget(revisionsByGoal[goal.id] || [], key);
          if (target > 0 && done >= target) {
            completedGoals += 1;
          }
        }
        return {
          date,
          key,
          count: completedGoals,
        };
      });

      setMeta({
        from,
        to,
        totalGoals: activeGoals.length,
      });

      setCells(computedCells);
    } catch (err) {
      setError((err as Error).message || "Failed to load heatmap.");
    } finally {
      setLoading(false);
    }
  }

  const weeks = useMemo(() => {
    const columns: DayCell[][] = [];
    let currentWeek: DayCell[] = [];

    cells.forEach(cell => {
      const day = (cell.date.getDay() + 6) % 7; // lunes = 0

      if (currentWeek.length === 0 && day !== 0) {
        for (let i = 0; i < day; i++) {
          currentWeek.push({
            date: new Date(0),
            key: `empty-${columns.length}-${i}`,
            count: -1,
          });
        }
      }

      currentWeek.push(cell);

      if (currentWeek.length === 7) {
        columns.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({
          date: new Date(0),
          key: `empty-tail-${currentWeek.length}`,
          count: -1,
        });
      }
      columns.push(currentWeek);
    }

    return columns;
  }, [cells]);

  const monthLabels = useMemo(() => {
    const labels: { month: string; col: number }[] = [];

    weeks.forEach((week, colIndex) => {
      const firstRealDay = week.find(d => d.count >= 0);
      if (!firstRealDay) return;

      const month = firstRealDay.date.toLocaleString("default", {
        month: "short",
      });

      if (
        labels.length === 0 ||
        labels[labels.length - 1].month !== month
      ) {
        labels.push({ month, col: colIndex });
      }
    });

    return labels;
  }, [weeks]);

  const weekColumnsStyle = useMemo(() => {
    const cols = Math.max(weeks.length, 1);
    return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  }, [weeks.length]);

  const atTodayWindow = useMemo(() => {
    const today = startOfDay(todayInTimeZone(APP_TIMEZONE));
    if (isMobile) {
      return mobileWindowEnd.getTime() >= today.getTime();
    }
    return windowEnd.getTime() >= today.getTime();
  }, [windowEnd, mobileWindowEnd, isMobile]);

  function shiftBackSixMonths() {
    setWindowEnd((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() - 6);
      return startOfDay(next);
    });
  }

  function shiftForwardSixMonths() {
    const today = startOfDay(todayInTimeZone(APP_TIMEZONE));
    setWindowEnd((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + 6);
      return next > today ? today : startOfDay(next);
    });
  }

  function shiftBackSixtyDays() {
    setMobileWindowEnd((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 60);
      return startOfDay(next);
    });
  }

  function shiftForwardSixtyDays() {
    const today = startOfDay(todayInTimeZone(APP_TIMEZONE));
    setMobileWindowEnd((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 60);
      return next > today ? today : startOfDay(next);
    });
  }

  return (
    <section className="chat-content">
      <CollapsibleSection title="Heatmap" defaultOpen={true}>
        <div className="card heatmap-card">
          <div className="heatmap-header">
            <div>
              <h3>Stats</h3>
              <div className="chat-subtitle">
                A darker day means you completed all active habits.
              </div>
            </div>
            <div className="heatmap-header-right">
              {meta.totalGoals > 0 && (
                <div className="chat-subtitle">
                  {meta.totalGoals} active habits · {meta.from} → {meta.to}
                </div>
              )}
              <div className="heatmap-nav">
                {isMobile ? (
                  <>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={shiftBackSixtyDays}>
                      ← 60d
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={shiftForwardSixtyDays}
                      disabled={atTodayWindow}
                    >
                      60d →
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={shiftBackSixMonths}>
                      ← 6m
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={shiftForwardSixMonths}
                      disabled={atTodayWindow}
                    >
                      6m →
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="chat-subtitle">Loading heatmap...</div>
          ) : error ? (
            <div className="chat-subtitle">{error}</div>
          ) : meta.totalGoals === 0 ? (
            <div className="chat-subtitle">
              Create an active habit to start tracking streaks.
            </div>
          ) : (
            <div className="heatmap-scroll">
              <div className="heatmap-stack">
                <div className="heatmap-months">
                  <div className="heatmap-months-grid" style={weekColumnsStyle}>
                    {weeks.map((_, i) => {
                      const label = monthLabels.find(m => m.col === i);
                      return (
                        <div key={i} className="heatmap-month-label">
                          {label ? (
                            <span style={{ fontSize: 10, color: "#94a3b8" }}>
                              {label.month}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="heatmap-body">
                  <div className="heatmap-days">
                    {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                      <div key={i} className="heatmap-day-label">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="heatmap-grid" style={weekColumnsStyle}>
                    {weeks.map((week, i) => (
                      <div key={i} className="heatmap-column">
                        {week.map(cell => {
                          if (cell.count < 0) {
                            return <div key={cell.key} className="heatmap-cell empty" />;
                          }

                          const intensity = getIntensity(cell.count, meta.totalGoals);

                          return (
                            <div
                              key={cell.key}
                              title={`${cell.key} — ${cell.count}/${meta.totalGoals}`}
                              className="heatmap-cell"
                              style={{ backgroundColor: getColor(intensity) }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="heatmap-legend">
                  <span>Less</span>
                  {[0, 0.25, 0.5, 0.75, 1].map(level => (
                    <div
                      key={level}
                      className="heatmap-legend-cell"
                      style={{ backgroundColor: getColor(level) }}
                    />
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Goal Month Chart" defaultOpen={true}>
        <GoalMonthChart />
      </CollapsibleSection>
      <CollapsibleSection title="Target Table (10 Days)" defaultOpen={true}>
        <GoalCompletionTable />
      </CollapsibleSection>
      <CollapsibleSection title="Gif Picker" defaultOpen={false}>
        <GifPicker value={gifName} onChange={onGifChange} />
      </CollapsibleSection>
    </section>
  );
}
