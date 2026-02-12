import React, { useEffect, useMemo, useState } from "react";
import { api, Goal } from "../lib/api";

type FormState = {
  name: string;
  goalType: Goal["goal_type"];
  isActive: boolean;
  targetValue: number;
};

type EditingState = {
  id: number;
  name: string;
  goalType: Goal["goal_type"];
  isActive: boolean;
  targetValue: number;
  original: {
    name: string;
    goalType: Goal["goal_type"];
    isActive: boolean;
    targetValue: number;
  };
};

type LogState = {
  logId: number | null;
  value: number;
  savedValue: number;
  saving: boolean;
  error: string;
  completed: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  goalType: "time",
  isActive: true,
  targetValue: 30,
};

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function labelForType(type: Goal["goal_type"]) {
  if (type === "time") return "Minutes";
  if (type === "count") return "Count";
  return "Done";
}

function rangeForType(type: Goal["goal_type"]) {
  if (type === "time") return { min: 0, max: 120, step: 5 };
  if (type === "count") return { min: 0, max: 20, step: 1 };
  return { min: 0, max: 1, step: 1 };
}

export function HabitsView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [logs, setLogs] = useState<Record<number, LogState>>({});
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [totals, setTotals] = useState<Record<number, number>>({});
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [targetInput, setTargetInput] = useState(String(DEFAULT_FORM.targetValue));
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleteConfirmGoalId, setDeleteConfirmGoalId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [today] = useState(() => formatDateKey(new Date()));

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (goals.length === 0) return;
    const interval = window.setInterval(() => {
      if (editing) return;
      syncTodayLogs();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [goals, targets, editing]);

  const activeGoals = useMemo(() => goals.filter((goal) => goal.is_active), [goals]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [goalsResponse, logsResponse] = await Promise.all([
        api.goals(200, 0),
        api.logsByDateRange({ start_date: today, end_date: today, limit: 500, offset: 0 }),
      ]);
      setGoals(goalsResponse.items);
      const revisionResponses = await Promise.all(
        goalsResponse.items.map((goal) => api.goalRevisions(goal.id))
      );
      const todayDate = new Date(`${today}T00:00:00`);
      const targetByGoal: Record<number, number> = {};
      goalsResponse.items.forEach((goal, index) => {
        const revisions = revisionResponses[index].items;
        const activeRevision = revisions
          .filter((rev) => new Date(rev.valid_from) <= todayDate && (!rev.valid_to || new Date(rev.valid_to) >= todayDate))
          .sort((a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime())[0];
        targetByGoal[goal.id] = activeRevision?.target_value ?? 0;
      });
      setTargets(targetByGoal);
      const totalsByGoal: Record<number, number> = {};
      for (const log of logsResponse.items) {
        totalsByGoal[log.goal_id] = (totalsByGoal[log.goal_id] || 0) + log.value;
      }
      setTotals(totalsByGoal);
      const nextLogs: Record<number, LogState> = {};
      for (const goal of goalsResponse.items) {
        const match = logsResponse.items.find((log) => log.goal_id === goal.id && log.focus_session_id === null);
        const targetValue = targetByGoal[goal.id] ?? 0;
        const completed =
          goal.goal_type === "boolean"
            ? (match?.value ?? 0) > 0
            : targetValue > 0 && (totalsByGoal[goal.id] || 0) >= targetValue;
        nextLogs[goal.id] = {
          logId: match?.id ?? null,
          value: match?.value ?? 0,
          savedValue: match?.value ?? 0,
          saving: false,
          error: "",
          completed,
        };
      }
      setLogs(nextLogs);
    } catch (err) {
      setError((err as Error).message || "Failed to load habits.");
    } finally {
      setLoading(false);
    }
  }

  async function syncTodayLogs() {
    try {
      const logsResponse = await api.logsByDateRange({
        start_date: today,
        end_date: today,
        limit: 500,
        offset: 0,
      });
      const totalsByGoal: Record<number, number> = {};
      const manualByGoal: Record<number, { id: number; value: number }> = {};
      for (const log of logsResponse.items) {
        totalsByGoal[log.goal_id] = (totalsByGoal[log.goal_id] || 0) + log.value;
        if (log.focus_session_id === null) {
          manualByGoal[log.goal_id] = { id: log.id, value: log.value };
        }
      }
      setTotals(totalsByGoal);
      setLogs((prev) => {
        const next: Record<number, LogState> = { ...prev };
        for (const goal of goals) {
          const current = prev[goal.id] || {
            logId: null,
            value: 0,
            savedValue: 0,
            saving: false,
            error: "",
            completed: false,
          };
          if (current.saving) {
            next[goal.id] = current;
            continue;
          }
          const manual = manualByGoal[goal.id];
          const totalDone = totalsByGoal[goal.id] || 0;
          const targetValue = targets[goal.id] || 0;
          const completed =
            goal.goal_type === "boolean"
              ? totalDone > 0
              : targetValue > 0 && totalDone >= targetValue;
          const isDirty = current.value !== current.savedValue;
          next[goal.id] = {
            ...current,
            logId: manual?.id ?? null,
            savedValue: manual?.value ?? 0,
            value: isDirty ? current.value : totalDone,
            completed,
          };
        }
        return next;
      });
    } catch {
      // silent background sync
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      if (!form.name.trim()) {
        setFormError("Name is required.");
        return;
      }
      if (form.targetValue <= 0) {
        setFormError("Target value must be greater than 0.");
        return;
      }
      const created = await api.createGoal({
        name: form.name.trim(),
        goal_type: form.goalType,
        is_active: form.isActive,
      });
      await api.createGoalRevision(created.id, {
        target_value: form.targetValue,
        valid_from: today,
      });
      setGoals((prev) => [created, ...prev]);
      setLogs((prev) => ({
        ...prev,
        [created.id]: {
          logId: null,
          value: 0,
          savedValue: 0,
          saving: false,
          error: "",
          completed: false,
        },
      }));
      setTargets((prev) => ({ ...prev, [created.id]: form.targetValue }));
      setForm(DEFAULT_FORM);
      setTargetInput(String(DEFAULT_FORM.targetValue));
    } catch (err) {
      setFormError((err as Error).message || "Failed to create habit.");
    }
  }

  function startEditing(goal: Goal) {
    const targetValue = targets[goal.id] || 0;
    setDeleteConfirmGoalId(null);
    setEditing({
      id: goal.id,
      name: goal.name,
      goalType: goal.goal_type,
      isActive: goal.is_active,
      targetValue,
      original: {
        name: goal.name,
        goalType: goal.goal_type,
        isActive: goal.is_active,
        targetValue,
      },
    });
  }

  async function saveEditing() {
    if (!editing) return;
    setFormError("");
    try {
      if (!editing.name.trim()) {
        setFormError("Name is required.");
        return;
      }
      const goalChanged =
        editing.name.trim() !== editing.original.name ||
        editing.goalType !== editing.original.goalType ||
        editing.isActive !== editing.original.isActive;
      const targetChanged = editing.targetValue !== editing.original.targetValue;

      if (goalChanged) {
        const updated = await api.updateGoal(editing.id, {
          name: editing.name.trim(),
          goal_type: editing.goalType,
          is_active: editing.isActive,
        });
        setGoals((prev) => prev.map((goal) => (goal.id === updated.id ? updated : goal)));
      }

      if (targetChanged) {
        if (editing.goalType === "boolean") {
          setFormError("Boolean goals do not use target values.");
          return;
        }
        if (editing.targetValue <= 0) {
          setFormError("Target value must be greater than 0.");
          return;
        }
        await api.createGoalRevision(editing.id, {
          target_value: editing.targetValue,
          valid_from: today,
        });
        setTargets((prev) => ({ ...prev, [editing.id]: editing.targetValue }));
      }

      if (goalChanged || targetChanged) {
        setEditing(null);
        setDeleteConfirmGoalId(null);
      }
    } catch (err) {
      setFormError((err as Error).message || "Failed to update habit.");
    }
  }

  async function removeGoal(goalId: number) {
    try {
      await api.deleteGoal(goalId);
      setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
      setLogs((prev) => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
      setTargets((prev) => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
      if (editing?.id === goalId) {
        setEditing(null);
      }
      setDeleteConfirmGoalId(null);
    } catch (err) {
      setError((err as Error).message || "Failed to delete habit.");
    }
  }

  async function saveLog(goal: Goal, value: number) {
    const state = logs[goal.id];
    if (!state) return;
    const targetValue = targets[goal.id] || 0;
    const totalBefore = totals[goal.id] || 0;
    const nonManualDone = Math.max(0, totalBefore - state.savedValue);
    const manualToSave =
      goal.goal_type === "boolean" ? (value > 0 ? 1 : 0) : Math.max(0, value - nonManualDone);
    const totalAfter = nonManualDone + manualToSave;
    setLogs((prev) => ({
      ...prev,
      [goal.id]: { ...state, saving: true, error: "" },
    }));
    try {
      if (value < 0) {
        setLogs((prev) => ({
          ...prev,
          [goal.id]: { ...state, saving: false, error: "Value must be at least 0." },
        }));
        return;
      }
      const isCompleted =
        goal.goal_type === "boolean" ? value > 0 : targetValue > 0 && totalAfter >= targetValue;
      if (state.logId && manualToSave === 0) {
        await api.deleteGoalLog(goal.id, state.logId);
        setLogs((prev) => ({
          ...prev,
          [goal.id]: {
            ...state,
            logId: null,
            savedValue: 0,
            value: totalAfter,
            saving: false,
            error: "",
            completed: isCompleted,
          },
        }));
        setTotals((prev) => ({ ...prev, [goal.id]: totalAfter }));
      } else if (state.logId) {
        const updated = await api.updateGoalLog(goal.id, state.logId, { value: manualToSave });
        setLogs((prev) => ({
          ...prev,
          [goal.id]: {
            logId: updated.id,
            value: totalAfter,
            savedValue: updated.value,
            saving: false,
            error: "",
            completed: isCompleted,
          },
        }));
        setTotals((prev) => ({ ...prev, [goal.id]: totalAfter }));
      } else if (manualToSave > 0) {
        const created = await api.createGoalLog(goal.id, { date: today, value: manualToSave });
        setLogs((prev) => ({
          ...prev,
          [goal.id]: {
            logId: created.id,
            value: totalAfter,
            savedValue: created.value,
            saving: false,
            error: "",
            completed: isCompleted,
          },
        }));
        setTotals((prev) => ({ ...prev, [goal.id]: totalAfter }));
      } else {
        setLogs((prev) => ({
          ...prev,
          [goal.id]: {
            ...state,
            logId: null,
            value: totalAfter,
            savedValue: 0,
            saving: false,
            error: "",
            completed: isCompleted,
          },
        }));
        setTotals((prev) => ({ ...prev, [goal.id]: totalAfter }));
      }
    } catch (err) {
      setLogs((prev) => ({
        ...prev,
        [goal.id]: {
          ...state,
          saving: false,
          error: (err as Error).message || "Failed to save.",
        },
      }));
    }
  }

  function updateLocalValue(goalId: number, value: number) {
    setLogs((prev) => ({
      ...prev,
      [goalId]: {
        ...(prev[goalId] || {
          logId: null,
          value: 0,
          savedValue: 0,
          saving: false,
          error: "",
          completed: false,
        }),
        value,
      },
    }));
  }

  return (
    <section className="chat-content">
      <div className="card habits-list-card">
        <div className="habits-list-header">
          <h3>Daily log</h3>
          <div className="chat-subtitle">{activeGoals.length} active habits</div>
        </div>

        {loading ? (
          <p className="chat-subtitle">Loading habits...</p>
        ) : error ? (
          <p className="chat-subtitle">{error}</p>
        ) : goals.length === 0 ? (
          <p className="chat-subtitle">No habits yet.</p>
        ) : (
          <div className="habits-list">
            {goals.map((goal) => {
              const logState = logs[goal.id] || {
                logId: null,
                value: 0,
                savedValue: 0,
                saving: false,
                error: "",
                completed: false,
              };
              const isEditing = editing?.id === goal.id;
              const { min, max, step } = rangeForType(goal.goal_type);
              const targetValue = targets[goal.id] || 0;
              const sliderMax = targetValue > 0 ? targetValue : max;
              const sliderValue = Math.min(logState.value, sliderMax);
              const completedNow =
                goal.goal_type === "boolean"
                  ? logState.value > 0
                  : targetValue > 0 && (totals[goal.id] || 0) >= targetValue;
              const logDisabled =
                logState.saving ||
                isEditing ||
                !goal.is_active ||
                (goal.goal_type === "boolean" && completedNow) ||
                (goal.goal_type !== "boolean" && completedNow);
              const totalDone = totals[goal.id] || 0;
              const remaining = Math.max(0, targetValue - totalDone);
              return (
                <div key={goal.id} className="habits-row">
                  <div className="habits-meta">
                    {isEditing ? (
                      <>
                        <input
                          className="chat-input habits-input"
                          value={editing?.name || ""}
                          onChange={(event) =>
                            setEditing((prev) =>
                              prev ? { ...prev, name: event.target.value } : prev
                            )
                          }
                        />
                        <select
                          className="chat-input chat-select chat-select--compact habits-select"
                          value={editing?.goalType || "time"}
                          disabled={true}
                          onChange={(event) =>
                            setEditing((prev) =>
                              prev
                                ? { ...prev, goalType: event.target.value as Goal["goal_type"] }
                                : prev
                            )
                          }
                        >
                          <option value="time">Time</option>
                          <option value="count">Count</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <input
                          className="chat-input habits-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editing?.targetValue ?? ""}
                          onChange={(event) => {
                            const next = event.target.value.replace(/[^\d]/g, "");
                            setEditing((prev) =>
                              prev ? { ...prev, targetValue: next ? Number(next) : 0 } : prev
                            );
                          }}
                          placeholder="Target"
                          disabled={editing?.goalType === "boolean"}
                        />
                        <label className="habits-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(editing?.isActive)}
                            onChange={(event) =>
                              setEditing((prev) => (prev ? { ...prev, isActive: event.target.checked } : prev))
                            }
                          />
                          Active
                        </label>
                      </>
                    ) : (
                      <>
                        <div>
                          <strong>{goal.name}</strong>
                          <div className="chat-subtitle">
                            {labelForType(goal.goal_type)} · Target {targets[goal.id] || 0} ·{" "}
                            {goal.is_active ? "Active" : "Paused"}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className={`habits-actions ${completedNow ? "is-completed" : ""}`}>
                    {isEditing ? (
                      <span className="chat-subtitle">Editing mode: log controls are hidden.</span>
                    ) : goal.goal_type === "boolean" ? (
                      <label className="habits-toggle">
                        <input
                          type="checkbox"
                          checked={logState.value > 0}
                          disabled={logDisabled}
                          onChange={(event) => {
                            const nextValue = event.target.checked ? 1 : 0;
                            updateLocalValue(goal.id, nextValue);
                            saveLog(goal, nextValue);
                          }}
                        />
                        Done
                      </label>
                    ) : (
                      <>
                        <input
                          type="range"
                          min={min}
                          max={sliderMax}
                          step={step}
                          value={sliderValue}
                          style={
                            {
                              "--range-fill": `${sliderMax > min ? ((sliderValue - min) / (sliderMax - min)) * 100 : 0}%`,
                            } as React.CSSProperties
                          }
                          disabled={logDisabled}
                          onChange={(event) => updateLocalValue(goal.id, Number(event.target.value))}
                        />
                        <div className="habits-value">{sliderValue}</div>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={logDisabled}
                          type="button"
                          onClick={() => saveLog(goal, sliderValue)}
                        >
                          Save
                        </button>
                      </>
                    )}
                  </div>

                  <div className="habits-row-footer">
                    {!isEditing &&
                      (completedNow ? (
                        <span className="chat-subtitle">Completado por hoy 🎉.</span>
                      ) : targetValue > 0 && totalDone > 0 && remaining > 0 && goal.goal_type !== "boolean" ? (
                        <span className="chat-subtitle">
                          Vas muy bien, solo te faltan {remaining}!
                        </span>
                      ) : targetValue > 0 && goal.goal_type !== "boolean" ? (
                        <span className="chat-subtitle">
                          Restan {remaining} {goal.goal_type === "time" ? "min" : ""}.
                        </span>
                      ) : (
                        logState.error && <span className="chat-subtitle">{logState.error}</span>
                      ))}
                    <div className="habits-row-buttons">
                      {isEditing ? (
                        deleteConfirmGoalId === goal.id ? (
                          <>
                            <div className="chat-subtitle habits-delete-confirm">
                              Are you sure? You will lose all data related to this habit.
                            </div>
                            <button className="btn btn-danger btn-sm" type="button" onClick={() => removeGoal(goal.id)}>
                              Confirm delete
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => setDeleteConfirmGoalId(null)}
                            >
                              Back
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm" type="button" onClick={saveEditing}>
                              Save
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setEditing(null);
                                setDeleteConfirmGoalId(null);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => setDeleteConfirmGoalId(goal.id)}
                            >
                              Delete
                            </button>
                          </>
                        )
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => startEditing(goal)}>
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card habits-card">
        <div className="habits-header">
          <div>
            <h3>Habits</h3>
            <div className="chat-subtitle">Create, track, and update your daily habits.</div>
          </div>
          <div className="chat-subtitle">Today · {today}</div>
        </div>

        <form className="habits-form" onSubmit={handleCreate}>
          <input
            className="chat-input habits-input"
            placeholder="Habit name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <select
            className="chat-input chat-select chat-select--compact habits-select"
            value={form.goalType}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, goalType: event.target.value as Goal["goal_type"] }))
            }
          >
            <option value="time">Time (minutes)</option>
            <option value="count">Count</option>
            <option value="boolean">Boolean</option>
          </select>
          <input
            className="chat-input habits-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={targetInput}
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d]/g, "");
              setTargetInput(next);
              setForm((prev) => ({ ...prev, targetValue: next ? Number(next) : 0 }));
            }}
            placeholder="Target"
          />
          <label className="habits-toggle">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Active
          </label>
          <button className="btn" type="submit">
            Add habit
          </button>
        </form>
        {formError && <div className="chat-subtitle">{formError}</div>}
      </div>
    </section>
  );
}
