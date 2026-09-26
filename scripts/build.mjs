#!/usr/bin/env node
/**
 * build.mjs — 生成 theme.css 与 client.js。
 *
 *   node scripts/build.mjs           # 落盘
 *   node scripts/build.mjs --check   # 只比对，产物过期则 exit 1
 *
 * 实际生成逻辑在 src/build.mjs；本文件只负责写盘与报告。
 */
import fs from 'node:fs';
import { join } from 'node:path';
import { build, PLUGIN_DIR, SKIN_PARTS } from '../src/build.mjs';

const check = process.argv.includes('--check');
const { themeCss, clientJs, sources, scopedBytes, hashAnchors } = build();

const sourceBytes = Object.values(sources).reduce((a, b) => a + b, 0);
console.log('源样式: ' + sourceBytes + ' B → theme.css ' + scopedBytes + ' B');
for (const [file] of SKIN_PARTS) {
  console.log('  ' + file.padEnd(20) + sources[file] + ' B, hash 锚点 ' + hashAnchors[file]);
}
console.log('client.js: ' + clientJs.length + ' B');

const targets = [['theme.css', themeCss], ['client.js', clientJs]];
let stale = 0;
for (const [name, text] of targets) {
  const path = join(PLUGIN_DIR, name);
  const current = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : null;
  const same = current === text;
  if (!same) stale += 1;
  if (check) {
    console.log((same ? 'OK   ' : 'STALE') + ' ' + name);
  } else {
    if (!same) fs.writeFileSync(path, text);
    console.log((same ? 'OK   ' : 'WROTE') + ' ' + name);
  }
}
if (check && stale > 0) {
  console.error('\n产物与源样式不一致：先跑 node scripts/build.mjs 再提交。');
  process.exit(1);
}
