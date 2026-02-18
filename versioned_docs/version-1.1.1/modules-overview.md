---
id: modules-overview
title: Modules Overview
sidebar_label: Modules Overview
sidebar_position: 6
---

# Modules Overview

Medusa v2 ships a set of built-in commerce modules. Each module is independently loadable, has its own data models and service, and communicates with other modules through well-defined interfaces. This page provides a quick reference for all built-in modules followed by deeper descriptions of the most commonly used ones.

---

## Module Reference Table

| Module | Purpose | Key Entities | API Prefix |
|---|---|---|---|
| **Product** | Catalog management | Product, ProductVariant, ProductCategory, ProductCollection, ProductTag | `/admin/products`, `/store/products` |
| **Order** | Order lifecycle management | Order, OrderItem, OrderShipping, Return, Claim, Exchange | `/admin/orders`, `/store/orders` |
| **Cart** | Pre-checkout cart management | Cart, LineItem, ShippingMethod | `/store/carts` |
| **Customer** | Customer accounts and addresses | Customer, CustomerGroup, Address | `/admin/customers`, `/store/customers` |
| **Region** | Geographic and currency groupings | Region | `/admin/regions` |
| **Inventory** | Multi-location inventory tracking | InventoryItem, InventoryLevel, ReservationItem | `/admin/inventory-items` |
| **Stock Location** | Physical/logical stock locations | StockLocation | `/admin/stock-locations` |
| **Pricing** | Flexible price lists and rules | PriceSet, PriceList, PriceRule | `/admin/price-lists` |
| **Payment** | Payment provider abstraction | PaymentSession, PaymentCollection, Refund | `/store/payment-collections`, `/admin/payments` |
| **Fulfillment** | Shipping and fulfillment providers | FulfillmentSet, ShippingOption, Fulfillment | `/admin/fulfillment-providers`, `/admin/shipping-options` |
| **Notification** | Outbound notification dispatch | Notification | `/admin/notifications` |
| **Auth** | Authentication and identity | AuthIdentity, Provider | `/auth/*` |
| **User** | Back-office user accounts | User, Invite | `/admin/users`, `/admin/invites` |
| **Currency** | Currency definitions | Currency | `/admin/currencies`, `/store/currencies` |
| **Sales Channel** | Logical storefront groupings | SalesChannel | `/admin/sales-channels` |
| **Tax** | Tax rates and provider abstraction | TaxRegion, TaxRate, TaxProvider | `/admin/tax-regions` |
| **File** | File storage provider abstraction | File | `/admin/uploads` |
| **Workflow Engine** | Workflow execution and state persistence | Workflow, WorkflowExecution | (internal; no public REST surface) |

> **Stability notes:** Core modules (Product, Order, Cart, Customer, Pricing, Auth, User) are stable in v2. Inventory, Stock Location, Fulfillment, and Tax have reached stable status. `TODO: verify` beta status of Notification and File modules in your target Medusa version.

---

## Loading Modules in `medusa-config.js`

Modules are registered in the `modules` array of your `medusa-config.js`. Built-in modules are loaded automatically; you only need to add an entry to override defaults or supply provider options.

```js
// medusa-config.js
module.exports = defineConfig({
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/payment-stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
            },
          },
        ],
      },
    },
  ],
});
```

Third-party and custom modules follow the same pattern, using a local path (`./src/modules/my-module`) or an npm package name as the `resolve` value.

---

## Product Module

The Product module manages your entire product catalog. A **Product** is a top-level entity with a title, description, and metadata. Each product has one or more **ProductVariants**, which represent the purchasable SKUs — combinations of options such as size and color. Products can be organized using **ProductCategories**, **ProductCollections**, and **ProductTags**.

The module exposes `ProductModuleService`, which provides methods for bulk operations and complex queries. Product listings support filtering by category, collection, tag, sales channel, and price. The Store API returns prices computed by the Pricing module based on the current region and customer group.

---

## Order Module

The Order module manages the full lifecycle of a placed order: creation, fulfillment, payment capture, returns, claims, and exchanges. An **Order** contains **OrderItems**, shipping addresses, and references to payment collections and fulfillments.

Mutations on orders (e.g., creating a return, processing an exchange) are implemented as workflows, ensuring each step is transactional and compensatable. The module emits events at key lifecycle transitions (`order.placed`, `order.fulfillment_created`, `order.return_requested`, etc.) that drive downstream processes such as notifications and inventory adjustments.

---

## Cart Module

The Cart module handles the pre-checkout shopping cart. A **Cart** holds **LineItems** representing products and their quantities, one or more **ShippingMethods**, and discount applications. Carts are region-scoped, which determines the currency and available tax and payment options.

The cart is converted to an order during checkout by the `placeOrder` workflow, which validates inventory, confirms payment, and creates the order record atomically. The Cart module is designed to be stateless from the customer session perspective — carts are identified by ID and can be retrieved anonymously.

---

## Customer Module

The Customer module stores registered customer accounts and their associated data: shipping and billing addresses, customer groups, and order history. **CustomerGroups** are used by the Pricing module to apply group-specific price lists.

Customers authenticate through the Auth module. The Store API allows customers to register, log in, manage their profile, and view past orders. On the admin side, merchants can create customer groups, bulk-assign customers, and view lifetime value metrics.

---

## Pricing Module

The Pricing module provides a flexible, rule-based pricing engine. A **PriceSet** is a collection of prices for a single resource (typically a product variant) with optional **PriceRules** that activate prices based on context — region, currency, customer group, or quantity range. **PriceLists** group price overrides for promotions or B2B catalogs and can be time-bounded.

Price calculation is performed by calling `PricingModuleService.calculatePrices()` with a pricing context. The Product module calls this automatically when assembling store-facing product responses, so end-to-end pricing requires no extra wiring for standard use cases.
