---
id: customer-notes-api
title: Customer Notes API
sidebar_label: Customer Notes
sidebar_position: 13
---

# Customer Notes API

The Customer Notes API allows administrators to attach internal notes to customer records. This is useful for recording support interactions, account history, follow-up reminders, and other context that should not be exposed to storefront consumers.

**Base URL:** `http://localhost:9000/admin`

**Authentication:** All endpoints require admin JWT authentication. See [Authentication](./api-authentication.md).

---

## Overview

Notes are created through the Note module (`Modules.NOTE`) and associated with customer records via the `resource_type: "customer"` field. Each note tracks:

- The note content (`body`)
- The author who created it (`author_id`)
- Internal visibility flag (`is_internal`)
- Arbitrary metadata key-value pairs
- Creation and update timestamps

Notes are intended for internal use only. They do not appear in Store API responses and are not visible to customers through storefront interfaces.

---

## List Customer Notes

Retrieve all notes for a specific customer with pagination, search, and author filtering.

### Endpoint

````http
GET /admin/customers/:id/notes
````

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Customer ID |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | no | 50 | Number of notes per page (max 100) |
| `offset` | number | no | 0 | Pagination offset |
| `q` | string | no | - | Search query to filter notes by content |
| `author_id` | string or string[] | no | - | Filter by one or more author IDs |

### Example Request

````bash
curl "http://localhost:9000/admin/customers/cus_01ABCDEF.../notes?limit=20&offset=0" \
  -H "Authorization: Bearer <admin_jwt>"
````

### Example Request with Filters

````bash
# Search for notes containing "refund"
curl "http://localhost:9000/admin/customers/cus_01ABCDEF.../notes?q=refund" \
  -H "Authorization: Bearer <admin_jwt>"

# Filter by specific author
curl "http://localhost:9000/admin/customers/cus_01ABCDEF.../notes?author_id=user_01ABC..." \
  -H "Authorization: Bearer <admin_jwt>"

# Filter by multiple authors
curl "http://localhost:9000/admin/customers/cus_01ABCDEF.../notes?author_id[]=user_01ABC...&author_id[]=user_02DEF..." \
  -H "Authorization: Bearer <admin_jwt>"
````

### Response (200 OK)

````json
{
  "notes": [
    {
      "id": "note_01ABCDEF...",
      "customer_id": "cus_01ABCDEF...",
      "body": "Customer requested expedited shipping on next order",
      "is_internal": true,
      "author_id": "user_01ABCDEF...",
      "metadata": {
        "priority": "high",
        "category": "shipping"
      },
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "note_01GHIJKL...",
      "customer_id": "cus_01ABCDEF...",
      "body": "Processed refund for order #1042",
      "is_internal": true,
      "author_id": "user_02GHIJKL...",
      "metadata": {
        "order_id": "order_01XYZ...",
        "refund_amount": 5000
      },
      "created_at": "2024-01-10T14:22:00.000Z",
      "updated_at": "2024-01-10T14:22:00.000Z"
    }
  ],
  "count": 2,
  "offset": 0,
  "limit": 20
}
````

### JavaScript Example

````javascript
async function listCustomerNotes(customerId, adminToken, options = {}) {
  const { limit = 20, offset = 0, q, author_id } = options

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  if (q) params.set("q", q)
  if (author_id) {
    if (Array.isArray(author_id)) {
      author_id.forEach(id => params.append("author_id[]", id))
    } else {
      params.set("author_id", author_id)
    }
  }

  const response = await fetch(
    `http://localhost:9000/admin/customers/${customerId}/notes?${params}`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to list notes: ${error.message}`)
  }

  return response.json() // { notes, count, offset, limit }
}
````

---

## Create Customer Note

Add a new note to a customer record.

### Endpoint

````http
POST /admin/customers/:id/notes
````

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Customer ID |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `body` | string | yes | Note content (1-5000 characters) |
| `is_internal` | boolean | no | Internal-only flag (default: `true`) |
| `metadata` | object | no | Arbitrary key-value pairs |

### Validation Rules

- `body` must be a non-empty string between 1 and 5000 characters
- `is_internal` defaults to `true` if not provided
- `metadata` must be a valid JSON object (if provided)

### Example Request

````bash
curl -X POST "http://localhost:9000/admin/customers/cus_01ABCDEF.../notes" \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Customer reported issue with product quality. Offered replacement.",
    "is_internal": true,
    "metadata": {
      "category": "support",
      "priority": "medium",
      "ticket_id": "TKT-12345"
    }
  }'
````

### Response (201 Created)

````json
{
  "note": {
    "id": "note_01NEWID...",
    "customer_id": "cus_01ABCDEF...",
    "body": "Customer reported issue with product quality. Offered replacement.",
    "is_internal": true,
    "author_id": "user_01ABCDEF...",
    "metadata": {
      "category": "support",
      "priority": "medium",
      "ticket_id": "TKT-12345"
    },
    "created_at": "2024-01-15T16:45:00.000Z",
    "updated_at": "2024-01-15T16:45:00.000Z"
  }
}
````

### JavaScript Example

````javascript
async function createCustomerNote(customerId, noteData, adminToken) {
  const response = await fetch(
    `http://localhost:9000/admin/customers/${customerId}/notes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noteData),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to create note: ${error.message}`)
  }

  return response.json() // { note }
}

// Usage
const note = await createCustomerNote(
  "cus_01ABCDEF...",
  {
    body: "Upgraded to premium tier",
    metadata: { tier: "premium", upgrade_date: "2024-01-15" },
  },
  adminToken
)
````

---

## Common Use Cases

### Support Ticket Integration

Record support interactions on customer records:

````javascript
async function logSupportInteraction(customerId, ticketData, adminToken) {
  return createCustomerNote(
    customerId,
    {
      body: `Support ticket ${ticketData.ticketId}: ${ticketData.summary}`,
      metadata: {
        ticket_id: ticketData.ticketId,
        category: ticketData.category,
        resolved: ticketData.resolved,
        resolution_time: ticketData.resolutionTime,
      },
    },
    adminToken
  )
}
````

### Follow-up Reminders

Create notes for follow-up actions:

````javascript
async function addFollowUpReminder(customerId, reminderText, dueDate, adminToken) {
  return createCustomerNote(
    customerId,
    {
      body: reminderText,
      metadata: {
        category: "follow_up",
        due_date: dueDate,
        completed: false,
      },
    },
    adminToken
  )
}
````

### Account History Tracking

Log significant account events:

````javascript
async function logAccountEvent(customerId, event, adminToken) {
  return createCustomerNote(
    customerId,
    {
      body: event.description,
      metadata: {
        event_type: event.type,
        timestamp: event.timestamp,
        previous_value: event.previousValue,
        new_value: event.newValue,
      },
    },
    adminToken
  )
}

// Usage
await logAccountEvent(
  "cus_01ABCDEF...",
  {
    type: "tier_upgrade",
    description: "Customer upgraded from standard to premium tier",
    timestamp: new Date().toISOString(),
    previousValue: "standard",
    newValue: "premium",
  },
  adminToken
)
````

---

## Error Responses

### 401 Unauthorized

Missing or invalid admin authentication token.

````json
{
  "message": "Unauthorized",
  "type": "not_allowed"
}
````

### 404 Not Found

Customer with the specified ID does not exist.

````json
{
  "message": "Customer with id: cus_01ABCDEF... was not found",
  "type": "not_found"
}
````

### 422 Unprocessable Entity

Request body validation failed.

````json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "body",
      "message": "body must be between 1 and 5000 characters"
    }
  ]
}
````

---

## Implementation Details

### Author Tracking

The `author_id` field is automatically populated from the authenticated admin user's actor ID (`req.auth_context.actor_id`). You cannot override this value in the request body.

### Internal Visibility

The `is_internal` field defaults to `true`. This flag is intended for future use to distinguish between internal notes and notes that may be visible to other users (e.g., shared team notes). Currently, all notes are treated as internal.

### Metadata Flexibility

The `metadata` field accepts any valid JSON object. Use it to store structured data specific to your use case:

- CRM system IDs
- Workflow states
- Custom categorization
- Related resource references
- Integration-specific fields

---

## Troubleshooting

### Notes not appearing after creation

**Cause:** The note was created but the list request is not fetching it.

**Fix:** Ensure the list request does not have filters that exclude the new note. Try listing without filters:

````bash
curl "http://localhost:9000/admin/customers/cus_01ABCDEF.../notes?limit=1&offset=0" \
  -H "Authorization: Bearer <admin_jwt>"
````

### Author ID shows as system user

**Cause:** The authenticated admin user's actor ID was not correctly resolved.

**Fix:** Verify the admin JWT token is valid and contains the correct user claims. Refresh the token if necessary.

### Validation error on metadata field

**Cause:** The `metadata` value is not a valid JSON object.

**Fix:** Ensure `metadata` is an object, not a string or array:

````javascript
// Correct
{ metadata: { key: "value" } }

// Incorrect
{ metadata: "string" }
{ metadata: ["array"] }
````
