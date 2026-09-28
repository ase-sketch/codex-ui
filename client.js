/* codex-ui 0.6.0 —— 由 scripts/build.mjs 从 src/client/ 与 skins/codex-ink/ 生成，勿手改。 */
window.__ModuleLoader__.load({
  id: "codex-ui",
  factory: (require) => {
/* src/client/host.js */
const __src_client_host = (() => {
/**
 * 读宿主服务的两个小工具（设置覆盖层、设置卡、模型选择器共用）。
 */

/**
 * 设置表单的当前值。设置文档还没送达（status=loading、连接刚重连）时 value 是 undefined，
 * 这时返回 undefined，调用方应**保持现状** —— 撤掉已生效的覆盖会让用户的设置闪一下没了。
 * @param form - configForms.get(id) 的结果。
 * @returns 取值对象；未送达时 undefined。
 */
function formValue(form) {
  const value = form.getSnapshot().value;
  return value === undefined ? undefined : (value ?? {});
}

/**
 * 界面语言是不是英文：先问宿主 locale 服务，再问浏览器；认不出就当中文。
 * @param locale - ctx.reflect.get('locale')，可能缺席。
 * @returns true 为英文。
 */
function isEnglish(locale) {
  let active = null;
  try { active = locale?.getSnapshot().active ?? null; } catch { active = null; }
  const tag = typeof active === 'string' ? active : (typeof navigator === 'undefined' ? '' : navigator.language);
  return typeof tag === 'string' && tag.toLowerCase().startsWith('en');
}
return { formValue, isEnglish };
})();

/* src/client/model-picker/view.js */
const __src_client_model_picker_view = (() => {
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
const THUMB_SIZE = 28;

/**
 * 松手对齐：连续比例 → 最近档位下标。
 * @param ratio - 0..1（超界夹住，非数当 0）。
 * @param count - 档位数。
 * @returns 0..count-1。
 */
function snapIndex(ratio, count) {
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
function indexRatio(index, count) {
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
function offsetRatio(clientX, left, width, thumb = THUMB_SIZE) {
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
function ratioOffset(ratio, width, thumb = THUMB_SIZE) {
  return thumb / 2 + (width - thumb) * ratio;
}

/**
 * 分组排序：与宿主菜单同序（deepseek-account → deepseek-official → 其余保持原序）。
 * @param groups - 目录里的分组。
 * @returns 新数组。
 */
function sortGroups(groups) {
  const rank = (group) => (group.id === 'deepseek-account' ? 0 : group.id === 'deepseek-official' ? 1 : 2);
  return (Array.isArray(groups) ? groups : []).map((group, i) => [group, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([group]) => group);
}

/**
 * 席位祖先上宿主 ConversationRoot 打的会话 id；没有则 null。
 * @param slot - 席位元素。
 */
function domSessionOf(slot) {
  const id = slot?.closest?.('[data-conversation-session]')?.getAttribute('data-conversation-session');
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * 席位所属的会话 id：先看祖先上的标记（右栏侧边聊天有自己的席位），取不到再退到主视图会话。
 * @param slot - 席位元素。
 * @param fallback - 返回主视图会话 id 的函数。
 * @returns 会话 id 或 null。
 */
function sessionIdOf(slot, fallback) {
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
function viewOf(snap) {
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
function listSignature(view) {
  const parts = [view.current === null ? '' : view.current.provider + '/' + view.current.model];
  parts.push(view.pending === null ? '' : view.pending.provider + '/' + view.pending.model);
  parts.push(view.groups.length === 0 ? view.status + ':' + (view.error ?? '') : '');
  for (const group of view.groups) {
    parts.push(group.id + '=' + group.name + ':' + (Array.isArray(group.models) ? group.models.map((m) => m.id + '|' + m.name + '|' + (m.description ?? '')).join(',') : ''));
  }
  return parts.join(';');
}
return { THUMB_SIZE, snapIndex, indexRatio, offsetRatio, ratioOffset, sortGroups, domSessionOf, sessionIdOf, viewOf, listSignature };
})();

/* src/client/model-picker/component.js */
const __src_client_model_picker_component = (() => {
const { isEnglish } = __src_client_host;
const { THUMB_SIZE, domSessionOf, indexRatio, listSignature, offsetRatio, sessionIdOf, snapIndex, viewOf } = __src_client_model_picker_view;
/**
 * 模型选择器 B 面的 DOM 组件：Codex 模型列表 + 推理等级功率轨，顶替 composer 的模型位。
 *
 * 顶替方式（不注册 slot、不动宿主的 React 树）：自己的触发器追加进 [data-slot="conversation.input.model"]，
 * 弹层挂 document.body；席位里有我们的触发器时，model-picker.css 用一条直接子代 :has() 把宿主那一格
 * display:none。不打标记属性 —— React 换掉宿主子节点时标记会丢、宿主控件闪回；摘掉触发器宿主立刻复原。
 * 数据与提交只走宿主的 ModelDirectory（store 订阅 / load / select），本组件不缓存模型列表。
 * 宿主在整个 selectModel 往返里把目录标成 selecting：列表签名不含 status，改档时卡片不重画不清空；
 * 往返期间轨与触发器按 pending 那一档乐观显示并转圈。
 */



const SLOT_SELECTOR = '[data-slot="conversation.input.model"]';
/** 自建节点的类名根（样式表只画 .codex-mp-*，不碰宿主任何节点）。 */
const TRIGGER_CLASS = 'codex-mp-trigger';
const POPOVER_CLASS = 'codex-mp-popover';
/** Codex --model-picker-power-slider-thumb-input-motion-duration：首帧 0s，16ms 后抬到 .3s。 */
const MOTION_ARM_MS = 16;
/** 弹层定位照宿主 ModelSelect 的 place()：右沿对齐触发器、上方留 8px、视口留 12px。 */
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 12;
const CHEVRON = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** 宿主给内置模型的说明做了本地化，按同一张表取（宿主 BUILTIN_DESCRIPTION_KEYS）。 */
const BUILTIN_DESCRIPTION_KEYS = {
  'deepseek-account/deepseek-v4-flash': 'option.deepseekV4Flash.description',
  'deepseek-account/deepseek-v4-pro': 'option.deepseekV4Pro.description',
  'deepseek-official/deepseek-v4-flash': 'option.deepseekV4Flash.description',
  'deepseek-official/deepseek-v4-pro': 'option.deepseekV4Pro.description',
};

/**
 * 文案。优先借宿主 model 命名空间（措辞与原生菜单逐字一致，也跟着宿主的语言走）；
 * 宿主没有这把钥匙时才落到这里。键名与宿主相同，en 的两条说明也用来判断「是不是内置原文」。
 */
const COPY = {
  zh: {
    'provider.account': 'DeepSeek Account',
    'trigger.fallback': '请选择模型',
    'trigger.loading': '正在加载模型…',
    'trigger.aria': '选择模型，当前 {model}',
    'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
    'menu.aria': '模型与推理等级',
    'menu.model': '模型',
    'menu.effort': '推理等级',
    'effort.providerDefault': 'Default',
    'error.action': '模型操作失败：{message}',
    'error.sessionInUse': '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。',
    'action.reload': '重新加载',
    'empty.models': '没有可用的模型。',
  },
  en: {
    'provider.account': 'DeepSeek Account',
    'option.deepseekV4Flash.description': 'Fast, efficient, and economical; suited to focused, routine, or parallel tasks.',
    'option.deepseekV4Pro.description': 'Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.',
    'trigger.fallback': 'Select model',
    'trigger.loading': 'Loading models…',
    'trigger.aria': 'Select model, current {model}',
    'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
    'menu.aria': 'Model and reasoning effort',
    'menu.model': 'Model',
    'menu.effort': 'Effort',
    'effort.providerDefault': 'Default',
    'error.action': 'Model operation failed: {message}',
    'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
    'action.reload': 'Reload',
    'empty.models': 'No models available.',
  },
};

/**
 * 挂上模型选择器。
 * @param env - { models: ctx.modelDirectories, sessionFallback: () => 主视图会话 id, locale, enabled? }。
 *              enabled: false 表示先不接管，等 setEnabled(true)（设置文档还没到时用，免得先接管再撤回闪一下）。
 * @returns 句柄：setEnabled / dispose。
 */
function mountModelPicker(env) {
  const models = env.models;
  /** slot 元素 → 席位状态。 */
  const seats = new Map();
  let enabled = env.enabled !== false;
  let disposed = false;
  /** 当前打开弹层的那一个席位。 */
  let openSeat = null;
  let popover = null;
  let listBox = null;
  let errorBox = null;
  let effortBox = null;
  let effortValue = null;
  let rail = null;
  let railSignature = '';
  let lastListSignature = '';
  let armTimer = 0;
  let drag = null;
  /** 最近一次提交失败的文案（弹层顶上那条）。 */
  let failure = null;

  /* ── 文案：先借宿主 model 命名空间（返回键名本身即没有），再落本表 ─────── */
  let hostT = null;
  try { hostT = env.locale?.bind?.('model') ?? null; } catch { hostT = null; }
  const fill = (template, params) => (params === undefined ? template : template.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)));
  const t = (key, params) => {
    if (hostT !== null) {
      try {
        const hosted = hostT(key, params);
        if (typeof hosted === 'string' && hosted !== key) return hosted;
      } catch { /* 宿主字典缺席就用本表 */ }
    }
    return fill(COPY[isEnglish(env.locale) ? 'en' : 'zh'][key] ?? COPY.zh[key] ?? key, params);
  };
  const groupName = (group) => (group.id === 'deepseek-account' ? t('provider.account') : (group.name || group.id));
  /* 内置模型的说明只有宿主字典里有中文；宿主字典缺席时 t() 会把键名原样还回来 —— 那就用目录自带的原文。 */
  const descriptionOf = (group, model) => {
    const key = BUILTIN_DESCRIPTION_KEYS[group.id + '/' + model.id];
    if (key === undefined || model.description !== COPY.en[key]) return model.description;
    const localized = t(key);
    return localized === key ? model.description : localized;
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ── 席位 ────────────────────────────────────────────────────────────── */
  function createSeat(slot) {
    const button = el('button', TRIGGER_CLASS);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    const model = el('span', 'codex-mp-trigger-model');
    const layers = el('span', 'codex-mp-effort-layers');
    layers.setAttribute('aria-hidden', 'true');
    const chevron = el('span', 'codex-mp-trigger-chevron');
    chevron.innerHTML = CHEVRON;
    button.append(model, layers, chevron);
    const seat = { slot, button, model, layers, layerKey: '', sessionId: null, fromFallback: false, dir: null, off: null };
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (openSeat === seat) close(false);
      else open(seat, event.detail === 0);
    });
    button.addEventListener('keydown', (event) => {
      /* 鼠标打开后焦点留在触发器上（宿主也是），Escape 必须在这里也能关 —— 宿主的键盘处理挂在整格根上。 */
      if (event.key === 'Escape' && openSeat === seat) {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (openSeat !== seat) open(seat, true);
      }
    });
    return seat;
  }

  /** 换绑会话：退订旧目录，解析新目录并订阅。会话作用域未物化时宿主会抛 —— 吞掉，下一趟再试。 */
  function bind(seat, sessionId) {
    seat.off?.();
    seat.off = null;
    seat.sessionId = sessionId;
    seat.dir = null;
    if (sessionId === null) return;
    try {
      const dir = models.directoryFor(sessionId);
      seat.off = dir.store.subscribe(() => onStore(seat));
      seat.dir = dir;
    } catch {
      seat.dir = null;
    }
  }

  const snapshotOf = (seat) => seat.dir?.store.getSnapshot() ?? null;

  /** 可以接管：宿主确实渲染了这一格（子代理会话里宿主返回 null，我们也不出头），且目录已有可显示的内容。 */
  const canSeat = (seat, view) => {
    const hostChild = [...seat.slot.children].some((child) => child !== seat.button);
    return hostChild && seat.dir !== null && (view.current !== null || view.groups.length > 0);
  };

  /** 对账一个席位；返回算好的视图（onStore 接着拿去画弹层，不再算第二遍）。 */
  function syncSeat(slot) {
    let seat = seats.get(slot);
    if (seat === undefined) { seat = createSeat(slot); seats.set(slot, seat); }
    const domId = domSessionOf(slot);
    seat.fromFallback = domId === null;
    const id = domId ?? sessionIdOf(null, env.sessionFallback);
    if (id !== seat.sessionId || seat.dir === null) bind(seat, id);
    const view = viewOf(snapshotOf(seat));
    if (!canSeat(seat, view)) {
      if (seat.button.parentElement !== null) seat.button.remove();
      if (openSeat === seat) close(false);
      return view;
    }
    paintTrigger(seat, view);
    if (seat.button.parentElement !== slot) slot.appendChild(seat.button);
    return view;
  }

  function dropSeat(seat) {
    if (openSeat === seat) close(false);
    seat.off?.();
    seat.button.remove();
    seats.delete(seat.slot);
  }

  /** 全量对账：新席位接上、失联席位撤掉。 */
  function scan() {
    if (disposed || !enabled) return;
    const live = new Set(document.querySelectorAll(SLOT_SELECTOR));
    for (const seat of [...seats.values()]) if (!live.has(seat.slot) || !seat.slot.isConnected) dropSeat(seat);
    for (const slot of live) syncSeat(slot);
  }

  function onStore(seat) {
    if (disposed || !enabled) return;
    const view = syncSeat(seat.slot);
    if (openSeat === seat) renderPopover(view);
  }

  /* ── 触发器 ──────────────────────────────────────────────────────────── */
  function effortLabelOf(view) {
    if (!view.hasReasoning) return view.retainedEffort;
    if (view.effective === undefined) return t('effort.providerDefault');
    const level = view.efforts.find((e) => e.id === view.effective);
    return level === undefined ? view.effective : level.name;
  }

  function paintTrigger(seat, view) {
    const waiting = view.current === null && view.status === 'loading';
    const modelLabel = waiting ? t('trigger.loading')
      : view.choice !== null ? view.choice.model.name
        : view.current === null ? t('trigger.fallback') : view.current.provider + '/' + view.current.model;
    const effortLabel = effortLabelOf(view);
    if (seat.model.textContent !== modelLabel) seat.model.textContent = modelLabel;
    /* 档位文字叠层（Codex _ModelPickerTriggerEffortText）：所有档名叠在同一格里，当前那层 data-active ——
       改档是模糊交叉淡入，不是换文本；格宽 = 最宽的那个名字，不跳宽。 */
    const names = view.hasReasoning ? [...(view.effective === undefined ? [t('effort.providerDefault')] : []), ...view.efforts.map((e) => e.name)] : [];
    if (effortLabel !== undefined && !names.includes(effortLabel)) names.push(effortLabel);
    const key = names.join('\u0000');
    if (key !== seat.layerKey) {
      seat.layerKey = key;
      seat.layers.textContent = '';
      for (const name of names) seat.layers.appendChild(el('span', 'codex-mp-effort-text', name));
    }
    /* 属性只在变了时才写：同一视图重复对账不触发样式失效。 */
    for (const layer of seat.layers.children) {
      const active = layer.textContent === effortLabel ? 'true' : 'false';
      if (layer.getAttribute('data-active') !== active) layer.setAttribute('data-active', active);
    }
    if (seat.layers.hidden !== (names.length === 0)) seat.layers.hidden = names.length === 0;
    const title = effortLabel === undefined ? modelLabel : modelLabel + ' · ' + effortLabel;
    if (seat.button.title !== title) seat.button.title = title;
    const aria = waiting ? t('trigger.loading') : view.current === null ? t('trigger.fallback')
      : effortLabel === undefined ? t('trigger.aria', { model: modelLabel }) : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel });
    if (seat.button.getAttribute('aria-label') !== aria) seat.button.setAttribute('aria-label', aria);
    if (seat.button.hasAttribute('data-pending') !== (view.pending !== null)) seat.button.toggleAttribute('data-pending', view.pending !== null);
  }

  /* ── 弹层 ────────────────────────────────────────────────────────────── */
  function ensurePopover() {
    if (popover !== null) return;
    popover = el('div', POPOVER_CLASS);
    popover.setAttribute('role', 'dialog');
    popover.hidden = true;
    errorBox = el('div', 'codex-mp-error');
    errorBox.setAttribute('role', 'alert');
    errorBox.hidden = true;
    listBox = el('div', 'codex-mp-list');
    listBox.setAttribute('role', 'radiogroup');
    effortBox = el('div', 'codex-mp-effort');
    const head = el('div', 'codex-mp-effort-head');
    head.appendChild(el('span', 'codex-mp-effort-label'));
    effortValue = el('span', 'codex-mp-effort-value');
    head.appendChild(effortValue);
    const container = el('div', 'codex-mp-container');
    rail = el('div', 'codex-mp-root');
    rail.setAttribute('role', 'slider');
    rail.tabIndex = 0;
    const track = el('div', 'codex-mp-track');
    track.appendChild(el('div', 'codex-mp-range'));
    const thumbScale = el('span', 'codex-mp-thumb-scale');
    thumbScale.appendChild(el('span', 'codex-mp-thumb'));
    rail.append(track, thumbScale);
    container.appendChild(rail);
    effortBox.append(head, container);
    popover.append(errorBox, listBox, effortBox);
    popover.addEventListener('keydown', onPopoverKey);
    popover.addEventListener('focusout', onFocusOut);
    wireRail();
    document.body.appendChild(popover);
  }

  function open(seat, viaKeyboard) {
    if (!enabled || disposed) return;
    if (openSeat !== null && openSeat !== seat) close(false);
    ensurePopover();
    openSeat = seat;
    failure = null;
    lastListSignature = '';
    railSignature = '';
    seat.button.setAttribute('aria-expanded', 'true');
    popover.setAttribute('aria-label', t('menu.aria'));
    listBox.setAttribute('aria-label', t('menu.model'));
    popover.setAttribute('data-reduced-motion', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'true' : 'false');
    /* 首帧不动画（拇指从 0 滑到当前档很难看）：Codex 的 thumb-input-motion-duration 首帧 0s、16ms 后抬到 .3s。 */
    rail.removeAttribute('data-armed');
    popover.hidden = false;
    renderPopover();
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { armTimer = 0; rail?.setAttribute('data-armed', 'true'); }, MOTION_ARM_MS);
    /* 宿主在打开菜单时刷新一次目录（reload()），这里同样做一次；结果经 store 订阅回来。子代理会话会拒绝，不刷新即可。 */
    seat.dir?.load().catch(() => {});
    if (viaKeyboard) {
      const checked = listBox.querySelector('[aria-checked="true"]') ?? listBox.querySelector('.codex-mp-row');
      checked?.focus();
    }
  }

  function close(restoreFocus) {
    if (openSeat === null) return;
    const seat = openSeat;
    openSeat = null;
    drag = null;
    if (popover !== null) popover.hidden = true;
    seat.button.setAttribute('aria-expanded', 'false');
    if (restoreFocus && seat.button.isConnected) seat.button.focus();
  }

  /** 宿主 place() 的同一套：右沿对齐触发器、上方 8px、夹在视口 12px 内。 */
  function place() {
    if (openSeat === null || popover === null || popover.hidden) return;
    const rect = openSeat.button.getBoundingClientRect();
    const w = popover.offsetWidth;
    const h = popover.offsetHeight;
    let x = rect.right - w;
    let y = rect.top - POPOVER_GAP - h;
    if (w > 0) x = Math.min(Math.max(x, POPOVER_MARGIN), innerWidth - w - POPOVER_MARGIN);
    if (h > 0) y = Math.min(Math.max(y, POPOVER_MARGIN), innerHeight - h - POPOVER_MARGIN);
    popover.style.left = Math.round(x) + 'px';
    popover.style.top = Math.round(y) + 'px';
  }

  function renderPopover(view = openSeat === null ? null : viewOf(snapshotOf(openSeat))) {
    if (openSeat === null || popover === null) return;
    errorBox.hidden = failure === null;
    errorBox.textContent = failure ?? '';
    const signature = listSignature(view);
    if (signature !== lastListSignature) {
      lastListSignature = signature;
      renderList(view);
    }
    renderEffort(view);
    place();
  }

  function renderList(view) {
    listBox.textContent = '';
    if (view.groups.length === 0) {
      const status = el('div', 'codex-mp-status');
      if (view.status === 'error') {
        status.textContent = t('error.action', { message: view.error ?? '' }) + ' ';
        const retry = el('button', 'codex-mp-retry', t('action.reload'));
        retry.type = 'button';
        retry.addEventListener('click', () => { openSeat?.dir?.load().catch(() => {}); });
        status.appendChild(retry);
      } else {
        status.textContent = view.status === 'loading' ? t('trigger.loading') : t('empty.models');
      }
      listBox.appendChild(status);
      return;
    }
    const titled = view.groups.length > 1;
    for (const group of view.groups) {
      const list = Array.isArray(group.models) ? group.models : [];
      if (list.length === 0) continue;
      if (titled) listBox.appendChild(el('div', 'codex-mp-group', groupName(group)));
      for (const model of list) listBox.appendChild(buildRow(view, group, model));
    }
  }

  function buildRow(view, group, model) {
    const selected = view.current !== null && view.current.provider === group.id && view.current.model === model.id;
    const pending = view.pending !== null && view.pending.provider === group.id && view.pending.model === model.id && !view.pendingEffort;
    const row = el('button', 'codex-mp-row');
    row.type = 'button';
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', selected ? 'true' : 'false');
    if (pending) row.setAttribute('aria-busy', 'true');
    const copy = el('span', 'codex-mp-row-copy');
    copy.appendChild(el('span', 'codex-mp-row-name', model.name || model.id));
    const description = descriptionOf(group, model);
    if (typeof description === 'string' && description !== '') {
      const desc = el('span', 'codex-mp-row-desc', description);
      desc.title = description;
      copy.appendChild(desc);
    }
    const check = el('span', 'codex-mp-row-check');
    /* pending 行尾换成转圈（宿主此时一个都不画，面板冻着像卡住）；勾选留给已生效的那一行。 */
    if (pending) check.appendChild(el('span', 'codex-mp-spinner'));
    else if (selected) check.innerHTML = CHECK;
    row.append(copy, check);
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      choose(group, model);
    });
    return row;
  }

  /* ── 功率轨 ──────────────────────────────────────────────────────────── */
  function renderEffort(view) {
    const show = view.hasReasoning && view.efforts.length > 0;
    effortBox.hidden = !show;
    if (!show) return;
    effortBox.querySelector('.codex-mp-effort-label').textContent = t('menu.effort');
    effortValue.textContent = '';
    if (view.pendingEffort) effortValue.appendChild(el('span', 'codex-mp-spinner'));
    effortValue.appendChild(el('span', '', effortLabelOf(view) ?? ''));
    rail.setAttribute('aria-label', t('menu.effort'));
    const signature = view.choice.group.id + '/' + view.choice.model.id + ':' + view.efforts.map((e) => e.id).join(',');
    if (signature !== railSignature) {
      railSignature = signature;
      for (const tick of rail.querySelectorAll('.codex-mp-tick')) tick.remove();
      const thumbScale = rail.querySelector('.codex-mp-thumb-scale');
      view.efforts.forEach((level, i) => {
        const tick = el('span', 'codex-mp-tick');
        tick.setAttribute('data-index', String(i));
        tick.title = level.name;
        /* 档位等距落在拇指行程 [14, 宽 − 14] 上 —— 与拇指、色条同一条 calc，零布局读。 */
        tick.style.left = 'calc(' + THUMB_SIZE / 2 + 'px + (100% - ' + THUMB_SIZE + 'px) * ' + indexRatio(i, view.efforts.length) + ')';
        rail.insertBefore(tick, thumbScale);
      });
      rail.setAttribute('aria-valuemin', '0');
      rail.setAttribute('aria-valuemax', String(view.efforts.length - 1));
      rail.setAttribute('data-count', String(view.efforts.length));
    }
    rail.toggleAttribute('data-unset', view.index < 0);
    if (view.index >= 0) {
      rail.setAttribute('aria-valuenow', String(view.index));
      rail.setAttribute('aria-valuetext', view.efforts[view.index].name);
    } else {
      rail.removeAttribute('aria-valuenow');
      rail.setAttribute('aria-valuetext', effortLabelOf(view) ?? '');
    }
    /* 拖动中不让 store 的回调把拇指拽回去。 */
    if (drag === null) paintRail(view.index < 0 ? null : indexRatio(view.index, view.efforts.length));
  }

  /**
   * 画到连续位置：拇指、色条、「已走过」的圆点都由同一个 --codex-mp-pos 驱动。
   * @param ratio - 0..1；null 表示没有生效档（跟随提供方默认），此时拇指与色条藏起、圆点全按未选画。
   */
  function paintRail(ratio) {
    rail.style.setProperty('--codex-mp-pos', String(ratio === null ? 0 : Number(ratio.toFixed(4))));
    const ticks = rail.querySelectorAll('.codex-mp-tick');
    const count = ticks.length;
    ticks.forEach((tick, i) => tick.setAttribute('data-selected', ratio !== null && indexRatio(i, count) <= ratio + 1e-6 ? 'true' : 'false'));
  }

  function currentEfforts() {
    if (openSeat === null) return null;
    const view = viewOf(snapshotOf(openSeat));
    return view.choice === null || view.efforts.length === 0 ? null : view;
  }

  function wireRail() {
    rail.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const view = currentEfforts();
      if (view === null) return;
      event.preventDefault();
      rail.focus({ preventScroll: true });
      rail.setAttribute('data-keyboard-focused', 'false');
      const rect = rail.getBoundingClientRect();
      drag = { pointerId: event.pointerId, left: rect.left, width: rect.width, count: view.efforts.length, ratio: offsetRatio(event.clientX, rect.left, rect.width) };
      try { rail.setPointerCapture(event.pointerId); } catch { /* 合成事件没有真指针 */ }
      rail.setAttribute('data-dragging', 'true');
      paintRail(drag.ratio);
    });
    rail.addEventListener('pointermove', (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) return;
      drag.ratio = offsetRatio(event.clientX, drag.left, drag.width);
      paintRail(drag.ratio);
    });
    const release = (event, commitIt) => {
      if (drag === null || event.pointerId !== drag.pointerId) return;
      const { count, ratio } = drag;
      drag = null;
      rail.removeAttribute('data-dragging');
      try { if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
      const view = currentEfforts();
      if (view === null) return;
      const index = commitIt ? snapIndex(ratio, count) : view.index;
      paintRail(index < 0 ? null : indexRatio(index, count));
      if (commitIt) chooseEffort(view, index);
    };
    rail.addEventListener('pointerup', (event) => release(event, true));
    rail.addEventListener('pointercancel', (event) => release(event, false));
    /* 捕获意外丢失（节点被换掉、系统手势）按取消处理：退回生效档，不提交半截拖动。 */
    rail.addEventListener('lostpointercapture', (event) => release(event, false));
    rail.addEventListener('keydown', (event) => {
      const view = currentEfforts();
      if (view === null) return;
      const last = view.efforts.length - 1;
      const now = view.index < 0 ? 0 : view.index;
      let next = null;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, now - 1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(last, now + 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      rail.setAttribute('data-keyboard-focused', 'true');
      paintRail(indexRatio(next, view.efforts.length));
      chooseEffort(view, next);
    });
    rail.addEventListener('focus', () => rail.setAttribute('data-keyboard-focused', rail.matches(':focus-visible') ? 'true' : 'false'));
    rail.addEventListener('blur', () => rail.setAttribute('data-keyboard-focused', 'false'));
  }

  /* ── 提交 ────────────────────────────────────────────────────────────── */
  function submit(seat, selection, closeOnOk) {
    if (seat.dir === null) return;
    failure = null;
    const report = (message) => {
      failure = message;
      if (openSeat === seat) renderPopover();
    };
    seat.dir.select(selection).then((result) => {
      if (result === undefined || result === null) return;
      if (result.ok) {
        if (closeOnOk && openSeat === seat) close(true);
        return;
      }
      const error = result.error ?? {};
      report(error.code === 'session/writer-held' ? t('error.sessionInUse') : t('error.action', { message: (error.code ?? '') + ': ' + (error.message ?? '') }));
    }, (error) => report(t('error.action', { message: String(error && error.message ? error.message : error) })));
  }

  /** 选模型：同一个就只关掉（宿主 choose()）；否则连带该模型的默认档位一起提交，成功后关。 */
  function choose(group, model) {
    const seat = openSeat;
    if (seat === null) return;
    const view = viewOf(snapshotOf(seat));
    if (view.pending !== null) return;
    if (view.current !== null && view.current.provider === group.id && view.current.model === model.id) { close(true); return; }
    const effort = model.reasoning?.defaultEffort;
    submit(seat, { provider: group.id, model: model.id, ...(effort === undefined ? {} : { reasoningEffort: effort }) }, true);
  }

  /** 改档：同一档不提交；弹层保持打开（轨上可以接着调）。 */
  function chooseEffort(view, index) {
    const seat = openSeat;
    if (seat === null || view.current === null) return;
    const level = view.efforts[index];
    if (level === undefined || level.id === view.effective) return;
    submit(seat, { provider: view.current.provider, model: view.current.model, reasoningEffort: level.id }, false);
  }

  /* ── 键盘与关闭 ─────────────────────────────────────────────────────── */
  function onPopoverKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.target instanceof HTMLElement && event.target.classList.contains('codex-mp-row')) {
      event.preventDefault();
      const rows = [...listBox.querySelectorAll('.codex-mp-row')];
      const at = rows.indexOf(event.target);
      rows[(at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    }
  }

  function onFocusOut(event) {
    const to = event.relatedTarget;
    if (openSeat === null || !(to instanceof Node)) return;
    if (popover.contains(to) || openSeat.button.contains(to)) return;
    close(false);
  }

  const onPointerDown = (event) => {
    if (openSeat === null) return;
    if (popover !== null && popover.contains(event.target)) return;
    if (openSeat.button.contains(event.target)) return;
    close(false);
  };
  const onViewport = () => place();

  /* ── 生命周期 ───────────────────────────────────────────────────────── */
  /* 对账只在「和席位有关的变动」上做全量扫描：新席位出现（加进来的元素是/含席位）、席位离场（删掉的元素是/含席位）、
     会话标记改变；席位自己的子节点变了只对那一个席位。流式输出每段都会插元素，逐次全量扫描是白做。
     还没落定的席位（目录没解析出来、或会话 id 来自主视图回退）仍在任何变动时重试，与全量扫描时同效。
     回调同步执行（不挪到 rAF）：React 换出新席位的那一帧就接上，宿主控件不会先闪一下。 */
  const ours = (node) => popover !== null && (node === popover || popover.contains(node));
  const addsSeat = (node) => node.nodeType === 1 && (node.matches(SLOT_SELECTOR) || node.querySelector(SLOT_SELECTOR) !== null);
  const holdsSeat = (node) => node.nodeType === 1 && [...seats.keys()].some((slot) => node === slot || node.contains(slot));
  const observer = new MutationObserver((records) => {
    const touched = new Set();
    for (const record of records) {
      if (ours(record.target)) continue;
      if (record.type === 'attributes' || [...record.addedNodes].some(addsSeat) || [...record.removedNodes].some(holdsSeat)) {
        scan();
        return;
      }
      const seat = seats.get(record.target);
      if (seat !== undefined) touched.add(seat);
    }
    for (const seat of [...seats.values()]) {
      if (touched.has(seat) || seat.dir === null || seat.fromFallback) syncSeat(seat.slot);
    }
  });
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-conversation-session'] });
    document.addEventListener('pointerdown', onPointerDown, true);
    addEventListener('resize', onViewport);
    addEventListener('scroll', onViewport, true);
    scan();
  };
  const stop = () => {
    close(false);
    observer.disconnect();
    document.removeEventListener('pointerdown', onPointerDown, true);
    removeEventListener('resize', onViewport);
    removeEventListener('scroll', onViewport, true);
    for (const seat of [...seats.values()]) dropSeat(seat);
  };
  if (enabled) start();

  return {
    /** 开关。关掉即撤走所有自建节点与订阅，宿主那一格经 :has() 立刻复原。 */
    setEnabled(next) {
      const value = next !== false;
      if (value === enabled || disposed) return;
      enabled = value;
      if (enabled) start();
      else stop();
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      clearTimeout(armTimer);
      popover?.remove();
      popover = null;
    },
  };
}
return { mountModelPicker };
})();

/* src/client/model-picker/index.js */
const __src_client_model_picker_index = (() => {
const { formValue } = __src_client_host;
const { mountModelPicker } = __src_client_model_picker_component;
/**
 * 模型选择器 B 面接到宿主上。
 *
 * 等 modelDirectories 服务就绪再挂：ctx.inject(deps, fn) 是宿主自己挂 composer 模型位的同一个口子。
 * 它不能进插件的 inject 列表 —— 那里的名字全是必需的，缺一个整个皮肤都不激活；服务撤走时 fn 的
 * 作用域连同我们的节点一起回收。
 * 设置卡的「Codex 模型选择器」（modelPicker，默认开）关掉即 setEnabled(false)：自建节点全撤，宿主那一格立刻复原。
 */



/**
 * @param ctx - 客户端上下文。
 * @param form - 本插件的设置表单；设置那一半没挂上时为 null（此时按默认开）。
 */
function installModelPicker(ctx, form) {
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
return { installModelPicker };
})();

/* src/client/constants.js */
const __src_client_constants = (() => {
/**
 * 全插件共用的名字。PLUGIN_ID 同时是：npm 包名、__ModuleLoader__ 的 id、设置表单命名空间（profile 条目 id）、
 * 组合包页座位 plugins.bundle.config 的键、style[data-plugin] 的归属标记 —— DSH 要求它们一致。
 */
const PLUGIN_ID = 'codex-ui';

/** 作用域根：theme.css 的每条规则都挂在 html[data-codex-ui] 下，摘掉即整层失效。 */
const ROOT_ATTR = 'data-codex-ui';

/** 设置页有覆盖时打在 <html> 上：覆盖层选择器比皮肤多这一个属性，特异性稳赢。 */
const OVERRIDE_ATTR = 'data-codex-ui-theme';

/** 切主题的那两帧打上：皮肤据此关掉全部过渡，免得整页交叉淡出（看起来就是闪）。 */
const SWITCH_ATTR = 'data-codex-ui-switching';

/** 主题本地预览期间打上（值为预览的那一套）。 */
const PREVIEW_ATTR = 'data-codex-ui-preview';
return { PLUGIN_ID, ROOT_ATTR, OVERRIDE_ATTR, SWITCH_ATTR, PREVIEW_ATTR };
})();

/* src/client/override.js */
const __src_client_override = (() => {
const { OVERRIDE_ATTR, ROOT_ATTR } = __src_client_constants;
/**
 * 设置页写进页面的那一层覆盖（纯函数：无 DOM、无副作用；check.mjs 直接单测）。
 *
 * skins/*.css 是默认值，设置页改的是用户覆盖：覆盖只在运行时以多一个属性的选择器（特异性 +1）
 * 压过皮肤，源样式一个字不动。取值纪律：
 *   · 空串 = 不覆盖；默认值下输出空串 —— 装上不动一个字，外观与没有设置页逐字节相同；
 *   · 颜色只认 6 位十六进制（Codex schema 同为 /^#[0-9a-fA-F]{6}$/）；
 *   · 除用户显式给的强调色外只产出中性 rgba，不引入彩色。
 * 对比度是简化实现（Codex 的 jdi：亮 45 / 暗 60 为原样）：文本档位按比例往 ink 或底色混合，
 * 中性 alpha 阶梯按比例缩放；差距写在 README「与 Codex 源码对账」。
 */


/** Codex 默认对比度：亮 45 / 暗 60。 */
const DEFAULT_CONTRAST = { light: 45, dark: 60 };

/**
 * 皮肤默认值（空串即回落到这里）。surface = 设置页「背景」那一行 = --dsw-alias-bg-base。
 * 必须与 skin.css 一致：check.mjs 逐字段对账，漂移即 FAIL。
 */
const SKIN_DEFAULTS = {
  light: { accent: '#339cff', focus: '#339cff', surface: '#ffffff', ink: '#1a1c1f', sidebar: '#eef4f9' },
  dark: { accent: '#0169cc', focus: '#339cff', surface: '#111111', ink: '#ffffff', sidebar: '#181818' },
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
    blocks.push(sel('light') + ',\n' + sel('light-body') + ' {\n' + decls + '\n}');
  }
  if (dark.length > 0) {
    const decls = dark.map(([k, v]) => '  ' + k + ': ' + v + ';').join('\n');
    blocks.push(sel('dark') + ' {\n' + decls + '\n}');
  }
  return blocks.join('\n\n');
}

/**
 * 一组合法的字体栈（不许出现会闭合声明、或能改变后文切分的字符）。
 *
 * 值是原样拼进覆盖层 `<style>` 的，所以除了 `; { } < >` 与 `url(` 还要挡三类：
 *   · 反斜杠 —— CSS 转义，`u\72l(` 在分词器眼里就是 `url(`，上面那条字面检查拦不住；
 *   · 注释起止 `/*` `*\/` —— 值里开一个注释会把后面的声明连同深色那一整块一起吞掉；
 *   · 控制字符与不成对的引号 —— 换行会断开字符串记号，半个引号会把后文读成字符串。
 * @param value - 待检查的值。
 * @returns 合法则 true。
 */
function isFontStack(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s === '' || s.length > 200) return false;
  if (/[;{}<>\\]/.test(s) || /url\(/i.test(s) || s.includes('/*') || s.includes('*/')) return false;
  if (/[\u0000-\u001f\u007f]/.test(s)) return false;
  return (s.split('"').length - 1) % 2 === 0 && (s.split("'").length - 1) % 2 === 0;
}

/**
 * 选择器生成：覆盖层比皮肤多一个属性，特异性 +1，因此不依赖样式表先后顺序。
 * @param which - 'light' | 'light-body' | 'dark'。
 * @returns CSS 选择器。
 */
function sel(which) {
  const root = 'html[' + ROOT_ATTR + '][' + OVERRIDE_ATTR + ']';
  if (which === 'light') return root;
  if (which === 'light-body') return root + ' body';
  return root + ' body[data-ds-dark-theme]';
}
return { DEFAULT_CONTRAST, SKIN_DEFAULTS, LABEL_TIERS, ALPHA_LADDER, SIDEBAR_ALPHA, SCALE_RANGE, MIX_RANGE, HEX_RE, isHex, mixHex, withAlpha, contrastEffect, themeOverrideCss, isFontStack };
})();

/* src/client/settings-card.js */
const __src_client_settings_card = (() => {
const { useCallback, useEffect, useMemo, useState, useSyncExternalStore } = require("react");
const { jsx, jsxs } = require("react/jsx-runtime");
const { Button, SegmentedControl, Switch, Tag } = require("@deepseek-ai/dsh-client-ui-primitives");
const { isEnglish } = __src_client_host;
const { DEFAULT_CONTRAST, SKIN_DEFAULTS, isFontStack, isHex } = __src_client_override;
/**
 * 组合包页（插件管理 → codex-ui）上的配置卡。宿主只以 view:'page' 渲染这个座位。
 * 改一下即写、没有保存按钮；文本框回车或失焦提交，写后回读确认落地；已覆盖的行显示徽标与「重置」。
 * 下面三行颜色编辑的是**当前生效的那一套**（theme.getTheme().active.colorScheme）。
 */






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
  modelPickerDesc: '输入区的模型位换成 Codex 式卡片：模型列表 + 可拖动的推理等级功率轨；关掉则交回宿主自带的菜单',
  contrast: '对比度',
  contrastDesc: '按 Codex 默认档位归一：45（亮）/ 60（暗）即原样',
  overridden: '已覆盖',
  reset: '重置',
  follow: '跟随皮肤',
  failed: '保存没生效，请重试。',
  unavailable: '这个 dsh 没有把 codex-ui 的配置开放给本页：条目可能在本 profile 里被停用，或连接把偏好留在页面进程内。',
  readOnly: '设置文档是只读的，改动无法保存。',
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
  modelPickerDesc: 'Replaces the composer model seat with a Codex-style card: model list plus a draggable reasoning power rail. Off hands the seat back to the host menu.',
  contrast: 'Contrast',
  contrastDesc: 'Normalised to the Codex defaults: 45 (light) / 60 (dark) is unchanged',
  overridden: 'Overridden',
  reset: 'Reset',
  follow: 'Follow skin',
  failed: 'The save did not take effect. Please try again.',
  unavailable: 'This dsh does not expose codex-ui configuration to this page: the entry may be disabled in this profile, or the connection keeps preferences inside the page process.',
  readOnly: 'The settings document is read-only, so changes cannot be saved.',
};

/** 用户层是否含这一格（= 已覆盖）。 */
const hasUserField = (snapshot, field) => snapshot.user != null && Object.hasOwn(snapshot.user, field);
/** 当前生效值。 */
const fieldValue = (snapshot, field) => snapshot.value?.[field];

/**
 * @param props - 座位注入：scope（本插件表单）、theme（宿主主题服务）、themeForm（ui-theme 表单）、
 *                watchTheme、previewTheme、locale。
 */
function SettingsCard({ scope, theme, themeForm, watchTheme, previewTheme, locale }) {
  const snapshot = useSyncExternalStore(
    useCallback((listener) => scope.subscribe(listener), [scope]),
    () => scope.getSnapshot(),
  );
  /* 宿主的 getTheme() 在两次变更之间返回同一个冻结对象，可直接当快照（useSyncExternalStore 按引用比较）。 */
  const themeSnapshot = useSyncExternalStore(
    useCallback((listener) => watchTheme(() => listener()), [watchTheme]),
    useCallback(() => theme.getTheme(), [theme]),
  );
  const copy = useMemo(() => (isEnglish(locale) ? COPY_EN : COPY_ZH), [locale]);
  /* preference 是偏好档（light/dark/system）；variant 是它当前解析出的那一套。 */
  const preference = themeSnapshot.preference;
  const variant = themeSnapshot.active?.colorScheme === 'dark' ? 'dark' : 'light';
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /* 分段控件先显示用户点的那个值：写文档是异步的，不暂存的话控件会滞后一拍。 */
  const [pendingTheme, setPendingTheme] = useState(null);
  useEffect(() => {
    if (pendingTheme !== null && pendingTheme === preference) setPendingTheme(null);
  }, [pendingTheme, preference]);

  const fieldOf = useCallback((base) => base + (variant === 'light' ? 'Light' : 'Dark'), [variant]);
  /**
   * 切主题。不调 theme.setTheme(id)：它先本地乐观发布、再由 adopt() 从设置文档回读，文档往返慢时会画出
   * 新值 → 旧值 → 新值（「黑 → 白 → 黑」）。这里先把偏好写进主题插件自己的设置文档（与服务内部 host.set
   * 同一命名空间 ui-theme、同一字段 preference），发布方只剩 adopt()，一次点击只发布一次；写入未被接受
   * 才退回服务入口。等往返的那 ~0.8s 由 previewTheme 立刻按目标主题显示。
   */
  const switchTheme = useCallback(async (id) => {
    if (id !== 'light' && id !== 'dark' && id !== 'system') return;
    setPendingTheme(id);
    previewTheme(id);
    try {
      if ((await themeForm.set('preference', id)) !== false) return;
    } catch (error) {
      console.warn('[codex-ui] 直接写主题偏好失败，退回服务入口：', error);
    }
    setPendingTheme(null);
    try {
      theme.setTheme(id);
    } catch (error) {
      console.warn('[codex-ui] 切主题失败：', error);
    }
  }, [theme, themeForm, previewTheme]);
  const unavailable = snapshot.status === 'unavailable';
  const readOnly = snapshot.writable === false;
  const disabled = saving || unavailable || readOnly;

  /** 写一格或清一格，再回读确认落地。 */
  const persist = useCallback(async (op, landedCheck) => {
    setSaving(true);
    setFailed(false);
    let landed = false;
    try { landed = await landedCheck(await op()); } catch { landed = false; }
    setFailed(!landed);
    setSaving(false);
  }, []);
  const write = useCallback((field, next) => persist(
    () => scope.set(field, next),
    (accepted) => accepted !== false && fieldValue(scope.getSnapshot(), field) === next,
  ), [scope, persist]);
  const clear = useCallback((field) => persist(
    () => scope.unset(field),
    () => !hasUserField(scope.getSnapshot(), field),
  ), [scope, persist]);

  /** 提交一个文本/色值草稿：空串写的是清除。 */
  const commitText = useCallback(async (field, draft, validate) => {
    const text = String(draft).trim();
    if (text !== '' && validate(text) === false) return;
    setDrafts((prev) => { const next = { ...prev }; delete next[field]; return next; });
    if (text === '') { await clear(field); return; }
    await write(field, text);
  }, [clear, write]);

  const draftOf = (field) => (Object.hasOwn(drafts, field) ? drafts[field] : undefined);
  const setDraft = (field, value) => setDrafts((prev) => ({ ...prev, [field]: value }));

  if (unavailable) {
    return jsx('p', { className: 'cx-note', role: 'status', children: copy.unavailable });
  }

  /** 一行：标签 + 说明 + 覆盖徽标 + 控件。 */
  const row = (key, label, desc, control, field) => {
    const overridden = field !== undefined && hasUserField(snapshot, field);
    return jsxs('div', {
      className: 'cx-row',
      children: [
        jsxs('div', {
          className: 'cx-row__text',
          children: [
            jsxs('div', {
              className: 'cx-row__label',
              children: [
                jsx('span', { children: label }),
                overridden ? jsx(Tag, { tone: 'outline', children: copy.overridden }) : null,
              ],
            }, 'label'),
            desc === null ? null : jsx('div', { className: 'cx-row__desc', children: desc }),
          ],
        }, 'text'),
        jsxs('div', {
          className: 'cx-row__control',
          children: [
            control,
            overridden ? jsx(Button, { variant: 'ghost', size: 'sm', disabled, onClick: () => clear(field), children: copy.reset }) : null,
          ],
        }, 'control'),
      ],
    }, key);
  };

  /** 颜色行：色块 + 十六进制文本框。 */
  const colorRow = (base, label, desc) => {
    const field = fieldOf(base);
    const current = fieldValue(snapshot, field);
    const draft = draftOf(field);
    const text = draft !== undefined ? draft : (isHex(current) ? current : '');
    return row(base, label, desc, [
      jsx('input', {
        key: 'swatch',
        className: 'cx-swatch',
        type: 'color',
        disabled,
        'aria-label': label,
        value: isHex(current) ? current : SKIN_DEFAULTS[variant][base],
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
        onBlur: () => { if (draftOf(field) !== undefined) commitText(field, draftOf(field), isHex); },
        onKeyDown: (event) => { if (event.key === 'Enter') commitText(field, draftOf(field) ?? text, isHex); },
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
      onBlur: () => { if (draftOf(field) !== undefined) commitText(field, draftOf(field), isFontStack); },
      onKeyDown: (event) => { if (event.key === 'Enter') commitText(field, draftOf(field) ?? text, isFontStack); },
    }), field);
  };

  /** 对比度行：滑杆 + 读数，拖动时只改草稿，松手/失焦才写。 */
  const contrastRow = () => {
    const field = fieldOf('contrast');
    const shown = draftOf(field) ?? fieldValue(snapshot, field) ?? DEFAULT_CONTRAST[variant];
    const commit = () => { if (draftOf(field) !== undefined) write(field, draftOf(field)); };
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
        onPointerUp: commit,
        onKeyUp: commit,
        onBlur: commit,
      }),
      jsx('span', { key: 'value', className: 'cx-range__value', children: String(shown) }),
    ], field);
  };

  /** 开关行。 */
  const switchRow = (key, field, label, desc, checked) => row(key, label, desc, jsx(Switch, {
    checked,
    disabled,
    label,
    onChange: (next) => write(field, next),
  }), field);

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
      switchRow('translucent', 'translucentSidebar', copy.translucent, copy.translucentDesc, fieldValue(snapshot, 'translucentSidebar') === true),
      /* 默认开：用户层没有这一格（或值不是 false）都算开着。 */
      switchRow('modelPicker', 'modelPicker', copy.modelPicker, copy.modelPickerDesc, fieldValue(snapshot, 'modelPicker') !== false),
      contrastRow(),
      readOnly ? jsx('p', { className: 'cx-note', role: 'status', children: copy.readOnly }) : null,
      failed ? jsx('p', { className: 'cx-error', role: 'status', children: copy.failed }) : null,
    ],
  }, 'form');
}
return { SettingsCard };
})();

/* src/client/theme-preview.js */
const __src_client_theme_preview = (() => {
const { PREVIEW_ATTR, SWITCH_ATTR } = __src_client_constants;
/**
 * 主题切换的两件事：
 *   1. 切换的那两帧打 SWITCH_ATTR，皮肤据此关掉全部过渡（整页交叉淡出看起来就是闪）；
 *   2. 本地预览：设置卡点下去到宿主发布新主题要等一次设置文档往返（实测 ~0.8s）。先按目标主题
 *      写宿主本来就会写的两处（body[data-ds-dark-theme]、html 的 color-scheme），宿主带着同一结果
 *      回来时幂等交还；2.5s 没等到就按宿主真值回滚 —— 预览从不当成结果。
 */


const PREVIEW_TIMEOUT_MS = 2500;

/**
 * @param ctx - 客户端上下文（需要 theme 服务）。
 * @returns previewTheme(target)：target 为 'light' | 'dark' | 'system'。
 */
function installThemePreview(ctx) {
  const root = document.documentElement;
  let preview = null;
  let timer = 0;

  const suppressTransitions = () => {
    root.setAttribute(SWITCH_ATTR, '');
    requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute(SWITCH_ATTR)));
  };
  const applyScheme = (scheme) => {
    document.body.toggleAttribute('data-ds-dark-theme', scheme === 'dark');
    root.style.colorScheme = scheme;
  };
  /** 偏好 → 实际那一套（system 跟随系统，与宿主同一套解析）。 */
  const schemeOf = (target) => (target === 'dark' || target === 'light' ? target
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  /** 宿主主题服务当前解析出的那一套。 */
  const activeScheme = () => {
    const scheme = ctx.theme.getTheme()?.active?.colorScheme;
    return scheme === 'dark' || scheme === 'light' ? scheme : null;
  };
  /** @param confirmed - true：宿主已发布同一结果；false：超时或卸载，按宿主真值回滚。 */
  const endPreview = (confirmed) => {
    if (preview === null) return;
    clearTimeout(timer);
    timer = 0;
    preview = null;
    root.removeAttribute(PREVIEW_ATTR);
    if (confirmed) return;
    try {
      const active = activeScheme();
      if (active !== null) applyScheme(active);
    } catch { /* 读不到服务就保持现状 */ }
  };

  ctx.effect(() => ctx.on('theme/change', (snapshot) => {
    suppressTransitions();
    if (preview !== null && snapshot?.active?.colorScheme === preview.scheme) endPreview(true);
  }), 'codex-ui: theme change');
  ctx.effect(() => () => endPreview(false), 'codex-ui: theme preview cleanup');

  return (target) => {
    if (target !== 'light' && target !== 'dark' && target !== 'system') return;
    const scheme = schemeOf(target);
    preview = { scheme };
    root.setAttribute(PREVIEW_ATTR, scheme);
    suppressTransitions();
    applyScheme(scheme);
    clearTimeout(timer);
    timer = setTimeout(() => endPreview(false), PREVIEW_TIMEOUT_MS);
  };
}
return { installThemePreview };
})();

/* src/client/settings.js */
const __src_client_settings = (() => {
const { OVERRIDE_ATTR, PLUGIN_ID } = __src_client_constants;
const { formValue } = __src_client_host;
const { themeOverrideCss } = __src_client_override;
const { SettingsCard } = __src_client_settings_card;
const { installThemePreview } = __src_client_theme_preview;
/**
 * 设置：覆盖层（用户在设置卡改的值 → 一条运行时 <style>）+ 主题预览 + 组合包页的配置卡。
 */






/**
 * @param ctx - 客户端上下文（configForms / theme / slots 都在插件的 inject 里）。
 * @returns 本插件的设置表单（模型选择器的开关也读它）。
 */
function installSettings(ctx) {
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
return { installSettings };
})();

/* codex-ui:theme.css */
const __codex_ui_theme_css = (() => {
const THEME_CSS = "html[data-codex-ui],\nhtml[data-codex-ui] body {\n  color-scheme: light;\n\n  background-color: #ffffff;\n\n  --dsw-alias-bg-base: #ffffff;\n  --dsw-alias-bg-sidebar: #eef4f9;\n  --dsw-alias-bg-layer-1: #ffffff;\n  --dsw-alias-bg-layer-2: #f1f1ef;\n  --dsw-alias-bg-layer-3: #e5e5e5;\n  --dsw-alias-bg-overlay: rgba(255, 255, 255, 0.88);\n  --dsw-alias-bg-module-platform: #f9f9f9;\n  --dsw-alias-bg-multi-select: #e5e5e5;\n  --dsw-alias-bg-skeleton: rgba(13, 13, 13, 0.05);\n\n  --dsw-alias-border-l1: rgba(13, 13, 13, 0.07);\n  --dsw-alias-border-l2: rgba(13, 13, 13, 0.12);\n  --dsw-alias-border-l3: rgba(13, 13, 13, 0.18);\n  --dsw-alias-border-l4: rgba(13, 13, 13, 0.24);\n  --dsw-alias-border-l2-darkmode-thin: rgba(13, 13, 13, 0.09);\n\n  --dsw-alias-label-primary: #1a1c1f;\n  --dsw-alias-label-primary-dimmed: #5d5d5d;\n  --dsw-alias-label-primary-inverted: #ffffff;\n  --dsw-alias-label-primary-foreground: #ffffff;\n  --dsw-alias-label-primary-bluish: #0d0d0d;\n  --dsw-alias-label-secondary: #5d5d5d;\n  --dsw-alias-label-tertiary: #767676;\n  --dsw-alias-label-caption: #767676;\n  --dsw-alias-label-dimmed: #c9c9c9;\n\n  --dsw-alias-brand-primary: #0d0d0d;\n  --dsw-alias-brand-primary-invert: #ffffff;\n  --dsw-alias-brand-text: #ffffff;\n  --dsw-alias-brand-primary-new-colorprimary-new-color: #0d0d0d;\n  --dsw-alias-link: #339cff;\n\n  --dsw-alias-button-primary-fill: #0d0d0d;\n  --dsw-alias-button-primary-hover: #2a2a2a;\n  --dsw-alias-button-primary-dimmed: #e5e5e5;\n  --dsw-alias-button-contrast-fill: #0d0d0d;\n  --dsw-alias-button-elevated-fill: #ffffff;\n  --dsw-alias-button-floating-fill: #ffffff;\n  --dsw-alias-button-floating-hover: #f1f1ef;\n  --dsw-alias-button-ghost-active-fill: #e5e5e5;\n  --dsw-alias-button-ghost-active-hover: #dcdcdc;\n  --dsw-alias-button-ghost-active-border: #8f8f8f;\n  --dsw-alias-button-info-fill: #0d0d0d;\n  --dsw-alias-button-info-hover: #2a2a2a;\n  --dsw-alias-button-tool-bar-fill: rgba(13, 13, 13, 0.28);\n  --dsw-alias-button-tool-bar-fill-invisible: rgba(13, 13, 13, 0.18);\n  --dsw-alias-button-tool-bar-hover: rgba(13, 13, 13, 0.36);\n\n  --dsw-alias-interactive-bg-hover: rgba(13, 13, 13, 0.04);\n  --dsw-codex-hover-fill: #f2f2f3;\n  --dsw-codex-focus: #339cff;\n\n  --dsw-focus-ring-color: var(--dsw-codex-focus);\n\n  --dsw-codex-border: rgba(13, 13, 13, 0.1);\n  --dsw-codex-border-strong: rgba(13, 13, 13, 0.15);\n  --dsw-alias-interactive-bg-active: rgba(13, 13, 13, 0.08);\n  --dsw-alias-interactive-bg-hover-solid: #f1f1ef;\n  --dsw-alias-interactive-bg-hover-accent: rgba(13, 13, 13, 0.06);\n  --dsw-alias-interactive-bg-hover-danger: rgba(209, 36, 47, 0.08);\n\n  --dsw-alias-markdown-code-block: #f1f1ef;\n  --dsw-alias-markdown-code-block-banner: #e5e5e5;\n  --dsw-alias-markdown-inline-code: #f1f1ef;\n  --dsw-alias-markdown-code-segment-selected: #ffffff;\n  --dsw-alias-markdown-code-segment-unselected: #f1f1ef;\n  --dsw-alias-markdown-citation: #f1f1ef;\n  --dsw-alias-markdown-placeholder: #e5e5e5;\n  --dsw-alias-markdown-tag: #f1f1ef;\n\n  --dsw-alias-state-success-primary: #1a7f37;\n  --dsw-alias-state-success-secondary: #2e9e4c;\n  --dsw-alias-state-success-tertiary: rgba(26, 127, 55, 0.08);\n  --dsw-alias-state-error-primary: #d1242f;\n  --dsw-alias-state-error-secondary: #e5484d;\n  --dsw-alias-state-error-tertiary: rgba(209, 36, 47, 0.08);\n  --dsw-alias-state-warn-primary: #8f5f00;\n  --dsw-alias-state-warn-secondary: #bb8009;\n  --dsw-alias-state-warn-tertiary: rgba(143, 95, 0, 0.08);\n  --dsw-alias-state-warn-label: #8f5f00;\n  --dsw-alias-state-business-primary: #0d0d0d;\n  --dsw-alias-state-business-tertiary: rgba(13, 13, 13, 0.08);\n  --dsw-alias-state-idle-primary: #767676;\n\n  --dsw-alias-code-diff-added: rgba(26, 127, 55, 0.1);\n  --dsw-alias-code-diff-deleted: rgba(209, 36, 47, 0.1);\n  --dsw-alias-file-diff-added-bg: #e6f4e7;\n  --dsw-alias-file-diff-added-gutter: #edf7ed;\n  --dsw-alias-file-diff-added-marker: #1a7f37;\n  --dsw-alias-file-diff-deleted-bg: #fce6e2;\n  --dsw-alias-file-diff-deleted-gutter: #fdece9;\n  --dsw-alias-file-diff-deleted-marker: #d1242f;\n\n  --dsw-alias-bg-mask-drop: rgba(255, 255, 255, 0.7);\n  --dsw-alias-toast-bg: #1e1e1e;\n  --dsw-alias-tooltip-bg: #1e1e1e;\n  --dsw-alias-tooltip-fg: #ffffff;\n  --dsw-alias-hovercard-bg: #ffffff;\n\n  --dsw-alias-scrollbar-bg-l1: rgba(118, 118, 118, 0.3);\n  --dsw-alias-scrollbar-bg-l2: rgba(118, 118, 118, 0.5);\n  --dsw-alias-scrollbar-hover-l1: rgba(13, 13, 13, 0.35);\n  --dsw-alias-scrollbar-hover-l2: rgba(13, 13, 13, 0.5);\n\n  --dsw-specific-sidebar-fill: #eef4f9;\n  --dsw-specific-sidebar-nav-item-hover: #e8eef3;\n  --dsw-specific-sidebar-nav-item-active: #e2e9ed;\n  --dsw-specific-sidebar-nav-item-active-accent: rgba(13, 13, 13, 0.1);\n  --dsw-specific-input-major: #ffffff;\n  --dsw-composer-surface: #ffffff;\n  --dsw-specific-login-input: #f9f9f9;\n  --dsw-specific-menu: rgba(255, 255, 255, 0.88);\n  --dsw-specific-selector: #f1f1ef;\n  --dsw-specific-bubble: #f1f1ef;\n  --dsw-specific-bubble-highlight: #e5e5e5;\n  --dsw-specific-tip: #f1f1ef;\n\n  --dsw-shadow-lv1: 0 1px 2px rgba(13, 13, 13, 0.06);\n  --dsw-shadow-lv2: 0 2px 8px rgba(13, 13, 13, 0.08);\n  --dsw-shadow-lv3: 0 8px 24px rgba(13, 13, 13, 0.1);\n  --dsw-linear-gradient-think: linear-gradient(180deg, #ffffff 20.19%, rgba(255, 255, 255, 0) 100%);\n  --dsw-linear-think-select: linear-gradient(180deg, #f1f1ef 20.19%, rgba(241, 241, 239, 0) 100%);\n\n  --dsw-codex-ambient: rgba(13, 13, 13, 0.05);\n  --dsw-codex-menu-shadow: 0 8px 32px rgba(13, 13, 13, 0.13), 0 0 0 1px rgba(13, 13, 13, 0.04);\n  --dsw-codex-suggest-shadow: 0 8px 32px #0002, 0 0 0 1px #0000000a;\n  --dsw-codex-suggest-fill: #fff;\n}\n\nhtml[data-codex-ui-switching] *,\nhtml[data-codex-ui-switching] *::before,\nhtml[data-codex-ui-switching] *::after {\n  transition: none !important;\n}\n\nhtml[data-codex-ui]:has(body[data-ds-dark-theme]) {\n  background-color: #111111;\n}\n\nhtml[data-codex-ui] body[data-ds-dark-theme] {\n  color-scheme: dark;\n  background-color: #111111;\n\n  --dsw-alias-bg-base: #111111;\n  --dsw-alias-bg-sidebar: #181818;\n  --dsw-alias-bg-layer-1: #212121;\n  --dsw-alias-bg-layer-2: #282828;\n  --dsw-alias-bg-layer-3: #303030;\n  --dsw-alias-bg-overlay: rgba(24, 24, 24, 0.88);\n  --dsw-alias-bg-module-platform: #1f1f1f;\n  --dsw-alias-bg-multi-select: #303030;\n  --dsw-alias-bg-skeleton: rgba(255, 255, 255, 0.07);\n\n  --dsw-alias-border-l1: rgba(255, 255, 255, 0.08);\n  --dsw-alias-border-l2: rgba(255, 255, 255, 0.14);\n  --dsw-alias-border-l3: rgba(255, 255, 255, 0.2);\n  --dsw-alias-border-l4: rgba(255, 255, 255, 0.26);\n  --dsw-alias-border-l2-darkmode-thin: rgba(255, 255, 255, 0.1);\n\n  --dsw-alias-label-primary: #ffffff;\n  --dsw-alias-label-primary-dimmed: #b4b4b4;\n  --dsw-alias-label-primary-inverted: #0d0d0d;\n  --dsw-alias-label-primary-foreground: #0d0d0d;\n  --dsw-alias-label-primary-bluish: #ececec;\n  --dsw-alias-label-secondary: #b4b4b4;\n  --dsw-alias-label-tertiary: #949494;\n  --dsw-alias-label-caption: #949494;\n  --dsw-alias-label-dimmed: #4a4a4a;\n\n  --dsw-alias-brand-primary: #ffffff;\n  --dsw-alias-brand-primary-invert: #0d0d0d;\n  --dsw-alias-brand-text: #0d0d0d;\n  --dsw-alias-brand-primary-new-colorprimary-new-color: #ffffff;\n  --dsw-alias-link: #0169cc;\n\n  --dsw-alias-button-primary-fill: #ffffff;\n  --dsw-alias-button-primary-hover: #d9d9d9;\n  --dsw-alias-button-primary-dimmed: #282828;\n  --dsw-alias-button-contrast-fill: #ececec;\n  --dsw-alias-button-elevated-fill: #212121;\n  --dsw-alias-button-floating-fill: #1f1f1f;\n  --dsw-alias-button-floating-hover: #282828;\n  --dsw-alias-button-ghost-active-fill: #303030;\n  --dsw-alias-button-ghost-active-hover: #383838;\n  --dsw-alias-button-ghost-active-border: #7e7e7e;\n  --dsw-alias-button-info-fill: #ffffff;\n  --dsw-alias-button-info-hover: #d9d9d9;\n  --dsw-alias-button-tool-bar-fill: rgba(255, 255, 255, 0.22);\n  --dsw-alias-button-tool-bar-fill-invisible: rgba(255, 255, 255, 0.16);\n  --dsw-alias-button-tool-bar-hover: rgba(255, 255, 255, 0.28);\n\n  --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.06);\n  --dsw-codex-hover-fill: rgba(255, 255, 255, 0.08);\n  --dsw-codex-focus: rgba(51, 156, 255, 0.7);\n  --dsw-codex-border: rgba(255, 255, 255, 0.12);\n  --dsw-codex-border-strong: rgba(255, 255, 255, 0.2);\n  --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.1);\n  --dsw-alias-interactive-bg-hover-solid: #282828;\n  --dsw-alias-interactive-bg-hover-accent: rgba(255, 255, 255, 0.08);\n  --dsw-alias-interactive-bg-hover-danger: rgba(248, 81, 73, 0.12);\n\n  --dsw-alias-markdown-code-block: #1f1f1f;\n  --dsw-alias-markdown-code-block-banner: #141414;\n  --dsw-alias-markdown-inline-code: #282828;\n  --dsw-alias-markdown-code-segment-selected: #303030;\n  --dsw-alias-markdown-code-segment-unselected: #1f1f1f;\n  --dsw-alias-markdown-citation: #212121;\n  --dsw-alias-markdown-placeholder: #282828;\n  --dsw-alias-markdown-tag: #282828;\n\n  --dsw-alias-state-success-primary: #3fb950;\n  --dsw-alias-state-success-secondary: #56d364;\n  --dsw-alias-state-success-tertiary: rgba(63, 185, 80, 0.16);\n  --dsw-alias-state-error-primary: #ff7b72;\n  --dsw-alias-state-error-secondary: #ff9492;\n  --dsw-alias-state-error-tertiary: rgba(255, 123, 114, 0.16);\n  --dsw-alias-state-warn-primary: #d29922;\n  --dsw-alias-state-warn-secondary: #e3b341;\n  --dsw-alias-state-warn-tertiary: rgba(210, 153, 34, 0.16);\n  --dsw-alias-state-warn-label: #d29922;\n  --dsw-alias-state-business-primary: #ececec;\n  --dsw-alias-state-business-tertiary: rgba(255, 255, 255, 0.12);\n  --dsw-alias-state-idle-primary: #7e7e7e;\n\n  --dsw-alias-code-diff-added: rgba(63, 185, 80, 0.14);\n  --dsw-alias-code-diff-deleted: rgba(248, 81, 73, 0.14);\n  --dsw-alias-file-diff-added-bg: #1f3124;\n  --dsw-alias-file-diff-added-gutter: #132016;\n  --dsw-alias-file-diff-added-marker: #41c977;\n  --dsw-alias-file-diff-deleted-bg: #3c1f1b;\n  --dsw-alias-file-diff-deleted-gutter: #28130e;\n  --dsw-alias-file-diff-deleted-marker: #fa423e;\n\n  --dsw-alias-bg-mask-drop: rgba(39, 39, 48, 0.7);\n  --dsw-alias-toast-bg: #282828;\n  --dsw-alias-tooltip-bg: #212121;\n  --dsw-alias-tooltip-fg: #ececec;\n  --dsw-alias-hovercard-bg: #212121;\n\n  --dsw-alias-scrollbar-bg-l1: rgba(160, 160, 160, 0.3);\n  --dsw-alias-scrollbar-bg-l2: rgba(160, 160, 160, 0.5);\n  --dsw-alias-scrollbar-hover-l1: rgba(255, 255, 255, 0.35);\n  --dsw-alias-scrollbar-hover-l2: rgba(255, 255, 255, 0.5);\n\n  --dsw-specific-sidebar-fill: #181818;\n  --dsw-specific-sidebar-nav-item-hover: #212121;\n  --dsw-specific-sidebar-nav-item-active: #282828;\n  --dsw-specific-sidebar-nav-item-active-accent: rgba(255, 255, 255, 0.14);\n  --dsw-specific-input-major: #212121;\n  --dsw-composer-surface: #181818;\n  --dsw-specific-login-input: #1f1f1f;\n  --dsw-specific-menu: rgba(24, 24, 24, 0.88);\n  --dsw-specific-selector: #282828;\n  --dsw-specific-bubble: #212121;\n  --dsw-specific-bubble-highlight: #282828;\n  --dsw-specific-tip: #1f1f1f;\n\n  --dsw-shadow-lv1: 0 1px 2px rgba(0, 0, 0, 0.4);\n  --dsw-shadow-lv2: 0 2px 8px rgba(0, 0, 0, 0.5);\n  --dsw-shadow-lv3: 0 8px 24px rgba(0, 0, 0, 0.6);\n  --dsw-linear-gradient-think: linear-gradient(180deg, #212121 20.19%, rgba(33, 33, 33, 0) 100%);\n  --dsw-linear-think-select: linear-gradient(180deg, #1f1f1f 20.19%, rgba(40, 40, 40, 0) 100%);\n\n  --dsw-codex-ambient: rgba(0, 0, 0, 0.5);\n  --dsw-codex-menu-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(236, 236, 236, 0.05);\n  --dsw-codex-suggest-shadow: 0 8px 32px #0003, 0 0 0 1px #ffffff08;\n  --dsw-codex-suggest-fill: #292929;\n}\n\nhtml[data-codex-ui],\nhtml[data-codex-ui] body {\n  --dsw-space-1: 4px;\n  --dsw-space-2: 8px;\n  --dsw-space-3: 12px;\n  --dsw-space-4: 16px;\n  --dsw-space-5: 20px;\n  --dsw-space-6: 24px;\n  --dsw-space-8: 32px;\n\n  --dsw-radius-xs: 4px;\n  --dsw-radius-s: 8px;\n  --dsw-radius-m: 12px;\n  --dsw-radius-l: 16px;\n  --dsw-radius-xl: 20px;\n  --dsw-radius-2xl: 25px;\n  --dsw-radius-menu: 18px;\n\n  --dsw-radius-card: var(--dsw-radius-xl);\n  --dsw-radius-pill: 999px;\n\n  --dsw-content-max-width: 768px;\n\n  --dsw-text-2xs: 11px;\n  --dsw-text-xs: 12.5px;\n  --dsw-text-sm: 13px;\n  --dsw-text-base: 14px;\n  --dsw-text-lg: 16px;\n  --dsw-text-xl: 20px;\n  --dsw-text-2xl: 28px;\n  --dsw-leading-2xs: 1.3;\n  --dsw-leading-xs: 1.4;\n  --dsw-leading-base: 1.65;\n  --dsw-leading-lg: 1.4;\n  --dsw-leading-xl: 1.35;\n  --dsw-leading-2xl: 1.25;\n\n  --dsw-font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\",\n    \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Helvetica Neue\", Helvetica, Arial, sans-serif;\n  --ds-font-family-code: \"SF Mono\", \"JetBrains Mono\", \"Fira Code\", Consolas,\n    \"Liberation Mono\", Menlo, Courier, \"PingFang SC\", \"Microsoft YaHei\";\n\n  --dsw-font-meta: var(--ds-font-family-code);\n  --dsw-meta-size: 11px;\n  --dsw-meta-weight: 500;\n  --dsw-meta-tracking: 0.08em;\n  --dsw-meta-tracking-pill: 0.04em;\n\n  --dsw-motion-fast: 150ms;\n  --dsw-motion-base: 200ms;\n  --dsw-motion-slow: 300ms;\n  --dsw-ease: cubic-bezier(0.4, 0, 0.2, 1);\n\n  --dsh-composer-accessory-radius: var(--dsw-radius-l);\n  --dsh-composer-accessory-bg: var(--dsw-alias-bg-layer-2);\n  --dsh-composer-accessory-color: var(--dsw-alias-label-secondary);\n  --dsh-composer-accessory-border: 0.5px solid var(--dsw-alias-border-l1);\n  --dsh-composer-accessory-shadow: none;\n  --dsh-composer-accessory-blur: 0px;\n}\n\n@supports (corner-shape: superellipse(1.5)) {\n  html[data-codex-ui],\nhtml[data-codex-ui] body {\n    --dsw-radius-card: var(--dsw-radius-2xl);\n  }\n}\n\nhtml[data-codex-ui] body,\nhtml[data-codex-ui] body * {\n  --dsw-elevation-stroke-color: rgba(13, 13, 13, 0.08);\n  --dsw-elevation-stroke: 0 0 0 0.5px var(--dsw-elevation-stroke-color);\n  --dsw-elevation-panel: var(--dsw-elevation-stroke);\n\n  --dsw-elevation-prominent: var(--dsw-elevation-stroke), 0 3px 7.5px #0000000a, 0 0 20px #0000000d;\n}\n\nhtml[data-codex-ui] body[data-ds-dark-theme],\nhtml[data-codex-ui] body[data-ds-dark-theme] * {\n  --dsw-elevation-stroke-color: rgba(255, 255, 255, 0.09);\n}\n\nhtml[data-codex-ui],\nhtml[data-codex-ui] body {\n  --dsw-font-markdown-h1: 600 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h1-font-weight: 600;\n  --dsw-font-markdown-h2: 600 calc(19px + var(--dsh-content-font-delta)) / calc(28px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h2-font-weight: 600;\n  --dsw-font-markdown-h3: 600 calc(18px + var(--dsh-content-font-delta)) / calc(26px + var(--dsh-content-font-delta)) var(--dsw-font-family);\n  --dsw-font-markdown-h3-font-weight: 600;\n}\n\nhtml[data-codex-ui] :focus-visible {\n  outline: 2px solid var(--dsw-focus-ring-color);\n  outline-offset: 2px;\n}\n\nhtml[data-codex-ui] a {\n  color: var(--dsw-alias-link);\n  text-decoration: none;\n  text-underline-offset: 2px;\n  text-decoration-thickness: 1px;\n}\n\nhtml[data-codex-ui] a:hover,\nhtml[data-codex-ui] a:focus-visible {\n  text-decoration: underline;\n}\n\nhtml[data-codex-ui] button,\nhtml[data-codex-ui] a,\nhtml[data-codex-ui] summary,\nhtml[data-codex-ui] [role=\"button\"],\nhtml[data-codex-ui] [role=\"tab\"],\nhtml[data-codex-ui] [role=\"menuitem\"],\nhtml[data-codex-ui] [role=\"option\"] {\n  cursor: pointer;\n}\n\nhtml[data-codex-ui] button,\nhtml[data-codex-ui] a,\nhtml[data-codex-ui] summary,\nhtml[data-codex-ui] [role=\"button\"],\nhtml[data-codex-ui] [role=\"tab\"],\nhtml[data-codex-ui] [role=\"menuitem\"] {\n  transition:\n    background-color var(--dsw-motion-fast) var(--dsw-ease),\n    border-color var(--dsw-motion-fast) var(--dsw-ease),\n    color var(--dsw-motion-fast) var(--dsw-ease),\n    opacity var(--dsw-motion-fast) var(--dsw-ease),\n    box-shadow var(--dsw-motion-fast) var(--dsw-ease);\n}\n\nhtml[data-codex-ui] button:disabled,\nhtml[data-codex-ui] button[aria-disabled=\"true\"],\nhtml[data-codex-ui] [aria-disabled=\"true\"] {\n  cursor: not-allowed;\n  opacity: 0.45;\n}\n\nhtml[data-codex-ui] [data-slot=\"web-ui.plugin.item\"] > *,\nhtml[data-codex-ui] [data-dsh-part=\"card\"],\nhtml[data-codex-ui] [data-dsh-part=\"column\"],\nhtml[data-codex-ui] [data-dsh-part=\"status\"],\nhtml[data-codex-ui] [data-dsh-part=\"today-card\"],\nhtml[data-codex-ui] [data-dsh-part=\"balance-card\"],\nhtml[data-codex-ui] [data-dsh-part=\"trend-card\"],\nhtml[data-codex-ui] [data-dsh-part=\"plan-card\"],\nhtml[data-codex-ui] [data-dsh-part=\"bank-card\"] {\n  background: var(--dsw-alias-bg-layer-1);\n  border: 0.5px solid var(--dsw-alias-border-l1);\n  border-radius: var(--dsw-radius-m);\n  box-shadow: var(--dsw-elevation-panel);\n  padding: var(--dsw-space-4);\n}\n\nhtml[data-codex-ui] [role=\"dialog\"],\nhtml[data-codex-ui] [data-dsh-surface=\"overlay\"] [data-dsh-part=\"panel\"] {\n  border-radius: var(--dsw-radius-l);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"composer-chip\"],\nhtml[data-codex-ui] [data-dsh-part=\"chip\"],\nhtml[data-codex-ui] [data-dsh-part=\"ref\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"] {\n  font-family: var(--dsw-font-meta);\n  font-size: var(--dsw-meta-size);\n  font-weight: var(--dsw-meta-weight);\n  letter-spacing: var(--dsw-meta-tracking-pill);\n  border-radius: var(--dsw-radius-pill);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"0\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"0\"] {\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"1\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"1\"] {\n  background: var(--dsw-alias-state-success-tertiary);\n  color: var(--dsw-alias-state-success-primary);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"2\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"2\"] {\n  background: var(--dsw-alias-state-warn-tertiary);\n  color: var(--dsw-alias-state-warn-primary);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"3\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"3\"] {\n  background: var(--dsw-alias-state-error-tertiary);\n  color: var(--dsw-alias-state-error-primary);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"4\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"4\"] {\n  background: var(--dsw-alias-state-business-tertiary);\n  color: var(--dsw-alias-label-primary);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"tag-chip\"][data-tag-tone=\"5\"],\nhtml[data-codex-ui] [data-dsh-part=\"tag-badge\"][data-tag-tone=\"5\"] {\n  background: var(--dsw-alias-bg-layer-3);\n  color: var(--dsw-alias-label-tertiary);\n}\n\nhtml[data-codex-ui] [data-dsh-surface=\"sidebar\"],\nhtml[data-codex-ui] [data-slot=\"sidebar.workspaces\"] {\n  background-color: var(--dsw-alias-bg-sidebar);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"sidebar-entry\"],\nhtml[data-codex-ui] [data-dsh-surface=\"sidebar\"] [role=\"button\"] {\n  border-radius: var(--dsw-radius-s);\n}\n\nhtml[data-codex-ui] [data-dsh-surface=\"composer\"] [data-dsh-part=\"composer-input\"] {\n  border-radius: var(--dsw-radius-l);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"composer-input\"] {\n  font-family: var(--dsw-font-family);\n  line-height: var(--dsw-leading-base);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"turn-tail\"],\nhtml[data-codex-ui] [data-dsh-part=\"queue-dock\"],\nhtml[data-codex-ui] [data-dsh-part=\"usage-chart\"],\nhtml[data-codex-ui] [data-dsh-part=\"voucher-preview\"] {\n  font-family: var(--dsw-font-meta);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"composer-chip\"] {\n  text-transform: uppercase;\n  letter-spacing: var(--dsw-meta-tracking);\n}\n\nhtml[data-codex-ui] :lang(zh) [data-dsh-part=\"composer-chip\"],\nhtml[data-codex-ui] :lang(zh) [data-dsh-part=\"chip\"],\nhtml[data-codex-ui] :lang(zh) [data-dsh-part=\"ref\"],\nhtml[data-codex-ui] :lang(zh) [data-dsh-part=\"tag-chip\"],\nhtml[data-codex-ui] :lang(zh) [data-dsh-part=\"tag-badge\"] {\n  letter-spacing: 0;\n  text-transform: none;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  html[data-codex-ui] *,\nhtml[data-codex-ui] *::before,\nhtml[data-codex-ui] *::after {\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n    transition-duration: 0.01ms !important;\n    scroll-behavior: auto !important;\n  }\n}\n\nhtml[data-codex-ui] [data-slot=\"conversation.input.model\"] button:focus-visible {\n  outline: 1px solid var(--dsw-focus-ring-color);\n  outline-offset: 1px;\n  box-shadow: none;\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] {\n\n  --dsw-menu-surface-fill: var(--dsw-alias-bg-layer-1);\n  --dsw-menu-backdrop-filter: none;\n\n  background: var(--dsw-alias-bg-layer-1);\n  padding: 5px;\n  border-radius: var(--dsw-radius-menu);\n  box-shadow: var(--dsw-codex-menu-shadow);\n  color: var(--dsw-alias-label-primary);\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitem\"],\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"] {\n  box-sizing: border-box;\n  min-height: 28px;\n  padding: 4px 9px;\n  gap: 8px;\n  border: 0;\n  border-radius: calc(var(--dsw-radius-menu) - 5px);\n  background: none;\n  color: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitem\"]:hover,\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]:hover:not(:disabled),\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"][aria-checked=\"true\"] {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitem\"]:focus-visible,\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]:focus-visible {\n  outline: 1px solid var(--dsw-focus-ring-color);\n  outline-offset: -1px;\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy] button[role=\"menuitemradio\"]:disabled {\n  opacity: 1;\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"][aria-checked=\"true\"] > span:last-child {\n  position: relative;\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"][aria-checked=\"true\"] > span:last-child > svg {\n  visibility: hidden;\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"][aria-checked=\"true\"] > span:last-child::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  box-sizing: border-box;\n  width: 12px;\n  height: 12px;\n  margin: auto;\n  border: 1.5px solid var(--dsw-alias-border-l3);\n  border-top-color: var(--dsw-alias-label-primary);\n  border-radius: 50%;\n  animation: codex-ui-spin 1s linear infinite;\n}\n\nhtml[data-codex-ui] body > div[role=\"menu\"][aria-busy=\"true\"] button[role=\"menuitemradio\"]:disabled {\n  cursor: progress;\n}\n\n@keyframes codex-ui-spin {\n  to {\n    transform: rotate(1turn);\n  }\n}\n\nhtml[data-codex-ui] [data-slot=\"conversation.session.header\"] > [data-conversation-tabs] {\n  display: none;\n}\n\nhtml[data-codex-ui] header:has([data-conversation-header-leading]):has([data-conversation-tabs]) {\n  min-height: 0;\n  padding-bottom: 10px;\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"new-session\"] {\n  border: 0;\n  background: transparent;\n  box-shadow: none;\n  border-radius: var(--dsw-radius-s);\n  justify-content: flex-start;\n  color: var(--dsw-alias-label-primary);\n}\n\nhtml[data-codex-ui] [data-dsh-part=\"new-session\"]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\nhtml[data-codex-ui] [data-slot=\"conversation.composer.dock\"] {\n  display: none;\n}\n\nhtml[data-codex-ui] [data-conversation-header-corner] {\n  margin-left: 0;\n  margin-right: 0;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-expand] svg {\n  transform: scaleX(-1);\n}\n\nhtml[data-codex-ui] [data-animating] {\n  transition: grid-template-columns 500ms cubic-bezier(.16, 1, .3, 1);\n}\n\nhtml[data-codex-ui] [data-animating] [data-side] {\n  transition: left 500ms cubic-bezier(.16, 1, .3, 1);\n}\n\nhtml[data-codex-ui] [data-dragging],\nhtml[data-codex-ui] [data-rightbar-instant],\nhtml[data-codex-ui] [data-rightbar-fullscreen],\nhtml[data-codex-ui] [data-dragging] [data-side],\nhtml[data-codex-ui] [data-rightbar-instant] [data-side],\nhtml[data-codex-ui] [data-rightbar-fullscreen] [data-side] {\n  transition: none;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  html[data-codex-ui] [data-animating],\nhtml[data-codex-ui] [data-animating] [data-side] {\n    transition: none;\n  }\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide] > span[aria-hidden=\"true\"] {\n  display: none;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide]::after {\n  display: none;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] {\n  box-sizing: border-box;\n  width: 380px;\n  max-width: 100%;\n  min-height: 52px;\n  gap: 14px;\n  padding: 0 20px;\n  border: 0;\n  border-radius: var(--dsw-radius-m);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] > span:first-child {\n  width: 20px;\n  height: 20px;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] > span:first-child svg {\n  width: 20px;\n  height: 20px;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] > span:nth-child(2) {\n  gap: 0;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] > span:nth-child(2) > span:nth-child(2) {\n  display: none;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry=\"terminal\"] > span:nth-child(2) {\n  width: 20px;\n  height: 20px;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry=\"terminal\"] > span:nth-child(2) svg {\n  width: 20px;\n  height: 20px;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry=\"terminal\"] > span:nth-child(3) > span:nth-child(2) {\n  display: none;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] > span:has(kbd) {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  gap: 3px;\n  height: 24px;\n  padding: 0 10px;\n  border-radius: var(--dsw-radius-m);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 16px;\n  white-space: nowrap;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-guide-entry] kbd {\n  display: inline;\n  min-width: 0;\n  padding: 0;\n  border: 0;\n  border-radius: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n}\n\nhtml[data-codex-ui] [data-sidebar-right-toggle] {\n  background: var(--dsw-alias-bg-layer-2);\n  border-radius: var(--dsw-radius-m);\n}\n\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_add\"],\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_trigger\"] {\n  transition: background-color var(--dsw-motion-fast) var(--dsw-ease);\n  border-radius: var(--dsw-radius-pill);\n}\n\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_add\"] {\n  background: transparent;\n}\n\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_add\"]:hover,\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_add\"][aria-expanded=\"true\"],\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_trigger\"]:hover,\nhtml[data-codex-ui] [data-composer-card] button[class$=\"_trigger\"][aria-expanded=\"true\"] {\n  background: var(--dsw-codex-hover-fill);\n}\n\nhtml[data-codex-ui] [data-slot=\"conversation.input.model\"]:has(> .codex-mp-trigger) > :not(.codex-mp-trigger) {\n  display: none;\n}\n\nhtml[data-codex-ui] .codex-mp-trigger {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  height: 28px;\n  min-width: 0;\n  max-width: min(360px, 45cqw);\n  padding: 0 4px 0 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-pill);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-family: inherit;\n  font-size: 13px;\n  font-weight: 400;\n  line-height: 20px;\n  cursor: pointer;\n  transition: background-color var(--dsw-motion-fast) var(--dsw-ease);\n}\n\nhtml[data-codex-ui] .codex-mp-trigger:hover,\nhtml[data-codex-ui] .codex-mp-trigger[aria-expanded=\"true\"] {\n  background: var(--dsw-codex-hover-fill);\n}\n\nhtml[data-codex-ui] .codex-mp-trigger-model {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\nhtml[data-codex-ui] .codex-mp-effort-layers {\n  display: grid;\n  grid-template-columns: max-content;\n  flex-shrink: 1000;\n  width: max-content;\n  min-width: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-caption);\n}\n\nhtml[data-codex-ui] .codex-mp-effort-layers[hidden] {\n  display: none;\n}\n\nhtml[data-codex-ui] .codex-mp-effort-text {\n  grid-area: 1 / 1;\n  justify-self: center;\n  opacity: 0;\n  filter: blur(4px);\n  white-space: nowrap;\n  will-change: opacity, filter;\n  transition:\n    opacity var(--dsw-motion-slow) var(--dsw-ease),\n    filter var(--dsw-motion-slow) var(--dsw-ease);\n}\n\nhtml[data-codex-ui] .codex-mp-effort-text[data-active=\"true\"] {\n  opacity: 1;\n  filter: none;\n}\n\nhtml[data-codex-ui] .codex-mp-trigger-chevron {\n  display: inline-flex;\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n  transition: transform 120ms var(--dsw-ease);\n}\n\nhtml[data-codex-ui] .codex-mp-trigger[aria-expanded=\"true\"] .codex-mp-trigger-chevron {\n  transform: rotate(180deg);\n}\n\nhtml[data-codex-ui] .codex-mp-popover {\n  position: fixed;\n  z-index: 1100;\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  width: calc(4px * 63.5);\n  max-width: calc(100vw - 24px);\n  max-height: min(360px, 100vh - 96px);\n  padding: 5px;\n  border-radius: var(--dsw-radius-menu);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: var(--dsw-codex-menu-shadow);\n  font-size: 13px;\n  line-height: 20px;\n  transform-origin: bottom right;\n  animation: codex-mp-enter 0.32s cubic-bezier(0.23, 1, 0.32, 1) 30ms both;\n}\n\nhtml[data-codex-ui] .codex-mp-popover[hidden] {\n  display: none;\n}\n\nhtml[data-codex-ui] .codex-mp-popover[data-reduced-motion=\"true\"] {\n  animation: none;\n}\n\n@keyframes codex-mp-enter {\n  from {\n    opacity: 0;\n    transform: scale(0.98);\n  }\n\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\nhtml[data-codex-ui] .codex-mp-error {\n  flex: none;\n  margin-bottom: 3px;\n  padding: 6px 9px;\n  border-radius: calc(var(--dsw-radius-menu) - 5px);\n  background: var(--dsw-alias-interactive-bg-hover-danger);\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 11px;\n  line-height: 16px;\n}\n\nhtml[data-codex-ui] .codex-mp-error[hidden] {\n  display: none;\n}\n\nhtml[data-codex-ui] .codex-mp-list {\n  min-height: 0;\n  overflow-y: auto;\n  scrollbar-width: thin;\n}\n\nhtml[data-codex-ui] .codex-mp-status {\n  padding: 8px 9px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n}\n\nhtml[data-codex-ui] .codex-mp-retry {\n  padding: 0;\n  border: 0;\n  background: none;\n  color: inherit;\n  font: inherit;\n  font-weight: 600;\n  cursor: pointer;\n}\n\nhtml[data-codex-ui] .codex-mp-group {\n  padding: 4px 9px 2px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-weight: 500;\n  line-height: 16px;\n}\n\nhtml[data-codex-ui] .codex-mp-group:not(:first-child) {\n  margin-top: 3px;\n}\n\nhtml[data-codex-ui] .codex-mp-row {\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  min-height: 28px;\n  padding: 4px 9px;\n  border: 0;\n  border-radius: calc(var(--dsw-radius-menu) - 5px);\n  background: none;\n  color: inherit;\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n  cursor: pointer;\n}\n\nhtml[data-codex-ui] .codex-mp-row:hover,\nhtml[data-codex-ui] .codex-mp-row[aria-checked=\"true\"] {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\nhtml[data-codex-ui] .codex-mp-row:focus-visible {\n  outline: 1px solid var(--dsw-focus-ring-color);\n  outline-offset: -1px;\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\nhtml[data-codex-ui] .codex-mp-row[aria-busy=\"true\"] {\n  cursor: progress;\n}\n\nhtml[data-codex-ui] .codex-mp-row-copy {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  min-width: 0;\n}\n\nhtml[data-codex-ui] .codex-mp-row-name {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-weight: 500;\n}\n\nhtml[data-codex-ui] .codex-mp-row-desc {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n}\n\nhtml[data-codex-ui] .codex-mp-row-check {\n  display: grid;\n  flex: 0 0 14px;\n  place-items: center;\n  color: var(--dsw-alias-label-primary);\n}\n\nhtml[data-codex-ui] .codex-mp-spinner {\n  box-sizing: border-box;\n  display: inline-block;\n  flex: none;\n  width: 12px;\n  height: 12px;\n  border: 1.5px solid var(--dsw-alias-border-l3);\n  border-top-color: var(--dsw-alias-label-primary);\n  border-radius: 50%;\n  animation: codex-ui-spin 1s linear infinite;\n}\n\nhtml[data-codex-ui] .codex-mp-effort {\n  flex: none;\n  margin-top: 5px;\n  padding-top: 5px;\n  border-top: 0.5px solid var(--dsw-alias-border-l1);\n}\n\nhtml[data-codex-ui] .codex-mp-effort[hidden] {\n  display: none;\n}\n\nhtml[data-codex-ui] .codex-mp-effort-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  min-height: 28px;\n  padding: 4px 9px;\n  color: var(--dsw-alias-label-secondary);\n}\n\nhtml[data-codex-ui] .codex-mp-effort-value {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\nhtml[data-codex-ui] .codex-mp-container {\n  position: relative;\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  height: 32px;\n  margin-inline: 2px;\n  padding-block: 2px;\n  padding-inline: 6px;\n}\n\nhtml[data-codex-ui] .codex-mp-root {\n  --codex-mp-motion-duration: 0.3s;\n  --codex-mp-motion-easing: cubic-bezier(0.23, 1, 0.32, 1);\n  --codex-mp-tick-transform-duration: 0.12s;\n  --codex-mp-thumb-motion-duration: 0s;\n\n  position: relative;\n  display: flex;\n  align-items: center;\n  width: 100%;\n  height: 28px;\n  outline: none;\n  touch-action: none;\n  cursor: pointer;\n}\n\nhtml[data-codex-ui] .codex-mp-root[data-armed=\"true\"] {\n  --codex-mp-thumb-motion-duration: var(--codex-mp-motion-duration);\n}\n\nhtml[data-codex-ui] .codex-mp-root[data-dragging=\"true\"],\nhtml[data-codex-ui] .codex-mp-root[data-dragging=\"true\"] .codex-mp-tick {\n  cursor: grabbing;\n}\n\nhtml[data-codex-ui] .codex-mp-root[data-disabled=\"true\"] {\n  opacity: 0.6;\n}\n\nhtml[data-codex-ui] .codex-mp-popover[data-reduced-motion=\"true\"] .codex-mp-root {\n  --codex-mp-motion-duration: 0s;\n  --codex-mp-tick-transform-duration: 0s;\n  --codex-mp-thumb-motion-duration: 0s;\n}\n\nhtml[data-codex-ui] .codex-mp-track {\n  position: relative;\n  flex-grow: 1;\n  height: 24px;\n  overflow: hidden;\n  border-radius: 12px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);\n  box-shadow: inset 0 0 0 0.5px var(--dsw-codex-border);\n}\n\nhtml[data-codex-ui] .codex-mp-range {\n  position: absolute;\n  top: 0;\n  inset-inline-start: 0;\n  width: calc(14px + (100% - 28px) * var(--codex-mp-pos, 0));\n  height: 100%;\n  border-radius: 12px 0 0 12px;\n  background: var(--dsw-alias-link);\n  transition: width var(--codex-mp-thumb-motion-duration) var(--codex-mp-motion-easing);\n}\n\nhtml[data-codex-ui] .codex-mp-tick {\n  position: absolute;\n  top: 50%;\n  width: 4px;\n  height: 4px;\n  border-radius: 50%;\n  background: currentColor;\n  color: color-mix(in srgb, var(--dsw-alias-label-tertiary) 50%, transparent);\n  transform: translate(-50%, -50%);\n  transition:\n    transform var(--codex-mp-tick-transform-duration) var(--codex-mp-motion-easing),\n    filter var(--codex-mp-tick-transform-duration) var(--codex-mp-motion-easing);\n}\n\nhtml[data-codex-ui] .codex-mp-tick::before {\n  content: \"\";\n  position: absolute;\n  inset: -6px;\n}\n\nhtml[data-codex-ui] .codex-mp-tick:hover {\n  filter: brightness(0.85);\n  transform: translate(-50%, -50%) scale(2);\n}\n\nhtml[data-codex-ui] .codex-mp-tick[data-selected=\"true\"] {\n  color: #ffffff4d;\n}\n\nhtml[data-codex-ui] .codex-mp-thumb-scale {\n  position: absolute;\n  top: 50%;\n  left: calc(14px + (100% - 28px) * var(--codex-mp-pos, 0));\n  width: 28px;\n  height: 28px;\n  border-radius: 50%;\n  transform: translate(-50%, -50%);\n  pointer-events: none;\n  will-change: left;\n  transition: left var(--codex-mp-thumb-motion-duration) var(--codex-mp-motion-easing);\n}\n\nhtml[data-codex-ui] .codex-mp-thumb {\n  position: absolute;\n  inset: 0;\n  box-sizing: border-box;\n  display: block;\n  border: 0.5px solid var(--dsw-codex-border-strong);\n  border-radius: 50%;\n  background: #fff;\n  box-shadow: 0 0 2px #0000001a;\n}\n\nhtml[data-codex-ui] .codex-mp-root[data-keyboard-focused=\"true\"] .codex-mp-thumb-scale {\n  outline: 2px solid var(--dsw-focus-ring-color);\n  outline-offset: 0;\n}\n\nhtml[data-codex-ui] .codex-mp-root[data-unset] .codex-mp-thumb-scale,\nhtml[data-codex-ui] .codex-mp-root[data-unset] .codex-mp-range {\n  visibility: hidden;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button {\n  box-sizing: border-box;\n  height: auto;\n  min-height: 36px;\n  flex: none;\n  background: 0 0;\n  border: none;\n  border-radius: var(--dsw-radius-s);\n  justify-content: flex-start;\n  align-items: center;\n  gap: 6px;\n\n  margin: 0 2px 4px 0;\n  padding: 7px 8px;\n  font: inherit;\n  line-height: 22px;\n  text-align: left;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  overflow: hidden;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button:focus-visible {\n  outline: 2px solid var(--dsw-focus-ring-color);\n  outline-offset: -2px;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button > svg {\n  width: 16px;\n  height: 16px;\n  flex: none;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button > span {\n  max-width: none;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button > span > span:has(> svg) {\n  justify-content: flex-start;\n  width: auto;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button > span > span > svg {\n  width: 16px;\n  height: 16px;\n  flex: none;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > button > span > span > span {\n  max-width: none;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\nhtml[data-codex-ui] div:has(> * > [data-slot=\"sidebar.workspaces\"]):not(:has(> * > * > [data-slot=\"sidebar.toggle.badge\"])) > nav > button {\n  gap: 6px;\n  margin-left: 0;\n}\n\nhtml[data-codex-ui] div:has(> [data-slot=\"sidebar.workspaces\"]) [class$=\"_fade\"] {\n  display: none;\n}\n\nhtml[data-codex-ui] div:has(> [data-slot=\"sidebar.workspaces\"]) [class$=\"_list\"] {\n  -webkit-mask-image:\n    linear-gradient(\n      to bottom,\n      #000 0,\n      #000 calc(100% - 40px),\n      #000000e0 calc(100% - 24px),\n      #00000085 calc(100% - 12px),\n      #0000002e calc(100% - 4px),\n      #00000000 100%\n    ),\n    linear-gradient(#000, #000);\n  mask-image:\n    linear-gradient(\n      to bottom,\n      #000 0,\n      #000 calc(100% - 40px),\n      #000000e0 calc(100% - 24px),\n      #00000085 calc(100% - 12px),\n      #0000002e calc(100% - 4px),\n      #00000000 100%\n    ),\n    linear-gradient(#000, #000);\n  -webkit-mask-size: calc(100% - var(--dsh-session-list-edge-inset, 12px)) 100%, var(--dsh-session-list-edge-inset, 12px) 100%;\n  mask-size: calc(100% - var(--dsh-session-list-edge-inset, 12px)) 100%, var(--dsh-session-list-edge-inset, 12px) 100%;\n  -webkit-mask-position: 0 0, 100% 0;\n  mask-position: 0 0, 100% 0;\n  -webkit-mask-repeat: no-repeat, no-repeat;\n  mask-repeat: no-repeat, no-repeat;\n}\n\nhtml[data-codex-ui][data-windows-titlebar] div:has(> [data-slot=\"main\"]),\nhtml[data-codex-ui][data-windows-titlebar] div:has(> [data-slot=\"sidebar\"]) + div,\nhtml[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) div:has(> [data-slot=\"main\"]),\nhtml[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) div:has(> [data-slot=\"sidebar\"]) + div {\n  position: relative;\n  box-shadow:\n    0 0 0 0.5px var(--dsw-alias-border-l2),\n    0 0 24px var(--dsw-codex-ambient);\n}\n\nhtml[data-codex-ui][data-windows-titlebar] [data-sidebar-right-panel=\"push\"][data-sidebar-right-open],\nhtml[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) [data-sidebar-right-panel=\"push\"][data-sidebar-right-open] {\n  box-shadow:\n    0 0 0 0.5px var(--dsw-alias-border-l1),\n    0 -12px 24px -12px var(--dsw-codex-ambient);\n}\n\nhtml[data-codex-ui] [data-sidebar-right-panel=\"push\"][data-sidebar-right-open] [data-dockkit-pane][data-dockkit-column=\"0\"] {\n  border-left: 0;\n}\n\nhtml[data-codex-ui] [data-side=\"rightbar\"]::before {\n  content: \"\";\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 50%;\n  width: 2px;\n  translate: -50% 0;\n  border-radius: 1px;\n  background: linear-gradient(to bottom, rgba(13, 13, 13, 0.09), rgba(13, 13, 13, 0.27) 50%, rgba(13, 13, 13, 0.09));\n  opacity: 0;\n  scale: 1 0.35;\n  transform-origin: center;\n  transition: opacity var(--dsw-motion-base) var(--dsw-ease), scale var(--dsw-motion-slow) var(--dsw-ease);\n  pointer-events: none;\n}\n\nhtml[data-codex-ui] [data-side=\"rightbar\"]:hover::before {\n  opacity: 1;\n  scale: 1 1;\n}\n\nhtml[data-codex-ui] body[data-ds-dark-theme] [data-side=\"rightbar\"]::before {\n  background: linear-gradient(to bottom, rgba(236, 236, 236, 0.08), rgba(236, 236, 236, 0.24) 50%, rgba(236, 236, 236, 0.08));\n}\n\nhtml[data-codex-ui][data-platform=\"win32\"]:not([data-windows-titlebar]) div:has(> [data-slot=\"sidebar\"]) {\n  border-right-color: var(--dsw-alias-border-l1);\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] {\n  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);\n  --dsh-composer-side-clearance: 24px;\n\n  --dcu-composer-bg: var(--dsw-composer-surface);\n  --dcu-composer-shadow: 0 0 0 1px rgba(13, 13, 13, 0.1), 0 2px 8px 0 #0000000a, 0 4px 80px 8px #00000006;\n}\n\nhtml[data-codex-ui] body[data-ds-dark-theme] [data-conversation-scroll] {\n  --dcu-composer-bg: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, var(--dsw-composer-surface));\n  --dcu-composer-shadow: inset 0 0 1px 0 #fff3;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] {\n  padding-top: 12px;\n  gap: 4px;\n  border: 0;\n  border-radius: var(--dsw-radius-card);\n  background: var(--dcu-composer-bg);\n  box-shadow: var(--dcu-composer-shadow);\n}\n\n@supports (corner-shape: superellipse(1.5)) {\n  html[data-codex-ui] [data-conversation-scroll] [data-composer-card] {\n    corner-shape: superellipse(1.5);\n  }\n}\n\n@media (max-width: 639px) {\n  html[data-codex-ui] [data-conversation-scroll] {\n    --dcu-composer-shadow: 0 0 0 1px rgba(13, 13, 13, 0.1), 0 2px 8px 0 #0000000a, 0 4px 40px 8px #00000006;\n  }\n}\n\n@media (forced-colors: active) {\n  html[data-codex-ui] [data-conversation-scroll] [data-composer-card] {\n    outline: 1px solid CanvasText;\n  }\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] [data-input-scroll] {\n  margin-right: 0;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-input-scroll] [data-lexical-editor=true] {\n  min-height: 44px;\n  padding: 0 12px;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-placeholder] {\n  inset: 0 12px auto;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div {\n  padding: 0 8px 8px;\n  gap: 5px;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div > div {\n  gap: 4px;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div > div > div {\n  gap: 4px;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div button:not([role]),\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div select:not([role]) {\n  min-height: 28px;\n  height: 28px;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div button[class$=_primary] {\n  width: 28px;\n  transform: none;\n  background: var(--dsw-alias-label-primary);\n  color: var(--dsw-alias-bg-base);\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div button[class$=_primary]:hover:not(:disabled) {\n  background: var(--dsw-alias-label-secondary);\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div button:focus-visible,\nhtml[data-codex-ui] [data-conversation-scroll] [data-composer-card] > [data-input-scroll] + div select:focus-visible {\n  outline: 2px solid var(--dsw-focus-ring-color);\n  outline-offset: 2px;\n}\n\nhtml[data-codex-ui] [class*=\"_heroWorkspaceRow\"] button {\n  min-height: 28px;\n  border-radius: var(--dsw-radius-pill);\n  font-size: 13px;\n  line-height: 20px;\n}\n\nhtml[data-codex-ui] [class*=\"_heroWorkspaceRow\"] button:hover,\nhtml[data-codex-ui] [class*=\"_heroWorkspaceRow\"] button[aria-expanded=true] {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] {\n  box-sizing: border-box;\n  left: 0;\n  right: 0;\n  width: auto;\n  min-width: 0;\n  max-width: none;\n  padding: 5px;\n  border-radius: var(--dsw-radius-menu);\n  background: var(--dsw-codex-suggest-fill);\n  box-shadow: var(--dsw-codex-suggest-shadow);\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] > [role=listbox] {\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 0;\n  align-self: stretch;\n  scrollbar-width: thin;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] [role=option] {\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 0;\n  min-height: 28px;\n  padding: 4px 9px;\n  gap: 8px;\n  border-radius: calc(var(--dsw-radius-menu) - 5px);\n  font-size: 13px;\n  line-height: 20px;\n}\n\nhtml[data-codex-ui] [data-conversation-scroll] [data-trigger-menu] [role=option][aria-selected=true] {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);\n}\n\nhtml[data-codex-ui] [data-phase=hero] [data-conversation-scroll][class] {\n  --dsh-composer-side-clearance: 16px;\n  justify-content: flex-start;\n  scrollbar-gutter: stable both-edges;\n}\n\nhtml[data-codex-ui] [data-phase=hero] [data-composer-seat] {\n  flex: 1 0 auto;\n  min-height: 100%;\n}\n\nhtml[data-codex-ui] [data-phase=hero] [data-composer-seat] > :has(> * > [class*=\"_composerHero\"]) {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n}\n\nhtml[data-codex-ui] [data-phase=hero] [class*=\"_composerHero\"] {\n  box-sizing: border-box;\n  flex: 1;\n  width: 100%;\n  max-width: none;\n  min-width: 0;\n  margin-inline: auto;\n  gap: 0;\n  padding-bottom: 32px;\n}\n\nhtml[data-codex-ui] [data-phase=hero] [class*=\"_heroWorkspaceRow\"] {\n  box-sizing: border-box;\n  flex: none;\n  width: min(calc(var(--dsh-composer-card-max-width) + 2 * var(--dsh-composer-side-clearance) - 56px), calc(100% - 56px));\n  align-self: center;\n  justify-content: flex-start;\n  flex-wrap: wrap;\n  gap: 8px;\n  min-height: 48px;\n  margin: 0 28px -10px;\n  padding: 6px 12px 16px;\n  border-radius: var(--dsw-radius-card) var(--dsw-radius-card) 0 0;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-base));\n}\n\nhtml[data-codex-ui] [data-phase=hero] [class*=\"_heroWorkspaceRow\"] > [class$=\"_workspace\"] {\n  min-width: 0;\n  max-width: 100%;\n  font-weight: 400;\n}\n\nhtml[data-codex-ui] .cx-form {\n  display: flex;\n  flex-direction: column;\n  margin: 0;\n}\n\nhtml[data-codex-ui] .cx-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  align-items: center;\n  column-gap: 16px;\n  padding: 10px 0;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l1);\n}\n\nhtml[data-codex-ui] .cx-row:last-child {\n  border-bottom: none;\n}\n\nhtml[data-codex-ui] .cx-row__text {\n  min-width: 0;\n}\n\nhtml[data-codex-ui] .cx-row__label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 20px;\n}\n\nhtml[data-codex-ui] .cx-row__desc {\n  margin-top: 2px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n}\n\nhtml[data-codex-ui] .cx-row__control {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  justify-self: end;\n}\n\nhtml[data-codex-ui] .cx-swatch {\n  width: 24px;\n  height: 24px;\n  padding: 0;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-s);\n  background: none;\n  cursor: pointer;\n}\n\nhtml[data-codex-ui] .cx-swatch::-webkit-color-swatch-wrapper {\n  padding: 2px;\n}\n\nhtml[data-codex-ui] .cx-swatch::-webkit-color-swatch {\n  border: none;\n  border-radius: calc(var(--dsw-radius-s) - 2px);\n}\n\nhtml[data-codex-ui] .cx-hex {\n  width: 96px;\n  height: 24px;\n  padding: 0 8px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-s);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--ds-font-family-code);\n  font-size: 11px;\n  letter-spacing: 0.04em;\n}\n\nhtml[data-codex-ui] .cx-hex:focus-visible {\n  outline: 2px solid var(--dsw-focus-ring-color);\n  outline-offset: 1px;\n}\n\nhtml[data-codex-ui] .cx-text {\n  width: 220px;\n  height: 24px;\n  padding: 0 8px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-s);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n}\n\nhtml[data-codex-ui] .cx-text:focus-visible {\n  outline: 2px solid var(--dsw-focus-ring-color);\n  outline-offset: 1px;\n}\n\nhtml[data-codex-ui] .cx-range {\n  width: 160px;\n  accent-color: var(--dsw-alias-link);\n}\n\nhtml[data-codex-ui] .cx-range__value {\n  min-width: 24px;\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--ds-font-family-code);\n  font-size: 11px;\n  text-align: right;\n}\n\nhtml[data-codex-ui] .cx-note {\n  margin: 0 0 8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n}\n\nhtml[data-codex-ui] .cx-error {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 11px;\n  line-height: 16px;\n}\n";
return { THEME_CSS };
})();

/* src/client/stylesheet.js */
const __src_client_stylesheet = (() => {
const { THEME_CSS } = __codex_ui_theme_css;
const { PLUGIN_ID, ROOT_ATTR } = __src_client_constants;
/**
 * 皮肤样式：打上作用域根属性，注入内联的 theme.css（DSH 只下发 client.js，样式只能随它走）。
 * style[data-plugin] 是宿主的约定：插件卸载、热更新时模块系统会按它收走样式。
 */



function installStylesheet(ctx) {
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
return { installStylesheet };
})();

/* src/client/index.js */
const __src_client_index = (() => {
const { installModelPicker } = __src_client_model_picker_index;
const { installSettings } = __src_client_settings;
const { installStylesheet } = __src_client_stylesheet;
/**
 * codex-ui 浏览器半入口（DSH 客户端插件：导出 inject 与 apply，由 scripts/build.mjs 打成 client.js）。
 *
 * 功能按顺序装配：皮肤样式 → 设置（覆盖层、主题预览、配置卡）→ 模型选择器。
 * 样式先挂且不包 try：它是插件本体；其余任何一项失败都只降级，不连累皮肤。
 * 新功能 = src/client/ 下一个模块导出 install(ctx) + 这里一行。
 */




/**
 * cordis **服务名**（不是包名）：loader 逐个等它们就绪，缺一个本插件就不激活。
 * 只放必需的；可有可无的服务（modelDirectories）走 ctx.inject 子作用域。
 */
const inject = ['slots', 'configForms', 'theme'];

function apply(ctx) {
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
}
return { inject, apply };
})();

return { apply: __src_client_index.apply, inject: __src_client_index.inject };
  },
});
