# codex-ink · 墨白终端

代码方向为 Codex / ChatGPT。这是 codex-ui 插件的样式正本：`tools/install-plugin.mjs` 读本目录的五个 CSS，
作用域化到 `html[data-codex-ui]` 后写进 `client.js`。同一份目录也满足 Skin v2 清单格式，可由皮肤加载器单独收录。

## 文件

| 文件 | 层 | 内容 |
|---|---|---|
| `skin.json` | 清单 | id、accent、明暗预览 |
| `skin.css` | L1 令牌 + L2 排版 | `--dsw-alias-*` 重映射；补 spacing / radius / 字阶 / motion / elevation 令牌层 |
| `patches.css` | L3 组件 | 焦点环、链接、卡片契约、mono pill 徽标、tag tone 归一、reduced-motion、⑫ 模型选择器、⑬ 输入区顶栏与卡片、⑯ 右栏选择组件、⑰ composer 控件悬停 |
| `sidebar-align.css` | L3 侧栏对齐 | 新会话行与全局面板行落到工作区列表行的两条竖线（图标列 20px、文字列 42px）；含 rc.1 扁平与 rc.2 嵌套两代 DOM 选择器 |
| `window-shadow.css` | L3 窗口边缘 | 会话窗口 0.5px 发丝线加 24px 环境影；右栏面板左沿只留 0.5px 发丝线、影只往上泄；右分界线拖拽柄悬停渐变 |
| `composer.css` | L3 输入区 | 输入卡几何与表面、44px 编辑区、28px 底栏控件带、建议菜单、hero 布局。本层允许 `[class*=…]` 后缀锚点 |
| `preview/` | 资产 | 亮暗预览图 |

## 设计规约

1. chrome 无彩色：按钮、链接、选中态、焦点环为墨色。浅色主按钮 `#1A1C1F` 底白字，深色反相。
2. 灰阶即层级。浅色 `#FFFFFF → #F1F1EF → #E5E5E5`；深色 `#111111 → #171717 → #1f1f1f → #2a2a2a → #353535`。
3. 亮色侧栏 `#EEF4F9`，选中行 `#E2E9ED`，hover `#E8EEF3`。
4. 元信息（token 数、模型名、时间戳、徽标、路径、快捷键）走 `--ds-font-family-code`、11px、`.04em`/`.08em`；中文经 `:lang(zh)` 豁免字距与大写。
5. 圆角 / 间距取 `--dsw-radius-*` 与 `--dsw-space-*`；卡片用 0.5px 描边代替投影。
6. 动效 100 / 160 / 240ms，`cubic-bezier(.3,.7,.4,1)`；`prefers-reduced-motion` 取瞬时终态。
7. 彩色白名单：state 三色、diff 红绿、徽标底色（state 色 8%~16% 透明底）。task-board 的六档 tag tone 收敛到 state 三色加墨灰。

## 令牌契约（三方插件）

1. 颜色只用 `var(--dsw-alias-*)`，不自带 hex；
2. 圆角与间距只用 `var(--dsw-radius-*)` 与 `var(--dsw-space-*)`；
3. hover 用背景升一档，不自创投影；
4. 不引入白名单外的彩色；
5. 元信息用 `var(--dsw-font-meta)` 加 `--dsw-meta-size` 加 `--dsw-meta-tracking`。

## 验收

```bash
node tools/audit-codex-ink.mjs
```

脚本做三件事：`skin.json` 结构自检、36 组 WCAG 对比度实测、`patches.css` 彩色白名单审计。
当前结果 36/36 通过，AAA 19 组，白名单外彩色 0 个。

## 安装

```powershell
node tools/install-plugin.mjs --write      # 插件路径，主用法
node tools/install-skin.mjs --write        # 皮肤加载器路径：同步到 $DSH_HOME/skins/codex-ink
```

## 未覆盖

- shiki 语法高亮的低饱和化未在本层强制，语法色由官方高亮器内联输出；本层只约束代码块底色 `--dsw-alias-markdown-code-block` 一族。
- `patches.css` 通过加载器安全管线并被限定作用域，未在 live GUI 上单独应用过；应用会改写皮肤选择。
