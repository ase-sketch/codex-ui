<p align="center">
  <img src="assets/screenshots/live-gui.png" alt="codex-ui" width="100%">
</p>

<div align="center">

  # codex-ui

  **Codex appearance for DSH Web: window edges, sidebar divider, model menu, composer, theme colors**

  [简体中文](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [MIT](LICENSE)

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/deepseek-ai/deepseek-harness)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![CI](https://github.com/rinDBeans/codex-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/rinDBeans/codex-ui/actions/workflows/ci.yml)

</div>

> codex-ui is a community-maintained interface plugin for DeepSeek Harness (DSH), not an official DeepSeek AI product.

This plugin rebuilds DSH Web interface elements to match Codex: edge shadows and hairlines, the sidebar divider,
the model and reasoning-effort menu, composer structure, and the light and dark palettes.
Values come from Codex screenshots and its color picker, measured per pixel. The measurements and the source
images are in the sections below and in `assets/reference/`.

## Host compatibility

Developed against DSH `0.1.7-rc.1` (npm global install) and `0.1.7-rc.2` (Windows desktop shell `app.asar`).
The verification scripts read shipped CSS straight out of `app.asar`; a host upgrade that changes structure fails their assertions.

## Features

| Id | Content |
|---|---|
| ⑫ | Model picker: native trigger, opaque white menu, 28px rows, permanent check column, pending spinner |
| ⑬ | Composer header turned blank, panel buttons keep the official icons |
| ⑭ | Composer card: radius, shadow, geometry, tool row, hero layout |
| ⑯ | Right panel guide entries: no border, no fill, 52px rows, 20px icons, filled shortcut pills |
| ⑰ | Composer bottom controls: add button has no box until hover; model and permission controls share the hover chip |
| ② | Sidebar colors match the Codex light sidebar; sidebar rows align with the workspace list |
| ②c | Conversation window edge: 0.5px hairline plus a 24px ambient shadow |
| ②d | Right panel: hairline only on its left edge, shadow bleeds upward only; the dockkit 1px border is removed |
| ②e | Right divider handle: center-darkest gradient on hover |

## Screenshots

Light theme: conversation window edge and right panel.

![Light theme](assets/screenshots/live-gui-rightbar.png)

Composer bottom row: no box by default, a chip on hover.

![Composer controls](assets/screenshots/composer-controls-hover.png)

Model menu while a reasoning effort is being written.

![Model menu pending](assets/screenshots/model-pending.png)

## Install

```powershell
npm run install:web        # node scripts/install-plugin.mjs --write
npm run install:desktop    # desktop shell; restart the app afterwards
npm run build              # regenerate theme.css and client.js from skins/codex-ink

node scripts/install-plugin.mjs                              # dry run (web profile by default)
node scripts/build.mjs --check                               # report stale artifacts without writing
```

The installer scopes the five stylesheets in `skins/codex-ink/` to `html[data-codex-ui]`, combines them with
`src/client.template.js` into `client.js`, copies the result to `profiles/<name>/vendor/codex-ui`, creates the
`node_modules/codex-ui` junction, and appends the insert entry to the profile `cordis.patch.yml`.

The same stylesheets can be picked up by a skin loader:

```powershell
node scripts/install-skin.mjs          # per-file SHA256 check against $DSH_HOME/skins/codex-ink
node scripts/install-skin.mjs --write  # overwrite on drift
```

## Layout

| Path | Content |
|---|---|
| `index.js` `cordis.patch.yml` `package.json` | Host half and manifest |
| `src/client.template.js` | Browser half template |
| `src/build.mjs` | Scoping and artifact generation; the only implementation |
| `theme.css` `client.js` | Generated from `skins/codex-ink/` by `src/build.mjs` |
| `skins/codex-ink/` | Stylesheet sources (skin.css / patches.css / sidebar-align.css / window-shadow.css / composer.css) |
| `scripts/build.mjs` | Regenerate the artifacts; `--check` compares without writing |
| `scripts/check-repo.mjs` | Host-free repository checks; the CI entry point |
| `scripts/host-paths.mjs` | Resolves `app.asar`, the global `@deepseek-ai` modules and Chromium |
| `scripts/install-plugin.mjs` `scripts/install-skin.mjs` | Installers |
| `scripts/*-verify.mjs` `scripts/live-gui-probe.mjs` | Fixture verification and live probing |
| `assets/reference/` | Codex reference images |
| `assets/screenshots/` | Verification output |
| `.github/workflows/ci.yml` | CI |

## Verification

| Command | Coverage | Requirement |
|---|---|---|
| `npm run check` | Syntax, JSON, manifest, artifact sync, encoding, docs pairing, machine-specific paths | none |
| `node scripts/audit-codex-ink.mjs` | Skin structure, 36 WCAG pairs, color whitelist | none |
| `node scripts/model-picker-verify.mjs` | ⑫ and the pending indicator, 18 assertions | none |
| `node scripts/rightbar-verify.mjs` | Shadow layer, right panel, both dividers, 42 assertions | none |
| `node scripts/sidebar-align-verify.mjs` | Sidebar column alignment, 6 assertions | none |
| `node scripts/hero-verify.mjs` | ⑬ ⑭ ⑰ and the focus ring, 8 assertions | none |
| `node scripts/live-gui-probe.mjs --url <token URL>` | Real GUI: 10 assertions on shadows, both dividers, the model menu pending window | a running `dsh web` |

`npm run check` needs no host. The five fixture suites run locally: they need shipped CSS from `app.asar` plus a DOM
rebuilt from the render code, read with `getComputedStyle`. Fixtures have no title bar, no real AppFrame grid and no
real RPC, so the shadow layer, divider hover and pending feedback are verified by the live probe.

### Host paths

The verification scripts read the host they run against. Each path is resolved in this order:

1. `DSH_ASAR`, `DSH_GLOBAL_MODULES`, `DSH_CHROME`;
2. `scripts/host.local.json`, a gitignored per-machine file, for example `{ "asar": "D:/.../resources/app.asar" }`;
3. a scan of the standard install locations, Playwright's browser cache and `npm root -g`.

No machine-specific path is committed.

```powershell
dsh --profile web --port 3099 --no-open      # prints a token URL
node scripts/live-gui-probe.mjs --url "http://127.0.0.1:3099/?token=..." --dpr 1.5
```

The probe opens a new conversation before timing the pending window, and exits non-zero if an assertion fails.
The token expires; after about half an hour requests return 401 and a restart is needed.

## Measurements

### Window edges

`assets/reference/codex-app-reference-1x.png` (1901x1107, DPR 1):

| Location | Scan | Value |
|---|---|---|
| Conversation window, left edge | y=600 | x=340..355 ramps 238,241,247 to 231,233,239; x=356 is a single pixel 212,215,221 |
| Conversation window, top edge | x=800 | y=30..45 ramps 237,242,247 to 232,237,242; y=46 is a single pixel 214,218,224 |
| Right panel, left edge | y=600 | x=1437 is a single pixel 237,237,237, both sides pure white |
| Right panel, top edge | x=1700 | y=46 is a single pixel 213,218,224 with the same ramp above |

In both reference images the hairline is one device pixel, so the stylesheet uses 0.5 CSS px: at the 150%
scaling of this machine, 1px rasterizes into two device pixels.

| Target | box-shadow |
|---|---|
| Conversation window | `0 0 0 0.5px var(--dsw-alias-border-l2), 0 0 24px rgba(13,13,13,.05)` |
| Right panel | `0 0 0 0.5px var(--dsw-alias-border-l1), 0 -12px 24px -12px rgba(13,13,13,.05)` |

### Theme colors

Source: `assets/reference/codex-theme-light.png` and `codex-theme-dark.png` (the Codex color picker).

| Role | Light | Dark | Token |
|---|---|---|---|
| Accent | `#339CFF` | `#0169CC` | `--dsw-alias-link` |
| Background | `#FFFFFF` | `#111111` | `--dsw-alias-bg-base` |
| Foreground | `#1A1C1F` | `#FCFCFC` | `--dsw-alias-label-primary` |
| Hover fill | `#F2F2F3` | `rgba(252,252,252,.06)` | `--dsw-codex-hover-fill` |

The dark ramp rises from `#111111`: sidebar `#171717`, layer 1 `#1f1f1f`, layer 2 `#2a2a2a`, layer 3 `#353535`.

### Sidebar colors

Source: point samples from `assets/reference/codex-sidebar-reference.png`.

| Token | Value |
|---|---|
| `--dsw-alias-bg-sidebar` | `#eef4f9` |
| `--dsw-specific-sidebar-fill` | `#eef4f9` |
| `--dsw-specific-sidebar-nav-item-active` | `#e2e9ed` |
| `--dsw-specific-sidebar-nav-item-hover` | `#e8eef3` |

## Limits

- Fixture checks are not signed-in screenshots. The `dsh web` launch token has a lifetime and lives in process memory only.
- In headless mode only the foreground tab handles `:hover`, so multi-page fixtures open the web-shape page last.
- A flat single list of model plus effort, and a per-model description column, need a client plugin that takes over the
  `conversation.input.model` slot and reuses `ctx.modelDirectories`. Not implemented here.
- ⑯ keeps the host tab strip: hiding it also removes the fullscreen and collapse buttons.
- The session row text column is 40px, 2px shorter than the workspace, new session and plugin rows, because the shipped
  `Rows.module.css` gives `.sessionRow .title` its own margin. Left as is.
- `composer.css` and `patches.css` use 21 hash-class suffix anchors (`[class$=…]`, `[class*=…]`) where the host exposes no `data-*`.

## Codex source alignment

The Codex desktop app carries its webview CSS inside `resources/app.asar` (`webview/assets/app-*.css`); the public
`openai/codex` repository holds the CLI and the TUI, not this interface. Values below come from app `26.727.4816.0`.

| Value | Codex | This skin |
|---|---|---|
| Motion | `--transition-duration-basic: .15s`, `--transition-duration-relaxed: .3s` | `--dsw-motion-fast: 150ms`, `--dsw-motion-slow: 300ms` |
| Easing | `--ease-in-out` and `--default-transition-timing-function`, both `cubic-bezier(.4, 0, .2, 1)` | `--dsw-ease` |
| Focus ring | `--color-border-focus` = `--blue-300` `#339cff`; dark the same at 70% | `--dsw-codex-focus` |
| Pending spinner | `--animate-spin: spin 1s linear infinite` | `codex-ui-spin 1s linear infinite` |
| Hairline | `--shadow-hairline: 0 0 0 .5px #0000001a` | the window and panel hairlines use the same 0.5px ring |
| Light foreground | `--color-text-foreground: #1a1c1f` | `--dsw-alias-label-primary` |
| Chip fill | `--background-button-secondary-hover`, 8% of the foreground | light `#f2f2f3` (measured), dark `rgba(255,255,255,.08)` |

Deliberate differences:

- The dark base stays `#111111` from the Codex color picker. The app CSS resolves the dark surface to `--gray-900`
  `#181818`; picker and CSS disagree, and the picker wins here.
- The dark layer ramp (`#171717 / #1f1f1f / #2a2a2a / #353535`) is a derivation, not Codex's ramp. Codex's grays are
  `#0d0d0d / #181818 / #212121 / #282828 / #303030 / #414141 / #4f4f4f / #5d5d5d / #afafaf / #ededed / #f3f3f3 / #f9f9f9 / #fff`.
- The composer card radius is 25px as measured on `assets/reference/codex-composer-reference.png`. The app CSS gives
  `--radius-3xl` (20px) for the multi-line composer and 22px for the single-line one; the gap is the screenshot's
  device scale factor, which is not recorded.
- The sidebar is 280px wide, set by the host layout. Codex clamps its own sidebar with
  `clamp(240px, 275px, min(520px, calc(100vw - 320px)))`.
- Dark link text keeps `#0169cc`, which the app uses for `--color-token-text-link-foreground`; the app's own
  `--color-text-accent` is `#99ceff` (`--blue-100`) in dark.

## CI

`.github/workflows/ci.yml` runs `scripts/check-repo.mjs` and `scripts/build.mjs --check` on Ubuntu and Windows,
Node 22 and 24. The fixture suites and the live probe need the desktop shell and Chromium, so they stay local.

## License

MIT.