# Consensus Plan: ZenTao 现有功能改造

## Metadata
- Source Spec: `.omc/specs/deep-interview-existing-feature-modernization.md`
- Mode: `omc-plan --consensus --direct`
- Consensus Status: APPROVED by Architect v5 and Critic final
- Plan Status: pending approval
- Generated: 2026-05-24
- Execution: not approved, do not implement from this plan without explicit approval

## Requirements Summary

本计划实现三个已澄清的现有功能改造：

1. **用户级连接配置**：`zentao.baseUrl` 的新读写以 Global/user 配置为 canonical；旧 workspace `baseUrl` 只通过受控迁移进入 Global；`zentao.projectId` 继续 workspace-capable。
2. **独立项目重选入口**：新增树标题栏命令 `zentao.reselectProject`，不复用 reconnect，不调用 `resolveProjectId()`；成功后刷新新项目并关闭旧详情，取消/失败保留旧状态。
3. **树形图排序/筛选**：新增本地展示层排序/筛选命令；排序只支持状态/优先级相关模式；筛选只支持 ID/title/name 模糊匹配，多 token AND；不触发服务器请求。

## RALPLAN-DR Summary

### Principles

1. **用户级 baseUrl 优先且安全迁移**：`zentao.baseUrl` 新写入必须为 Global；迁移只在可证明安全时读取旧 workspace 值。
2. **迁移不可猜测 VS Code scope 行为**：不得假设 `scope: "application"` 后仍能通过 `inspect()` 看到旧 workspace 值，必须先做 gated spike。
3. **项目重选是独立轻量入口**：`zentao.reselectProject` 不等同 reconnect，不清凭据，不重新输入 URL，不复用 `resolveProjectId()`。
4. **排序/筛选仅改变本地展示**：不得修改 ZenTao 服务端数据，不得触发额外加载请求。
5. **本轮严格按规格收敛 UI 能力**：排序只暴露状态/优先级三种模式；筛选只做 ID/标题/名称模糊匹配。

### Decision Drivers

1. **升级兼容性**：已有 workspace `zentao.baseUrl` 不能在升级后被静默丢失。
2. **用户操作可预测**：重选项目、排序、筛选必须有明确副作用边界，不和重连/刷新/服务端调用混淆。
3. **可测试性与最小改动**：优先使用纯函数转换、明确结果类型、Vitest 可验证的命令副作用边界。

### Viable Options

#### Option A — 同版本完成 schema scope 变更与迁移

**Approach**
- 先做 gated spike，验证将 `zentao.baseUrl` 改为 `scope: "application"` 后，`workspace.getConfiguration('zentao').inspect('baseUrl')` 是否仍能可靠暴露旧 workspace/workspaceFolder 值。
- 若验证成立，同版本把 `baseUrl` schema 限制为 application/user 级，并实现 workspace-to-Global 自动迁移。

**Pros**
- 用户设置 UI 与运行时语义一次性对齐。
- 后续无需再做二阶段 schema 清理。

**Cons**
- 如果 VS Code 在 application scope 下隐藏 legacy workspace 值，会造成迁移不可见。
- 必须先有 spike 证明，不能直接采用。

#### Option B — 二阶段安全迁移路径

**Approach**
- 本版本暂不收窄 `zentao.baseUrl` 的 package scope，保留旧 workspace 值可见性。
- 运行时 canonical read 只认 `inspect().globalValue`。
- 仅 migration gate 使用 `inspect().workspaceValue` / `workspaceFolderValue` 尝试迁移到 Global。
- 新写入全部使用 Global。
- 后续版本再考虑把 schema scope 收窄到 application/user 级。

**Pros**
- 最大化保护旧 workspace 配置可迁移性。
- 满足“新写入用户级”和“自动迁移旧 workspace baseUrl”的核心需求。
- 不依赖未经验证的 VS Code scope 行为。

**Cons**
- 本版本 VS Code 设置 UI 可能仍显示 workspace 可配置入口。
- 需要后续 release 完成 schema scope 收敛。

**Decision**
- 采用 gated decision：先执行 spike；若不能证明 Option A 安全，则采用 Option B。
- 不解析 settings 文件，不用文件系统扫描替代 VS Code `inspect()`。

### Tree UI Alternatives

#### Option C — 树标题栏命令 + 本地内存转换（Chosen）

**Approach**
- 新增 `zentao.setTreeFilter`、`zentao.clearTreeFilter`、`zentao.setTreeSort`、`zentao.reselectProject`。
- 菜单全部挂到 `view/title`，`when: "view == zentaoProjectView"`。
- 排序/筛选在 `ZenTaoTreeProvider` 或独立 transform 模块内对已加载 `TreeDataState` 做纯本地变换。

**Pros**
- 与源规格“树形图区域增加排序和筛选”一致。
- 易于测试“不增加 `loadProjectData` / client 调用”。
- 不改变服务端数据与加载层。

**Cons**
- UI 入口简单，不提供高级组合查询面板。

#### Option D — 丰富排序/筛选 UI（Rejected）

**Rejected scope**
- 不暴露 ID/title 排序。
- 不暴露状态、负责人、执行、项目等筛选。
- 不做高级查询 DSL 或多字段筛选面板。

**Reason**
- 源规格明确排序重点是状态和优先级。
- 筛选只要求 ID/标题模糊匹配，多条件 AND。
- 更丰富 UI 会扩大范围并偏离验收标准。

## ADR

### Decision

采用 **gated migration + 本地树转换 + 独立项目重选命令**：

1. `baseUrl` 迁移先做 scope 可见性 spike；安全则同版本 scope change，否则二阶段迁移。
2. `baseUrl` canonical read 只读 Global；migration 只在 Global 缺失时检查 legacy workspace。
3. `projectId` 继续 workspace-capable：有 workspace 写 Workspace，无 workspace 写 Global。
4. `zentao.reselectProject` 独立于 reconnect / `resolveProjectId()`。
5. 排序只支持 `statusThenPriority`、`priorityThenStatus`、`sourceOrder`。
6. 筛选只支持 ID/title/name fuzzy，多 token AND。

### Drivers

- 保护老用户 workspace `baseUrl` 自动迁移。
- 保持重选项目与完整重连的语义隔离。
- 按源规格最小实现排序/筛选，避免范围漂移。
- 保证排序/筛选可通过纯函数和命令 spy 测试。

### Alternatives Considered

1. **同版本直接把 baseUrl scope 改 application 并迁移**：仅在 spike 证明 legacy workspace inspect 可见时可用。
2. **二阶段安全迁移**：本版本保留 scope 可见性，运行时全部 Global read/write；后续版本再收窄 schema scope。作为 fallback 推荐路径。
3. **复用 reconnect 做项目重选**：拒绝，会混淆清理凭据、URL 输入、完整重连 UI 语义。
4. **复用 `resolveProjectId()` 做项目重选**：拒绝，`resolveProjectId()` 包含首次配置和 existing-project shortcut 语义，不适合主动强制重选。
5. **暴露 ID/title/status/assignee/execution 丰富排序筛选**：拒绝，源规格本轮只要求状态/优先级排序与 ID/标题/名称模糊筛选。

### Why Chosen

该方案满足源规格并通过共识审查：
- 迁移不依赖未经验证的 VS Code scope 假设。
- 项目重选有独立结果模型和副作用边界。
- 排序/筛选严格回到状态/优先级与 ID/标题/名称 fuzzy。
- 命令 UI 与现有 view ID `zentaoProjectView` 对齐。
- 测试能直接证明无额外服务端调用。

### Consequences

- 实施前需要一个明确的 migration spike 决策点。
- 若采用二阶段路径，本版本 package schema 可能暂未完全表现为 application/user-only。
- 新增 tree transform 模块会让 provider 状态分为 raw loaded data 与 visible transformed data。
- 命令测试需要 mock VS Code command/window/configuration API 的调用顺序。
- 排序逻辑必须兼容当前 loader 已经产出的 `P${raw}` priority 表达；`P1/P2/P3/P4` 是必保兼容格式。

### Follow-ups

- 若本版本采用二阶段路径，下一版本评估将 `zentao.baseUrl` schema scope 收窄为 application/user-only。
- 后续如需状态/负责人/执行筛选，应另开规格与计划，不混入本轮。
- 后续如需 ID/title 排序，也应另开独立需求，避免破坏本轮排序语义。

## Implementation Steps

### Step 1 — 配置迁移 gate 与 baseUrl/projectId 写入目标收敛

**Files**
- [package.json](../../package.json#L15-L24)
- [configuration.ts](../../src/configuration.ts#L22-L56)
- [connectionWizard.ts](../../src/connectionWizard.ts#L124-L129)
- [extension.ts](../../src/extension.ts#L23-L207)
- [configuration.test.ts](../../src/configuration.test.ts)
- [connectionWizard.test.ts](../../src/connectionWizard.test.ts)
- [extension.test.ts](../../src/extension.test.ts)

**Plan**
1. 执行 gated spike：验证 `zentao.baseUrl` 若设置为 `scope: "application"`，VS Code `inspect('baseUrl')` 是否仍能看到旧 workspace/workspaceFolder value。
2. 若 spike 证明安全，允许同版本 schema scope change；否则采用二阶段安全路径。
3. 在 [configuration.ts](../../src/configuration.ts#L22-L56) 增加明确的 baseUrl inspect/read/migrate helpers：
   - canonical read：只看 `inspect().globalValue`。
   - migration read：只在 Global 缺失时看 legacy workspace values。
   - normalize/validate 沿用现有 URL 校验。
   - `readConnectionConfig()` 保持同步、无副作用。
4. 在 [connectionWizard.ts](../../src/connectionWizard.ts#L124-L129) 将 `baseUrl` 写入 target 改为 `vscode.ConfigurationTarget.Global`。
5. 将 `projectId` 写入封装为：有 workspace 写 `vscode.ConfigurationTarget.Workspace`，无 workspace 写 `vscode.ConfigurationTarget.Global`。
6. 在 [extension.ts](../../src/extension.ts#L23-L207) 增加 activation/init barrier：migration 完成前不得 refresh、创建 client 或让命令执行真实逻辑。
7. valid Global wins；invalid Global no fallback；valid legacy workspace only migrates when Global missing。
8. migration write failure 时不得继续把 workspace 当 canonical 使用；应提示并进入首次配置/阻止 refresh。

**Acceptance Criteria**
- 测试证明 `baseUrl` 写入 target 是 Global。
- 测试证明 `projectId` target 按 workspace 是否存在分流。
- 测试证明 valid Global wins。
- 测试证明 invalid Global no fallback。
- 测试证明 valid legacy workspace 在 Global 缺失时迁移。
- 测试证明 migration promise 在首次 refresh/client 创建前 awaited。
- spike 结果决定 package scope 路径，且没有 settings 文件解析。

### Step 2 — 实现独立项目重选命令与显式结果类型

**Files**
- [package.json](../../package.json#L50-L96)
- [projectSelection.ts](../../src/projectSelection.ts#L17-L93)
- [extension.ts](../../src/extension.ts#L88-L204)
- [projectSelection.test.ts](../../src/projectSelection.test.ts)
- [extension.test.ts](../../src/extension.test.ts)

**Plan**
1. 在 [projectSelection.ts](../../src/projectSelection.ts#L17-L93) 新增独立 project-reselect helper，不复用 `ensureProjectId()` 的 existing-id shortcut。
2. 定义显式 union result：`selected`、`cancelled`、`unavailable`、`empty`、`write-failed`、`load-failure`。
3. 加载项目列表失败、列表为空、用户取消、写入失败分别返回对应结果。
4. 在 [extension.ts](../../src/extension.ts#L188-L204) 注册 `zentao.reselectProject`：
   - 不调用 reconnect。
   - 不调用 `resolveProjectId()`。
   - 不进入 URL/account/password 输入链。
5. 推荐事务顺序：
   - QuickPick 选中后先暂存 selected projectId。
   - 先尝试加载新项目数据。
   - 只有加载成功后再写 `zentao.projectId`、替换树、关闭详情。
   - 若 `write-failed` 或 `load-failure`，旧 `projectId`、旧 tree、旧 detail、旧 filter 必须保持不变。
6. 如果实现团队选择“写入成功即 commit”的替代事务，必须显式更新验收标准并重新审查；默认计划采用“加载成功后再 commit”，以满足最终 Critic 改进建议。
7. 在 [package.json](../../package.json#L50-L96) 添加 command 与 `view/title` menu，`when: "view == zentaoProjectView"`。

**Acceptance Criteria**
- cancel 不写 `projectId`、不刷新、不关详情。
- unavailable/empty/load-failure 不写 `projectId`、不刷新、不关详情，并显示提示。
- write-failed 不刷新、不关详情，旧 `projectId` 保留。
- selected + load success 写 `projectId`、刷新树、关闭详情。
- 测试断言 `zentao.reselectProject` 不调用 reconnect，不走 URL/account/password 输入链。

### Step 3 — 新增树排序/筛选纯转换层

**Files**
- [treeProvider.ts](../../src/treeProvider.ts#L11-L85)
- [types.ts](../../src/types.ts#L31-L54)
- `src/treeTransform.ts`（新增，名称可按项目风格调整）
- `src/treeTransform.test.ts`（新增）
- 可选：`src/treeProvider.test.ts`

**Plan**
1. 定义 sort mode 类型，仅允许：
   - `statusThenPriority`
   - `priorityThenStatus`
   - `sourceOrder`
2. 默认 mode 为 `statusThenPriority`。
3. 实现 story/task 独立 status rank：
   - Story: `active`, `changed`/`changing`, `draft`, `closed`, unknown last。
   - Task: `doing`, `wait`, `pause`, `done`, `closed`, `cancel`/`cancelled`, unknown last。
4. 实现 priority rank，必须兼容：
   - `P1`, `1`, `high` => rank 1
   - `P2`, `2`, `medium` => rank 2
   - `P3`, `3`, `normal` => rank 3
   - `P4`, `4`, `low` => rank 4
   - unknown/empty => last
   - 归一化大小写不敏感，并 trim 前后空白。
5. 所有最终 tie-break 使用加载时原始 index，保证稳定排序。
6. 实现 filter tokenization：trim、whitespace split、empty input 表示不过滤。
7. 实现 fuzzy match：case-insensitive substring 或 case-insensitive subsequence。
8. Story 匹配 `id`/`title`；Task 匹配 `id`/`name`。
9. [treeProvider.ts](../../src/treeProvider.ts#L11-L85) 保存原始 `TreeDataState`，`getChildren()` 输出转换后的 visible stories/tasks，不 mutate 原始 arrays。

**Acceptance Criteria**
- `sourceOrder` 完全保留原始顺序。
- `statusThenPriority` 与 `priorityThenStatus` 顺序符合规则。
- `P1/P2/P3/P4` 在 story 和 task 排序路径中都被识别，且 `P1 < P2 < P3 < P4 < unknown`。
- `1/2/3/4` 与 `high/medium/normal/low` 与 `P1/P2/P3/P4` 等价。
- unknown status/priority 排最后且按原始顺序稳定。
- Story filter 不匹配 task-only 字段；Task filter 不匹配 story-only 字段。
- 多 token AND 生效。
- substring 和 subsequence 均有测试。
- set/clear filter 不改变底层 loaded data。

### Step 4 — 接入排序/筛选 UI 命令，保证无服务端调用

**Files**
- [package.json](../../package.json#L50-L96)
- [extension.ts](../../src/extension.ts#L188-L204)
- [treeProvider.ts](../../src/treeProvider.ts#L11-L85)
- [extension.test.ts](../../src/extension.test.ts)

**Plan**
1. [package.json](../../package.json#L50-L96) contributes：
   - `zentao.setTreeFilter`
   - `zentao.clearTreeFilter`
   - `zentao.setTreeSort`
   - `zentao.reselectProject`
2. `view/title` menus 全部使用 `when: "view == zentaoProjectView"`。
3. `zentao.setTreeFilter`：
   - 使用 InputBox。
   - prompt 只写 ID/标题/名称。
   - 不提状态、负责人、执行。
   - `undefined` 不改变当前 filter；空字符串等同 clear filter。
4. `zentao.clearTreeFilter`：清空 provider filter，只 fire tree changed。
5. `zentao.setTreeSort`：
   - QuickPick items 只映射三种 mode：`statusThenPriority`、`priorityThenStatus`、`sourceOrder`。
   - 不包含 ID/title sort。
6. 命令 handler 只调用 treeProvider setter，不调用 `loadProjectData`、client API 或 refresh。

**Acceptance Criteria**
- package command IDs 与菜单 when 条件完全正确。
- QuickPick 不包含 ID/title sort。
- InputBox prompt 不包含 status/assignee/execution。
- 测试通过 spies 证明 sort/filter/clear 不增加 `loadProjectData` 或 client 调用次数。
- 测试通过 provider children 证明可见节点和顺序变化。

### Step 5 — 回归验证与安全边界确认

**Files**
- [html.ts](../../src/html.ts)
- [detailMapper.ts](../../src/detailMapper.ts)
- [requestLogger.ts](../../src/requestLogger.ts)
- [zentaoClient.ts](../../src/zentaoClient.ts)
- Existing tests under `src/**/*.test.ts`

**Plan**
1. 不改详情页字段、附件下载、request log 格式，除非编译必要。
2. 确认 URL 校验仍拒绝非法 URL 与 embedded credentials。
3. 确认 token 注入、分页、超时、脱敏、安全 HTML/CSP 测试继续通过。
4. 执行验证命令：
   - `npm run compile`
   - `npm test`
   - `npm run verify`

**Acceptance Criteria**
- 所有现有安全相关测试通过。
- 新增配置迁移、项目重选、排序筛选测试通过。
- 无新增服务端请求日志来自排序/筛选命令。
- 编译无 TypeScript 错误。

## Pre-mortem

### Failure Scenario 1 — scope 改成 application 后 legacy workspace baseUrl 不可见

**Impact**
- 老用户升级后无法迁移旧 `baseUrl`。

**Mitigation**
- 先做 gated spike。
- 不能证明可见时走二阶段安全路径。
- 禁止解析 settings 文件作为补救。

### Failure Scenario 2 — migration 未在 activation 早期完成

**Impact**
- 首次 refresh 用到空/旧配置。
- client 提前创建，token key 与 baseUrl 不一致。
- 命令在迁移前执行导致状态分叉。

**Mitigation**
- activation/init barrier。
- `refresh`、`getClient`、命令 handler 都 await 初始化完成。
- 测试记录调用顺序：migration resolved 早于 first load/client construction。

### Failure Scenario 3 — 排序/筛选命令意外刷新远端数据

**Impact**
- 用户只是改本地视图却触发网络请求。
- 当前树数据被重新加载，筛选状态不稳定。
- 请求日志出现不必要请求。

**Mitigation**
- 排序/筛选实现为纯本地 transform。
- 命令 handler 只调用 provider setters。
- 测试 spies 断言 `loadProjectData` 和 client 调用计数不增加。

## Expanded Test Plan

### Unit Tests

- `configuration.test.ts`
  - `normalizeBaseUrl` 保持现有非法 URL / embedded credentials 拒绝。
  - canonical baseUrl read 只使用 `inspect().globalValue`。
  - valid Global wins。
  - invalid Global no fallback。
  - Global missing + valid workspace migrates to Global。
  - invalid workspace does not write Global。
  - migration write failure 不把 workspace 当 canonical 使用。
- `connectionWizard.test.ts`
  - firstTime baseUrl 写 Global。
  - projectId target 有 workspace 写 Workspace，无 workspace 写 Global。
  - cancel 不产生部分配置写入。
- `projectSelection.test.ts`
  - reselect result union 六种结果完整覆盖。
  - selected/cancelled/unavailable/empty/write-failed/load-failure 行为分别可测。
- `treeTransform.test.ts`
  - 三种 sort mode。
  - story/task status rank。
  - priority rank 覆盖 `P1/P2/P3/P4`、`1/2/3/4`、`high/medium/normal/low`。
  - unknown last stable。
  - sourceOrder stable。
  - substring fuzzy。
  - subsequence fuzzy。
  - multi-token AND。
  - Story id/title 与 Task id/name 字段边界。

### Integration Tests

- `extension.test.ts`
  - activation 等待 migration 后才 refresh/client。
  - `zentao.reselectProject` selected 后刷新树并关闭详情。
  - reselect failure/cancel 保留旧树与详情。
  - sort/filter/clear 命令只改变 provider visible output。
  - sort/filter/clear 不调用 `loadProjectData` 或 client。
  - package command IDs 与注册命令一致。

### E2E / Manual Verification

- VS Code Extension Development Host 中验证：
  - ZenTao 视图 `zentaoProjectView` 标题栏显示重选、排序、筛选、清除筛选命令。
  - 旧 workspace baseUrl 场景按 gated decision 迁移或保留二阶段路径。
  - 重选项目成功后详情页关闭，树刷新为新项目。
  - 排序 QuickPick 只有三项。
  - 筛选 prompt 只提 ID/标题/名称。
  - 清空筛选恢复完整当前项目树。

### Observability

- 请求日志中排序/筛选不产生新请求。
- 项目列表加载失败有用户可见 warning。
- 配置迁移失败或无效值不泄露 URL 凭据。
- 现有 requestLogger/html/detailMapper 脱敏与 CSP 测试保持通过。

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| VS Code configuration scope 行为与预期不同 | 迁移失败或旧配置不可见 | gated spike；不能证明则二阶段安全路径 |
| invalid Global 被 workspace fallback 掩盖 | 用户显式错误配置被静默绕过 | canonical read valid/invalid Global wins；invalid Global no fallback 测试 |
| projectId target 误写 Global | 多 workspace 使用体验退化 | 封装 target resolver；有 workspace 写 Workspace 的测试 |
| reselect 误触发 reconnect | 清凭据或要求重输登录信息 | 独立命令、独立 helper、测试断言不调用 reconnect/resolveProjectId |
| 排序规则遗漏当前 `P1-P4` | 默认排序对真实 tree state 失效 | priority normalization 和测试必须覆盖 `P1/P2/P3/P4` |
| 筛选范围扩大到状态/负责人/执行 | 偏离规格并增加复杂度 | filter prompt 和 transform 字段测试只允许 id/title/name |
| 排序/筛选触发网络请求 | UX 变慢且副作用错误 | provider-local transform；spies 断言调用次数不增加 |

## Consensus Review Changelog

- Architect v1: requested baseUrl precedence/read-target clarification and project reselect state table.
- Critic v1: rejected async read-with-write migration, invalid global fallback ambiguity, reselect load failure ambiguity, and underspecified sorting.
- Architect v2: approved migration/transaction model, required scope-inspect proof and no `resolveProjectId()` reuse.
- Critic v2: rejected missing application-scope legacy inspect proof and missing sort/filter UI wiring.
- Architect v3: approved migration gate, rejected sort/filter drift toward ID/title sorting and status/assignee filtering.
- Architect v4: requested `P1/P2/P3/P4` priority compatibility due to current loader output.
- Architect v5: approved after `P1-P4` support was added.
- Final Critic: approved with non-blocking improvements applied into this plan: transaction order loads before projectId commit; migration write failure does not treat workspace as canonical; command readiness gate is explicit; package wiring lists all four commands.

## Approval Gate

This consensus plan is **pending approval**.

No implementation, source-file edits, commits, PRs, or execution-skill handoff should happen until the user explicitly approves an execution path.
