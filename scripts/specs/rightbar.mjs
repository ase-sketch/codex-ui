/**
 * 右栏（文件 / 浏览器 / 终端）三件套：
 *   ① 面板顶沿边框阴影（与中列同源）；
 *   ② 左边框淡细（压掉宿主 dockkit 的 1px l4，边界只剩中列环）+ 分界线拖拽柄悬停：2px 纵向渐变；
 *   ③ 空栏 guide「展开选择组件」：平行（无胶囊）、图标 20、无描述、快捷键灰底 pill。
 * 宿主样式取 ui-theme / layout / sidebar-right / sidebar-terminal / primitives，dockkit 在前端主样式表里。
 * before 页 = 皮肤剥掉 ⑯ 段与 window-shadow 的右栏段，另把中列 / 面板阴影压成 none，只作对照。
 */
import { cssAfter, cssFor, frontendCss, mapFor, themeLayers } from '../lib/host.mjs';

function probeRightbar() {
  const cs = (el, p) => (el ? getComputedStyle(el, p) : null);
  const q = (s) => document.querySelector(s);
  const panel = q('[data-sidebar-right-panel]');
  const handle = q('[data-side="rightbar"]');
  const handleLeft = q('[data-side="sidebar"]');
  const entry = q('[data-sidebar-right-guide-entry]');
  const desc = entry.querySelectorAll('span:nth-child(2) > span');
  const keys = entry.lastElementChild;
  const toggle = q('[data-sidebar-right-toggle]');
  const pane = q('[data-dockkit-host="dock"] [data-dockkit-pane]');
  const side = cs(q('[data-slot=sidebar]').parentElement);
  const term = (() => {
    const row = q('[data-sidebar-right-guide-entry="terminal"]');
    if (!row) return { missing: true };
    const icon = row.querySelector(':scope > span:nth-child(2)');
    const text = row.querySelector(':scope > span:nth-child(3)');
    const title = text?.querySelector(':scope > span:nth-child(1) > span:first-child');
    const chev = row.querySelector('button[aria-haspopup="menu"]');
    const r = row.getBoundingClientRect();
    const tr = title?.getBoundingClientRect();
    const files = q('[data-sidebar-right-guide-entry="workspace"]');
    return {
      border: cs(row).borderTopWidth, bg: cs(row).backgroundColor,
      iconBox: cs(icon).width, iconSvg: icon.querySelector('svg') ? cs(icon.querySelector('svg')).width : 'none',
      desc: text?.querySelector(':scope > span:nth-child(2)') ? cs(text.querySelector(':scope > span:nth-child(2)')).display : 'absent',
      chev: chev ? cs(chev).display + '/' + Math.round(chev.getBoundingClientRect().width) : 'missing',
      titleCenterDelta: tr ? Math.round((tr.top + tr.height / 2 - (r.top + r.height / 2)) * 10) / 10 : 'n/a',
      rowH: Math.round(r.height * 10) / 10, filesRowH: files ? Math.round(files.getBoundingClientRect().height * 10) / 10 : -1,
      keysH: row.querySelector(':scope > span:has(kbd)') ? cs(row.querySelector(':scope > span:has(kbd)')).height : 'missing',
    };
  })();
  const line = (el) => ({ opacity: cs(el, '::before').opacity, width: cs(el, '::before').width, grad: /linear-gradient/.test(cs(el, '::before').backgroundImage), bg: cs(el, '::before').backgroundImage, content: cs(el, '::before').content });
  return {
    panelShadow: cs(panel).boxShadow !== 'none',
    panelBox: cs(panel).boxShadow,
    panelTop: Math.round(panel.getBoundingClientRect().top),
    panelH: Math.round(panel.getBoundingClientRect().height),
    centerBox: cs(q('[data-slot=main]').parentElement).boxShadow,
    paneBorder: cs(pane).borderLeftWidth + ' ' + cs(pane).borderLeftColor,
    handleBefore: line(handle),
    handleLeftBefore: line(handleLeft),
    hero: cs(q('[data-sidebar-right-guide] > span[aria-hidden]')).display,
    after: cs(q('[data-sidebar-right-guide]'), '::after').display,
    entry: { border: cs(entry).borderTopWidth, bg: cs(entry).backgroundColor, minH: cs(entry).minHeight, radius: cs(entry).borderTopLeftRadius, width: cs(entry).width },
    iconBox: cs(entry.querySelector('span:first-child')).width,
    desc: desc.length > 1 ? cs(desc[1]).display : 'absent',
    keys: { h: cs(keys).height, radius: cs(keys).borderTopLeftRadius, bg: cs(keys).backgroundColor },
    toggle: { bg: cs(toggle).backgroundColor, radius: cs(toggle).borderTopLeftRadius },
    sidebarBorder: side.borderRightColor + '|' + side.borderRightWidth + '|' + side.borderRightStyle,
    term,
  };
}

/** 宿主样式：令牌层 + AppFrame + SidebarRight + GuideBody + ShortcutKeys + dockkit + Button + TerminalGuide，外加类名映射。 */
function hostParts(host) {
  const layout = host.file('@deepseek-ai/dsh-client-ui-layout/lib/client.js');
  const right = host.file('@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js');
  const terminal = host.file('@deepseek-ai/dsh-client-ui-sidebar-terminal/lib/client.js');
  const prim = (f) => host.file('@deepseek-ai/dsh-client-ui-primitives/lib/' + f);
  /* dockkit 的类名形如 _tabCell_<哈希>_<行号>，哈希随构建变：先从 tabCell 认出哈希，再按它收规则。 */
  const front = frontendCss(host);
  const hash = /\._tabCell_(\w+?)_\d+/.exec(front)?.[1];
  if (hash === undefined) throw new Error('前端样式表里找不到 dockkit 的 _tabCell_ 类名');
  const dockCss = [...front.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes('_' + hash + '_')).map((m) => m[0]).join('\n');
  const dock = (key) => {
    const m = new RegExp('\\._' + key + '_([\\w-]+)').exec(dockCss);
    if (m === null) throw new Error('dockkit 里没有类名 ' + key);
    return '_' + key + '_' + m[1];
  };
  const css = [
    themeLayers(host),
    cssFor(layout, '@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css'),
    cssFor(right, '@deepseek-ai/dsh-client-ui-sidebar-right/SidebarRight.module.css'),
    cssFor(right, '@deepseek-ai/dsh-client-ui-sidebar-right/GuideBody.module.css'),
    prim('ShortcutKeys.module.css').replace(/^\s*}\s*/, ''),
    dockCss,
    prim('Button.module.css').replace(/^[\s\S]*?(?=\/\*|\.)/, ''),
    cssAfter(terminal, 'TerminalGuide.module.css.mjs'),
  ].map((text) => '<style>' + text + '</style>').join('');
  return {
    css,
    F: mapFor(layout, 'AppFrame_module_css_default'),
    P: mapFor(right, 'SidebarRight_module_css_default'),
    G: mapFor(right, 'GuideBody_module_css_default'),
    T: mapFor(terminal, 'TerminalGuide_module_css_default'),
    D: Object.fromEntries(['tabCell', 'tabHost', 'tabHostHeader', 'tabHostBody', 'stripTabs', 'stripFill', 'stripChrome', 'pane'].map((k) => [k, dock(k)])),
  };
}

async function rightbar(t) {
  const { css, F, P, G, T, D } = hostParts(t.host);
  const svg = (d, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor"/></svg>`;
  const entry = (icon, title, desc, combo, kind) => `<div class="${G.entryCell}"><button type="button" class="${G.entry}" data-sidebar-right-guide-entry="${kind}">`
    + `<span class="${G.entryIcon}">${svg(icon, 20)}</span><span class="${G.entryText}"><span class="${G.entryTitle}">${title}</span><span class="${G.entryDescription}">${desc}</span></span>`
    + `<span class="keys">${combo.split('+').map((k, i) => (i ? '<kbd class="separator">+</kbd>' : '') + '<kbd class="key">' + k + '</kbd>').join('')}</span></button></div>`;
  /* TerminalGuide（terminal 插件注册的自定义卡）：button.main 绝对定位点击层在前，子序 button→icon→text(titleRow+description)→keys。 */
  const termEntry = `<div class="${G.entryCell}"><div class="${T.entry}" data-sidebar-right-guide-entry="terminal">
<button type="button" class="button ghost md ${T.main}" aria-label="新建终端 在会话工作区运行命令" aria-keyshortcuts="Control+\`"></button>
<span class="${T.icon}" aria-hidden="true">${svg('M2 3l4 4-4 4M8 11h6', 26)}</span>
<span class="${T.text}"><span class="${T.titleRow}"><span class="${T.title}" aria-hidden="true">新建终端</span><button type="button" class="button ghost md ${T.trigger}" aria-label="选择 Shell" aria-haspopup="menu" aria-expanded="false">${svg('M3 5.5 8 10.5 13 5.5', 14)}</button></span>
<span class="${T.description}" aria-hidden="true">在会话工作区运行命令</span></span>
<span class="${T.shortcut} keys"><kbd class="key">Ctrl</kbd><kbd class="separator">+</kbd><kbd class="key">\`</kbd></span></div></div>`;
  const stage = `<div class="${F.frame}" style="grid-template-columns:300px 1fr 474px">
<div class="${F.sidebarCol}" style="height:720px"><div data-slot="sidebar"></div></div>
<div class="${F.centerCol}" style="height:720px;position:relative"><div data-slot="main" style="display:contents"></div></div>
<div class="${F.rightbarCol}" data-rightbar-col="true" style="height:720px">
<div class="${P.panel}" data-sidebar-right-session="s1" data-sidebar-right-panel="push" data-sidebar-right-open="true" style="width:474px;--dsh-sidebar-width:474px"><div class="${P.panelBody}">
<div class="${D.tabCell}" data-dockkit-host="dock" data-dockkit-column="0" style="display:flex;flex:1">
<section class="${D.pane}" data-dockkit-content="tab2" data-dockkit-pane="pane1" data-dockkit-pane-active="true" data-dockkit-column="0" style="display:flex;flex:1">
<div class="${D.tabHost}" style="display:flex;flex-direction:column;flex:1;min-width:0">
<div class="${D.tabHostHeader}" style="display:flex;align-items:center;height:36px;padding:0 8px">
<div class="${D.stripTabs}" style="display:flex"><span style="font:13px/20px inherit;padding:4px 9px">开始</span></div><div class="${D.stripFill}"></div>
<div class="${D.stripChrome}"><button type="button" class="${P.iconButton}" aria-label="全屏" data-sidebar-right-mode="fullscreen">${svg('M2 10v3h3M14 6V3h-3', 15)}</button><button type="button" class="${P.iconButton}" aria-label="收起右栏" data-sidebar-right-toggle="true">${svg('M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM9 3v10', 15)}</button></div>
</div>
<div class="${D.tabHostBody}" style="position:relative;flex:1;min-height:0"><div class="${G.guide}" data-sidebar-right-guide="true">
<span class="${G.hero}" aria-hidden="true">${svg('M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M10.5 5.5l-1.6 3.4-3.4 1.6 1.6-3.4z', 56)}</span>
${entry('M1.5 4.5h4l1.2 1.5h7.8v7.5h-13z', '工作区文件', '浏览会话工作区的文件', 'Ctrl+P', 'workspace')}
${entry('M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M1.5 8h13M8 1.5c2 1.8 3 4 3 6.5s-1 4.7-3 6.5c-2-1.8-3-4-3-6.5s1-4.7 3-6.5', '浏览器', '浏览网页', 'Ctrl+T', 'browser')}
${termEntry}
</div></div></div></section></div></div></div></div>
<div class="${F.handle}" data-side="sidebar" style="left:300px"></div>
<div class="${F.handle}" data-side="rightbar" style="left:calc(100% - 474px)"></div>
</div>`;
  const html = (theme, titlebar = true) => `<!doctype html><html data-codex-ui data-platform="win32"${titlebar ? ' data-windows-titlebar' : ''}><head><meta charset="utf-8">${css}<style id="codex-ui-theme">${theme}</style>
<style>[data-dockkit-pane]{border-left:1px solid rgba(13,13,13,.24)}</style>
<style>html{--dsh-windows-titlebar-height:36px}html,body{height:100%}body{margin:0;background:var(--dsw-specific-sidebar-fill);font-family:"Segoe UI","Microsoft YaHei",sans-serif}</style></head><body>${stage}</body></html>`;
  /* before 页：剥掉 ⑯ 段与 window-shadow 的右栏段，再把中列的发丝线 + 环境影压成 none —— 本组修复项在对照上必须有真实差异。 */
  const before = t.theme({ 'patches.css': [['⑯ 右栏展开引导（', '⑰ composer 底部控件（']], 'window-shadow.css': [['右栏面板：左沿只留 l1 发丝线', null]] })
    /* 中列那支阴影 0.6.3 起是 0 0 13px @7%（亮）/ 0 0 24px @50%（暗）：两个值都要剥掉，
       否则 before 页还带着影，本组的负对照就是空的。 */
    .replace(/box-shadow:\s*0 0 0 0\.5px var\(--dsw-alias-border-l2\),\s*0 0 (13px rgba\(13, 13, 13, 0\.07\)|24px rgba\(0, 0, 0, 0\.5\));/g, 'box-shadow: none;');

  const open = async (theme, titlebar) => {
    const page = await t.page({ width: 1000, height: 780, dpr: 2 });
    await page.setContent(html(theme, titlebar), 600);
    return page;
  };
  const pb = await open(before);
  const pa = await open(t.theme());
  const was = await pb.evaluate(probeRightbar);
  const idle = await pa.evaluate(probeRightbar);
  /* 悬停左分界线柄（8px 骑跨 300 分界）→ 读 ::before；再悬停右分界线柄（骑跨 526，取柄内偏右一点避开中列右沿）。 */
  await pa.move(300, 390);
  await t.sleep(500);
  const hoverLeft = await pa.evaluate(probeRightbar);
  await pa.move(528, 390);
  await t.sleep(500);
  const hovered = await pa.evaluate(probeRightbar);
  /* web 页最后开：headless 单窗口只有前台页签处理 :hover，先开会抢走 after 页的前台态。 */
  const pw = await open(t.theme(), false);
  const web = await pw.evaluate(probeRightbar);
  const after = idle;
  t.log('BEFORE ' + JSON.stringify(was));
  t.log('IDLE   ' + JSON.stringify(idle));
  t.log('HOVER-L ' + JSON.stringify(hoverLeft.handleLeftBefore) + ' HOVER-R ' + JSON.stringify(hovered.handleBefore));

  t.check('面板有边框阴影', after.panelShadow === true, after.panelBox);
  t.check('面板左沿 0.5px l1 发丝线', /rgba\(13, 13, 13, 0\.07\) 0px 0px 0px 0\.5px/.test(after.panelBox), after.panelBox);
  t.check('面板左沿不糊影（影只往上泄）', /rgba\(13, 13, 13, 0\.05\) 0px -12px 24px -12px/.test(after.panelBox), after.panelBox);
  t.check('面板顶沿贴标题栏条下沿', after.panelTop === 36, after.panelTop);
  t.check('面板撑满列高(塌高即回归)', after.panelH === 720, after.panelH);
  t.check('中列 0.5px l2 发丝线', /rgba\(13, 13, 13, 0\.12\) 0px 0px 0px 0\.5px/.test(after.centerBox), after.centerBox);
  /* 0.6.3 起环境影按 Codex 实测拟合（SSE 47 -> 22），判据随之改写：
     旧值 0 0 24px @5% 是照抄源码 token 的那一支，实测偏散偏浅。 */
  t.check('中列全向环境影 13px @7%（0.6.3 实测拟合；旧值 24px @5%）', after.centerBox.includes('rgba(13, 13, 13, 0.07) 0px 0px 13px'), after.centerBox);
  t.check('栏内 pane 的 1px l4 深边框被压掉', after.paneBorder === '0px rgb(0, 0, 0)' && was.paneBorder === '1px rgba(13, 13, 13, 0.24)', after.paneBorder + ' / 对照 ' + was.paneBorder);
  t.check('右栏悬停线默认隐藏', idle.handleBefore.opacity === '0', idle.handleBefore.opacity);
  t.check('右栏悬停线出现', hovered.handleBefore.opacity === '1', hovered.handleBefore.opacity);
  t.check('右栏悬停线宽 2px', hovered.handleBefore.width === '2px', hovered.handleBefore.width);
  t.check('右栏悬停线纵向渐变', hovered.handleBefore.grad === true);
  t.check('左分界线无悬停线（静默）', idle.handleLeftBefore.content === 'none' && idle.handleLeftBefore.bg === 'none', idle.handleLeftBefore.content);
  t.check('左分界线无悬停线（悬停仍是静默）', hoverLeft.handleLeftBefore.content === 'none' && hoverLeft.handleLeftBefore.bg === 'none', hoverLeft.handleLeftBefore.content);
  t.check('罗盘 hero 隐藏', after.hero === 'none', after.hero);
  t.check('底部占位移除', after.after === 'none', after.after);
  t.check('条目无描边', after.entry.border === '0px', after.entry.border);
  t.check('条目无底色', /rgba\(0, 0, 0, 0\)|transparent/.test(after.entry.bg), after.entry.bg);
  t.check('条目行高 52', after.entry.minH === '52px', after.entry.minH);
  t.check('条目圆角 12', after.entry.radius === '12px', after.entry.radius);
  t.check('条目宽 380', after.entry.width === '380px', after.entry.width);
  t.check('图标 20', after.iconBox === '20px', after.iconBox);
  t.check('描述行隐藏', after.desc === 'none', after.desc);
  t.check('快捷键 pill 高 24', after.keys.h === '24px', after.keys.h);
  t.check('快捷键 pill 圆角 12', after.keys.radius === '12px', after.keys.radius);
  t.check('快捷键 pill 灰底', after.keys.bg === 'rgb(241, 241, 239)', after.keys.bg);
  t.check('收起按钮灰底', after.toggle.bg === 'rgb(241, 241, 239)', after.toggle.bg);
  t.check('收起按钮圆角 12', after.toggle.radius === '12px', after.toggle.radius);
  t.check('终端行无描边', after.term.border === '0px', after.term.border);
  t.check('终端行无底色', /rgba\(0, 0, 0, 0\)|transparent/.test(after.term.bg), after.term.bg);
  t.check('终端行小字隐藏', after.term.desc === 'none', after.term.desc);
  t.check('终端图标 20', after.term.iconBox === '20px', after.term.iconBox);
  t.check('终端图标 svg 20', after.term.iconSvg === '20px', after.term.iconSvg);
  t.check('终端标题垂直居中', Math.abs(after.term.titleCenterDelta) <= 1, after.term.titleCenterDelta);
  t.check('终端行高与标准行一致', after.term.rowH === after.term.filesRowH, after.term.rowH + ' / ' + after.term.filesRowH);
  t.check('选 Shell chevron 保留', /^flex\/20|^block\/20|inline-flex\/20/.test(after.term.chev), after.term.chev);
  t.check('终端快捷键 pill 高 24', after.term.keysH === '24px', after.term.keysH);
  t.check('web 中列全向环境影 13px @7%（与桌面壳同值）', web.centerBox.includes('rgba(13, 13, 13, 0.07) 0px 0px 13px'), web.centerBox);
  t.check('web 中列 0.5px l2 发丝线', /rgba\(13, 13, 13, 0\.12\) 0px 0px 0px 0\.5px/.test(web.centerBox), web.centerBox);
  t.check('web 侧栏边界 l1 细线', /rgba\(13, 13, 13, 0\.07\)\|(0\.5|1)px\|solid/.test(web.sidebarBorder), web.sidebarBorder);
  t.check('web 面板上沿影（负 spread）', /rgba\(13, 13, 13, 0\.05\) 0px -12px 24px -12px/.test(web.panelBox), web.panelBox);
  t.check('web 面板撑满列高', web.panelH === 720, web.panelH);

  await t.shot(pb, 'rightbar-before.png');
  await t.shot(pa, 'rightbar-after.png');
  await t.shot(pw, 'rightbar-web.png');
}

export default { rightbar };
