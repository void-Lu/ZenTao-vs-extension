# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies from `package-lock.json`.
- `npm run compile` — run TypeScript compilation with `tsc -p ./`; output goes to `out/`, and the extension entrypoint is `out/extension.js`.
- `npx tsc -p ./ --noEmit --pretty false` — type-check without writing compiled output.
- `npm run watch` — run TypeScript in watch mode for extension development.
- `npm test` — run all Vitest tests with `vitest run`.
- `npm run verify` — compile and run the full test suite.
- `npx vitest run src/zentaoClient.test.ts` — run one test file.
- `npx vitest run -t "test name"` — run tests matching a name filter.
- `npx vitest run src/extension.test.ts -t "not extensible" --reporter=verbose` — run a focused test with verbose output.

There is currently no lint script in `package.json`. Vitest is configured in `vitest.config.ts` to run `src/**/*.test.ts` in the `node` environment with the `forks` pool.

## Project shape

This is a TypeScript VS Code extension for browsing ZenTao projects, stories, tasks, details, request logs, and attachments. VS Code contributions live in `package.json`: configuration keys under `zentao.*`, the ZenTao activity-bar container/view, and commands for reconnecting, refreshing, reselecting a project, filtering/sorting the tree, opening the request log, opening details, copying IDs, and opening external links.

The runtime entry point is `src/extension.ts`. On activation it creates the request output channel, credential store, tree provider/view, lazy ZenTao API client, and detail panel. It registers all contributed commands, migrates legacy workspace `zentao.baseUrl` to user/global configuration when approved, and triggers an initial refresh.

The main data flow is:

1. `src/configuration.ts` reads and validates `zentao.baseUrl`, `zentao.projectId`, and `zentao.requestTimeout`; it stores account/password plus per-base-URL tokens through VS Code Secret Storage.
2. `src/connectionWizard.ts` handles first-time setup and reconnect flows: prompt for URL/credentials, log in, choose a project, then persist the base URL and project ID.
3. `src/projectSelection.ts` maps ZenTao project-list responses to quick-pick items and handles first-time project selection or explicit project reselection.
4. `src/zentaoClient.ts` builds ZenTao REST API URLs, injects tokens, logs requests, handles timeouts, supports pagination via `getAll`, and downloads attachment bytes.
5. `src/loadProjectData.ts` loads the configured project, executions, execution tasks, and product stories inferred from project/execution/task product IDs, then maps raw ZenTao responses into tree state. Task loading tolerates partial execution failures.
6. `src/treeProvider.ts` renders that state as one project node with story and task groups. `src/treeTransform.ts` applies the current filter text and sort mode before nodes are shown.
7. Story/task nodes invoke `zentao.openDetail`, which fetches fresh raw data, maps it through `src/detailMapper.ts`, and shows it in `src/detailPanel.ts`.
8. `src/html.ts` renders the detail webview HTML. It escapes plain text, sanitizes ZenTao rich HTML with `sanitize-html`, applies a nonce-based CSP, and redacts sensitive raw JSON.
9. `src/attachmentService.ts` resolves attachment download paths and saves files through the VS Code save dialog.
10. `src/requestLogger.ts` writes redacted request diagnostics to the `ZenTao Requests` output channel.

Shared types are centralized in `src/types.ts`. Tests are colocated as `src/**/*.test.ts`; many files define small interfaces so tests can use VS Code-like fakes without running inside an extension host.

## Security-sensitive areas

- Preserve URL validation in `src/configuration.ts`: base URLs must be valid HTTP(S) URLs and must not contain embedded credentials.
- Preserve secret redaction in request logs and raw detail JSON when changing `src/requestLogger.ts`, `src/html.ts`, or `src/detailMapper.ts`.
- Keep webview content sanitized and escaped when changing `src/html.ts`; ZenTao rich-text fields are external input.
- Keep webview scripts nonce-bound and compatible with the existing CSP.
- Keep credentials in VS Code Secret Storage; ordinary VS Code configuration should only hold the base URL, project ID, and timeout.
