---
id: api-reference-patterns
title: API Reference Patterns
sidebar_label: API Patterns
sidebar_position: 12
---

# API Reference Patterns

This document provides practical, end-to-end recipes for the most common Medusa
integration tasks. Each pattern includes the full sequence of API calls, annotated
request/response shapes, and notes on error handling.

**Base URLs used throughout this document:**

- Admin API: `http://localhost:9000/admin`
- Store API: `http://localhost:9000/store`

Replace `localhost:9000` with your production domain as appropriate.

---

## 1. Overview

Medusa exposes two REST API surfaces:

- **Admin API** (`/admin/*`): Authenticated with a JWT obtained via
  `POST /admin/auth/token`. Used by merchants, back-office tools, and internal
  automation.
- **Store API** (`/store/*`): Used by storefront clients. Some endpoints are public;
  others require a customer session token or a publishable API key in the
  `x-publishable-api-key` header.

All request and response bodies are JSON. All list endpoints support `limit` and
`offset` query parameters for pagination.

---

## 2. Pattern: Cart-to-Order Flow

This is the core storefront checkout flow. A cart moves through the following states:

```
[created] -> [items added] -> [shipping set] -> [payment authorized] -> [completed -> order]
```

### Step 1: Create a Cart

```bash
curl -X POST http://localhost:9000/store/carts \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "region_id": "reg_01ABCDEF..."
  }'
```

```javascript
async function createCart(regionId, publishableApiKey) {
  const res = await fetch('http://localhost:9000/store/carts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': publishableApiKey,
    },
    body: JSON.stringify({ region_id: regionId }),
  });
  const { cart } = await res.json();
  // cart.id  - save this for subsequent calls
  // cart.region_id
  // cart.currency_code
  return cart;
}
```

**Response (201):**

```json
{
  "cart": {
    "id": "cart_01ABCDEF...",       // use in all subsequent cart calls
    "region_id": "reg_01ABCDEF...",
    "currency_code": "usd",
    "items": [],
    "total": 0,
    "subtotal": 0,
    "tax_total": 0,
    "shipping_total": 0,
    "discount_total": 0
  }
}
```

### Step 2: Add Line Items

```bash
curl -X POST http://localhost:9000/store/carts/cart_01ABCDEF.../line-items \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "variant_id": "variant_01ABCDEF...",
    "quantity": 2
  }'
```

```javascript
async function addLineItem(cartId, variantId, quantity, publishableApiKey) {
  const res = await fetch(
    `http://localhost:9000/store/carts/${cartId}/line-items`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': publishableApiKey,
      },
      body: JSON.stringify({ variant_id: variantId, quantity }),
    }
  );
  const { cart } = await res.json();
  return cart;
}
```

**Response (200) - cart with updated line items:**

```json
{
  "cart": {
    "id": "cart_01ABCDEF...",
    "items": [
      {
        "id": "item_01ABCDEF...",
        "variant_id": "variant_01ABCDEF...",
        "title": "Blue T-Shirt - M",
        "quantity": 2,
        "unit_price": 2500,     // in smallest currency unit (cents for USD)
        "subtotal": 5000,
        "tax_total": 400,
        "total": 5400
      }
    ],
    "subtotal": 5000,
    "tax_total": 400,
    "total": 5400
  }
}
```

### Step 3: Set Shipping Address and Method

First, retrieve available shipping options for the cart:

```bash
curl "http://localhost:9000/store/shipping-options?cart_id=cart_01ABCDEF..." \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

Then add the chosen shipping method to the cart:

```bash
curl -X POST http://localhost:9000/store/carts/cart_01ABCDEF.../shipping-methods \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "option_id": "so_01ABCDEF..."
  }'
```

```javascript
async function setShippingMethod(cartId, shippingOptionId, publishableApiKey) {
  const res = await fetch(
    `http://localhost:9000/store/carts/${cartId}/shipping-methods`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': publishableApiKey,
      },
      body: JSON.stringify({ option_id: shippingOptionId }),
    }
  );
  const { cart } = await res.json();
  return cart; // cart.shipping_total is now populated
}
```

### Step 4: Initialize Payment Session

```bash
curl -X POST http://localhost:9000/store/carts/cart_01ABCDEF.../payment-sessions \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "provider_id": "stripe"
  }'
```

```javascript
async function initPaymentSession(cartId, providerId, publishableApiKey) {
  const res = await fetch(
    `http://localhost:9000/store/carts/${cartId}/payment-sessions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': publishableApiKey,
      },
      body: JSON.stringify({ provider_id: providerId }),
    }
  );
  const { cart } = await res.json();
  // cart.payment_session.data contains provider-specific data
  // e.g., cart.payment_session.data.client_secret for Stripe Elements
  return cart.payment_session;
}
```

### Step 5: Complete the Cart (Place the Order)

Call this **after** the payment provider has confirmed authorization (e.g., after
Stripe's `confirmPayment` resolves). This is the critical idempotency-sensitive step.

```bash
curl -X POST http://localhost:9000/store/carts/cart_01ABCDEF.../complete \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

```javascript
async function completeCart(cartId, publishableApiKey) {
  const res = await fetch(
    `http://localhost:9000/store/carts/${cartId}/complete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': publishableApiKey,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Cart completion failed: ${err.message}`);
  }

  const data = await res.json();
  // data.type is "order" on success, "cart" if the cart is in a recoverable error state
  return data;
}
```

**Response (200) on success:**

```json
{
  "type": "order",
  "order": {
    "id": "order_01ABCDEF...",
    "status": "pending",
    "display_id": 1001,          // human-readable order number
    "total": 5900,
    "subtotal": 5000,
    "tax_total": 400,
    "shipping_total": 500,
    "currency_code": "usd",
    "items": [ /* ... */ ],
    "shipping_address": { /* ... */ },
    "payment_status": "captured"
  }
}
```

---

## 3. Pattern: Product Listing with Filtering and Pagination

### Basic listing

```bash
curl "http://localhost:9000/store/products?limit=20&offset=0" \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

### With search and category filter

```bash
curl "http://localhost:9000/store/products?q=shirt&category_id[]=cat_01ABC...&limit=20&offset=0" \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

### Paginated fetch helper (JavaScript)

```javascript
/**
 * Fetch all products matching a filter, handling pagination automatically.
 *
 * @param {object} filters - Query parameters to pass to the products endpoint.
 * @param {string} publishableApiKey
 * @param {number} pageSize - Items per page (default 50, max 100).
 * @returns {Promise<object[]>} All matching products.
 */
async function fetchAllProducts(filters = {}, publishableApiKey, pageSize = 50) {
  const base = 'http://localhost:9000/store/products';
  const results = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      ...filters,
      limit: String(pageSize),
      offset: String(offset),
    });

    const res = await fetch(`${base}?${params}`, {
      headers: { 'x-publishable-api-key': publishableApiKey },
    });

    if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);

    const { products, count } = await res.json();
    // count  - total number of matching products (not just this page)
    // products - array of product objects for this page

    results.push(...products);
    offset += products.length;
    hasMore = offset < count;
  }

  return results;
}
```

**Response shape (single page):**

```json
{
  "products": [
    {
      "id": "prod_01ABCDEF...",
      "title": "Blue T-Shirt",
      "handle": "blue-t-shirt",    // URL-friendly slug
      "status": "published",
      "thumbnail": "https://...",
      "variants": [
        {
          "id": "variant_01ABCDEF...",
          "title": "M",
          "prices": [
            {
              "currency_code": "usd",
              "amount": 2500          // in cents
            }
          ],
          "inventory_quantity": 42
        }
      ],
      "options": [ /* size, color, etc. */ ]
    }
  ],
  "count": 157,   // total products matching the filter
  "offset": 0,
  "limit": 20
}
```

---

## 4. Pattern: Admin Order Management

All Admin API calls require a Bearer token. See Section 5 for how to obtain one.

### List orders with status filter

```bash
curl "http://localhost:9000/admin/orders?status[]=pending&status[]=processing&limit=50" \
  -H "Authorization: Bearer <admin_jwt>"
```

```javascript
async function listPendingOrders(adminToken) {
  const params = new URLSearchParams();
  params.append('status[]', 'pending');
  params.append('status[]', 'processing');
  params.set('limit', '50');
  params.set('offset', '0');

  const res = await fetch(
    `http://localhost:9000/admin/orders?${params}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  const { orders, count } = await res.json();
  return { orders, count };
}
```

**Response:**

```json
{
  "orders": [
    {
      "id": "order_01ABCDEF...",
      "status": "pending",
      "display_id": 1001,
      "customer": { "email": "customer@example.com" },
      "total": 5900,
      "currency_code": "usd",
      "fulfillment_status": "not_fulfilled",
      "payment_status": "captured",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 3,
  "offset": 0,
  "limit": 50
}
```

### Fulfill an order

```bash
curl -X POST http://localhost:9000/admin/orders/order_01ABCDEF.../fulfillments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_jwt>" \
  -d '{
    "items": [
      { "item_id": "item_01ABCDEF...", "quantity": 2 }
    ]
  }'
```

```javascript
async function fulfillOrder(orderId, items, adminToken) {
  // items: [{ item_id: string, quantity: number }]
  const res = await fetch(
    `http://localhost:9000/admin/orders/${orderId}/fulfillments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ items }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Fulfillment failed: ${err.message}`);
  }

  const { order } = await res.json();
  return order; // order.fulfillment_status is now "fulfilled" or "partially_fulfilled"
}
```

### Issue a refund

```bash
curl -X POST http://localhost:9000/admin/orders/order_01ABCDEF.../refunds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_jwt>" \
  -d '{
    "amount": 2500,
    "reason": "customer_return",
    "note": "Customer reported defective item"
  }'
```

```javascript
async function issueRefund(orderId, amount, reason, note, adminToken) {
  // amount: integer in smallest currency unit (cents for USD)
  // reason: "discount" | "return" | "swap" | "claim" | "other" (TODO: verify enum values)
  const res = await fetch(
    `http://localhost:9000/admin/orders/${orderId}/refunds`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ amount, reason, note }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Refund failed: ${err.message}`);
  }

  const { refund } = await res.json();
  // refund.id, refund.amount, refund.created_at
  return refund;
}
```

---

## 5. Pattern: Customer Authentication Flow

### Register a customer

```bash
curl -X POST http://localhost:9000/store/customers \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "password": "supersecret123"
  }'
```

```javascript
async function registerCustomer(data, publishableApiKey) {
  const res = await fetch('http://localhost:9000/store/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': publishableApiKey,
    },
    body: JSON.stringify(data),
  });

  if (res.status === 422) {
    const err = await res.json();
    // err.message may be "Customer with email already exists"
    throw new Error(err.message);
  }

  const { customer } = await res.json();
  return customer;
}
```

### Login (obtain JWT)

> **TODO: verify** - The exact store customer auth endpoint path may differ in Medusa
> v2. The pattern below is for Medusa v1 (`POST /store/auth`). In Medusa v2, the auth
> module path may be `POST /auth/customer/emailpass` or similar. Confirm with your
> Medusa version.

```bash
curl -X POST http://localhost:9000/store/auth \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "email": "jane@example.com",
    "password": "supersecret123"
  }'
```

```javascript
async function loginCustomer(email, password, publishableApiKey) {
  const res = await fetch('http://localhost:9000/store/auth', { // TODO: verify path for v2
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': publishableApiKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 401) throw new Error('Invalid credentials');

  const { customer, access_token } = await res.json();
  // Store access_token for authenticated store requests
  return { customer, access_token };
}
```

### Get customer profile

```bash
curl http://localhost:9000/store/customers/me \
  -H "Authorization: Bearer <customer_jwt>" \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

```javascript
async function getCustomerProfile(customerToken, publishableApiKey) {
  const res = await fetch('http://localhost:9000/store/customers/me', {
    headers: {
      Authorization: `Bearer ${customerToken}`,
      'x-publishable-api-key': publishableApiKey,
    },
  });
  const { customer } = await res.json();
  return customer;
}
```

### Update customer

```bash
curl -X POST http://localhost:9000/store/customers/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer_jwt>" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{
    "first_name": "Janet",
    "phone": "+15555551234"
  }'
```

```javascript
async function updateCustomer(updates, customerToken, publishableApiKey) {
  const res = await fetch('http://localhost:9000/store/customers/me', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
      'x-publishable-api-key': publishableApiKey,
    },
    body: JSON.stringify(updates),
  });
  const { customer } = await res.json();
  return customer;
}
```

**Admin: obtain JWT**

```bash
curl -X POST http://localhost:9000/auth/admin/emailpass \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@store.com",
    "password": "adminpassword"
  }'
```

```javascript
async function loginAdmin(email, password) {
  const res = await fetch('http://localhost:9000/auth/admin/emailpass', { // TODO: verify path
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { token } = await res.json();
  // Use token as: Authorization: Bearer <token>
  return token;
}
```

---

## 6. Pattern: Multi-Region Pricing

Medusa supports multi-region pricing. Each region has its own currency and tax rules.
Prices are always returned in the smallest currency unit (cents for USD, pence for GBP).

### List regions

```bash
curl http://localhost:9000/store/regions \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

**Response:**

```json
{
  "regions": [
    {
      "id": "reg_01ABC...",
      "name": "North America",
      "currency_code": "usd",
      "tax_rate": 0,             // base tax rate; may be overridden by provider
      "countries": [
        { "iso_2": "us", "display_name": "United States" },
        { "iso_2": "ca", "display_name": "Canada" }
      ],
      "payment_providers": [ { "id": "stripe" } ],
      "fulfillment_providers": [ { "id": "manual" } ]
    }
  ]
}
```

### Retrieve region-specific prices for a product

The Store API automatically returns prices for the region associated with the current
cart or the `region_id` query parameter.

```bash
curl "http://localhost:9000/store/products/prod_01ABCDEF...?region_id=reg_01ABCDEF..." \
  -H "x-publishable-api-key: pk_01ABCDEF..."
```

```javascript
async function getProductWithRegionPricing(productId, regionId, publishableApiKey) {
  const params = new URLSearchParams({ region_id: regionId });
  const res = await fetch(
    `http://localhost:9000/store/products/${productId}?${params}`,
    { headers: { 'x-publishable-api-key': publishableApiKey } }
  );
  const { product } = await res.json();

  // Each variant's calculated_price reflects the region's currency and taxes.
  const prices = product.variants.map((v) => ({
    variantId: v.id,
    title: v.title,
    amount: v.calculated_price?.calculated_amount,      // TODO: verify field name
    currencyCode: v.calculated_price?.currency_code,
  }));

  return prices;
}
```

### Set region on a cart

The region must be set when creating the cart, or updated before checkout:

```bash
curl -X POST http://localhost:9000/store/carts/cart_01ABCDEF... \
  -H "Content-Type: application/json" \
  -H "x-publishable-api-key: pk_01ABCDEF..." \
  -d '{ "region_id": "reg_01ABCDEF..." }'
```

> **Note:** Changing the cart's region recalculates all prices. If the new region uses
> a different currency, the customer may need to re-enter payment information.

---

## 7. Notes on Atomicity

Medusa's multi-step API flows are not wrapped in a single database transaction from the
client's perspective. If a step fails midway through a checkout, the client must handle
partial state.

**Recovery strategies by failure point:**

| Failed step | Recovery action |
|---|---|
| `POST /line-items` fails | Retry the add. The cart remains valid. |
| `POST /shipping-methods` fails | Retry. Cart state is unchanged. |
| `POST /payment-sessions` fails | Retry. Clean up any orphaned sessions if provider created one. |
| `POST /complete` returns non-200 | Check `GET /store/carts/:id`. If `completed_at` is set, an order was created. Do not retry. |
| `POST /complete` times out | Retry with the same idempotency key. Query the cart status first. |

**General rule:**

- After any unexpected error, **query the resource state** before deciding to retry.
- Use idempotency keys on the retry (see [Idempotency & Retries](./api-idempotency-retries)).
- Do not issue compensating calls (e.g., deleting a partially created cart) unless you
  are certain the resource exists and the customer's intent has changed.

---

## 8. Troubleshooting

### Stale cart state

**Symptom:** Client-side cart totals do not match what the server returns.

**Cause:** Cart totals are recalculated server-side on every mutation. Locally cached
cart objects become stale after any change.

**Fix:** After every mutating call (`POST`, `DELETE`), replace the local cart state
with the cart returned in the response body. Never compute totals client-side from
stored line item prices.

---

### Payment provider errors

**Symptom:** `POST /store/carts/:id/complete` returns a `500` with a payment provider
error message.

**Cause:** The payment provider (e.g., Stripe) rejected the charge after Medusa called
it during cart completion. Common causes: expired card, insufficient funds, 3DS
challenge not completed.

**Fix:**
1. Read the `message` field in the error response body for the provider error detail.
2. Do not retry `complete` for a card error; present the error to the customer and
   prompt them to update their payment method via the provider's client SDK.
3. After updating the payment method, call `POST /store/carts/:id/payment-sessions`
   again with the updated provider data, then retry `complete`.

---

### Shipping calculation failures

**Symptom:** `POST /store/carts/:id/shipping-methods` returns a `400` or `422` with a
message about no available shipping options.

**Cause:** No shipping option covers the cart's destination address, region, or item
weight. Common when address is set after filtering shipping options.

**Fix:**
1. Ensure the cart has a shipping address set before fetching shipping options.
2. Re-fetch shipping options after any address change: `GET /store/shipping-options?cart_id=...`.
3. Verify that the store's shipping options are configured in the admin panel for the
   relevant region and fulfillment provider.

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
