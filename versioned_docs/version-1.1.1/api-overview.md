---
id: api-overview
title: API Overview
sidebar_label: API Overview
sidebar_position: 7
---

# API Overview

Medusa exposes two distinct REST API surfaces that serve different consumers: the **Admin API** for back-office operations and the **Store API** for customer-facing storefronts. Both APIs speak JSON over HTTP and follow RESTful conventions.

---

## Two API Surfaces

### Admin API

The Admin API (`/admin/`) is used to manage the store: products, orders, customers, inventory, pricing, promotions, and all other back-office resources. Every request to the Admin API requires authentication via a JWT bearer token (see [Authentication](./api-authentication.md)).

**Intended consumers:** Internal dashboards, automation scripts, headless CMS integrations, fulfillment integrations, and any server-side process that manages store data.

### Store API

The Store API (`/store/`) is the public-facing surface used by storefronts and mobile apps. It exposes catalog browsing, cart management, checkout, and customer account flows. Most endpoints are accessible without authentication, but some require a publishable API key header and others require a customer session token.

**Intended consumers:** Storefront applications (Next.js, Remix, React Native, etc.), third-party integrations that read catalog data.

---

## Base URLs

All URLs below assume a locally running Medusa server. Replace the host and port for staging or production environments.

| Environment | Admin Base URL | Store Base URL |
|-------------|----------------|----------------|
| Local development | `http://localhost:9000/admin` | `http://localhost:9000/store` |
| Docker / CI | `http://medusa:9000/admin` | `http://medusa:9000/store` |
| Staging (example) | `https://api-staging.example.com/admin` | `https://api-staging.example.com/store` |
| Production (example) | `https://api.example.com/admin` | `https://api.example.com/store` |

> **Note:** The trailing slash is not significant; `http://localhost:9000/admin/products` and `http://localhost:9000/admin/products/` resolve identically.

---

## Versioning Strategy

<!-- TODO: verify - Medusa v2 API versioning approach -->

Medusa v2 ships a single versioned API. Breaking changes are reserved for major version increments. Non-breaking additions (new fields, new optional parameters) may be introduced in minor releases without a version bump.

The API version currently in use can be confirmed by inspecting the `x-medusa-version` response header on any request.

```
x-medusa-version: 2.x.x   // TODO: verify header name and format
```

For automation scripts and integration tests, pin the Medusa server version in your deployment pipeline rather than relying on runtime header negotiation.

---

## Request Format

All mutation requests (`POST`, `PUT`, `PATCH`, `DELETE`) must send a JSON body with the appropriate `Content-Type` header:

```
Content-Type: application/json
```

Query parameters are used for `GET` requests (filtering, pagination, field selection). See [Pagination and Filtering](./api-pagination-filtering.md) for full details.

**Character encoding:** UTF-8 throughout. Percent-encode special characters in query string values.

**Request body size limit:** <!-- TODO: verify default limit - likely configurable via server middleware -->

---

## Response Envelope

### Single-resource response

When an endpoint returns a single object, the response body wraps it in a top-level key named after the resource type:

```json
// GET /admin/products/:id
{
  "product": {              // resource key matches the noun
    "id": "prod_01H...",
    "title": "Classic T-Shirt",
    "status": "published",
    // ... other fields
  }
}
```

<!-- TODO: verify exact envelope shape - confirm whether all single-resource responses use the resource-named key or whether some use a generic "data" key -->

### List response

List endpoints return a collection alongside pagination metadata:

```json
// GET /admin/products
{
  "products": [             // array of resource objects
    { "id": "prod_01H...", "title": "Classic T-Shirt" },
    { "id": "prod_02H...", "title": "Hoodie" }
  ],
  "count": 47,              // total number of records matching the query (before pagination)
  "offset": 0,              // the offset used for this page
  "limit": 20               // the limit used for this page
}
```

Use `count`, `offset`, and `limit` to determine whether more pages exist and to construct the next request. See [Pagination and Filtering](./api-pagination-filtering.md) for page-iteration patterns.

<!-- TODO: verify exact envelope shape - confirm count/offset/limit field names are stable across all list endpoints -->

---

## Rate Limiting

Medusa ships with rate-limiting middleware that is **disabled by default** in development mode and can be enabled and tuned for production deployments.

<!-- TODO: verify default rate-limit values and the configuration key used to enable/change them -->

**General guidance:**

- Bulk operations (e.g., mass price updates, inventory sync) should be batched and throttled on the client side.
- Automate exponential backoff when you receive a `429 Too Many Requests` response. See [Error Handling](./api-errors.md#429-too-many-requests) for details.
- In CI pipelines, add a small sleep (`sleep 0.5`) between rapid sequential API calls to avoid burst rejection.

---

## OpenAPI / Swagger Specification

Medusa publishes an OpenAPI 3.x specification for both the Admin and Store APIs. You can use the spec to:

- Generate typed SDK clients (e.g., via `openapi-typescript` or `openapi-generator`)
- Import into Postman, Insomnia, or Swagger UI for interactive exploration
- Validate request/response shapes in integration tests

<!-- TODO: verify spec URL - likely https://docs.medusajs.com/api/admin and https://docs.medusajs.com/api/store or a raw JSON/YAML endpoint -->

Spec URLs (TODO: verify):

| API | OpenAPI Spec URL |
|-----|-----------------|
| Admin | `TODO: verify URL` |
| Store | `TODO: verify URL` |

To run Swagger UI locally against a self-hosted spec:

```bash
npx @redocly/cli preview-docs ./openapi-admin.yaml
```

---

## cURL Quick Reference

### Admin API: List products (authenticated)

```bash
# 1. Obtain a JWT token first (see api-authentication.md)
ADMIN_TOKEN="eyJ..."

# 2. Make the authenticated request
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:9000/admin/products?limit=5&offset=0" \
  | jq '.'
```

Expected response shape:

```json
{
  "products": [ /* array of product objects */ ],
  "count": 47,
  "offset": 0,
  "limit": 5
}
```

### Store API: List products (public)

```bash
curl -s \
  -H "x-publishable-api-key: pk_..." \
  "http://localhost:9000/store/products?limit=5" \
  | jq '.'
```

---

## JavaScript / TypeScript Quick Reference

### Admin API: List products

```typescript
const ADMIN_BASE = "http://localhost:9000/admin";

async function listProducts(token: string, limit = 20, offset = 0) {
  const url = new URL(`${ADMIN_BASE}/products`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API error ${response.status}: ${error.message}`);
  }

  return response.json(); // { products, count, offset, limit }
}
```

### Store API: List products

```typescript
const STORE_BASE = "http://localhost:9000/store";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

async function listStoreProducts(limit = 20, offset = 0) {
  const url = new URL(`${STORE_BASE}/products`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-publishable-api-key": PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Store API error ${response.status}: ${error.message}`);
  }

  return response.json();
}
```

---

## Troubleshooting

### CORS errors in the browser

**Symptom:** Browser console shows `Access to fetch at 'http://localhost:9000/...' from origin 'http://localhost:3000' has been blocked by CORS policy`.

**Cause:** The Medusa server's CORS allowlist does not include the frontend origin.

**Fix:** In `medusa-config.ts` (or `medusa-config.js`), add the frontend origin to the `http.cors` configuration:

```typescript
// medusa-config.ts
module.exports = defineConfig({
  projectConfig: {
    http: {
      adminCors: "http://localhost:7001",        // Admin dashboard origin
      storeCors: "http://localhost:3000",         // Storefront origin
      authCors: "http://localhost:3000,http://localhost:7001",
    },
  },
});
```

Restart the server after changing CORS configuration. In production, replace localhost origins with your actual deployed domains.

---

### Wrong base URL / 404 Not Found on all routes

**Symptom:** Every request returns `404 Not Found`, even for routes that should exist.

**Cause:** The base URL is incorrect - either pointing to the wrong host/port, missing the `/admin` or `/store` prefix, or using `http` when the server requires `https`.

**Fix:**
1. Confirm the server is running: `curl http://localhost:9000/health` should return `200 OK`.
2. Ensure you are using the full path including the API prefix: `/admin/products` not just `/products`.
3. Check for a reverse proxy or API gateway that may rewrite paths.

---

### Missing required headers

**Symptom:** Admin requests return `401 Unauthorized`. Store requests return empty results or `400 Bad Request`.

**Cause:**
- Admin requests are missing the `Authorization: Bearer <token>` header.
- Store requests are missing the `x-publishable-api-key` header (required on most store endpoints).

**Fix:** See [Authentication](./api-authentication.md) for complete instructions on obtaining tokens and publishable API keys.

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
