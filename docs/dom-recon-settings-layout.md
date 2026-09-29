# 设置界面 DOM 侦察报告（codex-ui 改造基线）

> **状态：历史留档 · 改造已落地（㉑ 设置模态框，0.7.0，2026-09-28）。**
> 本文是动手前的侦察基线，侦察对象是另一份检出 `E:\codex-ui` @ `d590248`（当时 6 份样式、`client.js` 102393 B）。
> 落地后的形态是：结构层 `src/client/settings-modal.js`、外观 `skins/codex-ink/settings-modal.css`（现行 `client.js` 177065 B）。
> **文中的行号、体积与截图路径都已过期**，`docs/recon/` 的 8 张截图也未随仓库提交；selector 与尺寸读数仍按实测原样保留。

> 侦察对象：`E:\codex-ui` @ `d590248699a6a2708035af639596ab33cd6caf91`，装在一个一次性验证 profile 上
> 验证实例：`http://127.0.0.1:3199`，DSH `0.1.7-rc.2`，窗口 1440×960 @ DPR 1.5
> 侦察方式：Python Playwright（headless Chromium）+ 直接 `Runtime.evaluate` 取证。**所有 selector 与尺寸均为实测值**，推断项单独标注。

---

## 0. 结论速览（给改造定调用）

| 判断 | 结论 | 依据 |
|---|---|---|
| 侧栏项渲染方式 | 每项都是 `<button class="VOzbGW_navCell">`，**顺序由宿主按 `order` 排序后渲染**，相邻项之间**没有任何分组分隔元素** | §b 实测 13 项，DOM 里无 group/divider 节点 |
| 「分组」现状 | **宿主完全没有分组概念**——侧栏是一维扁平列表 | 同上 |
| 图标 | **每项都自带内联 SVG**，`class="VOzbGW_navIcon"`，**不需要注入** | §g |
| 面板锚点 | 宿主自有 `[data-shortcut-modal="settings"]` **优先**；本插件再把 JS 盖印的自有锚点 `[data-cx-sm-panel]` 当 CSS 唯一挂载点；`[data-dsh-surface="settings"]` 是第三方 skin-center 兼容适配器补盖的**兜底**（其契约自声明非永久，未装适配器的环境不存在）。行内仍用 `data-slot="*"`；**不要用 `VOzbGW_*` / `oY77xG_*` 这类 CSS-Modules 哈希类名** | §a、§e、§h |
| 注入生存性 | 切换设置项**不重建**；**关闭再打开 = 整棵 navList 重建，注入全丢** | §i 实测 |
| 第三方兼容 | 克隆项点击**不会路由**；正确姿势是「不破坏宿主对未知项的处理」，不是「接管未知项」 | §i 实测 |

---

## a) 设置模态框完整容器 selector 链（body → 内容区）

```
body
└─ div.VOzbGW_overlay[role="presentation"]          ← 最外层，body 的直接子节点
   ├─ div.VOzbGW_mask[aria-hidden="true"]           ← 遮罩
   └─ div.VOzbGW_panel[role="dialog"][aria-modal="true"]
        [data-shortcut-modal="settings"]                ← 宿主自有（Dialog 原语跨包约定）
        [data-dsh-surface="settings"]                   ← 第三方 skin-center 适配器补盖的兼容属性
        ├─ nav.VOzbGW_nav                            ← 侧栏（宽 188px）
        │   ├─ div.VOzbGW_navTitle                   ← 标题「设置」，id 由 aria-labelledby 指向
        │   └─ div.VOzbGW_navList                    ← 设置项列表容器（13 个 navCell）
        └─ div.VOzbGW_content                        ← 内容列（宽 612px）
            ├─ div.VOzbGW_header                     ← 右上角操作区 + 关闭按钮
            │   ├─ div.VOzbGW_actions
            │   └─ button.VOzbGW_close
            └─ div.VOzbGW_options                    ← 滚动区，设置页正文挂这里
```

**推荐给后续 CSS 用的选择器**（避开哈希类名）：

```css
/* 一次性归一：JS 找到面板后盖印自有锚点，CSS 只认它 */
html[data-codex-ui] div[data-cx-sm-panel]                     /* 整个面板 */
html[data-codex-ui] div[data-cx-sm-panel] > nav               /* 侧栏 */
html[data-codex-ui] div[data-cx-sm-panel] nav > div:last-child   /* navList */
html[data-codex-ui] div[data-cx-sm-panel] > div:last-child       /* content */
```

**锚点结论（2026-09-28 订正）** —— 上面的 `data-dsh-surface="settings"` 不是宿主锚点，别照抄：

| 层 | 锚点 | 来源 | 定位 |
|---|---|---|---|
| ① 宿主锚点 | `[data-shortcut-modal="settings"]` | **宿主自己**写在面板上的属性（`dsh-client-ui-settings-general` 的面板 JSX；`dsh-client-ui-primitives` 的 Dialog 基元统一写 `"data-shortcut-modal": shortcutModal`，是跨包约定） | **优先**：语义明确、设置专用；宿主全树 grep `data-dsh-surface` **0 命中** |
| ② 自有锚点 | `[data-cx-sm-panel]` | 本插件 JS 检测到面板后盖印 | **CSS 唯一挂载点**：宿主改锚点只需改 JS 一个函数 |
| ③ 兼容兜底 | `[data-dsh-surface="settings"]` | 第三方 `@linxin666/dsh-client-ui-skin-center` 的 SEMANTIC_RULES_V1（`[role="dialog"]:has([data-slot="settings.section"])` → 补 `data-dsh-surface`） | **仅兜底**：其 `contracts/semantic-attrs-v1.md` 自声明**非永久公共契约**；未装该适配器的环境里该属性根本不存在 |

> ⚠️ 本报告 `§a` 的实测环境装了 skin-center，所以两个属性同时出现；**只有 ① 是宿主给的**。选锚点时若只取 ③，就等于把插件的面板样式挂在第三方适配器上。
> ⚠️ 下面 `nav > div:last-child` 是按结构取位置，不是语义锚点。宿主没有给 navList 任何 data-* 属性——**这是本报告里最重要的稳定锚点缺口**，改造方案应优先考虑用 `nav.children[1]` 这种位置索引而非类名。

关键尺寸与定位（实测，1440×960 视口）：

| 元素 | position | 尺寸 | 其它 |
|---|---|---|---|
| `.VOzbGW_overlay` | `fixed`, inset `0px` | 1440×960 | `z-index:1000`, display:flex, 居中 |
| `.VOzbGW_mask` | `absolute`, inset `0px` | 1440×960 | `background: rgba(28,37,70,0.4)` |
| `.VOzbGW_panel` | `relative`, flex row | **800×800** | `border-radius:16px`, 底色 `rgb(233,237,247)`，阴影 `0 0 0 .5px + 0 4px 16px rgba(13,13,13,.08)` |
| `nav` | static, flex column | 188×800 | `padding: 22px 12px 0`, `gap:18px` |
| `navList` | static, flex column | 164×392 | `gap:4px`, `overflow-y:auto` |
| `content` | static, flex column | 612×800 | — |
| `header` | static, flex row | 612×54 | `padding: 20px 14px 8px 10px` |
| `options` | block, **overflow-y:auto** | 612×746 | `padding: 0 24px 24px` |

---

## b) 侧栏设置项清单（13 项实测）

| # | 可见文本 | tag | class | 有 SVG | 稳定 data-* | y 坐标 |
|---|---|---|---|---|---|---|
| 0 | 通用设置 | `button` | `VOzbGW_navCell VOzbGW_active` | ✔ | 仅聚焦用 `data-modal-autofocus` / `data-dsh-automatic-focus` | 144 |
| 1 | 模型 | `button` | `VOzbGW_navCell` | ✔ | **无** | 188 |
| 2 | 内置插件 | `button` | `VOzbGW_navCell` | ✔ | **无** | 232 |
| 3 | Agent 预设 | `button` | `VOzbGW_navCell` | ✔ | **无** | 276 |
| 4 | 记忆系统 | `button` | `VOzbGW_navCell` | ✔ | **无** | 320 |
| 5 | 已归档会话 | `button` | `VOzbGW_navCell` | ✔ | **无** | 364 |
| 6 | LLM Verifier | `button` | `VOzbGW_navCell` | ✔ | **无** | 408 |
| 7 | 订阅服务 | `button` | `VOzbGW_navCell` | ✔ | **无** | 452 |
| 8 | Web 插件 | `button` | `VOzbGW_navCell` | ✔ | **无** | 496 |
| 9 | 皮肤 | `button` | `VOzbGW_navCell` | ✔ | **无** | 540 |
| 10 | 宠物 | `button` | `VOzbGW_navCell` | ✔ | **无** | 584 |
| 11 | 创意工坊 | `button` | `VOzbGW_navCell` | ✔ | **无** | 628 |
| 12 | 使用统计 | `button` | `VOzbGW_navCell` | ✔ | **无** | 672 |

**每一项的固定内部结构**（13 项完全一致，无例外）：

```html
<button type="button" class="VOzbGW_navCell">
  <svg width="16" height="16" class="VOzbGW_navIcon" viewBox="0 0 16 16"
       fill="none" stroke-width="1.3" aria-hidden="true">…</svg>
  <span class="VOzbGW_navLabel">模型</span>
</button>
```

- 单元格计算样式：`display:flex; gap:8px; padding:9px 16px 9px 12px; border-radius:12px; font-size:14px`
- 选中态：额外加 `VOzbGW_active` 类 + `aria-current="true"`
- **每项都是 2 个直接子节点：`svg` + `span`** —— 这一点对注入很关键（见 §i）

### ⚠️ 任务书清单与实际不符（必须记录）

任务书给的 10 项里，**「账号与余额」在本验证实例上不存在**，另有 3 项任务书未列出（已归档会话 / 宠物 / 创意工坊 / 使用统计）。

- **「账号与余额」缺的原因（已定位到源码级）**：`@deepseek-ai/dsh-client-ui-settings-account` 只在**已存有 DeepSeek 凭据**时才注册这个 section：
  ```js
  // lib/client.js:4397-4414
  if (snapshot.view?.status === "credential-stored") ctx.slots.register({
      name: "settings.section", id: "account", order: -10, label: () => t("nav") …
  ```
  未登录时它 `unregister`，所以侧栏里根本没有这一项。**这不是环境缺陷，是设计如此。**
- 其余 3 项（记忆系统 / LLM Verifier / 订阅服务）在我把 `dsh-mnemon` / `dsh-llm-verifier` / `@eddyskywalker/dsh-chatgpt-subscription` 正规装进验证 profile 后**已全部出现**（见 §验收证据）。
- **宠物**项来自 `dsh-web-all` 的宠物模块，是本次 A2 正规重装 `@linxin666/dsh-web-all` 之后新出现的。

> 结论：任务书的 10 项清单应更新为「以实际渲染为准，动态列举」。**这恰好印证了用户那条「不做硬编码白名单、未知项进兜底分组」的硬约束是对的。**

---

## c) 侧栏容器与内容容器的定位方式

两者**都不是** `fixed`/`absolute`/`grid`，而是 `display:flex` 的直接子项：

```css
/* 面板是横向 flex */
.VOzbGW_panel  { display:flex; flex-direction:row; width:800px; height:800px; }
/* 侧栏是纵向 flex，固定 188px */
.VOzbGW_nav    { display:flex; flex-direction:column; width:188px; padding:22px 12px 0; gap:18px; }
/* 内容列纵向 flex，吃掉剩余宽度 */
.VOzbGW_content{ display:flex; flex-direction:column; flex:1; }
```

- 侧栏**没有**背景色（`transparent`），面板底色 `rgb(233,237,247)` 透上来
- 侧栏**没有**右边框 —— 分隔完全靠空间，**这是 Codex 化改造可以发力的一点**
- `nav` 的 `gap:18px` 是 navTitle 与 navList 之间；navList 内部是 `gap:4px`

---

## d) 遮罩层与关闭按钮结构

**遮罩**：`div.VOzbGW_mask[aria-hidden="true"]`，`position:absolute; inset:0`，`background: rgba(28,37,70,0.4)`，无 `backdrop-filter`。

**关闭按钮**：位于 `content > header`，**是 header 的第 2 个也是最后一个子节点**：

```html
<button type="button" class="VOzbGW_close">
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke-width="1">
    <path d="M2.5 2.5L13.5 13.5" stroke="currentColor"/>
    <path d="M13.5 2.5L2.5 13.5" stroke="currentColor"/>
  </svg>
  <span class="VOzbGW_hiddenLabel">
    <div data-slot="settings.close" style="display: contents;">关闭</div>
  </span>
</button>
```

> **注意**：关闭按钮上的 `data-slot` 是**嵌在 `span.VOzbGW_hiddenLabel` 内部**的，不是按钮本身的属性。写 CSS 时要用 `button:has([data-slot="settings.close"])` 或直接 `.VOzbGW_close`（后者是哈希类名，不推荐）。

**header 结构**：

```html
<div class="VOzbGW_header">
  <div class="VOzbGW_actions">
    <div data-slot="settings.action" style="display: contents;">
      <div class="me01iq_action">
        <button class="_button_1rv3m_2 _outline_1rv3m_54 _sm_1rv3m_28">打开配置文件</button>
      </div>
    </div>
  </div>
  <button class="VOzbGW_close">…</button>
</div>
```

- `VOzbGW_actions` 实测 `margin-left:458px`（即 `margin-left:auto` 的效果），把操作推到右侧
- `[data-slot="settings.action"]` 是**唯一稳定的宿主座位锚点**，改造「右上角操作按钮」应挂它

---

## e) codex-ui 插件在设置模态上已注入的内容

**已注入的样式标签**（实测 `document.querySelectorAll('style[data-plugin="codex-ui"]')`）：

| `data-plugin-css` | 长度 | 作用域 |
|---|---|---|
| `codex-ui/theme.css` | 65280 B | `html[data-codex-ui]` |
| `codex-ui/settings-override.css` | 704 B | `html[data-codex-ui][data-codex-ui-theme]` |

**html 上的属性**（实测）：`data-codex-ui`, `data-codex-ui-theme`（有覆盖时）, `data-dsh-backdrop-active`, `data-input-modality`

### 哪些选择器命中了设置模态？

theme.css 共 143 条选择器。对 9 个模态元素逐一跑 `Element.matches()` 的结果：

| 元素 | 命中的 codex-ui 规则 | 判定 |
|---|---|---|
| `.VOzbGW_overlay` | `html[data-codex-ui] *`（通配）、`body, body *`（eleveation 令牌覆盖） | **仅继承性命中** |
| `.VOzbGW_mask` | 同上 | **仅继承性命中** |
| `.VOzbGW_panel` | **`html[data-codex-ui] [role="dialog"]`** ← 唯一一条真正的结构样式 | **实命中** |
| `nav.VOzbGW_nav` | 通配 + 令牌 | 仅继承 |
| `.VOzbGW_navList` | 通配 + 令牌 | 仅继承 |
| `button.VOzbGW_navCell` | 通配、令牌、`:focus-visible`、`button, a, summary, [role=button]…`（cursor/过渡） | 仅泛型命中 |
| `.VOzbGW_content` | 通配 + 令牌 | 仅继承 |
| `.VOzbGW_header` | 通配 + 令牌 | 仅继承 |
| `.VOzbGW_options` | 通配 + 令牌 | 仅继承 |

**结论：codex-ui 目前对设置模态的针对性样式只有一条** —— `skins/codex-ink/patches.css` 里的：

```css
html[data-codex-ui] [role="dialog"],
html[data-codex-ui] [data-dsh-surface="overlay"] [data-dsh-part="panel"] {
  /* 大圆角 + 一点点软影 */
}
```

其余全部是通过 `*` 通配继承的令牌（`--dsw-alias-*`）。**设置界面的 Codex 化基本等于从零开始**，但基础设施（作用域属性、令牌、样式注入通道）已就绪。

> 另注：`skins/codex-ink/settings.css` 里的 `.cx-*` 系列选择器**在设置模态上一条都不命中**——它们服务的是官方插件管理页的组合包配置卡（座位 `plugins.bundle.config`），是**另一套 UI**，不要混淆。

---

## f) 内容区代表页（通用设置）内部结构

```
div.VOzbGW_options
└─ div[data-slot="settings.section"]      style="display:contents"
   └─ div._WvWnq_section                  ← 每个设置页的根容器
      ├─ div[data-slot="settings.general.item"]  style="display:contents"   ← 每一行的座位
      │  └─ div.oY77xG_row                  ← 行：权限
      │     ├─ div.oY77xG_rowText
      │     │  ├─ div.oY77xG_title          「权限」
      │     │  └─ div.oY77xG_desc           「选择新会话的默认权限模式」
      │     └─ span._root_gzo7u_1 → button.oY77xG_selector    ← 控件
      ├─ div.hVGvvW_row …  (语言)
      ├─ div._8HJdBW_group                  ← **分组**！外观
      │  ├─ div._8HJdBW_title               「外观」
      │  └─ div._8HJdBW_cubeRow
      │     └─ button._8HJdBW_themeCube ×3  （浅色/深色/跟随系统）
      ├─ div.bVCLcG_row …   (字号大小，带 stepper)
      ├─ div._2XZxNq_row ×2 (工作步骤展示 / 性能与用量)
      ├─ div.Pt1bsG_row …   (代码工作工具，带 switch)
      ├─ div.nhfO0a_setting …(快捷键)
      ├─ div.T1PP_q_row …   (繁忙时的发送行为)
      └─ div.yIbyla_row …
```

**关键的坏消息：行的类名是「一页一套」的 CSS-Modules 哈希前缀**——
`oY77xG_row` / `hVGvvW_row` / `bVCLcG_row` / `_2XZxNq_row` / `Pt1bsG_row` / `nhfO0a_setting` / `T1PP_q_row` / `yIbyla_row`，
**每行前缀都不同，且是随构建变化的哈希**。绝不能拿它们写 CSS。

**可用作 CSS 钩子的稳定结构**：

| 目标 | 推荐 selector |
|---|---|
| 设置页根容器 | `[data-cx-sm-panel] [data-slot="settings.section"] > *`（自有锚点；宿主锚点见 §a 的「锚点结论」） |
| 通用设置的每一行 | `[data-slot="settings.general.item"] > *` |
| 行内标题 | `[data-slot="settings.general.item"] * > div:first-child`（位置取，无类名） |
| 整页所有行 | 无统一类名 → **只能用属性选择器** `[class$="_row"]` / `[class*="_row_"]`，但这踩 CSS-Modules 哈希纪律，**不推荐** |

> **这是本次侦察最重要的改造风险**：宿主没有为「设置行」提供语义锚点。若要 Codex 化行样式，可行路径只有两条：
> ① 用 `[data-slot="settings.general.item"]` 给通用页行做样式（覆盖有限，只管一页）；
> ② 走 JS 注入层，在运行时给行打上自有的 `data-codex-ui-row` 属性（幂等重放，见 §i）。
> **（推荐 ②）**

### 控件类型清单（实测，通用设置页）

| 控件 | 类名 | tag | 尺寸 | 计算样式 |
|---|---|---|---|---|
| 下拉选择 | `oY77xG_selector` 等 | `button` | 138×36 / 82×36 | `bg:rgb(233,237,247); radius:12px; fs:14px` |
| 主题方块 | `_8HJdBW_themeCube` | `button` | 183×84 | 选中 `border:1px rgb(173,178,184)`；未选 `border:1px rgba(44,58,115,.42)`；`radius:20px` |
| 开关 | `_switch_15ung_5` | `button` | 36×20 | `bg:rgb(74,95,168); radius:999px`，`aria-label="代码工作工具"` |
| 数字步进 | `bVCLcG_stepper` | `div` | 72×36 | `bg:rgb(233,237,247); radius:12px` |
| 步进箭头 | `bVCLcG_arrow` | `button` | 17×12 | `aria-label="增大字号"/"减小字号"` |
| 输入框 | `zGbnIq_input` 等 | `input` | — | 模型页：`type=password`（API 密钥）、`text`（API 地址/模型 ID） |
| 复选框 | （无类名） | `input[type=checkbox]` | — | 皮肤 / 使用统计页 |

---

## g) 侧栏图标：实现方式与注入位置

**结论：每一项都已经自带图标，且是内联 SVG。后续「Codex 式侧栏图标」不需要从零注入，只需做样式与替换。**

实测（以「模型」项为例）：

```json
{ "tag": "svg", "cls": "VOzbGW_navIcon", "width": "16", "height": "16",
  "viewBox": "0 0 16 16", "fill": "none", "stroke-width": "1.3", "aria-hidden": "true",
  "pathCount": 2,
  "computed": { "width": "16px", "height": "16px", "flexShrink": "0", "color": "rgb(29,37,57)" } }
```

- **实现方式：内联 `<svg>`，描边图标，`stroke="currentColor"`，随文字色变色。**
- **不是** icon font，**不是** sprite/`<use>`，**不是** `background-image`。
  （探测脚本里 `iconFontUsed: true` 是误报——它扫到了页面无关样式表里含 "font-family" 的规则；`anyFontIconClass: false` 与 `useCount: 0`、`imgCount: 0` 才是实情。）
- 图标 **16×16**，`flex-shrink:0`，与 `span.VOzbGW_navLabel` 之间 `gap:8px`。
- 每一项的 `path` 内容各不相同（通用设置=齿轮、模型=层叠、内置插件=滑块…），共 13 个不同图标。

**若要替换成 Codex 风格图标，注入位置（实测可行）**：

```js
// cell = button.VOzbGW_navCell；直接子节点固定为 [svg, span]
cell.querySelector('svg.VOzbGW_navIcon')   // ← 替换或改属性都直接命中
cell.children[0]                            // ← 位置取，等价且不依赖类名
cell.children[1]                            // ← span.VOzbGW_navLabel（文本在文本节点里）
```

> `span.VOzbGW_navLabel` 内部是**纯文本节点**，若要在文本前插图标，`insertBefore(node, span.firstChild)` 即可；
> 但鉴于 `svg` 已是第一个子节点，**更稳的做法是替换 `children[0]`**。

`span.VOzbGW_navLabel` 计算样式：`font-size:14px; line-height:22px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
→ 长文本会省略号截断，**注入图标时要留意 188px 的侧栏宽度余量**（实际可用内容宽 164px）。

---

## h) 含主操作 / 危险操作的设置页

### 危险操作：已归档会话（index 5）

**标题区**（页面顶部）：
```html
<span class="yoSR5W_title">会话归档管理</span>   <!-- font-size:15px; font-weight:600 -->
```
**注意：这不是 `<h1>`/`<h2>`，是一个 `<span>`。** Codex 风格要的「大标题」在当前 DOM 里不存在层级语义。

**右上角操作区**：位于 `content > header > .VOzbGW_actions`，由 `[data-slot="settings.action"]` 提供。
但**页面级的操作（刷新）并不在 header，而在内容区顶部**：`button.yoSR5W_button`（「刷新」，53×27，`y=134`）。

**危险按钮**：`button.yoSR5W_dangerButton`（「批量删除」）——**宿主有专门的 danger 类名**，这是唯一一处语义化的按钮类型标记。
配套操作按钮：`yoSR5W_button`（批量归档 / 批量取消归档 / 全选当前结果 / 清空选择 / 按当前配置预览）。

实测按钮计算样式（普通）：

```json
{ "cls": "yoSR5W_button", "color": "rgb(29,37,57)", "bg": "rgb(243,245,251)",
  "borderColor": "rgba(44,58,115,0.22)", "borderWidth": "1px",
  "radius": "8px", "fontSize": "13.3333px", "padding": "4px 12px" }
```

### 主操作：模型页（index 1）

```html
<button class="zGbnIq_secondaryButton">取消</button>
<button class="zGbnIq_primaryButton">保存</button>
<button class="zGbnIq_addButton">添加模型提供商</button>
```
**宿主有 `primaryButton` / `secondaryButton` / `addButton` 三种语义按钮类**（同样带哈希前缀）。

### 皮肤页（index 9）
`button.TJMolG_buttonPrimary`（「试穿」）为主操作。

### 对 Codex 风格改造的影响

Codex 要的是「**大标题 + 右上角操作按钮 + 卡片列表**」。实测现状：

| Codex 结构 | 宿主现状 | 差距 |
|---|---|---|
| 大标题 | 内容区**没有独立标题元素**，页面首行文本就是普通 span | 需新建标题节点或提升样式 |
| 右上角操作按钮 | `[data-slot="settings.action"]` **存在且可用**，但当前只有全局的「打开配置文件」 | 座位可用，但页面级操作不在里面（在 options 内） |
| 卡片列表 | 行是 `[data-slot="settings.general.item"]`（仅通用页）或裸 div | **无统一卡片容器语义** |

> **改造建议锚点**：`[data-slot="settings.action"]` 做右上角操作；内容区做标题需靠注入（因为宿主没留标题座位）。

---

## i) React 重渲染对注入节点的影响（实测，非推断）

**方法**：给 `navList` 挂 `MutationObserver({childList,subtree,attributes})`，给第 1、5 项打 `data-recon-mark` 属性并往第 1 项 `appendChild` 一个 `<span class="recon-injected">`，持有全部 cell 的 DOM 引用做身份比对，然后跑三组操作。

### 结果

| 操作 | 注入属性存活 | 注入子节点存活 | DOM 节点身份 | MutationObserver 观测 |
|---|---|---|---|---|
| 注入后 | ✔ | ✔ | 同一节点 | 3 条（我们的写入） |
| 切到「内置插件」 | ✔ | ✔ | **sameNodeIdx1 = true** | +2 条，**全是 `class` 属性变化** |
| 切到「皮肤」 | ✔ | ✔ | **true** | +2 条 class |
| 切回「通用设置」 | ✔ | ✔ | **true** | +2 条 class |
| **关闭（Esc）→ 重新打开** | ✘ **全部丢失** | ✘ **全部丢失** | **sameNodeIdx0/1 = false** | — |

**关键观测**：从注入到关闭前，共记录 9 条 mutation，`added=1`（我们自己的）、`removed=0`。
即**切换设置项时宿主完全没有增删 DOM 节点，只改了 `class`**（选中态 `VOzbGW_active` 在两个 cell 之间来回搬）。

**关闭再打开时**：`document.querySelector('.VOzbGW_overlay').parentElement === document.body`，
body 层面观测到 **4 条 childList mutation** —— 整个 overlay 被卸载再重建，**navList 及其全部 navCell 都是新节点**。

### 结论（直接决定注入架构）

1. **一次性注入是不够的。必须做幂等重放。**
2. **重放触发点**：观察 `document.body` 的 `childList` 即可（subtree 非必需）——
   overlay 是 body 的直接子节点，开关一次产生 2 次 childList（移除 + 添加）。
3. **切页不需要重放**（节点不重建），所以重放逻辑要**幂等**——重复跑不能叠加节点，须先检查标记属性。
4. **推荐观察容器：`document.body`**（而非 `.VOzbGW_navList`）——
   因为观察 navList 本身会在它被移除后失效。观察 body 才能在重建后重新发现新的 navList。
   若要更省，可观察 `#root`；但 body 最稳。

**参考实现骨架**：

```js
const MARK = 'data-codex-ui-nav';
function replay() {
  const list = document.querySelector('[data-cx-sm-panel] nav > div:last-child');
  if (!list) return;
  for (const cell of list.children) {
    if (cell.hasAttribute(MARK)) continue;   // 幂等：已打过就跳过
    cell.setAttribute(MARK, '');
    // …注入图标 / 分组包裹…
  }
}
new MutationObserver(replay).observe(document.body, { childList: true, subtree: true });
replay();
```

### 模拟第三方侧栏项（实测）

克隆第 6 项（「皮肤」）改文本为「第三方测试项」，`className` 重置为 `VOzbGW_navCell` 后 `appendChild` 到 navList：

| 观测 | 结果 |
|---|---|
| 节点是否存活 | **✔ 存活**（`stillThere: true`，在 list 内） |
| 点击是否崩溃 | **✘ 未崩溃**，模态保持打开，内容区保持原样 |
| 是否切换选中态 | **✘ 否** —— `activeIdx` 仍是 0（「通用设置」） |
| 是否渲染对应内容 | **✘ 否** —— 内容区仍显示通用设置 |

**结论**：宿主的导航是**数据驱动**的（`settings.section` 座位注册 + `id`），DOM 里塞一个新按钮**不会**让它成为一个真正的设置页。

> 这直接支撑了派发者那条判断：**兼容第三方插件，正确姿势是「不破坏宿主对未知项的处理」，而不是「接管未知项」。**
> 任何试图靠 DOM 克隆/patch 来「补出」第三方设置页的方案都会失败——第三方插件应当通过
> `ctx.slots.register({ name: 'settings.section', id, order, label }, Component)` 正常注册（宿主契约见 `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`）。

---

## j) 分组映射建议的技术可行性注记

任务书给的分组：**个人** = 账号与余额 / 通用设置 / 皮肤；**编码** = 模型 / Agent 预设 / LLM Verifier；**集成** = 内置插件 / Web 插件 / 订阅服务 / 记忆系统。

### 可行性判定

| 维度 | 判定 | 说明 |
|---|---|---|
| 能否按文本识别 | **✔ 可以** | 13 项的 `span.VOzbGW_navLabel` 文本可读，可直接匹配 |
| 能否插入分组标题 | **✔ 可以** | navList 是普通 flex column，`insertBefore` 插标题 div 即可 |
| 能否视觉分组（间隙/线） | **✔ 可以，推荐** | 纯 CSS：给目标 cell 加 `margin-top` / `::before` 分隔线。**零 DOM 结构风险** |
| 能否重排顺序 | **✘ 不建议** | 顺序由宿主 `order` 决定，改 DOM 顺序会与 React 的 key 协调冲突，重渲染时被还原 |
| 分组是否持久 | **✘ 不持久** | 关闭重开就没了，**必须走 §i 的幂等重放** |
| 未列出的项怎么办 | **必须兜底** | 实测有 4 项（已归档会话/宠物/创意工坊/使用统计）**不在任务书任何分组里** |

### 关键约束（用户的硬性要求：不做硬编码白名单）

任务书的分组表**覆盖不全**：实测 13 项里有 4 项没有任何归属。
按「未知项归入兜底分组」的要求，建议分组定义改为：

```
个人：账号与余额(条件出现)、通用设置、皮肤、宠物、创意工坊
编码：模型、Agent 预设、LLM Verifier
集成：内置插件、Web 插件、订阅服务、记忆系统
兜底：已归档会话、使用统计、以及任何未来新增的未知项
```

> 但注意「宠物」和「创意工坊」归入「个人」是我的**推断**，任务书未指定——**请派发者确认**。

### 实施建议排序（按风险从低到高）

1. **纯 CSS 视觉分组**（加 margin / 分隔线）——零 DOM 风险，但无法加分组标题文字。
2. **JS 注入分组标题**（插 `div` 到 navList）+ §i 幂等重放——可加文字，中等风险。
3. **改造宿主注册机制**——超出插件边界（`settings.section` 是宿主契约，插件只能注册自己的页）。

---

## k) 可复用的 Playwright 操作序列（供后续验证脚本）

以下序列已在本次侦察中反复跑通（Python Playwright，headless Chromium）：

```python
from playwright.sync_api import sync_playwright
import re

TOKEN_URL  = "http://127.0.0.1:3199/?token=<TOKEN>"
ORIGIN     = "http://127.0.0.1:3199"

def dismiss_onboarding(page):
    """关掉启动引导（内测声明 / 配置 API Key）。重复点直到没有为止。"""
    for _ in range(8):
        done = True
        for txt in ["稍后配置", "继续", "知道了", "跳过"]:
            try:
                loc = page.get_by_role("button", name=re.compile("^" + txt + "$"))
                if loc.count() > 0 and loc.first.is_visible():
                    loc.first.click(); page.wait_for_timeout(900)
                    done = False; break
            except Exception:
                pass
        if done:
            return

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx  = browser.new_context(viewport={"width":1440,"height":960}, device_scale_factor=1.5)
    page = ctx.new_page()

    # ① 先用 token URL 建会话（建立 dsh-auth cookie），再跳裸 origin
    page.goto(TOKEN_URL, wait_until="domcontentloaded"); page.wait_for_timeout(3000)
    page.goto(ORIGIN + "/",  wait_until="domcontentloaded")
    try: page.wait_for_load_state("networkidle", timeout=20000)
    except Exception: pass
    page.wait_for_timeout(8000)          # SPA 启动需要 ~6-8s
    dismiss_onboarding(page)
    page.wait_for_timeout(800)

    page.screenshot(path="closed.png")   # 设置关闭态

    # ② 打开设置：用 JS click 绕过引导遮罩拦截
    page.evaluate("""() => document.querySelector("button[aria-label='设置']").click()""")
    page.wait_for_timeout(3000)
    page.screenshot(path="open.png")     # 设置打开态

    # ③ 切换设置项
    def click_nav(i):
        page.evaluate("(i) => document.querySelectorAll('.VOzbGW_navList .VOzbGW_navCell')[i].click()", i)
        page.wait_for_timeout(1600)

    click_nav(0)                          # 通用设置

    # ④ 关闭：Escape 或点关闭按钮
    page.keyboard.press("Escape"); page.wait_for_timeout(1500)

    # ⑤ 内容区特写截图（按面板实际位置裁剪）
    clip = page.evaluate("""() => { const d = document.querySelector('[data-cx-sm-panel]');
        const r = d.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y),
                 width: Math.round(r.width), height: Math.round(r.height) }; }""")
    page.screenshot(path="content.png", clip=clip)

    browser.close()
```

**关键坑位（都是本次踩过的）**：

1. **必须用 `page.evaluate` 里的 JS `.click()` 打开设置**——用 Playwright 的 `.click()` 会被引导遮罩
   `div._mask_17i0t_18[aria-hidden="true"]` 拦截（`intercepts pointer events`），30s 超时。
2. **引导弹层必须用 `get_by_role("button", name=...)` 精确匹配**，不能用 `has_text`——后者会误伤。
3. **选择器里的引号**：`[data-slot="settings.close"]` 用单引号包会报
   `is not a valid selector`，必须写成 `[data-slot="settings.close"]`（双引号在 JSON 里转义）。
4. **主题/暗色标记在 `body` 上**（`body[data-ds-dark-theme]`），不在 `html`。
5. **等 8 秒**再操作——这个 SPA 冷启动比一般应用慢（实测引导弹层之后还要 ~4s 才完全就绪）。

---

## l) 风险点清单

| # | 风险 | 严重度 | 缓解 |
|---|---|---|---|
| 1 | **宿主大量使用 CSS-Modules 哈希类名**（`VOzbGW_*`, `oY77xG_*`, `_8HJdBW_*`…），且**每个设置页前缀都不同** | 🔴 高 | 面板锚点走 §a「锚点结论」的三层（宿主 `data-shortcut-modal` 优先 → 自有 `data-cx-sm-panel` 作 CSS 挂载点 → 第三方 `data-dsh-surface` 仅兜底）；行内用 `data-slot="*"` / `role="dialog"` / 位置索引；哈希类名一律不用。codex-ui 现有 `patches.css` 已立此纪律，应继续遵守 |
| 2 | **`settings.navList` 与设置行都没有语义锚点** | 🔴 高 | 靠 JS 注入打自有属性（`data-codex-ui-nav`），并做幂等重放 |
| 3 | **关闭重开整棵 navList 重建** | 🔴 高 | §i 的幂等重放，观察 `document.body` |
| 4 | **设置项数量是动态的**（实测 13 项；账号与余额随登录态出现/消失；插件增删会改列表） | 🟠 中 | 按文本/位置动态匹配，**绝不自名单**；必须兜底分组 |
| 5 | **内容区无统一行容器语义**，改造行样式覆盖面有限 | 🟠 中 | 优先 `[data-slot="settings.general.item"]`（通用页）；其余页靠 JS 打标或放弃统一 |
| 6 | **Codex 要的「大标题」在宿主 DOM 里不存在**（页面首行只是普通 `span`） | 🟠 中 | 需 JS 注入标题节点；或只用 CSS 提升首个文本节点样式（易误伤） |
| 7 | **导航是数据驱动的，DOM 克隆项不会路由** | 🟡 低（但认知上重要） | 第三方兼容只做「不破坏」，不做「接管」 |
| 8 | **本次验证实例的 pnpm store 曾损坏**（`E:\.pnpm-store\v11\files\ec`），后经用户修复 | 🟡 低 | 已验证修复：干净 profile 默认 store 安装成功（见验收证据） |
| 9 | 暗色主题下未做侦察（本次全部在亮色下） | 🟡 低 | 若改造涉及暗色，需补一轮 |
| 10 | 未在 Windows 桌面端（Electron）验证 | 🟡 低 | 桌面 profile 由 Electron 独占，本次未触及 |

---

## m) 验收证据附录

### 基线构建（`E:\codex-ui`，git `d590248699a6a2708035af639596ab33cd6caf91`）

```
$ npm run build
源样式: 61456 B → theme.css 65280 B
  skin.css 17781 B, patches.css 21317 B, sidebar-align.css 5918 B,
  window-shadow.css 5883 B, composer.css 7629 B, settings.css 2928 B
client.js: 102393 B
OK    theme.css / OK    client.js
BUILD_EXIT=0

$ npm run check
ok  Node >= 22  v24.19.0        ok  语法 23 个 JS 文件
ok  theme.css 与源样式一致 65280 B   ok  client.js 与源样式一致 102393 B
ok  theme.css 全部作用域化 65280 B   ok  覆盖层：默认值不产生任何 CSS
ok  覆盖层与皮肤对账 37 条           ok  产物里确实带上了设置页与覆盖层
PASS：全部通过
CHECK_EXIT=0
```

### 验证实例

| 项 | 值 |
|---|---|
| profile 路径 | `E:\codex-ui-verify\profiles\verify`（DSH_HOME=`E:\codex-ui-verify`） |
| 端口 | **3199** |
| 启动命令 | `$env:DSH_HOME='E:\codex-ui-verify'; dsh --profile verify --port 3199 --no-open` |
| 进程 | PID **39688**，`node …/dsh/lib/bin.js --profile verify --port 3199 --no-open` |
| 当前 URL | `http://127.0.0.1:3199/?token=GOso7Xcdg2G-TvTak8FuzyKG7Cwlz-easAr9k9zMmAE` |
| 停止命令 | `Stop-Process -Id 39688 -Force` |
| 插件加载 | **0 条 degraded 警告** |

### 已装插件（verify profile bundles）
`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@linxin666/dsh-web-all`, `codex-ui`, `@eddyskywalker/dsh-chatgpt-subscription`, `dsh-llm-verifier`, `dsh-mnemon`

### pnpm store 修复验证
在干净的一次性 profile 上用**默认 store**（无 `--store-dir` 旁路）安装：
```
Content-addressable store is at: E:\.pnpm-store\v11
Done in 3.8s using pnpm v11.21.0
CLEAN_DEFAULT_STORE_EXIT=0
```
→ **E 盘 store 修复确认有效。**

### 截图（`E:\codex-ui\docs\recon\`）
| 文件 | 内容 |
|---|---|
| `01-settings-closed.png` | 设置关闭态（含侧栏与主界面） |
| `02-settings-open.png` | 设置打开态（侧栏 13 项 + 通用设置内容） |
| `03-general-content.png` | 通用设置内容区特写 |
| `04-injection-probe.png` | React 重渲染注入探针现场 |
| `05-page-4.png` / `05-page-5.png` / `05-page-6.png` | 已归档会话 / Web 插件 / 皮肤 三页 |
| `06-archived-danger.png` | 危险操作页特写 |
