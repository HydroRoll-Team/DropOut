<p align="center">
  <img src="assets/image.png" alt="DropOut 启动器界面" width="700">
</p>

<h1 align="center">DropOut</h1>

<p align="center">
  <em>面向可复现、可检查 Minecraft 环境的确定性启动器。</em>
</p>

<p align="center">
  <a href="https://github.com/HydroRoll-Team/DropOut"><img src="https://img.shields.io/github/stars/HydroRoll-Team/DropOut?logo=github" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-65a30d?style=flat" alt="AGPL-3.0 license"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/releases"><img src="https://img.shields.io/github/v/release/HydroRoll-Team/DropOut?display_name=tag&sort=semver" alt="Latest release"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml"><img src="https://github.com/HydroRoll-Team/DropOut/actions/workflows/test.yml/badge.svg" alt="Test and build"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml"><img src="https://github.com/HydroRoll-Team/DropOut/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL"></a>
  <a href="https://github.com/HydroRoll-Team/DropOut/actions/workflows/semifold-ci.yaml"><img src="https://github.com/HydroRoll-Team/DropOut/actions/workflows/semifold-ci.yaml/badge.svg" alt="Semifold CI"></a>
  <br>
  <img src="https://img.shields.io/badge/Tauri_2-000?style=flat&logo=tauri" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Rust-000?style=flat&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/React_19-000?style=flat&logo=react" alt="React 19">
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
| 启动器 UI | `packages/ui/` | React 19, shadcn/ui, Vite/Rolldown, Tailwind CSS 4 | Tauri WebView 中的主应用界面 |
| 文档站 | `packages/docs/` | Fumadocs, React 19, React Router 7 | 中英文产品文档和开发文档 |

Rust 核心负责副作用。React UI 调用 Tauri 命令并渲染状态。文档包负责解释产品、架构和使用流程。

---

## 功能特性

- **Microsoft 认证** - 设备代码 OAuth、Minecraft Services 登录、令牌刷新和账户持久化。
- **离线账户** - 支持本地账户，便于测试或离线使用。
- **启动指挥中心** - 依据真实就绪检查，用同一个主操作完成登录、修复、下载、启动、停止和失败恢复。
- **实例库** - 支持搜索、排序、网格/列表视图、渐进就绪检查、当前实例详情和带保护的管理操作。
- **实例系统** - 隔离游戏目录，并支持实例备注、内存与 Java 覆盖、版本、加载器、模组、存档和迁移入口。
- **自动内存** - 根据实时可用内存和模组数量分配堆内存，保护系统余量，在启动前检查压力，并支持实例覆盖。
- **Minecraft 版本管理** - 安装、校验、列出、删除并启动本地版本。
- **Fabric 和 Forge 支持** - 发现加载器版本，并为模组实例提供安装流程。
- **Java 管理** - 本地 Java 检测、兼容性检查、Adoptium 目录查询、下载、恢复和取消。
- **并发下载** - 资源和依赖库队列、进度事件和恢复路径。
- **配置编辑器** - 使用本地打包的 Monaco 编辑 JSON，并提供 Schema 诊断、格式化、键盘保存和放弃更改保护。
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

这个仓库不使用 `pnpm-workspace.yaml`。每个 JavaScript 包都需要基于根目录 lockfile 安装依赖：

```bash
pnpm install
pnpm -C packages/ui --lockfile-dir "$PWD" install
pnpm -C packages/docs --lockfile-dir "$PWD" install
```

`pnpm install` 会运行仓库的 `prepare` 脚本，安装本地 `prek` hooks。

### 运行桌面应用

```bash
pnpm exec tauri dev
```

Tauri 会根据 `src-tauri/tauri.conf.json` 启动 React 开发服务器，并打开指向 `http://localhost:1420` 的桌面窗口。

### 构建桌面发布包

```bash
pnpm exec tauri build
```

发布产物由 Tauri 写入 Rust target 目录和配置的 bundle 目录。

### 单独运行子项目

```bash
pnpm -C packages/ui dev
pnpm -C packages/docs dev
```

UI 可以在浏览器中用于布局开发，但依赖 Tauri 的功能需要在桌面外壳中验证。
需要可重复的纯浏览器 UI 开发环境时，请使用 [packages/ui/README.md](packages/ui/README.md) 中的开发 fixture 与 Playwright 流程。

---

## 常用命令

| 任务 | 命令 |
|---|---|
| 安装根工具依赖 | `pnpm install` |
| 安装 UI 依赖 | `pnpm -C packages/ui --lockfile-dir "$PWD" install` |
| 安装文档站依赖 | `pnpm -C packages/docs --lockfile-dir "$PWD" install` |
| 运行桌面应用 | `pnpm exec tauri dev` |
| 构建桌面应用 | `pnpm exec tauri build` |
| 运行 UI 开发服务器 | `pnpm -C packages/ui dev` |
| 构建 UI | `pnpm -C packages/ui build` |
| Lint UI | `pnpm -C packages/ui lint` |
| 测试 UI fixture、无障碍与截图 | `pnpm -C packages/ui test:ui` |
| 更新已人工复核的 UI 截图基线 | `pnpm -C packages/ui test:ui:update` |
| 运行文档站 | `pnpm -C packages/docs dev` |
| 构建文档站 | `pnpm -C packages/docs build` |
| 检查文档类型/内容 | `pnpm -C packages/docs types:check` |
| 验证 Cloudflare 文档站部署 | `pnpm deploy:docs:dry-run` |
| 部署文档站到 Cloudflare Workers | `pnpm deploy:docs` |
| 测试 Rust workspace | `cargo test --workspace` |

部署维护说明见 [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md)。

---

## 仓库结构

```text
.
|-- assets/                 # README 和项目媒体
|-- crates/                 # Rust 辅助 crate 和宏
|-- packages/
|   |-- docs/               # Fumadocs + React Router 文档站
|   `-- ui/                 # React 启动器前端
|-- scripts/                # 发布和维护脚本
|-- src-tauri/              # Rust 桌面后端和 Tauri 配置
|-- Cargo.toml              # Rust workspace
|-- package.json            # 根工具配置
`-- pnpm-lock.yaml          # 共享 pnpm lockfile
```

---

## 架构备注

Tauri 命令边界注册在 [`src-tauri/src/main.rs`](src-tauri/src/main.rs)。核心模块位于 `src-tauri/src/core/`：

- `auth.rs` 和 `account_storage.rs` 处理 Microsoft 与离线账户状态。
- `instance.rs` 管理隔离实例目录和元数据。
- `game_version.rs`、`manifest.rs`、`migration.rs` 解析 Minecraft 版本和启动规则。
- `fabric.rs`、`forge.rs`、`maven.rs`、`downloader.rs` 安装加载器、依赖库、资源和版本文件。
- `java/` 检测、校验并持久化兼容 Java 运行时。
- `modpack/`、`mods.rs`、`content_search.rs` 处理整合包解析、模组元数据和内容发现。
- `assistant.rs` 提供可选的故障排查助手能力。

UI 的长期状态位于 `packages/ui/src/models/`，页面位于 `packages/ui/src/pages/`，共享控件位于 `packages/ui/src/components/`。

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
- [x] 从 PCL、HMCL、MultiMC 和 Prism Launcher 进行经过核对、只复制的目录与归档包迁移
- [x] 迁移冲突预览、取消、回滚和结构化兼容性报告

公开路线图见 <https://roadmap.sh/r/minecraft-launcher-dev>。

---

## 贡献

DropOut 面向长期维护。适合贡献的方向包括：

- 实例和配置文件工作流
- 模组加载器兼容性
- Java/运行时检测
- 下载器可靠性
- UI/UX 清晰度
- 文档和故障排查覆盖

使用标准 GitHub 流程：fork、创建分支、提交，然后向 [HydroRoll-Team/DropOut](https://github.com/HydroRoll-Team/DropOut) 打开 pull request。
UI 贡献者还应阅读 [fixture 与回归测试指南](packages/ui/README.md)。

---

## 许可证

[![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-65a30d)](LICENSE)

本项目基于 GNU Affero General Public License v3.0 分发。详见 [LICENSE](LICENSE)。
