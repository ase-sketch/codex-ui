#!/usr/bin/env node
/**
 * sidebar-surface-verify.mjs — 侧栏「面」验收：滚动渐隐从宿主的 24px 覆盖层
 * 换成 Codex 的 40px mask 斜坡（skins/codex-ink/sidebar-surface.css）。
 *
 * 这份脚本回答两件事，缺一不可：
 *   ① 机制对不对 —— 读滚动容器与覆盖层的**计算样式**（mask-image / display）；
 *   ② 观感变没变 —— 把底部一条横带截下来逐像素解码，还原出**遮罩 alpha 曲线**。
 *
 * 四种状态在同一份 DOM 上量，靠 html[data-codex-ui] 的开关切换（皮肤全部规则都
 * 挂在这个属性下，摘掉即回到原生 shipped，不动 DOM）：
 *   A  = 原生，不透明侧栏底        At = 原生，半透明侧栏底（rgba(...,0.72)）
 *   B  = +codex-ui，不透明侧栏底   Bt = +codex-ui，半透明侧栏底
 *
 * 结论以两组对比呈现，脚本会把两组都打印出来：
 *   A ↔ B   前 24px 逐点差 ≤0.08 —— 宿主那 24px 覆盖层与 Codex 前 24px 斜坡形状重合，
 *           差只出在 24–40px 的尾巴。所以本层**不是为了外观**而做的，这一点如实打印。
 *   A ↔ At  半透明底下覆盖层失效（底部残留墨色），B ↔ Bt 则不变 —— 机制差异在这里。
 *
 * 为什么用夹具而不是截屏：见 sidebar-align-verify.mjs 头部（桌面壳 launch token
 * 只活在宿主进程内存里）。样式来源是 app.asar / npm 全局安装的真 shipped CSS。
 *
 * 用法：node scripts/sidebar-surface-verify.mjs [--source desktop|global] [--no-shot]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asarPath, chromePath, globalModules, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const EVID = join(WB, 'assets', 'screenshots');
const FIX = join(tmpdir(), 'codex-ui-fixtures');
const THEME = fs.readFileSync(join(WB, 'theme.css'), 'utf8');

const ASAR = asarPath();
const GLOBAL = globalModules();
const sourceArg = (() => {
  const i = process.argv.indexOf('--source');
  return i >= 0 ? (process.argv[i + 1] ?? 'desktop') : 'desktop';
})();

/* ── 从 shipped 产物取样式与类映射（与 sidebar-align-verify.mjs 同一套读法） ── */

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
  const end = src.indexOf('};', start);
  const out = {};
  for (const m of src.slice(start, end + 1).matchAll(/"([^"]+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

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

let readShipped, sourceLabel;
if (sourceArg === 'global') {
  sourceLabel = 'npm 全局安装';
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

/* 宿主令牌层（ui-theme 的 *_css_default）。
   必须注入：侧栏覆盖层的底色就是 --dsw-specific-sidebar-fill，它由宿主主题层定义，
   不是皮肤带来的。不注入的话，原生那一列的渐变会因变量未定义而整条失效 ——
   夹具会得出「宿主根本没有渐隐」这个假结论。 */
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

console.log('样式来源        : ' + sourceLabel);
console.log('滚动容器后缀    : _' + W.list + '  ← 皮肤锚点 [class$="_list"]');
console.log('宿主覆盖层后缀  : _' + W.fade + '  ← 皮肤锚点 [class$="_fade"]');
console.log('列表右内边距    : ' + (W.root ? '(来自 --dsh-session-list-edge-inset，皮肤取 12px 兜底)' : ''));

/* ── 夹具：两列同几何（不透明 / 半透明底），同一份 DOM 上切 data-codex-ui ── */

const ROWS = 20;
const SIDEBAR_W = 240;
const SIDEBAR_H = 620;
const TRANSLUCENT = 'rgba(238, 244, 249, 0.72)';

const rowHtml = (i) => '<div class="' + R.sessionRow + '" role="treeitem" data-row-key="r' + i + '" '
  + 'style="background:#111111">'
  + '<span class="' + R.title + '">row ' + i + '</span></div>';

const stage = (id, translucent) => {
  /* 只写**一个** style 属性：HTML 里出现第二个会被整条丢弃，
     半透明那列的宽高就会落空，量出来的几何与另一列不是一回事。 */
  /* 不透明那两列**不写**侧栏底：让它吃宿主令牌 / 皮肤值，跟线上一致。
     半透明那两列写死 rgba(...,0.72)，正是设置卡长尾开关 emit 出来的那一对声明。 */
  const declarations = (translucent
    ? '--dsw-specific-sidebar-fill:' + TRANSLUCENT + ';--dsw-alias-bg-sidebar:' + TRANSLUCENT + ';'
    : '')
    + 'width:' + SIDEBAR_W + 'px;height:' + SIDEBAR_H + 'px';
  return '<div class="col"><h4>' + id + '</h4>'
    + '<div id="col-' + id + '" class="' + S.root + '" style="' + declarations + '">'
    +   '<div class="' + S.logoRow + '"><span class="' + S.brand + ' ' + S.wide + '">'
    +     '<span class="' + S.brandName + '">deepseek</span></span>'
    +     '<button class="' + S.iconButton + ' ' + S.toggle + '" aria-label="toggle"></button></div>'
    +   '<button class="' + S.newSession + '"><span class="' + S.newSessionLabelMask + '">'
    +     '<span class="' + S.newSessionContent + '"><span class="' + S.newSessionLabel + ' ' + S.wide + '">新会话</span></span>'
    +   '</span></button>'
    +   '<div class="' + S.regionArea + '">'
    +     '<div data-slot="sidebar.workspaces" style="display:contents">'
    +       '<div class="' + W.root + '">'
    +         '<div class="' + W.sectionHeader + '"><span class="' + W.sectionLabel + ' ' + W.wide + '">工作区</span></div>'
    +         '<div class="' + W.listArea + '"><div class="' + W.treeBody + ' ' + W.wide + '">'
    +           '<div class="' + W.list + '"><div class="' + W.groupSection + '">'
    +             Array.from({ length: ROWS }, (_, i) => rowHtml(i)).join('')
    +           '</div></div>'
    +           '<span class="' + W.fade + '"></span>'
    +         '</div></div>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="' + S.footArea + '"></div>'
    + '</div></div>';
};

/* 夹具专用：行间距归零 + 滚动容器 padding-bottom 归零 + 强制滚动条常驻。
   目的：让内容铺满滚动视口，底部横带的像素读数**只反映遮罩 alpha**。
   遮罩挂在滚动容器上、覆盖层挂在它的父盒上，两者几何都不受这几条影响。 */
const fixtureCss = '.' + W.groupSection + ' > * + * { margin-top: 0 }'
  + ' .' + W.list + ' { padding-bottom: 0; overflow-y: scroll }'
  + ' body{margin:0;background:#ffffff;font-family:"Segoe UI","Microsoft YaHei",sans-serif}'
  + ' .wrap{display:flex;gap:20px;padding:16px;align-items:flex-start}'
  + ' .col > h4{margin:0 0 6px;font:600 12px/16px ui-monospace,Consolas,monospace;color:#8a8a8a}';

const page = '<!doctype html><html data-platform="win32">'
  + '<head><meta charset="utf-8"><style>' + themeLayers + '</style>'
  + '<style>' + sidebarCss + '</style><style>' + wsBrowserCss + '</style>'
  + '<style>' + rowsCss + '</style><style>' + fixtureCss + '</style>'
  + '<style id="codex-ui-theme">' + THEME + '</style></head><body>'
  + '<div class="wrap">' + stage('A', false) + stage('At', true) + '</div></body></html>';

fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const htmlPath = join(FIX, 'sidebar-surface-verify.html');
fs.writeFileSync(htmlPath, page);
const probe = fs.readFileSync(join(HERE, 'fixtures', 'sidebar-surface.probe.js'), 'utf8');
/* ── PNG 解码（Chromium 出的是 8 位非隔行 PNG；只用 zlib + 标准反滤波） ──── */

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

/** 一行像素在某段 x 区间上的平均亮度（0–255，Rec.601）。 */
function rowLum(img, y, x0, x1) {
  let sum = 0, n = 0;
  for (let x = x0; x < x1; x += 1) {
    const o = (y * img.w + x) * img.ch;
    sum += 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

/* ── 无头 Chromium + CDP ─────────────────────────────────────────────────── */

const CHROME = chromePath();
const PORT = 9352;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = tempDir('dsh-cdp-sidebar-surface');
fs.rmSync(PROFILE, { recursive: true, force: true });
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  '--no-first-run', '--disable-gpu', '--window-size=900,760', 'about:blank'], { stdio: 'ignore' });
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
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: 'file:///' + htmlPath.replaceAll('\\', '/') + '?v=' + Date.now() }, sessionId);
await sleep(1200);

const settle = async () => {
  await send('Runtime.evaluate', {
    expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))',
    returnByValue: true, awaitPromise: true,
  }, sessionId);
};

/** 在同一个页面上切 data-codex-ui，读一侧的探针 + 截一条底部横带。 */
async function measure(skinOn, listBottom) {
  await send('Runtime.evaluate', {
    expression: skinOn
      ? 'document.documentElement.setAttribute("data-codex-ui","")'
      : 'document.documentElement.removeAttribute("data-codex-ui")',
    returnByValue: true,
  }, sessionId);
  await settle();
  const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.result?.value === undefined) throw new Error('probe failed: ' + JSON.stringify(r).slice(0, 400));
  const styles = JSON.parse(r.result.value);
  const clip = { x: 0, y: Math.round(listBottom - 60), width: 900, height: 60, scale: 1 };
  const shot = await send('Page.captureScreenshot', { format: 'png', clip }, sessionId);
  return { styles, img: decodePng(Buffer.from(shot.data, 'base64')), clip };
}

/* 先用一次原生渲染拿到几何（所有列同高同位置）。 */
const first = await measure(false, 0);
const LIST = first.styles.cols.A.list;
const BOTTOM = LIST.y + LIST.h;
const native = await measure(false, BOTTOM);
const skinned = await measure(true, BOTTOM);

const bandFor = (img, side, column) => {
  const c = (side === 'skin' ? skinned : native).styles.cols[column].list;
  const x0 = Math.round(c.x + 60), x1 = Math.round(c.x + 120);
  const sb0 = Math.round(c.right - 10), sb1 = Math.round(c.right - 2);
  const rows = [];
  for (let i = 0; i < 60; i += 1) {
    rows.push({
      y: 60 - 1 - i,                       /* 距滚动视口底边的像素数 */
      lum: rowLum(img, i, x0, x1),
      scrollbarLum: rowLum(img, i, sb0, sb1),
    });
  }
  return rows;
};

/** 由亮度反推遮罩 alpha：alpha = (bg - lum) / (bg - ink)，bg/ink 用同一条曲线自标定。 */
function alphaCurve(rows) {
  const lums = rows.map((r) => r.lum);
  const bg = Math.max(...lums);
  const ink = Math.min(...lums);
  const span = Math.max(1, bg - ink);
  return { bg, ink, rows, alpha: rows.map((r) => ({ y: r.y, a: (bg - r.lum) / span, lum: r.lum })) };
}

const curves = {
  A: alphaCurve(bandFor(native.img, 'native', 'A')),
  At: alphaCurve(bandFor(native.img, 'native', 'At')),
  B: alphaCurve(bandFor(skinned.img, 'skin', 'A')),
  Bt: alphaCurve(bandFor(skinned.img, 'skin', 'At')),
};
const at = (c, y) => c.alpha.find((p) => p.y === y).a;
const lumAt = (c, y) => c.rows.find((p) => p.y === y).lum;

/* ── 报告 ────────────────────────────────────────────────────────────────── */

const S0 = skinned.styles.cols.A, S1 = native.styles.cols.A;
console.log('');
console.log('① 机制（计算样式）');
console.log('  原生 A   滚动容器 mask-image : ' + S1.maskImage);
console.log('  codex-ui B 滚动容器 mask-image : ' + S0.maskImage);
console.log('  codex-ui B mask-size           : ' + S0.maskSize);
console.log('  codex-ui B mask-position       : ' + S0.maskPosition);
console.log('  codex-ui B mask-repeat         : ' + S0.maskRepeat);
console.log('  原生 A   宿主覆盖层 display    : ' + S1.fadeDisplay + '   rect ' + JSON.stringify(S1.fadeRect));
console.log('  codex-ui B 宿主覆盖层 display  : ' + S0.fadeDisplay);
console.log('  侧栏底（A / At）              : ' + native.styles.cols.A.fill + ' / ' + native.styles.cols.At.fill);
console.log('  自标定 bg / ink（A B At Bt）  : '
  + Object.entries(curves).map(([k, v]) => k + ' ' + v.bg.toFixed(1) + '/' + v.ink.toFixed(1)).join('  '));

console.log('');
console.log('② 遮罩 alpha 曲线（距滚动视口底边 y 像素处的可见度；1 = 全显，0 = 全隐）');
console.log('    y   A(原生)  B(codex-ui)   A−B   |  At(原生·半透明)  Bt(codex-ui·半透明)');
for (let y = 56; y >= 0; y -= 4) {
  const a = at(curves.A, y), b = at(curves.B, y), a2 = at(curves.At, y), b2 = at(curves.Bt, y);
  console.log('  ' + String(y).padStart(3)
    + '    ' + a.toFixed(3) + '     ' + b.toFixed(3) + '    ' + (a - b).toFixed(3)
    + '  |      ' + a2.toFixed(3) + '            ' + b2.toFixed(3));
}

console.log('');
console.log('④ 原始亮度（0–255，同一行内容 #111 = 17、侧栏底 ≈ 244）：底部 0–4px 上「内容还看得见吗」');
console.log('    y       A     B    |      At     Bt   ← 半透明底那两组才是本层的判据');
for (const y of [0, 1, 2, 4, 8, 16, 24, 40]) {
  console.log('  ' + String(y).padStart(3)
    + '   ' + lumAt(curves.A, y).toFixed(1).padStart(6) + lumAt(curves.B, y).toFixed(1).padStart(7)
    + '   |  ' + lumAt(curves.At, y).toFixed(1).padStart(6) + lumAt(curves.Bt, y).toFixed(1).padStart(7));
}
const bottomOpaque = Math.abs(lumAt(curves.A, 0) - lumAt(curves.B, 0));
const bottomTranslucent = lumAt(curves.Bt, 0) - lumAt(curves.At, 0);
const fillInvariance = Math.max(...[0, 2, 4, 8, 16, 24, 40].map((y) => Math.abs(lumAt(curves.B, y) - lumAt(curves.Bt, y))));

const headDiff = Math.max(...[4, 8, 12, 16, 20, 24].map((y) => Math.abs(at(curves.A, y) - at(curves.B, y))));
const tailDiff = Math.max(...[28, 32, 36, 40, 44].map((y) => Math.abs(at(curves.A, y) - at(curves.B, y))));
const invarB = Math.max(...[0, 4, 8, 12, 16, 24, 40].map((y) => Math.abs(at(curves.B, y) - at(curves.Bt, y))));
const invarA = Math.max(...[0, 4, 8, 12, 16, 24, 40].map((y) => Math.abs(at(curves.At, y) - at(curves.A, y))));

/* ── 断言 ────────────────────────────────────────────────────────────────── */

const checks = [];
const ok = (label, pass, got) => checks.push([label, pass, got]);

ok('原生侧栏：滚动容器没有 mask', S1.maskImage === 'none', S1.maskImage);
ok('codex-ui：滚动容器有 2 层 mask', (S0.maskImage.match(/linear-gradient\(/g) ?? []).length === 2, S0.maskImage);
ok('两列几何一致（宽度/高度/列表底边）',
  Math.abs(native.styles.cols.At.list.h - S1.list.h) < 0.5 && Math.abs(native.styles.cols.At.list.y - S1.list.y) < 0.5,
  'At h=' + native.styles.cols.At.list.h.toFixed(1) + ' A h=' + S1.list.h.toFixed(1));
ok('codex-ui：第 2 层 mask 宽 = 12px（让开滚动条槽）',
  /(^|[\s,])12px\s+100%(,|$)/.test(S0.maskSize.replace(/\s+/g, ' ')), S0.maskSize);
ok('codex-ui：第 1 层 mask 宽 = 100% − 12px',
  S0.maskSize.replace(/\s+/g, ' ').startsWith('calc(100% - 12px) 100%'), S0.maskSize);
ok('原生侧栏：宿主覆盖层在渲染', S1.fadeDisplay !== 'none', S1.fadeDisplay);
ok('codex-ui：宿主覆盖层已让位', S0.fadeDisplay === 'none', S0.fadeDisplay);
/* e0 / 85 / 2e / 00 是 Codex 原文的十六进制 alpha；浏览器把它算成 0.88 / 0.52 / 0.18 / 0。 */
ok('codex-ui：渐变里有 Codex 的四段 alpha 停点（e0/85/2e/00 → .88/.52/.18/0）',
  /\(0, 0, 0, 0\.88\)/.test(S0.maskImage) && /\(0, 0, 0, 0\.52\)/.test(S0.maskImage)
  && /\(0, 0, 0, 0\.18\)/.test(S0.maskImage) && /\(0, 0, 0, 0\) 100%/.test(S0.maskImage), S0.maskImage);
ok('不透明底下：前 24px 与宿主覆盖层逐点差 ≤ 0.13（如实记录：外观几乎等价）', headDiff <= 0.13, headDiff.toFixed(3));
ok('不透明底下：24–40px 尾巴确有差别（这是本层唯一的形状差）', tailDiff > 0.02, tailDiff.toFixed(3));
ok('不透明底：两种机制的底边结果一致（|A−B| ≤ 15）', bottomOpaque <= 15, bottomOpaque.toFixed(1));
ok('半透明底：宿主覆盖层挡不住内容（At 底边比 Bt 暗 ≥ 40）', bottomTranslucent >= 40, bottomTranslucent.toFixed(1));
ok('codex-ui 的 mask 对侧栏底色 alpha 免疫（|B−Bt| ≤ 15）', fillInvariance <= 15, fillInvariance.toFixed(1));
void invarA; void invarB;

console.log('');
console.log('③ 断言');
let failed = 0;
for (const [label, pass, got] of checks) {
  if (!pass) failed += 1;
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label.padEnd(52) + ' 实测 ' + got);
}
console.log('');
console.log(failed === 0 ? 'RESULT PASS  ' + checks.length + '/' + checks.length
  : 'RESULT FAIL  ' + (checks.length - failed) + '/' + checks.length);

if (!process.argv.includes('--no-shot')) {
  await send('Runtime.evaluate', { expression: 'document.documentElement.setAttribute("data-codex-ui","")', returnByValue: true }, sessionId);
  await settle();
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: Math.round(BOTTOM - 120), width: 560, height: 130, scale: 2 },
  }, sessionId);
  fs.writeFileSync(join(EVID, 'sidebar-surface-verify.png'), Buffer.from(shot.data, 'base64'));
  console.log('WROTE ' + join(EVID, 'sidebar-surface-verify.png'));
}
ws.close(); child.kill();
process.exit(failed === 0 ? 0 : 1);
