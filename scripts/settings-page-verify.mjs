#!/usr/bin/env node
/**
 * settings-page-verify.mjs — 对真 GUI 取证：官方插件管理 → codex-ui 组合包页上那张设置卡。
 *
 * 为什么必须真 GUI：座位 plugins.bundle.config 只在插件管理页存在时才出现，卡片的注入面
 * （scope / locale）由那一页的 owner 提供，夹具复刻不出来。
 *
 * 用法：
 *   1) DSH_HOME=<临时家> dsh --profile <p> --port 3098 --no-open   （终端打印带 token 的 URL）
 *   2) node scripts/settings-page-verify.mjs --url "http://127.0.0.1:3098/?token=..." [--out x.png]
 *
 * --explore 只把候选可点元素与页面文本打出来，用于定位入口，不做断言。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes('--' + name);
const TOKEN_URL = arg('url', '');
const OUT = arg('out', join(WB, 'assets', 'screenshots', 'settings-page.png'));
const CHROME = arg('chrome', '') || chromePath();
const PORT = Number(arg('cdp-port', '9341'));
const DPR = Number(arg('dpr', '1.5'));
const EXPLORE = flag('explore');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!TOKEN_URL) { console.error('缺少 --url "http://127.0.0.1:<port>/?token=..."'); process.exit(2); }

const origin = new URL(TOKEN_URL).origin;
const grab = (url) => new Promise((resolve, reject) => {
  const u = new URL(url);
  http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search }, (res) => {
    resolve((res.headers['set-cookie'] || [''])[0]);
    res.resume();
  }).on('error', reject);
});
const cookie = (await grab(TOKEN_URL)).split(';')[0];
if (!cookie.includes('=')) { console.error('拿不到 dsh-auth cookie，token 可能已过期：' + TOKEN_URL); process.exit(2); }

const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + tempDir('dsh-cdp-settings'), '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let info;
for (let i = 0; i < 60 && !info; i += 1) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) info = await r.json(); } catch { /* 未就绪 */ } if (!info) await sleep(250); }
if (!info) { console.error('Chromium 没起来：' + CHROME); process.exit(2); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const waiting = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); const fn = waiting.get(m.id); if (fn) { waiting.delete(m.id); fn(m); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq;
  waiting.set(id, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const evaluate = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
const click = async (x, y, sessionId) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: DPR, mobile: false }, sessionId);
const eq = cookie.indexOf('=');
await send('Network.setCookie', { name: cookie.slice(0, eq), value: cookie.slice(eq + 1), domain: new URL(origin).hostname, path: '/', httpOnly: true }, sessionId);
await send('Page.navigate', { url: origin + '/' }, sessionId);
await sleep(11000);

/** 按可见文本点一个元素。 */
const clickByText = async (pattern, sessionId) => evaluate('(() => {'
  + 'const re = new RegExp(' + JSON.stringify(pattern) + ');'
  + 'const els = [...document.querySelectorAll("button, a, [role=tab], [role=menuitem]")];'
  + 'const el = els.find((e) => (re.test(e.getAttribute("aria-label") || "") || re.test(e.textContent.trim())) && e.offsetParent !== null);'
  + 'if (!el) return null;'
  + 'const r = el.getBoundingClientRect();'
  + 'return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: (el.getAttribute("aria-label") || el.textContent.trim()).slice(0, 40) };'
  + '})()', sessionId);

const candidates = await evaluate('(() => [...document.querySelectorAll("button, a, [role=tab], [role=menuitem]")]'
  + '.filter((e) => e.offsetParent !== null)'
  + '.map((e) => (e.getAttribute("aria-label") || "") + " | " + e.textContent.trim().slice(0, 30))'
  + '.filter((t) => t.trim() !== "|")'
  + '.slice(0, 80))()', sessionId);
console.log('BOOT candidates: ' + JSON.stringify(candidates));

/* ── 关掉启动时的引导弹层：内测声明 → 配置 API Key，逐个点掉（有才点）── */
for (let round = 0; round < 5; round += 1) {
  const dismiss = await clickByText('^(继续|稍后配置|跳过|知道了)$', sessionId);
  if (dismiss === null) break;
  await click(dismiss.x, dismiss.y, sessionId);
  await sleep(1200);
  console.log('DISMISS ' + dismiss.text);
}

/* ── 进插件管理页 ─────────────────────────────────────────────────────── */
const entry = await clickByText('^插件$', sessionId);
if (entry === null) { console.error('FAIL 侧栏里没有「插件」入口：插件管理页在本 profile 里被停用了'); process.exit(1); }
await click(entry.x, entry.y, sessionId);
await sleep(2000);
console.log('PLUGINS page candidates: ' + JSON.stringify(await evaluate('(() => [...document.querySelectorAll("button, a, [role=tab], [role=menuitem], [role=button]")]'
  + '.filter((e) => e.offsetParent !== null)'
  + '.map((e) => (e.getAttribute("aria-label") || "") + " | " + e.textContent.trim().slice(0, 40))'
  + '.slice(0, 60))()', sessionId)));
console.log('PLUGINS text: ' + JSON.stringify((await evaluate('document.body.innerText.slice(0, 3000)', sessionId))));

if (EXPLORE) {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('SHOT ' + OUT);
  ws.close(); child.kill();
  process.exit(0);
}

/* ── 断言 ─────────────────────────────────────────────────────────────── */
let failed = 0;
const ok = (name, extra = '') => console.log('ok   ' + name + (extra ? '  ' + extra : ''));
const bad = (name, detail) => { failed += 1; console.error('FAIL ' + name + '\n     ' + detail); };
const check = (name, cond, detail) => (cond ? ok(name, typeof detail === 'string' ? detail : '') : bad(name, String(detail)));
const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
};
/** 读一个自定义属性的计算值。 */
const cssVar = (name) => evaluate('getComputedStyle(document.documentElement).getPropertyValue(' + JSON.stringify(name) + ').trim()', sessionId);
/** 按 aria-label 点一个元素。 */
const clickByLabel = async (label) => {
  const box = await evaluate('(() => { const el = document.querySelector("[aria-label=" + JSON.stringify(' + JSON.stringify(label) + ') + "]");'
    + 'if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()', sessionId);
  if (box === null) return null;
  await click(box.x, box.y, sessionId);
  return box;
};

/* 打开 codex-ui 的组合包页 */
const open = await clickByText('^查看 codex-ui$', sessionId);
if (open === null) { console.error('FAIL 已安装分组里没有 codex-ui 的「查看」入口'); process.exit(1); }
await click(open.x, open.y, sessionId);
await sleep(2500);
console.log('BUNDLE text: ' + JSON.stringify((await evaluate('document.body.innerText.slice(0, 1200)', sessionId))));

if (flag('dump')) {
  console.log('FORM HTML: ' + JSON.stringify((await evaluate('(document.querySelector(".cx-form") || {outerHTML:null}).outerHTML.slice(0, 2500)', sessionId))));
  await shot(OUT);
  ws.close(); child.kill();
  process.exit(0);
}
/** 清掉所有已有覆盖，让每次运行都从默认态开始（幂等）。 */
const resetAll = async () => {
  for (let i = 0; i < 14; i += 1) {
    const hit = await evaluate('(() => {'
      + 'const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "重置" && x.offsetParent !== null);'
      + 'if (!b) return null; const r = b.getBoundingClientRect();'
      + 'return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()', sessionId);
    if (hit === null) break;
    await click(hit.x, hit.y, sessionId);
    await sleep(700);
  }
};
const before = await evaluate('document.querySelectorAll("button") !== null && [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === "重置").length', sessionId);
if (before > 0) { console.log('RESET 清掉 ' + before + ' 处上次留下的覆盖'); await resetAll(); await sleep(800); }

const shape = JSON.parse(await evaluate('(() => {'
  + 'const rows = [...document.querySelectorAll(".cx-row")];'
  + 'return JSON.stringify({'
  + '  form: document.querySelectorAll(".cx-form").length,'
  + '  rows: rows.length,'
  + '  labels: rows.map((r) => (r.querySelector(".cx-row__label") || {}).textContent || ""),'
  + '  overrideAttr: document.documentElement.hasAttribute("data-codex-ui-theme"),'
  + '  sidebar: getComputedStyle(document.documentElement).getPropertyValue("--dsw-alias-bg-sidebar").trim(),'
  + '  link: getComputedStyle(document.documentElement).getPropertyValue("--dsw-alias-link").trim(),'
  + '}); })()', sessionId));
check('组合包页上有配置卡', shape.form === 1, JSON.stringify(shape));
check('八行：主题/强调色/背景/前景/UI 字体/代码字体/半透明侧边栏/对比度', shape.rows === 8 && shape.labels.length === 8, JSON.stringify(shape.labels));
check('默认值下不产生覆盖（无 data-codex-ui-theme）', shape.overrideAttr === false, 'attr=' + shape.overrideAttr);
check('默认强调色仍是皮肤的 #339cff', shape.link.toLowerCase() === '#339cff', 'link=' + shape.link);
await shot(OUT.replace(/\.png$/, '-default.png'));

/* 拨「半透明侧边栏」 */
const toggled = await clickByLabel('半透明侧边栏');
check('找到半透明侧边栏开关', toggled !== null, JSON.stringify(toggled));
await sleep(1500);
const afterToggle = JSON.parse(await evaluate('(() => {'
  + 'const root = document.documentElement;'
  + 'return JSON.stringify({'
  + '  overrideAttr: root.hasAttribute("data-codex-ui-theme"),'
  + '  sidebar: getComputedStyle(root).getPropertyValue("--dsw-alias-bg-sidebar").trim(),'
  + '  tag: ([...document.querySelectorAll("style")].find((s) => s.dataset.pluginCss === "codex-ui/settings-override.css") || { textContent: "" }).textContent'
  + '}); })()', sessionId));
check('开覆盖后打上 data-codex-ui-theme', afterToggle.overrideAttr === true, JSON.stringify(afterToggle).slice(0, 300));
check('侧栏填充转为半透明 rgba(255,255,255,0.72)', afterToggle.sidebar.replace(/\s/g, '') === 'rgba(255,255,255,0.72)', 'sidebar=' + afterToggle.sidebar);
check('覆盖样式表只写覆盖项', afterToggle.tag.includes('--dsw-alias-bg-sidebar') && afterToggle.tag.includes('data-codex-ui-theme'), afterToggle.tag.slice(0, 200));
await shot(OUT.replace(/\.png$/, '-translucent.png'));

/* 写一个强调色：焦点 + 输入 + 回车 */
const hexBox = await clickByLabel('强调色 hex');
check('找到强调色的十六进制输入框', hexBox !== null, JSON.stringify(hexBox));
if (hexBox !== null) {
  await send('Input.insertText', { text: '#ff0000' }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  await sleep(1500);
  const link = await cssVar('--dsw-alias-link');
  check('回车提交后强调色生效', link.toLowerCase() === '#ff0000', 'link=' + link);
  const marked = await evaluate('!!document.querySelector(".cx-row .cx-row__label span:nth-child(2)")', sessionId);
  check('该行显示「已覆盖」徽标', marked === true, 'marked=' + marked);
  await shot(OUT.replace(/\.png$/, '-accent.png'));
}

/* 刷新后覆盖仍在（设置是持久化的，不是页面内存） */
await send('Page.navigate', { url: origin + '/' }, sessionId);
await sleep(11000);
const afterReload = JSON.parse(await evaluate('(() => {'
  + 'const root = document.documentElement;'
  + 'return JSON.stringify({'
  + '  overrideAttr: root.hasAttribute("data-codex-ui-theme"),'
  + '  link: getComputedStyle(root).getPropertyValue("--dsw-alias-link").trim(),'
  + '  sidebar: getComputedStyle(root).getPropertyValue("--dsw-alias-bg-sidebar").trim(),'
  + '  skin: root.hasAttribute("data-codex-ui")'
  + '}); })()', sessionId));
check('刷新后皮肤仍生效', afterReload.skin === true, JSON.stringify(afterReload));
check('刷新后覆盖仍在（强调色 #ff0000）', afterReload.link.toLowerCase() === '#ff0000', 'link=' + afterReload.link);
check('刷新后侧栏半透明仍在', afterReload.sidebar.replace(/\s/g, '') === 'rgba(255,255,255,0.72)', 'sidebar=' + afterReload.sidebar);

console.log('\n' + (failed === 0 ? 'PASS：全部通过' : 'FAIL：' + failed + ' 项未通过'));
ws.close(); child.kill();
process.exit(failed === 0 ? 0 : 1);
