# Changelog

## v0.1.0-alpha.4

### Refactors

- [`5b799a1`](https://github.com/HydroRoll-Team/DropOut/commit/5b799a125a970e5e56f29a08b3c86450855fb6c4): Full rewrite instance create with stepper page instead of modal. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)
- [`ffbfce8`](https://github.com/HydroRoll-Team/DropOut/commit/ffbfce895c37e8e8306d426a2e59e73647ed6a86): Refactor game store and rename `HomePage` component. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)
- [`18aceb4`](https://github.com/HydroRoll-Team/DropOut/commit/18aceb4ddf01e964d0b81a4e926e42b72c64e355): Rewrite `ParticleBackground` to modern component design instead of global `window` api call. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)
- [`97fe504`](https://github.com/HydroRoll-Team/DropOut/commit/97fe5046f68b5e4ee5f750945bcc39a27f5eb37b): Rewrite effect instance nullish checking. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)

### Chores

- [`ef478b2`](https://github.com/HydroRoll-Team/DropOut/commit/ef478b29605afbd1c3ec88184b64960e8ad01e71): Fix vite config to integrate with Tauri. ([#128](https://github.com/HydroRoll-Team/DropOut/pull/128) by @fu050409)

### New Features

- [`32a4d85`](https://github.com/HydroRoll-Team/DropOut/commit/32a4d85af937e4fd882fa671aee8b72878cc564f): Remove all legacy codes in `stores/`. ([#129](https://github.com/HydroRoll-Team/DropOut/pull/129) by @fu050409)

## v0.1.0-alpha.3

### Refactors

- [`24a229e`](https://github.com/HydroRoll-Team/DropOut/commit/24a229ede321e8296ea99b332ccfa61213791d10): Partial rewrite layout of instances page.

### Bug Fixes

- [`9e40b5b`](https://github.com/HydroRoll-Team/DropOut/commit/9e40b5b7bea60e6802a4b448ef315b14fba4de7f): Auto select game version if version is unique.

### New Features

- [`0ac743f`](https://github.com/HydroRoll-Team/DropOut/commit/0ac743f6d126d047352e6b247ea1ee513361d240): Improve sidebar avatar on large and small screens.
- [`9e40b5b`](https://github.com/HydroRoll-Team/DropOut/commit/9e40b5b7bea60e6802a4b448ef315b14fba4de7f): Support detect and select java path.
- [`47aeabf`](https://github.com/HydroRoll-Team/DropOut/commit/47aeabf5d44d7483101d30d289cb4c56761e3faa): Improve position and colors of the UI toast.

## v0.1.0-alpha.2

### Chores

- [`2cef6e8`](https://github.com/HydroRoll-Team/DropOut/commit/2cef6e86b4fd45549ee2a4f7ea54a142690117d2): Fix version of `@dropout/ui`.

## v0.0.0-alpha.1

### New Features

- [`120c0a4`](https://github.com/HydroRoll-Team/DropOut/commit/120c0a460162226446cce4cfbc4c7e5859cd9d09): Listen to `game-exited` event while launching game.

### Refactors

- [`d95ca28`](https://github.com/HydroRoll-Team/DropOut/commit/d95ca2801c19a89a2a845f43b6e0133bf4e9be50): Migrate tauri invokes of instance creation modal to generated client.

## v0.0.0-alpha.0

### Refactors

- [`66668d8`](https://github.com/HydroRoll-Team/DropOut/commit/66668d85d603c5841d755a6023aa1925559fc6d4): Partial rewrite UI to react port. ([#77](https://github.com/HydroRoll-Team/DropOut/pull/77) by @HsiangNianian)
