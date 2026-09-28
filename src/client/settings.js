/**
 * 设置：覆盖层（用户在设置卡改的值 → 一条运行时 <style>）+ 主题预览 + 组合包页的配置卡。
 */
import { OVERRIDE_ATTR, PLUGIN_ID } from './constants.js';
import { formValue } from './host.js';
import { themeOverrideCss } from './override.js';
import { SettingsCard } from './settings-card.js';
import { installThemePreview } from './theme-preview.js';

/**
 * @param ctx - 客户端上下文（configForms / theme / slots 都在插件的 inject 里）。
 * @returns 本插件的设置表单（模型选择器的开关也读它）。
 */
export function installSettings(ctx) {
  const form = ctx.configForms.get(PLUGIN_ID);
  installOverride(ctx, form);
  const previewTheme = installThemePreview(ctx);
  /* 这些引用只建一次：卡片的 useSyncExternalStore 按订阅函数的身份决定要不要重订。 */
  const themeForm = ctx.configForms.get('ui-theme'); // 主题插件自己的表单，卡片写主题偏好走它（见卡片 switchTheme）
  const watchTheme = (listener) => ctx.on('theme/change', listener);
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: PLUGIN_ID,
    inject: () => ({
      scope: ctx.configForms.get(PLUGIN_ID),
      theme: ctx.theme,
      themeForm,
      watchTheme,
      previewTheme,
      locale: ctx.reflect.get('locale'),
    }),
  }, SettingsCard));
  return form;
}

/** 覆盖层：默认值下是空串且不打属性 —— 与没有设置页逐字节相同。 */
function installOverride(ctx, form) {
  const root = document.documentElement;
  const tag = document.createElement('style');
  tag.dataset.plugin = PLUGIN_ID;
  tag.dataset.pluginCss = PLUGIN_ID + '/settings-override.css';
  document.head.appendChild(tag);
  let last = null;
  const render = () => {
    const values = formValue(form);
    if (values === undefined) return;
    const css = themeOverrideCss(values);
    /* 设置镜像里任何命名空间一变（切主题也算）都会回调这里：同样的 CSS 不重写，免得触发整页样式重算。 */
    if (css === last) return;
    last = css;
    tag.textContent = css;
    root.toggleAttribute(OVERRIDE_ATTR, css !== '');
  };
  render();
  const off = form.subscribe(render);
  ctx.effect(() => () => {
    off();
    tag.remove();
    root.removeAttribute(OVERRIDE_ATTR);
  }, 'codex-ui: settings override');
}
