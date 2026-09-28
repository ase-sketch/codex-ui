/**
 * 模型选择器的纯逻辑（无 DOM；check.mjs 直接单测）：功率轨几何、目录快照 → 视图、列表签名。
 *
 * 数据契约（@deepseek-ai/dsh-client-ui-model-selection 0.1.7-rc.2 的 ModelDirectory）：
 *   store.getSnapshot() → { current, retainedEffort, groups, status, pending, error }
 *     status  : 'loading' | 'ready' | 'selecting' | 'error'（整个 selectModel 往返都是 selecting）
 *     groups  : [{ id, name, models: [{ id, name, description?, reasoning?: { defaultEffort?, efforts: [{ id, name }] } }] }]
 *     current : { provider, model, reasoningEffort? } | null
 *     pending : 正在往返的那次 selection | null
 */

/** Codex _ThumbScale 28px：拇指中心的行程是 [14, 宽 − 14]。 */
export const THUMB_SIZE = 28;

/**
 * 松手对齐：连续比例 → 最近档位下标。
 * @param ratio - 0..1（超界夹住，非数当 0）。
 * @param count - 档位数。
 * @returns 0..count-1。
 */
export function snapIndex(ratio, count) {
  if (!Number.isFinite(count) || count <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return Math.round(clamped * (count - 1));
}

/**
 * 档位 → 连续比例（拇指、色条与圆点共用的那个 --codex-mp-pos）。单档时居中。
 * @param index - 档位下标。
 * @param count - 档位数。
 * @returns 0..1。
 */
export function indexRatio(index, count) {
  if (!Number.isFinite(count) || count <= 1) return 0.5;
  return Math.min(1, Math.max(0, index / (count - 1)));
}

/**
 * 指针位置 → 连续比例：拇指中心只能走 [thumb/2, width − thumb/2]（Codex _Thumb 的行程）。
 * @param clientX - 指针横坐标。
 * @param left - 轨左沿。
 * @param width - 轨宽。
 * @param thumb - 拇指直径。
 * @returns 0..1。
 */
export function offsetRatio(clientX, left, width, thumb = THUMB_SIZE) {
  if (!Number.isFinite(width) || width <= thumb) return 0;
  return Math.min(1, Math.max(0, (clientX - left - thumb / 2) / (width - thumb)));
}

/**
 * 与 CSS 同一条公式的像素值（夹具与验收用）：calc(14px + (100% − 28px) × ratio)。
 * @param ratio - 0..1。
 * @param width - 轨宽。
 * @param thumb - 拇指直径。
 * @returns 相对轨左沿的 px。
 */
export function ratioOffset(ratio, width, thumb = THUMB_SIZE) {
  return thumb / 2 + (width - thumb) * ratio;
}

/**
 * 分组排序：与宿主菜单同序（deepseek-account → deepseek-official → 其余保持原序）。
 * @param groups - 目录里的分组。
 * @returns 新数组。
 */
export function sortGroups(groups) {
  const rank = (group) => (group.id === 'deepseek-account' ? 0 : group.id === 'deepseek-official' ? 1 : 2);
  return (Array.isArray(groups) ? groups : []).map((group, i) => [group, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([group]) => group);
}

/**
 * 席位祖先上宿主 ConversationRoot 打的会话 id；没有则 null。
 * @param slot - 席位元素。
 */
export function domSessionOf(slot) {
  const id = slot?.closest?.('[data-conversation-session]')?.getAttribute('data-conversation-session');
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * 席位所属的会话 id：先看祖先上的标记（右栏侧边聊天有自己的席位），取不到再退到主视图会话。
 * @param slot - 席位元素。
 * @param fallback - 返回主视图会话 id 的函数。
 * @returns 会话 id 或 null。
 */
export function sessionIdOf(slot, fallback) {
  const fromDom = domSessionOf(slot);
  if (fromDom !== null) return fromDom;
  try {
    const key = fallback?.();
    return typeof key === 'string' && key !== '' ? key : null;
  } catch {
    return null;
  }
}

/**
 * 目录快照 → 这一席位要显示的一切（纯函数，宿主 ModelSelect 的派生逻辑逐条对齐）。
 * pending 若是同一模型上的改档，档位按 pending 乐观显示 —— 往返 ~1.1s 里轨不回弹。
 * @param snap - dir.store.getSnapshot()。
 * @returns 视图模型。
 */
export function viewOf(snap) {
  const empty = { groups: [], current: null, choice: null, efforts: [], index: -1, effective: undefined, hasReasoning: false, pending: null, pendingEffort: false, status: 'loading', error: null, retainedEffort: undefined };
  if (snap === undefined || snap === null) return empty;
  const groups = sortGroups(snap.groups);
  const current = snap.current === undefined ? null : snap.current;
  let choice = null;
  if (current !== null) {
    for (const group of groups) {
      const model = (Array.isArray(group.models) ? group.models : []).find((m) => m.id === current.model);
      if (group.id === current.provider && model !== undefined) { choice = { group, model }; break; }
    }
  }
  const reasoning = choice === null || choice.model.reasoning === undefined || choice.model.reasoning === null ? null : choice.model.reasoning;
  const efforts = reasoning === null || !Array.isArray(reasoning.efforts) ? [] : reasoning.efforts;
  const pending = snap.pending === undefined ? null : snap.pending;
  const pendingEffort = pending !== null && current !== null && pending.provider === current.provider && pending.model === current.model
    && pending.reasoningEffort !== current.reasoningEffort;
  const saved = pendingEffort ? pending.reasoningEffort : (current === null ? undefined : current.reasoningEffort);
  const effective = saved !== undefined && saved !== null ? saved : (reasoning === null ? undefined : reasoning.defaultEffort);
  return {
    groups,
    current,
    choice,
    efforts,
    index: efforts.findIndex((level) => level.id === effective),
    effective,
    hasReasoning: reasoning !== null,
    pending,
    pendingEffort,
    status: typeof snap.status === 'string' ? snap.status : 'loading',
    error: typeof snap.error === 'string' && snap.error !== '' ? snap.error : null,
    retainedEffort: snap.retainedEffort,
  };
}

/**
 * 列表签名：只含「列表长什么样」—— 不含 status（selecting 期间不重画），
 * 含 pending 的那一行（行尾转圈要画出来）。
 * @param view - viewOf 的结果。
 * @returns 字符串。
 */
export function listSignature(view) {
  const parts = [view.current === null ? '' : view.current.provider + '/' + view.current.model];
  parts.push(view.pending === null ? '' : view.pending.provider + '/' + view.pending.model);
  parts.push(view.groups.length === 0 ? view.status + ':' + (view.error ?? '') : '');
  for (const group of view.groups) {
    parts.push(group.id + '=' + group.name + ':' + (Array.isArray(group.models) ? group.models.map((m) => m.id + '|' + m.name + '|' + (m.description ?? '')).join(',') : ''));
  }
  return parts.join(';');
}
