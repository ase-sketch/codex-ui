(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(150); } return null; };
  try {
    const slot = await waitFor(() => document.querySelector('[data-slot="conversation.input.model"]'), 30000);
    if (slot === null) return JSON.stringify({ stage: 'no-slot', text: document.body.innerText.slice(0, 160) });
    const hostRoot = slot.firstElementChild;
    const btn = slot.querySelector('.codex-mp-trigger');
    const out = {
      hostMarked: hostRoot !== null && hostRoot.hasAttribute('data-codex-ui-model-host'),
      hostDisplay: hostRoot === null ? null : getComputedStyle(hostRoot).display,
      ourBtn: btn !== null,
      triggerCount: slot.querySelectorAll('.codex-mp-trigger').length,
    };
    if (btn === null) { out.stage = 'no-button'; out.slotHtml = slot.outerHTML.slice(0, 300); return JSON.stringify(out); }
    out.triggerText = btn.innerText.replace(/\n/g, ' ');
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    if (document.querySelector('.codex-mp-popover[data-open="true"]') === null) { btn.click(); await sleep(500); }
    const pop = await waitFor(() => document.querySelector('.codex-mp-popover[data-open="true"]'), 5000);
    if (pop === null) { out.stage = 'popover-closed'; return JSON.stringify(out); }
    const rail = pop.querySelector('.codex-mp-rail');
    const ticks = [...pop.querySelectorAll('.codex-mp-tick')];
    const thumb = pop.querySelector('.codex-mp-rail-thumb');
    const range = pop.querySelector('.codex-mp-rail-range');
    out.stage = 'open';
    out.pop = box(pop);
    out.rows = pop.querySelectorAll('.codex-mp-row').length;
    out.groups = [...pop.querySelectorAll('.codex-mp-group')].map(g => g.textContent);
    out.railEmpty = rail.getAttribute('data-empty') === 'true';
    out.railRect = box(rail);
    out.railCount = Number(rail.dataset.count || 0);
    out.valuenow = Number(rail.getAttribute('aria-valuenow'));
    out.valuetext = rail.getAttribute('aria-valuetext');
    out.tickLabels = ticks.map(t => t.getAttribute('aria-label'));
    out.tickCx = ticks.map(t => Math.round(t.getBoundingClientRect().x + t.getBoundingClientRect().width / 2));
    out.selectedTick = ticks.findIndex(t => t.dataset.selected === 'true');
    out.thumbX = thumb === null ? null : Math.round(thumb.getBoundingClientRect().x);
    out.rangeW = range === null ? null : Math.round(range.getBoundingClientRect().width);
    out.popovers = document.querySelectorAll('.codex-mp-popover').length;
    out.hostMenus = document.querySelectorAll('body > div[role="menu"][aria-busy]').length;
    return JSON.stringify(out);
  } catch (e) { return 'ERR ' + (e && e.stack ? e.stack : String(e)); }
})()