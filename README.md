<p align="center">
  <img src="assets/image.png" alt="DropOut launcher interface" width="700">
</p>

<h1 align="center">DropOut</h1>

<p align="center">
  <em>A deterministic Minecraft launcher for reproducible, inspectable game environments.</em>
</p>

<p align="center">
  <a href="https://github.com/HydroRoll-Team/DropOut"><img src="https://img.shields.io/github/stars/HydroRoll-Team/DropOut?logo=github" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/releases"><img src="https://img.shields.io/github/v/release/HydroRoll-Team/DropOut?display_name=tag&sort=semver" alt="Latest release"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml"><img src="https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml/badge.svg" alt="Test and build"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml"><img src="https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL"></a>
  <br>
  <img src="https://img.shields.io/badge/Tauri_2-000?style=flat&logo=tauri" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Rust-000?style=flat&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/Svelte_5-000?style=flat&logo=svelte" alt="Svelte 5">
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-000?style=flat&logo=tailwindcss" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/TypeScript-000?style=flat&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/pnpm_10-000?style=flat&logo=pnpm" alt="pnpm 10">
</p>

<p align="center">
  <b>English</b> | <a href="README.CN.md">Chinese</a>
</p>

---

## What Is This

**DropOut** is a modern, developer-grade Minecraft launcher built around one idea: a game setup should be traceable like a software project.

Most launchers focus on starting the game. DropOut also keeps the surrounding environment understandable: account state, Java runtime, game version, loader, instance directory, assets, libraries, and launch logs.

> Minecraft environments are complex systems. DropOut treats them as versioned workspaces.

---

## Project Shape

DropOut is a desktop application with three active surfaces:

| Surface | Path | Stack | Purpose |
|---|---|---|---|
| Desktop shell | `src-tauri/` | Rust, Tauri 2 | Authentication, downloads, Java/version resolution, instance storage, launch orchestration |
| Launcher UI | `packages/ui/` | Svelte 5, Vite/Rolldown, Tailwind CSS 4 | Main application interface rendered inside the Tauri webview |
| Documentation | `packages/docs/` | Fumadocs, React 19, React Router 7 | Bilingual product and developer documentation |

The Rust core owns side effects. The Svelte UI invokes Tauri commands and renders state. The docs package explains the product, architecture, and user workflows.

---

## Features

- **Microsoft authentication** - device-code OAuth flow, Minecraft Services login, token refresh, and persisted account state.
- **Offline accounts** - local accounts for testing or non-network play.
- **Instance system** - isolated game directories with per-instance notes, memory overrides, Java arguments, version, and loader state.
- **Minecraft version management** - install, verify, list, delete, and launch local versions.
- **Fabric and Forge support** - loader version discovery plus installer flows for modded instances.
- **Java management** - local Java detection, compatibility checks, Adoptium catalog lookup, downloads, resume, and cancellation.
- **Concurrent downloads** - asset/library queues with progress events and recovery paths.
- **Configuration editor** - inspect and edit raw JSON/TOML launcher configuration.
- **Release feed** - GitHub release notes surfaced on the home screen.
- **Game assistant** - optional local or OpenAI-compatible helper for logs, crashes, and configuration questions.

---

## Quick Start

### Prerequisites

- Rust toolchain from [rustup.rs](https://rustup.rs/)
- Node.js 22+
- pnpm 10+
- OS dependencies from the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
pnpm install
```

`pnpm install` also runs the repository `prepare` script, which installs the local `prek` hooks.

### Run the desktop app

```bash
pnpm exec tauri dev
```

Tauri starts the Svelte dev server through `src-tauri/tauri.conf.json` and opens the desktop window at `http://localhost:5173`.

### Build a desktop release

```bash
pnpm exec tauri build
```

Release artifacts are produced by Tauri under the Rust target directory and the configured bundle target directories.

### Run package surfaces directly

```bash
pnpm --filter @dropout/ui dev       # UI only, browser preview
pnpm --filter @dropout/docs dev     # documentation site
```

The UI can run in a browser for layout work, but Tauri-only commands require the desktop shell.

---

## Common Commands

| Task | Command |
|---|---|
| Install workspace dependencies | `pnpm install` |
| Run desktop app | `pnpm exec tauri dev` |
| Build desktop app | `pnpm exec tauri build` |
| Build UI bundle | `pnpm --filter @dropout/ui build` |
| Check UI types | `pnpm --filter @dropout/ui check` |
| Lint UI | `pnpm --filter @dropout/ui lint` |
| Run docs site | `pnpm --filter @dropout/docs dev` |
| Build docs site | `pnpm --filter @dropout/docs build` |
| Check docs types/content | `pnpm --filter @dropout/docs types:check` |
| Test Rust workspace | `cargo test --workspace` |

---

## Repository Layout

```text
.
|-- assets/                 # README and project media
|-- packages/
|   |-- docs/               # Fumadocs + React Router documentation site
|   `-- ui/                 # Svelte launcher frontend
|-- scripts/                # Workspace maintenance scripts
|-- src-tauri/              # Rust desktop backend and Tauri configuration
|-- Cargo.toml              # Rust workspace
|-- package.json            # pnpm workspace metadata and root tooling
`-- pnpm-workspace.yaml     # JavaScript workspace packages
```

---

## Architecture Notes

The command boundary is registered in [`src-tauri/src/main.rs`](src-tauri/src/main.rs). Feature modules live under `src-tauri/src/core/`:

- `auth.rs` and `account_storage.rs` handle Microsoft and offline account state.
- `instance.rs` owns isolated instance directories and metadata.
- `game_version.rs`, `manifest.rs`, `version_merge.rs`, and `rules.rs` resolve Minecraft versions and launch rules.
- `fabric.rs`, `forge.rs`, `maven.rs`, and `downloader.rs` install loaders, libraries, assets, and version files.
- `java.rs` detects and downloads compatible runtimes.
- `assistant.rs` powers the optional troubleshooting assistant.

The UI keeps long-lived state in Svelte stores under `packages/ui/src/stores/`, then renders views from `packages/ui/src/components/`.

---

## Roadmap

- [x] Account persistence and token refresh
- [x] Microsoft device-code login and offline login
- [x] Java auto-detection and Adoptium download flow
- [x] Fabric and Forge install paths
- [x] Isolated instance/profile system
- [x] GitHub releases integration
- [x] Optional game assistant
- [ ] Multi-account switching
- [ ] Built-in mods manager
- [ ] Custom game directory selection
- [ ] Launcher auto-updater
- [ ] Import from MultiMC, Prism Launcher, and other profiles

The public roadmap is tracked at <https://roadmap.sh/r/minecraft-launcher-dev>.

---

## Contributing

DropOut is built for long-term maintainability. Useful contributions usually improve one of these areas:

- instance and profile workflows
- mod loader compatibility
- Java/runtime detection
- downloader reliability
- UI/UX clarity
- documentation and troubleshooting coverage

Use the standard GitHub flow: fork, branch, commit, and open a pull request against [HydroRoll-Team/DropOut](https://github.com/HydroRoll-Team/DropOut).

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT (c) Hsiang Nianian
