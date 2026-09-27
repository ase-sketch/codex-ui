#!/usr/bin/env node
/**
 * make-verify-profile.mjs — 造一个一次性的 DSH profile，用来在真 GUI 里验收本插件。
 *
 * 为什么需要它：组合包页的设置卡只在**插件管理页**存在时才出现，而插件管理页在常规 web
 * profile 里被禁用（`- id: web-ui-plugin-manager / disabled: true`）。桌面壳里它开着，但桌面
 * profile 由 Electron 独占、CLI 进不去。所以验收用的 profile 要自己造一个：插件管理页开着、
 * 只挂本插件，且**不碰任何现有 profile**（node_modules 里的包用 junction 指向源 profile）。
 *
 *   node scripts/make-verify-profile.mjs [--home <dir>] [--source <profile>] [--name <profile 名>]
 *
 * 之后：
 *   DSH_HOME=<home> node scripts/install-plugin.mjs --profile <name> --write
 *   DSH_HOME=<home> dsh --profile <name> --port 3098 --no-open
 *   node scripts/settings-page-verify.mjs --url "http://127.0.0.1:3098/?token=..."
 */
import fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = dirname(HERE);
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const HOME = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh');
const SOURCE = arg('source', 'web');
const NAME = arg('name', 'verify');
const VERIFY_HOME = arg('home', join(tmpdir(), 'codex-ui-verify-home'));
const PROFILE = join(VERIFY_HOME, 'profiles', NAME);
const SOURCE_MODULES = join(HOME, 'profiles', SOURCE, 'node_modules');

if (!fs.existsSync(SOURCE_MODULES)) {
  console.error('源 profile 的 node_modules 不存在：' + SOURCE_MODULES + '（用 --source 指定别的 profile）');
  process.exit(1);
}
fs.mkdirSync(join(PROFILE, 'node_modules'), { recursive: true });

/** 用 junction 把源 profile 的包目录借过来，避免复制几百 MB。 */
const linkScope = (scope) => {
  const from = join(SOURCE_MODULES, scope);
  const to = join(PROFILE, 'node_modules', scope);
  if (!fs.existsSync(from)) return scope + ': 源里没有，跳过';
  if (fs.existsSync(to)) return scope + ': 已存在';
  fs.symlinkSync(from, to, 'junction');
  return scope + ': junction';
};
const notes = ['@deepseek-ai', '@linxin666'].map(linkScope);

fs.writeFileSync(join(PROFILE, 'package.json'), JSON.stringify({
  name: 'dsh-profile-' + NAME,
  private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@linxin666/dsh-web-all', 'codex-ui'] } },
  dependencies: { 'codex-ui': 'link:./vendor/codex-ui' },
}, null, 2) + '\n');
/* 插件管理页在 web profile 里是关的，验收 profile 要开着才有点得进去的组合包页。 */
fs.writeFileSync(join(PROFILE, 'cordis.patch.yml'), '- id: web-ui-plugin-manager\n  disabled: false\n');

console.log('DSH_HOME = ' + VERIFY_HOME);
console.log('profile  = ' + PROFILE);
console.log('借用     : ' + notes.join(' ｜ '));
console.log('下一步   : DSH_HOME=' + VERIFY_HOME + ' node scripts/install-plugin.mjs --profile ' + NAME + ' --write');
console.log('本插件目录: ' + PLUGIN_DIR);
