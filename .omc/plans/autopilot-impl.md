# Autopilot Implementation Plan: Connection Configuration Wizard

## Source Spec
- `.omc/specs/deep-interview-connection-configuration-wizard.md`

## Goal
Implement a native VS Code InputBox/QuickPick guided setup flow for ZenTao connection configuration, reconnect project reselection, reconnect UI cleanup, and refresh data reload without UI cleanup.

## TDD Plan

### Task 1: Connection wizard orchestration
- Add `src/connectionWizard.test.ts` first.
- Add `src/connectionWizard.ts` after RED.
- Cover first-time URL/username/password prompt chain, invalid URL rejection, cancel without partial writes, login failure preservation, first-time project-list failure/empty-list restart from URL, and reconnect project-list failure/empty-list restart from username.

### Task 2: Project selection modes
- Extend `src/projectSelection.test.ts` first.
- Modify `src/projectSelection.ts` after RED.
- Cover normal mode preserving existing ID, forced reconnect selection, cancel preserving existing ID, cancel with no existing ID, and no manual fallback on list failure/empty list.

### Task 3: Extension integration
- Extend `src/extension.test.ts` first.
- Modify `src/extension.ts` after RED.
- Cover refresh triggering setup only when needed, reconnect clearing tree/closing details first, refresh not clearing UI, and successful reload using selected project ID.

### Task 4: Detail panel refresh/close hooks
- Add/extend tests first.
- Modify `src/detailPanel.ts` after RED.
- Add a close method for reconnect and an update path so refresh can re-fetch currently opened story/task details without closing the panel.

### Task 5: QA and validation
- Run targeted tests during each TDD cycle.
- Run `npm run verify` after implementation.
- Run architecture/security/code-quality validation before claiming completion.

## Design Constraints
- Use only VS Code native InputBox/QuickPick; no custom setup webview.
- Preserve `zentao.baseUrl`, `zentao.projectId`, `zentao.requestTimeout`.
- Preserve URL validation, secret storage, request logging/redaction, token handling, timeout, and pagination behavior.
- Refresh must not clear tree or close detail panels; it re-fetches list and detail data.
- Reconnect must clear tree and close detail panels before login/project selection/loading.
