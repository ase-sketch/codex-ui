(() => {
  const H = '[data-slot="conversation.session.header"]';
  const q = (s) => document.querySelector(s);
  const vis = (el) => el ? el.getClientRects().length > 0 : null;
  const cs = (el, p) => el ? getComputedStyle(el).getPropertyValue(p) : null;
  const row = q('[data-phase=hero] [class$=_heroWorkspaceRow]');
  const card = q('[data-composer-card]');
  /* ⑬·3c 放开后，槽里的条目按**官方真实 class** 建模：量它的取色是否跟着本皮肤令牌走。 */
  const label = q('[data-slot="conversation.session.header.actions"] span');
  return JSON.stringify({
    header: {
      title: vis(q(H + ' [class$=_crumbs]')),
      presetBadge: vis(q('[data-slot="conversation.session.header.actions"] span')),
      utilityItem: vis(q('[data-slot="conversation.session.header.utilities"] span')),
      tabs: vis(q(H + ' [data-conversation-tabs]')),
      corner: vis(q('[data-conversation-header-corner]')),
    },
    presetLabel: {
      vis: vis(label),
      color: cs(label, 'color'),
      bg: cs(label, 'background-color'),
      radius: cs(label, 'border-top-left-radius'),
      h: label ? Math.round(label.getBoundingClientRect().height) : null,
      font: cs(label, 'font-size'),
    },
    card: { radius: cs(card, 'border-top-left-radius'), shadow: cs(card, 'box-shadow'), border: cs(card, 'border-top-width'), token: cs(document.documentElement, '--dsw-radius-card').trim(), h: card ? Math.round(card.getBoundingClientRect().height) : null, w: card ? Math.round(card.getBoundingClientRect().width) : null, bg: cs(card, 'background-color'), padTop: cs(card, 'padding-top') },
    heroRow: { present: row !== null, bg: cs(row, 'background-color'), radius: cs(row, 'border-top-left-radius'), height: row ? Math.round(row.getBoundingClientRect().height) : null },
    /* ⑭·2 输入区纵向留白：Codex 实测（同一字号标定）编辑区 ≈79、底衬 ≈12，本层按此对齐。 */
    editor: (() => { const e = q('[data-lexical-editor=true]'); return e ? { minH: cs(e, 'min-height'), h: Math.round(e.getBoundingClientRect().height) } : null; })(),
    footPad: (() => { const s = q('[data-input-scroll]'); const r = s && s.nextElementSibling; return r ? cs(r, 'padding-bottom') : null; })(),
  });
})()