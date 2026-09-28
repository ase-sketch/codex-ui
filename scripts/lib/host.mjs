/**
 * host.mjs — 找宿主、读宿主。夹具与探针只从这里拿宿主的东西。
 *
 * 路径都跟机器有关，按同一优先级解析，仓库里不写死任何一台机器的绝对路径：
 *   1. 环境变量        DSH_ASAR / DSH_GLOBAL_MODULES / DSH_CHROME
 *   2. scripts/host.local.json（本机配置，已 gitignore；字段 asar / globalModules / chrome）
 *   3. 常见安装位置扫描
 * 显式给出（1、2）却不存在的路径直接报错，不静默落到下一项。
 *
 * 宿主 shipped 文件只有一个读取入口 openHost()：桌面壳的 app.asar 与 npm 装出来的 node_modules
 * 里是同一批 @deepseek-ai/* 包，夹具只写包内相对路径，不关心来源。
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), 'host.local.json');
const local = (() => {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); } catch { return {}; }
})();
const env = (name) => process.env[name]?.trim() || null;

/** 按顺序取第一个存在的候选；显式项（explicit）不存在就报错。 */
function resolve(what, explicit, scans, hint) {
  for (const [source, path] of explicit) {
    if (path === null || path === undefined || path === '') continue;
    if (!fs.existsSync(path)) throw new Error(source + ' 指向的' + what + '不存在：' + path);
    return path;
  }
  const tried = [];
  for (const scan of scans) {
    for (const path of [scan()].flat()) {
      if (!path) continue;
      tried.push(path);
      if (fs.existsSync(path)) return path;
    }
  }
  throw new Error('找不到' + what + '。' + hint + ' 已尝试：\n  ' + tried.join('\n  '));
}

const localAppData = env('LOCALAPPDATA');
const programFiles = [env('ProgramFiles'), env('ProgramFiles(x86)')].filter(Boolean);

/** 宿主来源：app.asar（文件）或含 @deepseek-ai/* 的 node_modules（目录）。 */
export function hostPath() {
  return resolve('宿主', [
    ['DSH_ASAR', env('DSH_ASAR')],
    ['DSH_GLOBAL_MODULES', env('DSH_GLOBAL_MODULES')],
    ['host.local.json asar', local.asar],
    ['host.local.json globalModules', local.globalModules],
  ], [
    () => [
      localAppData && join(localAppData, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
      localAppData && join(localAppData, 'Programs', 'deepseek-harness', 'resources', 'app.asar'),
      programFiles[0] && join(programFiles[0], 'DeepSeek Harness', 'resources', 'app.asar'),
      '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
    ],
    /* npm -g 装的 dsh：只有真装了才算（全局 node_modules 本身总是存在的）。 */
    () => {
      try {
        const root = execFileSync('npm root -g', { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return fs.existsSync(join(root, '@deepseek-ai', 'dsh')) ? root : null;
      } catch { return null; }
    },
  ], '设 DSH_ASAR=<app.asar> 或 DSH_GLOBAL_MODULES=<含 @deepseek-ai 的 node_modules>，或写 scripts/host.local.json。');
}

/** Chromium 系浏览器：Playwright 缓存里版本号最大的一个，其次是常见的 Chrome / Edge 安装。 */
export function chromePath() {
  const playwright = () => [env('PLAYWRIGHT_BROWSERS_PATH'), localAppData && join(localAppData, 'ms-playwright'),
    join(homedir(), '.cache', 'ms-playwright'), join(homedir(), 'Library', 'Caches', 'ms-playwright')]
    .filter((root) => root && fs.existsSync(root))
    .flatMap((root) => fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
      .flatMap((d) => [join(root, d, 'chrome-win64', 'chrome.exe'), join(root, d, 'chrome-linux', 'chrome'),
        join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')]));
  const installed = () => [
    ...programFiles.flatMap((root) => [join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ];
  return resolve('浏览器', [['DSH_CHROME', env('DSH_CHROME')], ['host.local.json chrome', local.chrome]],
    [playwright, installed], '设 DSH_CHROME=<chrome/msedge 可执行文件>，或 npx playwright install chromium。');
}

/* ── 读 shipped 文件 ──────────────────────────────────────────────────── */

/** asar：头部是两层 Pickle（[4][头 Pickle 长度] + [4][JSON 长度][JSON]），文件体从 8 + 头 Pickle 长度起。 */
function asarFs(archive) {
  const fd = fs.openSync(archive, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const json = Buffer.alloc(head.readUInt32LE(12));
  fs.readSync(fd, json, 0, json.length, 16);
  const tree = JSON.parse(json.toString('utf8'));
  const base = 8 + head.readUInt32LE(4);
  const node = (path) => path.split('/').filter(Boolean).reduce((n, seg) => n?.files?.[seg], tree) ?? null;
  return {
    read(path) {
      const n = node(path);
      if (n === null || n.files !== undefined) return null;
      if (n.unpacked) return fs.readFileSync(join(archive + '.unpacked', path), 'utf8');
      const buf = Buffer.alloc(n.size);
      fs.readSync(fd, buf, 0, n.size, base + Number(n.offset));
      return buf.toString('utf8');
    },
    list: (path) => Object.keys(node(path)?.files ?? {}),
  };
}

function dirFs(root) {
  return {
    read: (path) => {
      try { return fs.readFileSync(join(root, path), 'utf8'); } catch { return null; }
    },
    list: (path) => {
      try { return fs.readdirSync(join(root, path)); } catch { return []; }
    },
  };
}

/**
 * 打开宿主。返回的 read / list 收包内路径（'@deepseek-ai/dsh-client-ui-theme/lib/client.js'），
 * 依次在这些根下找：asar 里的 dsh/node_modules；目录形态下 @deepseek-ai/dsh 自带的 node_modules（npm -g 的嵌套布局）
 * 与目录本身（npm --prefix 的扁平布局）。
 */
export function openHost(path = hostPath()) {
  const isAsar = fs.statSync(path).isFile();
  const base = isAsar ? asarFs(path) : dirFs(path);
  const roots = isAsar ? ['dsh/node_modules/', 'node_modules/'] : ['@deepseek-ai/dsh/node_modules/', ''];
  const read = (rel) => {
    for (const root of roots) {
      const text = base.read(root + rel);
      if (text !== null) return text;
    }
    return null;
  };
  const list = (rel) => [...new Set(roots.flatMap((root) => base.list(root + rel)))];
  const version = (() => {
    try { return JSON.parse(read('@deepseek-ai/dsh-client-ui-theme/package.json')).version; } catch { return '?'; }
  })();
  return {
    path,
    label: (isAsar ? 'app.asar ' : 'node_modules ') + path + '（ui-theme ' + version + '）',
    read,
    list,
    /** 必须存在的文件。 */
    file(rel) {
      const text = read(rel);
      if (text === null) throw new Error('宿主里没有 ' + rel + '（' + path + '）');
      return text;
    },
  };
}

/* ── 从打包后的客户端 bundle 里取样式与类名映射 ──────────────────────── */

const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** 从引号处读一个 JS 字符串字面量并反转义（样式里有转义引号，不能用 indexOf 找结尾）。 */
export function readStringLiteral(src, quoteIndex) {
  const quote = src[quoteIndex];
  let out = '';
  for (let i = quoteIndex + 1; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === quote) return out;
    if (ch !== '\\') { out += ch; continue; }
    const next = src[++i];
    if (next === 'x') { out += String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16)); i += 2; }
    else if (next === 'u' && src[i + 1] === '{') { const end = src.indexOf('}', i); out += String.fromCodePoint(parseInt(src.slice(i + 2, end), 16)); i = end; }
    else if (next === 'u') { out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)); i += 4; }
    else if (next !== '\n') out += ESCAPES[next] ?? next;
  }
  throw new Error('字符串字面量没有闭合：@' + quoteIndex);
}

const DECL = /(?:const|var|let)\s+([\w$]+)\s*=\s*"/g;

/** 某个 .module.css 的内联样式：tagId 字符串之前最近的一条含花括号的字符串声明（tagId 自己也是一条，不含花括号）。 */
export function cssFor(src, moduleFile) {
  const at = src.indexOf(moduleFile);
  if (at < 0) throw new Error('bundle 里找不到 ' + moduleFile);
  let last = null;
  for (const m of src.matchAll(DECL)) {
    if (m.index > at) break;
    const text = readStringLiteral(src, m.index + m[0].length - 1);
    if (text.includes('{')) last = text;
  }
  if (last === null) throw new Error('找不到 ' + moduleFile + ' 的样式串');
  return last;
}

/** 与 cssFor 相反：标记之后的第一条样式串（sidebar-terminal 把样式串放在模块标记后面）。 */
export function cssAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('bundle 里找不到 ' + marker);
  for (const m of src.slice(at).matchAll(DECL)) {
    const text = readStringLiteral(src, at + m.index + m[0].length - 1);
    if (text.includes('{')) return text;
  }
  throw new Error(marker + ' 之后没有样式串');
}

/** CSS-Modules 类名映射 `var X_module_css_default = { key: "hash_key", … }`。 */
export function mapFor(src, varName) {
  const at = src.indexOf('var ' + varName + ' = {');
  if (at < 0) throw new Error('bundle 里找不到类名映射 ' + varName);
  const start = src.indexOf('{', at);
  let depth = 0;
  let end = start;
  for (; end < src.length; end += 1) {
    if (src[end] === '{') depth += 1;
    else if (src[end] === '}' && (depth -= 1) === 0) break;
  }
  return Object.fromEntries([...src.slice(start, end + 1).matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

/**
 * ui-theme 的令牌层：shipped 组件样式消费 --dsw-*，皮肤只覆盖其中一部分，夹具必须先垫上宿主这层。
 * 变量名跨版本会变，所以按「`*_css_default` 且含 --dsw-」全量收集，顺序即层叠顺序。
 */
export function themeLayers(host) {
  const src = host.file('@deepseek-ai/dsh-client-ui-theme/lib/client.js');
  const parts = [...src.matchAll(DECL)].filter((m) => m[1].endsWith('_css_default'))
    .map((m) => readStringLiteral(src, m.index + m[0].length - 1)).filter((text) => text.includes('--dsw-'));
  if (parts.length === 0) throw new Error('ui-theme 里没有令牌层');
  return parts.join('\n');
}

/** dsh-web-frontend 的主样式表（文件名带构建哈希，按模式找）。 */
export function frontendCss(host) {
  const dir = '@deepseek-ai/dsh-web-frontend/dist/assets/';
  const names = host.list(dir).filter((n) => /^index-[\w-]+\.css$/.test(n));
  if (names.length === 0) throw new Error('宿主里没有 ' + dir + 'index-*.css');
  return names.map((n) => host.file(dir + n)).join('\n');
}
