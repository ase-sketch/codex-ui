#!/usr/bin/env node
/**
 * theme-flash-probe.mjs — 抓主题切换时那一帧「闪」。
 *
 * 为什么要有它：主题切换的闪屏是 1–3 帧的事（~16–50ms），肉眼看到、截图拍不到、
 * 断言也抓不住。这里在页面里挂一个 requestAnimationFrame 采样器，按帧记录
 * 画布相关的计算色与主题标记，再在 Node 侧找出「既不是起点色、也不是终点色」的中间帧。
 *
 *   node scripts/theme-flash-probe.mjs --url "http://127.0.0.1:3098/?token=..." [--frames 180]
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const TOKEN_URL = arg('url', '');
const CHROME = arg('chrome', '') || chromePath();
const PORT = Number(arg('cdp-port', '9342'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!TOKEN_URL) { console.error('缺少 --url'); process.exit(2); }

const origin = new URL(TOKEN_URL).origin;
const grab = (url) => new Promise((resolve, reject) => {
  const u = new URL(url);
  http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search }, (res) => { resolve((res.headers['set-cookie'] || [''])[0]); res.resume(); }).on('error', reject);
});
const cookie = (await grab(TOKEN_URL)).split(';')[0];
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + tempDir('dsh-cdp-flash'),
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let info;
for (let i = 0; i < 60 && !info; i += 1) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) info = await r.json(); } catch { /* 等 */ } if (!info) await sleep(250); }
if (!info) { console.error('Chromium 没起来'); process.exit(2); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const waiting = new Map();
/** 主题发布序列：宿主每次 theme/change 都会被本插件打一行日志（临时埋点），这里全部收集起来。 */
const themeLog = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ');
    if (text.includes('[codex-ui][probe]')) themeLog.push(text.replace('[codex-ui][probe] ', ''));
  }
  const fn = waiting.get(m.id);
  if (fn) { waiting.delete(m.id); fn(m); }
};
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
const clickByText = async (pattern, sessionId) => evaluate('(() => {'
  + 'const re = new RegExp(' + JSON.stringify(pattern) + ');'
  + 'const els = [...document.querySelectorAll("button, a, [role=tab], [role=menuitem], [role=button]")];'
  + 'const el = els.find((e) => (re.test(e.getAttribute("aria-label") || "") || re.test(e.textContent.trim())) && e.offsetParent !== null);'
  + 'if (!el) return null; const r = el.getBoundingClientRect();'
  + 'return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: (el.getAttribute("aria-label") || el.textContent.trim()).slice(0, 30) }; })()', sessionId);

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
const eq = cookie.indexOf('=');
await send('Network.setCookie', { name: cookie.slice(0, eq), value: cookie.slice(eq + 1), domain: new URL(origin).hostname, path: '/', httpOnly: true }, sessionId);
await send('Page.navigate', { url: origin + '/' }, sessionId);
await sleep(11000);
for (let i = 0; i < 4; i += 1) { const d = await clickByText('^(继续|稍后配置|跳过|知道了)$', sessionId); if (d === null) break; await click(d.x, d.y, sessionId); await sleep(1200); }
const entry = await clickByText('^插件$', sessionId);
if (entry !== null) { await click(entry.x, entry.y, sessionId); await sleep(2000); }
const open = await clickByText('^查看 codex-ui$', sessionId);
if (open === null) { console.error('找不到 codex-ui 入口'); process.exit(1); }
await click(open.x, open.y, sessionId);
await sleep(3000);

/**
 * 采样器：每帧记录「**实际画在屏幕上的那一层**」。
 * 只看元素的 backgroundColor 不够 —— 大多数元素是透明的，真正被看到的颜色要沿祖先往上
 * 找第一个不透明的底色；主题切换的闪，正是这种「有效底色」在某一帧翻错。
 */
const SAMPLER = `(() => {
  /** 沿祖先找第一个不透明底色；返回 { color, from } 便于定位是哪一层。 */
  const backdrop = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el !== null && el !== document.documentElement.parentElement) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(bg);
      if (m !== null && (m[4] === undefined || Number(m[4]) > 0.99)) {
        return m[1] + ',' + m[2] + ',' + m[3] + '@' + (el.getAttribute('data-slot') || el.className.toString().slice(0, 20) || el.tagName);
      }
      el = el.parentElement;
    }
    return 'none';
  };
  const pts = [[640, 450], [1400, 450], [140, 700]];
  window.__flash = [];
  const loop = () => {
    const frame = {
      t: Math.round(performance.now()),
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      scheme: getComputedStyle(document.documentElement).colorScheme,
      override: document.documentElement.hasAttribute('data-codex-ui-theme'),
      skin: document.documentElement.hasAttribute('data-codex-ui'),
      body: getComputedStyle(document.body).backgroundColor,
      html: getComputedStyle(document.documentElement).backgroundColor,
      card: document.querySelectorAll('.cx-form').length,
      p0: backdrop(pts[0][0], pts[0][1]),
      p1: backdrop(pts[1][0], pts[1][1]),
      p2: backdrop(pts[2][0], pts[2][1]),
    };
    window.__flash.push(frame);
    if (window.__flash.length < 20000) window.__flashRaf = requestAnimationFrame(loop);
  };
  loop();
  return true;
})()`;
await evaluate(SAMPLER, sessionId);

/** 一次操作：清空采样 → 点 → 等落定 → 回收这一段。 */
const capture = async (act, settle = 1300) => {
  await evaluate('window.__flash = []', sessionId);
  const box = await act();
  if (box === null) return null;
  await click(box.x, box.y, sessionId);
  await sleep(settle);
  return evaluate('(() => { const f = window.__flash; window.__flash = []; return f; })()', sessionId);
};
const tap = (label) => async () => clickByText('^' + label + '$', sessionId);
const spot = (f) => f.p0 + ' | ' + f.p1 + ' | ' + f.p2;
/**
 * 异常帧 = 有效底色既不是切换前的值、也不是切换后的稳定值。
 * 这正是肉眼看到的「闪」：某一帧画出来的东西不属于任何一端。
 */
/** 把逐帧的深浅状态压成连续段，例：L×12 → D×68 —— 段数多于 2 就是「回打」（黑→白→黑）。 */
const runsOf = (frames) => {
  const runs = [];
  for (const f of frames) {
    const key = f.dark ? 'D' : 'L';
    if (runs.length > 0 && runs[runs.length - 1][0] === key) runs[runs.length - 1][1] += 1;
    else runs.push([key, 1]);
  }
  return runs;
};
const analyse = (name, frames) => {
  if (frames === null || frames.length === 0) { console.log(name + '：没采到帧'); return 0; }
  const runs = runsOf(frames);
  console.log('   ' + name + ' 深浅序列 ' + runs.map(([k, n]) => k + '×' + n).join(' → ') + (runs.length > 2 ? '   ← 回打！' : ''));
  const head = frames[0];
  const last = frames[frames.length - 1];
  const bad = frames.filter((f, i) => i > 0 && i < frames.length - 1 && spot(f) !== spot(head) && spot(f) !== spot(last));
  console.log(name + '：帧 ' + String(frames.length).padStart(3) + '  异常 ' + bad.length + (bad.length === 0 ? '' : '  ' + spot(head) + ' → ' + spot(last)));
  for (const f of bad.slice(0, 5)) console.log('     FLASH t=' + f.t + ' dark=' + f.dark + ' scheme=' + f.scheme + '  ' + spot(f));
  return bad.length;
};

/* 起始态固定亮色，然后来回切 4 趟：偶发闪屏要靠重复切换才抓得到。 */
const seg = await evaluate('(() => { const t = document.querySelector("[role=tab][aria-selected=true]"); return t === null ? null : t.textContent.trim(); })()', sessionId);
if (seg !== '亮色') { const b = await clickByText('^亮色$', sessionId); if (b !== null) { await click(b.x, b.y, sessionId); await sleep(1500); } }

let anomalies = 0;
let captured = 0;
const plan = [['深色', tap('深色')], ['亮色', tap('亮色')], ['深色', tap('深色')], ['亮色', tap('亮色')], ['深色', tap('深色')], ['亮色', tap('亮色')]];
themeLog.push('=== 起始 ' + seg + ' ===');
for (const [label, act] of plan) {
  themeLog.push('--- 点 ' + label + ' ---');
  const frames = await capture(act);
  if (frames === null) { console.log('切换 ' + label + '：找不到分段'); break; }
  captured += 1;
  anomalies += analyse('主题 → ' + label, frames);
}

/* 页面切换也采一遍：设置页 ↔ 会话页来回走。 */
const pageFrames = await capture(async () => clickByText('^新会话$', sessionId), 1600);
anomalies += analyse('切到会话页', pageFrames);
const backFrames = await capture(async () => clickByText('^插件$', sessionId), 1800);
anomalies += analyse('切回插件页', backFrames);
const reopenFrames = await capture(async () => clickByText('^查看 codex-ui$', sessionId), 2000);
anomalies += analyse('打开组合包页', reopenFrames);

const total = await evaluate('(() => { cancelAnimationFrame(window.__flashRaf); return window.__flash.length; })()', sessionId);
console.log('\n主题发布序列（宿主 theme/change 逐次）：');
for (const line of themeLog) console.log('  ' + line);
console.log('\n采样段 ' + (captured + 3) + ' 段，异常帧合计 ' + anomalies + '，探测器仍在跑的帧 ' + total);
console.log(anomalies === 0 ? 'RESULT 未捕捉到中间态帧' : 'RESULT 捕捉到 ' + anomalies + ' 个中间态帧');
ws.close(); child.kill();
