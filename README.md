# ZenTao VS Extension

ZenTao VS Extension 是一个 VS Code 插件，用于在编辑器内浏览禅道项目、需求和任务，并快速查看详情、复制编号、打开外部链接、下载附件和导出详情内容。

## 功能特性

- 在 VS Code 活动栏中提供 ZenTao 视图。
- 浏览当前工作区配置的禅道项目。
- 按需求和任务分组展示项目数据。
- 打开需求/任务详情，查看字段、描述、附件、动态历史和原始响应。
- 支持详情页图片点击放大预览，并可保存图片到本地。
- 支持附件保存到本地。
- 支持将详情页展示内容一键导出为 Markdown 文件。
- 支持复制需求/任务编号、在浏览器打开禅道页面。
- 支持请求日志输出，便于排查连接和 API 问题。
- 首次缺少项目 ID 时，可从可访问项目列表中选择项目，或手动输入项目 ID。

## 安装

### 从 VSIX 安装

如果你已经有打包好的 `.vsix` 文件，可以在 VS Code 中执行：

1. 打开命令面板。
2. 选择 `Extensions: Install from VSIX...`。
3. 选择生成的 `.vsix` 文件。

### 从源码构建

```bash
npm install
npm run compile
```

编译输出位于 `out/`，插件入口为 `out/extension.js`。

如需生成本地安装包，可执行：

```bash
npx @vscode/vsce package --allow-missing-repository --skip-license
```

## 配置

在 VS Code 设置中配置以下 `zentao.*` 选项：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `zentao.baseUrl` | string | `""` | 禅道服务地址，例如 `https://zentao.example.com/`。 |
| `zentao.projectId` | number | `0` | 当前工作区使用的禅道项目 ID。缺失或无效时，插件会引导选择或手动输入。 |
| `zentao.requestTimeout` | number | `15000` | 请求超时时间，单位毫秒，最小值 `1000`。 |

插件会把账号、密码和 token 存储在 VS Code Secret Storage 中，不会写入普通配置文件。

## 使用方法

1. 打开一个工作区。
2. 在 VS Code 设置中填写 `zentao.baseUrl`。
3. 打开活动栏中的 ZenTao 视图。
4. 点击视图标题栏中的“重新连接”，输入禅道账号和密码。
5. 如果当前工作区还没有有效的 `zentao.projectId`，插件会尝试拉取可访问项目列表并显示选择器。
6. 选择项目后，插件会把项目 ID 写入当前工作区配置并刷新数据。

## 常用操作

| 操作 | 位置 | 说明 |
| --- | --- | --- |
| 重新连接 | ZenTao 视图标题栏 | 重新输入账号密码并获取 token。 |
| 刷新禅道数据 | ZenTao 视图标题栏 | 重新加载项目、需求和任务。 |
| 请求日志 | ZenTao 视图标题栏 | 打开 `ZenTao Requests` 输出通道。 |
| 打开详情 | 需求/任务节点 | 在 Webview 中查看详情。 |
| 导出 MD | 详情页顶部按钮 | 将当前详情页展示内容导出到工作区根目录 `requirements/` 下。 |
| 图片预览/下载 | 详情页富文本图片 | 点击图片放大预览，并可在预览层保存图片。 |
| 复制编号 | 需求/任务节点右键菜单 | 复制当前需求或任务编号。 |
| 在浏览器打开 | 需求/任务节点右键菜单 | 使用默认浏览器打开禅道页面。 |

## 附件下载

在需求或任务详情中，如果存在附件，可以通过详情页中的附件操作保存到本地。插件会调用 VS Code 保存对话框，让你选择保存路径。

## 详情页图片与 Markdown 导出

在需求或任务详情中，富文本内容里的图片可以点击放大预览。预览层提供“下载图片”操作，会调用 VS Code 保存对话框让你选择本地路径。

详情页顶部的“导出 MD”按钮会把当前页面展示的标题、基础字段、正文、附件和历史记录导出为 Markdown 文件。导出文件保存到当前工作区根目录的 `requirements/` 文件夹内，不包含“完整原始响应”。

## 请求日志与排错

如果连接失败、数据加载失败或 API 响应异常，可以打开“请求日志”查看诊断信息。日志会尽量隐藏敏感信息，例如 token、账号密码和其他凭据。

常见问题：

- **提示禅道 URL 无效**：确认 `zentao.baseUrl` 是有效的 `http` 或 `https` 地址，且不要包含用户名或密码。
- **项目列表为空或拉取失败**：确认账号有访问项目的权限，也可以在提示时手动输入项目 ID。
- **加载数据超时**：适当调大 `zentao.requestTimeout`。
- **切换禅道地址后认证失效**：不同 `zentao.baseUrl` 使用独立 token，需要重新连接。

## 安全说明

- 禅道富文本内容会在详情页渲染前进行 HTML 清洗。
- Webview 使用 nonce 绑定脚本并设置 CSP。
- Webview 消息会在扩展宿主侧校验类型和参数后再执行下载或导出操作。
- 请求日志和详情原始响应会对敏感字段进行脱敏。
- Markdown 导出只包含页面展示内容，不写入完整原始响应。
- `zentao.baseUrl` 不允许包含嵌入式凭据。

## 开发

```bash
npm install
npm run compile
npm test
npm run verify
npx @vscode/vsce package --allow-missing-repository --skip-license
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run compile` | 运行 TypeScript 编译。 |
| `npm run watch` | 以 watch 模式运行 TypeScript。 |
| `npm test` | 运行全部 Vitest 测试。 |
| `npm run verify` | 编译并运行完整测试套件。 |
| `npx @vscode/vsce package --allow-missing-repository --skip-license` | 编译并生成 VSIX 安装包。 |

## 版本

当前版本：`0.5.0`
