---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
sidebar_position: 16
---

# Troubleshooting

This reference covers common issues encountered when installing, developing, and deploying Medusa. Each entry follows the format: **Symptom**, **Cause**, **Fix**, and where helpful, an **Example**.

---

## Installation Issues

### Node Version Mismatch

**Symptom:** `npm install` fails with errors like "Unsupported engine" or the server crashes on startup with syntax errors or missing features.

**Cause:** Medusa v2 requires Node.js 20 LTS. Running an older version (e.g., Node 16 or 18) can cause both install-time and runtime failures.

**Fix:** Switch to Node.js 20 using a version manager:

```bash
nvm install 20
nvm use 20
node -v  # should print v20.x.x
```

If you are not using nvm, download Node.js 20 LTS from [https://nodejs.org](https://nodejs.org).

---

### Missing Required Environment Variables

**Symptom:** Server exits immediately with an error like `Error: DATABASE_URL is not defined` or `Invalid configuration`.

**Cause:** One or more required environment variables (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`) are missing from the environment.

**Fix:** Copy `.env.template` (if present) to `.env` and fill in all values. Confirm the variables are loaded:

```bash
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
```

In production, set variables in your platform's environment/config UI rather than committing a `.env` file.

---

### Port Already in Use

**Symptom:** Server fails to start with `Error: listen EADDRINUSE :::9000`.

**Cause:** Another process is already bound to port 9000 (or whichever port Medusa is configured to use).

**Fix:** Identify and stop the conflicting process:

```bash
lsof -i :9000
kill -9 <PID>
```

Alternatively, start Medusa on a different port:

```bash
PORT=9001 npx medusa start
```

---

## API Errors

### 401 Unauthorized

**Symptom:** API requests return `401 Unauthorized` with a message such as "Unauthorized" or "Invalid token".

**Cause:** The request is missing a valid authentication token, the token has expired, or the token was issued with the wrong secret.

**Fix:**
- For Admin API requests, ensure you are passing the bearer token from the `/auth/token` endpoint in the `Authorization: Bearer <token>` header.
- If tokens expire immediately, verify that `JWT_SECRET` is set consistently and has not changed between token issuance and validation.
- Re-authenticate to obtain a fresh token.

**Example:**

```bash
# Obtain a token
TOKEN=$(curl -s -X POST http://localhost:9000/auth/user/emailpass \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' | jq -r '.token')

# Use the token
curl http://localhost:9000/admin/products \
  -H "Authorization: Bearer $TOKEN"
```

---

### 404 Not Found on Valid Routes

**Symptom:** A request to a documented route (e.g., `/admin/products`) returns `404 Not Found`.

**Cause:** Common causes include: the Medusa server is not running, you are using the wrong base URL, a required plugin or module that registers the route is not loaded, or the route path has a typo.

**Fix:**
- Confirm the server is running and accessible: `curl http://localhost:9000/health`
- Check that the module providing the route is registered in `medusa-config.js`.
- Review the exact path in the Medusa API reference — paths are case-sensitive.

---

### CORS Error in Browser

**Symptom:** Browser console shows "Access to fetch at 'http://...' has been blocked by CORS policy".

**Cause:** The frontend origin is not included in the corresponding CORS environment variable (`STORE_CORS`, `ADMIN_CORS`, or `AUTH_CORS`).

**Fix:** Add the exact origin of your frontend to the appropriate variable. Origins are comma-separated and must include the scheme:

```
STORE_CORS=https://mystore.com,http://localhost:8000
```

Restart the Medusa server after changing environment variables. Do not use trailing slashes in origins.

---

### 422 Unprocessable Entity

**Symptom:** A POST or PATCH request returns `422 Unprocessable Entity` with a validation error body.

**Cause:** The request payload is missing required fields or contains values that fail validation (e.g., a negative price, an invalid ISO currency code, a non-existent foreign key ID).

**Fix:** Read the `message` field in the response body — it identifies the failing field and constraint. Ensure your payload matches the schema documented in the API reference.

**Example response:**

```json
{
  "type": "invalid_data",
  "message": "title is a required field"
}
```

---

## Database Issues

### Migration Fails

**Symptom:** `npx medusa db:migrate` exits with an error such as "relation already exists" or "column does not exist".

**Cause:** The database is out of sync with the migration history, often from a manual schema change, a partially applied migration, or running migrations from a different branch.

**Fix:**
- For "relation already exists": the migration was partially applied. Inspect the `migrations` table in your database and remove the conflicting entry, then re-run.
- For schema drift in development, the fastest recovery is to drop and recreate the database, then run all migrations from scratch:

  ```bash
  dropdb medusa_dev && createdb medusa_dev
  npx medusa db:migrate
  ```

- Never manually alter tables that Medusa manages in production.

---

### Database Connection Refused

**Symptom:** Server or migration command fails with `Error: connect ECONNREFUSED 127.0.0.1:5432`.

**Cause:** PostgreSQL is not running, or the host/port in `DATABASE_URL` is incorrect.

**Fix:**

```bash
# Check if PostgreSQL is running (macOS with Homebrew)
brew services list | grep postgresql

# Start it if needed
brew services start postgresql@16

# Test the connection string directly
psql "$DATABASE_URL" -c "SELECT 1"
```

In Docker or production environments, confirm the service name in `DATABASE_URL` matches the service name in `docker-compose.yml` or the platform-injected hostname.

---

### Connection Pool Exhaustion

**Symptom:** Under load, requests start returning `Error: timeout exceeded when trying to connect` or `remaining connection slots are reserved`.

**Cause:** Medusa's connection pool is exhausted. This can happen with a high request rate, long-running transactions, or a pool size that exceeds PostgreSQL's `max_connections`.

**Fix:**
- Check PostgreSQL's `max_connections`: `SHOW max_connections;`
- Reduce Medusa's pool size in `medusa-config.js` (`TODO: verify` the exact pool configuration key for v2):

  ```js
  database: {
    url: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
  }
  ```

- Consider using PgBouncer as a connection pooler in front of PostgreSQL for high-concurrency workloads.

---

## Build / Deployment Issues

### Out of Memory During Build

**Symptom:** Build step (CI or Docker) fails with "JavaScript heap out of memory".

**Cause:** The build environment has insufficient memory for the Node.js heap during the TypeScript compilation or bundling step.

**Fix:** Increase the heap size for the build step:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

In GitHub Actions, use a larger runner or set `NODE_OPTIONS` as an environment variable in the workflow step.

---

### Missing Environment Variables in CI

**Symptom:** Build or test step in CI fails because a required variable (e.g., `DATABASE_URL`) is not defined.

**Cause:** Environment variables are set in the platform's secrets manager but not passed to the relevant workflow step.

**Fix:** Explicitly pass secrets to the step in your CI configuration. For GitHub Actions:

```yaml
- name: Run migrations
  run: npx medusa db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    REDIS_URL: ${{ secrets.REDIS_URL }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
    COOKIE_SECRET: ${{ secrets.COOKIE_SECRET }}
    NODE_ENV: production
```

---

### Health Check Fails After Deploy

**Symptom:** The deployment platform rolls back after the health check at `/health` returns non-200 or times out.

**Cause:** The server is not yet ready — migrations are still running, or the process is slow to bind to the port. Alternatively, the health check path or port is misconfigured in the platform.

**Fix:**
- Ensure migrations run to completion before `medusa start` is invoked (e.g., `medusa db:migrate && medusa start`).
- Increase the health check grace period / initial delay in your platform settings to allow time for startup.
- Confirm the health check URL is `GET /health` on the correct port.

---

## JS/TS SDK Issues

### Token Expiry / Session Loss

**Symptom:** After a period of inactivity, authenticated SDK calls fail with `401 Unauthorized` even though the user previously logged in.

**Cause:** The JWT token has expired. Medusa tokens have a finite lifetime controlled by `JWT_SECRET` signing and the token TTL.

**Fix:** Implement token refresh or re-authentication in your frontend. Catch `401` responses and redirect the user to log in again. `TODO: verify` if Medusa v2 provides a dedicated token refresh endpoint in your target version.

---

### Wrong Base URL

**Symptom:** SDK calls fail with a network error or 404, despite the server running correctly.

**Cause:** The `baseUrl` passed to the SDK client points to the wrong host or port (e.g., still pointing to `localhost` in a production build).

**Fix:** Ensure the SDK is initialized with the correct URL for each environment:

```ts
import Medusa from "@medusajs/js-sdk";

const sdk = new Medusa({
  baseUrl: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
});
```

---

### CORS Error from Browser SDK

**Symptom:** SDK calls from the browser fail with a CORS error even though the server is reachable via `curl`.

**Cause:** The browser origin is not included in `STORE_CORS` (for store SDK) or `ADMIN_CORS` (for admin SDK) on the server.

**Fix:** Add the frontend origin to the appropriate CORS variable on the server and restart. Ensure the origin matches exactly (scheme, hostname, port). See the CORS section under API Errors above for details.

---

## Workflow / Event Issues

### Workflow Stuck in "Running" State

**Symptom:** A workflow appears permanently stuck in the `running` state in the database and never completes or fails.

**Cause:** A step threw an unhandled exception that was not caught by the workflow engine, the server process crashed mid-execution, or a compensation step itself failed.

**Fix:**
- Check server logs from the time the workflow started for uncaught errors.
- If the server crashed mid-workflow, restart the server — the Workflow Engine will attempt to resume or compensate incomplete executions on startup (`TODO: verify` the exact recovery behavior for your Medusa version).
- Inspect the `workflow_execution` table for the stuck record and its `context` JSON for clues about which step failed.

---

### Events Not Being Received by Subscribers

**Symptom:** A subscriber decorated with `@OnEvent()` is never invoked, even though the triggering action completes successfully.

**Cause:** Common causes: the subscriber class is not in a directory that Medusa scans (e.g., not under `src/subscribers`), the event name string does not match the emitted event name exactly, or the Redis event bus is misconfigured and events are being dropped.

**Fix:**
- Confirm the subscriber file is in `src/subscribers/` and that the class is exported.
- Double-check the event name against the Medusa source or event reference — names are case-sensitive strings (e.g., `order.placed`).
- In development, verify you are not accidentally using the in-memory event bus if you expect cross-process delivery.
- In production, confirm `REDIS_URL` is set and Redis is reachable. Check Redis logs for connection errors.

---

Still stuck? Open an issue at https://github.com/medusajs/medusa/issues
