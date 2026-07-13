<h1 align="center">DropOut UI</h1>

<p align="center">
  <em>The Svelte webview interface for the DropOut desktop launcher.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Svelte_5-000?style=flat&logo=svelte" alt="Svelte 5">
  <img src="https://img.shields.io/badge/Vite_Rolldown-000?style=flat&logo=vite" alt="Vite with Rolldown">
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-000?style=flat&logo=tailwindcss" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/TypeScript-000?style=flat&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tauri_API-000?style=flat&logo=tauri" alt="Tauri API">
</p>

---

## What Is This

`packages/ui` is the launcher frontend rendered inside the Tauri desktop shell. It is a Vite application using Svelte 5 runes, Tailwind CSS 4, TypeScript, and the Tauri JavaScript API.

The UI can be previewed in a browser for layout work, but production behavior depends on Tauri commands implemented in `src-tauri/src/main.rs`.

---

## Screens And Flows

- **Home** - launch-focused landing screen with release notes from GitHub.
- **Instances** - create, select, duplicate, edit, and delete isolated game environments.
- **Versions** - install vanilla, Fabric, or Forge versions for the active instance.
- **Settings** - Java path, memory, resolution, downloader, background, and assistant settings.
- **Assistant** - optional Ollama or OpenAI-compatible chat helper for logs, crashes, and configuration questions.
- **Download monitor** - live progress overlay for version, asset, library, and Java downloads.
- **Game console** - streamed launcher/game logs from the Tauri backend.

---

## Quick Start

From the repository root:

```bash
pnpm install
pnpm --filter @dropout/ui dev
```

The browser dev server starts on the Vite URL printed by the command. Use the full desktop app for Tauri-backed flows:

```bash
pnpm exec tauri dev
```

---

## Package Scripts

Run these from `packages/ui/` or with `pnpm --filter @dropout/ui <script>` from the repo root.

| Task | Command |
|---|---|
| Start Vite dev server | `pnpm dev` |
| Build static frontend | `pnpm build` |
| Preview built frontend | `pnpm preview` |
| Typecheck Svelte and TS config | `pnpm check` |
| Lint with Oxlint | `pnpm lint` |
| Autofix lint findings | `pnpm lint:fix` |
| Format with Oxfmt | `pnpm format` |

---

## Project Structure

```text
packages/ui/
|-- public/                 # Static public assets
|-- src/
|   |-- components/         # App views, modals, shell UI, selectors, status surfaces
|   |-- lib/                # Reusable UI widgets and visual effects
|   |-- stores/             # Svelte rune state for auth, game, instances, settings, logs, releases
|   |-- types/              # Shared TypeScript types
|   |-- App.svelte          # Top-level layout and view switching
|   |-- app.css             # Tailwind and global styling
|   `-- main.ts             # Svelte mount point
|-- svelte.config.js
|-- tsconfig*.json
`-- vite.config.ts
```

---

## State Boundaries

| Store | Responsibility |
|---|---|
| `auth.svelte.ts` | Microsoft/offline login state and logout flow |
| `game.svelte.ts` | Minecraft versions, install state, and launch actions |
| `instances.svelte.ts` | instance list, active instance, create/update/delete/duplicate flows |
| `settings.svelte.ts` | launcher settings, Java detection, visual preferences, assistant provider config |
| `logs.svelte.ts` | launcher log and game console stream |
| `releases.svelte.ts` | GitHub release feed |
| `assistant.svelte.ts` | chat history, provider health, model discovery, streaming responses |
| `ui.svelte.ts` | current view, toasts, modals, app version, console visibility |

Keep side effects in stores or Tauri commands. Components should mostly render state, collect input, and call store actions.

---

## Tauri Bridge

The UI talks to Rust through `invoke()` and Tauri plugins:

- account commands: `start_microsoft_login`, `complete_microsoft_login`, `login_offline`, `refresh_account`, `logout`
- version commands: `get_versions`, `install_version`, `check_version_installed`, `delete_version`, `start_game`
- loader commands: `get_fabric_*`, `install_fabric`, `get_forge_*`, `install_forge`
- Java commands: `detect_java`, `get_recommended_java`, `fetch_adoptium_java`, `download_adoptium_java`, `resume_java_downloads`
- instance commands: `create_instance`, `list_instances`, `set_active_instance`, `update_instance`, `duplicate_instance`, `delete_instance`
- assistant commands: `assistant_check_health`, `assistant_chat`, `assistant_chat_stream`, `list_ollama_models`, `list_openai_models`

When adding a new UI flow, update the Rust command registration, the relevant store, and the component that owns the interaction.

---

## UI Conventions

- Use Svelte 5 runes (`$state`, `$effect`, `$props`) consistently.
- Prefer `lucide-svelte` icons for actions and navigation.
- Keep desktop app behavior dark-theme first; the root app currently enforces dark mode.
- Keep commands and file paths in TypeScript constants or stores when they are shared across components.
- Use `StatusToast` and streamed logs for user-visible async feedback.
- Keep browser-only previews tolerant of missing Tauri APIs when practical, but verify real launcher flows in `pnpm exec tauri dev`.

---

## Build Output

```bash
pnpm --filter @dropout/ui build
```

The compiled frontend is written to `packages/ui/dist`. Tauri consumes that directory through `src-tauri/tauri.conf.json`:

```json
{
  "build": {
    "frontendDist": "../packages/ui/dist"
  }
}
```

---

## Links

- [Main README](../../README.md)
- [Documentation package](../docs/README.md)
- [Tauri configuration](../../src-tauri/tauri.conf.json)
- [Rust command boundary](../../src-tauri/src/main.rs)

---

## License

MIT. See the root [LICENSE](../../LICENSE).
