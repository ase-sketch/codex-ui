#!/usr/bin/env node
/**
 * model-picker-live.mjs — ⑲ Codex 模型选择器组件的**真 GUI** 验收。
 *
 * 为什么必须真 GUI：这个组件靠 DOM 顶替席位（隐藏宿主触发器、把自己的卡片挂到 body），
 * 且数据来自宿主的 modelDirectories。夹具里既没有 React 的席位重建，也没有真目录往返 ——
 * 那正是 0.5.0 两次判错的地方（夹具结构差一层，结论就反了）。
 *
 * 断言（7 条，全部读真实渲染结果）：
 *   1. 宿主触发器被打上标记并 display:none
 *   2. 席位里只有我们一个触发器（热重载不重复挂）
 *   3. 只挂一张卡片（不留游离节点）
 *   4. 轨的档位数与目录一致，aria-valuenow 与当前档一致
 *   5. 圆点等距（相邻间距差 ≤1px）
 *   6. **拖动中不提交**：按住划过整条轨，aria-valuenow 与列表行数都不变
 *   7. **松手后提交**：aria-valuenow 指到末档、触发器文案跟着变，且期间列表行数不变
 *      （宿主整个 selectModel 往返期间会把目录标成 selecting；拿它当重画条件就会清空卡片）
 *
 * 用法：node scripts/model-picker-live.mjs --url "<带 token 的 URL>" [--chrome <path>] [--no-shot]
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
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : dflt; };
const URL_ = arg('url');
const CHROME = arg('chrome') || chromePath();
if (!URL_) { console.error('用法：node scripts/model-picker-live.mjs --url "<带 token 的 URL>"'); process.exit(2); }
const PROBE = fs.readFileSync(join(HERE, 'fixtures', 'model-picker-live.probe.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 9365;
const PROFILE = tempDir('dsh-cdp-model-picker-live');
fs.rmSync(PROFILE, { recursive: true, force: true });
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
  '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
let info;
for (let i = 0; i < 80 && info === undefined; i += 1) {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) info = await r.json(); } catch { /* not up yet */ }
  if (info === undefined) await sleep(250);
}
if (info === undefined) { child.kill(); throw new Error('headless chrome did not start'); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'warning') {
    const text = (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (text.includes('[codex-ui]')) console.log('WARN ' + text.slice(0, 200));
  }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}, sid) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: URL_ }, sessionId);
await sleep(6000);

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.result?.value === undefined) throw new Error('probe failed: ' + JSON.stringify(r).slice(0, 400));
  return JSON.parse(r.result.value);
};

const before = await evaluate(PROBE);
console.log('STATE ' + JSON.stringify(before));
if (before.stage !== 'open') { console.error('选择器没有打开：' + before.stage); ws.close(); child.kill(); process.exit(1); }

/* 两次真拖动：先拖到最左，再拖到最右。
   两次的理由：一次只能证明「能提交」，两次才能证明「两个方向都对齐到正确档位」，
   而且先把状态归零，末档断言才不会被上一轮留下的状态糊过去。 */
const y = before.railRect.y + Math.round(before.railRect.h / 2);
const xLeft = before.railRect.x + 20;
const xRight = before.railRect.x + before.railRect.w - 20;

/** 按住 fromX，匀步滑到 toX，途中取一次样，最后松手。 */
async function drag(fromX, toX) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fromX, y, buttons: 0 }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y, button: 'left', buttons: 1, clickCount: 1 }, sessionId);
  for (let i = 1; i <= 8; i += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(fromX + ((toX - fromX) * i) / 8), y, button: 'left', buttons: 1 }, sessionId);
    await sleep(30);
  }
  const mid = await evaluate(PROBE);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y, button: 'left', buttons: 0, clickCount: 1 }, sessionId);
  await sleep(140);
  const now = await evaluate(PROBE);
  await sleep(1500);
  const settled = await evaluate(PROBE);
  return { mid, now, settled };
}

const toLeft = await drag(before.thumbX + 14, xLeft);
const toRight = await drag(xLeft, xRight);
const during = toLeft.mid;
const left = toLeft.settled;
const right = toRight.settled;
const late = toRight.settled;
console.log('DURING ' + JSON.stringify({ valuenow: during.valuenow, rows: during.rows, trigger: during.triggerText }));
console.log('LEFT   ' + JSON.stringify({ valuenow: left.valuenow, valuetext: left.valuetext, rows: left.rows, trigger: left.triggerText }));
console.log('RIGHT  ' + JSON.stringify({ valuenow: right.valuenow, valuetext: right.valuetext, rows: right.rows, selectedTick: right.selectedTick, trigger: right.triggerText }));

const gaps = before.tickCx.slice(1).map((cx, i) => cx - before.tickCx[i]);
const evenly = gaps.every((g) => Math.abs(g - gaps[0]) <= 1);
const checks = [
  ['宿主触发器被标记', before.hostMarked === true],
  ['宿主触发器 display:none', before.hostDisplay === 'none'],
  ['我们的触发器在席位里', before.ourBtn === true && before.triggerCount === 1],
  ['只挂一张卡片', before.popovers === 1],
  ['宿主自己的菜单没有被建出来', before.hostMenus === 0],
  ['轨的档位数 = 目录档位数', before.railCount === before.tickLabels.length && before.railCount >= 2],
  ['aria-valuenow 指到当前档', before.valuenow === before.selectedTick],
  ['圆点等距（间距差 ≤1px）', evenly, gaps.join(',')],
  ['拖动中不提交（valuenow 不动）', during.valuenow === before.valuenow],
  ['拖动中卡片不被清空', during.rows === before.rows],
  ['左拖到底提交到首档', left.valuenow === 0 && left.selectedTick === 0],
  ['左拖后触发器文案跟着变', left.valuetext !== '' && left.triggerText.includes(left.valuetext)],
  ['右拖到底提交到末档', right.valuenow === before.railCount - 1 && right.selectedTick === before.railCount - 1],
  ['右拖后触发器文案跟着变', right.valuetext !== '' && right.triggerText.includes(right.valuetext)],
  ['往返期间列表不清空', late.rows === before.rows && right.rows === before.rows],
];
let failed = 0;
console.log('');
for (const [label, ok, extra] of checks) {
  if (!ok) failed += 1;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label.padEnd(30) + (extra === undefined ? '' : ' ' + extra));
}
console.log('');
console.log(failed === 0 ? 'RESULT PASS  ' + checks.length + '/' + checks.length : 'RESULT FAIL  ' + (checks.length - failed) + '/' + checks.length);

if (!process.argv.includes('--no-shot')) {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(join(EVID, 'model-picker-live.png'), Buffer.from(shot.data, 'base64'));
  console.log('WROTE ' + join(EVID, 'model-picker-live.png'));
}
ws.close(); child.kill();
process.exit(failed === 0 ? 0 : 1);
