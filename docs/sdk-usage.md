---
id: sdk-usage
title: Medusa JS SDK Usage
sidebar_label: JS SDK
sidebar_position: 14
---

# Medusa JS SDK Usage

The Medusa JS SDK (`@medusajs/js-sdk`) is the official TypeScript client for the
Medusa REST API. It wraps all Admin and Store endpoints with typed methods, handles
authentication state, and provides a consistent interface for both browser and Node.js
environments.

---

## 1. Overview

The SDK provides:

- **Full TypeScript types** for all request parameters and response bodies.
- **Auth management**: supports JWT (token stored by caller) and session-based
  (cookie-based) authentication.
- **Namespaced clients**: `sdk.admin.*` for Admin API, `sdk.store.*` for Store API.
- **Custom fetch options**: ability to pass headers, signal (AbortController), and
  other `RequestInit` options on any call.

The SDK is a thin wrapper around the Medusa REST API. Every method maps to one HTTP
endpoint. All return values are promises that resolve to the typed response body.

---

## 2. Installation

```bash
npm install @medusajs/js-sdk
```

For TypeScript projects, the SDK ships with types included - no `@types/` package
required.

> **TODO: verify** - Confirm the correct package name for the version of Medusa you
> are running. Medusa v2 introduced `@medusajs/js-sdk`; earlier versions used
> `@medusajs/medusa-js`. Check your Medusa server version and use the corresponding
> client.

---

## 3. Initialization

The SDK is instantiated with a configuration object:

```typescript
import Medusa from "@medusajs/js-sdk";

const sdk = new Medusa({
  baseUrl: "http://localhost:9000",  // Medusa server URL (no trailing slash)
  auth: {
    type: "jwt",                     // "jwt" | "session"
    // "jwt": caller stores token in memory/localStorage; SDK sends Authorization header
    // "session": SDK uses cookies; requires same-origin or CORS credentials
  },
  // publishableKey: "pk_01ABCDEF..." // store publishable API key (optional here)
  // debug: true,                     // log all requests/responses to console
});
```

**Auth type comparison:**

| Auth type | Token storage | Use case |
|---|---|---|
| `"jwt"` | Caller's memory or localStorage | SPAs, React apps, Node.js scripts |
| `"session"` | HTTP-only cookies (managed by browser) | SSR apps, Next.js server components |

---

## 4. Full TypeScript Setup Example

```typescript
// lib/medusa-client.ts
import Medusa from "@medusajs/js-sdk";

// Singleton SDK instance.
export const sdk = new Medusa({
  baseUrl: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000",
  auth: {
    type: "jwt",
  },
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
});

// Type helpers re-exported from the SDK for use in components.
// TODO: verify exact export paths for SDK types
// export type { HttpTypes } from "@medusajs/js-sdk";
```

**Storing and restoring the JWT:**

```typescript
// auth-state.ts
const TOKEN_KEY = "medusa_admin_token";

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
```

---

## 5. Admin SDK Usage

All Admin API calls require authentication. Authenticate first, then the SDK caches
the token internally for subsequent calls.

### Authenticate

```typescript
// TODO: verify exact method signature for sdk.auth.login in your SDK version
async function adminLogin(email: string, password: string) {
  const { token } = await sdk.auth.login("admin", "emailpass", {
    email,
    password,
  });
  // The SDK stores the token internally for subsequent admin calls.
  // Persist the token if you need it across page reloads.
  saveToken(token);
  return token;
}
```

### List products

```typescript
// TODO: verify exact SDK method names
async function listProducts(limit = 20, offset = 0) {
  const { products, count } = await sdk.admin.product.list({ limit, offset });
  // products: AdminProduct[]
  // count: number (total matching)
  return { products, count };
}
```

### Create a product

```typescript
async function createProduct(data: {
  title: string;
  handle: string;
  status?: "draft" | "published";
  variants?: Array<{
    title: string;
    prices: Array<{ currency_code: string; amount: number }>;
    inventory_quantity?: number;
  }>;
}) {
  // TODO: verify exact SDK method name (may be sdk.admin.products.create in some versions)
  const { product } = await sdk.admin.product.create(data);
  return product; // product.id, product.handle, product.variants, ...
}
```

### Retrieve an order

```typescript
async function getOrder(orderId: string) {
  // TODO: verify exact SDK method name
  const { order } = await sdk.admin.order.retrieve(orderId);
  return order;
}
```

### Update an order

```typescript
async function updateOrderStatus(orderId: string, status: string) {
  // TODO: verify available update fields and method name
  const { order } = await sdk.admin.order.update(orderId, { status });
  return order;
}
```

---

## 6. Store SDK Usage

Store methods are used by storefront clients. They use the publishable API key for
identification rather than a bearer token.

### Initialization with publishable key

```typescript
import Medusa from "@medusajs/js-sdk";

const storeSdk = new Medusa({
  baseUrl: "http://localhost:9000",
  auth: { type: "jwt" },           // customer JWT auth
  publishableKey: "pk_01ABCDEF...", // required for store endpoints
});
```

### List products

```typescript
async function listProducts(params?: {
  q?: string;
  category_id?: string[];
  limit?: number;
  offset?: number;
}) {
  // TODO: verify exact method name
  const { products, count } = await storeSdk.store.product.list(params ?? {});
  return { products, count };
}
```

### Create a cart

```typescript
async function createCart(regionId: string) {
  // TODO: verify exact method name
  const { cart } = await storeSdk.store.cart.create({ region_id: regionId });
  return cart; // cart.id, cart.currency_code, cart.items
}
```

### Add a line item to cart

```typescript
async function addLineItem(
  cartId: string,
  variantId: string,
  quantity: number
) {
  // TODO: verify exact method name and parameter shape
  const { cart } = await storeSdk.store.cart.addLineItem(cartId, {
    variant_id: variantId,
    quantity,
  });
  return cart;
}
```

### Complete a cart (place order)

```typescript
async function placeOrder(cartId: string) {
  // TODO: verify exact method name
  const result = await storeSdk.store.cart.complete(cartId);
  if (result.type === "order") {
    return result.order;
  }
  // result.type === "cart" indicates an error state; inspect result.cart.payment_status
  throw new Error(`Cart completion did not produce an order: ${JSON.stringify(result)}`);
}
```

### Customer authentication (store)

```typescript
async function loginCustomer(email: string, password: string) {
  // TODO: verify exact SDK method - may be sdk.auth.login("customer", "emailpass", ...)
  const { token } = await storeSdk.auth.login("customer", "emailpass", {
    email,
    password,
  });
  return token;
}
```

---

## 7. Error Handling

All SDK methods throw on non-2xx responses. The thrown error is an instance of a
Medusa SDK error class that includes the HTTP status and the server error body.

```typescript
import Medusa, { MedusaError } from "@medusajs/js-sdk"; // TODO: verify MedusaError export

async function safeListProducts(sdk: Medusa) {
  try {
    const { products } = await sdk.store.product.list({ limit: 10 });
    return products;
  } catch (err) {
    if (err instanceof MedusaError) {
      // err.status:  HTTP status code (e.g., 401, 404, 422)
      // err.message: Human-readable error message from the server
      // err.type:    Medusa error type string (e.g., "unauthorized", "not_found")
      console.error(`Medusa API error ${err.status}: ${err.message}`);

      if (err.status === 401) {
        // Token expired; trigger re-authentication
      }
    } else {
      // Network error (fetch failed entirely)
      console.error("Network error:", err);
    }
    throw err;
  }
}
```

> **TODO: verify** - Confirm the name and import path of the SDK error class in your
> installed version. It may be `FetchError`, `MedusaError`, or a plain `Error` with
> added properties.

---

## 8. Advanced: Custom Fetch Options, Interceptors, Token Refresh

### Passing custom fetch options per request

Most SDK methods accept an optional `fetchOptions` parameter as the last argument,
which is merged into the underlying `fetch` call:

```typescript
// Cancel a request with AbortController
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const { products } = await sdk.store.product.list(
    { limit: 20 },
    { signal: controller.signal } // TODO: verify fetchOptions parameter name/position
  );
  return products;
} finally {
  clearTimeout(timeout);
}
```

### Custom headers per request

```typescript
const { order } = await sdk.admin.order.retrieve(
  orderId,
  { headers: { "X-Custom-Header": "value" } } // TODO: verify header passthrough support
);
```

### Token refresh strategy

The JWT issued by Medusa expires. Implement a refresh wrapper to automatically
re-authenticate on `401`:

```typescript
let adminToken: string | null = getToken();

async function withTokenRefresh<T>(
  fn: () => Promise<T>,
  credentials: { email: string; password: string }
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      // Re-authenticate and retry once.
      const { token } = await sdk.auth.login("admin", "emailpass", credentials);
      saveToken(token);
      adminToken = token;
      return await fn();
    }
    throw err;
  }
}

// Usage:
const { products } = await withTokenRefresh(
  () => sdk.admin.product.list({ limit: 10 }),
  { email: "admin@store.com", password: "..." }
);
```

---

## 9. TypeScript Tips

### Using SDK types for request/response shapes

The SDK exports TypeScript types for all request parameters and response bodies. Use
them to type your own functions:

```typescript
// TODO: verify exact import paths for SDK types
import type {
  AdminCreateProductInput,
  AdminProduct,
  StoreCart,
} from "@medusajs/js-sdk/types"; // import path may differ

function buildProductPayload(
  title: string,
  price: number
): AdminCreateProductInput {
  return {
    title,
    status: "published",
    variants: [
      {
        title: "Default Variant",
        prices: [{ currency_code: "usd", amount: price }],
        manage_inventory: true,
        inventory_quantity: 100,
      },
    ],
  };
}
```

### Narrowing response types

When the SDK response includes a union type (e.g., the cart completion response), use
a discriminated union narrowing:

```typescript
const result = await storeSdk.store.cart.complete(cartId);

if (result.type === "order") {
  const order = result.order; // narrowed to order type
  console.log(`Order ID: ${order.id}`);
} else {
  const cart = result.cart; // narrowed to cart type with error state
  console.log(`Cart error state: ${cart.payment_status}`);
}
```

---

## 10. Troubleshooting

### SDK version mismatch with server

**Symptom:** SDK calls return unexpected 404 errors or response shapes differ from
what the types describe. TypeScript types do not match runtime data.

**Cause:** The installed `@medusajs/js-sdk` version was built against a different
Medusa server version.

**Fix:**
1. Check the server version: `GET http://localhost:9000/health` or inspect
   `node_modules/@medusajs/medusa/package.json` on the server.
2. Install the matching SDK version:
   `npm install @medusajs/js-sdk@<server-version-compatible>`.
3. Consult the Medusa changelog for breaking SDK changes between versions.

---

### TypeScript type errors

**Symptom:** TypeScript reports errors like `Property 'product' does not exist on
type` or `Argument of type X is not assignable to parameter of type Y`.

**Cause:** The SDK types have changed between versions, or an incorrect import path
is being used.

**Fix:**
1. Run `npm install` to ensure installed types are up to date.
2. Restart the TypeScript language server in your editor.
3. Check the SDK's `CHANGELOG.md` for type renames or breaking changes.
4. If using monorepo / multiple `@medusajs` packages, ensure all versions are
   pinned to the same major version to avoid type conflicts.

---

### CORS errors in browser (not in Node.js)

**Symptom:** Requests from a browser SPA fail with `CORS policy: No
'Access-Control-Allow-Origin' header`. The same call works from a Node.js script.

**Cause:** The Medusa server's CORS configuration does not include the storefront's
origin.

**Fix:**
1. In `medusa-config.ts`, add the storefront URL to the `http.storeCors` setting:
   ```typescript
   http: {
     storeCors: "http://localhost:3000,https://your-storefront.com",
     adminCors: "http://localhost:7001,https://your-admin.com",
   }
   ```
2. Restart the Medusa server after configuration changes.
3. Verify that the `x-publishable-api-key` header is sent on store requests. Medusa
   may reject cross-origin requests lacking this header even when CORS is configured.
4. If using session auth (`type: "session"`), ensure the `fetch` call includes
   `credentials: "include"` and that the server sets `Access-Control-Allow-Credentials:
   true` and a specific (not wildcard) `Access-Control-Allow-Origin`.

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
