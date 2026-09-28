/**
 * ⑲ --dsw-elevation-* 令牌与 Codex 源码对账。不需要宿主。
 *
 * 判据来源：Codex 桌面端 26.924.2738.0 的 resources/app.asar @67930525 起逐字：
 *   --elevation-stroke:        0 0 0 .5px var(--color-border-strong)
 *   --elevation-stroke-subtle: 0 0 0 .5px rgb(from var(--color-border-strong) r g b / .04)  （暗色 .06）
 *   --elevation-prominent:     var(--elevation-stroke), 0 3px 7.5px #0000000a, 0 0 20px #0000000d
 *   --elevation-sidebar:       var(--elevation-stroke), 0 3px 7.5px #00000008, 0 0 16px #00000005
 *
 * 量四件事：① 亮 / 暗两套下令牌都解析得出来；② --dsw-elevation-prominent 与 Codex 逐字一致（几何 + 两层 alpha）；
 * ③ 亮暗的 prominent 第 2、3 层必须相同 —— Codex 只在 :root 声明一次、没有暗色变体；
 * ④ --dsw-elevation-panel 仍等于 stroke（本皮肤的分层选择，防误改）。
 */

/** 页面里读令牌与菜单面板的计算阴影。 */
function readTokens() {
  const cs = getComputedStyle(document.body);
  const g = (n) => cs.getPropertyValue(n).trim();
  const menu = document.getElementById('m');
  return {
    stroke: g('--dsw-elevation-stroke'), panel: g('--dsw-elevation-panel'),
    prominent: g('--dsw-elevation-prominent'), soft: g('--dsw-elevation-soft'),
    menuShadow: getComputedStyle(menu).boxShadow, menuFill: getComputedStyle(menu).backgroundColor,
  };
}

const layers = (s) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
const hasGeom = (s, ...want) => {
  const m = s.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
  return m !== null && want.every((v, i) => Math.abs(Number(m[i + 1]) - v) < 0.01);
};
const alphaNear = (s, want, tol = 0.006) => {
  const m = s.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
  return m !== null && Math.abs(parseFloat(m[1]) - want) <= tol;
};

async function elevation(t) {
  const page = await t.page({ width: 460, height: 520, dpr: 2 });
  /* 舞台上放一个「菜单面板」，直接吃 --dsw-elevation-prominent。 */
  await page.setContent(`<!doctype html><html data-codex-ui><head><meta charset="utf-8">
<style>${t.theme()}</style>
<style>body{margin:0;font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}
.stage{padding:60px 40px;background:var(--dsw-alias-bg-base)}
.menu{width:320px;padding:8px;border-radius:var(--dsw-radius-menu);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent)}
.row{padding:6px 8px;border-radius:var(--dsw-radius-s);color:var(--dsw-alias-label-primary)}</style></head><body>
<div class="stage"><div class="menu" id="m">
<div class="row">菜单面板 · box-shadow: var(--dsw-elevation-prominent)</div>
<div class="row">Gpt-5.2-Codex High</div><div class="row">DeepSeek V4.1 Flash High</div>
</div></div></body></html>`, 1000);

  const light = await page.evaluate(readTokens);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await t.sleep(400);
  const dark = await page.evaluate(readTokens);
  t.log('LIGHT prominent ' + light.prominent + ' → ' + light.menuShadow);
  t.log('DARK  prominent ' + dark.prominent + ' → ' + dark.menuShadow);

  /* 几何与 alpha 一律读**计算值**（menuShadow）：自定义属性的字面值里 0 spread 会被省略、颜色是 hex，
     直接断言字面值会因记法差异误判。Codex 的两层 alpha #0a / #0d 归一为 0.039 / 0.051。 */
  for (const [tag, v] of [['亮', light], ['暗', dark]]) {
    const L = layers(v.prominent);
    const C = layers(v.menuShadow);
    t.check(tag + '色 --dsw-elevation-prominent 为三层', L.length === 3, L.length + ' 层');
    t.check(tag + '色 层2 几何 = 0 3px 7.5px 0（Codex 逐字）', hasGeom(C[1] ?? '', 0, 3, 7.5, 0), (C[1] ?? '').slice(0, 60));
    t.check(tag + '色 层2 alpha = 3.92%（#0000000a）', alphaNear(C[1] ?? '', 0.039), (C[1] ?? '').slice(0, 60));
    t.check(tag + '色 层3 几何 = 0 0 20px 0（Codex 逐字）', hasGeom(C[2] ?? '', 0, 0, 20, 0), (C[2] ?? '').slice(0, 60));
    t.check(tag + '色 层3 alpha = 5.10%（#0000000d）', alphaNear(C[2] ?? '', 0.051), (C[2] ?? '').slice(0, 60));
    t.check(tag + '色 层1 = --dsw-elevation-stroke', L[0] === v.stroke, (L[0] ?? '').slice(0, 60));
    t.check(tag + '色 --dsw-elevation-panel 仍等于 stroke', v.panel === v.stroke, v.panel);
    t.check(tag + '色 菜单面板确实吃到 prominent', v.menuShadow !== 'none' && v.menuShadow.length > 20, v.menuShadow.slice(0, 70));
  }
  /* 第 1 层是 var(--elevation-stroke)，本来就随主题反相，不参与亮暗同值的比较。 */
  const lit = layers(light.prominent);
  const dk = layers(dark.prominent);
  t.check('亮暗 层2 同值（Codex 无暗色变体）', lit[1] === dk[1], lit[1] + ' | ' + dk[1]);
  t.check('亮暗 层3 同值（Codex 无暗色变体）', lit[2] === dk[2], lit[2] + ' | ' + dk[2]);
  t.check('亮暗 stroke 不同值（描边随主题反相）', light.stroke !== dark.stroke, light.stroke + ' | ' + dark.stroke);
  await t.shot(page, 'elevation-verify.png');
}

export default { elevation };
