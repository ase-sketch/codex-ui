# 更新日志

[English](CHANGELOG.md)

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
