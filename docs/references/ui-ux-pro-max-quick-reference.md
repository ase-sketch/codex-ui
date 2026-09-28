# UI/UX Quick Reference（验收检查清单）

> 来源：ChenYiming-aaa/dsh-ui-ux-pro-max（references/quick-reference.md，基于 nextlevelbuilder/ui-ux-pro-max-skill）。
> 用途：设置界面 Codex 化改造的交付前自查与验收基准。与本仓库契约（零硬编码颜色、tokens only）一致。

## §1 视觉质量（CRITICAL）
- 禁止 emoji 作结构图标；图标同一家族、统一描边与尺寸令牌
- 按压态不改变布局边界、不抖动
- 全程语义令牌，禁止逐屏硬编码 hex
- 图标与文字基线对齐；小元素对比度 ≥4.5:1，大图形 ≥3:1

## §2 交互（CRITICAL）
- 可点击元素 80–150ms 内有按压反馈；cursor:pointer
- 微交互 150–300ms，原生缓动；禁止 >500ms 慢动画
- 禁用态语义清晰（disabled + 视觉弱化）
- ⚠️ 焦点顺序与视觉顺序一致 —— 与本插件 flex order 视觉重排的已知权衡冲突（见下）
- 键盘焦点可见（focus-visible）

## §3 深色/浅色模式（HIGH）
- 浅色正文对比度 ≥4.5:1；深色正文 ≥4.5:1、次要文字 ≥3:1（独立实测，不推断）
- 发丝分隔线/边框在两种主题下都可见
- 按压/聚焦/禁用态在深浅色下可区分度一致

## §4 布局与间距（HIGH）
- 4/8 间距节奏；纵向层级 16/24/32/48
- 滚动内容不被固定栏遮挡；窄屏（<900px）不破碎
- 长文行长 45–75 字符

## §5 无障碍（HIGH）
- 颜色不是唯一信息指示方式
- 支持 reduced-motion
- 角色/状态（selected/disabled/expanded）正确

## 与本实现的已知张力（验收时显式处理，不静默放过）
1. **Tab 焦点顺序 ≠ 视觉顺序**：分组与排序用 flex order 实现（DOM 重排会与 React key 调和冲突）。
   缓解：搜索过滤时隐藏项同时移出 Tab 序（display:none 天然满足）；组内顺序与 DOM 一致。
   残余风险：跨组 Tab 顺序与视觉不一致，属于已接受权衡，PR 描述中需声明。
2. **不要用毛玻璃背板**（本条 2026-09-28 订正，原文为「毛玻璃用 backdrop-filter 近似」）。
   本改造的设置面板是**全页铺满**的 overlay，它下面压的是主窗口内容：78% alpha + blur 会把底下的壁纸色
   揉进设置页的灰，整页偏深偏色且**随用户壁纸变化**（真机实测，见 `skins/codex-ink/settings-modal.css` 头部
   「取色纪律」与 §1）。铺满全窗的 overlay 从模糊里拿不到任何视觉受益，只赔确定性，所以背板取**不透明**
   `--dsw-alias-bg-sidebar` 一条声明、不需要 `@supports` 兜底。毛玻璃只在「居中浮层」形态下才是合理诉求。
