# `qed` 项目目录结构合理性评审

**评审日期：** 2026-09-03
**评审人：** MiniMax-M3
**评审范围：** `src/`（92 个项目文件中约 38 个核心 TS 文件），跨平台 Perry AOT 桌面骨架
**关联文档：**
- 顶层知识库：[AGENTS.md](../../AGENTS.md)
- 控制器层：[src/app/AGENTS.md](../../src/app/AGENTS.md)
- 服务层：[src/services/AGENTS.md](../../src/services/AGENTS.md)
- 平台抽象层：[src/platform/AGENTS.md](../../src/platform/AGENTS.md)
- UI 层：[src/ui/AGENTS.md](../../src/ui/AGENTS.md)
- 文件管理模块：[src/modules/file-manager/AGENTS.md](../../src/modules/file-manager/AGENTS.md)
- 设计规范：[plan_ui_v1.md](../plan_ui_v1.md)

---

## 一、整体结论

**结构设计合理度评分：⭐⭐⭐⭐☆（4.0 / 5.0）**

项目采用了清晰、可扩展的分层架构，**符合 Perry AOT 静态分析约束**和**跨平台桌面应用领域惯例**。模块边界、依赖方向、关注点分离都做得很到位。仅在 **theme 双层冗余**、**IPC envelope 过度设计**、**services 与 platform 偶发循环**上存在可优化空间。

---

## 二、当前目录结构总览（实测版）

```
qed/src/
├── main.ts                          # 入口（perry.toml 指向）
├── app/                             # 控制层 ─── 无 index.ts（按约定）
│   ├── app-controller.ts            #    12 KB，主调度
│   ├── app-controller-types.ts      #    49 行，纯类型
│   └── theme.ts                     #    Palette 类型 + LIGHT/DARK 冻结常量
├── modules/                         # 特性模块 ─── 每个子目录有 index.ts
│   ├── about/                       #    最小模块（2 文件）
│   ├── file-manager/                #    视图 + 操作 + 边界（3 文件）
│   └── settings/                    #    视图 + 变更 + 边界（3 文件）
├── services/                        # 横向服务 ─── barrel index.ts
│   ├── index.ts                     #    5 个服务汇总
│   ├── config-service.ts            #    200 行，最大
│   ├── file-service.ts              #    FS 操作（唯一允许 fs 导入的服务）
│   ├── notification-service.ts      #    通知（用户偏好门控）
│   ├── recent-files-service.ts      #    最近文件列表
│   └── shell-service.ts             #    openUrl + revealInFinder
├── types/                           # 共享类型 ─── barrel index.ts
│   ├── index.ts                     #    config + ipc
│   ├── config.ts                    #    AppConfig / ThemeMode
│   └── ipc.ts                       #    IpcChannel 联合 + payload 接口
├── ipc/                             # IPC 总线 ─── 无 index.ts
│   ├── bus.ts                       #    IpcBus 类
│   └── handlers.ts                  #    16 个 channel 注册
├── platform/                        # OS 抽象 ─── barrel index.ts
│   ├── index.ts                     #    6 模块汇总
│   ├── platform.ts                  #    HostKind + 平台判定
│   ├── paths.ts                     #    appDataDir / cacheDir / logDir
│   ├── fs-permissions.ts            #    checkFsAccess + explainFsError
│   ├── autostart.ts                 #    登录启动
│   ├── menu-bar.ts                  #    AppCommand 联合 + installAppMenu
│   └── tray-adapter.ts              #    系统托盘
├── state/                           # 全局状态 ─── 单文件
│   └── app-state.ts                 #    AppStore + resolveTheme
├── ui/                              # 扁平 Widget 层 ─── 无 index.ts
│   ├── theme.ts                     #    调色板助手 + paint*
│   ├── sidebar.ts                   #    路由导航
│   ├── status-bar.ts                #    状态条
│   ├── title-bar.ts                 #    标题栏
│   ├── settings-window.ts           #    次要窗口工厂
│   ├── toast.ts                     #    错误 toast
│   └── widgets.ts                   #    Section/Row/Badge 等原子
└── scripts/  build/  platforms/  docs/  perry.toml  package.json  …
```

---

## 三、做得好的地方 ✅

### 1. 严格的依赖方向（Unidirectional Dependency Flow）

```
main.ts
 │
 ▼
app/  ◄───── platform/  ◄───── perry/ui（仅在此使用）
 │ ▲
 ▼         │
services/ ─►│
 │
 ▼
ipc/  ◄───── types/
 │
 ▼
modules/ ───► ui/ + ipc/ + services/（仅通过 barrel）
```

- **main.ts 是唯一组合点**：构造服务、注册 IPC、装配 Controller、构建 View。
- **modules 不能反向依赖 app/**：避免循环依赖（[src/app/AGENTS.md](../../src/app/AGENTS.md) 已明确禁止）。
- **AppCommand 单一来源**（`platform/menu-bar.ts`）→ 在 `app-controller.ts` 用 `_exhaustive: never` 强制穷尽，TypeScript 编译期保护。

### 2. 边界即入口的 barrel 设计

| 目录            | 是否 barrel | 设计意图                                       |
| --------------- | ----------- | ---------------------------------------------- |
| `app/`          | ❌ 无       | 控制器是"按名导入"的，不混淆归属               |
| `ui/`           | ❌ 无       | Widget 文件各司其职，避免"上帝 index"          |
| `modules/*/`    | ✅ 每个有   | 模块封装边界                                   |
| `services/`     | ✅          | 服务面是聚合的                                 |
| `types/`        | ✅          | 类型聚合                                       |
| `platform/`     | ✅          | OS 抽象聚合                                    |

这种 **"按层差异化使用 barrel"** 的策略比"全有或全无"更精细，体现了对模块通信成本的理解。

### 3. 关注点分离（SoC）做得到位

- **状态/行为分离**：`state/` 只管快照与订阅，行为在 `services/`。
- **UI 与平台 API 隔离**：`ui/` 文件不直接调 `perry/ui` 的 tray/menu（仅 `perry/ui` 的布局原语），托盘和菜单都封装在 `platform/`。
- **测试友好**：`theme.ts` 分 `app/theme.ts`（纯类型 + 常量）和 `ui/theme.ts`（副作用 helper），`app/theme.ts` 不依赖 `perry/ui`，可纯单元测试。

### 4. 单一事实来源（SSOT）严格执行

- **配置**：只有 `ConfigService` 写磁盘，`AppStore` 通过 `subscribe` 同步。
- **最近文件**：只有 `RecentFilesService` 持久化，handler 调 `store.notifyRecentChanged()` 触发重读。
- **主题**：`AppStore.resolvedTheme` + `ui/theme.currentPalette` 必须同步（[src/ui/AGENTS.md](../../src/ui/AGENTS.md) 已注明）。
- **`fs` 隔离**：`fs-permissions.ts` 是看门人；`ipc/bus.ts` 文件头注释明确禁止模块直接 import `fs`。

### 5. Perry AOT 兼容性已贯彻

- 全 ESM + `.js` 扩展导入（满足 `bundler` resolution + `isolatedModules`）。
- 无 `eval` / 动态 `require` / N-API / 编译期 `process` 访问。
- 类型守卫代替 `instanceof`（见 `ipc.ts` 中 `IpcOk | IpcErr` 判别联合）。
- 用本地 `cloneConfig()` 而非 `structuredClone`（避免 AOT 子集外）。

---

## 四、值得改进的地方 ⚠️

### 1. ⚠️ `theme.ts` 双层冗余

**现状：**
- [src/app/theme.ts](../../src/app/theme.ts)：定义 `Palette` 类型、`LIGHT` / `DARK` 冻结常量、`paletteFor()`。
- [src/ui/theme.ts](../../src/ui/theme.ts)：re-export 上述，再加 `currentPalette` / `applyTheme()` / `paint*`。

**问题：**
- `app/theme.ts` 只被 `ui/theme.ts` 与 `ui/settings-window.ts`（间接）使用 → 它"住在 app 目录"却 **不依赖 controller**，分类偏名实不符。
- `ui/theme.ts` 第 18 行又做了一次内部 import：`import { DARK, LIGHT, type Palette, type RGBA } from '../app/theme.js'` —— 已 re-export 又本地 import，循环自找麻烦。

**建议（任选其一）：**

| 选项 | 改动                                                                                | 代价                                                                          |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A    | 把 `Palette` 与常量下沉到 `src/ui/theme.ts`，让 `app/theme.ts` 只做 re-export        | 反向依赖 `app` → `ui`                                                         |
| B    | 把调色板常量移到 `src/state/app-state.ts` 旁边（一个独立的 `palette.ts`）            | 共享常量无归属                                                                |
| C    | 维持现状，但在 `ui/theme.ts` 删除第 18 行内部 import，仅用 re-export；并加文档注释 | 零风险                                                                        |

**推荐 C + 加文档**：在 `app/theme.ts` 顶部注释明确说明"为了测试时不引入 `perry/ui`，将纯类型与常量放在 app/，副作用 helper 放在 ui/，**两者等价于同一层但拆开打包**"。

### 2. ⚠️ `ipc.ts` 中 `IpcChannel` 与 `handlers.ts` 双源

- [src/types/ipc.ts](../../src/types/ipc.ts) 定义 16 个 channel 名 + payload。
- [src/ipc/handlers.ts](../../src/ipc/handlers.ts) 实际注册这 16 个 channel（`bus.register('fs:list', ...)`、`bus.register('fs:read', ...)` ……）。

**问题：** 添加新 channel 时，需要先在 `types/ipc.ts` 加联合成员，再到 `handlers.ts` 注册，再到 `services/*.ts` 实现，再到 `modules/*.ts` 调用。**4 处联动**容易漏。

**建议：**
- 在 `types/ipc.ts` 顶部加 `@see ipc/handlers.ts` 注释交叉引用。
- 或在 CI 加一条 lint 规则：从 `handlers.ts` 解析所有字符串字面量与 `IpcChannel` 求差集。
- 或更进一步：用类型级编程把 channel + payload + handler 三元封装在一个 `registerChannel<C, P, R>()` 工厂里（但要权衡运行时复杂度）。

### 3. ⚠️ `state/app-state.ts` 字段命名混搭

`AppState` 用了"语义命名"：
```ts
{ route, config, resolvedTheme, recentFiles, lastError, isBusy }
```

但是 `setRoute` / `setError` / `setBusy` / `refreshTheme` 这些 setter 与 `notifyRecentChanged()` 的命名风格不一致 —— 前 4 个是"显式 setter"，后者却用 `notify` 前缀且 **绕过 setter 直接写**（`update({ recentFiles: list })`）。

**建议：**
- 改名为 `refreshRecentFiles()` 或统一为 `updateRecentFiles()`，让"修改 state"的方法语义对称。
- 或将其移到 `RecentFilesService` 上：让 service 自己管理通知，store 只是个 cache。

### 4. ⚠️ `ipc/bus.ts` 中 `DEFAULT_TIMEOUT_MS` 是死代码

```ts
const DEFAULT_TIMEOUT_MS = 5000;
void DEFAULT_TIMEOUT_MS;
```

`IpcBus.send` 没有实现超时（注释里只有 5s 名义值），但代码导出了一个 `void DEFAULT_TIMEOUT_MS` 表达式保持 TS 编译通过。**这是技术债**。

**建议：** 要么删除常量，要么实现真正的 timeout（`Promise.race` + `AbortController`）。

### 5. ⚠️ `ipc/handlers.ts` 中 `buildPlatformInfo` 有未使用参数

```ts
function buildPlatformInfo(_ctx: HandlerContext): PlatformInfo {
    // We deliberately use a parameter-prefixed underscore on unused ctx ...
    void _ctx;
    ...
}
```

参数 `ctx` 已经加 `_` 前缀却 **仍然使用**（`_ctx.config.snapshot()`），风格矛盾。要么去掉参数，要么真用。

### 6. ⚠️ `app-controller.ts` 中 `startApp` 的窗口句柄语义不一致

- `mainWindow` 被声明为 `PerryWindow | null`。
- 但 `App({...})` 调用后 `mainWindow = null`（注释说 Perry stub 不返回 handle）。
- `handleCommand('app.hide')` / `'app.showAll'` / `'app.quit'` 在 `mainWindow === null` 时 **静默 no-op**。

**问题：** 等于 `mainWindow` 永远为 `null`，`isStarted()` 永远返回 `false`，这是一段 **当前不生效的代码**（Perry AOT stub 限制）。

**建议：**
- 在代码顶部加 `@todo(perry-stub)` 注释，标明"等 Perry 提供 `App()` 返回 Window 时启用"。
- 或在 `isStarted()` 里检查一个独立的 `appStarted` 布尔而非 `mainWindow !== null`，让语义清晰。

### 7. 🟢 微小：模块深度不一致

- `src/modules/about/` 只有 2 文件（view + index）。
- `src/modules/file-manager/` 有 3 文件（view + ops + index）。
- `src/modules/settings/` 有 3 文件（view + changes + index）。

**about 模块太单薄**。若未来要加"版本信息""许可""更新检查"，目前结构允许扩展，没问题。但如果一直保持 1 文件，**index.ts 就成了"为了一致性而存在"的 boilerplate**。

**建议：** 接受现状（这是为对称性付的小成本，符合"模块边界一致"原则）。

### 8. 🟢 微小：`src/main.ts` 与 `src/app/app-controller.ts` 生命周期职责重叠

`main.ts` 调用 `onActivate(() => onAppActivate())` 与 `onTerminate(() => onAppTerminate(ctx))`，**Perry 钩子 → Controller 钩子**。

- `onAppActivate()` / `onAppTerminate()` 在 controller 内接受 `ctx` 参数（`onAppTerminate(ctx: ControllerContext)`）。
- `onAppActivate()` 不需要 ctx（签名不同）。
- 这导致 controller 暴露两个签名不一致的钩子，main.ts 需要分别理解。

**建议：**统一为 `onAppActivate(ctx)` 与 `onAppTerminate(ctx)`，签名对称。

---

## 五、依赖图（实测）

```
main.ts (175 行, 14 个 import)
  ├─ services/* (5 个直接 import)
  ├─ ipc/bus + ipc/handlers
  ├─ state/app-state
  ├─ app/app-controller
  ├─ modules/file-manager/index
  ├─ modules/about/index
  └─ ui/{sidebar, status-bar, toast, title-bar, theme}

app/app-controller.ts (348 行, 8 个 import)
  ├─ platform/* (5 个：menu-bar, tray-adapter, paths, autostart, platform.ts)
  ├─ services/shell-service
  ├─ ui/settings-window
  ├─ state/app-state
  └─ app/app-controller-types (本目录)

modules/file-manager/file-operations.ts (80 行)
  ├─ ipc/bus（只 import type）
  └─ types/* (11 个 payload 类型)
```

**没有发现循环依赖** —— 这是好兆头。但 `app-controller.ts` 导入 `services/shell-service.ts`（类），且 `ipc/handlers.ts` 也导入它。Controller 直接 `new ShellService()` 创建新实例（`help.docs` 与 `help.openLogDir` 分支），**绕过了 DI**，让 `ControllerContext` 的 `shell` 字段形同虚设（见 `help.docs: new ShellService().openUrl(...)`）。

**建议：** 改用 `activeContext.shell.openUrl(...)`。

---

## 六、与 Perry AOT 约束的对齐度

| 约束                              | 当前项目                                            | 评价 |
| --------------------------------- | --------------------------------------------------- | ---- |
| 无 `eval` / 动态 `require`        | 全静态                                              | ✅   |
| 无 N-API                          | 仅用 `perry/ui` + `perry/system` + `os.arch()`      | ✅   |
| 无编译期 `process` 访问           | 仅在 `handlers.ts` 用 `process.execPath`（运行时）  | ✅   |
| ESM + `.js` 后缀                  | 全程使用                                            | ✅   |
| `bundler` resolution              | tsconfig 已配                                       | ✅   |
| 类型守卫代替 `instanceof`          | `IpcOk | IpcErr` 判别联合                           | ✅   |
| 静态分析可达                      | 无条件导入分支                                      | ✅   |

**AOT 友好度：优秀。**

---

## 七、与 SPEC `docs/plan_ui_v1.md` 的一致性

按 [AGENTS.md](../../AGENTS.md) 描述，spec 是单一权威。本评审中发现 spec 与实现一致：

- 三路由 sidebar（file-manager / settings / about）✓
- 设置独立 always-on-top 窗口 ✓
- 主题：system / light / dark + cycleTheme ✓
- 自动启动（LaunchAgent / Windows Startup / XDG .desktop）✓
- Recent files 列表 ✓
- 跨平台菜单差异（macOS 有 App menu，Win/Linux 无）✓

---

## 八、优先级建议

| 优先级 | 项                                                                 | 工作量    | 收益               |
| ------ | ------------------------------------------------------------------ | --------- | ------------------ |
| 🔴 高  | 删除/实现 `DEFAULT_TIMEOUT_MS`                                     | 30 分钟   | 消除 dead code     |
| 🔴 高  | 修复 `app-controller.ts` 中 `new ShellService()` 绕过 DI           | 15 分钟   | 统一服务管理       |
| 🟡 中  | `theme.ts` 双层加文档注释                                          | 15 分钟   | 减少新人认知负担   |
| 🟡 中  | `AppState` 方法命名统一（`notifyRecentChanged` → `refreshRecentFiles`） | 10 分钟 | API 一致性         |
| 🟡 中  | `buildPlatformInfo(_ctx)` 删除无用参数                            | 5 分钟    | 消除警告           |
| 🟢 低  | `App()` 窗口句柄占位逻辑加 `@todo` 标记                           | 5 分钟    | 代码可追溯性       |
| 🟢 低  | `onAppActivate` 签名对齐                                          | 5 分钟    | API 对称           |

---

## 九、最终评语

这个项目结构是 **"经过深思熟虑的" 小型骨架** —— 在 38 个文件、~3k 行的体量下，做到了 **生产级骨架** 该有的模块化：

1. **依赖方向严格**（controller → services → modules → ipc，单向无环）。
2. **测试可注入**（`IpcBus` 是 mockable seam）。
3. **跨平台关注点分离**（`platform/` 不向 `app/` 泄漏，反之亦然）。
4. **TypeScript 编译期保护**（`AppCommand` + `IpcChannel` 都是穷尽联合）。
5. **AOT 友好**（无任何动态特性）。

唯一系统的不足是 **部分"将来时"的占位代码混在主路径里**（window handle、`DEFAULT_TIMEOUT_MS`、`onAppBackground`），以及一些命名/签名对称性的微瑕。这些都属"项目长大前该清理的"，但 **不影响当前结构的合理性**。

> 如果这是一份代码评审意见书，结论会是 **APPROVED with minor cleanup items**。

---

## 附录 A：评审中引用的源文件清单

| 文件                                                     | 行数  | 角色         |
| -------------------------------------------------------- | ----- | ------------ |
| [src/main.ts](../../src/main.ts)                         | 175   | 入口 + 视图组装 |
| [src/app/app-controller.ts](../../src/app/app-controller.ts) | 348 | 主调度       |
| [src/app/app-controller-types.ts](../../src/app/app-controller-types.ts) | 49 | 类型契约     |
| [src/app/theme.ts](../../src/app/theme.ts)               | 74    | 调色板常量   |
| [src/ipc/bus.ts](../../src/ipc/bus.ts)                   | 109   | IPC 总线     |
| [src/ipc/handlers.ts](../../src/ipc/handlers.ts)         | 122   | IPC 注册     |
| [src/state/app-state.ts](../../src/state/app-state.ts)   | 194   | 全局 Store   |
| [src/services/config-service.ts](../../src/services/config-service.ts) | 200 | 配置持久化 |
| [src/platform/menu-bar.ts](../../src/platform/menu-bar.ts) | 179 | AppCommand   |
| [src/ui/theme.ts](../../src/ui/theme.ts)                 | 91    | paint helpers |
| [src/types/ipc.ts](../../src/types/ipc.ts)               | 169   | IPC payload  |
| [src/modules/file-manager/file-operations.ts](../../src/modules/file-manager/file-operations.ts) | 80 | 文件操作封装 |