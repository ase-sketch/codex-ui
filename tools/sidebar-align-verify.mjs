#!/usr/bin/env node
/**
 * sidebar-align-verify.mjs — 侧栏「新会话 / 插件」行 ↔「工作区」下方行 的列对齐验收。
 *
 * 为什么用夹具而不是截屏：
 *   DSH 桌面壳的 launch token 只活在宿主进程内存里（dsh-client-connection/lib/index.js:244-250），
 *   headless 打不开 19387；宿主又独占 profiles/desktop，起不了第二个实例。
 *   所以这里用**真实 shipped CSS + 按 shipped 渲染代码复刻的 DOM + 本插件真实 theme.css** 渲染夹具，
 *   用 getBoundingClientRect 读几何 —— 不接受「看起来像」。
 *
 * 样式来源：DSH 桌面壳的 app.asar（= 用户实际在跑的那一份）。
 *   --source global 切到 npm 全局安装（0.1.7-rc.1，DOM 少一层 newSessionLabelMask），仅供回归对照。
 *
 * 用法：node tools/sidebar-align-verify.mjs [--source desktop|global] [--no-shot]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const EVID = join(WB, 'evidence');
/** 夹具 HTML 是中间产物，落系统临时目录，不堆进 evidence/。 */
const FIX = join(tmpdir(), 'codex-ui-fixtures');
const THEME = fs.readFileSync(join(WB, 'theme.css'), 'utf8');

const ASAR = 'D:/A-part-of-new-software/DeepSeek Harness/resources/app.asar';
const GLOBAL = 'D:/npm-global/node_modules/@deepseek-ai/dsh/node_modules';
const sourceArg = (() => {
  const i = process.argv.indexOf('--source');
  return i >= 0 ? (process.argv[i + 1] ?? 'desktop') : 'desktop';
})();

/* ── 取样式文本 ───────────────────────────────────────────────────────── */

/** 从引号开始扫一个 JS 字符串字面量，按反斜杠转义配对（CSS 里有转义引号，不能用 indexOf 找结尾）。 */
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

/** 取某个 .module.css 的内联样式串：按 tagId 回退到它前面最近的一条字符串字面量声明。 */
function cssFor(src, moduleFile) {
  const i = src.indexOf(moduleFile);
  if (i < 0) throw new Error('tagId not found: ' + moduleFile);
  const re = /(?:const|var)\s+[\w$]+\s*=\s*"/g;
  let last = null, hit;
  while ((hit = re.exec(src)) !== null && hit.index < i) {
    const text = readStringLiteral(src, hit.index + hit[0].length - 1);
    /* tagId 自己也是一条 `const tagId = "…"`，且排在样式串后面 —— 只认含花括号的那条。 */
    if (text.includes('{')) last = text;
  }
  if (last === null) throw new Error('css declaration not found for ' + moduleFile);
  return last;
}

/** 取某个 Module_css_default 类映射表。 */
function mapFor(src, varName) {
  const i = src.indexOf('var ' + varName + ' = {');
  if (i < 0) throw new Error('class map not found: ' + varName);
  const start = src.indexOf('{', i);
  const end = src.indexOf('};', start);
  const out = {};
  for (const m of src.slice(start, end + 1).matchAll(/"([^"]+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

/* ── 从 app.asar 读文件（桌面壳的唯一真源） ────────────────────────────── */
function asarReader(archive) {
  const fd = fs.openSync(archive, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const headerSize = head.readUInt32LE(12);
  const hb = Buffer.alloc(headerSize);
  fs.readSync(fd, hb, 0, headerSize, 16);
  const header = JSON.parse(hb.toString('utf8'));
  const base = 16 + headerSize;
  return (p) => {
    let node = header;
    for (const seg of p.split('/').filter(Boolean)) {
      node = node.files?.[seg];
      if (node === undefined) return null;
    }
    const buf = Buffer.alloc(node.size);
    fs.readSync(fd, buf, 0, node.size, base + Number(node.offset));
    return buf.toString('utf8');
  };
}

let readShipped;
let sourceLabel;
if (sourceArg === 'global') {
  sourceLabel = 'npm 全局安装 0.1.7-rc.1';
  readShipped = (p) => {
    const file = join(GLOBAL, p);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };
} else {
  sourceLabel = 'DSH 桌面壳 app.asar';
  const read = asarReader(ASAR);
  readShipped = (p) => read('/dsh/node_modules/' + p);
}

const SIDEBAR = '@deepseek-ai/dsh-client-ui-sidebar/lib/client.js';
const WORKSPACE = '@deepseek-ai/dsh-client-ui-workspace/lib/client.js';
const THEME_PKG = '@deepseek-ai/dsh-client-ui-theme/lib/client.js';

const sidebarSrc = readShipped(SIDEBAR);
const workspaceSrc = readShipped(WORKSPACE);
const themeSrc = readShipped(THEME_PKG);
if (sidebarSrc === null || workspaceSrc === null || themeSrc === null) {
  throw new Error('shipped bundles not found via --source ' + sourceArg);
}

/* ui-theme 令牌层：shipped 组件 CSS 消费 --dsw-radius-md / --dsw-alias-*，皮肤只覆盖其中一部分。
   变量名跨版本会变（rc.1 与 rc.2 不同），故按「`*_css_default` + 含 --dsw- 令牌」全量收集，顺序即层叠顺序。 */
const themeLayers = (() => {
  const re = /(?:const|var|let)\s+([\w$]+_css_default)\s*=\s*"/g;
  const parts = [];
  let m;
  while ((m = re.exec(themeSrc)) !== null) {
    const text = readStringLiteral(themeSrc, m.index + m[0].length - 1);
    if (text.includes('--dsw-')) parts.push(text);
  }
  if (parts.length === 0) throw new Error('no ui-theme token layers found in ' + THEME_PKG);
  return parts.join('\n');
})();

const sidebarCss = cssFor(sidebarSrc, '@deepseek-ai/dsh-client-ui-sidebar/SidebarRoot.module.css');
const wsBrowserCss = cssFor(workspaceSrc, '@deepseek-ai/dsh-client-ui-workspace/WorkspaceBrowser.module.css');
const rowsCss = cssFor(workspaceSrc, '@deepseek-ai/dsh-client-ui-workspace/Rows.module.css');

const S = mapFor(sidebarSrc, 'SidebarRoot_module_css_default');
const W = mapFor(workspaceSrc, 'WorkspaceBrowser_module_css_default');
const R = mapFor(workspaceSrc, 'Rows_module_css_default');

const hasMaskLayer = /newSessionLabelMask/.test(sidebarCss);
console.log('样式来源        : ' + sourceLabel);
console.log('New Session DOM : ' + (hasMaskLayer
  ? 'rc.2 嵌套（button > mask > content > svg + label）'
  : 'rc.1 扁平（button > svg + label）'));

/* ── 复刻 DOM ──────────────────────────────────────────────────────────── */
const svg = (size) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><rect x="1" y="1" width="' + (size - 2) + '" height="' + (size - 2) + '" rx="2" fill="none" stroke="currentColor"/></svg>';
const NEWCHAT = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.4" fill="none" stroke="currentColor"/><path d="M7 4.6v4.8M4.6 7h4.8" stroke="currentColor"/></svg>';
const FOLDER = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h4l1.2 1.5h7.8v7.5h-13z" fill="none" stroke="currentColor"/></svg>';

/** 侧栏外壳 + 工作区浏览器；结构与 shipped 渲染代码一致，类名取自真实 CSS-Modules 映射。 */
function stage() {
  return ''
    + '<div class="' + S.root + '" style="width:280px;height:780px">'
    +   '<div class="' + S.logoRow + '" data-window-drag>'
    +     '<span class="' + S.brand + ' ' + S.wide + '"><span class="' + S.brandIdentity + '">'
    +       '<span class="' + S.brandMark + '">' + svg(24) + '</span>'
    +       '<span class="' + S.brandName + '">deepseek</span>'
    +     '</span></span>'
    +     '<button class="' + S.iconButton + ' ' + S.toggle + '" aria-label="收起侧边栏">' + svg(16) + '</button>'
    +   '</div>'
    +   '<button class="' + S.newSession + '" aria-label="新建会话">'
    +     (hasMaskLayer
          ? '<span class="' + S.newSessionLabelMask + '"><span class="' + S.newSessionContent + '">'
              + NEWCHAT + '<span class="' + S.newSessionLabel + ' ' + S.wide + '">新会话</span>'
            + '</span></span>'
          : NEWCHAT + '<span class="' + S.newSessionLabel + ' ' + S.wide + '">新会话</span>')
    +     '<span class="' + S.newSessionShortcut + '" aria-hidden="true"><span class="keys"><kbd>Ctrl</kbd><kbd>+</kbd><kbd>N</kbd></span></span>'
    +   '</button>'
    +   '<nav class="' + S.panelList + '" aria-label="全局面板">'
    +     '<button class="' + S.panelRow + '" aria-label="插件">'
    +       '<span class="' + S.panelGlyph + '" aria-hidden="true">' + svg(16) + '</span>'
    +       '<span class="' + S.panelTitle + ' ' + S.wide + '">插件</span>'
    +     '</button>'
    +   '</nav>'
    +   '<div class="' + S.regionArea + '">'
    +     '<div data-slot="sidebar.workspaces" style="display:contents">'
    +       '<div class="' + W.root + '">'
    +         '<div class="' + W.sectionHeader + '">'
    +           '<span class="' + W.sectionLabel + '">工作区</span>'
    +           '<div class="' + W.searchSlot + '"><div class="' + W.search + '"><button class="' + W.searchButton + '" aria-label="搜索会话">' + svg(16) + '</button></div></div>'
    +           '<div class="' + W.headerActions + '"><button class="' + W.iconButton + '" aria-label="添加工作区">' + svg(16) + '</button></div>'
    +         '</div>'
    +         '<div class="' + W.listArea + '"><div class="' + W.list + '">'
    +           group('PROJIECT', true)
    +           group('未分组', false)
    +         '</div></div>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="' + S.footArea + '"><div class="' + S.settingsArea + '"></div></div>'
    + '</div>';
}

function group(label, withSession) {
  return '<div class="' + W.groupSection + '" style="--dsh-workspace-indent:0px">'
    + '<div class="' + R.projectRow + '" role="treeitem" aria-expanded="true">'
    +   '<span class="' + R.slot + ' ' + R.folder + '">' + FOLDER + '</span>'
    +   '<span class="' + R.slot + ' ' + R.chevron + '">' + svg(16) + '</span>'
    +   '<span class="' + R.projectText + '"><span class="' + R.title + '">' + label + '</span></span>'
    +   '<span class="' + R.rowActions + '"></span>'
    + '</div>'
    + (withSession
      ? '<div role="group"><div class="' + R.sessionRow + '" role="treeitem">'
          + '<span class="' + R.slot + '"></span>'
          + '<span class="' + R.title + '">/ui-ux-pro-max dsh 模型选择器</span>'
          + '<span class="' + R.time + '">10分钟</span>'
          + '<span class="' + R.rowActions + '"></span>'
        + '</div></div>'
      : '')
    + '</div>';
}

const clsMap = JSON.stringify({ S, W, R }).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const page = '<!doctype html><html data-codex-ui data-platform="win32" data-windows-titlebar>'
  + '<head><meta charset="utf-8"><style>' + themeLayers + '</style>'
  + '<style>' + sidebarCss + '</style><style>' + wsBrowserCss + '</style><style>' + rowsCss + '</style>'
  + '<style id="codex-ui-theme">' + THEME + '</style>'
  + '<style>body{margin:0;background:#fff;font-family:"Segoe UI","Microsoft YaHei",sans-serif}'
  + '.wrap{display:flex;gap:24px;padding:16px;align-items:flex-start}'
  + '.col>h4{margin:0 0 8px;font:600 12px/18px ui-monospace,Consolas,monospace;color:#8a8a8a}'
  + '</style></head><body data-cls="' + clsMap + '"><div class="wrap">'
  + '<div class="col"><h4>原生 shipped（无 codex-ui）</h4><div class="plain">' + stage() + '</div></div>'
  + '<div class="col"><h4>+ codex-ui theme.css</h4>' + stage() + '</div>'
  + '</div></body></html>';

fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const htmlPath = join(FIX, 'sidebar-align-verify.html');
fs.writeFileSync(htmlPath, page);

/* 左联要「无 codex-ui」：插件样式表是最后一条 <style>，加载后 disabled 掉即可回到原生。 */
const probe = fs.readFileSync(join(HERE, 'sidebar-align.probe.js'), 'utf8');

/* ── 无头 Chromium + CDP ────────────────────────────────────────────────── */
const CHROME = 'C:/Users/Zs/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const PORT = 9351;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync('C:/Users/Zs/AppData/Local/Temp/dsh-cdp-sidebar-align', { recursive: true, force: true });
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=C:/Users/Zs/AppData/Local/Temp/dsh-cdp-sidebar-align',
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1300,900', 'about:blank'], { stdio: 'ignore' });
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
await send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
await send('Page.navigate', { url: 'file:///' + htmlPath.replaceAll('\\', '/') + '?v=' + Date.now() }, sessionId);
await sleep(1500);

const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true }, sessionId);
if (r.result?.value === undefined) { console.log('PROBE FAILED ' + JSON.stringify(r)); child.kill(); process.exit(2); }
const data = JSON.parse(r.result.value);

const rows = [
  ['新会话 图标', 'newSessionIcon'],
  ['插件   图标', 'panelIcon'],
  ['工作区 图标', 'projectIcon'],
  ['新会话 文字', 'newSessionText'],
  ['插件   文字', 'panelText'],
  ['工作区 文字', 'projectText'],
  ['会话   文字', 'sessionText'],
  ['工作区 表头', 'headerLabel']
];
const fmt = (v) => (v === null ? '   —  ' : String(v.l).padStart(6) + ' → ' + String(v.r).padStart(6));
console.log('');
console.log('列位置（相对侧栏根 div 左边缘；CSS px；侧栏宽 280）');
console.log('  ' + '元素'.padEnd(12) + '原生 shipped'.padEnd(24) + '+ codex-ui');
for (const [label, key] of rows) {
  console.log('  ' + label.padEnd(12) + fmt(data.before[key]).padEnd(24) + fmt(data.after[key]));
}
console.log('');
console.log('  ' + '行盒子'.padEnd(12) + '原生'.padEnd(24) + 'codex-ui');
for (const [label, key] of [['新会话 行', 'newSessionBox'], ['插件   行', 'panelRowBox'], ['工作区 行', 'projectRowBox']]) {
  console.log('  ' + label.padEnd(12) + fmt(data.before[key]).padEnd(24) + fmt(data.after[key]));
}

/* ── 断言：三行的图标列 / 文字列必须落在同一条竖线上 ─────────────────────── */
const a = data.after;
const ICON = 20, TEXT = 42;
const near = (v, target) => v !== null && Math.abs(v - target) <= 0.5;
const checks = [
  ['新会话 图标列 = ' + ICON, near(a.newSessionIcon.l, ICON), a.newSessionIcon.l],
  ['插件   图标列 = ' + ICON, near(a.panelIcon.l, ICON), a.panelIcon.l],
  ['工作区 图标列 = ' + ICON, near(a.projectIcon.l, ICON), a.projectIcon.l],
  ['新会话 文字列 = ' + TEXT, near(a.newSessionText.l, TEXT), a.newSessionText.l],
  ['插件   文字列 = ' + TEXT, near(a.panelText.l, TEXT), a.panelText.l],
  ['工作区 文字列 = ' + TEXT, near(a.projectText.l, TEXT), a.projectText.l]
];
console.log('');
let failed = 0;
for (const [label, ok, got] of checks) {
  if (!ok) failed += 1;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label.padEnd(24) + '实测 ' + got);
}
console.log('');
console.log(failed === 0 ? 'RESULT PASS  ' + checks.length + '/' + checks.length : 'RESULT FAIL  ' + (checks.length - failed) + '/' + checks.length);

if (!process.argv.includes('--no-shot')) {
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 660, height: 830, scale: 2 } }, sessionId);
  fs.writeFileSync(join(EVID, 'sidebar-align-verify.png'), Buffer.from(shot.data, 'base64'));
  console.log('WROTE ' + join(EVID, 'sidebar-align-verify.png'));
}
ws.close(); child.kill();
process.exit(failed === 0 ? 0 : 1);
