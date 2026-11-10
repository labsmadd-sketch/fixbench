# FixBench

Service tickets, quotes, invoices, payments and stock for computer repair shops.
React + Vite + TypeScript talking directly to Firebase — no server to run.
Each shop gets its own Firebase project from this one codebase, with its own
name, logo and brand colour.

- Plan: [`../Computer Repair Shop Manager — Firebase Plan.md`](../Computer%20Repair%20Shop%20Manager%20—%20Firebase%20Plan.md)
- UI design: [Repair Shop Manager — UI Design](https://claude.ai/artifact/6ptgNveZzd7eAtbU46Kyfh) (private canvas)

## Run it locally

Needs Node 20+ and Java 11+ (for the Firebase emulators).

```bash
npm install
npm run emulators        # terminal 1 — Auth + Firestore emulators, UI at http://localhost:4000
npm run seed             # terminal 2 — owner, manager, front desk and technician accounts
npm run dev              # terminal 2 — app at http://localhost:5173
```

Sign in as `owner@demo.test` / `password123` (see the seed output for the other roles).
The owner is sent to the setup wizard first; press **Finish setup** to reach the app.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | App against the local emulators (`.env.emulator`) |
| `npm run emulators` | Auth and Firestore emulators for project `demo-fixbench` |
| `npm run seed` | Staff accounts and shop settings in the emulators |
| `npm test` | Unit tests: theming contrast, phone numbers, money |
| `npm run test:rules` | Security rules tests against the Firestore emulator |
| `npm run typecheck` | TypeScript, no output |
| `npm run build:shop shop-<alias>` | Production build using `.env.shop-<alias>` |
| `npm run setup:shop -- …` | Create and deploy a new shop (see `scripts/setup-shop.mjs`) |

## Layout

```
src/
  app/          session (auth + staff record + shop settings), route guards, layout
  theme/        brand colour → CSS variables, global styles
  lib/          firebase, numbering (transactions), phone, money, useOnline
  features/     one folder per module as it is built; placeholders in pages.tsx
  components/   shared UI
tests/          Firestore security rules tests
scripts/        setup-shop.mjs, seed-emulator.mjs
```

## Ground rules

- **Money** is integer cents (`lib/money.ts`). Never store rupees as floats.
- **Numbers** (tickets, quotes, invoices) come from `issueNumbered()` in a transaction. It needs a connection; block the action while offline.
- **Phone lookups** use `phoneKey()` so every way of typing a number matches.
- **Every permission is enforced in `firestore.rules`.** Hiding a button is not security. Add a rules test for every rule change.
- **Invoices are voided, never deleted.**
- **Brand colours** go through `deriveTheme()`, which keeps every text/background pair at 4.5:1 or better.

## Status

Phase 1 (Foundations): sign-in, roles, theming, layout, rules, emulator seed, setup script draft, CI.
Other screens are placeholders that name the roadmap phase that builds them.
