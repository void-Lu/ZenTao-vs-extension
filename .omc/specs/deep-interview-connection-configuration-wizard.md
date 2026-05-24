# Deep Interview Spec: ZenTao Connection Configuration Wizard

## Metadata
- Interview ID: d8a8f2b3-2e9f-4e9c-ae5a-8bf22c9ab3e7
- Rounds: 6
- Final Ambiguity Score: 13.35%
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
| Goal Clarity | 0.91 | 0.35 | 0.319 |
| Constraint Clarity | 0.82 | 0.25 | 0.205 |
| Success Criteria Clarity | 0.82 | 0.25 | 0.205 |
| Context Clarity | 0.92 | 0.15 | 0.138 |
| **Total Clarity** | | | **0.867** |
| **Ambiguity** | | | **0.134** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 连接设置体验 | active | 使用 VS Code 原生 InputBox/QuickPick 链式向导引导用户输入 URL、用户名、密码，并保留现有配置存储/校验语义。 | Covered by acceptance criteria for first-use setup, URL validation, native prompt chain, settings persistence, cancellation behavior, and preserving existing settings semantics. |
| 认证与重连流程 | active | 初次配置和重连时通过向导完成登录；重连开始时先清空树视图并关闭详情页，再尝试后续流程；刷新不清理 UI，而是重新获取需求/任务列表和需求/任务详情以反映新增或变更。 | Covered by acceptance criteria for login, credential storage, reconnect behavior, refresh data reload, failure/cancel preservation, and reload sequencing. |
| 项目选择与项目 ID 解析 | active | 登录成功后展示可访问项目列表；初次向导必须选择项目，重连允许重选项目，取消时保留旧项目号或不写入新值。 | Covered by acceptance criteria for mandatory first-use project selection, reconnect reselection, project list display, projectId persistence, and cancellation preservation. |

## Goal
Add a native VS Code guided connection setup flow for the ZenTao extension that helps first-time users enter the ZenTao URL, username, and password; logs in; then shows accessible projects for selection. Reconnect should reuse the guided flow as needed and allow project reselection. Reconnect should clear the current tree and close open detail panels before attempting to load new data. Refresh should not clear UI; it should re-fetch story/task lists and story/task details to reflect newly added or changed ZenTao data.

## Constraints
- Use VS Code native InputBox/QuickPick prompts as a chained wizard; do not build a custom webview or panel for setup.
- Preserve the existing `zentao.baseUrl`, `zentao.projectId`, and `zentao.requestTimeout` settings model.
- Preserve existing base URL validation: only valid HTTP(S) URLs without embedded credentials are accepted.
- Preserve secret storage for account, password, and token.
- Preserve request logging, token injection, timeout handling, pagination, and redaction behavior in the existing client/request infrastructure.
- First-time setup should collect URL, username, and password before listing projects.
- Login success should lead to an accessible project list for selection.
- First-time setup must end with a selected project before loading ZenTao data.
- Reconnect should be able to reselect the project number.
- Cancelling project reselection should keep the old project ID when one exists, or avoid writing a new project ID when none exists.
- Reconnect should clear the tree view and close open detail panels at the start, before attempting load/login/project selection.
- Refresh should not clear the tree view or close detail panels; it should re-fetch demand/story and task lists plus demand/story and task detail data so additions or changes are reflected.
- If a prompt is cancelled or login fails, do not overwrite existing valid connection/project configuration with partial new values.
- If project list loading fails or returns no selectable projects during first-time setup, restart the setup flow from URL input.
- If project list loading fails or returns no selectable projects during reconnect, show an error and restart from username input, preserving the existing URL.
- `requestTimeout` should remain governed by the existing setting unless a later approved plan explicitly includes it in the wizard.

## Non-Goals
- Do not create a custom setup webview/panel.
- Do not replace the existing `zentao.*` configuration keys with a new storage model.
- Do not remove manual/project ID persistence through the existing `zentao.projectId` setting.
- Do not change attachment downloading, request log semantics, webview sanitization, or detail rendering semantics except for refreshing detail data when the user invokes refresh.
- Do not weaken webview sanitization, CSP nonce behavior, request redaction, or URL validation.

## Acceptance Criteria
- [ ] When the extension is used without sufficient connection configuration, it starts a native VS Code prompt chain for setup.
- [ ] The setup chain asks for ZenTao base URL, username, and password.
- [ ] The base URL input rejects invalid URLs and URLs with embedded credentials.
- [ ] The setup chain uses VS Code InputBox/QuickPick primitives rather than a custom webview.
- [ ] After URL/username/password are provided, the extension attempts ZenTao login and stores successful credentials/token through the existing secret storage mechanism.
- [ ] After successful login, the extension lists projects accessible to the authenticated account.
- [ ] First-time setup requires selecting a project before the tree loads ZenTao data.
- [ ] Selecting a project writes the selected ID to the existing `zentao.projectId` setting.
- [ ] Reconnect can run the guided flow as needed and allows the user to select a different project ID.
- [ ] If reconnect project selection is cancelled and an old project ID exists, the old project ID is preserved.
- [ ] If project selection is cancelled when no old project ID exists, no new project ID is written and data loading does not proceed as if setup succeeded.
- [ ] If any setup input is cancelled, the flow stops without writing partial new connection values over existing valid values.
- [ ] If login fails, the extension reports the failure and preserves existing valid connection/project configuration.
- [ ] Running reconnect clears the current ZenTao tree content and closes any open detail panels before attempting login/project selection/loading.
- [ ] Running refresh does not clear the tree view and does not close open detail panels.
- [ ] Running refresh re-fetches demand/story and task lists so newly added or changed items appear in the tree.
- [ ] Running refresh re-fetches demand/story detail data plus task detail data so opened or subsequently opened details reflect new ZenTao data.
- [ ] After successful setup/reconnect/refresh, the extension displays data using the resolved project ID.
- [ ] If project list loading fails or returns no selectable projects during first-time setup, the setup flow restarts from URL input.
- [ ] If project list loading fails or returns no selectable projects during reconnect, the extension shows an error and restarts from username input, preserving the existing URL.
- [ ] Project list requests continue to use existing ZenTao client URL construction, token handling, timeout handling, pagination, request logging, and redaction patterns.
- [ ] Tests cover first-time setup, invalid URL rejection, successful login and project selection, reconnect project reselection, cancellation preserving old project ID, cancellation with no project ID, login failure preservation, first-time project-list failure restart from URL, reconnect project-list failure restart from username, reconnect cleanup, refresh list reload, refresh detail reload, and successful tree reload.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| “配置向导” might require a full custom panel/webview. | Contrarian challenge asked whether native VS Code InputBox/QuickPick chaining would satisfy the goal. | Use native InputBox/QuickPick; no custom webview/panel. |
| Project selection was only a one-time missing-ID helper. | The reconnect flow needs to optionally reselect project number. | First-time setup requires selection; reconnect allows reselection. |
| Cancelled project selection should always fall back to manual entry. | The user chose option-priority behavior for project selection. | On reconnect cancel, preserve existing project ID; with no old ID, do not write a new value. |
| Refresh/reconnect cleanup could happen after successful load. | The user first selected “先清理 UI”, then corrected that refresh should not clean UI. | Reconnect clears tree contents and closes detail panels at the start; refresh does not clear UI and instead re-fetches demand/story and task lists plus demand/story and task details. |
| Project list failure might keep the old manual fallback behavior. | Simplifier mode asked for the smallest acceptable behavior for list failure or empty list. | First-time setup restarts from URL input; reconnect shows an error and restarts from username input while preserving the existing URL. |
| The wizard should change all connection settings. | `requestTimeout` was not requested as part of the wizard. | Preserve existing `requestTimeout` behavior unless a later approved plan expands scope. |

## Technical Context
This is a brownfield TypeScript VS Code extension for browsing ZenTao project stories and tasks.

Relevant code areas:
- `package.json` contributes `zentao.baseUrl`, `zentao.projectId`, `zentao.requestTimeout`, commands, and views.
- `src/configuration.ts` validates base URL, project ID, and request timeout, and stores account/password/token through VS Code secret storage.
- `src/extension.ts` wires activation, reconnect, refresh, client creation, tree loading, command registration, and detail opening.
- `src/projectSelection.ts` handles missing `projectId` with a project-list QuickPick/manual fallback and writes the selected project ID.
- `src/zentaoClient.ts` handles login/token/API request construction, timeouts, request logging, pagination, and downloads.
- `src/loadProjectData.ts` consumes the resolved project ID to load project, executions, tasks, and product stories.
- `src/detailPanel.ts` owns detail webview panels; reconnect should close open detail panels, while refresh should leave them open and update detail data where applicable.
- `src/treeProvider.ts` renders the tree state; reconnect should clear it at the start, while refresh should update it from newly fetched demand/story and task lists without an explicit UI-clearing step.

Security-sensitive constraints:
- Preserve URL validation in `src/configuration.ts`.
- Preserve secret redaction in request logs and raw/detail JSON.
- Preserve webview sanitization and nonce-based CSP behavior.

Historical context only:
- `.omc/specs/deep-interview-project-selection.md` captured a prior one-time project selection spec.
- `.omc/plans/autopilot-project-selection.md` captured a prior project selection implementation plan.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Configuration Wizard | core domain | native InputBox, QuickPick, first-use flow, URL input, username input, password input, cancel behavior | Uses VS Code native input chain; collects Connection Settings; leads into Authentication/Reconnection Flow; leads into mandatory Project Selection on first use. |
| Connection Settings | core domain | baseUrl, requestTimeout | URL is collected by Configuration Wizard; existing VS Code settings remain relevant. |
| Authentication/Reconnection Flow | core domain | account, password, token, reconnect command, refresh command, login failure, cancel behavior | Logs in after URL/username/password input; reconnect can be triggered on demand; reconnect first clears Tree View and closes Detail Panel, then attempts load/login; refresh reloads lists and details without UI cleanup. |
| Project Selection | core domain | projectId, project list, reselect project on reconnect, cancel keeps old projectId, no write on cancel, list failure, empty list | Appears after successful login; saves selected projectId; reconnect allows reselection; cancel preserves prior projectId or leaves projectId unwritten; first-time list failure restarts from URL; reconnect list failure restarts from username. |
| Tree View | supporting | project nodes, story nodes, task nodes, current contents, updated list contents | Cleared at the start of reconnect; refreshed by re-fetching demand/story and task lists on refresh without clearing UI first. |
| Detail Panel | supporting | open detail pages, webview panels, refreshed detail data | Closed at the start of reconnect; not closed by refresh; detail data is re-fetched on refresh. |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 | 4 | 4 | - | - | - |
| 2 | 6 | 2 | 0 | 4 | 67% |
| 3 | 6 | 0 | 0 | 6 | 100% |
| 4 | 6 | 0 | 0 | 6 | 100% |
| 5 | 6 | 0 | 0 | 6 | 100% |
| 6 | 6 | 0 | 0 | 6 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds plus topology)</summary>

### Round 0
**Q:** Topology confirmation: three candidate components for connection settings experience, authentication/reconnect flow, and project selection/projectId resolution.

**A:** 看起来对。

**Ambiguity:** Not scored.

### Round 1
**Q:** 当用户配置 ZenTao 连接时，你最希望“连接设置体验”最终让用户完成的一个可见结果是什么？

**A:** 配置向导。

**Ambiguity:** 71.25% (Goal: 0.25, Constraints: 0.20, Criteria: 0.15, Context: 0.75)

### Round 2
**Q:** 在新的配置向导里，认证与重连流程最应该达成的用户结果是什么？

**A (original, superseded for refresh):** 首先，我理解的向导其实就是一个下拉弹窗（类似选择项目列表的panel），引导用户输入信息。初次使用时引导用户输入url，用户名，密码。完成登录后返回项目列表让用户选择。当点击重连命令时，按需触发，但可以重新选择项目号。重连需要清空当前树形图内容，关闭打开的详情页；刷新清理 UI 的部分被后续修正覆盖。

**Correction:** 后续修正：刷新不需要清理 UI，而是重新获取需求/任务列表以及任务和需求详情（新增或者变更）。

**Ambiguity:** 35.90% (Goal: 0.78, Constraints: 0.48, Criteria: 0.50, Context: 0.82)

### Round 3
**Q:** 项目选择在初次向导、重连、取消、列表失败、已有 projectId 这几种情况下应该遵守什么边界规则？

**A:** 选项优先。

**Ambiguity:** 25.70% (Goal: 0.84, Constraints: 0.66, Criteria: 0.62, Context: 0.86)

### Round 4
**Q:** Contrarian challenge：如果“不做一个真正的完整面板”，而是用 VS Code 原生 InputBox/QuickPick 串成向导，是否仍满足你的目标？还是必须做一个单独的 panel/webview？

**A:** 原生输入链。

**Ambiguity:** 20.55% (Goal: 0.87, Constraints: 0.74, Criteria: 0.69, Context: 0.88)

### Round 5
**Q:** 如果我测试新的向导、重连和刷新，哪些成功/取消/失败行为必须成立，才算这部分做对了？

**A:** 先清理 UI。

**Correction:** 用户随后修正：刷新不需要清理 UI，而是重新获取需求/任务列表（新增或者变更），并且任务和需求详情也需要重新获取。因此重连保留先清理 UI；刷新只重新拉取列表和详情数据，不关闭详情页。

**Ambiguity:** 16.20% (Goal: 0.90, Constraints: 0.78, Criteria: 0.76, Context: 0.92)

### Round 6
**Q:** 项目列表加载失败或返回空列表时，最小可接受行为是什么？

**A:** 初次配置从url重新开始输入；重连失败时提示报错，并从用户名重新开始输入。

**Ambiguity:** 13.35% (Goal: 0.91, Constraints: 0.82, Criteria: 0.82, Context: 0.92)

</details>
