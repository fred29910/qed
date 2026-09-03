# 调试日志系统集成方案 (Debug Logging System Integration Plan)

**文档状态：** 已确认（2026-09-03）
**范围：** Phase 1–7 全部
**兼容性策略：** 60+ 处 `diag()` / `diagErr()` 调用零修改，统一映射到 `logger.debug()` / `logger.error()`
**查看器形态：** 独立次级窗口（与 `settings-window.ts` 同构）

---

## 一、现状摸底 (Current State Analysis)

### 1.1 已有的 `diag.ts` — "残废版" boot tracer

`src/diag.ts` (55 行) 已经存在，但定位非常窄：

| 维度 | 当前状态 | 问题 |
|---|---|---|
| **路径** | 硬编码 `/tmp/qed-boot.log` | Linux/macOS 假设；**Windows 直接失败**；违反"用 logDir()"约定 |
| **级别** | 只有一种 trace 级，无分级 | 无法区分 info/warn/error |
| **开关** | 始终启用，无法关闭 | 开发/生产无法区分 |
| **时间戳** | 仅 boot step 序号 | 无法做时序分析、慢请求排查 |
| **持久化** | 始终 append，无 rotate | 长会话日志文件无限增长 |
| **作用域** | 只用于 boot 期；runtime 错误仍用 `console.error` | 错误和 boot 步混在两个通道 |
| **用户可见** | `process.stderr.write` + 文件双写 | 终端调试 OK，但用户报告 bug 时拿不到 |

### 1.2 现有日志散点

| 位置 | 调用 | 级别语义 |
|---|---|---|
| `src/main.ts:46` | `import { diag, diagErr }` | boot 阶段 |
| `src/app/app-controller.ts:38` | `import { diag }` + 多处 diag | boot 阶段 |
| `src/ui/sidebar.ts:17` | `import { diag }` + 13 处 diag | UI 渲染追踪 |
| `src/services/config-service.ts:84` | `console.error('config listener threw:', err)` | 错误 |
| `src/services/config-service.ts:100` | `console.error('config flush failed:', ...)` | 错误 |
| `src/services/config-service.ts:123` | `console.error('config load failed; ...')` | 错误 |
| `src/services/recent-files-service.ts:48` | `console.error('recent-files flush failed:', ...)` | 错误 |
| `src/services/recent-files-service.ts:66` | `console.error('recent-files load failed:', ...)` | 错误 |
| `src/services/notification-service.ts:32` | `console.error('notification failed:', ...)` | 错误 |
| `src/services/file-service.ts:64` | `console.error('stat failed for', ...)` | 错误 |
| `src/modules/settings/settings-view.ts:90,97` | `console.error('autostart enable/disable failed:', err)` | 错误 |
| `src/app/app-controller.ts:81,92,252,259,300,311,317` | 多处 `console.error / console.log` | 错误 + 生命周期 |
| `src/state/app-state.ts:156` | `console.error('store listener threw:', err)` | 错误 |

**问题：** 错误日志散落到 `console.error`，boot trace 又在 `diag` — 两套通道，两套文件（甚至 stderr 不落盘），无法关联，Windows 下 `/tmp/qed-boot.log` 直接失败。

### 1.3 与 perry-dev 约束的对齐

- ✅ Perry AOT 子集允许 `console` / `process.stderr` / `fs.appendFileSync`
- ✅ `@log` decorator 是 perry 官方提供的编译期 trace 方案（见 `language.md:1020-1024`）
- ❌ 不能用动态 `require` / `eval` / 任何 N-API（log 库必须是 pure-TS 或 perry 内置）
- ✅ `process.stderr.write` 已被现 `diag.ts` 验证可用

---

## 二、设计目标 (Goals)

> **G1 — 统一通道**：所有日志（boot/runtime/错误/IPC）走同一个 `logger`，按级别分流。
>
> **G2 — 跨平台可写**：日志位置用 `logDir()`，跨 macOS/Linux/Windows 都用平台原生日志目录。
>
> **G3 — 可调级别**：用户/开发者可切换 `silent | error | warn | info | debug | trace`。
>
> **G4 — 可观测**：
> - 文件落盘（按日轮转，保留 7 天）
> - stderr 输出（开发模式）
> - 内存 ring buffer（最近 500 条，供"日志查看器"UI 显示）
>
> **G5 — AOT 安全**：无 `eval`、无 `import()` 动态、无 CommonJS `require`；符合 perry 静态分析。
>
> **G6 — 零业务入侵**：现有代码只换导入路径和调用符号，行为不变。
>
> **G7 — 保留 `diag` 兼容**：现有 `diag('step')` / `diagErr('step', err)` 调用点零修改。

---

## 三、架构设计 (Architecture)

### 3.1 文件布局

```
src/
├── diag.ts                          # ★ 改造：升级为完整 logger（保持向后兼容）
└── modules/
    └── diagnostics/                 # ★ 新增：日志查看器（In-App）
        ├── AGENTS.md
        ├── diagnostics-view.ts      # 日志查看器 UI（次级窗口内）
        ├── diagnostics-window.ts    # 次级窗口工厂（与 settings-window 同构）
        └── index.ts                 # 桶式出口

docs/
└── plans/
    └── logger_v1.md                 # 本文档
└── reviews/
    └── 2026-09-03-debug-logging-integration.md   # 设计/集成记录
```

> **为什么不放在 `services/`？** 日志不是业务服务，而是横切关注点。放在根目录 `src/diag.ts` 与原代码保持一致。`modules/diagnostics/` 是用户可见的 UI 子模块，与 `file-manager/`、`settings/` 同构。

### 3.2 类型契约

```typescript
// src/diag.ts (扩展)

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogEntry {
    readonly ts: number;             // Date.now()
    readonly level: LogLevel;        // 过滤维度
    readonly category: string;       // 'boot' | 'ipc' | 'fs' | 'ui' | 'lifecycle' | 'fs-error' 等
    readonly step: string;           // 兼容现有 diag 第一参
    readonly message: string;        // 人类可读
    readonly context?: unknown;      // 任意可序列化上下文
    readonly error?: { name: string; message: string; stack?: string };
}

export interface LoggerConfig {
    level: LogLevel;                 // 运行时级别（可热调整）
    fileEnabled: boolean;            // 默认 true
    stderrEnabled: boolean;          // 默认 true（生产可关）
    fileRotationBytes: number;       // 默认 1 MB；超则归档 + 新建
    ringBufferSize: number;          // 默认 500
}

export interface Logger {
    error(category: string, step: string, err: unknown, ctx?: unknown): void;
    warn(category: string, step: string, message: string, ctx?: unknown): void;
    info(category: string, step: string, message: string, ctx?: unknown): void;
    debug(category: string, step: string, message: string, ctx?: unknown): void;
    trace(category: string, step: string, message: string, ctx?: unknown): void;
    setLevel(level: LogLevel): void;
    getConfig(): LoggerConfig;
    snapshot(): readonly LogEntry[];          // 内存 ring buffer（用于 UI 查看器）
    flush(): void;                            // 立即落盘
    currentFilePath(): string;                // 当前日志文件（跨平台）
}
```

### 3.3 跨平台日志路径

复用现有 `src/platform/paths.ts:logDir()`：

| 平台 | 路径 |
|---|---|
| macOS | `~/Library/Logs/qed/qed-YYYY-MM-DD.log` |
| Linux | `$XDG_STATE_HOME/qed/qed-YYYY-MM-DD.log` (默认 `~/.local/state/qed/...`) |
| Windows | `%LOCALAPPDATA%\qed\Logs\qed-YYYY-MM-DD.log` |

**归档策略：** 单文件超 1 MB 时，rename 为 `qed-YYYY-MM-DD.HHmmss.log` 并新建当前文件；保留最近 7 天、20 个文件硬上限。

### 3.4 向后兼容（`diag` / `diagErr`）

```typescript
// 现有调用:  diag('main() entered')
// 现有调用:  diagErr('autostart enable failed:', err)
// 映射:
//   diag(step, extra)  → logger.debug('boot', step, step, extra)
//   diagErr(step, err) → logger.error('boot', step, err)
```

签名不变。所有 60+ 处调用零修改即可切换通道。

---

## 四、改造计划 (Step-by-Step Plan)

### Phase 1 — 日志内核（`src/diag.ts`）

**目标**：把现有 `diag.ts` 升级为完整 logger，但保留 `diag/diagErr` 导出。

| # | 任务 | 关键点 |
|---|---|---|
| 1.1 | 定义 `LogLevel` / `LogEntry` / `LoggerConfig` / `Logger` 接口 | 仅类型，无运行时 |
| 1.2 | 改造 `emit()` 为按级别分流（stderr + appendFile 双通道，可独立开关） | 保留 try/catch 容错 |
| 1.3 | 引入 ring buffer（数组 + 写入指针，O(1) push） | `snapshot()` 返回不可变副本 |
| 1.4 | 引入 `level` 比较（数字 priority：silent=0, error=1, ..., trace=5） | 低于级别则直接 return |
| 1.5 | 引入 `category`（第一个参数），便于按模块过滤 | `boot` / `ipc` / `fs` / `ui` / `lifecycle` / `shell` / `autostart` / `config` |
| 1.6 | 路径用 `logDir()`，文件按日命名 `qed-YYYY-MM-DD.log` | 跨平台 |
| 1.7 | 实现归档（>1MB → rename + new file；超 7 天/20 个文件 → 删除最旧） | `appendFileSync` + `readdirSync` + `statSync`（**仅限此文件**允许 fs，其他模块仍走 services） |
| 1.8 | `flush()` 方法：把 ring buffer 残留强制 sync | 启动结束 / 错误时用 |
| 1.9 | 模块级 singleton：`export const logger: Logger` + `export function getLogger(): Logger` | 单例便于单测时 stub |

> **注意**：`src/diag.ts` 是项目**唯一**允许直接 `import 'fs'` 的文件（除 `services/` 和 `src/main.ts` 之外的特例），这是项目规则的合理例外——日志基础设施的跨平台 fs 写入就是它的职责。这条要在 `docs/reviews/...` 里明确写出。

### Phase 2 — 改造现有 `console.error / console.log` 散点

把以下 `console.*` 调用统一换为 logger：

| 文件 | 行 | 现状 | 改为 |
|---|---|---|---|
| `src/services/config-service.ts` | 84 | `console.error('config listener threw:', err)` | `logger.error('config', 'listener threw', err)` |
| `src/services/config-service.ts` | 100 | `console.error('config flush failed:', ...)` | `logger.error('config', 'flush failed', err)` |
| `src/services/config-service.ts` | 123 | `console.error('config load failed; ...')` | `logger.error('config', 'load failed', err)` |
| `src/services/recent-files-service.ts` | 48, 66 | `console.error('recent-files flush/load failed:', ...)` | `logger.error('recent', 'flush failed', err)` / `'load failed'` |
| `src/services/notification-service.ts` | 32 | `console.error('notification failed:', ...)` | `logger.error('notify', 'send failed', err)` |
| `src/services/file-service.ts` | 64 | `console.error('stat failed for', full, ...)` | `logger.error('fs', 'stat failed', err, { full })` |
| `src/modules/settings/settings-view.ts` | 90, 97 | `console.error('autostart enable/disable failed:', err)` | `logger.error('autostart', 'enable failed', err)` |
| `src/state/app-state.ts` | 156 | `console.error('store listener threw:', err)` | `logger.error('store', 'listener threw', err)` |
| `src/app/app-controller.ts` | 81, 92, 252, 259, 300 | `console.error('app event listener threw:', err)` 等 | `logger.error('controller', 'event listener threw', err)` |
| `src/app/app-controller.ts` | 311, 317 | `console.log('app entered background'/'active')` | `logger.info('lifecycle', 'background', 'entered background')` |

> **策略**：`grep -l "console.error\|console.log"` 全局扫一遍 → 按文件改。每处只换 import + 调用行，业务逻辑不动。

### Phase 3 — IPC 通道埋点

在 `src/ipc/handlers.ts` 与 `src/ipc/bus.ts` 增加可选 trace：

```typescript
// bus.ts:send() 进入时
logger.trace('ipc', 'send', 'request', { channel, id });

// handlers.ts:registerIpcHandlers() 中每个 bus.register 后
// (无需逐个加 — bus 层 trace 即可覆盖)
```

> 注意：trace 级别默认 OFF，生产不影响性能；调试时打开 `setLevel('trace')` 即可看到所有通道的时延、错误。

### Phase 4 — 设置项：日志级别

**`src/types/config.ts`** 新增字段：

```typescript
export interface AppConfig {
    ...
    readonly logLevel: LogLevel;     // 默认 'info'
}
```

**`DEFAULT_CONFIG`** 加 `logLevel: 'info'`。

**`src/modules/settings/settings-view.ts`** 新增 Section：**Diagnostics**

```
Section('Diagnostics', [
    Row('Log level', logLevelPicker), // Picker 6 档
    Row('Log file',   HStack([Text(logFilePath), Button('Open', () => reveal)])),
    Row('Logging',    HStack([Button('Copy recent entries', copyToClipboard),
                              Button('Clear in-memory buffer', clearBuffer)])),
])
```

`logLevelPicker` 通过 `bus.send('config:update', { patch: { logLevel: next } })` 写回，并在 `app-controller.ts` 的 `startApp` 与配置订阅处同步到 `logger.setLevel()`。

### Phase 5 — 日志查看器 UI（`src/modules/diagnostics/`）

**触发方式：** 在 Settings 里加按钮 "Open log viewer" → 在次级窗口显示（与 Settings 窗口同构，固定大小、可滚动、用户能边用边查）。

```
┌─ Log viewer — qed-2026-09-03.log ─────────────────┐
│ [Level: all ▼] [Category: all ▼] [Search...]       │
├────────────────────────────────────────────────────┤
│ 09:01:12.345 TRACE ipc   send         channel=fs:list│
│ 09:01:12.378 DEBUG ui    sidebar.build ROUTES.map   │
│ 09:01:12.401 ERROR fs    stat failed  full=/a/b/c   │
│ ...                                                │
│                                                    │
│ [Reveal in Finder] [Copy all]                      │
└────────────────────────────────────────────────────┘
```

实现要点：

- 数据源：`logger.snapshot()`（ring buffer 500 条内存版）+ 可选 `bus.send('log:list-recent', { lines: 5000 })`（从磁盘读近 N 行）
- 新增 IPC 通道 `log:snapshot` / `log:current-file-path` / `log:reveal`（仅 ring buffer + 元信息，不动磁盘）
- 过滤：按 level + category + 文本子串
- "Reveal in Finder" 复用 `ShellService.revealInFileManager(logDir())`

> **不在 Phase 5 实施 5.1 的情况**：先做基础查看器（仅 ring buffer），磁盘读取作为"复制完整文件"按钮的功能放在 Phase 5.5。

### Phase 6 — Help 菜单与诊断入口

- `help.openLogDir` 命令已存在（`src/app/app-controller.ts:191`），确保它 reveal `logDir()` 即可，无需改
- About 页面 `src/modules/about/about-view.ts` 加一行 "Log file: <path>" 显示当前日志位置
- 状态栏 `src/ui/status-bar.ts` 可选：右侧加 `● log` 指示器（按当前级别变色：info=蓝/warn=黄/error=红）—— **不阻塞**，可放后续

### Phase 7 — 文档与验证

| # | 任务 |
|---|---|
| 7.1 | `docs/reviews/2026-09-03-debug-logging-integration.md`：记录决策、API、迁移点 |
| 7.2 | 更新 `AGENTS.md` 顶层的 "OVERVIEW" 加一行 "Logging: diag.ts (perry AOT safe, leveled, rotating)" |
| 7.3 | 更新 `src/services/AGENTS.md`（如有需要在 services 内引用 logger） |
| 7.4 | `npm run typecheck` + `npm run check` 必须通过 |
| 7.5 | 手动验证三平台日志路径：macOS `~/Library/Logs/qed/`、Linux `~/.local/state/qed/`、Windows `%LOCALAPPDATA%\qed\Logs\` |

---

## 五、关键设计决策与权衡

### 5.1 为什么用 ring buffer 而不是直接读文件？

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A: 仅读文件** | 简单 | 跨平台 mmap/tail 复杂；UI 滚动卡顿；tail 截断需 polling |
| **B: ring buffer 内存版 + 磁盘归档** | UI 实时；AOT 友好；rotate 简单 | 重启丢 ring buffer（但磁盘仍在） |
| **C: B + 启动时回填** | UI 显示本次+上次 | 内存占用 ↑；启动慢 |

**选 B**：MVP 够用，UI "Open log folder" 让用户看完整历史。

### 5.2 为什么把 logger 放在 `src/diag.ts` 而不是 `src/services/logger-service.ts`？

- 现有代码 60+ 处已 import 自 `'./diag.js'` 或 `'../diag.js'`，零迁移
- Logger 是基础设施，不属于"业务服务"层
- 启动早期（services 构造之前）就需要写日志（boot trace）—— 服务层构造函数需要它，反而依赖反转
- 现有 `paths.ts` 已经在 `platform/` 里硬性属于横切设施，logger 与之同构

> **副作用**：diag.ts 是除 services/ 与 main.ts 外**唯一允许 `import 'fs'` 的模块**。此例外应明确写入 AGENTS.md。

### 5.3 为什么不直接用 `perry/system` 的 `debuglog`？

`util.debuglog` 是 Node 兼容 API，但 Perry 没有显式 stdlib 覆盖且按需 `NODE_DEBUG` 环境变量过滤——和我们想要的"用户可调级别 + 文件落盘 + UI 查看"差距大。自实现更直接。

### 5.4 与"调试模式"开关的关系

Perry CLI 有 `--debug` 等编译/运行标志，但**应用层**用户级别（开发者模式 vs 普通用户）应通过 `config.logLevel` 控制：

- 普通用户：`info`（看错误和重要事件）
- 开发者 / bug 报告：`debug` 或 `trace`
- 静默：`silent` 或 `error`

### 5.5 IPC 通道：`log:list-recent` 是否要加？

| 选项 | 决定 |
|---|---|
| 加（提供磁盘历史回填） | UI 体验好，但 `FileService` 需要新增 `readLines(path, n)` 方法（增加 service 表面） |
| 不加（仅 ring buffer） | MVP，零新增 service 接口；UI 加一个 "Open log folder" 按钮兜底 |

**MVP 决定 = 不加。** Phase 5.5 后续可加，扩 `FileService` 不影响其它模块（按 services AGENTS 约定，service 唯一 fs 入口）。

---

## 六、迁移清单（call sites）

按 grep 结果，共需改写 12 个文件：

```
src/app/app-controller.ts          # 6 处 console.* → logger.*
src/main.ts                        # 0 改（仍用 diag/diagErr；自动路由）
src/state/app-state.ts             # 1 处 console.error → logger.error
src/services/config-service.ts     # 3 处 console.error → logger.error
src/services/file-service.ts       # 1 处 console.error → logger.error
src/services/notification-service.ts # 1 处 console.error → logger.error
src/services/recent-files-service.ts # 2 处 console.error → logger.error
src/modules/settings/settings-view.ts # 2 处 console.error → logger.error (+ 新增 Diagnostics Section)
src/ui/sidebar.ts                  # 0 改（仍用 diag，自动转 debug 级）
src/diag.ts                        # ★ 大改：升级为完整 logger
```

新增 1 个模块（`src/modules/diagnostics/`，4 文件）。

---

## 七、风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| `fs.appendFileSync` 在 sandboxed macOS 上写 `~/Library/Logs` 失败 | 中 | `try/catch` 包住，失败降级到只 stderr（与现有 `diag.ts` 一致） |
| Windows `%LOCALAPPDATA%` 不存在 | 低 | `paths.ts:logDir()` 已用 `readEnv('LOCALAPPDATA')` fallback 到 `AppData\Local` |
| ring buffer 内存增长 | 低 | 硬上限 500 条；JSON.stringify 失败时丢弃 `context` 不抛 |
| 日志归档竞争（同一秒内多次启动） | 低 | 文件名带 HHmmss；归档失败吞掉，不影响主流程 |
| AOT 静态分析：`JSON.stringify(extra)` 接受 any，perry 可能报 warn | 低 | 实际已用 (`src/diag.ts:35`)，验证 perry check 通过 |
| 启动期 `logDir()` 调用时 `__platform__` 未注入 | 低 | `paths.ts:logDir()` 与现有 `appDataDir()` 同源，已经过三平台验证 |
| UI 列表 500 条渲染卡顿 | 低 | 文档先列 ~50 条 + "Load more" 按钮 |

---

## 八、验收标准 (Acceptance Criteria)

1. ✅ `npm run typecheck` 通过
2. ✅ `npm run check`（perry check）通过
3. ✅ `npm run lint` 通过
4. ✅ 三平台路径实测：macOS `~/Library/Logs/qed/...`、Linux `~/.local/state/qed/...`、Windows `%LOCALAPPDATA%\qed\Logs\...`
5. ✅ 单文件 >1MB 自动归档
6. ✅ 切换 `logLevel` 后立即生效（无须重启）
7. ✅ In-app 日志查看器显示 ring buffer，过滤按 level+文本
8. ✅ "Open log folder" 在三平台都能 reveal 到正确目录
9. ✅ 现有 60+ 处 `diag/diagErr` 调用零修改仍工作
10. ✅ `grep "console\\.error\\|console\\.log" src/` 仅剩 ui/theme.ts 内零允许保留（painting debug）

---

## 九、不在本次范围 (Out of Scope)

- 远程日志上报（Sentry/Honeycomb 等）—— 需要 entitlements + 网络；后续独立 PR
- 日志加密 —— 个人桌面应用日志不含敏感信息
- 结构化日志（JSON Lines）—— 人类可读优先
- 跨进程日志（worker 模式）—— 当前 Perry 单进程，无需
- 自动上报 crash dump —— 与平台 crash reporter 重复

---

## 十、实施路线（11 个 commit，按依赖顺序）

### Commit 1 — `diag.ts` 内核升级

- **路径：** `src/diag.ts`
- **内容：** 扩展为 `LogLevel` / `LogEntry` / `LoggerConfig` / `Logger` 完整实现
- **关键：** `logDir()` 文件写入 + ring buffer + 级别过滤 + 归档（>1MB / 7天 / 20文件硬上限）
- **保持：** `export function diag / diagErr` 签名不变（向后兼容）

### Commit 2 — `AppConfig.logLevel` 配置项

- **路径：** `src/types/config.ts`
- **内容：** `AppConfig` 加 `readonly logLevel: LogLevel`；`DEFAULT_CONFIG.logLevel = 'info'`
- **配套：** `config-service.ts` `mergeWithDefaults` 加该字段的解析分支

### Commit 3 — `services/` 错误统一迁移（4 文件）

- `config-service.ts` × 3 处
- `file-service.ts` × 1 处
- `notification-service.ts` × 1 处
- `recent-files-service.ts` × 2 处

### Commit 4 — `state/` 与 `app/` 迁移

- `src/state/app-state.ts` × 1 处
- `src/app/app-controller.ts` × 8 处（含 lifecycle console.log → logger.info）

### Commit 5 — `settings/` 迁移 + Diagnostics Section

- `src/modules/settings/settings-view.ts` × 2 处迁移
- 新增 `Section('Diagnostics', [...])`：logLevel Picker、当前日志文件路径 + Reveal、"Copy recent entries"、"Open log viewer" 按钮（打开次级窗口）

### Commit 6 — `modules/settings/settings-changes.ts` 同步 logLevel 写入 logger

- 通过 store subscribe 或 config listener，在配置变更时调用 `logger.setLevel(...)`

### Commit 7 — IPC trace（可选插拔）

- `src/ipc/bus.ts` `send()` 入口：级别 ≤ trace 时输出 `{ channel, id, ts }`
- 不破坏既有性能（trace 默认 OFF）

### Commit 8 — `modules/diagnostics/` 日志查看器

- `src/modules/diagnostics/index.ts`（桶式出口）
- `src/modules/diagnostics/diagnostics-view.ts`：level filter + category filter + 文本搜索 + 行列表
- `src/modules/diagnostics/diagnostics-window.ts`：次级窗口工厂（`createDiagnosticsWindow()`）
- `src/modules/diagnostics/AGENTS.md`：模块约定

### Commit 9 — 控制器接线

- `src/app/app-controller.ts`：
  - `openDiagnosticsWindow()`（与 `openSettingsWindow()` 同构）
  - `closeDiagnosticsWindow()`
  - 新增 `AppCommand`：`'view.openDiagnostics'`（在 `platform/menu-bar.ts` 联合 + 此处 switch + `app-controller-types.ts` 加 case）+ 菜单项 "Diagnostics" 或快捷键
  - 注册新 IPC 通道（`log:snapshot`、`log:current-file-path`、`log:reveal`）

### Commit 10 — About 页面 + 状态栏可选增强

- `src/modules/about/about-view.ts`：加 `Row('Log file', Text(currentLogPath))`
- `src/ui/status-bar.ts`：可选加 level 指示器（按当前 logLevel 染色）

### Commit 11 — 文档 + 验证

- `docs/reviews/2026-09-03-debug-logging-integration.md`：决策记录、API、迁移点
- `AGENTS.md` 顶层 OVERVIEW 增一行说明
- `npm run typecheck` / `npm run check` / `npm run lint` 三重验证

---

## 十一、关键 API 速览（最终）

```typescript
// src/diag.ts — 公共表面（最终）
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export interface LogEntry { /* ts, level, category, step, message, context?, error? */ }
export const logger: Logger;
export function getLogger(): Logger;
export function diag(step: string, extra?: unknown): void;   // 向后兼容
export function diagErr(step: string, err: unknown): void;   // 向后兼容
```

```typescript
// 新增 IPC channels（src/types/ipc.ts）
| 'log:snapshot'              // 触发 UI 查看器数据（从 ring buffer 读）
| 'log:current-file-path'     // 返回 logDir() 当前文件路径
| 'log:reveal'                // 触发 OS reveal
```

```typescript
// 新增 AppCommand（src/platform/menu-bar.ts）
| 'view.openDiagnostics'
```

---

## 十二、风险控制

- **Commit 1 内核升级单独可回滚**（向后兼容 `diag/diagErr`，迁移零侵入）
- **每 commit 独立可验证**（`npm run typecheck` + `perry check`）
- **现有 `diag()` 调用全部继续工作**（签名不变）
- **perry AOT 兼容**：仅 `console.*` / `fs.appendFileSync` / `readdirSync` / `statSync` / `renameSync` / `unlinkSync`，全部已在 perry stdlib 覆盖范围（`config-service.ts` 与 `recent-files-service.ts` 已在用同类 API）

---

## 十三、交付物清单

### 修改（17 个）

- `src/diag.ts`（大改）
- `src/types/config.ts`
- `src/services/config-service.ts`
- `src/services/file-service.ts`
- `src/services/notification-service.ts`
- `src/services/recent-files-service.ts`
- `src/state/app-state.ts`
- `src/app/app-controller.ts`
- `src/app/app-controller-types.ts`
- `src/platform/menu-bar.ts`
- `src/modules/settings/settings-view.ts`
- `src/modules/settings/settings-changes.ts`
- `src/modules/about/about-view.ts`
- `src/ui/status-bar.ts`（可选增强）
- `src/ipc/bus.ts`（可选 trace）
- `src/ipc/handlers.ts`（新增 3 个 channel handler）
- `src/types/ipc.ts`（新增 3 个 channel + payload）
- `src/main.ts`（在 main() 入口首行 `logger.setLevel(config.logLevel)`）
- `AGENTS.md`（加一行）

### 新增（5 个）

- `src/modules/diagnostics/index.ts`
- `src/modules/diagnostics/diagnostics-view.ts`
- `src/modules/diagnostics/diagnostics-window.ts`
- `src/modules/diagnostics/AGENTS.md`
- `docs/reviews/2026-09-03-debug-logging-integration.md`

### 预计总改动

- **~700 行新增**
- **~80 行替换**

---

## 十四、待办追踪

| # | 任务 | 状态 |
|---|---|---|
| 1 | Phase 1: Upgrade `src/diag.ts` to leveled logger | pending |
| 2 | Phase 2: Add `logLevel` to `AppConfig` | pending |
| 3 | Phase 3: Migrate `services/` error logs (4 files) | pending |
| 4 | Phase 4: Migrate `state/` + `app/` (2 files) | pending |
| 5 | Phase 5: Migrate `settings/` + Diagnostics Section | pending |
| 6 | Phase 6: Wire `logLevel` changes to logger | pending |
| 7 | Phase 7: IPC trace instrumentation | pending |
| 8 | Phase 8: Build `diagnostics/` viewer + window | pending |
| 9 | Phase 9: Wire `AppCommand` + `openDiagnostics` | pending |
| 10 | Phase 10: About page + status bar enhancement | pending |
| 11 | Phase 11: Docs + triple-validate | pending |

---

## 附录 A — 相关文档引用

- 顶层知识库：[`AGENTS.md`](../../AGENTS.md)
- 控制器层：[`src/app/AGENTS.md`](../../src/app/AGENTS.md)
- 服务层：[`src/services/AGENTS.md`](../../src/services/AGENTS.md)
- 平台抽象层：[`src/platform/AGENTS.md`](../../src/platform/AGENTS.md)
- UI 层：[`src/ui/AGENTS.md`](../../src/ui/AGENTS.md)
- 文件管理模块：[`src/modules/file-manager/AGENTS.md`](../../src/modules/file-manager/AGENTS.md)
- 设计规范：[`docs/plan_ui_v1.md`](../plan_ui_v1.md)
- Perry 技能：[`.agents/skills/perry-dev/SKILL.md`](../../.agents/skills/perry-dev/SKILL.md)
- 现有结构评审：[`docs/reviews/2026-09-03-structure-review.md`](../reviews/2026-09-03-structure-review.md)

## 附录 B — 与现有架构的契合点

| 现有规则 | 本方案如何契合 |
|---|---|
| `src/services/` 是唯一 fs 入口 | 保留：仅 `diag.ts` 例外（基础设施职责） |
| `src/app/` 无 index.ts | 保留：`diag.ts` 在根目录 |
| `IpcBus` 不抛 | 保留：logger 调用点在外层 try/catch，handler 仍返回 error payload |
| `AppCommand` 联合 + exhaustiveness | 沿用：新增 `'view.openDiagnostics'` 必须三处（union + switch + handler） |
| `ControllerContext` 仅在 main.ts 构造 | 保留：logger 是单例，不进 ctx |
| ESM `.js` 后缀 | 保留：所有 import 带 `.js` |
| TypeScript strict | 保留：`LogLevel` 字面量联合保证 exhaustiveness |
| AOT 无 `eval`/`require` | 保留：纯静态 API + 静态 import |