# codex-ui 0.2.0 计划：Codex 主题设置页 + 深色基面对齐

状态：**已执行完毕（2026-09-27，0.2.0）** · 执行记录见文末 §8 · 下列依据全部为本机实测，锚点随行给出。

---

## 1. 机制（已探明，无未知数）

| 环节 | 实测事实 | 锚点 |
|---|---|---|
| 座位 | 官方插件管理页声明三个 slot；`plugins.bundle.config`（kind: keyed，scope: root）**以组合包的包名为键**，渲染在组合包页面的描述与行之间 | 宿主 asar `@deepseek-ai/dsh-client-ui-plugin-manager/README.zh.md`；`@deepseek-ai/dsh-cordis-client-runner/lib/client.js`（slot-contract.ts:78） |
| 能否出现 | 设置服务**只为带 `.volatile()` 字段的条目**暴露一份表单，插件管理页正是靠这一点认得这个条目 —— 没有 `Config` 就没有设置页 | `@alm-allen/dsh-chat-ux/dist/index.js:67-78` |
| 注册 | `ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name, key: 包名, inject: () => ({ scope, locale }) }, Card))`；Card 收到 `view: 'page' \| 'summary'` | `dsh-chat-ux/dist/client.js:150-157`、`:3638` |
| 两个键不能混 | 座位键 = **npm 包名** `codex-ui`；表单命名空间 = **profile 条目 id** `codex-ui`（本包 `cordis.patch.yml:4` 的 `- id: codex-ui`） | `dsh-chat-ux/dist/client.js:161-166` |
| 持久化 | 宿主半导出 `export const Config = Schema.object({…})`，每个字段 `.default(x).volatile()`；`import Schema from '@deepseek-ai/schemastery'`（顶层 import，符合本包 `index.js` 硬约束 2「不许 createRequire」） | `dsh-chat-ux/dist/index.js:21,70-78` |
| 读写 | `ctx.configForms.get('codex-ui')` → `{ getSnapshot() → { status, value, base, user, revision, writable, mode }, subscribe, set(field, value), unset(field) }`；写后回读确认落地 | 宿主 asar `@deepseek-ai/dsh-client-ui-settings/lib/client.js`；写-回读范式 `dsh-chat-ux/dist/client.js:3644-3673` |
| 依赖声明 | `dsh.client.inject` 需含 `@deepseek-ai/dsh-client-ui-settings`（模块图）；浏览器半 `inject = ['slots', 'configForms']` | `dsh-chat-ux/package.json`、`dist/client.js:69` |
| 两端可达性 | desktop profile 的 `dsh.profile.bundles` **已含 codex-ui**（页面已在，只差表单）；web profile 的 bundles 13 项**不含** codex-ui（走 insert） → 那边点不进去 | `~/.dsh/profiles/desktop/package.json`、`~/.dsh/profiles/web/package.json` |

结论：官方插件管理里「点进去有设置」= 组合包页面 + `plugins.bundle.config` 座位 + 宿主 `Config` 的 volatile 字段，三者缺一不可。**不需要** `settings.section`。

---

## 2. 交付物 A：设置页

### 2.1 结构（照截图 8 行）

| 面板行 | Config 字段 | 默认 | 写入的变量 | 控件 |
|---|---|---|---|---|
| 主题 | —（仅界面状态，不落盘） | 亮色 | — | SegmentedControl |
| 强调色 | `accentLight` / `accentDark` | `''` = 跟随皮肤（亮 #339cff / 暗 #0169cc） | `--dsw-alias-link`、`--dsw-codex-focus` | `input[type=color]` + hex 文本 |
| 背景 | `surfaceLight` / `surfaceDark` | `''` | `--dsw-alias-bg-base` | 同上 |
| 前景 | `inkLight` / `inkDark` | `''` | `--dsw-alias-label-primary` | 同上 |
| UI 字体 | `fontUi` | `''` | `--dsw-font-family` | 文本框（回车/失焦提交） |
| 代码字体 | `fontCode` | `''` | `--ds-font-family-code` | 文本框 |
| 半透明侧边栏 | `translucentSidebar` | `false` | 侧栏底色 alpha + `backdrop-filter` | Switch |
| 对比度 | `contrastLight` / `contrastDark` | 45 / 60 | alpha 阶梯整体缩放 ×c/默认 | range 0–100 |

11 个字段全部 `.default(x).volatile()`；**空串 = 不覆盖**（退默认层），所以装上不动一个字也不会改变现有外观。

Codex 侧出处：默认值 `jdi`（`codex-app-initial.js` 偏移 4734708）——
dark `{ accent:#339cff, contrast:60, ink:#ffffff, surface:#181818, opaqueWindows:false }`、
light `{ accent:#339cff, contrast:45, ink:#1a1c1f, surface:#ffffff, opaqueWindows:false }`；
字段 schema 同处 `IOe`：`{ accent:/^#[0-9a-fA-F]{6}$/, contrast:int 0..100, fonts:{code,ui}, ink, opaqueWindows, semanticColors, surface }`。

### 2.2 覆盖层怎么落地

- 浏览器半在 `document.documentElement` 打上 `data-codex-ui`，把覆盖写成一条 `<style>`：
  - 亮色：`html[data-dsh-skin="codex-ink"][data-codex-ui] :root, … body { … }`
  - 暗色：`html[data-dsh-skin="codex-ink"][data-codex-ui] body[data-ds-dark-theme] { … }`
- 比皮肤自身选择器多一个属性 → 特异性 +1，稳赢，且 **`skins/*.css` 一个字都不动**。
- 生成逻辑抽成纯函数 `themeOverrideCss(values)`（无 DOM 依赖）→ 可直接进 fixtures 断言。

### 2.3 交互（照官方配置卡，不自创）

- 改一下即写，无保存按钮；写后回读确认落地，失败显示一行提示；`writable === false` 时控件禁用。
- 已覆盖的字段显示「已覆盖」徽标 + 「重置」（`unset` 清用户层）。
- `view === 'summary'` 返回一行摘要（如「强调 #339cff · 对比度 45」）。
- 控件用宿主 `@deepseek-ai/dsh-client-ui-primitives` 的 Switch / SegmentedControl / Tag，外观跟官方配置卡一致 —— **不**照搬 Codex 设置面板的外壳。

---

## 3. 交付物 B：深色基面（第 1、2 条按 Codex 应用改）

| 令牌 | 现在（`skin.css:163-207`） | 改后 | 依据 |
|---|---|---|---|
| `--dsw-alias-bg-base` | #111111 | **#181818** | `jdi.dark.surface` |
| `--dsw-alias-bg-sidebar` | #171717 | **#181818** | 深色灰阶里侧栏与 surface 同面，分隔交给 0.5px 发丝线 |
| `--dsw-alias-bg-layer-1/2/3` | #1f1f1f / #2a2a2a / #353535 | **#212121 / #282828 / #303030** | Codex 生成灰阶 gray-800 / 750 / 700 |
| `--dsw-alias-label-primary` | #fcfcfc | **#ffffff** | `jdi.dark.ink` |
| 深色 alpha 家族 | `rgba(252,252,252,·)` ×9 | **`rgba(255,255,255,·)`** | Codex 深色 `--alpha-base` = `#fff` |
| `--dsw-alias-bg-overlay` / `-module-platform` | `rgba(17,17,17,.88)` / #1a1a1a | `rgba(24,24,24,.88)` / #1f1f1f | 跟随新基面 |

亮色侧不动（侧栏 #EEF4F9 是截图实测取样）。audit 的 36 组对比度按新灰阶重锚后重跑。

---

## 4. 十条处置

| # | 条目 | 处置 |
|---|---|---|
| 1 | 深色背景 #111111 | **改** → #181818（§3） |
| 2 | 深色前景 #fcfcfc | **改** → #ffffff（§3） |
| 3 | 圆角体系 | **不动**（宿主槽位不同名，重排牵连全皮肤；菜单行 8→10px 留作候选） |
| 4 | 输入卡 25px 圆角 | **不动**（截图与 CSS 的矛盾源自缩放比未记录，改动无据） |
| 5 | 三级文本 58% | **不动**（动它要重算 audit 全部对比度对） |
| 6 | mono 字体栈 | **不动**（设置页的「代码字体」已把这条变成用户可调项） |
| 7 | 侧栏宽 275px | **不动**（宿主所有，插件改不了） |
| 8 | 深色链接 #0169cc | **保留**（= 应用 text-link 令牌；想要 #339cff 的用户现在拖「强调色」即可） |
| 9 | 阴影 token 化 | **暂缓**（只顺手对齐发丝线颜色 `#0000001a` / `#ffffff1f`） |
| 10 | corner-radius-scale | **不做**（不可移植） |

---

## 5. 步骤与验收

| 步 | 动作 | 验收（本机可跑） |
|---|---|---|
| 0 | web profile 切 bundle 注册（`install-plugin.mjs` 已有写 bundles 的逻辑） | 两个 profile 安装输出均为「注册方式: bundle」 |
| 1 | §3 深色令牌 | `npm run build`；`npm run check`；`node scripts/audit-codex-ink.mjs`（36/36）；重装后 `node scripts/live-gui-probe.mjs`（亮色 10/10 零回归） |
| 2 | 骨架：宿主 `Config` + 浏览器半座位 + 只接「半透明侧边栏」一项 | 真 GUI：插件管理 → codex-ui 页 → 拨开关 → `<html data-codex-ui>` 出现、`--dsw-alias-bg-sidebar` 变、刷新仍在 |
| 3 | 其余 7 行 + `summary` + zh/en 字典 | `npm run check`（含新增 fixture：11 字段全 volatile、覆盖 CSS 快照） |
| 4 | 文档（README 对账节、CHANGELOG 0.2.0）→ 提交推送 | CI 四作业绿 |

### 文件清单

| 文件 | 动作 |
|---|---|
| `index.js` | 改：加 `import Schema`、`export const Config`（11 个 volatile 字段）；`ENTRY_ID` 保留 |
| `package.json` | 改：`dsh.client.inject` 加 `@deepseek-ai/dsh-client-ui-settings`；版本 0.2.0 |
| `src/override.js` | 新：纯函数 `themeOverrideCss(values)` |
| `src/settings-card.js` | 新：React 表单（`React.createElement`，与现有浏览器半风格一致，不引 JSX） |
| `src/client.template.js` | 改：`inject` 加 `configForms`、加占位符、挂覆盖层 |
| `src/build.mjs` | 改：按现有占位符约定拼接新模块 |
| `skins/codex-ink/skin.css` | 改：§3 令牌 |
| `scripts/fixtures/` + `scripts/check-repo.mjs` | 新/改：两条无宿主检查 |
| `README*.md` / `CHANGELOG*` / `skins/codex-ink/README.zh-CN.md` | 改：依据与差距如实写 |

---

## 6. 不做

预设与导入导出、多主题管理、自绘取色器、`settings.section` 旧宿主回退、自绘开关、逆向 Codex 对比度全公式（只采用已还原的 `Rdi + zdi·contrast` 线性混合思路，并在 README 注明与 Codex 的差距）。

---

## 7. 待批两点

- **(a) 深色侧栏取 #181818**（与 surface 同面）。同意即按此执行；想留一层差异请给值。
- **(b) 「半透明侧边栏」默认关**。Codex 的默认是开（`opaqueWindows:false`），但 DSH Web 没有窗口层，半透明只能透出页面底色，效果与桌面 App 不同；开与不开都在设置页一行之内，默认关可保证装上不改外观。
---

## 8. 执行记录（2026-09-27 · 0.2.0）

与计划的差异，逐条如实记录：

| 计划 | 实际 |
|---|---|
| 步骤 0「`install-plugin.mjs` 已有写 bundles 的逻辑」 | **写错了**：脚本只会按 `inBundles` 分流，不会写 bundles。已给安装器加 `--bundle`（写 `dsh.profile.bundles`＋清掉冗余 `- insert:` 块），web profile 已切到 bundle 注册 |
| 「web 切 bundle 后即可在那边点进设置页」 | **不成立**：web profile 的 `cordis.patch.yml` 里 `web-ui-plugin-manager` 是 `disabled: true`，插件管理页在那边本来就没开。桌面壳没有这条禁用，页面在；是否给 web 打开由你决定，没有替你翻这个开关 |
| 深色只改 §3 表里的 6 个令牌 | 实际改了 **41 行**：`#353535` 这类值在暗色区块里是 30 多处语义别名的基准（侧栏填充、导航悬停/选中、markdown 代码块、toast、tooltip、hovercard、输入框、气泡…），只改层级会让别名与层级脱钩，所以按同一张映射表整块重锚 |
| 「半透明侧边栏 = 侧栏填充转半透明」 | 深色下侧栏与内容同面 ⇒ 单改填充在深色里完全无声。开关同时把侧栏行填充转半透明，README 如实写明这不是 Codex 的窗口半透明 |
| 对比度「alpha 阶梯整体缩放」 | 落地为：文本档位往 ink 方向混合 + 中性 alpha 阶梯缩放（夹 0.5×–2×），彩色状态色与 diff 底色不入覆盖层（否则等于把调色板搬进覆盖层）。仍标注为简化实现 |

实测证据（本机可复跑）：

| 命令 | 结果 |
|---|---|
| `npm run build` | 源 60786 B → theme.css 64596 B；client.js 93281 B |
| `node scripts/audit-codex-ink.mjs` | 36/36 通过（AAA 18 组；深色底变浅后比值上升，最低 4.35） |
| `npm run check` | 19 项全过（新增 6 项设置页契约检查；覆盖层与 skin.css 逐条对账 37 条） |
| `node scripts/settings-page-verify.mjs --url …` | 真 GUI 13 项全过：组合包页有配置卡、8 行标签逐一相符、默认态无覆盖、开关写入 `rgba(255,255,255,0.72)`、回车提交强调色 `#ff0000` 生效并出现「已覆盖」、刷新后两项覆盖仍在 |
| `node scripts/live-gui-probe.mjs` | 未重跑（自 0.1.2 起亮色层未改）；深色改动只在 `body[data-ds-dark-theme]` 之下，作用域外零影响 |

执行中发现并修掉的真 bug：`jsxs(type, props, children)` 的第三参是 **key** 不是 children，卡片因此渲染成空 `<div>`。
真 GUI 断言最初报「8 行」失败才暴露 —— 夹具复刻不出这个座位，这一条只能靠真 GUI 抓。已加体检断言防复发。

未做（与 §6 一致）：预设/导入导出、多主题管理、自绘取色器、`settings.section` 回退、逆向对比度全公式。
