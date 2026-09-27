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
## 9. 补丁（同日，用户反馈后）

用户重启桌面应用后反馈：**设置里调亮色/深色切换没有效果**。根因是我的设计问题，不是宿主问题。

| 项 | 情况 |
|---|---|
| 现象 | 「主题」分段控件只切换**编辑哪一组字段**，不碰应用主题 —— 它长得像主题开关，实际是编辑目标选择器 |
| 宿主能力（实测锚点） | `@deepseek-ai/dsh-client-ui-theme/lib/client.js`：`ctx.provide("theme", …)`；`getTheme() → {preference, active:{colorScheme}, themes}`；`setTheme(id)`（`id ∈ light/dark/system`）是「唯一用户偏好写入口」，写 `ui-theme` 的 `preference`；变更经 `ctx.on('theme/change')` 广播（`dsh-client-ui-layout` 就是这么消费的） |
| 改法 | 主题行改成三档 亮色/深色/跟随系统，直接调 `theme.setTheme(id)`；下面三行颜色编辑 `active.colorScheme` 那一套；`inject` 加服务名 `theme` |
| 顺带修 | `useSyncExternalStore` 的快照必须是稳定引用：我第一版把「每次 new 一个对象」的读数交给它，React 报 #185（最大更新深度），宿主只留一行 `slot entry crashed in 'plugins.bundle.config'`，整个座位条目不渲染。改成透传宿主自己的冻结快照 + 派生值在渲染里算 |
| 证据 | 真 GUI 20 项断言全过（含：切深色后 `body[data-ds-dark-theme]` 出现、底色 #181818、色块跟着变、刷新后偏好仍在、收工复位）；反证实验：把不稳定快照放回去，抓到的正是 `slot entry crashed` + React #185 |
| 新增 | `scripts/make-verify-profile.mjs`（一次性验证 profile，让验收可复跑）；验收脚本改为幂等 |
