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
    heroRow: { present: row !== null, bg: cs(row, 'background-color'), radius: cs(row, 'border-top-left-radius'), height: row ? Math.round(row.getBoundingClientRect().height) : null },
    card: { radius: cs(card, 'border-top-left-radius'), shadow: cs(card, 'box-shadow'), border: cs(card, 'border-top-width') },
  });
})()
