# Drop*O*ut

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=small)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_small)
[![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)](https://github.com/pre-commit/pre-commit)
[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/HsiangNianian/DropOut/main.svg)](https://results.pre-commit.ci/latest/github/HsiangNianian/DropOut/main)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![CodeQL Advanced](https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml)
[![Dependabot Updates](https://github.com/HydroRoll-Team/DropOut/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/dependabot/dependabot-updates)
[![Semifold CI](https://github.com/HydroRoll-Team/DropOut/actions/workflows/semifold-ci.yaml/badge.svg)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/release.yml)
[![Test & Build](https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml/badge.svg)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml)

DropOut is a modern, minimalist, and efficient Minecraft launcher built with the latest web and system technologies. It leverages **Tauri v2** to deliver a lightweight application with a robust **Rust** backend and a reactive **Svelte 5** frontend.

<div align="center">
   <img width="700" src="assets/image.png" alt="DropOut Launcher Interface" />
</div>

## Features

- **High Performance**: Built with Rust and Tauri for minimal resource usage and fast startup times.
- **Modern Industrial UI**: A clean, distraction-free interface designed with **Svelte 5** and **Tailwind CSS 4**.
- **Microsoft Authentication**: Secure login support via official Xbox Live & Microsoft OAuth flows (Device Code Flow).
- **Mod Loader Support**:
  - **Fabric**: Built-in installer and version management.
  - **Forge**: Support for installing and launching Forge versions.
- **Java Management**:
  - Automatic detection of installed Java versions.
  - Built-in downloader for Adoptium JDK/JRE.
- **GitHub Integration**: View the latest project updates and changelogs directly from the launcher home screen.
- **Game Management**:
  - Complete version isolation.
  - Efficient concurrent asset and library downloading.
  - Customizable memory allocation and resolution settings.

## Roadmap

- [X] **Account Persistence** — Save login state between sessions
- [X] **Token Refresh** — Auto-refresh expired Microsoft tokens
- [X] **JVM Arguments Parsing** — Full support for `arguments.jvm` and `arguments.game` parsing
- [X] **Java Auto-detection & Download** — Scan system and download Java runtimes
- [X] **Fabric Loader Support** — Install and launch with Fabric
- [X] **Forge Loader Support** — Install and launch with Forge
- [X] **GitHub Releases Integration** — View changelogs in-app
- [ ] **Instance/Profile System** — Multiple isolated game directories with different versions/mods
- [ ] **Multi-account Support** — Switch between multiple accounts seamlessly
- [ ] **Custom Game Directory** — Allow users to choose game files location
- [ ] **Launcher Auto-updater** — Self-update mechanism via Tauri updater plugin
- [ ] **Mods Manager** — Enable/disable mods directly in the launcher
- [ ] **Import from Other Launchers** — Migration tool for MultiMC/Prism profiles

## Installation

Download the latest release for your platform from the [Releases](https://github.com/HsiangNianian/DropOut/releases) page.

| Platform       | Files                   |
| -------------- | ----------------------- |
| Linux x86_64   | `.deb`, `.AppImage` |
| Linux ARM64    | `.deb`, `.AppImage` |
| macOS ARM64    | `.dmg`                |
| Windows x86_64 | `.msi`, `.exe`      |
| Windows ARM64  | `.msi`, `.exe`      |

## Building from Source

### Prerequisites

1. **Rust**: Install from [rustup.rs](https://rustup.rs/).
2. **Node.js** & **pnpm**: Used for the frontend dependencies.
3. **System Dependencies**: Follow the [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/HsiangNianian/DropOut.git
   cd DropOut
   ```
2. **Install Frontend Dependencies**

   ```bash
   cd ui
   pnpm install
   cd ..
   ```
3. **Run in Development Mode**

   ```bash
   # This will start the frontend server and the Tauri app window
   cargo tauri dev
   ```
4. **Build Release Version**

   ```bash
   cargo tauri build
   ```

   The executable will be located in `src-tauri/target/release/`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=shield&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_shield&issueType=license)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=shield&issueType=security)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_shield&issueType=security)

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_large)

Distributed under the MIT License. See `LICENSE` for more information.
