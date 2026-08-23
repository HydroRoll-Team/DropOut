# Changelog

<!-- semifold:release version=0.2.0-rc.2 -->
## v0.2.0-rc.2

### Bug Fixes

- [`37d7f9e`](https://github.com/HydroRoll-Team/DropOut/commit/37d7f9e20f653e203aff9667f59244ae6bcf467f): Align the Tauri CLI with the Rust runtime so Linux packages retain the bundle-type metadata required by the updater. ([#216](https://github.com/HydroRoll-Team/DropOut/pull/216) by @fu050409)
<!-- semifold:release:end -->

## v0.2.0-rc.1

### New Features

- [`e0cc80d`](https://github.com/HydroRoll-Team/DropOut/commit/e0cc80d269d13f244c932b64efe51b3a11228eeb): Add a machine-checked 42-row launcher parity audit, bilingual RC1 evidence guides, isolated installer smoke tests across every supported desktop target, and durable release-manifest synchronization. ([#203](https://github.com/HydroRoll-Team/DropOut/pull/203) by @HsiangNianian)

## v0.2.0-beta.2

### New Features

- [`4ff6565`](https://github.com/HydroRoll-Team/DropOut/commit/4ff6565ac4182951a576e25e84a8516464356846): Add preview-first Minecraft and loader conversion with Modrinth compatibility matching, protected instance copies, explicit exclusions, replacement downloads, rollback, bilingual guidance, and deterministic UI coverage. ([#201](https://github.com/HydroRoll-Team/DropOut/pull/201) by @HsiangNianian)

## v0.2.0-beta.1

### New Features

- [`16caec4`](https://github.com/HydroRoll-Team/DropOut/commit/16caec400ca073a7308cae9738446196d29c0daf): Add adaptive per-instance memory recommendations, runtime pressure safeguards, and a final pre-launch memory check. ([#190](https://github.com/HydroRoll-Team/DropOut/pull/190) by @HsiangNianian)
- [`dc50032`](https://github.com/HydroRoll-Team/DropOut/commit/dc50032335d7464c839630e123514d1e12883391): Add a consent-gated diagnostic assistant with redacted evidence previews, bounded provider requests, and cancellable request-isolated streaming. ([#189](https://github.com/HydroRoll-Team/DropOut/pull/189) by @HsiangNianian)

## v0.2.0-alpha.9

### New Features

- [`28bcde5`](https://github.com/HydroRoll-Team/DropOut/commit/28bcde590d624ff729f73214455902404854b37f): Add a native system tray lifecycle with readiness-aware recent launches, download progress badges, background notifications, and bilingual guidance. ([#187](https://github.com/HydroRoll-Team/DropOut/pull/187) by @HsiangNianian)
- [`601f190`](https://github.com/HydroRoll-Team/DropOut/commit/601f19016a1e315fe8910dc15b8d1e8ddcf12bf0): Add signed build provenance for desktop artifacts and a reproducible Alpine musl archive that is checksum-verified and smoke-tested from the packaged release in a clean runtime image. ([#188](https://github.com/HydroRoll-Team/DropOut/pull/188) by @HsiangNianian)

## v0.2.0-alpha.8

### New Features

- [`7e006c2`](https://github.com/HydroRoll-Team/DropOut/commit/7e006c2b1a390142fb078fe64b9d0a149770ce20): Add reviewed, copy-only Prism, MultiMC, PCL, and HMCL migration with cross-platform discovery, launcher configuration/save archives, metadata and isolated-version preservation, cancellation, rollback, loader-aware compatibility reports, traversal-safe extraction, versioned fixtures, and bilingual guidance. ([#186](https://github.com/HydroRoll-Team/DropOut/pull/186) by @HsiangNianian)

## v0.2.0-alpha.7

### New Features

- [`7195bc2`](https://github.com/HydroRoll-Team/DropOut/commit/7195bc21d7226b015b448136347e107480affd5d): Replace the raw configuration textarea with a locally bundled, schema-aware Monaco JSON editor and safe editing workflows. ([#183](https://github.com/HydroRoll-Team/DropOut/pull/183) by @HsiangNianian)
- [`7195bc2`](https://github.com/HydroRoll-Team/DropOut/commit/7195bc21d7226b015b448136347e107480affd5d): Add a searchable and sortable instance library with scalable views, progressive readiness, detail workflows, and guarded management actions. ([#183](https://github.com/HydroRoll-Team/DropOut/pull/183) by @HsiangNianian)
- [`7195bc2`](https://github.com/HydroRoll-Team/DropOut/commit/7195bc21d7226b015b448136347e107480affd5d): Add deterministic browser fixtures, route code splitting, accessibility checks, and reviewed cross-platform visual regression baselines. ([#183](https://github.com/HydroRoll-Team/DropOut/pull/183) by @HsiangNianian)
- [`7195bc2`](https://github.com/HydroRoll-Team/DropOut/commit/7195bc21d7226b015b448136347e107480affd5d): Redesign Home as a state-driven launch readiness, progress, logging, and recovery command center. ([#183](https://github.com/HydroRoll-Team/DropOut/pull/183) by @HsiangNianian)

## v0.2.0-alpha.6

### Refactors

- [`5b799a1`](https://github.com/HydroRoll-Team/DropOut/commit/5b799a125a970e5e56f29a08b3c86450855fb6c4): Full rewrite instance create with stepper page instead of modal. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)
- [`ffbfce8`](https://github.com/HydroRoll-Team/DropOut/commit/ffbfce895c37e8e8306d426a2e59e73647ed6a86): Refactor game store and rename `HomePage` component. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)
- [`18aceb4`](https://github.com/HydroRoll-Team/DropOut/commit/18aceb4ddf01e964d0b81a4e926e42b72c64e355): Rewrite `ParticleBackground` to modern component design instead of global `window` api call. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)
- [`97fe504`](https://github.com/HydroRoll-Team/DropOut/commit/97fe5046f68b5e4ee5f750945bcc39a27f5eb37b): Rewrite effect instance nullish checking. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)

### New Features

- [`32a4d85`](https://github.com/HydroRoll-Team/DropOut/commit/32a4d85af937e4fd882fa671aee8b72878cc564f): Remove all legacy codes in `stores/`. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)

### Chores

- [`ef478b2`](https://github.com/HydroRoll-Team/DropOut/commit/ef478b29605afbd1c3ec88184b64960e8ad01e71): Fix vite config to integrate with Tauri. ([#128](https://github.com/HydroRoll-Team/DropOut/pull/128) by @fu050409)

## v0.2.0-alpha.5

### New Features

- [`0ac743f`](https://github.com/HydroRoll-Team/DropOut/commit/0ac743f6d126d047352e6b247ea1ee513361d240): Improve sidebar avatar on large and small screens.
- [`9e40b5b`](https://github.com/HydroRoll-Team/DropOut/commit/9e40b5b7bea60e6802a4b448ef315b14fba4de7f): Support detect and select java path.
- [`47aeabf`](https://github.com/HydroRoll-Team/DropOut/commit/47aeabf5d44d7483101d30d289cb4c56761e3faa): Improve position and colors of the UI toast.

### Chores

- [`8a4133c`](https://github.com/HydroRoll-Team/DropOut/commit/8a4133c9c517556cd16c2bbc1cd20bf4ee8f52f0): Update README file
- [`0ffa00e`](https://github.com/HydroRoll-Team/DropOut/commit/0ffa00eb79f06d877c74925b3da4abb0e25370ec): Remove unnecessary vsc extension svelte

### Refactors

- [`24a229e`](https://github.com/HydroRoll-Team/DropOut/commit/24a229ede321e8296ea99b332ccfa61213791d10): Partial rewrite layout of instances page.

### Bug Fixes

- [`47aeabf`](https://github.com/HydroRoll-Team/DropOut/commit/47aeabf5d44d7483101d30d289cb4c56761e3faa): Fix logo on Linux and MacOS.
- [`9e40b5b`](https://github.com/HydroRoll-Team/DropOut/commit/9e40b5b7bea60e6802a4b448ef315b14fba4de7f): Auto select game version if version is unique.

## v0.2.0-alpha.4

### Chores

- [`2cef6e8`](https://github.com/HydroRoll-Team/DropOut/commit/2cef6e86b4fd45549ee2a4f7ea54a142690117d2): Fix version of `@dropout/ui`.

## v0.2.0-alpha.3

### New Features

- [`26f299f`](https://github.com/HydroRoll-Team/DropOut/commit/26f299f1e2da116a8702a87e887e17ba3f822d64): Improve tauri app name from `dropout` to `Dropout Launcher`.

### Chores

- [`7edccaf`](https://github.com/HydroRoll-Team/DropOut/commit/7edccaf1be357c0a2619a87bc1767bc6c8a95954): Release Dropout to AUR.

## v0.2.0-alpha.2

### New Features

- [`ef56081`](https://github.com/HydroRoll-Team/DropOut/commit/ef560813c68c113325d8d84ff13cd419eb6583df): Add `ts-rs` for generating TypeScript bindings. ([#77](https://github.com/HydroRoll-Team/DropOut/pull/77) by @HsiangNianian)

## v0.2.0-alpha.1

### New Features

- [`e7ac28c`](https://github.com/HydroRoll-Team/DropOut/commit/e7ac28c6b8467a8fca0a3b61ba498e4742d3a718): Prepare for alpha mode pre-release. ([#62](https://github.com/HydroRoll-Team/DropOut/pull/62) by @fu050409)
