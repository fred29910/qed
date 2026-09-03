# 开发与打包指南 — 带有 Debug 调试日志的构建

> 本文档描述在 `qed` 项目中，如何构建并打包**带有完整 Debug 调试日志（Logger）**的发行包。内容基于当前实际代码状态（`docs/plans/logger_v1.md` 方案已完全落盘、`docs/reviews/2026-09-03-logger-plan-review.md` 修正已全部吸收、`src/diag.ts` 完成完整 Logger 升级、`AppConfig` 已增加 `logLevel` 字段并版本升至 `2`、`onAppTerminate` 已接入 `logger.flush()`）。

---

## 1. 当前调试日志系统实际状态

根据代码库当前状态（`src/diag.ts`、`src/types/config.ts`、`src/app/app-controller.ts`、`src/main.ts`、`docs/reviews/2026-09-03-logger-plan-review.md`），调试日志系统已完全落地，具备以下能力：

| 能力 | 实现位置 | 说明 |
|---|---|---|
| **分级日志（Leveled Logging）** | `src/diag.ts` | 支持 `silent / error / warn / info / debug / trace` 六级，通过 `LEVEL_PRIORITY` 数字优先级过滤 |
| **文件落盘 + 轮转** | `src/diag.ts` (`LoggerImpl`) | 日志文件写入 `logDir()`（macOS `~/Library/Logs/qed/`、Linux `~/.local/state/qed/`、Windows `%LOCALAPPDATA%\qed\Logs\`）；按日命名 `qed-YYYY-MM-DD.log`；单文件超过 1MB 自动归档为 `qed-YYYY-MM-DD.HHmmss.log`；保留最近 7 天、最多 20 个文件 |
| **内存环形缓冲区（Ring Buffer）** | `src/diag.ts` (`snapshot()`) | 默认保留最近 500 条 `LogEntry`，供 `modules/diagnostics/` 查看器实时读取 |
| **向后兼容（diag / diagErr）** | `src/diag.ts` | 原有 60+ 处 `diag('step')` / `diagErr('step', err)` 调用零修改仍工作，自动映射到 `logger.debug('boot', ...)` / `logger.error('boot', ...)` |
| **配置持久化（AppConfig）** | `src/types/config.ts` | `AppConfig.version` 已升至 `2`，新增 `readonly logLevel: LogLevel` 字段（默认 `'info'`）；`ConfigService.mergeWithDefaults()` 包含版本校验与 `logLevel` 字面量校验（非法值回退到 `'info'`） |
| **运行时热调整** | `src/app/app-controller.ts` | `startApp()` 内通过 `ctx.config.subscribe()` 注册回调：配置写入后立即调用 `logger.setLevel()`，无需重启 |
| **IPC Trace 插桩（可选）** | `src/ipc/handlers.ts` | 不污染 `bus.ts`；通过 `wrapTrace(channel, fn)` 在每个 `register()` 处包裹，仅在 `trace` 级别开启时输出 `{channel, id, ts}` |
| **诊断查看器窗口** | `src/modules/diagnostics/` | 次级窗口（与 `settings-window` 同构），无 `setAlwaysOnTop`（遵守 Perry `Window` API 限制）；显示内存 Ring Buffer，可按 Level + Category + 文本过滤 |
| **终止保命刷新** | `src/app/app-controller.ts` (`onAppTerminate`) | 首行执行 `logger.flush()`，确保进程退出/崩溃前 Ring Buffer 残留日志被同步写入文件 |
| **无残留 `console.*` 散点** | 全局 `grep` 验证 | 除 `src/modules/diagnostics/AGENTS.md` 规则说明外，源码中零残留 `console.log` / `console.error`；全部已被 `logger.error/info` 统一收归 |

---

## 2. 打包时如何控制 Debug 日志级别

调试日志的开启/级别控制有**两条通道**：

### 2.1 开发构建阶段通过配置注入（推荐打包方式）

因为 `AppConfig` 已持久化到 `appDataDir/config.json`，打包时可以直接修改该配置文件或在构建脚本中预置：

```bash
# 方法 A：直接修改已存在的配置文件（适用于本地开发测试包）
CONFIG_FILE="$APP_DATA_DIR/config.json"
jq '.logLevel = "debug" | .version = 2' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
```

```bash
# 方法 B：在打包脚本中预置一个带 debug 级别的默认配置（适用于 CI 构建调试包）
mkdir -p build_config
cat > build_config/default_config.json << 'EOF'
{
  "version": 2,
  "theme": "system",
  "autostart": false,
  "notifications": true,
  "backgroundMode": false,
  "lastFolder": "",
  "fontSize": 13,
  "displayName": "",
  "logLevel": "trace"
}
EOF
# 打包后将该文件复制到安装包内的配置目录，或作为首次启动的默认配置
```

> **注意**：根据 `docs/reviews/2026-09-03-logger-plan-review.md` 修正项 **Q2 / A.1 + A.12**，`AppConfig` 新增 `logLevel` 后必须把 `version` 从 `1` 升至 `2`，并在 `mergeWithDefaults()` 中增加显式校验分支。当前代码已执行（`version: 2` + 字面量校验），因此打包时写入的配置文件必须包含 `"version": 2`，否则 `ConfigService` 会执行版本迁移（回退到默认值，`logLevel` 会被重置为 `'info'`）。

### 2.2 运行时通过设置面板调整（适用于已安装应用）

在应用内：

1. 打开 **Settings（设置）** 窗口（菜单 `App Command: 'app.preferences'` / 按钮 "Open log viewer"）。
2. 进入 **Advanced（原名 Diagnostics，已按 Q2 修正为 "Advanced"）** 区域（参考 `docs/plans/logger_v1.md` Phase 4、`docs/reviews/2026-09-03-logger-plan-review.md` 修正项 Q2 / A.1 + A.12）。
3. 使用 **Log level** 下拉选择器切换（`silent / error / warn / info / debug / trace`）。
4. 切换后 `ConfigService` 通过 `subscribe()` 回调立即同步到 `logger.setLevel()`，**无需重启应用**（参考 `src/app/app-controller.ts:119-121`）。

---

## 3. 构建带 Debug 日志的发行包的完整流程

以下流程基于实际构建脚本（`scripts/build-*.sh`、`scripts/package-*.sh`、`perry.toml`、`package.json`）整理，已结合 Logger 相关实际代码状态验证。

### 3.1 前置条件

根据 `.agents/skills/perry-dev/` 技能规范与项目 `AGENTS.md`：

- **Perry CLI**：已全局安装（`npm install -g @perryts/perry`）或通过 `npx` 调用。
- **系统链接器**：
  - macOS：`xcode-select --install`
  - Linux：`sudo apt install build-essential libgtk-4-dev libshumate-dev libgstreamer1.0-dev`
  - Windows：`winget install LLVM.LLVM && perry setup windows --accept-license`
- **项目依赖**：已执行 `npm install`（`package.json` 中包含 `@perryts/perry ^0.5.1220`）。

### 3.2 构建步骤（带 Debug 日志）

```bash
# 1. 确认代码状态与 Logger 实现完整
npm run check        # perry check src/main.ts — 当前 42 个文件全部通过
npm run typecheck    # tsc --noEmit — 确保 LogLevel / LogEntry / LoggerConfig 类型正确
npm run lint         # 当前存在 10 处 ESLint `curly` 错误（见下文第 4 节），建议先修复

# 2. 选择构建目标（根据实际平台）
#    本示例构建一个带 trace 级别日志的 macOS .app 包
#    （若需要构建所有平台，使用 build:all / package:all 对应脚本）

# 2.1 本地快速构建（开发调试用，不打包为 .dmg）
npm run build         # 生成 bin/qed（当前主机原生二进制）
# 运行后可通过 Settings → Advanced → Log level = trace 打开最大调试输出

# 2.2 构建 macOS 发布包（含 debug 级别预置）
bash scripts/build-mac.sh         # 编译并生成 bin/qed.app
# 若需要预置 trace 配置，在构建前执行：
mkdir -p /tmp/debug_config
cat > /tmp/debug_config/config.json << 'EOF'
{"version":2,"theme":"system","autostart":false,"notifications":true,"backgroundMode":false,"lastFolder":"","fontSize":13,"displayName":"","logLevel":"trace"}
EOF
# 然后将该配置嵌入 .app 包内（参考 scripts/package-mac.sh 与 perry publish 流程）
bash scripts/package-mac.sh        # 生成 bin/qed.dmg（notarized）

# 2.3 构建 Windows 发布包（.exe → .msi）
bash scripts/build-windows.sh      # 使用 LLVM 工具链生成 bin/qed.exe
bash scripts/package-windows.sh    # 执行 scripts/msi-pack.ps1 生成 .msi

# 2.4 构建 Linux 发布包（.AppImage + .deb）
bash scripts/build-linux.sh        # 生成 AppImage / .deb
bash scripts/package-linux.sh      # 完成打包
```

> **打包时预置调试日志的关键点**：由于 `AppConfig.version` 已升至 `2` 且 `logLevel` 已纳入配置，任何预置的 `config.json` 必须同时包含 `"version": 2` 和合法的 `"logLevel"`（必须是六个字面量之一：`silent`、`error`、`warn`、`info`、`debug`、`trace`）。非法值会被 `mergeWithDefaults()` 捕获并回退到 `'info'`（参考 `docs/reviews/2026-09-03-logger-plan-review.md` Q2 对策描述及 `src/services/config-service.ts` 实现）。

---

## 4. 调试日志文件的存储与排查

根据 `src/diag.ts`（`LoggerImpl.ensureBootstrapped()` 及 `currentFilePath()`）和 `src/app/app-controller.ts`（`describeEnvironment()` 返回 `logDir()` 路径）的实际实现：

### 4.1 日志文件位置（跨平台）

| 平台 | 路径（运行时） | 说明 |
|---|---|---|
| macOS | `~/Library/Logs/qed/qed-YYYY-MM-DD.log` | 由 `platform/paths.ts:logDir()` 解析（`~/Library/Logs/qed/`）；`perry.toml` 中 `bundle_id` 与 `entitlements` 已包含文件读写权限 |
| Linux | `$XDG_STATE_HOME/qed/qed-YYYY-MM-DD.log`（默认 `~/.local/state/qed/`） | 同上，遵循 XDG 目录规范 |
| Windows | `%LOCALAPPDATA%\qed\Logs\qed-YYYY-MM-DD.log` | `paths.ts` 使用 `readEnv('LOCALAPPDATA')` 并回退到 `AppData\Local` |

> **归档文件名格式**：超过 1MB 后重命名为 `qed-YYYY-MM-DD.HHmmss.log`（参考 `docs/plans/logger_v1.md` 3.3 节及 `docs/reviews/2026-09-03-logger-plan-review.md` Q3 说明）；归档文件按 `mtimeMs` 排序后删除超出 7 天或 20 个文件上限的最旧文件（参考 `src/diag.ts:377-406` `evictOld()` 实现）。

### 4.2 如何在构建包中验证调试日志是否开启

1. **构建后运行**：执行构建产物（`bin/qed`、`.app`、`.exe`、`.AppImage` 等）。
2. **触发日志写入**：执行任意操作（如打开文件管理器、切换主题、打开设置窗口），或直接通过菜单 `help.openLogDir`（参考 `app-controller.ts:229-232`）打开日志目录查看文件是否存在。
3. **检查内容格式**：每行格式为：
   ```
   HH:MM:SS.mmm LEVEL CATEGORY  step message !! error_info :: context
   ```
   例如：
   ```
   14:32:10.123 TRACE ipc     send         channel=fs:list :: {"path":"/home/user"}
   14:32:10.456 DEBUG ui      sidebar.build ROUTES.map
   ```
4. **使用诊断查看器验证**：打开应用菜单 → `View` → `Open Log Viewer`（`AppCommand: 'view.openDiagnostics'`，参考 `platform/menu-bar.ts` 及 `app-controller.ts:221-223`），查看内存 Ring Buffer 是否正确显示 `trace` 级别条目（若设置为 `trace`，应包含所有 `DEBUG` / `TRACE` 级别的 `ipc`、`boot`、`controller` 条目）。

### 4.3 常见问题与排查路径（基于实际代码）

| 问题现象 | 可能原因（根据实际代码状态） | 排查方法 |
|---|---|---|
| **日志文件未生成** | `logDir()` 路径不可写；`existsSync` / `mkdirSync` 失败；`fileEnabled` 被设为 `false`（`ensureBootstrapped()` 捕获异常后自动关闭文件写入，参考 `src/diag.ts:318-336`） | 检查操作系统日志目录权限（macOS `~/Library/Logs`、Linux `~/.local/state`、Windows `%LOCALAPPDATA%`）；运行应用后检查 `currentFilePath()` 返回值（可通过 `describeEnvironment()` 在 About 页面查看） |
| **Ring Buffer 在重启后丢失** | 这是设计行为（参考 `docs/plans/logger_v1.md` 5.1：选方案 B：仅内存 Ring Buffer + 磁盘归档，不回填历史）。重启后 UI 查看器只显示本次启动后的 500 条 | 正常行为；如需查看完整历史，应使用菜单 `help.openLogDir` 打开文件系统中的 `.log` 文件 |
| **`console.error` 残留仍存在** | 当前代码已全部替换（参考评审结论：`grep` 结果零匹配）；若发现残留，说明构建源未同步到最新代码或存在未提交的修改 | 执行 `grep -rn 'console\.(error\|log)' src/` 验证；若存在，应替换为对应的 `logger.error()` / `logger.info()` 调用（参考 `docs/plans/logger_v1.md` 6.2 节迁移清单及 `docs/reviews/2026-09-03-logger-plan-review.md` Q1 修正表） |
| **IPC Trace 未输出** | `trace` 级别默认 `OFF`（`DEFAULT_CONFIG.level = 'info'`）；`wrapTrace()` 仅在 `LEVEL_PRIORITY[level] <= LEVEL_PRIORITY['trace']` 时写入（参考 `src/ipc/handlers.ts`） | 先将 `logLevel` 设为 `trace`（通过设置面板或预置配置）；再检查 `handlers.ts` 中每个 `register()` 是否已包裹 `wrapTrace()` |
| **设置面板 "Advanced" 部分缺失** | 当前代码中 `settings-view.ts` 已按 Q2 修正新增了 `Section('Advanced', [...])`（参考 `docs/reviews/2026-09-03-logger-plan-review.md` 修正项 A.1 + A.12）；若未显示，说明构建源未包含该修改 | 检查 `src/modules/settings/settings-view.ts` 是否包含 `logLevelPicker` 及相关行 |
| **构建时 `lint` 报错** | 当前存在 10 处 ESLint `curly` 错误（全部在 `app-controller.ts`，参考 `npm run lint` 结果），不影响编译但影响代码规范验证 | 执行 `npm run lint:fix` 自动修复，或手动为每个单行 `if` 补全花括号（参考本报告第 4 节修复建议） |

---

## 5. 与构建脚本和 CI 对接

根据实际构建脚本和 `.github/workflows/build.yml`（参考 `docs/架构.md` 7. 构建与发布、`AGENTS.md` CI 部分）：

- **构建脚本**：`scripts/build-*.sh` 执行 `perry compile` 生成二进制；`scripts/package-*.sh` 执行 `perry publish` 或 `msi-pack.ps1` 生成发布包。
- **CI 流程**：`.github/workflows/build.yml` 当前只运行 `format:check` 作为唯一“测试”步骤（参考 `AGENTS.md` 说明：**没有单元测试**）。若要在 CI 中增加调试日志验证步骤，建议增加以下脚本（参考 `docs/reviews/2026-09-03-logger-plan-review.md` S6 / A.11：明确说明“未做单测，后续 PR 补充”）：
  ```yaml
  # 建议在 CI 中增加的调试日志验证步骤（参考实际代码状态）
  - name: Verify debug log config
    run: |
      # 检查 AppConfig 是否正确包含 logLevel 且 version=2
      grep -q 'readonly logLevel: LogLevel' src/types/config.ts || exit 1
      grep -q 'version: 2' src/types/config.ts || exit 1
      # 检查 logger.flush() 是否在 onAppTerminate 中被调用
      grep -q 'logger.flush()' src/app/app-controller.ts || exit 1
      # 检查诊断查看器模块是否存在
      test -f src/modules/diagnostics/index.ts || exit 1
  ```
- **无测试约束**：根据 `docs/reviews/2026-09-03-logger-plan-review.md` S6 及 `docs/plans/logger_v1.md` 8.4 验收标准，目前项目**没有单元测试**。若需增加 Logger 相关的集成测试（如“写入 `logger.error` 后 `snapshot()` 包含该条目”），应选择项目内未使用的测试框架（参考 `docs/架构.md` 7. 构建与发布说明），并在 `package.json` 中新增 `test` 脚本（当前缺失）。

---

## 6. 打包调试日志的实际操作清单（总结）

根据当前实际代码和构建脚本，打包带有完整 Debug 调试日志的发行包的操作顺序为：

1. **确认源代码状态**：
   - `src/diag.ts` 已包含完整 `LoggerImpl`（分级、文件轮转、Ring Buffer、`flush()`）。
   - `src/types/config.ts` 已包含 `version: 2` 和 `logLevel` 字段。
   - `src/app/app-controller.ts` 已在 `startApp()` 中注册 `subscribe()` 回调、`onAppTerminate()` 首行执行 `logger.flush()`。
   - `src/ipc/handlers.ts` 已包含 `wrapTrace()` 而不污染 `bus.ts`。
   - `src/modules/diagnostics/` 已包含查看器模块（4 个文件，含 `AGENTS.md` 规则说明）。

2. **修复当前构建阻塞问题**（必须执行，否则 `npm run lint` 失败，虽然不阻止 `perry compile` 但影响规范验证）：
   ```bash
   npm run lint:fix
   # 或手动修复 app-controller.ts 中 10 处缺失花括号的 if 语句
   ```

3. **构建发行包**（根据目标平台选择对应脚本）：
   ```bash
   # macOS 发布包（.app + .dmg）
   bash scripts/build-mac.sh
   bash scripts/package-mac.sh
   # 可在构建前预置调试配置到 app 包内，确保首次启动时 logLevel 为 debug 或 trace

   # Windows 发布包（.exe → .msi）
   bash scripts/build-windows.sh
   bash scripts/package-windows.sh

   # Linux 发布包（AppImage + .deb）
   bash scripts/build-linux.sh
   bash scripts/package-linux.sh
   ```

4. **验证调试日志功能**（构建后手动测试步骤）：
   - 运行构建产物。
   - 打开应用菜单 → `View` → `Open Log Viewer`（验证次级窗口正常弹出，无 `always-on-top` 限制）。
   - 执行任意文件操作（触发 `fs:list` 等 IPC），观察 `trace` 级别是否在查看器中显示。
   - 检查日志文件目录（`~/Library/Logs/qed/` 或对应平台路径）是否生成 `.log` 文件，内容是否包含正确格式的行。
   - 执行正常退出（菜单 `Quit`），确认进程退出后无日志丢失（`flush()` 已在 `onAppTerminate()` 执行）。

---

## 7. 与现有文档和评审文件的关联

本指南的内容直接基于以下实际文件和修正记录：

- 方案设计：`docs/plans/logger_v1.md`（全部 11 个 Phase 设计、API 契约、迁移清单、验收标准）。
- 评审修正与决策记录：`docs/reviews/2026-09-03-logger-plan-review.md`（Blockers B1/B2/B3、Questions Q1~Q7、Suggestions S1~S8、最终修改清单 19 项、Commit 重排表）。
- 当前代码实现：`src/diag.ts`、`src/types/config.ts`、`src/app/app-controller.ts`、`src/main.ts`、`src/ipc/handlers.ts`、`src/modules/diagnostics/*`、`platform/paths.ts`。
- 构建与打包：`perry.toml`、`package.json`、`scripts/build-*.sh`、`scripts/package-*.sh`、`docs/架构.md` 第 7 节、`.github/workflows/build.yml`。
- 技能约束：`.agents/skills/perry-dev/`（AOT 安全、无 `eval`/动态 `require`、`Window` API 限制、线程不共享可变状态）。
- 项目规则：`AGENTS.md`（`src/diag.ts` 作为唯一 `fs` 例外、无 `console.*` 散点、`AppCommand` 穷尽检查、无测试约定）。

---

*文档创建依据：实际代码库状态（2026-09-03）、`perry-dev` 技能规范、`docs/plans/logger_v1.md`、`docs/reviews/2026-09-03-logger-plan-review.md` 及相关构建脚本。所有描述均与当前源文件（`src/diag.ts` 454 行、`src/app/app-controller.ts` 417 行、`src/types/config.ts` 48 行等）实际内容一致。*
