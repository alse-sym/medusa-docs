---
id: core-concepts
title: Core Concepts
sidebar_label: Core Concepts
sidebar_position: 5
---

# Core Concepts

This page covers the fundamental mental models you need to work effectively with Medusa v2. Understanding these concepts will help you navigate the codebase, extend the platform, and reason about how the pieces fit together.

---

## Headless Commerce Engine

Medusa is an API-first, headless commerce engine. It exposes commerce functionality through a REST API and does not prescribe any frontend. Your storefront — whether it is a Next.js app, a mobile app, or a CLI tool — communicates with Medusa over HTTP.

This separation means you own the presentation layer completely. Medusa handles the commerce logic: products, orders, carts, pricing, taxes, and fulfillment. You decide how that data is rendered and what UX is built on top of it.

---

## The Module System

Medusa v2 is built around a plug-and-play module system. Each commerce capability (products, orders, inventory, etc.) is packaged as an independent module with its own data models, service layer, and migrations. Modules communicate through well-defined interfaces rather than direct dependencies.

This architecture means you can swap out, extend, or replace individual modules without affecting the rest of the system. You register modules in `medusa-config.js` under the `modules` key. Third-party and custom modules follow the same contract as built-in ones.

---

## The Service Layer

Business logic in Medusa lives in services. Each module exposes a service class that encapsulates its operations — for example, `ProductModuleService` provides methods to create, update, and query products. Services are the single authoritative source of truth for module behavior.

The REST API is a thin layer that translates HTTP requests into service calls. When you write a custom API route or a workflow step, you interact with services directly rather than going through the HTTP layer. Services are injected via Medusa's dependency injection container.

---

## Data Models and Relationships

Medusa's core data model covers the main entities of an e-commerce system:

- **Product / ProductVariant** - A product has one or more variants, each with its own SKU, price, and inventory.
- **Order / LineItem** - An order captures a completed purchase and its associated items, totals, and fulfillments.
- **Cart / LineItem** - A cart is the pre-checkout container; it shares the LineItem concept with orders.
- **Customer** - A registered or guest buyer with addresses and order history.
- **Region** - A geographic and currency grouping that controls tax rates, payment providers, and fulfillment options.
- **SalesChannel** - A logical storefront (web, mobile, POS) that can have its own product catalog.

Relationships between entities are managed at the module boundary. Cross-module links are expressed using Medusa's `link` mechanism rather than foreign keys, keeping modules independently deployable.

---

## Workflows

Workflows are Medusa's orchestration primitive for multi-step operations. A workflow is a directed acyclic graph of steps, where each step is a discrete, revertible unit of work. Medusa uses workflows to implement all core mutations (e.g., creating an order, processing a return).

Workflows provide automatic compensation (rollback) if a step fails partway through, making them safe for operations that touch multiple modules or external services. You can compose custom workflows from built-in steps or write your own steps. Workflows are executed by the Workflow Engine module and their state is persisted to the database.

---

## Events System

Medusa has a built-in events system for async communication between modules. When a significant action occurs — an order is placed, a shipment is created — Medusa emits a named event. Any module or plugin can subscribe to that event and react to it asynchronously.

Events are delivered through a configurable event bus. In development, Medusa uses an in-process bus. In production, you should configure a durable broker (Redis Streams is the default option). Subscribers are plain classes decorated with `@OnEvent()` that receive the event payload and perform side effects such as sending notifications or updating inventory.

---

## Admin API vs. Storefront API

Medusa exposes two distinct API surfaces:

- **Admin API** (`/admin/*`) - For back-office operations: managing products, orders, customers, discounts, and configuration. Protected by admin authentication; not intended to be called from public storefronts.
- **Store API** (`/store/*`) - For customer-facing operations: browsing products, managing carts, placing orders, and customer authentication. Designed to be called from your storefront.

Both APIs share the same Medusa process but enforce different authentication and authorization rules. The Medusa JS SDK provides separate client instances for each surface (`sdk.admin.*` and `sdk.store.*`).

---

## Customization: Plugins and Custom Modules

Medusa supports two primary customization mechanisms:

- **Plugins** - Self-contained packages that add routes, subscribers, and modules. Plugins are npm packages installed into your project and registered in `medusa-config.js` under `plugins`. They follow a standard directory structure (`src/api`, `src/subscribers`, `src/modules`).
- **Custom Modules** - If you need to encapsulate new business logic with its own data models and services, you create a custom module. It is structured identically to a built-in module and registered the same way, giving you full access to dependency injection, migrations, and the events system.

Both mechanisms allow you to extend or override built-in behavior without forking the core Medusa packages.
