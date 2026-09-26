<p align="center">
  <img src="assets/screenshots/live-gui.png" alt="codex-ui" width="100%">
</p>

<div align="center">

  # codex-ui

  **让 DSH Web 呈现 Codex 的外观：窗口边缘、侧栏分界、模型菜单、输入区、主题色**

  [English](README.md) · [更新日志](CHANGELOG.zh-CN.md) · [MIT](LICENSE)

  [![许可证：MIT](https://img.shields.io/badge/许可证-MIT-blue.svg)](LICENSE)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/deepseek-ai/deepseek-harness)
  [![Node.js 22 或更高](https://img.shields.io/badge/Node.js-22%20%E6%88%96%E6%9B%B4%E9%AB%98-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![CI](https://github.com/rinDBeans/codex-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/rinDBeans/codex-ui/actions/workflows/ci.yml)

</div>

> codex-ui 是社区维护的 DeepSeek Harness（DSH）界面插件，并非 DeepSeek AI 官方产品。

DSH Web 的界面元素按 Codex 复刻：窗口边缘的阴影与发丝线、侧栏分界线、模型与推理等级菜单、输入区结构、浅色与深色主题色。取值来自 Codex 实机截图与取色面板，逐像素测量，测量过程写在 README 的「实测值」一节，参考图存在 `assets/reference/`。

## 宿主兼容性

本工作区对照 DSH `0.1.7-rc.1`（npm 全局安装）与 `0.1.7-rc.2`（Windows 桌面壳的 `app.asar`）开发。
夹具脚本直接读 `app.asar` 里的 shipped CSS，宿主升级后若结构变化，夹具断言会失败。

## 功能

| 编号 | 内容 |
|---|---|
| ⑫ | 模型选择器：原生触发器、不透明白菜单、行高 28px、勾选列常驻、pending 转圈 |
| ⑬ | 输入区顶栏消隐、面板按钮保留官方图标 |
| ⑭ | 输入卡：圆角、阴影、几何、工具条、hero 布局 |
| ⑯ | 右栏展开选择组件：无描边无底色、行高 52px、图标 20px、快捷键灰底 pill |
| ⑰ | composer 底部控件：加号默认无底色框、悬停才填；模型与权限控件同套悬停胶囊 |
| ② | 侧栏配色对齐 Codex 亮色侧栏；侧栏列对齐工作区列表行 |
| ②c | 会话窗口边缘：0.5px 发丝线加 24px 全向环境影 |
| ②d | 右栏面板：左沿只留发丝线、影只往上泄；压掉 dockkit 的 1px 深边框 |
| ②e | 右分界线拖拽柄：悬停时中段最深、两端淡出的渐变 |

## 界面

浅色：会话窗口边缘与右栏。

![浅色主题](assets/screenshots/live-gui-rightbar.png)

输入区底栏：默认无框，悬停出胶囊。

![底栏控件](assets/screenshots/composer-controls-hover.png)

模型菜单的 pending 状态。

![模型菜单 pending](assets/screenshots/model-pending.png)

## 安装

```powershell
npm run install:web        # node scripts/install-plugin.mjs --write
npm run install:desktop    # 桌面壳，改完重启应用
npm run build              # 由 skins/codex-ink 重新生成 theme.css 与 client.js

node scripts/install-plugin.mjs                              # 只读体检（默认 web profile）
node scripts/build.mjs --check                               # 只比对产物是否过期，不落盘
```

安装动作：把 `skins/codex-ink/` 的五个 CSS 作用域化到 `html[data-codex-ui]`，写出 `theme.css`，与 `src/client.template.js`
合成 `client.js`，同步到 `profiles/<name>/vendor/codex-ui`，建 `node_modules/codex-ui` junction，在 profile 的
`cordis.patch.yml` 补 insert 条目。作用域化与拼装只有一份实现，在 `src/build.mjs`。

同一份样式正本也可由皮肤加载器收录：

```powershell
node scripts/install-skin.mjs          # 与 $DSH_HOME/skins/codex-ink 逐文件 SHA256 比对
node scripts/install-skin.mjs --write  # 有漂移则覆盖
```

## 目录

| 路径 | 内容 |
|---|---|
| `index.js` `cordis.patch.yml` `package.json` | 插件宿主半与清单 |
| `src/client.template.js` | 浏览器半模板 |
| `src/build.mjs` | 作用域化与产物生成，唯一实现 |
| `theme.css` `client.js` | 生成物，由 `src/build.mjs` 从 `skins/codex-ink/` 写出 |
| `skins/codex-ink/` | 样式正本（skin.css / patches.css / sidebar-align.css / window-shadow.css / composer.css） |
| `scripts/build.mjs` | 重新生成产物；`--check` 只比对不落盘 |
| `scripts/check-repo.mjs` | 不依赖宿主的仓库体检，CI 入口 |
| `scripts/host-paths.mjs` | 解析 `app.asar`、全局 `@deepseek-ai` 包与 Chromium |
| `scripts/install-plugin.mjs` `scripts/install-skin.mjs` | 安装器 |
| `scripts/*-verify.mjs` `scripts/live-gui-probe.mjs` | 夹具验收与真 GUI 探针 |
| `assets/reference/` | Codex 实机参考图 |
| `assets/screenshots/` | 验收出图 |
| `.github/workflows/ci.yml` | CI |

## 验收

| 命令 | 覆盖 | 前置 |
|---|---|---|
| `npm run check` | 语法、JSON、清单自洽、产物同源、双语文档成对、机器专属路径 | 无 |
| `node scripts/audit-codex-ink.mjs` | 皮肤结构、36 组 WCAG、彩色白名单 | 无 |
| `node scripts/model-picker-verify.mjs` | ⑫ 与 pending 指示器，18 项 | 无 |
| `node scripts/rightbar-verify.mjs` | 阴影层、右栏三件套、两条分界线，42 项 | 无 |
| `node scripts/sidebar-align-verify.mjs` | 侧栏列对齐，6 项 | 无 |
| `node scripts/hero-verify.mjs` | ⑬⑭ 与 ⑰，7 项 | 无 |
| `node scripts/live-gui-probe.mjs --url <带 token 的 URL>` | 真 GUI：阴影、两条分界线、模型菜单 pending 窗口共 10 项断言 | `dsh web` 实例 |

`npm run check` 不需要宿主。五支夹具验证在本机跑：取 `app.asar` 的 shipped CSS 加按渲染代码复刻的 DOM，
用 `getComputedStyle` 读值。夹具没有标题栏条、真实 AppFrame 网格与真 RPC，阴影层、分界线悬停与 pending
反馈由真 GUI 探针取证。

### 宿主路径

验收脚本读的是它跑在其中的宿主，三个路径按同一优先级解析：

1. 环境变量 `DSH_ASAR`、`DSH_GLOBAL_MODULES`、`DSH_CHROME`；
2. `scripts/host.local.json`（本机配置，已 gitignore），例：`{ "asar": "D:/.../resources/app.asar" }`；
3. 扫描常见安装位置、Playwright 的浏览器缓存与 `npm root -g`。

仓库里不含任何一台机器的绝对路径。

真 GUI 探针用法：

```powershell
dsh --profile web --port 3099 --no-open      # 终端打印带 token 的 URL
node scripts/live-gui-probe.mjs --url "http://127.0.0.1:3099/?token=..." --dpr 1.5
```

探针在量 pending 窗口前自己先开一个新会话，断言不过时退出码非 0。token 有存活期，约半小时后返回 401，重起一次取新 token。

## 实测值

### 窗口边缘

`assets/reference/codex-app-reference-1x.png`（1901x1107，DPR 1）：

| 位置 | 切法 | 值 |
|---|---|---|
| 会话窗口左沿 | y=600 | x=340..355 由 238,241,247 渐变到 231,233,239，x=356 单像素 212,215,221 |
| 会话窗口上沿 | x=800 | y=30..45 由 237,242,247 渐变到 232,237,242，y=46 单像素 214,218,224 |
| 右栏面板左沿 | y=600 | x=1437 单像素 237,237,237，两侧纯白 |
| 右栏面板上沿 | x=1700 | y=46 单像素 213,218,224，上方同套渐变 |

发丝线在两份参考图里都是 1 个设备像素，因此写 0.5 CSS px：本机缩放 150%，1px 会栅格化成 2 个设备像素。

| 对象 | box-shadow |
|---|---|
| 会话窗口 | `0 0 0 0.5px var(--dsw-alias-border-l2), 0 0 24px rgba(13,13,13,.05)` |
| 右栏面板 | `0 0 0 0.5px var(--dsw-alias-border-l1), 0 -12px 24px -12px rgba(13,13,13,.05)` |

### 主题色

来源 `assets/reference/codex-theme-light.png`、`codex-theme-dark.png`（Codex 取色面板）。

| 角色 | 浅色 | 深色 | 令牌 |
|---|---|---|---|
| 强调色 | `#339CFF` | `#0169CC` | `--dsw-alias-link` |
| 背景 | `#FFFFFF` | `#111111` | `--dsw-alias-bg-base` |
| 前景 | `#1A1C1F` | `#FCFCFC` | `--dsw-alias-label-primary` |
| 悬停底 | `#F2F2F3` | `rgba(252,252,252,.06)` | `--dsw-codex-hover-fill` |

深色层级自 `#111111` 向上抬：侧栏 `#171717`、层1 `#1f1f1f`、层2 `#2a2a2a`、层3 `#353535`。

### 侧栏配色

来源 `assets/reference/codex-sidebar-reference.png` 点采样。

| 令牌 | 值 |
|---|---|
| `--dsw-alias-bg-sidebar` | `#eef4f9` |
| `--dsw-specific-sidebar-fill` | `#eef4f9` |
| `--dsw-specific-sidebar-nav-item-active` | `#e2e9ed` |
| `--dsw-specific-sidebar-nav-item-hover` | `#e8eef3` |

## 边界

- 夹具验证不是登录态截屏。`dsh web` 的 launch token 有存活期且只在进程内。
- headless 单窗口只有前台页签处理 `:hover`，多页夹具把 web 形态页最后打开。
- 模型与强度同屏扁平单列表、行内每模型描述列需要客户端插件占用 `conversation.input.model` 槽并复用 `ctx.modelDirectories`，本层未做。
- ⑯ 保留宿主页签条：整条隐藏会连带去掉全屏与收起按钮。
- 会话行文字列 40px，比工作区行、新会话、插件行短 2px，来自官方 `Rows.module.css` 的 `.sessionRow .title` margin，未改。
- `composer.css` 与 `patches.css` 使用 21 处哈希类名后缀锚点（`[class$=…]`、`[class*=…]`），宿主没有对应 `data-*` 的位置只能如此。

## CI

`.github/workflows/ci.yml` 在 Ubuntu 与 Windows、Node 22 与 24 上跑 `scripts/check-repo.mjs` 与
`scripts/build.mjs --check`。夹具验收与真 GUI 探针要桌面壳与 Chromium，留在本机跑。

## 许可

MIT。