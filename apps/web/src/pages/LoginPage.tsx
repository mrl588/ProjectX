import { useState } from "react";
import { api } from "../api";

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api.login(email, name);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-full place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-line bg-card p-8 shadow-[0_20px_60px_rgba(28,25,21,0.06)]">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">Dayboard</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight">Your day, in one view.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Sign in to see today’s list, the calendar, and the new tasks waiting for a yes.
        </p>
        <label className="mt-8 block text-sm">
          Name
          <input
            className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-sm">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-xl bg-ink px-4 py-2.5 text-paper disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
        <a href="/api/auth/google" className="mt-3 block text-center text-sm text-muted underline">
          Sign in with Google
        </a>
      </form>
    </main>
  );
}
