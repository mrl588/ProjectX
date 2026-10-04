# Dayboard

A PM day planner. After you sign in, the home page is three columns: today’s to-do list on the left, the day calendar in the middle, and new tasks on the right. New tasks stay off the list until you set a priority and add them, or you delay them.

## Decisions

- Node.js and TypeScript. Express for the API. React, Vite, and React Router for the UI.
- Tailwind for the layout.
- PostgreSQL. Docker Compose is in the repo for local Postgres. Neon is the hosted database.
- Prisma. One schema file generates the migration and the typed client.
- Luxon for time zones. Timestamps are stored in UTC.
- Zod checks Gemini’s JSON before a task is saved. With no API key, the first line of a pasted message becomes the task.
- Vitest tests the scheduler: pins, blockers, gap fill, color, and rollover.
- TanStack Query loads the home page, refreshes every 30 minutes while you are signed in, and refreshes again when the window is focused.
- Google sign-in uses Passport.js when `GOOGLE_CLIENT_ID` is set. Scopes are sign-in, `gmail.readonly`, and `calendar.events`. Leave the consent screen in Testing and add yourself as a test user. Refresh tokens last 7 days in Testing. A dev login is available when `ALLOW_DEV_LOGIN` is not `false`.
- Sessions are an httpOnly cookie plus a row in Postgres. Refresh tokens are encrypted before they are stored.
- Vercel can host the site. The URL stays up all day. Gmail-style checks run when someone is signed in with the page open, on load and every 30 minutes. Closing the laptop stops them until the next visit.
- Slack, Teams, Web Push, and an always-on worker are later.

## Home

- Left: not started, in progress, and completed. Green, yellow, and red come from the deadline and the 1–10 rank. An open blocker is called out, and that task is not placed on the calendar.
- Middle: working hours down the day. Drag a task to pin it. The other tasks refit around the pin and around breaks.
- Right: the morning summary on the first open of the day, then each new task. Set priority, add it to today, delay it, or dismiss it. Paste an email to extract another one.
- A reminder sits along the bottom. Done clears it. Snooze hides it for 30 minutes.

## Run it locally

Postgres has to be listening on port 5432. With Docker:

```bash
docker compose up -d
cp .env.example apps/api/.env
npm install
npm run db:migrate -w @pm/api
npm run dev
```

Open http://localhost:5173 and continue with any name and email. The first sign-in fills the board with a sample day.

```bash
npm test
```

## Deploy

1. Create a Neon project and set `DATABASE_URL`.
2. In Google Cloud, create an OAuth client, leave the consent screen in Testing, add your Gmail as a test user, and set the redirect to `https://<your-app>/api/auth/google/callback`.
3. Create a Gemini key in Google AI Studio and leave billing off.
4. Put the web app and the API on Vercel, with the env vars from `.env.example`. People can open the URL at any hour. Sync starts when they sign in.
