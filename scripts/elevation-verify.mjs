#!/usr/bin/env node
/**
 * elevation-verify.mjs — ⑲ --dsw-elevation-* 令牌与 Codex 源码对账。
 *
 * 判据来源：Codex 桌面端 26.924.2738.0 的 resources/app.asar @67930525 起逐字：
 *   --elevation-stroke:        0 0 0 .5px var(--color-border-strong)
 *   --elevation-stroke-subtle: 0 0 0 .5px rgb(from var(--color-border-strong) r g b / .04)  （暗色 .06）
 *   --elevation-prominent:     var(--elevation-stroke), 0 3px 7.5px #0000000a, 0 0 20px #0000000d
 *   --elevation-sidebar:       var(--elevation-stroke), 0 3px 7.5px #00000008, 0 0 16px #00000005
 *
 * 本夹具量四件事：
 *   ① 四个令牌在亮/暗两套下都解析得出来；
 *   ② --dsw-elevation-prominent 与 Codex 逐字一致（几何 + 两层 alpha）；
 *   ③ 亮暗的 prominent **必须相同** —— Codex 只在 :root 声明一次、没有暗色变体；
 *   ④ --dsw-elevation-panel 仍等于 stroke（本皮肤的分层选择，防误改）。
 * 用法：node scripts/elevation-verify.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, tempDir } from './host-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const EVID = join(WB, 'assets', 'screenshots');
const theme = fs.readFileSync(join(WB, 'theme.css'), 'utf8');

/* 舞台上放一个"菜单面板"，直接吃 --dsw-elevation-prominent；亮暗各一个。 */
const page = '<!doctype html><html data-codex-ui><head><meta charset="utf-8">'
  + '<style>' + theme + '</style>'
  + '<style>body{margin:0;font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}'
  + '.stage{padding:60px 40px;background:var(--dsw-alias-bg-base)}'
  + '.menu{width:320px;padding:8px;border-radius:var(--dsw-radius-menu);'
  + 'background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent)}'
  + '.row{padding:6px 8px;border-radius:var(--dsw-radius-s);color:var(--dsw-alias-label-primary)}'
  + '</style></head><body>'
  + '<div class="stage"><div class="menu" id="m">'
  + '<div class="row">菜单面板 · box-shadow: var(--dsw-elevation-prominent)</div>'
  + '<div class="row">Gpt-5.2-Codex High</div><div class="row">DeepSeek V4.1 Flash High</div>'
  + '</div></div></body></html>';

fs.mkdirSync(join(tmpdir(), 'codex-ui-fixtures'), { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const htmlPath = join(tmpdir(), 'codex-ui-fixtures', 'elevation-verify.html');
fs.writeFileSync(htmlPath, page);

const PORT = 9355;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = tempDir('dsh-cdp-elev');
fs.rmSync(PROFILE, { recursive: true, force: true });
const child = spawn(chromePath(), ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=460,520', 'about:blank'], { stdio: 'ignore' });
let info; for (let i = 0; i < 60 && !info; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) info = await r.json(); } catch {} if (!info) await sleep(250); }
if (!info) { child.kill(); throw new Error('headless chrome did not start'); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sid) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result.value;

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 460, height: 520, deviceScaleFactor: 2, mobile: false }, sessionId);
await send('Page.navigate', { url: 'file:///' + htmlPath.replaceAll('\\', '/') + '?v=' + Date.now() }, sessionId);
await sleep(1400);

const TOKENS = '(() => { const cs = getComputedStyle(document.body);'
  + 'const g = (n) => cs.getPropertyValue(n).trim();'
  + 'const menu = document.getElementById("m");'
  + 'return JSON.stringify({ stroke: g("--dsw-elevation-stroke"), panel: g("--dsw-elevation-panel"),'
  + ' prominent: g("--dsw-elevation-prominent"), soft: g("--dsw-elevation-soft"),'
  + ' menuShadow: getComputedStyle(menu).boxShadow,'
  + ' menuFill: getComputedStyle(menu).backgroundColor }); })()';

const light = JSON.parse(await evalJs(TOKENS));
await evalJs('document.body.setAttribute("data-ds-dark-theme",""); "ok"');
await sleep(400);
const dark = JSON.parse(await evalJs(TOKENS));

console.log('LIGHT stroke    ' + light.stroke);
console.log('LIGHT prominent ' + light.prominent);
console.log('LIGHT menu calc ' + light.menuShadow);
console.log('DARK  stroke    ' + dark.stroke);
console.log('DARK  prominent ' + dark.prominent);
console.log('DARK  menu calc ' + dark.menuShadow);

/* Codex 逐字：var(--elevation-stroke), 0 3px 7.5px #0000000a, 0 0 20px #0000000d
   计算值里 var 会被替换掉，两层 alpha 归一为 0.039 / 0.051（#0a=3.92%、#0d=5.10%）。 */
const layers = (s) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
const hasGeom = (s, a, b, c, d) => {
  const m = s.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
  return !!m && [+m[1], +m[2], +m[3], +m[4]].every((v, i) => Math.abs(v - [a, b, c, d][i]) < 0.01);
};
const alphaNear = (s, want, tol = 0.006) => {
  const m = s.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  return !!m && Math.abs(parseFloat(m[1]) - want) <= tol;
};

const results = [];
const check = (n, ok, d) => results.push([n, ok, d]);

/* 几何与 alpha 一律读**计算值**（menuShadow）：自定义属性的字面值里 0 spread 会被省略、
   颜色是 hex 不是 rgba，直接断言字面值会因记法差异误判。 */
for (const [tag, t] of [['亮', light], ['暗', dark]]) {
  const L = layers(t.prominent);
  const C = layers(t.menuShadow);
  check(tag + '色 --dsw-elevation-prominent 为三层', L.length === 3, L.length + ' 层');
  check(tag + '色 层2 几何 = 0 3px 7.5px 0（Codex 逐字）', hasGeom(C[1] ?? '', 0, 3, 7.5, 0), (C[1] ?? '').slice(0, 60));
  check(tag + '色 层2 alpha = 3.92%（#0000000a）', alphaNear(C[1] ?? '', 0.039), (C[1] ?? '').slice(0, 60));
  check(tag + '色 层3 几何 = 0 0 20px 0（Codex 逐字）', hasGeom(C[2] ?? '', 0, 0, 20, 0), (C[2] ?? '').slice(0, 60));
  check(tag + '色 层3 alpha = 5.10%（#0000000d）', alphaNear(C[2] ?? '', 0.051), (C[2] ?? '').slice(0, 60));
  check(tag + '色 层1 = --dsw-elevation-stroke', L[0] === t.stroke, (L[0] ?? '').slice(0, 60));
  check(tag + '色 --dsw-elevation-panel 仍等于 stroke', t.panel === t.stroke, t.panel);
  check(tag + '色 菜单面板确实吃到 prominent', t.menuShadow !== 'none' && t.menuShadow.length > 20, t.menuShadow.slice(0, 70));
}
/* Codex 只在 :root 声明 --elevation-prominent 一次、没有暗色覆盖 —— 所以**第 2、3 层**必须
   亮暗逐字相同。（第 1 层是 var(--elevation-stroke)，它本来就随主题反相，不参与这条比较。） */
const lit = layers(light.prominent), dk = layers(dark.prominent);
check('亮暗 层2 同值（Codex 无暗色变体）', lit[1] === dk[1], lit[1] + ' | ' + dk[1]);
check('亮暗 层3 同值（Codex 无暗色变体）', lit[2] === dk[2], lit[2] + ' | ' + dk[2]);
check('亮暗 stroke 不同值（描边随主题反相）', light.stroke !== dark.stroke, light.stroke + ' | ' + dark.stroke);

/* 证据图：暗色态 */
const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
fs.writeFileSync(join(EVID, 'elevation-verify.png'), Buffer.from(shot.data, 'base64'));
ws.close(); child.kill();

let pass = 0;
for (const [n, ok, d] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '   [' + d + ']' : '')); if (ok) pass += 1; }
console.log('\n' + (pass === results.length ? 'ALL PASS' : 'FAILED') + ' (' + pass + '/' + results.length + ')');
process.exit(pass === results.length ? 0 : 1);
