export type TaskColor = "green" | "yellow" | "red";

export type TaskItem = {
  id: string;
  title: string;
  detail: string;
  status: string;
  rank: number;
  estimateMinutes: number;
  deadline: string | null;
  plannedDay: string | null;
  menial: boolean;
  sourceUrl: string | null;
  sourceKind: string | null;
  color: TaskColor;
  blocked: boolean;
  blockers: { id: string; title: string; status: string }[];
};

export type HomePayload = {
  user: { id: string; name: string; email: string; timezone: string };
  day: string;
  now: string;
  hours: { startMin: number; endMin: number } | null;
  tasks: TaskItem[];
  inbox: TaskItem[];
  blocks: {
    id: string;
    taskId: string | null;
    title: string;
    startsAt: string;
    endsAt: string;
    pinned: boolean;
    kind: string;
    color: TaskColor;
  }[];
  unscheduled: string[];
  reminders: { id: string; title: string; fireAt: string }[];
  summary: { id: string; title: string; body: string; createdAt: string } | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const error = new Error(body?.error || "Request failed") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ id: string; name: string; email: string }>("/api/me"),
  login: (email: string, name: string) =>
    request("/api/auth/dev", { method: "POST", body: JSON.stringify({ email, name }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  home: () => request<HomePayload>("/api/home"),
  paste: (text: string) => request<HomePayload>("/api/inbox/paste", { method: "POST", body: JSON.stringify({ text }) }),
  confirm: (id: string, rank: number) =>
    request<HomePayload>(`/api/tasks/${id}/confirm`, { method: "POST", body: JSON.stringify({ rank }) }),
  delay: (id: string, when: "later" | "tomorrow" | "next_week") =>
    request<HomePayload>(`/api/tasks/${id}/delay`, { method: "POST", body: JSON.stringify({ when }) }),
  dismiss: (id: string) => request<HomePayload>(`/api/tasks/${id}/dismiss`, { method: "POST" }),
  patchTask: (id: string, body: { rank?: number; status?: string }) =>
    request<HomePayload>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  moveBlock: (id: string, startMin: number) =>
    request<HomePayload>(`/api/blocks/${id}/move`, { method: "POST", body: JSON.stringify({ startMin }) }),
  hours: (startMin: number, endMin: number) =>
    request<HomePayload>("/api/hours", { method: "PATCH", body: JSON.stringify({ startMin, endMin }) }),
  doneReminder: (id: string) => request<HomePayload>(`/api/reminders/${id}/done`, { method: "POST" }),
  snoozeReminder: (id: string) => request<HomePayload>(`/api/reminders/${id}/snooze`, { method: "POST" }),
};
