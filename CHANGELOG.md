# Changelog

[简体中文](CHANGELOG.zh-CN.md)

## 0.1.0 - 2026-09-26

Initial release.

- Window edges: the conversation window gets a 0.5px hairline plus a 24px ambient shadow; the right panel keeps a
  hairline on its left edge and bleeds its shadow upward only, using a negative spread.
- Dividers: the right handle shows a 2px center-darkest gradient on hover; the left divider stays a static hairline.
- Theme colors copied from the Codex color picker: light `#339CFF` / `#FFFFFF` / `#1A1C1F`, dark `#0169CC` / `#111111` / `#FCFCFC`.
  The dark ramp is re-anchored on `#111111`.
- ⑰: the add button carries no box until hover; the model and permission controls share the same hover chip `#F2F2F3`.
- ⑫: the model menu matches Codex; while a write is pending the trailing check becomes a spinner and the cursor turns to progress.
- ⑯: right panel guide entries flattened, including a targeted rule for the terminal plugin custom card.
- ⑬ ⑭: composer header turned blank; card geometry, shadow, tool row and hero layout.
- ②: sidebar colors and column alignment.
- Installers and verification: `install-plugin.mjs` (duplicate registration detection and cleanup), `install-skin.mjs`
  (SHA256 drift check), `audit-codex-ink.mjs`, four fixture suites, and the `live-gui-probe.mjs` live probe.
