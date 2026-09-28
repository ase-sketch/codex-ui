/**
 * 模型选择器的两面。
 *   host-menu  （A 面）⑫ 段对宿主原生菜单的皮肤：宿主真实样式（ui-theme 令牌 + model-selection + primitives
 *              MenuSurface / ShortcutKeys）+ 按渲染代码复刻的 DOM。before 页 = 皮肤去掉 ⑫ 段，只作原生对照。
 *   power-rail （B 面）自建组件 src/client/model-picker/ + model-picker.css：不需要宿主，
 *              配一个按宿主契约写的假 modelDirectories，select() 的往返故意放慢到 600ms
 *              （真宿主往返不到 60ms，pending 期间的行为来不及量）。指针与键盘都走 CDP 真输入事件。
 */
import { join } from 'node:path';
import { bundle, ROOT } from '../build.mjs';
import { cssFor, mapFor, themeLayers } from '../lib/host.mjs';

/* ── A 面：宿主菜单 ────────────────────────────────────────────────────── */

/** 菜单挂在 body 下（⑫ 段的作用域选择器是 body > div[role=menu]），右列三块菜单：根、模型、busy 中的推理强度。 */
function probeHostMenu() {
  const cs = (el, p) => getComputedStyle(el, p);
  const trig = document.querySelector('[data-slot="conversation.input.model"] button');
  const menu = document.querySelector('body > [role=menu]');
  const radio = document.querySelector('[role=menuitemradio]');
  const selected = document.querySelector('[role=menuitemradio][aria-checked=true]');
  const busyMenu = document.querySelector('body > [role=menu][aria-busy=true]');
  const busyRow = busyMenu.querySelector('[role=menuitemradio][aria-checked=true]');
  const busySpin = cs(busyRow.lastElementChild, '::after');
  const hostCheck = busyRow.lastElementChild.querySelector('svg');
  return {
    trigger: { height: cs(trig).height, size: cs(trig).fontSize, chevron: cs(trig.querySelector('svg:last-child')).display },
    menu: { radius: cs(menu).borderTopLeftRadius, pad: cs(menu).paddingTop, footer: cs(menu, '::after').content, fill: cs(menu.querySelector('[aria-hidden]')).backgroundColor },
    row: { minH: cs(radio).minHeight, radius: cs(radio).borderTopLeftRadius, prefix: cs(radio, '::before').content },
    selected: { bg: cs(selected).backgroundColor, checkShown: cs(selected.lastElementChild).display },
    pending: { after: busySpin.content, w: busySpin.width, anim: busySpin.animationName + ' ' + busySpin.animationDuration, hostCheck: hostCheck ? cs(hostCheck).visibility : 'none', cursor: cs(busyRow).cursor },
    pendingBusyRows: busyMenu.querySelectorAll('[role=menuitemradio]:disabled').length,
    disabledOpacity: cs(document.querySelector('[role=menuitemradio][disabled]')).opacity,
  };
}

async function hostMenu(t) {
  const modelSrc = t.host.file('@deepseek-ai/dsh-client-ui-model-selection/lib/client.js');
  const M = mapFor(modelSrc, 'ModelSelect_module_css_default');
  /* primitives 的样式是独立 .module.css 文件、类名不哈希：直接取原文（文件头有一个游离的 }）。 */
  const prim = (f) => t.host.file('@deepseek-ai/dsh-client-ui-primitives/lib/' + f).replace(/^\s*}\s*/, '');
  const hostCss = '<style>' + themeLayers(t.host) + '</style><style>' + cssFor(modelSrc, '@deepseek-ai/dsh-client-ui-model-selection/ModelSelect.module.css')
    + '</style><style>' + prim('MenuSurface.module.css') + '</style><style>' + prim('ShortcutKeys.module.css') + '</style>';

  const svg = (d, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor"/></svg>`;
  const surface = (children, pos, busy = false) => `<div role="menu" aria-busy="${busy}" data-menu-material="translucent" style="${pos}" class="surface ${M.menu}"><div aria-hidden="true" class="material"></div>${children}</div>`;
  const cell = (label, value) => `<button type="button" role="menuitem" class="${M.cell}"><span class="${M.cellLabel}">${label}</span><span class="${M.cellValue}">${value}</span>${svg('M6 4l4 4-4 4', 12)}</button>`;
  /* 行结构照真实 DOM：勾选列是空 span，选中行里放宿主的勾选 svg。宿主没有 pending 行 —— busy 窗口内是
     「整列 disabled + 勾选乐观前移到新值」，转圈由 ⑫ 段自己补。 */
  const option = (name, selected, disabled) => `<button type="button" role="menuitemradio" aria-checked="${selected}"${disabled ? ' disabled' : ''} class="${M.option}${selected ? ' ' + M.selected : ''}">`
    + `<span class="${M.optionCopy}"><span class="${M.modelName}">${name}</span></span><span class="${M.check}">${selected ? svg('M3 8l3 3 7-7', 14) : ''}</span></button>`;
  /* 真实 busy 快照（2026-09-26 headless 实测）：点「Medium」后第 60ms 起，aria-busy=true、四行全 disabled、
     aria-checked 已挪到 Medium，约 1.1s 后菜单关闭。 */
  const body = `<div class="seat"><div data-slot="conversation.input.model" style="display:contents"><div class="${M.root}">
<button type="button" class="${M.trigger}" aria-haspopup="menu" aria-expanded="true" title="DeepSeek V4.1 Flash · High"><span class="${M.triggerLabel}">DeepSeek V4.1 Flash</span><span class="${M.triggerEffort}">High</span>${svg('M4 6l4 4 4-4')}</button>
</div></div></div>
${surface(cell('模型', 'DeepSeek V4.1 Flash') + cell('推理强度', 'High'), 'position:fixed;left:40px;top:120px')}
${surface(`<div class="${M.groups}"><section role="group" class="${M.group}"><div class="${M.groupTitle}">DeepSeek</div>${option('DeepSeek V4.1 Flash', true, false)}${option('DeepSeek V4.1 Pro', false, false)}</section></div>`, 'position:fixed;left:340px;top:120px')}
${surface(option('Provider default', false, true) + option('High', false, true) + option('Medium', true, true) + option('Low', false, true), 'position:fixed;left:640px;top:120px', true)}`;
  const html = (theme, label) => `<!doctype html><html data-codex-ui data-platform="win32"><head><meta charset="utf-8"><title>${label}</title>${hostCss}<style id="codex-ui-theme">${theme}</style>
<style>body{margin:0;background:#eef4f9;font-family:"Segoe UI","Microsoft YaHei",sans-serif;height:760px}
h4{position:fixed;left:40px;top:16px;margin:0;font:600 12px/18px ui-monospace,Consolas,monospace;color:#8a8a8a}
.seat{position:fixed;left:40px;top:44px;background:#fff;border-radius:14px;padding:10px 12px;width:360px;display:flex;justify-content:flex-end}</style></head><body><h4>${label}</h4>${body}</body></html>`;

  const beforePage = await t.page({ width: 1000, height: 760, dpr: 2 });
  await beforePage.setContent(html(t.theme({ 'patches.css': [['⑫ 宿主模型菜单（A 面）', '⑬ 输入区顶栏：']] }), '原生 shipped（无 ⑫ 段）'), 700);
  const before = await beforePage.evaluate(probeHostMenu);
  await t.shot(beforePage, 'model-picker-before.png');
  const afterPage = await t.page({ width: 1000, height: 760, dpr: 2 });
  await afterPage.setContent(html(t.theme(), '+ codex-ui ⑫ 段'), 700);
  const got = await afterPage.evaluate(probeHostMenu);
  await t.shot(afterPage, 'model-picker-after.png');
  t.log('BEFORE ' + JSON.stringify(before));
  t.log('AFTER  ' + JSON.stringify(got));

  t.check('触发器高度 28（原生，不再压 24）', got.trigger.height === '28px', got.trigger.height);
  t.check('触发器字号 13', got.trigger.size === '13px', got.trigger.size);
  t.check('chevron 可见（不再隐藏）', got.trigger.chevron !== 'none', got.trigger.chevron);
  t.check('菜单圆角 18（浮层刻度 --dsw-radius-menu）', got.menu.radius === '18px', got.menu.radius);
  t.check('菜单内衬 5', got.menu.pad === '5px', got.menu.pad);
  t.check('无 TUI 页脚', got.menu.footer === 'none', got.menu.footer);
  t.check('菜单不透明白', got.menu.fill === 'rgb(255, 255, 255)', got.menu.fill);
  t.check('行高 28', got.row.minH === '28px', got.row.minH);
  t.check('行圆角 13（同心：菜单 18 − 内衬 5）', got.row.radius === '13px', got.row.radius);
  /* 同心闭环：宿主原生就是同心的（16 − 4 = 12），防的是皮肤把行圆角写死成跟面板不同源的刻度。 */
  t.check('原生对照：宿主菜单 16 / 行 12', before.menu.radius === '16px' && before.row.radius === '12px', before.menu.radius + ' / ' + before.row.radius);
  t.check('同心闭环：行圆角 = 菜单圆角 − 内衬', parseFloat(got.row.radius) === parseFloat(got.menu.radius) - parseFloat(got.menu.pad));
  t.check('无编号前缀', got.row.prefix === 'none', got.row.prefix);
  t.check('选中行淡填充', got.selected.bg.includes('13, 13, 13'), got.selected.bg);
  t.check('勾选列可见', got.selected.checkShown !== 'none', got.selected.checkShown);
  t.check('busy 窗口四行全 disabled', got.pendingBusyRows === 4, got.pendingBusyRows);
  t.check('pending 转圈已补位', got.pending.w === '12px' && got.pending.after === '""', got.pending.w + ' ' + got.pending.after);
  t.check('pending 宿主导航勾选让位', got.pending.hostCheck === 'hidden', got.pending.hostCheck);
  t.check('pending 动效在跑', got.pending.anim.startsWith('codex-ui-spin'), got.pending.anim);
  t.check('pending 光标 progress', got.pending.cursor === 'progress', got.pending.cursor);
  t.check('disabled 行不洗灰', got.disabledOpacity === '1', got.disabledOpacity);
}

/* ── B 面：功率轨 ──────────────────────────────────────────────────────── */

/** 在页面里装上假目录并挂组件。字段、状态机与返回值照 dsh-client-ui-model-selection 0.1.7-rc.2 的 ModelDirectory.select()。 */
function mountWithFakeDirectory(picker) {
  const EFFORTS = [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }];
  const GROUPS = [{ id: 'deepseek-official', name: 'DeepSeek', models: [
    { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', description: 'Fast, efficient, and economical; suited to focused, routine, or parallel tasks.', reasoning: { defaultEffort: 'high', efforts: EFFORTS } },
    { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', reasoning: { defaultEffort: 'max', efforts: EFFORTS } },
    { id: 'plain', name: 'Plain' },
  ] }];
  let state = { groups: GROUPS, current: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' }, status: 'ready', pending: null, error: null };
  const subs = new Set();
  const store = {
    getSnapshot: () => state,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    update: (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn()); },
  };
  const dir = {
    store, calls: [], delay: 600, fail: null,
    load: () => Promise.resolve(store.getSnapshot()),
    select(selection) {
      dir.calls.push(selection);
      store.update({ status: 'selecting', pending: selection, error: null });
      return new Promise((resolve) => setTimeout(() => {
        if (dir.fail !== null) {
          const error = dir.fail;
          dir.fail = null;
          store.update({ status: 'error', pending: null, error: error.code + ': ' + error.message });
          resolve({ ok: false, error });
          return;
        }
        store.update({ status: 'ready', pending: null, current: { ...selection } });
        resolve({ ok: true });
      }, dir.delay));
    },
  };
  window.__dir = dir;
  window.__picker = picker.mountModelPicker({
    models: { directoryFor: (id) => { if (id !== 'session-a') throw new Error('ui-model-selection: session "' + id + '" resolved no scope'); return dir; } },
    sessionFallback: () => null,
    locale: null,
  });
}

/** 一次取全弹层 / 轨的几何与状态。 */
function railState() {
  const q = (s) => document.querySelector(s);
  const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const pop = q('.codex-mp-popover');
  const root = q('.codex-mp-root');
  const trig = q('.codex-mp-trigger');
  const error = q('.codex-mp-error');
  return {
    open: pop !== null && !pop.hidden,
    pop: box(pop), trig: box(trig), root: box(root), track: box(q('.codex-mp-track')), range: box(q('.codex-mp-range')), thumb: box(q('.codex-mp-thumb-scale')),
    ticks: [...document.querySelectorAll('.codex-mp-tick')].map((el) => ({ ...box(el), sel: el.dataset.selected, color: getComputedStyle(el).backgroundColor })),
    rows: document.querySelectorAll('.codex-mp-row').length,
    checked: [...document.querySelectorAll('.codex-mp-row')].map((r) => r.getAttribute('aria-checked')),
    now: root ? root.getAttribute('aria-valuenow') : null,
    pos: root ? root.style.getPropertyValue('--codex-mp-pos') : null,
    value: q('.codex-mp-effort-value')?.textContent ?? null,
    spinner: q('.codex-mp-effort-value .codex-mp-spinner') !== null,
    trigEffort: trig ? [...trig.querySelectorAll('.codex-mp-effort-text')].filter((e) => e.dataset.active === 'true').map((e) => e.textContent).join() : null,
    trigModel: trig?.querySelector('.codex-mp-trigger-model').textContent ?? null,
    expanded: trig?.getAttribute('aria-expanded') ?? null,
    error: error && !error.hidden ? error.textContent : null,
    calls: window.__dir.calls.length, lastCall: window.__dir.calls.at(-1) ?? null, status: window.__dir.store.getSnapshot().status,
    focus: document.activeElement?.className ?? null,
    kbd: root?.dataset.keyboardFocused ?? null,
    thumbOutline: q('.codex-mp-thumb-scale') ? getComputedStyle(q('.codex-mp-thumb-scale')).outline : null,
  };
}

/** 某个元素的一组计算样式。 */
function computed(selector, props) {
  const cs = getComputedStyle(document.querySelector(selector));
  return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
}

async function powerRail(t) {
  const picker = bundle(join(ROOT, 'src', 'client', 'model-picker', 'component.js'));
  const page = await t.page({ width: 900, height: 640, dpr: 2 });
  /* DPR 2：0.5px 的 border 在 DPR 1 下会被抬成 1 个设备像素，量不出发丝线。 */
  await page.media({ 'prefers-reduced-motion': 'no-preference' });
  await page.setContent(`<!doctype html><html data-codex-ui lang="zh-CN"><head><meta charset="utf-8"><style>${t.theme()}</style>
<style>body{margin:0;height:100vh;font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;background:var(--dsw-alias-bg-base)}
.stage{position:fixed;left:40px;right:40px;bottom:30px}[data-composer-card]{display:flex;flex-direction:column}
.bar{display:flex;justify-content:flex-end;align-items:center;gap:4px}._7KE1Ra_root{display:flex}._7KE1Ra_trigger{height:28px;border:0;background:none}</style></head><body>
<div data-conversation-session="session-a"><div data-conversation-scroll class="stage"><div data-composer-card>
<div data-input-scroll style="height:44px"></div>
<div class="bar"><div><div data-slot="conversation.input.model" style="display:contents"><div class="_7KE1Ra_root"><button type="button" class="_7KE1Ra_trigger">Host seat</button></div></div></div></div>
</div></div></div>
<div data-conversation-session="session-sub"><div data-slot="conversation.input.model" style="display:contents" id="sub-seat"></div></div>
<script>(${mountWithFakeDirectory})((() => {\n${picker.code}\nreturn ${picker.entryVar};\n})());</script>
</body></html>`, 900);
  /* 子代理会话（session-sub）：宿主在那里返回 null（席位是空的），组件不许出头。 */

  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const state = () => page.evaluate(railState);
  const style = (sel, ...props) => page.evaluate(computed, sel, props);

  /* 1. 席位顶替 */
  const seat = await page.evaluate(() => {
    const slot = document.querySelector('[data-conversation-session="session-a"] [data-slot="conversation.input.model"]');
    const ours = slot.querySelector('.codex-mp-trigger');
    const cs = ours ? getComputedStyle(ours) : null;
    return { host: getComputedStyle(slot.querySelector('._7KE1Ra_root')).display, ours: ours !== null, h: ours ? ours.getBoundingClientRect().height : 0,
      radius: cs?.borderTopLeftRadius ?? null, bg: cs?.backgroundColor ?? null, sub: document.getElementById('sub-seat').children.length, text: ours?.textContent ?? '' };
  });
  t.check('席位里有自建触发器', seat.ours, seat.text);
  t.check('宿主那一格 display:none（仍在 DOM 里）', seat.host === 'none', seat.host);
  t.check('宿主没渲染的席位（子代理会话）不接管', seat.sub === 0, seat.sub + ' 个子节点');
  t.check('触发器 28px 高、全圆角胶囊、默认透明', near(seat.h, 28) && seat.radius === '999px' && seat.bg === 'rgba(0, 0, 0, 0)', JSON.stringify(seat));

  /* 2. 弹层与轨几何 */
  const [tx, ty] = await page.center('.codex-mp-trigger');
  await page.click(tx, ty);
  await t.sleep(80);
  const anim = await style('.codex-mp-popover', 'animation-name', 'animation-duration', 'animation-delay', 'animation-timing-function');
  await t.sleep(500);
  let st = await state();
  const pop = await style('.codex-mp-popover', 'border-top-left-radius', 'padding-top', 'box-shadow');
  t.check('点触发器打开弹层（aria-expanded=true）', st.open && st.expanded === 'true', JSON.stringify({ open: st.open, expanded: st.expanded }));
  t.check('弹层宽 254px（Codex spacing × 63.5）', near(st.pop.w, 254), st.pop.w);
  t.check('弹层在触发器上方 8px、右沿对齐（宿主 place()）', near(st.trig.y - st.pop.b, 8, 1) && near(st.trig.r, st.pop.r, 1), 'gap=' + (st.trig.y - st.pop.b) + ' right=' + (st.trig.r - st.pop.r));
  t.check('弹层 18px 圆角 + 内衬 5px + 菜单软影', pop['border-top-left-radius'] === '18px' && pop['padding-top'] === '5px' && /0px 8px 32px/.test(pop['box-shadow']), JSON.stringify(pop));
  t.check('入场 .32s cubic-bezier(.23,1,.32,1) 30ms，从右下角长出', anim['animation-name'] === 'codex-mp-enter' && anim['animation-duration'] === '0.32s' && anim['animation-delay'] === '0.03s' && /0\.23, 1, 0\.32, 1/.test(anim['animation-timing-function']), JSON.stringify(anim));
  t.check('列表三行、当前模型打勾', st.rows === 3 && st.checked[0] === 'true', JSON.stringify(st.checked));
  /* 宿主字典缺席（本夹具 locale 为 null）时，内置模型的说明要落回目录原文，不能把字典键名画出来。 */
  const desc = await page.evaluate(() => document.querySelector('.codex-mp-row-desc')?.textContent ?? null);
  t.check('说明文字是目录原文、不是字典键名', typeof desc === 'string' && desc.startsWith('Fast, efficient') && !desc.startsWith('option.'), desc);
  const track = await style('.codex-mp-track', 'border-top-left-radius', 'background-color', 'box-shadow');
  const thumb = await style('.codex-mp-thumb', 'background-color', 'box-shadow', 'border-top-width', 'border-top-style');
  const container = await style('.codex-mp-container', 'height', 'padding-top', 'padding-left');
  const range = await style('.codex-mp-range', 'border-top-left-radius', 'border-top-right-radius');
  const touch = (await style('.codex-mp-root', 'touch-action'))['touch-action'];
  t.check('轨 24px 高、12px 圆角', near(st.track.h, 24) && track['border-top-left-radius'] === '12px', st.track.h + ' / ' + track['border-top-left-radius']);
  t.check('轨底 = 前景 10%、0.5px 内描边', /0\.1\)$/.test(track['background-color']) && /inset/.test(track['box-shadow']) && /0\.5px/.test(track['box-shadow']), track['background-color'] + ' | ' + track['box-shadow']);
  t.check('容器 32px、上下 2 / 左右 6；根 28px、touch-action none', container.height === '32px' && container['padding-top'] + ' ' + container['padding-left'] === '2px 6px' && near(st.root.h, 28) && touch === 'none', JSON.stringify({ ...container, touch }));
  /* 描边断言声明值：Chromium 把 0.5px 的 border 在计算值里取整成 1px（DPR 2 也一样），Codex 源码同样写 .5px、
     跑在同一个引擎上，渲染结果一致；计算值量不出「写的是不是 0.5」。 */
  const thumbDecl = await page.evaluate(() => {
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (/ \.codex-mp-thumb$/.test(rule.selectorText ?? '')) return rule.style.getPropertyValue('border');
    return null;
  });
  t.check('拇指 28px 白圆片、声明 0.5px 描边、0 0 2px 微影', near(st.thumb.w, 28) && thumb['background-color'] === 'rgb(255, 255, 255)' && /^0\.5px solid/.test(thumbDecl ?? '') && /0px 0px 2px/.test(thumb['box-shadow']), JSON.stringify({ w: st.thumb.w, decl: thumbDecl, ...thumb }));
  t.check('档位圆点 4px × 4 个', st.ticks.length === 4 && st.ticks.every((k) => near(k.w, 4) && near(k.h, 4)), st.ticks.length);
  const expectX = (i) => st.root.x + 14 + (st.root.w - 28) * i / 3;
  t.check('圆点等距落在拇指行程 [14, 宽 − 14] 上', st.ticks.every((k, i) => near(k.x + k.w / 2, expectX(i))), st.ticks.map((k) => Math.round((k.x + k.w / 2 - st.root.x) * 10) / 10).join(' / '));
  t.check('拇指中心 = 生效档（High = 第 3 档）', near(st.thumb.x + 14, expectX(2)) && st.now === '2', 'thumb=' + (st.thumb.x + 14 - st.root.x) + ' now=' + st.now);
  t.check('强调色条止于拇指中线、只圆左侧两角', near(st.range.r, st.thumb.x + 14) && range['border-top-left-radius'] + ' ' + range['border-top-right-radius'] === '12px 0px', 'range.r=' + st.range.r + ' thumb=' + (st.thumb.x + 14));
  t.check('走过的圆点 30% 白、没走到的另一色', st.ticks[0].sel === 'true' && st.ticks[3].sel === 'false' && st.ticks[0].color === 'rgba(255, 255, 255, 0.3)' && st.ticks[3].color !== st.ticks[0].color, st.ticks.map((k) => k.sel + ':' + k.color).join(' | '));
  await t.shot(page, 'power-rail-verify.png', { x: st.pop.x - 20, y: st.pop.y - 20, width: st.pop.w + 40, height: st.trig.b - st.pop.y + 40, scale: 1 });

  /* 3. 拖动：中途不提交、松手对齐提交一次；pending 不回弹、不清空、有转圈 */
  const thumbX = Math.round(st.thumb.x + 14);
  const railY = Math.round(st.root.y + st.root.h / 2);
  const outside = Math.round(st.root.x - 20);
  await page.move(thumbX, railY);
  await page.mouse('mousePressed', thumbX, railY, 1);
  for (const x of [thumbX - 30, thumbX - 80, outside]) { await page.move(x, railY, 1); await t.sleep(30); }
  st = await state();
  t.check('拖动中不提交（select 调用 0 次）', st.calls === 0, 'calls=' + st.calls);
  t.check('拖动中拇指跟随指针（越界夹到 0）', st.pos === '0', 'pos=' + st.pos);
  await page.mouse('mouseReleased', outside, railY, 0);
  await t.sleep(120);
  st = await state();
  t.check('松手提交一次、对齐到最左档 off', st.calls === 1 && st.lastCall?.reasoningEffort === 'off', JSON.stringify(st.lastCall));
  t.check('往返中（selecting）轨停在新档、不回弹', st.status === 'selecting' && st.now === '0' && st.pos === '0', 'status=' + st.status + ' now=' + st.now);
  t.check('往返中列表不清空', st.rows === 3, 'rows=' + st.rows);
  t.check('往返中档位名旁转圈、触发器已按新档显示', st.spinner && st.trigEffort === 'Off', 'spinner=' + st.spinner + ' trig=' + st.trigEffort);
  await t.sleep(800);
  st = await state();
  t.check('往返结束：转圈撤掉、弹层仍开着（改档不关）', !st.spinner && st.open && st.now === '0' && st.value === 'Off', JSON.stringify({ spinner: st.spinner, open: st.open, value: st.value }));

  /* 4. 键盘 */
  await page.evaluate(() => document.querySelector('.codex-mp-root').focus());
  await page.key('ArrowRight', 39);
  await t.sleep(700);
  st = await state();
  t.check('→ 进一档（low）', st.lastCall.reasoningEffort === 'low' && st.now === '1', JSON.stringify(st.lastCall));
  t.check('键盘焦点：拇指上 2px 焦点环（offset 0）', st.kbd === 'true' && /2px/.test(st.thumbOutline) && /solid/.test(st.thumbOutline), st.thumbOutline);
  await page.key('End', 35);
  await t.sleep(700);
  st = await state();
  t.check('End 到最后一档（max）', st.lastCall.reasoningEffort === 'max' && st.now === '3', JSON.stringify(st.lastCall));
  const calls = st.calls;
  await page.key('End', 35);
  await t.sleep(200);
  st = await state();
  t.check('同一档不重复提交', st.calls === calls, 'calls ' + calls + ' → ' + st.calls);
  await page.key('Home', 36);
  await t.sleep(700);
  st = await state();
  t.check('Home 回第一档（off）', st.lastCall.reasoningEffort === 'off' && st.now === '0', JSON.stringify(st.lastCall));

  /* 5. 失败：宿主把会话占用报回来 */
  await page.evaluate(() => { window.__dir.fail = { code: 'session/writer-held', message: 'held' }; });
  await page.key('ArrowRight', 39);
  await t.sleep(800);
  st = await state();
  t.check('提交失败：弹层顶上出现占用提示', st.error !== null && /(已被占用|already in use)/.test(st.error), st.error);
  t.check('提交失败：轨退回生效档', st.now === '0', 'now=' + st.now);

  /* 6. Escape / 换模型 */
  await page.key('Escape', 27);
  await t.sleep(150);
  st = await state();
  t.check('Escape 关闭并把焦点还给触发器', !st.open && st.expanded === 'false' && st.focus === 'codex-mp-trigger', JSON.stringify({ open: st.open, focus: st.focus }));
  await page.click(tx, ty);
  await t.sleep(500);
  const [rx, ry] = await page.evaluate(() => {
    const r = document.querySelectorAll('.codex-mp-row')[1].getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  });
  await page.click(rx, ry);
  await t.sleep(120);
  const rowBusy = await page.evaluate(() => {
    const r = document.querySelectorAll('.codex-mp-row')[1];
    return { busy: r.getAttribute('aria-busy'), spin: r.querySelector('.codex-mp-spinner') !== null };
  });
  t.check('换模型往返中：那一行行尾转圈', rowBusy.busy === 'true' && rowBusy.spin, JSON.stringify(rowBusy));
  await t.sleep(800);
  st = await state();
  t.check('换模型连带该模型的默认档提交（pro → max）', st.lastCall.model === 'deepseek-v4-pro' && st.lastCall.reasoningEffort === 'max', JSON.stringify(st.lastCall));
  t.check('换模型成功后关弹层、触发器换名', !st.open && st.trigModel === 'DeepSeek-V4-Pro' && st.trigEffort === 'Max', st.trigModel + ' · ' + st.trigEffort);

  /* 7. reduced-motion */
  await page.media({ 'prefers-reduced-motion': 'reduce' });
  await page.click(tx, ty);
  await t.sleep(300);
  const rm = await page.evaluate(() => {
    const p = document.querySelector('.codex-mp-popover');
    return { attr: p.dataset.reducedMotion, anim: getComputedStyle(p).animationName, thumb: getComputedStyle(document.querySelector('.codex-mp-thumb-scale')).transitionDuration };
  });
  t.check('reduced-motion：入场动画取消、拇指不过渡', rm.attr === 'true' && rm.anim === 'none' && /^0s|^1e-05s|0\.00001s/.test(rm.thumb), JSON.stringify(rm));
  /* 鼠标打开后焦点在触发器上：Escape 也得关（宿主的键盘处理挂在整格根上）。 */
  const focusBefore = await page.evaluate(() => document.activeElement?.className ?? null);
  await page.key('Escape', 27);
  await t.sleep(150);
  st = await state();
  t.check('鼠标打开后（焦点在触发器）Escape 也能关', focusBefore === 'codex-mp-trigger' && !st.open, 'focus=' + focusBefore + ' open=' + st.open);
  await page.media({ 'prefers-reduced-motion': 'no-preference' });

  /* 8. 深色 */
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await page.click(tx, ty);
  await t.sleep(500);
  const dark = await page.evaluate(() => {
    const p = getComputedStyle(document.querySelector('.codex-mp-popover'));
    const th = getComputedStyle(document.querySelector('.codex-mp-thumb'));
    return { shadow: p.boxShadow, bg: p.backgroundColor, thumb: th.backgroundColor, border: th.borderTopColor, track: getComputedStyle(document.querySelector('.codex-mp-track')).boxShadow };
  });
  st = await state();
  t.check('深色下弹层打开', st.open && near(st.pop.w, 254), 'open=' + st.open);
  t.check('深色：菜单影 50% 黑 + 5% 亮环（暗色靠填充分层）', /rgba\(0, 0, 0, 0\.5\) 0px 8px 32px/.test(dark.shadow) && dark.bg === 'rgb(33, 33, 33)', JSON.stringify(dark));
  t.check('深色：拇指仍是白片、描边 20% 白、轨环 12% 白', dark.thumb === 'rgb(255, 255, 255)' && dark.border === 'rgba(255, 255, 255, 0.2)' && /rgba\(255, 255, 255, 0\.12\)/.test(dark.track), JSON.stringify(dark));
  await t.shot(page, 'power-rail-verify-dark.png', { x: st.pop.x - 20, y: st.pop.y - 20, width: st.pop.w + 40, height: st.trig.b - st.pop.y + 40, scale: 1 });
  await page.key('Escape', 27);
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));

  /* 9. 开关 */
  const seatNow = () => page.evaluate(() => ({ ours: document.querySelectorAll('.codex-mp-trigger').length, host: getComputedStyle(document.querySelector('._7KE1Ra_root')).display }));
  await page.evaluate(() => window.__picker.setEnabled(false));
  await t.sleep(100);
  const off = await seatNow();
  t.check('关掉：自建触发器撤走、宿主那一格复原', off.ours === 0 && off.host !== 'none', JSON.stringify(off));
  await page.evaluate(() => window.__picker.setEnabled(true));
  await t.sleep(100);
  const on = await seatNow();
  t.check('再打开：重新接管', on.ours === 1 && on.host === 'none', JSON.stringify(on));
  /* React 换掉宿主子节点：标记打在席位出口上，不在宿主子节点上，换掉子节点不会丢。 */
  await page.evaluate(() => {
    const slot = document.querySelector('[data-conversation-session="session-a"] [data-slot="conversation.input.model"]');
    const fresh = document.createElement('div');
    fresh.className = '_7KE1Ra_root';
    fresh.innerHTML = '<button class="_7KE1Ra_trigger">Host seat 2</button>';
    slot.querySelector('._7KE1Ra_root').replaceWith(fresh);
  });
  await t.sleep(50);
  const swapped = await seatNow();
  t.check('宿主换掉自己的子节点后仍隐藏、不闪回', swapped.host === 'none' && swapped.ours === 1, JSON.stringify(swapped));
  t.check('页面没有未捕获异常', page.errors.length === 0, page.errors.join(' | ') || '0');
}

export default { 'host-menu': hostMenu, 'power-rail': powerRail };
