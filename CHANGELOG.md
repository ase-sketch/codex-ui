# Changelog

[简体中文](CHANGELOG.zh-CN.md)

## 0.2.0 - 2026-09-27

A settings page inside the plugin manager, plus the dark base re-anchored on the Codex app's own defaults.

### Settings page (slot `plugins.bundle.config`)

- A config card on the plugin manager's bundle page: theme / accent / background / foreground / UI font / code font /
  translucent sidebar / contrast. The seat key is the **package name** `codex-ui`; the form namespace is the
  **profile entry id** `codex-ui`. They are not the same string.
- The host half exports `Config`: 11 fields, each `.default(x).volatile()`. The settings service projects volatile
  fields only and exposes a form only for entries that have them — no `Config`, no card.
- The override layer is a pure function (`src/override.js`): at the defaults it emits an empty string and never sets
  `data-codex-ui-theme`, so an untouched install looks byte-for-byte like 0.1.2. When something is overridden it writes
  one runtime `<style>` whose selector carries one extra attribute (specificity +1); `skins/*.css` is never touched.
- Instant write, no save button; text inputs commit on Enter or blur and every write is read back; overridden rows show
  a badge and a Reset control.
- Contrast is normalised to the Codex defaults (45 light / 60 dark means unchanged): text tiers mix towards ink and the
  neutral alpha ladder is scaled (clamped to 0.5×–2×). **This is a simplification** — the app's `Rdi + zdi·contrast`
  blend is not reproduced, and the README says so.
- The translucent sidebar has no window layer to reveal on the web and shares the surface colour in dark, so the switch
  also turns the sidebar row fills translucent. Recorded as a gap, not as an equivalent.
- New `skins/codex-ink/settings.css` (tokens only, zero colors) and `scripts/settings-page-verify.mjs`
  (13 assertions against a real GUI).

### Dark base

- Background `#111111 → #181818`, foreground `#FCFCFC → #FFFFFF`, sidebar `#171717 → #181818` (same face as the
  surface), layers 1/2/3 `#1f1f1f / #2a2a2a / #353535 → #212121 / #282828 / #303030`, alpha family
  `rgba(252,252,252,·) → rgba(255,255,255,·)`. Values come from the `jdi` defaults inside the app
  `resources/app.asar` (`surface #181818` / `ink #ffffff`) and the generated ramp; the 0.1.x picker values are gone.
  The dark link stays on the app's text-link token `#0169CC`.
- The 36 WCAG pairs in the skin audit all pass again (ratios rise as the dark base lightens; the lowest is 4.35).

### Engineering

- `src/build.mjs` gained two placeholders: the override module (exports stripped at build time, wrapped in an IIFE) and
  the settings card. An unsupported `export` form throws instead of silently dropping a binding.
- `scripts/check-repo.mjs` went from 13 checks to 19: Config fields complete and all volatile, defaults emit no CSS,
  hex/font-stack validation, contrast identity and clamps, a 37-entry reconciliation against `skin.css`, and the
  presence of the settings page and override layer in the built artifacts.
- `scripts/install-plugin.mjs` gained `--bundle`: it writes the package name into `dsh.profile.bundles` and removes a
  redundant `- insert:` block (both paths at once produce a duplicate loader entry id). The web profile now registers
  through bundles.
- Fixed a real bug: in the settings card `jsxs(type, props, children)` takes a **key** as its third argument, so
  children must live in props — otherwise React renders an empty element. A repo check now guards against it.

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
