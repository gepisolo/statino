# CLAUDE.md — statino

Personal timesheet app ("statino") replacing an Excel sheet: hours logged
per day, per client, against yearly contracts. Single user (Google login),
data on Firestore. UI language: Italian.

## Status (2026-07-24, v0.5.0)

**Done and deployed** to https://statino-gepisolo.web.app (CI green):

- Full setup: Firebase project `statino-gepisolo`, Google sign-in, Firestore
  (eur3) with owner-only + invite-allowlist rules, Hosting, GitHub Actions
  CI/CD (push to main → deploy; PRs → preview channel).
- Invite-only access (v0.2.0): `allowedUsers/{email}` + admin `/users` page
  + `/unauthorized` screen.
- Registries (v0.3.0–0.4.0): clients, contracts (client filter, state
  badge attivo/futuro/scaduto), projects — all CRUD with form dialogs.
- Statino view (v0.5.0): year/month/client selectors (last client
  persisted in localStorage), month grid with weekends highlighted +
  TOTALE row, multiple entries per day (contract active on that day,
  optional project, ticket, link, description, hours), side panel with
  month totals (hours + amount) and per-contract progress (annual, done
  in year up to selected month, in month, remaining).

**Not yet done / next**:

- End-to-end test with real data by the owner — the whole flow after the
  registries was only verified via typecheck/lint/compile, NOT clicked
  through with an authenticated session. Expect UI ritocchi.
- No changelog page yet (earsup convention `lib/changelog.ts` +
  `/changelog` route) — versions are bumped but not documented in-app.
- Possible future items mentioned but not requested yet: CSV/Excel export
  of a month, per-project hour breakdown view (data model already
  supports it via `entries.projectId`), deleting a revoked user's data.
- CI annotations: actions/checkout@v4 + setup-node@v4 are on the Node 20
  deprecation list — bump to newer majors when stable.

## Stack

Same patterns as `~/go/projects/xformance/earsup-dashboard` (see its
CLAUDE.md), minus the REST backend — this app is full-Firebase:

- Vue 3 (`<script setup>`, Composition API, TS strict), Vite 8
- Pinia + persistedstate, Vue Router (guard in `router/guards.ts`)
- shadcn-vue (reka-ui) + Tailwind 4, vue-sonner toasts, `@lucide/vue` icons
- vee-validate + zod for forms
- Firebase JS SDK: Auth (Google popup) + Firestore (`src/lib/firebase.ts`)
- Package manager: **npm only**

## Commands

```bash
npm run dev          # vite dev server (port 5175, strictPort)
npm run typecheck    # vue-tsc -b
npm run build        # typecheck + vite build
npm run lint         # eslint --max-warnings 0
npm run format       # prettier --write
```

`.env` (gitignored) carries the `VITE_FIREBASE_*` SDK config — see
`.env.example`. Path alias `@/` → `src/`.

## Firebase

- Project: **statino-gepisolo** (owner gepisolo@gmail.com), web app
  "Statino Web". Firestore in `eur3`, Google sign-in enabled.
- `firebase.json` + `firestore.rules` are in the repo; deploy rules with
  the Firebase MCP `firebase_deploy` tool (or `npx firebase-tools deploy`).
- All documents live under `users/{uid}/…`; rules allow access only to the
  owner (`request.auth.uid == uid`) **and** only if the account is invited:
  access requires an `allowedUsers/{email}` doc (lowercase email as ID) or
  being the admin. The admin email (`gepisolo@gmail.com`) is hardcoded in
  BOTH `firestore.rules` (`isAdmin`) and `src/lib/config.ts` — keep in sync.
  The admin manages invites from the `/users` page (admin-only route); the
  auth store mirrors the check in `checkAllowed()`, the router guard sends
  uninvited accounts to `/unauthorized`.
- **Hosting**: Firebase Hosting (free tier), `dist/` with SPA rewrite →
  https://statino-gepisolo.web.app. CI/CD via GitHub Actions
  (`.github/workflows/`): push to `main` → lint + build + deploy live;
  PRs get preview channels. Deploy auth uses the
  `FIREBASE_SERVICE_ACCOUNT_STATINO_GEPISOLO` repo secret (created with
  `firebase init hosting:github`). Build reads the committed
  `.env.production` (public web config — not secret).

## Domain model (`src/types/models.ts`)

- `users/{uid}/clients` — `{ name }`
- `users/{uid}/projects` — `{ clientId, name }` (some clients want hours
  split by project)
- `users/{uid}/contracts` — `{ clientId, activity, startDate, endDate,
  annualHours, hourlyRate }`. One doc per (client, activity): the same
  client can pay different rates for different activities. `annualHours`
  is counted over the **calendar year** (anno solare).
- `users/{uid}/entries` — one activity row per doc: `{ date (YYYY-MM-DD),
  clientId, contractId, projectId|null, ticket, link, description, hours }`.
  A day's total hours = sum of its entries; month/year totals come from
  date-range queries.

## Statino view (the core screen)

Month grid like the original spreadsheet: one row per calendar day
(weekends highlighted), selectors on top for year + month (default:
current) and client. Each day holds multiple activity rows; the activity
editor picks a contract (only contracts active on that day), optional
project, ticket number, link, description, hours. A side panel shows:
total hours in month, total amount (hours × contract rate), and per
contract: annual allowance, hours already done in the calendar year up to
the selected month, hours in month, remaining.

## Conventions

- Follow earsup-dashboard CRUD conventions: list views own state/fetching,
  per-entity `<Resource>FormDialog.vue` handling create+edit and emitting
  `saved`, splice into local list instead of refetching, confirm dialogs
  for delete, `toast.error` on failures.
- Versioning: `package.json` version injected as `__APP_VERSION__`
  (rendered in the sidebar footer). Bump MINOR for feat, PATCH for fix,
  in the same commit.
