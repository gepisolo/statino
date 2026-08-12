# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user, permanently: the owner (gepisolo), an Italian freelance
consultant who logs worked hours per client against yearly contracts.
The invite allowlist exists purely as access protection, not as a
multi-user ambition — "solo io, per sempre" (confirmed 2026-07-26).

Usage scenes (confirmed): primary entry happens at the desktop at the
end of the day; the owner also uses it from the phone (mobile web), so
the UI must stay workable on small screens, not desktop-only.

## Product Purpose

Replace the owner's Excel timesheet with something faster and more
reliable: log hours per day/client/contract, turn them into invoices,
record what was actually collected, and understand the fiscal picture
(net income, forfettario limits) across the year.

Success criterion to protect (confirmed): **speed of hours entry**. The
main value over the spreadsheet is logging daily activities with less
friction. Fiscal visibility, invoice bookkeeping, and statistics are
valued, but entry speed is the thing future work must never degrade.

## Positioning

Not a market product — a personal tool exactly shaped on the owner's
real workflow: Italian fiscal regimes (forfettario/ordinario, bracket
tax rates), an intermediary who bills the clients (so collected ≠
invoiced, and net is computed on the *collected* amount), yearly
contracts with per-activity hourly rates counted over the calendar
year. No neighboring product models this situation exactly.

## Operating Context

- Rhythm: daily/end-of-day hours entry (desktop), occasional mobile
  use; invoicing per period; payments recorded when the intermediary
  pays.
- Real data since January 2026 (211 imported entries plus live use);
  the app has passed real usage, not just typecheck.
- The domain model, screens, and Firebase architecture are documented
  in CLAUDE.md — that file remains the technical authority.

## Capabilities and Constraints

- Capabilities: statino month grid (multiple entries/day, contract-
  gated) with client-facing PDF export of the month (grid + per-project
  hour recap, so the client can charge them to its cost centres),
  client/contract/
  project registries, invoices with entry locking, optional discount
  and payment recording, fiscal settings per year, net-income calc,
  statistics section (per month/client/year), tasks kanban ("Attività":
  TODO/WIP/Done + archive, creation/done dates). Kanban and statino are
  bridged both ways: a done ticket flows into the statino via a one-shot
  "A statino" button (badge on the card once sent), and `#num` tickets
  in the grid open the corresponding task dialog. A statino invoice can
  become a real document on **Fatture in Cloud** (four ways of grouping
  the hours into lines, with a preview that must reconcile with the
  frozen amount before it can be sent). See CLAUDE.md Status for detail.
- UI language: **Italian**, always.
- Firestore + Auth, plus a single Cloud Function that proxies Fatture in
  Cloud (their API sends no CORS headers, so the browser cannot call it);
  Google login means the deployed app cannot be driven headlessly for
  verification.
- Charts are hand-rolled SVG, ≤3 series, one unit per chart (dataviz
  rules in CLAUDE.md).
- Deliberate non-features: invoices have no edit (delete + recreate);
  overlapping invoice periods never re-count already-invoiced entries;
  issuing to the SdI will never be built (confirmed 2026-08-12) — statino
  creates the document on Fatture in Cloud, the owner sends it from there.

## Brand Commitments

- Name: **statino** (lowercase, Italian for "little timesheet" —
  affectionate diminutive of the paper statement it replaces).
- Voice: plain Italian, practical, no marketing tone — it is a tool
  the owner talks to daily.
- Light and dark themes are both supported and must both stay correct.

## Evidence on Hand

- Real production data in Firestore (`statino-gepisolo`): entries
  since Jan 2026, real clients, contracts, invoices, payments.
- No testimonials, case studies, or marketing assets exist and none
  should ever be fabricated — there is no marketing surface.

## Product Principles

1. **Entry speed is sacred.** Any change to the statino grid or the
   activity editor is judged first on whether logging a day gets
   faster or slower.
2. **One person's truth.** No multi-tenant generality, no roles, no
   configurability for hypothetical users; model the owner's actual
   fiscal and contractual reality precisely.
3. **Numbers must reconcile.** Hours, invoiced, collected, and net
   figures follow explicit, documented rules (locked entries, frozen
   invoice amounts, marginal net); never show a number the owner
   can't trace.
4. **Desktop-dense, mobile-workable.** Optimize for the end-of-day
   desktop session, but every screen must remain usable from a phone.
5. **Italian, always.** All UI copy, labels, and messages in Italian.
