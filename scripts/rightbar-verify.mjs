#!/usr/bin/env node
/**
 * rightbar-verify.mjs — 右栏（文件/浏览器/终端）三件套的计算样式断言 + 出图：
 *   ① 面板顶沿边框阴影（与中列同源 elevation-soft）
 *   ② 左边框淡细（压掉宿主 dockkit 的 .5px l4，边界只剩中列环）
 *      + 拖拽柄悬停聚焦：2px 纵向渐变，中段最深、向两端淡出、从中间展开
 *   ③ 空栏 guide「展开选择组件」：平行（无胶囊）、图标 20、无描述、快捷键灰底 pill
 *
 * 夹具理由同 model-picker-verify：launch token 只在宿主内存，headless 打不开真实 GUI。
 * 样式取 app.asar 真实 shipped（ui-theme / layout / sidebar-right / dockkit / primitives），
 * DOM 按渲染代码复刻。before 列剥掉 ⑯ 段与右栏阴影段，after 列完整。
 *
 * 用法：node scripts/rightbar-verify.mjs [--no-shot]
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
function cssAfter(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  const re = /(?:const|var)\s+[\w$]+\s*=\s*"/g;
  re.lastIndex = i;
  const hit = re.exec(src);
  if (!hit) throw new Error('css literal not found after ' + marker);
  const text = readStringLiteral(src, hit.index + hit[0].length - 1);
  if (!text.includes('{')) throw new Error('not a css literal after ' + marker);
  return text;
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
const layoutSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js');
const srSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js');
const primSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js');
const termSrc = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.js');
const frontCss = read('dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-DUvMhLle.css');
if (!themeSrc || !layoutSrc || !srSrc || !primSrc || !termSrc || !frontCss) throw new Error('shipped bundles not found');

const themeLayers = (() => {
  const re = /(?:const|var|let)\s+([\w$]+_css_default)\s*=\s*"/g;
  const parts = [];
  let m;
  while ((m = re.exec(themeSrc)) !== null) {
    const text = readStringLiteral(themeSrc, m.index + m[0].length - 1);
    if (text.includes('--dsw-')) parts.push(text);
  }
  return parts.join('\n');
})();

const frameCss = cssFor(layoutSrc, '@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css');
const F = mapFor(layoutSrc, 'AppFrame_module_css_default');
const panelCss = cssFor(srSrc, '@deepseek-ai/dsh-client-ui-sidebar-right/SidebarRight.module.css');
const P = mapFor(srSrc, 'SidebarRight_module_css_default');
const guideCss = cssFor(srSrc, '@deepseek-ai/dsh-client-ui-sidebar-right/GuideBody.module.css');
const G = mapFor(srSrc, 'GuideBody_module_css_default');
const skCss = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/ShortcutKeys.module.css').replace(/^\s*}\s*/, '');
const btnCss = read('dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/Button.module.css').replace(/^[\s\S]*?(?=\/\*|\.)/, '');
const tgCss = cssAfter(termSrc, 'TerminalGuide.module.css.mjs');
const T = mapFor(termSrc, 'TerminalGuide_module_css_default');

/* dockkit 模块（前端 bundle 内，哈希随构建变）：抽规则原文 + 按前缀取类名 */
const dockRules = [];
for (const m of frontCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1].includes('_1s7ij_')) dockRules.push(m[0]);
if (dockRules.length === 0) throw new Error('dockkit rules not found in frontend css (hash changed?)');
const dockCss = dockRules.join('\n');
const dockName = (key) => {
  const m = new RegExp('\\._' + key + '_([\\w-]+)').exec(dockCss);
  if (!m) throw new Error('dockkit class not found: ' + key);
  return '_' + key + '_' + m[1];
};
const D = { tabCell: dockName('tabCell'), tabHost: dockName('tabHost'), tabHostHeader: dockName('tabHostHeader'), tabHostBody: dockName('tabHostBody'), stripTabs: dockName('stripTabs'), stripFill: dockName('stripFill'), stripChrome: dockName('stripChrome'), pane: dockName('pane'), paneBody: dockName('paneBody') };

/* ── DOM 复刻 ─────────────────────────────────────────────────────────────── */
const svg = (d, size = 16) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="' + d + '" stroke="currentColor"/></svg>';
const FOLDER = 'M1.5 4.5h4l1.2 1.5h7.8v7.5h-13z';
const GLOBE = 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M1.5 8h13M8 1.5c2 1.8 3 4 3 6.5s-1 4.7-3 6.5c-2-1.8-3-4-3-6.5s1-4.7 3-6.5';
const TERM = 'M2 3l4 4-4 4M8 11h6';
const COMPASS = 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M10.5 5.5l-1.6 3.4-3.4 1.6 1.6-3.4z';
const entry = (icon, title, desc, combo, kind) =>
  '<div class="' + G.entryCell + '"><button type="button" class="' + G.entry + '" data-sidebar-right-guide-entry="' + (kind || 'files') + '">'
  + '<span class="' + G.entryIcon + '">' + svg(icon, 20) + '</span>'
  + '<span class="' + G.entryText + '"><span class="' + G.entryTitle + '">' + title + '</span><span class="' + G.entryDescription + '">' + desc + '</span></span>'
  + (combo ? '<span class="keys">' + combo.split('+').map((k2, i2) => (i2 ? '<kbd class="separator">+</kbd>' : '') + '<kbd class="key">' + k2 + '</kbd>').join('') + '</span>' : '')
  + '</button></div>';
/* TerminalGuide（terminal 插件注册的自定义卡）：button.main 绝对定位点击层在前，
   子序 button→icon→text(titleRow+description)→keys，与标准卡不同 */
const termEntry = () =>
  '<div class="' + G.entryCell + '"><div class="' + T.entry + '" data-sidebar-right-guide-entry="terminal">'
  + '<button type="button" class="button ghost md ' + T.main + '" aria-label="新建终端 在会话工作区运行命令" aria-keyshortcuts="Control+`"></button>'
  + '<span class="' + T.icon + '" aria-hidden="true">' + svg(TERM, 26) + '</span>'
  + '<span class="' + T.text + '"><span class="' + T.titleRow + '"><span class="' + T.title + '" aria-hidden="true">新建终端</span>'
  + '<button type="button" class="button ghost md ' + T.trigger + '" aria-label="选择 Shell" aria-haspopup="menu" aria-expanded="false">' + svg('M3 5.5 8 10.5 13 5.5', 14) + '</button></span>'
  + '<span class="' + T.description + '" aria-hidden="true">在会话工作区运行命令</span></span>'
  + '<span class="' + T.shortcut + ' keys"><kbd class="key">Ctrl</kbd><kbd class="separator">+</kbd><kbd class="key">`</kbd></span>'
  + '</div></div>';

const guide = '<div class="' + G.guide + '" data-sidebar-right-guide="true">'
  + '<span class="' + G.hero + '" aria-hidden="true">' + svg(COMPASS, 56) + '</span>'
  + entry(FOLDER, '工作区文件', '浏览会话工作区的文件', 'Ctrl+P', 'workspace')
  + entry(GLOBE, '浏览器', '浏览网页', 'Ctrl+T', 'browser')
  + termEntry()
  + '</div>';

const strip = '<div class="' + D.tabHostHeader + '" style="display:flex;align-items:center;height:36px;padding:0 8px">'
  + '<div class="' + D.stripTabs + '" style="display:flex"><span style="font:13px/20px inherit;padding:4px 9px">开始</span></div>'
  + '<div class="' + D.stripFill + '"></div>'
  + '<div class="' + D.stripChrome + '">'
  + '<button type="button" class="' + P.iconButton + '" aria-label="全屏" data-sidebar-right-mode="fullscreen">' + svg('M2 10v3h3M14 6V3h-3', 15) + '</button>'
  + '<button type="button" class="' + P.iconButton + '" aria-label="收起右栏" data-sidebar-right-toggle="true">' + svg('M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM9 3v10', 15) + '</button>'
  + '</div></div>';

const stage = '<div class="' + F.frame + '" style="grid-template-columns:300px 1fr 474px">'
  + '<div class="' + F.sidebarCol + '" style="height:720px"><div data-slot="sidebar"></div></div>'
  + '<div class="' + F.centerCol + '" style="height:720px;position:relative"><div data-slot="main" style="display:contents"></div></div>'
  + '<div class="' + F.rightbarCol + '" data-rightbar-col="true" style="height:720px">'
  +   '<div class="' + P.panel + '" data-sidebar-right-session="s1" data-sidebar-right-panel="push" data-sidebar-right-open="true" style="width:474px;--dsh-sidebar-width:474px">'
  +     '<div class="' + P.panelBody + '">'
  +       '<div class="' + D.tabCell + '" data-dockkit-host="dock" data-dockkit-column="0" style="display:flex;flex:1">'
  +         '<section class="' + D.pane + '" data-dockkit-content="tab2" data-dockkit-pane="pane1" data-dockkit-pane-active="true" data-dockkit-column="0" style="display:flex;flex:1">'
  +           '<div class="' + D.tabHost + '" style="display:flex;flex-direction:column;flex:1;min-width:0">'
  +             strip
  +             '<div class="' + D.tabHostBody + '" style="position:relative;flex:1;min-height:0">' + guide + '</div>'
  +           '</div>'
  +         '</section>'
  +       '</div>'
  +     '</div>'
  +   '</div>'
  + '</div>'
  + '<div class="' + F.handle + '" data-side="sidebar" style="left:300px"></div>'
  + '<div class="' + F.handle + '" data-side="rightbar" style="left:calc(100% - 474px)"></div>'
  + '</div>';

/* before = theme 剥掉 ⑯ 段与 window-shadow 右栏段（两段各自切除，中间层保留） */
const cut16 = THEME.lastIndexOf('/*', THEME.indexOf('⑯ 右栏「展开时选择组件」'));
const end16 = THEME.indexOf('/* ==== L3 侧栏对齐层', cut16);
const cutRB = THEME.lastIndexOf('/*', THEME.indexOf('右栏（push 模式）'));
const endRB = THEME.indexOf('/* ==== L3 输入区完整层', cutRB);
if (cut16 < 0 || end16 < 0 || cutRB < 0 || endRB < 0) throw new Error('rightbar section markers missing in theme.css');
let themeNoRB = THEME.slice(0, cut16) + THEME.slice(end16, cutRB) + THEME.slice(endRB);
/* before 页剥掉阴影层本体（中列的发丝线 + 环境影、面板的上沿影），
   本轮修复项在这一项上必须有真实差异 */
themeNoRB = themeNoRB.replace(/box-shadow:\s*0 0 0 0\.5px var\(--dsw-alias-border-l2\),\s*0 0 24px rgba\(13, 13, 13, 0\.05\);/g, 'box-shadow: none;');
themeNoRB = themeNoRB.replace(/box-shadow:\s*0 0 0 0\.5px var\(--dsw-alias-border-l2\),\s*0 0 24px rgba\(0, 0, 0, 0\.5\);/g, 'box-shadow: none;');
const page = (theme, label, titlebar = true) => '<!doctype html><html data-codex-ui data-platform="win32"' + (titlebar ? ' data-windows-titlebar' : '') + '>'
  + '<head><meta charset="utf-8"><title>' + label + '</title><style>' + themeLayers + '</style>'
  + '<style>' + frameCss + '</style><style>' + panelCss + '</style><style>' + guideCss + '</style><style>' + skCss + '</style><style>' + dockCss + '</style><style>' + btnCss + '</style><style>' + tgCss + '</style>'
  + '<style id="codex-ui-theme">' + theme + '</style>'
  + '<style>[data-dockkit-pane]{border-left:1px solid rgba(13,13,13,.24)}</style>'
  + '<style>html{--dsh-windows-titlebar-height:36px}html,body{height:100%}body{margin:0;background:var(--dsw-specific-sidebar-fill);font-family:"Segoe UI","Microsoft YaHei",sans-serif}</style></head><body>'
  + stage + '</body></html>';

fs.mkdirSync(FIX, { recursive: true });
fs.mkdirSync(EVID, { recursive: true });
const beforePath = join(FIX, 'rightbar-before.html');
const afterPath = join(FIX, 'rightbar-after.html');
const webPath = join(FIX, 'rightbar-web.html');
fs.writeFileSync(beforePath, page(themeNoRB, 'before'));
fs.writeFileSync(afterPath, page(THEME, 'after'));
fs.writeFileSync(webPath, page(THEME, 'web', false));

const PROBE = '(() => { try {'
  + 'const cs = (el, p) => el ? getComputedStyle(el, p) : null;'
  + 'const panel = document.querySelector("[data-sidebar-right-panel]");'
  + 'const pane = document.querySelector("[data-dockkit-host=\\"dock\\"] [data-dockkit-pane]");'
  + 'const handle = document.querySelector("[data-side=\\"rightbar\\"]");'
  + 'const handleLeft = document.querySelector("[data-side=\\"sidebar\\"]");'
  + 'const hero = document.querySelector("[data-sidebar-right-guide] > span[aria-hidden]");'
  + 'const guideEl = document.querySelector("[data-sidebar-right-guide]");'
  + 'const entry = document.querySelector("[data-sidebar-right-guide-entry]");'
  + 'const icon = entry.querySelector("span:first-child svg");'
  + 'const desc = entry.querySelectorAll("span:nth-child(2) > span");'
  + 'const keysEl = entry.lastElementChild;'
  + 'const toggle = document.querySelector("[data-sidebar-right-toggle]");'
  + 'return JSON.stringify({'
  + 'panelShadow: cs(panel).boxShadow !== "none",'
  + 'panelBox: cs(panel).boxShadow,'
  + 'panelTop: Math.round(panel.getBoundingClientRect().top),'
  + 'panelH: Math.round(panel.getBoundingClientRect().height),'
  + 'centerBox: cs(document.querySelector("[data-slot=main]").parentElement).boxShadow,'
  + 'paneBorder: cs(pane).borderLeftWidth + " " + cs(pane).borderLeftColor,'
  + 'handleBefore: { opacity: cs(handle, "::before").opacity, width: cs(handle, "::before").width, grad: /linear-gradient/.test(cs(handle, "::before").backgroundImage) },'
  + 'handleLeftBefore: { opacity: cs(handleLeft, "::before").opacity, width: cs(handleLeft, "::before").width, grad: /linear-gradient/.test(cs(handleLeft, "::before").backgroundImage), scale: cs(handleLeft, "::before").scale, bg: cs(handleLeft, "::before").backgroundImage, content: cs(handleLeft, "::before").content },'
  + 'hero: cs(hero).display,'
  + 'after: cs(guideEl, "::after").display,'
  + 'entry: { border: cs(entry).borderTopWidth, bg: cs(entry).backgroundColor, minH: cs(entry).minHeight, radius: cs(entry).borderTopLeftRadius, width: cs(entry).width },'
  + 'icon: icon.getAttribute("width") + "x" + icon.getAttribute("height"),'
  + 'iconBox: cs(entry.querySelector("span:first-child")).width,'
  + 'desc: desc.length > 1 ? cs(desc[1]).display : "absent",'
  + 'keys: { h: cs(keysEl).height, radius: cs(keysEl).borderTopLeftRadius, bg: cs(keysEl).backgroundColor },'
  + 'toggle: { bg: cs(toggle).backgroundColor, radius: cs(toggle).borderTopLeftRadius },'
  + 'sidebarBorder: (function () { const s = cs(document.querySelector("[data-slot=sidebar]").parentElement); return s.borderRightColor + "|" + s.borderRightWidth + "|" + s.borderRightStyle; })(),'
  + 'term: (function () {'
  +   'const t = document.querySelector("[data-sidebar-right-guide-entry=\\"terminal\\"]");'
  +   'if (!t) return { missing: true };'
  +   'const icon = t.querySelector(":scope > span:nth-child(2)");'
  +   'const text = t.querySelector(":scope > span:nth-child(3)");'
  +   'const desc = text ? text.querySelector(":scope > span:nth-child(2)") : null;'
  +   'const title = text ? text.querySelector(":scope > span:nth-child(1) > span:first-child") : null;'
  +   'const chev = t.querySelector("button[aria-haspopup=\\"menu\\"]");'
  +   'const keys = t.querySelector(":scope > span:has(kbd)");'
  +   'const tr = t.getBoundingClientRect(); const rr = { top: tr.top + tr.height / 2 };'
  +   'const pr = title ? title.getBoundingClientRect() : null;'
  +   'const filesRow = document.querySelector("[data-sidebar-right-guide-entry=\\"workspace\\"]");'
  +   'return {'
  +   '  border: cs(t).borderTopWidth, bg: cs(t).backgroundColor, minH: cs(t).minHeight,'
  +   '  iconBox: cs(icon).width, iconSvg: icon.querySelector("svg") ? cs(icon.querySelector("svg")).width : "none",'
  +   '  desc: desc ? cs(desc).display : "absent",'
  +   '  chev: chev ? cs(chev).display + "/" + Math.round(chev.getBoundingClientRect().width) : "missing",'
  +   '  titleCenterDelta: pr ? Math.round(((pr.top + pr.height / 2) - rr.top) * 10) / 10 : "n/a",'
  +   '  rowH: Math.round(tr.height * 10) / 10, filesRowH: filesRow ? Math.round(filesRow.getBoundingClientRect().height * 10) / 10 : -1,'
  +   '  keysH: keys ? cs(keys).height : "missing"'
  +   '};'
  + '})()'
  + '}); } catch (e) { return JSON.stringify({ error: String(e) }); } })()';

const args = process.argv.slice(2);
const noShot = args.includes('--no-shot');
const CHROME = chromePath();
const port = 9338;
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port,
  '--user-data-dir=' + tempDir('dsh-cdp-profile6'), '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--window-size=1000,780', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 60 && !info; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) info = await r.json(); } catch {} if (!info) await sleep(250); }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pendingQ = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pendingQ.has(m.id)) { pendingQ.get(m.id)(m); pendingQ.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pendingQ.set(id, (m) => m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

async function openPage(path) {
  const { targetId } = await send('Target.createTarget', { url: 'file:///' + path.replaceAll('\\', '/') });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 780, deviceScaleFactor: 2, mobile: false }, sessionId);
  await sleep(900);
  return sessionId;
}
const probe = async (sessionId) => JSON.parse((await send('Runtime.evaluate', { expression: PROBE, returnByValue: true }, sessionId)).result.value);

const sb = await openPage(beforePath);
const sa = await openPage(afterPath);
const before = await probe(sb);
const idle = await probe(sa);
/* 悬停左分界线拖拽柄（柄 8px 骑跨 300 分界）→ 读 ::before */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 390 }, sa);
await sleep(500);
const hoverLeft = await probe(sa);
/* 悬停右分界线拖拽柄（柄 8px 骑跨 526 分界，取柄内偏右点避开中列右沿）→ 读 ::before */
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 528, y: 390 }, sa);
await sleep(500);
const hovered = await probe(sa);
/* web 页最后开：headless 单窗口只有前台页签处理 :hover，先开会抢走 sa 的前台态 */
const sw = await openPage(webPath);
const after = idle;
console.log('BEFORE', JSON.stringify(before));
console.log('IDLE  ', JSON.stringify(idle));
console.log('HOVER-L', JSON.stringify(hoverLeft.handleLeftBefore));
console.log('HOVER-R', JSON.stringify(hovered.handleBefore));
const checks = [
  ['面板有边框阴影', after.panelShadow === true],
  ['面板左沿 0.5px l1 发丝线', /rgba\(13, 13, 13, 0\.07\) 0px 0px 0px 0\.5px/.test(after.panelBox)],
  ['面板左沿不糊影（影只往上泄）', /rgba\(13, 13, 13, 0\.05\) 0px -12px 24px -12px/.test(after.panelBox)],
  ['面板顶沿贴标题栏条下沿', after.panelTop === 36],
  ['面板撑满列高(塌高即回归)', after.panelH === 720],
  ['中列 0.5px l2 发丝线', /rgba\(13, 13, 13, 0\.12\) 0px 0px 0px 0\.5px/.test(after.centerBox)],
  /* 0.6.3 起环境影按 Codex 实测拟合（SSE 47 -> 22），判据随之改写：
     旧值 0 0 24px @5% 是照抄源码 token 的那一支，实测偏散偏浅。 */
  ['中列全向环境影 13px @7%（0.6.3 实测拟合；旧值 24px @5%）',
    after.centerBox.includes('rgba(13, 13, 13, 0.07) 0px 0px 13px')],
  ['栏内 pane 的 1px l4 深边框被压掉', after.paneBorder === '0px rgb(0, 0, 0)' && before.paneBorder === '1px rgba(13, 13, 13, 0.24)'],
  ['右栏悬停线默认隐藏', idle.handleBefore.opacity === '0'],
  ['右栏悬停线出现', hovered.handleBefore.opacity === '1'],
  ['右栏悬停线宽 2px', hovered.handleBefore.width === '2px'],
  ['右栏悬停线纵向渐变', hovered.handleBefore.grad === true],
  ['左分界线无悬停线（静默）', idle.handleLeftBefore.content === 'none' && idle.handleLeftBefore.bg === 'none'],
  ['左分界线无悬停线（悬停仍是静默）', hoverLeft.handleLeftBefore.content === 'none' && hoverLeft.handleLeftBefore.bg === 'none'],
  ['罗盘 hero 隐藏', after.hero === 'none'],
  ['底部占位移除', after.after === 'none'],
  ['条目无描边', after.entry.border === '0px'],
  ['条目无底色', /rgba\(0, 0, 0, 0\)|transparent/.test(after.entry.bg)],
  ['条目行高 52', after.entry.minH === '52px'],
  ['条目圆角 12', after.entry.radius === '12px'],
  ['条目宽 380', after.entry.width === '380px'],
  ['图标 20', after.iconBox === '20px'],
  ['描述行隐藏', after.desc === 'none'],
  ['快捷键 pill 高 24', after.keys.h === '24px'],
  ['快捷键 pill 圆角 12', after.keys.radius === '12px'],
  ['快捷键 pill 灰底', after.keys.bg === 'rgb(241, 241, 239)'],
  ['收起按钮灰底', after.toggle.bg === 'rgb(241, 241, 239)'],
  ['收起按钮圆角 12', after.toggle.radius === '12px'],
  ['终端行无描边', after.term.border === '0px'],
  ['终端行无底色', /rgba\(0, 0, 0, 0\)|transparent/.test(after.term.bg)],
  ['终端行小字隐藏', after.term.desc === 'none'],
  ['终端图标 20', after.term.iconBox === '20px'],
  ['终端图标 svg 20', after.term.iconSvg === '20px'],
  ['终端标题垂直居中', Math.abs(after.term.titleCenterDelta) <= 1],
  ['终端行高与标准行一致', after.term.rowH === after.term.filesRowH],
  ['选 Shell chevron 保留', /^flex\/20|^block\/20|inline-flex\/20/.test(after.term.chev)],
  ['终端快捷键 pill 高 24', after.term.keysH === '24px'],
];
const web = await probe(sw);
checks.push(
  ['web 中列全向环境影 13px @7%（与桌面壳同值）',
    web.centerBox.includes('rgba(13, 13, 13, 0.07) 0px 0px 13px')],
  ['web 中列 0.5px l2 发丝线', /rgba\(13, 13, 13, 0\.12\) 0px 0px 0px 0\.5px/.test(web.centerBox)],
  ['web 侧栏边界 l1 细线', /rgba\(13, 13, 13, 0\.07\)\|(0\.5|1)px\|solid/.test(web.sidebarBorder)],
  ['web 面板上沿影（负 spread）', /rgba\(13, 13, 13, 0\.05\) 0px -12px 24px -12px/.test(web.panelBox)],
  ['web 面板撑满列高', web.panelH === 720],
);
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail += 1; console.log((ok ? 'PASS ' : 'FAIL ') + name); }
if (!noShot) {
  for (const [sessionId, name] of [[sb, 'rightbar-before.png'], [sa, 'rightbar-after.png'], [sw, 'rightbar-web.png']]) {
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(join(EVID, name), Buffer.from(shot.data, 'base64'));
    console.log('SHOT assets/screenshots/' + name);
  }
}
ws.close(); child.kill();
console.log(fail === 0 ? 'ALL PASS (' + checks.length + ')' : fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
