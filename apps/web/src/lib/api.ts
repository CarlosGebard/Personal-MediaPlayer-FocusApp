export const apiBase = import.meta.env.VITE_API_BASE || "/api";

//Frontend types

export type User = {
  id: number;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
};

export type GoalType = "time" | "count" | "boolean";

export type Goal = {
  id: number;
  user_id: number;
  name: string;
  goal_type: GoalType;
  is_active: boolean;
  created_at: string;
};

export type GoalsResponse = {
  items: Goal[];
  total: number;
};

export type GoalRevision = {
  id: number;
  goal_id: number;
  target_value: number;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
};

export type GoalRevisionsResponse = {
  items: GoalRevision[];
  total: number;
};

export type GoalLog = {
  id: number;
  goal_id: number;
  focus_session_id: number | null;
  date: string;
  value: number;
  source: string;
  created_at: string;
};

export type GoalLogsResponse = {
  items: GoalLog[];
  total: number;
};

export type GoalHeatmapValue = {
  date: string;
  count: number;
};

export type GoalHeatmapResponse = {
  goal_id: number;
  from: string;
  to: string;
  unit: "day";
  values: GoalHeatmapValue[];
};

export type FocusSession = {
  id: number;
  user_id: number;
  goal_id: number | null;
  duration_seconds: number;
  started_at: string;
  ended_at: string | null;
  status: "running" | "paused" | "completed" | "canceled";
  paused_seconds: number;
};

export type FocusSessionsResponse = {
  items: FocusSession[];
  total: number;
};

export type DailyStats = {
  date: string;
  goal_value_sum: number;
  goal_logs_count: number;
  focus_seconds: number;
  focus_sessions_count: number;
};

export type WeeklyDayStats = {
  date: string;
  goal_value_sum: number;
  focus_seconds: number;
};

export type WeeklyStats = {
  start_date: string;
  end_date: string;
  goal_value_sum: number;
  focus_seconds: number;
  days: WeeklyDayStats[];
};

export type YearlyMonthStats = {
  month: number;
  goal_value_sum: number;
  focus_seconds: number;
};

export type YearlyStats = {
  year: number;
  goal_value_sum: number;
  focus_seconds: number;
  months: YearlyMonthStats[];
};

function apiHeaders() {
  return {
    "Content-Type": "application/json",
  };
}
// Punto central para hacer fetch a la API
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...apiHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(message || resp.statusText);
  }
  if (resp.status === 204) {
    return undefined as T;
  }
  return resp.json() as Promise<T>;
}

export const api = {
  me: () => apiFetch<User>("/auth/me"),

  login: (username: string, password: string) =>
    apiFetch<User>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  register: (username: string, password: string) =>
    apiFetch<User>("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),

  toggleRegistration: (enabled: boolean, adminPassword: string) =>
    apiFetch<{ registration_enabled: boolean }>("/auth/disable-registration", {
      method: "POST",
      body: JSON.stringify({ enabled, admin_password: adminPassword }),
    }),

  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  goals: (limit = 50, offset = 0) =>
    apiFetch<GoalsResponse>(`/goals?limit=${limit}&offset=${offset}`),
  goal: (id: number) => apiFetch<Goal>(`/goals/${id}`),
  createGoal: (payload: { name: string; goal_type: GoalType; is_active?: boolean }) =>
    apiFetch<Goal>("/goals", { method: "POST", body: JSON.stringify(payload) }),
  updateGoal: (id: number, payload: { name?: string; goal_type?: GoalType; is_active?: boolean }) =>
    apiFetch<Goal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteGoal: (id: number) => apiFetch<void>(`/goals/${id}`, { method: "DELETE" }),

  goalRevisions: (goalId: number) =>
    apiFetch<GoalRevisionsResponse>(`/goals/${goalId}/revisions`),
  createGoalRevision: (goalId: number, payload: { target_value: number; valid_from: string; valid_to?: string | null }) =>
    apiFetch<GoalRevision>(`/goals/${goalId}/revisions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  goalLogs: (goalId: number, limit = 100, offset = 0) =>
    apiFetch<GoalLogsResponse>(`/goals/${goalId}/logs?limit=${limit}&offset=${offset}`),
  createGoalLog: (goalId: number, payload: { date: string; value: number }) =>
    apiFetch<GoalLog>(`/goals/${goalId}/logs`, { method: "POST", body: JSON.stringify(payload) }),
  updateGoalLog: (goalId: number, logId: number, payload: { value: number }) =>
    apiFetch<GoalLog>(`/goals/${goalId}/logs/${logId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteGoalLog: (goalId: number, logId: number) =>
    apiFetch<void>(`/goals/${goalId}/logs/${logId}`, { method: "DELETE" }),
  goalHeatmap: (goalId: number, from: string, to: string) =>
    apiFetch<GoalHeatmapResponse>(`/goals/${goalId}/heatmap?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  logsByDateRange: (params: { start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.start_date) query.set("start_date", params.start_date);
    if (params.end_date) query.set("end_date", params.end_date);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return apiFetch<GoalLogsResponse>(`/logs${suffix ? `?${suffix}` : ""}`);
  },

  focusCreate: (durationSeconds: number, goalId?: number | null) =>
    apiFetch<FocusSession>("/focus/sessions", {
      method: "POST",
      body: JSON.stringify({ duration_seconds: durationSeconds, goal_id: goalId ?? null }),
    }),
  focusPause: (id: number) => apiFetch<FocusSession>(`/focus/sessions/${id}/pause`, { method: "POST" }),
  focusResume: (id: number) => apiFetch<FocusSession>(`/focus/sessions/${id}/resume`, { method: "POST" }),
  focusCancel: (id: number) => apiFetch<FocusSession>(`/focus/sessions/${id}/cancel`, { method: "POST" }),
  focusComplete: (id: number) =>
    apiFetch<FocusSession>(`/focus/sessions/${id}/complete`, { method: "POST" }),
  focusCurrent: async () => {
    const resp = await fetch(`${apiBase}/focus/sessions/current`, {
      credentials: "include",
      headers: apiHeaders(),
    });
    if (resp.status === 204) return null;
    if (!resp.ok) {
      const message = await resp.text();
      throw new Error(message || resp.statusText);
    }
    return (await resp.json()) as FocusSession;
  },
  focusSessions: (limit = 20, offset = 0) =>
    apiFetch<FocusSessionsResponse>(`/focus/sessions?limit=${limit}&offset=${offset}`),

  dailyStats: (date?: string) => {
    const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
    return apiFetch<DailyStats>(`/stats/daily${suffix}`);
  },
  weeklyStats: () => apiFetch<WeeklyStats>("/stats/weekly"),
  yearlyStats: () => apiFetch<YearlyStats>("/stats/yearly"),

  health: () => apiFetch<{ status: string }>("/health"),
};
