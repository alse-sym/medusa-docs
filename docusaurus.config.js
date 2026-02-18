// @ts-check

const { themes } = require("prism-react-renderer");

const config = {
  title: "Medusa Docs",
  tagline: "Versioned documentation for Medusa",
  url: "https://alse-sym.github.io",
  baseUrl: "/medusa-docs/",
  organizationName: "alse-sym",
  projectName: "medusa-docs",
  onBrokenLinks: "throw",
  favicon: "img/favicon.svg",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.js",
          editUrl: "https://github.com/alse-sym/medusa-docs/tree/main/",
        },
        blog: false,
        pages: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Medusa Docs",
      logo: {
        alt: "Medusa",
        src: "img/logo.svg",
        width: 28,
        height: 28,
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          type: "docsVersionDropdown",
          position: "right",
          dropdownItemsAfter: [
            {
              to: "/release-notes",
              label: "Release Notes",
            },
          ],
        },
        {
          href: "https://github.com/alse-sym/medusa-docs",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "light",
      copyright: `Copyright &copy; ${new Date().getFullYear()} Medusa &mdash; Open-source headless commerce.`,
    },
    prism: {
      theme: themes.vsLight,
      darkTheme: themes.dracula,
      additionalLanguages: ["bash", "json", "yaml", "typescript"],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  },
  future: {
    v4: true,
  },
};

module.exports = config;
