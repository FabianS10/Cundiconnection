# Cundiconnection 🔥

A university-only matching app locked to `@ucundinamarca.edu.co` with admin approval gate.

---

## Quick Start (Local)

### 1 · Prerequisites
- **Node.js 18+** (https://nodejs.org)
- Git (optional)

### 2 · Server setup

```bash
cd server
cp .env.example .env          # edit if you want custom credentials
npm install
npm run dev                   # runs on http://localhost:4000
```

First boot seeds the admin account automatically.

### 3 · Client setup (new terminal)

```bash
cd client
npm install
npm run dev                   # runs on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Default Admin Credentials

| Field    | Value                                    |
|----------|------------------------------------------|
| Email    | `fandressabogal@ucundinamarca.edu.co`   |
| Password | `CundiConnection#2026`                   |

Change these in `server/.env` before going live.

---

## What's New in This Version

### 🖼️ Photo Upload
- Users can upload a profile photo (JPEG / PNG / WebP / GIF, max 5 MB) from the **Profile** tab.
- Photos show in swipe cards and the matches grid instead of the gradient placeholder.
- Photos are stored in `server/uploads/` and served as static files.

### 👁️ Password Visibility Toggle
- Eye icon on every password field in Login and Register screens.

### 🔔 Admin Notifications
- Pending badge on the sidebar **Admin Gate** button updates in real time.
- Server polls every 30 seconds automatically while admin is logged in.
- `stat-alert` highlight on the topbar strip when approvals are waiting.

### 🛡️ Admin Control Center — 4 tabs

#### Approval Queue
- Expandable rows per pending user (bio, interests, semester visible).
- Per-user optional admin note before approving or rejecting.

#### User Management
- Full user table with live search (name / email / program).
- Filter by status: all · approved · pending · rejected.
- Actions per row: approve, reject, promote to admin, demote, delete (with confirm step).

#### Analytics
- **KPI strip**: Total Users, Approved, Pending, Rejected, Matches, Like Rate.
- **Donut chart**: visual user distribution.
- **Bar chart**: registrations over the last 14 days (server-filled gaps for missing days).
- **Like Rate** = likes / total swipes.
- **Top Campuses** and **Top Programs** ranked bar lists.

#### Audit Log
- Every admin action (approve, reject, delete, role_change) is logged with admin name,
  target user, note, and timestamp.

---

## API Endpoints Added

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/me/avatar` | Upload profile photo (multipart/form-data) |
| GET | `/api/admin/stats` | Full analytics payload |
| GET | `/api/admin/audit` | Audit log (last 50 entries, configurable) |
| DELETE | `/api/admin/users/:id` | Hard-delete a user |
| PATCH | `/api/admin/users/:id/role` | Promote / demote user role |

---

## Cloud Deployment Tips

**Backend (e.g. Railway, Render, Fly.io)**
1. Point root to `server/`
2. Set env vars: `JWT_SECRET`, `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD`, `CLIENT_ORIGIN`
3. Mount a persistent volume at `/app/server/data` (SQLite) and `/app/server/uploads` (photos).

**Frontend (e.g. Vercel, Netlify)**
1. Build root: `client/`, build command: `npm run build`, output: `dist/`
2. Add env var: `VITE_API_URL=https://your-backend.com/api`

---

## Folder Structure

```
cundiconnection/
├── client/
│   └── src/
│       ├── api.ts        ← all fetch calls
│       ├── types.ts      ← TypeScript types
│       ├── main.tsx      ← full React app
│       └── styles.css    ← design system
└── server/
    ├── .env.example
    └── src/
        ├── index.js      ← Express routes + multer
        ├── db.js         ← SQLite + schema + migrations
        └── auth.js       ← JWT + middleware
```
