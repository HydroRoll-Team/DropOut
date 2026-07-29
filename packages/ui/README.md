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
```

Available fixture states are:

| Fixture | Purpose |
|---|---|
| `empty` | No account or instances |
| `ready` | Account, active Fabric instance, versions, Java, and settings |
| `downloading` | Stable active-download presentation |
| `running` | Active game process and stop action |
| `error` | Instance-index failure and recovery feedback |
| `migration` | Detected Prism/MultiMC and PCL/HMCL import sources |

Use `theme=dark` or `theme=light`. Fixture activation is guarded by `import.meta.env.DEV`; production builds ignore fixture parameters and continue to call Tauri directly.

## Regression Tests

Install Chromium once, then run the suite:

```bash
pnpm -C packages/ui exec playwright install chromium
pnpm -C packages/ui test:ui
```

The suite verifies both supported launcher window sizes (`1024x768` and `905x575`), both themes, deterministic screenshots, serious/critical WCAG violations on critical routes, and a keyboard-only launch flow. Import and raw-config editor surfaces have independent lazy routes so their heavier dependencies do not inflate the initial route.

When an intentional visual change has been reviewed at both window sizes, update and inspect the baselines before committing them:

```bash
pnpm -C packages/ui test:ui:update
```

Screenshots live under platform-specific folders in `tests/__screenshots__/`. Never update a baseline merely to silence an unexplained diff.

## Extending Fixtures

Add Tauri command responses to `src/fixtures/launcher.ts` and use the wrapper in `src/lib/launcher-runtime.ts`. Do not import fixture functions into feature code that can bypass the development guard. A new critical state should include:

- deterministic typed data with no local-machine paths or credentials;
- dark and light screenshots at both launcher sizes;
- accessibility coverage for any new route or dialog;
- a production build confirming fixture code cannot be activated there.
