// @ts-check

const config = {
  title: "Medusa Docs",
  tagline: "Versioned documentation for Medusa",
  url: "https://alse-sym.github.io",
  baseUrl: "/medusa-docs/",
  organizationName: "alse-sym",
  projectName: "medusa-docs",
  onBrokenLinks: "throw",
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.js",
          editUrl: "https://github.com/alse-sym/medusa-docs/tree/main/"
        },
        blog: false,
        pages: false
      }
    ]
  ],
  themeConfig: {
    navbar: {
      title: "Medusa Docs",
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Documentation"
        },
        {
          type: "docsVersionDropdown",
          position: "right",
          dropdownItemsAfter: [
            {
              to: "/release-notes",
              label: "Release Notes"
            }
          ]
        },
        {
          href: "https://github.com/alse-sym/medusa-docs",
          label: "GitHub",
          position: "right"
        }
      ]
    }
  },
  future: {
    v4: true
  }
};

module.exports = config;
