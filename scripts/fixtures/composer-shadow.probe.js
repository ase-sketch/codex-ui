(() => {
  /* 深色令牌声明在 body[data-ds-dark-theme] 上（不是 :root），
     所以取令牌一律以 body 为先、html 兜底 —— 只读 documentElement 会在深色下读到亮色值。 */
  const b = getComputedStyle(document.body);
  const h = getComputedStyle(document.documentElement);
  const tok = (n) => b.getPropertyValue(n).trim() || h.getPropertyValue(n).trim();
  const card = document.querySelector('[data-composer-card]');
  const scroll = document.querySelector('[data-conversation-scroll]');
  const cs = getComputedStyle(card);
  const r = card.getBoundingClientRect();
  return JSON.stringify({
    shadow: cs.boxShadow,
    bg: cs.backgroundColor,
    radius: cs.borderTopLeftRadius,
    varShadow: getComputedStyle(scroll).getPropertyValue('--dcu-composer-shadow').trim(),
    canvasBase: tok('--dsw-alias-bg-base'),
    surface: tok('--dsw-composer-surface'),
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
  });
})()