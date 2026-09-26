#!/usr/bin/env node
/**
 * install-plugin.mjs — 把 <workbench>/plugin/codex-ui 安装进某个 profile（默认 web）。
 *
 * 做四件事（默认只读体检，--write 才落盘）：
 *   1. 读 skins/codex-ink/{skin.css,patches.css,sidebar-align.css,window-shadow.css,composer.css}，
 *      把每个选择器作用域化到
 *      html[data-codex-ui]（:root → html[data-codex-ui]，其余前缀化；@keyframes/@font-face 原样直通）；
 *   2. 由 client.template.js + 作用域化 CSS 生成 plugin/codex-ui/client.js（CSS 以 JSON 字面量内嵌）；
 *   3. 在 profiles/<name>/node_modules 建立指向插件目录的 junction，使其可按包名解析；
 *   4. 在 profiles/<name>/cordis.patch.yml 里确保存在 insert 条目（按 id 幂等）。
 *
 * 用法：
 *   node scripts/install-plugin.mjs                       # 只读体检（默认 web profile）
 *   node scripts/install-plugin.mjs --write               # 落盘
 *   node scripts/install-plugin.mjs --profile desktop --write
 *
 * --profile <name> 选目标 profile（默认 web）。桌面壳（Electron）的 profile 名是
 * desktop；它由 Electron 独占，CLI 的 `dsh plugin --profile desktop` 会被硬拒绝，
 * 所以桌面端只能走本脚本直接落文件，改完需重启应用才生效。
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WB = dirname(HERE);
const PLUGIN_DIR = WB;
const SKIN_DIR = join(WB, 'skins', 'codex-ink');
const HOME = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh');
/** 目标 profile 名：--profile <name>，缺省 web。 */
const PROFILE_NAME = (() => {
  const i = process.argv.indexOf('--profile');
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v !== undefined && v.trim() !== '' ? v.trim() : 'web';
})();
const PROFILE = join(HOME, 'profiles', PROFILE_NAME);
const INSTALL_DIR = join(PROFILE, 'vendor', 'codex-ui');
const LINK = join(PROFILE, 'node_modules', 'codex-ui');
const PROFILE_PKG = join(PROFILE, 'package.json');
/** 装到 profile 的文件（client.template.js 是源码，不装）。 */
const SHIPPED = ['package.json', 'index.js', 'cordis.patch.yml', 'client.js', 'theme.css'];
const PATCH = join(PROFILE, 'cordis.patch.yml');
const ATTR = 'html[data-codex-ui]';
const write = process.argv.includes('--write');

/* ── CSS 作用域化 ───────────────────────────────────────────────────────── */
const scopeSelector = (sel) => {
  const s = sel.trim();
  if (s === '') return sel;
  if (s === ':root') return ATTR;
  if (s.startsWith('html[')) return s;
  return ATTR + ' ' + s;
};
const splitSelectors = (text) => {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
};
const PASSTHROUGH = new Set(['keyframes', 'font-face', 'property', 'page', 'counter-style']);
function scopeCss(css) {
  let i = 0, out = '';
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const prelude = css.slice(i, open);
    let depth = 1, j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    const close = prelude.lastIndexOf('*/');
    const comments = close >= 0 ? prelude.slice(0, close + 2) : '';
    const selText = close >= 0 ? prelude.slice(close + 2) : prelude;
    const trimmed = selText.trim();
    if (trimmed.startsWith('@')) {
      const name = trimmed.slice(1).split(/[\s({]/)[0].toLowerCase();
      out += comments + selText + '{' + (PASSTHROUGH.has(name) ? body : scopeCss(body)) + '}';
    } else if (trimmed === '') {
      out += comments + '{' + body + '}';
    } else {
      out += comments + splitSelectors(selText).map(scopeSelector).join(',') + '{' + body + '}';
    }
    i = j;
  }
  return out;
}

/* ── 生成 ──────────────────────────────────────────────────────────────── */
const skin = fs.readFileSync(join(SKIN_DIR, 'skin.css'), 'utf8');
const patches = fs.readFileSync(join(SKIN_DIR, 'patches.css'), 'utf8');
const sidebarAlign = fs.readFileSync(join(SKIN_DIR, 'sidebar-align.css'), 'utf8');
const windowShadow = fs.readFileSync(join(SKIN_DIR, 'window-shadow.css'), 'utf8');
const composer = fs.readFileSync(join(SKIN_DIR, 'composer.css'), 'utf8');
const scoped = scopeCss('/* ==== L1/L2 令牌与排版层（源：skins/codex-ink/skin.css）==== */\n' + skin +
  '\n\n/* ==== L3 组件层（源：skins/codex-ink/patches.css）==== */\n' + patches +
  '\n\n/* ==== L3 侧栏对齐层（源：skins/codex-ink/sidebar-align.css）==== */\n' + sidebarAlign +
  '\n\n/* ==== L3 窗口边缘阴影层（源：skins/codex-ink/window-shadow.css）==== */\n' + windowShadow +
  '\n\n/* ==== L3 输入区完整层（源：skins/codex-ink/composer.css）==== */\n' + composer);
const tplSrc = fs.readFileSync(join(PLUGIN_DIR, 'src', 'client.template.js'), 'utf8');
const clientJs = tplSrc.replace('/*__CODEX_UI_CSS__*/', JSON.stringify(scoped));

/* ── 报告 ──────────────────────────────────────────────────────────────── */
console.log('profile  : ' + PROFILE);
console.log('plugin   : ' + PLUGIN_DIR);
console.log('css      : 源 ' + (skin.length + patches.length + sidebarAlign.length + windowShadow.length + composer.length) + ' B → 作用域化 ' + scoped.length + ' B');
/* 哈希类名计数：patches.css 禁 [class*=…]，本层按上游移植放行——把账摊开，不藏着。 */
const hashAnchors = (text) => (text.match(/\[class[$*^]?=/g) ?? []).length;
console.log('hash 锚点: skin=' + hashAnchors(skin) + ' patches=' + hashAnchors(patches) +
  ' sidebar-align=' + hashAnchors(sidebarAlign) + ' window-shadow=' + hashAnchors(windowShadow) +
  ' composer=' + hashAnchors(composer));
console.log('client.js: ' + clientJs.length + ' B');
console.log('link     : ' + LINK);
console.log('patch    : ' + PATCH);
const patchText = fs.readFileSync(PATCH, 'utf8');
/**
 * 注册方式二选一，绝不能同时用 —— 这是本插件最容易踩的坑：
 *   bundle 路径：包名写进 profile package.json 的 dsh.profile.bundles，
 *                由包自带 cordis.patch.yml 完成 insert（dshmarket 市场走这条）；
 *   insert 路径：在 profile 的 cordis.patch.yml 里手写 - insert:
 *                （web profile 走这条：免 pnpm install、改完即热加载）。
 * 两条同时存在 → loader 出现两个同名条目，市场校验判 fail 并直接把插件停用，
 * 日志原话：duplicate loader entry id "codex-ui" (2 rows) / 重复的 loader 条目 id "codex-ui"。
 */
const inBundles = (() => {
  try {
    /* 去 BOM：PowerShell 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 见到它会直接抛。 */
    const pkg = JSON.parse(fs.readFileSync(PROFILE_PKG, 'utf8').replace(/^\uFEFF/, ''));
    return (pkg?.dsh?.profile?.bundles ?? []).includes('codex-ui');
  } catch {
    return false;
  }
})();
/** profile patch 里 codex-ui 的冗余 - insert: 块数量（inBundles 时全部冗余）。 */
const dupInserts = (() => {
  const lines = patchText.split(/\r?\n/);
  let n = 0;
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (lines[i].trim() === '- insert:' && (lines[i + 1] ?? '').trim() === '- id: codex-ui') n += 1;
  }
  return n;
})();
/* 允许缩进：insert 块里的 "- id: codex-ui" 带 4 空格缩进。 */
const registered = inBundles || /^\s*-\s*id:\s*['"]?codex-ui['"]?\s*$/m.test(patchText);
console.log('注册方式: ' + (inBundles ? 'bundle（package.json 的 dsh.profile.bundles）' : 'insert（profile cordis.patch.yml）'));
console.log('patch 条目: ' + (registered ? '已注册' : '缺失（--write 时补）') +
  (dupInserts > 0 ? '；- insert: 块 ' + dupInserts + ' 处' + (inBundles ? '（与 bundle 冲突，冗余，--write 时清除）' : '') : ''));

if (!write) {
  console.log('\nDRY RUN：加 --write 落盘（生成 client.js / theme.css / junction / patch 条目）');
  process.exit(registered ? 0 : 1);
}

fs.writeFileSync(join(PLUGIN_DIR, 'theme.css'), scoped);
fs.writeFileSync(join(PLUGIN_DIR, 'client.js'), clientJs);
console.log('WROTE client.js + theme.css');

// 同步到 profile 的 vendor/（正本仍在 workbench；vendor 是安装副本）
fs.mkdirSync(INSTALL_DIR, { recursive: true });
for (const name of SHIPPED) {
  fs.copyFileSync(join(PLUGIN_DIR, name), join(INSTALL_DIR, name));
}
console.log('SYNCED ' + SHIPPED.length + ' 个文件 → ' + INSTALL_DIR);

// node_modules/codex-ui → vendor/codex-ui（按包名可解析；不跑 pnpm）
const linkTarget = fs.existsSync(LINK) ? fs.realpathSync.native(LINK) : null;
if (linkTarget !== INSTALL_DIR) {
  if (linkTarget !== null) {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Remove-Item -LiteralPath '${LINK}' -Force -Recurse`], { stdio: 'inherit' });
  }
  fs.mkdirSync(dirname(LINK), { recursive: true });
  execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `New-Item -ItemType Junction -Path '${LINK}' -Target '${INSTALL_DIR}' | Out-Null`], { stdio: 'inherit' });
  console.log('LINKED ' + LINK + ' → ' + INSTALL_DIR);
} else {
  console.log('junction 已指向 vendor，跳过');
}

// profile package.json 声明 link 依赖（让将来的 pnpm install 能重建这个链接）
/* 去 BOM：PowerShell 的 Set-Content -Encoding UTF8 会写 BOM，JSON.parse 见到它会直接抛。 */
const pkgText = fs.readFileSync(PROFILE_PKG, 'utf8').replace(/^\uFEFF/, '');
if (!pkgText.includes('"codex-ui"')) {
  /* 空 dependencies 时不能补尾逗号，否则写出非法 JSON —— 分两支插。 */
  const EMPTY_DEPS = /("dependencies"\s*:\s*\{)\s*\}/;
  const patched = EMPTY_DEPS.test(pkgText)
    ? pkgText.replace(EMPTY_DEPS, '$1\n    "codex-ui": "link:./vendor/codex-ui"\n  }')
    : pkgText.replace(/("dependencies"\s*:\s*\{)/, '$1\n    "codex-ui": "link:./vendor/codex-ui",');
  JSON.parse(patched);
  fs.writeFileSync(PROFILE_PKG, patched);
  console.log('DECLARED "codex-ui": "link:./vendor/codex-ui" 到 profile package.json');
} else {
  console.log('profile package.json 已声明，跳过');
}

/**
 * 先清除冗余 - insert: 块 —— 但仅在 bundle 路径已覆盖时。
 * inBundles 为假时这段 insert 是唯一的注册来源，删掉等于把插件摘掉（web profile 就是这种形状）。
 */
if (inBundles) {
  const lines = patchText.split(/\r?\n/);
  let removed = 0;
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (lines[i].trim() === '- insert:' && (lines[i + 1] ?? '').trim() === '- id: codex-ui') {
      lines.splice(i, 3);
      removed += 1;
      i -= 1;
    }
  }
  if (removed > 0) {
    fs.writeFileSync(PATCH, lines.join(patchText.includes('\r\n') ? '\r\n' : '\n'));
    console.log('REMOVED ' + removed + ' 处冗余 - insert: 块（bundle 路径已覆盖）');
  }
}

if (!registered) {
  if (inBundles) {
    console.log('已在 dsh.profile.bundles 中，无需 patch 条目');
  } else {
    const block = [
      '',
      '# codex-ui：独立的 Codex 化客户端插件（自带样式表，不依赖 dsh-web-all 皮肤系统）',
      '# 注意：本 profile 未把 codex-ui 列进 dsh.profile.bundles，故此处手写 insert。',
      '# 若将来它被列入 bundles，必须删掉本块 —— 两条同时存在会造成重复 loader 条目 id。',
      '- insert:',
      "    - id: codex-ui",
      "      name: 'codex-ui'",
      '',
    ].join('\n');
    fs.writeFileSync(PATCH, fs.readFileSync(PATCH, 'utf8').replace(/\s*$/, '') + block);
    console.log('APPENDED patch entry 到 cordis.patch.yml');
  }
} else if (inBundles) {
  console.log('patch 条目已由 bundle 提供，跳过');
} else {
  console.log('patch 条目已存在，跳过');
}
console.log('\nOK：插件已安装（若未自动热加载，重启 dsh web 生效）');
