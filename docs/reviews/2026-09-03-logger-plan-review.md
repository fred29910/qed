# 调试日志系统集成计划评审 (Debug Logging Plan Review)

**评审日期：** 2026-09-03
**评审对象：** `docs/plans/logger_v1.md`
**评审人：** Claude (perry-dev skill)
**最终结论：** 设计基本可落地；修复 3 个 Blocker 与若干设计疑问后进入实施。

---

## 一、整体评估

| 维度 | 评价 |
|---|---|
| 设计原则 | 与现有架构高度契合：保留 `services/` 为唯一 fs 入口、`IpcBus` 不抛、`AppCommand` 联合 + 强制 exhaustiveness、`ControllerContext` 单点构造 |
| 向后兼容 | ✅ G7 — 保留 `diag` / `diagErr` 签名，60+ 处调用零修改 |
| 跨平台 | ✅ 复用 `paths.ts:logDir()` 已三平台验证；macOS `~/Library/Logs/qed/` 仍是 sandboxed binary 默认可写域 |
| AOT 安全 | ✅ 仅 `appendFileSync` / `readdirSync` / `statSync` / `renameSync` / `unlinkSync` / `mkdirSync` —— 全部在 Perry stdlib 覆盖范围 |
| 范围合理 | 11 个 commit 每个可独立验证、可回滚，零业务入侵 |

**结论：** 计划整体设计扎实、可落地。

---

## 二、严重问题 (Blockers)

### B1 — `diag.ts` 直接 `import 'fs'` 违反"services 是唯一 fs 入口"规则

**问题：** 计划 1.7 与 5.2 自承"diag.ts 是除 services/ 与 main.ts 外唯一允许 `import 'fs'` 的模块"。这是合理的例外，但 AGENTS.md 顶层当前明确把 fs 入口收紧到 `services/`（`src/services/AGENTS.md` "Don't import `fs` in `src/app/` …"）。

**对策：**
- Commit 11 同步修改顶层 `AGENTS.md`：在 "OVERVIEW" 段加一行 "Logger (`src/diag.ts`): the only `fs` consumer outside `src/services/`; perry AOT safe, leveled, rotating"
- `src/services/AGENTS.md` "Don't import fs in ..." 段同步加例外条目："Exception: `src/diag.ts` is allowed to import `fs` for cross-platform log rotation — it is logging infrastructure, not a business service."

**状态：** 已纳入最终计划（修订项 A.8）。

### B2 — 在 `bus.ts` 加 `logger.trace` 引入循环依赖 + 污染 hot path

**问题：** 计划 Phase 7 要在 `src/ipc/bus.ts:send()` 进入时 `logger.trace('ipc', 'send', ...)`。当前 `bus.ts` 只 import `explainFsError`、`IpcChannel/...` —— 加 trace 后会引入 `../diag.js`。问题：

1. `bus.ts` 是启动链路靠前位置（`main.ts:75` 第一批构造），diag.ts 同时被多处引用，没有真正的循环。
2. 但 `bus.ts` 是**平台层基础设施**，让 bus 主动打 trace 会污染所有 IPC 调用的 hot path —— 即使 trace 级别被关，level 比较 + JSON.stringify 上下文仍产生开销。
3. `plan_ui_v1.md:515` 写明 "Bus never throws" —— 计划在 bus 里加 trace 也意味着 bus **依赖 logger 单例**，对单测时 stub 不友好。

**对策：**
- 把 trace 放在 **`src/ipc/handlers.ts`** 中的 `wrapTrace(channel, fn)` 装饰器里
- 每个 `bus.register(channel, fn)` 改为 `bus.register(channel, wrapTrace(channel, fn))`
- `src/ipc/bus.ts` **不**动；保持平台设施纯粹
- trace 级别默认 OFF，性能影响为零；调试时打开 `setLevel('trace')` 即可看到所有通道的时延

**状态：** 已纳入最终计划（修订项 A.6）。

### B3 — "Copy recent entries" 范围与 `log:list-recent` 决策矛盾

**问题：** 计划 5.5 把 `log:list-recent` 推到 Phase 5.5（post-MVP），但 Phase 5 UI 同时声明了"Copy recent entries"按钮和"Open log folder"。后者是 OS reveal（OK），**前者"Copy"必须读盘**：

- "Copy recent entries" → 需要从磁盘读 N 行 → 但计划说 MVP **不加** `FileService.readLines`、不加 `log:list-recent`
- 计划 Phase 5 的"实现要点"又写 "可选 `bus.send('log:list-recent', { lines: 5000 })`（从磁盘读近 N 行）"

**这是矛盾。**

**对策（二选一）：**
- (a) "Copy recent entries" 按钮 MVP 范围**仅复制 ring buffer 内存版本**（500 条），把"复制磁盘历史"挪到 Phase 5.5，与 `log:list-recent` 同步上线
- (b) 提前做 `FileService.readLines`（50 行内）+ `log:list-recent` channel

**采纳：** (a)，与"最小新增 service 接口"目标一致。

**状态：** 已纳入最终计划（修订项 A.5）。

---

## 三、关键设计疑问 (Should-clarify)

### Q1 — `console.error` 计数对不齐

**问题：** 计划 1.2 表格列出 15+ 处 `console.*` 调用点（跨 8 个文件）；迁移清单说"12 个文件"；Commit 3-4 表格只列 8 处。grep 确认：

- `controller.ts`: 6 处（实际是 7 处 —— line 81, 92, 269, 276, 318, 329, 335）
- 计划 5.5 写"config listener / flush / load"都是 service 内部，handler 不会触发
- `controller.ts` 中 `console.log`（line 329, 335）算 2 处

**对策：** Commit 4 表格按行号 + 类别（info/error/warn）显式列出全部 7 处。

**最终映射：**

| 文件:行 | 现状 | 改为 | 类别 |
|---|---|---|---|
| `app-controller.ts:81` | `console.error('app event listener threw:', err)` | `logger.error('controller', 'event listener threw', err)` | error |
| `app-controller.ts:92` | `console.error('file manager intent listener threw:', err)` | `logger.error('controller', 'intent listener threw', err)` | error |
| `app-controller.ts:269` | `console.error('autostart enable failed:', err)` | `logger.error('autostart', 'enable failed', err)` | error |
| `app-controller.ts:276` | `console.error('autostart disable failed:', err)` | `logger.error('autostart', 'disable failed', err)` | error |
| `app-controller.ts:318` | `console.error('config flush failed on terminate:', err)` | `logger.error('controller', 'terminate: config flush failed', err)` | error |
| `app-controller.ts:329` | `console.log('app entered background')` | `logger.info('lifecycle', 'background', 'entered background')` | info |
| `app-controller.ts:335` | `console.log('app became active')` | `logger.info('lifecycle', 'foreground', 'became active')` | info |

**状态：** 已纳入最终计划（修订项 A.11）。

### Q2 — `logLevel` 应否进 `AppConfig`？schema version 是否 bump？

**问题：** 现有 `AppConfig` 是"用户偏好"（theme / autostart / notifications / backgroundMode / lastFolder / fontSize / displayName）。`logLevel` 更接近**开发者诊断开关**，普通用户不应碰。

**对策：**
- `logLevel` 进 `AppConfig`，默认值 `'info'` 可接受
- **但** `AppConfig.version` 当前 `1`，新增字段后必须 bump 到 `2`
- `mergeWithDefaults` 增加 `version === 2` 校验分支 + `logLevel` 字面量校验（仅 `silent/error/warn/info/debug/trace` 之一；其他值回落 `'info'`）
- settings-view Section 标题改为 `Advanced`（而非 `Diagnostics`）以提示普通用户无需关心

**状态：** 已纳入最终计划（修订项 A.1 + A.12）。

### Q3 — 文件命名时间戳 vs 当日单文件

**问题：** 计划 3.3 路径"qed-YYYY-MM-DD.log"+ 归档">1MB → qed-YYYY-MM-DD.HHmmss.log"。考虑：

- macOS HFS+ / APFS 时间戳精度为秒（部分为毫秒），Windows NTFS 为 100ns —— 跨机打开归档排序可能跳秒

**对策：** 不影响功能（`LogEntry` 自身含毫秒级 `ts`），但 README 警告一下更好；归档失败由 `try/catch` 吞掉（与原计划风险7 一致）。

**状态：** 保持原计划，仅在 review 文档中标注。

### Q4 — Level 比较数字常量定义在哪？

**问题：** 计划 1.4 说"silent=0, error=1, ..., trace=5"，但未明确实现方式。

**对策：**

```typescript
const LEVEL_PRIORITY: Record<LogLevel, number> = {
    silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5,
};
```

并把 `compareLevel(a, b)` 提为内部 helper（不要导出，避免被业务代码误用）。文件里加一行注释解释"trace > info"。

**状态：** 已纳入最终计划 Commit 1。

### Q5 — `flush()` 与 `app.onTerminate` 的对接

**问题：** 计划 Phase 4 第 199 行承诺"commit 4 迁移 lifecycle"，但没明说 `onAppTerminate()` 是否要 `logger.flush()`。

**对策（强制）：** 加 `logger.flush()` 到 `onAppTerminate()` 首行：

```typescript
export function onAppTerminate(ctx: ControllerContext): void {
    logger.flush(); // ring buffer 残留 + 文件尾部 sync
    try {
        ctx.config.flushNow();
    } catch (err) {
        logger.error('controller', 'terminate: config flush failed', err);
    }
    if (trayHandle !== null) trayHandle = null;
    if (settingsWindow !== null) settingsWindow = null;
}
```

否则进程在崩溃时 ring buffer 内的最后 ~500 条诊断会丢失 —— 这恰恰是 logger 最该保命的场景。

**状态：** 已纳入最终计划（修订项 A.2）。

### Q6 — `Window` API 不支持 `setAlwaysOnTop`，诊断查看器只能普通次级窗口

**问题：** Perry `Window` 实例方法（per `references/ui-advanced.md:850-866`）：`setBody / show / hide / setSize / onFocusLost / close`。**没有** `setAlwaysOnTop`。`level: 'floating'` 仅 `App({ level })` 主窗时可用。计划 Phase 5 说"与 settings-window 同构" —— 隐含期待"诊断窗口 always-on-top"做不到。

**对策：**
- `createDiagnosticsWindow()` 与 `createSettingsWindow()` 同构，**不**设置 level
- 在 `src/modules/diagnostics/AGENTS.md` 显式声明 "no always-on-top; user can re-show via menu/button"
- 在 settings-view 标注："诊断窗口在主窗口被遮时可被遮（与 Settings 窗口一致）"

**状态：** 已纳入最终计划（修订项 A.7）。

### Q7 — IPC channel `log:reveal` 与现有 `shell:open-path` 重叠

**问题：** 计划 Section 11 新增 3 个 channel：`log:snapshot`、`log:current-file-path`、`log:reveal`。**`log:reveal` 与现有 `shell:open-path` 重叠** —— 后者已能 reveal 任意路径。

**对策：** **删 `log:reveal`**，UI 用 `shell:open-path` 直接发 `logDir()` 即可：

- IPC surface 更小
- 不破坏"shell:* 是唯一 OS 集成"的命名一致性
- 与现有 5.5 决策（MVP 不加 service 接口）更协调

**保留 channel：**
- `log:snapshot`（返回 `LogEntry[]` 内存版）
- `log:current-file-path`（返回 `string`）

**状态：** 已纳入最终计划（修订项 A.4）。

---

## 四、建议补充 (Nice-to-have)

### S1 — `src/main.ts` 启动顺序：logger.setLevel 放在哪？

**问题：** 计划 13.1 说"src/main.ts（在 main() 入口首行 `logger.setLevel(config.logLevel)`）"，但 `ConfigService` 构造时**还没**订阅 logger 的 `setLevel` 回调。考虑启动顺序：

```
1. const config = new ConfigService();     // 内部错误会打 console.error
2. logger.setLevel(config.snapshot().logLevel);
3. ... 其他
```

或者把 `logger.setLevel(...)` 放在 main() **最末**（在 `startApp` 之前），确保 config 加载失败也能用 logger 记录。计划里写的"首行"是 typo 还是故意？

**对策：** 改为 "main() 末尾、startApp() 之前"。

**状态：** 已纳入最终计划（修订项 A.3）。

### S2 — `LogEntry.context` 写入磁盘前过滤

**对策：** 写入磁盘前过一遍 `context`：移除 `function` / `symbol` / 循环引用引用到的键。ring buffer 渲染同理：渲染失败丢弃该字段不抛。

**状态：** 已纳入最终计划 Commit 1。

### S3 — `LogEntry.error.stack` 截断

**对策：** 默认截断 8 行（与现有 `diag.ts:49` 一致）。`LoggerConfig.stackLines: 8` 可配置。

**状态：** 已纳入最终计划 Commit 1。

### S4 — `help.openLogDir` 满足 Phase 6 要求

✅ 现存 `controller.ts:206-209` 已经 `activeContext.shell.revealInFileManager(logDir())` —— 不需改。

**状态：** 保持原计划，无需修改。

### S5 — Phase 10 状态栏可选增强

`paintDanger / paintAccent / paintMuted` 等已经在 `ui/theme.ts`；状态栏只需订阅 `logger.getConfig().level` 即可。建议放在 Phase 10 末尾作为可选项，并在 docs/reviews 写明"未实施"以避免 CI 误报。

**状态：** 已纳入最终计划 Commit 10。

### S6 — 测试项目根 AGENTS.md 写明"no unit tests"

计划 8.4 验收是 `npm run typecheck` + `npm run check` + `npm run lint`，**没有单测**。考虑到 logger 是基础设施 + ring buffer 是状态相关代码，**至少应加 1-2 个 sanity 集成测试**（如"logger.error 后 snapshot() 包含该 entry"），但鉴于项目"无测试"约定，**不强求** —— 在 review 文档中明示"测试未做；后续 PR 加"。

**状态：** 已纳入最终计划 Commit 11（明示未做单测）。

### 计划执行后追加问题修复（review 完成后发现）

执行完 11 个 commit 后，对日志系统本身做了两轮补充修复：

| 问题 | 根因 | 修复 |
|---|---|---|
| **P1 — Lint `curly` 错误 10 处** | `app-controller.ts` 中 1 处新增 (`closeDiagnosticsWindow` line 275) + 9 处预存 (`app.hide/showAll/quit`、`openSettingsWindow`、`closeSettingsWindow`、`closeMainWindow`、`cycleTheme`、`onAppTerminate`) 的单行 `if` 违反 ESLint `curly: 'always'` 规则 | 在 `app-controller.ts` 全部 10 处补全花括号 |
| **P2 — Diagnostics 查看器 filter bug + 性能** | (a) `Picker` 回调只更新 `State<>` 与 `revision`，**没有把过滤后的 list 重新挂载** —— filter UI 形同摆设 (`State<T>` 无 subscribe)；(b) 每次 filter 改动重渲染 500 个原生 widget | 重写 `diagnostics-view.ts`：默认渲染最新 100 条 + "Load more" 按钮（每步 +200，最多 RING_BUFFER_CAP=500 条）+ summary 文案 "Showing X of Y entries" |

### S7 — docs/reviews 命名

`docs/reviews/2026-09-03-logger-plan-review.md` —— 与现有 `docs/reviews/2026-09-03-structure-review.md` 一致。✅

**状态：** 本文档已落盘。

### S8 — 现有 `console.error('stat failed for', full, ...)` 多参数

`file-service.ts:64` 是 `console.error('stat failed for', full, explainFsError(err))`（3 参数），改成 `logger.error('fs', 'stat failed', err, { full })`（4 参数 + ctx object）—— 现有 Console API 自动 join，logger 用 ctx 对象更结构化。

**状态：** 已纳入最终计划 Commit 3。

---

## 五、与 perry-dev 技能的对齐

| 计划声明 | perry-dev 验证 | 状态 |
|---|---|---|
| "console/process.stderr/fs.appendFileSync 在 perry stdlib 覆盖范围" | `references/api-reference.md:1469,1470, 1556, 1571` 列出全部 fs append / sync API | ✅ |
| "无 eval/动态 import/CommonJS require" | `references/language.md` 限制章节 | ✅ |
| "JSON.stringify 接受 any" | `src/diag.ts:35` 已验证可用 | ✅ |
| "Window 支持 show/hide/close/setBody/setSize/onFocusLost" | `references/ui-advanced.md:850-866` 确认 | ✅ |
| "Window 不支持 setAlwaysOnTop（只有 App({ level })）" | `ui-advanced.md:911-925` 仅 `App({ level })` 支持 level | ⚠️ 计划隐含的"诊断窗口 always-on-top"不可达 |

---

## 六、commit 重排表

```
原 Commit 1   diag.ts 内核              → 不变 + Q4 (LEVEL_PRIORITY) + S2 (context 过滤) + S3 (stack 截断)
原 Commit 2   AppConfig.logLevel        → + schema version bump (1 → 2) + mergeWithDefaults 显式分支
                                          + main.ts 中 logger.setLevel 时机修正（S1）
原 Commit 3-4 services/state/app 迁移  → + Q1 修正处数 / 类别表 + logger.flush() 接入 onAppTerminate（Q5）
原 Commit 5   settings + Advanced        → + Section 标题改为 "Advanced"（Q2 落地）
                                          + 删 log:reveal channel（Q7）
                                          + Copy recent entries 仅 ring buffer（B3）
原 Commit 6   logLevel 写入 logger       → 不变
原 Commit 7   IPC trace                 → ★ 改在 handlers.ts wrapper，bus.ts 不动（B2）
原 Commit 8   diagnostics/ viewer       → + 显式声明无 always-on-top（Q6）
原 Commit 9   AppCommand + window       → + openDiagnosticsWindow 签名 (bus, store, shell) 与 settings 同构
原 Commit 10  About / status bar        → status bar 标注 "可选增强，未实施"
原 Commit 11  docs + verify             → + AGENTS.md 写明 diag.ts fs 例外（B1）
                                          + review 文档写明"未做单测"（S6）
                                          + 落盘本文件
```

---

## 七、5 个待决策项与最终采纳

| # | 决策项 | 采纳 |
|---|---|---|
| 1 | schema version 是否 bump? | ✅ bump 到 2，mergeWithDefaults 显式校验 |
| 2 | `log:reveal` 是否删? | ✅ 删，统一用 `shell:open-path` |
| 3 | "Copy recent entries" 范围? | ✅ 仅 ring buffer（500 条），磁盘读取挪到 Phase 5.5 |
| 4 | IPC trace 写在 bus.ts 还是 handlers.ts wrapper? | ✅ handlers.ts wrapper，bus.ts 不动 |
| 5 | `logger.flush()` 是否接入 `onAppTerminate`? | ✅ 必须接入，否则崩溃时 ring buffer 丢失 |

---

## 八、最终修改清单

**修改（19 个）：**
- `src/diag.ts`（大改）
- `src/main.ts`（logger.setLevel 时机修正）
- `src/types/config.ts`（version: 1 → 2 + logLevel 字段）
- `src/types/ipc.ts`（**不**新增 log:reveal）
- `src/services/config-service.ts`（mergeWithDefaults 加分支 + 3 处 console.error → logger）
- `src/services/file-service.ts`（1 处 console.error → logger）
- `src/services/notification-service.ts`（1 处 console.error → logger）
- `src/services/recent-files-service.ts`（2 处 console.error → logger）
- `src/services/AGENTS.md`（加 fs 例外条目）
- `src/state/app-state.ts`（1 处 console.error → logger）
- `src/app/app-controller.ts`（7 处 console.* → logger + logger.flush() 接入 + config 订阅 + openDiagnosticsWindow/closeDiagnosticsWindow + handleCommand 新 case）
- `src/app/app-controller-types.ts`（无需改）
- `src/platform/menu-bar.ts`（union 加 'view.openDiagnostics' + macOS/Windows 菜单项 wiring）
- `src/modules/settings/settings-view.ts`（2 处 console.error → logger + 新增 Advanced Section）
- `src/modules/settings/settings-changes.ts`（无需改）
- `src/modules/about/about-view.ts`（加 Row 'Log file'）
- `src/ui/status-bar.ts`（可选增强，未实施）
- `src/ipc/handlers.ts`（wrapTrace 装饰器）
- `src/ipc/bus.ts`（**不动**）
- 顶层 `AGENTS.md`（加 Logger 一行）

**新增（5 个）：**
- `src/modules/diagnostics/index.ts`
- `src/modules/diagnostics/diagnostics-view.ts`
- `src/modules/diagnostics/diagnostics-window.ts`
- `src/modules/diagnostics/AGENTS.md`
- `docs/reviews/2026-09-03-logger-plan-review.md`（本文件）

**预计总改动：** ~750 行新增 / ~85 行替换

---

## 九、待办追踪

| # | 任务 | 状态 |
|---|---|---|
| 1 | Phase 1: Upgrade `src/diag.ts` to leveled logger | pending |
| 2 | Phase 2: Add `logLevel` to `AppConfig` (version 2) | pending |
| 3 | Phase 3: Migrate `services/` error logs (4 files) | pending |
| 4 | Phase 4: Migrate `state/` + `app/` (2 files, 7 sites) | pending |
| 5 | Phase 5: Migrate `settings/` + Advanced Section | pending |
| 6 | Phase 6: Wire `logLevel` changes to logger | pending |
| 7 | Phase 7: IPC trace via handlers.ts wrapper (NOT bus.ts) | pending |
| 8 | Phase 8: Build `diagnostics/` viewer + window | pending |
| 9 | Phase 9: Wire `AppCommand` + `openDiagnostics` | pending |
| 10 | Phase 10: About page + status bar enhancement (optional) | pending |
| 11 | Phase 11: Docs + triple-validate + AGENTS.md fs exception | pending |
| 12 | **Review 落盘（本文档）** | **done** |

---

## 十、附录

### A. 相关引用

- 计划文档：`docs/plans/logger_v1.md`
- 评审对象：`docs/plans/logger_v1.md`（v1 初稿）
- 结构评审：`docs/reviews/2026-09-03-structure-review.md`
- Perry 技能：`.agents/skills/perry-dev/SKILL.md`
- 项目根知识库：`AGENTS.md`

### B. 与现有架构契合点

| 现有规则 | 本方案如何契合 |
|---|---|
| `src/services/` 是唯一 fs 入口 | 保留：仅 `src/diag.ts` 例外（基础设施职责，AGENTS.md 显式登记） |
| `src/app/` 无 index.ts | 保留：`diag.ts` 在根目录 |
| `IpcBus` 不抛 | 保留：logger 调用点在外层 try/catch，handler 仍返回 error payload |
| `AppCommand` 联合 + exhaustiveness | 沿用：新增 `'view.openDiagnostics'` 必须三处（union + switch + handler） |
| `ControllerContext` 仅在 main.ts 构造 | 保留：logger 是单例，不进 ctx |
| ESM `.js` 后缀 | 保留：所有 import 带 `.js` |
| TypeScript strict | 保留：`LogLevel` 字面量联合保证 exhaustiveness |
| AOT 无 `eval`/`require` | 保留：纯静态 API + 静态 import |
| `Window` API 不支持 setAlwaysOnTop | 沿用：diagnostics 窗口与 settings-window 一致，**不**声明 always-on-top |
| `shell:open-path` 是唯一 OS reveal 通道 | 沿用：删除 `log:reveal`，UI 用 `shell:open-path` |

### C. 不在本次范围（重申）

- 远程日志上报（Sentry/Honeycomb 等）
- 日志加密
- 结构化日志（JSON Lines）
- 跨进程日志（worker 模式）
- 自动上报 crash dump
- 单测（与项目"no tests"约定一致）
- status bar level 指示器（可选增强，未实施）
- `FileService.readLines` + `log:list-recent`（Phase 5.5 后续）
