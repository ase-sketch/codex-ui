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
    /** 生成期注入的样式表文本。 */
    const CSS = /*__CODEX_UI_CSS__*/ null;
    /** 生成期注入的覆盖层模块（源：src/override.js）。 */
    const __override = /*__CODEX_UI_OVERRIDE__*/ null;
    /* 生成期注入的设置卡片（源：src/settings-card.js）。 */
    /*__CODEX_UI_SETTINGS__*/ null

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
      /* 切主题的两帧内关掉过渡（见 SWITCH_ATTR 的注释）。宿主事件与卡片用的是同一个口子。 */
      if (typeof ctx.on === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => ctx.on('theme/change', () => {
          root.setAttribute(SWITCH_ATTR, '');
          requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute(SWITCH_ATTR)));
        }), 'codex-ui: theme switch guard');
      }
      registerSettingsCard(ctx, CodexUiSettingsCard, {
        theme: ctx.theme,
        /* 主题插件自己的设置表单（命名空间 ui-theme，字段 preference）。
           卡片写主题偏好走它，而不是 theme.setTheme() —— 原因见 settings-card.js 里的注释。 */
        themeForm: typeof ctx.configForms.get === 'function' ? ctx.configForms.get('ui-theme') : null,
        /* 主题变更走宿主事件：layout 侧也是 ctx.on("theme/change", …) 这一个口子。 */
        watchTheme: (listener) => (typeof ctx.on === 'function' ? ctx.on('theme/change', listener) : () => {}),
      });
    }

    return { apply, inject, PLUGIN_ID };
  },
});
