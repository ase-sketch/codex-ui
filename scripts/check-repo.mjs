#!/usr/bin/env node
/**
 * check-repo.mjs — 不依赖宿主（app.asar / Chromium / dsh 实例）的仓库体检，CI 的入口。
 *
 *   node scripts/check-repo.mjs
 *
 * 覆盖：语法、JSON、包清单自洽、产物与源样式是否同源、样式表卫生、双语文档成对、
 *      文本编码（UTF-8 无 BOM）、源码里是否残留某台机器的绝对路径。
 * 需要宿主的东西（计算样式断言、真 GUI 取证）在 *-verify.mjs / live-gui-probe.mjs 里，
 * 它们读 DSH_ASAR / DSH_GLOBAL_MODULES / DSH_CHROME，本文件不碰。
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, ATTR, PLUGIN_DIR, SKIN_DIR } from '../src/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (name, extra = '') => console.log('ok   ' + name + (extra ? '  ' + extra : ''));
const bad = (name, detail) => { failed += 1; console.error('FAIL ' + name + '\n     ' + detail); };
const check = (name, fn) => { try { const extra = fn(); ok(name, extra ?? ''); } catch (e) { bad(name, e.message); } };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const rel = (p) => relative(PLUGIN_DIR, p).replaceAll('\\', '/');

/* ── 1. 运行环境 ───────────────────────────────────────────────────────── */
check('Node >= 22', () => {
  const major = Number(process.versions.node.split('.')[0]);
  assert(major >= 22, '当前 ' + process.versions.node);
  return 'v' + process.versions.node;
});

/* ── 2. 语法：全部 .js / .mjs 能被解析 ─────────────────────────────────── */
const listFiles = (dir, exts) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'assets' || e.name === 'preview' ? [] : listFiles(p, exts);
  return exts.some((x) => e.name.endsWith(x)) ? [p] : [];
});
const jsFiles = listFiles(PLUGIN_DIR, ['.js', '.mjs']);
check('语法 ' + jsFiles.length + ' 个 JS 文件', () => {
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      throw new Error(rel(file) + '：' + String(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' '));
    }
  }
});

/* ── 3. JSON ──────────────────────────────────────────────────────────── */
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const pkg = readJson(join(PLUGIN_DIR, 'package.json'));
const skinJson = readJson(join(SKIN_DIR, 'skin.json'));
check('JSON 可解析', () => 'package.json + skins/codex-ink/skin.json');

/* ── 4. 包清单自洽 ────────────────────────────────────────────────────── */
check('package.json 清单', () => {
  const entries = [...pkg.files, pkg.main, ...Object.values(pkg.exports ?? {}), pkg.dsh?.bundle?.patch];
  for (const e of entries) {
    if (typeof e !== 'string' || e.startsWith('./') === false && e.includes('/') === false) continue;
    const target = join(PLUGIN_DIR, e.replace(/^\.\//, ''));
    assert(fs.existsSync(target), 'files/exports 指向的文件不存在：' + e);
  }
  assert(pkg.license === 'MIT', 'license 应为 MIT');
  assert(String(pkg.repository?.url ?? '').includes('github.com'), 'repository.url 缺失');
  assert(String(pkg.bugs?.url ?? '').includes('github.com'), 'bugs.url 缺失');
  assert(Number(String(pkg.engines?.node ?? '').replace(/[^0-9]/g, '')) >= 22, 'engines.node 应 >= 22');
  return pkg.name + '@' + pkg.version;
});

check('skin.json 清单', () => {
  assert(skinJson.id === 'codex-ink', 'id 应为 codex-ink');
  assert(/^#[0-9a-f]{6}$/i.test(skinJson.accent), 'accent 应为 6 位十六进制色');
  for (const p of [...Object.values(skinJson.contributes ?? {}), ...Object.values(skinJson.preview ?? {})]) {
    assert(fs.existsSync(join(SKIN_DIR, p)), 'skin.json 引用的文件不存在：' + p);
  }
  return skinJson.id + ' accent ' + skinJson.accent;
});

/* ── 5. 产物与源样式同源 ──────────────────────────────────────────────── */
const built = build();
check('theme.css 与源样式一致', () => {
  const committed = fs.readFileSync(join(PLUGIN_DIR, 'theme.css'), 'utf8');
  assert(committed === built.themeCss, '过期：先跑 node scripts/build.mjs');
  return built.scopedBytes + ' B';
});
check('client.js 与源样式一致', () => {
  const committed = fs.readFileSync(join(PLUGIN_DIR, 'client.js'), 'utf8');
  assert(committed === built.clientJs, '过期：先跑 node scripts/build.mjs');
  return built.clientJs.length + ' B';
});
check('client.js 内嵌的就是 theme.css', () => {
  const clientJs = fs.readFileSync(join(PLUGIN_DIR, 'client.js'), 'utf8');
  const m = /const CSS = (".*?");\n/s.exec(clientJs);
  assert(m, 'client.js 里找不到 CSS 字面量');
  assert(JSON.parse(m[1]) === built.themeCss, 'client.js 内嵌 CSS 与 theme.css 不同');
});

/* ── 6. 样式表卫生 ────────────────────────────────────────────────────── */
const themeCss = built.themeCss;
check('theme.css 全部作用域化', () => {
  assert(themeCss.includes(ATTR), '缺少作用域根 ' + ATTR);
  const bare = themeCss.match(/(^|\n)\s*:root\s*[,{]/g);
  assert(bare === null, '残留未作用域的 :root：' + (bare ? bare.length : 0) + ' 处');
  assert(!/@import\s+url\(\s*['"]?https?:/.test(themeCss), '不允许远程 @import');
  assert(!themeCss.includes('__CODEX_UI_CSS__'), '残留模板占位符');
  return themeCss.length + ' B';
});
check('theme.css 花括号配平', () => {
  let depth = 0;
  for (const ch of themeCss) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    assert(depth >= 0, '出现多余的 }');
  }
  assert(depth === 0, '有 ' + depth + ' 个 { 未闭合');
});

/* ── 7. 文档成对 ──────────────────────────────────────────────────────── */
check('双语文档成对', () => {
  const pairs = [['README.md', 'README.zh-CN.md'], ['CHANGELOG.md', 'CHANGELOG.zh-CN.md']];
  for (const [en, zh] of pairs) {
    for (const f of [en, zh]) assert(fs.existsSync(join(PLUGIN_DIR, f)), '缺少 ' + f);
  }
  for (const f of ['skin/README.md'.replace('skin', 'skins/codex-ink'), 'skins/codex-ink/README.zh-CN.md']) {
    assert(fs.existsSync(join(PLUGIN_DIR, f)), '缺少 ' + f);
  }
});

/* ── 8. 文本编码 ──────────────────────────────────────────────────────── */
check('文本为无 BOM 的 UTF-8', () => {
  const files = [...jsFiles, ...listFiles(PLUGIN_DIR, ['.md', '.css', '.json', '.yml'])];
  for (const file of files) {
    const buf = fs.readFileSync(file);
    assert(!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf), '带 UTF-8 BOM：' + rel(file));
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { throw new Error('不是合法 UTF-8：' + rel(file)); }
  }
  return files.length + ' 个文件';
});

/* ── 9. 不留机器专属绝对路径 ──────────────────────────────────────────── */
check('源码无机器专属绝对路径', () => {
  const bad = /(?:[A-Za-z]:[\\/](?:Users|A-part-of-new-software|npm-global))|(?:\/home\/[^\s'"]+\/)/g;
  const hits = [];
  for (const file of jsFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(bad)) hits.push(rel(file) + ' → ' + m[0]);
  }
  assert(hits.length === 0, hits.join('\n     '));
});

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '：' + (failed === 0 ? '全部通过' : failed + ' 项未通过'));
process.exit(failed === 0 ? 0 : 1);
