# CLAUDE.md — statino

Personal timesheet app ("statino") replacing an Excel sheet: hours logged
per day, per client, against yearly contracts. Single user (Google login),
data on Firestore. UI language: Italian.

## Status (2026-07-31, v0.35.1)

**Done and deployed** to https://statino-gepisolo.web.app (CI green):

- Full setup: Firebase project `statino-gepisolo`, Google sign-in, Firestore
  (eur3) with owner-only + invite-allowlist rules, Hosting, GitHub Actions
  CI/CD (push to main → deploy; PRs → preview channel), plus a single
  Cloud Function proxying Fatture in Cloud (deployed by hand, see Firebase).
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

- Carico fiscale card (v0.17.0): "Statistiche per mese" gained a
  "Carico fiscale" card (next to the forfettario limit meter when
  present): Tasse, Contributi, Totale da accantonare (from
  `computeNet`'s existing breakdown on the year's collected amount)
  and "Carico fiscale medio" % (due / incassato). `formatPercent()`
  added to `lib/format.ts`.

- Italian date picker (v0.18.0): the six native `type="date"` inputs
  (contract start/end, invoice date/from/to, payment date) showed
  mm/dd/yyyy (browser locale) and attracted the LastPass icon over the
  native calendar glyph. Replaced by `ui/date-picker` `DatePicker.vue`
  (reka-ui DatePicker, `locale="it"`, week starts Monday): segmented
  dd/mm/yyyy field ("gg/mm/aaaa" placeholders) + calendar popover.
  v-model stays a `YYYY-MM-DD` string ('' = empty) so dialog logic is
  unchanged; no real `<input>` exists, so password managers ignore it.
  `@internationalized/date` added as a direct dep (was transitive).

- Invoice date backfill (v0.19.0): invoices predating the `date` field
  showed "—" in the list with no way to set it (invoices have no edit).
  Only when the date is missing, both the table cell and the mobile
  card show a pencil icon that opens the calendar popover directly
  (`DatePickerPanel.vue`, extracted from `DatePicker.vue` and shared);
  picking a day saves immediately via `invoicesRepo.setDate()` and
  re-sorts the list. The calendar opens on the invoice's `dateTo`
  month (`default-placeholder`), since the issue date is usually near
  the period end.

- Invoice discount (v0.20.0): the create-invoice dialog gained optional
  "Sconto €" + "Motivazione sconto" fields. `invoices.discount
  { amount, reason }` (missing/null = none); the frozen `amount` is
  saved already NET of the discount (gross = amount + discount.amount),
  so payments prefill and every stat keep working unchanged. Validation:
  discount needs a reason and can't exceed the billed amount. The
  summary box shows Importo − Sconto = Totale when set; the invoices
  list (table + mobile card) shows a muted "sconto −X €" line under the
  amount (reason as tooltip on desktop, inline on mobile).

- Guarded client deletion (v0.21.0): deleting a client is now blocked
  if it has statino hours (`entriesRepo.existsForClient`, checked when
  the confirm dialog opens; the Elimina button stays disabled and the
  text explains why). When allowed, `clientsRepo.removeCascade` deletes
  the client WITH its contracts and projects in one batch (no more
  orphans — the old dialog warned about them instead).

- Invoices year filter (v0.22.0): the invoices list has a year Select
  in the header (options = years present in the data ∪ current year,
  default current) filtering both the table and the mobile cards by
  `invoiceRefDate` (issue date, `dateTo` fallback — same reference as
  the stats). Saving an invoice switches the filter to its year so it
  never lands out of sight.

- Statino month cards split (v0.23.0): the first side-panel card is now
  "Totale <cliente>" (selected client's month: Ore, Importo, Netto
  previsto — the "Da accantonare" row was dropped); right below it a new
  "Totali <mese> <anno>" card shows the same three figures summed over
  ALL clients' entries of the month (`allMonth*` computeds). The
  fiscal-config hint moved to the all-clients card.

- Statino PDF export (v0.24.0): "Esporta PDF" button next to the
  statino selectors (visible when a client is selected) downloads the
  month grid as an A4 PDF to attach to the client's email:
  `lib/pdf.ts` `exportStatinoPdf()` with jspdf + jspdf-autotable
  (dynamically imported — own chunks, main bundle untouched). One row
  per activity ("attività · progetto · ticket — descrizione", the day
  cell rowSpans), weekends shaded, TOTALE foot row, entry links
  clickable (whole Attività cell), filename
  `statino-<cliente>-<YYYY-MM>.pdf`. Deliberately hours-only — no
  rates or amounts, it's a client-facing report of the grid, not the
  side cards.

- Tasks kanban (v0.25.0): "Attività" sidebar entry (`/tasks`,
  `views/tasks/TasksView.vue`) with tabs Attive|Archivio. Active tab:
  TODO / WIP / Done columns; + on TODO creates
  (`components/tasks/TaskFormDialog.vue`: num auto-increment, cliente,
  attività, descrizione). Cards show client+title only; click opens
  the dialog (everything editable, incl. stato TODO/WIP/Done OK/Done
  KO/Archiviata — the last only offered from done; picking Done OK/KO
  reveals an optional Ore field). New `users/{uid}/tasks` docs:
  `{ num, clientId, title, description, status
  todo|wip|done_ok|done_ko, archived, hours|null, order }` — archiving
  is a flag so the OK/KO outcome (and its green/red tint) survives in
  the Archivio list. Ordering: `order` asc per column, entering a
  column lands on top (min−1); HTML5 drag & drop reorders and moves
  between columns (drop on Done defaults to Done OK; a drop rewrites
  the target column's orders via `tasksRepo.reorder` batch,
  optimistic local update). DnD is desktop-only; on touch the dialog's
  status select covers the same moves. No rules change needed
  (`users/{uid}/{document=**}`).

- Task dates (v0.26.0): tasks now record `createdAt` (stamped at
  creation) and `doneAt` (stamped when the status enters Done OK/KO —
  via dialog select or drag & drop — cleared if the card moves back to
  TODO/WIP; staying within Done keeps the original date). Both
  YYYY-MM-DD strings, missing on docs predating the fields (`doneAt`
  stays null for tasks already done before it existed). Saved only, not
  shown in the UI yet.

- "A statino" from done tickets (v0.27.0): the task dialog of a Done
  OK/KO task shows a one-shot secondary button "A statino" bottom-left
  (`sm:mr-auto` in the footer). It opens `EntryFormDialog` (new
  optional `prefill` prop, create mode only) on the task's client and
  `doneAt` day (today if missing), prefilled with ticket `#<num>`,
  descrizione = task title (title only — deliberate), ore = task hours;
  only the contract is left to pick (contracts+projects fetched on
  click, filtered client+date; no active contract → toast, no dialog).
  Saving the entry stamps `tasks.statinoEntryId` and closes both
  dialogs; the button never shows again for that task (missing = never
  sent, on older docs too).

- Internal tickets clickable in the grid (v0.28.0): an entry whose
  ticket field matches `#<num>` (and has no link — the external link
  branch wins) renders as a primary-colored button in the statino row;
  clicking opens the task dialog of the matching Attività ticket (tasks
  lazy-loaded at first click, cached; unknown num → toast). Saving from
  that dialog updates the cache, and if the save stamped a new
  `statinoEntryId` (its "A statino" flow) the grid entries reload. Also:
  the per-entry "(x h)" in the row now shows only on days with 2+
  entries — on single-entry days it duplicated the day-total column.

- Statino badge on task cards (v0.29.0): cards of the Attività board
  (and the Archivio list) show a muted `CalendarCheck` icon top-right
  (next to the client name, aria-label "Riportata a statino") when
  `statinoEntryId` is set — no need to open the dialog to check.

- `entity.name` required by FIC (v0.35.1): creating an invoice failed with
  422 `{"entity.name": ["The entity.name field must not be empty."]}` —
  Fatture in Cloud wants the entity **name alongside its id**, even though
  the id alone identifies it. `buildIssuedDocument` now sends
  `entity: { id, name }`, the name coming from the client mapping that was
  already stored. Caught by intercepting `window.fetch` in the live page and
  reading the callable's response: the `validationResult` passthrough added
  in v0.33.0 named the offending field, which is exactly what it was for.

- PDF export modes (v0.35.0): "Esporta PDF" became a dropdown with three
  variants, driven by `StatinoPdfInput.mode`. The grid and the per-project
  recap were already the two independent blocks of the export, so the modes
  are just their sensible combinations: `completo` (both, as before),
  `statino` (grid only — it already carries its TOTALE foot row), `totali`
  (recap only, starting right under the header instead of after the grid).
  Filenames get a suffix (`-statino`, `-totali`) so the three variants of the
  same month don't overwrite each other in the downloads folder. Degenerate
  case handled: `totali` on a month with no project at all still prints the
  hours total, under "Totale ore" instead of "Totale per progetto". Verified
  in Node by generating all four and inspecting the output (jsPDF's `save()`
  writes to disk under Node, which makes this cheap to re-check).

- VAT type lost on reopen (v0.34.1): the parameters dialog restored the field
  with `c.vatId ? String(c.vatId) : ''`, and **on Fatture in Cloud the VAT type
  with `id: 0` is the ordinary 22% rate** (`1` is 21%, `2` is 20%…). Zero is a
  legitimate id, so the falsy test read a saved choice as "never chosen": the
  save was fine, the read threw it away. `FicConfig.vatId` is now
  `number | null` — null means not chosen, which is what `0` was wrongly doing
  double duty for — restored with `!= null`, and `buildIssuedDocument` throws
  rather than invent a VAT id (the invoice dialog blocks first, with a message
  pointing at the connector). Also: FIC leaves `description` empty on standard
  rates, so the menu entry rendered as " (22%)" and the detail page showed "—";
  `vatTypeLabel()` falls back to `Aliquota <value>%` and is what gets cached in
  `vatDescription`.

- Integrations section (v0.34.0): the Fatture in Cloud config moved out of
  Settings into its own "Integrazioni" sidebar entry, and stopped being a
  singleton. `users/{uid}/integrations/{id}` is now a real collection of
  `{ type, provider, title, config }` rows, so two connectors of the same
  provider (two FIC accounts) can coexist. `type` and `provider` are code
  enums, not free text — a type implies behaviour, a provider implies an API;
  `lib/integrations.ts` holds the labels and `PROVIDERS_BY_TYPE`. `title` is
  the user's own label ("Jedisoft"), what distinguishes two identical
  connectors.
  - `/integrations` lists them (Tipo | Nome | Titolo | stato); `+` asks type
    then provider then title and creates the row **disconnected**, landing on
    `/integrations/:id`, which holds the three sections that used to be the
    settings tab (connection, invoice parameters, client mapping).
  - Secrets: `integrationSecrets/{uid}` keeps one field per connector, named
    `<integrationId>Token`. That naming is why the migration is free — see
    below. `removeWithToken` deletes both, since a token orphaned inside an
    unreadable document could never be cleaned up from the UI.
  - The invoice dialog gained a connector step (skipped when only one is
    configured) and `Invoice.external` records `integrationId` +
    `integrationTitle` (a copy, because the connector can be renamed or
    deleted later).
  - **One-shot migration inside `integrationsRepo.list`, delete once it has
    run**: rows without `type` are the old fixed-id `fattureincloud` doc with
    the config flat at top level, rewritten in place as a typed row with the
    config nested. The token is untouched: the old doc id becomes the
    integration id, so the pre-existing `fattureincloudToken` field already
    matches the `<integrationId>Token` convention.
  - Also fixed here: the parameters dialog used `Promise.all`, so a 403 on
    vat types silently blanked the payment methods too — it now uses
    `allSettled` and prints per-field why a list is empty. Real cause of that
    403: `/info/vat_types` needs the **`settings:r`** scope on the token,
    which `/info/payment_methods` apparently does not. And the SdI payment
    code is a `Select` over the FatturaPA `ModalitàPagamento` table
    (`EI_PAYMENT_METHODS`) instead of a free-text field — MP05 is a standard
    SdI code, not something FIC invents, but nobody should have to know that.

- Dialog overflow fix (v0.33.1): every dialog containing a `Textarea` could
  spill its fields, footer and buttons outside the white panel, over the
  backdrop — seen on the task dialog (a pasted Google Sheets URL) and on the
  Fatture in Cloud token dialog. Cause: `Textarea` carries
  `field-sizing-content` (wanted, it grows in height) which also makes it ask
  for its *content's* width; one space-less string then gives it a huge
  min-content width, and since `DialogContent` is a `grid` whose children
  default to `min-width: auto`, the track grew to that width dragging every
  sibling with it (`max-w-lg` only clamps the panel, not the overflowing
  tracks). Fix: `[&>*]:min-w-0` on `DialogContent`, so no child can force the
  track wider — it covers every current and future dialog. **`DialogContent`
  is a shadcn-vue generated file**: re-running the generator would drop it,
  and the class is not decorative. The emitted rule is
  `.\[\&\>\*\]\:min-w-0>*{min-width:0}` in the built CSS.

- Fatture in Cloud integration (v0.33.0): from the invoices ⋯ menu,
  "Crea fattura su Fatture in Cloud…" turns a statino invoice into a real
  FIC document. **The reason there is now a backend**: `api-v2.fattureincloud.it`
  answers the CORS preflight with a bare 204, no `Access-Control-Allow-Origin`,
  so the browser can never call it — verified by curl, don't re-test it.
  - `functions/` (new npm package, Node 24, CommonJS, own `tsc` gate):
    one callable `fattureincloud` in `europe-west1`, `maxInstances: 3`.
    Not a path proxy — a closed `op` union (`companies` | `entities` |
    `vatTypes` | `paymentMethods` | `createInvoice`). It gates on
    `request.auth` + the same allowlist as the rules, then reads the token
    with the Admin SDK. All response unwrapping lives there (`/user/companies`
    nests under `data.companies`, entities paginate); status→`HttpsError`
    mapping too. Logs `{ op, uid }` only, never the token or the body.
  - ⚠️ **Never import from `firebase-functions/v2`** (the barrel), only from
    narrow subpaths like `firebase-functions/v2/https`. The barrel eagerly
    loads every v2 provider, `database` included, which pulls
    `firebase-admin/lib/database` → `@firebase/database-compat` →
    `@firebase/app`, absent from the production container. It costs a
    deploy to find out: the upload succeeds and the Cloud Run revision
    dies at startup with `Cannot find module '@firebase/app'` /
    "Container Healthcheck failed". **It does not reproduce locally** —
    `firebase-admin` resolves a different database entry point here, so
    `require('lib/index.js')` loads fine on the dev machine. That is also
    why the function's options sit on `onCall` instead of in a
    `setGlobalOptions` (which only the barrel exports). To check a change:
    `node -e "require('./lib/index.js')"` then look for `v2/providers`
    entries in `require.cache` — only `https` may appear.
  - Auth is FIC's **Manual Authentication**: the owner registers an app,
    connects it from the FIC web app and pastes a never-expiring access
    token. No OAuth, no client_secret.
  - The token lives in a **top-level** `integrationSecrets/{uid}`, write-only
    from the browser (`allow read: if false`). It can't sit under
    `users/{uid}/…`: the recursive wildcard there already grants read and
    rules are OR-ed, so a nested rule cannot revoke it.
  - `lib/fattureincloud.ts` is pure (no Firebase import): builds the lines
    and the document, so the dialog can re-render the preview on every
    keystroke. `lib/fattureincloudApi.ts` is the only file that knows where
    the proxy lives — swapping host later touches nothing else.
  - Four aggregations: `unica` (qty 1 × total), `esplose` (one line per
    entry, `descrizione (#ticket)`, no date), `contratto`, `progetto`
    (grouped by project+contract, so a project on two rates splits into
    two lines named `<progetto> — <attività>` instead of averaging).
    The discount becomes a negative line (FIC's `discount` is a percentage
    and can't express euros). Lines reconcile against the frozen
    `invoice.amount`; a residual adds an "Arrotondamento" line, and the
    dialog blocks the submit above 5 €.
  - **Bollo**: FIC has only `stamp_duty` and adds it to the document total
    by itself — there is no "charged to client" flag, so adding a rivalsa
    line too would double it. It stays outside the reconciliation.
  - `payments_list` is only sent when `computeTotals().exact` (rivalsa and
    cassa both zero, i.e. the owner's forfettario): otherwise the gross
    can't be derived with certainty and FIC computes the due date itself.
    After creation the computed gross is compared with `amount_gross` and
    a mismatch raises a warning toast.
  - Settings gained a third tab (connection with inline token verification
    that never persists a bad token, invoice parameters read from FIC, and
    the statino-client → FIC-entity mapping the dialog requires).
    `integrationsRepo.saveFic` is a full `setDoc`: all three dialogs spread
    the current config — same trap as `ProjectsView.toggleActive` in v0.32.0.
  - `Invoice.external` records the created document; the menu entry is
    replaced by "Scollega…" and the number shows as `FIC n. X` under the
    invoice number. The delete confirm warns that the FIC document survives.
    `InvoiceActionsMenu.vue` was extracted in the same commit — the ⋯ block
    was duplicated verbatim between the desktop table and the mobile card,
    and it went from 2 to 5 entries.

- Project badge colors (v0.32.0): a project can carry `bgColor` +
  `textColor` (`#rrggbb`), edited in `ProjectFormDialog` with two
  native color pickers, a live badge preview and 18 ready-made pairs
  (`BADGE_PRESETS` in the new `lib/colors.ts`) — all verified at ≥5:1
  contrast, so they read in both themes. Colors are opt-in: without a
  pair the badge keeps `bg-accent`/`text-accent-foreground`, which is
  the only variant that follows light/dark ("Ripristina predefiniti"
  goes back to it by saving null/null). `contrastRatio()` flags a
  hand-picked pair below 4.5:1 without blocking the save. Consumers go
  through `badgeClass()`/`badgeStyle()`: statino grid, projects list,
  per-project rows in the client stats, plus a color dot in the entry
  editor's project select. Not in the PDF — that export stays neutral.
  Watch out: `projectsRepo.update` is a `setDoc`, so `toggleActive` in
  `ProjectsView` had to start carrying the colors over (it would have
  wiped them on every switch).

- Per-project breakdown (v0.31.0), two places:
  - "Statistiche per cliente" table: each client row is expandable
    (chevron, `expanded` Set) into one row per project — plus a
    "Senza progetto" bucket for entries with `projectId: null`, always
    last. Only **Ore** and **Fatturabile** are split, because both come
    from the entries; **Fatturato** and **Incassato** show "—" on the
    project rows, since invoices and payments carry no project and any
    split would be invented (a footnote in the card says so). Hour
    shares stay measured against the grand total, so the project rows
    add up to their client's own percentage. Clients whose entries all
    lack a project get no chevron.
  - Statino PDF: a "Totale per progetto" table under the grid (hours
    only, same as the rest of the export — no rates or amounts), so the
    client can charge the hours to its cost centres. Same "Senza
    progetto" bucket, biggest first; the whole table is omitted when no
    entry of the month has a project. It starts on a new page when the
    grid leaves less room than the recap needs (`lastAutoTable.finalY`
    + a size estimate); verified in Node on a full month (recap lands
    on the grid's last page) and a light one (recap moves to page 2).

- One-click archive on the board (v0.30.0): Done cards show an
  `Archive` button top-right, next to the statino badge when present
  (both live in a small icon row beside the client name). Click →
  `tasksRepo.archive()` (partial `updateDoc`: only `archived` + a
  top-of-archive `order`; the done outcome and `doneAt` are untouched),
  optimistic local update rolled back on error, success toast, no
  confirm — the Archivio tab keeps the card and the dialog can send it
  back. Deliberately Done-only, matching the dialog's "Archiviata"
  option: archiving a TODO/WIP task would have to invent a done
  outcome, since `archived` is a flag over a done status.

- Hosting cache headers (v0.29.1–0.29.2): after a deploy the browser
  kept serving the previous build — Firebase Hosting's default
  `cache-control: max-age=3600` on the app shell meant the cached index
  pointed at the old hashed chunks for up to an hour (v0.29.0 was live
  but showed as 0.28.0 in the sidebar). `firebase.json` now sets
  `no-cache, max-age=0` on the shell and `public, max-age=31536000,
  immutable` on `/assets/**` (filenames are content-hashed). Gotcha
  behind the 0.29.2 follow-up: headers match the **requested URL**, not
  the file the SPA rewrite resolves to, so a `/index.html` rule leaves
  `/` and `/tasks` on the default. The no-cache rule is therefore a
  `regex: "^/[^.]*$"` (every extension-less path, i.e. all SPA routes)
  plus the literal `/index.html`; the three patterns are deliberately
  disjoint, since the docs don't state which rule wins when globs
  overlap.

The owner now uses the app with real data (registries created by hand,
2026 backlog imported): it has passed real usage, not just typecheck.

**Not yet done / next**:
- Fatture in Cloud: sending to the SdI is deliberately out of scope for
  v1 (`POST …/e_invoice/send` with `options.dry_run` exists) — the
  document is created and the send stays a manual step on their site.
  Two things to watch on the first real run: whether FIC accepts the
  negative `net_price` of the discount line (fallback: recompute it as a
  percentage on the last work line), and whether `payments_list` matches
  their `amount_gross`. Also unverified: the deep link to the document on
  the FIC web app — only the temporary PDF `url` is stored today.
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
- **Cloud Functions** (since v0.33.0, the only one): `functions/`, region
  `europe-west1`, runtime **nodejs24** (GA; deprecated 2028-04-30 — the
  full table is in firebase-tools' `runtimes/supported/types.js`), requires
  the **Blaze** plan. The runtime is declared twice: `firebase.json`
  `runtime` is what the CLI actually uses (`getRuntimeChoice` returns
  `runtimeFromConfig || <package.json engines>`, no consistency check),
  while `functions/package.json` `engines.node` exists so npm stops warning
  EBADENGINE on the predeploy `npm ci`. Keep them equal — a drift would be
  silent. **CI does not deploy it** —
  `action-hosting-deploy@v0` only does hosting, and the service account
  from `firebase init hosting:github` lacks the roles. Deploy by hand:
  `npm run functions:deploy` (or `npx firebase-tools deploy --only
  functions,firestore:rules`). To automate it later the SA needs
  `cloudfunctions.developer`, `run.admin`, `artifactregistry.writer`,
  `iam.serviceAccountUser`, `serviceusage.serviceUsageConsumer`, plus an
  `npm ci --prefix functions` step. `functions/**` is in the eslint
  ignores (root config is a browser/Vue one; `tsc` is that package's gate)
  and outside `tsconfig.app.json` — without the ignore, `npm run lint`
  would walk `functions/lib/**` and `--max-warnings 0` would break CI.
  Local testing: `npx firebase-tools emulators:start --only functions`
  plus `VITE_FUNCTIONS_EMULATOR=true` in `.env` (the emulator talks to
  the real Firestore/Auth, so it reads the real token).

## Domain model (`src/types/models.ts`)

- `users/{uid}/clients` — `{ name }`
- `users/{uid}/projects` — `{ clientId, name, active?, bgColor?,
  textColor? }` (colors are `#rrggbb` badge colors, both null/missing =
  theme default; see `lib/colors.ts`) (some clients
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
- `users/{uid}/integrations/{id}` — one row per connector:
  `{ type: 'fatturazione', provider: 'fattureincloud', title, config }`.
  For FIC, `config` holds company, masked token hint, invoice parameters
  (numeration, vat type, payment method + due days, stamp duty + threshold,
  rivalsa, cassa, withholding, e-invoice flag + SdI payment code, notes,
  default aggregation) and `mappings[]` statino client → FIC entity.
- `integrationSecrets/{uid}` — **top-level**, one field per connector named
  `<integrationId>Token`. Writable by the owner, readable by nobody: only the
  Cloud Function reads it, with the Admin SDK. See the Firebase section for
  why it cannot live under `users/{uid}/…`.

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
