import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, FocusSession, Goal } from "../lib/api";
import {
  notifyFocusSessionCompleted,
  requestNotificationPermissionIfNeeded,
} from "../lib/notifications";

const MIN_MINUTES = 5;
const MAX_MINUTES = 120;
const STEP_MINUTES = 5;
const DEFAULT_MINUTES = 25;

type Props = {
  onStatus: (message: string) => void;
};

function buildOptions() {
  const options: number[] = [];
  for (let value = MIN_MINUTES; value <= MAX_MINUTES; value += STEP_MINUTES) {
    options.push(value);
  }
  return options;
}

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatMinutesLabel(minutes: number) {
  const totalSeconds = minutes * 60;
  return formatCountdown(totalSeconds);
}

function remainingSecondsFor(session: FocusSession, now: Date) {
  const started = new Date(session.started_at).getTime();
  const elapsed = Math.floor((now.getTime() - started) / 1000) - (session.paused_seconds || 0);
  return session.duration_seconds - Math.max(0, elapsed);
}

export function FocusView({ onStatus }: Props) {
  const options = useMemo(buildOptions, []);
  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_MINUTES);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsById, setGoalsById] = useState<Record<number, Goal>>({});
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [history, setHistory] = useState<FocusSession[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const tickingRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);
  const hadActiveRef = useRef(false);
  const completingRef = useRef(false);
  const notifiedCompletedIdsRef = useRef<Set<number>>(new Set());
  const dialProgress = (selectedMinutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES);

  useEffect(() => {
    refresh();
    return () => {
      if (tickingRef.current) {
        window.clearInterval(tickingRef.current);
      }
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (activeSession && activeSession.status === "running") {
      pollRef.current = window.setInterval(() => {
        pollActive();
      }, 5000);
    }
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeSession]);

  useEffect(() => {
    if (tickingRef.current) {
      window.clearInterval(tickingRef.current);
      tickingRef.current = null;
    }

    if (activeSession && activeSession.status === "running") {
      tickingRef.current = window.setInterval(() => {
        setRemainingSeconds(remainingSecondsFor(activeSession, new Date()));
      }, 1000);
    }

    if (activeSession) {
      if (activeSession.status === "canceled") {
        setRemainingSeconds(0);
        return;
      }
      setRemainingSeconds(remainingSecondsFor(activeSession, new Date()));
    } else {
      setRemainingSeconds(null);
    }
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== "running") return;
    if (remainingSeconds !== null && remainingSeconds <= 0 && !completingRef.current) {
      completingRef.current = true;
      api
        .focusComplete(activeSession.id)
        .then((session) => {
          setActiveSession(session);
          onStatus("Focus session completed.");
          refreshHistory();
        })
        .catch((err) => setError((err as Error).message))
        .finally(() => {
          completingRef.current = false;
        });
    }
  }, [activeSession, remainingSeconds, onStatus]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== "completed") return;
    if (notifiedCompletedIdsRef.current.has(activeSession.id)) return;
    notifiedCompletedIdsRef.current.add(activeSession.id);
    const goalName = activeSession.goal_id ? goalsById[activeSession.goal_id]?.name : undefined;
    notifyFocusSessionCompleted(goalName);
  }, [activeSession, goalsById]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [active, sessions, goalsResponse] = await Promise.all([
        api.focusCurrent(),
        api.focusSessions(20, 0),
        api.goals(200, 0),
      ]);
      setActiveSession(active);
      hadActiveRef.current = Boolean(active);
      const todayKey = new Date().toDateString();
      const filtered = sessions.items.filter(
        (session) => new Date(session.started_at).toDateString() === todayKey
      );
      setHistory(filtered);
      setHistoryTotal(filtered.length);
      const allGoals = goalsResponse.items;
      const goalMap: Record<number, Goal> = {};
      for (const goal of allGoals) {
        goalMap[goal.id] = goal;
      }
      setGoalsById(goalMap);
      const timeGoals = allGoals.filter(
        (goal) => goal.is_active && goal.goal_type === "time"
      );
      setGoals(timeGoals);
      if (timeGoals.length > 0 && selectedGoalId === null) {
        setSelectedGoalId(timeGoals[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pollActive() {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const active = await api.focusCurrent();
      setActiveSession(active);
      if (active) {
        hadActiveRef.current = true;
      }
      if (!active && hadActiveRef.current) {
        hadActiveRef.current = false;
        await refreshHistory();
      }
    } catch {
      // Avoid noisy errors during background polling.
    } finally {
      pollInFlightRef.current = false;
    }
  }

  async function refreshHistory() {
    const sessions = await api.focusSessions(20, 0);
    const todayKey = new Date().toDateString();
    const filtered = sessions.items.filter(
      (session) => new Date(session.started_at).toDateString() === todayKey
    );
    setHistory(filtered);
    setHistoryTotal(filtered.length);
  }

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      void requestNotificationPermissionIfNeeded();
      const session = await api.focusCreate(selectedMinutes * 60, selectedGoalId);
      setActiveSession(session);
      onStatus("Focus session started.");
      await refreshHistory();
    } catch (err) {
      const message = (err as Error).message || "Failed to start focus session.";
      if (message.includes("Active session exists")) {
        const active = await api.focusCurrent();
        setActiveSession(active);
        onStatus("Ya hay una sesión activa en otro dispositivo.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    if (!activeSession) return;
    try {
      const session = await api.focusPause(activeSession.id);
      setActiveSession(session);
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message || "Failed to pause session.");
    }
  }

  async function handleResume() {
    if (!activeSession) return;
    try {
      const session = await api.focusResume(activeSession.id);
      setActiveSession(session);
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message || "Failed to resume session.");
    }
  }

  async function handleCancel() {
    if (!activeSession) return;
    try {
      const session = await api.focusCancel(activeSession.id);
      setActiveSession(session);
      onStatus("Focus session canceled.");
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message || "Failed to cancel session.");
    }
  }

  const summary = useMemo(() => {
    const today = new Date();
    const todayKey = today.toDateString();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 6);
    let todayMinutes = 0;
    let weekMinutes = 0;

    for (const session of history) {
      if (session.status !== "completed") continue;
      const started = new Date(session.started_at);
      const minutes = Math.round(session.duration_seconds / 60);
      if (started.toDateString() === todayKey) {
        todayMinutes += minutes;
      }
      if (started >= weekAgo && started <= today) {
        weekMinutes += minutes;
      }
    }

    return { todayMinutes, weekMinutes };
  }, [history]);

  return (
    <section className="chat-content">
      <div className="card focus-card">
        <div className="focus-header">
          <div>
            <h3>Focus</h3>
            <div className="chat-subtitle">Set a session and stay locked in.</div>
          </div>
          <div className="focus-summary">
            <div>
              <div className="focus-summary-label">Today</div>
              <div className="focus-summary-value">{summary.todayMinutes} min</div>
            </div>
            <div>
              <div className="focus-summary-label">7 days</div>
              <div className="focus-summary-value">{summary.weekMinutes} min</div>
            </div>
          </div>
        </div>

        <div className="focus-grid">
          <div className="focus-picker">
            <div className="focus-picker-label">Duration</div>
            <div className="focus-picker-label">Goal</div>
            <select
              className="chat-input chat-select chat-select--compact"
              value={selectedGoalId ?? ""}
              onChange={(event) =>
                setSelectedGoalId(event.target.value ? Number(event.target.value) : null)
              }
              disabled={
                goals.length === 0 ||
                (activeSession !== null &&
                  activeSession.status !== "completed" &&
                  activeSession.status !== "canceled")
              }
            >
              {goals.length === 0 ? (
                <option value="">No time goals available</option>
              ) : (
                goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name}
                  </option>
                ))
              )}
            </select>
            {!activeSession || activeSession.status === "completed" || activeSession.status === "canceled" ? (
              <>
                <div className="focus-dial">
                  <svg viewBox="0 0 220 220" className="focus-dial-svg" aria-hidden="true">
                    <circle className="focus-dial-track" cx="110" cy="110" r="90" />
                    <circle
                      className="focus-dial-progress"
                      cx="110"
                      cy="110"
                      r="90"
                      style={{
                        strokeDasharray: `${2 * Math.PI * 90}`,
                        strokeDashoffset: `${2 * Math.PI * 90 * (1 - dialProgress)}`,
                      }}
                    />
                  </svg>
                  <div className="focus-dial-time">{formatMinutesLabel(selectedMinutes)}</div>
                  <div className="focus-dial-caption">minutes</div>
                </div>
                <input
                  className="focus-range"
                  type="range"
                  min={MIN_MINUTES}
                  max={MAX_MINUTES}
                  step={STEP_MINUTES}
                  value={selectedMinutes}
                  style={
                    {
                      "--range-fill": `${((selectedMinutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * 100}%`,
                    } as React.CSSProperties
                  }
                  onChange={(event) => setSelectedMinutes(Number(event.target.value))}
                />
              </>
            ) : null}
            {!activeSession || activeSession.status === "completed" || activeSession.status === "canceled" ? (
              <button className="btn focus-start" onClick={handleStart} disabled={loading}>
                Start
              </button>
            ) : activeSession.status === "running" ? (
              <div className="focus-actions">
                <button className="btn focus-start" onClick={handlePause} disabled={loading}>
                  Pause
                </button>
                <button className="btn focus-cancel" onClick={handleCancel} disabled={loading}>
                  Cancel
                </button>
              </div>
            ) : activeSession.status === "paused" ? (
              <div className="focus-actions">
                <button className="btn focus-start" onClick={handleResume} disabled={loading}>
                  Resume
                </button>
                <button className="btn focus-cancel" onClick={handleCancel} disabled={loading}>
                  Cancel
                </button>
              </div>
            ) : null}
          </div>

          <div className="focus-timer">
            <div className="focus-timer-label">Countdown</div>
            <div className="focus-timer-value">
              {remainingSeconds !== null ? formatCountdown(remainingSeconds) : "--:--"}
            </div>
            {activeSession && (
              <div className="chat-subtitle">
                Status: {activeSession.status} · Started{" "}
                {new Date(activeSession.started_at).toLocaleTimeString()}
                {activeSession.ended_at && ` · Ended ${new Date(activeSession.ended_at).toLocaleTimeString()}`}
              </div>
            )}
            {error && <div className="chat-subtitle">{error}</div>}
          </div>
        </div>
      </div>

      <div className="card focus-history-card">
        <div className="focus-history-header">
          <h3>Focus history</h3>
          <div className="chat-subtitle">
            Showing {history.length} of {historyTotal}
          </div>
        </div>
        {history.length === 0 ? (
          <p className="chat-subtitle">No sessions yet.</p>
        ) : (
          <div className="focus-history-list">
            {history.map((session) => (
              <div key={session.id} className="row">
                <div>
                  <strong>{Math.round(session.duration_seconds / 60)} min</strong>
                  <div className="chat-subtitle">
                    {new Date(session.started_at).toLocaleString()} · {session.status}
                    {session.goal_id && goalsById[session.goal_id] ? (
                      <> · {goalsById[session.goal_id].name}</>
                    ) : null}
                  </div>
                </div>
                <div className={`status-pill status-${session.status}`}>{session.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
