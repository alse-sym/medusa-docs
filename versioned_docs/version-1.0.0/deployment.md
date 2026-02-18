---
id: deployment
title: Deployment
sidebar_label: Deployment
sidebar_position: 15
---

# Deployment

This guide covers deploying a Medusa v2 backend to production. Medusa is a standard Node.js application with two external runtime dependencies: PostgreSQL and Redis. Any platform that can run Node.js and connect to those services will work.

---

## 1. Deployment Architecture

A production Medusa deployment consists of three components:

- **Medusa server** - A Node.js HTTP server (defaults to port `9000`). Runs the REST API, processes workflows, and dispatches events.
- **PostgreSQL** - Primary data store. All modules persist their data here. Minimum supported version: PostgreSQL 13.
- **Redis** - Used for the event bus (Redis Streams), job queues, and session caching. Minimum supported version: Redis 6.

```
                  +-----------+
  Storefront  --> |           |
                  |  Medusa   |  <-->  PostgreSQL
  Admin UI    --> |  Server   |  <-->  Redis
                  |           |
  Webhooks    --> +-----------+
```

You do not need a separate worker process in a basic deployment — the server handles background jobs inline. For high-throughput workloads, `TODO: verify` whether Medusa v2 supports a separate worker mode in your target release.

---

## 2. Environment Variables

Set the following environment variables in your production environment. Never commit secrets to source control.

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/medusa_db` |
| `REDIS_URL` | Yes | Redis connection string | `redis://default:pass@host:6379` |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens (min 32 chars) | `a-long-random-string` |
| `COOKIE_SECRET` | Yes | Secret for signing session cookies (min 32 chars) | `another-long-random-string` |
| `NODE_ENV` | Yes | Must be `production` to enable production behavior | `production` |
| `PORT` | No | HTTP port (default: `9000`) | `9000` |
| `ADMIN_CORS` | Yes | Comma-separated allowed origins for Admin API | `https://admin.example.com` |
| `STORE_CORS` | Yes | Comma-separated allowed origins for Store API | `https://store.example.com` |
| `AUTH_CORS` | Yes | Comma-separated allowed origins for Auth routes | `https://store.example.com,https://admin.example.com` |
| `STRIPE_API_KEY` | Conditional | Required if using Stripe payment provider | `sk_live_...` |
| `SENDGRID_API_KEY` | Conditional | Required if using SendGrid notification provider | `SG....` |

Generate strong random values for `JWT_SECRET` and `COOKIE_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Deploy to Railway

Railway is the most straightforward deployment target for Medusa. It provides managed PostgreSQL and Redis add-ons alongside your application service.

### Prerequisites

- [Railway CLI](https://docs.railway.app/develop/cli) installed (`npm install -g @railway/cli`)
- A Railway account and project created

### Steps

1. **Log in and link your project:**

   ```bash
   railway login
   railway link
   ```

2. **Provision databases:**
   In the Railway dashboard, add a **PostgreSQL** plugin and a **Redis** plugin to your project. Railway injects `DATABASE_URL` and `REDIS_URL` automatically. `TODO: verify` that Railway uses these exact variable names in current versions.

3. **Set environment variables:**
   In Railway > Variables, add:
   - `JWT_SECRET`
   - `COOKIE_SECRET`
   - `NODE_ENV=production`
   - `ADMIN_CORS`, `STORE_CORS`, `AUTH_CORS`
   - Any provider-specific secrets

4. **Add a start command:**
   In your `package.json`, ensure a production start script exists:

   ```json
   {
     "scripts": {
       "start": "medusa start"
     }
   }
   ```

5. **Run database migrations as part of deploy:**
   Set the Railway deploy command (Settings > Deploy > Start Command) to run migrations before starting:

   ```bash
   medusa db:migrate && medusa start
   ```

   `TODO: verify` that Railway's deploy command field supports chained shell commands in current versions.

6. **Deploy:**

   ```bash
   railway up
   ```

   Railway will build from your `package.json` using the Node.js nixpack, install dependencies, and start the server.

7. **Generate the domain:**
   In Railway > Settings > Networking, generate a public domain. Use this URL to test your Admin API at `https://<your-domain>/admin` and health endpoint at `https://<your-domain>/health`.

---

## 4. Deploy to Docker

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.medusa ./.medusa
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/medusa-config.js ./
EXPOSE 9000
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
```

> Note: Adjust `npm run build` if your project has a custom build step. The `.medusa` directory is the output of the Medusa build and must be present at runtime.

### docker-compose.yml

```yaml
version: "3.9"

services:
  medusa:
    build: .
    ports:
      - "9000:9000"
    environment:
      DATABASE_URL: postgresql://medusa:medusa@postgres:5432/medusa
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      COOKIE_SECRET: ${COOKIE_SECRET}
      NODE_ENV: production
      ADMIN_CORS: ${ADMIN_CORS}
      STORE_CORS: ${STORE_CORS}
      AUTH_CORS: ${AUTH_CORS}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: medusa
      POSTGRES_PASSWORD: medusa
      POSTGRES_DB: medusa
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U medusa"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

Run with:

```bash
docker compose up --build
```

---

## 5. Deploy to Heroku

`TODO: verify current Heroku Node.js buildpack` and ensure compatibility with Medusa v2 build output.

General steps:

1. Create a Heroku app: `heroku create my-medusa-app`
2. Add PostgreSQL: `heroku addons:create heroku-postgresql:mini`
3. Add Redis: `heroku addons:create heroku-redis:mini`
4. Set config vars: `heroku config:set JWT_SECRET=... COOKIE_SECRET=... NODE_ENV=production`
5. Set the release command in `Procfile` to run migrations:

   ```
   release: npx medusa db:migrate
   web: npx medusa start
   ```

6. Deploy: `git push heroku main`

---

## 6. Deploy to Bare Metal / VPS

### Prerequisites

- Ubuntu 22.04 LTS (or equivalent)
- Node.js 20 LTS installed
- PostgreSQL 13+ and Redis 6+ running and accessible
- A non-root user with sudo access

### Steps

1. **Clone and install:**

   ```bash
   git clone https://github.com/your-org/your-medusa-project.git /srv/medusa
   cd /srv/medusa
   npm ci --omit=dev
   npm run build
   ```

2. **Configure environment:**
   Create `/srv/medusa/.env` with all required variables. Restrict permissions:

   ```bash
   chmod 600 /srv/medusa/.env
   ```

3. **Run migrations:**

   ```bash
   cd /srv/medusa && npx medusa db:migrate
   ```

4. **Manage the process with PM2:**

   ```bash
   npm install -g pm2
   pm2 start "npx medusa start" --name medusa --cwd /srv/medusa
   pm2 save
   pm2 startup  # follow the printed command to enable auto-restart on boot
   ```

5. **nginx reverse proxy:**

   ```nginx
   server {
       listen 80;
       server_name api.example.com;

       location / {
           proxy_pass http://127.0.0.1:9000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable TLS using Certbot:

   ```bash
   sudo certbot --nginx -d api.example.com
   ```

---

## 7. Database Migrations

Always run migrations before starting the server after a Medusa upgrade or after adding custom modules that introduce new data models.

```bash
npx medusa db:migrate
```

This command applies all pending migrations from built-in and registered custom modules. It is idempotent and safe to run on every deploy. In CI/CD pipelines, run this as a pre-deploy step or as the release command (see Railway and Heroku sections above).

To generate a migration for a custom module after modifying its data model:

```bash
npx medusa db:generate <module-name>
```

---

## 8. Health Check Endpoint

Medusa exposes a health check endpoint at:

```
GET /health
```

A healthy server responds with HTTP `200` and the body:

```json
{ "status": "ok" }
```

Configure your load balancer, container orchestrator, or uptime monitor to poll this endpoint. Use it as the readiness probe in Kubernetes or the health check URL in Railway and Heroku.

---

## 9. Common Deployment Issues

### Build fails with "Cannot find module"

**Symptom:** `npm run build` or server startup exits with a module resolution error.

**Cause:** A dependency is listed in `devDependencies` but required at runtime, or `node_modules` is missing in the production image.

**Fix:** Move the dependency to `dependencies`. In Docker builds, ensure `npm ci` (not `npm ci --omit=dev`) runs before the build step, then prune dev dependencies in a separate stage.

---

### Server exits immediately on startup

**Symptom:** Process starts and exits with exit code 1, often with "Error: connect ECONNREFUSED".

**Cause:** `DATABASE_URL` or `REDIS_URL` is missing, malformed, or the service is not yet reachable.

**Fix:** Confirm environment variables are set and test connectivity from the server host:

```bash
psql $DATABASE_URL -c "SELECT 1"
redis-cli -u $REDIS_URL ping
```

---

### CORS errors in the browser after deploy

**Symptom:** Browser requests to the API fail with "blocked by CORS policy".

**Cause:** `ADMIN_CORS`, `STORE_CORS`, or `AUTH_CORS` does not include the deployed frontend origin.

**Fix:** Set the variable to the exact origin (including scheme and port if non-standard). For multiple origins, use a comma-separated list. Do not use wildcard `*` in production.

---

### Health check fails, causing deploy rollback

**Symptom:** Platform reports the health check failing and rolls back the deployment.

**Cause:** Migrations have not completed before the health check fires, or the server is slow to bind to the port.

**Fix:** Ensure `medusa db:migrate` completes before `medusa start`. Increase the health check grace period or start timeout in your platform settings.

---

### Out-of-memory crash under load

**Symptom:** Node.js process is killed with signal 137 (OOMKilled) or "JavaScript heap out of memory".

**Cause:** Default Node.js heap is too small for the workload, or there is a memory leak.

**Fix:** Set the `--max-old-space-size` flag:

```bash
NODE_OPTIONS="--max-old-space-size=2048" npx medusa start
```

Start with a value appropriate for your available RAM (e.g., 75% of available memory). Monitor heap usage over time to detect leaks.
