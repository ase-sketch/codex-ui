/**
 * 侧栏两件事，宿主样式都取 dsh-client-ui-sidebar 的 SidebarRoot 与 workspace 的 WorkspaceBrowser / Rows。
 *   align    「新会话 / 插件」行 ↔「工作区」下方行的图标列 / 文字列对齐（getBoundingClientRect）。
 *   surface  滚动渐隐从宿主的 24px 覆盖层换成 Codex 的 40px mask 斜坡：① 机制（mask-image / 覆盖层 display）；
 *            ② 观感：把底部横带截下来逐像素解码，还原遮罩 alpha 曲线。同一份 DOM 上切 html[data-codex-ui]
 *            得到原生 / 皮肤两态，每态再分不透明 / 半透明侧栏底两列。
 */
import { cssFor, mapFor, themeLayers } from '../lib/host.mjs';

function sidebarHost(host) {
  const sidebar = host.file('@deepseek-ai/dsh-client-ui-sidebar/lib/client.js');
  const workspace = host.file('@deepseek-ai/dsh-client-ui-workspace/lib/client.js');
  const sidebarCss = cssFor(sidebar, '@deepseek-ai/dsh-client-ui-sidebar/SidebarRoot.module.css');
  return {
    sidebarCss,
    css: '<style>' + themeLayers(host) + '</style><style>' + sidebarCss + '</style><style>'
      + cssFor(workspace, '@deepseek-ai/dsh-client-ui-workspace/WorkspaceBrowser.module.css') + '</style><style>'
      + cssFor(workspace, '@deepseek-ai/dsh-client-ui-workspace/Rows.module.css') + '</style>',
    S: mapFor(sidebar, 'SidebarRoot_module_css_default'),
    W: mapFor(workspace, 'WorkspaceBrowser_module_css_default'),
    R: mapFor(workspace, 'Rows_module_css_default'),
  };
}

const svg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="2" fill="none" stroke="currentColor"/></svg>`;

/* ── 列对齐 ────────────────────────────────────────────────────────────── */

/** 左列关掉插件样式表读一遍（原生），右列开着读一遍；位置相对侧栏根 div 左边缘。 */
async function probeAlign(cls) {
  const plugin = document.getElementById('codex-ui-theme');
  const q = (c) => '.' + CSS.escape(c);
  const rect = (root, sel) => {
    const el = root.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    return { l: +(r.left - base.left).toFixed(2), r: +(r.right - base.left).toFixed(2) };
  };
  const read = (root) => ({
    newSessionIcon: rect(root, q(cls.S.newSession) + ' svg'),
    newSessionText: rect(root, q(cls.S.newSessionLabel)),
    panelIcon: rect(root, q(cls.S.panelGlyph)),
    panelText: rect(root, q(cls.S.panelTitle)),
    headerLabel: rect(root, q(cls.W.sectionLabel)),
    projectIcon: rect(root, q(cls.R.projectRow) + ' ' + q(cls.R.folder)),
    projectText: rect(root, q(cls.R.projectRow) + ' ' + q(cls.R.title)),
    sessionText: rect(root, q(cls.R.sessionRow) + ' ' + q(cls.R.title)),
  });
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  plugin.disabled = true;
  await frame();
  const before = read(document.querySelector('.plain'));
  plugin.disabled = false;
  await frame();
  return { before, after: read(document.querySelectorAll('.col')[1]) };
}

async function align(t) {
  const { css, sidebarCss, S, W, R } = sidebarHost(t.host);
  /* rc.2 的新会话按钮多一层 newSessionLabelMask（button > mask > content > svg + label），rc.1 是扁平的。 */
  const masked = /newSessionLabelMask/.test(sidebarCss);
  t.log('New Session DOM：' + (masked ? 'rc.2 嵌套' : 'rc.1 扁平'));
  const NEWCHAT = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.4" fill="none" stroke="currentColor"/><path d="M7 4.6v4.8M4.6 7h4.8" stroke="currentColor"/></svg>';
  const FOLDER = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h4l1.2 1.5h7.8v7.5h-13z" fill="none" stroke="currentColor"/></svg>';
  const label = NEWCHAT + `<span class="${S.newSessionLabel} ${S.wide}">新会话</span>`;
  const group = (name, withSession) => `<div class="${W.groupSection}" style="--dsh-workspace-indent:0px">
<div class="${R.projectRow}" role="treeitem" aria-expanded="true"><span class="${R.slot} ${R.folder}">${FOLDER}</span><span class="${R.slot} ${R.chevron}">${svg(16)}</span><span class="${R.projectText}"><span class="${R.title}">${name}</span></span><span class="${R.rowActions}"></span></div>
${withSession ? `<div role="group"><div class="${R.sessionRow}" role="treeitem"><span class="${R.slot}"></span><span class="${R.title}">/ui-ux-pro-max dsh 模型选择器</span><span class="${R.time}">10分钟</span><span class="${R.rowActions}"></span></div></div>` : ''}
</div>`;
  /* 侧栏外壳 + 工作区浏览器，结构照 shipped 渲染代码，类名取自真实 CSS-Modules 映射；外面是 sidebar 席位出口（display:contents）。 */
  const stage = `<div data-slot="sidebar" style="display:contents"><div class="${S.root}" style="width:280px;height:780px">
<div class="${S.logoRow}" data-window-drag><span class="${S.brand} ${S.wide}"><span class="${S.brandIdentity}"><span class="${S.brandMark}">${svg(24)}</span><span class="${S.brandName}">deepseek</span></span></span><button class="${S.iconButton} ${S.toggle}" aria-label="收起侧边栏">${svg(16)}</button></div>
<button class="${S.newSession}" aria-label="新建会话">${masked ? `<span class="${S.newSessionLabelMask}"><span class="${S.newSessionContent}">${label}</span></span>` : label}<span class="${S.newSessionShortcut}" aria-hidden="true"><span class="keys"><kbd>Ctrl</kbd><kbd>+</kbd><kbd>N</kbd></span></span></button>
<nav class="${S.panelList}" aria-label="全局面板"><button class="${S.panelRow}" aria-label="插件"><span class="${S.panelGlyph}" aria-hidden="true">${svg(16)}</span><span class="${S.panelTitle} ${S.wide}">插件</span></button></nav>
<div class="${S.regionArea}"><div data-slot="sidebar.workspaces" style="display:contents"><div class="${W.root}">
<div class="${W.sectionHeader}"><span class="${W.sectionLabel}">工作区</span><div class="${W.searchSlot}"><div class="${W.search}"><button class="${W.searchButton}" aria-label="搜索会话">${svg(16)}</button></div></div><div class="${W.headerActions}"><button class="${W.iconButton}" aria-label="添加工作区">${svg(16)}</button></div></div>
<div class="${W.listArea}"><div class="${W.list}">${group('PROJIECT', true)}${group('未分组', false)}</div></div>
</div></div></div>
<div class="${S.footArea}"><div class="${S.settingsArea}"></div></div>
</div></div>`;
  const page = await t.page({ width: 1300, height: 900, dpr: 2 });
  /* 左联要「无 codex-ui」：插件样式表加载后 disabled 掉即回到原生。 */
  await page.setContent(`<!doctype html><html data-codex-ui data-platform="win32" data-windows-titlebar><head><meta charset="utf-8">${css}<style id="codex-ui-theme">${t.theme()}</style>
<style>body{margin:0;background:#fff;font-family:"Segoe UI","Microsoft YaHei",sans-serif}.wrap{display:flex;gap:24px;padding:16px;align-items:flex-start}.col>h4{margin:0 0 8px;font:600 12px/18px ui-monospace,Consolas,monospace;color:#8a8a8a}</style></head><body>
<div class="wrap"><div class="col"><h4>原生 shipped（无 codex-ui）</h4><div class="plain">${stage}</div></div><div class="col"><h4>+ codex-ui theme.css</h4>${stage}</div></div></body></html>`, 1200);
  const { before, after } = await page.evaluate(probeAlign, { S, W, R });
  for (const key of Object.keys(after)) t.log(key.padEnd(16) + JSON.stringify(before[key]) + ' → ' + JSON.stringify(after[key]));

  /* 三行的图标列 / 文字列必须落在同一条竖线上。 */
  const ICON = 20;
  const TEXT = 42;
  const near = (v, want) => v !== null && Math.abs(v.l - want) <= 0.5;
  t.check('新会话 图标列 = ' + ICON, near(after.newSessionIcon, ICON), after.newSessionIcon?.l);
  t.check('插件   图标列 = ' + ICON, near(after.panelIcon, ICON), after.panelIcon?.l);
  t.check('工作区 图标列 = ' + ICON, near(after.projectIcon, ICON), after.projectIcon?.l);
  t.check('新会话 文字列 = ' + TEXT, near(after.newSessionText, TEXT), after.newSessionText?.l);
  t.check('插件   文字列 = ' + TEXT, near(after.panelText, TEXT), after.panelText?.l);
  t.check('工作区 文字列 = ' + TEXT, near(after.projectText, TEXT), after.projectText?.l);
  await t.shot(page, 'sidebar-align-verify.png', { x: 0, y: 0, width: 660, height: 830, scale: 2 });
}

/* ── 滚动渐隐 ──────────────────────────────────────────────────────────── */

/** 两列（A 不透明底 / At 半透明底）的滚动容器遮罩、宿主覆盖层与几何。 */
function probeSurface() {
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, h: b.height, right: b.right }; };
  const out = {};
  for (const id of ['A', 'At']) {
    const root = document.getElementById('col-' + id);
    const list = root.querySelector('[class$="_list"]');
    const fade = root.querySelector('[class$="_fade"]');
    const cs = getComputedStyle(list);
    out[id] = {
      maskImage: cs.maskImage, maskSize: cs.maskSize,
      fadeDisplay: fade === null ? 'missing' : getComputedStyle(fade).display,
      list: box(list),
      fill: getComputedStyle(root).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    };
  }
  return out;
}

async function surface(t) {
  const { css, S, W, R } = sidebarHost(t.host);
  const TRANSLUCENT = 'rgba(238, 244, 249, 0.72)';
  /* 不透明那列不写侧栏底：吃宿主令牌 / 皮肤值，跟线上一致；半透明那列写死 rgba(…,0.72)，正是设置卡开关 emit 的那一对声明。
     只写一个 style 属性：HTML 里出现第二个会被整条丢弃，两列几何就不是一回事了。 */
  const column = (id, translucent) => `<div class="col"><h4>${id}</h4>
<div id="col-${id}" class="${S.root}" style="${translucent ? `--dsw-specific-sidebar-fill:${TRANSLUCENT};--dsw-alias-bg-sidebar:${TRANSLUCENT};` : ''}width:240px;height:620px">
<div class="${S.logoRow}"><span class="${S.brand} ${S.wide}"><span class="${S.brandName}">deepseek</span></span><button class="${S.iconButton} ${S.toggle}" aria-label="toggle"></button></div>
<button class="${S.newSession}"><span class="${S.newSessionLabelMask}"><span class="${S.newSessionContent}"><span class="${S.newSessionLabel} ${S.wide}">新会话</span></span></span></button>
<div class="${S.regionArea}"><div data-slot="sidebar.workspaces" style="display:contents"><div class="${W.root}">
<div class="${W.sectionHeader}"><span class="${W.sectionLabel} ${W.wide}">工作区</span></div>
<div class="${W.listArea}"><div class="${W.treeBody} ${W.wide}"><div class="${W.list}"><div class="${W.groupSection}">
${Array.from({ length: 20 }, (_, i) => `<div class="${R.sessionRow}" role="treeitem" data-row-key="r${i}" style="background:#111111"><span class="${R.title}">row ${i}</span></div>`).join('')}
</div></div><span class="${W.fade}"></span></div></div>
</div></div></div>
<div class="${S.footArea}"></div></div></div>`;
  /* 夹具专用：行间距归零 + 滚动容器 padding-bottom 归零 + 滚动条常驻，让底部横带的像素读数只反映遮罩 alpha。
     遮罩挂在滚动容器上、覆盖层挂在它的父盒上，两者几何都不受这几条影响。 */
  const fixtureCss = `.${W.groupSection} > * + * { margin-top: 0 } .${W.list} { padding-bottom: 0; overflow-y: scroll }
body{margin:0;background:#ffffff;font-family:"Segoe UI","Microsoft YaHei",sans-serif}.wrap{display:flex;gap:20px;padding:16px;align-items:flex-start}
.col > h4{margin:0 0 6px;font:600 12px/16px ui-monospace,Consolas,monospace;color:#8a8a8a}`;
  /* html 上先不挂 data-codex-ui：皮肤全部规则都挂在这个属性下，摘掉即原生。 */
  const page = await t.page({ width: 900, height: 760, dpr: 1 });
  await page.setContent(`<!doctype html><html data-platform="win32"><head><meta charset="utf-8">${css}<style>${fixtureCss}</style><style id="codex-ui-theme">${t.theme()}</style></head><body>
<div class="wrap">${column('A', false)}${column('At', true)}</div></body></html>`, 900);

  /** 切皮肤开关，读探针，再截滚动视口底部 60px 的横带并解码。 */
  const measure = async (skinOn, bottom) => {
    await page.evaluate((on) => document.documentElement.toggleAttribute('data-codex-ui', on), skinOn);
    await page.frame();
    const styles = await page.evaluate(probeSurface);
    return { styles, img: bottom === null ? null : await page.pixels({ x: 0, y: Math.round(bottom - 60), width: 900, height: 60, scale: 1 }) };
  };
  const first = await measure(false, null);
  const BOTTOM = first.styles.A.list.y + first.styles.A.list.h;
  const native = await measure(false, BOTTOM);
  const skinned = await measure(true, BOTTOM);

  /** 横带里一列（内容区 x+60..x+120）逐行平均亮度（Rec.601），y = 距滚动视口底边的像素数。 */
  const band = (shot, column) => {
    const { x } = shot.styles[column].list;
    const rows = [];
    for (let i = 0; i < 60; i += 1) {
      let sum = 0;
      for (let px = Math.round(x + 60); px < Math.round(x + 120); px += 1) {
        const [r, g, b] = shot.img.rgb(px, i);
        sum += 0.299 * r + 0.587 * g + 0.114 * b;
      }
      rows.push({ y: 59 - i, lum: sum / (Math.round(x + 120) - Math.round(x + 60)) });
    }
    /* 由亮度反推遮罩 alpha：alpha = (bg − lum) / (bg − ink)，bg / ink 用同一条曲线自标定。 */
    const bg = Math.max(...rows.map((r) => r.lum));
    const span = Math.max(1, bg - Math.min(...rows.map((r) => r.lum)));
    return { lum: (y) => rows.find((r) => r.y === y).lum, alpha: (y) => (bg - rows.find((r) => r.y === y).lum) / span };
  };
  const A = band(native, 'A');
  const At = band(native, 'At');
  const B = band(skinned, 'A');
  const Bt = band(skinned, 'At');
  t.log('遮罩 alpha（y = 距视口底边）  A(原生) B(codex-ui) | At(原生·半透明) Bt(codex-ui·半透明)');
  for (let y = 56; y >= 0; y -= 4) t.log(String(y).padStart(3) + '   ' + [A, B, At, Bt].map((c) => c.alpha(y).toFixed(3)).join('   '));

  const maxOver = (ys, fn) => Math.max(...ys.map(fn));
  const headDiff = maxOver([4, 8, 12, 16, 20, 24], (y) => Math.abs(A.alpha(y) - B.alpha(y)));
  const tailDiff = maxOver([28, 32, 36, 40, 44], (y) => Math.abs(A.alpha(y) - B.alpha(y)));
  const bottomOpaque = Math.abs(A.lum(0) - B.lum(0));
  const bottomTranslucent = Bt.lum(0) - At.lum(0);
  const fillInvariance = maxOver([0, 2, 4, 8, 16, 24, 40], (y) => Math.abs(B.lum(y) - Bt.lum(y)));
  const on = skinned.styles.A;
  const off = native.styles.A;

  t.check('原生侧栏：滚动容器没有 mask', off.maskImage === 'none', off.maskImage);
  t.check('codex-ui：滚动容器有 2 层 mask', (on.maskImage.match(/linear-gradient\(/g) ?? []).length === 2, on.maskImage);
  t.check('两列几何一致（宽度/高度/列表底边）', Math.abs(native.styles.At.list.h - off.list.h) < 0.5 && Math.abs(native.styles.At.list.y - off.list.y) < 0.5,
    'At h=' + native.styles.At.list.h.toFixed(1) + ' A h=' + off.list.h.toFixed(1));
  t.check('codex-ui：第 2 层 mask 宽 = 12px（让开滚动条槽）', /(^|[\s,])12px\s+100%(,|$)/.test(on.maskSize.replace(/\s+/g, ' ')), on.maskSize);
  t.check('codex-ui：第 1 层 mask 宽 = 100% − 12px', on.maskSize.replace(/\s+/g, ' ').startsWith('calc(100% - 12px) 100%'), on.maskSize);
  t.check('原生侧栏：宿主覆盖层在渲染', off.fadeDisplay !== 'none', off.fadeDisplay);
  t.check('codex-ui：宿主覆盖层已让位', on.fadeDisplay === 'none', on.fadeDisplay);
  /* e0 / 85 / 2e / 00 是 Codex 原文的十六进制 alpha；浏览器把它算成 0.88 / 0.52 / 0.18 / 0。 */
  t.check('codex-ui：渐变里有 Codex 的四段 alpha 停点（e0/85/2e/00 → .88/.52/.18/0）',
    ['0.88)', '0.52)', '0.18)', '0) 100%'].every((stop) => on.maskImage.includes('(0, 0, 0, ' + stop)), on.maskImage);
  /* 如实记录：不透明底下宿主那 24px 覆盖层与 Codex 前 24px 斜坡形状重合，本层不是为了外观而做的；
     差别在半透明底（设置卡的半透明侧栏）—— 覆盖层挡不住内容，mask 与底色无关。 */
  t.check('不透明底下：前 24px 与宿主覆盖层逐点差 ≤ 0.13（如实记录：外观几乎等价）', headDiff <= 0.13, headDiff.toFixed(3));
  t.check('不透明底下：24–40px 尾巴确有差别（这是本层唯一的形状差）', tailDiff > 0.02, tailDiff.toFixed(3));
  t.check('不透明底：两种机制的底边结果一致（|A−B| ≤ 15）', bottomOpaque <= 15, bottomOpaque.toFixed(1));
  t.check('半透明底：宿主覆盖层挡不住内容（At 底边比 Bt 暗 ≥ 40）', bottomTranslucent >= 40, bottomTranslucent.toFixed(1));
  t.check('codex-ui 的 mask 对侧栏底色 alpha 免疫（|B−Bt| ≤ 15）', fillInvariance <= 15, fillInvariance.toFixed(1));

  await page.evaluate(() => document.documentElement.setAttribute('data-codex-ui', ''));
  await page.frame();
  await t.shot(page, 'sidebar-surface-verify.png', { x: 0, y: Math.round(BOTTOM - 120), width: 560, height: 130, scale: 2 });
}

export default { align, surface };
