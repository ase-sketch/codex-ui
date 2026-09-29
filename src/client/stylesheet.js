/**
 * 皮肤样式：打上作用域根属性，注入内联的 theme.css（DSH 只下发 client.js，样式只能随它走）。
 * style[data-plugin] 是宿主的约定：插件卸载、热更新时模块系统会按它收走样式。
 */
import { THEME_CSS } from 'codex-ui:theme.css';
import { PLUGIN_ID, ROOT_ATTR } from './constants.js';

export function installStylesheet(ctx) {
  const root = document.documentElement;
  root.setAttribute(ROOT_ATTR, '');
  const tag = document.createElement('style');
  tag.dataset.plugin = PLUGIN_ID;
  tag.dataset.pluginCss = PLUGIN_ID + '/theme.css';
  tag.textContent = THEME_CSS;
  document.head.appendChild(tag);
  ctx.effect(() => () => {
    tag.remove();
    root.removeAttribute(ROOT_ATTR);
  }, 'codex-ui: stylesheet');
}
