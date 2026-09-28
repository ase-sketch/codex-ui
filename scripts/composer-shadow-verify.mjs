#!/usr/bin/env node
/**
 * composer-shadow-verify.mjs — ⑱ 输入卡阴影验收（对齐 Codex --elevation-composer）。
 *
 * 判据来源：Codex 桌面端 26.924.2738.0 的 resources/app.asar @67930943 逐字：
 *   --elevation-composer:      0 0 0 1px #0000000a, 0 2px 8px 0 #0000000a, 0 4px 80px 8px #00000006;
 *   --elevation-composer-dark: inset 0 0 1px 0 #fff3
 *   @media (width<40rem) 时远场 80px → 40px
 *
 * 本夹具量四件事：
 *   ① 亮色计算值 = 三层，几何与 alpha 逐项对上 Codex；
 *   ② 暗色计算值 = 单层 inset 高光，卡外**零**投影；
 *   ③ 窄屏远场收到 40px；
 *   ④ 真实渲染像素：亮色衰减半径够长（远场真的画出来了）、暗色卡内顶边确实被点亮。
 * 用法：node scripts/composer-shadow-verify.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, globalModules, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const EVID = join(WB, 'assets', 'screenshots');
const FIX = join(tmpdir(), 'codex-ui-fixtures');
const ROOT = join(globalModules(), '@deepseek-ai');
const SRC = fs.readFileSync(join(ROOT, 'dsh-client-ui-conversation', 'lib', 'client.js'), 'utf8');

const cssFor = (moduleFile) => {
  const i = SRC.indexOf(moduleFile);
  if (i < 0) throw new Error('tagId not found: ' + moduleFile);
  const decl = SRC.lastIndexOf('const css', i);
  const start = SRC.indexOf('"', decl) + 1;
  const end = SRC.indexOf('";', start);
  return SRC.slice(start, end).replaceAll('\\"', '"');
};
const mapFor = (varName) => {
  const i = SRC.indexOf('var ' + varName + ' = {');
  const start = SRC.indexOf('{', i);
  const end = SRC.indexOf('};', start);
  const out = {};
  for (const m of SRC.slice(start, end + 1).matchAll(/"([^"]+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
};
const rootCss = cssFor('@deepseek-ai/dsh-client-ui-conversation/ConversationRoot.module.css');
const barCss = cssFor('@deepseek-ai/dsh-client-ui-conversation/InputBar.module.css');
const R = mapFor('ConversationRoot_module_css_default');
const B = mapFor('InputBar_module_css_default');
const theme = fs.readFileSync(join(WB, 'theme.css'), 'utf8');

/* 舞台底色**不写死**：交给皮肤自己的令牌，夹具只断言令牌值本身。
   写死会让「皮肤改了画布色而夹具没跟着改」这种失配静默通过。 */
const page = '<!doctype html><html data-codex-ui><head><meta charset="utf-8">'
  + '<style>' + rootCss + '</style><style>' + barCss + '</style><style>' + theme + '</style>'
  + '<style>body{margin:0;font:14px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;background:var(--dsw-alias-bg-base)}'
  + '.stage{padding:80px 0 90px}</style></head><body>'
  + '<div class="stage"><div class="' + R.scrollBody + '" data-conversation-scroll style="--dsh-chat-content-width:768px">'
  + '<div class="' + B.root + '"><div class="' + B.card + '" data-composer-card="true">'
  + '<div class="' + B.scroll + '" data-input-scroll="true"><div class="' + B.grow + '">'
  + '<div class="' + B.input + '" data-lexical-editor="true" contenteditable="true"></div>'
  + '</div></div></div></div></div></div></body></html>';

fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const htmlPath = join(FIX, 'composer-shadow-verify.html');
fs.writeFileSync(htmlPath, page);

const PORT = 9351;
const DSF = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = tempDir('dsh-cdp-shadow-verify');
fs.rmSync(PROFILE, { recursive: true, force: true });
const child = spawn(chromePath(), ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1100,700', 'about:blank'], { stdio: 'ignore' });
let info; for (let i = 0; i < 60 && !info; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) info = await r.json(); } catch {} if (!info) await sleep(250); }
if (!info) { child.kill(); throw new Error('headless chrome did not start'); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); });
const evalJs = async (expr) => {
  const res = (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)).result;
  if (res.value === undefined) throw new Error('eval returned undefined: ' + JSON.stringify(res));
  return res.value;
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: DSF, mobile: false }, sessionId);
await send('Page.navigate', { url: 'file:///' + htmlPath.replaceAll('\\', '/') + '?v=' + Date.now() }, sessionId);
await sleep(1500);

const PROBE = fs.readFileSync(join(HERE, 'fixtures', 'composer-shadow.probe.js'), 'utf8');
const probe = async () => JSON.parse(await evalJs(PROBE));

/** 把 rgba 计算值拆成层：inset 标记、四个长度、alpha。 */
const parseLayers = (s) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean).map((x) => {
  const inset = /(^|\s)inset(\s|$)/.test(x);
  const nums = [...x.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => parseFloat(m[1]));
  const col = x.match(/rgba?\([^)]*\)/);
  let alpha = null;
  if (col) {
    const parts = col[0].replace(/^rgba?\(|\)$/g, '').split(',').map((v) => v.trim());
    alpha = parts.length === 4 ? parseFloat(parts[3]) : 1;
  }
  return { inset, nums, alpha, raw: x };
});
const near = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;
/** 把计算色换算成 0..255 通道值。color-mix 会算成 color(srgb r g b)（0..1 浮点），
    字面量则是 rgb(r, g, b) —— 两种记法都要认，否则断言会被记法差异误判。 */
const chan = (c) => {
  const m = String(c).match(/color\(srgb\s+([\d.]+)/);
  if (m) return parseFloat(m[1]) * 255;
  const r = String(c).match(/rgba?\(\s*([\d.]+)/);
  return r ? parseFloat(r[1]) : NaN;
};

/* ── 像素测量：截图回灌进页面，用 canvas 取竖直扫描线 ─────────────────── */
const scanAbove = async (rect, cssPx) => {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  return JSON.parse(await evalJs('(async () => {'
    + 'const img = new Image(); img.src = "data:image/png;base64,' + shot.data + '";'
    + 'await img.decode();'
    + 'const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;'
    + 'const g = c.getContext("2d"); g.drawImage(img, 0, 0);'
    + 'const D = ' + DSF + ';'
    + 'const x = Math.round((' + rect.x + ' + ' + rect.w + ' / 2) * D);'
    + 'const yTop = Math.round(' + rect.y + ' * D);'
    + 'const out = [];'
    + 'for (let d = 0; d < ' + cssPx + ' * D; d += 1) {'
    + '  const y = yTop - d; if (y < 0) break;'
    + '  const p = g.getImageData(x, y, 1, 1).data;'
    + '  out.push([d / D, (p[0] + p[1] + p[2]) / 3]);'
    + '}'
    + 'const page = g.getImageData(x, 4, 1, 1).data;'
    + 'const body = g.getImageData(x, yTop + Math.round(20 * D), 1, 1).data;'
    + 'return JSON.stringify({ base: (page[0] + page[1] + page[2]) / 3, body: (body[0] + body[1] + body[2]) / 3, prof: out });'
    + '})()'));
};

const results = [];
const check = (name, pass, detail) => { results.push([name, pass, detail]); };

/* ── ① 亮色 ─────────────────────────────────────────────────────────── */
const light = await probe();
const L = parseLayers(light.shadow);
console.log('LIGHT  var  ' + light.varShadow);
console.log('LIGHT  calc ' + light.shadow);
console.log('LIGHT  base=' + light.canvasBase + '  surface=' + light.surface);
check('亮色画布 = #ffffff', light.canvasBase.toLowerCase() === '#ffffff', light.canvasBase);
/* 亮色卡与页面**同色**：Codex 亮色靠阴影分层，不靠填充（三份实测同向，见 composer.css 头注）。
   0.5.7 及以前亮色也叠 5% 墨 = #f4f4f4，比 Codex 暗 11 级。 */
check('亮色输入卡 = #ffffff（与页面同色，不叠罩）', light.bg === 'rgb(255, 255, 255)', light.bg);
check('亮色输入卡 ≠ #f4f4f4（旧值，暗 11 级）', light.bg !== 'rgb(244, 244, 244)', light.bg);
check('亮色阴影为两层（环 + 近场；0.6.3 起无 80px 远场）', L.length === 2, L.length + ' 层');
check('亮色两层皆非 inset', L.every((l) => !l.inset), L.map((l) => l.inset).join(','));
if (L.length === 2) {
  /* 环取 12% 而非源码字面的 3.9%：实测边缘要 220~234，4% 只能渲到 241。见 composer.css 头注。 */
  /* 环取 10%（Codex --color-border = --alpha-10），不是源码路径A 的 3.9%、也不是 0.5.8 的 12%：
     同图内比较与标定渲染两法都指向 ~10.4%。见 composer.css 头注。 */
  check('层1 环 = 0 0 0 0.5px @10%（DPR 2 下 1 个设备像素，= Codex 参考图实测）', !L[0].inset && L[0].nums.join(' ') === '0 0 0 0.5' && near(L[0].alpha, 0.1, 0.015), L[0].raw);
  check('层2 近场 = 0 2px 12px 0 @9%（拟合 Codex 实测衰减）', L[1].nums.join(' ') === '0 2 12 0' && near(L[1].alpha, 0.09, 0.01), L[1].raw);
}
/* 渲染边缘：Codex 参考图与用户截图都落在 220~234，本皮肤必须也落进去。
   旧值 4% 渲出 241（偏亮），这正是 0.5.7 引入、0.5.8 修回的偏差。 */
const lightEdge = await (async () => {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  return JSON.parse(await evalJs('(async () => {'
    + 'const img = new Image(); img.src = "data:image/png;base64,' + shot.data + '"; await img.decode();'
    + 'const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;'
    + 'const g = c.getContext("2d"); g.drawImage(img, 0, 0); const D = ' + DSF + ';'
    + 'const y = Math.round((' + light.rect.y + ' + ' + light.rect.h + ' / 2) * D);'
    + 'const xL = Math.round(' + light.rect.x + ' * D);'
    + 'let best = 255; for (let d = 1; d <= 6; d += 1) {'
    + '  const p = g.getImageData(xL - d, y, 1, 1).data; const v = (p[0] + p[1] + p[2]) / 3;'
    + '  if (v < best) best = v; }'
    + 'return JSON.stringify({ edge: Math.round(best) }); })()'));
})();
console.log('LIGHT  渲染边缘（卡左 6px 内最暗）= ' + lightEdge.edge + '   Codex 实测 220~234');
check('亮色卡边缘落在 Codex 实测带内（210~234）', lightEdge.edge >= 210 && lightEdge.edge <= 234, String(lightEdge.edge));

const lightScan = await scanAbove(light.rect, 60);
const lightDev = lightScan.prof.map(([d, v]) => [d, lightScan.base - v]);
const lightPeak1 = lightDev.find(([d]) => d === 1)?.[1] ?? 0;
const lightExtent = lightDev.filter(([, v]) => v >= 1).map(([d]) => d).pop() ?? 0;
console.log('LIGHT  1px处偏离 ' + lightPeak1.toFixed(1) + '   衰减半径 ' + lightExtent + 'px');
/* 0.6.3：判据从「衰减半径 ≥ 35px」改成「落进 Codex 参考图实测带」。旧口径奖励长尾巴，
   而参考图（DPR 2）里卡下沿 24 个设备像素（= 12 CSS px）就归零了 —— 长尾巴正是要修的东西。
   这里量的是卡**上沿**，近场 0 2px 12px 向下偏 2px，上沿比下沿短一档，带宽取 3~13 CSS px。 */
check('亮色卡上沿衰减半径落在 Codex 实测带内（3~13px）', lightExtent >= 3 && lightExtent <= 13, lightExtent + 'px');
/* 这条原先写「1px 处 ≤ 22」，是拿 DSF=1 + 4% 环标定的口径，量到的其实是**环本身**；
   Codex 实测的环像素是 220（偏离 35），所以旧口径把「环」和「环外一格」比成了同一件事。
   现在环的判据交给上面的显式边缘带断言（210~234），这里只留信息打印。 */
console.log('LIGHT  1px处（即环像素）偏离 ' + lightPeak1.toFixed(1) + '（信息项，不作断言）');

/* ── ② 暗色 ─────────────────────────────────────────────────────────── */
await evalJs('document.body.setAttribute("data-ds-dark-theme",""); "ok"');
await sleep(400);
const dark = await probe();
const D = parseLayers(dark.shadow);
console.log('DARK   var  ' + dark.varShadow);
console.log('DARK   calc ' + dark.shadow);
console.log('DARK   base=' + dark.canvasBase);
check('暗色画布 = #111111（Codex 主题面板的「背景」）', dark.canvasBase.toLowerCase() === '#111111', dark.canvasBase);
check('暗色表面 = #181818（卡片所坐的面，非窗口背景）', dark.surface.toLowerCase() === '#181818', dark.surface);
check('暗色属性确实生效（前提自检）', dark.dark === true, String(dark.dark));
check('暗色阴影为单层', D.length === 1, D.length + ' 层');
/* 暗色相反：靠**填充**分层 —— 5% 白叠 surface #181818 = 35.6 → 36（Codex 实测 35）。 */
/* 5% 白叠 #181818 = 35.55（Codex 参考裁图实测 35）—— color-mix 会算成 color(srgb 0.1394…) */
check('暗色输入卡 ≈ 35.55（5% 白叠 #181818；Codex 实测 35）', Math.abs(chan(dark.bg) - 35.55) < 1.0, dark.bg + ' → ' + chan(dark.bg).toFixed(2));
check('暗色输入卡 ≠ 亮色值（两套机制相反）', dark.bg !== light.bg, dark.bg);
if (D.length === 1) {
  check('暗色为 inset 内嵌高光（Codex --elevation-composer-dark）', D[0].inset === true, D[0].raw);
  check('暗色几何 = 0 0 1px 0 @20%（#fff3）', D[0].nums.join(' ') === '0 0 1 0' && near(D[0].alpha, 0.2), D[0].raw);
}
const darkScan = await scanAbove(dark.rect, 60);
const darkDev = darkScan.prof.map(([d, v]) => [d, darkScan.base - v]);
const darkOuter = darkDev.filter(([d]) => d >= 2 && d <= 40).reduce((m, [, v]) => Math.max(m, Math.abs(v)), 0);
console.log('DARK   卡外 2..40px 最大偏离 ' + darkOuter.toFixed(1) + '   卡内顶边 ' + darkScan.body.toFixed(0) + ' vs 卡体基线');
check('暗色卡外零投影（2..40px 偏离 ≤ 1）', darkOuter <= 1, darkOuter.toFixed(1));
/* 卡内顶边应比卡体更亮 —— inset 高光的签名。取 +0px 与 +6px 对比。 */
const darkInside = await (async () => {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  return JSON.parse(await evalJs('(async () => {'
    + 'const img = new Image(); img.src = "data:image/png;base64,' + shot.data + '"; await img.decode();'
    + 'const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;'
    + 'const g = c.getContext("2d"); g.drawImage(img, 0, 0); const D = ' + DSF + ';'
    + 'const x = Math.round((' + dark.rect.x + ' + ' + dark.rect.w + ' / 2) * D);'
    + 'const yTop = Math.round(' + dark.rect.y + ' * D);'
    + 'const px = (dy) => { const p = g.getImageData(x, yTop + dy, 1, 1).data; return (p[0] + p[1] + p[2]) / 3; };'
    + 'return JSON.stringify({ edge: px(0), inner: px(Math.round(6 * D)) }); })()'));
})();
console.log('DARK   卡内顶边 ' + darkInside.edge.toFixed(1) + '  卡内 +6px ' + darkInside.inner.toFixed(1));
check('暗色卡内顶边被点亮（比卡体亮 ≥ 2；旧皮肤 36/36 全平）', darkInside.edge - darkInside.inner >= 2, (darkInside.edge - darkInside.inner).toFixed(1));

/* ── ③ 窄屏：远场 80px → 40px（Codex 的 width<40rem 分支） ──────────────
   必须先摘掉深色属性：暗色分支的 inset 声明特异性更高，会盖掉窄屏覆盖值，
   不摘就会测到暗色阴影，让这条断言永远「通过」在错误的前提上。 */
await evalJs('document.body.removeAttribute("data-ds-dark-theme"); "ok"');
await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 700, deviceScaleFactor: DSF, mobile: false }, sessionId);
await sleep(500);
check('窄屏段确实回到亮色（前提自检）', (await probe()).dark === false, 'body 无 data-ds-dark-theme');
const narrow = await probe();
const N = parseLayers(narrow.shadow);
console.log('NARROW ' + narrow.shadow);
/* 0.6.3 起没有远场可收（参考图里量不到那层），窄屏与宽屏同值。
   这一段留着是为了挡住「有人又把 80px 远场加回来」：宽窄不一致就是回退。 */
check('窄屏（600px）阴影与宽屏逐字相同（无远场可收）', narrow.shadow === light.shadow, narrow.shadow);

/* 证据图：把亮/暗两态并排出图 */
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: DSF, mobile: false }, sessionId);
await sleep(400);
const evidShot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
fs.writeFileSync(join(EVID, 'composer-shadow-verify.png'), Buffer.from(evidShot.data, 'base64'));

ws.close(); child.kill();

let pass = 0;
for (const [name, ok, detail] of results) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '   [' + detail + ']' : ''));
  if (ok) pass += 1;
}
console.log('\n' + (pass === results.length ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + results.length + ')');
process.exit(pass === results.length ? 0 : 1);
