#!/usr/bin/env node
/**
 * live/settings.mjs — 对真 GUI 取证：官方插件管理 → codex-ui 组合包页上那张设置卡。
 *
 *   node scripts/live/settings.mjs --url "http://127.0.0.1:3099/?token=…" [--shots <目录>]
 *
 * 为什么必须真 GUI：座位 plugins.bundle.config 只在插件管理页存在时才出现，卡片的注入面（scope / locale）
 * 由那一页的 owner 提供，夹具复刻不出来。profile 要启用插件管理页（web 模板默认启用）。
 * 覆盖：9 行结构、默认不覆盖、半透明开关与强调色写入、模型选择器开关、主题分段（点下去立刻变色、
 * 逐帧无中间态）、刷新后仍在；收工把主题、覆盖与开关都复位。
 */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clickByText, dismissOnboarding, findByText, launch, login, openHome, sleep } from '../lib/cdp.mjs';
import { checklist, summarize } from '../lib/checks.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const TOKEN_URL = arg('url', '');
const SHOTS = arg('shots', join(tmpdir(), 'codex-ui-shots'));
if (TOKEN_URL === '') {
  console.error('缺少 --url "http://127.0.0.1:<port>/?token=…"（dsh web 启动时打印）');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

/* ── 页面里跑的函数 ───────────────────────────────────────────────────── */

const cardShape = () => {
  const rows = [...document.querySelectorAll('.cx-row')];
  return {
    form: document.querySelectorAll('.cx-form').length,
    rows: rows.length,
    labels: rows.map((r) => r.querySelector('.cx-row__label')?.textContent ?? ''),
    overrideAttr: document.documentElement.hasAttribute('data-codex-ui-theme'),
  };
};
const rootState = () => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return {
    overrideAttr: root.hasAttribute('data-codex-ui-theme'),
    link: cs.getPropertyValue('--dsw-alias-link').trim(),
    sidebar: cs.getPropertyValue('--dsw-alias-bg-sidebar').trim(),
    skin: root.hasAttribute('data-codex-ui'),
    tag: [...document.querySelectorAll('style')].find((s) => s.dataset.pluginCss === 'codex-ui/settings-override.css')?.textContent ?? '',
  };
};
/** 深色令牌落在 body 上（不在 html），生效值一律读 body。 */
const bodyVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const isDark = () => document.body.hasAttribute('data-ds-dark-theme');
const selectedSegment = () => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim() ?? null;
const pickerSwitch = () => {
  const el = document.querySelector('[aria-label="Codex 模型选择器"]');
  return el === null ? null : el.getAttribute('aria-checked') ?? String(el.checked);
};
/** 按 aria-label 找元素中心。 */
const boxByLabel = (label) => {
  const r = document.querySelector('[aria-label="' + label + '"]')?.getBoundingClientRect();
  return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
};
/** 设置卡里第一个可见的「重置」按钮。 */
const resetButton = () => {
  const b = [...document.querySelectorAll('.cx-row button')].find((x) => x.textContent.trim() === '重置' && x.offsetParent !== null);
  const r = b?.getBoundingClientRect();
  return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
};
/**
 * 逐帧采样「屏幕上真画出来的颜色」：沿祖先找第一个不透明底色（多数元素是透明的），记在三处取样点上。
 * 主题切换的闪是 1–3 帧的事，截图拍不到，这里按 rAF 记下来，回到 Node 侧找既不是起点也不是终点的帧。
 */
const startSampler = () => {
  const backdrop = (x, y) => {
    for (let el = document.elementFromPoint(x, y); el !== null; el = el.parentElement) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor);
      if (m !== null && (m[4] === undefined || Number(m[4]) > 0.99)) return m[1] + ',' + m[2] + ',' + m[3] + '@' + (el.getAttribute('data-slot') || String(el.className).slice(0, 20) || el.tagName);
    }
    return 'none';
  };
  window.__frames = [];
  const loop = () => {
    window.__frames.push([[640, 450], [1100, 450], [140, 700]].map(([x, y]) => backdrop(x, y)).join(' | '));
    if (window.__frames.length < 2000) window.__sampler = requestAnimationFrame(loop);
  };
  loop();
};
const stopSampler = () => { cancelAnimationFrame(window.__sampler); return window.__frames; };
/** 中间帧 = 既不是第一帧、也不是最后一帧的画面。 */
const intermediate = (frames) => frames.filter((f, i) => i > 0 && i < frames.length - 1 && f !== frames[0] && f !== frames.at(-1));

/* ── 流程 ─────────────────────────────────────────────────────────────── */

const browser = await launch();
const { results, check } = checklist();
try {
  const page = await browser.newPage({ width: 1280, height: 900, dpr: 1.5 });
  const origin = await login(page, TOKEN_URL);
  const shot = (name) => page.screenshot({ path: join(SHOTS, 'settings-page-' + name + '.png') });
  const clickLabel = async (label) => {
    const box = await page.evaluate(boxByLabel, label);
    if (box !== null) await page.click(box.x, box.y);
    return box;
  };
  const visibleButtons = () => page.evaluate(() => [...document.querySelectorAll('button, a, [role=tab]')].filter((e) => e.offsetParent !== null)
    .map((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30)).filter(Boolean).slice(0, 60));
  /** 侧栏「插件」→ 组合包页「查看 codex-ui」。 */
  const openCard = async () => {
    if (await clickByText(page, '^插件$') === null) throw new Error('侧栏里没有「插件」入口（插件管理页被停用了？）可见按钮：' + JSON.stringify(await visibleButtons()));
    await sleep(2000);
    if (await clickByText(page, '^查看 codex-ui$') === null) throw new Error('已安装分组里没有 codex-ui 的「查看」入口。可见按钮：' + JSON.stringify(await visibleButtons()));
    await sleep(2500);
  };
  /** 卡上的「重置」一个个点掉，直到一个不剩（每行一个，只在该行有覆盖时出现）。 */
  const resetAll = async () => {
    for (let round = 0; round < 20; round += 1) {
      const box = await page.evaluate(resetButton);
      if (box === null) return;
      await page.click(box.x, box.y);
      await sleep(800);
    }
  };
  for (const text of await dismissOnboarding(page)) console.log('DISMISS ' + text);
  await openCard();

  /* 等宿主把设置文档送达：覆盖层要等 scope 有值才打属性，早读会把「还没到」当成「没有覆盖」。
     然后清掉上一次留下的覆盖（反复点「重置」直到属性消失），起始态固定为亮色。 */
  await sleep(4000);
  await resetAll();
  const segmentNow = await page.evaluate(selectedSegment);
  if (segmentNow !== null && segmentNow !== '亮色' && await clickByText(page, '^亮色$') !== null) {
    await sleep(1200);
    console.log('RESET 主题回亮色（原 ' + segmentNow + '）');
  }

  const shape = await page.evaluate(cardShape);
  check('组合包页上有配置卡', shape.form === 1, JSON.stringify(shape));
  check('九行：主题/强调色/背景/前景/UI 字体/代码字体/半透明侧边栏/Codex 模型选择器/对比度', shape.rows === 9 && shape.labels.length === 9, JSON.stringify(shape.labels));
  check('默认值下不产生覆盖（无 data-codex-ui-theme）', shape.overrideAttr === false, 'attr=' + shape.overrideAttr);
  const bodyLink = await page.evaluate(bodyVar, '--dsw-alias-link');
  check('默认强调色仍是皮肤给的那一支（亮 #339cff / 暗 #0169cc）', ['#339cff', '#0169cc'].includes(bodyLink.toLowerCase()), 'link=' + bodyLink);
  await shot('default');

  /* 半透明侧边栏 */
  const toggled = await clickLabel('半透明侧边栏');
  check('找到半透明侧边栏开关', toggled !== null, JSON.stringify(toggled));
  await sleep(1500);
  const afterToggle = await page.evaluate(rootState);
  check('开覆盖后打上 data-codex-ui-theme', afterToggle.overrideAttr === true, JSON.stringify(afterToggle).slice(0, 300));
  check('侧栏填充转为半透明 rgba(255,255,255,0.72)', afterToggle.sidebar.replace(/\s/g, '') === 'rgba(255,255,255,0.72)', 'sidebar=' + afterToggle.sidebar);
  check('覆盖样式表只写覆盖项', afterToggle.tag.includes('--dsw-alias-bg-sidebar') && afterToggle.tag.includes('data-codex-ui-theme'), afterToggle.tag.slice(0, 200));
  await shot('translucent');

  /* 强调色：焦点 + 输入 + 回车 */
  const hexBox = await clickLabel('强调色 hex');
  check('找到强调色的十六进制输入框', hexBox !== null, JSON.stringify(hexBox));
  if (hexBox !== null) {
    await page.send('Input.insertText', { text: '#ff0000' });
    await page.key('Enter', 13);
    await sleep(1500);
    const { link } = await page.evaluate(rootState);
    check('回车提交后强调色生效', link.toLowerCase() === '#ff0000', 'link=' + link);
    const marked = await page.evaluate(() => document.querySelector('.cx-row .cx-row__label span:nth-child(2)') !== null);
    check('该行显示「已覆盖」徽标', marked === true, 'marked=' + marked);
    await shot('accent');
  }

  /* 关掉「Codex 模型选择器」：刷新后在首页量宿主那一格是否复原（组合包页上没有输入区可量）。 */
  check('模型选择器开关默认开着', (await page.evaluate(pickerSwitch)) === 'true', 'checked=' + (await page.evaluate(pickerSwitch)));
  const pickerOff = await clickLabel('Codex 模型选择器');
  check('找到模型选择器开关', pickerOff !== null, JSON.stringify(pickerOff));
  await sleep(1500);
  check('开关写入后显示为关', (await page.evaluate(pickerSwitch)) === 'false', 'checked=' + (await page.evaluate(pickerSwitch)));

  /* 主题那一行写的是宿主主题偏好，整个应用一起变。 */
  const switches = [];
  const segment = await page.evaluate(selectedSegment);
  console.log('THEME 切换前 ' + JSON.stringify({ segment, base: await page.evaluate(bodyVar, '--dsw-alias-bg-base'), dark: await page.evaluate(isDark) }));
  check('主题行存在且显示了当前偏好', segment !== null, 'segment=' + segment);
  const toDark = await findByText(page, '^深色$');
  check('找到「深色」分段', toDark !== null, JSON.stringify(toDark));
  if (toDark !== null) {
    await page.evaluate(startSampler);
    /* 预览层：点下去要立刻变色，而不是等设置文档往返（那一次实测 780–824ms）。 */
    await page.click(toDark.x, toDark.y);
    const t0 = Date.now();
    let flipMs = null;
    for (let i = 0; i < 50 && flipMs === null; i += 1) {
      if (await page.evaluate(isDark)) flipMs = Date.now() - t0;
      else await sleep(40);
    }
    check('点下去立刻变色（≤300ms，预览层生效）', flipMs !== null && flipMs <= 300, 'flip=' + flipMs + 'ms');
    await sleep(1500);
    switches.push(await page.evaluate(stopSampler));
    const settled = await page.evaluate(() => ({ preview: document.documentElement.getAttribute('data-codex-ui-preview'), scheme: document.documentElement.style.colorScheme }));
    check('文档落地后预览标记被摘掉（没有卡在预览态）', settled.preview === null, JSON.stringify(settled));
    const dark = {
      dark: await page.evaluate(isDark),
      base: await page.evaluate(bodyVar, '--dsw-alias-bg-base'),
      segment: await page.evaluate(selectedSegment),
      swatch: await page.evaluate(() => [...document.querySelectorAll('.cx-swatch')].find((x) => x.getAttribute('aria-label') === '背景')?.value ?? null),
    };
    check('切深色后整个应用进了深色（body[data-ds-dark-theme]）', dark.dark === true, JSON.stringify(dark));
    /* 深色窗口背景自 0.5.6 起是 #111111（#181818 是表面 / 侧栏那一层）。 */
    check('深色底色生效 #111111', String(dark.base).toLowerCase() === '#111111', 'base=' + dark.base);
    check('分段显示深色', dark.segment === '深色', 'segment=' + dark.segment);
    check('下面三行改为编辑深色那一套（背景色块 = #111111）', String(dark.swatch).toLowerCase() === '#111111', 'swatch=' + dark.swatch);
    await shot('dark');
  }

  /* 刷新后覆盖仍在（设置是持久化的，不是页面内存） */
  await openHome(page, origin);
  await page.waitFor(() => document.documentElement.hasAttribute('data-codex-ui-theme'), { timeout: 10000 });
  const afterReload = await page.evaluate(rootState);
  check('刷新后皮肤仍生效', afterReload.skin === true, JSON.stringify({ ...afterReload, tag: undefined }));
  check('刷新后覆盖仍在（强调色 #ff0000）', afterReload.link.toLowerCase() === '#ff0000', 'link=' + afterReload.link);
  check('刷新后侧栏半透明仍在', afterReload.sidebar.replace(/\s/g, '') === 'rgba(255,255,255,0.72)', 'sidebar=' + afterReload.sidebar);
  check('刷新后主题仍是深色（写的是宿主偏好，不是页面状态）', (await page.evaluate(isDark)) === true);
  const seatOff = await page.evaluate(() => {
    const slot = document.querySelector('[data-slot="conversation.input.model"]');
    return { slot: slot !== null, ours: document.querySelectorAll('.codex-mp-trigger').length, host: slot === null ? null : [...slot.children].filter((c) => getComputedStyle(c).display !== 'none').length };
  });
  check('选择器关着：席位里没有自建触发器、宿主那一格可见', seatOff.slot === true && seatOff.ours === 0 && seatOff.host >= 1, JSON.stringify(seatOff));

  /* 收工：走回组合包页，主题还给亮色（同样逐帧采样），覆盖与开关全部「重置」（开关回到默认开），探针不留现场。 */
  await dismissOnboarding(page);
  if ((await page.evaluate(cardShape)).form === 0) await openCard();
  const toLight = await findByText(page, '^亮色$');
  if (toLight !== null) {
    await page.evaluate(startSampler);
    await page.click(toLight.x, toLight.y);
    await sleep(1500);
    switches.push(await page.evaluate(stopSampler));
  }
  await resetAll();
  await sleep(400);
  check('收工复位：模型选择器回到默认开', (await page.evaluate(pickerSwitch)) === 'true', 'checked=' + (await page.evaluate(pickerSwitch)));
  const restored = { segment: await page.evaluate(selectedSegment), base: await page.evaluate(bodyVar, '--dsw-alias-bg-base') };
  check('收工复位回亮色', String(restored.base).toLowerCase() === '#ffffff' && restored.segment === '亮色', JSON.stringify(restored));
  /* 两趟都要真的采到了翻转（首帧 ≠ 末帧），中间帧才有意义。 */
  const flashes = switches.flatMap(intermediate);
  const frames = switches.reduce((n, f) => n + f.length, 0);
  check('主题切换（亮 → 暗 → 亮）逐帧没有中间态（有效底色只取起点或终点）',
    switches.length === 2 && switches.every((f) => f[0] !== f.at(-1)) && flashes.length === 0,
    '中间帧 ' + flashes.length + ' / 共 ' + frames + ' 帧' + (flashes.length ? '：' + flashes.slice(0, 3).join(' ／ ') : ''));

  const noisy = page.logs.filter((l) => l.type === 'error' || l.type === 'warning').map((l) => l.type + ': ' + l.text.slice(0, 300)).concat(page.errors);
  if (noisy.length > 0) console.log('\n页面日志：\n  ' + noisy.slice(0, 12).join('\n  '));
} catch (e) {
  check('探针运行出错', false, e.stack ?? e.message);
} finally {
  await browser.close();
}
summarize(results);
