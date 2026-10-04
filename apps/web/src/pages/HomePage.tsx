import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type HomePayload, type TaskColor, type TaskItem } from "../api";

const tone: Record<TaskColor, string> = {
  green: "border-[#b7d7c4] bg-[#e7f3eb] text-green",
  yellow: "border-[#ead7a4] bg-[#fbf3df] text-yellow",
  red: "border-[#efc7c0] bg-[#f8e8e4] text-red",
};

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  return `Updated ${minutes} minutes ago`;
}

function clock(iso: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(iso));
}

function dueLabel(iso: string, zone: string) {
  const when = new Date(iso);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const due = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
  if (today === due) return `due ${clock(iso, zone)}`;
  return `due ${new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: zone }).format(when)}`;
}

function minutesInZone(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function labelForMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h} ${suffix}`;
}

function dayLabel(day: string, zone: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: zone,
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

export function HomePage({ onSignOut }: { onSignOut: () => void }) {
  const queryClient = useQueryClient();
  const home = useQuery({
    queryKey: ["home"],
    queryFn: api.home,
    refetchInterval: 30 * 60 * 1000,
  });
  const save = useMutation({
    mutationFn: (action: () => Promise<HomePayload>) => action(),
    onSuccess: (data) => queryClient.setQueryData(["home"], data),
  });

  if (home.isLoading || !home.data) {
    return <div className="grid h-full place-items-center text-muted">Building today’s board…</div>;
  }
  if (home.isError) {
    return <div className="grid h-full place-items-center text-red">Could not load the day.</div>;
  }

  const data = home.data;
  async function signOut() {
    await api.logout();
    queryClient.clear();
    onSignOut();
  }

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div>
          <p className="font-serif text-2xl leading-none">Dayboard</p>
          <p className="mt-1 text-sm text-muted">{dayLabel(data.day, data.user.timezone)}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <HoursControl
            hours={data.hours}
            onSave={(startMin, endMin) => save.mutate(() => api.hours(startMin, endMin))}
          />
          <span className="text-muted">{data.user.name}</span>
          <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <TodoColumn
          tasks={data.tasks}
          unscheduled={new Set(data.unscheduled)}
          zone={data.user.timezone}
          busy={save.isPending}
          onStatus={(id, status) => save.mutate(() => api.patchTask(id, { status }))}
        />
        <CalendarColumn
          data={data}
          busy={save.isPending}
          onMove={(id, startMin) => save.mutate(() => api.moveBlock(id, startMin))}
        />
        <InboxColumn
          data={data}
          busy={save.isPending}
          onPaste={(text) => save.mutate(() => api.paste(text))}
          onConfirm={(id, rank) => save.mutate(() => api.confirm(id, rank))}
          onDelay={(id, when) => save.mutate(() => api.delay(id, when))}
          onDismiss={(id) => save.mutate(() => api.dismiss(id))}
          onRank={(id, rank) => save.mutate(() => api.patchTask(id, { rank }))}
        />
      </div>
      <ReminderBar
        reminders={data.reminders}
        onDone={(id) => save.mutate(() => api.doneReminder(id))}
        onSnooze={(id) => save.mutate(() => api.snoozeReminder(id))}
      />
    </div>
  );
}

function HoursControl({
  hours,
  onSave,
}: {
  hours: { startMin: number; endMin: number } | null;
  onSave: (startMin: number, endMin: number) => void;
}) {
  if (!hours) return null;
  return (
    <label className="flex items-center gap-2 text-muted">
      Hours
      <input
        type="time"
        className="rounded-lg border border-line bg-card px-2 py-1 text-ink"
        value={toTimeValue(hours.startMin)}
        onChange={(event) => onSave(fromTimeValue(event.target.value), hours.endMin)}
      />
      <span>to</span>
      <input
        type="time"
        className="rounded-lg border border-line bg-card px-2 py-1 text-ink"
        value={toTimeValue(hours.endMin)}
        onChange={(event) => onSave(hours.startMin, fromTimeValue(event.target.value))}
      />
    </label>
  );
}

function toTimeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function fromTimeValue(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function TodoColumn({
  tasks,
  unscheduled,
  zone,
  busy,
  onStatus,
}: {
  tasks: TaskItem[];
  unscheduled: Set<string>;
  zone: string;
  busy: boolean;
  onStatus: (id: string, status: string) => void;
}) {
  const groups = [
    ["In progress", tasks.filter((task) => task.status === "in_progress")],
    ["Not started", tasks.filter((task) => task.status === "not_started")],
    ["Completed", tasks.filter((task) => task.status === "completed")],
  ] as const;
  return (
    <section className="min-h-0 overflow-y-auto border-b border-line px-4 py-4 lg:border-r lg:border-b-0">
      <h2 className="font-serif text-xl">Today</h2>
      <p className="mt-1 text-xs text-muted">Confirmed work for the day.</p>
      {groups.map(([label, items]) => (
        <div key={label} className="mt-5">
          <h3 className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</h3>
          <ul className="mt-2 space-y-2">
            {items.length === 0 ? <li className="text-sm text-muted">None</li> : null}
            {items.map((task) => (
              <li key={task.id} className={`rounded-2xl border px-3 py-2 ${tone[task.color]}`}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={task.status === "completed"}
                    disabled={busy}
                    onChange={() => onStatus(task.id, task.status === "completed" ? "not_started" : "completed")}
                    aria-label={`Complete ${task.title}`}
                  />
                  <div className="min-w-0">
                    <p className="font-medium leading-5">{task.title}</p>
                    <p className="mt-1 text-xs opacity-80">
                      Rank {task.rank} · {task.estimateMinutes}m
                      {task.deadline ? ` · ${dueLabel(task.deadline, zone)}` : " · no deadline"}
                    </p>
                    {task.blocked ? (
                      <p className="mt-1 text-xs font-medium">Blocked by {task.blockers.map((blocker) => blocker.title).join(", ")}</p>
                    ) : null}
                    {unscheduled.has(task.id) ? <p className="mt-1 text-xs">No open slot left today</p> : null}
                    {task.status === "not_started" ? (
                      <button type="button" className="mt-2 text-xs underline" disabled={busy} onClick={() => onStatus(task.id, "in_progress")}>
                        Start
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function CalendarColumn({
  data,
  busy,
  onMove,
}: {
  data: HomePayload;
  busy: boolean;
  onMove: (id: string, startMin: number) => void;
}) {
  const hours = data.hours ?? { startMin: 9 * 60, endMin: 18 * 60 };
  const pxPerHour = 96;
  const height = ((hours.endMin - hours.startMin) / 60) * pxPerHour;
  const marks = [];
  for (let minute = hours.startMin; minute <= hours.endMin; minute += 60) marks.push(minute);
  return (
    <section className="min-h-0 overflow-y-auto px-4 py-4">
      <h2 className="font-serif text-xl">Calendar</h2>
      <p className="mt-1 text-xs text-muted">Drag a task to pin it. Everything else refits around it.</p>
      <div className="relative mt-4" style={{ height }}>
        {marks.map((minute) => (
          <div
            key={minute}
            className="absolute right-0 left-12 border-t border-line text-[11px] text-muted"
            style={{ top: ((minute - hours.startMin) / 60) * pxPerHour }}
          >
            <span className="absolute -left-12 -translate-y-1/2">{labelForMinutes(minute)}</span>
          </div>
        ))}
        {data.blocks.map((block) => {
          const start = minutesInZone(block.startsAt, data.user.timezone);
          const end = minutesInZone(block.endsAt, data.user.timezone);
          const top = ((start - hours.startMin) / 60) * pxPerHour;
          const blockHeight = Math.max(((end - start) / 60) * pxPerHour, 28);
          return (
            <article
              key={block.id}
              className={`absolute right-0 left-14 overflow-hidden rounded-xl border px-3 py-1.5 ${
                block.kind === "break" ? "border-line bg-[#efeae2] text-muted" : tone[block.color]
              } ${block.kind === "task" ? "cursor-grab" : ""}`}
              style={{ top, height: blockHeight }}
              onPointerDown={(event) => {
                if (block.kind !== "task" || busy) return;
                const handle = event.currentTarget;
                handle.setPointerCapture(event.pointerId);
                const originY = event.clientY;
                const origin = start;
                let next = origin;
                const move = (ev: PointerEvent) => {
                  const deltaHours = (ev.clientY - originY) / pxPerHour;
                  next = Math.round((origin + deltaHours * 60) / 15) * 15;
                  next = Math.min(Math.max(next, hours.startMin), hours.endMin - 15);
                  handle.style.top = `${((next - hours.startMin) / 60) * pxPerHour}px`;
                };
                const up = () => {
                  handle.removeEventListener("pointermove", move);
                  handle.removeEventListener("pointerup", up);
                  if (next !== origin) onMove(block.id, next);
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", up);
              }}
            >
              <p className="truncate text-sm font-medium leading-4">
                {block.title}
                {block.pinned ? " · pinned" : ""}
              </p>
              {blockHeight >= 48 ? (
                <p className="truncate text-[11px] opacity-75">
                  {clock(block.startsAt, data.user.timezone)} – {clock(block.endsAt, data.user.timezone)}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function InboxColumn({
  data,
  busy,
  onPaste,
  onConfirm,
  onDelay,
  onDismiss,
  onRank,
}: {
  data: HomePayload;
  busy: boolean;
  onPaste: (text: string) => void;
  onConfirm: (id: string, rank: number) => void;
  onDelay: (id: string, when: "later" | "tomorrow" | "next_week") => void;
  onDismiss: (id: string) => void;
  onRank: (id: string, rank: number) => void;
}) {
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="min-h-0 overflow-y-auto border-t border-line px-4 py-4 lg:border-t-0 lg:border-l">
      <h2 className="font-serif text-xl">New</h2>
      <p className="mt-1 text-xs text-muted">
        {data.inbox.length} new task{data.inbox.length === 1 ? "" : "s"}
        {data.summary ? ` · ${ago(data.summary.createdAt)}` : ""}
      </p>
      {data.summary ? (
        <article className="mt-4 rounded-2xl border border-line bg-card p-3">
          <h3 className="text-sm font-medium">{data.summary.title}</h3>
          <p className="mt-1 text-sm leading-5 text-muted">{data.summary.body}</p>
        </article>
      ) : null}
      <ul className="mt-4 space-y-3">
        {data.inbox.map((task) => (
          <li key={task.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium leading-5">{task.title}</p>
                <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => setOpenId(openId === task.id ? null : task.id)}>
                  {openId === task.id ? "Hide source" : "Show source"}
                </button>
              </div>
              <button type="button" aria-label={`Dismiss ${task.title}`} className="text-muted" onClick={() => onDismiss(task.id)} disabled={busy}>
                ✕
              </button>
            </div>
            {openId === task.id ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted">{task.detail}</p> : null}
            <label className="mt-3 flex items-center justify-between text-xs text-muted">
              Priority
              <select
                className="rounded-lg border border-line bg-paper px-2 py-1 text-ink"
                value={task.rank}
                disabled={busy}
                onChange={(event) => onRank(task.id, Number(event.target.value))}
              >
                {Array.from({ length: 10 }, (_, index) => index + 1).map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                className="flex-1 rounded-xl bg-ink px-3 py-2 text-sm text-paper disabled:opacity-60"
                onClick={() => onConfirm(task.id, task.rank)}
              >
                Add to today
              </button>
              <select
                className="rounded-xl border border-line px-2 text-sm"
                defaultValue=""
                disabled={busy}
                onChange={(event) => {
                  const when = event.target.value as "later" | "tomorrow" | "next_week";
                  if (when) onDelay(task.id, when);
                  event.target.value = "";
                }}
              >
                <option value="">Delay</option>
                <option value="later">Later today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="next_week">Next week</option>
              </select>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onPaste(text);
          setText("");
        }}
      >
        <label className="text-xs text-muted" htmlFor="paste">
          Paste an email or message
        </label>
        <textarea
          id="paste"
          className="mt-1 h-24 w-full rounded-2xl border border-line bg-card p-3 text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Subject on the first line…"
        />
        <button type="submit" disabled={busy || !text.trim()} className="mt-2 rounded-xl border border-ink px-3 py-1.5 text-sm disabled:opacity-50">
          Extract tasks
        </button>
      </form>
    </section>
  );
}

function ReminderBar({
  reminders,
  onDone,
  onSnooze,
}: {
  reminders: { id: string; title: string; fireAt: string }[];
  onDone: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  if (reminders.length === 0) return <div />;
  return (
    <div className="flex items-center gap-3 border-t border-line bg-card px-5 py-3">
      {reminders.map((reminder) => (
        <div key={reminder.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
          <span>{reminder.title}</span>
          <button type="button" className="text-xs underline" onClick={() => onDone(reminder.id)}>
            Done
          </button>
          <button type="button" className="text-xs underline" onClick={() => onSnooze(reminder.id)}>
            Snooze
          </button>
        </div>
      ))}
    </div>
  );
}
