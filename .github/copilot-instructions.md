# DropOut Minecraft Launcher - AI Development Guide

## Architecture Overview

**DropOut** is a Tauri v2 desktop application combining:

- **Backend (Rust)**: Game launching, asset management, authentication, mod loader installation
- **Frontend (React + Svelte)**: Active React UI in `packages/ui-new`, legacy Svelte 5 UI in `packages/ui`
- **Communication**: Tauri commands (invoke) and events (emit/listen)
- **Pre-commit Hooks**: Python-based tooling for JSON/TOML validation (managed via `pyproject.toml`)

**Key Data Flow**: Frontend invokes Rust commands → Rust processes/downloads → Rust emits progress events → Frontend updates UI via listeners

**Version Management**: `Cargo.toml` is the source of truth; `scripts/bump-tauri.ts` syncs `src-tauri/tauri.conf.json`

## Project Structure

```
src-tauri/          # Rust backend
  src/
    main.rs         # Tauri commands, game launch logic, event emissions
    core/           # Core modules (auth, downloader, fabric, forge, java, etc.)
      mod.rs        # Module declarations
      auth.rs       # Microsoft OAuth + offline auth via Device Code Flow
      downloader.rs # Concurrent downloads with progress tracking, resumable downloads
      fabric.rs     # Fabric loader installation and version management
      forge.rs      # Forge installer execution and profile generation
      java.rs       # Java detection, Adoptium download/install, catalog management
      config.rs     # LauncherConfig (memory, java path, download threads)
      game_version.rs  # Minecraft version JSON parsing
      manifest.rs   # Mojang version manifest fetching
      maven.rs      # Maven artifact URL resolution for mod loaders
      rules.rs      # OS/feature rule evaluation for libraries
      version_merge.rs # Parent version inheritance merging
    utils/
      zip.rs        # Native library extraction
packages/
  ui-new/           # React frontend used by Tauri
    src/
      main.tsx      # React Router setup (hash routing)
      pages/        # Route views (Home, Versions, Settings, ...)
      stores/       # Zustand stores
      components/   # UI components
  ui/               # Legacy Svelte 5 frontend
    src/
      App.svelte    # Main app component, enforces dark mode
      stores/       # Svelte 5 runes state management ($state, $effect)
        auth.svelte.ts    # Authentication state with device code polling
        game.svelte.ts    # Game state (running, logs)
        settings.svelte.ts  # Settings + Java detection
        ui.svelte.ts      # UI state (toasts, modals, active view)
      components/   # UI components (HomeView, VersionsView, SettingsView, etc.)
      lib/          # Reusable components (DownloadMonitor, GameConsole)
```

## Critical Development Workflows

### Development Mode

```bash
cargo tauri dev  # Runs ui-new dev server (Vite on :5173) + Tauri window
```

- `src-tauri/tauri.conf.json` runs `pnpm --filter @dropout/ui-new dev`
- Frontend uses **Rolldown-based Vite fork** (`npm:rolldown-vite@^7`) with hot reload
- Backend recompiles on Rust file changes
- Console shows both Rust stdout and frontend Vite logs
- **HMR**: WebSocket on `ws://localhost:5173`

### Pre-commit Checks

- Uses **pre-commit** with Python (configured in `pyproject.toml`)
- Hooks: JSON/TOML/YAML validation, Ruff for Python files
- Run manually: `pre-commit run --all-files`
- **IMPORTANT**: All Python tooling for CI/validation lives here, NOT for app logic

### Building

```bash
pnpm install            # Install workspace deps (requires pnpm 10, Node 22)
cargo tauri build       # Produces bundles in src-tauri/target/release/bundle/
pnpm --filter @dropout/ui-new build  # Frontend-only build
```

### Frontend Workflows

```bash
# React UI (active)
pnpm --filter @dropout/ui-new lint   # Biome check
pnpm --filter @dropout/ui-new build

# Svelte UI (legacy)
pnpm --filter @dropout/ui check      # Svelte + TS checks
pnpm --filter @dropout/ui lint       # OxLint
pnpm --filter @dropout/ui format     # OxFmt (--check for CI)
```

### Testing

- CI workflow: [`.github/workflows/test.yml`](.github/workflows/test.yml) tests on Ubuntu, Arch (Wayland), Windows, macOS
- Local: `cargo test` (run from `src-tauri/`)
- Single test: `cargo test <test_name>` (unit) or `cargo test --test <integration_name>`
- **Test workflow behavior**: Push/PR = Linux build only, `workflow_dispatch` = full multi-platform builds

## Project-Specific Patterns & Conventions

### Tauri Command Pattern

Commands in [`main.rs`](../src-tauri/src/main.rs) follow this structure:

```rust
#[tauri::command]
async fn command_name(
    window: Window,
    state: State<'_, SomeState>,
    param: Type,
) -> Result<ReturnType, String> {
    emit_log!(window, "Status message"); // Emits "launcher-log" event
    // ... async logic
    Ok(result)
}
```

**Register in `main()`:**

```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![command_name, ...])
```

### Event Communication

**Rust → Frontend (Progress/Logs):**

```rust
// In Rust
window.emit("launcher-log", "Downloading assets...")?;
window.emit("download-progress", progress_struct)?;
```

```typescript
// In Frontend (React/Svelte)
import { listen } from "@tauri-apps/api/event";
const unlisten = await listen("launcher-log", (event) => {
  console.log(event.payload);
});
```

**Frontend → Rust (Commands):**

```typescript
import { invoke } from "@tauri-apps/api/core";
const result = await invoke("start_game", { versionId: "1.20.4" });
```

### State Management (Rust)

Global state via Tauri's managed state:

```rust
pub struct ConfigState {
    pub config: Mutex<LauncherConfig>,
    pub file_path: PathBuf,
}
// In main:
.manage(ConfigState::new(&app_handle))
// In commands:
config_state: State<'_, ConfigState>
```

### State Management (Svelte 5, legacy UI)

Uses **Svelte 5 runes** (not stores) in `packages/ui`:

```typescript
// stores/auth.svelte.ts
export class AuthState {
  currentAccount = $state<Account | null>(null);  // Reactive state
  isLoginModalOpen = $state(false);

  $effect(() => {  // Side effects
    // Runs when dependencies change
  });
}
// Export singleton
export const authState = new AuthState();
```

**CRITICAL**: Stores are TypeScript classes with `$state` runes, not Svelte 4's `writable()`. Each store file exports a singleton instance.

**Store Pattern**:

- File: `packages/ui/src/stores/*.svelte.ts` (note `.svelte.ts` extension)
- Class-based with reactive `$state` properties
- Methods for actions (async operations with `invoke()`)
- Derived values with `get` accessors
- Side effects with `$effect()` (auto-tracks dependencies)

### State Management (React UI)

`packages/ui-new` uses Zustand stores in `src/stores` with `create(...)` and hook exports (e.g., `useUIStore`).

### Version Inheritance System

Modded versions (Fabric/Forge) use `inheritsFrom` field:

- [`version_merge.rs`](../src-tauri/src/core/version_merge.rs): Merges parent vanilla JSON with mod loader JSON
- [`manifest.rs`](../src-tauri/src/core/manifest.rs): `load_version()` recursively resolves inheritance
- Libraries, assets, arguments are merged from parent + modded version

### Microsoft Authentication Flow

Uses **Device Code Flow** (no redirect needed):

1. Frontend calls `start_microsoft_login()` → gets device code + URL
2. User visits URL in browser, enters code
3. Frontend calls `complete_microsoft_login()` with device code
4. Rust exchanges code → MS token → Xbox Live → XSTS → Minecraft token → profile
5. Emits `auth-progress` during the flow and stores MS refresh token

**Client ID**: `CLIENT_ID` in [`auth.rs`](../src-tauri/src/core/auth.rs) is `fe165602-5410-4441-92f7-326e10a7cb82`.

### Download System

[`downloader.rs`](../src-tauri/src/core/downloader.rs) features:

- **Concurrent downloads** with semaphore (configurable threads)
- **Resumable downloads**: `.part` + `.part.meta` files track progress
- **Multi-segment downloads**: Large files split into segments downloaded in parallel
- **Checksum verification**: SHA1/SHA256 validation
- **Progress events**: Emits `download-progress` with file/status, bytes, and totals (plus `download-start`)
- **Queue persistence**: Java downloads saved to `download_queue.json` for resumption

### Java Management

`src-tauri/src/core/java/` module:

- **Auto-detection**: PATH/JAVA_HOME plus OS-specific directories (e.g., `/usr/lib/jvm`, `/Library/Java/JavaVirtualMachines`, `Program Files\\Java`)
- **Catalog caching**: `java_catalog_cache.json` cached for 24 hours
- **Installation**: Downloads with queue persistence, extracts to `app_data_dir/java/<provider>-<major>-<jre|jdk>`
- **Download progress event**: `java-download-progress`

### Error Handling

- Commands return `Result<T, String>` (String for JS-friendly errors)
- Use `.map_err(|e| e.to_string())` to convert errors
- Emit detailed error logs: `emit_log!(window, format!("Error: {}", e))`

### File Paths

- **App data root**: `app_handle.path().app_data_dir()` (platform-specific)
- **Instance metadata**: `app_data_dir/instances.json`
- **Instance game dir**: `app_data_dir/instances/<instance_id>/`
  - Versions: `versions/<version_id>/<version_id>.json`
  - Libraries: `libraries/<maven-path>`
  - Assets: `assets/objects/<hash[0..2]>/<hash>`
- **Shared caches** (when `use_shared_caches`): `app_data_dir/{versions,libraries,assets}`
- **Config**: `app_data_dir/config.json`
- **Accounts**: `app_data_dir/accounts.json`

## Integration Points

### External APIs

- **Mojang**: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- **Fabric Meta**: `https://meta.fabricmc.net/v2/`
- **Forge Maven**: `https://maven.minecraftforge.net/`
- **Adoptium**: `https://api.adoptium.net/v3/`
- **GitHub Releases**: `https://api.github.com/repos/HsiangNianian/DropOut/releases`

### Native Dependencies

- **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` (see [test.yml](../.github/workflows/test.yml))
- **macOS**: System WebKit via Tauri
- **Windows**: WebView2 runtime (bundled)

## Common Tasks

### Adding a New Tauri Command

1. Define function in [`main.rs`](../src-tauri/src/main.rs) with `#[tauri::command]`
2. Add to `.invoke_handler(tauri::generate_handler![..., new_command])`
3. Call from frontend: `invoke("new_command", { args })`

### Adding a New UI View

- **React UI (active)**: add a page in `packages/ui-new/src/pages` and register the route in [`main.tsx`](../packages/ui-new/src/main.tsx).
- **Svelte UI (legacy)**: create component in `packages/ui/src/components`, import in [`App.svelte`](../packages/ui/src/App.svelte), update `uiState.activeView` in [`ui.svelte.ts`](../packages/ui/src/stores/ui.svelte.ts).

### Emitting Progress Events

Use `emit_log!` macro for launcher logs:

```rust
emit_log!(window, format!("Downloading {}", filename));
```

For custom events:

```rust
window.emit("custom-event", payload)?;
```

### Handling Placeholders in Arguments

Game arguments may contain `${variable}` placeholders. Use the `has_unresolved_placeholder()` helper to skip malformed arguments (see [`main.rs:57-67`](../src-tauri/src/main.rs#L57-L67)).

## Important Notes

- **Dark mode enforced (legacy UI)**: [`App.svelte`](../packages/ui/src/App.svelte) force-adds `dark` class regardless of system preference
- **Svelte 5 syntax**: Use `$state`, `$derived`, `$effect` (not `writable` stores)
- **Java launch on Windows**: Uses `CREATE_NO_WINDOW` behind `#[cfg(target_os = "windows")]`
- **Version IDs**: Fabric uses `fabric-loader-<loader>-<game>`, Forge uses `<game>-forge-<loader>`
- **Library resolution**: When `downloads.artifact` is missing, resolve via Maven coordinates in [`maven.rs`](../src-tauri/src/core/maven.rs)
- **Native extraction**: Extract to `versions/<version>/natives/`, exclude META-INF
- **Classpath order**: Libraries → Client JAR (see [`main.rs:437-453`](../src-tauri/src/main.rs#L437-L453))
- **Version management**: `Cargo.toml` version is synced to `tauri.conf.json` via `pnpm bump-tauri`
- **Frontend dependencies**: Use Node 22 + pnpm 10 (Rolldown-based Vite fork)
- **Store files**: Must have `.svelte.ts` extension, not `.ts`

## Debugging Tips

- **Rust logs**: Check terminal running `cargo tauri dev`
- **Frontend logs**: Browser devtools (Ctrl+Shift+I in Tauri window)
- **Game logs**: Listen to `game-stdout`/`game-stderr` events
- **Download issues**: Check `download-progress` events, validate SHA1 hashes
- **Auth issues**: MS WAF blocks requests without User-Agent (see [`auth.rs:6-12`](../src-tauri/src/core/auth.rs#L6-L12))

## Version Compatibility

- **Rust**: Edition 2021, requires Tauri v2 dependencies
- **Node.js**: 22+ with pnpm 10+ for frontend (uses Rolldown-based Vite fork `npm:rolldown-vite@^7`)
- **Tauri**: v2.9+
- **Svelte**: v5.46+ (runes mode)
- **Java**: Required versions come from `javaVersion` in version JSON; Java 8 is enforced as a max for old versions
- **Python**: 3.10+ for pre-commit hooks (validation only, not app logic)

## Commit Conventions

Follow instructions in [`.github/instructions/commit.instructions.md`](.github/instructions/commit.instructions.md):

- **Format**: `<type>[scope]: <description>` (lowercase, imperative, no period)
- **AI commits**: MUST include `Reviewed-by: [MODEL_NAME]`
- **Common types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`
- **Language**: Commit messages ALWAYS in English
- **Confirmation**: ALWAYS ask before committing (unless "commit directly" requested)
- See [Conventional Commits spec](.github/references/git/conventional-commit.md) for details
