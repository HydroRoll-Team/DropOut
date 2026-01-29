# DropOut Documentation

This is the official documentation site for DropOut Minecraft Launcher, built with [Fumadocs](https://fumadocs.dev) and React Router v7.

## Overview

The documentation covers:
- **Getting Started**: Installation and first-time setup
- **Features**: Detailed guides for all launcher features
- **Architecture**: Technical design and implementation details
- **Development**: Building and contributing to DropOut
- **Troubleshooting**: Common issues and solutions

### Multi-language Support

The documentation is available in:
- **English** (default) - `content/docs/en/`
- **简体中文** (Simplified Chinese) - `content/docs/zh/`

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+

### Setup

Install dependencies:

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev
```

This starts the development server at `http://localhost:5173` with hot reload enabled.

The documentation automatically supports language switching between English and Chinese.

### Build for Production

```bash
pnpm build
```

The production build will be output to the `build/` directory.

### Type Checking

```bash
pnpm types:check
```

### Linting and Formatting

```bash
# Check code
pnpm lint

# Format code
pnpm format
```

## Project Structure

```
packages/docs/
├── content/
│   └── docs/              # Documentation content (MDX)
│       ├── en/            # English documentation
│       │   ├── index.mdx
│       │   ├── getting-started.mdx
│       │   ├── architecture.mdx
│       │   ├── development.mdx
│       │   ├── troubleshooting.mdx
│       │   └── features/
│       └── zh/            # Chinese documentation
│           ├── index.mdx
│           ├── getting-started.mdx
│           ├── architecture.mdx
│           ├── development.mdx
│           ├── troubleshooting.mdx
│           └── features/
├── app/                   # React Router app
├── public/                # Static assets
├── source.config.ts       # Fumadocs configuration (i18n enabled)
└── react-router.config.ts # React Router configuration
```

## Internationalization (i18n)

### Structure

Documentation is organized by locale:
- English: `content/docs/en/`
- Chinese: `content/docs/zh/`

Each locale has the same structure with translated content.

### Configuration

i18n is configured in:
- `source.config.ts`: Enables i18n support
- `app/lib/source.ts`: Defines available languages and default

### Adding a New Language

1. Create a new directory: `content/docs/{locale}/`
2. Copy the structure from `en/` or `zh/`
3. Translate all `.mdx` files
4. Update `meta.json` files with translated titles
5. Add the language to `app/lib/source.ts`

## Writing Documentation

### MDX Format

All documentation is written in MDX (Markdown with JSX):

```mdx
---
title: Page Title
description: Page description for SEO
---

# Page Title

Content goes here...

<Cards>
  <Card title="Link Title" href="/path" />
</Cards>
```

### Available Components

Fumadocs provides several components:

- `<Card>` - Link cards
- `<Cards>` - Card container
- `<Callout>` - Info/warning boxes
- `<Tabs>` - Tabbed content
- `<Steps>` - Numbered steps
- Code blocks with syntax highlighting

### Adding New Pages

1. Create new `.mdx` file in `content/docs/{locale}/`
2. Add frontmatter with title and description
3. Write content using MDX
4. Update `meta.json` to include the page
5. Repeat for all supported languages
6. Test locally with `pnpm dev`

### Translation Guidelines

When translating content:
- Keep all code blocks in English
- Translate frontmatter (title, description)
- Keep technical terms (Tauri, Rust, Svelte, etc.) in English
- Translate UI elements and descriptions
- Keep all links and URLs unchanged
- Maintain the same structure and formatting

### Organizing Content

Use `meta.json` files to organize navigation:

```json
{
  "title": "Section Title",
  "pages": [
    "page1",
    "page2",
    {
      "title": "Subsection",
      "pages": ["sub1", "sub2"]
    }
  ]
}
```

## Deployment

The documentation is automatically deployed when changes are merged to the main branch.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes (in all supported languages)
4. Test locally
5. Submit a pull request

## Links

- [DropOut Repository](https://github.com/HydroRoll-Team/DropOut)
- [Fumadocs](https://fumadocs.dev)
- [React Router](https://reactrouter.com)

## License

MIT License - see the main repository for details.
