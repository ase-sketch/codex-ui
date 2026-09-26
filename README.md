# codex-ui

DSH Web GUI 的 Codex 化改造。本目录是客户端插件，也是样式正本与验收工具的存放处。

不依赖 skin-center 与 dsh-web-all。样式文本随 `client.js` 下发，无外部请求。

## 目录

| 路径 | 内容 |
|---|---|
| `package.json` `index.js` `cordis.patch.yml` | 插件本体（宿主半 + bundle patch） |
| `client.template.js` | 浏览器半源码，占位符 `/*__CODEX_UI_CSS__*/` |
| `client.js` `theme.css` | 生成物，由 `tools/install-plugin.mjs` 写出，不手改 |
| `skins/codex-ink/` | 样式正本：skin.css / patches.css / sidebar-align.css / window-shadow.css / composer.css |
| `tools/` | 安装器与验收脚本 |
| `evidence/` | 参考图与验收出图 |

## 安装

```powershell
node tools/install-plugin.mjs                              # 只读体检（默认 web profile）
node tools/install-plugin.mjs --write                      # 生成 + 同步 vendor + 建 junction + 补 patch 条目
node tools/install-plugin.mjs --profile desktop --write    # 桌面壳，改完重启应用
node tools/install-skin.mjs                                # 皮肤正本与 $DSH_HOME/skins 的 SHA256 比对
node tools/install-skin.mjs --write                        # 有漂移则覆盖
```

安装动作：作用域化五个 CSS 正本到 `html[data-codex-ui]` → 生成 `client.js` / `theme.css`
→ 同步到 `profiles/<name>/vendor/codex-ui` → 建 `node_modules/codex-ui` junction
→ 在 profile 的 `cordis.patch.yml` 补 insert 条目。

### 注册方式二选一

| 路径 | 做法 | 使用者 |
|---|---|---|
| bundle | 包名写进 profile `package.json` 的 `dsh.profile.bundles`，由包的 `cordis.patch.yml` 完成 insert | 桌面壳 |
| insert | profile 的 `cordis.patch.yml` 手写 `- insert: [- id: codex-ui, name: 'codex-ui']` | web profile |

两条同时存在时 loader 出现两个同名条目，市场校验判 fail 并停用插件，日志为
`duplicate loader entry id "codex-ui" (2 rows)`。`install-plugin.mjs --write` 在 bundle 路径已覆盖时清除冗余 insert 块。

### 宿主半约束

违反任一条的症状相同：`dsh: warning: 1 entry did not activate` 加 `codex-ui (codex-ui): failed to import`，
宿主 entry 不激活则浏览器半进不了 boot manifest，界面无变化。该诊断只在 CLI 启动时打印。

1. `index.js` 用 ESM 具名导出。loader 用 `import()` 加载，`module.exports = { apply }` 只产生 `default`。
2. `index.js` 不用 `createRequire` 与 `require`。本文件经 Cordis 的 `internal.import` 加载，`createRequire(import.meta.url)` 会抛。
3. 浏览器半导出的 `inject` 是 cordis 服务名；`package.json` 的 `dsh.client.inject` 是包名。写错则 entry 停在 pending，桌面端报
   `web boot: 1 entry did not activate` 并拒绝启动。本插件只注入样式表，取值为 `['slots']`。

### 回滚

还原 `profiles/<name>/cordis.patch.yml` 与 `package.json` 的 `*.bak-pre-codex-ui-*`，再删 `vendor/codex-ui` 与 `node_modules/codex-ui`。

## 验收

| 命令 | 覆盖 | 前置 |
|---|---|---|
| `node tools/audit-codex-ink.mjs` | 皮肤结构、36 组 WCAG、彩色白名单 | 无 |
| `node tools/model-picker-verify.mjs` | ⑫ 模型菜单：触发器、面板、行契约、pending 指示器，18 项 | 无 |
| `node tools/rightbar-verify.mjs` | 阴影层、右栏三件套、展开选择组件、右分界线悬停、左分界线静默，42 项 | 无 |
| `node tools/sidebar-align-verify.mjs` | 侧栏列对齐，6 项 | 无 |
| `node tools/hero-verify.mjs` | ⑬·3 顶栏消隐、⑭ 输入区、⑰ 底部控件默认无框与悬停淡底，7 项 | 无 |
| `node tools/live-gui-probe.mjs --url <带 token 的 URL> [--dpr 1.5]` | 真 GUI：DOM 结构、计算样式、悬停态、模型菜单 pending 时序、出图 | 一个 `dsh web` 实例 |

前五项是夹具验证：取 app.asar 的真实 shipped CSS，加按渲染代码复刻的 DOM，用 `getComputedStyle` 读值。
夹具没有标题栏条、真实 AppFrame 网格与真 RPC，阴影层、分界线悬停、pending 反馈用 `live-gui-probe.mjs` 取证。

`live-gui-probe.mjs` 用法：先 `dsh --profile web --port 3099 --no-open`，终端打印带 token 的 URL，整条传给 `--url`。
token 有存活期，约半小时后返回 401，重起一次取新 token。

## 改造清单

| 编号 | 内容 | 锚点 | 依据 |
|---|---|---|---|
| ⑫ | 模型选择器：原生触发器、不透明白菜单、行高 28、勾选列常驻 | `[data-slot="conversation.input.model"] button`、`body > div[role="menu"][aria-busy]` | 真 GUI |
| ⑫·p | pending 反馈：busy 窗口内行尾勾选换成转圈，光标 progress，disabled 不洗灰 | 同上 | `live-gui-probe` 时序 |
| ⑬ | 输入区顶栏消隐、面板按钮保留官方图标 | `data-conversation-header-corner`、`data-conversation-tabs` | `hero-verify.mjs` |
| ⑭ | 输入卡：圆角、影、几何、工具条、hero 布局 | `[data-composer-card]`、`[data-conversation-scroll]`、`[data-phase]` | `hero-verify.mjs` |
| ⑯ | 右栏展开选择组件：无描边无底色、行高 52、图标 20、快捷键灰底 pill、终端自定义卡定点 | `data-sidebar-right-guide[-entry]` | `rightbar-verify.mjs` |
| ② | 侧栏配色对齐 Codex 亮色侧栏 | `--dsw-alias-bg-sidebar`、`--dsw-specific-sidebar-fill` | 参考图点采样 |
| ②b | 侧栏列对齐（新会话、插件与工作区下方列表行同两条竖线） | `div:has([data-slot="sidebar.workspaces"])` | `sidebar-align-verify.mjs` |
| ②c | 窗口边缘阴影：会话窗口 0.5px l2 发丝线加 24px 全向环境影 | `div:has(> [data-slot="main"])` | Codex 实机图逐像素 |
| ②d | 右栏面板：左沿只留 0.5px l1 发丝线，影用负 spread 只往上泄；压掉 dockkit pane 的 1px l4 | `[data-sidebar-right-panel="push"][data-sidebar-right-open]`、`[data-dockkit-pane][data-dockkit-column="0"]` | 同上 |
| ②e | 右分界线拖拽柄悬停：中段最深、两端淡出的 2px 渐变，自中间展开 | `[data-side="rightbar"]` | `codex-rightbar-edge-hover.png` |
| ⑰ | composer 底部控件：加号默认无底色框、悬停才填；模型与权限控件同套悬停胶囊 | `[data-composer-card] button[class$="_add"]`、`button[class$="_trigger"]` | `codex-composer-plus.png`、`codex-composer-chip-hover.png` |

## 实测值

### 窗口边缘

`evidence/codex-app-reference-1x.png`（1901x1107，DPR 1）：

| 位置 | 切法 | 值 |
|---|---|---|
| 会话窗口左沿 | y=600 | x=340..355 由 238,241,247 渐变到 231,233,239，x=356 单像素 212,215,221 |
| 会话窗口上沿 | x=800 | y=30..45 由 237,242,247 渐变到 232,237,242，y=46 单像素 214,218,224 |
| 右栏面板左沿 | y=600 | x=1437 单像素 237,237,237，两侧纯白 |
| 右栏面板上沿 | x=1700 | y=46 单像素 213,218,224，上方同套渐变 |

`evidence/codex-app-reference.png`（2557x1403，DPR 2）同位置：左沿 x=347 单像素 211,215,221。
发丝线在两份图里都是 1 个设备像素，故本层写 0.5 CSS px：本机缩放 150%，1px 会栅格化成 2 个设备像素。

落成：

| 对象 | box-shadow |
|---|---|
| 会话窗口 | `0 0 0 0.5px var(--dsw-alias-border-l2), 0 0 24px rgba(13,13,13,.05)` |
| 右栏面板 | `0 0 0 0.5px var(--dsw-alias-border-l1), 0 -12px 24px -12px rgba(13,13,13,.05)` |

改后实测（`live-gui-probe --dpr 1.5`）：会话窗口左沿 419=212,217,222（1 像素），上沿 59=212,217,222（1 像素），
右栏面板左沿 1055=240,240,240（1 像素）。改前分别是 2、2、3 个设备像素。

### 分界线悬停

`evidence/codex-rightbar-edge-hover.png`（111x842，DPR 1）：柄心列 y=560 处 x=65/66 为 213,214,214 与 198,198,199，
y=20 处为 239,239,240 与 222,222,222。落成 `linear-gradient(180deg, .09 → .27 → .09)`，宽 2px，入场 `scale 1 .35 → 1 1`。

### 主题色

来源 `evidence/codex-theme-light.png`、`codex-theme-dark.png`（Codex 取色面板）。

| 角色 | 浅色 | 深色 | 令牌 |
|---|---|---|---|
| 强调色 | `#339CFF` | `#0169CC` | `--dsw-alias-link` |
| 背景 | `#FFFFFF` | `#111111` | `--dsw-alias-bg-base` |
| 前景 | `#1A1C1F` | `#FCFCFC` | `--dsw-alias-label-primary` |
| 悬停底 | `#F2F2F3`（实测） | `rgba(252,252,252,.06)`（推导） | `--dsw-codex-hover-fill` |

强调色只上链接。主行动按钮在 Codex 取色面板对应的界面里仍是墨色胶囊，`--dsw-alias-brand-primary` 保持墨色。
深色层级自 `#111111` 向上抬：侧栏 `#171717`、层1 `#1f1f1f`、层2 `#2a2a2a`、层3 `#353535`。
其余中性色仍以 `rgba(13,13,13,x)` 为基，与 `#1A1C1F` 在同一透明度下相差不超过 2/255。

### 侧栏配色

来源 `evidence/codex-sidebar-reference.png` 点采样。

| 令牌 | 值 |
|---|---|
| `--dsw-alias-bg-sidebar` | `#eef4f9` |
| `--dsw-specific-sidebar-fill` | `#eef4f9` |
| `--dsw-specific-sidebar-nav-item-active` | `#e2e9ed` |
| `--dsw-specific-sidebar-nav-item-hover` | `#e8eef3` |

### 模型菜单 pending 窗口

真 GUI 实测：点推理等级后 60ms 内 `aria-busy=true`，六行全 `disabled`，`aria-checked` 前移到新值；
宿主不渲染 pending 指示器，面板保持约 1.1s 后关闭。RPC 往返属宿主行为，本层补该窗口内的可见反馈。

## 边界

- 夹具验证不是登录态截屏。`dsh web` 的 launch token 有存活期且只在进程内。
- headless 单窗口只有前台页签处理 `:hover`，多页夹具把 web 形态页最后打开。
- 模型与强度同屏扁平单列表、行内每模型描述列需要客户端插件占用 `conversation.input.model` 槽并复用 `ctx.modelDirectories`，本层未做。
- ⑯ 保留宿主页签条（开始页签与右上两个按钮）：整条隐藏会连带去掉全屏与收起按钮。
- 会话行文字列 40px，比工作区行、新会话、插件行短 2px，来自官方 `Rows.module.css` 的 `.sessionRow .title` margin，未改。

## 变更历史

- 2026-09-26 主题色复刻与 ⑰：浅色 #339CFF/#FFFFFF/#1A1C1F，深色 #0169CC/#111111/#FCFCFC；深色层级自 #111111 重锚；
  加号撤掉常驻灰底改悬停填充，模型与权限控件加同套悬停胶囊。hero-verify 增 7 项断言，audit 36/36（AAA 19 组）。
- 2026-09-26 发丝线与两条边复核：1px 改 0.5px；右栏面板左沿去影、影只往上泄；左分界线撤掉悬停渐变；
  修正 dockkit pane 选择器（原为 host 的 div 直选子元素，从未命中，导致 1px l4 深边框残留）。右栏验收 46→42 项。
- 2026-09-26 ⑫ pending 转圈、会话窗口阴影回滚、目录整理。
- 2026-09-26 终端行补丁：⑯ 段补 terminal 插件自定义卡（`TerminalGuide` 子序不同）。
- 2026-09-25 侧栏列对齐：`sidebar-align.css` 补 rc.2 嵌套 DOM 规则。
- 2026-09-24 ⑫ 补丁从安装副本回灌正本，新增 `install-skin.mjs` 漂移检测。
