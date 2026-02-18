---
id: getting-started
title: Getting Started
sidebar_label: Getting Started
sidebar_position: 2
---

# Getting Started

This page explains what you need before installing Medusa, how these docs are organized, and how versioning works.

## Prerequisites

Before you install Medusa, ensure your environment meets these requirements:

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 18 LTS or later | 20 LTS recommended |
| Package manager | npm 9+, yarn 1.22+, or pnpm 8+ | Any one is sufficient |
| PostgreSQL | 15 or later | Required for production; SQLite available for local dev |
| Git | 2.x | Required for project scaffolding |

Check your Node version:

```bash
node --version
```

## How these docs are structured

```
docs/
  index.md              # This site's landing page
  getting-started.md    # You are here
  installation.md       # Full installation reference
  quickstart.md         # First API call in < 10 minutes
```

As the project grows, additional sections will cover:

- **API Reference** — auto-generated from OpenAPI specs
- **SDK Usage** — JavaScript/TypeScript client (`@medusajs/js-sdk`)
- **Module Guides** — deep dives into Products, Orders, Inventory, Pricing, etc.
- **Deployment** — cloud, Docker, and self-hosted guides

## Navigating versions

This documentation site is versioned to match Medusa releases. The version selector in the top navigation bar lets you switch between:

- **Current** — tracks the latest stable release
- **Versioned snapshots** — pinned copies published at each release (e.g., `v2.1.0`)

When reading versioned docs, a banner at the top of each page indicates whether you are on the current version or an older one.

## Automation model

These docs use a PR-driven automation model:

1. **Authoring** — documentation changes are submitted alongside code changes in the same pull request.
2. **Review** — docs are reviewed and merged with code on the main branch.
3. **Versioning** — on each release, a versioned snapshot of the docs is published automatically. No manual snapshot steps are required.
4. **Deployment** — the site is deployed to GitHub Pages at every merge to the default branch.

This means the docs you read here always reflect what is in the released code.

## Next steps

- [Installation](./installation.md) — install Medusa and configure your environment
- [Quickstart](./quickstart.md) — make your first API call
