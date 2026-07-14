<h1 align="center">DropOut Docs</h1>

<p align="center">
  <em>The bilingual product and developer documentation site for DropOut.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Fumadocs-000?style=flat" alt="Fumadocs">
  <img src="https://img.shields.io/badge/React_19-000?style=flat&logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/React_Router_7-000?style=flat&logo=reactrouter" alt="React Router 7">
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-000?style=flat&logo=tailwindcss" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/TypeScript-000?style=flat&logo=typescript" alt="TypeScript">
</p>

---

## What Is This

`packages/docs` is the documentation site for the DropOut Minecraft launcher. It explains installation, first-run setup, launcher features, architecture, development workflow, and troubleshooting.

The site is built with Fumadocs MDX collections on React Router v7. Content is organized by locale and rendered through the shared source loader in `app/lib/source.ts`.

---

## Languages

| Language | Path | URL behavior |
|---|---|---|
| Simplified Chinese | `content/zh/` | Default locale, locale segment hidden |
| English | `content/en/` | Served under the English locale route |

The current i18n source of truth is `app/lib/i18n.ts`: default language `zh`, languages `zh` and `en`, directory-based parsing.

---

## Quick Start

Run commands from the repository root unless you are already inside `packages/docs`.

```bash
pnpm install
pnpm -C packages/docs --lockfile-dir "$PWD" install
pnpm -C packages/docs dev
```

The development server starts with React Router and hot reload. Use the local URL printed by the command.

### Package-local commands

```bash
pnpm dev          # start React Router dev server
pnpm build        # build production output into build/
pnpm start        # serve build/server/index.js
pnpm types:check  # React Router typegen, Fumadocs MDX build, TypeScript check
pnpm lint         # Biome check
pnpm format       # Biome format
```

---

## Content Model

```text
packages/docs/
|-- app/
|   |-- docs/              # Fumadocs page/search integration
|   |-- lib/               # i18n and source loader
|   `-- routes/            # React Router routes
|-- content/
|   |-- en/                # English MDX docs
|   |   |-- development/
|   |   `-- manual/
|   `-- zh/                # Simplified Chinese MDX docs
|       |-- development/
|       `-- manual/
|-- public/                # Static assets
|-- source.config.ts       # Fumadocs MDX collection config
`-- react-router.config.ts # React Router config
```

Each locale should keep the same information architecture so readers can switch languages without losing position.

---

## Writing Pages

Every page is MDX with frontmatter:

```mdx
---
title: Page Title
description: Short SEO and preview description
---

# Page Title

Content goes here.
```

Useful Fumadocs UI components include:

- `<Cards>` and `<Card>` for navigation groups
- `<Callout>` for warnings, tips, or constraints
- `<Tabs>` for platform-specific instructions
- `<Steps>` for ordered setup flows
- fenced code blocks for commands and config snippets

Keep commands copyable and exact. If a command must be run from the repo root or from a package directory, say so before the code block.

---

## Adding A Page

1. Create the `.mdx` file in both `content/zh/` and `content/en/`.
2. Add `title` and `description` frontmatter.
3. Keep the page slug and section placement aligned across locales.
4. Update the nearest `meta.json` so navigation includes the page.
5. Run `pnpm -C packages/docs types:check`.
6. Preview with `pnpm -C packages/docs dev`.

---

## Translation Rules

- Translate user-facing explanations, headings, callouts, and frontmatter.
- Keep code, package names, file paths, commands, and API identifiers unchanged.
- Prefer the same section order in each locale.
- Keep links stable unless a locale-specific target exists.
- Update both locales in the same change when the information affects product behavior.

---

## Deployment

The docs package builds to `build/`:

```bash
pnpm -C packages/docs build
pnpm -C packages/docs start
```

Repository CI should run the same build and type/content checks before publishing the site.

---

## Links

- [Main README](../../README.md)
- [DropOut repository](https://github.com/HydroRoll-Team/DropOut)
- [Fumadocs](https://fumadocs.dev)
- [React Router](https://reactrouter.com)

---

## License

GNU Affero General Public License v3.0 or later. See the root [LICENSE](../../LICENSE).
