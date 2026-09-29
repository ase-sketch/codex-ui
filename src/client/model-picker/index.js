/**
 * 模型选择器 B 面接到宿主上。
 *
 * 等 modelDirectories 服务就绪再挂：ctx.inject(deps, fn) 是宿主自己挂 composer 模型位的同一个口子。
 * 它不能进插件的 inject 列表 —— 那里的名字全是必需的，缺一个整个皮肤都不激活；服务撤走时 fn 的
 * 作用域连同我们的节点一起回收。
 * 设置卡的「Codex 模型选择器」（modelPicker，默认开）关掉即 setEnabled(false)：自建节点全撤，宿主那一格立刻复原。
 */
import { formValue } from '../host.js';
import { mountModelPicker } from './component.js';

/**
 * @param ctx - 客户端上下文。
 * @param form - 本插件的设置表单；设置那一半没挂上时为 null（此时按默认开）。
 */
export function installModelPicker(ctx, form) {
  /** 设置里的开关；设置文档还没到时返回 null（保持现状，不先接管再撤回）。 */
  const wanted = () => {
    if (form === null) return true;
    const value = formValue(form);
    return value === undefined ? null : value.modelPicker !== false;
  };
  ctx.inject(['modelDirectories'], (scope) => {
    const picker = mountModelPicker({
      models: scope.modelDirectories,
      /* 席位祖先上没有 data-conversation-session 时退到主视图会话（uiSession 投影）。 */
      sessionFallback: () => ctx.reflect.get('uiSession')?.current?.value?.key ?? null,
      locale: ctx.reflect.get('locale'),
      enabled: wanted() === true,
    });
    const off = form?.subscribe(() => {
      const next = wanted();
      if (next !== null) picker.setEnabled(next);
    });
    scope.effect(() => () => {
      off?.();
      picker.dispose();
    }, 'codex-ui: model picker');
  });
}
