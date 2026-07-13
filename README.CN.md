<p align="center">
  <img src="assets/image.png" alt="DropOut 启动器界面" width="700">
</p>

<h1 align="center">DropOut</h1>

<p align="center">
  <em>面向可复现、可检查 Minecraft 环境的确定性启动器。</em>
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
  <a href="README.md">English</a> | <b>中文</b>
</p>

---

## 这是什么

**DropOut** 是一个现代的开发者级 Minecraft 启动器，核心目标是：让一套游戏环境像软件项目一样可追踪。

大多数启动器专注于把游戏拉起来。DropOut 还关注启动之前和之后的环境状态：账户、Java 运行时、游戏版本、加载器、实例目录、资源、依赖库和启动日志。

> Minecraft 环境是复杂系统。DropOut 把它们视为版本化工作空间。

---

## 项目形态

DropOut 由三个活跃部分组成：

| 部分 | 路径 | 技术栈 | 用途 |
|---|---|---|---|
| 桌面外壳 | `src-tauri/` | Rust, Tauri 2 | 认证、下载、Java/版本解析、实例存储、启动编排 |
| 启动器 UI | `packages/ui/` | Svelte 5, Vite/Rolldown, Tailwind CSS 4 | Tauri WebView 中的主应用界面 |
| 文档站 | `packages/docs/` | Fumadocs, React 19, React Router 7 | 中英文产品文档和开发文档 |

Rust 核心负责副作用。Svelte UI 调用 Tauri 命令并渲染状态。文档包负责解释产品、架构和使用流程。

---

## 功能特性

- **Microsoft 认证** - 设备代码 OAuth、Minecraft Services 登录、令牌刷新和账户持久化。
- **离线账户** - 支持本地账户，便于测试或离线使用。
- **实例系统** - 隔离游戏目录，并支持实例备注、内存覆盖、Java 参数、版本和加载器状态。
- **Minecraft 版本管理** - 安装、校验、列出、删除并启动本地版本。
- **Fabric 和 Forge 支持** - 发现加载器版本，并为模组实例提供安装流程。
- **Java 管理** - 本地 Java 检测、兼容性检查、Adoptium 目录查询、下载、恢复和取消。
- **并发下载** - 资源和依赖库队列、进度事件和恢复路径。
- **配置编辑器** - 查看和编辑原始 JSON/TOML 启动器配置。
- **发布动态** - 在主页展示 GitHub Release 更新。
- **游戏助手** - 可选的本地或 OpenAI 兼容助手，用于日志、崩溃和配置问题。

---

## 快速开始

### 前置条件

- 通过 [rustup.rs](https://rustup.rs/) 安装 Rust 工具链
- Node.js 22+
- pnpm 10+
- 按照 [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) 安装系统依赖

### 安装依赖

```bash
pnpm install
```

`pnpm install` 会运行仓库的 `prepare` 脚本，安装本地 `prek` hooks。

### 运行桌面应用

```bash
pnpm exec tauri dev
```

Tauri 会根据 `src-tauri/tauri.conf.json` 启动 Svelte 开发服务器，并打开指向 `http://localhost:5173` 的桌面窗口。

### 构建桌面发布包

```bash
pnpm exec tauri build
```

发布产物由 Tauri 写入 Rust target 目录和配置的 bundle 目录。

### 单独运行子项目

```bash
pnpm --filter @dropout/ui dev       # 仅 UI，浏览器预览
pnpm --filter @dropout/docs dev     # 文档站
```

UI 可以在浏览器中用于布局开发，但依赖 Tauri 的功能需要在桌面外壳中验证。

---

## 常用命令

| 任务 | 命令 |
|---|---|
| 安装 workspace 依赖 | `pnpm install` |
| 运行桌面应用 | `pnpm exec tauri dev` |
| 构建桌面应用 | `pnpm exec tauri build` |
| 构建 UI | `pnpm --filter @dropout/ui build` |
| 检查 UI 类型 | `pnpm --filter @dropout/ui check` |
| Lint UI | `pnpm --filter @dropout/ui lint` |
| 运行文档站 | `pnpm --filter @dropout/docs dev` |
| 构建文档站 | `pnpm --filter @dropout/docs build` |
| 检查文档类型/内容 | `pnpm --filter @dropout/docs types:check` |
| 测试 Rust workspace | `cargo test --workspace` |

---

## 仓库结构

```text
.
|-- assets/                 # README 和项目媒体
|-- packages/
|   |-- docs/               # Fumadocs + React Router 文档站
|   `-- ui/                 # Svelte 启动器前端
|-- scripts/                # workspace 维护脚本
|-- src-tauri/              # Rust 桌面后端和 Tauri 配置
|-- Cargo.toml              # Rust workspace
|-- package.json            # pnpm workspace 元数据和根工具
`-- pnpm-workspace.yaml     # JavaScript workspace 包配置
```

---

## 架构备注

Tauri 命令边界注册在 [`src-tauri/src/main.rs`](src-tauri/src/main.rs)。核心模块位于 `src-tauri/src/core/`：

- `auth.rs` 和 `account_storage.rs` 处理 Microsoft 与离线账户状态。
- `instance.rs` 管理隔离实例目录和元数据。
- `game_version.rs`、`manifest.rs`、`version_merge.rs`、`rules.rs` 解析 Minecraft 版本和启动规则。
- `fabric.rs`、`forge.rs`、`maven.rs`、`downloader.rs` 安装加载器、依赖库、资源和版本文件。
- `java.rs` 检测并下载兼容 Java 运行时。
- `assistant.rs` 提供可选的故障排查助手能力。

UI 的长期状态放在 `packages/ui/src/stores/`，界面由 `packages/ui/src/components/` 渲染。

---

## 路线图

- [x] 账户持久化和令牌刷新
- [x] Microsoft 设备代码登录和离线登录
- [x] Java 自动检测和 Adoptium 下载流程
- [x] Fabric 和 Forge 安装路径
- [x] 隔离实例/配置文件系统
- [x] GitHub Release 集成
- [x] 可选游戏助手
- [ ] 多账户切换
- [ ] 内置模组管理器
- [ ] 自定义游戏目录选择
- [ ] 启动器自动更新
- [ ] 从 MultiMC、Prism Launcher 和其他配置导入

公开路线图见 <https://roadmap.sh/r/minecraft-launcher-dev>。

---

## 贡献

DropOut 面向长期可维护性构建。比较有价值的贡献通常集中在：

- 实例和配置文件工作流
- 模组加载器兼容性
- Java/运行时检测
- 下载器可靠性
- UI/UX 清晰度
- 文档和故障排查覆盖

使用标准 GitHub 流程：fork、创建分支、提交，然后向 [HydroRoll-Team/DropOut](https://github.com/HydroRoll-Team/DropOut) 发起 pull request。

---

## 许可证

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT (c) Hsiang Nianian
