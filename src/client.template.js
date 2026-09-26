/**
 * codex-ui — Browser half（由 scripts/install-plugin.mjs 从 client.template.js 生成，勿手改）。
 *
 * 职责：把 <workbench>/skins/codex-ink 的整套 Codex 化样式（L1/L2 令牌 + L3 组件层）
 * 以作用域 html[data-codex-ui] 注入到文档，并在卸载时完整收回。
 * 不依赖 skin-center / dsh-web-all：样式文本随本文件一起下发，无外部请求。
 */
window.__ModuleLoader__.load({
  id: 'codex-ui',
  factory: (require) => {
    /** 插件 id：style 标签归属标记。 */
    const PLUGIN_ID = 'codex-ui';
    /** 作用域根属性：所有规则都挂在它下面，卸载即整层失效。 */
    const ROOT_ATTR = 'data-codex-ui';
    /** 生成期注入的样式表文本。 */
    const CSS = /*__CODEX_UI_CSS__*/ null;
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
     * 本插件只注入样式表、不读 ctx.slots，声明它是为了保留「等 slots 就绪再上皮肤」的意图。
     */
    const inject = ['slots'];

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
        return;
      }
      console.warn('[codex-ui] ctx.effect 不可用：样式已注入，但不会随 fiber 卸载回收。');
    }

    return { apply, inject, PLUGIN_ID };
  },
});
