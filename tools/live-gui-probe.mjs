#!/usr/bin/env node
/**
 * live-gui-probe.mjs — 对真实 GUI（dsh web 实例）取证：DOM 结构、计算样式、悬停态、
 * 模型菜单 pending 时序，并出图。
 *
 * 为什么要有这一支：其它 *-verify.mjs 都是「从 app.asar 取真实 CSS + 按渲染代码复刻 DOM」
 * 的夹具，夹具里没有标题栏条、没有真的 AppFrame 网格、也没有真的 RPC。阴影层、分界线悬停、
 * pending 反馈这三类改动只能在真 GUI 上验收。
 *
 * 用法：
 *   1) dsh --profile web --port 3099 --no-open    （终端会打印带 token 的 URL）
 *   2) node tools/live-gui-probe.mjs --url "http://127.0.0.1:3099/?token=..." [--out evidence/live-gui.png] [--dpr 1.5]
 *
 * token 可反复使用但有存活期（实测约半小时后 401）；Node 的 fetch 不自动带 cookie，
 * 本探针显式取 Set-Cookie 再经 CDP 注入。401 时重起一次 dsh web 换新 token 即可。
 *
 * 期望值（2026-09-26 实测基线，DPR 2 / 1280x800 / 侧栏 280px / 标题栏 40px）：
 *   centerShadow : rgba(13,13,13,.12) 0 0 0 1px, rgba(13,13,13,.05) 0 0 24px
 *   上沿纵切      : y=40..77 由 238,244,249 渐变到 233,239,244；y=78 发丝线 205,211,215；y=80 起纯白
 *   左分界线柄    : 静默 opacity 0 / scale 1 0.35；悬停 opacity 1 / scale 1 / 宽 2px
 *   模型菜单      : 点档位后 ~60ms 内 aria-busy=true、整列 disabled、勾选乐观前移、
 *                   转圈 codex-ui-spin 在跑；~1.1s 后菜单关闭
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const TOKEN_URL = arg('url', '');
const OUT = arg('out', join(WB, 'evidence', 'live-gui.png'));
const CHROME = arg('chrome', 'C:/Users/Zs/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe');
const PORT = Number(arg('cdp-port', '9340'));
/* 设备像素比：默认 2；对 Windows 桌面壳做发丝线粗细对账时用 1.5（与实机 device-scale-factor 一致）。 */
const DPR = Number(arg('dpr', '2'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!TOKEN_URL) { console.error('缺少 --url "http://127.0.0.1:<port>/?token=..."'); process.exit(2); }

/* ── 用 token 换 cookie（303 + Set-Cookie）──────────────────────────────
   fetch 的 redirect:'manual' 在 Node 里返回 opaque 响应、读不到 Set-Cookie，故直接走 http。 */
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

/* ── 起 headless Chromium 并接 CDP ────────────────────────────────────── */
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'dsh-cdp-live-gui'), '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--window-size=1280,800', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
const evaluate = async (expression, sessionId) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: DPR, mobile: false }, sessionId);
const eq = cookie.indexOf('=');
await send('Network.setCookie', { name: cookie.slice(0, eq), value: cookie.slice(eq + 1), domain: new URL(origin).hostname, path: '/', httpOnly: true }, sessionId);
await send('Page.navigate', { url: origin + '/' }, sessionId);
await sleep(12000);
/* 桌面壳标记由 preload 在 document-start 打；浏览器形态没有 preload，这里补打一次，
   CSS 层等价 —— 这是本探针能在浏览器里验 Windows 桌面壳阴影层的前提。 */
await evaluate('document.documentElement.setAttribute("data-windows-titlebar","");document.documentElement.setAttribute("data-platform","win32");'
  + 'document.documentElement.style.setProperty("--dsh-windows-titlebar-height","40px");', sessionId);
await sleep(1000);

const FRAME = '(() => {'
  + 'const cs = (el, p) => (el ? getComputedStyle(el, p) : null);'
  + 'const center = document.querySelector("div:has(> [data-slot=main])");'
  + 'const side = document.querySelector("div:has(> [data-slot=sidebar])");'
  + 'const read = (el) => el ? { opacity: cs(el, "::before").opacity, width: cs(el, "::before").width, scale: cs(el, "::before").scale, grad: /linear-gradient/.test(cs(el, "::before").backgroundImage) } : null;'
  + 'const panel = document.querySelector("[data-sidebar-right-panel]");'
  + 'return JSON.stringify({'
  + '  centerShadow: cs(center).boxShadow,'
  + '  centerRadius: cs(center).borderTopLeftRadius,'
  + '  sidebarBorder: cs(side).borderRightWidth + " " + cs(side).borderRightColor,'
  + '  panelShadow: panel ? cs(panel).boxShadow : null,'
  + '  handleLeft: read(document.querySelector("[data-side=sidebar]")),'
  + '  handleRight: read(document.querySelector("[data-side=rightbar]")),'
  + '}); })()';
console.log('IDLE  ' + (await evaluate(FRAME, sessionId)));
if (await evaluate('!!document.querySelector("[data-side=sidebar]")', sessionId)) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 280, y: 400 }, sessionId);
  await sleep(600);
  console.log('HOVER ' + (await evaluate(FRAME, sessionId)));
}

/* ── 打开右侧边栏，量面板两条边 ───────────────────────────────────────── */
const openRight = await evaluate('(() => { const b = [...document.querySelectorAll("button")].find(x => x.getAttribute("aria-label") === "打开右侧边栏"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()', sessionId);
if (openRight) {
  await click(openRight.x, openRight.y, sessionId);
  await sleep(1200);
  console.log('PANEL ' + (await evaluate(FRAME, sessionId)));
} else {
  console.log('SKIP 右侧边栏：找不到「打开右侧边栏」按钮');
}

/* ── 模型菜单 pending 时序 ────────────────────────────────────────────── */
const SLOT_BTN = '([...document.querySelectorAll("[data-slot]")]'
  + '.find(e => e.getAttribute("data-slot") === "conversation.input.model")'
  + ' || { querySelector: () => null }).querySelector("button")';
let trigger = null;
for (let i = 0; i < 20 && !trigger; i += 1) {
  trigger = await evaluate('(() => { const b = ' + SLOT_BTN + '; if (!b) return null;'
    + 'const r = b.getBoundingClientRect(); if (!r.width) return null;'
    + 'return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: b.textContent }; })()', sessionId);
  if (!trigger) await sleep(1000);
}
if (!trigger) console.log('SKIP 模型菜单：composer 的 conversation.input.model 槽没出现（会话未就绪）');
if (trigger) {
  await click(trigger.x, trigger.y, sessionId);
  await sleep(500);
  const cell = await evaluate('(() => { const m = document.querySelector("body > div[role=menu]"); if (!m) return null;'
    + 'const b = [...m.querySelectorAll("button")].find(x => /推理|Reasoning/.test(x.textContent)); if (!b) return null;'
    + 'const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()', sessionId);
  if (cell) {
    await click(cell.x, cell.y, sessionId);
    await sleep(700);
    const options = await evaluate('(() => [...document.querySelectorAll("body > div[role=menu] button[role=menuitemradio]")]'
      + '.map(b => ({ text: b.textContent.trim(), checked: b.getAttribute("aria-checked") === "true" })))()', sessionId);
    const pick = options.find((o) => !o.checked);
    if (pick) {
      const box = await evaluate('(() => { const b = [...document.querySelectorAll("body > div[role=menu] button[role=menuitemradio]")]'
        + '.find(x => x.textContent.trim() === ' + JSON.stringify(pick.text) + '); const r = b.getBoundingClientRect();'
        + 'return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()', sessionId);
      await evaluate('window.__t0 = performance.now()', sessionId);
      await click(box.x, box.y, sessionId);
      for (let i = 0; i < 6; i += 1) {
        await sleep(60);
        const snap = await evaluate('(() => {'
          + 'const m = document.querySelector("body > div[role=menu]");'
          + 'const row = m ? m.querySelector("button[role=menuitemradio][aria-checked=true]") : null;'
          + 'const cellEl = row ? row.lastElementChild : null;'
          + 'const spin = cellEl ? getComputedStyle(cellEl, "::after") : null;'
          + 'const host = cellEl ? cellEl.querySelector("svg") : null;'
          + 'const b = ' + SLOT_BTN + ';'
          + 'return {'
          + '  t: Math.round(performance.now() - window.__t0),'
          + '  menu: !!m, busy: m ? m.getAttribute("aria-busy") : "-",'
          + '  disabled: m ? m.querySelectorAll("button[role=menuitemradio]:disabled").length : 0,'
          + '  spinner: spin && spin.content !== "none" ? spin.animationName + " " + spin.width : "none",'
          + '  hostCheck: host ? getComputedStyle(host).visibility : "-",'
          + '  cursor: row ? getComputedStyle(row).cursor : "-",'
          + '  trigger: b ? b.textContent : "-",'
          + '}; })()', sessionId);
        console.log('PENDING ' + JSON.stringify(snap));
        if (!snap.menu) break;
      }
    }
  }
}

fs.mkdirSync(dirname(OUT), { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('SHOT ' + OUT);
ws.close(); child.kill();
