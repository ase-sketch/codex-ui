/**
 * codex-ui — Host half.
 *
 * 只声明一条可挂载的 entry。样式与结构全部在浏览器半（client.js）完成，
 * 宿主半不依赖任何服务，也**不引入任何包**。
 *
 * ⚠ 两条硬约束，都是实测踩出来的，别改回去 —— 违反任一条的症状完全相同：
 *   `dsh: warning: 1 entry did not activate` / `codex-ui (codex-ui): failed to import`，
 *   宿主 entry 不激活 → 浏览器半进不了 boot manifest → 插件看起来「完全没生效」。
 *
 *   1. 必须用 **ESM 具名导出**。loader 用 import() 加载 entry，只认具名导出。
 *      旧的 CommonJS `module.exports = { apply, ... }` 在 ESM 下只产生 default，
 *      具名 apply 是 undefined。
 *   2. **不许用 createRequire / require**。本文件经 Cordis 的 internal.import 加载，
 *      在那里 `createRequire(import.meta.url)` 会抛（import.meta.url 不是普通
 *      file: 模块 URL）。要引包就用顶层 `import`；本插件不需要 schema，故一个不引。
 *
 * 定位方式（可复跑）：
 *   临时 DSH_HOME + profiles/desktop-verify，
 *   `node <dsh>/lib/bin.js --profile desktop-verify --port 3081 --no-open`，
 *   看 stderr 有没有 did not activate。
 */

/** entry 名，与 package.json 的 name 一致。 */
export const name = 'codex-ui';

/** 设置页命名空间 = 本 entry 的 id。 */
export const ENTRY_ID = 'codex-ui';

/** 宿主半无需注册任何服务；保留空 apply 以满足 entry 契约。 */
export function apply() {}
