#!/usr/bin/env node
/**
 * live/parity.mjs — 重构前后的「零视觉差」对账：把真 GUI 走过一串固定状态，逐元素存下全部计算样式，再逐项比。
 *
 *   node scripts/live/parity.mjs snap --url "http://127.0.0.1:3099/?token=…" --out <目录> [--only 状态,…]
 *   node scripts/live/parity.mjs diff <基线目录> <新目录> [--ignore 属性,…] [--detail 12]
 *
 * 用法：旧版本 snap 一份、改完再 snap 一份（同一个 profile、同一个窗口尺寸），diff 为 0 即外观没变，退出码 0。
 * 状态：首页（右栏开着）亮 / 悬停触发器 / 弹层开 / 深色 / 深色弹层、右栏收起亮暗、reduced-motion、宿主设置页亮暗、
 * 组合包卡亮暗、关掉 Codex 模型选择器后的宿主菜单与推理档位子菜单；最后把设置卡全部「重置」（开关回到默认开）。
 * 深色用直接打 body[data-ds-dark-theme] 的方式切（不写宿主偏好），标题栏属性补打成 Windows 桌面壳形态。
 */
import fs from 'node:fs';
import { join } from 'node:path';
import { clickByText, dismissOnboarding, findByText, launch, login, openHome, sleep } from '../lib/cdp.mjs';

const [command, ...rest] = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = rest.indexOf('--' + name);
  return i >= 0 && rest[i + 1] !== undefined ? rest[i + 1] : fallback;
};

/** 整棵 DOM 的计算样式：属性名列表存一次，每个元素只存值；外加 html / body 上所有自定义属性与 html 的属性。 */
function dumpStyles() {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let text = '';
    try { for (const r of sheet.cssRules) text += r.cssText; } catch { /* 跨域样式表读不到 */ }
    for (const m of text.matchAll(/--[\w-]+/g)) names.add(m[0]);
  }
  const custom = [...names].sort();
  const vars = (el) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(custom.map((n) => [n, cs.getPropertyValue(n).trim()]).filter(([, v]) => v !== ''));
  };
  let props = null;
  const row = (cs) => {
    props ??= Array.from({ length: cs.length }, (_, i) => cs[i]);
    return props.map((p) => cs.getPropertyValue(p));
  };
  const rows = [];
  const walk = (el, path) => {
    const rec = { k: path, c: typeof el.className === 'string' ? el.className.slice(0, 80) : '', v: row(getComputedStyle(el)) };
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content !== 'none' && ps.content !== 'normal') rec[pseudo] = row(ps);
    }
    rows.push(rec);
    const counts = {};
    for (const child of el.children) {
      if (['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
      const tag = child.tagName.toLowerCase();
      counts[tag] = (counts[tag] ?? 0) + 1;
      const slot = child.getAttribute('data-slot');
      walk(child, path + '>' + tag + (slot ? '[' + slot + ']' : '') + ':' + counts[tag]);
    }
  };
  walk(document.documentElement, 'html');
  return JSON.stringify({ props, rows, htmlVars: vars(document.documentElement), bodyVars: vars(document.body), htmlAttrs: [...document.documentElement.attributes].map((a) => a.name + '=' + a.value).sort() });
}

async function snap() {
  const url = arg('url', '');
  const out = arg('out', '');
  const only = arg('only', '').split(',').filter(Boolean);
  if (url === '' || out === '') {
    console.error('用法：parity.mjs snap --url <token URL> --out <目录> [--only 状态,…]');
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  try {
    const page = await browser.newPage({ width: 1280, height: 800, dpr: 1 });
    const motion = (value) => page.media({ 'prefers-color-scheme': 'light', 'prefers-reduced-motion': value });
    await motion('no-preference');
    const origin = await login(page, url);
    const corner = () => page.move(5, 795);
    const save = async (name) => {
      if (only.length > 0 && !only.includes(name)) return;
      await sleep(900);
      const text = await page.evaluate(dumpStyles);
      fs.writeFileSync(join(out, name + '.json'), text);
      console.log('SNAP ' + name.padEnd(28) + JSON.parse(text).rows.length + ' 个元素');
    };
    const dark = (on) => page.evaluate((flag) => {
      document.body.toggleAttribute('data-ds-dark-theme', flag);
      document.documentElement.style.colorScheme = flag ? 'dark' : 'light';
    }, on);
    const home = async () => {
      await openHome(page, origin);
      await dismissOnboarding(page);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-windows-titlebar', '');
        document.documentElement.setAttribute('data-platform', 'win32');
        document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px');
      });
      await corner();
      await sleep(500);
    };
    const tap = async (pattern, selector) => (await clickByText(page, pattern, selector)) !== null;
    const openCard = async () => {
      await tap('^插件$');
      await sleep(2000);
      await tap('^查看 codex-ui$');
      await sleep(3000);
    };

    await home();
    if (await tap('^打开右侧边栏$')) await sleep(1200);
    await save('home-light');
    const trig = await page.center('[data-slot="conversation.input.model"] > .codex-mp-trigger') ?? await page.center('[data-slot="conversation.input.model"] button');
    if (trig === null) throw new Error('输入区的模型位没出现');
    await page.move(...trig);
    await sleep(400);
    await save('home-light-hover-trigger');
    await page.click(...trig);
    await sleep(700);
    await corner();
    await save('picker-open-light');
    await page.key('Escape', 27);
    await sleep(300);
    await corner();
    await dark(true);
    await sleep(500);
    await save('home-dark');
    await page.click(...trig);
    await sleep(700);
    await corner();
    await save('picker-open-dark');
    await page.key('Escape', 27);
    await sleep(300);
    await dark(false);
    await sleep(400);
    if (await tap('^收起右侧边栏$')) {
      await sleep(1200);
      await corner();
      await save('rightbar-collapsed-light');
      await dark(true);
      await save('rightbar-collapsed-dark');
      await dark(false);
      await tap('^打开右侧边栏$');
      await sleep(1200);
    }
    await motion('reduce');
    await save('home-light-reduced-motion');
    await motion('no-preference');
    if (await tap('^设置$')) {
      await sleep(2000);
      await corner();
      await save('settings-light');
      await dark(true);
      await save('settings-dark');
      await dark(false);
    }
    /* 组合包卡；然后关掉 Codex 模型选择器，量宿主原生菜单（A 面）。 */
    await home();
    await openCard();
    await corner();
    await save('bundle-card-light');
    await dark(true);
    await save('bundle-card-dark');
    await dark(false);
    await tap('^Codex 模型选择器$');
    await sleep(1500);
    await home();
    const hostTrig = await page.center('[data-slot="conversation.input.model"] button');
    if (hostTrig !== null) {
      await page.click(...hostTrig);
      await sleep(900);
      await corner();
      await save('host-menu-light');
      if (await tap('推理等级', 'body > div[role=menu] button')) {
        await sleep(700);
        await corner();
        await save('host-menu-effort-light');
      }
      await page.key('Escape', 27);
      await sleep(300);
      await page.key('Escape', 27);
    }
    /* 复位：设置卡上的「重置」全点一遍，开关回到默认开。 */
    await home();
    await openCard();
    for (let i = 0; i < 12; i += 1) {
      const box = await findByText(page, '^重置$', '.cx-row button');
      if (box === null) break;
      await page.click(box.x, box.y);
      await sleep(900);
    }
    console.log('复位后 Codex 模型选择器：' + await page.evaluate(() => document.querySelector('[aria-label="Codex 模型选择器"]')?.getAttribute('aria-checked')));
  } finally {
    await browser.close();
  }
}

function diff() {
  const [a, b] = rest.filter((x, i) => !x.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
  if (a === undefined || b === undefined) {
    console.error('用法：parity.mjs diff <基线目录> <新目录> [--ignore 属性,…] [--detail 12]');
    process.exit(2);
  }
  const ignore = new Set(arg('ignore', '').split(',').filter(Boolean));
  const detail = Number(arg('detail', '12'));
  let total = 0;
  for (const file of fs.readdirSync(a).filter((f) => f.endsWith('.json')).sort()) {
    if (!fs.existsSync(join(b, file))) {
      console.log('MISSING ' + file + '（新目录里没有这个状态）');
      total += 1;
      continue;
    }
    const A = JSON.parse(fs.readFileSync(join(a, file), 'utf8'));
    const B = JSON.parse(fs.readFileSync(join(b, file), 'utf8'));
    const diffs = [];
    const rowsA = new Map(A.rows.map((r) => [r.k, r]));
    const rowsB = new Map(B.rows.map((r) => [r.k, r]));
    const missing = [...rowsA.keys()].filter((k) => !rowsB.has(k));
    const extra = [...rowsB.keys()].filter((k) => !rowsA.has(k));
    const compare = (va, vb, key) => {
      if (!va && !vb) return;
      if (!va || !vb) { diffs.push({ key, prop: '(伪元素有无)', a: !!va, b: !!vb }); return; }
      const byName = new Map(B.props.map((p, i) => [p, vb[i]]));
      A.props.forEach((p, i) => { if (!ignore.has(p) && va[i] !== byName.get(p)) diffs.push({ key, prop: p, a: va[i], b: byName.get(p) }); });
    };
    for (const [k, ra] of rowsA) {
      const rb = rowsB.get(k);
      if (!rb) continue;
      if (ra.c !== rb.c) diffs.push({ key: k, prop: '(class)', a: ra.c, b: rb.c });
      compare(ra.v, rb.v, k);
      compare(ra['::before'], rb['::before'], k + '::before');
      compare(ra['::after'], rb['::after'], k + '::after');
    }
    for (const [tag, x, y] of [['html(vars)', A.htmlVars, B.htmlVars], ['body(vars)', A.bodyVars, B.bodyVars]]) {
      for (const n of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[n] !== y[n]) diffs.push({ key: tag, prop: n, a: x[n], b: y[n] });
    }
    if (A.htmlAttrs.join() !== B.htmlAttrs.join()) diffs.push({ key: 'html', prop: '(attrs)', a: A.htmlAttrs.join(' '), b: B.htmlAttrs.join(' ') });
    const n = diffs.length + missing.length + extra.length;
    total += n;
    console.log((n === 0 ? 'SAME ' : 'DIFF ') + file.padEnd(34) + ' 元素 ' + A.rows.length + '/' + B.rows.length + (n ? '  差异 ' + diffs.length + ' 缺 ' + missing.length + ' 多 ' + extra.length : ''));
    if (n === 0) continue;
    const byProp = new Map();
    for (const d of diffs) byProp.set(d.prop, (byProp.get(d.prop) ?? 0) + 1);
    console.log('   按属性：' + [...byProp].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([p, c]) => p + '×' + c).join(', '));
    for (const d of diffs.slice(0, detail)) console.log('   ' + d.key.slice(-90) + ' | ' + d.prop + ': ' + String(d.a).slice(0, 70) + ' → ' + String(d.b).slice(0, 70));
    for (const k of missing.slice(0, 5)) console.log('   缺 ' + k.slice(-100));
    for (const k of extra.slice(0, 5)) console.log('   多 ' + k.slice(-100));
  }
  console.log('\n差异合计 ' + total);
  process.exitCode = total === 0 ? 0 : 1;
}

if (command === 'snap') await snap();
else if (command === 'diff') diff();
else {
  console.error('用法：parity.mjs snap --url <token URL> --out <目录> | parity.mjs diff <基线目录> <新目录>');
  process.exit(2);
}
