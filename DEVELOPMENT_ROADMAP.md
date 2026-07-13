# DropOut 开发路线图 & Claude Opus 4 Prompt 手册

> **目标读者**: Claude Opus 4（AI 开发助手）
> **项目**: DropOut — 基于 Tauri v2 的现代 Minecraft 启动器
> **当前版本**: 0.2.0-alpha.6
> **生成日期**: 2026-04-03

---

## 目录

1. [项目架构概览](#1-项目架构概览)
2. [技术栈速查](#2-技术栈速查)
3. [已完成功能清单](#3-已完成功能清单)
4. [待开发功能总览](#4-待开发功能总览)
5. [Phase 1: 代码质量与重构](#phase-1-代码质量与重构)
   - [Task 1.1: 修复 config-editor Zod Schema](#task-11-修复-config-editor-zod-schema)
   - [Task 1.2: 重构 main.rs Java 解析逻辑](#task-12-重构-mainrs-java-解析逻辑)
6. [Phase 2: 多账户系统](#phase-2-多账户系统)
   - [Task 2.1: 后端多账户 Tauri Commands](#task-21-后端多账户-tauri-commands)
   - [Task 2.2: 前端多账户 UI 与 Store](#task-22-前端多账户-ui-与-store)
7. [Phase 3: Mods 管理器](#phase-3-mods-管理器)
   - [Task 3.1: 后端 Mods 扫描与管理](#task-31-后端-mods-扫描与管理)
   - [Task 3.2: 前端 Mods 管理器 UI](#task-32-前端-mods-管理器-ui)
8. [Phase 4: 自定义游戏目录](#phase-4-自定义游戏目录)
9. [Phase 5: 启动器自动更新](#phase-5-启动器自动更新)
10. [Phase 6: 从其他启动器导入](#phase-6-从其他启动器导入)
11. [Phase 7: 实例系统 UI 打磨](#phase-7-实例系统-ui-打磨)
12. [附录: 关键文件路径速查](#附录-关键文件路径速查)

---

## 1. 项目架构概览

```
DropOut/
├── src-tauri/                    # Rust 后端 (Tauri v2)
│   ├── src/
│   │   ├── main.rs               # 入口 + 所有 tauri::command (~2950行)
│   │   └── core/                 # 核心模块
│   │       ├── mod.rs            # 模块导出
│   │       ├── auth.rs           # 认证 (MS OAuth Device Code Flow)
│   │       ├── account_storage.rs # 账户持久化 (已支持多账户存储!)
│   │       ├── config.rs         # 启动器配置
│   │       ├── instance.rs       # 实例管理 (CRUD/导入/导出/修复)
│   │       ├── downloader.rs     # 多段并行下载器
│   │       ├── fabric.rs         # Fabric 加载器
│   │       ├── forge.rs          # Forge 加载器
│   │       ├── java.rs           # Java 检测/下载/管理
│   │       ├── manifest.rs       # Minecraft 版本清单
│   │       ├── modpack/          # Modpack 解析 (CurseForge/Modrinth/MultiMC)
│   │       ├── assistant.rs      # AI 助手
│   │       └── ...
│   ├── Cargo.toml                # Rust 依赖
│   └── tauri.conf.json           # Tauri 配置
├── packages/
│   └── ui/                       # React 前端 (@dropout/ui)
│       ├── src/
│       │   ├── client.ts         # Tauri invoke 封装 (所有 RPC 调用)
│       │   ├── types/            # ts-rs 自动生成的 TypeScript 类型
│       │   ├── models/           # Zustand stores
│       │   │   ├── auth.ts       # 认证 store (目前单账户)
│       │   │   ├── instance.ts   # 实例 store
│       │   │   ├── game.ts       # 游戏启动 store
│       │   │   └── settings.ts   # 设置 store
│       │   ├── pages/            # 页面组件
│       │   │   ├── home.tsx      # 首页
│       │   │   ├── settings.tsx  # 设置页
│       │   │   └── instances/    # 实例页
│       │   └── components/       # UI 组件
│       └── package.json
├── crates/
│   └── macros/                   # dropout-macros (proc macros)
└── package.json                  # 工作区根配置
```

**关键设计模式**:
- **Tauri Commands**: 所有后端功能通过 `#[tauri::command]` 暴露, 前端通过 `invoke()` 调用
- **状态管理**: Rust 侧用 `tauri::State<Mutex<T>>`, 前端用 Zustand stores
- **类型桥接**: 使用 `ts-rs` 从 Rust struct 自动生成 TypeScript 类型到 `packages/ui/src/types/bindings/`
- **自定义宏**: `#[dropout_macros::api]` 装饰器用于 tauri command
- **路由**: 使用 react-router v7 的 HashRouter, 路由定义在 `packages/ui/src/pages/routes.ts`

---

## 2. 技术栈速查

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Tauri | 2.9 |
| 后端 | Rust | Edition 2024 |
| 前端框架 | React | 19.2 |
| 状态管理 | Zustand | 5.0 |
| 路由 | react-router | 7.12 |
| UI 组件 | shadcn/ui + radix-ui | 1.4 |
| 样式 | Tailwind CSS | 4.1 |
| 表单 | react-hook-form + zod | 7.71 / 4.3 |
| 构建 | rolldown-vite | 7 |
| 包管理 | pnpm | 10.30.2 |
| Lint | Biome | 2.4 |
| 类型生成 | ts-rs | 11.1.0 |

---

## 3. 已完成功能清单

- ✅ Microsoft 认证 (Device Code Flow) + Token 刷新
- ✅ 离线模式登录
- ✅ 账户持久化 (保存登录状态)
- ✅ Minecraft 版本获取与安装
- ✅ JVM 参数解析 (arguments.jvm + arguments.game)
- ✅ Java 自动检测 & Adoptium 下载
- ✅ Fabric 加载器支持
- ✅ Forge 加载器支持
- ✅ GitHub Releases 集成 (应用内更新日志)
- ✅ 实例/Profile 系统 (CRUD, 复制, 导出/导入 zip, 修复)
- ✅ 并行多段下载器 (断点续传, 校验)
- ✅ 共享缓存迁移
- ✅ Modpack 解析器 (CurseForge / Modrinth / MultiMC 格式)
- ✅ AI 助手集成 (Ollama / OpenAI)
- ✅ 粒子/星座背景效果
- ✅ 设置页 (内存/窗口/GPU加速/下载线程/Java路径/外观)

---

## 4. 待开发功能总览

| 优先级 | 功能 | 复杂度 | Phase |
|--------|------|--------|-------|
| 🔧 | config-editor Zod Schema 补全 | 低 | 1 |
| 🔧 | main.rs Java 解析重构 | 低 | 1 |
| 🔴 | 多账户支持 | 中高 | 2 |
| 🔴 | Mods 管理器 | 高 | 3 |
| 🟡 | 自定义游戏目录 | 中 | 4 |
| 🟡 | 启动器自动更新 | 中 | 5 |
| 🟡 | 从其他启动器导入 | 中 | 6 |
| 🟢 | 实例系统 UI 打磨 | 低中 | 7 |

---

## Phase 1: 代码质量与重构

### Task 1.1: 修复 config-editor Zod Schema

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 的 Minecraft 启动器。

**任务**: 修复 `packages/ui/src/components/config-editor.tsx` 中的两个 TODO，为 `AssistantConfig` 和 `FeatureFlags` 编写完整的 Zod schema。

**背景**: 
当前代码在第 33 和 36 行使用了 `z.any()` 作为占位符：
```ts
assistant: z.any(), // TODO: AssistantConfig schema
featureFlags: z.any(), // TODO: FeatureFlags schema
```

**Rust 类型定义** (来自 `src-tauri/src/core/config.rs`):

AssistantConfig:
```rust
pub struct AssistantConfig {
    pub enabled: bool,
    pub llm_provider: String,       // "ollama" or "openai"
    pub ollama_endpoint: String,
    pub ollama_model: String,
    pub openai_api_key: Option<String>,
    pub openai_endpoint: String,
    pub openai_model: String,
    pub system_prompt: String,
    pub response_language: String,
    pub tts_enabled: bool,
    pub tts_provider: String,       // "disabled", "piper", "edge"
}
```

FeatureFlags:
```rust
pub struct FeatureFlags {
    pub demo_user: bool,
    pub quick_play_enabled: bool,
    pub quick_play_path: Option<String>,
    pub quick_play_singleplayer: bool,
    pub quick_play_multiplayer_server: Option<String>,
}
```

**注意**: 项目使用 `#[serde(rename_all = "camelCase")]`，所以 TypeScript 侧字段名是驼峰命名。项目使用 Zod v4 (`zod@^4.3.6`)。

**要求**:
1. 在 `packages/ui/src/components/config-editor.tsx` 中将两个 `z.any()` 替换为完整的 Zod object schema
2. 保持与 Rust 类型的一一对应（Option<String> → z.string().nullable()）
3. 确保驼峰命名与 ts-rs 生成的类型一致
4. 可以参考 `packages/ui/src/types/bindings/config.ts` 中 ts-rs 生成的类型定义来确认字段名

**文件路径**: `packages/ui/src/components/config-editor.tsx`
```

</details>

---

### Task 1.2: 重构 main.rs Java 解析逻辑

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 的 Minecraft 启动器。

**任务**: 将 `src-tauri/src/main.rs` 第 313 行附近的 Java 解析逻辑重构为独立函数。

**背景**: 
在 `start_game` 命令中（约第 125-1000 行），Java 版本解析逻辑嵌入在 `start_game` 函数内部，有一个 `// TODO: refactor into a separate function` 注释。

**当前代码位置**: `src-tauri/src/main.rs:313`

**要求**:
1. 阅读 `src-tauri/src/main.rs` 中 `start_game` 函数的完整内容
2. 找到第 313 行的 TODO 注释，理解其上下文——这是 Java 路径解析的逻辑
3. 将该段 Java 解析逻辑提取为一个独立的 async 函数，签名大致为：
   ```rust
   async fn resolve_java_path(
       config: &LauncherConfig,
       instance: &Instance,
       required_java_version: Option<u32>,
       app_handle: &AppHandle,
   ) -> Result<String, String>
   ```
4. 函数应该封装以下逻辑：
   - 检查实例级 Java 路径覆盖 (`instance.java_path_override`)
   - 检查全局配置 Java 路径 (`config.java_path`)
   - 如果都没有，基于所需 Java 版本自动检测
   - 使用 `core::java` 模块中已有的检测/推荐函数
5. 在 `start_game` 中调用此新函数替代内联逻辑
6. 保持所有现有行为不变

**参考模块**: 
- `src-tauri/src/core/java.rs` — 包含 `detect_java`, `get_recommended_java` 等
- `src-tauri/src/core/config.rs` — `LauncherConfig` 结构
- `src-tauri/src/core/instance.rs` — `Instance` 结构包含 `java_path_override` 字段

**测试**: 确保 `cargo check` 通过
```

</details>

---

## Phase 2: 多账户系统

### 核心发现

**后端存储层已经支持多账户！** `src-tauri/src/core/account_storage.rs` 已实现：
- `AccountStore` 有 `accounts: Vec<StoredAccount>` 和 `active_account_id: Option<String>`
- `add_or_update_account()` — 添加/更新账户
- `remove_account()` — 删除账户
- `get_active_account()` — 获取当前账户
- `set_active_account()` — 切换活动账户 (标记为 `#[allow(dead_code)]`)
- `get_all_accounts()` — 获取所有账户 (标记为 `#[allow(dead_code)]`)

**瓶颈在**:
1. `src-tauri/src/core/auth.rs` 中的 `AccountState` 只有 `Mutex<Option<Account>>`（单账户运行时状态）
2. `main.rs` 中的 Tauri commands 只暴露了单账户操作
3. 前端 `auth.ts` store 只跟踪 `account: Account | null`

### Task 2.1: 后端多账户 Tauri Commands

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 + React 19 的 Minecraft 启动器。

**任务**: 扩展后端以暴露多账户管理的 Tauri commands。

**关键发现**: 后端存储层 (`src-tauri/src/core/account_storage.rs`) 已经完整实现了多账户支持，包括:
- `AccountStore { accounts: Vec<StoredAccount>, active_account_id: Option<String> }`
- `add_or_update_account()`, `remove_account()`, `get_active_account()`, `set_active_account()`, `get_all_accounts()`
- 其中 `set_active_account` 和 `get_all_accounts` 被标记为 `#[allow(dead_code)]`

**当前问题**:
1. `src-tauri/src/core/auth.rs` 中 `AccountState` 只持有 `active_account: Mutex<Option<Account>>`（单个运行时账户）
2. `src-tauri/src/main.rs` 中只暴露了 `login_offline`, `get_active_account`, `logout`, `start_microsoft_login`, `complete_microsoft_login`, `refresh_account` 这些单账户命令
3. 没有暴露 `get_all_accounts`, `set_active_account`, `remove_account` 等多账户命令

**需要做的改动**:

### 文件 1: `src-tauri/src/main.rs`

添加以下新的 Tauri commands:

1. `get_all_accounts` — 返回所有已存储的账户列表
   ```rust
   #[tauri::command]
   async fn get_all_accounts(app_handle: AppHandle) -> Result<Vec<AccountSummary>, String>
   ```
   - 使用 `AccountStorage::get_all_accounts()`
   - 返回一个安全的摘要类型（不要暴露 refresh token），包含: uuid, username, account_type, is_active

2. `switch_account` — 切换活动账户
   ```rust
   #[tauri::command]
   async fn switch_account(
       uuid: String,
       app_handle: AppHandle,
       auth_state: State<'_, AccountState>,
       ms_state: State<'_, MsRefreshTokenState>,
   ) -> Result<Account, String>
   ```
   - 调用 `AccountStorage::set_active_account()`
   - 更新 `AccountState` 中的 active_account
   - 如果是 Microsoft 账户，尝试刷新 token
   - 返回切换后的 Account

3. `remove_account` — 删除指定账户
   ```rust
   #[tauri::command]
   async fn remove_account(
       uuid: String,
       app_handle: AppHandle,
       auth_state: State<'_, AccountState>,
   ) -> Result<(), String>
   ```
   - 调用 `AccountStorage::remove_account()`
   - 如果删除的是当前活动账户，清除 AccountState 或切换到下一个

4. 在 `tauri::generate_handler![]` 宏中注册新命令

### 文件 2: `src-tauri/src/main.rs` (新增类型)

定义 `AccountSummary` 结构:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "account.ts")]
pub struct AccountSummary {
    pub uuid: String,
    pub username: String,
    pub account_type: String,  // "offline" 或 "microsoft"
    pub is_active: bool,
}
```

### 现有代码参考:

**AccountStorage** (`src-tauri/src/core/account_storage.rs`):
```rust
pub fn get_all_accounts(&self) -> Vec<StoredAccount>
pub fn set_active_account(&self, uuid: &str) -> Result<(), String>
pub fn remove_account(&self, uuid: &str) -> Result<(), String>
```

**AccountState** (`src-tauri/src/core/auth.rs`):
```rust
pub struct AccountState {
    pub active_account: Mutex<Option<Account>>,
}
```

**当前 main.rs 的模式** — 访问 AccountStorage 的方式:
```rust
let app_dir = app_handle.path().app_data_dir().unwrap();
let storage = core::account_storage::AccountStorage::new(app_dir);
```

**当前登录命令的模式** (参考 `login_offline` 和 `complete_microsoft_login`):
- 登录后调用 `storage.add_or_update_account(&account, ms_refresh_token)`
- 更新 `auth_state.active_account`

### 同时修改现有的 logout 命令:
当前 `logout` 清除了活动账户 → 应该改为只清除当前活动账户，而不是清空整个存储

**生成类型**: 改动完成后运行 `cargo test export_bindings` 生成新的 TypeScript 类型

**测试**: 确保 `cargo check` 通过
```

</details>

---

### Task 2.2: 前端多账户 UI 与 Store

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 + React 19 + Zustand + shadcn/ui 的 Minecraft 启动器。

**任务**: 实现前端多账户支持，包括 Zustand store 扩展和账户切换 UI。

**前提**: 后端已经添加了以下 Tauri commands (Task 2.1 已完成):
- `get_all_accounts` → `AccountSummary[]`
- `switch_account(uuid: string)` → `Account`
- `remove_account(uuid: string)` → `void`

**需要做的改动**:

### 1. 更新 client.ts

**文件**: `packages/ui/src/client.ts`

添加新的 invoke 封装函数:
```ts
export function getAllAccounts(): Promise<AccountSummary[]> {
  return invoke<AccountSummary[]>("get_all_accounts");
}

export function switchAccount(uuid: string): Promise<Account> {
  return invoke<Account>("switch_account", { uuid });
}

export function removeAccount(uuid: string): Promise<void> {
  return invoke<void>("remove_account", { uuid });
}
```

并在 import 中添加 `AccountSummary` 类型。

### 2. 扩展 Auth Store

**文件**: `packages/ui/src/models/auth.ts`

当前 store 状态:
```ts
export interface AuthState {
  account: Account | null;          // 当前活动账户
  loginMode: Account["type"] | null;
  deviceCode: DeviceCodeResponse | null;
  // ... polling 相关
}
```

扩展为:
```ts
export interface AuthState {
  account: Account | null;              // 当前活动账户
  accounts: AccountSummary[];           // 所有已存储账户列表
  loginMode: Account["type"] | null;
  deviceCode: DeviceCodeResponse | null;
  // ... 保留现有字段 ...

  // 新方法
  refreshAccounts: () => Promise<void>;       // 刷新账户列表
  switchAccount: (uuid: string) => Promise<void>;  // 切换活动账户
  removeAccount: (uuid: string) => Promise<void>;  // 删除账户
}
```

实现要点:
- `init()` 中除了 `getActiveAccount()` 外，还要调用 `getAllAccounts()` 初始化列表
- `loginOnline` / `loginOffline` 成功后调用 `refreshAccounts()` 更新列表
- `logout` 后调用 `refreshAccounts()` 更新列表
- `switchAccount` 调用后端 → 更新 `account` → 调用 `refreshAccounts()`
- `removeAccount` 调用后端 → 如果删除的是当前账户则清除 `account` → `refreshAccounts()`

### 3. 创建账户切换器组件

**新文件**: `packages/ui/src/components/account-switcher.tsx`

设计要求:
- 在侧边栏底部或设置页中显示当前账户
- 点击展开下拉菜单，显示所有账户
- 每个账户条目显示: 用户名、账户类型(微软/离线)图标、活动状态指示
- 提供 "切换" 按钮和 "删除" 按钮 (带确认对话框)
- 提供 "添加新账户" 按钮，点击后打开登录对话框

**UI 组件参考**:
- 使用 shadcn/ui 的 `DropdownMenu` 或 `Popover`
- 使用 lucide-react 图标
- 使用 sonner 的 toast 通知操作结果
- 参考现有的 UI 风格（项目使用暗色主题）

**现有项目样式**:
- 组件位于 `packages/ui/src/components/`
- UI 基础组件在 `packages/ui/src/components/ui/`
- 使用 `cn()` from `@/lib/utils` 合并 className
- 使用 `@/` 路径别名

### 4. 集成到布局

**文件**: `packages/ui/src/pages/index.tsx` 或侧边栏组件

在合适的位置放置 `AccountSwitcher` 组件。当前首页 (`pages/home.tsx`) 有一个 BottomBar，侧边栏在 `pages/index.tsx` 中渲染。

**现有认证 UI 参考**:
当前登录流程在 `packages/ui/src/pages/home.tsx` 的 BottomBar 中处理。你可以查看该文件了解现有的登录 UI 模式。

**测试要点**:
- 确保单账户时（向后兼容）行为不变
- 确保登录新账户后列表自动更新
- 确保切换账户后游戏启动使用新账户
- 确保删除当前账户后正确回退

**不要**: 修改后端代码，只做前端改动。
```

</details>

---

## Phase 3: Mods 管理器

### Task 3.1: 后端 Mods 扫描与管理

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 的 Minecraft 启动器。

**任务**: 实现后端 Mods 管理功能——扫描、启用/禁用、删除实例中的 mods。

**背景**:
- 每个实例的 mods 目录在 `{instance.game_dir}/mods/`
- Minecraft mod 是 `.jar` 文件，禁用通常通过重命名为 `.jar.disabled` 实现
- 项目已有 `src-tauri/src/core/modpack/` 模块处理 modpack 导入，但没有单独的 mod 管理功能
- 实例管理在 `src-tauri/src/core/instance.rs`

**需要实现的内容**:

### 1. 新建模块 `src-tauri/src/core/mods.rs`

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "mods.ts")]
pub struct ModInfo {
    pub file_name: String,        // 文件名
    pub file_path: PathBuf,       // 完整路径
    pub enabled: bool,            // 是否启用
    pub file_size: u64,           // 文件大小 (字节)
    pub mod_name: Option<String>, // 从 fabric.mod.json 或 META-INF/mods.toml 解析的名称
    pub mod_id: Option<String>,   // mod ID
    pub version: Option<String>,  // mod 版本
    pub description: Option<String>, // 描述
    pub mod_loader: Option<String>,  // "fabric", "forge", "quilt"
}
```

实现以下函数:

1. **`scan_mods(game_dir: &Path) -> Result<Vec<ModInfo>, String>`**
   - 扫描 `{game_dir}/mods/` 目录
   - 识别 `.jar` (启用) 和 `.jar.disabled` (禁用) 文件
   - 对每个 jar 文件，尝试读取 mod 元数据:
     - Fabric: 读取 jar 内的 `fabric.mod.json`
     - Forge: 读取 jar 内的 `META-INF/mods.toml`
     - 如果都没有，只返回文件名信息
   - 使用 `zip` crate (项目已依赖) 读取 jar 内容

2. **`toggle_mod(game_dir: &Path, file_name: &str) -> Result<ModInfo, String>`**
   - 如果 `.jar` → 重命名为 `.jar.disabled`
   - 如果 `.jar.disabled` → 重命名为 `.jar`
   - 返回更新后的 ModInfo

3. **`delete_mod(game_dir: &Path, file_name: &str) -> Result<(), String>`**
   - 删除指定 mod 文件

### 2. 在 `src-tauri/src/core/mod.rs` 中注册模块

添加: `pub mod mods;`

### 3. 在 `src-tauri/src/main.rs` 中添加 Tauri commands

```rust
#[tauri::command]
async fn scan_instance_mods(
    instance_id: String,
    instance_state: State<'_, InstanceState>,
) -> Result<Vec<ModInfo>, String> {
    let instances = instance_state.config.lock().unwrap();
    let instance = instances.instances.iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;
    core::mods::scan_mods(&instance.game_dir)
}

#[tauri::command]
async fn toggle_mod(
    instance_id: String,
    file_name: String,
    instance_state: State<'_, InstanceState>,
) -> Result<ModInfo, String> {
    let instances = instance_state.config.lock().unwrap();
    let instance = instances.instances.iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;
    core::mods::toggle_mod(&instance.game_dir, &file_name)
}

#[tauri::command]
async fn delete_mod(
    instance_id: String,
    file_name: String,
    instance_state: State<'_, InstanceState>,
) -> Result<(), String> {
    let instances = instance_state.config.lock().unwrap();
    let instance = instances.instances.iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;
    core::mods::delete_mod(&instance.game_dir, &file_name)
}
```

在 `tauri::generate_handler![]` 中注册这三个命令。

### Fabric mod.json 格式参考:
```json
{
  "schemaVersion": 1,
  "id": "modid",
  "version": "1.0.0",
  "name": "Mod Name",
  "description": "A mod description"
}
```

### Forge mods.toml 格式参考:
```toml
[[mods]]
modId = "modid"
version = "1.0.0"
displayName = "Mod Name"
description = "A mod description"
```

**依赖**: 项目已有 `zip`, `serde_json`, `toml` 依赖，无需添加新依赖。

**生成类型**: 完成后运行 `cargo test export_bindings`

**测试**: `cargo check` 通过
```

</details>

---

### Task 3.2: 前端 Mods 管理器 UI

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 + React 19 + Zustand + shadcn/ui 的 Minecraft 启动器。

**任务**: 实现前端 Mods 管理器界面，允许用户查看、启用/禁用、删除实例中的 mods。

**前提**: 后端已实现以下 Tauri commands (Task 3.1 已完成):
- `scan_instance_mods(instanceId: string)` → `ModInfo[]`
- `toggle_mod(instanceId: string, fileName: string)` → `ModInfo`
- `delete_mod(instanceId: string, fileName: string)` → `void`

ts-rs 生成的 `ModInfo` 类型已存在于 `packages/ui/src/types/bindings/mods.ts`:
```ts
export interface ModInfo {
  fileName: string;
  filePath: string;
  enabled: boolean;
  fileSize: number;
  modName: string | null;
  modId: string | null;
  version: string | null;
  description: string | null;
  modLoader: string | null;
}
```

**需要实现**:

### 1. 更新 client.ts

**文件**: `packages/ui/src/client.ts`

```ts
export function scanInstanceMods(instanceId: string): Promise<ModInfo[]> {
  return invoke<ModInfo[]>("scan_instance_mods", { instanceId });
}

export function toggleMod(instanceId: string, fileName: string): Promise<ModInfo> {
  return invoke<ModInfo>("toggle_mod", { instanceId, fileName });
}

export function deleteMod(instanceId: string, fileName: string): Promise<void> {
  return invoke<void>("delete_mod", { instanceId, fileName });
}
```

### 2. 创建 Mods 管理页面

**新文件**: `packages/ui/src/pages/instances/mods.tsx`

设计规格:
- 页面接收 `instanceId` 参数 (从路由获取)
- 页面加载时调用 `scanInstanceMods` 获取 mod 列表
- 列表以表格或卡片形式展示，每个 mod 显示:
  - 名称 (modName ?? fileName)
  - 版本号
  - 加载器类型 (Fabric/Forge 图标或标签)
  - 文件大小 (格式化为 KB/MB)
  - 启用/禁用开关 (shadcn Switch 组件)
  - 删除按钮 (带确认对话框)
- 顶部工具栏: 搜索框、"全部启用"/"全部禁用" 按钮、"刷新" 按钮
- 空状态: 当没有 mods 时显示提示文字

**UI 组件使用**:
- `Switch` from `@/components/ui/switch` — 启用/禁用切换
- `Button` from `@/components/ui/button`
- `Dialog` — 删除确认
- `Input` — 搜索
- `Badge` — 加载器类型标签
- `toast` from `sonner` — 操作反馈
- lucide-react 图标: `Trash2Icon`, `RefreshCwIcon`, `SearchIcon`, `PackageIcon`

### 3. 添加路由

**文件**: `packages/ui/src/pages/routes.ts`

当前实例路由结构:
```ts
// 需要查看现有路由结构来确定如何添加
```

添加 `/instances/:instanceId/mods` 路由指向新的 Mods 页面。

### 4. 在实例页面添加入口

**文件**: `packages/ui/src/pages/instances/index.tsx`

在实例的操作菜单中添加 "管理 Mods" 按钮，点击后导航到 `/instances/{instanceId}/mods`。

**现有代码模式参考**:
- 查看 `packages/ui/src/pages/instances/index.tsx` 了解实例列表的 UI 模式
- 查看 `packages/ui/src/pages/instances/create.tsx` 了解子页面的模式
- 查看 `packages/ui/src/pages/routes.ts` 了解路由定义方式

**样式要求**:
- 保持与项目现有 UI 风格一致（暗色主题、统一的间距和圆角）
- 使用 `cn()` 工具函数合并 className
- 使用 Tailwind CSS 4 的类名

**不要**: 修改后端代码。
```

</details>

---

## Phase 4: 自定义游戏目录

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 + React 19 的 Minecraft 启动器。

**任务**: 允许用户为每个实例选择自定义游戏目录路径。

**当前状态**:
- `Instance` 结构 (`src-tauri/src/core/instance.rs`) 已有 `game_dir: PathBuf` 字段
- 创建实例时 (`create_instance`)，`game_dir` 被自动设置为 `{app_data_dir}/instances/{id}/`
- 前端实例编辑器 (`packages/ui/src/components/instance-editor-modal.tsx`) 可以编辑实例属性
- Tauri 已配置 `tauri-plugin-dialog`（`save`/`open` 对话框）和 `tauri-plugin-fs`

**需要做的改动**:

### 后端改动

**文件**: `src-tauri/src/main.rs`

1. 修改 `create_instance` 命令，添加可选的 `custom_dir` 参数:
```rust
#[tauri::command]
async fn create_instance(
    name: String,
    custom_dir: Option<String>,  // 新增: 可选自定义目录
    // ... 现有参数
) -> Result<Instance, String>
```
- 如果 `custom_dir` 为 `Some`，验证路径存在并可写，将其作为 `game_dir`
- 如果 `custom_dir` 为 `None`，保持现有行为（自动创建在 app_data_dir 下）

2. 添加 `change_instance_directory` 命令:
```rust
#[tauri::command]
async fn change_instance_directory(
    instance_id: String,
    new_dir: String,
    migrate_files: bool,  // 是否迁移现有文件
    instance_state: State<'_, InstanceState>,
) -> Result<Instance, String>
```
- 验证目标路径
- 如果 `migrate_files` 为 true，将现有 game_dir 的内容移动到新目录
- 更新 instance 的 `game_dir`
- 保存配置

### 前端改动

**文件**: `packages/ui/src/components/instance-editor-modal.tsx`

在实例编辑模态框中添加:
- "游戏目录" 字段，显示当前 `game_dir` 路径
- "浏览" 按钮，使用 Tauri dialog 的 `open({ directory: true })` 选择目录
- "迁移文件" 复选框（当更改目录时显示）
- 提示文字说明更改目录的影响

**文件**: `packages/ui/src/pages/instances/create.tsx`

在创建实例流程中添加:
- "使用自定义目录" 开关
- 开关打开后显示目录选择器

**文件**: `packages/ui/src/client.ts`

添加:
```ts
export function changeInstanceDirectory(
  instanceId: string,
  newDir: string,
  migrateFiles: boolean
): Promise<Instance> {
  return invoke<Instance>("change_instance_directory", {
    instanceId, newDir, migrateFiles
  });
}
```

更新 `createInstance`:
```ts
export function createInstance(name: string, customDir?: string | null): Promise<Instance> {
  return invoke<Instance>("create_instance", { name, customDir });
}
```

**参考**:
- `packages/ui/src/pages/instances/create.tsx` — 创建实例页面的现有实现
- `packages/ui/src/components/instance-editor-modal.tsx` — 编辑实例的模态框
- Tauri dialog 使用: `import { open } from "@tauri-apps/plugin-dialog"`

**注意**: 更改 `create_instance` 的签名可能需要更新所有调用方。搜索 `createInstance` 确保所有调用处都兼容。

**测试**: `cargo check` 通过，前端 `pnpm --filter @dropout/ui build` 通过
```

</details>

---

## Phase 5: 启动器自动更新

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 的 Minecraft 启动器。

**任务**: 集成 Tauri v2 的 updater 插件，实现启动器自动更新功能。

**项目信息**:
- GitHub 仓库: `HydroRoll-Team/DropOut`（发布页: https://github.com/HydroRoll-Team/DropOut/releases）
- 当前版本: `0.2.0-alpha.6`
- Tauri 版本: 2.9
- 项目已有 GitHub Releases 集成（`get_github_releases` 命令）

**需要做的改动**:

### 1. 添加 Tauri updater 插件依赖

**文件**: `src-tauri/Cargo.toml`
```toml
[dependencies]
tauri-plugin-updater = "2"
```

**文件**: `packages/ui/package.json`
```json
"@tauri-apps/plugin-updater": "^2"
```

### 2. 配置 Tauri updater

**文件**: `src-tauri/tauri.conf.json`

在现有配置中添加 updater 配置:
```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/HydroRoll-Team/DropOut/releases/latest/download/latest.json"
      ],
      "pubkey": ""
    }
  }
}
```

注意: pubkey 需要由用户通过 `tauri signer generate` 生成，这里先留空并添加注释说明。

### 3. 注册插件

**文件**: `src-tauri/src/main.rs`

在 `tauri::Builder::default()` 链中添加:
```rust
.plugin(tauri_plugin_updater::init())
```

### 4. 前端更新检查 UI

**新文件**: `packages/ui/src/components/updater.tsx`

实现:
- 在启动时（或设置页中的按钮）调用 updater API 检查更新
- 使用 Tauri updater 的 JavaScript API:
```ts
import { check } from '@tauri-apps/plugin-updater';

async function checkForUpdate() {
  const update = await check();
  if (update) {
    // 显示更新对话框: 版本号、更新日志
    // 用户确认后调用 update.downloadAndInstall()
    // 显示下载进度
  }
}
```
- 显示更新通知 Dialog:
  - 标题: "发现新版本 vX.Y.Z"
  - 内容: changelog (markdown 格式, 使用项目已有的 `marked` 库渲染)
  - 按钮: "立即更新" / "稍后提醒"
- 下载进度条
- 更新完成后提示重启

**集成位置**:
- 在 `packages/ui/src/pages/settings.tsx` 的 "关于" 或 "高级" tab 中添加:
  - 当前版本号显示
  - "检查更新" 按钮
  - 自动检查更新开关

**文件**: `packages/ui/src/pages/index.tsx` (root layout)

在应用初始化时（静默）检查一次更新，如果有更新则通过 toast 通知。

### 5. CI/CD 配置

**注意**: 自动更新需要 GitHub Actions 在 release 时生成 `latest.json` 文件。检查现有的 `.github/workflows/` 中是否已有 `tauri-action`，如果没有，说明需要添加但不要直接修改 CI 文件——而是在代码注释中说明需要配置。

**参考文档**: https://v2.tauri.app/plugin/updater/

**测试**: `cargo check` 通过, `pnpm --filter @dropout/ui build` 通过
```

</details>

---

## Phase 6: 从其他启动器导入

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 + React 19 的 Minecraft 启动器。

**任务**: 实现从 MultiMC/Prism Launcher 导入实例配置的功能。

**已有基础**:
项目在 `src-tauri/src/core/modpack/formats/multimc.rs` 中已有 MultiMC 格式的解析器，能够:
- 解析 `instance.cfg` 获取实例名称
- 解析 `mmc-pack.json` 获取 Minecraft 版本、mod loader 类型和版本
- 支持识别: Forge, NeoForge, Fabric, Quilt, LiteLoader

该解析器通过 `src-tauri/src/core/modpack/parser.rs` 的 `ZipModpackParser` 被 `ModpackApi` 调用，但它目前只在 zip 归档场景下使用。

**MultiMC/Prism 实例目录结构**:
```
~/.local/share/PrismLauncher/instances/
├── MyInstance/
│   ├── instance.cfg          # 实例配置 (name=, IntendedVersion=, ...)
│   ├── mmc-pack.json         # 组件依赖 (Minecraft, Forge, Fabric 等)
│   └── .minecraft/           # 游戏文件
│       ├── mods/
│       ├── config/
│       ├── saves/
│       └── ...
```

**需要实现**:

### 1. 后端: 新增扫描和导入功能

**文件**: `src-tauri/src/core/instance.rs` 或新建 `src-tauri/src/core/migration.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct DetectedLauncher {
    pub launcher_type: String,        // "multimc", "prism", "atlauncher"
    pub instances_dir: PathBuf,       // 实例目录
    pub instance_count: usize,        // 检测到的实例数
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "migration.ts")]
pub struct ImportableInstance {
    pub source_path: PathBuf,
    pub name: String,
    pub minecraft_version: Option<String>,
    pub mod_loader: Option<String>,
    pub mod_loader_version: Option<String>,
}
```

Tauri commands:

1. **`detect_launchers`** — 扫描常见启动器路径
   ```rust
   #[tauri::command]
   async fn detect_launchers() -> Result<Vec<DetectedLauncher>, String>
   ```
   扫描路径:
   - Linux: `~/.local/share/PrismLauncher/instances/`, `~/.local/share/multimc/instances/`
   - macOS: `~/Library/Application Support/PrismLauncher/instances/`
   - Windows: `%APPDATA%/PrismLauncher/instances/`

2. **`scan_launcher_instances`** — 列出指定启动器的所有实例
   ```rust
   #[tauri::command]
   async fn scan_launcher_instances(instances_dir: String) -> Result<Vec<ImportableInstance>, String>
   ```
   - 遍历目录下的子文件夹
   - 每个子文件夹尝试读取 `instance.cfg` 和 `mmc-pack.json`
   - 复用 `src-tauri/src/core/modpack/formats/multimc.rs` 中的解析函数

3. **`import_from_launcher`** — 导入指定实例
   ```rust
   #[tauri::command]
   async fn import_from_launcher(
       source_path: String,
       new_name: Option<String>,
       copy_files: bool,        // true=复制, false=创建符号链接(如果支持)
       instance_state: State<'_, InstanceState>,
       app_handle: AppHandle,
   ) -> Result<Instance, String>
   ```
   - 在 DropOut 中创建新实例
   - 将源目录的 `.minecraft/` 内容复制到新实例的 `game_dir`
   - 设置正确的版本 ID、mod loader 信息
   - 返回创建的 Instance

### 2. 前端: 导入向导 UI

**新文件**: `packages/ui/src/components/import-wizard.tsx`

步骤式向导 (使用项目已有的 `@stepperize/react`):
1. **检测启动器**: 自动扫描并列出检测到的启动器
2. **选择实例**: 列出所选启动器的所有实例，支持多选
3. **配置导入选项**: 新名称（可选）、复制/链接模式
4. **执行导入**: 显示进度

**文件**: `packages/ui/src/client.ts` 添加对应的 invoke 函数

**入口**: 在 `packages/ui/src/pages/instances/index.tsx` 中添加 "从其他启动器导入" 按钮，打开导入向导。

**注意**: 
- 当前已有 `import_instance` 命令处理 zip 归档导入，新的导入是从目录导入，是不同的流程
- 向导可以参考 `packages/ui/src/pages/instances/create.tsx` 的 stepper 使用方式

**测试**: `cargo check` 通过
```

</details>

---

## Phase 7: 实例系统 UI 打磨

<details>
<summary><strong>📋 Prompt (直接复制给 Claude)</strong></summary>

```
你是 DropOut 项目的开发者。DropOut 是一个基于 Tauri v2 + React 19 + shadcn/ui + Tailwind CSS 4 的 Minecraft 启动器。

**任务**: 打磨实例系统的 UI/UX，提升用户体验。

**当前状态**:
实例系统的核心功能已实现 (创建/删除/编辑/复制/导入/导出/修复/启动/停止)，但 UI 有改善空间。

**改进点清单**:

### 1. 实例卡片 UI 优化

**文件**: `packages/ui/src/pages/instances/index.tsx`

当前实例列表比较基础。改进为:
- 卡片式布局，支持网格/列表视图切换
- 每张卡片显示:
  - 实例图标 (如果有 `icon_path`)，否则显示 Minecraft 方块默认图标
  - 实例名称 (大字)
  - Minecraft 版本 + Mod Loader 标签 (如 "1.20.1 + Fabric 0.15.11")
  - 最后游玩时间 (格式化为 "3天前"、"从未")
  - 操作按钮: 启动(大按钮), 更多(下拉菜单)
- 选中/活动实例高亮
- 鼠标悬停效果

### 2. 实例详情侧面板

**新文件**: `packages/ui/src/components/instance-detail-panel.tsx`

当选中某个实例时，右侧显示详情面板:
- 实例信息汇总
- 已安装版本列表
- Mods 数量统计 (如果有)
- 快捷操作: "打开文件夹", "编辑", "复制", "导出"
- 备注 (instance.notes) 显示/编辑

### 3. 实例编辑器增强

**文件**: `packages/ui/src/components/instance-editor-modal.tsx`

增强编辑模态框:
- Tab 式布局: "基本信息" | "Java 设置" | "内存设置" | "高级"
- 基本信息: 名称、图标、备注、版本选择
- Java 设置: Java 路径覆盖 (用下拉选择已检测的 Java，或手动输入)
- 内存设置: 最小/最大内存滑块 (使用 instance.memory_override)
- 高级: JVM 参数覆盖、Mod Loader 信息

### 4. 实例创建流程改进

**文件**: `packages/ui/src/pages/instances/create.tsx`

当前创建流程：查看现有实现并增强:
- 步骤 1: 名称 + 图标选择
- 步骤 2: 选择 Minecraft 版本 (带搜索/筛选: release/snapshot)
- 步骤 3: 选择 Mod Loader (可选, Fabric/Forge) + 版本
- 步骤 4: 内存/Java 设置 (可选, 使用全局默认)
- 步骤 5: 确认并创建

### 5. 排序和搜索

在实例列表顶部添加:
- 搜索框 (按名称筛选)
- 排序选项: 名称、最近游玩、创建时间

**参考现有文件**:
- `packages/ui/src/pages/instances/index.tsx` — 当前实例列表实现
- `packages/ui/src/pages/instances/create.tsx` — 当前创建实例页面
- `packages/ui/src/components/instance-editor-modal.tsx` — 当前编辑模态框
- `packages/ui/src/models/instance.ts` — Zustand instance store
- `packages/ui/src/client.ts` — 所有可用的 Tauri commands

**Instance 类型定义** (ts-rs 生成):
```ts
interface Instance {
  id: string;
  name: string;
  gameDir: string;
  versionId: string | null;
  createdAt: number;
  lastPlayed: number | null;
  iconPath: string | null;
  notes: string | null;
  modLoader: string | null;
  modLoaderVersion: string | null;
  jvmArgsOverride: string | null;
  memoryOverride: MemoryOverride | null;
  javaPathOverride: string | null;
}
```

**UI 风格**: 查看现有页面 (home.tsx, settings.tsx) 保持一致的设计语言。
```

</details>

---

## 附录: 关键文件路径速查

### 后端 (Rust)

| 文件 | 用途 |
|------|------|
| `src-tauri/src/main.rs` | 所有 Tauri commands + 入口 (~2950 行) |
| `src-tauri/src/core/mod.rs` | 核心模块导出 |
| `src-tauri/src/core/auth.rs` | 认证 (Account, AccountState, MS OAuth) |
| `src-tauri/src/core/account_storage.rs` | 账户持久化 (多账户存储已实现) |
| `src-tauri/src/core/config.rs` | LauncherConfig, AssistantConfig, FeatureFlags |
| `src-tauri/src/core/instance.rs` | 实例管理 (Instance, InstanceConfig, CRUD) |
| `src-tauri/src/core/java.rs` | Java 检测/下载/管理 |
| `src-tauri/src/core/downloader.rs` | 多段并行下载器 |
| `src-tauri/src/core/fabric.rs` | Fabric 加载器 |
| `src-tauri/src/core/forge.rs` | Forge 加载器 |
| `src-tauri/src/core/manifest.rs` | Minecraft 版本清单 |
| `src-tauri/src/core/modpack/` | Modpack 解析 (CurseForge/Modrinth/MultiMC) |
| `src-tauri/src/core/modpack/formats/multimc.rs` | MultiMC 格式解析器 |
| `src-tauri/src/core/assistant.rs` | AI 助手 |
| `src-tauri/Cargo.toml` | Rust 依赖 |
| `src-tauri/tauri.conf.json` | Tauri 配置 |

### 前端 (React)

| 文件 | 用途 |
|------|------|
| `packages/ui/src/client.ts` | 所有 Tauri invoke 封装 |
| `packages/ui/src/types/` | ts-rs 自动生成的 TypeScript 类型 |
| `packages/ui/src/models/auth.ts` | 认证 Zustand store |
| `packages/ui/src/models/instance.ts` | 实例 Zustand store |
| `packages/ui/src/models/game.ts` | 游戏启动 Zustand store |
| `packages/ui/src/models/settings.ts` | 设置 Zustand store |
| `packages/ui/src/pages/routes.ts` | 路由定义 (HashRouter) |
| `packages/ui/src/pages/index.tsx` | 根布局 (Sidebar, 初始化) |
| `packages/ui/src/pages/home.tsx` | 首页 (Hero, BottomBar) |
| `packages/ui/src/pages/settings.tsx` | 设置页 (Tabs) |
| `packages/ui/src/pages/instances/index.tsx` | 实例列表页 |
| `packages/ui/src/pages/instances/create.tsx` | 创建实例页 |
| `packages/ui/src/components/config-editor.tsx` | 配置编辑器 (JSON 编辑) |
| `packages/ui/src/components/instance-editor-modal.tsx` | 实例编辑模态框 |

### 命令和脚本

| 命令 | 用途 |
|------|------|
| `cargo tauri dev` | 开发模式运行 |
| `cargo tauri build` | 生产构建 |
| `cargo check` | 检查 Rust 编译 |
| `cargo test export_bindings` | 生成 TypeScript 类型 |
| `pnpm --filter @dropout/ui dev` | 前端开发服务器 |
| `pnpm --filter @dropout/ui build` | 前端构建 |
| `pnpm generate` | 生成绑定 + 格式化 |

### 开发约定

1. **Tauri Command 模式**:
   ```rust
   #[tauri::command]
   #[dropout_macros::api]
   async fn command_name(
       param: Type,
       state: State<'_, SomeState>,
       app_handle: AppHandle,
   ) -> Result<ReturnType, String> { ... }
   ```

2. **前端 invoke 模式**:
   ```ts
   export function commandName(param: Type): Promise<ReturnType> {
     return invoke<ReturnType>("command_name", { param });
   }
   ```

3. **TypeScript 类型生成**:
   - Rust 中标记 `#[derive(TS)]` + `#[ts(export, export_to = "xxx.ts")]`
   - 运行 `cargo test export_bindings` 生成到 `packages/ui/src/types/bindings/`

4. **状态管理**: Zustand store 在 `packages/ui/src/models/` 中，使用 `create<StateType>((set, get) => ({...}))` 模式

5. **UI 组件**: shadcn/ui 组件在 `packages/ui/src/components/ui/`, 使用 `cn()` 合并类名

---

> **使用说明**: 将每个 Phase 的 Prompt 内容（`<details>` 标签内的代码块）按顺序复制给 Claude Opus 4。每完成一个 Phase，运行对应的测试命令验证后再进入下一个 Phase。Phase 之间有依赖关系——Phase 2.2 依赖 2.1，Phase 3.2 依赖 3.1，其余 Phase 间可并行。
