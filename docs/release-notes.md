---
id: release-notes
title: Release Notes
sidebar_label: Release Notes
sidebar_position: 17
---

# Release Notes

## Version History

| Version | Date | Highlights | Docs Snapshot |
|---|---|---|---|
| v1.1.1 | 2026-02-18 | Admin Customer Notes API | v1.1.1 (use version dropdown) |
| v1.1.0 | 2026-02-18 | Loyalty Points API, include_history query support | v1.1.0 (use version dropdown) |
| v1.0.0 | 2026-02-18 | Initial documentation baseline | v1.0.0 (use version dropdown) |

---

## v1.1.1 - 2026-02-18

### Highlights
- New admin customer notes endpoint (`GET` + `POST /admin/customers/:id/notes`)

### Enhancements
- List notes with pagination, search, and author filtering
- Create internal notes with body, is_internal flag, and metadata
- Full Zod validation on request body and query params
- Author tracked via authenticated admin actor

### Upgrade Notes
No breaking changes. Additive endpoint, no migration required.

---

## v1.1.0 - 2026-02-18

### Highlights
- New Loyalty Points adjustment endpoint (`POST /admin/loyalty/points/adjust`)
- Added `include_history=true` query parameter to return last 20 adjustment records

### Enhancements
- Full API documentation for loyalty points endpoint with request/response examples
- Updated sidebar navigation with new API Reference Patterns entry

### Upgrade Notes
No breaking changes. The new endpoint is additive and does not affect existing API contracts.

---

## v1.0.0 - 2026-02-18

### Highlights
- Initial documentation baseline covering installation, quickstart, core concepts, and full API fundamentals
- Versioned docs infrastructure with Docusaurus and GitHub Pages deployment
- Automated docs sync and release workflows powered by gh-aw
