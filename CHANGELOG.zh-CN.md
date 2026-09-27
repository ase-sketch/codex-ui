# 更新日志

[English](CHANGELOG.md)

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
