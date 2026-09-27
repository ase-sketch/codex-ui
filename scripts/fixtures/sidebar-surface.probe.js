(() => {
  const cols = ['A', 'At'];
  const out = { cols: {} };
  for (const id of cols) {
    const root = document.getElementById('col-' + id);
    if (root === null) { out.cols[id] = null; continue; }
    const list = root.querySelector('[class$="_list"]');
    const fade = root.querySelector('[class$="_fade"]');
    const region = root.querySelector('[data-slot="sidebar.workspaces"]').parentElement;
    const cs = getComputedStyle(list);
    const fr = fade === null ? null : fade.getBoundingClientRect();
    out.cols[id] = {
      maskImage: cs.maskImage,
      maskSize: cs.maskSize,
      maskPosition: cs.maskPosition,
      maskRepeat: cs.maskRepeat,
      webkitMaskImage: cs.webkitMaskImage,
      fadeDisplay: fade === null ? 'missing' : getComputedStyle(fade).display,
      fadeRect: fr === null ? null : { x: fr.x, y: fr.y, w: fr.width, h: fr.height },
      list: box(list),
      region: box(region),
      fill: getComputedStyle(root).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
      rootBg: getComputedStyle(root).backgroundColor,
    };
  }
  function box(el) { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right, left: b.left }; }
  return JSON.stringify(out);
})()
