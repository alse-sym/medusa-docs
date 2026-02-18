---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
sidebar_position: 4
---

# Quickstart

This guide gets you from a running Medusa server to a successful API call in under 10 minutes.

**What you will do:**

1. Start the Medusa server
2. Obtain an admin API token
3. Make your first API call (list products)
4. Understand the response structure
5. Know where to go next

**Prerequisites:** Medusa is installed and your `.env` is configured. If not, complete the [Installation](./installation.md) guide first.

---

## Step 1 — Start the server

```bash
npx medusa develop
```

The server starts on `http://localhost:9000`. You should see output like:

```
info:    Server is ready on port: 9000
```

Leave this terminal running. Open a new terminal for the following steps.

---

## Step 2 — Obtain an admin API token

The Medusa CLI seeds a default admin user during project setup. Authenticate with that user to get a bearer token.

### Default admin credentials

```
Email:    admin@medusa-test.com
Password: supersecret
```

These are the credentials seeded by `npx create-medusa-app`. If you used a custom seed, substitute your own credentials.

### Request a token

**cURL:**

```bash
curl -s -X POST http://localhost:9000/auth/user/emailpass \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@medusa-test.com", "password": "supersecret"}'
```

**JavaScript (fetch):**

```js
const response = await fetch("http://localhost:9000/auth/user/emailpass", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@medusa-test.com",
    password: "supersecret",
  }),
});

const { token } = await response.json();
console.log(token);
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Copy the `token` value. You will use it in the next step.

---

## Step 3 — Make your first API call: list products

The store products endpoint is public and does not require authentication, which makes it a convenient first call.

### cURL

```bash
curl -s http://localhost:9000/store/products \
  -H "x-publishable-api-key: YOUR_PUBLISHABLE_KEY"
```

> **Note:** Store API requests require a publishable API key header (`x-publishable-api-key`). Create one in the admin panel under Settings > Publishable API Keys, or via the admin API. TODO: verify exact admin panel path.

To create a publishable API key via the admin API using the token from Step 2:

```bash
# Create a publishable API key
curl -s -X POST http://localhost:9000/admin/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Storefront", "type": "publishable"}'
```

Then use the returned `token` field as your `x-publishable-api-key` value.

### Full example: list products with the publishable key

**cURL:**

```bash
curl -s "http://localhost:9000/store/products" \
  -H "x-publishable-api-key: pk_01XXXXXXXXXXXXXXXXXXXXXXXXXX"
```

**JavaScript (fetch):**

```js
const response = await fetch("http://localhost:9000/store/products", {
  headers: {
    "x-publishable-api-key": "pk_01XXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
});

const data = await response.json();
console.log(data.products);
```

**TypeScript:**

```ts
interface Product {
  id: string;
  title: string;
  handle: string;
  status: string;
}

interface ProductListResponse {
  products: Product[];
  count: number;
  offset: number;
  limit: number;
}

const response = await fetch("http://localhost:9000/store/products", {
  headers: {
    "x-publishable-api-key": "pk_01XXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
});

const data: ProductListResponse = await response.json();
```

---

## Step 4 — Understand the response structure

A successful response looks like this:

```json
{
  "products": [            // array of product objects
    {
      "id": "prod_01XXXXXXXXXX",      // unique product ID (prefixed with "prod_")
      "title": "Medusa T-Shirt",      // display name
      "handle": "medusa-t-shirt",     // URL-safe slug, used in storefront routes
      "status": "published",          // "draft" | "published" | "rejected" | "proposed"
      "description": "...",           // long-form product description (may be null)
      "thumbnail": "https://...",     // URL of the primary thumbnail image (may be null)
      "variants": [                   // one entry per SKU/option combination
        {
          "id": "variant_01XXXXXXXXXX",
          "title": "S / Black",
          "sku": "MEDUSA-TS-S-BLK",   // optional SKU
          "prices": [                 // one entry per currency/region
            {
              "amount": 1000,         // amount in the smallest currency unit (e.g., cents)
              "currency_code": "usd"
            }
          ]
        }
      ],
      "options": [                    // product option types (e.g., Size, Color)
        {
          "id": "opt_01XXXXXXXXXX",
          "title": "Size"
        }
      ],
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T10:00:00.000Z"
    }
  ],
  "count": 1,     // total number of matching products (for pagination)
  "offset": 0,    // current pagination offset
  "limit": 50     // maximum number of results returned in this response
}
```

### Pagination

Use `limit` and `offset` query parameters to paginate:

```bash
curl "http://localhost:9000/store/products?limit=10&offset=20" \
  -H "x-publishable-api-key: pk_01XXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### Filtering

Products can be filtered by various fields. For example, filter by handle:

```bash
curl "http://localhost:9000/store/products?handle=medusa-t-shirt" \
  -H "x-publishable-api-key: pk_01XXXXXXXXXXXXXXXXXXXXXXXXXX"
```

TODO: verify full list of supported filter parameters against the OpenAPI spec.

---

## Step 5 — Next steps

You have a running Medusa server and have made your first API call. From here:

| Topic | Description |
|---|---|
| Authentication | Learn how to authenticate customers and use session tokens — `docs/api-authentication.md` TODO: create this file |
| SDK Usage | Use the official `@medusajs/js-sdk` client instead of raw fetch — `docs/sdk-usage.md` TODO: create this file |
| Products API | Create, update, and manage products via the admin API |
| Orders API | Understand the order lifecycle |
| Storefront | Connect a Next.js or other frontend to your Medusa backend |

Explore the full API reference at `http://localhost:9000/api` (Swagger UI) once your server is running. TODO: verify exact path to Swagger UI.
