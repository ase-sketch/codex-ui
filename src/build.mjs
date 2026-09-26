/**
 * build.mjs — 由 skins/codex-ink 的源样式生成 theme.css 与 client.js。
 *
 * 只有这一处实现作用域化与拼装。安装脚本（scripts/install-plugin.mjs）与 CI 校验
 * （scripts/check-repo.mjs）都调用它，产物一致性与安装结果由同一条代码路径决定。
 *
 * 作用域化规则：
 *   :root          → html[data-codex-ui]
 *   html[...]      → 原样（已带作用域）
 *   其它选择器      → html[data-codex-ui] 前缀
 *   @keyframes / @font-face / @property / @page / @counter-style → 原样直通，不加前缀
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** src/ 目录。 */
export const HERE = dirname(fileURLToPath(import.meta.url));
/** 插件根目录。 */
export const PLUGIN_DIR = dirname(HERE);
/** 皮肤源目录。 */
export const SKIN_DIR = join(PLUGIN_DIR, 'skins', 'codex-ink');
/** 作用域根选择器。 */
export const ATTR = 'html[data-codex-ui]';
/** 模板里的样式占位符（连同 null 一起替换，未替换的模板本身也是可解析的 JS）。 */
export const CSS_PLACEHOLDER = '/*__CODEX_UI_CSS__*/ null';
/** 模板文件。 */
export const TEMPLATE = join(HERE, 'client.template.js');
/**
 * 拼进 theme.css 的源文件，顺序即层叠顺序。
 * [文件名, 该层的说明] —— 说明写进分隔注释。
 */
export const SKIN_PARTS = [
  ['skin.css', 'L1/L2 令牌与排版层'],
  ['patches.css', 'L3 组件层'],
  ['sidebar-align.css', 'L3 侧栏对齐层'],
  ['window-shadow.css', 'L3 窗口边缘阴影层'],
  ['composer.css', 'L3 输入区完整层'],
];

/** 单条选择器作用域化。 */
export const scopeSelector = (sel) => {
  const s = sel.trim();
  if (s === '') return sel;
  if (s === ':root') return ATTR;
  if (s.startsWith('html[')) return s;
  return ATTR + ' ' + s;
};

/** 按顶层逗号切分选择器组（括号、方括号内的逗号不算）。 */
export const splitSelectors = (text) => {
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

/** 内容本身就是选择器或规则体、不能加前缀的 at 规则。 */
const PASSTHROUGH = new Set(['keyframes', 'font-face', 'property', 'page', 'counter-style']);

/** 递归作用域化一段 CSS。 */
export function scopeCss(css) {
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

/** 哈希类名锚点计数（[class=、[class*=、[class$=、[class^=]）。 */
export const hashAnchors = (text) => (text.match(/\[class[$*^]?=/g) ?? []).length;

/**
 * 生成产物，不落盘。
 * @returns {{themeCss: string, clientJs: string, sources: Record<string, number>, scopedBytes: number, hashAnchors: Record<string, number>}}
 */
export function build() {
  const sources = {};
  const anchors = {};
  const blocks = SKIN_PARTS.map(([file, label]) => {
    const text = fs.readFileSync(join(SKIN_DIR, file), 'utf8');
    sources[file] = text.length;
    anchors[file] = hashAnchors(text);
    return '/* ==== ' + label + '（源：skins/codex-ink/' + file + '）==== */\n' + text;
  });
  const themeCss = scopeCss(blocks.join('\n\n'));
  const tplSrc = fs.readFileSync(TEMPLATE, 'utf8');
  if (!tplSrc.includes(CSS_PLACEHOLDER)) {
    throw new Error('模板缺少占位符 ' + CSS_PLACEHOLDER + '：' + TEMPLATE);
  }
  /* 用函数式替换：CSS 里的 $& / $' 等序列不会被当成替换模式展开。 */
  const clientJs = tplSrc.replace(CSS_PLACEHOLDER, () => JSON.stringify(themeCss));
  return { themeCss, clientJs, sources, scopedBytes: themeCss.length, hashAnchors: anchors };
}
