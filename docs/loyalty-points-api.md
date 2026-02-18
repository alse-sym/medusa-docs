---
id: loyalty-points-api
title: Loyalty Points API
sidebar_label: Loyalty Points
sidebar_position: 13
---

# Loyalty Points API

The Loyalty Points API enables merchants to manage customer loyalty point balances through the Admin API. This feature allows you to reward customers, adjust balances, and track point adjustment history.

---

## Overview

Loyalty points are a common retention mechanism in e-commerce. Medusa's loyalty system provides:

- **Point adjustments**: Add or subtract points from customer balances
- **Audit trail**: Track all point adjustments with optional reason codes
- **History retrieval**: Query recent adjustment history for reporting

**Authentication**: All loyalty endpoints require Admin API authentication. See [API Authentication](./api-authentication.md) for details.

---

## Adjust Customer Points

Adjust a customer's loyalty point balance by a positive or negative delta.

### Endpoint

```
POST /admin/loyalty/points/adjust
```

### Request Headers

```
Authorization: Bearer {admin_jwt_token}
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | string | Yes | The ID of the customer whose balance to adjust |
| `delta` | number | Yes | The amount to add (positive) or subtract (negative) from the balance |
| `reason` | string | No | Optional reason code or description for the adjustment |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include_history` | boolean | `false` | When `true`, includes the last 20 point adjustments in the response |

**Example Request (Basic):**

```bash
curl -X POST http://localhost:9000/admin/loyalty/points/adjust \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cus_01ABCDEF...",
    "delta": 100,
    "reason": "Welcome bonus"
  }'
```

**Example Request (With History):**

```bash
curl -X POST "http://localhost:9000/admin/loyalty/points/adjust?include_history=true" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cus_01ABCDEF...",
    "delta": -50,
    "reason": "Redeemed for discount"
  }'
```

### Response

#### Basic Response (200 OK)

```json
{
  "id": "adj_01ABCDEF...",
  "customer_id": "cus_01ABCDEF...",
  "balance_after": 150,
  "updated_at": "2026-02-18T12:34:56.789Z"
}
```

#### Response with History (200 OK)

When `include_history=true` is specified, the response includes a `history` array with the most recent adjustments:

```json
{
  "id": "adj_01ABCDEF...",
  "customer_id": "cus_01ABCDEF...",
  "balance_after": 100,
  "updated_at": "2026-02-18T12:34:56.789Z",
  "history": [
    {
      "id": "adj_01ABCDEF...",
      "delta": -50,
      "reason": "Redeemed for discount",
      "balance_after": 100,
      "created_at": "2026-02-18T12:34:56.789Z"
    },
    {
      "id": "adj_01XYZABC...",
      "delta": 100,
      "reason": "Welcome bonus",
      "balance_after": 150,
      "created_at": "2026-02-15T10:20:30.456Z"
    },
    {
      "id": "adj_01QWERTY...",
      "delta": 50,
      "reason": "Order completion",
      "balance_after": 50,
      "created_at": "2026-02-10T08:15:22.123Z"
    }
  ]
}
```

**History Notes:**
- The `history` array is capped at the last 20 adjustments
- Adjustments are ordered by creation date (most recent first)
- The current adjustment is included at the beginning of the history array

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for this adjustment |
| `customer_id` | string | The customer's ID |
| `balance_after` | number | The customer's point balance after this adjustment |
| `updated_at` | string | ISO 8601 timestamp of the adjustment |
| `history` | array | (Optional) Last 20 adjustments including the current one |

### Error Responses

**400 Bad Request** - Invalid input

```json
{
  "type": "invalid_data",
  "message": "delta must be a non-zero number"
}
```

**404 Not Found** - Customer not found

```json
{
  "type": "not_found",
  "message": "Customer with id: cus_01ABCDEF... was not found"
}
```

**401 Unauthorized** - Missing or invalid authentication

```json
{
  "type": "unauthorized",
  "message": "Authentication required"
}
```

See [API Errors](./api-errors.md) for complete error handling patterns.

---

## Implementation Notes

### Validation Rules

- `delta` must be a non-zero integer or decimal number
- `customer_id` must reference an existing customer
- `reason` is optional but recommended for audit purposes

### Authorization

Admin users require the `loyalty:write` permission scope to adjust point balances. This aligns with existing admin write patterns for sensitive operations.

### Idempotency

Point adjustments are **not** idempotent by design. Each POST request creates a new adjustment entry, even if parameters are identical. For idempotent operations, consider implementing an idempotency key pattern as described in [Idempotency and Retries](./api-idempotency-retries.md).

---

## Use Cases

### Welcome Bonus

Award points when a customer completes registration:

```javascript
async function awardWelcomeBonus(customerId, adminToken) {
  const response = await fetch('http://localhost:9000/admin/loyalty/points/adjust', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: customerId,
      delta: 100,
      reason: 'Welcome bonus',
    }),
  });

  const { balance_after } = await response.json();
  console.log(`Customer now has ${balance_after} points`);
}
```

### Point Redemption

Deduct points when applying a loyalty discount:

```javascript
async function redeemPoints(customerId, pointsToRedeem, adminToken) {
  const response = await fetch('http://localhost:9000/admin/loyalty/points/adjust', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: customerId,
      delta: -pointsToRedeem,
      reason: `Redeemed for order discount`,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to redeem points');
  }

  return await response.json();
}
```

### Balance Inquiry with History

Check a customer's current balance and recent activity:

```javascript
async function getBalanceWithHistory(customerId, adminToken) {
  // Make a zero-delta adjustment to query current state
  // Or implement a dedicated GET endpoint for production use
  const response = await fetch(
    'http://localhost:9000/admin/loyalty/points/adjust?include_history=true',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_id: customerId,
        delta: 0.01,  // Minimal adjustment to query state
        reason: 'Balance inquiry',
      }),
    }
  );

  const { balance_after, history } = await response.json();
  return { balance: balance_after, recentActivity: history };
}
```

> **Note**: For production implementations, consider adding a dedicated `GET /admin/loyalty/points/:customer_id` endpoint for non-mutating balance queries.

---

## Migration Notes

### Version 2 Changes

**Added in v2:**
- `include_history` query parameter for retrieving adjustment history
- History is capped at 20 most recent adjustments

**Backward Compatibility:**
- The `include_history` parameter is optional and defaults to `false`
- Existing integrations continue to work without modification
- Response structure remains unchanged when `include_history` is omitted

---

## Related Resources

- [API Authentication](./api-authentication.md) - Obtaining admin JWT tokens
- [API Errors](./api-errors.md) - Error handling patterns
- [API Reference Patterns](./api-reference-patterns.md) - Additional integration examples
