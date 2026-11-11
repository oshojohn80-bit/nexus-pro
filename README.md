# NEXUS PRO ENTERPRISE — Android RMM starter

A self-hostable starter for an authorized Android Enterprise device-management portal.
It separates company-owned fully managed devices from employee-owned Android Work Profiles.

## Included
- React + Vite administrator dashboard
- Express API with JWT login, bcrypt password hashing, and role checks
- PostgreSQL schema for users, devices, security events, and audit logs
- Device inventory, status, compliance, and audit-log endpoints
- Android Management API integration boundary (credentials and enterprise provisioning required)
- Docker Compose for local PostgreSQL development

## Important boundaries
This project is a management-console starter, not a hidden-monitoring agent. It does not collect passwords,
private messages, personal photos, personal browsing, or personal-profile data. BYOD management is limited
to the managed Work Profile. Location and remote actions must be enabled only where authorized, disclosed,
and supported by Android Enterprise policy and enrollment mode.

The Android Management API requires a Google Cloud project, API enablement, an approved/eligible use case,
an enterprise binding, and service-account credentials. Do not assume production access or quotas are
automatically granted. See:
https://developers.google.com/android/management/introduction

## Requirements
- Node.js 20+
- PostgreSQL 15+ (or Docker)
- Google Cloud project only when enabling real Android Enterprise integration

## Quick start

### 1. Configure environment
Copy `.env.example` to `.env` in `server/` and set:
- `DATABASE_URL`
- `JWT_SECRET` (use a long random secret)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` (strong unique password)

### 2. Start PostgreSQL
From the project root:
```bash
docker compose up -d db
```

### 3. Initialize database and admin account
```bash
cd server
npm install
npm run db:init
npm run admin:create
npm run dev
```
API runs at `http://localhost:4000`.

### 4. Start dashboard
In another terminal:
```bash
cd client
npm install
npm run dev
```
Dashboard runs at `http://localhost:5173`.

The Vite development server proxies `/api` to the backend.

## API overview
- `POST /api/auth/login`
- `GET /api/dashboard/summary`
- `GET /api/devices`
- `POST /api/devices` (admin; register inventory record)
- `GET /api/devices/:id`
- `GET /api/audit-logs`
- `GET /api/health`

Device records created through this starter are inventory records. They are not proof that a phone is enrolled or remotely manageable.
Only report live device state after connecting a real, authorized Android Enterprise data source.

## Render deployment outline
1. Create a managed PostgreSQL database in Render.
2. Deploy `server/` as a Node Web Service. Set Root Directory to `server`, Build Command to `npm install`, and Start Command to `npm start`.
3. Set `DATABASE_URL` to the Render PostgreSQL Internal Database URL, `JWT_SECRET` to a random secret of at least 32 characters, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 14 characters), and `CLIENT_ORIGIN` to the exact deployed frontend origin.
4. After the database and API service exist, open the API service Shell and run `npm run db:init` once, then `npm run admin:create` once. Do not put real secrets in GitHub.
5. Deploy `client/` as a Static Site. Set Root Directory to `client`, Build Command to `npm install && npm run build`, Publish Directory to `dist`, and `VITE_API_BASE` to the backend service URL (for example `https://nexus-pro-api.onrender.com`). Configure a rewrite from `/*` to `/index.html` with action `Rewrite`.
6. Use HTTPS, rotate secrets, configure backups, and restrict admin access before enrolling devices.

For production, replace the starter's bootstrap admin flow with a controlled invitation/recovery process,
add rate limiting, CSRF protections appropriate to your auth design, security monitoring, backups, and
review Google API policies before enabling Android Management API calls.

## Current integration status
The Android Enterprise adapter is deliberately a stub. The portal can store inventory and audit admin
actions, but it does not yet enroll devices, fetch telemetry, locate phones, or issue remote commands.
Those capabilities require valid Google Android Management API configuration and policy-aware workflows.
