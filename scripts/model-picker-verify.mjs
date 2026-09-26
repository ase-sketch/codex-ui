#!/usr/bin/env node
/**
 * model-picker-verify.mjs — ⑫ Codex 模型选择器的计算样式断言 + 出图。
 *
 * 为什么用夹具而不是截屏：launch token 只在宿主进程内存里，headless 打不开真实 GUI。
 * 这里用 app.asar 的真实 shipped CSS（ui-theme 令牌 + model-selection 组件 +
 * primitives MenuSurface/ShortcutKeys）+ 按渲染代码复刻的 DOM + 本插件 theme.css，
 * 用 getComputedStyle 读值 —— 不接受「看起来像」。
 *
 * 左列 = 原生 shipped（⑫ 段从皮肤里剥掉），右列 = 完整 codex-ui。
 * 断言只跑右列；左列供肉眼对照。
 *
 * 用法：node scripts/model-picker-verify.mjs [--no-shot]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asarPath, chromePath, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const EVID = join(WB, 'assets', 'screenshots');
/** 夹具 HTML 是中间产物，落系统临时目录，不堆进 assets/screenshots/。 */
const FIX = join(tmpdir(), 'codex-ui-fixtures');
const THEME = fs.readFileSync(join(WB, 'theme.css'), 'utf8');
const ASAR = asarPath();

/* ── asar 读取 ─────────────────────────────────────────────────────────── */
const fd = fs.openSync(ASAR, 'r');
const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(12);
const hb = Buffer.alloc(headerSize); fs.readSync(fd, hb, 0, headerSize, 16);
const root = JSON.parse(hb.toString('utf8'));
const dataBase = 16 + headerSize;
function asarNode(p) {
  let n = root;
  for (const seg of p.split('/').filter(Boolean)) { n = n.files?.[seg]; if (!n) return null; }
  return n;
}
function read(p) {
  const n = asarNode(p);
  if (!n || n.type === 'directory' || !Number.isFinite(Number(n.offset))) return null;
  const buf = Buffer.alloc(n.size);
  fs.readSync(fd, buf, 0, n.size, dataBase + Number(n.offset));
  return buf.toString('utf8');
}
function readStringLiteral(src, quoteIndex) {
  let out = '';
  for (let i = quoteIndex + 1; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') { out += src[i + 1]; i += 1; continue; }
    if (ch === '"') return out;
    out += ch;
  }
  throw new Error('unterminated string literal at ' + quoteIndex);
}
function cssFor(src, moduleFile) {
  const i = src.indexOf(moduleFile);
  if (i < 0) throw new Error('tagId not found: ' + moduleFile);
  const re = /(?:const|var)\s+[\w$]+\s*=\s*"/g;
  let last = null, hit;
  while ((hit = re.exec(src)) !== null && hit.index < i) {
    const text = readStringLiteral(src, hit.index + hit[0].length - 1);
    if (text.includes('{')) last = text;
  }
  if (last === null) throw new Error('css declaration not found for ' + moduleFile);
  return last;
}
function mapFor(src, varName) {
  const i = src.indexOf('var ' + varName + ' = {');
  if (i < 0) throw new Error('class map not found: ' + varName);
  const start = src.indexOf('{', i);
  let depth = 0, end = -1;
  for (let j = start; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) { end = j; break; } }
  }
  const out = {};
  for (const m of src.slice(start, end + 1).matchAll(/"([^"]+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

const themeSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js');
const modelSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js');
const primSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js');
if (!themeSrc || !modelSrc || !primSrc) throw new Error('shipped bundles not found');

const themeLayers = (() => {
  const re = /(?:const|var|let)\s+([\w$]+_css_default)\s*=\s*"/g;
  const parts = [];
  let m;
  while ((m = re.exec(themeSrc)) !== null) {
    const text = readStringLiteral(themeSrc, m.index + m[0].length - 1);
    if (text.includes('--dsw-')) parts.push(text);
  }
  if (parts.length === 0) throw new Error('no ui-theme token layers found');
  return parts.join('\n');
})();

const modelCss = cssFor(modelSrc, '@deepseek-ai/dsh-client-ui-model-selection/ModelSelect.module.css');
const M = mapFor(modelSrc, 'ModelSelect_module_css_default');
/* primitives 的 CSS 是独立 .module.css 文件、类名不哈希：直接取原文。 */
const PRIM_DIR = 'dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/';
const rawCss = (f) => read(PRIM_DIR + f).replace(/^\s*}\s*/, '');
const msCss = rawCss('MenuSurface.module.css');
const MS = { surface: 'surface', material: 'material' };
const skCss = rawCss('ShortcutKeys.module.css');

/* ── 复刻 DOM（与 model-selection client.js 渲染代码一致）────────────────── */
const svg = (d, size = 16) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="' + d + '" stroke="currentColor"/></svg>';
const CHEVRON_DOWN = 'M4 6l4 4 4-4';
const CHEVRON_RIGHT = 'M6 4l4 4-4 4';
const CHECK = 'M3 8l3 3 7-7';
const SPINNER = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity=".25" fill="none"/><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" fill="none" stroke-linecap="round"/></svg>';

function surface(children, pos, busy) {
  return '<div role="menu" aria-busy="' + (busy ? 'true' : 'false') + '" data-menu-material="translucent" style="' + pos + '" class="' + MS.surface + ' ' + M.menu + '">'
    + '<div aria-hidden="true" class="' + MS.material + '"></div>' + children + '</div>';
}
const cell = (label, value) =>
  '<button type="button" role="menuitem" class="' + M.cell + '">'
  + '<span class="' + M.cellLabel + '">' + label + '</span>'
  + '<span class="' + M.cellValue + '">' + value + '</span>'
  + svg(CHEVRON_RIGHT, 12) + '</button>';
/* 行结构照真实 DOM：勾选列是空的 span，选中行里放宿主的勾选 svg。
   宿主没有 pending 行，也没有 StateDot —— busy 窗口内是「整列 disabled +
   勾选乐观前移到新值」，转圈由 ⑫ 段自己补。 */
const option = (name, selected, disabled) =>
  '<button type="button" role="menuitemradio" aria-checked="' + (selected ? 'true' : 'false') + '"'
  + (disabled ? ' disabled' : '') + ' class="' + M.option + (selected ? ' ' + M.selected : '') + '">'
  + '<span class="' + M.optionCopy + '"><span class="' + M.modelName + '">' + name + '</span></span>'
  + '<span class="' + M.check + '">' + (selected ? svg(CHECK, 14) : '') + '</span></button>';

const menuRoot = surface(cell('模型', 'DeepSeek V4.1 Flash') + cell('推理强度', 'High'), 'position:fixed;left:40px;top:120px');
const menuModel = surface('<div class="' + M.groups + '"><section role="group" class="' + M.group + '">'
  + '<div class="' + M.groupTitle + '">DeepSeek</div>'
  + option('DeepSeek V4.1 Flash', true, false)
  + option('DeepSeek V4.1 Pro', false, false)
  + '</section></div>', 'position:fixed;left:340px;top:120px');
/* 真实 busy 快照（2026-09-26 headless 实测）：点「Medium」后第 60ms 起，
   aria-busy=true、四行全 disabled、aria-checked 已挪到 Medium，约 1.1s 后菜单关闭。 */
const menuEffort = surface(
  option('Provider default', false, true)
  + option('High', false, true)
  + option('Medium', true, true)
  + option('Low', false, true), 'position:fixed;left:640px;top:120px', true);

const trigger = '<div data-slot="conversation.input.model" style="display:contents"><div class="' + M.root + '">'
  + '<button type="button" class="' + M.trigger + '" aria-haspopup="menu" aria-expanded="true" title="DeepSeek V4.1 Flash · High">'
  + '<span class="' + M.triggerLabel + '">DeepSeek V4.1 Flash</span>'
  + '<span class="' + M.triggerEffort + '">High</span>'
  + svg(CHEVRON_DOWN) + '</button></div></div>';

/* 菜单必须直挂 body（⑫ 段作用域选择器是 body > div[role=menu]）。
   所以出两页：before = theme 去掉 ⑫ 段（原生对照），after = 完整 theme。 */
const i12 = THEME.indexOf('⑫ Codex 模型选择器');
const i13 = THEME.indexOf('⑬ Codex 式输入区');
if (i12 < 0 || i13 < 0) throw new Error('section markers missing in theme.css');
const cut12 = THEME.lastIndexOf('/*', i12);
const cut13 = THEME.lastIndexOf('/*', i13);
const themeNo12 = THEME.slice(0, cut12) + THEME.slice(cut13);

const page = (theme, label) => '<!doctype html><html data-codex-ui data-platform="win32">'
  + '<head><meta charset="utf-8"><title>' + label + '</title><style>' + themeLayers + '</style>'
  + '<style>' + modelCss + '</style><style>' + msCss + '</style><style>' + skCss + '</style>'
  + '<style id="codex-ui-theme">' + theme + '</style>'
  + '<style>body{margin:0;background:#eef4f9;font-family:"Segoe UI","Microsoft YaHei",sans-serif;height:760px}'
  + 'h4{position:fixed;left:40px;top:16px;margin:0;font:600 12px/18px ui-monospace,Consolas,monospace;color:#8a8a8a}'
  + '.seat{position:fixed;left:40px;top:44px;background:#fff;border-radius:14px;padding:10px 12px;width:360px;display:flex;justify-content:flex-end}</style></head><body>'
  + '<h4>' + label + '</h4>'
  + '<div class="seat">' + trigger + '</div>'
  + menuRoot + menuModel + menuEffort
  + '</body></html>';

fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const beforePath = join(FIX, 'model-picker-before.html');
const afterPath = join(FIX, 'model-picker-after.html');
fs.writeFileSync(beforePath, page(themeNo12, '原生 shipped（无 ⑫ 段）'));
fs.writeFileSync(afterPath, page(THEME, '+ codex-ui ⑫ 段'));

const PROBE = '(() => { try {'
  + 'const cs = (el, p) => el ? getComputedStyle(el, p) : null;'
  + 'const trig = document.querySelector(\'[data-slot="conversation.input.model"] button\');'
  + 'const chev = trig.querySelector("svg:last-child");'
  + 'const menu = document.querySelector("body > [role=menu]");'
  + 'const material = menu.querySelector("[aria-hidden]");'
  + 'const radio = document.querySelector("[role=menuitemradio]") || document.querySelector("[role=menuitemradio]");'
  + 'const selected = document.querySelector("[role=menuitemradio][aria-checked=true]");'
  + 'const checkCol = selected.lastElementChild;'
  + 'const busyMenu = document.querySelector("body > [role=menu][aria-busy=true]");'
  + 'const busyRow = busyMenu.querySelector("[role=menuitemradio][aria-checked=true]");'
  + 'const busyCheck = busyRow.lastElementChild;'
  + 'const busySpin = cs(busyCheck, "::after");'
  + 'const hostCheck = busyCheck.querySelector("svg");'
  + 'const cellEl = document.querySelector("[role=menuitem]");'
  + 'return JSON.stringify({'
  + 'trigger: { height: cs(trig).height, size: cs(trig).fontSize, chevron: cs(chev).display },'
  + 'menu: { radius: cs(menu).borderTopLeftRadius, pad: cs(menu).paddingTop, footer: cs(menu, "::after").content, fill: cs(material).backgroundColor },'
  + 'row: { minH: cs(radio).minHeight, radius: cs(radio).borderTopLeftRadius, prefix: cs(radio, "::before").content },'
  + 'selected: { bg: cs(selected).backgroundColor, checkShown: cs(checkCol).display },'
  + 'pending: { after: busySpin.content, w: busySpin.width, borderTop: busySpin.borderTopColor, anim: busySpin.animationName + " " + busySpin.animationDuration, hostCheck: hostCheck ? cs(hostCheck).visibility : "none", cursor: cs(busyRow).cursor },'
  + 'pendingBusyRows: busyMenu.querySelectorAll("[role=menuitemradio]:disabled").length,'
  + 'disabledOpacity: cs(document.querySelector("[role=menuitemradio][disabled]")).opacity,'
  + 'cell: { minH: cs(cellEl).minHeight }'
  + '}); } catch (e) { return JSON.stringify({ error: String(e) }); } })()';

const probePage = async (path, shotName) => {
  const { targetId } = await send('Target.createTarget', { url: 'file:///' + path.replaceAll('\\', '/') });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 760, deviceScaleFactor: 2, mobile: false }, sessionId);
  await sleep(1000);
  const out = { sessionId };
  const probeRaw = (await send('Runtime.evaluate', { expression: PROBE, returnByValue: true }, sessionId)).result;
  out.value = JSON.parse(probeRaw.value);
  if (shotName) {
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(join(EVID, shotName), Buffer.from(shot.data, 'base64'));
    console.log('SHOT assets/screenshots/' + shotName);
  }
  return out;
};

const args = process.argv.slice(2);
const noShot = args.includes('--no-shot');
const CHROME = chromePath();
const port = 9337;
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port,
  '--user-data-dir=' + tempDir('dsh-cdp-profile5'), '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--window-size=1000,760', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 60 && !info; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) info = await r.json(); } catch {} if (!info) await sleep(250); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pendingQ = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pendingQ.has(m.id)) { pendingQ.get(m.id)(m); pendingQ.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pendingQ.set(id, (m) => m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

const before = await probePage(beforePath, noShot ? null : 'model-picker-before.png');
const after = await probePage(afterPath, noShot ? null : 'model-picker-after.png');
const got = after.value;
console.log('BEFORE', JSON.stringify(before.value));
console.log('AFTER ', JSON.stringify(got));
const checks = [
  ['触发器高度 28（原生，不再压 24）', got.trigger.height === '28px'],
  ['触发器字号 13', got.trigger.size === '13px'],
  ['chevron 可见（不再隐藏）', got.trigger.chevron !== 'none'],
  ['菜单圆角 16', got.menu.radius === '16px'],
  ['菜单内衬 5', got.menu.pad === '5px'],
  ['无 TUI 页脚', got.menu.footer === 'none'],
  ['菜单不透明白', got.menu.fill === 'rgb(255, 255, 255)'],
  ['行高 28', got.row.minH === '28px'],
  ['行圆角 8', got.row.radius === '8px'],
  ['无编号前缀', got.row.prefix === 'none'],
  ['选中行淡填充', got.selected.bg.includes('13, 13, 13')],
  ['勾选列可见', got.selected.checkShown !== 'none'],
  ['busy 窗口四行全 disabled', got.pendingBusyRows === 4],
  ['pending 转圈已补位', got.pending.w === '12px' && got.pending.after === '""'],
  ['pending 宿主导航勾选让位', got.pending.hostCheck === 'hidden'],
  ['pending 动效在跑', got.pending.anim.startsWith('codex-ui-spin')],
  ['pending 光标 progress', got.pending.cursor === 'progress'],
  ['disabled 行不洗灰', got.disabledOpacity === '1'],
];
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail += 1; console.log((ok ? 'PASS ' : 'FAIL ') + name); }
ws.close(); child.kill();
console.log(fail === 0 ? 'ALL PASS (' + checks.length + ')' : fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
