# Alajo Yankee — Modern Community Savings Platform v2.0

> Building community wealth through trusted African savings traditions — modernized for the diaspora.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Color Palette & Branding](#color-palette--branding)
5. [Prerequisites](#prerequisites)
6. [Installation & Setup](#installation--setup)
7. [Environment Variables](#environment-variables)
8. [Database Setup](#database-setup)
9. [Running the Application](#running-the-application)
10. [API Reference](#api-reference)
11. [Security Features](#security-features)
12. [Frontend Pages](#frontend-pages)
13. [Testing with Postman](#testing-with-postman)
14. [Deployment to Azure](#deployment-to-azure)
15. [Performance & Accessibility](#performance--accessibility)

---

## Project Overview

Alajo Yankee is a full-stack community savings platform built to modernize the
West African *Ajo* / *Susu* / *Tontine* savings tradition for diaspora communities
in the United States. This v2.0 rebuild delivers:

- **7 responsive HTML pages** with a modern SaaS design
- **Node.js/Express REST API** with parameterized SQL Server queries
- **JWT authentication** with bcrypt password hashing
- **Contact form** that stores submissions in SQL Server
- **Protected dashboard** with role-based access
- **Production-ready security**: Helmet, CORS, rate limiting, input validation

---

## Technology Stack

| Layer          | Technology                        |
|----------------|-----------------------------------|
| Frontend       | HTML5, CSS3, Vanilla JavaScript   |
| Backend        | Node.js 18+, Express 4            |
| Database       | Microsoft SQL Server (Azure)      |
| Authentication | JWT (jsonwebtoken), bcrypt        |
| Validation     | express-validator                 |
| Security       | helmet, cors, express-rate-limit  |
| Environment    | dotenv                            |
| Logging        | morgan                            |
| Dev tools      | nodemon                           |

---

## Project Structure

```
alajoyankee/
├── client/                     # Frontend (static files)
│   ├── index.html              # Home page
│   ├── about.html              # About page
│   ├── services.html           # Services page
│   ├── contact.html            # Contact page
│   ├── signin.html             # Sign In
│   ├── signup.html             # Sign Up
│   ├── dashboard.html          # Protected dashboard
│   ├── css/
│   │   ├── base.css            # Variables, reset, typography
│   │   ├── layout.css          # Container, grid, sections
│   │   ├── components.css      # Nav, buttons, cards, footer
│   │   ├── forms.css           # Inputs, auth cards
│   │   └── responsive.css      # Breakpoints (1200/768/480px)
│   └── js/
│       ├── main.js             # Nav, toast, validation helpers, API fetch
│       ├── auth.js             # Sign up / Sign in logic
│       ├── contact.js          # Contact form submission
│       └── dashboard.js        # Dashboard auth guard & panels
│
├── server/
│   ├── app.js                  # Express entry point
│   ├── config/
│   │   ├── db.js               # SQL Server connection pool
│   │   └── initDb.js           # Schema creation script
│   ├── middleware/
│   │   ├── auth.js             # JWT middleware
│   │   └── errorHandler.js     # Global error handler
│   ├── controllers/
│   │   ├── authController.js   # register, login
│   │   ├── userController.js   # getProfile
│   │   └── contactController.js# submitContact, getMessages
│   └── routes/
│       ├── auth.js             # POST /api/auth/register|login
│       ├── users.js            # GET  /api/users/profile
│       └── contact.js          # POST /api/contact · GET /api/messages
│
├── .env.example                # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Color Palette & Branding

Colors extracted from the original site and modernized:

| Variable                  | Hex       | Usage                              |
|---------------------------|-----------|------------------------------------|
| `--color-primary`         | `#1a6b3c` | Primary green — CTAs, links, icons |
| `--color-primary-dark`    | `#134f2d` | Hover states, dark sections        |
| `--color-primary-light`   | `#249152` | Accents, success states            |
| `--color-secondary`       | `#d4a017` | Gold — highlights, badges          |
| `--color-secondary-dark`  | `#b8880e` | Gold hover                         |
| `--color-accent`          | `#8b3a1e` | Earth tone accent                  |
| `--color-bg`              | `#fafaf8` | Page background                    |
| `--color-bg-dark`         | `#0f3d22` | Footer, hero background            |
| `--color-text`            | `#1c1c1c` | Primary text                       |
| `--color-text-muted`      | `#6b7280` | Secondary text, labels             |

---

## Prerequisites

- **Node.js** 18.0 or later
- **npm** 9.0 or later
- **Microsoft SQL Server** (Azure SQL, SQL Server 2019+, or LocalDB for dev)
- A SQL Server login with CREATE TABLE, SELECT, INSERT, UPDATE permissions

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/alajoyankee.git
cd alajoyankee
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Then edit .env with your values — see Environment Variables section
```

### 4. Initialize the database

```bash
npm run db:init
```

This creates the `Users`, `ContactMessages`, and `RefreshTokens` tables with
indexes if they don't already exist.

### 5. Start the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server starts at **http://localhost:3000** (or your configured PORT).

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```dotenv
NODE_ENV=development
PORT=3000

# JWT — use a long random string (64+ chars)
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# bcrypt rounds (10–14 recommended; higher = slower = more secure)
BCRYPT_ROUNDS=12

# SQL Server
DB_SERVER=your-server.database.windows.net
DB_PORT=1433
DB_NAME=AlajoYankeeDB
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_ENCRYPT=true
DB_TRUST_CERT=false

# CORS — comma-separated allowed origins
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

> **Security:** Never commit `.env` to version control. The `.gitignore` already
> excludes it.

---

## Database Setup

### Tables Created by `npm run db:init`

#### Users

```sql
CREATE TABLE Users (
  UserID       INT            IDENTITY(1,1) PRIMARY KEY,
  FirstName    NVARCHAR(100)  NOT NULL,
  LastName     NVARCHAR(100)  NOT NULL,
  Email        NVARCHAR(255)  NOT NULL UNIQUE,
  PasswordHash NVARCHAR(255)  NOT NULL,
  Role         NVARCHAR(50)   NOT NULL DEFAULT 'member',
  IsActive     BIT            NOT NULL DEFAULT 1,
  CreatedAt    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  UpdatedAt    DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);
```

#### ContactMessages

```sql
CREATE TABLE ContactMessages (
  MessageID   INT            IDENTITY(1,1) PRIMARY KEY,
  Name        NVARCHAR(200)  NOT NULL,
  Email       NVARCHAR(255)  NOT NULL,
  Phone       NVARCHAR(50)   NULL,
  Message     NVARCHAR(MAX)  NOT NULL,
  IsRead      BIT            NOT NULL DEFAULT 0,
  SubmittedAt DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);
```

---

## Running the Application

```bash
# Development with hot-reload
npm run dev

# Production
npm start

# Initialize DB schema (run once)
npm run db:init
```

Once running, visit:

| URL                               | Description        |
|-----------------------------------|--------------------|
| http://localhost:3000/            | Home page          |
| http://localhost:3000/about.html  | About page         |
| http://localhost:3000/services.html | Services         |
| http://localhost:3000/contact.html  | Contact form     |
| http://localhost:3000/signup.html   | Create account   |
| http://localhost:3000/signin.html   | Sign in          |
| http://localhost:3000/dashboard.html | Dashboard       |
| http://localhost:3000/health       | Health check JSON  |

---

## API Reference

### Base URL: `/api`

All request/response bodies use **JSON**.  
Protected routes require header: `Authorization: Bearer <token>`

---

### Authentication

#### `POST /api/auth/register`

Create a new user account.

**Request body:**
```json
{
  "firstName": "Kwame",
  "lastName":  "Asante",
  "email":     "kwame@example.com",
  "password":  "Secure@1234"
}
```

**Password requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Success `201`:**
```json
{
  "message": "Account created successfully.",
  "token":   "<jwt>",
  "user": {
    "userID":    1,
    "firstName": "Kwame",
    "lastName":  "Asante",
    "email":     "kwame@example.com",
    "role":      "member",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error `409`** — email already registered  
**Error `422`** — validation failed

---

#### `POST /api/auth/login`

Sign in and receive a JWT.

**Request body:**
```json
{
  "email":    "kwame@example.com",
  "password": "Secure@1234"
}
```

**Success `200`:**
```json
{
  "message": "Signed in successfully.",
  "token":   "<jwt>",
  "user": { "userID": 1, "firstName": "Kwame", ... }
}
```

**Error `401`** — invalid credentials  
**Error `403`** — account deactivated

---

### Users

#### `GET /api/users/profile` 🔒

Get the authenticated user's profile.

**Headers:** `Authorization: Bearer <token>`

**Success `200`:**
```json
{
  "user": {
    "userID":    1,
    "firstName": "Kwame",
    "lastName":  "Asante",
    "email":     "kwame@example.com",
    "role":      "member",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Contact

#### `POST /api/contact`

Submit a contact form message.

**Request body:**
```json
{
  "name":    "Amara Mensah",
  "email":   "amara@example.com",
  "phone":   "+1 713 555 0190",
  "message": "I'd like to learn more about starting a savings circle."
}
```

**Success `201`:**
```json
{
  "message":   "Your message has been received. We'll be in touch shortly.",
  "messageID": 42,
  "submitted": "2024-01-01T12:00:00.000Z"
}
```

---

#### `GET /api/messages` 🔒

Retrieve all contact messages (paginated).

**Headers:** `Authorization: Bearer <token>`

**Query params:**
- `page` — page number (default: 1)
- `size` — results per page (default: 50, max: 100)

**Success `200`:**
```json
{
  "messages": [
    {
      "MessageID":   42,
      "Name":        "Amara Mensah",
      "Email":       "amara@example.com",
      "Phone":       "+1 713 555 0190",
      "Message":     "I'd like to learn more...",
      "IsRead":      false,
      "SubmittedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1, "pageSize": 50, "total": 1, "pages": 1
  }
}
```

---

### Health

#### `GET /health`

No auth required. Returns server status.

```json
{
  "status":    "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "env":       "production",
  "version":   "2.0.0"
}
```

---

## Security Features

| Feature                   | Implementation                                           |
|---------------------------|----------------------------------------------------------|
| Password hashing          | bcrypt with 12 rounds                                    |
| JWT authentication        | jsonwebtoken, verified on every protected route          |
| HTTP security headers     | helmet (CSP, HSTS, X-Frame-Options, etc.)                |
| CORS                      | Allowlist of origins from environment variable           |
| Rate limiting             | 100 req/15min global; 10 req/15min on auth endpoints     |
| SQL injection prevention  | Parameterized queries via `mssql` named inputs           |
| Input validation          | express-validator on all API inputs                      |
| Environment secrets       | dotenv — secrets never hardcoded                         |
| Request size limits       | express.json({ limit: '10kb' })                          |

---

## Testing with Postman

### Import collection

1. Open Postman
2. Create a new collection: **Alajo Yankee API**
3. Set a collection variable `baseUrl = http://localhost:3000/api`
4. Set a collection variable `token` (populated after login)

### Example flow

```
1. POST {{baseUrl}}/auth/register  → copy token to `token` var
2. POST {{baseUrl}}/auth/login     → verify login works
3. GET  {{baseUrl}}/users/profile  → Header: Authorization: Bearer {{token}}
4. POST {{baseUrl}}/contact        → submit a contact form
5. GET  {{baseUrl}}/messages       → Header: Authorization: Bearer {{token}}
6. GET  http://localhost:3000/health
```

---

## Deployment to Azure

### Azure App Service (recommended)

```bash
# 1. Create App Service Plan
az appservice plan create \
  --name alajoyankee-plan \
  --resource-group alajo-rg \
  --sku B1 \
  --is-linux

# 2. Create Web App
az webapp create \
  --resource-group alajo-rg \
  --plan alajoyankee-plan \
  --name alajoyankee \
  --runtime "NODE:18-lts"

# 3. Set environment variables
az webapp config appsettings set \
  --resource-group alajo-rg \
  --name alajoyankee \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    JWT_SECRET="<your_secret>" \
    DB_SERVER="<your_server>.database.windows.net" \
    DB_NAME="AlajoYankeeDB" \
    DB_USER="<user>" \
    DB_PASSWORD="<password>"

# 4. Deploy
az webapp up --name alajoyankee --resource-group alajo-rg
```

### Azure SQL Database

1. Create Azure SQL Server and database via portal or CLI
2. Add your App Service's outbound IPs to the SQL Server firewall
3. Run `npm run db:init` locally pointing at Azure DB to create schema

---

## Performance & Accessibility

- **Images:** lazy-loaded via `IntersectionObserver`
- **Fonts:** Google Fonts with `display=swap` for FOUT prevention
- **Animations:** respects `prefers-reduced-motion`
- **Semantic HTML:** proper `<main>`, `<nav>`, `<section>`, `<footer>`, `<aside>`
- **ARIA:** nav roles, aria-label, aria-expanded, aria-live for toasts
- **Color contrast:** all text meets WCAG AA (4.5:1 minimum)
- **Keyboard navigation:** all interactive elements focusable
- **Responsive breakpoints:** 1200px, 768px, 480px

---

## License

Copyright © 2024 Alajo Yankee. All rights reserved.
