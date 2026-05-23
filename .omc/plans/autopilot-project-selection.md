# One-Time ZenTao Project Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time ZenTao project selection flow when `zentao.projectId` is missing, while preserving existing IDs and allowing manual fallback.

**Architecture:** Keep `zentao.projectId` as the only stored project identifier. Add a small connection configuration helper that reads base URL/timeout without requiring project ID, lists accessible projects through `ZenTaoClient`, prompts with VS Code QuickPick, and writes the selected/manual ID before refreshing.

**Tech Stack:** TypeScript, VS Code Extension API (`showQuickPick`, `showInputBox`, `workspace.getConfiguration().update`), Vitest, existing ZenTao REST client.

---

## File Structure

- Modify `src/types.ts`: add `ProjectListItem` for selectable ZenTao projects.
- Modify `src/configuration.ts`: add `readConnectionConfig()` for base URL/timeout without project ID and `readOptionalProjectId()` for missing/invalid detection.
- Modify `src/zentaoClient.ts`: add `getProjects()` using existing `getAll('projects')` plumbing.
- Create `src/projectSelection.ts`: pure helpers for mapping project list responses, validating manual project ID text, and choosing/selecting project IDs using injected UI/config dependencies.
- Modify `src/extension.ts`: invoke project selection before `refresh()` when project ID is missing, and after reconnect only if missing.
- Modify tests: `src/configuration.test.ts`, `src/zentaoClient.test.ts`, new `src/projectSelection.test.ts`, and `src/extension.test.ts` for command registration.

## Task 1: Allow Connection Config Without Project ID

**Files:**
- Modify: `src/configuration.ts`
- Test: `src/configuration.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests asserting base URL/timeout can be read without `projectId`, and optional project ID returns undefined for missing/invalid values.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/configuration.test.ts -t "connection config|optional project"`
Expected: FAIL because `readConnectionConfig` and `readOptionalProjectId` are not exported.

- [ ] **Step 3: Implement minimal code**

Add exports:
- `readConnectionConfig(configuration)` returns `{ baseUrl, requestTimeout }` after normalizing URL.
- `readOptionalProjectId(configuration)` returns a positive integer or `undefined`.
- Keep `readExtensionConfig()` strict by composing both helpers and throwing the existing error if missing/invalid.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/configuration.test.ts`
Expected: PASS.

## Task 2: Add Accessible Project List API

**Files:**
- Modify: `src/types.ts`
- Modify: `src/zentaoClient.ts`
- Test: `src/zentaoClient.test.ts`

- [ ] **Step 1: Write failing test**

Add a `ZenTaoClient` test for `getProjects()` that verifies it requests `https://zentao.example.com/api.php/v1/projects` with the token header and uses pagination via `getAll`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/zentaoClient.test.ts -t "fetches accessible projects"`
Expected: FAIL because `getProjects` does not exist.

- [ ] **Step 3: Implement minimal code**

Add `getProjects(): Promise<unknown> { return this.getAll('projects'); }`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/zentaoClient.test.ts`
Expected: PASS.

## Task 3: Build Project Selection Helper

**Files:**
- Create: `src/projectSelection.ts`
- Test: `src/projectSelection.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- Maps `{ projects: [{ id, name }] }` into QuickPick items with `label` as name and `description` as `#id`.
- Selecting an accessible project updates `zentao.projectId` and returns the ID.
- Cancelled QuickPick falls back to manual input.
- List failure falls back to manual input.
- Invalid manual project IDs are rejected and not written.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/projectSelection.test.ts`
Expected: FAIL because `projectSelection.ts` does not exist.

- [ ] **Step 3: Implement minimal code**

Create small dependency interfaces:
- `ProjectSelectionClient` with `getProjects()`.
- `ProjectSelectionWindow` with `showQuickPick`, `showInputBox`, `showWarningMessage`.
- `ProjectSelectionConfiguration` with `update`.

Export:
- `mapProjectQuickPickItems(response)`.
- `parseManualProjectId(value)`.
- `ensureProjectId(options)`.

`ensureProjectId` should:
1. Return existing positive project ID immediately.
2. Try listing projects and showing QuickPick.
3. If selected, update `projectId` and return it.
4. If list fails or selection is cancelled, prompt manual input.
5. Write only valid positive integer IDs.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/projectSelection.test.ts`
Expected: PASS.

## Task 4: Wire Selection Into Extension Flow

**Files:**
- Modify: `src/extension.ts`
- Test: `src/extension.test.ts`

- [ ] **Step 1: Write failing static tests**

Extend `extension.test.ts` to assert:
- `extension.ts` imports `ensureProjectId`.
- `refresh()` calls `ensureProjectId` before `loadProjectData`.
- `reconnect()` calls `ensureProjectId` before `refresh()`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/extension.test.ts`
Expected: FAIL because wiring is absent.

- [ ] **Step 3: Implement minimal code**

In `extension.ts`:
- Build clients from `readConnectionConfig()` so a missing project ID does not prevent login/listing.
- Add `getWorkspaceConfig()` helper for `vscode.workspace.getConfiguration('zentao')`.
- In `refresh()`, call `ensureProjectId({ existingProjectId: readOptionalProjectId(config), client: getClient(), configuration: config, window: vscode.window })`; only then call `loadProjectData`.
- In `reconnect()`, after credentials are stored, call `ensureProjectId` and then `refresh()`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run src/extension.test.ts src/projectSelection.test.ts src/configuration.test.ts src/zentaoClient.test.ts`
Expected: PASS.

## Task 5: Full QA and Validation

**Files:**
- No planned source changes.

- [ ] **Step 1: Run full verification**

Run: `npm run verify`
Expected: TypeScript compile succeeds and all Vitest tests pass.

- [ ] **Step 2: Review security constraints**

Confirm no URL credential validation, secret storage, request redaction, or webview sanitization behavior was weakened.

- [ ] **Step 3: Commit and push**

Run status/diff checks, then commit only relevant source/test changes and push `feature/project-selection-config`.
