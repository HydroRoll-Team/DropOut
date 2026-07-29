# DropOut Launcher UI

The React launcher UI normally runs inside Tauri. Development fixtures provide deterministic browser-only states so layout, accessibility, routing, and recovery work can be reviewed without a Rust process or live launcher data.

## Setup

Run package commands from the repository root and keep the shared root lockfile authoritative:

```bash
pnpm -C packages/ui --lockfile-dir "$PWD" install --frozen-lockfile
pnpm -C packages/ui dev
```

Open a fixture with query parameters before the hash route:

```text
http://127.0.0.1:1420/?fixture=ready&theme=dark#/
http://127.0.0.1:1420/?fixture=migration&theme=light#/instances/import
http://127.0.0.1:1420/?fixture=failed&theme=dark&locale=zh-CN#/
```

Available fixture states are:

| Fixture | Purpose |
|---|---|
| `empty` | Legacy combined empty state |
| `no-account` | Instance exists but authentication blocks launch |
| `no-instance` | Account exists but no instance has been created or imported |
| `not-ready` | Active instance has no compatible Java runtime |
| `ready` | All account, instance, version, Java, memory, and file checks pass |
| `downloading` | Live game-file progress in the home command center |
| `java-download-progress` | Java runtime event progress with bounded percentage and byte formatting |
| `launching` | Launch command is assembling the runtime and process |
| `running` | Active game process with the stop action |
| `stopped` | Cleanly ended session with retained logs and relaunch action |
| `failed` | Failed session with captured diagnostic output |
| `error` | Instance-index failure and recovery feedback |
| `migration` | Detected Prism/MultiMC and PCL/HMCL import sources |

Use `theme=dark` or `theme=light`, and `locale=en` or `locale=zh-CN`. Fixture activation is guarded by `import.meta.env.DEV`; production builds ignore fixture parameters and continue to call Tauri directly.

The home command center does not infer readiness from frontend configuration alone. `get_launch_readiness` reuses the backend's real Java priority and compatibility rules, while `download-start`, `download-progress`, `download-complete`, `launcher-log`, `game-stdout`, `game-stderr`, and `game-exited` events keep progress and recovery details live.

## Regression Tests

Install Chromium once, then run the suite:

```bash
pnpm -C packages/ui exec playwright install chromium
pnpm -C packages/ui test:ui
```

The suite verifies both supported launcher window sizes (`1024x768` and `905x575`), both themes, every launch/recovery state, deterministic screenshots, English and Chinese rendering, reduced motion, accessible names/image alternatives/unique IDs on critical routes, and keyboard-only navigation and launch flows. Import and raw-config editor surfaces have independent lazy routes so their heavier dependencies do not inflate the initial route.

When an intentional visual change has been reviewed at both window sizes, update and inspect the baselines before committing them:

```bash
pnpm -C packages/ui test:ui:update
```

Screenshots live under platform-specific folders in `tests/__screenshots__/`. Never update a baseline merely to silence an unexplained diff.

## Extending Fixtures

Add Tauri command responses to the centralized switch in `src/fixtures/launcher.ts` and use the wrapper in `src/lib/launcher-runtime.ts`. Unsupported commands deliberately throw with the command name so fixture drift fails fast. Do not import fixture functions into feature code that can bypass the development guard. A new critical state should include:

- deterministic typed data with no local-machine paths or credentials;
- dark and light screenshots at both launcher sizes;
- accessibility coverage for any new route or dialog;
- a production build confirming fixture code cannot be activated there.
