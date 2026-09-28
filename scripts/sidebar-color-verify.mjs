#!/usr/bin/env node
/**
 * sidebar-color-verify.mjs — 侧栏底色的像素验收（侧栏 <-> 主区那一档），亮暗两套都量。
 *
 * 判据不是本皮肤自己定的，来自 Codex 应用的样式表 + 同屏实测：
 *
 *   Codex **没有**「侧栏色」令牌。侧栏（左侧板 + 标题栏条 + frame 底）= --color-surface-tertiary
 *   以 70% 不透明度叠在窗口底上（app-shared-*.css，electron 窗口、左侧板外观非 content-surface）：
 *     .app-shell-left-panel:not([data-app-shell-left-panel-appearance=content-surface])
 *       { background: color-mix(in srgb, var(--color-surface-tertiary) 70%, transparent) }
 *   那 30% 透明意味着渲染值随窗口背后的底而变 —— 所以只认同屏实测值，不认推导值。
 *
 *   同屏实测（避开文字取样）：
 *     亮色  侧栏 246,246,246 · 选中行 233,234,234 · 主区 255,255,255
 *     暗色  侧栏  15, 15, 15 · 选中行  31, 31, 31 · 主区  17, 17, 17
 *   两套里侧栏都**比主区低一档**（亮 255→246、暗 17→15），方向一致。
 *
 * 夹具在同一页上并排渲染「新值 / 旧值」两组，同一台无头 Chromium、同一 DPR、同一采样点，
 * 亮暗各截一次（只切 body[data-ds-dark-theme]，不重排版）。旧值那组是反例对照：
 * 它必须复现出旧读数，否则说明夹具分辨不出差别，正面断言就没有意义。
 *
 * 用法：node scripts/sidebar-color-verify.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const FIX = join(WB, 'scripts', 'fixtures');
const EVID = join(WB, 'assets', 'screenshots');
const THEME = fs.readFileSync(join(WB, 'theme.css'), 'utf8');

/* Codex 同屏实测（判据；改这里等于改判据，必须同时改 CHANGELOG 与 README 的表）。 */
const CODEX = {
  light: { sidebar: 246, active: 233, content: 255 },
  dark: { sidebar: 15, active: 31, content: 17 },
};
/* 旧值：亮色 #eef4f9 是某次蓝底截图取样，暗色 #181818 是把侧栏当成「表面」那一层。
   两组都留作反例。 */
const OLD = {
  light: { sidebar: '#eef4f9', active: '#e2e9ed' },
  dark: { sidebar: '#181818', active: '#282828' },
};

const BOX = 200;
const AT = { sidebar: [20, 20], content: [240, 20], active: [460, 20] };
const OLD_AT = { sidebar: [20, 240], content: [240, 240], active: [460, 240] };
const PAGE = { w: 680, h: 460 };

const block = (id, x, y, decl) => '<div id="' + id + '" style="position:absolute;left:' + x + 'px;top:' + y + 'px;'
  + 'width:' + BOX + 'px;height:' + BOX + 'px;' + decl + '"></div>';

const page = '<!doctype html><html data-codex-ui data-platform="win32"><head><meta charset="utf-8">'
  + '<title>sidebar-color</title><style>' + THEME + '</style>'
  + '<style>html,body{margin:0}'
  + '.old{--dsw-alias-bg-sidebar:' + OLD.light.sidebar + ';'
  +   '--dsw-specific-sidebar-nav-item-active:' + OLD.light.active + '}'
  + 'body[data-ds-dark-theme] .old{--dsw-alias-bg-sidebar:' + OLD.dark.sidebar + ';'
  +   '--dsw-specific-sidebar-nav-item-active:' + OLD.dark.active + '}'
  + '</style></head><body>'
  + block('new-sidebar', AT.sidebar[0], AT.sidebar[1], '')
  + block('new-content', AT.content[0], AT.content[1], 'background:var(--dsw-alias-bg-base)')
  + block('new-active', AT.active[0], AT.active[1], 'background:var(--dsw-specific-sidebar-nav-item-active)')
  + '<div class="old">'
  + block('old-sidebar', OLD_AT.sidebar[0], OLD_AT.sidebar[1], '')
  + block('old-content', OLD_AT.content[0], OLD_AT.content[1], 'background:var(--dsw-alias-bg-base)')
  + block('old-active', OLD_AT.active[0], OLD_AT.active[1], 'background:var(--dsw-specific-sidebar-nav-item-active)')
  + '</div>'
  + '<script>'
  + 'document.getElementById("new-sidebar").setAttribute("data-dsh-surface","sidebar");'
  + 'document.getElementById("old-sidebar").setAttribute("data-dsh-surface","sidebar");'
  + '<\/script></body></html>';

/* ── PNG 解码（Chromium 出的是 8 位非隔行 PNG；zlib + 标准反滤波）────────── */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced png unsupported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (ch === 0) throw new Error('unsupported color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[p]; p += 1;
    const line = raw.subarray(p, p + stride); p += stride;
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev === null ? 0 : prev[x];
      const c = prev === null || x < ch ? 0 : prev[x - ch];
      const v = line[x];
      let r;
      if (filter === 0) r = v;
      else if (filter === 1) r = v + a;
      else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('filter ' + filter);
      cur[x] = r & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

/* ── 无头 Chromium + CDP ────────────────────────────────────────────────── */
fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const htmlPath = join(FIX, 'sidebar-color-verify.html');
fs.writeFileSync(htmlPath, page);

const PORT = 9354;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = tempDir('dsh-cdp-sidebar-color');
fs.rmSync(PROFILE, { recursive: true, force: true });
const child = spawn(chromePath(), ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE, '--no-first-run', '--disable-gpu',
  '--window-size=' + PAGE.w + ',' + PAGE.h, 'about:blank'], { stdio: 'ignore' });
let info;
for (let i = 0; i < 60 && info === undefined; i += 1) {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) info = await r.json(); } catch { /* not up yet */ }
  if (info === undefined) await sleep(250);
}
if (info === undefined) { child.kill(); throw new Error('headless chrome did not start'); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sid) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride',
  { width: PAGE.w, height: PAGE.h, deviceScaleFactor: 2, mobile: false }, sessionId);
await send('Page.navigate', { url: 'file:///' + htmlPath.replaceAll('\\', '/') + '?v=' + Date.now() }, sessionId);
await sleep(900);

const settle = () => send('Runtime.evaluate', {
  expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))',
  returnByValue: true, awaitPromise: true,
}, sessionId);

/** 截一次当前配色，返回像素读取器。采样倍率从图上反算，不写死。 */
async function capture(tag) {
  const shot = await send('Page.captureScreenshot',
    { format: 'png', clip: { x: 0, y: 0, width: PAGE.w, height: PAGE.h, scale: 2 } }, sessionId);
  const buf = Buffer.from(shot.data, 'base64');
  const img = decodePng(buf);
  fs.writeFileSync(join(EVID, 'sidebar-color-verify-' + tag + '.png'), buf);
  const scale = img.w / PAGE.w;
  if (Math.abs(scale - Math.round(scale)) > 1e-9) throw new Error('unexpected screenshot geometry: ' + img.w + 'x' + img.h);
  const at = (pt) => {
    const x = Math.round((pt[0] + BOX / 2) * scale);
    const y = Math.round((pt[1] + BOX / 2) * scale);
    const o = (y * img.w + x) * img.ch;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
  };
  return {
    sidebar: at(AT.sidebar), content: at(AT.content), active: at(AT.active),
    oldSidebar: at(OLD_AT.sidebar), oldActive: at(OLD_AT.active),
  };
}

await settle();
const light = await capture('light');
await send('Runtime.evaluate', {
  expression: 'document.body.setAttribute("data-ds-dark-theme","")', returnByValue: true,
}, sessionId);
await settle();
const dark = await capture('dark');
child.kill();

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const neutral = (c) => c[0] === c[1] && c[1] === c[2];

let fail = 0;
const check = (label, ok, detail) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '   [' + detail + ']');
  if (!ok) fail += 1;
};
const suite = (theme, m) => {
  const C = CODEX[theme];
  const name = theme === 'light' ? '亮色' : '暗色';
  check(name + ' 侧栏底 = ' + C.sidebar + '（Codex 实测同值，±1）',
    near(m.sidebar[0], C.sidebar, 1) && neutral(m.sidebar), hex(m.sidebar));
  check(name + ' 侧栏底是中性灰（R=G=B）', neutral(m.sidebar), hex(m.sidebar));
  check(name + ' 主区底 = ' + C.content,
    m.content[0] === C.content && neutral(m.content), hex(m.content));
  check(name + ' 侧栏 -> 主区 档差 = ' + Math.abs(C.content - C.sidebar),
    Math.abs(m.content[0] - m.sidebar[0]) === Math.abs(C.content - C.sidebar),
    m.sidebar[0] + ' / ' + m.content[0]);
  check(name + ' 层级方向成立：侧栏比主区低一档（侧栏是被压过的衬底）',
    m.content[0] > m.sidebar[0], 'sidebar ' + m.sidebar[0] + ' < content ' + m.content[0]);
  check(name + ' 选中行 = ' + C.active + '（Codex 实测同值，±1）',
    near(m.active[0], C.active, 1) && neutral(m.active), hex(m.active));
  check(name + ' 反例对照：旧值仍是旧读数', hex(m.oldSidebar) === OLD[theme].sidebar,
    hex(m.oldSidebar) + '（期望 ' + OLD[theme].sidebar + '）');
  check(name + ' 反例对照：旧选中行仍是旧读数', hex(m.oldActive) === OLD[theme].active,
    hex(m.oldActive) + '（期望 ' + OLD[theme].active + '）');
};

console.log('样式来源        : theme.css（构建产物，' + THEME.length + ' B）');
console.log('判据来源        : Codex 同屏实测 —— 亮 246/233/255 · 暗 15/31/17');
console.log('采样            : DPR 2，每块中心 1 像素；页面 ' + PAGE.w + 'x' + PAGE.h + '；亮暗各截一次');
console.log('');
suite('light', light);
console.log('');
suite('dark', dark);

const row = (label, theme) => {
  const m = theme === 'light' ? light : dark;
  return '  ' + label.padEnd(12) + hex(m.sidebar).padEnd(11) + hex(m.active).padEnd(11) + hex(m.content).padEnd(11)
    + '| ' + hex(m.oldSidebar).padEnd(11) + hex(m.oldActive).padEnd(11) + '| '
    + '#' + [CODEX[theme].sidebar, CODEX[theme].sidebar, CODEX[theme].sidebar].map((v) => v.toString(16).padStart(2, '0')).join('')
    + '  ' + CODEX[theme].active + '  ' + CODEX[theme].content;
};
console.log('');
console.log('读数表（DPR 2，同一页、同一采样点）');
console.log('  主题        侧栏底      选中行      主区底     | 旧侧栏底    旧选中行   | Codex 侧栏 / 选中行 / 主区');
console.log(row('亮色', 'light'));
console.log(row('暗色', 'dark'));
console.log('');
console.log(fail === 0 ? 'ALL PASS (' + 16 + '/' + 16 + ')' : 'FAILED ' + fail + '/16');
console.log('WROTE ' + join(EVID, 'sidebar-color-verify-light.png'));
console.log('WROTE ' + join(EVID, 'sidebar-color-verify-dark.png'));
process.exit(fail === 0 ? 0 : 1);
