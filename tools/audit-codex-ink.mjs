#!/usr/bin/env node
/**
 * codex-ink 皮肤验收脚本（本机可跑，纯 Node 标准库）
 *
 *   node tools/audit-codex-ink.mjs [skinDir]
 *
 * 三项检查：
 *   A. skin.json 结构自检（对照 skin-manifest-v2 的必填/枚举/正则约束）
 *   B. WCAG 2.x 对比度实测：把方案 §2 声称的每一组配对真实算一遍
 *   C. 彩色白名单审计：patches.css 不得引入 skin.css 调色板之外的彩色
 *
 * 退出码：0 全过；1 存在失败项。
 */
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 脚本自身位置：默认皮肤目录 = <plugin>/skins/codex-ink，与 CWD 无关。 */
const HERE = dirname(fileURLToPath(import.meta.url));
const skinDir = resolve(process.argv[2] ?? join(HERE, '..', 'skins', 'codex-ink'));

/* ── 颜色解析 / 合成 / 对比度 ───────────────────────────────────────────── */
function parseColor(input) {
  const s = String(input).trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^#([0-9a-f]{8})$/i.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: parseInt(m[1].slice(6, 8), 16) / 255 };
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}
function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  };
}
function luminance(c) {
  const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function ratio(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 极简 CSS 解析：只取自定义属性 ─────────────────────────────────────── */
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function parseBlocks(css) {
  const out = [];
  const src = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (selector.startsWith('@')) continue;
    const decls = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    out.push({ selector, decls });
  }
  return out;
}
function merge(blocks, pred) {
  const map = {};
  for (const b of blocks) if (pred(b.selector)) Object.assign(map, b.decls);
  return map;
}
/** 解析 var() 间接（最多 4 跳），失败返回原值。 */
function resolveToken(map, name, depth = 0) {
  if (depth > 4) return null;
  const raw = map[name];
  if (raw === undefined) return null;
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(raw.trim());
  if (!m) return raw.trim();
  const next = resolveToken(map, m[1], depth + 1);
  if (next !== null) return next;
  return m[2] !== undefined ? m[2].trim() : null;
}

/* ── A. skin.json 结构自检 ─────────────────────────────────────────────── */
const ALLOWED_KEYS = new Set(['$schema', 'skinManifestVersion', 'id', 'name', 'nameEn', 'version', 'author', 'tagline', 'description', 'tags', 'accent', 'order', 'license', 'licenseUrl', 'noticeUrl', 'sourceUrl', 'attribution', 'preview', 'requires', 'contributes', 'facets', 'package', 'wiring', 'bodyAttr']);
const REQUIRED_KEYS = ['skinManifestVersion', 'id', 'name', 'nameEn', 'version', 'author', 'contributes'];
const REL_PATH = /^(?![\/])(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*:\/\/)[A-Za-z0-9._\-\/]+$/;

const failures = [];
const manifest = JSON.parse(readFileSync(join(skinDir, 'skin.json'), 'utf8'));
for (const k of REQUIRED_KEYS) if (!(k in manifest)) failures.push('skin.json 缺必填字段: ' + k);
for (const k of Object.keys(manifest)) if (!ALLOWED_KEYS.has(k)) failures.push('skin.json 出现未知字段（fail-closed）: ' + k);
if (manifest.skinManifestVersion !== 2) failures.push('skinManifestVersion 必须为 2');
if (!/^[a-z][a-z0-9-]{0,31}$/.test(manifest.id)) failures.push('id 不合法: ' + manifest.id);
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) failures.push('version 不合法: ' + manifest.version);
if (manifest.accent !== undefined && !/^#[0-9a-fA-F]{6}$/.test(manifest.accent)) failures.push('accent 必须是 #RRGGBB');
if (manifest.preview) {
  for (const k of ['light', 'dark']) if (!manifest.preview[k] || !REL_PATH.test(manifest.preview[k])) failures.push('preview.' + k + ' 必须是皮肤目录内相对路径');
}
for (const k of ['stylesheet', 'patches']) {
  const v = manifest.contributes?.[k];
  if (v === undefined) continue;
  if (!REL_PATH.test(v)) failures.push('contributes.' + k + ' 必须是皮肤目录内相对路径: ' + v);
}
if (!manifest.contributes?.stylesheet) failures.push('contributes.stylesheet 必填');

/* ── B. 对比度实测 ─────────────────────────────────────────────────────── */
const skinCss = readFileSync(join(skinDir, manifest.contributes.stylesheet), 'utf8');
const blocks = parseBlocks(skinCss);
const lightMap = merge(blocks, (s) => /(^|,)\s*(:root|body)\s*(,|$)/.test(s) && !s.includes('data-ds-dark-theme'));
const darkMap = merge(blocks, (s) => s.includes('data-ds-dark-theme'));

const LIGHT_BASE = { r: 255, g: 255, b: 255, a: 1 };
const DARK_BASE = { r: 33, g: 33, b: 33, a: 1 };

/** [标签, 前景令牌, 背景令牌, 最低要求] */
const PAIRS = [
  ['亮 · 主文本 / 应用底', '--dsw-alias-label-primary', '--dsw-alias-bg-base', 4.5],
  ['亮 · 主文本 / 侧栏', '--dsw-alias-label-primary', '--dsw-alias-bg-sidebar', 4.5],
  ['亮 · 主文本 / 卡片', '--dsw-alias-label-primary', '--dsw-alias-bg-layer-1', 4.5],
  ['亮 · 主文本 / 嵌套面', '--dsw-alias-label-primary', '--dsw-alias-bg-layer-2', 4.5],
  ['亮 · 次要文本 / 应用底', '--dsw-alias-label-secondary', '--dsw-alias-bg-base', 4.5],
  ['亮 · 次要文本 / 嵌套面', '--dsw-alias-label-secondary', '--dsw-alias-bg-layer-2', 4.5],
  ['亮 · 辅助文本 / 应用底', '--dsw-alias-label-tertiary', '--dsw-alias-bg-base', 3.0],
  ['亮 · 辅助文本 / 嵌套面', '--dsw-alias-label-tertiary', '--dsw-alias-bg-layer-2', 3.0],
  ['亮 · 主按钮字 / 主按钮', '--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-fill', 4.5],
  ['亮 · 主按钮字 / 主按钮 hover', '--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-hover', 4.5],
  ['亮 · 成功 / 应用底', '--dsw-alias-state-success-primary', '--dsw-alias-bg-base', 4.5],
  ['亮 · 成功 / 成功底色', '--dsw-alias-state-success-primary', '--dsw-alias-state-success-tertiary', 4.5],
  ['亮 · 错误 / 应用底', '--dsw-alias-state-error-primary', '--dsw-alias-bg-base', 4.5],
  ['亮 · 错误 / 错误底色', '--dsw-alias-state-error-primary', '--dsw-alias-state-error-tertiary', 4.5],
  ['亮 · 警告 / 应用底', '--dsw-alias-state-warn-primary', '--dsw-alias-bg-base', 4.5],
  ['亮 · 警告 / 警告底色', '--dsw-alias-state-warn-primary', '--dsw-alias-state-warn-tertiary', 4.5],
  ['亮 · 墨标签 / 墨底色', '--dsw-alias-label-primary', '--dsw-alias-state-business-tertiary', 4.5],
  ['亮 · 辅助 / 第三档灰', '--dsw-alias-label-tertiary', '--dsw-alias-bg-layer-3', 3.0],
  ['暗 · 主文本 / 应用底', '--dsw-alias-label-primary', '--dsw-alias-bg-base', 4.5],
  ['暗 · 主文本 / 侧栏', '--dsw-alias-label-primary', '--dsw-alias-bg-sidebar', 4.5],
  ['暗 · 主文本 / 卡片', '--dsw-alias-label-primary', '--dsw-alias-bg-layer-1', 4.5],
  ['暗 · 主文本 / 嵌套面', '--dsw-alias-label-primary', '--dsw-alias-bg-layer-2', 4.5],
  ['暗 · 次要文本 / 应用底', '--dsw-alias-label-secondary', '--dsw-alias-bg-base', 4.5],
  ['暗 · 次要文本 / 卡片', '--dsw-alias-label-secondary', '--dsw-alias-bg-layer-1', 4.5],
  ['暗 · 辅助文本 / 卡片', '--dsw-alias-label-tertiary', '--dsw-alias-bg-layer-1', 3.0],
  ['暗 · 辅助文本 / 应用底', '--dsw-alias-label-tertiary', '--dsw-alias-bg-base', 3.0],
  ['暗 · 主按钮字 / 主按钮', '--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-fill', 4.5],
  ['暗 · 主按钮字 / 主按钮 hover', '--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-hover', 4.5],
  ['暗 · 成功 / 应用底', '--dsw-alias-state-success-primary', '--dsw-alias-bg-base', 4.5],
  ['暗 · 成功 / 成功底色', '--dsw-alias-state-success-primary', '--dsw-alias-state-success-tertiary', 4.5],
  ['暗 · 错误 / 应用底', '--dsw-alias-state-error-primary', '--dsw-alias-bg-base', 4.5],
  ['暗 · 错误 / 错误底色', '--dsw-alias-state-error-primary', '--dsw-alias-state-error-tertiary', 4.5],
  ['暗 · 警告 / 应用底', '--dsw-alias-state-warn-primary', '--dsw-alias-bg-base', 4.5],
  ['暗 · 警告 / 警告底色', '--dsw-alias-state-warn-primary', '--dsw-alias-state-warn-tertiary', 4.5],
  ['暗 · 亮标签 / 亮底色', '--dsw-alias-label-primary', '--dsw-alias-state-business-tertiary', 4.5],
  ['暗 · 辅助 / 第三档灰', '--dsw-alias-label-tertiary', '--dsw-alias-bg-layer-3', 3.0]
];

const rows = [];
for (const [label, fgTok, bgTok, min] of PAIRS) {
  const isDark = label.startsWith('暗');
  const map = isDark ? darkMap : lightMap;
  const pageBase = isDark ? DARK_BASE : LIGHT_BASE;
  const fgRaw = resolveToken(map, fgTok), bgRaw = resolveToken(map, bgTok);
  if (fgRaw === null || bgRaw === null) { failures.push(label + ' 令牌未解析: ' + (fgRaw === null ? fgTok : bgTok)); continue; }
  const fg = parseColor(fgRaw), bg0 = parseColor(bgRaw);
  if (!fg || !bg0) { failures.push(label + ' 颜色无法解析: ' + fgRaw + ' / ' + bgRaw); continue; }
  const bg = over(bg0, pageBase);
  const fgc = over(fg, bg);
  const r = ratio(fgc, bg);
  const ok = r >= min;
  if (!ok) failures.push(label + ' 对比度 ' + r.toFixed(2) + ' < ' + min);
  const grade = r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA-large' : 'FAIL';
  rows.push([label, fgRaw, bgRaw, r.toFixed(2), grade, ok ? 'PASS' : 'FAIL']);
}

/* ── C. 彩色白名单审计 ─────────────────────────────────────────────────── */
const patchesCss = manifest.contributes.patches ? readFileSync(join(skinDir, manifest.contributes.patches), 'utf8') : '';
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
function colorsOf(css) { return [...new Set((stripComments(css).match(COLOR_RE) ?? []))]; }
const palette = new Set();
for (const c of colorsOf(skinCss)) { const p = parseColor(c); if (p) palette.add([Math.round(p.r), Math.round(p.g), Math.round(p.b)].join(',')); }
const patchColors = colorsOf(patchesCss);
const offenders = [];
for (const c of patchColors) {
  const p = parseColor(c);
  if (!p) continue;
  // 灰色（R=G=B）与调色板内颜色放行
  const gray = p.r === p.g && p.g === p.b;
  const inPalette = palette.has([Math.round(p.r), Math.round(p.g), Math.round(p.b)].join(','));
  if (!gray && !inPalette) offenders.push(c);
}
if (offenders.length > 0) failures.push('patches.css 引入白名单外彩色: ' + offenders.join(', '));

/* ── 报告 ─────────────────────────────────────────────────────────────── */
console.log('codex-ink 皮肤验收 · ' + skinDir);
console.log('skin.json  : id=' + manifest.id + ' v' + manifest.version + ' accent=' + manifest.accent);
console.log('');
console.log('B. WCAG 对比度实测（' + rows.length + ' 组，★ 为辅助/占位级 3:1 档）');
console.log('   ' + 'PASS'.padEnd(5) + 'RATIO'.padStart(7) + '  GRADE'.padEnd(11) + 'PAIR');
let passCount = 0;
for (const [label, fg, bg, r, grade, ok] of rows) {
  if (ok === 'PASS') passCount++;
  console.log('   ' + ok.padEnd(5) + r.padStart(7) + '  ' + grade.padEnd(11) + label + '  [' + fg + ' on ' + bg + ']');
}
const aaa = rows.filter((r) => r[4] === 'AAA').length;
console.log('');
console.log('   通过 ' + passCount + '/' + rows.length + '；其中 AAA ' + aaa + ' 组');
console.log('');
console.log('C. 彩色白名单：skin.css 调色板 ' + palette.size + ' 色；patches.css 引用 ' + patchColors.length + ' 色，白名单外彩色 ' + offenders.length + ' 个');
console.log('');
if (failures.length === 0) {
  console.log('RESULT: ALL PASS');
  process.exit(0);
}
console.log('RESULT: ' + failures.length + ' FAILURE(S)');
for (const f of failures) console.log('  ✗ ' + f);
process.exit(1);
