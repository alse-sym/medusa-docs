---
id: api-idempotency-retries
title: API Idempotency and Retry Strategy
sidebar_label: Idempotency & Retries
sidebar_position: 11
---

# API Idempotency and Retry Strategy

This document covers idempotency patterns, retry strategies, and client-side deduplication
for integrating with the Medusa REST API. Follow these practices to prevent duplicate
charges, double orders, and other side effects caused by retried or replayed requests.

---

## 1. Why Idempotency Matters in Commerce

Commerce operations are not simple reads. A single user action can trigger:

- A payment charge to a card
- An order record written to the database
- Inventory reservations
- Fulfillment tasks dispatched to a 3PL
- Email notifications sent to a customer

Network conditions are unreliable. A client that times out after 30 seconds does not
know whether the server processed the request before or after the timeout. Without
idempotency controls, retrying the same `POST /store/carts/:id/complete` call could
create two orders from one cart.

**Concrete failure scenarios:**

| Scenario | Risk without idempotency |
|---|---|
| Network timeout on order placement | Duplicate order + double charge |
| 503 from a payment provider proxy | Payment captured, order not recorded |
| Browser tab refreshed mid-checkout | Second order submission |
| Automated retry on 500 response | Resource created twice |

---

## 2. Idempotency Keys: The `Idempotency-Key` Header

An idempotency key is a client-generated unique string sent as a request header. The
server uses it to detect duplicate submissions and return the cached response from the
first successful execution instead of re-running the operation.

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

**How a server-side idempotency cache works (general pattern):**

1. Client sends `POST` with `Idempotency-Key: <uuid>`.
2. Server checks a key-value store for the key.
3. If the key is **not found**: execute the operation, store the response under the key
   with a TTL (typically 24 hours), return the response.
4. If the key is **found**: return the stored response immediately without re-executing.
5. If the key is **in-flight** (another request is already processing it): return `409
   Conflict` or wait and return the result.

> **TODO: verify** - As of the time of writing it is not confirmed whether Medusa's
> core REST API natively processes the `Idempotency-Key` header and stores responses.
> Check the Medusa changelog and the `@medusajs/medusa` server source for
> `IdempotencyKeyService` or equivalent middleware. If native support is absent,
> implement idempotency at the infrastructure layer (e.g., an API gateway or a
> custom Medusa middleware) or rely on client-side deduplication (see Section 7).

**Scope of idempotency keys:**

- Keys should be scoped per operation. Do not reuse the same key for different
  endpoints.
- Keys must be unique per customer/session. Two different customers placing orders at
  the same time must have different keys.
- Keys are safe to store client-side (localStorage, session state) for the duration of
  the checkout flow.

---

## 3. Which Operations Need Idempotency

Apply idempotency controls to all **non-idempotent state-changing** operations:

| Endpoint | Method | Risk |
|---|---|---|
| `POST /store/carts` | POST | Duplicate cart |
| `POST /store/carts/:id/line-items` | POST | Duplicate line item |
| `POST /store/carts/:id/complete` | POST | **Double order / charge** |
| `POST /store/payment-sessions` | POST | Double payment session |
| `POST /admin/orders/:id/fulfillments` | POST | Double fulfillment |
| `POST /admin/orders/:id/refunds` | POST | Double refund |
| `POST /admin/products` | POST | Duplicate product |
| `POST /store/customers` | POST | Duplicate customer account |

**Safe to retry without idempotency keys:**

- `GET` requests (reads are inherently idempotent)
- `DELETE` requests (deleting a resource that no longer exists is a no-op or 404)
- `PUT`/`PATCH` with the same payload (overwriting with the same data is idempotent)

---

## 4. Generating Idempotency Keys

Use **UUID v4** as the standard format for idempotency keys. UUID v4 provides 122 bits
of randomness, making collisions practically impossible.

**Browser / Node.js (native `crypto`, Node 15+ / modern browsers):**

```javascript
function generateIdempotencyKey() {
  return crypto.randomUUID(); // returns e.g. "550e8400-e29b-41d4-a716-446655440000"
}
```

**Node.js < 15 or environments without `crypto.randomUUID`:**

```javascript
const { v4: uuidv4 } = require('uuid'); // npm install uuid

function generateIdempotencyKey() {
  return uuidv4();
}
```

**Key storage strategy for checkout flows:**

```javascript
// Store the key for the lifetime of a single checkout attempt.
// Regenerate only when starting a fresh attempt (new cart or explicit retry by user).
function getOrCreateCheckoutKey(cartId) {
  const storageKey = `idempotency_key_${cartId}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}

function clearCheckoutKey(cartId) {
  sessionStorage.removeItem(`idempotency_key_${cartId}`);
}
```

---

## 5. Retry Strategy

### When to Retry

Not all errors are worth retrying. Retrying a client error wastes resources and can
cause confusion.

| HTTP Status | Category | Retry? | Reason |
|---|---|---|---|
| Network error / timeout | Network | Yes | Transient; request may not have reached server |
| `429 Too Many Requests` | Rate limit | Yes, with backoff | Server is overwhelmed; back off and retry |
| `500 Internal Server Error` | Server error | Yes, with caution | May be transient; check response body |
| `503 Service Unavailable` | Server error | Yes | Server is temporarily down |
| `504 Gateway Timeout` | Network | Yes | Upstream timed out |
| `400 Bad Request` | Client error | No | Fix the request payload |
| `401 Unauthorized` | Auth error | No (re-auth first) | Token expired; refresh token then retry |
| `403 Forbidden` | Auth error | No | Insufficient permissions |
| `404 Not Found` | Client error | No | Resource does not exist |
| `409 Conflict` | Conflict | No | Duplicate detected; do not retry with same key |
| `422 Unprocessable Entity` | Validation | No | Fix the request payload |

### Exponential Backoff with Jitter

Exponential backoff reduces retry storms by spacing out retries. Adding random jitter
prevents thundering herd problems when many clients retry simultaneously.

**Algorithm:**

```
delay = min(base_delay * 2^attempt, max_delay) + random_jitter
```

**JavaScript implementation:**

```javascript
/**
 * Retry a function with exponential backoff and full jitter.
 *
 * @param {() => Promise<Response>} fn - Async function that returns a fetch Response.
 * @param {object} options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 4).
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 200).
 * @param {number} options.maxDelayMs - Maximum delay cap in milliseconds (default: 10000).
 * @returns {Promise<Response>}
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 4,
    baseDelayMs = 200,
    maxDelayMs = 10_000,
  } = options;

  const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;

    try {
      response = await fn();
    } catch (networkError) {
      // Network-level error (no response received).
      if (attempt === maxRetries) throw networkError;
      const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      console.warn(`Network error on attempt ${attempt + 1}. Retrying in ${delay}ms.`);
      await sleep(delay);
      continue;
    }

    if (response.ok) return response;

    if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxRetries) {
      return response; // Caller handles non-retryable errors.
    }

    // Honor Retry-After header if present (common on 429 responses).
    const retryAfterHeader = response.headers.get('Retry-After');
    const delay = retryAfterHeader
      ? parseRetryAfter(retryAfterHeader)
      : computeBackoff(attempt, baseDelayMs, maxDelayMs);

    console.warn(
      `HTTP ${response.status} on attempt ${attempt + 1}. Retrying in ${delay}ms.`
    );
    await sleep(delay);
  }
}

function computeBackoff(attempt, baseDelayMs, maxDelayMs) {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  // Full jitter: uniform random between 0 and the capped delay.
  return Math.floor(Math.random() * capped);
}

function parseRetryAfter(headerValue) {
  const seconds = parseInt(headerValue, 10);
  return isNaN(seconds) ? 1000 : seconds * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Recommended Limits

| Parameter | Recommended value | Notes |
|---|---|---|
| `maxRetries` | 4 | Adjust lower for user-facing flows to avoid long waits |
| `baseDelayMs` | 200 ms | First retry is nearly immediate |
| `maxDelayMs` | 10,000 ms | Never wait longer than 10 seconds between retries |
| Total timeout | 60 seconds | Set an `AbortController` deadline on the outer call |

---

## 6. Idempotency with Medusa Workflows

Medusa v2 introduces the **Workflows** system, which models multi-step operations as
directed acyclic graphs of steps. Each step declares compensation logic (a rollback
handler). If a step fails mid-execution, Medusa automatically runs the compensation
handlers for all previously completed steps in reverse order.

This means that Medusa Workflows provide **transactional semantics** for complex
operations like order placement:

```
Step 1: Reserve inventory  ->  Compensation: Release reservation
Step 2: Capture payment    ->  Compensation: Void/refund payment
Step 3: Create order       ->  Compensation: Cancel order
Step 4: Trigger fulfillment
```

If Step 3 fails after Step 2 has already captured payment, the compensation for Step 2
automatically voids the charge.

**Implications for retry strategy:**

- When calling an endpoint backed by a Medusa Workflow, a failed request that returned
  an error (not a timeout) is safe to retry because the compensation already rolled
  back any partial state.
- A timed-out request is ambiguous: the workflow may have completed successfully
  before the response was lost. Use an idempotency key on the retry so the server
  can detect the duplicate.
- Do not manually reverse partial state from the client side when using Workflows.
  Trust the compensation mechanism.

> **TODO: verify** - Confirm which Medusa v2 endpoints are backed by Workflows vs.
> direct service calls, and whether Workflow execution IDs are exposed in responses
> for use as idempotency handles.

---

## 7. Client-Side Deduplication

Idempotency keys handle server-side deduplication. Client-side deduplication prevents
sending duplicate requests in the first place.

**UI patterns to prevent duplicate submissions:**

```javascript
class SubmitGuard {
  constructor() {
    this._inFlight = new Set();
  }

  /**
   * Prevent duplicate submissions for the same key.
   * Returns false if a request with this key is already in flight.
   */
  tryAcquire(key) {
    if (this._inFlight.has(key)) return false;
    this._inFlight.add(key);
    return true;
  }

  release(key) {
    this._inFlight.delete(key);
  }
}

const submitGuard = new SubmitGuard();

async function handlePlaceOrder(cartId) {
  if (!submitGuard.tryAcquire(cartId)) {
    console.log('Order placement already in progress.');
    return;
  }
  try {
    await placeOrder(cartId);
  } finally {
    submitGuard.release(cartId);
  }
}
```

**React hook pattern:**

```typescript
import { useState, useRef } from 'react';

function useSingleFlight<T>() {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function run(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return { run, loading };
}
```

---

## 8. Full JavaScript Example: Retry + Idempotency Key

This is a complete, production-ready function for placing an order with retry logic and
an idempotency key.

```javascript
const MEDUSA_BASE_URL = 'http://localhost:9000';

/**
 * Complete a Medusa cart with retry and idempotency.
 *
 * @param {string} cartId - The cart ID to complete.
 * @param {string} publishableApiKey - Medusa publishable API key.
 * @returns {Promise<object>} The placed order data.
 */
async function completeCartWithRetry(cartId, publishableApiKey) {
  // Retrieve or create a stable idempotency key for this cart completion attempt.
  const idempotencyKey = getOrCreateCheckoutKey(cartId);

  const response = await withRetry(
    () =>
      fetch(`${MEDUSA_BASE_URL}/store/carts/${cartId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-publishable-api-key': publishableApiKey,
          'Idempotency-Key': idempotencyKey, // TODO: verify Medusa honors this header
        },
      }),
    { maxRetries: 3, baseDelayMs: 300, maxDelayMs: 8000 }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Order placement failed (${response.status}): ${error.message}`);
  }

  const data = await response.json();

  // Clear the idempotency key only after confirmed success.
  clearCheckoutKey(cartId);

  return data.order; // { id, status, total, ... }
}
```

---

## 9. Troubleshooting

### Duplicate resources created despite idempotency key

**Symptom:** Two orders appear in the admin panel for a single cart completion attempt.

**Cause:** The server either does not enforce idempotency keys, or two requests arrived
with different keys (e.g., a new key was generated on the retry).

**Fix:**
1. Verify that `Idempotency-Key` is supported by the Medusa version in use (TODO: verify).
2. Ensure the key stored in `sessionStorage` is retrieved on retry, not regenerated.
3. Add a unique constraint at the database level (e.g., unique index on `cart_id` in
   the orders table) as a defense-in-depth measure.
4. Log idempotency keys on both client and server to correlate duplicate requests.

---

### Retry storms

**Symptom:** After a service degradation, a flood of retried requests overwhelms the
server when it recovers.

**Cause:** All clients back off for the same duration and retry simultaneously
(thundering herd).

**Fix:**
1. Ensure jitter is enabled in the backoff function (`computeBackoff` above uses full
   jitter by default).
2. Honor the `Retry-After` header returned on `429` and `503` responses.
3. Use a circuit breaker pattern: after N consecutive failures, stop retrying entirely
   and display an error to the user for a cooldown period.

---

### 409 Conflict on replay

**Symptom:** A retried request returns `409 Conflict` with a message indicating the
resource already exists.

**Cause:** The first request succeeded, but the client did not receive the response.
The server-side idempotency cache correctly detected the duplicate and returned 409
instead of re-executing (or the server has a unique constraint violation, not an
idempotency cache hit).

**Fix:**
1. If the `409` body includes an `existing_resource_id` or similar field, use that ID
   to continue the flow rather than treating it as a fatal error.
2. In checkout flows, query `GET /store/carts/:id` after a `409` to check current cart
   status before deciding to retry or proceed.
3. Distinguish between "idempotency cache hit" (safe to use the cached response) and
   "genuine conflict" (e.g., username already taken) by examining the error `type` or
   `code` field in the response body.

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
