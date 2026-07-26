# CLAUDE.md — statino

Personal timesheet app ("statino") replacing an Excel sheet: hours logged
per day, per client, against yearly contracts. Single user (Google login),
data on Firestore. UI language: Italian.

## Status (2026-07-27, v0.16.0)

**Done and deployed** to https://statino-gepisolo.web.app (CI green):

- Full setup: Firebase project `statino-gepisolo`, Google sign-in, Firestore
  (eur3) with owner-only + invite-allowlist rules, Hosting, GitHub Actions
  CI/CD (push to main → deploy; PRs → preview channel).
- Invite-only access (v0.2.0): `allowedUsers/{email}` + admin `/users` page
  + `/unauthorized` screen.
- Registries (v0.3.0–0.4.0): clients, contracts (client filter, state
  badge attivo/futuro/scaduto), projects — all CRUD with form dialogs.
- Projects nested under clients (v0.7.0): no sidebar entry; reached from
  the client row's ⋯ menu → `/clients/:clientId/projects` (route name
  `client-projects`, `meta.nav: 'clients'` keeps the sidebar highlight).
  New `active` flag (row switch; missing = active for pre-existing docs):
  inactive projects are hidden in the entry editor's dropdown, except the
  one already on the entry being edited.
- Statino view (v0.5.0): year/month/client selectors (last client
  persisted in localStorage), month grid with weekends highlighted +
  TOTALE row, multiple entries per day (contract active on that day,
  optional project, ticket, link, description, hours), side panel with
  month totals (hours + amount) and per-contract progress (annual, done
  in year up to selected month, in month, remaining).
- Toasts dismiss on click (v0.6.0): delegated handler in `App.vue`
  mapping the clicked `[data-sonner-toast]`'s `data-index` onto
  `toast.getToasts()` (vue-sonner has no native click-to-dismiss).
- Invoices (v0.8.0): `/invoices` page + sidebar entry. Creating an
  invoice (client, number, dateFrom/dateTo) shows live hours+amount of
  the period's not-yet-invoiced entries and, on save, locks them by
  setting `entries.invoiceId` (atomic writeBatch). Locked entries: no
  delete, only description editable (lock icon in the grid). Deleting an
  invoice unlocks its entries. `hours`/`amount` are frozen on the
  invoice doc.
- Historical data imported (2026-07-24): Jan–Jul 2026 from the owner's
  Google Sheet, 211 entries (4books 450h, Pull the rabbit 294h).
- Settings (v0.9.0): `/settings` page with tabs "Dati fiscali" (one row
  per year: regime ordinario/forfettario + profitability index % when
  forfettario) and "Aliquote fiscali" (rows per year: type
  contributi/tasse, name, rate %, fromIncome/toIncome € brackets,
  toIncome null = no cap). Groundwork for future net-income calcs — no
  consumer of this data yet. New `ui/tabs` component.
- Settings fixes + forfettario limits (v0.10.0): the settings dialogs
  broke on numeric input — Vue auto-casts native `type="number"` inputs
  to number (no `.number` modifier needed), so `.replace(',', '.')` on
  the ref threw inside the `valid` computed and the submit button never
  enabled. Numeric field refs are now `string | number` parsed via
  `parseDecimal()` (`lib/format.ts`). New forfettario-only fields on
  `fiscalYears`: `forfaitLimit` (limite ricavi, €) and `hardLimit` (€,
  above it the regime falls immediately and the year's invoices must be
  recomputed); null under ordinario, missing on older docs.
- Invoice payments (v0.11.0): each invoice can record what was actually
  collected — `payment { date, amount, description }` on the invoice
  doc (missing/null = not collected; may differ from the invoiced
  amount). ⋯ menu → "Registra/Modifica incasso…" dialog
  (`InvoicePaymentFormDialog.vue`, amount prefilled with the invoice
  total, "Rimuovi incasso" button when set); "Incassato" column in the
  table (amount + date, description as tooltip).
- Net-income calc + statino stats cards (v0.12.0): `lib/tax.ts`
  `computeNet()` — first consumer of `fiscalYears`+`taxRates`
  (forfettario: gross × profitability index → taxable; each rate row
  taxes its own bracket slice; ordinario: taxable = gross; null if the
  year has no fiscal profile). Statino side panel: month card gained
  "Netto previsto" and "Da accantonare" (on the month's billable
  amount); two new cards, per-client and all-clients, with year-to-
  selected-month Fatturato, Incassato (by `payment.date`) and Netto
  computed on the *collected* amount (an intermediary bills the
  clients; what the owner draws differs from what is invoiced).
- Invoice issue date (v0.13.0): new `date` field on invoices ("Data
  fattura" in the create dialog, default today; "Data" column in the
  table), now the reference for the Fatturato stats and list sorting.
  Docs created before it fall back to `dateTo` (stats) / `dateFrom`
  (sorting) and show "—" in the table.
- Fatturabile row (v0.14.0): the per-client and all-clients statino
  cards also show "Fatturabile" — every activity of the year up to the
  selected month at its contract rate, invoiced or not.
- Statistics section (v0.15.0): "Statistiche" sidebar group (children
  rendered inline, `AppShell.vue` nav now supports groups) with three
  views under `views/stats/`: per mese (year selector: KPI tiles with
  monthly averages, projection, "da accantonare"; forfettario limit
  meter — first consumer of `forfaitLimit`/`hardLimit`; ore + euro
  charts; monthly table where net is the *marginal* net of the
  cumulative collected, so rows sum to the year), per cliente (year
  selector: charts + table with hour-share bars), per anno (all years
  compared: charts + table with billable delta % and avg monthly net).
  Shared pieces: `lib/stats.ts` (`periodTotals` by date range,
  `invoiceRefDate`, `elapsedMonths`), `components/stats/` `BarChart.vue`
  (SVG grouped bars ≤3 series, hover tooltip, validated palette
  blue/orange/aqua, light+dark), `StatTile.vue`, `LimitMeter.vue`
  (status colors with icon+label). Charts never mix units (hours vs €).

- Mobile adaptation (v0.16.0): the app is now usable from the phone.
  `AppShell.vue`: sidebar hidden below `md`, replaced by a sticky top
  bar (hamburger) + slide-in overlay drawer sharing the same nav markup
  (closes on navigation/backdrop/Escape, body scroll locked);
  `viewport-fit=cover` + `env(safe-area-inset-*)` paddings. Statino
  view: selectors become a 2-col grid on mobile (client full width);
  short weekday + tighter cells below `sm`; entry edit/delete buttons
  always visible on touch (`pointer-fine:` hides them behind hover);
  bigger touch targets via `pointer-coarse:` variants; mobile-only FAB
  "aggiungi oggi" (visible when a client is selected and the grid shows
  the current month) and auto scroll-to-today on phones. Invoices and
  contracts tables render as card lists below `md` (same data + ⋯
  menu). Page headers wrap; `weekdayShortName()` added to
  `lib/format.ts`; hours input gets `inputmode="decimal"`. Impeccable
  skill artifacts added: `PRODUCT.md` (product truth: entry speed is
  the value to protect; mobile is a confirmed usage scene) and
  `.impeccable/live/config.json`.

The owner now uses the app with real data (registries created by hand,
2026 backlog imported): it has passed real usage, not just typecheck.

**Not yet done / next**:
- Invoices have no edit (delete + recreate is the flow) and entries
  already invoiced are never re-counted by overlapping periods — both
  deliberate choices, revisit only if asked.
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
- `users/{uid}/projects` — `{ clientId, name, active? }` (some clients
  want hours split by project; `active` missing = active)
- `users/{uid}/contracts` — `{ clientId, activity, startDate, endDate,
  annualHours, hourlyRate }`. One doc per (client, activity): the same
  client can pay different rates for different activities. `annualHours`
  is counted over the **calendar year** (anno solare).
- `users/{uid}/entries` — one activity row per doc: `{ date (YYYY-MM-DD),
  clientId, contractId, projectId|null, ticket, link, description, hours,
  invoiceId?|null }`. A day's total hours = sum of its entries;
  month/year totals come from date-range queries. `invoiceId` set =
  billed and locked (missing = not invoiced).
- `users/{uid}/invoices` — `{ clientId, number, date?, dateFrom, dateTo,
  hours, amount, payment?|null }`; hours/amount frozen at creation.
  `date` is the issue date (missing on older docs → fall back to
  dateTo). `payment` is `{ date, amount, description }`: what was
  actually collected (missing/null = not yet; can differ from `amount`).
- `users/{uid}/fiscalYears` — `{ year, regime: 'ordinario'|'forfettario',
  profitabilityIndex|null, forfaitLimit?|null, hardLimit?|null }` (one
  per year, uniqueness enforced in UI; limits € are forfettario-only).
- `users/{uid}/taxRates` — `{ year, type: 'contributi'|'tasse', name,
  rate, fromIncome, toIncome|null }` (bracket rows, many per year).

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
- Workflow: one commit per feature, straight on `main` (Italian
  conventional-commit messages), push right away — CI deploys. Update
  this file's Status section in the same commit. Verification is
  typecheck+lint+build plus the owner trying the deployed app: the
  browser can't be driven headlessly (Google login).
- Charts: hand-rolled SVG in `components/stats/` (no chart lib). Keep
  the dataviz rules: ≤3 series, one unit per chart, palette + dark
  variants live in `BarChart.vue`.
