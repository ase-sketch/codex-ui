# Changelog

[简体中文](CHANGELOG.zh-CN.md)

## 0.1.2 - 2026-09-26

Aligned to the Codex desktop app's own tokens (app `26.727.4816.0`, `resources/app.asar` → `webview/assets/app-*.css`).

- Motion: `--dsw-motion-fast/base/slow` 100/160/240ms → 150/200/300ms; `--dsw-ease` → `cubic-bezier(.4, 0, .2, 1)`,
  from Codex `--transition-duration-basic`, `--transition-duration-relaxed` and `--default-transition-timing-function`.
- Focus ring: ink → Codex `--color-border-focus` (`#339cff`; dark `rgba(51,156,255,.7)`), in all four stylesheets.
- Pending spinner: 620ms → 1s linear, from Codex `--animate-spin`.
- Dark composer chip hover: derived 6% → 8%, from `--color-background-button-secondary-hover`.
- `hero-verify`: hover assertions wait for the transition to settle; added a focus-ring assertion (8 total).
- `README`: new "Codex source alignment" section listing token sources and the deliberate differences.

## 0.1.1 - 2026-09-26

Build, checks and CI. No change to what the plugin renders beyond the template header comment.

- Build: scoping and artifact generation moved to `src/build.mjs`; `scripts/install-plugin.mjs` and the new
  `scripts/build.mjs` both call it, so `theme.css` and `client.js` cannot drift from each other.
- Check: `scripts/check-repo.mjs` (`npm run check`) verifies syntax, JSON, the manifest, artifact-to-source
  equality, stylesheet hygiene, encoding, bilingual doc pairing and machine-specific paths. It needs no host.
- Host paths: `scripts/host-paths.mjs` resolves `app.asar`, the global `@deepseek-ai` modules and Chromium from
  `DSH_ASAR` / `DSH_GLOBAL_MODULES` / `DSH_CHROME`, a gitignored `scripts/host.local.json`, or a scan of the
  standard locations. The four fixture suites and the live probe no longer hardcode a machine path.
- Live probe: opens a new conversation before timing the pending window, asserts the measured shadows, both
dividers and the pending window (10 assertions), prints `SKIP` for a stage it cannot measure and exits non-zero
on failure.
- CI: `.github/workflows/ci.yml` runs both commands on Ubuntu and Windows, Node 22 and 24.
- npm scripts: `build`, `check`, `install:web`, `install:desktop`.

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
