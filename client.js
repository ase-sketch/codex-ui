/**
 * codex-ui — Browser half（唯一样式源是 skins/codex-ink，经 src/build.mjs 生成；本文件是模板，勿手改）。
 *
 * 职责三件：
 *   1. 把 <workbench>/skins/codex-ink 的整套 Codex 化样式（L1/L2 令牌 + L3 组件层 + 设置页层）
 *      以作用域 html[data-codex-ui] 注入到文档，并在卸载时完整收回；
 *   2. 把设置页的取值渲染成一层覆盖（多一个属性 ⇒ 特异性压过皮肤，源样式一个字不动）；
 *   3. 在官方插件管理的组合包页（座位 plugins.bundle.config）注册那张配置卡。
 * 不依赖 skin-center / dsh-web-all：样式文本随本文件一起下发，无外部请求。
 */
window.__ModuleLoader__.load({
  id: 'codex-ui',
  factory: (require) => {
    /** 插件 id：style 标签归属标记，同时也是组合包座位的键。 */
    const PLUGIN_ID = 'codex-ui';
    /** 作用域根属性：所有规则都挂在它下面，卸载即整层失效。 */
    const ROOT_ATTR = 'data-codex-ui';
    /**
     * 切主题时临时打的属性：皮肤里有一条 `html[data-codex-ui-switching] * { transition: none }`。
     * 主题切换会让整个页面的 token 同时换值，若各处还有 background/color 过渡，就是一次交叉淡出 ——
     * 元素半旧半新的那几帧看起来就是「闪」。打上它、过两个 rAF 摘掉，切换变成一次到位。
     */
    const SWITCH_ATTR = 'data-codex-ui-switching';
    /**
     * 本地预览标记：用户点了主题之后，宿主要把偏好写进设置文档、再回读，实测往返 ~0.8s。
     * 这一层让「点下去」与「变颜色」之间不等那个往返：立刻按目标主题应用，
     * 等 `theme/change` 带着同一个结果回来就交还给宿主；超时没等到就按真值回滚。
     * 它只写宿主本来就会写的两处（body[data-ds-dark-theme] 与 html 的 color-scheme），
     * 因此确认到达时是幂等的，不会出现第二次跳变。
     */
    const PREVIEW_ATTR = 'data-codex-ui-preview';
    /** 预览等待上限：够一次文档往返（实测 ~0.8s）再多给一倍余量。 */
    const PREVIEW_TIMEOUT_MS = 2500;
    /** 生成期注入的样式表文本。 */
    const CSS = "/* ==== L1/L2 令牌与排版层（源：skins/codex-ink/skin.css）==== */\n/* ============================================================================\n   codex-ink（墨白终端）· L1 令牌层 + L2 排版层\n   ----------------------------------------------------------------------------\n   设计母题：OpenAI Codex / ChatGPT 系 —— 界面消失，只剩内容与光标。\n   黑白灰是 chrome，彩色只配给状态。\n\n   本文件只做两件事：\n     1) 把官方 --dsw-alias-* / --dsw-specific-* 语义令牌重映射到墨白灰阶；\n     2) 补齐官方缺失的 spacing / radius / typography-scale / motion / elevation 令牌层。\n\n   纪律：\n     · 不出现任何 url()、@import、远程地址、内联 JS（skin-center 安全管线白名单）；\n     · 亮色令牌同时落在 :root 与 body —— 官方亮色令牌声明在 body 上，\n       只写 :root 会被 body 自身声明盖掉（加载器会把本文件强制限定在\n       html[data-dsh-skin=\"codex-ink\"] 之下，从而取得高于官方的特异性）；\n     · 彩色白名单：state 三色 + diff 红绿 + 徽标底色 + 焦点环（Codex --color-border-focus 蓝 #339CFF），\n      其余一律墨/灰。\n   ========================================================================== */\n\n/* ── 亮色主题 ────────────────────────────────────────────────────────────── */html[data-codex-ui],html[data-codex-ui] body{\n  color-scheme: light;\n\n  /* 画布自持：底色由本皮肤自己画在 html 与 body 上，不指望宿主那一帧是否已把 token 换好。\n     主题切换时的闪，十有八九是「某一帧没人画底」—— 那时露出的是 UA/宿主的默认画布色。 */\n  background-color: #ffffff;\n\n  /* 底色：白 → #F9F9F9 → #F1F1EF → #E5E5E5 四档灰阶即层级 */\n  --dsw-alias-bg-base: #ffffff;\n  --dsw-alias-bg-sidebar: #eef4f9; /* Codex 亮色侧栏实测取样（350×1377 截图点采样 = #EEF4F9） */\n  --dsw-alias-bg-layer-1: #ffffff;\n  --dsw-alias-bg-layer-2: #f1f1ef;\n  --dsw-alias-bg-layer-3: #e5e5e5;\n  --dsw-alias-bg-overlay: rgba(255, 255, 255, 0.88);\n  --dsw-alias-bg-module-platform: #f9f9f9;\n  --dsw-alias-bg-multi-select: #e5e5e5;\n  --dsw-alias-bg-skeleton: rgba(13, 13, 13, 0.05);\n\n  /* 描边：发丝即层级 */\n  --dsw-alias-border-l1: rgba(13, 13, 13, 0.07);\n  --dsw-alias-border-l2: rgba(13, 13, 13, 0.12);\n  --dsw-alias-border-l3: rgba(13, 13, 13, 0.18);\n  --dsw-alias-border-l4: rgba(13, 13, 13, 0.24);\n  --dsw-alias-border-l2-darkmode-thin: rgba(13, 13, 13, 0.09);\n\n  /* 文字：墨 / 次墨 / 辅墨。前景取 Codex 浅色主题的「前景」实测值 #1A1C1F\n     （冷调，不是纯黑；取色面板截图 assets/reference/codex-theme-light.png）。 */\n  --dsw-alias-label-primary: #1a1c1f;\n  --dsw-alias-label-primary-dimmed: #5d5d5d;\n  --dsw-alias-label-primary-inverted: #ffffff;\n  --dsw-alias-label-primary-foreground: #ffffff;\n  --dsw-alias-label-primary-bluish: #0d0d0d;\n  --dsw-alias-label-secondary: #5d5d5d;\n  --dsw-alias-label-tertiary: #767676;\n  --dsw-alias-label-caption: #767676;\n  --dsw-alias-label-dimmed: #c9c9c9;\n\n  /* 主行动 = 墨块（全界面视觉重量最高的元素，无需任何品牌色） */\n  --dsw-alias-brand-primary: #0d0d0d;\n  --dsw-alias-brand-primary-invert: #ffffff;\n  --dsw-alias-brand-text: #ffffff;\n  --dsw-alias-brand-primary-new-colorprimary-new-color: #0d0d0d;\n  /* 强调色 = Codex 浅色主题「强调色」实测值 #339CFF，只上链接；\n     主行动按钮在 Codex 里仍是墨色胶囊，故 brand-primary 不动。 */\n  --dsw-alias-link: #339cff;\n\n  --dsw-alias-button-primary-fill: #0d0d0d;\n  --dsw-alias-button-primary-hover: #2a2a2a;\n  --dsw-alias-button-primary-dimmed: #e5e5e5;\n  --dsw-alias-button-contrast-fill: #0d0d0d;\n  --dsw-alias-button-elevated-fill: #ffffff;\n  --dsw-alias-button-floating-fill: #ffffff;\n  --dsw-alias-button-floating-hover: #f1f1ef;\n  --dsw-alias-button-ghost-active-fill: #e5e5e5;\n  --dsw-alias-button-ghost-active-hover: #dcdcdc;\n  --dsw-alias-button-ghost-active-border: #8f8f8f;\n  --dsw-alias-button-info-fill: #0d0d0d;\n  --dsw-alias-button-info-hover: #2a2a2a;\n  --dsw-alias-button-tool-bar-fill: rgba(13, 13, 13, 0.28);\n  --dsw-alias-button-tool-bar-fill-invisible: rgba(13, 13, 13, 0.18);\n  --dsw-alias-button-tool-bar-hover: rgba(13, 13, 13, 0.36);\n\n  /* 交互底色：背景升一档，无位移无阴影 */\n  --dsw-alias-interactive-bg-hover: rgba(13, 13, 13, 0.04);\n  /* composer 控件悬停底：Codex 实测 #F2F2F3（冷中性，不是本层灰阶的暖 #F1F1EF）。 */\n  --dsw-codex-hover-fill: #f2f2f3;\n  /* 焦点环：Codex --color-border-focus = --blue-300 = #339cff（亮色直接取色） */\n  --dsw-codex-focus: #339cff;\n  --dsw-alias-interactive-bg-active: rgba(13, 13, 13, 0.08);\n  --dsw-alias-interactive-bg-hover-solid: #f1f1ef;\n  --dsw-alias-interactive-bg-hover-accent: rgba(13, 13, 13, 0.06);\n  --dsw-alias-interactive-bg-hover-danger: rgba(209, 36, 47, 0.08);\n\n  /* Markdown / 代码 */\n  --dsw-alias-markdown-code-block: #f1f1ef;\n  --dsw-alias-markdown-code-block-banner: #e5e5e5;\n  --dsw-alias-markdown-inline-code: #f1f1ef;\n  --dsw-alias-markdown-code-segment-selected: #ffffff;\n  --dsw-alias-markdown-code-segment-unselected: #f1f1ef;\n  --dsw-alias-markdown-citation: #f1f1ef;\n  --dsw-alias-markdown-placeholder: #e5e5e5;\n  --dsw-alias-markdown-tag: #f1f1ef;\n\n  /* 状态：彩色白名单的唯一合法来源 */\n  --dsw-alias-state-success-primary: #1a7f37;\n  --dsw-alias-state-success-secondary: #2e9e4c;\n  --dsw-alias-state-success-tertiary: rgba(26, 127, 55, 0.08);\n  --dsw-alias-state-error-primary: #d1242f;\n  --dsw-alias-state-error-secondary: #e5484d;\n  --dsw-alias-state-error-tertiary: rgba(209, 36, 47, 0.08);\n  --dsw-alias-state-warn-primary: #8f5f00;\n  --dsw-alias-state-warn-secondary: #bb8009;\n  --dsw-alias-state-warn-tertiary: rgba(143, 95, 0, 0.08);\n  --dsw-alias-state-warn-label: #8f5f00;\n  --dsw-alias-state-business-primary: #0d0d0d;\n  --dsw-alias-state-business-tertiary: rgba(13, 13, 13, 0.08);\n  --dsw-alias-state-idle-primary: #767676;\n\n  /* diff：白名单内的红绿 */\n  --dsw-alias-code-diff-added: rgba(26, 127, 55, 0.1);\n  --dsw-alias-code-diff-deleted: rgba(209, 36, 47, 0.1);\n  --dsw-alias-file-diff-added-bg: #e6f4e7;\n  --dsw-alias-file-diff-added-gutter: #edf7ed;\n  --dsw-alias-file-diff-added-marker: #1a7f37;\n  --dsw-alias-file-diff-deleted-bg: #fce6e2;\n  --dsw-alias-file-diff-deleted-gutter: #fdece9;\n  --dsw-alias-file-diff-deleted-marker: #d1242f;\n\n  /* 浮层 / 提示 */\n  --dsw-alias-bg-mask-drop: rgba(255, 255, 255, 0.7);\n  --dsw-alias-toast-bg: #1e1e1e;\n  --dsw-alias-tooltip-bg: #1e1e1e;\n  --dsw-alias-tooltip-fg: #ffffff;\n  --dsw-alias-hovercard-bg: #ffffff;\n\n  /* 滚动条：thumb = label-tertiary 30% / 50% */\n  --dsw-alias-scrollbar-bg-l1: rgba(118, 118, 118, 0.3);\n  --dsw-alias-scrollbar-bg-l2: rgba(118, 118, 118, 0.5);\n  --dsw-alias-scrollbar-hover-l1: rgba(13, 13, 13, 0.35);\n  --dsw-alias-scrollbar-hover-l2: rgba(13, 13, 13, 0.5);\n\n  /* 具体面 */\n  --dsw-specific-sidebar-fill: #eef4f9; /* 与 --dsw-alias-bg-sidebar 同源：Codex 亮色侧栏实测 */\n  --dsw-specific-sidebar-nav-item-hover: #e8eef3; /* 侧栏底 ↔ 选中行的中点（推导值，非取样） */\n  --dsw-specific-sidebar-nav-item-active: #e2e9ed; /* Codex 选中行（PROJIECT）实测取样 */\n  --dsw-specific-sidebar-nav-item-active-accent: rgba(13, 13, 13, 0.1);\n  --dsw-specific-input-major: #ffffff;\n  --dsw-specific-login-input: #f9f9f9;\n  --dsw-specific-menu: rgba(255, 255, 255, 0.88);\n  --dsw-specific-selector: #f1f1ef;\n  --dsw-specific-bubble: #f1f1ef;\n  --dsw-specific-bubble-highlight: #e5e5e5;\n  --dsw-specific-tip: #f1f1ef;\n\n  --dsw-shadow-lv1: 0 1px 2px rgba(13, 13, 13, 0.06);\n  --dsw-shadow-lv2: 0 2px 8px rgba(13, 13, 13, 0.08);\n  --dsw-shadow-lv3: 0 8px 24px rgba(13, 13, 13, 0.1);\n  --dsw-linear-gradient-think: linear-gradient(180deg, #ffffff 20.19%, rgba(255, 255, 255, 0) 100%);\n  --dsw-linear-think-select: linear-gradient(180deg, #f1f1ef 20.19%, rgba(241, 241, 239, 0) 100%);\n}\n\n/* 切主题的那一两帧关掉全部过渡：交叉淡出（元素一半旧色一半新色）看起来就是「闪」。\n   属性由浏览器半在 ctx.on('theme/change') 时打上，两个 rAF 后摘掉。 */html[data-codex-ui-switching] *,html[data-codex-ui-switching] *::before,html[data-codex-ui-switching] *::after{\n  transition: none !important;\n}\n\n/* html 在最外层，读不到 body 上那份深色令牌，只能用 :has() 自己取一次。 */html[data-codex-ui] :root:has(body[data-ds-dark-theme]){\n  background-color: #181818;\n}\n\n/* ── 暗色主题 ─────────────────────────────────────────────────────────────\n   基准 = Codex 应用自身的深色默认值（app.asar 的 jdi）：surface #181818 / ink #ffffff /\n   accent #339CFF。0.1.2 及以前用的是取色面板那三值（#111111 / #FCFCFC / #0169CC），\n   已按应用默认值重锚；链接色仍是应用的 text-link 令牌 #0169CC，未随 accent 走。\n   层级自基准向上抬：侧栏 #181818（与 surface 同面，分隔交给 0.5px 发丝线）→\n   层1 #212121 → 层2 #282828 → 层3 #303030。alpha 家族随之由 252 抬到 255\n   （Codex 深色 --alpha-base = #fff）。 */html[data-codex-ui] body[data-ds-dark-theme]{\n  color-scheme: dark;\n\n  /* 画布自持（深色）：宿主只把 data-ds-dark-theme 打在 body 上，所以 html 那一份用 :has() 跟上。\n     这里重复一次字面值而不是引用令牌 —— 令牌就定义在 body 上，html 自己读不到它的深色值。 */\n  background-color: #181818;\n\n  /* 背景/侧栏同取 jdi.dark.surface #181818 —— Codex 深色里侧栏与内容同一个面。 */\n  --dsw-alias-bg-base: #181818;\n  --dsw-alias-bg-sidebar: #181818;\n  --dsw-alias-bg-layer-1: #212121;\n  --dsw-alias-bg-layer-2: #282828;\n  --dsw-alias-bg-layer-3: #303030;\n  --dsw-alias-bg-overlay: rgba(24, 24, 24, 0.88);\n  --dsw-alias-bg-module-platform: #1f1f1f;\n  --dsw-alias-bg-multi-select: #303030;\n  --dsw-alias-bg-skeleton: rgba(255, 255, 255, 0.07);\n\n  --dsw-alias-border-l1: rgba(255, 255, 255, 0.08);\n  --dsw-alias-border-l2: rgba(255, 255, 255, 0.14);\n  --dsw-alias-border-l3: rgba(255, 255, 255, 0.2);\n  --dsw-alias-border-l4: rgba(255, 255, 255, 0.26);\n  --dsw-alias-border-l2-darkmode-thin: rgba(255, 255, 255, 0.1);\n\n  --dsw-alias-label-primary: #ffffff;\n  --dsw-alias-label-primary-dimmed: #b4b4b4;\n  --dsw-alias-label-primary-inverted: #0d0d0d;\n  --dsw-alias-label-primary-foreground: #0d0d0d;\n  --dsw-alias-label-primary-bluish: #ececec;\n  --dsw-alias-label-secondary: #b4b4b4;\n  --dsw-alias-label-tertiary: #949494;\n  --dsw-alias-label-caption: #949494;\n  --dsw-alias-label-dimmed: #4a4a4a;\n\n  --dsw-alias-brand-primary: #ffffff;\n  --dsw-alias-brand-primary-invert: #0d0d0d;\n  --dsw-alias-brand-text: #0d0d0d;\n  --dsw-alias-brand-primary-new-colorprimary-new-color: #ffffff;\n  --dsw-alias-link: #0169cc; /* Codex 深色主题「强调色」实测值 */\n\n  --dsw-alias-button-primary-fill: #ffffff;\n  --dsw-alias-button-primary-hover: #d9d9d9;\n  --dsw-alias-button-primary-dimmed: #282828;\n  --dsw-alias-button-contrast-fill: #ececec;\n  --dsw-alias-button-elevated-fill: #212121;\n  --dsw-alias-button-floating-fill: #1f1f1f;\n  --dsw-alias-button-floating-hover: #282828;\n  --dsw-alias-button-ghost-active-fill: #303030;\n  --dsw-alias-button-ghost-active-hover: #383838;\n  --dsw-alias-button-ghost-active-border: #7e7e7e;\n  --dsw-alias-button-info-fill: #ffffff;\n  --dsw-alias-button-info-hover: #d9d9d9;\n  --dsw-alias-button-tool-bar-fill: rgba(255, 255, 255, 0.22);\n  --dsw-alias-button-tool-bar-fill-invisible: rgba(255, 255, 255, 0.16);\n  --dsw-alias-button-tool-bar-hover: rgba(255, 255, 255, 0.28);\n\n  --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.06);\n  /* 深色悬停底：Codex --color-background-button-secondary-hover = --gray-0 8% = #ffffff14。 */\n  --dsw-codex-hover-fill: rgba(255, 255, 255, 0.08);\n  /* 焦点环：Codex 深色 --color-border-focus = --blue-300 70%，即 #339cffb3。 */\n  --dsw-codex-focus: rgba(51, 156, 255, 0.7);\n  --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.1);\n  --dsw-alias-interactive-bg-hover-solid: #282828;\n  --dsw-alias-interactive-bg-hover-accent: rgba(255, 255, 255, 0.08);\n  --dsw-alias-interactive-bg-hover-danger: rgba(248, 81, 73, 0.12);\n\n  --dsw-alias-markdown-code-block: #1f1f1f;\n  --dsw-alias-markdown-code-block-banner: #141414;\n  --dsw-alias-markdown-inline-code: #282828;\n  --dsw-alias-markdown-code-segment-selected: #303030;\n  --dsw-alias-markdown-code-segment-unselected: #1f1f1f;\n  --dsw-alias-markdown-citation: #212121;\n  --dsw-alias-markdown-placeholder: #282828;\n  --dsw-alias-markdown-tag: #282828;\n\n  --dsw-alias-state-success-primary: #3fb950;\n  --dsw-alias-state-success-secondary: #56d364;\n  --dsw-alias-state-success-tertiary: rgba(63, 185, 80, 0.16);\n  --dsw-alias-state-error-primary: #ff7b72;\n  --dsw-alias-state-error-secondary: #ff9492;\n  --dsw-alias-state-error-tertiary: rgba(255, 123, 114, 0.16);\n  --dsw-alias-state-warn-primary: #d29922;\n  --dsw-alias-state-warn-secondary: #e3b341;\n  --dsw-alias-state-warn-tertiary: rgba(210, 153, 34, 0.16);\n  --dsw-alias-state-warn-label: #d29922;\n  --dsw-alias-state-business-primary: #ececec;\n  --dsw-alias-state-business-tertiary: rgba(255, 255, 255, 0.12);\n  --dsw-alias-state-idle-primary: #7e7e7e;\n\n  --dsw-alias-code-diff-added: rgba(63, 185, 80, 0.14);\n  --dsw-alias-code-diff-deleted: rgba(248, 81, 73, 0.14);\n  --dsw-alias-file-diff-added-bg: #1f3124;\n  --dsw-alias-file-diff-added-gutter: #132016;\n  --dsw-alias-file-diff-added-marker: #41c977;\n  --dsw-alias-file-diff-deleted-bg: #3c1f1b;\n  --dsw-alias-file-diff-deleted-gutter: #28130e;\n  --dsw-alias-file-diff-deleted-marker: #fa423e;\n\n  --dsw-alias-bg-mask-drop: rgba(39, 39, 48, 0.7);\n  --dsw-alias-toast-bg: #282828;\n  --dsw-alias-tooltip-bg: #212121;\n  --dsw-alias-tooltip-fg: #ececec;\n  --dsw-alias-hovercard-bg: #212121;\n\n  --dsw-alias-scrollbar-bg-l1: rgba(160, 160, 160, 0.3);\n  --dsw-alias-scrollbar-bg-l2: rgba(160, 160, 160, 0.5);\n  --dsw-alias-scrollbar-hover-l1: rgba(255, 255, 255, 0.35);\n  --dsw-alias-scrollbar-hover-l2: rgba(255, 255, 255, 0.5);\n\n  --dsw-specific-sidebar-fill: #181818;\n  --dsw-specific-sidebar-nav-item-hover: #212121;\n  --dsw-specific-sidebar-nav-item-active: #282828;\n  --dsw-specific-sidebar-nav-item-active-accent: rgba(255, 255, 255, 0.14);\n  --dsw-specific-input-major: #212121;\n  --dsw-specific-login-input: #1f1f1f;\n  --dsw-specific-menu: rgba(24, 24, 24, 0.88);\n  --dsw-specific-selector: #282828;\n  --dsw-specific-bubble: #212121;\n  --dsw-specific-bubble-highlight: #282828;\n  --dsw-specific-tip: #1f1f1f;\n\n  --dsw-shadow-lv1: 0 1px 2px rgba(0, 0, 0, 0.4);\n  --dsw-shadow-lv2: 0 2px 8px rgba(0, 0, 0, 0.5);\n  --dsw-shadow-lv3: 0 8px 24px rgba(0, 0, 0, 0.6);\n  --dsw-linear-gradient-think: linear-gradient(180deg, #212121 20.19%, rgba(33, 33, 33, 0) 100%);\n  --dsw-linear-think-select: linear-gradient(180deg, #1f1f1f 20.19%, rgba(40, 40, 40, 0) 100%);\n}\n\n/* ── 官方缺失的令牌层：空间 / 圆角 / 字阶 / 动效 ─────────────────────────── */html[data-codex-ui],html[data-codex-ui] body{\n  /* 4px 网格（新增 12/20 密档，比 Claude 方向紧一档） */\n  --dsw-space-1: 4px;\n  --dsw-space-2: 8px;\n  --dsw-space-3: 12px;\n  --dsw-space-4: 16px;\n  --dsw-space-5: 20px;\n  --dsw-space-6: 24px;\n  --dsw-space-8: 32px;\n\n  /* 圆角刻度（唯一真源）：所有可见边框的圆角都从这里取，各层只准引用、不准再写 px。\n     角色 → 刻度：\n       xs   行内小片 / 菜单项\n       s    控件（按钮 / 列表行 / 页签）\n       m    卡片 / 浮层（菜单、下拉、tooltip）\n       l    面板 / 模态（取 16px，与宿主窗口内容块同值 —— dsh-client-ui-layout 的\n            --dsh-windows-content-radius: 16px）\n       xl   输入卡（无 corner-shape 时的回退值）\n       2xl  输入卡（corner-shape: superellipse 版；超椭圆要更大数值才视觉等圆）\n       pill 徽标 / 圆形按钮 */\n  --dsw-radius-xs: 4px;\n  --dsw-radius-s: 8px;\n  --dsw-radius-m: 12px;\n  --dsw-radius-l: 16px;\n  --dsw-radius-xl: 20px;\n  --dsw-radius-2xl: 25px;\n  --dsw-radius-pill: 999px;\n\n  --dsw-content-max-width: 768px;\n\n  /* 字阶（§3.2）：11 / 12.5 / 14 / 16 / 20 / 28 */\n  --dsw-text-2xs: 11px;\n  --dsw-text-xs: 12.5px;\n  --dsw-text-sm: 13px;\n  --dsw-text-base: 14px;\n  --dsw-text-lg: 16px;\n  --dsw-text-xl: 20px;\n  --dsw-text-2xl: 28px;\n  --dsw-leading-2xs: 1.3;\n  --dsw-leading-xs: 1.4;\n  --dsw-leading-base: 1.65;\n  --dsw-leading-lg: 1.4;\n  --dsw-leading-xl: 1.35;\n  --dsw-leading-2xl: 1.25;\n\n  /* 元信息 mono 规约：等宽 + 大写 + 加宽字距（Codex TUI 血统） */\n  --dsw-font-meta: var(--ds-font-family-code);\n  --dsw-meta-size: 11px;\n  --dsw-meta-weight: 500;\n  --dsw-meta-tracking: 0.08em;\n  --dsw-meta-tracking-pill: 0.04em;\n\n  /* 动效：取 Codex 应用自身的时长与曲线（26.727.4816.0 的 app-*.css）\n     fast  ← --transition-duration-basic: .15s\n     base  ← DSH 自带 --ds-transition-duration: .2s（Codex 用 duration-200 工具类）\n     slow  ← --transition-duration-relaxed: .3s\n     ease  ← --ease-in-out 与 --default-transition-timing-function，两者同值 */\n  --dsw-motion-fast: 150ms;\n  --dsw-motion-base: 200ms;\n  --dsw-motion-slow: 300ms;\n  --dsw-ease: cubic-bezier(0.4, 0, 0.2, 1);\n\n  /* 输入区配件（skin-center 共享适配器消费的变量） */\n  --dsh-composer-accessory-radius: var(--dsw-radius-l);\n  --dsh-composer-accessory-bg: var(--dsw-alias-bg-layer-2);\n  --dsh-composer-accessory-color: var(--dsw-alias-label-secondary);\n  --dsh-composer-accessory-border: 0.5px solid var(--dsw-alias-border-l1);\n  --dsh-composer-accessory-shadow: none;\n  --dsh-composer-accessory-blur: 0px;\n}\n\n/* ── elevation：描边即层级，阴影近零 ─────────────────────────────────────── */\n/* 官方把 --dsw-elevation-* 声明在 body, body * 上，因此必须同样覆盖到 body *，\n   否则每个后代元素都会用自身声明盖掉从 body 继承下来的值。 */html[data-codex-ui] body,html[data-codex-ui] body *{\n  --dsw-elevation-stroke-color: rgba(13, 13, 13, 0.08);\n  --dsw-elevation-stroke: 0 0 0 0.5px rgba(13, 13, 13, 0.08);\n  --dsw-elevation-panel: var(--dsw-elevation-stroke);\n  --dsw-elevation-prominent: var(--dsw-elevation-stroke), 0 4px 16px rgba(13, 13, 13, 0.08);\n  --dsw-elevation-soft: var(--dsw-elevation-stroke), 0 8px 28px rgba(13, 13, 13, 0.1);\n}html[data-codex-ui] body[data-ds-dark-theme],html[data-codex-ui] body[data-ds-dark-theme] *{\n  --dsw-elevation-stroke-color: rgba(255, 255, 255, 0.09);\n  --dsw-elevation-stroke: 0 0 0 0.5px rgba(255, 255, 255, 0.09);\n  --dsw-elevation-panel: var(--dsw-elevation-stroke);\n  --dsw-elevation-prominent: var(--dsw-elevation-stroke), 0 4px 16px rgba(0, 0, 0, 0.5);\n  --dsw-elevation-soft: var(--dsw-elevation-stroke), 0 8px 28px rgba(0, 0, 0, 0.55);\n}\n\n/* ── 排版层：标题字重 600 封顶 ───────────────────────────────────────────── */\n/* 官方 markdown 标题是 700；Codex 无衬线无重标题，层级靠灰阶 + 字号。\n   官方把字排令牌声明在 body 上，故同样写在 body 上（字号仍挂\n   --dsh-content-font-delta，用户调字号不破比例）。 */html[data-codex-ui],html[data-codex-ui] body{\n  --dsw-font-markdown-h1: 600 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h1-font-weight: 600;\n  --dsw-font-markdown-h2: 600 calc(19px + var(--dsh-content-font-delta)) / calc(28px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h2-font-weight: 600;\n  --dsw-font-markdown-h3: 600 calc(18px + var(--dsh-content-font-delta)) / calc(26px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h3-font-weight: 600;\n}html[data-codex-ui] body[data-ds-dark-theme]{\n  --dsw-font-markdown-h1: 600 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h1-font-weight: 600;\n  --dsw-font-markdown-h2: 600 calc(19px + var(--dsh-content-font-delta)) / calc(28px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h2-font-weight: 600;\n  --dsw-font-markdown-h3: 600 calc(18px + var(--dsh-content-font-delta)) / calc(26px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h3-font-weight: 600;\n}\n\n\n/* ==== L3 组件层（源：skins/codex-ink/patches.css）==== */\n/* ============================================================================\n   codex-ink（墨白终端）· L3 组件层契约\n   ----------------------------------------------------------------------------\n   治理目标（对应方案 §7）：\n     ① 卡片统一契约：纯描边 + 10px 圆角 + 近零阴影 + 16px padding；\n     ② 徽标/chip 统一 mono pill；\n     ③ 彩色白名单归一：插件自带调色板收敛到 state 三色 + 墨灰；\n     ④ hover = 背景升一档，禁自创投影；\n     ⑤ 焦点环、cursor、动效时长三条 a11y/交互底线。\n\n   锚点纪律：只使用 skin-center 语义属性契约\n   （data-dsh-surface / data-dsh-part / data-dsh-plugin / data-slot），\n   不使用 CSS-Modules 哈希类名（[class*=…]），以免触发加载器的\n   \"reliance on CSS-Modules hash class names\" 警告。\n   ========================================================================== */\n\n/* ── ① 焦点环：2px Codex 强调蓝 + 2px offset（-—color-border-focus，亮 #339cff / 暗 70%） ─ */html[data-codex-ui] :focus-visible{\n  outline: 2px solid var(--dsw-codex-focus);\n  outline-offset: 2px;\n}\n\n/* ── ② 链接 = 墨 + hover 下划线，不着色 ─────────────────────────────────── */html[data-codex-ui] a{\n  color: var(--dsw-alias-link);\n  text-decoration: none;\n  text-underline-offset: 2px;\n  text-decoration-thickness: 1px;\n}html[data-codex-ui] a:hover,html[data-codex-ui] a:focus-visible{\n  text-decoration: underline;\n}\n\n/* ── ③ 可点击元素：cursor + 100ms 干脆过渡 ──────────────────────────────── */html[data-codex-ui] button,html[data-codex-ui] a,html[data-codex-ui] summary,html[data-codex-ui] [role=\"button\"],html[data-codex-ui] [role=\"tab\"],html[data-codex-ui] [role=\"menuitem\"],html[data-codex-ui] [role=\"option\"]{\n  cursor: pointer;\n}html[data-codex-ui] button,html[data-codex-ui] a,html[data-codex-ui] summary,html[data-codex-ui] [role=\"button\"],html[data-codex-ui] [role=\"tab\"],html[data-codex-ui] [role=\"menuitem\"]{\n  transition:\n    background-color var(--dsw-motion-fast) var(--dsw-ease),\n    border-color var(--dsw-motion-fast) var(--dsw-ease),\n    color var(--dsw-motion-fast) var(--dsw-ease),\n    opacity var(--dsw-motion-fast) var(--dsw-ease),\n    box-shadow var(--dsw-motion-fast) var(--dsw-ease);\n}html[data-codex-ui] button:disabled,html[data-codex-ui] button[aria-disabled=\"true\"],html[data-codex-ui] [aria-disabled=\"true\"]{\n  cursor: not-allowed;\n  opacity: 0.45;\n}\n\n/* ── ④ 卡片统一契约：描边即层级 ─────────────────────────────────────────── */html[data-codex-ui] [data-slot=\"web-ui.plugin.item\"] > *,html[data-codex-ui] [data-dsh-part=\"card\"],html[data-codex-ui] [data-dsh-part=\"column\"],html[data-codex-ui] [data-dsh-part=\"status\"],html[data-codex-ui] [data-dsh-part=\"today-card\"],html[data-codex-ui] [data-dsh-part=\"balance-card\"],html[data-codex-ui] [data-dsh-part=\"trend-card\"],html[data-codex-ui] [data-dsh-part=\"plan-card\"],html[data-codex-ui] [data-dsh-part=\"bank-card\"]{\n  background: var(--dsw-alias-bg-layer-1);\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: var(--dsw-radius-m);\n  box-shadow: var(--dsw-elevation-panel);\n  padding: var(--dsw-space-4);\n}\n\n/* 弹层 / 模态：大圆角 + 一点点软影 */html[data-codex-ui] [role=\"dialog\"],html[data-codex-ui] [data-dsh-surface=\"overlay\"] [data-dsh-part=\"panel\"]{\n  border-radius: var(--dsw-radius-l);\n}\n\n/* ── ⑤ 徽标 / chip：统一 mono pill ──────────────────────────────────────── */html[data-codex-ui] [data-dsh-part=\"composer-chip\"],html[data-codex-ui] [data-dsh-part=\"chip\"],html[data-codex-ui] [data-dsh-part=\"ref\"],html[data-codex-ui] [data-dsh-part=\"tag-chip\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"]{\n  font-family: var(--dsw-font-meta);\n  font-size: var(--dsw-meta-size);\n  font-weight: var(--dsw-meta-weight);\n  letter-spacing: var(--dsw-meta-tracking-pill);\n  border-radius: var(--dsw-radius-pill);\n}\n\n/* ── ⑥ 彩色白名单归一：task-board 六档 tag tone 收敛到 state 三色 + 墨灰 ── */html[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"0\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"0\"]{\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n}html[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"1\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"1\"]{\n  background: var(--dsw-alias-state-success-tertiary);\n  color: var(--dsw-alias-state-success-primary);\n}html[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"2\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"2\"]{\n  background: var(--dsw-alias-state-warn-tertiary);\n  color: var(--dsw-alias-state-warn-primary);\n}html[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"3\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"3\"]{\n  background: var(--dsw-alias-state-error-tertiary);\n  color: var(--dsw-alias-state-error-primary);\n}html[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"4\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"4\"]{\n  background: var(--dsw-alias-state-business-tertiary);\n  color: var(--dsw-alias-label-primary);\n}html[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"5\"],html[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"5\"]{\n  background: var(--dsw-alias-bg-layer-3);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* ── ⑦ 侧栏：比主区深/浅一档的整面 ─────────────────────────────────────── */html[data-codex-ui] [data-dsh-surface=\"sidebar\"],html[data-codex-ui] [data-slot=\"sidebar.workspaces\"]{\n  background-color: var(--dsw-alias-bg-sidebar);\n}\n\n/* 侧栏行 hover = 背景升一档，无位移无阴影 */html[data-codex-ui] [data-dsh-part=\"sidebar-entry\"],html[data-codex-ui] [data-dsh-surface=\"sidebar\"] [role=\"button\"]{\n  border-radius: var(--dsw-radius-s);\n}\n\n/* ── ⑧ 输入区：工具不是主角，14px 圆角 + 纯描边 ────────────────────────── */html[data-codex-ui] [data-composer-card],html[data-codex-ui] [data-dsh-surface=\"composer\"] [data-dsh-part=\"composer-input\"]{\n  border-radius: var(--dsw-radius-l);\n}html[data-codex-ui] [data-composer-card]{\n  box-shadow: var(--dsw-elevation-panel);\n}html[data-codex-ui] [data-dsh-part=\"composer-input\"]{\n  font-family: var(--dsw-font-family);\n  line-height: var(--dsw-leading-base);\n}\n\n/* ── ⑨ 元信息 mono 化：token 数 / 模型名 / 时间戳 / 路径 / 快捷键 ───────── */html[data-codex-ui] [data-dsh-part=\"turn-tail\"],html[data-codex-ui] [data-dsh-part=\"queue-dock\"],html[data-codex-ui] [data-dsh-part=\"usage-chart\"],html[data-codex-ui] [data-dsh-part=\"voucher-preview\"]{\n  font-family: var(--dsw-font-meta);\n}\n\n/* 微标签：11px / 大写 / .08em —— 仅作用于纯拉丁元信息锚点 */html[data-codex-ui] [data-dsh-part=\"composer-chip\"]{\n  text-transform: uppercase;\n  letter-spacing: var(--dsw-meta-tracking);\n}\n\n/* ── ⑩ CJK 豁免：中文不做字距加宽、不做大写（:lang(zh) 选择器） ────────── */html[data-codex-ui] :lang(zh) [data-dsh-part=\"composer-chip\"],html[data-codex-ui] :lang(zh) [data-dsh-part=\"chip\"],html[data-codex-ui] :lang(zh) [data-dsh-part=\"ref\"],html[data-codex-ui] :lang(zh) [data-dsh-part=\"tag-chip\"],html[data-codex-ui] :lang(zh) [data-dsh-part=\"tag-badge\"]{\n  letter-spacing: 0;\n  text-transform: none;\n}\n\n/* ── ⑪ reduced-motion：瞬时终态 ─────────────────────────────────────────── */\n@media (prefers-reduced-motion: reduce) {html[data-codex-ui] *,html[data-codex-ui] *::before,html[data-codex-ui] *::after{\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n    scroll-behavior: auto !important;\n  }\n}\n\n/* ═══════════════════════════════════════════════════════════════════════════\n   ⑫ Codex 模型选择器（composer 模型位 conversation.input.model）\n   ---------------------------------------------------------------------------\n   形态对齐 MichengAI/dsh-codex-ui：\n     · 触发器 = 宿主原生形态（模型名 + 强度 + chevron），本层不重绘，\n       只把焦点环归一成一条细线。旧版藏 chevron、改 mono 字体、压 24px 高，\n       实测与仓库截图 conversation-light.png 的触发器不符，全部撤掉。\n     · 菜单面板 = 仓库 composer-tool-menus 的皮肤契约：不透明白 + 大圆角 +\n       软影 0 8px 32px + 1px 描边环；行 28px、内衬 4px 9px、圆角 8px、\n       hover 淡填充。旧版 TUI 编号行、页脚提示行、隐藏勾选列一并废弃。\n     · 选中行 = 淡填充 + 勾选图标；pending 行 = 行尾 StateDot 转圈。\n       旧版把行尾整列 display:none，点强度后转圈被藏、全列表又被全局\n       disabled 规则压到 45% 透明度 —— 点了像没反应，这就是「选择推理\n       强度时出现延迟」的全部成因。宿主 selectModel 的往返时长 CSS 改不了，\n       但反馈必须即时可见。\n   锚点纪律：触发器 data-slot；菜单 body > div[role=menu][aria-busy]\n   （菜单经 createPortal 挂 document.body；aria-busy 恒在，用于排除\n   primitives 的通用菜单）。不用 CSS-Modules 哈希类名。\n   ═══════════════════════════════════════════════════════════════════════════ */\n\n/* ── ⑫·1 触发器：只归一焦点环（官方 box-shadow 环 + 全局 2px outline → 1px 细线） ── */html[data-codex-ui] [data-slot=\"conversation.input.model\"] button:focus-visible{\n  outline: 1px solid var(--dsw-codex-focus);\n  outline-offset: 1px;\n  box-shadow: none;\n}\n\n/* ── ·2 菜单面板：不透明白 + 圆角 + 软影（仓库值 18px 圆角落到本层刻度 l=16；\n      影 0 8px 32px #0002 + 环 1px #0000000a）────────────────────────────── */html[data-codex-ui] body > div[role=\"menu\"][aria-busy]{\n  --dsw-menu-surface-fill: var(--dsw-alias-bg-layer-1);\n  --dsw-menu-backdrop-filter: none;\n  /* rc.1 的填充挂在菜单元素自身（specific-menu 半透明），rc.2 挂在\n     MenuSurface 的 material 子层 —— 两边都压成不透明白。 */\n  background: var(--dsw-alias-bg-layer-1);\n  padding: 5px;\n  border-radius: var(--dsw-radius-l);\n  box-shadow: 0 8px 32px rgba(13, 13, 13, 0.13), 0 0 0 1px rgba(13, 13, 13, 0.04);\n  color: var(--dsw-alias-label-primary);\n}html[data-codex-ui] body[data-ds-dark-theme] > div[role=\"menu\"][aria-busy]{\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(236, 236, 236, 0.05);\n}\n\n/* ── ⑫·3 行契约：根面板两 cell（模型 / 推理强度）与选项行共用 ────────────── */html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitem\"],html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]{\n  box-sizing: border-box;\n  min-height: 28px;\n  padding: 4px 9px;\n  gap: 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-s);\n  background: none;\n  color: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n}html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitem\"]:hover,html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]:hover:not(:disabled),html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"][aria-checked=\"true\"]{\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n/* 键盘焦点：全局 2px 环在菜单内不贴行盒，改 1px 内描线 */html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitem\"]:focus-visible,html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]:focus-visible{\n  outline: 1px solid var(--dsw-codex-focus);\n  outline-offset: -1px;\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n/* pending：全局 button:disabled 的 45% 透明度会把整列洗灰（看起来像卡住），\n   还原为 1，反馈交给行尾转圈 + 勾选；非当前行靠官方 dimmed 色区分 */html[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]:disabled{\n  opacity: 1;\n}\n\n/* pending 指示器：宿主在 aria-busy 窗口内把整列 disabled，但**不渲染任何转圈**。\n   2026-09-26 在真实 GUI（0.1.7-rc.x，headless Chromium 打 127.0.0.1:3099）实测：\n   点「推理等级」后第 60ms 菜单 aria-busy=true、6 行全 disabled、checked 已乐观\n   移到新值，而 document.getAnimations() 在菜单内为 0 —— 面板冻着不动约 1.1s 才关闭。\n   宿主 selectModel 的往返时长 CSS 改不了，能改的是这 1.1s 里必须看得见「在写」。\n   做法：pending 行行尾的勾选换成转圈（勾选已乐观前移，此处正好空出来），\n   并把 disabled 的 not-allowed 光标换成 progress。 */html[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"][aria-checked=\"true\"] > span:last-child{\n  position: relative;\n}html[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"][aria-checked=\"true\"] > span:last-child > svg{\n  visibility: hidden;\n}html[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"][aria-checked=\"true\"] > span:last-child::after{\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  box-sizing: border-box;\n  width: 12px;\n  height: 12px;\n  margin: auto;\n  border: 1.5px solid var(--dsw-alias-border-l3);\n  border-top-color: var(--dsw-alias-label-primary);\n  border-radius: 50%;\n  /* Codex --animate-spin = spin 1s linear infinite（本插件保留自己的 keyframe 名）。 */\n  animation: codex-ui-spin 1s linear infinite;\n}html[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"]:disabled{\n  cursor: progress;\n}\n\n@keyframes codex-ui-spin {\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n/* ═══════════════════════════════════════════════════════════════════════════\n   ⑬ Codex 式输入区（圆角 / 阴影 / 顶栏消隐 / 面板按钮图标）\n   ---------------------------------------------------------------------------\n   参考图 assets/reference/codex-composer-reference.png（1208×263）实测：\n     · 页面底 #ffffff；卡片填充 #ffffff\n     · 卡片下沿阴影 ≈ #fbfbfb（极淡、宽而散）；卡片左描边 ≈ #e1e1e1 发丝线\n     · 卡片上栏（PROJECT 条）填充 #f5f5f5，顶圆角、左右各内缩 ≈24px\n     · 卡片圆角：白底白卡无法逐像素定值，按角弧轮廓落在 24–28px，取下沿 24px\n   ═══════════════════════════════════════════════════════════════════════════ */\n\n/* ⑬·1 输入卡：几何与表面已移交 ⑭ 层（skins/codex-ink/composer.css）。\n   那一层从 MichengAI/dsh-codex-ui 原样移植：20px 圆角（corner-shape 可用时 25px 超椭圆）、\n   无边框、三层极淡投影；选择器优先级与层序都在本条之上，故此处不再重复声明，避免双真源。\n   旧值留档：24px 圆角 / 1px border-l1 / 0 1px 2px + 0 14px 36px。 */\n\n/* ⑬·2 输入卡上方的 Codex 条（文件/工作区选择栏）形态契约\n   seat: conversation.input.dock（「Full-width entries above the composer card」）。\n   内容由客户端插件填入并打 [data-codex-filebar] 标记——只按标记上形，\n   避免把既有 QueueDock / TodoDock / GoalDock 也画成灰条。 */html[data-codex-ui] [data-codex-filebar]{\n  box-sizing: border-box;\n  width: calc(100% - 48px);\n  margin: 0 auto -12px;\n  padding: 8px 16px 22px;\n  border-radius: var(--dsw-radius-l) var(--dsw-radius-l) 0 0;\n  background: #f5f5f5;\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--dsw-font-meta);\n  font-size: 12px;\n  line-height: 20px;\n}html[data-codex-ui] body[data-ds-dark-theme] [data-codex-filebar]{\n  background: #262626;\n}\n\n/* ⑬·3 顶栏瘦身：分割线上只留会话名 + 右上角按钮\n   官方 ConversationSessionHeader 的真实结构（rc1，读 dsh-client-ui-conversation 的 JSX）：\n     div.titleRow\n       ├ div.titleCluster\n       │   ├ nav.crumbs          ← 会话名（crumbSeg / crumbCurrent），保留\n       │   └ div.headerActions   ← renderSlot(\"conversation.session.header.actions\")：预设徽标 / 任务列表，隐去\n       ├ div.headerUtilities     ← renderSlot(\"...utilities\")，隐去\n       └ div.headerCorner[data-conversation-header-corner] ← 右栏展开按钮 / 会话日志，保留\n     div.tabs[role=tablist][data-conversation-tabs]   ← 视图页签，隐去\n   titleRow 的官方布局是 titleCluster（flex:1）+ utilities + corner，\n   故去掉旧版的 justify-content:flex-end —— 标题要留在左边。\n\n   ⚠ 本注释块里**不能出现花括号**（左右都不行）：scripts/install-plugin.mjs 的\n   scopeCss 是按「下一个左花括号」做括号配对的，注释里混进一个花括号就会把\n   后面的规则整段错位 —— 实测表现为紧随其后的规则被重复加 html[data-codex-ui]\n   前缀而失效、整份 theme.css 花括号数不平衡。所以注释里只写行式记法。 */\n/* ⑬·3c 顶栏两格**放开**（0.3.0）：槽出口里的条目恢复渲染。\n   0.2.x 为了对齐参考图「只留会话名 + 右上角按钮」，这里把两格的槽出口内容整块 display:none。\n   代价是派出去的子代理在界面上完全看不见在跑：官方子代理包把「后代数量触发器」注册在\n   conversation.session.header.actions（id subagent-catalog，order -30），同一格还有\n   jobs 的 roster、预设徽标、在应用中打开 —— 一起被关掉了。\n   现在放开。这些条目**本身都是条件渲染**（没有子代理 / 没有 job / 没有预设 / 没有工作目录时\n   各自返回 null），所以常态顶栏仍旧是「会话名 + 右上角按钮」，只有真有东西时才多出条目。\n   配色不动：条目只用 --dsw-* 语义令牌（--dsw-alias-label-tertiary、--dsw-alias-interactive-bg-hover、\n   --dsw-alias-border-l4 …），本皮肤已重锚这些令牌，因此跟着现在的配色走，不需要另配一套色。\n   出口恒为 div[data-slot=槽名][style=display:contents]，不需要也不应该改出口本身。\n   ⚠ 本部注释里不能出现花括号（install-plugin.mjs 的 scopeCss 按花括号配对）。 */html[data-codex-ui] [data-slot=\"conversation.session.header\"] > [data-conversation-tabs]{\n  display: none;\n}\n\n/* ⑬·3b 顶栏**真正**瘦身：把被隐藏页签仍占着的那条 min-height 收掉。\n   官方规则 .wSkVaW_header:where(:not(:has(.wSkVaW_tabs))) 用 :has() 判断有没有页签，\n   但 :has() 只看元素树、**不看 display** —— 上面那条 display:none 之后 .tabs 还在树里，\n   于是 min-height:76px 与 padding-bottom:0 一直生效：页签没了，76px 空带还在，\n   分割线被顶到空带下方，看起来就是\"上方空了一大块 / 分割线太高\"。\n   这里按同一语义手动补上。header 元素本身没有 data-*，用它内部稳定的子锚点 :has 定位\n   （data-conversation-header-leading，见 dsh-client-ui-conversation/lib/client.js:16223）。\n   必须再带 :has([data-conversation-tabs])：hero/空白态下 showTabs=false，页签根本不渲染，\n   官方 .wSkVaW_headerBlank 给的 min-height:0 与 padding-bottom:0 才是对的；\n   不带这个条件会反过来给空白顶栏塞 10px 下内边距（实测踩到过）。 */html[data-codex-ui] header:has([data-conversation-header-leading]):has([data-conversation-tabs]){\n  min-height: 0;\n  padding-bottom: 10px;\n}\n\n/* ⑬·6 「新会话」：参考图里 New chat 是**无边框行**（图标 + 文字，hover 浅填充），\n   DSH 默认是带描边的整宽按钮 → 去掉描边与底色，改成行。\n   锚点 data-dsh-part=\"new-session\" 由 skin-center 兼容适配器补打（不依赖本地化文案）。 */html[data-codex-ui] [data-dsh-part=\"new-session\"]{\n  border: 0;\n  background: transparent;\n  box-shadow: none;\n  border-radius: var(--dsw-radius-s);\n  justify-content: flex-start;\n  color: var(--dsw-alias-label-primary);\n}html[data-codex-ui] [data-dsh-part=\"new-session\"]:hover{\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* ⑬·5 卡下方统计行（DSH 独有：轮数/步数 · tok/s · 缓存命中）——参考图没有这一行。\n   要恢复：把下面这条注释掉即可。 */html[data-codex-ui] [data-slot=\"conversation.composer.dock\"]{\n  display: none;\n}\n\n/* ⑬·4 右上角面板按钮：**用官方图标**，不再手绘。\n   旧版把官方 svg display:none 掉、用纯 CSS 画了个「圆角方框 + 竖分割线」——\n   1.2px 描边配 16px 图标的视觉重量对不上，比官方图标糙。\n   查了 MichengAI/dsh-codex-ui：**它也没换这个图标**。它只做两件事\n   （src/client/conversation-header.ts:26）：\n     ① 归零角落插槽的边距补偿 —— 官方 .headerCorner 是 margin-left:8px + margin-right:-16px，\n        配合 header 的 padding-right:28px 把按钮顶到距右 12px；归零后回到 28px 内缩。\n     ② 用 order 重排，绝不物理搬移 React 节点（搬了会 NotFoundError 白屏）。\n   所以这里：撤掉手绘方框、恢复官方 svg，只补两点 —— 位置归零 + 展开态也镜像成 panel-right。\n\n   为什么镜像：官方展开按钮用**未镜像**的 IconPanelLeftOutlineRegular，收起按钮用\n   collapseGlyph 的 scaleX(-1) 镜像版 —— 同一块面板的两个状态图标朝向不一致。\n   参考图 assets/reference/codex-app-reference.png 右上角是 panel-right，故把展开态也镜像过来。\n   锚点 data-sidebar-right-expand 见 dsh-client-ui-sidebar-right 的 ExpandButton。 */html[data-codex-ui] [data-conversation-header-corner]{\n  margin-left: 0;\n  margin-right: 0;\n}html[data-codex-ui] [data-sidebar-right-expand] svg{\n  transform: scaleX(-1);\n}\n\n/* ═══════════════════════════════════════════════════════════════════════════\n   ⑮ 侧栏开合动效参数（对齐 Codex 手感）\n   ---------------------------------------------------------------------------\n   宿主本来就animate：AppFrame 是 grid-template-columns: 侧栏 / 1fr / 右栏，\n   开合时给 frame 打 [data-animating]，grid-template-columns 的 transitionend 到了\n   才摘掉（dsh-client-ui-layout/lib/client.js:270-298）。\n   默认参数 --ds-transition-duration-slow = .3s、--ds-ease-in-out = cubic-bezier(.4,0,.2,1)。\n   Codex 实测手感是 500ms + expo-out（MichengAI/dsh-codex-ui 用同值），这里换掉。\n   锚点全用稳定 data 属性：data-animating / data-dragging / data-side。\n   ⚠ 不要用 [class*=…]：frame 的类名是 CSS-Modules 哈希，随构建变。\n   ═══════════════════════════════════════════════════════════════════════════ */\n/* 只改**参数**，不改宿主\"关掉动画\"的开关。宿主有四个状态要求 transition:none：\n   data-dragging（拖拽中，逐帧跟随指针）、data-rightbar-instant（右栏退出全屏，瞬时）、\n   data-rightbar-fullscreen、以及 reduced-motion。\n   注意本层被作用域化成 html[data-codex-ui] [data-animating] = (0,2,1)，\n   会**盖过**宿主的 .pI_x6G_frame[data-rightbar-instant] = (0,2,0) —— 所以必须显式还回去，\n   否则右栏退出全屏会被强行加上动画（实测踩到过）。 */html[data-codex-ui] [data-animating]{\n  transition: grid-template-columns 500ms cubic-bezier(.16, 1, .3, 1);\n}\n\n/* 两侧拖拽柄都要覆盖：只写 [data-side=\"sidebar\"] 会让右栏柄停在宿主的 .3s，\n   与 frame 的 500ms 脱同步（柄和面板各走各的）。 */html[data-codex-ui] [data-animating] [data-side]{\n  transition: left 500ms cubic-bezier(.16, 1, .3, 1);\n}html[data-codex-ui] [data-dragging],html[data-codex-ui] [data-rightbar-instant],html[data-codex-ui] [data-rightbar-fullscreen],html[data-codex-ui] [data-dragging] [data-side],html[data-codex-ui] [data-rightbar-instant] [data-side],html[data-codex-ui] [data-rightbar-fullscreen] [data-side]{\n  transition: none;\n}\n\n@media (prefers-reduced-motion: reduce) {html[data-codex-ui] [data-animating],html[data-codex-ui] [data-animating] [data-side]{\n    transition: none;\n  }\n}\n\n/* ═══════════════════════════════════════════════════════════════════════════\n   ⑯ 右栏「展开时选择组件」= 空栏 guide（对齐 Codex 右栏展开参考图实测）\n   ---------------------------------------------------------------------------\n   参考图实测（488×1120，DPR=1，侧栏面板宽 474）：\n     · 条目行：宽 380 居中、行高 52、行距 14（pitch 66）、无描边无底色、圆角 12\n     · 图标列 20×20（条目左沿内缩 20），图标 ↔ 文字 gap 14\n     · 标题 14px 单行；参考图没有描述行\n     · 快捷键：右侧灰底 pill，68×24、圆角 12、底 ≈ #f3f3f4、字 12px 辅墨\n     · 无罗盘 hero；内容块真·垂直居中（宿主底部 10% 占位要去掉）\n   锚点：data-sidebar-right-guide / data-sidebar-right-guide-entry（官方稳定\n   属性），行内结构用位置伪类 + :has(kbd)，不用哈希类名。\n   ═══════════════════════════════════════════════════════════════════════════ */\n\n/* 罗盘 hero：参考图无 */html[data-codex-ui] [data-sidebar-right-guide] > span[aria-hidden=\"true\"]{\n  display: none;\n}\n\n/* 底部 10% 占位 → 真居中 */html[data-codex-ui] [data-sidebar-right-guide]::after{\n  display: none;\n}\n\n/* 条目：胶囊 → 平行 */html[data-codex-ui] [data-sidebar-right-guide-entry]{\n  box-sizing: border-box;\n  width: 380px;\n  max-width: 100%;\n  min-height: 52px;\n  gap: 14px;\n  padding: 0 20px;\n  border: 0;\n  border-radius: var(--dsw-radius-m);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n}html[data-codex-ui] [data-sidebar-right-guide-entry]:hover{\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* 图标列 20×20（宿主按有无描述画 22/26，拉回参考值） */html[data-codex-ui] [data-sidebar-right-guide-entry] > span:first-child{\n  width: 20px;\n  height: 20px;\n}html[data-codex-ui] [data-sidebar-right-guide-entry] > span:first-child svg{\n  width: 20px;\n  height: 20px;\n}html[data-codex-ui] [data-sidebar-right-guide-entry] > span:nth-child(2){\n  gap: 0;\n}\n\n/* 描述行：仅当它存在时隐藏（nth-child(2) 不存在即标题独占） */html[data-codex-ui] [data-sidebar-right-guide-entry] > span:nth-child(2) > span:nth-child(2){\n  display: none;\n}\n\n/* 终端行是 terminal 插件注册的自定义卡（TerminalGuide），不是标准卡：\n   子序为 button.main（absolute 点击层）→ span.icon → span.text → keys，\n   上面按标准卡子序写的图标/描述规则对它全部落空，按 kind 属性另点。\n   标题旁的 chevron 是选 Shell 菜单入口，功能件保留。 */html[data-codex-ui] [data-sidebar-right-guide-entry=\"terminal\"] > span:nth-child(2){\n  width: 20px;\n  height: 20px;\n}html[data-codex-ui] [data-sidebar-right-guide-entry=\"terminal\"] > span:nth-child(2) svg{\n  width: 20px;\n  height: 20px;\n}html[data-codex-ui] [data-sidebar-right-guide-entry=\"terminal\"] > span:nth-child(3) > span:nth-child(2){\n  display: none;\n}\n\n/* 快捷键 → 灰底 pill（宿主 plain 变体是无底文字键） */html[data-codex-ui] [data-sidebar-right-guide-entry] > span:has(kbd){\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  gap: 3px;\n  height: 24px;\n  padding: 0 10px;\n  border-radius: var(--dsw-radius-m);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 16px;\n  white-space: nowrap;\n}html[data-codex-ui] [data-sidebar-right-guide-entry] kbd{\n  display: inline;\n  min-width: 0;\n  padding: 0;\n  border: 0;\n  border-radius: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n}\n\n/* 收起按钮（▢）：参考图常驻灰底圆方（参考 42px，受页签条行高限制取 28，\n   形态对齐、尺寸如实记录） */html[data-codex-ui] [data-sidebar-right-toggle]{\n  background: var(--dsw-alias-bg-layer-2);\n  border-radius: var(--dsw-radius-m);\n}\n\n/* ═══════════════════════════════════════════════════════════════════════════\n   ⑰ composer 底部控件：默认无框，悬停整块淡底\n   ---------------------------------------------------------------------------\n   需求：Codex 的加号控件默认**没有**背景框，只有鼠标悬停才出现；\n   模型选择器与权限控件照它的悬停形态复刻。\n   参考图 assets/reference/codex-composer-plus.png（65×84）与 codex-composer-chip-hover.png（144×58）：\n\n     · 加号：40px 直径圆形，悬停时才填 --dsw-codex-hover-fill（实测 #F2F2F3）。\n     · 悬停胶囊：整块填充 242,242,243，**没有描边**（逐像素量了外沿：白 255 → 243 → 242，\n       没有更深的环）；左右弧顶到弧顶 41px，全圆角。\n\n   锚点：加号按钮没有 data-* 只有哈希类名，按 composer.css 已备案的「后缀锚点」写法取\n   button[class$=\"_add\"]；两个触发器（模型 _7KE1Ra_trigger / 权限 iWlSmW_trigger）\n   同样按后缀取 button[class$=\"_trigger\"]，整条规则限定在 [data-composer-card] 内。\n   实测（真 GUI，2026-09-26）：加号 idle 与 hover 同为 rgb(241,241,239) —— 常驻灰底，\n   就是「多了个背景框」；两个触发器 idle 透明、hover rgba(13,13,13,.04)，与参考图同形。\n   ═══════════════════════════════════════════════════════════════════════════ */html[data-codex-ui] [data-composer-card] button[class$=\"_add\"],html[data-codex-ui] [data-composer-card] button[class$=\"_trigger\"]{\n  transition: background-color var(--dsw-motion-fast) var(--dsw-ease);\n}\n\n/* 加号：撤掉宿主常驻的 --dsw-alias-bg-layer-2 灰底 */html[data-codex-ui] [data-composer-card] button[class$=\"_add\"]{\n  background: transparent;\n}html[data-codex-ui] [data-composer-card] button[class$=\"_add\"]:hover,html[data-codex-ui] [data-composer-card] button[class$=\"_add\"][aria-expanded=\"true\"],html[data-codex-ui] [data-composer-card] button[class$=\"_trigger\"]:hover,html[data-codex-ui] [data-composer-card] button[class$=\"_trigger\"][aria-expanded=\"true\"]{\n  background: var(--dsw-codex-hover-fill);\n}\n\n\n\n/* ==== L3 模型选择器组件（源：skins/codex-ink/model-picker.css）==== */\n/* ============================================================================\n   codex-ink（墨白终端）· L3 模型选择器组件\n   ----------------------------------------------------------------------------\n   源文件：skins/codex-ink/model-picker.css\n   消费者：src/model-picker.js（自己的 DOM，不是宿主的菜单）。\n   由 scripts/build.mjs 与其余层一起拼接，并作用域化到 html[data-codex-ui]。\n\n   这一层只画**我们自己建的节点**（.codex-mp-*）与宿主触发器的一个隐藏开关，\n   不碰宿主的菜单 —— 0.5.0 就是因为把选择器挂在 body > div[role=menu] 上才卡顿的。\n\n   ── Codex 侧的几何来源（codex-model-picker.css / codex-app-initial.css）────────\n   为免触发 scopeCss 的括号解析，注释里一律不写花括号：\n\n     _Container     高 32 padding-block 2 padding-inline 6 与内容同宽\n     _Root          高 28 flex 居中 position relative\n     _Track         高 24 圆角 12 前景色 10% 填充 inset 0 0 0 .5px 描边\n     _Range         强调色 width 由脚本给 圆角 12 0 0 12\n     _Tick          4px 圆点 未选中 description-foreground 50% 选中 白 30%\n     _Thumb         28px 白圆片 .5px border-heavy 加 0 0 2px #0000001a\n     _ThumbInput    focus 时不吃宿主的两圈 box-shadow，环画在拇指上\n     行程           left 从 14px 走到 轨道宽 - 14px（见 src/model-picker.js 的 tickOffset）\n     时长           0.3s cubic-bezier(.23, 1, .32, 1)；拖动中为 0s（脚本置 --codex-mp-motion）\n\n   弹层的圆角、描边环与软影沿用 ⑫ 那套皮肤契约（与模型菜单同一副面孔）。\n   ============================================================================ */\n\n\n/* ── ① 宿主触发器让位 ────────────────────────────────────────────────────\n   宿主触发器仍在 React 树里（不碰它的生命周期），只是看不见；\n   关掉设置卡里的开关时 src/model-picker.js 会把属性摘掉，外观立刻复原。 */html[data-codex-ui] [data-codex-ui-model-host]{\n  display: none;\n}\n\n\n/* ── ② 触发器：三段（模型名 / 档位名 / chevron），28px ─────────────────── */html[data-codex-ui] .codex-mp-trigger{\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  height: 28px;\n  min-width: 0;\n  max-width: min(360px, 45cqw);\n  padding: 0 4px 0 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-s);\n  background: none;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  font-weight: 400;\n  line-height: 20px;\n  cursor: pointer;\n}html[data-codex-ui] .codex-mp-trigger:hover{\n  background: var(--dsw-alias-interactive-bg-hover);\n}html[data-codex-ui] .codex-mp-trigger:focus-visible{\n  outline: 1px solid var(--dsw-codex-focus);\n  outline-offset: 1px;\n  box-shadow: none;\n}html[data-codex-ui] .codex-mp-trigger-model{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}html[data-codex-ui] .codex-mp-trigger-effort{\n  flex-shrink: 1000;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  color: var(--dsw-alias-label-caption);\n}html[data-codex-ui] .codex-mp-trigger-effort[data-hidden]{\n  display: none;\n}html[data-codex-ui] .codex-mp-trigger-chevron{\n  flex: none;\n  display: inline-flex;\n  color: var(--dsw-alias-label-caption);\n}\n\n\n/* ── ③ 弹层：一张卡片，列表在上、功率轨固定在底 ─────────────────────────── */html[data-codex-ui] .codex-mp-popover{\n  position: fixed;\n  z-index: 1100;\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  width: max-content;\n  min-width: min(260px, 100vw - 32px);\n  max-width: min(420px, 100vw - 32px);\n  max-height: min(360px, 100vh - 96px);\n  padding: 4px;\n  border-radius: var(--dsw-radius-l);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: 0 8px 32px rgba(13, 13, 13, 0.13), 0 0 0 1px rgba(13, 13, 13, 0.04);\n}html[data-codex-ui] body[data-ds-dark-theme] .codex-mp-popover{\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(236, 236, 236, 0.05);\n}html[data-codex-ui] .codex-mp-popover[data-open=\"false\"]{\n  display: none;\n}html[data-codex-ui] .codex-mp-list{\n  min-height: 0;\n  overflow-y: auto;\n  padding: 2px;\n}html[data-codex-ui] .codex-mp-status{\n  padding: 8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n}html[data-codex-ui] .codex-mp-group{\n  padding: 4px 7px 2px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-weight: 500;\n  line-height: 16px;\n}html[data-codex-ui] .codex-mp-group:not(:first-child){\n  margin-top: 3px;\n}html[data-codex-ui] .codex-mp-row{\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: 100%;\n  min-height: 34px;\n  padding: 5px 7px;\n  border: 0;\n  border-radius: var(--dsw-radius-md);\n  background: none;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n}html[data-codex-ui] .codex-mp-row:hover,html[data-codex-ui] .codex-mp-row:focus-visible{\n  background: var(--dsw-alias-interactive-bg-hover);\n  outline: none;\n}html[data-codex-ui] .codex-mp-row-copy{\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n}html[data-codex-ui] .codex-mp-row-name{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 18px;\n}html[data-codex-ui] .codex-mp-row-desc{\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 15px;\n}html[data-codex-ui] .codex-mp-row-check{\n  display: grid;\n  place-items: center;\n  flex: 0 0 14px;\n  color: var(--dsw-alias-label-primary);\n}\n\n\n/* ── ④ 功率轨：Codex _Container / _Track / _Range / _Tick / _Thumb ─────── */html[data-codex-ui] .codex-mp-foot{\n  flex: none;\n  padding: 2px 6px;\n  border-top: 1px solid var(--dsw-alias-border-l4);\n  margin-top: 2px;\n}html[data-codex-ui] .codex-mp-foot:has(.codex-mp-rail[data-empty=\"true\"]){\n  display: none;\n}html[data-codex-ui] .codex-mp-rail{\n  position: relative;\n  box-sizing: border-box;\n  height: 24px;\n  margin: 6px 0;\n  border-radius: 12px;\n  background: var(--dsw-alias-interactive-bg-active);\n  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l3);\n  touch-action: none;\n  cursor: pointer;\n  --codex-mp-motion: 0.3s;\n}html[data-codex-ui] .codex-mp-rail[data-dragging]{\n  cursor: grabbing;\n}html[data-codex-ui] .codex-mp-rail:focus-visible{\n  outline: none;\n}html[data-codex-ui] .codex-mp-rail:focus-visible .codex-mp-rail-thumb{\n  outline: 2px solid var(--dsw-codex-focus);\n}html[data-codex-ui] .codex-mp-rail-range{\n  position: absolute;\n  top: 0;\n  left: 0;\n  height: 100%;\n  border-radius: 12px 0 0 12px;\n  background: var(--dsw-alias-link);\n  pointer-events: none;\n  transition: width var(--codex-mp-motion) cubic-bezier(.23, 1, .32, 1);\n}html[data-codex-ui] .codex-mp-rail-thumb{\n  position: absolute;\n  top: 50%;\n  box-sizing: border-box;\n  width: 28px;\n  height: 28px;\n  margin: -14px 0 0 -14px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: 50%;\n  background: #fff;\n  box-shadow: 0 0 2px rgba(0, 0, 0, 0.1);\n  pointer-events: none;\n  transition: left var(--codex-mp-motion) cubic-bezier(.23, 1, .32, 1);\n}html[data-codex-ui] .codex-mp-tick{\n  position: absolute;\n  top: 50%;\n  box-sizing: border-box;\n  width: 4px;\n  height: 4px;\n  margin: -2px 0 0 -2px;\n  padding: 0;\n  border: 0;\n  border-radius: 50%;\n  background: var(--dsw-alias-label-caption);\n  cursor: pointer;\n}html[data-codex-ui] .codex-mp-tick[data-selected=\"true\"]{\n  background: rgba(255, 255, 255, 0.3);\n}html[data-codex-ui] .codex-mp-tick:hover{\n  filter: brightness(0.85);\n  transform: scale(2);\n}\n\n/* 命中区：4px 的点本身太小，Codex 用 _Tick 的 ::before 扩 6px，这里照做。 */html[data-codex-ui] .codex-mp-tick::before{\n  content: \"\";\n  position: absolute;\n  inset: -6px;\n}\n\n\n/* ==== L3 侧栏对齐层（源：skins/codex-ink/sidebar-align.css）==== */\n/* ============================================================================\n   codex-ink（墨白终端）· L3 侧栏对齐层\n   ----------------------------------------------------------------------------\n   源文件：skins/codex-ink/sidebar-align.css\n   由 scripts/install-plugin.mjs 与 skin.css / patches.css 一起拼接，并作用域化到\n   html[data-codex-ui]。因此本文件写「裸选择器」——不要自己再加 html[...] 前缀，\n   那会被 scopeCss 判为已作用域而直通，永不命中。\n\n   目标（三条，不多做）：\n     ① 品牌行 —— 完全不动。保留官方 fish 标与名称，不注册 sidebar.brand.* 洞。\n     ② New Session 行 —— 压成列表行，图标/文字落到「工作区」下方列表行的两条竖线上。\n     ③ 全局面板行（插件…）—— 同一组竖线。\n\n   目标列（相对侧栏根 div 左边缘，实测值见 scripts/sidebar-align-verify.mjs）：\n     图标列 20px = 列表行左边缘 12px + padding-inline-start 8px\n     文字列 42px = 20px + 图标 16px + gap 6px\n   对照：工作区行（projectRow）实测 20 / 42，会话行（sessionRow）实测 20 / 40。\n\n   锚点纪律（遵守 patches.css 头部的约定）：\n     本层只用 skin-center 语义契约 data-slot + 结构伪类，\n     不使用 CSS-Modules 哈希类名，不触发\n     \"reliance on CSS-Modules hash class names\" 警告。\n\n     官方侧栏的 New Session 按钮不是 slot 内容，没有 data-slot 可挂；\n     但 Tooltip 只克隆锚点、不加包装元素，故它仍是侧栏根 div 唯一的直接\n     button 子元素，用\n         div:has([data-slot=\"sidebar.workspaces\"]) > button\n     定位。折叠态用 sidebar.toggle.badge 出口的存在与否排除 ——\n     官方只在 !wide（折叠）时才 renderSlot 该出口。\n\n   官方真实值（rc1 0.1.7-rc.1，取自 dsh-client-ui-sidebar 内联 css）。\n   为免触发 scopeCss 的括号解析，这里用行式记法，不写花括号：\n\n     _newSession        高度 height:38px\n                        边框 .5px solid var(--dsw-alias-border-l3)\n                        底色 var(--dsw-alias-button-elevated-fill)\n                        对齐 justify-content:center\n                        gap 6px ／ margin 0 2px 12px ／ padding 8px 16px\n                        字体 14px / 500 ／ line-height 22px\n     _newSession:hover  底色 var(--dsw-alias-button-floating-hover)\n     _newSessionLabel   white-space:nowrap ／ max-width:200px ／ overflow:hidden\n\n     _panelRow          box-sizing:border-box ／ min-height:36px\n                        底色 0 0 ／ 边框 none ／ 圆角 12px\n                        对齐 justify-content 未设（即 flex-start）\n                        gap 8px ／ margin 0 2px ／ padding 7px 8px\n                        字体 font:inherit ／ line-height:22px ／ text-align:left\n     _panelRow:hover    底色 var(--dsw-alias-interactive-bg-hover)\n     _panelRow:focus-visible  2px solid var(--dsw-alias-label-primary)，offset -2px\n     _panelTitle        text-overflow:ellipsis ／ white-space:nowrap\n                        min-width:0 ／ overflow:hidden\n     _panelList         flex-direction:column ／ gap:4px ／ margin-bottom:8px\n   ============================================================================ */\n\n\n/* ── ① 品牌行：刻意留空 ──────────────────────────────────────────────────\n   官方 logoRow / brandIdentity / brandMark / brandName / fallbackBrandName\n   全部原样生效。本层不写任何相关规则。 */\n\n\n/* ── ② New Session → 压成列表行，落到「工作区」下方列表行的两条竖线 ────────\n   展开态判定：侧栏根 div 含 sidebar.workspaces 出口，\n   且不含 sidebar.toggle.badge 出口。\n\n   官方 New Session 是 38px 居中主按钮：margin 0 2px 12px / padding 8px 12px /\n   justify-content:center，图标停在中线（实测 108px），与列表行差 88px。 */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button{\n  box-sizing: border-box;\n\n  /* 高度：38px → min-height:36px */\n  height: auto;\n  min-height: 36px;\n  flex: none;\n\n  /* 外观：主按钮 → 列表行 */\n  background: 0 0;\n  border: none;\n  border-radius: var(--dsw-radius-s);\n\n  /* 排版：居中主按钮 → 左对齐列表行 */\n  justify-content: flex-start;\n  align-items: center;\n  gap: 6px;\n  /* 左边距归零：行左边缘与列表行同为 12px，图标才落到 20px。\n     桌面壳（html[data-windows-titlebar]）官方自己也写 margin-left:0，那条\n     (0,4,0) 比本层 (0,3,3) 更高 —— 桌面端本来就吃到 0。这里显式写 0，\n     让 web profile（无 titlebar）与桌面端落到同一条竖线上。 */\n  margin: 0 2px 4px 0;\n  padding: 7px 8px;\n  font: inherit;\n  line-height: 22px;\n  text-align: left;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  overflow: hidden;\n}html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button:hover{\n  background: var(--dsw-alias-interactive-bg-hover);\n}html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button:focus-visible{\n  outline: 2px solid var(--dsw-codex-focus);\n  outline-offset: -2px;\n}\n\n/* 图标：官方 newSession 用 14px，panelGlyph 用 16px → 统一 16px（rc.1 扁平结构） */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button > svg{\n  width: 16px;\n  height: 16px;\n  flex: none;\n}\n\n/* 标签：官方只设了 max-width:200px → 补齐 panelTitle 的省略行为（rc.1 扁平结构） */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button > span{\n  max-width: none;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n\n/* ── ②·b New Session · rc.2 嵌套结构 ─────────────────────────────────────\n   0.1.7-rc.2（桌面壳在跑的那一代）在按钮里又套了两层：\n     button > span(newSessionLabelMask) > span(newSessionContent) > svg + span(newSessionLabel)\n   官方在 newSessionContent 上写死 width:100cqw + justify-content:center，\n   并把按钮设成 container-type:inline-size —— 于是只把 button 改成 flex-start\n   压不住它，图标仍旧停在按钮中线。这里把这一层拉回左对齐。 */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button > span > span:has(> svg){\n  justify-content: flex-start;\n  width: auto;\n}\n\n/* 图标（rc.2 嵌在内容容器里，与 rc.1 同一条 16px 契约） */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button > span > span > svg{\n  width: 16px;\n  height: 16px;\n  flex: none;\n}\n\n/* 标签（rc.2 又深一层；span.keys 的键帽是 kbd，不会命中这条） */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > button > span > span > span{\n  max-width: none;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n\n/* ── ③ 全局面板行（插件…）→ 同两条竖线 ───────────────────────────────────\n   侧栏根 div 的直接 nav 子元素就是 panelList；它的每个直接 button 是一行面板。\n   官方 panelRow 是 margin:0 2px / padding:7px 8px / gap:8px\n   → 图标 22px、文字 46px，比列表行右移 2px / 4px。 */html[data-codex-ui] div:has([data-slot=\"sidebar.workspaces\"]):not(:has([data-slot=\"sidebar.toggle.badge\"])) > nav > button{\n  gap: 6px;\n  margin-left: 0;\n}\n\n\n/* ==== L3 侧栏面层（源：skins/codex-ink/sidebar-surface.css）==== */\n/* ============================================================================\n   codex-ink（墨白终端）· L3 侧栏面层\n   ----------------------------------------------------------------------------\n   源文件：skins/codex-ink/sidebar-surface.css\n   由 scripts/build.mjs 与 skin.css / patches.css 一起拼接，并作用域化到\n   html[data-codex-ui]。因此本文件写「裸选择器」——不要自己再加 html[...] 前缀。\n\n   组件：**侧栏滚动渐隐**（Codex 的 --sidebar-scroll-mask-image）。\n   验收：scripts/sidebar-surface-verify.mjs（夹具 A/B + 像素斜坡）。\n\n   ── 为什么是「面」而不是「样式」 ──────────────────────────────────────────\n   宿主对同一件事有自己的实现：滚动容器旁边放一个 24px 的绝对定位覆盖层，\n   底色是 linear-gradient(transparent → var(--dsw-specific-sidebar-fill))。\n   覆盖层成立的前提是**底色不透明**；本皮肤支持侧栏半透明\n   （src/override.js 的 SIDEBAR_ALPHA 会改写 --dsw-specific-sidebar-fill 的 alpha），\n   一旦半透明，覆盖层就只能糊上一层半透明的色，内容在它下面仍然看得见。\n   Codex 用的是 mask：直接对内容做 alpha 遮罩，与底色是否透明无关。\n   所以本层把宿主那条覆盖层让位，换成 Codex 的 mask 形状。\n\n   ── Codex 原文（codex-app-initial.css，_headerFadeMask_n9nga_1） ──────────\n   为免触发 scopeCss 的括号解析，这里用行式记法，不写花括号：\n\n     --edge-fade-distance                  calc(var(--spacing) * 10)\n     --sidebar-scroll-footer-edge          calc(100% - var(--sidebar-footer-height))\n     --sidebar-scroll-footer-fade-distance calc(var(--spacing) * 10)      → 40px\n     --sidebar-scroll-footer-fade-start    calc(footer-edge - fade-distance)\n     --sidebar-scroll-header-mask-distance var(--sidebar-scroll-header-fade-distance,\n                                             var(--sidebar-scroll-header-spacing, spacing*2))\n     --sidebar-scroll-mask-image           linear-gradient(to bottom,\n                                             transparent 0,\n                                             transparent <header-mask-start>,\n                                             black <header-mask-start + header-mask-distance>,\n                                             black <footer-fade-start>,\n                                             #000000e0 <footer-edge - spacing*6>,\n                                             #00000085 <footer-edge - spacing*3>,\n                                             #0000002e <footer-edge - spacing>,\n                                             transparent <footer-edge>,\n                                             transparent 100%)\n     -webkit-mask-image / mask-image       var(--sidebar-scroll-mask-image)\n     mask-size                             100% 100% ／ mask-repeat: no-repeat\n\n   --spacing 是 Tailwind 的 4px 刻度（Codex 根块 --padding-panel-base: spacing*3 = 12px\n   可反推）。于是底部那段斜坡在 40px 内四段收敛：1 → 0.878 → 0.522 → 0.180 → 0。\n\n   ── 两处按 DSH 现场的改写（逐条给依据） ──────────────────────────────────\n   ① footer-edge 取 100%，不取 calc(100% - footer 高度)。\n      Codex 的滚动视口与底部固定区**同层**（footer 压在滚动内容之上），\n      所以它的斜坡要在 footer 顶边就收敛完；DSH 的 regionArea 与 footArea\n      是 flex 列的**上下两块**，滚动容器底边本身就是 footArea 的顶边\n      （真 GUI 实测：regionArea y=154 h=690 → 底边 844；footArea y=844）。\n      所以 100% 就是 Codex 的 footer-edge，不需要再减。\n   ② 顶部不做渐入。\n      Codex 的 header-mask-start 默认 0、距离 8px，是给「吸顶分组标题」用的：\n      内容从标题下面滚过去时在顶部渐隐。DSH 的分组标题（工作区表头）不在滚动\n      容器里，是常驻的一行，滚动视口顶上没有任何覆盖层——照抄这 8px 只会让\n      列表第一行永远发虚。Codex 自己在 _stickySectionHeaders 上也把这段距离\n      收到 spacing/2（2px）。\n\n   ── 锚点纪律 ────────────────────────────────────────────────────────────\n   宿主没有给侧栏列表发任何语义锚点（真 GUI 实测：整个 [data-slot] 集合里\n   只有 sidebar.*、settings.*、conversation.* 这些席位出口，滚动容器与覆盖层\n   都没有 data-*）。本层因此分两类：\n     · 作用域根：div:has(> [data-slot=\"sidebar.workspaces\"]) —— 语义锚点，\n       唯一命中 regionArea；沿用 sidebar-align.css 已经建立的用法。\n     · 容器/覆盖层：副作用后缀锚点 class 后缀 _list / _fade（选择器写作方括号\n       class 属性后缀匹配）。\n       后缀是 CSS-Modules 的**源类名**（哈希前缀每次构建会变：桌面壳 asar 是\n       n_2Q3W_/MnE-JG_，npm 全局安装是 hHd-Xa_/bhn1Oq_），所以后缀形式\n       跨版本反而比哈希全名稳。代价是 build.mjs 的 hash 锚点计数 +2，\n       与 patches.css / composer.css 已有的 29 处同一类，写在这里备查。\n   ============================================================================ */\n\n\n/* ── ① 宿主那条 24px 覆盖层让位 ───────────────────────────────────────────\n   它刷的是 --dsw-specific-sidebar-fill。半透明底时它挡不住内容，\n   且与下面的 mask 叠加会变成双渐隐（实测见验收脚本的 A/B 像素读数）。\n   只在本层作用域内摘除，区域外一律不动。 */html[data-codex-ui] div:has(> [data-slot=\"sidebar.workspaces\"]) [class$=\"_fade\"]{\n  display: none;\n}\n\n\n/* ── ② 滚动容器：Codex 的 mask 斜坡 ──────────────────────────────────────\n   两层 mask，默认 mask-composite: add 叠加：\n     第一层 = 斜坡本体，横向只铺到「列表右内边距」为止；\n     第二层 = 右侧那一条不透明遮罩。\n   为什么分两层：mask-image 配 mask-repeat: no-repeat 时，图像没铺到的区域\n   mask 值是 0（= 隐藏），所以只写第一层会把右侧 12px（宿主的滚动条槽，\n   由 --dsh-session-list-edge-inset / scrollbar-gutter: stable 预留）\n   整条抹掉。第二层把那一条补回不透明，宿主「渐隐不压滚动条」的既有取舍\n   就被保住了 —— 宿主的覆盖层也是 right: var(--dsh-session-list-edge-inset)。 */html[data-codex-ui] div:has(> [data-slot=\"sidebar.workspaces\"]) [class$=\"_list\"]{\n  -webkit-mask-image:\n    linear-gradient(\n      to bottom,\n      #000 0,\n      #000 calc(100% - 40px),\n      #000000e0 calc(100% - 24px),\n      #00000085 calc(100% - 12px),\n      #0000002e calc(100% - 4px),\n      #00000000 100%\n    ),\n    linear-gradient(#000, #000);\n  mask-image:\n    linear-gradient(\n      to bottom,\n      #000 0,\n      #000 calc(100% - 40px),\n      #000000e0 calc(100% - 24px),\n      #00000085 calc(100% - 12px),\n      #0000002e calc(100% - 4px),\n      #00000000 100%\n    ),\n    linear-gradient(#000, #000);\n  -webkit-mask-size: calc(100% - var(--dsh-session-list-edge-inset, 12px)) 100%, var(--dsh-session-list-edge-inset, 12px) 100%;\n  mask-size: calc(100% - var(--dsh-session-list-edge-inset, 12px)) 100%, var(--dsh-session-list-edge-inset, 12px) 100%;\n  -webkit-mask-position: 0 0, 100% 0;\n  mask-position: 0 0, 100% 0;\n  -webkit-mask-repeat: no-repeat, no-repeat;\n  mask-repeat: no-repeat, no-repeat;\n}\n\n\n/* ==== L3 窗口边缘阴影层（源：skins/codex-ink/window-shadow.css）==== */\n/* ============================================================================\n   codex-ink · L3 窗口边缘阴影层\n   ----------------------------------------------------------------------------\n   源文件：skins/codex-ink/window-shadow.css。install-plugin.mjs 把本文件的选择器\n   作用域化到 html[data-codex-ui] 后拼进 client.js 的内嵌样式表，所以这里写裸选择器：\n   自己再加 html[...] 前缀会被 scopeCss 判为已作用域而直通，永远不命中。\n   注释里禁止出现花括号 —— scopeCss 按「下一个左花括号」做括号配对。\n\n   目标（三条，不多做）：\n     1. 会话窗口（AppFrame 中列）：1px 发丝线 + 24px 全向环境影（左沿糊到侧栏、上沿糊进标题栏条）；\n     2. 右栏面板：同样的顶沿，但**左边框只留发丝线、不带影**；\n     3. 右栏分界线拖拽柄悬停时的中段渐变聚焦。\n\n   取值依据（Codex 应用截图逐像素实测，非估计）：\n     assets/reference/codex-app-reference.png（1901x1107，DPR 1）\n      · 会话窗口左沿  y=600：侧栏侧 x=340..355 由 238,241,247 渐变到 231,233,239（约 15px 渐变），\n                    x=356 单像素发丝线 212,215,221，x=357 起纯白。\n      · 会话窗口上沿  x=800：y=30..45 由 237,242,247 渐变到 232,237,242，y=46 发丝线 214,218,224。\n      · 右栏面板左沿  y=600：x=1437 单像素 237,237,237，两侧都是纯白 —— **没有影**。\n      · 右栏面板上沿  x=1700：与中列同一套渐变 + 发丝线（y=46 处 213,218,224）。\n    结论：发丝线是 1 个设备像素，中列取 12% 墨（l2）、面板取 7% 墨（l1）；\n          软影只出现在中列的左/上沿与面板的上沿，面板左沿不糊影。\n          本层按 DPR 折算成 0.5 CSS px 的发丝线：1.5 倍缩放下落到约 1 个设备像素，\n          与参考图同档；写成 1px 会在 1.5 倍缩放下被栅格化成 2 个像素（偏粗）。\n\n   锚点（只用宿主语义属性，不用 CSS-Modules 哈希类名）：\n     中列     div:has(> [data-slot=\"main\"])；main 面板未注册时退回\n              div:has(> [data-slot=\"sidebar\"]) + div（侧栏列的下一个兄弟）。\n     右栏面板 [data-sidebar-right-panel=\"push\"][data-sidebar-right-open]。\n     拖拽柄   [data-side=\"rightbar\"]，宽 8px、骑跨分界线。\n\n   层序：标题栏拖拽条是 .frame 的绝对定位伪元素，静态定位的中列会被它盖住。\n   本层给中列补 position: relative 抬进定位层，靠 DOM 顺序压过它 —— 上沿的影因此\n   才画得到标题栏条上。右栏面板是宿主 absolute 拉伸的元素（top:0 / bottom:0），\n   切勿再叠 position: relative：会覆盖 absolute、面板塌成内容高度（已出过一次事故）。\n   ============================================================================ */\n\n/* ── ① 会话窗口（中列）：0.5px 发丝线 + 24px 全向环境影 ─────────────────────\n   范围：Windows 桌面壳（html[data-windows-titlebar]）与 win32 的浏览器形态。\n   macOS 是 vibrancy 透底，加外投影会脏，不生效。 */html[data-codex-ui][data-windows-titlebar] div:has(> [data-slot=\"main\"]),html[data-codex-ui][data-windows-titlebar] div:has(> [data-slot=\"sidebar\"]) + div,html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) div:has(> [data-slot=\"main\"]),html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) div:has(> [data-slot=\"sidebar\"]) + div{\n  position: relative;\n  box-shadow:\n    0 0 0 0.5px var(--dsw-alias-border-l2),\n    0 0 24px rgba(13, 13, 13, 0.05);\n}html[data-codex-ui][data-windows-titlebar] body[data-ds-dark-theme] div:has(> [data-slot=\"main\"]),html[data-codex-ui][data-windows-titlebar] body[data-ds-dark-theme] div:has(> [data-slot=\"sidebar\"]) + div,html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) body[data-ds-dark-theme] div:has(> [data-slot=\"main\"]),html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) body[data-ds-dark-theme] div:has(> [data-slot=\"sidebar\"]) + div{\n  box-shadow:\n    0 0 0 0.5px var(--dsw-alias-border-l2),\n    0 0 24px rgba(0, 0, 0, 0.5);\n}\n\n/* ── ② 右栏（push 模式）：左边框只留发丝线，影只往上泄 ─────────────────────\n   参考图实测：面板左沿 x=1437 是单像素 237,237,237、两侧纯白 —— 左沿不糊影，\n   所以这里不给全向影；顶沿仍与中列同套，用负 spread 把水平方向与下方收掉，\n   只在面板上沿留一段约 12px 的渐变（影盒左沿被收进面板 12px 内，左沿残余覆盖约\n   0.008，肉眼为零）。栏内 dockkit 叠的那条 .5px l4 深边框一并压成 0。 */html[data-codex-ui][data-windows-titlebar] [data-sidebar-right-panel=\"push\"][data-sidebar-right-open],html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) [data-sidebar-right-panel=\"push\"][data-sidebar-right-open]{\n  box-shadow:\n    0 0 0 0.5px var(--dsw-alias-border-l1),\n    0 -12px 24px -12px rgba(13, 13, 13, 0.05);\n}html[data-codex-ui][data-windows-titlebar] body[data-ds-dark-theme] [data-sidebar-right-panel=\"push\"][data-sidebar-right-open],html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) body[data-ds-dark-theme] [data-sidebar-right-panel=\"push\"][data-sidebar-right-open]{\n  box-shadow:\n    0 0 0 0.5px var(--dsw-alias-border-l1),\n    0 -12px 24px -12px rgba(0, 0, 0, 0.5);\n}\n\n/* 宿主 dockkit 给右栏的 pane 画了一条 1px l4（24% 墨，实测合成值 197 —— 比参考图的\n   单像素 237 深两档），它落在面板左沿外侧，就是「边框又粗又重」的来源之一。\n   真实锚点是 pane 自身：SECTION[data-dockkit-pane][data-dockkit-column=\"0\"]，\n   插在 [data-dockkit-host=\"dock\"] 的 tabCell 里 —— 旧版按 host 的 div 直选子元素，\n   选择器从来没命中过。压成 0，左沿只留面板自己的 0.5px l1 发丝线。 */html[data-codex-ui] [data-sidebar-right-panel=\"push\"][data-sidebar-right-open] [data-dockkit-pane][data-dockkit-column=\"0\"]{\n  border-left: 0;\n}\n\n/* ── ③ 右栏分界线拖拽柄：悬停时的中段渐变聚焦 ─────────────────────────────\n   静态：边界只有那 0.5px 发丝线，淡且细。\n   悬停：柄内居中画 2px 竖向线，中段最深、两端淡出，入场自中间向两端展开。\n   实测 assets/reference/codex-rightbar-edge-hover.png（111x842，DPR 1）：\n     柄心列 y=560 处 x=65/66 = 213,214,214 / 198,198,199（中段最深）\n     同一列 y=20 处 x=65/66 = 239,239,240 / 222,222,222（向两端淡出）\n   左分界线（侧栏 ↔ 中列）没有这条悬停线：参考图里它始终是一条静态发丝线。 */html[data-codex-ui] [data-side=\"rightbar\"]::before{\n  content: \"\";\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 50%;\n  width: 2px;\n  translate: -50% 0;\n  border-radius: 1px;\n  background: linear-gradient(to bottom, rgba(13, 13, 13, 0.09), rgba(13, 13, 13, 0.27) 50%, rgba(13, 13, 13, 0.09));\n  opacity: 0;\n  scale: 1 0.35;\n  transform-origin: center;\n  transition: opacity var(--dsw-motion-base) var(--dsw-ease), scale var(--dsw-motion-slow) var(--dsw-ease);\n  pointer-events: none;\n}html[data-codex-ui] [data-side=\"rightbar\"]:hover::before{\n  opacity: 1;\n  scale: 1 1;\n}html[data-codex-ui] body[data-ds-dark-theme] [data-side=\"rightbar\"]::before{\n  background: linear-gradient(to bottom, rgba(236, 236, 236, 0.08), rgba(236, 236, 236, 0.24) 50%, rgba(236, 236, 236, 0.08));\n}\n\n/* ── ④ 浏览器形态（win32，无标题栏条）────────────────────────────────────\n   宿主给侧栏列画的是 .5px l3（18% 墨），比桌面壳（border-right: none）深一档，\n   与中列的 0.5px l2 发丝线叠在一起会变成双层深线，压到 l1。 */html[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) div:has(> [data-slot=\"sidebar\"]){\n  border-right-color: var(--dsw-alias-border-l1);\n}\n\n\n/* ==== L3 输入区完整层（源：skins/codex-ink/composer.css）==== */\n/* ============================================================================\n   codex-ink（墨白终端）· L3 输入区完整层\n   ----------------------------------------------------------------------------\n   源文件：skins/codex-ink/composer.css\n   由 scripts/install-plugin.mjs 与其余各层一起拼接，并作用域化到 html[data-codex-ui]。\n   本文件写「裸选择器」——不要自己再加 html[...] 前缀，那会被 scopeCss 直通。\n\n   来源（本地克隆：D:\\A-part-of-new-software\\PROJIECT\\dsh-codex-ui）：\n     · src/client/CodexSidebar.tsx          L119-L137  → ⑭·1 ⑭·2 ⑭·3\n     · src/client/composer-tool-menus.ts    L6-L30     → ⑭·4（仅官方锚点部分）\n     · src/client/new-conversation-style.ts L3-L14     → ⑭·5\n\n   兼容性核对（对 rc1 0.1.7-rc.1 的 shipped 包逐条 grep，不是照抄）：\n     上游 README 只声明兼容到 0.1.6-alpha.2。逐条核对后，以下锚点在本机 rc1 上\n     不存在，一律**不移植**，免得留死规则：\n       ✗ [data-input-mirror]                      rc1 无此属性（conversation 包 0 命中）\n       ✗ [class*=\"_rail\"]（附件轨道补偿）           rc1 无此类名段\n       ✗ [class*=\"_selected\"] / [class*=\"_footer\"] rc1 无此类名段\n       ✗ [data-dcu-tool-menu] / [data-gitgraph-popover]  由上游 JS 观察器打标，\n         本插件不含该半，规则永远不会命中 → 弹窗换肤留在「待移植 JS 半」清单\n       ✗ .dcu-home-*                            上游自有组件的类名，本皮肤没有这些节点\n     实测存在的锚点（本条全部基于它们）：\n       ✓ [data-composer-card] [data-input-scroll] [data-composer-placeholder]\n         [data-lexical-editor=true] [data-conversation-scroll] [data-composer-seat]\n         [data-trigger-menu] [data-phase]（取值 settling / hero / active）\n\n   锚点纪律例外（必须说清）：\n     ⑭·4 ⑭·5 用到 [class*=\"_heroWorkspaceRow\"] / [class*=\"_composerHero\"] /\n     [class$=\"_workspace\"] / [class$=\"_primary\"]。这类 CSS-Modules 哈希类名在\n     patches.css 头部是被禁止的——那条禁令针对 **skin-center 加载器**的\n     \"reliance on CSS-Modules hash class names\" 告警。本层走**插件路径**\n     （client.js 直接注入 style 标签），不经加载器，故放行。\n     已尽量取「后缀锚点」写法（[class$=_primary]），只依赖语义后缀、不依赖哈希前缀；\n     语义名若被上游改掉，由 scripts/hero-verify.mjs 的实测值暴露。\n     hero 区没有 data-* 可用：jYtg_G_heroWorkspaceRow / jYtg_G_composerHero 只有类名。\n   ============================================================================ */\n\n/* ── ⑭·1 卡片几何与表面 ───────────────────────────────────────────────────\n   上游把输入区放宽到 chat 内容宽 + 32px，左右留白 24px；卡片 20px 圆角（浏览器\n   支持 corner-shape 时升到 25px 超椭圆），亮色三层极淡投影、暗色改用内描边。 */html[data-codex-ui] [data-conversation-scroll]{\n  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);\n  --dsh-composer-side-clearance: 24px;\n  --dcu-composer-bg: var(--dsw-specific-input-major, #fff);\n  --dcu-composer-shadow: 0 0 0 1px #0000000a, 0 2px 8px #0000000a, 0 4px 80px 8px #00000006;\n}html[data-codex-ui] body[data-ds-dark-theme] [data-conversation-scroll]{\n  --dcu-composer-bg: var(--dsw-alias-bg-layer-2, #242424);\n  --dcu-composer-shadow: inset 0 0 1px #fff3;\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card]{\n  padding-top: 8px;\n  gap: 4px;\n  border: 0;\n  border-radius: var(--dsw-radius-xl);\n  background: var(--dcu-composer-bg);\n  box-shadow: var(--dcu-composer-shadow);\n}\n\n@supports (corner-shape: superellipse(1.5)) {html[data-codex-ui] [data-conversation-scroll] [data-composer-card]{\n    border-radius: var(--dsw-radius-2xl);\n    corner-shape: superellipse(1.5);\n  }\n}\n\n@media (max-width: 639px) {html[data-codex-ui] [data-conversation-scroll]{\n    --dcu-composer-shadow: 0 0 0 1px #0000000a, 0 2px 8px #0000000a, 0 4px 40px 8px #00000006;\n  }\n}\n\n@media (forced-colors: active) {html[data-codex-ui] [data-conversation-scroll] [data-composer-card]{\n    outline: 1px solid CanvasText;\n  }\n}\n\n/* ── ⑭·2 输入区几何：44px 编辑区 + 12px 内缩，占位元素与正文同轴 ────────── */html[data-codex-ui] [data-conversation-scroll] [data-composer-card] [data-input-scroll]{\n  margin-right: 0;\n}html[data-codex-ui] [data-conversation-scroll] [data-input-scroll] [data-lexical-editor=true]{\n  min-height: 44px;\n  padding: 0 12px;\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-placeholder]{\n  inset: 0 12px auto;\n}\n\n/* ── ⑭·3 底栏行与发送键：28px 控件带，发送键改墨色圆点、无位移 ────────────\n   卡内结构是 card > [data-input-scroll] + row，故用相邻兄弟定位底栏。 */html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div{\n  padding: 0 8px 8px;\n  gap: 5px;\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div > div{\n  gap: 4px;\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div > div > div{\n  gap: 4px;\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div :is(button, select):not([role]){\n  min-height: 28px;\n  height: 28px;\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div button[class$=_primary]{\n  width: 28px;\n  transform: none;\n  background: var(--dsw-alias-label-primary);\n  color: var(--dsw-alias-bg-base);\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div button[class$=_primary]:hover:not(:disabled){\n  background: var(--dsw-alias-label-secondary);\n}html[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div :is(button, select):focus-visible{\n  outline: 2px solid var(--dsw-codex-focus);\n  outline-offset: 2px;\n}\n\n/* ── ⑭·4 工具条与建议菜单（只保留官方锚点能命中的部分） ────────────────────\n   hero 的工作区行按钮 → Codex 胶囊；@ / 指令建议菜单 → 与输入区同宽同圆角。 */html[data-codex-ui] [class*=\"_heroWorkspaceRow\"] button{\n  min-height: 28px;\n  border-radius: var(--dsw-radius-pill);\n  font-size: 13px;\n  line-height: 20px;\n}html[data-codex-ui] [class*=\"_heroWorkspaceRow\"] button:hover,html[data-codex-ui] [class*=\"_heroWorkspaceRow\"] button[aria-expanded=true]{\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}html[data-codex-ui] [data-conversation-scroll] [data-trigger-menu]{\n  box-sizing: border-box;\n  left: 0;\n  right: 0;\n  width: auto;\n  min-width: 0;\n  max-width: none;\n  padding: 5px;\n  border-radius: var(--dsw-radius-m);\n  background: #fff;\n  box-shadow: 0 8px 32px #0002, 0 0 0 1px #0000000a;\n}html[data-codex-ui] body[data-ds-dark-theme] [data-conversation-scroll] [data-trigger-menu]{\n  background: #292929;\n  box-shadow: 0 8px 32px #0003, 0 0 0 1px #ffffff08;\n}html[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] > [role=listbox]{\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 0;\n  align-self: stretch;\n  scrollbar-width: thin;\n}html[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] [role=option]{\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 0;\n  min-height: 28px;\n  padding: 4px 9px;\n  gap: 8px;\n  border-radius: var(--dsw-radius-s);\n  font-size: 13px;\n  line-height: 20px;\n}html[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] [role=option][aria-selected=true]{\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);\n}\n\n/* ── ⑭·5 新建页（hero）：输入区占满、工作区行贴在卡片上沿 ─────────────────\n   上游的 .dcu-home-* 建议卡属于它自己的组件，本皮肤没有这些节点，不移植；\n   container 声明只为那些卡片服务，一并省掉。 */html[data-codex-ui] [data-phase=hero] [data-conversation-scroll][class]{\n  --dsh-composer-side-clearance: 16px;\n  justify-content: flex-start;\n  scrollbar-gutter: stable both-edges;\n}html[data-codex-ui] [data-phase=hero] [data-composer-seat]{\n  flex: 1 0 auto;\n  min-height: 100%;\n}html[data-codex-ui] [data-phase=hero] [data-composer-seat] > :has([class*=\"_composerHero\"]){\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n}html[data-codex-ui] [data-phase=hero] [class*=\"_composerHero\"]{\n  box-sizing: border-box;\n  flex: 1;\n  width: 100%;\n  max-width: none;\n  min-width: 0;\n  margin-inline: auto;\n  gap: 0;\n  padding-bottom: 32px;\n}html[data-codex-ui] [data-phase=hero] [class*=\"_heroWorkspaceRow\"]{\n  box-sizing: border-box;\n  flex: none;\n  width: min(calc(var(--dsh-composer-card-max-width) + 2 * var(--dsh-composer-side-clearance) - 56px), calc(100% - 56px));\n  align-self: center;\n  justify-content: flex-start;\n  flex-wrap: wrap;\n  gap: 8px;\n  min-height: 48px;\n  margin: 0 28px -10px;\n  padding: 6px 12px 16px;\n  border-radius: var(--dsw-radius-l) var(--dsw-radius-l) 0 0;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-base));\n}html[data-codex-ui] [data-phase=hero] [class*=\"_heroWorkspaceRow\"] > [class$=\"_workspace\"]{\n  min-width: 0;\n  max-width: 100%;\n  font-weight: 400;\n}\n\n\n/* ==== L3 插件设置页层（源：skins/codex-ink/settings.css）==== */\n/* ============================================================================\n   codex-ink · L3 插件设置页层\n   ----------------------------------------------------------------------------\n   官方插件管理 → 组合包页里那块配置卡的版式（座位 plugins.bundle.config）。\n   取色只用 --dsw-alias-* / --dsw-specific-* 令牌，**不引入任何彩色** —— 与\n   skin.css 的「无彩色 chrome」纪律一致；唯一的彩色是强调色本身，由设置值给。\n\n   为什么放在皮肤层而不是卡片内联：这一层同样受 html[data-codex-ui] 作用域约束，\n   进同一份 theme.css，可被体检脚本与审计脚本一起看见。\n   ========================================================================== */html[data-codex-ui] .cx-form{\n  display: flex;\n  flex-direction: column;\n  margin: 0;\n}html[data-codex-ui] .cx-row{\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  align-items: center;\n  column-gap: 16px;\n  padding: 10px 0;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l1);\n}html[data-codex-ui] .cx-row:last-child{\n  border-bottom: none;\n}html[data-codex-ui] .cx-row__text{\n  min-width: 0;\n}html[data-codex-ui] .cx-row__label{\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 20px;\n}html[data-codex-ui] .cx-row__desc{\n  margin-top: 2px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n}html[data-codex-ui] .cx-row__control{\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  justify-self: end;\n}html[data-codex-ui] .cx-row--stack .cx-row__control{\n  justify-self: stretch;\n}html[data-codex-ui] .cx-swatch{\n  width: 24px;\n  height: 24px;\n  padding: 0;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-s, 6px);\n  background: none;\n  cursor: pointer;\n}html[data-codex-ui] .cx-swatch::-webkit-color-swatch-wrapper{\n  padding: 2px;\n}html[data-codex-ui] .cx-swatch::-webkit-color-swatch{\n  border: none;\n  border-radius: calc(var(--dsw-radius-s, 6px) - 2px);\n}html[data-codex-ui] .cx-hex{\n  width: 96px;\n  height: 24px;\n  padding: 0 8px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-s, 6px);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--ds-font-family-code);\n  font-size: 11px;\n  letter-spacing: 0.04em;\n}html[data-codex-ui] .cx-hex:focus-visible{\n  outline: 2px solid var(--dsw-codex-focus);\n  outline-offset: 1px;\n}html[data-codex-ui] .cx-text{\n  width: 220px;\n  height: 24px;\n  padding: 0 8px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-s, 6px);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n}html[data-codex-ui] .cx-text:focus-visible{\n  outline: 2px solid var(--dsw-codex-focus);\n  outline-offset: 1px;\n}html[data-codex-ui] .cx-range{\n  width: 160px;\n  accent-color: var(--dsw-alias-link);\n}html[data-codex-ui] .cx-range__value{\n  min-width: 24px;\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--ds-font-family-code);\n  font-size: 11px;\n  text-align: right;\n}html[data-codex-ui] .cx-note{\n  margin: 0 0 8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n}html[data-codex-ui] .cx-error{\n  margin: 8px 0 0;\n  color: var(--dsw-alias-state-error, var(--dsw-alias-label-primary));\n  font-size: 11px;\n  line-height: 16px;\n}\n";
    /** 生成期注入的覆盖层模块（源：src/override.js）。 */
    const __override = (() => {
/**
 * override.js — 设置页写进页面的那一层覆盖（纯函数：无 DOM、无副作用、可单测）。
 *
 * 为什么要单独一层：skins/*.css 是**默认值**，设置页改的是**用户覆盖**。
 * 把用户值写回源样式会让「默认长什么样」无法回答，也无法一键还原，
 * 所以覆盖只在运行时以多一个属性的选择器（特异性 +1）压过皮肤，源文件一个字不动。
 *
 * 取值纪律：
 *   · 空串 = 不覆盖（退默认层），默认值下本模块输出空串 —— 「装上不动一个字也不改外观」是夹具断言；
 *   · 颜色只认 6 位十六进制（与 Codex schema 的 /^#[0-9a-fA-F]{6}$/ 一致）；
 *   · 本模块**不产生任何彩色**：除强调色（用户显式指定）外只有中性 rgba，与皮肤的「无彩色 chrome」纪律一致。
 *
 * Codex 侧依据（app.asar 的 jdi / IOe）：
 *   dark  { accent:#339cff, contrast:60, ink:#ffffff, surface:#181818 }
 *   light { accent:#339cff, contrast:45, ink:#1a1c1f, surface:#ffffff }
 * 对比度是**简化实现**：Codex 用线性 RGB 混合把文本往 ink 拉、并按同一常量抬升灰阶；
 * 这里只做两件可解释的事 —— 文本档位按同一方向混合、发丝线与色调家族按比例缩放。
 * 差距写在 README 的「与 Codex 源码对账」一节，不含糊。
 */

/** 覆盖层生效时打在 <html> 上的第二个属性（比皮肤自身多一个属性 ⇒ 特异性稳赢）。 */
const OVERRIDE_ATTR = 'data-codex-ui-theme';
/** 皮肤自身的根属性，与 src/build.mjs 的 ATTR 同源。 */
const SKIN_ATTR = 'data-codex-ui';
/** 设置表单的命名空间 = profile 条目 id（= 包名）。 */
const SETTINGS_ENTRY_ID = 'codex-ui';

/** Codex 默认对比度：亮 45 / 暗 60。 */
const DEFAULT_CONTRAST = { light: 45, dark: 60 };

/** 皮肤默认值（空串即回落到这里）。 */
const SKIN_DEFAULTS = {
  light: { accent: '#339cff', focus: '#339cff', surface: '#ffffff', ink: '#1a1c1f', sidebar: '#eef4f9' },
  dark: { accent: '#0169cc', focus: '#339cff', surface: '#181818', ink: '#ffffff', sidebar: '#181818' },
};

/**
 * 文本档位（次要/辅助/说明/主文本弱化）—— 对比度把它们往 ink（或往底色）拉。
 * 值必须与 skins/codex-ink/skin.css 一致；夹具会核对，改一处忘另一处会 FAIL。
 */
const LABEL_TIERS = {
  light: {
    '--dsw-alias-label-secondary': '#5d5d5d',
    '--dsw-alias-label-primary-dimmed': '#5d5d5d',
    '--dsw-alias-label-tertiary': '#767676',
    '--dsw-alias-label-caption': '#767676',
  },
  dark: {
    '--dsw-alias-label-secondary': '#b4b4b4',
    '--dsw-alias-label-primary-dimmed': '#b4b4b4',
    '--dsw-alias-label-tertiary': '#949494',
    '--dsw-alias-label-caption': '#949494',
  },
};

/**
 * 中性 alpha 家族 —— 对比度按比例缩放它们。
 * 只收中性（亮 rgba(13,13,13,·) / 暗 rgba(255,255,255,·)）：状态色与 diff 底色是**彩色**，
 * 缩放它们等于把调色板搬进本模块，与「彩色只配给状态、且集中在 skin.css」的纪律冲突。
 * 浮层挡板（bg-overlay / bg-mask-drop / specific-menu）与滚动条也不在内：它们不是对比度语义。
 * 同样由夹具与 skin.css 对账。
 */
const ALPHA_LADDER = {
  light: {
    '--dsw-alias-bg-skeleton': 0.05,
    '--dsw-alias-border-l1': 0.07,
    '--dsw-alias-border-l2': 0.12,
    '--dsw-alias-border-l3': 0.18,
    '--dsw-alias-border-l4': 0.24,
    '--dsw-alias-border-l2-darkmode-thin': 0.09,
    '--dsw-alias-button-tool-bar-fill': 0.28,
    '--dsw-alias-button-tool-bar-fill-invisible': 0.18,
    '--dsw-alias-button-tool-bar-hover': 0.36,
    '--dsw-alias-interactive-bg-hover': 0.04,
    '--dsw-alias-interactive-bg-active': 0.08,
    '--dsw-alias-interactive-bg-hover-accent': 0.06,
    '--dsw-alias-state-business-tertiary': 0.08,
    '--dsw-specific-sidebar-nav-item-active-accent': 0.1,
  },
  dark: {
    '--dsw-alias-bg-skeleton': 0.07,
    '--dsw-alias-border-l1': 0.08,
    '--dsw-alias-border-l2': 0.14,
    '--dsw-alias-border-l3': 0.2,
    '--dsw-alias-border-l4': 0.26,
    '--dsw-alias-border-l2-darkmode-thin': 0.1,
    '--dsw-alias-button-tool-bar-fill': 0.22,
    '--dsw-alias-button-tool-bar-fill-invisible': 0.16,
    '--dsw-alias-button-tool-bar-hover': 0.28,
    '--dsw-alias-interactive-bg-hover': 0.06,
    '--dsw-alias-interactive-bg-active': 0.1,
    '--dsw-alias-interactive-bg-hover-accent': 0.08,
    '--dsw-alias-state-business-tertiary': 0.12,
    '--dsw-specific-sidebar-nav-item-active-accent': 0.14,
    /* 本插件自己的悬停填充（0.1.2 起用），深色专属。 */
    '--dsw-codex-hover-fill': 0.08,
  },
};

/** 半透明侧边栏的填充不透明度。 */
const SIDEBAR_ALPHA = 0.72;
/** alpha 缩放的夹取区间：滑到底也不让发丝线彻底消失。 */
const SCALE_RANGE = [0.5, 2];
/** 文本档位混合的上限（按默认对比度归一后的偏移量）。 */
const MIX_RANGE = [0, 0.5];

/** 6 位十六进制色。 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 是否是合法的覆盖色。
 * @param value - 待检查的值。
 * @returns 合法则 true；空串/未定义一律 false（= 不覆盖）。
 */
function isHex(value) {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** 线性插值（逐通道四舍五入），t=0 返回 a、t=1 返回 b。 */
function mixHex(a, b, t) {
  const x = toRgb(a);
  const y = toRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** 由十六进制色加 alpha 得到 rgba() 文本。 */
function withAlpha(hex, alpha) {
  const [r, g, b] = toRgb(hex);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + Number(alpha.toFixed(3)) + ')';
}

/**
 * 对比度的影响：文本混合系数与 alpha 缩放系数。
 * @param contrast - 面板上的 0–100。
 * @param theme - 'light' | 'dark'。
 * @returns {{mix: number, scale: number}} 默认对比度下两者都是恒等值（0 / 1）。
 */
function contrastEffect(contrast, theme) {
  const fallback = DEFAULT_CONTRAST[theme];
  const raw = Number(contrast);
  const c = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : fallback;
  const ratio = c / fallback;
  const mix = Math.min(MIX_RANGE[1], Math.abs(ratio - 1) * 0.5) * (ratio >= 1 ? 1 : -1);
  const scale = Math.min(SCALE_RANGE[1], Math.max(SCALE_RANGE[0], ratio));
  return { mix, scale };
}

/**
 * 生成覆盖层 CSS。
 * @param values - configForms 的取值快照（空串表示不覆盖）。
 * @returns CSS 文本；默认值下为空串（不插任何规则）。
 */
function themeOverrideCss(values = {}) {
  const light = [];
  const dark = [];

  /** 每主题一组声明。 */
  const emit = (theme, list) => {
    const d = SKIN_DEFAULTS[theme];
    const accent = isHex(values[theme === 'light' ? 'accentLight' : 'accentDark'])
      ? values[theme === 'light' ? 'accentLight' : 'accentDark'].trim()
      : null;
    const surfaceRaw = values[theme === 'light' ? 'surfaceLight' : 'surfaceDark'];
    const surface = isHex(surfaceRaw) ? surfaceRaw.trim() : null;
    const inkRaw = values[theme === 'light' ? 'inkLight' : 'inkDark'];
    const ink = isHex(inkRaw) ? inkRaw.trim() : null;
    const contrast = values[theme === 'light' ? 'contrastLight' : 'contrastDark'];
    const { mix, scale } = contrastEffect(contrast, theme);
    const effectiveSurface = surface ?? d.surface;
    const effectiveInk = ink ?? d.ink;

    if (accent !== null) {
      list.push(['--dsw-alias-link', accent]);
      /* 焦点环跟着强调色走：亮色实色、暗色 70% —— 与皮肤里的两处默认值同构。 */
      list.push(['--dsw-codex-focus', theme === 'light' ? accent : withAlpha(accent, 0.7)]);
    }
    if (surface !== null) list.push(['--dsw-alias-bg-base', surface]);
    if (ink !== null) list.push(['--dsw-alias-label-primary', ink]);
    if (mix !== 0) {
      const target = mix > 0 ? effectiveInk : effectiveSurface;
      for (const [token, base] of Object.entries(LABEL_TIERS[theme])) {
        list.push([token, mixHex(base, target, Math.abs(mix))]);
      }
    }
    if (scale !== 1) {
      const rgb = theme === 'light' ? '13, 13, 13' : '255, 255, 255';
      for (const [token, base] of Object.entries(ALPHA_LADDER[theme])) {
        list.push([token, 'rgba(' + rgb + ', ' + Number(Math.min(1, base * scale).toFixed(3)) + ')']);
      }
    }
    if (values.translucentSidebar === true) {
      /* 侧栏填充转半透明：与 surface 同面时不改变观感，它只在侧栏压住别的内容时看得见
         —— Web 没有窗口层，这一点如实写进 README，不假装等价于 Codex 的窗口半透明。 */
      const fill = withAlpha(effectiveSurface, SIDEBAR_ALPHA);
      list.push(['--dsw-alias-bg-sidebar', fill]);
      list.push(['--dsw-specific-sidebar-fill', fill]);
      /* 行填充跟着转半透明：面板半透明而行实色会露出「玻璃板上的不透明贴片」。
         深色下侧栏与内容同面时，只有这两行还能把开关的效果显出来。 */
      const rgb = theme === 'light' ? '13, 13, 13' : '255, 255, 255';
      const rowAlpha = theme === 'light' ? [0.04, 0.08] : [0.06, 0.1];
      list.push(['--dsw-specific-sidebar-nav-item-hover', 'rgba(' + rgb + ', ' + Number(Math.min(1, rowAlpha[0] * scale).toFixed(3)) + ')']);
      list.push(['--dsw-specific-sidebar-nav-item-active', 'rgba(' + rgb + ', ' + Number(Math.min(1, rowAlpha[1] * scale).toFixed(3)) + ')']);
    }
  };

  emit('light', light);
  emit('dark', dark);

  /* 字体与主题无关，单独两条。 */
  const fonts = [];
  if (isFontStack(values.fontUi)) fonts.push(['--dsw-font-family', values.fontUi.trim()]);
  if (isFontStack(values.fontCode)) fonts.push(['--ds-font-family-code', values.fontCode.trim()]);

  const blocks = [];
  const fontDecls = fonts.map(([k, v]) => '  ' + k + ': ' + v + ';').join('\n');
  if (light.length > 0 || fontDecls !== '') {
    const decls = [...light.map(([k, v]) => '  ' + k + ': ' + v + ';'), fontDecls].filter((s) => s !== '').join('\n');
    blocks.push(sel(SKIN_ATTR, 'light') + ',\n' + sel(SKIN_ATTR, 'light-body') + ' {\n' + decls + '\n}');
  }
  if (dark.length > 0) {
    const decls = dark.map(([k, v]) => '  ' + k + ': ' + v + ';').join('\n');
    blocks.push(sel(SKIN_ATTR, 'dark') + ' {\n' + decls + '\n}');
  }
  return blocks.join('\n\n');
}

/**
 * 一组合法的字体栈（不许出现会闭合声明的字符）。
 * @param value - 待检查的值。
 * @returns 合法则 true。
 */
function isFontStack(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s === '' || s.length > 200) return false;
  return !/[;{}<>]/.test(s) && !/url\(/i.test(s);
}

/**
 * 选择器生成：覆盖层比皮肤多一个属性，特异性 +1，因此不依赖样式表先后顺序。
 * @param attr - 皮肤根属性名。
 * @param which - 'light' | 'light-body' | 'dark'。
 * @returns CSS 选择器。
 */
function sel(attr, which) {
  const root = 'html[' + attr + '][' + OVERRIDE_ATTR + ']';
  if (which === 'light') return root;
  if (which === 'light-body') return root + ' body';
  return root + ' body[data-ds-dark-theme]';
}

return { OVERRIDE_ATTR, SKIN_ATTR, SETTINGS_ENTRY_ID, DEFAULT_CONTRAST, SKIN_DEFAULTS, LABEL_TIERS, ALPHA_LADDER, SIDEBAR_ALPHA, SCALE_RANGE, MIX_RANGE, HEX_RE, isHex, mixHex, withAlpha, contrastEffect, themeOverrideCss, isFontStack, sel };
})();
    /* 生成期注入的设置卡片（源：src/settings-card.js）。 */
    /* ============================================================================
   设置卡片：Codex 主题面板（座位 plugins.bundle.config）
   ----------------------------------------------------------------------------
   构建期由 src/build.mjs 拼进 client.js 的 factory 体内 —— 这里可以直接用
   外层的 require、__override、PLUGIN_ID，也**不要**写成独立模块。

   契约（照 dsh-chat-ux 的同一座位实现）：
     · 座位键 = npm 包名 codex-ui；表单命名空间 = profile 条目 id，两者都是 'codex-ui'；
     · 改一下即写、没有保存按钮；文本框回车或失焦提交；写后回读确认落地；
     · 「已覆盖」= 用户层含该字段；「重置」= unset 掉用户层那一格；
     · view === 'summary' 时只回一行摘要（组合包页折叠态用）。
     · 「主题」那一行写的是**宿主主题偏好**，走 ctx.theme 服务（@deepseek-ai/dsh-client-ui-theme
       用 ctx.provide("theme", …) 提供）：getTheme() → { preference, active:{ colorScheme }, themes }，
       setTheme(id) 是唯一用户偏好写入口（id ∈ light/dark/system），变更经 ctx.on('theme/change') 广播。
       下面三行颜色编辑的是**当前生效的那一套**（active.colorScheme），不是另一套的暂存。
   ========================================================================== */

const REACT = (() => {
  try { return require('react'); } catch { return null; }
})();
const JSX = (() => {
  try { return require('react/jsx-runtime'); } catch { return null; }
})();
const PRIMITIVES = (() => {
  try { return require('@deepseek-ai/dsh-client-ui-primitives'); } catch { return null; }
})();

/** 三组颜色字段：面板一行 = 亮/暗两个 Config 字段。 */
const COLOR_ROWS = [
  ['accent', 'accentLight', 'accentDark'],
  ['surface', 'surfaceLight', 'surfaceDark'],
  ['ink', 'inkLight', 'inkDark'],
];

/** 文案。zh 为底，en 覆盖 —— 认不出英文就落中文。 */
const COPY_ZH = {
  intro: '这里的值只覆盖本皮肤（codex-ink）的默认外观，空值即跟随皮肤。',
  theme: '主题',
  themeDesc: '切换应用外观：写的是宿主的主题偏好，与「设置 → 通用 → 外观」同一处',
  light: '亮色',
  dark: '深色',
  system: '跟随系统',
  accent: '强调色',
  accentDesc: '链接与焦点环',
  surface: '背景',
  surfaceDesc: '应用底色',
  ink: '前景',
  inkDesc: '主文本',
  fontUi: 'UI 字体',
  fontUiDesc: '留空跟随 dsh；填字体栈，如 "Segoe UI", sans-serif',
  fontCode: '代码字体',
  fontCodeDesc: '留空跟随 dsh',
  translucent: '半透明侧边栏',
  translucentDesc: '侧栏填充转为半透明；Web 没有窗口层，深色下侧栏与内容同面，看不出差别',
  modelPicker: 'Codex 模型选择器',
  modelPickerDesc: '用本插件自己的两级卡片替换模型位：模型列表 + 底部可拖的推理强度功率轨；关掉则交回宿主自带的菜单',
  contrast: '对比度',
  contrastDesc: '按 Codex 默认档位归一：45（亮）/ 60（暗）即原样',
  overridden: '已覆盖',
  reset: '重置',
  follow: '跟随皮肤',
  failed: '保存没生效，请重试。',
  unavailable: '这个 dsh 没有把 codex-ui 的配置开放给本页：条目可能在本 profile 里被停用，或连接把偏好留在页面进程内。',
  readOnly: '设置文档是只读的，改动无法保存。',
  noPrimitives: '这个 dsh 没有提供设置控件包（@deepseek-ai/dsh-client-ui-primitives），无法渲染表单。',
  summary: (parts) => parts.join(' · '),
};
const COPY_EN = {
  intro: 'These values only override the codex-ink skin defaults. Empty means follow the skin.',
  theme: 'Theme',
  themeDesc: 'Switches the app appearance: the host theme preference, the same one as Settings → General → Appearance',
  light: 'Light',
  dark: 'Dark',
  system: 'System',
  accent: 'Accent',
  accentDesc: 'Links and focus ring',
  surface: 'Background',
  surfaceDesc: 'App surface',
  ink: 'Foreground',
  inkDesc: 'Primary text',
  fontUi: 'UI font',
  fontUiDesc: 'Empty follows dsh; e.g. "Segoe UI", sans-serif',
  fontCode: 'Code font',
  fontCodeDesc: 'Empty follows dsh',
  translucent: 'Translucent sidebar',
  translucentDesc: 'Sidebar fill becomes translucent; the Web has no window layer, so in dark it is invisible',
  modelPicker: 'Codex model picker',
  modelPickerDesc: 'Replaces the model seat with this plugin\'s own card: a model list plus a draggable reasoning power rail. Off hands the seat back to the host\'s menu.',
  contrast: 'Contrast',
  contrastDesc: 'Normalised to the Codex defaults: 45 (light) / 60 (dark) is unchanged',
  overridden: 'Overridden',
  reset: 'Reset',
  follow: 'Follow skin',
  failed: 'The save did not take effect. Please try again.',
  unavailable: 'This dsh does not expose codex-ui configuration to this page: the entry may be disabled in this profile, or the connection keeps preferences inside the page process.',
  readOnly: 'The settings document is read-only, so changes cannot be saved.',
  noPrimitives: 'This dsh ships no settings primitives package (@deepseek-ai/dsh-client-ui-primitives), so the form cannot render.',
  summary: (parts) => parts.join(' · '),
};

/** 用户层是否含这一格（= 已覆盖）。 */
function hasUserField(snapshot, field) {
  const user = snapshot === undefined || snapshot === null ? null : snapshot.user;
  return user !== undefined && user !== null && Object.prototype.hasOwnProperty.call(user, field);
}

/** 取当前生效值。 */
function fieldValue(snapshot, field) {
  const value = snapshot === undefined || snapshot === null ? null : snapshot.value;
  return value === undefined || value === null ? undefined : value[field];
}

/** 认语言：先问 locale 服务，再问浏览器，认不出英文就中文。 */
function pickCopy(locale) {
  let active = null;
  try { active = locale ? locale.getSnapshot().active : null; } catch { active = null; }
  const tag = active !== null && active !== undefined ? active : (typeof navigator === 'undefined' ? null : navigator.language);
  return typeof tag === 'string' && tag.toLowerCase().startsWith('en') ? COPY_EN : COPY_ZH;
}

/**
 * 读宿主主题快照的**原始对象**。
 * 必须是稳定引用：useSyncExternalStore 按引用比较快照，每次 new 一个对象会把它推进
 * 「getSnapshot 每次都在变」的死循环（React 直接抛错、卡片整个不渲染）。
 * 宿主自己的 getTheme() 在两次变更之间就返回同一个冻结对象，所以直接透传；
 * 读失败时回落到下面这个模块级常量（也是稳定引用）。
 * @param service - ctx.theme。
 * @returns 宿主快照，或固定的回落对象。
 */
const THEME_FALLBACK = Object.freeze({ preference: null, active: Object.freeze({ colorScheme: null }) });
function themeSnapshotOf(service) {
  try {
    const snap = service.getTheme();
    return snap === undefined || snap === null ? THEME_FALLBACK : snap;
  } catch {
    return THEME_FALLBACK;
  }
}

/**
 * 渲染 codex-ui 的配置。
 * @param props - 座位注入的 scope / theme / watchTheme / locale，以及宿主给的视图。
 * @returns 表单，或组合包页要的一行摘要。
 */
function CodexUiSettingsCard({ scope, theme, themeForm, watchTheme, previewTheme, locale, view }) {
  if (REACT === null || JSX === null) {
    return JSX === null && REACT === null ? null : null;
  }
  const { useCallback, useMemo, useState, useSyncExternalStore } = REACT;
  const { jsx, jsxs } = JSX;
  const snapshot = useSyncExternalStore(
    useCallback((listener) => scope.subscribe(listener), [scope]),
    () => scope.getSnapshot(),
  );
  /* 订阅走宿主事件；快照用宿主的稳定对象，派生值在渲染里算（见 themeSnapshotOf 的注释）。 */
  const themeSnapshot = useSyncExternalStore(
    useCallback((listener) => {
      if (typeof watchTheme !== 'function') return () => {};
      return watchTheme(() => listener());
    }, [watchTheme]),
    useCallback(() => themeSnapshotOf(theme), [theme]),
  );
  const copy = useMemo(() => pickCopy(locale), [locale]);
  /* preference 是偏好档（light/dark/system）；variant 是它当前解析出的那一套。 */
  const preference = themeSnapshot.preference;
  const scheme = themeSnapshot.active === undefined || themeSnapshot.active === null ? null : themeSnapshot.active.colorScheme;
  const onBody = typeof document !== 'undefined' && document.body !== null && document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
  const variant = scheme === 'dark' || scheme === 'light' ? scheme : onBody;
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /* 分段控件上先显示用户点的那个值：写文档是异步的，不暂存的话控件会滞后一拍。 */
  const [pendingTheme, setPendingTheme] = useState(null);
  const { useEffect } = REACT;
  useEffect(() => {
    if (pendingTheme !== null && pendingTheme === preference) setPendingTheme(null);
  }, [pendingTheme, preference]);

  const fieldOf = useCallback((base) => base + (variant === 'light' ? 'Light' : 'Dark'), [variant]);
  /**
   * 切主题。
   *
   * 不调 `theme.setTheme(id)`：那是「先本地乐观发布、再让 adopt() 从文档回读」的写法 ——
   * 文档往返慢的时候会依次画出 新值 → 旧值 → 新值（用户看到的「黑 → 白 → 黑」）。
   * 这里改成**先把偏好写进主题插件自己的设置文档**（宿主源码里的命名空间 `ui-theme`、
   * 字段 `preference`，与服务内部 host.set 的那一次写完全同路），
   * 于是发布方只剩服务自己的 adopt()，一次点击只会发布一次。
   * 写入未被接受才退回服务入口，保证功能不会因为这条捷径失效。
   *
   * 那 0.8s 的往返不能白等：点下去先让浏览器半**本地预览**目标主题（立刻变颜色），
   * 宿主确认到达时那边会幂等地交还，所以既快又不会二次跳变。
   * @param id - 'light' | 'dark' | 'system'。
   */
  const switchTheme = useCallback(async (id) => {
    if (id !== 'light' && id !== 'dark' && id !== 'system') return;
    setPendingTheme(id);
    if (typeof previewTheme === 'function') previewTheme(id);
    const canWriteForm = themeForm !== null && themeForm !== undefined && typeof themeForm.set === 'function';
    if (canWriteForm) {
      try {
        if ((await themeForm.set('preference', id)) !== false) return;
      } catch (error) {
        console.warn('[codex-ui] 直接写主题偏好失败，退回服务入口：', error);
      }
    }
    setPendingTheme(null);
    try {
      theme.setTheme(id);
    } catch (error) {
      console.warn('[codex-ui] 切主题失败：', error);
    }
  }, [theme, themeForm]);
  const unavailable = snapshot.status === 'unavailable';
  const readOnly = snapshot.writable === false;
  const disabled = saving || unavailable || readOnly;

  /** 写入一格并回读确认。 */
  const write = useCallback(async (field, next) => {
    setSaving(true);
    setFailed(false);
    let landed = false;
    try {
      const accepted = await scope.set(field, next);
      landed = accepted !== false && fieldValue(scope.getSnapshot(), field) === next;
    } catch { landed = false; }
    setFailed(!landed);
    setSaving(false);
  }, [scope]);

  /** 清掉用户层的覆盖。 */
  const clear = useCallback(async (field) => {
    setSaving(true);
    setFailed(false);
    let landed = false;
    try {
      await scope.unset(field);
      landed = !hasUserField(scope.getSnapshot(), field);
    } catch { landed = false; }
    setFailed(!landed);
    setSaving(false);
  }, [scope]);

  /** 提交一个文本/色值草稿：空串写的是清除。 */
  const commitText = useCallback(async (field, draft, validate) => {
    const text = String(draft).trim();
    if (text !== '' && validate(text) === false) return;
    setDrafts((prev) => { const next = { ...prev }; delete next[field]; return next; });
    if (text === '') { await clear(field); return; }
    await write(field, text);
  }, [clear, write]);

  const draftOf = (field) => (Object.prototype.hasOwnProperty.call(drafts, field) ? drafts[field] : undefined);
  const setDraft = (field, value) => setDrafts((prev) => ({ ...prev, [field]: value }));

  if (view === 'summary') {
    const accent = fieldValue(snapshot, fieldOf('accent'));
    const contrast = fieldValue(snapshot, fieldOf('contrast'));
    const parts = [];
    if (__override.isHex(accent)) parts.push(accent);
    parts.push(copy.contrast + ' ' + String(contrast ?? __override.DEFAULT_CONTRAST[variant]));
    return jsx('span', { children: copy.summary(parts) });
  }
  if (unavailable) {
    return jsx('p', { className: 'cx-note', role: 'status', children: copy.unavailable });
  }
  if (PRIMITIVES === null) {
    return jsx('p', { className: 'cx-note', role: 'status', children: copy.noPrimitives });
  }
  const { Button, SegmentedControl, Switch, Tag } = PRIMITIVES;

  /** 一行：标签 + 说明 + 覆盖徽标 + 控件。 */
  const row = (key, label, desc, control, field) => jsxs('div', {
    className: 'cx-row',
    children: [
      jsxs('div', {
        className: 'cx-row__text',
        children: [
          jsxs('div', {
            className: 'cx-row__label',
            children: [
              jsx('span', { children: label }),
              field !== undefined && hasUserField(snapshot, field) ? jsx(Tag, { tone: 'outline', children: copy.overridden }) : null,
            ],
          }, 'label'),
          desc === null ? null : jsx('div', { className: 'cx-row__desc', children: desc }),
        ],
      }, 'text'),
      jsxs('div', {
        className: 'cx-row__control',
        children: [
          control,
          field !== undefined && hasUserField(snapshot, field)
            ? jsx(Button, { variant: 'ghost', size: 'sm', disabled, onClick: () => clear(field), children: copy.reset })
            : null,
        ],
      }, 'control'),
    ],
  }, key);

  /** 颜色行：色块 + 十六进制文本框。 */
  const colorRow = (base, label, desc) => {
    const field = fieldOf(base);
    const current = fieldValue(snapshot, field);
    const draft = draftOf(field);
    const text = draft !== undefined ? draft : (__override.isHex(current) ? current : '');
    return row(base, label, desc, [
      jsx('input', {
        key: 'swatch',
        className: 'cx-swatch',
        type: 'color',
        disabled,
        'aria-label': label,
        value: __override.isHex(current) ? current : __override.SKIN_DEFAULTS[variant][base],
        onChange: (event) => write(field, event.target.value),
      }),
      jsx('input', {
        key: 'hex',
        className: 'cx-hex',
        type: 'text',
        disabled,
        spellCheck: false,
        'aria-label': label + ' hex',
        placeholder: copy.follow,
        value: text,
        onChange: (event) => setDraft(field, event.target.value),
        onBlur: () => { if (draftOf(field) !== undefined) commitText(field, draftOf(field), __override.isHex); },
        onKeyDown: (event) => { if (event.key === 'Enter') commitText(field, draftOf(field) ?? text, __override.isHex); },
      }),
    ], field);
  };

  /** 字体行：一条文本输入。 */
  const fontRow = (field, label, desc) => {
    const current = fieldValue(snapshot, field);
    const draft = draftOf(field);
    const text = draft !== undefined ? draft : (typeof current === 'string' ? current : '');
    return row(field, label, desc, jsx('input', {
      className: 'cx-text',
      type: 'text',
      disabled,
      spellCheck: false,
      'aria-label': label,
      placeholder: copy.follow,
      value: text,
      onChange: (event) => setDraft(field, event.target.value),
      onBlur: () => { if (draftOf(field) !== undefined) commitText(field, draftOf(field), __override.isFontStack); },
      onKeyDown: (event) => { if (event.key === 'Enter') commitText(field, draftOf(field) ?? text, __override.isFontStack); },
    }), field);
  };

  /** 对比度行：滑杆 + 读数，拖动时只改草稿，松手/失焦才写。 */
  const contrastRow = () => {
    const field = fieldOf('contrast');
    const current = fieldValue(snapshot, field);
    const base = current === undefined || current === null ? __override.DEFAULT_CONTRAST[variant] : current;
    const draft = draftOf(field);
    const shown = draft !== undefined ? draft : base;
    return row('contrast', copy.contrast, copy.contrastDesc, [
      jsx('input', {
        key: 'range',
        className: 'cx-range',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        disabled,
        'aria-label': copy.contrast,
        value: shown,
        onChange: (event) => setDraft(field, Number(event.target.value)),
        onPointerUp: () => { if (draftOf(field) !== undefined) write(field, draftOf(field)); },
        onKeyUp: () => { if (draftOf(field) !== undefined) write(field, draftOf(field)); },
        onBlur: () => { if (draftOf(field) !== undefined) write(field, draftOf(field)); },
      }),
      jsx('span', { key: 'value', className: 'cx-range__value', children: String(shown) }),
    ], field);
  };

  const translucent = fieldValue(snapshot, 'translucentSidebar') === true;

  return jsxs('div', {
    className: 'cx-form',
    children: [
    jsx('p', { className: 'cx-note', children: copy.intro }),
    row('theme', copy.theme, copy.themeDesc, jsx(SegmentedControl, {
      id: 'codex-ui-theme',
      value: pendingTheme ?? preference,
      label: copy.theme,
      disabled,
      options: [
        { value: 'light', label: copy.light },
        { value: 'dark', label: copy.dark },
        { value: 'system', label: copy.system },
      ],
      onChange: switchTheme,
    })),
    colorRow('accent', copy.accent, copy.accentDesc),
    colorRow('surface', copy.surface, copy.surfaceDesc),
    colorRow('ink', copy.ink, copy.inkDesc),
    fontRow('fontUi', copy.fontUi, copy.fontUiDesc),
    fontRow('fontCode', copy.fontCode, copy.fontCodeDesc),
    row('modelPicker', copy.modelPicker, copy.modelPickerDesc, jsx(Switch, {
      checked: fieldValue(snapshot, 'modelPicker') !== false,
      disabled,
      label: copy.modelPicker,
      onChange: (next) => write('modelPicker', next),
    }), 'modelPicker'),
    row('translucent', copy.translucent, copy.translucentDesc, jsx(Switch, {
      checked: translucent,
      disabled,
      label: copy.translucent,
      onChange: (next) => write('translucentSidebar', next),
    }), 'translucentSidebar'),
    contrastRow(),
    readOnly ? jsx('p', { className: 'cx-note', role: 'status', children: copy.readOnly }) : null,
    failed ? jsx('p', { className: 'cx-error', role: 'status', children: copy.failed }) : null,
    ],
  }, 'form');
}

/**
 * 把卡片挂到组合包页的座位上。
 * @param ctx - 客户端上下文。
 * @param Card - 卡片组件。
 * @param extras - 额外的注入面（宿主 theme 服务、它的设置表单、变更订阅）。
 */
function registerSettingsCard(ctx, Card, extras = {}) {
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: PLUGIN_ID,
    inject: () => ({
      scope: ctx.configForms.get(__override.SETTINGS_ENTRY_ID),
      /* 宿主主题服务、它的设置表单、变更订阅、本地预览：卡片上「主题」那一行的读写通道。 */
      theme: extras.theme,
      themeForm: extras.themeForm,
      watchTheme: extras.watchTheme,
      previewTheme: extras.previewTheme,
      /* locale 缺席时 inject 会给 undefined，卡片自己回落到浏览器语言。 */
      locale: ctx.reflect.get('locale'),
    }),
  }, Card));
}

    /* 生成期注入的模型选择器组件（源：src/model-picker.js）。
       占位符必须落在**赋值右值**上（和 __override 一样）：它替换出来的是一段 IIFE 表达式，
       写成裸语句就只是求值完丢掉，后面引用 __modelPicker 直接 ReferenceError。 */
    const __modelPicker = (() => {
/**
 * model-picker.js — Codex 模型选择器（浏览器半，构建期拼进 client.js）。
 *
 * 为什么是**自己的 DOM**而不是改宿主的菜单：
 * 0.5.0 那条路（把宿主菜单里的竖列 radio 用 CSS 重排成轨）实测切换卡顿、界面简陋。
 * 根因是选择器挂在宿主菜单上（:has() 触发的后代失效 × 宿主在 aria-busy 窗口里的反复
 * 重渲染），而且只重排了 4 行名字 —— 没有模型列表、没有分组、没有可拖的控件。
 * 所以这里改成 dsh-claude-style 的做法：**不注册 slot，靠 DOM 顶替**。
 *   1. 找到 [data-slot="conversation.input.model"]，给它原有的子节点打上 HOST_ATTR；
 *   2. 样式表把带 HOST_ATTR 的那个节点 display:none（宿主触发器仍在 React 树里，只是看不见）；
 *   3. 自己的触发器挂进同一个 slot，弹层挂 document.body。
 * 数据与提交全部走宿主唯一真源（ctx.get('modelDirectories')），本模块不缓存模型列表。
 *
 * 驱动契约（读 @deepseek-ai/dsh-client-ui-model-selection 与 dsh-claude-style 的用法得到）：
 *   ctx.get('uiSession').current.value.key ?? ctx.get('sessions').list.current   → 会话 id
 *   ctx.get('modelDirectories').directoryFor(id)  → ModelDirectory（会话未就绪时会抛，要 try）
 *     dir.load()                                  → 拉目录（一次 RPC，宿主侧缓存）
 *     dir.select({ provider, model, reasoningEffort })  → 提交（异步；拒绝由宿主 toast 报）
 *     dir.store.getSnapshot() → { status, groups, current }
 *     dir.store.subscribe(cb)                     → 响应式（订阅 store，不是 dir 实例）
 *
 * 卡顿的解码：宿主把目录在**整个 selectModel 往返**期间标成 selecting，走网络的适配器要好几秒。
 * 所以渲染有一道签名守卫：只要手上已经有分组和当前项，状态变化就不重画列表 —— 改档位时
 * 卡片不会被清空、也不会掉帧。
 */

/** 打在宿主触发器上的属性；样式表靠它隐藏宿主控件。 */
const HOST_ATTR = 'data-codex-ui-model-host';
/** 自己那两棵 DOM 的类名根。 */
const BTN_CLASS = 'codex-mp-trigger';
const POP_CLASS = 'codex-mp-popover';
/** 弹层与触发器之间的间距（Codex 的 composer 弹层是 6px）。 */
const POPOVER_GAP = 6;
/** 视口边距。 */
const POPOVER_MARGIN = 8;

/**
 * 当前会话 id。
 * dsh 0.2 起 Session Controller 的 list.current 已废，主视图选择由 uiSession 投影给出；
 * 先读新源，再回退旧字段，老宿主才不会一方失灵。
 * @param ctx - 客户端上下文。
 * @returns 会话 id，取不到时 null。
 */
function currentSessionId(ctx) {
  try {
    const uiSession = ctx.get('uiSession');
    const value = uiSession === undefined || uiSession === null ? null : uiSession.current;
    const key = value === undefined || value === null || value.value === undefined || value.value === null
      ? undefined
      : value.value.key;
    if (typeof key === 'string') return key;
    const sessions = ctx.get('sessions');
    const list = sessions === undefined || sessions === null ? null : sessions.list;
    const snapshot = list === undefined || list === null ? null : list.getSnapshot();
    const legacy = snapshot === undefined || snapshot === null ? null : snapshot.current;
    return typeof legacy === 'string' ? legacy : null;
  } catch (error) {
    return null;
  }
}

/**
 * 解析当前会话的 ModelDirectory。会话作用域还没物化时宿主会抛，这里吞掉并返回 null，
 * 下一趟订阅回调再试 —— 不猜、不缓存失败。
 * @param ctx - 客户端上下文。
 * @param id - 会话 id。
 * @returns ModelDirectory 或 null。
 */
function directoryFor(ctx, id) {
  if (typeof id !== 'string' || id === '') return null;
  try {
    const dirs = ctx.get('modelDirectories');
    if (dirs === undefined || dirs === null || typeof dirs.directoryFor !== 'function') return null;
    return dirs.directoryFor(id) ?? null;
  } catch (error) {
    return null;
  }
}

/**
 * 把指针在轨上的连续比例换成最近档位下标（松手对齐用）。
 * @param ratio - 0..1 的连续比例（超界会被夹住）。
 * @param count - 档位个数。
 * @returns 0..count-1 的下标。
 */
function snapIndex(ratio, count) {
  if (!Number.isFinite(count) || count <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return Math.round(clamped * (count - 1));
}

/**
 * 功率轨几何：拇指中心可以走的区间是 [thumb/2, width - thumb/2]，档位等距分布在其中。
 * 这就是 Codex _Thumb 的行程（left 从 14px 走到 width-14px），本模块照搬。
 * @param index - 档位下标。
 * @param count - 档位个数。
 * @param width - 轨宽（px）。
 * @param thumb - 拇指直径（px）。
 * @returns 拇指中心相对轨左边缘的 px 偏移。
 */
function tickOffset(index, count, width, thumb) {
  if (!Number.isFinite(width) || width <= thumb) return thumb / 2;
  if (count <= 1) return width / 2;
  const span = width - thumb;
  const i = Math.min(count - 1, Math.max(0, index));
  return thumb / 2 + span * (i / (count - 1));
}

/** 由指针位置反推连续比例（与 tickOffset 互逆）。 */
function offsetRatio(clientX, left, width, thumb) {
  if (!Number.isFinite(width) || width <= thumb) return 0;
  return Math.min(1, Math.max(0, (clientX - left - thumb / 2) / (width - thumb)));
}

/**
 * 安装模型选择器。返回一个句柄：setEnabled 换开关、dispose 全撤。
 * @param ctx - 客户端上下文。
 * @param doc - document（夹具可注入）。
 * @returns 句柄。
 */
function installModelPicker(ctx, doc) {
  const document_ = doc ?? globalThis.document;
  let enabled = true;
  let disposed = false;
  let slot = null;
  let hostRoot = null;
  let button = null;
  let popover = null;
  let listBox = null;
  let railBox = null;
  let footBox = null;
  let open = false;
  let dir = null;
  let unsubscribe = null;
  let lastSignature = '';
  let dragging = null;
  let observer = null;
  /* 拖动中的连续比例：只在拖动时非 null，松手清零并提交。 */
  let draftRatio = null;

  /** 目录实例（每会话一次）；会话切换时重订阅。 */
  function refreshDirectory() {
    const id = currentSessionId(ctx);
    if (dir !== null && dir.__sessionId === id) return dir;
    const next = directoryFor(ctx, id);
    if (unsubscribe !== null) { unsubscribe(); unsubscribe = null; }
    dir = next;
    if (dir !== null) {
      dir.__sessionId = id;
      if (typeof dir.load === 'function') {
        const pending = dir.load();
        if (pending !== undefined && pending !== null && typeof pending.catch === 'function') pending.catch(() => {});
      }
      if (dir.store !== undefined && dir.store !== null && typeof dir.store.subscribe === 'function') {
        unsubscribe = dir.store.subscribe(() => { render(); });
      }
    }
    return dir;
  }

  /** 目录快照；没有目录时为 null。 */
  function snapshot() {
    if (dir === null || dir.store === undefined || dir.store === null) return null;
    return dir.store.getSnapshot() ?? null;
  }

  /** 当前项解析到分组与模型条目。 */
  function currentOf(snap) {
    if (snap === null || snap.current === undefined || snap.current === null) return null;
    const groups = Array.isArray(snap.groups) ? snap.groups : [];
    for (let g = 0; g < groups.length; g += 1) {
      if (groups[g].id !== snap.current.provider) continue;
      const models = Array.isArray(groups[g].models) ? groups[g].models : [];
      for (let m = 0; m < models.length; m += 1) {
        if (models[m].id === snap.current.model) return { group: groups[g], model: models[m] };
      }
    }
    return null;
  }

  /** 推理元数据 + 生效档位；模型不支持思考时返回 null（此时不画轨）。 */
  function effortOf(snap, active) {
    if (active === null || active.model.reasoning === undefined || active.model.reasoning === null) return null;
    const reasoning = active.model.reasoning;
    const efforts = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
    if (efforts.length === 0) return null;
    const saved = snap.current.reasoningEffort;
    const effective = saved !== undefined && saved !== null ? saved : reasoning.defaultEffort;
    let index = -1;
    for (let i = 0; i < efforts.length; i += 1) if (efforts[i].id === effective) index = i;
    return { reasoning, efforts, effective, index: index < 0 ? 0 : index, name: index < 0 ? efforts[0].name : efforts[index].name };
  }

  /** 提交一次选择；拒绝交给宿主的 toast，本模块不吞掉错误信息也不重复上报。 */
  function commit(selection) {
    if (dir === null || typeof dir.select !== 'function') return;
    const pending = dir.select(selection);
    if (pending !== undefined && pending !== null && typeof pending.catch === 'function') pending.catch(() => {});
  }

  /** 模型名 / 档位名的显示文案（目录还没到时退回已保存的 id，与宿主同一策略）。 */
  function labels(snap) {
    const active = currentOf(snap);
    if (active === null) {
      const current = snap === null ? null : snap.current;
      return { model: current === null ? '' : current.model, effort: '' };
    }
    const effort = effortOf(snap, active);
    return { model: active.model.name || active.model.id, effort: effort === null ? '' : effort.name };
  }

  function element(tag, className, text) {
    const node = document_.createElement(tag);
    if (className !== '') node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** 触发器：模型名 + 档位名 + chevron（Codex ModelPickerTriggerLabel 的三段）。 */
  function ensureButton() {
    if (button !== null && button.isConnected) return button;
    button = element('button', BTN_CLASS);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const model = element('span', 'codex-mp-trigger-model');
    const effort = element('span', 'codex-mp-trigger-effort');
    const chevron = element('span', 'codex-mp-trigger-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.append(model, effort, chevron);
    button.addEventListener('click', (event) => { event.stopPropagation(); toggle(); });
    return button;
  }

  function ensurePopover() {
    if (popover !== null && popover.isConnected) return popover;
    popover = element('div', POP_CLASS);
    popover.setAttribute('role', 'menu');
    popover.setAttribute('data-open', 'false');
    listBox = element('div', 'codex-mp-list');
    footBox = element('div', 'codex-mp-foot');
    railBox = element('div', 'codex-mp-rail');
    railBox.setAttribute('tabindex', '0');
    railBox.setAttribute('role', 'slider');
    railBox.setAttribute('aria-label', '推理强度');
    footBox.appendChild(railBox);
    popover.append(listBox, footBox);
    popover.addEventListener('pointerdown', (event) => event.stopPropagation());
    document_.body.appendChild(popover);
    lastSignature = '';
    wireRail();
    return popover;
  }

  /** 弹层定位：默认在触发器正上方，空间不够翻到下方，横向夹在视口内。 */
  function position() {
    if (popover === null || button === null) return;
    const anchor = button.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = Math.min(Math.max(POPOVER_MARGIN, anchor.left), globalThis.innerWidth - width - POPOVER_MARGIN);
    let top = anchor.top - height - POPOVER_GAP;
    if (top < POPOVER_MARGIN) top = anchor.bottom + POPOVER_GAP;
    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(top) + 'px';
  }

  function setOpen(next) {
    open = next;
    if (open) ensurePopover();
    if (popover !== null) popover.setAttribute('data-open', open ? 'true' : 'false');
    if (button !== null) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { render(); position(); }
  }

  function toggle() { setOpen(!open); }

  /* ── 轨：Codex _Track / _Range / _Tick / _Thumb ─────────────────────────── */

  /** 读轨宽与拇指直径（都从实际布局读，不写死，主题改字号也不会错位）。 */
  function railMetrics() {
    const rect = railBox.getBoundingClientRect();
    const thumb = 28;
    return { left: rect.left, width: rect.width, thumb };
  }

  /** 画轨：N 个可点圆点 + 一个拇指 + 一段强调色条。档位 < 2 时整条收起。 */
  function renderRail(effort) {
    railBox.textContent = '';
    if (effort === null) {
      railBox.setAttribute('data-empty', 'true');
      railBox.removeAttribute('aria-valuenow');
      return;
    }
    railBox.removeAttribute('data-empty');
    const efforts = effort.reasoning.efforts;
    const metrics = railMetrics();
    const range = element('span', 'codex-mp-rail-range');
    const thumb = element('span', 'codex-mp-rail-thumb');
    railBox.append(range, thumb);
    const ticks = [];
    for (let i = 0; i < efforts.length; i += 1) {
      const tick = element('button', 'codex-mp-tick');
      tick.type = 'button';
      tick.dataset.effort = efforts[i].id;
      tick.dataset.index = String(i);
      tick.setAttribute('aria-label', efforts[i].name);
      tick.style.left = tickOffset(i, efforts.length, metrics.width, metrics.thumb) + 'px';
      if (i === effort.index) tick.dataset.selected = 'true';
      tick.addEventListener('click', (event) => { event.stopPropagation(); commit({ provider: currentOf(snapshot()).group.id, model: currentOf(snapshot()).model.id, reasoningEffort: efforts[i].id }); });
      railBox.appendChild(tick);
      ticks.push(tick);
    }
    railBox.dataset.count = String(efforts.length);
    railBox.setAttribute('aria-valuemin', '0');
    railBox.setAttribute('aria-valuemax', String(efforts.length - 1));
    railBox.setAttribute('aria-valuenow', String(effort.index));
    railBox.setAttribute('aria-valuetext', effort.name);
    paintRail(effort.index, efforts.length);
    void ticks;
  }

  /** 把拇指与色条画到某个位置上（position 可以是连续值，拖动时用）。 */
  function paintRail(position, count) {
    if (railBox === null || railBox.getAttribute('data-empty') === 'true') return;
    const metrics = railMetrics();
    const max = Math.max(0, count - 1);
    const offset = max === 0 ? metrics.width / 2 : metrics.thumb / 2 + (metrics.width - metrics.thumb) * (position / max);
    const thumb = railBox.querySelector('.codex-mp-rail-thumb');
    const range = railBox.querySelector('.codex-mp-rail-range');
    if (thumb !== null) thumb.style.left = offset + 'px';
    if (range !== null) range.style.width = Math.max(0, offset) + 'px';
  }

  /** 拖动：按下抓取、移动自由滑动（不提交）、松手对齐最近档位并提交一次。 */
  function wireRail() {
    railBox.addEventListener('pointerdown', (event) => {
      if (railBox.getAttribute('data-empty') === 'true') return;
      const count = Number(railBox.dataset.count);
      if (!Number.isFinite(count) || count < 2) return;
      event.preventDefault();
      const metrics = railMetrics();
      dragging = { count, thumb: metrics.thumb };
      railBox.setPointerCapture(event.pointerId);
      railBox.dataset.dragging = 'true';
      draftRatio = offsetRatio(event.clientX, metrics.left, metrics.width, metrics.thumb);
      railBox.style.setProperty('--codex-mp-motion', '0s');
      paintRail(draftRatio * (count - 1), count);
    });
    railBox.addEventListener('pointermove', (event) => {
      if (dragging === null) return;
      const metrics = railMetrics();
      draftRatio = offsetRatio(event.clientX, metrics.left, metrics.width, metrics.thumb);
      paintRail(draftRatio * (dragging.count - 1), dragging.count);
    });
    const release = (event) => {
      if (dragging === null) return;
      const count = dragging.count;
      dragging = null;
      railBox.removeAttribute('data-dragging');
      railBox.style.removeProperty('--codex-mp-motion');
      if (typeof railBox.releasePointerCapture === 'function' && railBox.hasPointerCapture !== undefined && railBox.hasPointerCapture(event.pointerId)) {
        railBox.releasePointerCapture(event.pointerId);
      }
      const index = snapIndex(draftRatio === null ? 0 : draftRatio, count);
      draftRatio = null;
      paintRail(index, count);
      const active = currentOf(snapshot());
      const efforts = active === null || active.model.reasoning === undefined ? [] : (active.model.reasoning.efforts || []);
      if (active !== null && efforts[index] !== undefined) {
        commit({ provider: active.group.id, model: active.model.id, reasoningEffort: efforts[index].id });
      }
    };
    railBox.addEventListener('pointerup', release);
    railBox.addEventListener('pointercancel', release);
    railBox.addEventListener('keydown', (event) => {
      if (railBox.getAttribute('data-empty') === 'true') return;
      const count = Number(railBox.dataset.count);
      const now = Number(railBox.getAttribute('aria-valuenow'));
      let next = now;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, now - 1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(count - 1, now + 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else return;
      event.preventDefault();
      const active = currentOf(snapshot());
      const efforts = active === null || active.model.reasoning === undefined ? [] : (active.model.reasoning.efforts || []);
      if (active !== null && efforts[next] !== undefined) {
        paintRail(next, count);
        commit({ provider: active.group.id, model: active.model.id, reasoningEffort: efforts[next].id });
      }
    });
  }

  /* ── 列表与渲染 ────────────────────────────────────────────────────────── */

  function buildRow(group, model, selected) {
    const rowEl = element('button', 'codex-mp-row');
    rowEl.type = 'button';
    rowEl.setAttribute('role', 'menuitemradio');
    rowEl.setAttribute('aria-checked', selected ? 'true' : 'false');
    const copy = element('span', 'codex-mp-row-copy');
    copy.appendChild(element('span', 'codex-mp-row-name', model.name || model.id));
    if (typeof model.description === 'string' && model.description !== '') {
      copy.appendChild(element('span', 'codex-mp-row-desc', model.description));
    }
    const check = element('span', 'codex-mp-row-check');
    if (selected) {
      check.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    rowEl.append(copy, check);
    rowEl.addEventListener('click', (event) => {
      event.stopPropagation();
      commit({ provider: group.id, model: model.id });
      setOpen(false);
    });
    return rowEl;
  }

  /**
   * 重画。签名里只放会改变列表长相的东西（状态、当前项、每个分组的模型数），
   * 且**只要已经有分组和当前项就不因 selecting 重画** —— 那是宿主整个选型往返的状态，
   * 拿它当重画条件就会在改档位时把卡片清空（dsh-claude-style 注释里记的同一个坑）。
   */
  function render() {
    refreshDirectory();
    const snap = snapshot();
    const names = labels(snap);
    if (button !== null) {
      const modelEl = button.querySelector('.codex-mp-trigger-model');
      const effortEl = button.querySelector('.codex-mp-trigger-effort');
      if (modelEl !== null) modelEl.textContent = names.model;
      if (effortEl !== null) { effortEl.textContent = names.effort; effortEl.toggleAttribute('data-hidden', names.effort === ''); }
    }
    if (open === false || listBox === null) return;
    const status = snap === null ? 'idle' : snap.status;
    const groups = snap === null || !Array.isArray(snap.groups) ? [] : snap.groups;
    const active = currentOf(snap);
    const effort = effortOf(snap, active);
    let signature = [status, active === null ? '' : active.group.id + '/' + active.model.id, effort === null ? '' : effort.index].join('|');
    for (let g = 0; g < groups.length; g += 1) signature += ';' + groups[g].id + ':' + (Array.isArray(groups[g].models) ? groups[g].models.length : 0);
    if (signature !== lastSignature) {
      lastSignature = signature;
      listBox.textContent = '';
      const seated = groups.length > 0 && active !== null;
      if (!seated && (status === 'idle' || status === 'loading' || status === 'selecting')) {
        listBox.appendChild(element('div', 'codex-mp-status', '正在载入模型…'));
      } else if (groups.length === 0) {
        listBox.appendChild(element('div', 'codex-mp-status', '没有可用模型'));
      } else {
        for (let g = 0; g < groups.length; g += 1) {
          const group = groups[g];
          const models = Array.isArray(group.models) ? group.models : [];
          if (models.length === 0) continue;
          listBox.appendChild(element('div', 'codex-mp-group', group.name || group.id));
          for (let m = 0; m < models.length; m += 1) {
            const selected = active !== null && active.group.id === group.id && active.model.id === models[m].id;
            listBox.appendChild(buildRow(group, models[m], selected));
          }
        }
      }
    }
    renderRail(effort);
    if (open) position();
  }

  /* ── 席位接管 ──────────────────────────────────────────────────────────── */

  /** 给宿主触发器打标记；React 换节点后会丢，所以每趟 sync 都补一次。 */
  function markHost() {
    if (slot === null) return;
    const root = slot.firstElementChild;
    if (root === null || root === button) return;
    hostRoot = root;
    if (!root.hasAttribute(HOST_ATTR)) root.setAttribute(HOST_ATTR, '');
  }

  /** 把我们的触发器放回 slot，并守住最后一个子节点（宿主可能在自己那边追加）。 */
  function sync() {
    if (disposed || !enabled) return;
    const next = document_.querySelector('[data-slot="conversation.input.model"]');
    if (next === null) return;
    slot = next;
    /* 顺序要紧：先把自己那棵放好，再打隐藏标记。反过来写的话，
       ensureButton 万一抛错，宿主触发器已经被藏，用户就既没有我们的也没有宿主的。 */
    const node = ensureButton();
    if (node.parentElement !== slot || slot.lastElementChild !== node) slot.appendChild(node);
    markHost();
    render();
  }

  /** 撤干净：节点、属性、订阅、观察器一个不留，宿主触发器立刻恢复。 */
  function drop() {
    setOpen(false);
    if (observer !== null) observer.disconnect();
    observedSlot = null;
    if (unsubscribe !== null) { unsubscribe(); unsubscribe = null; }
    dir = null;
    lastSignature = '';
    if (button !== null && button.parentElement !== null) button.parentElement.removeChild(button);
    if (popover !== null && popover.parentElement !== null) popover.parentElement.removeChild(popover);
    if (hostRoot !== null && hostRoot.hasAttribute(HOST_ATTR)) hostRoot.removeAttribute(HOST_ATTR);
    hostRoot = null;
  }

  /* 三件事决定这里的观察策略：
     ① 装配时 composer 往往还没挂上（真 GUI 实测 6s 才稳定），所以一开始不能只等一次性 sync；
     ② 宿主重渲染会把 slot 的子节点整棵换掉（我们的按钮与标记都会掉），所以要盯 slot 的 childList；
     ③ 盯 body 整棵子树能覆盖①，但 React 应用每次渲染都会打进来，代价正是 0.5.0 卡顿的来源。
     所以：**槽位没找到之前用 1s 轮询**（一次 querySelector，可忽略），**找到之后改挂 slot 的
     childList 观察器**（只收自己那一格的变动）。槽位被整棵换掉时 isConnected 转 false，自动退回轮询。 */
  if (typeof globalThis.MutationObserver === 'function') {
    observer = new globalThis.MutationObserver(() => { if (enabled) sync(); });
  }
  let observedSlot = null;
  function attach() {
    if (disposed || !enabled) return;
    if (observedSlot === null || !observedSlot.isConnected) sync();
    if (slot !== null && slot.isConnected && observedSlot !== slot) {
      if (observer !== null) observer.disconnect();
      observedSlot = slot;
      if (observer !== null) observer.observe(slot, { childList: true });
    }
  }

  const onDocumentPointerDown = (event) => {
    if (open === false) return;
    if (popover !== null && popover.contains(event.target)) return;
    if (button !== null && button.contains(event.target)) return;
    setOpen(false);
  };
  const onKeyDown = (event) => { if (event.key === 'Escape' && open) setOpen(false); };
  const onResize = () => { if (open) position(); };
  document_.addEventListener('pointerdown', onDocumentPointerDown, true);
  document_.addEventListener('keydown', onKeyDown, true);
  globalThis.addEventListener('resize', onResize);

  attach();
  const poll = globalThis.setInterval(attach, 1000);

  return {
    /** 开关。关掉即把席位还给宿主，与没装插件时逐字节相同。 */
    setEnabled(next) {
      const value = next !== false;
      if (value === enabled) return;
      enabled = value;
      if (enabled) sync(); else drop();
    },
    /** 当前是否接管着席位（验收用）。 */
    isActive() { return enabled && hostRoot !== null && hostRoot.hasAttribute(HOST_ATTR); },
    /** 手动重画（验收用）。 */
    refresh() { sync(); },
    dispose() {
      disposed = true;
      drop();
      globalThis.clearInterval(poll);
      if (observer !== null) observer.disconnect();
      document_.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document_.removeEventListener('keydown', onKeyDown, true);
      globalThis.removeEventListener('resize', onResize);
    },
  };
}

/** 构建期把本模块包成 IIFE 时暴露给模板的名字。 */
const MODEL_PICKER_EXPORTS = ['HOST_ATTR', 'BTN_CLASS', 'POP_CLASS', 'currentSessionId', 'directoryFor', 'snapIndex', 'tickOffset', 'offsetRatio', 'installModelPicker'];

return { HOST_ATTR, BTN_CLASS, POP_CLASS, currentSessionId, directoryFor, snapIndex, tickOffset, offsetRatio, installModelPicker };
})();
    /** 模型选择器句柄；没有它就说明组件没挂上，设置页那一行也就无从联动。 */
    let picker = null;

    /**
     * 这里导出的是 cordis **服务名**，与 package.json 的 dsh.client.inject 不是一回事：
     *   · package.json 的 dsh.client.inject 列**包名**，只用于客户端模块图排序；
     *   · 本处导出的 inject 列**服务名**，loader 拿它逐个 ctx.get() 判断依赖是否就绪，
     *     缺一个这条 entry 就永远停在 pending，整个 web boot 报
     *     `1 entry did not activate` 直接起不来。
     * 曾把包名 `@deepseek-ai/dsh-client-ui-slots` 写在这里。而 0.1.7 的客户端里它是
     * 静态模块、不注册同名服务（服务名是 `slots`，由 @deepseek-ai/dsh-client-ui-renderer
     * 提供），于是 entry 卡死、桌面端白屏报错。对照官方与第三方插件（dshmarket、
     * dsh-chatgpt-subscription、dsh-client-ui-model-capabilities）：导出的 inject
     * 一律是 ["slots", "locale", "remote", …] 这种短服务名。
     *
     * `configForms` 由 @deepseek-ai/dsh-client-ui-settings 提供（其构造器里 super(ctx, "configForms")），
     * 是组合包页那张配置卡的读写通道；本插件的 engines 锁定了带它的宿主版本，故直接声明。
     *
     * `theme` 由 @deepseek-ai/dsh-client-ui-theme 提供（`ctx.provide("theme", …)`），是宿主主题偏好的
     * **唯一写入口**：卡片上那一行「主题」写的就是它，与「设置 → 通用 → 外观」同一处，
     * 所以切完整个应用一起变，不是卡片自己的界面状态。
     */
    const inject = ['slots', 'configForms', 'theme'];

    /**
     * 注入样式表并打上作用域根属性。
     *
     * 关键：**没有 effect 也要把样式留着**。旧版这里写的是 else dispose()，
     * 即「ctx.effect 不可用 → 注入完立刻删掉，连 data-codex-ui 一起收回」——
     * 表现就是插件完全没生效、控制台一行报错都没有，是最难查的一种失败。
     * 现在降级为「注入但不可回收 + 一条 warn」。
     *
     * @param ctx - 客户端上下文。
     */
    function apply(ctx) {
      const root = document.documentElement;
      root.setAttribute(ROOT_ATTR, '');
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = PLUGIN_ID + '/theme.css';
      tag.textContent = CSS;
      document.head.appendChild(tag);
      const dispose = () => {
        tag.remove();
        root.removeAttribute(ROOT_ATTR);
      };
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => dispose, 'codex-ui: stylesheet');
      } else {
        console.warn('[codex-ui] ctx.effect 不可用：样式已注入，但不会随 fiber 卸载回收。');
      }
      /* 模型选择器：自己的 DOM（不碰宿主菜单）。失败只降级 —— 组件在把宿主触发器
         藏起来之前会先把自己的控件放好，所以这里的失败等于「什么都没发生」。 */
      try {
        picker = __modelPicker.installModelPicker(ctx);
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => picker.dispose(), 'codex-ui: model picker');
        }
      } catch (error) {
        console.warn('[codex-ui] 模型选择器挂载失败，宿主控件照常：', error);
      }
      /* 设置页那一半：任何一步失败都只降级，不能连皮肤一起拖下水。 */
      try {
        installSettings(ctx, root);
      } catch (error) {
        console.warn('[codex-ui] 设置页挂载失败，皮肤照常：', error);
      }
    }

    /**
     * 挂上覆盖层与组合包页的配置卡。
     * @param ctx - 客户端上下文。
     * @param root - <html>。
     */
    function installSettings(ctx, root) {
      const forms = ctx.configForms === undefined || ctx.configForms === null ? null : ctx.configForms;
      const scope = forms === null ? null : forms.get(__override.SETTINGS_ENTRY_ID);
      if (scope === null || scope === undefined) {
        /* 没有设置服务：不注册座位、不加覆盖层，皮肤照常。 */
        console.warn('[codex-ui] 没有 configForms 服务：设置页不可用，皮肤照常。');
        return;
      }
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = PLUGIN_ID + '/settings-override.css';
      document.head.appendChild(tag);
      const render = () => {
        const snapshot = scope.getSnapshot();
        /* 文档还没到（status=loading / 连接刚重连）时 value 是 undefined。
           这时**保持现状**：把已生效的覆盖撤掉会让用户看到自己的设置闪一下没了。
           真正的「没有覆盖」是 value 存在且字段为空 —— 那条路径照旧清空。 */
        if (snapshot !== undefined && snapshot !== null && snapshot.value === undefined) return;
        const values = snapshot === undefined || snapshot === null || snapshot.value === null ? {} : snapshot.value;
        /* 开关默认开：字段缺省（老设置文档里没有这一项）也当开。 */
        if (picker !== null) picker.setEnabled(values.modelPicker !== false);
        const css = __override.themeOverrideCss(values);
        tag.textContent = css;
        /* 没有覆盖时连属性一起摘掉：默认态与「没装设置页」逐字节相同。 */
        if (css === '') root.removeAttribute(__override.OVERRIDE_ATTR);
        else root.setAttribute(__override.OVERRIDE_ATTR, '');
      };
      render();
      const off = typeof scope.subscribe === 'function' ? scope.subscribe(render) : null;
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          if (typeof off === 'function') off();
          tag.remove();
          root.removeAttribute(__override.OVERRIDE_ATTR);
        }, 'codex-ui: settings override');
      }
      /* 切主题时关掉过渡：交叉淡出看起来就是「闪」。两帧后摘掉，切换变成一次到位。 */
      const suppressTransitions = () => {
        root.setAttribute(SWITCH_ATTR, '');
        requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute(SWITCH_ATTR)));
      };

      /* ── 主题的本地预览 ──────────────────────────────────────────────────
         点下去到变色原本要等一次设置文档往返（实测 780–824ms）。这里把目标主题先应用掉，
         宿主稍后带着同样结果回来时幂等地交还给它。 */
      let preview = null;
      let previewTimer = 0;
      /** 按宿主自己的方式打主题：body 上的 palette 属性 + html 的 color-scheme。 */
      const applyScheme = (scheme) => {
        if (typeof document.body.toggleAttribute === 'function') document.body.toggleAttribute('data-ds-dark-theme', scheme === 'dark');
        root.style.colorScheme = scheme;
      };
      /** 目标偏好 → 实际那一套（system 跟随系统，与宿主同一套解析规则）。 */
      const schemeOf = (target) => {
        if (target === 'dark' || target === 'light') return target;
        return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      };
      /**
       * 结束预览。
       * @param confirmed - true 表示宿主已经带着同一个结果发布过，文档就是真相；
       *                    false 表示等超时了，按宿主当前的真值回滚，绝不把预览当成结果。
       */
      const endPreview = (confirmed) => {
        if (preview === null) return;
        if (previewTimer !== 0) { clearTimeout(previewTimer); previewTimer = 0; }
        preview = null;
        root.removeAttribute(PREVIEW_ATTR);
        if (confirmed) return;
        try {
          const active = themeServiceActive();
          if (active !== null) applyScheme(active);
        } catch { /* 读不到服务就保持现状，不做二次猜测 */ }
      };
      /** 宿主主题服务当前解析出的那一套；读不到返回 null。 */
      const themeServiceActive = () => {
        const snap = ctx.theme === undefined || ctx.theme === null ? null : ctx.theme.getTheme();
        const scheme = snap === undefined || snap === null || snap.active === undefined || snap.active === null ? null : snap.active.colorScheme;
        return scheme === 'dark' || scheme === 'light' ? scheme : null;
      };
      /**
       * 立刻按目标主题显示（不等文档往返）。
       * @param target - 'light' | 'dark' | 'system'。
       */
      const previewTheme = (target) => {
        if (target !== 'light' && target !== 'dark' && target !== 'system') return;
        const scheme = schemeOf(target);
        preview = { target, scheme };
        root.setAttribute(PREVIEW_ATTR, scheme);
        suppressTransitions();
        applyScheme(scheme);
        if (previewTimer !== 0) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => endPreview(false), PREVIEW_TIMEOUT_MS);
      };

      if (typeof ctx.on === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => ctx.on('theme/change', (snapshot) => {
          suppressTransitions();
          const scheme = snapshot === undefined || snapshot === null || snapshot.active === undefined || snapshot.active === null ? null : snapshot.active.colorScheme;
          /* 发布结果与预览一致 ⇒ 文档已落地，交还给宿主（幂等，看不见第二次跳变）。 */
          if (preview !== null && scheme === preview.scheme) endPreview(true);
        }), 'codex-ui: theme change');
        ctx.effect(() => () => endPreview(false), 'codex-ui: theme preview cleanup');
      }
      registerSettingsCard(ctx, CodexUiSettingsCard, {
        theme: ctx.theme,
        /* 主题插件自己的设置表单（命名空间 ui-theme，字段 preference）。
           卡片写主题偏好走它，而不是 theme.setTheme() —— 原因见 settings-card.js 里的注释。 */
        themeForm: typeof ctx.configForms.get === 'function' ? ctx.configForms.get('ui-theme') : null,
        /* 主题变更走宿主事件：layout 侧也是 ctx.on("theme/change", …) 这一个口子。 */
        watchTheme: (listener) => (typeof ctx.on === 'function' ? ctx.on('theme/change', listener) : () => {}),
        /* 点下去立刻按目标主题显示，文档往返在背后跑。 */
        previewTheme,
      });
    }

    return { apply, inject, PLUGIN_ID };
  },
});
