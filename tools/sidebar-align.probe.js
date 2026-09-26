(async () => {
  const plugin = document.getElementById('codex-ui-theme');
  if (plugin === null) throw new Error('codex-ui theme style tag missing');
  const cls = JSON.parse(document.body.dataset.cls);
  const q = (c) => '.' + CSS.escape(c);
  const rect = (root, sel) => {
    const el = root.querySelector(sel);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    return { l: +(r.left - base.left).toFixed(2), r: +(r.right - base.left).toFixed(2), w: +r.width.toFixed(2) };
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
    newSessionBox: rect(root, q(cls.S.newSession)),
    panelRowBox: rect(root, q(cls.S.panelRow)),
    projectRowBox: rect(root, q(cls.R.projectRow))
  });
  const left = document.querySelector('.plain');
  plugin.disabled = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const before = read(left);
  plugin.disabled = false;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const after = read(document.querySelectorAll('.col')[1]);
  return JSON.stringify({ before, after });
})()
