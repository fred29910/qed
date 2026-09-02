---
name: perry-dev
description: 使用 Perry（将 TypeScript 直接编译为原生可执行文件的 AOT 编译器）开发程序时使用。覆盖跨平台 CLI 工具、原生桌面/移动 GUI 应用、终端 TUI、Web 服务、系统 API、容器、插件与打包发布等场景。当需要编写/编译/调试 Perry 代码，或查询 Perry 的语言特性、标准库、UI 组件、CLI 命令与编译标志时使用。
agent_created: true
---

# Perry 原生 TypeScript 开发

Perry 是一个 AOT 编译器：把 `.ts` / `.js` 直接编译成原生机器码二进制，**没有 JS 运行时、没有 V8、没有 JIT**。
管道：`SWC 解析 → HIR 降级 → 变换（内联/闭包转换/async）→ LLVM 代码生成 → 系统链接器链接`。

`references/` 目录是从 <https://docs.perryts.com/> 完整整理的官方文档（139 个页面全部收录，内部链接已改写为在线 URL）。**本文件只放最常用的核心知识与路由，细节一律按需读取 `references/` 下的文件。**

---

## 一、何时用 / 何时别用

**用 Perry**：想要单文件原生二进制交付的 CLI 工具、服务端程序、跨平台桌面/移动 App、TUI，且能接受 TypeScript 子集约束。

**别用 Perry**（会撞限制）：代码依赖 `eval`/运行时动态代码、动态 `require()`、N-API 原生插件（`.node`）、Angular/NestJS/TypeORM 那套完整运行时元数据反射、依赖 GC 回收时机的弱引用语义。

---

## 二、与 Node.js / tsc 的关键差异（写码前必读）

Perry 对 Node 行为兼容约 95%（跑 Node v26 官方测试集约 97% 通过），`fs`/`http`/`net`/`tls`/`crypto`/`stream`/`events`/`child_process`/`worker_threads`/`process` 都是**真实实现**而非桩。但以下差异是硬性的：

| 差异 | 后果与规避 |
|---|---|
| **无运行时类型校验** | 类型注解基本被擦除，声明 `string` 的参数传 number 不会抛错。需要判别就用显式 `typeof` / `instanceof` |
| **无 `eval` / 动态代码** | 常量字符串体（`new Function("a","b","return a+b")`）可编译；运行时拼出的体不行。默认降级为「到达时才抛的延迟错误」并在编译末尾列出提示；`--strict-eval` / `perry.eval = "error"` 可改为编译期报错 |
| **动态 `import(spec)` 同上策略** | 可解析的字面量、const 模板串、字面量联合都正常；运行时计算出的 spec 默认降级为 rejected Promise。用 `--strict-dynamic-import` 收紧 |
| **无用户态 CommonJS `require()`** | 源码一律用静态 `import`。`.js` / `.cjs` / `.mjs` / `.jsx` 也能作为编译输入 |
| **弱引用不弱** | `WeakMap`/`WeakSet` 用引用相等，API 行为正确；但 GC 尚未清弱槽 —— 目标对象**不会被回收**，`WeakRef.deref()` 永不返回 `undefined`，`FinalizationRegistry` 回调**永不触发**。别依赖回收时机 |
| **线程不共享可变状态** | `spawn`/`parallelMap` 的闭包不能捕获可变变量（编译期强制），跨线程值深拷贝。例外：`SharedArrayBuffer` 真共享物理内存 + `Atomics`（含阻塞 `wait`/`notify`）。注意**直接捕获 typed-array 视图仍会深拷贝**，要在各线程内从 SAB 建视图 |
| **默认无 WASM 引擎** | `WebAssembly` 全局是「规范外形 + 优雅失败」：`compile`/`instantiate` 返回 rejected `CompileError`，`validate()` 返回 `false`，只有 `new WebAssembly.Memory()` 真能用。惰性 wasm 依赖会走自己的 fallback 而不崩。要真跑需 `--enable-wasm-runtime` |
| **装饰器仅部分支持** | 类/方法/构造参数/方法参数/属性装饰器 + `design:type`/`design:paramtypes` 元数据可用；访问器装饰器、descriptor 替换、Angular/NestJS/TypeORM 完整流程不支持 |
| **Proxy 非完整引擎级 trap** | 优先用普通对象和显式 API |
| **`obj.__proto__ = x`** | 会存成字面量属性，要用 `Object.setPrototypeOf()` |

浏览器/平台差异、二进制体积等详见 `references/language.md`（Limitations 章节）。

---

## 三、安装与项目骨架

```bash
# 安装（推荐 npm，覆盖全部 7 种宿主二进制变体）
npm install -g @perryts/perry          # 或项目内 npm i @perryts/perry + npx perry
brew install perryts/perry/perry       # macOS
winget install PerryTS.Perry           # Windows

# 前置：需要系统 C 链接器
xcode-select --install                          # macOS
sudo apt install build-essential                # Debian/Ubuntu
winget install LLVM.LLVM && perry setup windows # Windows（轻量，约 1.5GB，无需 VS）

perry doctor        # 校验工具链
perry update        # 自更新（包管理器装的请用包管理器升级）

# 项目
perry init my-project && cd my-project
```

`perry init` 生成 `perry.toml`、`package.json`、`src/main.ts`、`.gitignore`、`tsconfig.json` 及 `.perry/types/` 类型桩。

入口文件探测顺序：`perry.toml` 的 `[project] entry` → `src/main.ts` → `main.ts`。

最小程序：

```typescript
console.log("Hello from Perry!")
```

```bash
perry hello.ts -o hello && ./hello      # perry compile hello.ts -o hello 的简写
```

---

## 四、命令速查（22 个顶层命令，常用如下）

```bash
perry compile main.ts -o app          # 编译（perry build 等价）
perry run [ios|visionos|android|web|macos]   # 编译并运行；--simulator/--device 指定；--local/--remote 强制本地或 Perry Hub 远程构建
perry dev src/main.ts                 # 监听改动 → 重编译 → 重启；-- 传参给程序，--watch <dir> 加监听目录
perry check                           # 只做兼容性检查，不产二进制
perry doctor                          # 诊断工具链
perry explain <code>                  # 解释诊断码含义
perry install                         # 走恶意包扫描闸门装 npm 依赖
perry audit                           # 安全扫描 / SBOM（--sbom）
perry verify <bin>                    # 校验二进制或 attestation
perry publish                         # 构建 + 签名 + 打包 + 发布
perry types                           # 生成 Perry 内置 API 的 .d.ts
perry native                          # 原生 binding：脚手架 / 校验 / 列表
perry widget                          # 主屏 widget 目标脚手架与集成
perry lock                            # 原生库供应链 lockfile
perry cache                           # 查看/清理缓存
```

全局标志：`--format text|json`、`-v/-vv/-vvv`、`-q`、`--no-color`。
调试编译：`--print-hir`（打印 HIR）、`--keep-intermediates`、`--no-link`。

完整清单与子命令见 `references/cli-core.md`。

---

## 五、编译目标（`--target`）

| 类别 | 取值 |
|---|---|
| Apple | `macos`、`ios`、`ios-simulator`、`visionos`、`visionos-simulator`、`tvos`、`tvos-simulator`、`watchos`、`watchos-simulator` |
| Google / 华为 | `android`、`android-x86_64`、`wearos`、`harmonyos`、`harmonyos-simulator` |
| Widget | `ios-widget`、`ios-widget-simulator`、`watchos-widget`、`android-widget`、`wearos-tile`（需 `--app-bundle-id`） |
| 桌面 | `windows`、`windows-x86_64`、`windows-aarch64`、`windows-winui`（Fluent/WinUI3，需 Windows App SDK 2.0）、`linux`、`linux-x86_64`、`linux-aarch64`、`linux-musl`（完全静态） |
| Web | `web`（产出 HTML，自动启用 `--minify`）、`wasm` |

`--output-type`： `executable`（默认）/ `dylib`（插件）/ `staticlib`（供原生宿主，导出 `perry_module_init`）。

**`--march` 很关键**：宿主构建默认 `native`（按编译机调优），跨机分发必须显式指定（如 `x86-64-v2` 或 `generic`），否则在老 CPU 上会 SIGILL。可用 `PERRY_TARGET_CPU` 或 `perry.toml` 的 `[build] march` 固定。

全部标志见 `references/cli-flags.md`。

---

## 六、UI 心智模型（写 `perry/ui` 前必读）

**这是最容易按 Web 思维写错的部分。**

- **Widget 是句柄**：`Text("hi")` 创建一个原生控件（macOS `NSTextField` / iOS `UILabel` / Linux `GtkLabel` / Web `<span>`），返回一个小整数句柄。
- **样式是自由函数，句柄作首参**：`textSetColor(label, 1.0, 0.0, 0.0, 1.0)` —— 颜色是 **RGBA 浮点 `[0,1]`**，hex 要除以 255（`0x33/255 ≈ 0.2`）。
- **布局靠栈，不是 CSS**：`VStack(spacing, [...])` / `HStack` / `ZStack`，通过 `stackSetAlignment`、`stackSetDistribution`、`Spacer`、`Divider` 控制。绝对定位用 `widgetAddOverlay` + `widgetSetOverlayFrame`，**没有 `position: absolute`**。
- **响应式状态**：`const n = State(0)`；`n.value` 读，`n.set(v)` 写并触发更新；模板串里 `${n.value}` 会自动绑定。`ForEach(count, render)` **按索引迭代**，需自己维护数组与 count 同步。

```typescript
import { App, VStack, Text, Button, State } from "perry/ui"

const count = State(0)

App({
    title: "Counter", width: 400, height: 300,
    body: VStack(16, [
        Text(`Count: ${count.value}`),
        Button("Increment", () => count.set(count.value + 1)),
    ]),
})
```

`App({})` 还支持 `icon`、`windowState`（`normal|maximized|fullscreen`）、`frameless`、`level`、`transparent`、`vibrancy`、`activationPolicy`；生命周期钩子 `onActivate` / `onTerminate`。

体积参考：hello world ~300KB，带 fs/path 的 CLI ~3MB，UI 应用 ~3MB，全量 stdlib ~48MB。编译器只链接用到的部分。

---

## 七、踩坑预防清单

1. **`compilePackages` 是双钥匙**：把 npm 包编译进原生代码是特权操作，`package.json` 里列了 `perry.compilePackages` **还必须**在 `perry.allow.compilePackages` 里匹配（支持精确名、`@scope/*`、`*`），否则构建直接拒绝。一次性绕过用 `PERRY_ALLOW_PERRY_FEATURES=1`。该字段**只读 `package.json`，不读 `perry.toml`**。

2. **AOT 下没有 JIT**：`ajv`、`fast-json-stringify`、Prisma、Drizzle 这类库默认用 `new Function` 生成校验器，Perry 跑不了。要在 `package.json` 的 `perry.codegen` 里声明**构建期生成命令**（如 `node scripts/generate-validators.mjs` 用 `ajv/standalone`），`perry compile` 会先跑它再编译产物。跳过用 `--no-codegen`。

3. **Linux 用 musl 静态包时没有 `perry/ui`**（GTK4 需要 glibc）。glibc 二进制要求 glibc ≥ 2.31。

4. **UI 开发前装依赖**：Linux 需 `libgtk-4-dev libshumate-dev libgstreamer1.0-dev`；iOS 需完整 Xcode（非仅 Command Line Tools）。

5. **跨平台注意**：`perry/ui` 目标 Linux 需 GTK4 等开发库；Windows 目标建议 `perry setup windows`（xwin 下载 CRT+SDK，`--accept-license` 免交互）。

---

## 八、参考文档路由表

按需 Read，`references/` 为 `SKILL.md` 同级目录。

### 基础
| 你要做的事 | 读 |
|---|---|
| 安装、hello world、第一个 App、项目配置 | `references/getting-started.md` |
| 语言支持清单、类型系统、装饰器、**限制** | `references/language.md` |
| CLI 命令全表、`perry dev/run/check`、更新、缓存、遥测 | `references/cli-core.md` |
| 全部编译标志、`--target` 全集、环境变量 | `references/cli-flags.md` |
| `perry.toml` 完整字段与平台配置 | `references/cli-config.md` |

### 应用类型
| 你要做的事 | 读 |
|---|---|
| **原生 GUI**：widget 清单、布局、状态、事件、样式、主题 | `references/ui-core.md` |
| **原生 GUI 进阶**：Canvas、菜单、托盘、对话框、表格、动画、多窗口、相机、WebView | `references/ui-advanced.md` |
| **终端 TUI**（ink-shape 风格 hooks：`useState`/`useEffect`/`useApp`） | `references/tui.md` |
| **真多线程**：`parallelMap` / `parallelFilter` / `spawn` / SAB+Atomics | `references/threading.md` |
| **Web 服务 / HTTP / DB / 加密 / 工具库**：支持的 npm 包与 Node 内置 | `references/stdlib.md` |
| **自动生成的完整 API 签名** | `references/api-reference.md` |
| **桌面小组件**：iOS/watchOS/Android/WearOS widget | `references/widgets.md` |
| **插件体系**：宿主/插件、hooks、原生扩展、App Store 审核 | `references/plugins.md` |

### 平台与系统能力
| 你要做的事 | 读 |
|---|---|
| Apple 平台：macOS / iOS / visionOS / tvOS / watchOS / 上架 | `references/platforms-apple.md` |
| Android / Wear OS / HarmonyOS NEXT | `references/platforms-mobile.md` |
| Windows（含 Win7 兼容）/ Linux GTK4 / Web / WASM | `references/platforms-desktop-web.md` |
| 系统 API：偏好设置、钥匙串、通知、音频、媒体、定位、后台任务 | `references/system.md` |
| 国际化：插值、复数、格式化、i18n CLI | `references/i18n.md` |
| 应用自动更新 | `references/updater.md` |

### 依赖、容器、安全、运维
| 你要做的事 | 读 |
|---|---|
| 移植 npm 包 | `references/packages.md` |
| **原生绑定**：binding 编写、`perry-ffi` ABI、零配置机制 | `references/native-libraries.md` |
| 原生绑定 manifest schema（spec v1）与治理 | `references/native-libraries-manifest.md` |
| 容器：单容器生命周期、compose、网络、卷 | `references/container-core.md` |
| 容器安全、生产实践、跨后端确定性 | `references/container-advanced.md` |
| 安全加固：`--lockdown`、出网白名单、包能力、attestation、SBOM | `references/cli-security.md` |
| 性能调优：`--fast-math`、动态 stdlib 分派、JS 运行时 opt-in | `references/cli-optimization.md` |

### 深入内部 / 参与编译器开发（写应用一般不需要）
| 你要做的事 | 读 |
|---|---|
| 内存模型、GC、显式内存控制 | `references/internals-memory.md` |
| GC rooting 不变量、Node-API 宿主设计 | `references/internals-compiler.md` |
| 测试注册、Geisterhand UI fuzzer、Node 兼容矩阵、CI 分层 | `references/testing.md` |
| 架构、crate 策略、源码构建、发版 | `references/contributing.md` |

---

## 九、排错路径

```bash
perry doctor                  # 先查工具链与平台依赖
perry check                   # 不改代码先查兼容性
perry compile app.ts --print-hir    # 看 HIR，定位降级/变换问题
perry compile app.ts -v       # 输出 clang/链接器细节
perry explain <诊断码>         # 诊断码含义
```

失败时优先怀疑：① 用了 `eval`/动态 import/动态 `require`；② `compilePackages` 缺 `allow` 白名单；③ 跨机分发忘了 `--march`；④ 目标平台缺系统库（见对应 platforms 文档）。

在线文档（权威来源，本文整理自它）：<https://docs.perryts.com/>
