/**
 * 读宿主服务的两个小工具（设置覆盖层、设置卡、模型选择器共用）。
 */

/**
 * 设置表单的当前值。设置文档还没送达（status=loading、连接刚重连）时 value 是 undefined，
 * 这时返回 undefined，调用方应**保持现状** —— 撤掉已生效的覆盖会让用户的设置闪一下没了。
 * @param form - configForms.get(id) 的结果。
 * @returns 取值对象；未送达时 undefined。
 */
export function formValue(form) {
  const value = form.getSnapshot().value;
  return value === undefined ? undefined : (value ?? {});
}

/**
 * 界面语言是不是英文：先问宿主 locale 服务，再问浏览器；认不出就当中文。
 * @param locale - ctx.reflect.get('locale')，可能缺席。
 * @returns true 为英文。
 */
export function isEnglish(locale) {
  let active = null;
  try { active = locale?.getSnapshot().active ?? null; } catch { active = null; }
  const tag = typeof active === 'string' ? active : (typeof navigator === 'undefined' ? '' : navigator.language);
  return typeof tag === 'string' && tag.toLowerCase().startsWith('en');
}
