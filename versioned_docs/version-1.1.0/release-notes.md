---
id: release-notes
title: Release Notes
sidebar_label: Release Notes
sidebar_position: 17
---

# Release Notes

This page serves as the canonical release log for the Medusa documentation site. It
also documents the versioning process so that maintainers and automated tooling can
cut new doc snapshots consistently.

---

## 1. About Versioned Docs

Each Medusa release creates a **versioned snapshot** of the documentation at that
point in time. Versioned snapshots allow users running older Medusa versions to access
the documentation that matched their installation.

- The **current (latest) docs** live in `docs/` and are always up to date with the
  main branch.
- **Versioned snapshots** live in `versioned_docs/version-<version>/` and are frozen
  at the time the version was cut.
- The Docusaurus version dropdown in the top navigation lets users switch between
  the current docs and any versioned snapshot.

---

## 2. Versioning Process

### How to cut a new docs version

Run the following command from the root of the `medusa-docs` repository, replacing
`<version>` with the Medusa release version string (e.g., `1.1.0`):

```bash
npm run version:docs -- <version>
```

This command (an alias for `docusaurus docs:version <version>`) performs the
following actions:

1. Copies the current `docs/` directory to
   `versioned_docs/version-<version>/`.
2. Copies the current `sidebars.js` (or `sidebars.ts`) to
   `versioned_sidebars/version-<version>-sidebars.json`.
3. Adds the version to `versions.json` so Docusaurus builds and serves it.

**After running the command:**

```bash
git add versioned_docs/ versioned_sidebars/ versions.json
git commit -m "docs: snapshot version <version>"
git push origin main
```

GitHub Actions automatically picks up the push and deploys the updated site to
GitHub Pages. The new version will appear in the version dropdown within minutes of
the deployment completing.

### File layout after versioning

```
medusa-docs/
  docs/                                     # current (latest) docs
  versioned_docs/
    version-1.0.0/                          # frozen snapshot for v1.0.0
    version-1.1.0/                          # frozen snapshot for v1.1.0
  versioned_sidebars/
    version-1.0.0-sidebars.json
    version-1.1.0-sidebars.json
  versions.json                             # list of all versioned releases
```

### Important notes

- Do **not** edit files inside `versioned_docs/`. Those directories are frozen.
  Changes to historical docs should only be made if correcting a serious error, and
  must be done with care to avoid invalidating the snapshot.
- The `versions.json` file controls which versions are built. Removing an entry from
  this file removes that version from the site.

---

## 3. Automation: How Release Notes Are Appended

The `gh-aw` automation workflow listens for GitHub release and pull request events
and appends a new release entry to this file automatically.

**Trigger conditions:**

- A GitHub Release is published in the `medusa` repository.
- The release body is parsed to extract highlights, breaking changes, enhancements,
  and fixes.

**What the automation does:**

1. Checks out the `medusa-docs` repository.
2. Prepends a new release entry (using the template in Section 4) immediately after
   the `## Version History` table heading.
3. Updates the version history table with the new row.
4. Commits the change with message: `chore(release-notes): add vX.Y.Z release entry`.
5. Pushes to `main`; the GitHub Actions deployment workflow deploys the updated site.

**To run the automation manually:**

```bash
# TODO: fill in the correct gh-aw command for your workflow setup
gh workflow run release-notes-update.yml \
  -f version=1.2.0 \
  -f date=2024-03-01 \
  -f highlights="New storefront hooks, improved SDK types"
```

---

## 4. Release Entry Template

The following template is used by the automation workflow when appending new release
entries. Do not modify the heading markers or the `<!-- RELEASE_ENTRY_START -->` and
`<!-- RELEASE_ENTRY_END -->` comments; they are used as anchors by the automation
script.

```markdown
<!-- RELEASE_ENTRY_START -->
## v<VERSION> - <DATE>

### Highlights
- <summary of major changes>

### Breaking Changes
- <breaking change description> - See upgrade notes below.

### Enhancements
- <enhancement 1>
- <enhancement 2>

### Fixes
- <fix 1>

### Upgrade Notes
<migration steps if any>
<!-- RELEASE_ENTRY_END -->
```

When there are no breaking changes, omit the `### Breaking Changes` section entirely
rather than leaving it with placeholder text.

---

## 5. Version History

| Version | Date | Highlights | Docs Snapshot |
|---|---|---|---|
| v1.0.0 | 2024-01-01 | Initial release | v1.0.0 docs (use version dropdown) |

---

## 6. How to Find Docs for a Specific Version

Use the **version dropdown** in the top navigation bar of this site. The dropdown
lists all versioned snapshots. Selecting a version reloads the site with the frozen
documentation for that release.

If the version you need is not in the dropdown, the snapshot may not have been cut.
Check `versions.json` in the repository to see which versions are available, or browse
`versioned_docs/` directly on GitHub.

**Direct URL pattern:**

```
https://<org>.github.io/medusa-docs/<version>/<page-path>
```

For example, the installation guide for v1.0.0:

```
https://<org>.github.io/medusa-docs/1.0.0/installation
```

Replace `<org>` with the GitHub organization or username that hosts the Pages site.
