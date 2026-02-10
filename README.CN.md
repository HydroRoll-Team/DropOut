# Drop*O*ut

[English](README.md) | 中文

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=small)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_small)
[![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)](https://github.com/pre-commit/pre-commit)
[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/HsiangNianian/DropOut/main.svg)](https://results.pre-commit.ci/latest/github/HsiangNianian/DropOut/main)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![CodeQL Advanced](https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml)
[![Dependabot Updates](https://github.com/HydroRoll-Team/DropOut/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/dependabot/dependabot-updates)
[![Semifold CI](https://github.com/HydroRoll-Team/DropOut/actions/workflows/semifold-ci.yaml/badge.svg)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/release.yml)
[![Test & Build](https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml/badge.svg)](https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml)

DropOut 是一个现代的、可复现的、开发者级别的 Minecraft 启动器。
它不仅仅是为了启动 Minecraft 而设计的，而是将 Minecraft 环境作为确定性的、版本化的工作空间进行管理。

使用 Tauri v2 和 Rust 构建，DropOut 提供原生性能和最小资源使用，并配有现代响应式 Web UI（目前使用 Svelte 5，正在迁移到 React）。

> Minecraft 环境是一个复杂的系统。
> DropOut 将它们视为软件项目。

<div align="center">
   <img width="700" src="assets/image.png" alt="DropOut Launcher Interface" />
</div>

## 为什么选择 DropOut？

大多数 Minecraft 启动器专注于让你进入游戏。
DropOut 专注于保持你的游戏稳定、可调试和可重现。

- 整合包昨天还能游玩，今天却坏了？
→ DropOut 让它可追溯。

- 分享模组包意味着压缩数 GB 的文件？
→ DropOut 分享精确的依赖清单。

- Java、加载器、模组、配置不同步？
→ DropOut 将它们锁定在一起。

这个启动器是为重视控制、透明度和长期稳定性的玩家构建的。

## 功能特性

- **高性能**：使用 Rust 和 Tauri 构建，实现最小资源使用和快速启动时间。
- **现代工业 UI**：使用 **Svelte 5** 和 **Tailwind CSS 4** 设计的干净、无干扰界面。
- **Microsoft 认证**：通过官方 Xbox Live 和 Microsoft OAuth 流程（设备代码流程）提供安全登录支持。
- **模组加载器支持**：
  - **Fabric**：内置安装程序和版本管理。
  - **Forge**：支持安装和启动 Forge 版本。
- **Java 管理**：
  - 自动检测已安装的 Java 版本。
  - 内置 Adoptium JDK/JRE 下载器。
- **GitHub 集成**：直接从启动器主页查看最新的项目更新和变更日志。
- **游戏管理**：
  - 完整的版本隔离。
  - 高效的并发资产和库下载。
  - 可自定义的内存分配和分辨率设置。

## 路线图

- [X] **账户持久化** — 在会话之间保存登录状态
- [X] **令牌刷新** — 自动刷新过期的 Microsoft 令牌
- [X] **JVM 参数解析** — 完全支持 `arguments.jvm` 和 `arguments.game` 解析
- [X] **Java 自动检测和下载** — 扫描系统并下载 Java 运行时
- [X] **Fabric 加载器支持** — 使用 Fabric 安装和启动
- [X] **Forge 加载器支持** — 使用 Forge 安装和启动
- [X] **GitHub 发布集成** — 在应用内查看变更日志
- [ ] **实例/配置文件系统** — 多个隔离的游戏目录，具有不同的版本/模组
- [ ] **多账户支持** — 在多个账户之间无缝切换
- [ ] **自定义游戏目录** — 允许用户选择游戏文件位置
- [ ] **启动器自动更新** — 通过 Tauri 更新插件的自更新机制
- [ ] **模组管理器** — 直接在启动器中启用/禁用模组
- [ ] **从其他启动器导入** — MultiMC/Prism 配置的迁移工具

## 安装

从 [Releases](https://github.com/HsiangNianian/DropOut/releases) 页面下载适用于您平台的最新版本。

| 平台          | 文件                    |
| -------------- | ----------------------- |
| Linux x86_64   | `.deb`, `.AppImage` |
| Linux ARM64    | `.deb`, `.AppImage` |
| macOS ARM64    | `.dmg`                |
| Windows x86_64 | `.msi`, `.exe`      |
| Windows ARM64  | `.msi`, `.exe`      |

## 从源码构建

### 先决条件

1. **Rust**：从 [rustup.rs](https://rustup.rs/) 安装。
2. **Node.js** 和 **pnpm**：用于前端依赖。
3. **系统依赖**：按照您的操作系统遵循 [Tauri 先决条件](https://v2.tauri.app/start/prerequisites/)。

### 步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/HsiangNianian/DropOut.git
   cd DropOut
   ```

2. **安装前端依赖**

   ```bash
   cd ui
   pnpm install
   cd ..
   ```

3. **运行开发模式**

   ```bash
   # 这将启动前端服务器和 Tauri 应用窗口
   cargo tauri dev
   ```

4. **构建发布版本**

   ```bash
   cargo tauri build
   ```

   可执行文件将位于 `src-tauri/target/release/`。

## 贡献

DropOut 以长期可维护性为目标构建。
欢迎贡献，尤其在这些领域：

- 实例系统设计
- 模组兼容性工具
- UI/UX 改进
- 跨启动器迁移工具

标准的 GitHub 工作流程适用：
fork → 功能分支 → 拉取请求。

## 许可证

根据 MIT 许可证分发。有关更多信息，请参见 `LICENSE`。

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=shield&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_shield&issueType=license)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=shield&issueType=security)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_shield&issueType=security)

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FHsiangNianian%2FDropOut?ref=badge_large)
