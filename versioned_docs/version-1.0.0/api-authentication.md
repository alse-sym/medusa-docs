---
id: api-authentication
title: API Authentication
sidebar_label: API Authentication
sidebar_position: 8
---

# API Authentication

Medusa uses two distinct authentication mechanisms depending on which API surface you are accessing. Understanding which mechanism applies - and applying it correctly - is essential for every integration.

| Mechanism | Used For | Header |
|-----------|----------|--------|
| JWT Bearer Token | Admin API all routes; Customer sessions (Store API) | `Authorization: Bearer <token>` |
| Publishable API Key | Store API public/semi-public routes | `x-publishable-api-key: <key>` |

---

## Admin Authentication

Admin users authenticate by exchanging an email and password for a short-lived JWT token. This token must be included on every subsequent Admin API request.

### Obtaining a JWT Token

Send a `POST` request to `/admin/auth/token` with `email` and `password` in the JSON body:

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "supersecret"}' \
  "http://localhost:9000/admin/auth/token"
```

Successful response (`200 OK`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // JWT - store this securely
  "user": {
    "id": "user_01H...",          // admin user ID
    "email": "admin@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "role": "admin"               // "admin" | "member" | "developer" - TODO: verify role names
  }
}
```

Failed authentication (`401 Unauthorized`):

```json
{
  "type": "unauthorized",
  "message": "Unauthorized"
}
```

### JavaScript / TypeScript: Obtain Token

```typescript
const ADMIN_BASE = "http://localhost:9000/admin";

interface AdminAuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  };
}

async function getAdminToken(
  email: string,
  password: string
): Promise<AdminAuthResponse> {
  const response = await fetch(`${ADMIN_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Authentication failed (${response.status}): ${error.message}`
    );
  }

  return response.json() as Promise<AdminAuthResponse>;
}

// Usage
const { token } = await getAdminToken("admin@example.com", "supersecret");
```

---

### Token Expiry and Refresh

Admin JWT tokens have a configurable TTL (time-to-live). The default expiry is <!-- TODO: verify default JWT TTL - likely 24h or 1h -->.

**Detecting expiry:** When a token expires, the next API request returns `401 Unauthorized` with a message indicating the token is invalid or expired:

```json
{
  "type": "unauthorized",
  "message": "Unauthorized"   // TODO: verify whether Medusa distinguishes "expired" vs "invalid" in the message
}
```

**Handling expiry in automation scripts:**

```typescript
class AdminClient {
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private readonly email: string,
    private readonly password: string,
    private readonly baseUrl: string = "http://localhost:9000/admin"
  ) {}

  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return true;
    // Refresh 60 seconds before actual expiry to avoid edge cases
    return Date.now() >= this.tokenExpiresAt - 60_000;
  }

  async getToken(): Promise<string> {
    if (this.token && !this.isTokenExpired()) {
      return this.token;
    }

    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) {
      throw new Error(`Re-authentication failed: ${response.status}`);
    }

    const data = await response.json();
    this.token = data.token;

    // TODO: verify whether the token response includes an "expires_at" or "expires_in" field.
    // If not, decode the JWT payload to extract the "exp" claim.
    const payload = JSON.parse(
      Buffer.from(data.token.split(".")[1], "base64").toString("utf-8")
    );
    this.tokenExpiresAt = payload.exp * 1000; // convert Unix seconds to ms

    return this.token!;
  }

  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        "Authorization": `Bearer ${token}`,
      },
    });
  }
}

// Usage
const client = new AdminClient("admin@example.com", "supersecret");
const res = await client.fetch("/orders?limit=10");
const { orders } = await res.json();
```

---

### Using the Token: Authorization Header

Once you have a token, include it in the `Authorization` header of every Admin API request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**The token must be prefixed with `Bearer ` (with a space).** Omitting the space or the word `Bearer` will result in a `401 Unauthorized` response.

---

### Example: List Orders (Authenticated Admin Request)

```bash
ADMIN_TOKEN="eyJ..."

curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:9000/admin/orders?limit=5&offset=0" \
  | jq '.orders[] | {id, status, total}'
```

```typescript
async function listOrders(
  client: AdminClient,
  limit = 20,
  offset = 0
): Promise<{ orders: unknown[]; count: number; offset: number; limit: number }> {
  const url = new URL("/orders", "http://localhost:9000/admin");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const response = await client.fetch(
    `/orders?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`List orders failed: ${error.message}`);
  }

  return response.json();
}
```

---

## Store Authentication

### Publishable API Key

A publishable API key (PAK) is a non-secret identifier that tells Medusa which sales channel a storefront request belongs to. It is safe to embed in browser-side code (unlike admin credentials).

**Where to create a publishable API key:**

1. **Via Admin UI:** Navigate to Settings > Publishable API Keys > Create.
2. **Via Admin API:**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Storefront"}' \
  "http://localhost:9000/admin/api-keys" \
  | jq '.api_key'
```

```json
{
  "api_key": {
    "id": "apk_01H...",
    "token": "pk_...",          // this is the value to use in x-publishable-api-key
    "title": "My Storefront",
    "type": "publishable",
    "created_at": "2024-01-01T00:00:00.000Z",
    "revoked_at": null
  }
}
```

<!-- TODO: verify exact endpoint path for creating API keys - may be /admin/publishable-api-keys in some versions -->

### Passing the Publishable API Key

Include the key in the `x-publishable-api-key` header on every Store API request:

```
x-publishable-api-key: pk_01H...
```

**cURL example:**

```bash
PUBLISHABLE_KEY="pk_01H..."

curl -s \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  "http://localhost:9000/store/products?limit=10" \
  | jq '.products[] | {id, title}'
```

**JavaScript / TypeScript example:**

```typescript
const STORE_BASE = "http://localhost:9000/store";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY!;

async function storeGet(path: string, params?: Record<string, string>) {
  const url = new URL(`${STORE_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-publishable-api-key": PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Store API ${response.status}: ${error.message}`);
  }

  return response.json();
}

// Example usage
const { products } = await storeGet("/products", { limit: "10" });
```

---

### Customer Session Tokens

For logged-in customer flows (viewing past orders, managing addresses, etc.), customers authenticate with their own credentials and receive a customer-scoped JWT.

**Obtain a customer token:**

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -d '{"email": "customer@example.com", "password": "customerpass"}' \
  "http://localhost:9000/store/auth/token"
```

Response:

```json
{
  "token": "eyJ...",    // customer-scoped JWT
  "customer": {
    "id": "cus_01H...",
    "email": "customer@example.com",
    "first_name": "Alice",
    "last_name": "Smith"
  }
}
```

<!-- TODO: verify exact Store auth endpoint path - may be /store/customers/me/auth or /store/auth/token depending on version -->

**Using the customer token:**

```typescript
async function getCustomerOrders(
  customerToken: string,
  publishableKey: string
): Promise<unknown> {
  const response = await fetch(
    "http://localhost:9000/store/customers/me/orders",
    {
      headers: {
        "Authorization": `Bearer ${customerToken}`,
        "x-publishable-api-key": publishableKey,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Customer orders fetch failed: ${error.message}`);
  }

  return response.json();
}
```

---

### Example: Get Cart (Authenticated Store Request)

```bash
CART_ID="cart_01H..."
PUBLISHABLE_KEY="pk_01H..."
CUSTOMER_TOKEN="eyJ..."   # optional - only needed if cart is associated with a customer

curl -s \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  "http://localhost:9000/store/carts/$CART_ID" \
  | jq '.cart | {id, items_count: (.items | length), total}'
```

```typescript
async function getCart(cartId: string): Promise<unknown> {
  const response = await fetch(
    `http://localhost:9000/store/carts/${cartId}`,
    {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Get cart failed (${response.status}): ${error.message}`);
  }

  const { cart } = await response.json();
  return cart;
}
```

---

## Security Best Practices

### Never expose admin credentials in the frontend

Admin JWT tokens grant full back-office access. They must never be:
- Embedded in client-side JavaScript bundles
- Stored in `localStorage` or `sessionStorage` on the browser
- Included in source control (`.env` files without `.gitignore`)
- Logged to browser console or application logs

Use environment variables on the server side and call the Admin API from server-side code only (e.g., Next.js API routes, Node.js services).

### Store tokens in httpOnly cookies or secure server-side storage

If you need to maintain a customer session across page loads, store the customer JWT in an `httpOnly` cookie (inaccessible to JavaScript). This prevents XSS attacks from stealing the token.

```typescript
// Example: Next.js API route setting an httpOnly cookie
import { serialize } from "cookie";
import type { NextApiResponse } from "next";

function setAuthCookie(res: NextApiResponse, token: string): void {
  res.setHeader(
    "Set-Cookie",
    serialize("medusa_customer_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours - TODO: align with server-side token TTL
    })
  );
}
```

### Rotate publishable API keys when compromised

If a publishable API key is leaked or abused:

1. Log in to the Admin UI or use the Admin API to revoke the key immediately.
2. Create a new publishable API key.
3. Deploy the updated key to all storefront environments.

Publishable keys are not secret (they are safe to embed in frontend code), but they do gate which sales channel a request belongs to. Leaked keys can be used to make store requests attributed to your sales channel.

### Use a CORS allowlist in production

In production, never use a wildcard (`*`) for `storeCors` or `adminCors`. Always enumerate the exact origins that should be allowed:

```typescript
// medusa-config.ts (production)
module.exports = defineConfig({
  projectConfig: {
    http: {
      adminCors: "https://admin.example.com",
      storeCors: "https://store.example.com",
      authCors: "https://store.example.com,https://admin.example.com",
    },
  },
});
```

---

## Troubleshooting

### 401 Unauthorized: Token missing, expired, or malformed

**Symptom:** API returns `401` with `{"type":"unauthorized","message":"Unauthorized"}`.

**Cause - token missing:** The `Authorization` header was not included in the request.

**Fix:** Add the header: `Authorization: Bearer <token>`.

---

**Cause - token expired:** The JWT TTL has elapsed.

**Fix:** Re-authenticate by calling `POST /admin/auth/token` again to obtain a fresh token. Implement automatic re-authentication as shown in the `AdminClient` example above.

---

**Cause - token malformed:** The token was truncated, corrupted, or the `Bearer ` prefix is missing.

**Fix:** Confirm the full token string is present. Log the raw header value server-side (temporarily, for debugging) to check for truncation. Ensure `Bearer ` (with a trailing space) precedes the token.

---

### 403 Forbidden: Wrong scope (using store token for admin route)

**Symptom:** A request to an `/admin/...` endpoint returns `403 Forbidden` even though you have a valid token.

**Cause:** You are passing a customer-scoped JWT (obtained from `POST /store/auth/token`) to an Admin API endpoint. Customer tokens do not grant admin access.

**Fix:** Obtain an admin JWT via `POST /admin/auth/token` using admin credentials, and use that token exclusively for Admin API requests.

---

### CORS errors on authentication endpoints

**Symptom:** `POST /admin/auth/token` or `POST /store/auth/token` fails in the browser with a CORS error before the request body is sent.

**Cause:** The `authCors` configuration on the server does not include the frontend origin. The browser sends a preflight `OPTIONS` request that is rejected.

**Fix:** Add the frontend origin to `authCors` in `medusa-config.ts`:

```typescript
http: {
  authCors: "http://localhost:3000",
}
```

Note that `authCors` is separate from `storeCors` and `adminCors` - all three may need to include your frontend origin depending on which endpoints your frontend calls directly.

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
