<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## 项目要点（ZenTao VS Extension，当前版本 v1.0.2）

完整说明见 `CLAUDE.md`。核心要点：

- **双客户端认证**：个人客户端（`zentao.account` + Secret Storage 密码）仅用于项目列表与项目选择；管理员客户端（内置凭据，见 `src/adminCredentials.ts`）负责所有数据访问（项目、需求、任务、详情、附件）。
- **Token 管理**：个人 token 与管理 token 分键存储于 Secret Storage；收到 401 时用已存凭据自动重登最多 3 次；收到 403 时静默重登一次并重试一次（`ZenTaoClient.forceRefreshToken()`），重试仍 403 则按普通错误记录日志，不重复重登。
- **安全约束**：管理员凭据写死在源码中，禁止输出到日志或配置；webview 内容必须转义/清洗，凭据只放 Secret Storage。
