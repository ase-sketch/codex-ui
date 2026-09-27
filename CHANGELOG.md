# Changelog

[简体中文](CHANGELOG.zh-CN.md)

## 0.6.0 - 2026-09-27

The model picker is **redone**: the 0.5.0 approach (re-laying out the host's menu with CSS) is reverted (`0f49758`)
and replaced by a component of our own.

### Model picker (⑲, `src/model-picker.js` + `skins/codex-ink/model-picker.css`)

- **Why 0.5.0 was reverted**: that rail lived on the host's menu (~25 long `:has()` selectors on
  `body > div[role=menu]`), and the host re-renders that menu on hover, focus and `aria-busy` (the selectModel
  round-trip measures ~1.1s) — every recalculation ran the whole chain. It also only re-arranged four labels:
  no model list, no grouping, no draggable control. Both complaints trace back to that.
- **The recipe comes from dsh-claude-style**: register no slot, take the seat over in the DOM. The host's own child
  of `[data-slot="conversation.input.model"]` is marked `data-codex-ui-model-host` (the stylesheet hides it; the
  host trigger stays in the React tree), our trigger goes into the same seat and the card onto `document.body`.
- **Data and commits come from the host's single source of truth**:
  `ctx.get('modelDirectories').directoryFor(sessionId)` then `dir.load()` / `dir.select({ provider, model,
  reasoningEffort })` / `dir.store.subscribe`. The session id reads `uiSession.current.value.key` first
  (`sessions.list.current` is gone as of 0.2) and falls back to the legacy field.
- **The power rail really drags**: a 24px track, 4px ticks, a 28px white thumb and an accent bar ending at the
  thumb's centre (all Codex geometry). `pointerdown` grabs, the thumb slides freely (0.3s
  cubic-bezier(.23,1,.32,1)), and release snaps to the nearest level and commits once. `←/→/Home/End` are
  equivalent, and levels come from the model's `reasoning.efforts`.
- **Two reasons it does not lag**: ① the stylesheet paints only our own `.codex-mp-*` nodes — not one selector
  touches the host menu (a check-repo discipline assertion guards this); ② rendering is signature-guarded — the
  host marks the directory `selecting` for the whole round-trip, so using that as a repaint condition would blank
  the card. Only a directory with nothing to show falls back to the loading line.
- The settings card gains a **Codex model picker** row (on by default). Turning it off removes our nodes and marks,
  and the host's control and menu come straight back — byte-for-byte identical to not having the plugin.
- **Real-GUI acceptance** `scripts/model-picker-live.mjs`, 15/15 PASS: host trigger `display:none`, exactly one
  trigger in the seat, one card, the host menu never built, rail levels matching the directory, ticks evenly spaced
  (≤1px), no commit during the drag and no blanking, and **a drag to the far left commits the first level while a
  drag to the far right commits the last, with the trigger label following**.
- **Honestly out of reach**: the Fast particle track and the Max burst (DSH has no Fast mode and no drag-to-Max
  moment), and the second-level 「more models」 card with vendor copy (the 40KB table dsh-claude-style ships is not
  carried over).

## 0.4.0 - 2026-09-27

The sidebar **surface**: the scroll fade moves from the host's 24px overlay to Codex's 40px four-stop mask ramp.

### Sidebar surface (⑱)

- The host already has its own take: a 24px absolutely positioned overlay next to the scroller, painted with
  `linear-gradient(transparent → var(--dsw-specific-sidebar-fill))`. Codex uses `_headerFadeMask_n9nga_1`'s
  `--sidebar-scroll-mask-image` — an alpha mask over the content itself.
- **This change is not about looks**, and the fixture says so plainly: four states side by side with the mask alpha
  curve recovered pixel by pixel. Under an opaque sidebar fill the native A and codex-ui B curves differ by
  **≤0.122** in the first 24px and by **8.0/255** at the bottom edge — effectively equivalent. The real gap is under a
  translucent sidebar fill (the card's `translucentSidebar`): bottom-edge luminance **176.4 native vs 240.3
  codex-ui**, because the overlay cannot hide content through a 72%-alpha fill, while the mask is immune
  (B ↔ Bt differ by 3.5).
- Both DSH-specific deviations carry their evidence: ① the ramp's `footer-edge` is 100%, because the scroller's
  bottom edge *is* the top edge of the fixed footer here (live GUI: `listRect.bottom = regionRect.bottom =
  footRect.y = 844`), unlike Codex where the footer sits on top of the scrolling content; ② no 8px top fade, since
  DSH's group header is not inside the scroller and nothing overlays the top of the scroll viewport.
- Two mask layers: the first paints the ramp over `100% − 12px` horizontally, the second restores the remaining
  12px to opaque. With `mask-repeat: no-repeat` the unpainted region masks to 0 (hidden), so without the second
  layer the host's scrollbar gutter would be erased.
- Anchors: the scope root uses the semantic `div:has(> [data-slot="sidebar.workspaces"])` (a unique hit on
  regionArea). The scroller and the overlay have no semantic anchor — none of them appear in the live
  `[data-slot]` set — so this layer adds two **suffix** anchors, `[class$="_list"]` and `[class$="_fade"]`;
  the build's hash-anchor count therefore grows by 2.
- `scripts/sidebar-surface-verify.mjs`: 13 assertions, including "no mask natively", "host overlay stepped aside",
  "the four Codex alpha stops are present" and "the second layer is 12px wide", plus two pixel-level checks.

## 0.3.0 - 2026-09-27

Both header slots are **released**: the entries registered in them render again. Before this, a dispatched subagent
left no visible trace that it was running.

### Top bar (⑬·3c)

- 0.2.x hid the contents of `conversation.session.header.actions` and `…utilities` with a blanket
  `display: none`, to match the reference screenshot's "session name plus the top-right button" only. The cost was
  not obvious at the time: the official subagent package registers its **descendant-count trigger** (total and running
  counts) in `actions` (id `subagent-catalog`, order -30), and the same slot also carries the job roster, the preset
  badge and "open in app" — all of them were hidden with it.
- Only those two rules were removed; nothing else changed, and the view tabs stay hidden (the reference has no tabs).
- The entries are **conditionally rendered** by their own packages (no subagents / no jobs / no preset / no working
  directory means they return null), so the top bar looks exactly as before in the common case. Real-GUI A/B: with the
  old rule re-injected into an empty session, the header geometry (header 1138×41, corner button 28×28, tabs display)
  is **field-for-field identical**.
- No second palette was introduced: the entries take their colours from `--dsw-*` semantic tokens, which this skin has
  already re-anchored, so they follow the current skin. Modelled in the fixture with the official class names, the
  measured badge colour is `rgb(118, 118, 118)` = the skin's `--dsw-alias-label-tertiary`;
  `--dsw-alias-fill-tsp-secondary` is undefined, so the badge keeps no fill; and the official 22px height, 6px radius
  and 12px font are asserted as "not rewritten by the skin".
- `scripts/hero-verify.mjs` grew from 8 to **17 assertions**: title still there, preset badge visible, utility entry
  visible, tabs still hidden, corner button still there, badge colour / radius / height, badge has no fill.

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

- The theme row now drives the host theme service (`ctx.theme`, provided by
  @deepseek-ai/dsh-client-ui-theme): three segments light/dark/system, writing `ui-theme`'s `preference` — the same
  setting as Settings → General → Appearance, so the whole app switches and it survives a reload, and the three colour
  rows follow the variant in effect. `inject` gained the service name `theme`.
- New `scripts/make-verify-profile.mjs`: builds a throwaway verification profile (plugin manager enabled, only this
  plugin) so `settings-page-verify` is reproducible on any machine. Live-GUI assertions went from 13 to 20 (theme
  switch, dark taking effect, preference surviving a reload, clean-up at the end) and the script is now idempotent:
  it clears overrides and the theme left by a previous run first.
- Two real bugs fixed, both caught by live-GUI assertions: `jsxs(type, props, children)` takes a **key** as its third
  argument (the card rendered an empty div); and handing a freshly-allocated object to `useSyncExternalStore` — React
  throws #185 (maximum update depth) and the host only leaves `slot entry crashed in 'plugins.bundle.config'`, so the
  whole seat entry never renders.

- Flash hardening: the skin now paints the canvas itself (`html` and `body` carry this skin's base colour in both
  themes; `html` follows via `:has()` on the body marker) and transitions are suppressed for two frames after
  `theme/change` (`html[data-codex-ui-switching]`). Measured: the dark canvas went from the host's `rgb(16,22,36)`
  to this skin's `#181818`.
- New `scripts/theme-flash-probe.mjs`: per-frame sampling of the effective backdrop during switches (first opaque
  ancestor background) — 9 windows, ~720 frames, currently 0 intermediate frames. This kind of flash does not
  reproduce in headless Chromium, so the probe stays as a regression detector.

- Fixed "the theme switch flashes twice (black → white → black)": the preference is now written document-first. The
  host's `theme.setTheme()` publishes optimistically and is then re-read from the settings document by `adopt()`, which
  on a slow round trip draws new → old → new; the card writes `preference` into the theme plugin's own settings document
  instead (the same write the service's internal `host.set` performs), leaving `adopt()` as the only publisher — one
  click, one publish. Live GUI: all 20 assertions pass (theme switch, survival across reload, clean-up at the end).
  **Note**: this flash does not reproduce in headless Chromium here; what was fixed is the only mechanism that can
  produce that sequence, not "it looks fine now".
- Override layer hardening: a transiently unavailable settings document (`status=loading` / just reconnected) no longer
  clears the overrides already in effect — that would make a user's own settings blink out.
- `scripts/theme-flash-probe.mjs` gained a "dark/light run" report (`L×12 → D×68`); more than two runs means a
  double-publish.

- The theme switch no longer waits for the round trip: the browser half gained a **local preview** (applies the
  target theme the moment you click — `body[data-ds-dark-theme]` plus the `color-scheme` on `html` — hands it back
  idempotently when `theme/change` arrives with the same result, and rolls back to the truth after 2.5s).
  Measured click → colour change: **824ms → 22ms** (median; 4 probe samples 22/18/18/31ms), run sequence still two runs
  with no double publish.
- `settings-page-verify` went from 20 to 22 assertions: "colour change within 300ms of the click" (the preview working)
  and "the preview marker is cleared once the document lands" (never stuck in preview).

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
