---
id: installation
title: Installation
sidebar_label: Installation
sidebar_position: 3
---

# Installation

This page covers everything needed to install and configure Medusa v2 on a local machine or server.

## Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| Node.js | 18 LTS | 20 LTS |
| npm | 9 | latest |
| yarn | 1.22 | — |
| pnpm | 8 | latest |
| PostgreSQL | 15 | 15 or 16 |
| Git | 2.x | latest |

Only one package manager is needed. PostgreSQL is required for a full install; SQLite is used automatically when no `DATABASE_URL` is set (development only).

---

## Install via CLI (recommended)

The fastest way to create a new Medusa project:

```bash
npx create-medusa-app@latest
```

The CLI wizard will prompt for:

- **Project name** — sets the directory name
- **Package manager** — npm, yarn, or pnpm
- **Database** — PostgreSQL connection string, or skip for SQLite

After the wizard completes, a directory is created with a working Medusa backend and a seeded admin user.

### CLI flags

```bash
# TODO: verify exact flag names against create-medusa-app@latest --help
npx create-medusa-app@latest my-store --db-url "postgres://user:pass@localhost:5432/medusa"
```

Run `npx create-medusa-app@latest --help` to see all available flags for your installed version.

---

## Manual install

Use the manual path when integrating Medusa into an existing Node.js project or monorepo.

### 1. Create the project directory

```bash
mkdir my-medusa-store && cd my-medusa-store
npm init -y
```

### 2. Install core packages

```bash
npm install @medusajs/medusa @medusajs/framework
```

### 3. Install the Medusa CLI

```bash
npm install --save-dev @medusajs/medusa-cli
```

### 4. Initialize configuration

```bash
npx medusa init
```

This creates `medusa-config.ts` (or `.js`) in the project root.

### 5. Run database migrations

```bash
npx medusa db:migrate
```

### 6. Seed the database (optional but recommended for development)

```bash
npx medusa db:seed --seed-file ./src/scripts/seed.ts
# TODO: verify default seed file path
```

### 7. Start the server

```bash
npx medusa develop
```

The server starts on `http://localhost:9000` by default.

---

## Environment variables

Create a `.env` file in the project root. The following variables are recognized:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | SQLite (dev only) | PostgreSQL connection string |
| `DATABASE_TYPE` | No | `postgres` | `postgres` or `sqlite` |
| `MEDUSA_ADMIN_ONBOARDING_TYPE` | No | `default` | TODO: verify valid values |
| `JWT_SECRET` | Yes (production) | — | Secret for signing JWT tokens |
| `COOKIE_SECRET` | Yes (production) | — | Secret for signing cookies |
| `PORT` | No | `9000` | Port the HTTP server listens on |
| `STORE_CORS` | No | `http://localhost:8000` | Allowed origins for the storefront |
| `ADMIN_CORS` | No | `http://localhost:7001` | Allowed origins for the admin UI |
| `AUTH_CORS` | No | — | Allowed origins for auth endpoints; defaults to union of STORE_CORS and ADMIN_CORS TODO: verify |
| `REDIS_URL` | No | — | Redis connection string; required for event bus and job queue in production |

Example `.env`:

```bash
DATABASE_URL=postgres://medusa:medusa@localhost:5432/medusa
JWT_SECRET=supersecretjwt
COOKIE_SECRET=supersecretcookie
PORT=9000
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:7001
```

---

## Verify the install

After starting the server, confirm it is running:

```bash
curl http://localhost:9000/health
```

Expected response:

```json
{ "status": "ok" }
```

Then confirm the store API is reachable:

```bash
curl http://localhost:9000/store/products
```

A successful response returns a JSON object with a `products` array (empty if no products have been seeded yet).

---

## Common install errors

### `Cannot find module '@medusajs/medusa'`

**Cause:** Dependencies were not installed, or the install was incomplete.

**Fix:**

```bash
rm -rf node_modules package-lock.json
npm install
```

---

### `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Cause:** PostgreSQL is not running, or `DATABASE_URL` points to the wrong host/port.

**Fix:** Start PostgreSQL and verify the connection string:

```bash
psql "postgres://user:pass@localhost:5432/medusa" -c "SELECT 1;"
```

---

### `Role "medusa" does not exist` or `database "medusa" does not exist`

**Cause:** The database or role named in `DATABASE_URL` does not exist in PostgreSQL.

**Fix:**

```bash
psql -U postgres -c "CREATE USER medusa WITH PASSWORD 'medusa';"
psql -U postgres -c "CREATE DATABASE medusa OWNER medusa;"
```

---

### Migrations fail with `relation already exists`

**Cause:** Migrations were run previously against a partially-initialized database.

**Fix:** Drop and recreate the database, then re-run migrations:

```bash
psql -U postgres -c "DROP DATABASE medusa;"
psql -U postgres -c "CREATE DATABASE medusa OWNER medusa;"
npx medusa db:migrate
```

---

### `JWT_SECRET` or `COOKIE_SECRET` not set warning

**Cause:** The server is running without secrets configured, which is unsafe in production.

**Fix:** Set both variables in your `.env` file before deploying. Use a cryptographically random value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Next steps

- [Quickstart](./quickstart.md) — make your first API call
