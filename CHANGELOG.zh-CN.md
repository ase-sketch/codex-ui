# 更新日志

[English](CHANGELOG.md)

## 0.5.0 - 2026-09-27

模型选择器（⑲）：推理等级那一格从**竖列 radio** 变成 Codex 的一条**横向功率轨**。

### 模型选择器功率轨（⑲）

- 真 GUI 实测宿主形态：点「推理等级」展开的是一竖列 `button[role=menuitemradio]`
  （本机 4 档 Off/Low/High/Max，240x28，勾选列 14px；档位数由模型决定，另一台模型见过 6 档）。
  Codex 那边是一条横向轨：24px 高、12px 圆角、前景 10% 填充、inset 0.5px 描边的 `_Track`，
  4px 的 `_Tick` 圆点，28px 白色 `_Thumb`，以及从左端铺到拇指的 `_Range` 强调色条。
- 本层不新增 DOM，只把既有四行重排成轨：
  **① 认轨** —— 菜单的直接子元素全是 `menuitemradio` 才算轨。根菜单的直接子是两格
  `menuitem`、模型菜单的直接子是 `div.groups`（内含 `section[role=group]`），两者都进不来；
  两个菜单的 `aria-label` 完全相同，没有别的身份信号可用。
  **② 分格** —— 每行 `flex:1` 等分轨道宽度，相邻行的底色就连成一条连续的强调色条。
  这是**不依赖档位数**的关键：用 `row:has(~ row[aria-checked=true])` 选中「后面还有选中行的
  所有行」，不知道自己是第几个，也就不必为 N=2..6 各写一遍。
  **③ 拇指** —— 选中行的 `::before` 画 28px 白圆片，位置由行盒自己决定，同样不算坐标。
  **④ 圆点** —— 每行 `::after` 画 4px 点，选中的是白 30%（压在拇指上）。
- 真 GUI 复核（重启 verify profile 后实测）：轨 `flex/row · 24px · radius 12 · padding 0 6px ·
  bg rgba(13,13,13,.08) · inset 0.5px 描边 · overflow visible · 宽 240`（宽度来自宿主自己的
  `.menu{min-width:min(240px,…)}`，本层不重定宽）；四行各 57px、中心 997/1054/1111/1168，
  等距 57；Off/Low 铺满强调色、High 左半边 + 白拇指 + 白 30% 点、Max 空。
- 三处相对 Codex 的取舍，各给理由：**增补**悬停名字胶囊（Codex 拖拽时触发器标签跟手，
  DSH 点一下就提交、菜单随即关闭，没有跟手预览，一排点无从辨认；名字就是行原有的文字，
  只是从常驻改成按需，可访问名一直在 —— 用 `span:first-child` 收起而不是 `display:none`，
  因为后者会把文字从可访问名计算里拿掉）；**换色**强调色取 `--dsw-alias-link`
  （亮 #339cff / 暗 #0169cc，本皮肤唯一的彩色，且跟着设置卡里的强调色走），
  Codex 的 charts-blue 直接搬会把另一套蓝调色板带进「无彩色 chrome」纪律；
  **省略** Fast 粒子轨与 Max 爆发 —— DSH 没有 Fast 模式，`_FastTrackParticles` 没有落点，
  `_Burst` 是「拖到 Max 的瞬间」的帧爆发，DSH 没有拖拽过程也就没有那个时机，两项都如实不做。
- 待机（`aria-busy=true`）：⑫·3 的 pending 转圈挂在勾选列上，轨上勾选列已隐藏，
  所以把同一个信号搬到点上（12px 环 + `codex-ui-spin`），并补回 `cursor: progress`
  —— 否则「点一下没有反馈」这个 0.2.x 修过的老毛病会从轨里回来。
- `scripts/model-picker-verify.mjs` 从 18 项扩到 **42 项**：新增 24 项覆盖轨的几何、
  强调色条、拇指、圆点、悬停胶囊、可访问名，以及两条**反向守卫**
  （根菜单与模型菜单不得被误判成轨）。

## 0.4.0 - 2026-09-27

侧栏「面」：滚动渐隐从宿主那条 24px 覆盖层换成 Codex 的 40px 四段 mask 斜坡。

### 侧栏面（⑱）

- 宿主对同一件事有自己的做法：滚动容器旁边放一条 24px 的绝对定位覆盖层，底色是
  `linear-gradient(transparent → var(--dsw-specific-sidebar-fill))`。Codex 用的是
  `_headerFadeMask_n9nga_1` 的 `--sidebar-scroll-mask-image` —— 直接对内容做 alpha 遮罩。
- **这条改动的理由不是外观**，夹具把话说清楚了：四列并排、逐像素还原遮罩 alpha 曲线，
  不透明底下原生 A 与 codex-ui B 前 24px 逐点差 **≤0.122**、底边亮度差 **8.0/255** —— 两者几乎等价。
  真正的差在半透明侧栏底（设置卡的 `translucentSidebar`）：
  **底边亮度 原生 176.4 / codex-ui 240.3**，宿主那条覆盖层挡不住内容，留下 63.9 的墨色残留，
  mask 则完全免疫（B ↔ Bt 差 3.5）。
- 两处按 DSH 现场的改写都给了依据：① 斜坡的 `footer-edge` 取 100%，因为 DSH 的滚动容器底边
  就是底部固定区的顶边（真 GUI 实测 `listRect.bottom = regionRect.bottom = footRect.y = 844`），
  不像 Codex 那样把 footer 压在滚动内容上；② 不做顶部 8px 渐入，DSH 的分组标题不在滚动容器里，
  滚动视口顶上没有覆盖层，照抄只会让列表首行永远发虚。
- 两层 mask：第一层是斜坡本体、横向只铺 `100% − 12px`；第二层把那 12px 补回不透明。
  `mask-repeat: no-repeat` 下没铺到的区域 mask 值是 0（隐藏），不补第二层会把宿主的滚动条槽整条抹掉。
- 锚点：作用域根用语义锚点 `div:has(> [data-slot="sidebar.workspaces"])`（唯一命中 regionArea）；
  滚动容器与覆盖层没有语义锚点（真 GUI 实测整个 `[data-slot]` 集合里没有它们），
  只能加两个**后缀**锚点 `[class$="_list"]` / `[class$="_fade"]` —— build 报的 hash 锚点数因此 +2。
- `scripts/sidebar-surface-verify.mjs`：13 项断言，含「原生列 mask 为 none」「宿主覆盖层已让位」
  「渐变里有 Codex 的四段 alpha 停点」「第 2 层宽 12px」，以及两条像素级判据。

## 0.3.0 - 2026-09-27

顶栏两格**放开**：槽里的条目恢复渲染 —— 在此之前，派出去的子代理在界面上完全看不见在跑。

### 顶栏（⑬·3c）

- 0.2.x 为了对齐参考图的「只留会话名 + 右上角按钮」，把 `conversation.session.header.actions` 与
  `…utilities` 两个槽出口的内容整块 `display: none`。代价一开始没看出来：官方子代理包把
  **「后代数量触发器」（总数与运行数）** 注册在 actions（id `subagent-catalog`，order -30），
  同一格还有 jobs 的 roster、预设徽标、在应用中打开 —— 一起被关掉了。
- 现在只删掉那两条隐藏规则，其余一个字不改：视图页签仍旧隐去（参考图没有页签）。
- 这些条目**本身就是条件渲染**（没有子代理 / 没有 job / 没有预设 / 没有工作目录时各自返回 null），
  所以常态顶栏与放开前完全一样。真 GUI 的 A/B：空会话下叠加旧规则的顶栏几何
  （header 1138×41、右上角按钮 28×28、页签 display）**逐字段一致**。
- 配色不另配一套：条目只用 `--dsw-*` 语义令牌取色，本皮肤已重锚过这些令牌，因此跟着现在的皮肤走。
  夹具按官方真实类名建模后实测：徽标取色 `rgb(118, 118, 118)` = 皮肤的 `--dsw-alias-label-tertiary`；
  `--dsw-alias-fill-tsp-secondary` 未定义 ⇒ 不填底色；官方自带的高 22px / 圆角 6px / 字号 12px 原样保留
  （这三条是「没被皮肤改写」的防退步断言）。
- `scripts/hero-verify.mjs` 从 8 项扩到 **17 项**：新增会话名仍在、预设徽标可见、工具条目可见、
  页签仍隐去、右上角按钮仍在、徽标取色 / 圆角 / 高度、徽标不填底色。

## 0.2.0 - 2026-09-27

插件管理里那张设置页，加上深色基面按 Codex 应用自身的默认值重锚。

### 设置页（座位 `plugins.bundle.config`）

- 官方插件管理的组合包页上新增配置卡：主题 / 强调色 / 背景 / 前景 / UI 字体 / 代码字体 / 半透明侧边栏 / 对比度。
  座位键是**包名** `codex-ui`，表单命名空间是 **profile 条目 id** `codex-ui`，两者不能混。
- 宿主半新增 `export const Config`：11 个字段全部 `.default(x).volatile()`。设置服务只投影标了 `.volatile()` 的字段，
  也只为带 volatile 字段的条目暴露一份表单 —— 没有它，组合包页上就没有这张卡。
- 覆盖层是纯函数（`src/override.js`）：默认值下输出空串、不打 `data-codex-ui-theme`，装上不动一个字，
  外观与 0.1.2 逐字节相同；有覆盖时写一条运行时 `<style>`，选择器比皮肤多一个属性（特异性 +1），
  `skins/*.css` 一个字不动。
- 改一下即写、没有保存按钮；文本框回车或失焦提交，写后回读确认落地；已覆盖的行有徽标与「重置」。
- 对比度按 Codex 默认档位归一（亮 45 / 暗 60 即原样）：文本档位往 ink 方向混合、中性 alpha 阶梯按比例缩放
  （夹在 0.5×–2×）。**这是简化实现**，没有复刻应用的 `Rdi + zdi·contrast` 线性混合常量，README 如实写明。
- 半透明侧边栏在 Web 上没有窗口层可透，深色下侧栏又与内容同面；开关因此同时把侧栏行填充转半透明，
  免得整个开关在深色下无声。差距如实记录，不当作等价实现。
- 新增 `skins/codex-ink/settings.css`（只取 `--dsw-alias-*` 令牌，零彩色）与 `scripts/settings-page-verify.mjs`
  （真 GUI 13 项断言）。

- 主题行接上宿主主题服务（`ctx.theme`，由 @deepseek-ai/dsh-client-ui-theme 提供）：三档 亮色/深色/跟随系统，
  写的是 `ui-theme` 的 `preference`，与「设置 → 通用 → 外观」同一处 —— 切完整应用一起变、刷新后还在；
  下面三行颜色随之编辑当前生效的那一套。`inject` 增加服务名 `theme`。
- 新增 `scripts/make-verify-profile.mjs`：造一次性验证 profile（插件管理页开着、只挂本插件），
  让 `settings-page-verify` 在任意机器上可复跑。真 GUI 断言 13 → 20 项（补主题切换、深色生效、
  刷新后偏好仍在、收工复位），并改为幂等：每次先清掉上轮残留的覆盖与主题。
- 修两个真 bug，都是真 GUI 断言抓到的：`jsxs(type, props, children)` 的第三参是 **key**（配置卡渲染成空 div）；
  以及把「每次返回新对象」的读数交给 `useSyncExternalStore` —— React 报 #185（最大更新深度），
  宿主只留一行 `slot entry crashed in 'plugins.bundle.config'`，整个座位条目不渲染。

- 防闪加固：画布改由皮肤自持（`html`/`body` 两个主题的底色都自己画，`html` 用 `:has()` 跟上 body 上的主题标记），
  并在 `theme/change` 后两帧内关掉全部过渡（`html[data-codex-ui-switching]`）。实测深色画布从宿主的
  `rgb(16,22,36)` 变成皮肤的 `#181818`。
- 新增 `scripts/theme-flash-probe.mjs`：按帧采样切换过程中的「有效底色」（沿祖先找第一个不透明底色），
  9 段约 720 帧、当前 0 个中间态帧 —— 这类闪屏在无头 Chromium 里复现不出来，探针留着做回归。

- 修「切主题闪两下（黑 → 白 → 黑）」：主题偏好改为**写文档优先**。宿主 `theme.setTheme()` 是「先乐观发布、
  再由 `adopt()` 从设置文档回读」的写法，文档往返慢时会出现 新值 → 旧值 → 新值；卡片改为直接把 `preference`
  写进主题插件自己的设置文档（与服务内部 `host.set` 同路），发布方只剩 `adopt()`，一次点击只发布一次。
  真 GUI 20 项断言全过（含主题切换、刷新后仍在、收工复位）。**注**：本机无头 Chromium 里这条闪屏复现不出来，
  这次修的是唯一能产生该序列的机制，不是"看着好了"。
- 覆盖层加固：设置文档瞬时不可用（`status=loading` / 刚重连）时不再把已生效的覆盖撤掉 —— 那会让用户自己的设置闪一下没了。
- `scripts/theme-flash-probe.mjs` 增加「深浅序列」报告（`L×12 → D×68`），段数多于 2 就是回打。

- 切主题不再等往返：浏览器半加**本地预览**（点下去立刻按目标主题应用 `body[data-ds-dark-theme]` 与
  `html` 的 `color-scheme`，`theme/change` 带同一结果回来时幂等交还，2.5s 等不到就回滚）。
  实测点击→变色 **824ms → 22ms**（中位，探针 4 次采样 22/18/18/31ms），深浅序列仍是两段、无回打。
- `settings-page-verify` 20 → 22 项：新增「点下去 ≤300ms 变色」（预览生效）与「文档落地后预览标记被摘掉」
  （不卡在预览态）两条断言。

### 深色基面

- 背景 `#111111 → #181818`、前景 `#FCFCFC → #FFFFFF`、侧栏 `#171717 → #181818`（与 surface 同面）、
  层1/2/3 `#1f1f1f / #2a2a2a / #353535 → #212121 / #282828 / #303030`、alpha 家族
  `rgba(252,252,252,·) → rgba(255,255,255,·)`。取值来自应用 `resources/app.asar` 里的 `jdi`
  （`surface #181818` / `ink #ffffff`）与生成灰阶；0.1.x 用的取色面板三值不再使用。深色链接仍是应用的
  text-link 令牌 `#0169CC`。
- 皮肤审计 36 组 WCAG 重跑全过（深色底变浅后比值上升，最低一组 4.35）。

### 工程

- `src/build.mjs` 增加两个占位符：覆盖层模块（构建期去掉 `export` 包成 IIFE）与设置卡片；
  出现不支持的 `export` 形式直接抛，不静默漏导出。
- `scripts/check-repo.mjs` 从 13 项加到 19 项：Config 字段齐全且全 volatile、默认值不产生 CSS、色值/字体栈校验、
  对比度恒等与上下限、覆盖层与 `skin.css` 逐条对账（37 条）、产物里确实带上设置页与覆盖层。
- `scripts/install-plugin.mjs` 新增 `--bundle`：把包名写进 `dsh.profile.bundles` 并清掉冗余 `- insert:` 块
  （两条注册路径同时存在会造成重复 loader 条目 id）。web profile 已切到 bundle 注册。
- 修一个真 bug：设置卡片里 `jsxs(type, props, children)` 的第三参其实是 **key**，children 必须放进 props，
  否则渲染出空元素。已加体检断言防复发。

## 0.1.2 - 2026-09-26

按 Codex 桌面应用自身的令牌对齐（应用 `26.727.4816.0`，`resources/app.asar` → `webview/assets/app-*.css`）。

- 动效：`--dsw-motion-fast/base/slow` 100/160/240ms → 150/200/300ms；`--dsw-ease` → `cubic-bezier(.4, 0, .2, 1)`，
  取自 Codex `--transition-duration-basic`、`--transition-duration-relaxed` 与 `--default-transition-timing-function`。
- 焦点环：墨色 → Codex `--color-border-focus`（`#339cff`，深色 `rgba(51,156,255,.7)`），涉及四份样式表。
- pending 转圈：620ms → 1s linear，取自 Codex `--animate-spin`。
- 深色 composer 悬停底：推导的 6% → 8%，取自 `--color-background-button-secondary-hover`。
- `hero-verify`：悬停断言改为等过渡落定；新增焦点环断言（共 8 项）。
- `README` 新增「与 Codex 源码对账」一节，列出各项取值来源与刻意保留的差异。

## 0.1.1 - 2026-09-26

构建、体检与 CI。除模板头注释外，插件渲染结果不变。

- 构建：作用域化与产物生成收进 `src/build.mjs`；`scripts/install-plugin.mjs` 与新增的 `scripts/build.mjs`
  都调它，`theme.css` 与 `client.js` 不会再互相漂移。
- 体检：`scripts/check-repo.mjs`（`npm run check`）校验语法、JSON、清单自洽、产物与源样式同源、样式表卫生、
  文本编码、双语文档成对、机器专属路径，不需要宿主。
- 修 `skins/codex-ink/README.zh-CN.md`：原文件是 GBK 字节被当 UTF-8 写入的乱码且带 BOM，按英文版重写为无 BOM 的 UTF-8。
- 宿主路径：`scripts/host-paths.mjs` 按 `DSH_ASAR` / `DSH_GLOBAL_MODULES` / `DSH_CHROME`、已 gitignore 的
  `scripts/host.local.json`、常见安装位置扫描的次序解析 `app.asar`、全局 `@deepseek-ai` 包与 Chromium；
  四支夹具验收与真 GUI 探针不再写死机器路径。
- 真 GUI 探针：量 pending 窗口前先开一个新会话；对实测到的阴影、两条分界线、pending 窗口断言（10 项），
  量不到的阶段打印 `SKIP`，断言不过退出码非 0。
- CI：`.github/workflows/ci.yml` 在 Ubuntu 与 Windows、Node 22 与 24 上跑上述两条命令。
- npm 脚本：`build`、`check`、`install:web`、`install:desktop`。

## 0.1.0 - 2026-09-26

首个版本。

- 窗口边缘：会话窗口 0.5px 发丝线加 24px 全向环境影；右栏面板左沿只留发丝线、影用负 spread 只往上泄。
- 分界线：右分界线拖拽柄悬停出现中段最深、两端淡出的 2px 渐变；左分界线保持静态发丝线。
- 主题色按 Codex 取色面板复刻：浅色 `#339CFF` / `#FFFFFF` / `#1A1C1F`，深色 `#0169CC` / `#111111` / `#FCFCFC`；深色层级自 `#111111` 重锚。
- ⑰：加号默认无底色框、悬停才填；模型选择器与权限控件加同套悬停胶囊 `#F2F2F3`。
- ⑫：模型菜单对齐 Codex，pending 窗口内行尾勾选换成转圈，光标 progress。
- ⑯：右栏展开选择组件平行化，含 terminal 插件自定义卡的定点规则。
- ⑬⑭：输入区顶栏消隐，输入卡几何、阴影、工具条与 hero 布局。
- ②：侧栏配色与列对齐。
- 安装器与验收脚本：`install-plugin.mjs`（含重复注册检测与清除）、`install-skin.mjs`（SHA256 漂移检测）、
  `audit-codex-ink.mjs`、四支夹具验收、`live-gui-probe.mjs` 真 GUI 探针。
