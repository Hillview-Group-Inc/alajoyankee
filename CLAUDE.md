# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alajo Yankee is a community savings platform that modernizes West African Ajo/Susu/Tontine savings traditions for diaspora communities in the US. It is a full-stack web application with a vanilla JS frontend and a Node.js/Express backend backed by Microsoft SQL Server.

## Commands

```bash
npm install           # Install dependencies
npm run dev           # Start development server with nodemon (auto-reload)
npm start             # Start production server
npm run db:init       # One-time: create database schema (idempotent, safe to re-run)
```

The server runs on `http://localhost:3000`. There is no build step — the frontend is served as static files from `/client`. There are no test or lint scripts configured.

## Environment Setup

Copy `.env.example` to `.env` and fill in values before running. Required variables:

- `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` — SQL Server connection
- `DB_ENCRYPT=true` for Azure SQL; `DB_TRUST_CERT=true` for local self-signed certs
- `JWT_SECRET` — must be ≥64 chars
- `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`

## Architecture

### Request Flow

```
Browser → Express (app.js)
  ├── Security middleware: Helmet, CORS, rate-limit, body-size limit (10KB)
  ├── /api/* → routes/ → controllers/ → db.js (SQL Server via mssql)
  └── * → Static files from /client (SPA fallback to index.html)
```

### Backend (`server/`)

| File | Role |
|------|------|
| `app.js` | Express entry point — mounts all middleware and routes |
| `config/db.js` | Connection pool + `query(sql, params)` helper; all queries use named parameters |
| `config/initDb.js` | Schema creation script (run via `npm run db:init`) |
| `middleware/auth.js` | JWT verification + role-based access (`requireAuth`, `requireAdmin`) |
| `middleware/errorHandler.js` | Global error handler; suppresses stack traces in production |
| `controllers/` | Business logic — one file per resource (`auth`, `user`, `contact`) |
| `routes/` | Thin route definitions with express-validator rules |

**No ORM** — raw SQL with named parameterized queries through `mssql`. Add tables in `initDb.js` and run `npm run db:init`.

### Database (3 tables)

- **Users** — accounts; `Role` is `'member'` or `'admin'`; `IsActive` flag for soft-disable
- **ContactMessages** — contact form submissions; `IsRead` tracks admin review
- **RefreshTokens** — schema exists, not yet used by application logic

### Frontend (`client/`)

7 plain HTML pages (`index`, `about`, `services`, `contact`, `signin`, `signup`, `dashboard`). No framework, no bundler.

- `css/` — split into `base.css` (variables/reset), `layout.css`, `components.css`, `forms.css`, `responsive.css` (breakpoints: 1200px / 768px / 480px)
- `js/main.js` — shared utilities: toast notifications, navbar injection, form validation helpers
- `js/auth.js` — signup/signin logic with password strength meter; stores JWT in `localStorage`
- `js/dashboard.js` — auth guard redirects unauthenticated users to signin
- `js/contact.js` — contact form submission

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Sign in, returns JWT |
| GET | `/api/users/profile` | JWT | Current user profile |
| POST | `/api/contact` | — | Submit contact message |
| GET | `/api/messages` | JWT | Paginated contact messages |
| GET | `/health` | — | Server health check |

### Extending the API

1. Add route file: `server/routes/newResource.js`
2. Add controller: `server/controllers/newController.js`
3. Mount in `server/app.js`: `app.use('/api/newResource', newResourceRoutes)`
