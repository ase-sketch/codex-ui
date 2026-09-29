/**
 * codex-ui 浏览器半入口（DSH 客户端插件：导出 inject 与 apply，由 scripts/build.mjs 打成 client.js）。
 *
 * 功能按顺序装配：皮肤样式 → 设置（覆盖层、主题预览、配置卡）→ 模型选择器 → 设置模态框结构层。
 * 样式先挂且不包 try：它是插件本体；其余任何一项失败都只降级，不连累皮肤。
 * 新功能 = src/client/ 下一个模块导出 install(ctx) + 这里一行。
 */
import { installModelPicker } from './model-picker/index.js';
import { installSettings } from './settings.js';
import { installSettingsModal } from './settings-modal.js';
import { installStylesheet } from './stylesheet.js';

/**
 * cordis **服务名**（不是包名）：loader 逐个等它们就绪，缺一个本插件就不激活。
 * 只放必需的；可有可无的服务（modelDirectories）走 ctx.inject 子作用域。
 */
export const inject = ['slots', 'configForms', 'theme'];

export function apply(ctx) {
  installStylesheet(ctx);
  let form = null;
  try {
    form = installSettings(ctx);
  } catch (error) {
    console.warn('[codex-ui] 设置页挂载失败，皮肤照常：', error);
  }
  try {
    installModelPicker(ctx, form);
  } catch (error) {
    console.warn('[codex-ui] 模型选择器挂载失败，宿主原生菜单照常：', error);
  }
  /* 设置模态框的结构层（返回按钮 / 搜索 / 分组）：与设置表单彼此独立，谁挂不上都不连累对方。 */
  try {
    installSettingsModal(ctx);
  } catch (error) {
    console.warn('[codex-ui] 设置模态框结构层挂载失败，其余功能照常：', error);
  }
}
