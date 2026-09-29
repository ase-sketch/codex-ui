/**
 * cdp.mjs — 无头 Chromium + Chrome DevTools Protocol，只用 Node 自带的 WebSocket / zlib。
 *
 *   const browser = await launch();
 *   const page = await browser.newPage({ width: 1100, height: 700, dpr: 2 });
 *   await page.setContent(html);
 *   const value = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).color, '.x');
 *   await browser.close();
 *
 * 端口：--remote-debugging-port=0 交给系统挑空闲端口，从 profile 里的 DevToolsActivePort 读回来 ——
 * 不占任何固定端口，多个进程可以同时跑。profile 是一次性的临时目录，关浏览器时删掉。
 * evaluate 收真函数：在页面里执行的是 `(${fn})(...args)`，所以函数体不能引用外层变量，要用的值走参数。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { chromePath } from './host.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 起浏览器并接上 CDP。 */
export async function launch({ chrome = chromePath() } = {}) {
  const profile = fs.mkdtempSync(join(tmpdir(), 'codex-ui-cdp-'));
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let endpoint = null;
  for (let i = 0; i < 100 && endpoint === null && child.exitCode === null; i += 1) {
    await sleep(100);
    try {
      const [port, path] = fs.readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n').map((s) => s.trim());
      if (port && path) endpoint = 'ws://127.0.0.1:' + port + path;
    } catch { /* 还没写出来 */ }
  }
  if (endpoint === null) {
    child.kill();
    throw new Error('浏览器没起来：' + chrome);
  }
  const ws = new WebSocket(endpoint);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('连不上 ' + endpoint)); });

  let seq = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
      const done = waiting.get(msg.id);
      waiting.delete(msg.id);
      done?.(msg);
    } else {
      for (const fn of listeners) fn(msg);
    }
  };
  /** 每条命令 60s 没回音就报错，卡死的页面不会把整个进程挂住。 */
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); rej(new Error(method + ': 60s 没有回应')); }, 60000).unref();
    waiting.set(id, (m) => { clearTimeout(timer); if (m.error) rej(new Error(method + ': ' + JSON.stringify(m.error))); else res(m.result); });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  /* 进程被中断时别留下孤儿浏览器。 */
  const orphan = () => child.kill();
  process.once('exit', orphan);

  let pages = 0;
  return {
    /** 开一个新页签，视口与设备像素比由 Emulation 固定（与窗口大小无关）。 */
    async newPage({ width = 1280, height = 800, dpr = 2 } = {}) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const page = createPage(send, sessionId, listeners, join(profile, 'page-' + (pages += 1) + '.html'));
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.viewport(width, height, dpr);
      return page;
    },
    async close() {
      process.removeListener('exit', orphan);
      await Promise.race([send('Browser.close').catch(() => {}), sleep(2000)]);
      ws.close();
      if (child.exitCode === null) await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)]);
      if (child.exitCode === null) child.kill();
      for (let i = 0; i < 10; i += 1) {
        try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(200); }
      }
    },
  };
}

function createPage(browserSend, sessionId, listeners, htmlFile) {
  const send = (method, params) => browserSend(method, params, sessionId);
  /** 页面里的未捕获异常与 console.error / warn，调用方自己决定要不要断言。 */
  const errors = [];
  const logs = [];
  listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(String(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 300));
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push({ type: msg.params.type, text: msg.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ') });
    }
  });
  const once = (method) => new Promise((resolve) => {
    const fn = (msg) => { if (msg.sessionId === sessionId && msg.method === method) { listeners.delete(fn); resolve(msg.params); } };
    listeners.add(fn);
  });
  const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? (buttons ? 'left' : 'none') : 'left', buttons, clickCount: 1,
  });

  const page = {
    send,
    errors,
    logs,
    viewport: (width, height, dpr) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false }),
    /** 在页面里执行一个函数（或表达式字符串），返回可序列化的结果；页面里抛错就在这里抛。 */
    async evaluate(fn, ...args) {
      const expression = typeof fn === 'function' ? '(' + fn + ')(...' + JSON.stringify(args) + ')' : fn;
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面里抛错：' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    /** 导航并等 load 事件。 */
    async goto(url) {
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(30000)]);
    },
    /** 把一段 HTML 写进临时文件再打开（file:// 页面，样式与脚本都内联）。 */
    async setContent(html, settle = 300) {
      fs.writeFileSync(htmlFile, html);
      await page.goto(pathToFileURL(htmlFile).href);
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      await sleep(settle);
    },
    /** 等页面里某个条件成立（函数返回真值），超时返回 null。 */
    async waitFor(fn, { timeout = 20000, interval = 250 } = {}, ...args) {
      for (const end = Date.now() + timeout; Date.now() < end; await sleep(interval)) {
        const value = await page.evaluate(fn, ...args).catch(() => null);
        if (value) return value;
      }
      return null;
    },
    /** 下一帧（两次 rAF）之后。 */
    frame: () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))),
    mouse,
    move: (x, y, buttons = 0) => mouse('mouseMoved', x, y, buttons),
    async click(x, y) {
      await mouse('mouseMoved', x, y);
      await mouse('mousePressed', x, y, 1);
      await mouse('mouseReleased', x, y, 0);
    },
    /** 按一次键：key 取 KeyboardEvent.key，keyCode 为 Windows 虚拟键码。 */
    async key(key, keyCode) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: keyCode });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode });
    },
    /** 模拟媒体特性，例 { 'prefers-reduced-motion': 'reduce' }。 */
    media: (features) => send('Emulation.setEmulatedMedia', { features: Object.entries(features).map(([name, value]) => ({ name, value })) }),
    /** 元素中心点（视口坐标，取整）；不存在或没有尺寸返回 null。 */
    center: (selector) => page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const r = el === null ? null : el.getBoundingClientRect();
      return r === null || r.width === 0 ? null : [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
    }, selector),
    /** 截图（PNG Buffer）；给了 path 就同时写盘。clip 为 CSS 像素 { x, y, width, height, scale }。
        后台页签不出帧，截图会一直等 —— 先提到前台。 */
    async screenshot({ clip, path } = {}) {
      await send('Page.bringToFront');
      const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
      const png = Buffer.from(data, 'base64');
      if (path) fs.writeFileSync(path, png);
      return png;
    },
    /** 截图并解码成像素（设备像素坐标）。 */
    pixels: async (clip) => decodePng(await page.screenshot({ clip })),
  };
  return page;
}

/**
 * 解 Chromium 截出来的 PNG（8 位、非隔行、RGB / RGBA），只用 zlib + 标准反滤波。
 * @returns {{ w: number, h: number, ch: number, data: Buffer, rgb: (x: number, y: number) => number[] }}
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let off = 8;
  let w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9];
      if (data[12] !== 0) throw new Error('不支持隔行 PNG');
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  const ch = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (depth !== 8 || ch === 0) throw new Error('不支持的 PNG 格式：位深 ' + depth + ' 色彩类型 ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  for (let y = 0, p = 0; y < h; y += 1) {
    const filter = raw[p];
    const line = raw.subarray(p + 1, p + 1 + stride);
    p += 1 + stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev === null ? 0 : prev[x];
      const c = prev === null || x < ch ? 0 : prev[x - ch];
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('未知的 PNG 滤波 ' + filter);
      cur[x] = (line[x] + pred) & 0xff;
    }
  }
  return { w, h, ch, data: out, rgb: (x, y) => { const o = (y * w + x) * ch; return [out[o], out[o + 1], out[o + 2]]; } };
}

/* ── 真 GUI：token 登录、首启弹层、按文字点 ─────────────────────────── */

/**
 * 用 dsh web 打印的 token URL 换 dsh-auth cookie（303 + Set-Cookie），注入后打开首页。
 * Node 的 fetch 在 redirect:'manual' 下读不到 Set-Cookie，所以直接走 http。token 有存活期，401 就重启一次 dsh 换新的。
 */
export async function login(page, tokenUrl) {
  const url = new URL(tokenUrl);
  const setCookie = await new Promise((resolve, reject) => {
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname + url.search }, (res) => {
      resolve((res.headers['set-cookie'] ?? [''])[0]);
      res.resume();
    }).on('error', reject);
  });
  const pair = setCookie.split(';')[0];
  const eq = pair.indexOf('=');
  if (eq <= 0) throw new Error('拿不到 dsh-auth cookie，token 可能已过期：' + tokenUrl);
  await page.send('Network.enable');
  await page.send('Network.setCookie', { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: url.hostname, path: '/', httpOnly: true });
  await openHome(page, url.origin);
  return url.origin;
}

/** 打开首页并等应用骨架出来（侧栏槽位出现），再给插件与首启弹层一点时间。 */
export async function openHome(page, origin) {
  await page.goto(origin + '/');
  await page.waitFor(() => document.querySelector('[data-slot="sidebar"]') !== null, { timeout: 30000 });
  await sleep(2000);
}

/** 按可见文字（或 aria-label）找可点元素的中心点；pattern 为正则源码。 */
export function findByText(page, pattern, selector = 'button, a, [role=tab], [role=menuitem], [role=button], [role=switch]') {
  return page.evaluate((source, sel) => {
    const re = new RegExp(source);
    const el = [...document.querySelectorAll(sel)]
      .find((e) => (re.test(e.getAttribute('aria-label') ?? '') || re.test(e.textContent.trim())) && e.offsetParent !== null);
    if (el === undefined) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: (el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 40) };
  }, pattern, selector);
}

/** 按文字点一下（真鼠标事件）；找不到返回 null。 */
export async function clickByText(page, pattern, selector) {
  const box = await findByText(page, pattern, selector);
  if (box !== null) await page.click(box.x, box.y);
  return box;
}

/** 关掉首启引导弹层（内测声明 → 配置 API Key）；每次加载都会再出现。返回关掉的按钮文字。 */
export async function dismissOnboarding(page) {
  const closed = [];
  for (let round = 0; round < 5; round += 1) {
    const box = await clickByText(page, '^(继续|稍后配置|跳过|知道了|Continue|Later|Skip)$', 'button');
    if (box === null) break;
    closed.push(box.text);
    await sleep(1200);
  }
  return closed;
}
