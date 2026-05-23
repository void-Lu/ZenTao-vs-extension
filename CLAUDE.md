# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies from `package-lock.json`.
- `npm run compile` — run TypeScript compilation with `tsc -p ./`; output goes to `out/`, and the extension entrypoint is `out/extension.js`.
- `npm run watch` — run TypeScript in watch mode for extension development.
- `npm test` — run all Vitest tests with `vitest run`.
- `npm run verify` — compile and run the full test suite.
- `npx vitest run src/zentaoClient.test.ts` — run one test file.
- `npx vitest run -t "test name"` — run tests matching a name filter.

There is currently no lint script in `package.json`.

## Project shape

This is a TypeScript VS Code extension for browsing ZenTao project stories and tasks. VS Code contributions live in `package.json`: configuration keys under `zentao.*`, the ZenTao activity-bar container/view, and commands such as reconnect, refresh, request log, open detail, copy ID, and open external.

The runtime entry point is `src/extension.ts`. On activation it creates the request output channel, credential store, tree provider/view, lazy ZenTao API client, and detail panel. It registers all contributed commands and triggers an initial refresh.

The main data flow is:

1. `src/configuration.ts` reads and validates `zentao.baseUrl`, `zentao.projectId`, and `zentao.requestTimeout`; it also stores the account, password, and token through VS Code secret storage.
2. `src/zentaoClient.ts` builds ZenTao REST API URLs, injects tokens, logs requests, handles timeouts, supports pagination via `getAll`, and downloads attachment bytes.
3. `src/loadProjectData.ts` loads the configured project, executions, execution tasks, and product stories, then maps the raw ZenTao responses into tree state. Task loading tolerates partial execution failures.
4. `src/treeProvider.ts` renders that state as one project node with story and task groups; story/task nodes invoke `zentao.openDetail`.
5. `src/detailMapper.ts` maps raw story/task responses into a `DetailViewModel`, including fields, sanitized rich text, attachments, activity history, and redacted raw response data.
6. `src/detailPanel.ts` owns the webview panel and handles attachment download messages from the webview.
7. `src/html.ts` renders the detail webview HTML. It escapes plain text, sanitizes ZenTao rich HTML with `sanitize-html`, applies a nonce-based CSP, and redacts sensitive raw JSON.
8. `src/attachmentService.ts` resolves attachment download paths and saves files through the VS Code save dialog.
9. `src/requestLogger.ts` writes redacted request diagnostics to the `ZenTao Requests` output channel.

Shared types are centralized in `src/types.ts`. Tests are colocated as `src/**/*.test.ts` and run in the Vitest `node` environment configured by `vitest.config.ts`.

## Security-sensitive areas

- Preserve URL validation in `src/configuration.ts`: base URLs must be valid HTTP(S) URLs and must not contain embedded credentials.
- Preserve secret redaction in request logs and raw detail JSON when changing `src/requestLogger.ts`, `src/html.ts`, or `src/detailMapper.ts`.
- Keep webview content sanitized and escaped when changing `src/html.ts`; ZenTao rich-text fields are external input.
- Keep webview scripts nonce-bound and compatible with the existing CSP.
