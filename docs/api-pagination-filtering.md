---
id: api-pagination-filtering
title: Pagination and Filtering
sidebar_label: Pagination and Filtering
sidebar_position: 10
---

# Pagination and Filtering

All Medusa list endpoints use **offset-based pagination**. Understanding how to navigate large result sets and how to apply filters, ordering, and field selection is essential for building performant integrations.

---

## Overview

When you call a list endpoint such as `GET /admin/products` or `GET /store/products`, Medusa never returns the entire collection in a single response. Instead, it returns a page of results alongside metadata that tells you how to fetch the next page.

Pagination is driven by two query parameters:

- `limit` - how many records to return in this response
- `offset` - how many records to skip before returning results

This is the canonical offset-based pattern: to get page N (0-indexed) of results, set `offset = N * limit`.

---

## Pagination Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `20` | Number of records to return. Must be a positive integer. <!-- TODO: verify maximum allowed limit per endpoint - may be 100 or 500 --> |
| `offset` | integer | `0` | Number of records to skip. Use `0` for the first page. |

**Example: fetch the second page of 10 products**

```
GET /admin/products?limit=10&offset=10
```

**Constraints:**
- `limit` must be a positive integer. Passing `limit=0` may return an empty array or an error - do not rely on this behaviour.
- `offset` must be a non-negative integer. Negative values will result in a `400 Bad Request`.
- <!-- TODO: verify per-endpoint maximum limit values - some endpoints may cap at a lower maximum than others -->

---

## Response Fields for Pagination

Every list response includes four top-level fields alongside the resource array:

```json
{
  "products": [ /* ... */ ],    // the current page of records
  "count": 47,                  // TOTAL number of records matching the query (before pagination)
  "offset": 20,                 // the offset used for THIS response
  "limit": 10                   // the limit used for THIS response
}
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer | Total number of records matching the applied filters, regardless of pagination. Use this to calculate total pages. |
| `offset` | integer | The offset value that was used to produce this page. Mirrors the `offset` query parameter (or `0` if not supplied). |
| `limit` | integer | The limit value that was used to produce this page. Mirrors the `limit` query parameter (or the default if not supplied). |

**Deriving total pages and detecting the last page:**

```typescript
function hasMorePages(count: number, offset: number, limit: number): boolean {
  return offset + limit < count;
}

function totalPages(count: number, limit: number): number {
  return Math.ceil(count / limit);
}

// After receiving a response with { count: 47, offset: 20, limit: 10 }:
// hasMorePages(47, 20, 10) => true  (offset 20 + limit 10 = 30 < 47)
// hasMorePages(47, 40, 10) => false (offset 40 + limit 10 = 50 >= 47, last page)
```

---

## Iterating Through All Results

For bulk operations such as syncing a catalog or generating reports, you will often need every record. The following helper fetches all pages sequentially:

```typescript
const ADMIN_BASE = "http://localhost:9000/admin";

interface ListResponse<T> {
  count: number;
  offset: number;
  limit: number;
  [resourceKey: string]: T[] | number;
}

/**
 * Fetches every page of a list endpoint and returns all records combined.
 *
 * @param token   - Admin JWT
 * @param path    - Endpoint path, e.g. "/products"
 * @param key     - The resource array key in the response, e.g. "products"
 * @param params  - Additional query parameters (filters, ordering, etc.)
 * @param pageSize - Records per request (default: 100)
 */
async function fetchAll<T>(
  token: string,
  path: string,
  key: string,
  params: Record<string, string> = {},
  pageSize = 100
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  let totalCount: number | null = null;

  do {
    const url = new URL(`${ADMIN_BASE}${path}`);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`fetchAll failed at offset ${offset}: ${error.message}`);
    }

    const data: ListResponse<T> = await response.json();
    const page = data[key] as T[];

    results.push(...page);
    totalCount = data.count;
    offset += page.length;

    // Brief pause to be kind to the server
    if (offset < totalCount) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } while (totalCount !== null && offset < totalCount);

  return results;
}

// Example: fetch all published products
const allProducts = await fetchAll<{ id: string; title: string }>(
  adminToken,
  "/products",
  "products",
  { status: "published" }
);
console.log(`Fetched ${allProducts.length} published products`);
```

> **Rate limiting note:** When iterating through thousands of records, add a small delay between requests (as shown above) to avoid hitting rate limits. See [API Overview - Rate Limiting](./api-overview.md#rate-limiting).

---

## Filtering

Most list endpoints accept filter parameters as query string values. Filters narrow the result set before pagination is applied, so `count` reflects the filtered total.

### Common filter parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `q` | string | `q=shirt` | Full-text search across the resource's searchable fields |
| `status` | string | `status=published` | Filter by a single status value |
| `status[]` | string (repeatable) | `status[]=published&status[]=draft` | Filter by multiple status values (OR) |
| `id[]` | string (repeatable) | `id[]=prod_01H&id[]=prod_02H` | Fetch specific records by ID |
| `created_at[gte]` | ISO 8601 date | `created_at[gte]=2024-01-01T00:00:00Z` | Records created on or after this date |
| `created_at[lte]` | ISO 8601 date | `created_at[lte]=2024-12-31T23:59:59Z` | Records created on or before this date |
| `updated_at[gte]` | ISO 8601 date | `updated_at[gte]=2024-06-01T00:00:00Z` | Records updated on or after this date |

<!-- TODO: verify filter parameter names and supported operators per endpoint - not all parameters are available on every list endpoint -->

**Date range filter example:**

```bash
# Products updated in January 2024
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products\
?updated_at[gte]=2024-01-01T00:00:00Z\
&updated_at[lte]=2024-01-31T23:59:59Z\
&limit=50" \
  | jq '{count: .count, titles: [.products[].title]}'
```

**Multi-ID fetch example:**

```bash
# Fetch three specific products by ID
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products\
?id[]=prod_01H\
&id[]=prod_02H\
&id[]=prod_03H" \
  | jq '.products | length'
```

---

## Ordering / Sorting

Use the `order` query parameter to control sort order. Prefix a field name with `-` for descending order:

| Value | Description |
|-------|-------------|
| `order=created_at` | Ascending by creation date (oldest first) |
| `order=-created_at` | Descending by creation date (newest first) |
| `order=title` | Ascending alphabetically by title |
| `order=-updated_at` | Descending by last update (most recently updated first) |

<!-- TODO: verify the order parameter syntax - confirm the leading "-" prefix for descending is correct in Medusa v2 -->

**Example:**

```bash
# Most recently created products first
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products?order=-created_at&limit=10" \
  | jq '[.products[] | {id, title, created_at}]'
```

```typescript
// Most recently updated orders
const url = new URL("http://localhost:9000/admin/orders");
url.searchParams.set("order", "-updated_at");
url.searchParams.set("limit", "20");
```

---

## Field Selection

The `fields` parameter reduces the response payload by specifying exactly which fields to return. This is useful when working with resource types that have large numbers of fields (e.g., products with many variants).

```
GET /admin/products?fields=id,title,status,created_at
```

```json
{
  "products": [
    {
      "id": "prod_01H...",
      "title": "Classic T-Shirt",
      "status": "published",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 47,
  "offset": 0,
  "limit": 20
}
```

<!-- TODO: verify fields parameter syntax and whether it works on all list endpoints in Medusa v2 -->

**cURL example:**

```bash
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products?fields=id,title,status&limit=5" \
  | jq '.products'
```

---

## Expand / Relations

By default, Medusa returns only the top-level scalar fields for each resource. To include related entities (e.g., product variants, images, tags), use the `fields` parameter with a `+` prefix for relation names, or the `expand` parameter where supported.

<!-- TODO: verify - Medusa v2 uses a unified "fields" parameter with "+" prefix for relations; "expand" may be a v1 pattern. Confirm correct approach for v2. -->

### Including relations via `fields` with `+` prefix (Medusa v2)

```bash
# Include variants and images with each product
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products\
?fields=id,title,status,+variants,+images\
&limit=5" \
  | jq '.products[0] | {id, title, variants: (.variants | length), images: (.images | length)}'
```

```typescript
const url = new URL("http://localhost:9000/admin/products");
url.searchParams.set("fields", "id,title,status,+variants,+images,+tags");
url.searchParams.set("limit", "10");
```

### Legacy `expand` parameter (Medusa v1 pattern)

```bash
# v1-style: expand variants and collection
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products?expand=variants,collection&limit=5"
```

---

## Full cURL Examples

### Paginated product list with filters

```bash
ADMIN_TOKEN="eyJ..."

# Page 1: published products, search for "shirt", sorted newest first
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products\
?q=shirt\
&status=published\
&order=-created_at\
&limit=10\
&offset=0\
&fields=id,title,status,created_at" \
  | jq '{
      total: .count,
      page_size: .limit,
      current_offset: .offset,
      has_more: (.offset + .limit < .count),
      products: [.products[] | {id, title, status}]
    }'

# Page 2: same query, offset by page size
curl -s \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:9000/admin/products\
?q=shirt\
&status=published\
&order=-created_at\
&limit=10\
&offset=10\
&fields=id,title,status,created_at" \
  | jq '.'
```

### Store product list with filters

```bash
PUBLISHABLE_KEY="pk_..."

# List in-stock products in a specific category
curl -s \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  "http://localhost:9000/store/products\
?limit=20\
&offset=0\
&order=-created_at" \
  | jq '{count: .count, products: [.products[] | {id, title}]}'
```

---

## Full JavaScript Examples

### Simple paginated fetch

```typescript
interface PaginatedResponse<T> {
  count: number;
  offset: number;
  limit: number;
  [key: string]: T[] | number;
}

async function getPage<T>(
  token: string,
  endpoint: string,           // e.g. "http://localhost:9000/admin/products"
  resourceKey: string,        // e.g. "products"
  options: {
    limit?: number;
    offset?: number;
    filters?: Record<string, string | string[]>;
    order?: string;
    fields?: string;
  } = {}
): Promise<{ items: T[]; count: number; hasMore: boolean }> {
  const { limit = 20, offset = 0, filters = {}, order, fields } = options;

  const url = new URL(endpoint);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (order) url.searchParams.set("order", order);
  if (fields) url.searchParams.set("fields", fields);

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(`${key}[]`, v));
    } else {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`API error ${response.status}: ${error.message}`);
  }

  const data: PaginatedResponse<T> = await response.json();
  const items = data[resourceKey] as T[];

  return {
    items,
    count: data.count,
    hasMore: offset + items.length < data.count,
  };
}

// Usage: get first page of draft products
const { items, count, hasMore } = await getPage<{ id: string; title: string }>(
  adminToken,
  "http://localhost:9000/admin/products",
  "products",
  {
    limit: 20,
    offset: 0,
    filters: { status: "draft" },
    order: "-created_at",
    fields: "id,title,status,created_at",
  }
);

console.log(`Page 1 of ${Math.ceil(count / 20)} - has more: ${hasMore}`);
```

### Full cursor helper that iterates all pages

```typescript
/**
 * AsyncGenerator that yields individual records one at a time,
 * fetching additional pages transparently as needed.
 */
async function* iterateAll<T>(
  token: string,
  endpoint: string,
  resourceKey: string,
  options: {
    filters?: Record<string, string | string[]>;
    order?: string;
    fields?: string;
    pageSize?: number;
    delayMs?: number;   // delay between page requests to avoid rate limiting
  } = {}
): AsyncGenerator<T> {
  const { pageSize = 100, delayMs = 50, ...rest } = options;
  let offset = 0;
  let totalCount: number | null = null;

  do {
    const { items, count } = await getPage<T>(
      token,
      endpoint,
      resourceKey,
      { ...rest, limit: pageSize, offset }
    );

    totalCount = count;

    for (const item of items) {
      yield item;
    }

    offset += items.length;

    if (offset < totalCount && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  } while (totalCount !== null && offset < totalCount);
}

// Usage: stream all products without loading them all into memory
for await (const product of iterateAll<{ id: string; title: string }>(
  adminToken,
  "http://localhost:9000/admin/products",
  "products",
  {
    filters: { status: "published" },
    order: "-created_at",
    fields: "id,title,status",
    pageSize: 100,
    delayMs: 100,
  }
)) {
  console.log(product.id, product.title);
}
```

---

## Troubleshooting

### Empty results despite data existing in the database

**Symptom:** The list endpoint returns `{"products": [], "count": 0, ...}` but you know records exist.

**Cause 1 - Active filters excluding all records:** A filter parameter is too restrictive. For example, `status=published` will exclude all `draft` products.

**Fix:** Remove filters one at a time to identify the culprit. Start with no filters and add them back incrementally.

---

**Cause 2 - Wrong sales channel / publishable key on Store API:** The store endpoint returns only products associated with the sales channel tied to the publishable API key.

**Fix:** Confirm the publishable API key corresponds to the correct sales channel and that the products are linked to that sales channel via the Admin UI or Admin API.

---

**Cause 3 - Offset overshooting the total count:** If `offset` is greater than or equal to `count`, no records are returned. This can happen when records are deleted between paginated requests.

**Fix:** Always check `count` in the response and stop fetching when `offset >= count`.

---

### Wrong offset math (skipped or duplicated records)

**Symptom:** When iterating through pages, some records appear on two pages, or some records are never seen.

**Cause:** The `offset` for each subsequent page is calculated incorrectly - typically by using `pageNumber * limit` instead of `previousOffset + previousPage.length`, or by not accounting for records inserted or deleted between requests.

**Fix:** Advance `offset` by the actual number of records received (`offset += items.length`), not by the requested `limit`. This handles partial last pages correctly.

```typescript
// WRONG: assumes every page is full
offset += limit;

// CORRECT: uses actual received count
offset += items.length;
```

For live data that changes during iteration (e.g., orders being placed), consider adding an `updated_at[lte]` filter anchored to the time the iteration started to get a consistent snapshot.

---

### Filter syntax errors

**Symptom:** The endpoint returns a `400 Bad Request` with a message about invalid parameters, or filters appear to be silently ignored.

**Cause 1 - Array filter missing bracket notation:** Multi-value filters require `[]` in the parameter name: `id[]=val1&id[]=val2`. Passing `id=val1&id=val2` sends the last value only in most HTTP client implementations.

**Fix:** Use bracket notation: `url.searchParams.append("id[]", value)`.

---

**Cause 2 - Date not in ISO 8601 format:** Date range filters expect UTC ISO 8601 strings. Human-readable dates like `2024-01-01` without time or timezone may be rejected or parsed unexpectedly.

**Fix:** Always use full UTC ISO 8601 format: `2024-01-01T00:00:00.000Z`.

---

**Cause 3 - Filter key not supported on this endpoint:** Not every filter parameter is available on every endpoint. Unsupported parameters are often silently ignored rather than causing an error.

**Fix:** Consult the OpenAPI spec for the specific endpoint to confirm which filters are supported. See [API Overview - OpenAPI / Swagger](./api-overview.md#openapi--swagger-specification).

---

## Automation Notes

- Last reviewed for version: TODO: fill in
- TODO: auto-update source links
- TODO: auto-append endpoint changes from release workflow
