#!/usr/bin/env node
/**
 * codex-ink 预览图生成器。
 *
 *   node tools/make-preview.mjs
 *
 * 读取 skins/codex-ink/skin.css 的真实令牌，注入 tools/preview/page.html，
 * 产出亮/暗两份自包含 HTML 到 tools/.preview-build/，再由 Edge headless
 * 截图成 preview/light.png 与 preview/dark.png。
 *
 * 预览是皮肤自身令牌的真实渲染，不是 live shell 截图。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const skinDir = join(root, 'skins', 'codex-ink');
const skinCss = readFileSync(join(skinDir, 'skin.css'), 'utf8');
const page = readFileSync(join(here, 'preview', 'page.html'), 'utf8');
const buildDir = join(here, '.preview-build');
mkdirSync(buildDir, { recursive: true });

for (const theme of ['light', 'dark']) {
  const html = page
    .replace('/*{{SKIN_CSS}}*/', () => skinCss)
    .replace('{{DARK_ATTR}}', theme === 'dark' ? ' data-ds-dark-theme' : '');
  const file = join(buildDir, theme + '.html');
  writeFileSync(file, html, 'utf8');
  console.log('wrote ' + file);
}
