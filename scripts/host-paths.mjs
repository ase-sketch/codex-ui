/**
 * host-paths.mjs — 解析验收脚本要读取的宿主路径。
 *
 * 三个路径都跟机器有关，因此按同一优先级解析，仓库里不写死任何一台机器的绝对路径：
 *   1. 环境变量        DSH_ASAR / DSH_GLOBAL_MODULES / DSH_CHROME
 *   2. scripts/host.local.json（本机配置文件，已 gitignore，字段 asar / globalModules / chrome）
 *   3. 常见安装位置扫描（%LOCALAPPDATA%/Programs、/Applications、Playwright 缓存、npm root -g）
 *
 * 找不到时抛出，并打印已尝试的候选与设置方法。
 *
 * 本机配置示例（scripts/host.local.json）：
 *   { "asar": "D:/path/to/DeepSeek Harness/resources/app.asar" }
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 夹具与 CDP 用户目录统一落系统临时目录。 */
export const tempDir = (name) => join(tmpdir(), name);

/** 本机配置：缺失或损坏都当空对象。 */
const localConfig = (() => {
  try {
    return JSON.parse(fs.readFileSync(join(HERE, 'host.local.json'), 'utf8'));
  } catch {
    return {};
  }
})();

const env = (name) => {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
};
const firstExisting = (candidates) => candidates.find((p) => p && fs.existsSync(p)) ?? null;

const localAppData = env('LOCALAPPDATA');
const programFiles = env('ProgramFiles') ?? env('PROGRAMFILES');

/** 桌面壳的 app.asar。 */
export function asarPath() {
  const candidates = [
    env('DSH_ASAR'),
    localConfig.asar,
    localAppData && join(localAppData, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
    localAppData && join(localAppData, 'Programs', 'deepseek-harness', 'resources', 'app.asar'),
    programFiles && join(programFiles, 'DeepSeek Harness', 'resources', 'app.asar'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
  ].filter(Boolean);
  const hit = firstExisting(candidates);
  if (!hit) {
    throw new Error('找不到 app.asar。设 DSH_ASAR=<path>，或写 scripts/host.local.json 的 asar 字段。已尝试：\n  ' + candidates.join('\n  '));
  }
  return hit;
}

/** 全局安装里 @deepseek-ai/dsh 的 node_modules（内含 @deepseek-ai/dsh-client-ui-*）。 */
export function globalModules() {
  const fromNpm = (() => {
    try {
      const root = execFileSync('npm root -g', { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return root ? join(root, '@deepseek-ai', 'dsh', 'node_modules') : null;
    } catch {
      return null;
    }
  })();
  const candidates = [
    env('DSH_GLOBAL_MODULES'),
    localConfig.globalModules,
    fromNpm,
    localAppData && join(localAppData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'),
  ].filter(Boolean);
  const hit = firstExisting(candidates);
  if (!hit) {
    throw new Error('找不到 @deepseek-ai/dsh 的 node_modules。设 DSH_GLOBAL_MODULES=<path>，或写 scripts/host.local.json 的 globalModules 字段。已尝试：\n  ' + candidates.join('\n  '));
  }
  return hit;
}

/** Chromium 可执行文件：扫 Playwright 的浏览器缓存，取版本号最大的一个。 */
export function chromePath() {
  const explicit = env('DSH_CHROME') ?? localConfig.chrome;
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error('DSH_CHROME / host.local.json 指向的文件不存在：' + explicit);
    return explicit;
  }
  const roots = [
    env('PLAYWRIGHT_BROWSERS_PATH'),
    localAppData && join(localAppData, 'ms-playwright'),
    join(homedir(), '.cache', 'ms-playwright'),
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
  ].filter(Boolean);
  const relative = [
    join('chrome-win64', 'chrome.exe'),
    join('chrome-linux', 'chrome'),
    join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const dir of dirs) {
      const hit = firstExisting(relative.map((r) => join(root, dir, r)));
      if (hit) return hit;
    }
  }
  throw new Error('找不到 Playwright 的 Chromium。设 DSH_CHROME=<path>，或先跑 npx playwright install chromium。已扫：\n  ' + roots.join('\n  '));
}
