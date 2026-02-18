/**
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  tutorialSidebar: [
    // -------------------------------------------------------------------------
    // Start Here
    // -------------------------------------------------------------------------
    {
      type: "category",
      label: "Start Here",
      collapsed: false,
      items: [
        "index",
        "getting-started",
        "installation",
        "quickstart",
      ],
    },

    // -------------------------------------------------------------------------
    // Core Concepts
    // -------------------------------------------------------------------------
    {
      type: "category",
      label: "Core Concepts",
      collapsed: false,
      items: [
        "core-concepts",
        "modules-overview",
      ],
    },

    // -------------------------------------------------------------------------
    // API Fundamentals
    // -------------------------------------------------------------------------
    {
      type: "category",
      label: "API Fundamentals",
      collapsed: false,
      items: [
        "api-overview",
        "api-authentication",
        "api-errors",
        "api-pagination-filtering",
        "api-idempotency-retries",
      ],
    },

    // -------------------------------------------------------------------------
    // API Reference Patterns
    // -------------------------------------------------------------------------
    {
      type: "category",
      label: "API Reference Patterns",
      collapsed: false,
      items: [
        "api-reference-patterns",
        "loyalty-points-api",
        "webhooks-events",
        "sdk-usage",
      ],
    },

    // -------------------------------------------------------------------------
    // Operations
    // -------------------------------------------------------------------------
    {
      type: "category",
      label: "Operations",
      collapsed: false,
      items: [
        "deployment",
        "troubleshooting",
      ],
    },

    // -------------------------------------------------------------------------
    // Release Notes
    // -------------------------------------------------------------------------
    {
      type: "category",
      label: "Release Notes",
      collapsed: false,
      items: [
        "release-notes",
      ],
    },
  ],
};

module.exports = sidebars;
