# 禅道插件认证与日志调整计划

## Summary

- 个人账号仅用于访问禅道项目列表和项目选择。
- 新增独立管理员客户端，使用插件内写死的管理员账号/密码请求项目数据、需求列表、任务列表、需求详情和任务详情。
- 日志时间改为固定东八区显示。
- 若 token 失效，先用当前用户名和已存密码自动重新登录最多 3 次；3 次都失败，或失败状态不是 401，再重新询问用户名和密码。
- 已配置 URL、用户名、项目 ID 时，普通刷新不应重复弹出 URL 输入框或完整首登流程。

## Key Changes

- 在 `package.json` 增加用户级配置 `zentao.account`；`zentao.baseUrl` 继续用户级，`zentao.projectId` 继续工作区级，密码和 token 继续放 SecretStorage。
- 配置层新增账号读取/写入逻辑：只以 `zentao.account` 为准，不兼容旧 SecretStorage 账号；成功登录后写入用户配置。
- 调整 SecretStorage：个人密码、个人 token、管理员 token 保持存储在 SecretStorage；不再存储个人账号。
- 新增管理员凭据与管理员 token 存储逻辑：
  - 管理员账号/密码放源码常量。
  - 管理员 token 使用独立 SecretStorage key，避免覆盖个人账号 token。
  - 管理员 token 失效时由管理员凭据静默刷新。
- 客户端边界调整：
  - 个人客户端：`getProjects()`、项目选择、重新选择项目列表。
  - 管理员客户端：`loadProjectData()` 内项目详情、执行列表、任务列表、需求列表、按 ID 补需求，以及打开需求/任务详情。
- 普通刷新认证逻辑：
  - 有 `baseUrl + account + projectId + token` 时直接刷新。
  - 有 `baseUrl + account + projectId` 但 token 缺失时，优先用 SecretStorage 密码静默登录；缺密码才只提示密码。
  - 401 时使用当前账号密码自动重登并重试，最多 3 次。
  - 非 401 认证错误或 3 次重试失败后，再提示重新输入用户名和密码，不重新询问 URL。
- 显式“重新连接”逻辑保持原有交互：使用已配置 URL，不重新要求 URL；从用户名和密码开始输入，用户名默认带出已配置账号。
- `requestLogger` 时间格式改为固定 `+08:00`，例如 `2026-06-22T21:35:09+08:00`。
- README 更新配置和排错说明，明确个人账号、管理员请求边界和 SecretStorage 行为。

## Test Plan

- `configuration.test.ts`：覆盖 `zentao.account` 读取/写入；验证旧 SecretStorage 账号不会被读取为当前账号；验证 `storeLogin` 不再写入账号 secret。
- `zentaoClient.test.ts` 或新增认证测试：覆盖 401 自动重登最多 3 次、成功后重试原请求、3 次失败后抛出、非 401 不继续重试。
- `extension.test.ts`：覆盖已配置 URL/账号/项目时普通刷新不提示 URL；缺密码时只提示密码；显式重新连接从用户名/密码开始且用户名默认带出。
- `loadProjectData.test.ts`：覆盖项目数据、任务列表、需求列表均使用管理员客户端，项目列表仍使用个人客户端。
- `extension.test.ts`：覆盖打开需求详情和任务详情均使用管理员客户端。
- `requestLogger.test.ts`：覆盖日志时间包含固定 `+08:00`。
- 验证命令：`rtk npm run check`，`rtk npm test`。

## Assumptions

- “报错 id 不是 401”按 HTTP 状态码/接口错误状态不是 401 处理。
- 管理员客户端用于项目选择之后的所有项目数据读取；个人账号不再参与需求、任务或详情接口。
- 管理员账号密码按“插件内写死”实现为源码常量，且不会进入日志或普通 VS Code 配置。
