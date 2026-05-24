# Deep Interview Spec: ZenTao 需求/任务详情页展示改造

## Metadata
- Interview ID: d8b2bd91-1d4a-4f70-b3e5-2d44c7f9d9d4
- Rounds: 6
- Final Ambiguity Score: 14.35%
- Type: brownfield
- Generated: 2026-05-25T00:37:10+08:00
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- Execution Gate: pending approval

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.88 | 0.35 | 0.308 |
| Constraint Clarity | 0.84 | 0.25 | 0.210 |
| Success Criteria Clarity | 0.85 | 0.25 | 0.213 |
| Context Clarity | 0.84 | 0.15 | 0.126 |
| **Total Clarity** | | | **0.857** |
| **Ambiguity** | | | **0.1435** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 需求页基本信息 | active | 按 [需求页-基本信息1.md](../../resources/需求页-基本信息1.md) 和 [需求页-基本信息2.md](../../resources/需求页-基本信息2.md) 以字段列表展示需求元数据。 | Covered by fixed Markdown field templates, ordering, grouping, dynamic raw-data mapping, and missing-value rules. |
| 任务页基本信息 | active | 按 [任务页-基本信息1.md](../../resources/任务页-基本信息1.md)、[任务页-基本信息2.md](../../resources/任务页-基本信息2.md)、[任务页-基本信息3.md](../../resources/任务页-基本信息3.md) 以字段列表展示任务元数据。 | Covered by fixed Markdown field templates, ordering, grouping, dynamic raw-data mapping, and missing-value rules. |
| 主要内容区 | active | 需求页和任务页分别按对应“主要内容排列”Markdown 展示富文本章节，例如描述、研发需求描述、验收标准。 | Covered by strict Markdown section ordering, rich-text rendering, and empty-section behavior. |
| 附件区 | active | 按 [附件展示格式.md](../../resources/附件展示格式.md) 以“文件名 / 大小”表格展示，取消下载按钮，改为文件名超链接点击下载。 | Covered by table rendering, no-button requirement, and link-triggered save-dialog download behavior. |
| 历史记录区 | active | 按 [历史记录.md](../../resources/历史记录.md) 展示历史记录和备注富文本内容。 | Covered by per-action numbered rendering, rich-text comments, use of existing `actions`, and empty-state behavior. |

## Goal
改造现有 ZenTao VS Code 扩展的需求/任务详情页，使详情 webview 按 `resources/` 中的 Markdown 参考呈现需求页和任务页信息：基本信息以固定字段列表展示，主要内容按页面类型显示富文本章节，附件以文件名/大小表格展示并通过文件名链接触发现有保存对话框下载，历史记录按现有详情响应中的 actions 逐条展示并保留备注富文本。

## Constraints
- 只参考 `resources/` 下的 Markdown 文件，不以同名图片作为实现依据。
- 基本信息 Markdown 表格是字段模板，不是静态示例内容。
- 基本信息实际值必须从打开详情时获得的 ZenTao 原始详情数据映射。
- 需求页和任务页的基本信息字段必须按对应 Markdown 的字段集合、顺序和分组固定展示。
- 所有 Markdown 字段都固定显示；接口缺失、空字符串或无法映射时显示“暂无”。
- 主要内容区必须严格按对应 Markdown 的章节顺序展示。
- 主要内容区无内容章节也必须保留标题，并显示“暂无”。
- 主要内容和历史记录中的富文本仍必须经过现有 sanitization 处理。
- 附件区不展示下载按钮。
- 附件文件名显示为超链接；点击后沿用现有保存对话框下载流程。
- 历史记录只使用打开详情时已有的 `raw.actions`；本轮不新增历史接口请求。
- 没有 `actions` 或 actions 为空时，历史记录区显示“暂无历史记录”。
- 保留现有 webview CSP、nonce-bound script、HTML escaping、rich HTML sanitization、raw JSON 脱敏和请求日志/secret 安全语义。
- 实现时需要用真实 ZenTao raw 结构核对字段映射，但不得把 Markdown 示例值硬编码成业务数据。

## Non-Goals
- 不根据 `resources/` 下的 PNG 图片复刻视觉细节。
- 不新增完整详情页编辑、评论、状态流转或审批能力。
- 不新增历史记录专用 ZenTao API 请求。
- 不静默保存附件到默认位置。
- 不把附件链接改成真实远端 href 直接打开或由外部浏览器下载。
- 不改变 ZenTao 服务端数据。
- 不削弱 webview 安全策略、富文本 sanitization、raw JSON 脱敏或请求日志脱敏。
- 不要求本轮重构连接配置、项目重选或树排序筛选。

## Acceptance Criteria
- [ ] 需求详情页基本信息按 [需求页-基本信息1.md](../../resources/需求页-基本信息1.md) 和 [需求页-基本信息2.md](../../resources/需求页-基本信息2.md) 的字段集合和顺序展示。
- [ ] 任务详情页基本信息按 [任务页-基本信息1.md](../../resources/任务页-基本信息1.md)、[任务页-基本信息2.md](../../resources/任务页-基本信息2.md)、[任务页-基本信息3.md](../../resources/任务页-基本信息3.md) 的字段集合和顺序展示。
- [ ] 基本信息字段值来自 ZenTao raw detail 映射，而不是 Markdown 示例值。
- [ ] 基本信息字段缺失、为空或无法映射时显示“暂无”。
- [ ] 基本信息中所有 Markdown 字段固定出现，不因缺失值而隐藏。
- [ ] 需求主要内容区按 [需求页-主要内容排列.md](../../resources/需求页-主要内容排列.md) 展示章节。
- [ ] 任务主要内容区按 [任务页-主要内容排列.md](../../resources/任务页-主要内容排列.md) 展示章节。
- [ ] 主要内容章节中的 ZenTao 富文本被渲染且经过 sanitization。
- [ ] 主要内容章节为空时保留章节标题并显示“暂无”。
- [ ] 附件区按 [附件展示格式.md](../../resources/附件展示格式.md) 显示“文件名 / 大小”表格。
- [ ] 附件区不出现下载按钮。
- [ ] 附件文件名是可点击链接。
- [ ] 点击附件文件名链接会触发现有保存对话框下载流程。
- [ ] 附件缺失下载地址或 ID 时仍沿用现有不可下载提示语义。
- [ ] 历史记录区按 [历史记录.md](../../resources/历史记录.md) 的逐条记录形态展示。
- [ ] 每条历史记录显示编号、时间、操作者和动作摘要。
- [ ] 每条历史记录存在 `comment`、`desc` 或 `history` 内容时，在该条下方渲染为富文本。
- [ ] 历史记录富文本经过 sanitization。
- [ ] 历史记录只使用详情 raw 中已有的 `actions` 数据，不新增历史接口请求。
- [ ] `actions` 缺失或为空时显示“暂无历史记录”。
- [ ] webview CSP 仍使用 nonce-bound script，未放宽脚本执行策略。
- [ ] raw JSON 展示仍对 token/password/cookie 等敏感字段脱敏。
- [ ] 现有详情 HTML escaping、富文本 sanitization、附件下载相关测试继续通过。
- [ ] 新增或更新单元测试覆盖 story/task 基本信息模板、固定字段缺失值、主要内容空章节、附件链接下载、历史记录逐条渲染和历史空态。

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Markdown 表格可能是静态示例数据。 | Round 1 要求明确 basic info Markdown 如何作为验收依据。 | Markdown 是字段集合、顺序和分组模板；实际值从 ZenTao raw detail 映射。 |
| 历史记录可以整块渲染成富文本。 | Round 2 要求选择结构化逐条记录或整块富文本。 | 历史记录逐条展示，每条 action 显示编号、时间、操作者、动作摘要，附带富文本备注。 |
| 主要内容空章节可以隐藏。 | Round 3 要求明确空章节处理。 | 严格按 Markdown 章节顺序展示，空章节保留标题并显示“暂无”。 |
| 接口缺失字段时可隐藏对应基本信息字段。 | Round 4 contrarian check 挑战是否仍保留模板字段。 | 所有 Markdown 字段固定显示；缺失、空或无法映射时显示“暂无”。 |
| 附件“超链接下载”可能意味着真实 href 直接下载。 | Round 5 要求确定点击后的具体下载方式。 | 文件名链接点击后沿用现有保存对话框下载流程，只是不再显示按钮。 |
| 历史记录缺失时应新增 ZenTao 请求补齐。 | Round 6 simplifier check 要求确定取数边界。 | 只用详情响应中已有 `raw.actions`；没有 actions 显示“暂无历史记录”，本轮不新增请求。 |

## Technical Context
这是一个 brownfield TypeScript VS Code extension，当前详情页链路如下：

- [extension.ts](../../src/extension.ts) 中的 `openDetail` 获取 story/task 原始详情后调用 `DetailPanel.show`。
- [detailMapper.ts](../../src/detailMapper.ts) 中的 `toDetailViewModel` 当前只映射通用 `basicFields`、`descriptionHtml`、`acceptanceHtml`、`attachments` 和 `activities`。
- [html.ts](../../src/html.ts) 中的 `renderDetailHtml` 当前渲染“描述 / 验收标准”“附件”“评论 / 操作历史”和“完整原始响应”。
- [detailPanel.ts](../../src/detailPanel.ts) 当前监听 `downloadAttachment` webview message 并调用 `AttachmentService.download`。
- [attachmentService.ts](../../src/attachmentService.ts) 当前通过 `showSaveDialog` + `client.downloadByPath` 保存附件。
- 本次改造应主要落在详情映射与详情 HTML 渲染路径；历史记录不要求新增 client API。
- 现有安全约束必须保留：webview sanitization/CSP、raw JSON 脱敏、请求日志脱敏、Secret Storage 语义。

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 详情页改造 | core domain | 需求/任务详情, 基本信息, 主要内容, 附件, 历史记录 | 包含 5 个 confirmed active components |
| 需求页基本信息 | core domain | 字段集合, 顺序, 分组格式, 固定字段, 暂无 | 使用 Markdown 字段模板; 映射 ZenTao 原始详情; 缺失字段仍展示暂无 |
| 任务页基本信息 | core domain | 字段集合, 顺序, 分组格式, 固定字段, 暂无 | 使用 Markdown 字段模板; 映射 ZenTao 原始详情; 缺失字段仍展示暂无 |
| 主要内容区 | core domain | 需求描述, 任务描述, 研发需求描述, 验收标准, 保留空章节, 暂无 | 位于详情页改造中; 使用 Markdown 章节顺序; 空章节显示暂无 |
| 附件区 | core domain | 文件名, 大小, 超链接下载, 保存对话框下载, 无下载按钮 | 位于详情页改造中; 文件名链接触发现有保存对话框下载链路 |
| 历史记录区 | core domain | 逐条记录, 编号, 时间, 操作者, 动作摘要, 备注富文本, 只用现有 actions, 空态暂无历史记录 | 位于详情页改造中; 使用 ZenTao actions 数据; 每条 action 可带富文本备注; 不新增历史接口请求 |
| Markdown 字段模板 | supporting | 字段集合, 顺序, 分组格式, 示例值非静态内容 | 作为基本信息验收依据; 不作为静态示例值 |
| ZenTao 原始详情 | external system | story/task raw response, files/storyFiles, actions | 被 detailMapper 映射为 DetailViewModel |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 | 8 | 8 | - | - | - |
| 2 | 8 | 0 | 0 | 8 | 100% |
| 3 | 8 | 0 | 0 | 8 | 100% |
| 4 | 8 | 0 | 0 | 8 | 100% |
| 5 | 8 | 0 | 0 | 8 | 100% |
| 6 | 8 | 0 | 0 | 8 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds plus topology)</summary>

### Round 0
**Q:** 我把这次改造理解为 5 个顶层组件：需求页基本信息、任务页基本信息、主要内容区、附件区、历史记录区。这个拓扑对吗？需要新增、删除、合并、拆分或明确延后某个组件吗？

**A:** 看起来对。

**Ambiguity:** Not scored.

### Round 1
**Q:** 这些 basic info Markdown 里的表格应该如何作为验收依据？

**A:** 字段模板：只把 Markdown 当成字段集合、顺序和分组格式；实际值从 ZenTao 返回数据映射，缺失显示空或暂无。

**Ambiguity:** 51.25% (Goal: 0.55, Constraints: 0.45, Criteria: 0.40, Context: 0.55)

### Round 2
**Q:** 历史记录应该按哪种方式验收？

**A:** 逐条记录：每条 action 显示编号、时间、操作者、动作摘要；有 comment/desc/history 时在该条下方渲染为富文本。

**Ambiguity:** 45.45% (Goal: 0.60, Constraints: 0.50, Criteria: 0.45, Context: 0.65)

### Round 3
**Q:** 主要内容区的章节和空内容应该如何验收？

**A:** 保留空章节：严格按 Markdown 章节顺序显示；章节无内容时也保留标题，并显示“暂无”。

**Ambiguity:** 35.85% (Goal: 0.72, Constraints: 0.55, Criteria: 0.60, Context: 0.68)

### Round 4
**Q:** Contrarian check：如果 ZenTao 接口拿不到某些 Markdown 字段，页面还必须保留这些字段吗？

**A:** 固定字段：所有 Markdown 字段都固定显示；接口缺失、空字符串或无法映射时显示“暂无”。

**Ambiguity:** 28.15% (Goal: 0.78, Constraints: 0.65, Criteria: 0.70, Context: 0.72)

### Round 5
**Q:** 附件文件名超链接点击后，应该具体怎么下载？

**A:** 保存对话框：文件名是链接；点击后沿用现有保存对话框下载流程，只是 UI 不再显示按钮。

**Ambiguity:** 23.00% (Goal: 0.82, Constraints: 0.72, Criteria: 0.78, Context: 0.72)

### Round 6
**Q:** 历史记录应该只使用详情响应里已有的 actions，还是需要新增请求补齐？

**A:** 只用现有：只使用打开详情时已有 raw.actions；没有 actions 就显示“暂无历史记录”，本轮不新增历史接口。

**Ambiguity:** 14.35% (Goal: 0.88, Constraints: 0.84, Criteria: 0.85, Context: 0.84)

</details>
