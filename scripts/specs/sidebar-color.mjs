/**
 * sidebar-color — 侧栏底色的像素验收（侧栏 <-> 主区那一档），亮暗两套都量。
 *
 * 判据不是本皮肤自己定的，来自 Codex 应用的样式表 + 同屏实测：
 *
 *   Codex **没有**「侧栏色」令牌。侧栏（左侧板 + 标题栏条 + frame 底）= --color-surface-tertiary
 *   以 70% 不透明度叠在窗口底上（app-shared-*.css，electron 窗口、左侧板外观非 content-surface）：
 *     .app-shell-left-panel:not([data-app-shell-left-panel-appearance=content-surface])
 *       { background: color-mix(in srgb, var(--color-surface-tertiary) 70%, transparent) }
 *   那 30% 透明意味着渲染值随窗口背后的底而变 —— 所以只认同屏实测值，不认推导值。
 *
 *   同屏实测（避开文字取样）：
 *     亮色  侧栏 246,246,246 · 选中行 233,234,234 · 主区 255,255,255
 *     暗色  侧栏  15, 15, 15 · 选中行  31, 31, 31 · 主区  17, 17, 17
 *   两套里侧栏都**比主区低一档**（亮 255→246、暗 17→15），方向一致。
 *
 * 同一页上并排渲染「新值 / 旧值」两组，同一台无头 Chromium、同一 DPR、同一采样点，
 * 亮暗各截一次（只切 body[data-ds-dark-theme]，不重排版）。旧值那组是反例对照：
 * 它必须复现出旧读数，否则说明夹具分辨不出差别，正面断言就没有意义。
 */

/* Codex 同屏实测（判据；改这里等于改判据，必须同时改 CHANGELOG 与 README 的表）。 */
const CODEX = {
  light: { sidebar: 246, active: 233, content: 255 },
  dark: { sidebar: 15, active: 31, content: 17 },
};
/* 旧值：亮色 #eef4f9 是某次蓝底截图取样，暗色 #181818 是把侧栏当成「表面」那一层。两组都留作反例。 */
const OLD = {
  light: { sidebar: '#eef4f9', active: '#e2e9ed' },
  dark: { sidebar: '#181818', active: '#282828' },
};

const BOX = 200;
const AT = { sidebar: [20, 20], content: [240, 20], active: [460, 20] };
const OLD_AT = { sidebar: [20, 240], content: [240, 240], active: [460, 240] };
const PAGE = { w: 680, h: 460 };

const block = (id, x, y, decl) => '<div id="' + id + '" style="position:absolute;left:' + x + 'px;top:' + y + 'px;'
  + 'width:' + BOX + 'px;height:' + BOX + 'px;' + decl + '"></div>';

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const neutral = (c) => c[0] === c[1] && c[1] === c[2];

async function sidebarColor(t) {
  const page = await t.page({ width: PAGE.w, height: PAGE.h, dpr: 2 });
  const html = '<!doctype html><html data-codex-ui data-platform="win32"><head><meta charset="utf-8">'
    + '<title>sidebar-color</title><style>' + t.theme() + '</style>'
    + '<style>html,body{margin:0}'
    + '.old{--dsw-alias-bg-sidebar:' + OLD.light.sidebar + ';'
    + '--dsw-specific-sidebar-nav-item-active:' + OLD.light.active + '}'
    + 'body[data-ds-dark-theme] .old{--dsw-alias-bg-sidebar:' + OLD.dark.sidebar + ';'
    + '--dsw-specific-sidebar-nav-item-active:' + OLD.dark.active + '}'
    + '</style></head><body>'
    + block('new-sidebar', AT.sidebar[0], AT.sidebar[1], '')
    + block('new-content', AT.content[0], AT.content[1], 'background:var(--dsw-alias-bg-base)')
    + block('new-active', AT.active[0], AT.active[1], 'background:var(--dsw-specific-sidebar-nav-item-active)')
    + '<div class="old">'
    + block('old-sidebar', OLD_AT.sidebar[0], OLD_AT.sidebar[1], '')
    + block('old-content', OLD_AT.content[0], OLD_AT.content[1], 'background:var(--dsw-alias-bg-base)')
    + block('old-active', OLD_AT.active[0], OLD_AT.active[1], 'background:var(--dsw-specific-sidebar-nav-item-active)')
    + '</div>'
    + '<script>'
    + 'document.getElementById("new-sidebar").setAttribute("data-dsh-surface","sidebar");'
    + 'document.getElementById("old-sidebar").setAttribute("data-dsh-surface","sidebar");'
    + '<\/script></body></html>';
  await page.setContent(html, 900);

  /** 截一次当前配色，返回像素读取器。采样倍率从图上反算，不写死。 */
  const capture = async (tag) => {
    const img = await page.pixels({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, scale: 2 });
    await t.shot(page, 'sidebar-color-verify-' + tag + '.png');
    const scale = img.w / PAGE.w;
    if (Math.abs(scale - Math.round(scale)) > 1e-9) throw new Error('截图几何不对：' + img.w + 'x' + img.h);
    const at = (pt) => img.rgb(Math.round((pt[0] + BOX / 2) * scale), Math.round((pt[1] + BOX / 2) * scale));
    return { sidebar: at(AT.sidebar), content: at(AT.content), active: at(AT.active), oldSidebar: at(OLD_AT.sidebar), oldActive: at(OLD_AT.active) };
  };

  const light = await capture('light');
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await t.sleep(400);
  const dark = await capture('dark');

  const suite = (theme, m) => {
    const C = CODEX[theme];
    const name = theme === 'light' ? '亮色' : '暗色';
    t.check(name + ' 侧栏底 = ' + C.sidebar + '（Codex 实测同值，±1）', near(m.sidebar[0], C.sidebar, 1), hex(m.sidebar));
    t.check(name + ' 侧栏底是中性灰（R=G=B）', neutral(m.sidebar), hex(m.sidebar));
    t.check(name + ' 主区底 = ' + C.content, m.content[0] === C.content && neutral(m.content), hex(m.content));
    t.check(name + ' 侧栏 -> 主区 档差 = ' + Math.abs(C.content - C.sidebar),
      Math.abs(m.content[0] - m.sidebar[0]) === Math.abs(C.content - C.sidebar), m.sidebar[0] + ' / ' + m.content[0]);
    t.check(name + ' 层级方向成立：侧栏比主区低一档（侧栏是被压过的衬底）',
      m.content[0] > m.sidebar[0], 'sidebar ' + m.sidebar[0] + ' < content ' + m.content[0]);
    t.check(name + ' 选中行 = ' + C.active + '（Codex 实测同值，±1）', near(m.active[0], C.active, 1) && neutral(m.active), hex(m.active));
    t.check(name + ' 反例对照：旧值仍是旧读数', hex(m.oldSidebar) === OLD[theme].sidebar, hex(m.oldSidebar) + '（期望 ' + OLD[theme].sidebar + '）');
    t.check(name + ' 反例对照：旧选中行仍是旧读数', hex(m.oldActive) === OLD[theme].active, hex(m.oldActive) + '（期望 ' + OLD[theme].active + '）');
  };
  suite('light', light);
  suite('dark', dark);
}

export default { 'sidebar-color': sidebarColor };
