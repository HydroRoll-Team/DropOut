# DropOut Minecraft Launcher - AI Development Guide

## Architecture Overview

**DropOut** is a Tauri v2 desktop application combining:
- **Backend (Rust)**: Game launching, asset management, authentication, mod loader installation
- **Frontend (Svelte 5)**: Reactive UI with Tailwind CSS 4 and particle effects
- **Communication**: Tauri commands (invoke) and events (emit/listen)
- **Pre-commit Hooks**: Python-based tooling for JSON/TOML validation (managed via `pyproject.toml`)

**Key Data Flow**: Frontend invokes Rust commands → Rust processes/downloads → Rust emits progress events → Frontend updates UI via listeners

**Version Management**: Uses `_version.py` for single source of truth, synced to `Cargo.toml` (0.1.24) and `tauri.conf.json`

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
ui/                 # Svelte 5 frontend
  src/
    App.svelte      # Main app component, enforces dark mode
    stores/         # Svelte 5 runes state management ($state, $effect)
      auth.svelte.ts    # Authentication state with device code polling
      game.svelte.ts    # Game state (running, logs)
      settings.svelte.ts  # Settings + Java detection
      ui.svelte.ts      # UI state (toasts, modals, active view)
    components/     # UI components (HomeView, VersionsView, SettingsView, etc.)
    lib/            # Reusable components (DownloadMonitor, GameConsole)
```

## Critical Development Workflows

### Development Mode
```bash
cargo tauri dev  # Starts frontend dev server (Vite on :5173) + Tauri window
```
- Frontend uses **Rolldown-based Vite fork** (`npm:rolldown-vite@7.2.5`) with hot reload
- Backend recompiles on Rust file changes
- Console shows both Rust stdout and frontend Vite logs
- **Vite Config**: Uses `usePolling: true` for watch compatibility with Tauri
- **HMR**: WebSocket on `ws://localhost:5173`

### Pre-commit Checks
- Uses **pre-commit** with Python (configured in `pyproject.toml`)
- Hooks: JSON/TOML/YAML validation, Ruff for Python files
- Run manually: `pre-commit run --all-files`
- **IMPORTANT**: All Python tooling for CI/validation lives here, NOT for app logic

### Building
```bash
cd ui && pnpm install  # Install frontend dependencies (requires pnpm 9, Node 22)
cargo tauri build      # Produces platform bundles in src-tauri/target/release/bundle/
```

### Frontend Workflows
```bash
cd ui
pnpm check         # Svelte type checking + TypeScript validation
pnpm lint          # OxLint for code quality
pnpm format        # OxFmt for formatting (--check for CI)
```

### Testing
- CI workflow: [`.github/workflows/test.yml`](.github/workflows/test.yml) tests on Ubuntu, Arch (Wayland), Windows, macOS
- Local: `cargo test` (no comprehensive test suite exists yet)
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
// In Frontend (Svelte)
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

### State Management (Svelte 5)
Uses **Svelte 5 runes** (not stores):
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
- File: `stores/*.svelte.ts` (note `.svelte.ts` extension)
- Class-based with reactive `$state` properties
- Methods for actions (async operations with `invoke()`)
- Derived values with `get` accessors
- Side effects with `$effect()` (auto-tracks dependencies)

### Version Inheritance System
Modded versions (Fabric/Forge) use `inheritsFrom` field:
- [`version_merge.rs`](../src-tauri/src/core/version_merge.rs): Merges parent vanilla JSON with mod loader JSON
- [`manifest.rs`](../src-tauri/src/core/manifest.rs): `load_version()` recursively resolves inheritance
- Libraries, assets, arguments are merged from parent + modded version

### Microsoft Authentication Flow
Uses **Device Code Flow** (no redirect needed):
1. Frontend calls `start_microsoft_login()` → gets device code + URL
2. User visits URL in browser, enters code
3. Frontend polls `complete_microsoft_login()` with device code
4. Rust exchanges code → MS token → Xbox Live → XSTS → Minecraft token
5. Stores MS refresh token for auto-refresh (see [`auth.rs`](../src-tauri/src/core/auth.rs))

**Client ID**: Uses ATLauncher's public client ID (`c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb`)

### Download System
[`downloader.rs`](../src-tauri/src/core/downloader.rs) features:
- **Concurrent downloads** with semaphore (configurable threads)
- **Resumable downloads**: `.part` + `.part.meta` files track progress
- **Multi-segment downloads**: Large files split into segments downloaded in parallel
- **Checksum verification**: SHA1/SHA256 validation
- **Progress events**: Emits `download-progress` with file name, bytes, ETA
- **Queue persistence**: Java downloads saved to `download_queue.json` for resumption

### Java Management
[`java.rs`](../src-tauri/src/core/java.rs):
- **Auto-detection**: Scans `/usr/lib/jvm`, `/Library/Java`, `JAVA_HOME`, `PATH`
- **Adoptium API**: Fetches available JDK/JRE versions for current OS/arch
- **Catalog caching**: `java_catalog.json` cached for 24 hours
- **Installation**: Downloads, extracts to `app_data_dir/java/<version>`
- **Cancellation**: Global `AtomicBool` flag for download cancellation

### Error Handling
- Commands return `Result<T, String>` (String for JS-friendly errors)
- Use `.map_err(|e| e.to_string())` to convert errors
- Emit detailed error logs: `emit_log!(window, format!("Error: {}", e))`

### File Paths
- **Game directory**: `app_handle.path().app_data_dir()` (~/.local/share/com.dropout.launcher on Linux)
- **Versions**: `game_dir/versions/<version_id>/<version_id>.json`
- **Libraries**: `game_dir/libraries/<maven-path>`
- **Assets**: `game_dir/assets/objects/<hash[0..2]>/<hash>`
- **Config**: `game_dir/config.json`
- **Accounts**: `game_dir/accounts.json`

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
1. Create component in `ui/src/components/NewView.svelte`
2. Import in [`App.svelte`](../ui/src/App.svelte)
3. Add navigation in [`Sidebar.svelte`](../ui/src/components/Sidebar.svelte)
4. Update `uiState.activeView` in [`ui.svelte.ts`](../ui/src/stores/ui.svelte.ts)

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

- **Dark mode enforced**: [`App.svelte`](../ui/src/App.svelte) force-adds `dark` class regardless of system preference
- **Svelte 5 syntax**: Use `$state`, `$derived`, `$effect` (not `writable` stores)
- **No CREATE_NO_WINDOW on non-Windows**: Use `#[cfg(target_os = "windows")]` for Windows-specific code
- **Version IDs**: Fabric uses `fabric-loader-<loader>-<game>`, Forge uses `<game>-forge-<loader>`
- **Mod loader libraries**: Don't have `downloads.artifact`, use Maven resolution via [`maven.rs`](../src-tauri/src/core/maven.rs)
- **Native extraction**: Extract to `versions/<version>/natives/`, exclude META-INF
- **Classpath order**: Libraries → Client JAR (see [`main.rs:437-453`](../src-tauri/src/main.rs#L437-L453))
- **Version management**: Single source in `_version.py`, synced to Cargo.toml and tauri.conf.json
- **Frontend dependencies**: Must use pnpm 9 + Node 22 (uses Rolldown-based Vite fork)
- **Store files**: Must have `.svelte.ts` extension, not `.ts`

## Debugging Tips

- **Rust logs**: Check terminal running `cargo tauri dev`
- **Frontend logs**: Browser devtools (Ctrl+Shift+I in Tauri window)
- **Game logs**: Listen to `game-stdout`/`game-stderr` events
- **Download issues**: Check `download-progress` events, validate SHA1 hashes
- **Auth issues**: MS WAF blocks requests without User-Agent (see [`auth.rs:6-12`](../src-tauri/src/core/auth.rs#L6-L12))

## Version Compatibility

- **Rust**: Edition 2021, requires Tauri v2 dependencies
- **Node.js**: 22+ with pnpm 9+ for frontend (uses Rolldown-based Vite fork `npm:rolldown-vite@7.2.5`)
- **Tauri**: v2.9+
- **Svelte**: v5.46+ (runes mode)
- **Java**: Supports detection of Java 8-23+, recommends Java 17+ for modern Minecraft
- **Python**: 3.10+ for pre-commit hooks (validation only, not app logic)

## Commit Conventions

Follow instructions in [`.github/instructions/commit.instructions.md`](.github/instructions/commit.instructions.md):
- **Format**: `<type>[scope]: <description>` (lowercase, imperative, no period)
- **AI commits**: MUST include `Reviewed-by: [MODEL_NAME]`
- **Common types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`
- **Language**: Commit messages ALWAYS in English
- **Confirmation**: ALWAYS ask before committing (unless "commit directly" requested)
- See [Conventional Commits spec](.github/references/git/conventional-commit.md) for details
