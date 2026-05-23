# Deep Interview Spec: One-Time ZenTao Project Selection

## Metadata
- Interview ID: 8f3c9a61-8a78-4c32-9f37-9f8e2e7b2a41
- Rounds: 6
- Final Ambiguity Score: 8.85%
- Type: brownfield
- Generated: 2026-05-23T15:20:00Z
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.94 | 0.35 | 0.329 |
| Constraint Clarity | 0.91 | 0.25 | 0.228 |
| Success Criteria Clarity | 0.90 | 0.25 | 0.225 |
| Context Clarity | 0.86 | 0.15 | 0.129 |
| **Total Clarity** | | | **0.912** |
| **Ambiguity** | | | **0.088** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| Extension Feature Enhancement | active | Add a one-time project selection step to the existing ZenTao VS Code extension connection configuration when `zentao.projectId` is missing, including after reconnect, while preserving existing project IDs and supporting manual project ID fallback on cancel/failure. | Covered by acceptance criteria for missing-ID trigger, reconnect behavior, QuickPick selection, settings update, refresh, and manual fallback. |

## Goal
Add a one-time ZenTao project selection flow to the current VS Code extension so users can select a project instead of manually entering a project ID when `zentao.projectId` is missing, including after reconnect, while avoiding unnecessary reselection when a project ID already exists.

## Constraints
- Preserve the existing `zentao.projectId` setting as the stored project identifier.
- Trigger project selection only when `zentao.projectId` is missing or invalid after connection prerequisites are available.
- Do not force project reselection during reconnect if an existing valid `zentao.projectId` is already configured.
- If project-list loading fails or the user cancels selection, allow manual project ID entry as the fallback.
- After a successful selection or manual fallback entry, update the stored project ID and refresh/load the ZenTao tree.
- Preserve existing URL validation and credential handling in `src/configuration.ts`.
- Preserve request-log redaction in `src/requestLogger.ts` and any raw/detail redaction behavior touched indirectly.
- Any new project-list request must use the existing request logging, token injection, timeout, and pagination/error-handling patterns in `src/zentaoClient.ts`.
- The project selector should list only projects accessible to the currently authenticated ZenTao account.

## Non-Goals
- Do not replace the underlying `zentao.projectId` setting with a new storage model.
- Do not add a persistent project management UI or multi-project switching experience beyond the one-time selection/fallback flow.
- Do not force project selection every time the user runs reconnect.
- Do not remove manual project ID entry as an escape hatch.
- Do not change story/task browsing, detail webview rendering, attachment download behavior, or request-log semantics except as required to refresh after project selection.

## Acceptance Criteria
- [ ] When the extension needs to load data and `zentao.projectId` is missing or invalid, it prompts the user to select a ZenTao project after connection prerequisites are available.
- [ ] When reconnect completes and no valid `zentao.projectId` exists, the extension prompts the user to select a ZenTao project.
- [ ] When reconnect completes and a valid `zentao.projectId` already exists, the extension preserves it and does not force project selection.
- [ ] The selection UI lists ZenTao projects accessible to the currently authenticated account, with enough information for a user to identify the intended project, at minimum project name plus ID.
- [ ] Selecting a project writes that project's ID to the existing `zentao.projectId` configuration setting.
- [ ] After a successful project selection, the extension refreshes or loads the tree using the selected project.
- [ ] If project-list loading fails, the user can manually enter a positive integer project ID and continue.
- [ ] If the user cancels project selection, the user can manually enter a positive integer project ID as the fallback.
- [ ] Invalid manual project IDs are rejected with a clear error and are not written to configuration.
- [ ] Project-list requests follow existing `ZenTaoClient` URL construction, token injection, timeout, pagination, and request logging/redaction patterns.
- [ ] Tests cover the missing-project-ID path, reconnect-with-existing-ID path, successful selection write/refresh path, list-failure manual fallback path, and invalid manual ID rejection.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Connection configuration meant a broad settings or login redesign. | The first concrete user-visible result was requested. | The scope is project selection for connection configuration. |
| Project selection might replace manual `zentao.projectId` entry entirely. | Existing `zentao.projectId` is already contributed and validated by the extension. | Keep `zentao.projectId` as storage; use selection as a one-time helper. |
| Reconnect should always require choosing a project again. | Contrarian challenge: forcing selection when a project ID already exists may add friction. | Only select when the project ID is missing/invalid; preserve existing valid IDs. |
| Selection failure could stop the flow. | Failure/cancel behavior needed a boundary. | Provide manual project ID fallback on cancel or project-list failure. |
| The project-list API already exists in the client. | Source search found `getProject`, `getProjectStories`, and `getProjectExecutions`, but no project-list method. | Implementation should add or verify the appropriate project-list client method. |
| The selector might need all projects or special sorting/filtering. | Context refinement asked which projects should appear. | The selector should display projects accessible to the currently authenticated ZenTao account. |

## Technical Context
This is a brownfield TypeScript VS Code extension for browsing ZenTao project stories and tasks.

Relevant surfaces:
- `package.json` contributes `zentao.baseUrl`, `zentao.projectId`, `zentao.requestTimeout`, commands, and views.
- `src/configuration.ts` validates base URL/project ID/timeout and stores account/password/token in VS Code secret storage.
- `src/extension.ts` wires activation, reconnect, refresh, detail opening, and output-log commands.
- `src/zentaoClient.ts` builds REST URLs, injects tokens, handles timeouts, supports pagination, and currently exposes `getProject(projectId)`, `getProjectStories(projectId)`, and `getProjectExecutions(projectId)`.
- `src/loadProjectData.ts` loads the configured project, executions, tasks, and product stories for the selected project ID.
- `src/treeProvider.ts` renders the project/story/task tree.
- `src/requestLogger.ts` redacts sensitive request diagnostics.

Security-sensitive constraints:
- Preserve URL validation: base URLs must be HTTP(S) and must not contain embedded credentials.
- Preserve secret storage and redaction for account/password/token.
- Preserve request-log redaction for token/password-like query values.

Implementation context gap:
- Source search did not find an existing project-list method in `src/zentaoClient.ts`; implementation should confirm the correct ZenTao endpoint and response shape before coding the selector.
- Product behavior is clear: list the current account's accessible projects, then rely on manual project ID fallback if the endpoint is unavailable or fails.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Connection Configuration | core domain | baseUrl, projectId, requestTimeout, account, password, token | Includes project selection only when projectId is missing; preserves existing projectId; stored partly in VS Code settings and partly in secret storage. |
| One-Time Project Selection | core domain | projectId, projectName, selectionMoment, cancelBehavior, failureBehavior, accessibleProjectsOnly | Chooses a ZenTao Project accessible to the current account; updates VS Code Settings; runs when projectId is missing; falls back to Manual Project ID Entry. |
| ZenTao Project | external system | id, name, accessibleToCurrentAccount | Is listed from ZenTao; is selected by One-Time Project Selection. |
| VS Code Settings | supporting | baseUrl, projectId, requestTimeout | Stores selected or manually entered projectId; projectId absence triggers selection. |
| Secret Storage | supporting | account, password, token | Provides credentials required before listing projects. |
| Reconnect Flow | supporting | trigger, credentials, projectSelection, existingProjectId | Does not force selection when projectId already exists; can lead to Missing Project ID Flow. |
| Missing Project ID Flow | supporting | trigger, projectIdMissing | Triggers One-Time Project Selection. |
| Manual Project ID Entry | supporting | projectId | Fallback when project selection is cancelled or project list loading fails; updates VS Code Settings. |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 | 3 | 3 | - | - | - |
| 2 | 5 | 2 | 0 | 3 | 60% |
| 3 | 6 | 1 | 1 | 4 | 83% |
| 4 | 7 | 1 | 1 | 5 | 86% |
| 5 | 8 | 1 | 0 | 7 | 88% |
| 6 | 8 | 0 | 0 | 8 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds plus topology)</summary>

### Round 0
**Q:** Topology confirmation: one top-level component, Extension Feature Enhancement.

**A:** Looks right.

**Ambiguity:** Not scored.

### Round 1
**Q:** When you say extend this ZenTao VS Code extension, what is the first concrete thing the user should be able to do after completion?

**A:** 连接配置.

**Ambiguity:** 69.25% (Goal: 0.35, Constraints: 0.20, Criteria: 0.15, Context: 0.65)

### Round 2
**Q:** If I demo the finished feature, which result most proves the connection configuration improvement?

**A:** 项目选择.

**Ambiguity:** 44.25% (Goal: 0.65, Constraints: 0.35, Criteria: 0.55, Context: 0.70)

### Round 3
**Q:** How should project selection handle the existing `zentao.projectId` manual setting?

**A:** 一次性选择.

**Ambiguity:** 32.00% (Goal: 0.75, Constraints: 0.65, Criteria: 0.60, Context: 0.70)

### Round 4
**Q:** Which end-to-end flow best matches your one-time project selection acceptance standard?

**A:** 重连和缺ID时选择.

**Ambiguity:** 21.95% (Goal: 0.85, Constraints: 0.72, Criteria: 0.78, Context: 0.72)

### Round 5
**Q:** What should happen when project selection is cancelled, project list loading fails, or reconnect already has projectId?

**A:** 手动回退和仅缺失选择.

**Ambiguity:** 12.10% (Goal: 0.92, Constraints: 0.88, Criteria: 0.88, Context: 0.78)

### Round 6
**Q:** Project selector should display which class of projects?

**A:** 可访问项目.

**Ambiguity:** 8.85% (Goal: 0.94, Constraints: 0.91, Criteria: 0.90, Context: 0.86)

</details>
