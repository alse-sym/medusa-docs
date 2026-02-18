---
id: webhooks-events
title: Webhooks and Events
sidebar_label: Webhooks & Events
sidebar_position: 13
---

# Webhooks and Events

This document covers Medusa's internal event system and how to use it to build
subscribers, emit outbound webhooks to external systems, and receive inbound webhooks
from payment providers.

---

## 1. Overview: Medusa's Event System

Medusa uses a **publish/subscribe (pub/sub) event bus** to decouple modules. When a
service completes an operation (e.g., an order is placed), it emits a named event. Any
number of **subscribers** can listen for that event and react asynchronously.

The event bus is backed by **Redis** using the `@medusajs/event-bus-redis` module
(recommended for production). A local in-memory bus is available for development and
testing.

**Architecture overview:**

```
[Service Layer]
     |
     | emits event (e.g., "order.placed")
     v
[Event Bus (Redis pub/sub)]
     |
     +---> [Subscriber A: Send confirmation email]
     |
     +---> [Subscriber B: Update analytics]
     |
     +---> [Subscriber C: Push webhook to external system]
```

---

## 2. How Events Work

1. **Emission:** A Medusa service calls `eventBusService.emit(eventName, data)` after
   completing an operation. The event bus serializes the event and publishes it to Redis.

2. **Subscription:** Subscribers are classes that declare which events they handle.
   Medusa registers them automatically at startup.

3. **Delivery:** The event bus delivers the event payload to each registered subscriber.
   Delivery is **at-least-once** - a subscriber may receive the same event more than
   once (see Section 7 on reliability).

4. **Outbound webhooks:** Webhooks to external systems are implemented as subscribers
   that make HTTP calls (see Section 5).

5. **Inbound webhooks:** External providers (e.g., Stripe) send HTTP POST requests to
   dedicated Medusa endpoints. Medusa validates the payload and emits internal events
   accordingly (see Section 6).

---

## 3. Configuring Event Subscribers in Medusa

Subscribers are TypeScript classes placed in `src/subscribers/`. Medusa discovers and
registers them automatically.

**TypeScript subscriber template:**

```typescript
// src/subscribers/order-placed.ts
import {
  type SubscriberConfig,
  type SubscriberArgs,
} from "@medusajs/framework";

// The handler function receives the event data and a container for dependency injection.
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger");
  const orderId = data.id;

  logger.info(`Order placed subscriber triggered for order: ${orderId}`);

  // Resolve a service from the container.
  // const notificationService = container.resolve("notificationService");
  // await notificationService.send("order_confirmation", { orderId });
}

// The config object tells Medusa which event(s) this subscriber handles.
export const config: SubscriberConfig = {
  event: "order.placed",
  // context: { subscriberId: "order-placed-handler" } // optional, used for idempotency
};
```

> **TODO: verify** - The exact import paths for `SubscriberConfig` and `SubscriberArgs`
> may differ between Medusa v1 and v2. Confirm against the installed
> `@medusajs/framework` or `@medusajs/medusa` version.

**Subscribing to multiple events from one file:**

```typescript
// src/subscribers/product-sync.ts
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";

export default async function productSyncHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger");
  logger.info(`Product event received: ${event.name}, id: ${event.data.id}`);
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
};
```

---

## 4. Core Event Catalog

> **TODO: verify complete event list and payload shapes** - The table below lists
> commonly documented events. Confirm names and payload fields against the Medusa
> source code or official changelog for your version.

| Event Name | Module | Description | Payload Shape |
|---|---|---|---|
| `product.created` | Product | A new product was created | `{ id: string }` |
| `product.updated` | Product | A product was updated | `{ id: string, fields: string[] }` |
| `product.deleted` | Product | A product was deleted | `{ id: string }` |
| `order.placed` | Order | A cart was completed and an order created | `{ id: string }` |
| `order.fulfillment_created` | Order | A fulfillment was created for an order | `{ id: string, fulfillment_id: string }` |
| `order.canceled` | Order | An order was canceled | `{ id: string }` |
| `order.shipment_created` | Order | A shipment was created (tracking added) | `{ id: string, fulfillment_id: string }` |
| `customer.created` | Customer | A new customer registered | `{ id: string }` |
| `payment.captured` | Payment | A payment was successfully captured | `{ id: string }` |
| `payment.refunded` | Payment | A payment was refunded | `{ id: string }` |
| `inventory.updated` | Inventory | Inventory level changed for an item | `{ id: string, location_id: string }` |

**Notes on payload shapes:**

- Most event payloads contain only an `id` field. Subscribers should load the full
  resource via the appropriate service rather than relying on the payload alone. This
  avoids stale-data issues when an event is processed after a delay.
- The `fields` array on `product.updated` (if present) indicates which fields changed.
  Use it for selective cache invalidation.

---

## 5. Outbound Webhooks: Sending Events to External Systems

Outbound webhooks are implemented as subscribers that make HTTP calls when a Medusa
event fires.

### Basic outbound webhook subscriber

```typescript
// src/subscribers/outbound-webhook.ts
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
import crypto from "node:crypto";

const WEBHOOK_URL = process.env.WEBHOOK_ENDPOINT_URL!;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

export default async function outboundWebhookHandler({
  event,
  container,
}: SubscriberArgs<unknown>) {
  const logger = container.resolve("logger");

  const payload = JSON.stringify({
    event: event.name,
    data: event.data,
    timestamp: new Date().toISOString(),
  });

  const signature = signPayload(payload, WEBHOOK_SECRET);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Medusa-Signature": signature,
      },
      body: payload,
    });

    if (!res.ok) {
      logger.warn(
        `Outbound webhook delivery failed: ${res.status} ${res.statusText}`
      );
    } else {
      logger.info(`Outbound webhook delivered: ${event.name}`);
    }
  } catch (err) {
    logger.error(`Outbound webhook error: ${(err as Error).message}`);
    // Decide whether to throw (triggers retry) or silently fail.
    throw err;
  }
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.canceled", "payment.captured", "payment.refunded"],
};
```

### Signing webhook payloads (HMAC-SHA256)

Signing allows the receiving system to verify that the webhook came from your Medusa
instance and was not tampered with.

```typescript
/**
 * Create an HMAC-SHA256 signature for the given payload string.
 * The receiving system verifies by computing the same HMAC and comparing.
 */
function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
}
```

**Verification on the receiving end (Node.js example):**

```javascript
const crypto = require("crypto");

function verifyWebhookSignature(rawBody, receivedSignature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Use timingSafeEqual to prevent timing attacks.
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(receivedSignature, "hex");

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Express middleware example:
app.post("/webhooks/medusa", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["x-medusa-signature"];
  if (!verifyWebhookSignature(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const event = JSON.parse(req.body.toString());
  // process event...
  res.json({ received: true });
});
```

---

## 6. Receiving Webhooks from Payment Providers

When payment providers like Stripe need to notify Medusa of asynchronous events
(e.g., payment confirmation, dispute creation), they POST to a Medusa-hosted endpoint.

**Typical flow:**

```
[Stripe] --POST /store/payment-collections/:id/sessions/:session_id/pay--> [Medusa]
[Stripe] --POST /hooks/payment/stripe--> [Medusa payment webhook endpoint]
```

> **TODO: verify** - The exact inbound webhook endpoint path for each payment provider
> plugin differs. Consult the documentation for `@medusajs/payment-stripe` or the
> provider plugin you are using.

**General principles:**

1. Medusa's payment provider plugins expose dedicated webhook endpoints (e.g.,
   `/hooks/payment/stripe`).
2. The plugin validates the provider's signature (Stripe uses `stripe-signature` header
   and the `stripe.webhooks.constructEvent()` SDK method).
3. On successful validation, the plugin updates the internal payment session and emits
   `payment.captured` or similar Medusa events.
4. Your subscribers then respond to those internal events.

**Registering your webhook URL in Stripe dashboard:**

- Set webhook URL to `https://your-medusa-backend.com/hooks/payment/stripe`.
- Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `charge.dispute.created`, etc.
- Copy the signing secret and set it in your Medusa environment as
  `STRIPE_WEBHOOK_SECRET` (or the env var specified by the plugin).

---

## 7. Reliability: At-Least-Once Delivery

The Redis-backed event bus provides **at-least-once delivery** semantics. This means:

- Every event is guaranteed to be delivered to every subscriber **at least once**.
- Under failure conditions (subscriber crash, Redis reconnect), an event **may be
  delivered more than once**.
- Subscribers must be designed to handle duplicate deliveries safely.

### Idempotent subscriber pattern

```typescript
// src/subscribers/idempotent-order-email.ts
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";

// Track processed event IDs to detect duplicates.
// In production, use a persistent store (Redis SET, database table) instead of in-memory.
const processedEventIds = new Set<string>();

export default async function idempotentOrderEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger");

  // Construct a deduplication key from the event name + data ID.
  const dedupKey = `${event.name}:${event.data.id}`;

  if (processedEventIds.has(dedupKey)) {
    logger.info(`Skipping duplicate event: ${dedupKey}`);
    return;
  }

  // Process the event.
  processedEventIds.add(dedupKey);
  logger.info(`Processing event: ${dedupKey}`);

  // ... send email, update external system, etc.
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
```

**Production recommendation:** Replace the in-memory `Set` with a Redis `SETNX`
(set-if-not-exists) call or a database upsert with a unique constraint on the
deduplication key. In-memory state is lost on process restart.

---

## 8. Full TypeScript Subscriber Example (Annotated)

This example sends an order confirmation email using a hypothetical notification service.

```typescript
// src/subscribers/order-confirmation-email.ts
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";

interface OrderPlacedPayload {
  id: string; // order ID
}

export default async function orderConfirmationEmailHandler({
  event: { data },   // destructure the event payload
  container,         // IoC container for resolving services
}: SubscriberArgs<OrderPlacedPayload>) {
  const logger = container.resolve("logger");

  // Resolve the Order service to load full order details.
  // TODO: verify exact service name for Medusa v2
  const orderService = container.resolve("orderService");

  let order: Record<string, unknown>;
  try {
    order = await orderService.retrieveOrder(data.id, {
      relations: ["items", "shipping_address", "customer"],
    });
  } catch (err) {
    logger.error(`Failed to retrieve order ${data.id}: ${(err as Error).message}`);
    throw err; // Re-throwing causes the event bus to retry delivery.
  }

  // Resolve a notification / mailer service.
  // const notificationService = container.resolve("notificationService");
  // await notificationService.send("order_confirmation", {
  //   to: order.customer.email,
  //   data: { order },
  // });

  logger.info(`Order confirmation email queued for order: ${data.id}`);
}

export const config: SubscriberConfig = {
  event: "order.placed",
  // Assign a stable subscriberId so Medusa can track delivery per subscriber.
  // context: { subscriberId: "order-confirmation-email" },
};
```

---

## 9. Testing Events Locally

### Trigger events manually via the Medusa CLI

> **TODO: verify** - Check if `medusa events` or similar CLI commands exist for
> manually triggering test events in the installed version.

### Using the event bus service directly in a script

```typescript
// scripts/test-event.ts - run with: npx ts-node scripts/test-event.ts
import { createMedusaApp } from "@medusajs/framework"; // TODO: verify import

async function main() {
  const { container } = await createMedusaApp();
  const eventBus = container.resolve("eventBusService");

  await eventBus.emit("order.placed", { id: "order_test_01" });

  console.log("Test event emitted.");
  process.exit(0);
}

main().catch(console.error);
```

### Inspecting Redis event queue

```bash
# Connect to the Redis instance used by Medusa
redis-cli -h 127.0.0.1 -p 6379

# List recent event keys (pattern depends on your Medusa/Bull configuration)
KEYS bull:*

# Monitor all Redis commands in real time (use during development only)
MONITOR
```

---

## 10. Troubleshooting

### Events not firing

**Symptom:** A subscriber is never called even after the triggering action completes.

**Cause:** The event bus module is not configured, or the subscriber file is not being
discovered.

**Fix:**
1. Verify that `@medusajs/event-bus-redis` (or `@medusajs/event-bus-local`) is
   installed and configured in `medusa-config.ts` under `modules`.
2. Confirm the subscriber file is in `src/subscribers/` and exports both a default
   function and a `config` object.
3. Rebuild the project (`npm run build`) and restart the server. TypeScript files must
   be compiled before Medusa can load them.
4. Check the server logs at startup for subscriber registration messages.

---

### Subscriber not receiving events

**Symptom:** The event bus is running, but a specific subscriber never executes.

**Cause:** The event name in `config.event` does not match the emitted event name
(case-sensitive), or the subscriber threw an unhandled error on a previous delivery and
was removed from the queue.

**Fix:**
1. Double-check the event name spelling. Event names are case-sensitive strings
   (e.g., `"order.placed"`, not `"Order.Placed"`).
2. Check the server logs for errors from the subscriber. An unhandled thrown error may
   cause the event to be dropped or retried depending on queue configuration.
3. Add a `try/catch` around the subscriber body and log errors explicitly before
   re-throwing if a retry is desired.

---

### Redis connection issues

**Symptom:** Server fails to start or events are not delivered. Logs show
`Redis connection refused` or `ECONNREFUSED 127.0.0.1:6379`.

**Cause:** The Redis server is not running, or the connection URL in `medusa-config.ts`
is incorrect.

**Fix:**
1. Start Redis: `redis-server` or `docker run -p 6379:6379 redis:7-alpine`.
2. Verify the Redis URL in environment variables: `REDIS_URL=redis://127.0.0.1:6379`.
3. Test connectivity: `redis-cli ping` should return `PONG`.
4. For Redis in a Docker network (e.g., Docker Compose), use the service name as the
   hostname: `redis://redis:6379`.

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
