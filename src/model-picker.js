/**
 * model-picker.js — Codex 模型选择器（浏览器半，构建期拼进 client.js）。
 *
 * 为什么是**自己的 DOM**而不是改宿主的菜单：
 * 0.5.0 那条路（把宿主菜单里的竖列 radio 用 CSS 重排成轨）实测切换卡顿、界面简陋。
 * 根因是选择器挂在宿主菜单上（:has() 触发的后代失效 × 宿主在 aria-busy 窗口里的反复
 * 重渲染），而且只重排了 4 行名字 —— 没有模型列表、没有分组、没有可拖的控件。
 * 所以这里改成 dsh-claude-style 的做法：**不注册 slot，靠 DOM 顶替**。
 *   1. 找到 [data-slot="conversation.input.model"]，给它原有的子节点打上 HOST_ATTR；
 *   2. 样式表把带 HOST_ATTR 的那个节点 display:none（宿主触发器仍在 React 树里，只是看不见）；
 *   3. 自己的触发器挂进同一个 slot，弹层挂 document.body。
 * 数据与提交全部走宿主唯一真源（ctx.get('modelDirectories')），本模块不缓存模型列表。
 *
 * 驱动契约（读 @deepseek-ai/dsh-client-ui-model-selection 与 dsh-claude-style 的用法得到）：
 *   ctx.get('uiSession').current.value.key ?? ctx.get('sessions').list.current   → 会话 id
 *   ctx.get('modelDirectories').directoryFor(id)  → ModelDirectory（会话未就绪时会抛，要 try）
 *     dir.load()                                  → 拉目录（一次 RPC，宿主侧缓存）
 *     dir.select({ provider, model, reasoningEffort })  → 提交（异步；拒绝由宿主 toast 报）
 *     dir.store.getSnapshot() → { status, groups, current }
 *     dir.store.subscribe(cb)                     → 响应式（订阅 store，不是 dir 实例）
 *
 * 卡顿的解码：宿主把目录在**整个 selectModel 往返**期间标成 selecting，走网络的适配器要好几秒。
 * 所以渲染有一道签名守卫：只要手上已经有分组和当前项，状态变化就不重画列表 —— 改档位时
 * 卡片不会被清空、也不会掉帧。
 */

/** 打在宿主触发器上的属性；样式表靠它隐藏宿主控件。 */
export const HOST_ATTR = 'data-codex-ui-model-host';
/** 自己那两棵 DOM 的类名根。 */
export const BTN_CLASS = 'codex-mp-trigger';
export const POP_CLASS = 'codex-mp-popover';
/** 弹层与触发器之间的间距（Codex 的 composer 弹层是 6px）。 */
export const POPOVER_GAP = 6;
/** 视口边距。 */
export const POPOVER_MARGIN = 8;

/**
 * 当前会话 id。
 * dsh 0.2 起 Session Controller 的 list.current 已废，主视图选择由 uiSession 投影给出；
 * 先读新源，再回退旧字段，老宿主才不会一方失灵。
 * @param ctx - 客户端上下文。
 * @returns 会话 id，取不到时 null。
 */
export function currentSessionId(ctx) {
  try {
    const uiSession = ctx.get('uiSession');
    const value = uiSession === undefined || uiSession === null ? null : uiSession.current;
    const key = value === undefined || value === null || value.value === undefined || value.value === null
      ? undefined
      : value.value.key;
    if (typeof key === 'string') return key;
    const sessions = ctx.get('sessions');
    const list = sessions === undefined || sessions === null ? null : sessions.list;
    const snapshot = list === undefined || list === null ? null : list.getSnapshot();
    const legacy = snapshot === undefined || snapshot === null ? null : snapshot.current;
    return typeof legacy === 'string' ? legacy : null;
  } catch (error) {
    return null;
  }
}

/**
 * 解析当前会话的 ModelDirectory。会话作用域还没物化时宿主会抛，这里吞掉并返回 null，
 * 下一趟订阅回调再试 —— 不猜、不缓存失败。
 * @param ctx - 客户端上下文。
 * @param id - 会话 id。
 * @returns ModelDirectory 或 null。
 */
export function directoryFor(ctx, id) {
  if (typeof id !== 'string' || id === '') return null;
  try {
    const dirs = ctx.get('modelDirectories');
    if (dirs === undefined || dirs === null || typeof dirs.directoryFor !== 'function') return null;
    return dirs.directoryFor(id) ?? null;
  } catch (error) {
    return null;
  }
}

/**
 * 把指针在轨上的连续比例换成最近档位下标（松手对齐用）。
 * @param ratio - 0..1 的连续比例（超界会被夹住）。
 * @param count - 档位个数。
 * @returns 0..count-1 的下标。
 */
export function snapIndex(ratio, count) {
  if (!Number.isFinite(count) || count <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return Math.round(clamped * (count - 1));
}

/**
 * 功率轨几何：拇指中心可以走的区间是 [thumb/2, width - thumb/2]，档位等距分布在其中。
 * 这就是 Codex _Thumb 的行程（left 从 14px 走到 width-14px），本模块照搬。
 * @param index - 档位下标。
 * @param count - 档位个数。
 * @param width - 轨宽（px）。
 * @param thumb - 拇指直径（px）。
 * @returns 拇指中心相对轨左边缘的 px 偏移。
 */
export function tickOffset(index, count, width, thumb) {
  if (!Number.isFinite(width) || width <= thumb) return thumb / 2;
  if (count <= 1) return width / 2;
  const span = width - thumb;
  const i = Math.min(count - 1, Math.max(0, index));
  return thumb / 2 + span * (i / (count - 1));
}

/** 由指针位置反推连续比例（与 tickOffset 互逆）。 */
export function offsetRatio(clientX, left, width, thumb) {
  if (!Number.isFinite(width) || width <= thumb) return 0;
  return Math.min(1, Math.max(0, (clientX - left - thumb / 2) / (width - thumb)));
}

/**
 * 安装模型选择器。返回一个句柄：setEnabled 换开关、dispose 全撤。
 * @param ctx - 客户端上下文。
 * @param doc - document（夹具可注入）。
 * @returns 句柄。
 */
export function installModelPicker(ctx, doc) {
  const document_ = doc ?? globalThis.document;
  let enabled = true;
  let disposed = false;
  let slot = null;
  let hostRoot = null;
  let button = null;
  let popover = null;
  let listBox = null;
  let railBox = null;
  let footBox = null;
  let open = false;
  let dir = null;
  let unsubscribe = null;
  let lastSignature = '';
  let dragging = null;
  let observer = null;
  /* 拖动中的连续比例：只在拖动时非 null，松手清零并提交。 */
  let draftRatio = null;

  /** 目录实例（每会话一次）；会话切换时重订阅。 */
  function refreshDirectory() {
    const id = currentSessionId(ctx);
    if (dir !== null && dir.__sessionId === id) return dir;
    const next = directoryFor(ctx, id);
    if (unsubscribe !== null) { unsubscribe(); unsubscribe = null; }
    dir = next;
    if (dir !== null) {
      dir.__sessionId = id;
      if (typeof dir.load === 'function') {
        const pending = dir.load();
        if (pending !== undefined && pending !== null && typeof pending.catch === 'function') pending.catch(() => {});
      }
      if (dir.store !== undefined && dir.store !== null && typeof dir.store.subscribe === 'function') {
        unsubscribe = dir.store.subscribe(() => { render(); });
      }
    }
    return dir;
  }

  /** 目录快照；没有目录时为 null。 */
  function snapshot() {
    if (dir === null || dir.store === undefined || dir.store === null) return null;
    return dir.store.getSnapshot() ?? null;
  }

  /** 当前项解析到分组与模型条目。 */
  function currentOf(snap) {
    if (snap === null || snap.current === undefined || snap.current === null) return null;
    const groups = Array.isArray(snap.groups) ? snap.groups : [];
    for (let g = 0; g < groups.length; g += 1) {
      if (groups[g].id !== snap.current.provider) continue;
      const models = Array.isArray(groups[g].models) ? groups[g].models : [];
      for (let m = 0; m < models.length; m += 1) {
        if (models[m].id === snap.current.model) return { group: groups[g], model: models[m] };
      }
    }
    return null;
  }

  /** 推理元数据 + 生效档位；模型不支持思考时返回 null（此时不画轨）。 */
  function effortOf(snap, active) {
    if (active === null || active.model.reasoning === undefined || active.model.reasoning === null) return null;
    const reasoning = active.model.reasoning;
    const efforts = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
    if (efforts.length === 0) return null;
    const saved = snap.current.reasoningEffort;
    const effective = saved !== undefined && saved !== null ? saved : reasoning.defaultEffort;
    let index = -1;
    for (let i = 0; i < efforts.length; i += 1) if (efforts[i].id === effective) index = i;
    return { reasoning, efforts, effective, index: index < 0 ? 0 : index, name: index < 0 ? efforts[0].name : efforts[index].name };
  }

  /** 提交一次选择；拒绝交给宿主的 toast，本模块不吞掉错误信息也不重复上报。 */
  function commit(selection) {
    if (dir === null || typeof dir.select !== 'function') return;
    const pending = dir.select(selection);
    if (pending !== undefined && pending !== null && typeof pending.catch === 'function') pending.catch(() => {});
  }

  /** 模型名 / 档位名的显示文案（目录还没到时退回已保存的 id，与宿主同一策略）。 */
  function labels(snap) {
    const active = currentOf(snap);
    if (active === null) {
      const current = snap === null ? null : snap.current;
      return { model: current === null ? '' : current.model, effort: '' };
    }
    const effort = effortOf(snap, active);
    return { model: active.model.name || active.model.id, effort: effort === null ? '' : effort.name };
  }

  function element(tag, className, text) {
    const node = document_.createElement(tag);
    if (className !== '') node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** 触发器：模型名 + 档位名 + chevron（Codex ModelPickerTriggerLabel 的三段）。 */
  function ensureButton() {
    if (button !== null && button.isConnected) return button;
    button = element('button', BTN_CLASS);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const model = element('span', 'codex-mp-trigger-model');
    const effort = element('span', 'codex-mp-trigger-effort');
    const chevron = element('span', 'codex-mp-trigger-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.append(model, effort, chevron);
    button.addEventListener('click', (event) => { event.stopPropagation(); toggle(); });
    return button;
  }

  function ensurePopover() {
    if (popover !== null && popover.isConnected) return popover;
    popover = element('div', POP_CLASS);
    popover.setAttribute('role', 'menu');
    popover.setAttribute('data-open', 'false');
    listBox = element('div', 'codex-mp-list');
    footBox = element('div', 'codex-mp-foot');
    railBox = element('div', 'codex-mp-rail');
    railBox.setAttribute('tabindex', '0');
    railBox.setAttribute('role', 'slider');
    railBox.setAttribute('aria-label', '推理强度');
    footBox.appendChild(railBox);
    popover.append(listBox, footBox);
    popover.addEventListener('pointerdown', (event) => event.stopPropagation());
    document_.body.appendChild(popover);
    lastSignature = '';
    wireRail();
    return popover;
  }

  /** 弹层定位：默认在触发器正上方，空间不够翻到下方，横向夹在视口内。 */
  function position() {
    if (popover === null || button === null) return;
    const anchor = button.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = Math.min(Math.max(POPOVER_MARGIN, anchor.left), globalThis.innerWidth - width - POPOVER_MARGIN);
    let top = anchor.top - height - POPOVER_GAP;
    if (top < POPOVER_MARGIN) top = anchor.bottom + POPOVER_GAP;
    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(top) + 'px';
  }

  function setOpen(next) {
    open = next;
    if (open) ensurePopover();
    if (popover !== null) popover.setAttribute('data-open', open ? 'true' : 'false');
    if (button !== null) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { render(); position(); }
  }

  function toggle() { setOpen(!open); }

  /* ── 轨：Codex _Track / _Range / _Tick / _Thumb ─────────────────────────── */

  /** 读轨宽与拇指直径（都从实际布局读，不写死，主题改字号也不会错位）。 */
  function railMetrics() {
    const rect = railBox.getBoundingClientRect();
    const thumb = 28;
    return { left: rect.left, width: rect.width, thumb };
  }

  /** 画轨：N 个可点圆点 + 一个拇指 + 一段强调色条。档位 < 2 时整条收起。 */
  function renderRail(effort) {
    railBox.textContent = '';
    if (effort === null) {
      railBox.setAttribute('data-empty', 'true');
      railBox.removeAttribute('aria-valuenow');
      return;
    }
    railBox.removeAttribute('data-empty');
    const efforts = effort.reasoning.efforts;
    const metrics = railMetrics();
    const range = element('span', 'codex-mp-rail-range');
    const thumb = element('span', 'codex-mp-rail-thumb');
    railBox.append(range, thumb);
    const ticks = [];
    for (let i = 0; i < efforts.length; i += 1) {
      const tick = element('button', 'codex-mp-tick');
      tick.type = 'button';
      tick.dataset.effort = efforts[i].id;
      tick.dataset.index = String(i);
      tick.setAttribute('aria-label', efforts[i].name);
      tick.style.left = tickOffset(i, efforts.length, metrics.width, metrics.thumb) + 'px';
      if (i === effort.index) tick.dataset.selected = 'true';
      tick.addEventListener('click', (event) => { event.stopPropagation(); commit({ provider: currentOf(snapshot()).group.id, model: currentOf(snapshot()).model.id, reasoningEffort: efforts[i].id }); });
      railBox.appendChild(tick);
      ticks.push(tick);
    }
    railBox.dataset.count = String(efforts.length);
    railBox.setAttribute('aria-valuemin', '0');
    railBox.setAttribute('aria-valuemax', String(efforts.length - 1));
    railBox.setAttribute('aria-valuenow', String(effort.index));
    railBox.setAttribute('aria-valuetext', effort.name);
    paintRail(effort.index, efforts.length);
    void ticks;
  }

  /** 把拇指与色条画到某个位置上（position 可以是连续值，拖动时用）。 */
  function paintRail(position, count) {
    if (railBox === null || railBox.getAttribute('data-empty') === 'true') return;
    const metrics = railMetrics();
    const max = Math.max(0, count - 1);
    const offset = max === 0 ? metrics.width / 2 : metrics.thumb / 2 + (metrics.width - metrics.thumb) * (position / max);
    const thumb = railBox.querySelector('.codex-mp-rail-thumb');
    const range = railBox.querySelector('.codex-mp-rail-range');
    if (thumb !== null) thumb.style.left = offset + 'px';
    if (range !== null) range.style.width = Math.max(0, offset) + 'px';
  }

  /** 拖动：按下抓取、移动自由滑动（不提交）、松手对齐最近档位并提交一次。 */
  function wireRail() {
    railBox.addEventListener('pointerdown', (event) => {
      if (railBox.getAttribute('data-empty') === 'true') return;
      const count = Number(railBox.dataset.count);
      if (!Number.isFinite(count) || count < 2) return;
      event.preventDefault();
      const metrics = railMetrics();
      dragging = { count, thumb: metrics.thumb };
      railBox.setPointerCapture(event.pointerId);
      railBox.dataset.dragging = 'true';
      draftRatio = offsetRatio(event.clientX, metrics.left, metrics.width, metrics.thumb);
      railBox.style.setProperty('--codex-mp-motion', '0s');
      paintRail(draftRatio * (count - 1), count);
    });
    railBox.addEventListener('pointermove', (event) => {
      if (dragging === null) return;
      const metrics = railMetrics();
      draftRatio = offsetRatio(event.clientX, metrics.left, metrics.width, metrics.thumb);
      paintRail(draftRatio * (dragging.count - 1), dragging.count);
    });
    const release = (event) => {
      if (dragging === null) return;
      const count = dragging.count;
      dragging = null;
      railBox.removeAttribute('data-dragging');
      railBox.style.removeProperty('--codex-mp-motion');
      if (typeof railBox.releasePointerCapture === 'function' && railBox.hasPointerCapture !== undefined && railBox.hasPointerCapture(event.pointerId)) {
        railBox.releasePointerCapture(event.pointerId);
      }
      const index = snapIndex(draftRatio === null ? 0 : draftRatio, count);
      draftRatio = null;
      paintRail(index, count);
      const active = currentOf(snapshot());
      const efforts = active === null || active.model.reasoning === undefined ? [] : (active.model.reasoning.efforts || []);
      if (active !== null && efforts[index] !== undefined) {
        commit({ provider: active.group.id, model: active.model.id, reasoningEffort: efforts[index].id });
      }
    };
    railBox.addEventListener('pointerup', release);
    railBox.addEventListener('pointercancel', release);
    railBox.addEventListener('keydown', (event) => {
      if (railBox.getAttribute('data-empty') === 'true') return;
      const count = Number(railBox.dataset.count);
      const now = Number(railBox.getAttribute('aria-valuenow'));
      let next = now;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, now - 1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(count - 1, now + 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = count - 1;
      else return;
      event.preventDefault();
      const active = currentOf(snapshot());
      const efforts = active === null || active.model.reasoning === undefined ? [] : (active.model.reasoning.efforts || []);
      if (active !== null && efforts[next] !== undefined) {
        paintRail(next, count);
        commit({ provider: active.group.id, model: active.model.id, reasoningEffort: efforts[next].id });
      }
    });
  }

  /* ── 列表与渲染 ────────────────────────────────────────────────────────── */

  function buildRow(group, model, selected) {
    const rowEl = element('button', 'codex-mp-row');
    rowEl.type = 'button';
    rowEl.setAttribute('role', 'menuitemradio');
    rowEl.setAttribute('aria-checked', selected ? 'true' : 'false');
    const copy = element('span', 'codex-mp-row-copy');
    copy.appendChild(element('span', 'codex-mp-row-name', model.name || model.id));
    if (typeof model.description === 'string' && model.description !== '') {
      copy.appendChild(element('span', 'codex-mp-row-desc', model.description));
    }
    const check = element('span', 'codex-mp-row-check');
    if (selected) {
      check.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    rowEl.append(copy, check);
    rowEl.addEventListener('click', (event) => {
      event.stopPropagation();
      commit({ provider: group.id, model: model.id });
      setOpen(false);
    });
    return rowEl;
  }

  /**
   * 重画。签名里只放会改变列表长相的东西（状态、当前项、每个分组的模型数），
   * 且**只要已经有分组和当前项就不因 selecting 重画** —— 那是宿主整个选型往返的状态，
   * 拿它当重画条件就会在改档位时把卡片清空（dsh-claude-style 注释里记的同一个坑）。
   */
  function render() {
    refreshDirectory();
    const snap = snapshot();
    const names = labels(snap);
    if (button !== null) {
      const modelEl = button.querySelector('.codex-mp-trigger-model');
      const effortEl = button.querySelector('.codex-mp-trigger-effort');
      if (modelEl !== null) modelEl.textContent = names.model;
      if (effortEl !== null) { effortEl.textContent = names.effort; effortEl.toggleAttribute('data-hidden', names.effort === ''); }
    }
    if (open === false || listBox === null) return;
    const status = snap === null ? 'idle' : snap.status;
    const groups = snap === null || !Array.isArray(snap.groups) ? [] : snap.groups;
    const active = currentOf(snap);
    const effort = effortOf(snap, active);
    let signature = [status, active === null ? '' : active.group.id + '/' + active.model.id, effort === null ? '' : effort.index].join('|');
    for (let g = 0; g < groups.length; g += 1) signature += ';' + groups[g].id + ':' + (Array.isArray(groups[g].models) ? groups[g].models.length : 0);
    if (signature !== lastSignature) {
      lastSignature = signature;
      listBox.textContent = '';
      const seated = groups.length > 0 && active !== null;
      if (!seated && (status === 'idle' || status === 'loading' || status === 'selecting')) {
        listBox.appendChild(element('div', 'codex-mp-status', '正在载入模型…'));
      } else if (groups.length === 0) {
        listBox.appendChild(element('div', 'codex-mp-status', '没有可用模型'));
      } else {
        for (let g = 0; g < groups.length; g += 1) {
          const group = groups[g];
          const models = Array.isArray(group.models) ? group.models : [];
          if (models.length === 0) continue;
          listBox.appendChild(element('div', 'codex-mp-group', group.name || group.id));
          for (let m = 0; m < models.length; m += 1) {
            const selected = active !== null && active.group.id === group.id && active.model.id === models[m].id;
            listBox.appendChild(buildRow(group, models[m], selected));
          }
        }
      }
    }
    renderRail(effort);
    if (open) position();
  }

  /* ── 席位接管 ──────────────────────────────────────────────────────────── */

  /** 给宿主触发器打标记；React 换节点后会丢，所以每趟 sync 都补一次。 */
  function markHost() {
    if (slot === null) return;
    const root = slot.firstElementChild;
    if (root === null || root === button) return;
    hostRoot = root;
    if (!root.hasAttribute(HOST_ATTR)) root.setAttribute(HOST_ATTR, '');
  }

  /** 把我们的触发器放回 slot，并守住最后一个子节点（宿主可能在自己那边追加）。 */
  function sync() {
    if (disposed || !enabled) return;
    const next = document_.querySelector('[data-slot="conversation.input.model"]');
    if (next === null) return;
    slot = next;
    /* 顺序要紧：先把自己那棵放好，再打隐藏标记。反过来写的话，
       ensureButton 万一抛错，宿主触发器已经被藏，用户就既没有我们的也没有宿主的。 */
    const node = ensureButton();
    if (node.parentElement !== slot || slot.lastElementChild !== node) slot.appendChild(node);
    markHost();
    render();
  }

  /** 撤干净：节点、属性、订阅、观察器一个不留，宿主触发器立刻恢复。 */
  function drop() {
    setOpen(false);
    if (observer !== null) observer.disconnect();
    observedSlot = null;
    if (unsubscribe !== null) { unsubscribe(); unsubscribe = null; }
    dir = null;
    lastSignature = '';
    if (button !== null && button.parentElement !== null) button.parentElement.removeChild(button);
    if (popover !== null && popover.parentElement !== null) popover.parentElement.removeChild(popover);
    if (hostRoot !== null && hostRoot.hasAttribute(HOST_ATTR)) hostRoot.removeAttribute(HOST_ATTR);
    hostRoot = null;
  }

  /* 三件事决定这里的观察策略：
     ① 装配时 composer 往往还没挂上（真 GUI 实测 6s 才稳定），所以一开始不能只等一次性 sync；
     ② 宿主重渲染会把 slot 的子节点整棵换掉（我们的按钮与标记都会掉），所以要盯 slot 的 childList；
     ③ 盯 body 整棵子树能覆盖①，但 React 应用每次渲染都会打进来，代价正是 0.5.0 卡顿的来源。
     所以：**槽位没找到之前用 1s 轮询**（一次 querySelector，可忽略），**找到之后改挂 slot 的
     childList 观察器**（只收自己那一格的变动）。槽位被整棵换掉时 isConnected 转 false，自动退回轮询。 */
  if (typeof globalThis.MutationObserver === 'function') {
    observer = new globalThis.MutationObserver(() => { if (enabled) sync(); });
  }
  let observedSlot = null;
  function attach() {
    if (disposed || !enabled) return;
    if (observedSlot === null || !observedSlot.isConnected) sync();
    if (slot !== null && slot.isConnected && observedSlot !== slot) {
      if (observer !== null) observer.disconnect();
      observedSlot = slot;
      if (observer !== null) observer.observe(slot, { childList: true });
    }
  }

  const onDocumentPointerDown = (event) => {
    if (open === false) return;
    if (popover !== null && popover.contains(event.target)) return;
    if (button !== null && button.contains(event.target)) return;
    setOpen(false);
  };
  const onKeyDown = (event) => { if (event.key === 'Escape' && open) setOpen(false); };
  const onResize = () => { if (open) position(); };
  document_.addEventListener('pointerdown', onDocumentPointerDown, true);
  document_.addEventListener('keydown', onKeyDown, true);
  globalThis.addEventListener('resize', onResize);

  attach();
  const poll = globalThis.setInterval(attach, 1000);

  return {
    /** 开关。关掉即把席位还给宿主，与没装插件时逐字节相同。 */
    setEnabled(next) {
      const value = next !== false;
      if (value === enabled) return;
      enabled = value;
      if (enabled) sync(); else drop();
    },
    /** 当前是否接管着席位（验收用）。 */
    isActive() { return enabled && hostRoot !== null && hostRoot.hasAttribute(HOST_ATTR); },
    /** 手动重画（验收用）。 */
    refresh() { sync(); },
    dispose() {
      disposed = true;
      drop();
      globalThis.clearInterval(poll);
      if (observer !== null) observer.disconnect();
      document_.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document_.removeEventListener('keydown', onKeyDown, true);
      globalThis.removeEventListener('resize', onResize);
    },
  };
}

/** 构建期把本模块包成 IIFE 时暴露给模板的名字。 */
export const MODEL_PICKER_EXPORTS = ['HOST_ATTR', 'BTN_CLASS', 'POP_CLASS', 'currentSessionId', 'directoryFor', 'snapIndex', 'tickOffset', 'offsetRatio', 'installModelPicker'];
