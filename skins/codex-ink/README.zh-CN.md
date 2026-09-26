# codex-ink · 墨白终端

代码方向为 Codex / ChatGPT。这是 codex-ui 插件的样式正本：`src/build.mjs` 读本目录的五份 CSS，把选择器作用域化到
`html[data-codex-ui]`，写出 `theme.css` 与 `client.js`；`scripts/install-plugin.mjs` 负责安装。同一份目录也满足
Skin v2 清单格式，可由皮肤加载器单独收录。

## 文件

| 文件 | 层 | 内容 |
|---|---|---|
| `skin.json` | 清单 | id、accent、明暗预览图 |
| `skin.css` | L1 令牌 + L2 排版 | `--dsw-alias-*` 重映射；spacing / radius / 字阶 / motion / elevation 令牌层 |
| `patches.css` | L3 组件 | 焦点环、链接、卡片契约、mono pill 徽标、tag tone 归一、reduced-motion、⑫ 模型选择器、⑬ 输入区顶栏与卡片、⑯ 右栏展开选择组件、⑰ composer 控件悬停 |
| `sidebar-align.css` | L3 侧栏对齐 | 新会话行与插件行落到工作区列表行的两条竖线（图标列 20px、文字列 42px）；选择器同时覆盖 rc.1 扁平 DOM 与 rc.2 嵌套 DOM |
| `window-shadow.css` | L3 窗口边缘 | 会话窗口 0.5px 发丝线加 24px 环境影；右栏面板左沿只留 0.5px 发丝线、影只往上泄；右分界线拖拽柄悬停渐变 |
| `composer.css` | L3 输入区 | 卡片几何与表面、编辑区 44px、底部控件行 28px、候选菜单、hero 布局。本层允许使用 `[class*=…]` 后缀锚点 |
| `preview/` | 资源 | 明暗预览图 |

## 设计规则

1. chrome 不用彩色：按钮、链接、选中态与焦点环都是墨色。浅色主题主按钮为白底 `#1A1C1F` 字；深色反转。
2. 灰阶承担层级。浅色 `#FFFFFF → #F1F1EF → #E5E5E5`；深色 `#111111 → #171717 → #1f1f1f → #2a2a2a → #353535`。
3. 浅色侧栏 `#EEF4F9`，激活行 `#E2E9ED`，悬停 `#E8EEF3`。
4. 元信息（token 数、模型名、时间戳、徽标、路径、快捷键）用 `--ds-font-family-code`、11px、`.04em`/`.08em` 字距；`:lang(zh)` 下中文免字距与大写。
5. 圆角与间距取自 `--dsw-radius-*` 与 `--dsw-space-*`。卡片用 0.5px 描边代替投影。
6. 动效为 100 / 160 / 240ms，缓动 `cubic-bezier(.3,.7,.4,1)`；`prefers-reduced-motion` 下直接跳到终态。
7. 彩色白名单：state 三色、diff 红绿，以及徽标底色（state 色 8% 到 16% 透明度）。任务板 6 档 tag tone 归到 state 三色加墨色与灰色。

## 第三方插件的令牌契约

1. 颜色只用 `var(--dsw-alias-*)`，不写十六进制字面量。
2. 圆角与间距只用 `var(--dsw-radius-*)` 与 `var(--dsw-space-*)`。
3. 悬停把背景抬高一级；不加自定义投影。
4. 不使用白名单外的彩色。
5. 元信息用 `var(--dsw-font-meta)` 与 `--dsw-meta-size`、`--dsw-meta-tracking`。

## 验收

```bash
node scripts/audit-codex-ink.mjs
```

脚本校验 `skin.json` 结构、实测 36 组 WCAG 对比度、审计 `patches.css` 的彩色白名单。
当前结果：36/36 通过，19 组 AAA，白名单外彩色 0 个。

## 安装

```powershell
node scripts/install-plugin.mjs --write      # 插件路径，主用法
node scripts/install-skin.mjs --write        # 皮肤加载器路径：同步到 $DSH_HOME/skins/codex-ink
```

## 未覆盖

- Shiki 语法高亮未在此去饱和：高亮器自己内联发色。本层只通过 `--dsw-alias-markdown-code-block` 一类令牌约束代码块底色。
- `patches.css` 能通过加载器安全管道并被正确作用域化，但没有单独在真 GUI 上应用过；单独应用会改写皮肤选择。
