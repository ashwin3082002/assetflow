# AssetFlow – IT Asset Management System

AssetFlow lets an organisation track every physical IT asset (laptops, monitors, headsets, …), lend units to employees through an approval workflow, record maintenance, and collect reviews. It is an academic full-stack project (App Dev Lab) built on the mandatory stack: **Node.js + Express + TypeScript**, **PostgreSQL + TypeORM**, **React + Vite**, JWT authentication and role-based access control.

Three roles:

| Role | Code | What they do |
|---|---|---|
| Admin | `ADMIN` | Everything IT Staff can do, plus user and category management and the admin dashboard |
| IT Staff (Role Type A, asset owner) | `IT_STAFF` | Create/edit assets and images, approve/reject/allocate requests, complete returns, run maintenance, retire units |
| Employee (Role Type B) | `EMPLOYEE` | Browse and search assets, request a unit, return it, review completed loans |

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick start (fresh clone → running demo)](#2-quick-start-fresh-clone--running-demo)
3. [Environment variables](#3-environment-variables)
4. [Commands](#4-commands)
5. [Demo accounts and seed data](#5-demo-accounts-and-seed-data)
6. [Demo walkthrough](#6-demo-walkthrough)
7. [Tests](#7-tests)
8. [Architecture summary](#8-architecture-summary)
9. [Documentation](#9-documentation)
10. [Troubleshooting](#10-troubleshooting)

## 1. Prerequisites

- **Node.js 20+** and npm 10+ (`node -v`)
- **PostgreSQL 14+** running locally with a user that can create databases (`psql --version`)
- Redis is **not** required (it is an optional, feature-flagged enhancement that is not part of the core demo)

## 2. Quick start (fresh clone → running demo)

Takes about five minutes on a laptop. Run the steps in order; every command is copy-pasteable.

### 2.1 Create the two empty databases

Only the databases are created by hand. **All tables, enums, indexes and constraints are created programmatically by TypeORM from the entity classes** (`synchronize`) the first time the API or the seed script starts. There is no SQL DDL anywhere in the repository.

```bash
createdb assetflow
createdb assetflow_test      # used only by the backend test suite
```

If your PostgreSQL user needs a password or a different host, adjust `DATABASE_URL` / `TEST_DATABASE_URL` in the next step.

### 2.2 Backend

```bash
cd backend
npm ci
cp .env.example .env         # then edit DATABASE_URL, TEST_DATABASE_URL and JWT_SECRET
npm run seed                 # creates the schema and loads the demo dataset
npm run dev                  # API on http://localhost:4000
```

`GET http://localhost:4000/api/health` returns `{ "data": { "status": "ok", "db": "up" } }` when the API and database are up.

### 2.3 Frontend (second terminal)

```bash
cd frontend
npm ci
cp .env.example .env         # VITE_API_URL=http://localhost:4000 is already correct for local use
npm run dev                  # UI on http://localhost:5173
```

Open <http://localhost:5173> and log in with one of the [demo accounts](#5-demo-accounts-and-seed-data).

## 3. Environment variables

Backend (`backend/.env`, validated with zod at boot; the process refuses to start on an invalid configuration):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | `development`, `test` or `production` (production hides internal error messages) |
| `DATABASE_URL` | – | e.g. `postgres://postgres:postgres@localhost:5432/assetflow` |
| `TEST_DATABASE_URL` | – | e.g. `…/assetflow_test`; used by Jest, which drops and recreates its schema on every run |
| `JWT_SECRET` | – | required, at least 16 characters |
| `JWT_EXPIRES_IN` | `8h` | token lifetime |
| `UPLOAD_DIR` | `uploads` | asset images, relative to `backend/`; served at `/uploads` |
| `CORS_ORIGIN` | `http://localhost:5173` | allowed browser origin |
| `MAX_ACTIVE_REQUESTS` | `5` | active requests an employee may hold at once |
| `REDIS_URL` | unset | optional enhancement only; leave unset |

Frontend (`frontend/.env`): `VITE_API_URL=http://localhost:4000` (base URL of the API, no trailing slash).

## 4. Commands

| Location | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | start the API with reload (`tsx watch`) |
| backend | `npm run seed` | idempotent demo dataset; `npm run seed -- --reset` drops and recreates the schema first |
| backend | `npm test` | Jest + supertest integration suite against `TEST_DATABASE_URL` (runs serially) |
| backend | `npm run test:coverage` | same suite with a coverage report in `backend/coverage/` |
| backend | `npm run lint` · `npm run typecheck` · `npm run build` | ESLint · `tsc --noEmit` · compile to `dist/` (`npm start` runs it) |
| frontend | `npm run dev` | Vite dev server on port 5173 |
| frontend | `npm test` | Vitest + React Testing Library |
| frontend | `npm run lint` · `npm run typecheck` · `npm run build` | ESLint · `tsc --noEmit` · production bundle in `dist/` (`npm run preview` serves it) |

## 5. Demo accounts and seed data

All seeded accounts use the password **`Password123`**.

| Email | Role | Notes |
|---|---|---|
| `admin@assetflow.dev` | ADMIN | Ava Admin |
| `staff1@assetflow.dev` | IT_STAFF | Sam Staff, manages most laptops/monitors/peripherals |
| `staff2@assetflow.dev` | IT_STAFF | Sara Staff, manages the MacBook, ThinkPad, projector, headsets |
| `emp1@assetflow.dev` | EMPLOYEE | Eli, Engineering: one pending request, one monitor on loan, one review |
| `emp2@assetflow.dev` | EMPLOYEE | Emma, Marketing: one approved request, one return pending |
| `emp3@assetflow.dev` | EMPLOYEE | Ethan, Finance: one pending request, one **overdue** projector loan, one review |

The seed also creates 8 categories, 15 assets (one row per physical unit, unique serial numbers, mixed conditions and loan limits), one request in every status (PENDING, APPROVED, ALLOCATED incl. one overdue, RETURN_PENDING, COMPLETED, REJECTED, CANCELLED), one OPEN and two COMPLETED maintenance records, and two reviews. Asset statuses are consistent with the request/maintenance invariants. Re-running `npm run seed` never duplicates data; use `-- --reset` to start from an empty schema.

## 6. Demo walkthrough

Use three browser sessions (or one browser plus private windows). Run `npm run seed -- --reset` first for the exact figures below.

1. **Register** a new employee at `/register` (registration always creates an EMPLOYEE). You land on `/employee` with empty states and a "Browse assets" link.
2. **Employee – search and request.** Open `/assets`; combine keyword search, category, "available only", sorting and paging (all server-side). Open an AVAILABLE laptop and submit a request. Try a loan longer than the unit's *max loan days*: the API answers 400 and the form shows the field error.
3. **Employee – RBAC.** Type `/admin` in the address bar → the 403 page. Then from a terminal:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"emp1@assetflow.dev","password":"Password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')
   curl -s http://localhost:4000/api/users -H "Authorization: Bearer $TOKEN"
   # → {"error":{"code":"FORBIDDEN","message":"..."}}  (authorization is enforced by the API, not the UI)
   ```
4. **IT Staff – approve.** Log in as `staff1@assetflow.dev`. The dashboard shows the pending request; open it and approve. The asset is now RESERVED in the list. A second employee who tries to request it gets a 409 shown inline (no waitlist).
5. **IT Staff – allocate and return.** Allocate the request; the employee sees it under "My assets" and clicks *Initiate return*. Staff completes the return with condition FAIR: the asset is AVAILABLE again with condition FAIR. (Completing with DAMAGED moves the unit to UNDER_MAINTENANCE instead and flags it on the staff dashboard until a maintenance record is opened.)
6. **Employee – review.** On the completed request, submit a rating and comment. The average rating appears on the asset and in the list.
7. **IT Staff – maintenance.** From an AVAILABLE asset, *Open maintenance*: employees can no longer request it. Under `/staff/maintenance`, complete the record with a resulting condition and cost (optionally retiring the unit).
8. **Admin.** Log in as `admin@assetflow.dev`: create an IT Staff user under `/admin/users`, deactivate an employee (their next API call is rejected and they are logged out), manage categories under `/admin/categories` (deleting a category in use → 409), and view the admin dashboard.
9. **Programmatic schema.** `psql assetflow -c '\d assets'` shows the table, enum types, foreign keys and indexes that TypeORM created from `backend/src/entities/`. `\di` lists the partial unique indexes that guarantee one active request per unit.
10. **Graceful failure.** Stop the API (Ctrl+C in the backend terminal): every data view shows an error alert with a *Retry* button that recovers once the API is back.

## 7. Tests

```bash
cd backend && npm test          # 14 suites: auth, RBAC matrix, validation, workflows, invariants, dashboards
cd frontend && npm test         # ProtectedRoute, login, list states, role-aware pages, dashboards
```

The backend suite uses a real PostgreSQL database (`TEST_DATABASE_URL`) with `dropSchema + synchronize`, so it must run serially (`npm test` already passes `--runInBand`; do not start two Jest processes against the same test database). `npm run test:coverage` writes an HTML/text report to `backend/coverage/`. 

## 8. Architecture summary

```
browser ── React 18 + Vite + React Router + Bootstrap 5 ──▶ axios (src/api/*) ──▶ /api  (JSON)
                                                                                    │
backend ── Express 4 + TypeScript ── routes → validate(zod) → authenticate(JWT) → authorize(roles) → controller → service → TypeORM ──▶ PostgreSQL
```

- **Separation**: `backend/` and `frontend/` are independent npm projects that communicate only over `/api`; uploaded images are served from `/uploads`.
- **Backend layering**: a module per feature (`auth`, `users`, `categories`, `assets`, `requests`, `maintenance`, `reviews`, `dashboard`) with `routes`, `controller`, `service`, `schemas` files. Controllers are thin; every business rule, ownership check and state transition lives in a service.
- **Security**: bcrypt password hashing; HS256 JWT; `authenticate` reloads the user on every request and rejects inactive accounts; `authorize` gates roles; services enforce ownership. helmet, CORS allowlist, rate limiting on login/register, 1 MB JSON limit, strict zod schemas (unknown fields rejected), UUID-validated ids, whitelisted sort fields, image uploads restricted to JPEG/PNG/WebP ≤ 2 MB with regenerated filenames.
- **Data model**: six entities (User, Category, Asset, AssetRequest, MaintenanceRecord, Review) with one-to-one, one-to-many and many-to-one relations, UNIQUE/CHECK/FK constraints and partial unique indexes that guarantee at most one active request per unit and one open maintenance record per unit.
- **Workflows**: asset status changes only through workflows (request approval reserves a unit, allocation lends it, return completion releases it or sends it to maintenance; maintenance open/complete; retire). Concurrency-sensitive transitions run in a transaction with a pessimistic lock on the asset row.
- **Errors**: one envelope everywhere, `{ data, meta? }` on success and `{ error: { code, message, details? } }` on failure, with 400/401/403/404/409 mapped centrally.
- **Frontend**: `AuthContext` + `ProtectedRoute roles={[…]}`, role-specific dashboards at `/admin`, `/staff`, `/employee`, and every data view renders loading, error-with-retry and empty states. The UI only hides controls; the API is the authority.


## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` at startup | copy `.env.example` to `.env` and set `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET` (≥ 16 chars) |
| `database "assetflow" does not exist` | run `createdb assetflow` (and `createdb assetflow_test`) |
| `password authentication failed` / `role does not exist` | put the correct user and password in `DATABASE_URL`, e.g. `postgres://postgres:postgres@localhost:5432/assetflow` |
| UI shows "Cannot reach the server" | start the backend (`npm run dev` in `backend/`) and check `VITE_API_URL` |
| Login works but every page says 401 | the token expired (`JWT_EXPIRES_IN`) or `JWT_SECRET` changed; log in again |
| Test run fails with `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` | two Jest processes hit the same test database at once; run only `npm test` |
| Seed says "already present; skipping" | expected on re-runs; use `npm run seed -- --reset` for a clean dataset |
