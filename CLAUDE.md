# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies from `package-lock.json`.
- `npm run check` — type-check only (`tsc --noEmit`), no output written.
- `npm run bundle` — bundle with esbuild into `out/extension.js` (minified, no sourcemaps, `vscode` external, optional `@aws-sdk/client-s3` stub).
- `npm run compile` — full build: `check` then `bundle`. The extension entrypoint is `out/extension.js`.
- `npm run watch` — TypeScript watch mode (`tsc -watch`). Note: this only type-checks; it does **not** re-bundle. Run `npm run compile` after watch changes to get a working extension.
- `npm test` — run all Vitest tests with `vitest run`.
- `npm run verify` — compile and run the full test suite.
- `npm run release:check` — verify + package VSIX (full release prep).
- `npx @vscode/vsce package --allow-missing-repository --skip-license` — compile (via `vscode:prepublish` hook) and create a local `.vsix` package. The repository currently has no `repository` metadata or license file, so keep these flags unless those files are added.
- `npm run package:vsix` — shorthand for the above VSIX packaging command.
- `npx vitest run src/zentaoClient.test.ts` — run one test file.
- `npx vitest run -t "test name"` — run tests matching a name filter.
- `npx vitest run src/extension.test.ts -t "not extensible" --reporter=verbose` — run a focused test with verbose output.

There is currently no lint script in `package.json`. Vitest is configured in `vitest.config.ts` to run `src/**/*.test.ts` in the `node` environment with the `forks` pool.
`npm run verify` may print Vite's CJS Node API deprecation warning from Vitest/Vite; treat it as non-fatal unless the command exits with a failure.

## Project shape

This is a TypeScript VS Code extension for browsing ZenTao projects, stories, tasks, details, request logs, attachments, and detail exports. VS Code contributions live in `package.json`: configuration keys under `zentao.*`, the ZenTao activity-bar container/view, and commands for reconnecting, refreshing, reselecting a project, filtering/sorting the tree, opening the request log, opening details, copying IDs, and opening external links.

The runtime entry point is `src/extension.ts`. On activation it creates the request output channel, credential store, tree provider/view, lazy ZenTao API client, and detail panel. It registers all contributed commands, migrates legacy workspace `zentao.baseUrl` to user/global configuration when approved, and triggers an initial refresh.

### Dual-client authentication

The extension uses **two separate ZenTao API clients** with different credentials:

- **Personal client** (`personalClient`) — authenticates with the user's own account (`zentao.account` + password from Secret Storage). Used **only** for fetching the project list and project selection. This is the user's personal view of accessible projects.
- **Admin client** (`adminClient`) — authenticates with hardcoded admin credentials from `src/adminCredentials.ts`. Used for all data access: loading project data, stories, tasks, details, and attachments. The admin account has broad read access across the ZenTao instance.

Both clients share the same `ZenTaoClient` class; they differ only in which credentials are used at login. The admin credentials are intentionally embedded in source for plugin distribution — they must not be logged or exposed in configuration.

### Token management

- Personal and admin tokens are stored in **separate Secret Storage keys** (`zentao.token` vs `zentao.adminToken.{base64url(baseUrl)}`); they never overwrite each other.
- On 401, the client auto-retries with saved credentials up to **3 times** (`maxUnauthorizedRetries`). If all retries fail or the error is not 401, the user is re-prompted for account/password (but **not** for the URL).
- On 403, the client silently re-logs in once via `forceRefreshToken()` and retries the request once, so newly granted admin permissions take effect immediately; a second 403 propagates as a normal error and is logged without further retries.
- Admin token refresh is silent — it uses the hardcoded admin credentials without user interaction.

### Main data flow

1. `src/configuration.ts` reads and validates `zentao.baseUrl`, `zentao.projectId`, and `zentao.requestTimeout`; it stores account/password plus per-base-URL tokens through VS Code Secret Storage.
2. `src/connectionWizard.ts` handles first-time setup and reconnect flows: prompt for URL/credentials, log in (personal client), choose a project, then persist the base URL and project ID.
3. `src/projectSelection.ts` maps ZenTao project-list responses (from personal client) to quick-pick items and handles first-time project selection or explicit project reselection.
4. `src/zentaoClient.ts` builds ZenTao REST API URLs, injects tokens, refreshes the stored token on 401 (up to 3 retries) or once on 403 when saved account/password credentials are available, logs requests, handles timeouts, supports pagination via `getAll`, and downloads attachment bytes.
5. `src/loadProjectData.ts` loads the configured project, executions, execution tasks, and product stories (via admin client), then maps raw ZenTao responses into tree state. Key behaviors:
   - **Story fallback**: when project or product story lists are empty/partially-failed, story IDs are extracted from execution task records (`story`/`storyID`/`storyId` fields) and fetched individually via `/stories/{id}` to fill gaps.
   - **Concurrency limiting**: all batched API calls use `settleWithConcurrency` (cap: 5 concurrent requests) to avoid overwhelming the ZenTao server.
   - Task loading tolerates partial execution failures.
6. `src/treeProvider.ts` renders that state as one project node with story and task groups. `src/treeTransform.ts` applies the current filter text and sort mode before nodes are shown.
7. Story/task nodes invoke `zentao.openDetail`, which fetches fresh raw data (via admin client), maps it through `src/detailMapper.ts`, and shows it in `src/detailPanel.ts`. The mapper normalizes progress percentages, work-hour units, date-time formats, attachment sizes, and internal links for related stories/tasks. Activity records include both `desc` and `comment` rich-text fields, joined with `<br>` when both are present; `<a>` hrefs ending in `.json` are rewritten to `.html` to fix ZenTao internal link suffixes.
8. `src/html.ts` renders the detail webview HTML. It escapes plain text, sanitizes ZenTao rich HTML with `sanitize-html`, applies a nonce-based CSP, redacts sensitive raw JSON, renders internal detail links, attachment preview columns, in-page search UI (Ctrl+F/Cmd+F), and wires webview messages for attachment download, image download, image preview, attachment preview, and Markdown export.
9. `src/detailPanel.ts` validates webview messages, routes attachment/image downloads through `src/attachmentService.ts`, handles internal detail navigation (`openDetail`), creates attachment preview panels via `src/attachmentPreview.ts`, and writes Markdown exports into the workspace root `requirements/` folder.
10. `src/markdownExport.ts` converts the displayed detail view model content to Markdown without including the complete raw response.
11. `src/attachmentService.ts` resolves attachment download paths, downloads supported rich-content images, saves files through the VS Code save dialog, and provides `readBytes()` for programmatic attachment byte access without a save dialog.
12. `src/requestLogger.ts` writes redacted request diagnostics to the `ZenTao Requests` output channel. Timestamps are **fixed to UTC+8** (e.g. `2026-06-22T21:35:09+08:00`), not the host machine's timezone.
13. `src/attachmentPreview.ts` parses attachment bytes for Excel (.xlsx/.xls), Word (.docx/.doc), PDF, CSV, TXT, Markdown, and image files, producing sanitized preview HTML. Heavy dependencies (`mammoth`, `pdf-parse`, `xlsx`, `word-extractor`, `markdown-it`) are lazy-loaded to avoid blocking extension activation. Image attachments produce base64 inline previews; their export button saves the original file directly to `docs/requirements/` instead of generating Markdown. Attachments over 10 MB are not previewed but can still be downloaded.

Shared types are centralized in `src/types.ts`. The concurrency-limiting utility `settleWithConcurrency` is defined in `src/loadProjectData.ts` and reused wherever batch API calls are needed.

Tests are colocated as `src/test/*.test.ts` (all under the `src/test/` subdirectory, not mixed with source files); many files define small interfaces so tests can use VS Code-like fakes without running inside an extension host.

## Build pipeline

The production build is a two-stage pipeline defined in `package.json` scripts:

1. **Type-check** (`npm run check`): `tsc -p ./ --noEmit` — validates types without emitting files.
2. **Bundle** (`npm run bundle`): `node scripts/bundle.js` — runs esbuild, which bundles `src/extension.ts` into a single minified `out/extension.js` (CJS format, targeting Node 20, `vscode` as external). Optional modules like `@aws-sdk/client-s3` are stubbed out as empty objects.

The `vscode:prepublish` hook runs `npm run compile`, so VSIX packaging automatically type-checks and bundles first. Raw `tsc` output is not used at runtime — only the esbuild bundle in `out/extension.js` matters.

## Security-sensitive areas

- **`src/adminCredentials.ts`** contains hardcoded admin credentials. Do not log these values, expose them in configuration, or commit real production credentials to public repositories.
- Preserve URL validation in `src/configuration.ts`: base URLs must be valid HTTP(S) URLs and must not contain embedded credentials.
- Preserve secret redaction in request logs and raw detail JSON when changing `src/requestLogger.ts`, `src/html.ts`, or `src/detailMapper.ts`.
- Keep webview content sanitized and escaped when changing `src/html.ts`; ZenTao rich-text fields are external input.
- Keep webview scripts nonce-bound and compatible with the existing CSP.
- Validate webview message payloads in `src/detailPanel.ts` before invoking download, preview, or export actions.
- Attachment preview content is untrusted input; all preview HTML must be escaped or sanitized before rendering. Preview panels use the same nonce-bound CSP as detail pages.
- Markdown exports should include only displayed detail content and must not include the complete raw response.
- Keep credentials in VS Code Secret Storage; ordinary VS Code configuration should only hold the base URL, project ID, and timeout.
- Token refresh on 401 relies on saved account/password credentials from Secret Storage; avoid logging refreshed tokens, passwords, or raw credential-bearing responses.
