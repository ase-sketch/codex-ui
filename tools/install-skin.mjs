#!/usr/bin/env node
/**
 * install-skin.mjs — dsh-workbench 皮肤正本 → $DSH_HOME/skins 的同步器与漂移检测器。
 *
 * 正本（唯一真源）：<workbench>/skins/<skin-id>/
 * 安装副本（部署产物）：$DSH_HOME/skins/<skin-id>/   ← skin-center 只从这里加载
 *
 * 用法：
 *   node tools/install-skin.mjs              # 只读体检：逐文件 SHA256 比对，有漂移则退出码 1
 *   node tools/install-skin.mjs --write      # 把正本覆盖到安装副本（缺目录则创建）
 *   node tools/install-skin.mjs --skin=xxx   # 指定皮肤 id（默认 codex-ink）
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKBENCH = dirname(HERE);
const args = process.argv.slice(2);
const write = args.includes('--write');
const skinId = (args.find((a) => a.startsWith('--skin=')) ?? '--skin=codex-ink').slice('--skin='.length);
const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh');
const source = join(WORKBENCH, 'skins', skinId);
const installed = join(home, 'skins', skinId);

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = join(dir, e.name);
  return e.isDirectory() ? walk(full, base) : [relative(base, full).replaceAll('\\', '/')];
});

if (!existsSync(source)) { console.error('source skin missing: ' + source); process.exit(2); }
const files = walk(source).sort();
let drift = 0;
console.log('source     : ' + source);
console.log('installed  : ' + installed + (existsSync(installed) ? '' : '   (缺失)'));
console.log('');
for (const rel of files) {
  const s = sha256(join(source, rel));
  const target = join(installed, rel);
  const i = existsSync(target) ? sha256(target) : null;
  const status = i === null ? 'MISSING' : i === s ? 'same' : 'DRIFT';
  if (status !== 'same') drift += 1;
  console.log(`  ${status.padEnd(7)} ${rel}  ${s.slice(0, 12)}` + (i && i !== s ? `  (installed ${i.slice(0, 12)})` : ''));
  if (write && status !== 'same') {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, rel), target);
  }
}
console.log('');
if (write) { console.log(drift === 0 ? 'OK: 安装副本已与正本一致（无需写入）' : `WROTE: ${drift} 个文件已同步到安装副本`); process.exit(0); }
console.log(drift === 0 ? 'OK: 正本与安装副本逐文件 SHA256 全等' : `DRIFT: ${drift} 个文件不一致（用 --write 同步）`);
process.exit(drift === 0 ? 0 : 1);
