/**
 * 模型选择器 B 面的 DOM 组件：Codex 模型列表 + 推理等级功率轨，顶替 composer 的模型位。
 *
 * 为什么是**自己的 DOM**：宿主菜单是竖列 radio，横向功率轨必须自建。0.5.0 用纯 CSS 把宿主
 * 菜单重排成轨，~25 条 :has() 挂在一个在 hover / focus / aria-busy 里反复重渲染的 portal 上 ——
 * 切换卡顿、界面简陋，已 revert。这里走「DOM 顶替席位」：
 *   1. 不注册 slot，也不动宿主的 React 树；
 *   2. 自己的触发器追加进 [data-slot="conversation.input.model"]，弹层挂 document.body；
 *   3. 席位里有我们的触发器时，给**席位出口**打 SEATED_ATTR，样式表据此把宿主那一格 display:none
 *      （model-picker.css ①）。标记打在出口上而不是宿主子节点上：React 换掉自己的子节点时标记不丢；
 *      撤走触发器时摘掉，宿主立刻复原。
 * 数据与提交全部走宿主唯一真源 ctx.modelDirectories，本模块不缓存模型列表。
 * 纯逻辑（几何、快照 → 视图、列表签名）在 ./view.js，本文件只管 DOM 与挂载。
 *
 * 驱动契约（读 @deepseek-ai/dsh-client-ui-model-selection 0.1.7-rc.1 / rc.2 源码得到）：
 *   models.directoryFor(sessionId)          → ModelDirectory（会话作用域未物化时**会抛**）
 *     dir.store.getSnapshot()                → { current, routable, groups, failures, status, error }
 *         status  : 'loading' | 'ready' | 'selecting' | 'error'
 *         groups  : [{ id, name, models: [{ id, name, description?, reasoning?: { defaultEffort?, efforts: [{ id, name }] } }] }]
 *         current : { provider, model, reasoningEffort? } | null
 *     dir.store.subscribe(fn)                → 退订函数
 *     dir.load()                             → 刷新目录（宿主在每次打开菜单时调一次）
 *     dir.select({ provider, model, reasoningEffort? }) → Promise<{ ok } | { ok:false, error:{ code, message } }>
 *   会话 id：席位祖先上的 data-conversation-session（宿主 ConversationRoot 打的），
 *            取不到再退到 uiSession.current.value.key（主视图那一个会话）。
 *
 *   **实测更正**：安装的 0.1.7-rc.1 的 ModelDirectoryState（lib/types/client/directory.d.ts:13-32）
 *   只有上面六个字段 —— 既没有 pending 也没有 retainedEffort（两个词在该包 client.js 里各出现 0 次）。
 *   所以「等宿主的 pending」这条路在这版上恒不触发，乐观显示必须是本模块自己的状态：
 *   席位级 seat.pending（见 settlePending / viewOfSeat）。宿主将来补上 pending 时仍优先用宿主的。
 *
 * 卡顿的解码：宿主把目录在**整个 selectModel 往返**（实测 ~1.1s）里标成 selecting。
 * 列表的签名里只放「长什么样」的东西，selecting 不在里面 —— 改档位时卡片不重画、不清空；
 * 往返期间轨与触发器按**本地 pending** 那一档乐观显示，并在档位名旁转圈（宿主菜单那里一个都不画）。
 *
 * 本地 pending 的因果链（0.5.11 修）：提交时记下目标 selection，宿主的 current 追平或提交失败即撤。
 * 没有它时，store 的第一次通知（status→selecting）会用**旧** current 重画轨，于是松手回弹一帧、
 * 底部触发器整段往返都停在旧档 —— 实测 t=234ms 轨回到旧档、t=252ms 才到新档。
 */
import { isEnglish } from '../host.js';
import { THUMB_SIZE, domSessionOf, indexRatio, listSignature, offsetRatio, sessionIdOf, snapIndex, viewOf } from './view.js';

/** 席位选择器（与 view.js 的 MODEL_SLOT 同源；这里只需要字符串）。 */
const SLOT_SELECTOR = '[data-slot="conversation.input.model"]';
/** 我们的触发器在席时打在席位出口上（样式表据此隐藏宿主那一格）。 */
const SEATED_ATTR = 'data-codex-ui-seated';
/** 自建节点的类名根（样式表只画 .codex-mp-*，不碰宿主任何节点）。 */
const TRIGGER_CLASS = 'codex-mp-trigger';
const POPOVER_CLASS = 'codex-mp-popover';
/** Codex --model-picker-power-slider-thumb-input-motion-duration：首帧 0s，16ms 后抬到 .3s。 */
const MOTION_ARM_MS = 16;
/** 本地 pending 的兜底寿命：宿主迟迟不回显（丢包 / 被更晚的提交取代）也不能把界面钉死。 */
const PENDING_ECHO_MS = 12000;
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
    'effort.faster': '更快',
    'effort.smarter': '更强',
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
    'effort.faster': 'Faster',
    'effort.smarter': 'Smarter',
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
export function mountModelPicker(env) {
  const models = env.models;
  /* 计时器与 devicePixelRatio 走 env.window：夹具里没有真 window（组件在页面里跑，但定时器要能被夹住）。 */
  const win = env.window ?? globalThis.window ?? globalThis;
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
  let effortText = null;
  let effortGhost = null;
  /** 上一次画出来的档位名（换档时它变成 ghost 飘走）。 */
  let lastEffortLabel = null;
  let endsBox = null;
  let matrix = null;
  /** 点阵已解出的网格签名（设备像素宽@dpr），空串表示还没建。 */
  let matrixSig = '';
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
    /* pending：本席位正在往返的那次 selection（宿主快照没有 pending 时的乐观来源）。 */
    const seat = { slot, button, model, layers, layerKey: '', sessionId: null, fromFallback: false, dir: null, off: null, pending: null, pendingSettled: false, pendingTimer: 0 };
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

  /** 两个 selection 是不是同一档（reasoningEffort 缺失与 undefined 等价）。 */
  const sameSelection = (a, b) => a !== null && b !== null
    && a.provider === b.provider && a.model === b.model
    && (a.reasoningEffort ?? undefined) === (b.reasoningEffort ?? undefined);

  /** 撤掉本地 pending 并重画（幂等；顺带收掉兜底计时器）。 */
  function clearPending(seat) {
    if (seat.pendingTimer !== 0) { win.clearTimeout(seat.pendingTimer); seat.pendingTimer = 0; }
    if (seat.pending === null) return;
    seat.pending = null;
    seat.pendingSettled = false;
    syncSeat(seat.slot);
    if (openSeat === seat) renderPopover();
  }

  /**
   * 宿主的 current 追平本地 pending 就撤掉它。
   *
   * **只有本次提交的 RPC 已经落地之后才允许撤**（seat.pendingSettled）—— 0.6.2 修的：
   * 宿主的 current 是「durable next-request projection」（directory.d.ts:14），它**落后于**提交。
   * 于是「切回当前那一档」时 current 与 pending 天然相等，早先那版会立刻撤掉乐观值，
   * 先前那次提交一落地就把显示拽回旧档 —— 就是「加载期间怎么滑都回弹」。
   */
  function settlePending(seat) {
    if (seat.pending === null || !seat.pendingSettled) return;
    const snap = snapshotOf(seat);
    const current = snap === null || snap.current === undefined ? null : snap.current;
    if (sameSelection(current, seat.pending)) clearPending(seat);
  }

  /** 席位视图：宿主快照 + 席位自己的 pending。所有读席位状态的地方都走这里。 */
  const viewOfSeat = (seat) => viewOf(snapshotOf(seat), seat.pending);

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
    settlePending(seat);
    const view = viewOfSeat(seat);
    if (!canSeat(seat, view)) {
      unseat(seat);
      if (openSeat === seat) close(false);
      return view;
    }
    paintTrigger(seat, view);
    if (seat.button.parentElement !== slot) slot.appendChild(seat.button);
    if (!slot.hasAttribute(SEATED_ATTR)) slot.setAttribute(SEATED_ATTR, '');
    return view;
  }

  /** 撤下触发器并摘掉席位标记：宿主那一格立刻复原。 */
  function unseat(seat) {
    if (seat.button.parentElement !== null) seat.button.remove();
    seat.slot.removeAttribute(SEATED_ATTR);
  }

  function dropSeat(seat) {
    if (seat.pendingTimer !== 0) { win.clearTimeout(seat.pendingTimer); seat.pendingTimer = 0; }
    if (openSeat === seat) close(false);
    seat.off?.();
    unseat(seat);
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
    effortText = el('span', 'codex-mp-value-text');
    effortGhost = el('span', 'codex-mp-effort-ghost');
    effortValue.append(effortText, effortGhost);
    head.appendChild(effortValue);
    const container = el('div', 'codex-mp-container');
    rail = el('div', 'codex-mp-root');
    rail.setAttribute('role', 'slider');
    rail.tabIndex = 0;
    const track = el('div', 'codex-mp-track');
    track.appendChild(el('div', 'codex-mp-range'));
    matrix = el('div', 'codex-mp-matrix');
    track.appendChild(matrix);
    const thumbScale = el('span', 'codex-mp-thumb-scale');
    thumbScale.appendChild(el('span', 'codex-mp-thumb'));
    rail.append(track, thumbScale);
    container.appendChild(rail);
    /* 两端命名的是方向（更快 / 更强），不是取值 —— 形态基准里它们在槽下方一行。 */
    endsBox = el('div', 'codex-mp-ends');
    endsBox.append(el('span', 'codex-mp-ends-faster', t('effort.faster')), el('span', 'codex-mp-ends-smarter', t('effort.smarter')));
    effortBox.append(head, container, endsBox);
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

  function renderPopover(view = openSeat === null ? null : viewOfSeat(openSeat)) {
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
    const label = effortLabelOf(view) ?? '';
    /* 换档是**交换**不是替换：进来的从下方模糊上浮，出去的（ghost 压在原位）向上飘走。 */
    if (label !== lastEffortLabel) {
      if (lastEffortLabel !== null) { effortGhost.textContent = lastEffortLabel; rearm(effortGhost); }
      lastEffortLabel = label;
      rearm(effortText);
    }
    effortText.textContent = label;
    const spin = effortValue.querySelector('.codex-mp-spinner');
    if (view.pendingEffort && spin === null) effortValue.insertBefore(el('span', 'codex-mp-spinner'), effortText);
    else if (!view.pendingEffort && spin !== null) spin.remove();
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
        /* 档位等距落在旋钮行程 [8, 宽 − 8] 上 —— 与旋钮、填充同一条 calc，零布局读。 */
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

  /* ── 顶档点阵（形态基准 dsh-claude-style 的 .dsh-claude-effort-matrix）──────────
     算法逐条照搬：5 行方块、1 设备像素缝、0.5 设备像素外边距，在**整设备像素**上解网格
     （小数 pitch 会被栅格化成交替的缝）；每格的相位/周期/色调由坐标 hash 散开，不成序；
     左侧的羽化是静态 opacity，颜色闪动从它上面走过，两者不打架。 */

  /** 坐标 hash → 0..1：先把两个坐标雪崩再取，免得邻居落进规则格点被看成斜带。 */
  function cellUnit(r, c, seed) {
    let h = Math.imul(r + 1, 0x9e3779b1) ^ Math.imul(c + 1, 0x85ebca6b) ^ Math.imul(seed + 1, 0x27d4eb2f);
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  /** 左端溶回裸槽、右端实心的羽化（smoothstep）。 */
  function cellFade(fx) {
    if (fx <= 0.05) return 0;
    if (fx >= 0.75) return 1;
    const t = (fx - 0.05) / 0.7;
    return t * t * (3 - 2 * t);
  }

  /** 按设备像素解网格：5 行 ~4px 方块，余数回填到四边留白，方块保持正方且居中。 */
  function solveMatrix(wDev, dpr) {
    const ROWS = 5;
    const gap = Math.max(1, Math.round(1 * dpr));
    const margin = Math.max(1, Math.round(0.5 * dpr));
    const hDev = Math.round(26 * dpr);
    const block = Math.max(3, Math.floor((hDev - 2 * margin - (ROWS - 1) * gap) / ROWS));
    const cols = Math.max(1, Math.floor((wDev + gap) / (block + gap)));
    const restX = wDev - (cols * block + (cols - 1) * gap);
    const restY = hDev - (ROWS * block + (ROWS - 1) * gap);
    return {
      cols,
      rows: ROWS,
      sq: block / dpr,
      gap: gap / dpr,
      padTop: Math.floor(restY / 2) / dpr,
      padBottom: (restY - Math.floor(restY / 2)) / dpr,
      padLeft: Math.floor(restX / 2) / dpr,
      padRight: (restX - Math.floor(restX / 2)) / dpr,
    };
  }

  /** 给一颗粒子它自己的闪烁：色调、相位、周期全部 hash 散开。 */
  function paintParticle(sq, r, c) {
    sq.setAttribute('data-tone', String(Math.floor(cellUnit(r, c, 1) * 8) % 8));
    sq.style.setProperty('animation-delay', ((cellUnit(r, c, 2) * 1.38 + 0.3).toFixed(3)) + 's', 'important');
    sq.style.setProperty('animation-duration', (1.45 * (0.92 + cellUnit(r, c, 3) * 0.16)).toFixed(3) + 's', 'important');
  }

  /** 轨宽变了或 dpr 变了才重建；轨还没布局（隐藏中）时返回 false，调用方下次再试。 */
  function ensureMatrix() {
    if (matrix === null) return false;
    const track = rail === null ? null : rail.querySelector('.codex-mp-track');
    if (track === null) return false;
    const w = track.clientWidth;
    if (!w) return false;
    const dpr = win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    const sig = Math.round(w * dpr) + '@' + dpr;
    if (sig === matrixSig) return true;
    const lay = solveMatrix(Math.round(w * dpr), dpr);
    matrix.textContent = '';
    matrix.style.gap = lay.gap + 'px';
    matrix.style.padding = lay.padTop + 'px ' + lay.padRight + 'px ' + lay.padBottom + 'px ' + lay.padLeft + 'px';
    matrix.style.gridTemplateColumns = 'repeat(' + lay.cols + ', ' + lay.sq + 'px)';
    matrix.style.gridAutoRows = lay.sq + 'px';
    for (let r = 0; r < lay.rows; r += 1) {
      for (let c = 0; c < lay.cols; c += 1) {
        const fx = lay.cols > 1 ? c / (lay.cols - 1) : 1;
        const cell = el('div', 'codex-mp-matrix-cell');
        /* 入场从右端扫进来（旋钮够到的那一端），带一点散相，免得读成一次擦除。 */
        cell.style.setProperty('animation-delay', (((1 - fx) * 0.45 + cellUnit(r, c, 4) * 0.08).toFixed(3)) + 's', 'important');
        const sq = el('div', 'codex-mp-matrix-sq');
        sq.style.opacity = cellFade(fx).toFixed(3);
        paintParticle(sq, r, c);
        cell.appendChild(sq);
        matrix.appendChild(cell);
      }
    }
    matrixSig = sig;
    return true;
  }

  /** 让 CSS 动画重新起跑（换档时名字交换要重播，否则第二次换档不动）。 */
  function rearm(node) {
    if (node === null) return;
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
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
    /* 顶档（形态基准里的 apex）：拖动中也要亮 —— 拉到最右端即触发，不等松手，所以判据挂在
       **连续比例**上而不是生效档 index 上。单档模型没有「最高档」可言。
       data-tier 同时打在轨上（点阵、旋钮、填充、刻度）与 effortBox 上（档位名转紫）。 */
    const atMax = ratio !== null && count > 1 && ratio >= 1 - 1e-6;
    if (atMax && ensureMatrix()) {
      rail.setAttribute('data-tier', 'max');
      if (effortBox !== null) effortBox.setAttribute('data-tier', 'max');
    } else {
      rail.removeAttribute('data-tier');
      if (effortBox !== null) effortBox.removeAttribute('data-tier');
    }
  }

  function currentEfforts() {
    if (openSeat === null) return null;
    const view = viewOfSeat(openSeat);
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
  /**
   * 提交一次 selection。
   *
   * 提交前先把目标记进 seat.pending 并立刻重画：轨 / 触发器 / 弹层档位名从这一帧起就是目标档，
   * 不再等 durable projection。撤除点有三个，全都幂等 ——
   *   1. 宿主的 current 追平（settlePending，随 store 通知与每轮 scan 跑）；
   *   2. 提交成功返回（此时宿主已 syncInputs，current 就是目标档）；
   *   3. 提交失败或抛异常。
   * 只有在 seat.pending 还是本次那一笔时才撤，晚到的旧响应不会清掉更新的提交。
   *
   * @param seat - 席位。
   * @param selection - { provider, model, reasoningEffort? }。
   * @param closeOnOk - 成功后是否收起弹层（换模型收，改档位不收）。
   */
  function submit(seat, selection, closeOnOk) {
    if (seat.dir === null) return;
    failure = null;
    const submitted = {
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
    };
    seat.pending = submitted;
    seat.pendingSettled = false;
    if (seat.pendingTimer !== 0) { win.clearTimeout(seat.pendingTimer); seat.pendingTimer = 0; }
    syncSeat(seat.slot);
    if (openSeat === seat) renderPopover();
    /**
     * 本次提交的 RPC 落地了（不是本次的那一笔就留着）。
     * 成功时**不直接撤**：先允许撤，再看宿主有没有追平；没追平就留着 pending 等它，
     * 并挂一条兜底寿命 —— 否则界面会卡在一个宿主永远不回显的档上。
     * @param force - 失败路径：无论如何撤掉（错就是错，不能让乐观值盖住失败）。
     */
    const release = (force) => {
      if (seat.pending !== submitted) return;
      if (force === true) { clearPending(seat); return; }
      seat.pendingSettled = true;
      settlePending(seat);
      if (seat.pending === null) return;
      seat.pendingTimer = win.setTimeout(() => { seat.pendingTimer = 0; clearPending(seat); }, PENDING_ECHO_MS);
    };
    let pending;
    try { pending = seat.dir.select(selection); } catch (error) {
      release(true);
      failure = t('error.action', { message: String(error && error.message ? error.message : error) });
      renderPopover();
      return;
    }
    Promise.resolve(pending).then((result) => {
      if (result === undefined || result === null) return;
      if (result.ok) {
        release(false);
        if (closeOnOk && openSeat === seat) close(true);
        return;
      }
      release(true);
      const error = result.error ?? {};
      failure = error.code === 'session/writer-held' ? t('error.sessionInUse') : t('error.action', { message: (error.code ?? '') + ': ' + (error.message ?? '') });
      if (openSeat === seat) renderPopover();
    }, (error) => {
      release(true);
      failure = t('error.action', { message: String(error && error.message ? error.message : error) });
      if (openSeat === seat) renderPopover();
    });
  }

  /** 选模型：同一个就只关掉（宿主 choose()）；否则连带该模型的默认档位一起提交，成功后关。 */
  function choose(group, model) {
    const seat = openSeat;
    if (seat === null) return;
    const view = viewOfSeat(seat);
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
