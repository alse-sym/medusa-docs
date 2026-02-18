# medusa-docs

Versioned documentation site for Medusa, deployed on GitHub Pages.

## Stack

- Docusaurus
- GitHub Pages
- GitHub Actions

## Local development

```bash
npm install
npm run start
```

## Build

```bash
npm run build
```

## Versioning

Create a new docs snapshot:

```bash
npm run version:docs -- 2.13.1
```

This generates `versioned_docs`, `versioned_sidebars`, and updates `versions.json`.
