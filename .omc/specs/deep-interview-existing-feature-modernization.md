# Deep Interview Spec: ZenTao 现有功能改造

## Metadata
- Interview ID: 6b3a0a4c-33b1-4e10-9e4f-7f2b2c0b1f91
- Rounds: 8
- Final Ambiguity Score: 14.1%
- Type: brownfield
- Generated: 2026-05-24
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- Execution Gate: pending approval

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.82 | 0.25 | 0.205 |
| Success Criteria Clarity | 0.84 | 0.25 | 0.210 |
| Context Clarity | 0.86 | 0.15 | 0.129 |
| **Total Clarity** | | | **0.859** |
| **Ambiguity** | | | **0.141** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 用户级连接配置 | active | 登录时 ZenTao 请求 URL/baseUrl 应作为用户级配置而不是工作区配置；只有用户级 baseUrl 缺失时才需要第一次输入；若旧版本只在 workspace 中保存了 baseUrl，新版本应自动迁移到用户级；projectId 继续允许按 workspace 存储。 | Covered by acceptance criteria for user-scoped baseUrl writes, first-use prompting, automatic workspace-to-user baseUrl migration, preserving projectId workspace behavior, URL validation, and cancellation/failure preservation. |
| 重新选择项目入口 | active | 在 ZenTao 树视图标题栏增加一个小按钮，让用户可以主动重新选择项目；成功选择后更新 projectId、刷新树并关闭打开的详情页；取消或项目列表失败时保留旧项目和当前树。 | Covered by acceptance criteria for the tree title-bar command, forced project QuickPick, selected projectId persistence, tree reload, closing detail panels on success, and preserving the old tree on cancel/failure. |
| 树形图排序筛选 | active | 在 ZenTao 树形图区域增加排序和筛选功能：按需求/任务类型分别应用规则，排序重点基于状态和优先级，筛选支持关键词在 ID 或标题中模糊匹配；多个筛选条件之间为 AND 关系。 | Covered by acceptance criteria for per-type sorting, status/priority ordering, ID/title fuzzy matching, AND combination across filter conditions, and no data mutation. |

## Goal
改造现有 ZenTao VS Code 扩展的连接配置、项目重选和树形图浏览体验：`zentao.baseUrl` 作为用户级配置只在首次缺失时引导输入；树视图标题栏提供一个独立的“重新选择项目”小按钮；ZenTao 树形图支持按需求/任务类型分别排序，并支持多个筛选条件并存的 ID/标题模糊筛选。

## Constraints
- `zentao.baseUrl` 的新写入目标应为用户级配置，而不是工作区配置。
- 若升级后只发现旧 workspace 范围的 `zentao.baseUrl`，应自动迁移到用户级配置并继续使用。
- `zentao.projectId` 不纳入本次用户级配置改造，继续允许保持现有 workspace 级使用方式。
- 只有当用户级 `baseUrl` 缺失或无效时，才把 URL 输入视为首次配置所需步骤。
- 保留现有 baseUrl 校验：必须是合法 HTTP(S) URL，且不能包含嵌入式凭据。
- 保留现有账户、密码、token 的 VS Code Secret Storage 语义。
- 重新选择项目必须是 ZenTao 树视图标题栏中的独立小按钮，不仅仅复用重连命令。
- 点击重新选择项目按钮只触发项目重选并刷新树，不等同完整重连；不应清空凭据或重新输入 URL。
- 成功选择新项目后，应关闭已打开的详情页，避免继续展示旧项目的需求/任务详情。
- 取消重新选择项目时，不应覆盖原有 projectId，也不应加载一个未确认的新项目。
- 项目列表加载失败时，应提示错误并保留旧 projectId、当前树视图和已打开详情页。
- 树形图排序和筛选只影响扩展内展示顺序与可见节点，不改变 ZenTao 服务端数据。
- 排序和筛选按需求/任务类型分别应用，不要求需求和任务共用完全相同字段。
- 排序重点围绕状态和优先级。
- 筛选支持 ID/标题模糊匹配。
- 多个筛选条件并存时，条件之间使用 AND；关键词条件内部是 ID OR 标题匹配。
- 保留现有请求日志、token 注入、分页、超时、红action、详情 webview sanitization/CSP 和附件下载语义。

## Non-Goals
- 不把 `zentao.projectId` 强制改为用户级配置。
- 不新增完整项目管理 UI 或多项目仪表盘。
- 不把重新选择项目按钮等同于完整重连流程。
- 不改变 ZenTao 服务端任务/需求状态或优先级。
- 不改造详情页字段、附件下载逻辑或请求日志格式，除非实现排序/筛选/刷新必需触及。
- 不削弱 URL 校验、secret storage、请求日志脱敏、详情 raw JSON 脱敏或 webview 安全策略。

## Acceptance Criteria
- [ ] 新的首次配置流程将 `zentao.baseUrl` 写入用户级配置目标。
- [ ] 新的首次配置流程不把 `zentao.baseUrl` 写入 workspace 配置目标。
- [ ] 当用户级 `baseUrl` 已存在且有效时，正常使用插件不再次要求输入 URL。
- [ ] 当用户级 `baseUrl` 缺失或无效时，插件使用现有原生 VS Code 输入链提示用户输入 URL。
- [ ] baseUrl 输入继续拒绝非法 URL 和包含嵌入式凭据的 URL。
- [ ] 若升级后只存在 workspace 范围的 `zentao.baseUrl`，插件自动将该值写入用户级配置并继续使用。
- [ ] 自动迁移 workspace baseUrl 时仍执行现有 URL 校验；无效值不得写入用户级配置。
- [ ] `zentao.projectId` 继续使用现有配置语义，允许写入/读取 workspace 范围。
- [ ] 取消 URL/登录/项目选择时，不用部分新配置覆盖已有有效配置。
- [ ] ZenTao 树视图标题栏出现一个用于重新选择项目的小按钮。
- [ ] 点击重新选择项目按钮后，展示可访问项目列表并强制用户选择项目。
- [ ] 选择新项目后，将选中项目 ID 写入现有 `zentao.projectId` 配置语义。
- [ ] 选择新项目后，树视图使用新 projectId 重新加载项目需求和任务。
- [ ] 选择新项目后，关闭已打开的详情页。
- [ ] 取消重新选择项目时，保留旧 projectId，树视图不按未确认项目刷新。
- [ ] 项目列表加载失败时，提示错误并保留旧 projectId、当前树视图和已打开详情页。
- [ ] 重新选择项目按钮不会要求重新输入 baseUrl、用户名或密码，除非现有连接信息本身不足以加载项目列表。
- [ ] 重新选择项目按钮不会执行完整重连的 UI 清理语义；完整重连行为保持既有设计。
- [ ] 树形图对需求和任务分别应用排序规则。
- [ ] 排序优先考虑状态和优先级字段；相同状态/优先级下保持稳定、可预测的顺序。
- [ ] 筛选关键词可模糊匹配需求/任务 ID。
- [ ] 筛选关键词可模糊匹配需求/任务标题。
- [ ] 关键词筛选内部按 ID OR 标题匹配：任一字段命中即可通过关键词条件。
- [ ] 多种筛选条件并存时按 AND 组合：节点必须满足全部启用条件才显示。
- [ ] 筛选结果不改变底层加载数据，只改变树中可见节点。
- [ ] 清空筛选条件后，树视图恢复显示当前项目下的完整需求/任务集合。
- [ ] 排序/筛选逻辑有单元测试覆盖需求节点、任务节点、ID 模糊匹配、标题模糊匹配、多条件 AND、清空筛选和稳定排序。
- [ ] 现有连接向导、项目选择、刷新、重连、详情页安全渲染、请求日志脱敏相关测试继续通过。

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| “改造现有功能”可能只是已有连接向导的小调整。 | Round 1/2 要求用户明确“其他”具体指什么现有行为。 | 范围拆成三项：用户级 baseUrl、树标题栏重新选择项目按钮、树排序筛选。 |
| 请求 URL 和项目 ID 都应改成用户级配置。 | Round 5 要求明确哪些键改为用户级、旧 workspace 配置如何处理；Round 8 继续追问旧 workspace baseUrl 的升级兼容。 | 仅 `baseUrl` 写入用户级；`projectId` 保持现有 workspace-capable 语义；旧 workspace baseUrl 自动迁移到用户级。 |
| 重新选择项目可以复用现有重连命令。 | Round 4 以 contrarian 方式挑战是否真的需要新按钮。 | 必须在树视图标题栏新增小按钮；成功选择后更新 projectId、刷新树并关闭详情页；取消或项目列表失败时保留旧项目和当前树。 |
| 树筛选“多条件并存”可能是 OR，也可能是 AND。 | Round 6 以 simplifier 方式要求选择最小但清晰的筛选语义。 | 多个筛选条件之间是 AND；关键词条件内部 ID OR 标题。 |
| 排序/筛选可能要求复杂高级查询 UI。 | Round 3/6 聚焦最小可测效果。 | 本次聚焦按类型分别规则、状态/优先级排序、ID/标题模糊筛选和 AND 条件组合。 |

## Technical Context
这是一个 brownfield TypeScript VS Code extension，用于浏览 ZenTao 项目的需求和任务。

Relevant code findings:
- `package.json` contributes `zentao.baseUrl`, `zentao.projectId`, `zentao.requestTimeout`, ZenTao activity-bar view, and commands such as reconnect/refresh/open detail/copy ID/open external.
- `src/extension.ts` wires activation, refresh/reconnect, connection wizard, tree provider, detail panel, and command registration.
- `src/configuration.ts` reads and validates baseUrl/projectId/requestTimeout and manages secret storage for account/password/token.
- `src/connectionWizard.ts` currently writes `baseUrl` and `projectId` through `workspace.getConfiguration('zentao').update(..., false)`, which is the key area for user-scoped baseUrl changes.
- `src/projectSelection.ts` already has forced project selection behavior and writes `projectId` through the existing configuration path.
- `src/treeProvider.ts` currently renders fixed project/story/task groups from raw arrays and has no sorting/filtering state.
- `src/loadProjectData.ts` loads the project, stories, executions, and tasks that the tree provider consumes.
- `src/detailPanel.ts` and `src/html.ts` manage sanitized detail rendering and should remain security-preserving.

Security-sensitive constraints:
- Preserve base URL validation: HTTP(S) only and no embedded credentials.
- Preserve secret storage and redaction for credentials/tokens.
- Preserve request-log redaction and raw/detail JSON redaction.
- Preserve webview sanitization and nonce-bound CSP behavior.

Prior artifact context:
- `.omc/specs/deep-interview-project-selection.md` captured earlier one-time project selection requirements.
- `.omc/specs/deep-interview-connection-configuration-wizard.md` superseded parts of that behavior with a native connection wizard and reconnect refresh semantics.
- `.omc/plans/autopilot-impl.md` planned implementation for the connection wizard; this new spec extends the product surface beyond that prior plan.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 现有功能改造范围 | core domain | existing product surface, three active components | contains 用户级连接配置; contains 重新选择项目入口; contains 树形图排序筛选 |
| ZenTao VS Code Extension | system | settings, tree view, detail webview, refresh/reconnect, attachments, request log | contains existing product surfaces |
| 用户级连接配置 | core domain | baseUrl, user-level setting, first use when baseUrl missing, automatic workspace-to-user migration, projectId remains workspace-capable | writes ZenTao base URL to user-level configuration; migrates old workspace baseUrl to user-level configuration; leaves projectId workspace-capable; uses existing connection wizard |
| 重新选择项目入口 | core domain | tree title bar button, project reselection, success closes details, cancel preserves old tree, project-list failure reports error | forces project selection; updates selected projectId; refreshes tree view on success; closes detail panels on success |
| 树形图排序筛选 | core domain | per-type rules, sorting, filtering, tree area, stories, tasks | applies to ZenTao tree view; uses 排序规则; uses 筛选条件 |
| 排序规则 | supporting | status, priority, per-type behavior | orders story/task nodes inside 树形图排序筛选 |
| 筛选条件 | supporting | conditions combine with AND, keyword matches ID OR title, ID fuzzy match, title fuzzy match | filters story/task nodes inside 树形图排序筛选; combines multiple conditions with AND |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 | 2 | 2 | - | - | - |
| 2 | 5 | 3 | 0 | 2 | 40% |
| 3 | 7 | 2 | 0 | 5 | 71.4% |
| 4 | 7 | 0 | 0 | 7 | 100% |
| 5 | 7 | 0 | 0 | 7 | 100% |
| 6 | 7 | 0 | 0 | 7 | 100% |
| 7 | 7 | 0 | 0 | 7 | 100% |
| 8 | 7 | 0 | 0 | 7 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds plus topology)</summary>

### Round 0
**Q:** Topology confirmation: current scope is one top-level component, “现有功能改造范围”, covering whichever existing user-visible ZenTao extension feature needs modification.

**A:** 看起来对。

**Ambiguity:** Not scored.

### Round 1
**Q:** 本次“改造现有功能”首先要落在哪个用户可见功能上？

**A:** 其他。

**Ambiguity:** 84% (Goal: 0.15, Constraints: 0.05, Criteria: 0.05, Context: 0.55)

### Round 2
**Q:** 你说的“其他”具体是哪一种现有行为？

**A:** 登录时请求url应该是作为用户配置内容而不是工作区的配置，所以准确说只有第一次使用该插件时需要输入。增加一个新的小按钮，重新选择项目。树形图区域需要增加排序和筛选功能。

**Ambiguity:** 58.75% (Goal: 0.55, Constraints: 0.25, Criteria: 0.15, Context: 0.80)

### Round 3
**Q:** 树形图里的排序和筛选达到什么效果才算做对？

**A:** 分类型规则+排序重点按照状态和优先级+筛选时支持ID/标题的模糊匹配+允许多种筛选条件并存。

**Ambiguity:** 54.3% (Goal: 0.65, Constraints: 0.25, Criteria: 0.20, Context: 0.78)

### Round 4
**Q:** 如果不新增“小按钮”，只复用已有重连命令，会不会也满足重新选择项目？如果必须新增，它应该放在哪里、点击后只重选项目还是也清理/刷新 UI？

**A:** 树标题栏按钮。

**Ambiguity:** 40.85% (Goal: 0.75, Constraints: 0.45, Criteria: 0.45, Context: 0.82)

### Round 5
**Q:** 关于“请求 URL 作为用户配置、只有第一次使用插件时输入”，具体应如何验收配置读写？

**A:** 仅 baseUrl 用户级。

**Ambiguity:** 28.7% (Goal: 0.82, Constraints: 0.58, Criteria: 0.62, Context: 0.84)

### Round 6
**Q:** 最简单但仍满足你目标的筛选语义是什么？

**A:** AND + ID/标题 OR。

**Ambiguity:** 18.45% (Goal: 0.88, Constraints: 0.76, Criteria: 0.78, Context: 0.86)

### Round 7
**Q:** 点击树标题栏“重新选择项目”后，成功、取消、项目列表失败时分别应该怎样处理树视图和已打开详情页？

**A:** 成功关闭详情。

**Ambiguity:** 14.65% (Goal: 0.90, Constraints: 0.82, Criteria: 0.84, Context: 0.88)

### Round 8
**Q:** 如果老版本已经在 workspace 里保存了 `zentao.baseUrl`，新版本应该怎么处理？

**A:** 自动迁移到用户级。

**Ambiguity:** 14.1% (Goal: 0.90, Constraints: 0.82, Criteria: 0.84, Context: 0.86)

</details>
