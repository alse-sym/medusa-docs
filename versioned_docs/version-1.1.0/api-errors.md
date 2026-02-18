---
id: api-errors
title: API Errors
sidebar_label: API Errors
sidebar_position: 9
---

# API Errors

Medusa returns structured error responses whenever a request cannot be fulfilled. Understanding the error envelope and the set of HTTP status codes in use allows you to write defensive, resilient integrations.

---

## Error Response Structure

All error responses use a consistent JSON envelope. The exact shape is:

```json
{
  "type": "invalid_data",   // machine-readable error category (string)
  "message": "...",         // human-readable description of what went wrong
  "code": "..."             // optional: more granular error code (TODO: verify - may not always be present)
}
```

<!-- TODO: verify exact error envelope shape - confirm field names "type", "message", "code" are correct and stable across Medusa v2; some versions may use "error" instead of "message" or include additional fields -->

**Field definitions:**

| Field | Type | Always present | Description |
|-------|------|----------------|-------------|
| `type` | string | Yes | Machine-readable category (e.g., `invalid_data`, `unauthorized`, `not_found`) |
| `message` | string | Yes | Human-readable description suitable for logging |
| `code` | string | No | Granular sub-code for programmatic handling (TODO: verify presence and format) |

**cURL example showing an error response:**

```bash
# Attempt to access a non-existent product
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products/prod_doesnotexist" \
  | jq '.'
```

Response (`404 Not Found`):

```json
{
  "type": "not_found",           // use this field for programmatic branching
  "message": "Product with id: prod_doesnotexist was not found"
                                 // human-readable, do not parse this string
}
```

---

## HTTP Status Codes

Medusa uses the following HTTP status codes across its APIs:

| Status Code | Name | Common Causes |
|-------------|------|---------------|
| `200` | OK | Successful GET, PATCH, or DELETE |
| `201` | Created | Successful POST that created a new resource |
| `400` | Bad Request | Malformed JSON body, missing required fields, invalid parameter types |
| `401` | Unauthorized | Missing `Authorization` header, expired JWT, invalid token |
| `403` | Forbidden | Valid token but insufficient permissions (e.g., customer token used on admin route) |
| `404` | Not Found | Resource with the given ID does not exist |
| `409` | Conflict | Duplicate unique value (e.g., duplicate email on customer creation), state conflict |
| `422` | Unprocessable Entity | Request is well-formed but fails business-logic validation |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server-side error; check Medusa server logs |

### 400 Bad Request

Returned when the request itself is structurally invalid. Common triggers:

- Sending a non-JSON body with `Content-Type: application/json`
- Providing a value of the wrong type (e.g., a string where an integer is expected)
- Missing a required top-level field in the request body

### 401 Unauthorized

The request was not authenticated or the provided credentials/token are invalid. See [Authentication Troubleshooting](./api-authentication.md#troubleshooting) for detailed remediation steps.

### 403 Forbidden

The request was authenticated but the authenticated identity does not have permission to perform the requested action. This is distinct from `401`: the server knows who you are, but you do not have access.

### 404 Not Found

The resource identified by the URL does not exist. This includes:
- Incorrect resource ID in the URL path
- Resource that was deleted
- Typo in the endpoint path itself

### 409 Conflict

A uniqueness or state constraint was violated. Common triggers:
- Creating a customer with an email address that already exists
- Attempting a state transition that is not allowed from the current state (e.g., completing an already-cancelled order)

### 422 Unprocessable Entity

The request is syntactically valid JSON but fails validation. This status code is used for field-level validation errors. See the [Validation Errors](#validation-errors-422) section below for a detailed breakdown.

### 429 Too Many Requests

The client has exceeded the configured rate limit. The response may include a `Retry-After` header indicating how many seconds to wait before retrying.

<!-- TODO: verify whether Medusa includes Retry-After header on 429 responses -->

### 500 Internal Server Error

An unexpected error occurred on the server. Retrying the same request will usually produce the same result unless the underlying cause is transient (e.g., a temporary database connection issue). Always check the Medusa server logs (`console` output or your log aggregation system) when `500` errors appear in production.

---

## Error Handling Patterns

### Inspecting type vs message vs code

Use `type` for programmatic branching - it is stable and machine-readable. Do not parse `message` strings to make decisions; they can change between Medusa versions.

```typescript
async function handleApiResponse(response: Response): Promise<unknown> {
  if (response.ok) {
    return response.json();
  }

  const error = await response.json().catch(() => ({
    type: "unknown",
    message: `HTTP ${response.status} with non-JSON body`,
  }));

  switch (error.type) {
    case "not_found":
      // Safe to surface to the user; the resource simply does not exist
      throw new NotFoundError(error.message);

    case "unauthorized":
      // Trigger re-authentication flow
      throw new AuthenticationError(error.message);

    case "invalid_data":
    case "invalid_request_error":
      // Caller supplied bad data - do not retry
      throw new ValidationError(error.message, error.errors);

    default:
      // Unknown error type - log and surface generic message
      console.error("Unhandled Medusa API error:", error);
      throw new Error(`API error (${response.status}): ${error.message}`);
  }
}
```

### Defensive error parsing (TypeScript)

A production-grade error parser should guard against unexpected shapes:

```typescript
interface MedusaError {
  type: string;
  message: string;
  code?: string;
  errors?: ValidationFieldError[];
}

interface ValidationFieldError {
  field: string;           // the request body field that failed
  message: string;         // human-readable description of the failure
  // TODO: verify exact field-level error shape
}

function parseMedusaError(raw: unknown): MedusaError {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "message" in raw &&
    typeof (raw as Record<string, unknown>).message === "string"
  ) {
    return raw as MedusaError;
  }

  // Fallback for completely unexpected shapes
  return {
    type: "unknown",
    message: "An unexpected error occurred. Check server logs.",
  };
}

// Usage
async function safeAdminFetch(url: string, token: string): Promise<unknown> {
  let body: unknown;

  try {
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    body = await response.json();

    if (!response.ok) {
      const error = parseMedusaError(body);
      throw Object.assign(new Error(error.message), {
        type: error.type,
        code: error.code,
        status: response.status,
      });
    }

    return body;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("Server returned non-JSON response");
    }
    throw err;
  }
}
```

### When to retry vs when to surface to the user

| Status | Retry? | Notes |
|--------|--------|-------|
| `400` | No | Fix the request payload before retrying |
| `401` | After re-auth | Re-authenticate, then retry once |
| `403` | No | Permission issue; retrying will not help |
| `404` | No | The resource does not exist |
| `409` | No | Resolve the conflict (e.g., use a different email) |
| `422` | No | Fix validation errors in the payload |
| `429` | Yes (with backoff) | Wait for `Retry-After` seconds, then retry with exponential backoff |
| `500` | Conditionally | Retry up to 3 times with exponential backoff for transient failures |
| Network error / timeout | Yes (with backoff) | Implement exponential backoff with jitter |

---

## Validation Errors (422)

When a request body fails field-level validation, Medusa returns `422 Unprocessable Entity` with detailed per-field information.

Example: attempting to create a product with missing required fields:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "not_a_valid_status"}' \
  "http://localhost:9000/admin/products" \
  | jq '.'
```

Response:

```json
{
  "type": "invalid_data",           // or "validation_error" - TODO: verify exact type value
  "message": "Invalid request: check the errors field for details",
  "errors": [                       // array of per-field failures - TODO: verify "errors" field name and structure
    {
      "field": "title",             // the field path that failed (may use dot notation for nested fields)
      "message": "title is required"
    },
    {
      "field": "status",
      "message": "status must be one of: draft, proposed, published, rejected"
    }
  ]
}
```

<!-- TODO: verify exact validation error structure - Medusa v2 uses class-validator under the hood; the error shape may differ from the above -->

**Rendering validation errors in a UI:**

```typescript
function renderValidationErrors(errors: ValidationFieldError[]): void {
  for (const { field, message } of errors) {
    const input = document.querySelector(`[name="${field}"]`);
    if (input) {
      input.setAttribute("aria-invalid", "true");
      const hint = document.querySelector(`[data-error-for="${field}"]`);
      if (hint) hint.textContent = message;
    }
  }
}

// Usage after catching a 422 response
try {
  await createProduct(payload);
} catch (err) {
  if (err.status === 422 && Array.isArray(err.errors)) {
    renderValidationErrors(err.errors);
  }
}
```

---

## Handling Errors in JavaScript with fetch

A complete try/catch pattern with fetch, including typed errors:

```typescript
class MedusaApiError extends Error {
  constructor(
    public readonly type: string,
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: ValidationFieldError[]
  ) {
    super(message);
    this.name = "MedusaApiError";
  }
}

async function medusaFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (networkErr) {
    // No response received - network failure, DNS error, server down
    throw new Error(
      `Network error contacting Medusa: ${(networkErr as Error).message}`
    );
  }

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  // Parse error body; guard against empty or non-JSON bodies
  let errorBody: MedusaError;
  try {
    errorBody = await response.json();
  } catch {
    errorBody = {
      type: "unknown",
      message: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  throw new MedusaApiError(
    errorBody.type ?? "unknown",
    response.status,
    errorBody.message ?? "Unknown error",
    errorBody.errors
  );
}

// Usage
try {
  const data = await medusaFetch<{ products: unknown[] }>(
    "http://localhost:9000/admin/products",
    { headers: { "Authorization": `Bearer ${token}` } }
  );
  console.log(data.products);
} catch (err) {
  if (err instanceof MedusaApiError) {
    console.error(`Medusa ${err.status} [${err.type}]: ${err.message}`);
    if (err.fieldErrors) {
      console.error("Validation errors:", err.fieldErrors);
    }
  } else {
    console.error("Unexpected error:", err);
  }
}
```

---

## Common Error Scenarios

| Scenario | HTTP Code | Message Pattern | Resolution |
|----------|-----------|-----------------|------------|
| Missing `Authorization` header | 401 | "Unauthorized" | Add `Authorization: Bearer <token>` header |
| Expired JWT | 401 | "Unauthorized" | Re-authenticate and obtain a new token |
| Wrong token type (customer token on admin route) | 403 | "Forbidden" | Use admin JWT for `/admin/` routes |
| Product ID does not exist | 404 | "Product with id: X was not found" | Verify the ID; it may have been deleted |
| Duplicate customer email | 409 | "Customer with email X already exists" | Use a unique email or look up the existing customer |
| Required field missing in create request | 422 | "title is required" (field-level) | Include all required fields in the request body |
| Invalid enum value in request | 422 | "status must be one of: ..." | Use one of the allowed enum values |
| Missing `x-publishable-api-key` on Store route | 400 / 401 | Varies | Add `x-publishable-api-key` header - TODO: verify exact status code |
| Rate limit exceeded | 429 | "Too Many Requests" | Wait and retry with exponential backoff |
| Medusa server crash or DB unavailable | 500 | "Internal Server Error" | Check server logs; retry with backoff |

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
