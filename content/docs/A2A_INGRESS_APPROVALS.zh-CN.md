# 统一入口、工具审批与原生 Pi 交互

面向部署者、工作区管理员和集成开发者。本文对照 ToolPlane `9c6f9d8`（0.39.0）源码：平台负责准入、资源授权、固定修订的 `toolApproval` 和 Web／频道审批传输；Pi 扩展另可发起原生确认与输入。两者不是同一套对话，也不互相替代。文档发布不表示旧部署已升级或完成真实运行验收。

## 支持边界

可执行运行时仅为 Pi SDK。聊天、Work、Agent Control MCP、消息渠道和触发器通过 `submitAgentEntry` / `runAgentEntry` 进入 `src/lib/agents/execution/` 中的通用执行核心，统一处理准入、调度、固定修订和工具。OMP 已退役，只保留历史读取与显式转换为未授权 Pi 草稿，不是执行器或降级路径。A2A 是可选的协议入口及 Agent 委派能力，不是普通执行的开关；数据库中保留的 `A2ATask` / `A2AContext` 名称不代表每次执行都走 A2A 协议。独立 A2A 工作台已移除；公共协议执行限制见下文，不能由保留路由推断可执行。

公共 Endpoint 的协议与凭据基础设施保留，但当前没有可用的公共执行适配器。A2A 服务启用返回 `runtime_unsupported`（HTTP 409），旧公开发布 action 已删除。公开 A2A 新消息及续写在记录创建前拒绝（内部 HTTP 410，传输层可能序列化为协议错误）；Responses/OpenAI 执行入口也保持 HTTP 410，均不创建新的运行或 runtime 分配、不转接 Pi。入站服务不因此获得私人 Agent 或浏览器交互权限。

普通入口要求已有可执行的 Pi 固定修订、模型及会话沙箱，不要求开启 A2A 入站或出站。只有协议接入或跨 Agent 委派才需要对应的 A2A 显式授权。支持的原生 slash 命令使用同一执行核心，不支持的命令不会被静默转成模型输入。

## 原会话与原生任务映射

`A2AEntryBinding` 绑定调用身份、入口种类、原会话/Work ID 与原生 Context；`A2AEntryReceipt` 保存消息 ID、内容摘要及已接受的 Task。映射、去重记录和任务准入在同一事务中写入。

首次从旧会话进入会创建新的原生 Context，旧历史仍可阅读，但**不会导入旧工具操作或自动复制完整记忆**。只把新的明确用户输入转成任务；后续消息复用原生 Context。相同消息 ID 和内容返回已接受的任务，相同 ID 更换内容被拒绝。INPUT_REQUIRED 使用原 Task 和新消息 ID，不延长截止时间；终态后的新输入创建新 Task。不同调用用户不能借用另一用户的原生 Context。

Work 与首次迁入的普通聊天不同：它继续使用既有 Conversation 原生会话 ID、活动消息、附件和引用，不创建空会话冒充恢复，也不重放旧工具调用。任务接纳只接收当前用户文本及消息 ID；可信执行器再从已绑定的 Work 会话读取原消息，并保留工作目录、推理设置、模型覆盖、资源收窄和 slash 命令。本轮流式输出由任务租约下的执行器传回 coordinator；最终助手消息仍只由 coordinator 保存一次。

Work 首次接入任务租约时，若 Conversation 已有持久沙箱，执行准入仍在同一事务内将新 Context 绑定到该沙箱，不新建工作卷。Conversation 与 Context 都须属于同一入口、固定同一修订，既有不同沙箱映射则拒绝而不覆盖。模型、MCP 与外挂沙箱访问继续严格核对两种身份，不因 UI 回调或原生会话已打开而放宽授权。

显式会话升级同时更新自己绑定的普通入口 Context 修订和目标指纹，保留原 Context 与沙箱；历史 Task/grant/receipt 不变，新输入才使用新授权。整个根任务树必须停止后才可升级，不能只看父任务终态；独立 A2A 会话及其他聊天的固定修订不跟随。针对旧实现遗留的不一致，重复显式升级到当前版本只修复该会话自己的绑定，不增加执行授权或重放旧输入。

HTTP 断开仅停止观察，已经接受的任务继续存在。停止读取不等于取消任务；明确取消传递到原生执行并约束后代。已发生的外部副作用不会回滚，失败消息不能作为“新重试任务”静默重放。

## 消息渠道的执行身份

外部聊天用户 ID 不是 ToolPlane 用户 ID。工作区所有者或管理员添加频道时，自动将当前鉴权账户绑定为执行操作人；配对或启用原有未绑定连接时也会自动补齐。微信扫码确认后自动启动，不需要独立的 A2A 授权项。模型和来信参数不能指定任意平台用户，绑定不扩大联系人、来源和沙箱限制。

执行中持续检查操作人、连接状态、渠道配置及祖先授权。停用连接、撤销账户权限或配置变化后，根任务、子任务和原生 UI 读取不得沿用原权限。缺少身份的历史记录失败关闭，直到管理操作绑定当前账户；不推断使用工作区所有者。

频道正常回复实际执行结果，不逐条发送接收回执。平台工具审批由**原发送者在原 chat/thread** 使用 `/approve <短码>` 或 `/deny <短码>` 决定，任意自然语言“批准”、其他发送者或其他会话均不能替代。Pi 扩展发起的确认、选择或文本输入仍通知用户打开原会话的 Work 链接，由绑定的真实平台操作人登录后回答原生对话；频道短码不能回答这些对话。执行失败保存安全的失败消息并尝试回传，不泄露原始异常或凭据；断开观察者不伪造失败、不重放任务。任务持久化不等于最终消息已投递，不承诺跨重启 exactly-once。

## 平台工具审批

固定 Pi 修订的 `toolApproval` 默认为 `off`；可选 `write`、`exec`、`all`，并支持按实际工具名设置 `ask/allow/deny` 覆盖。分类中 `read/grep/find/ls` 为读，`edit/write` 为写，其他名称归执行类；`write` 模式同时询问写入和执行类，`exec` 仅询问执行类，`all` 询问全部。覆盖优先于模式，修改经修订审阅发布，已有会话继续固定自己的配置。

普通 Work/chat/control/频道根入口遵循该策略。A2A 根任务、委派后代和触发器属于无人值守任务，**包括 `deny` 覆盖也自动放行并留下 `unattended_allow` 审计**。这是人工审批的豁免，不是固定授权、MCP allowlist、实时撤权或沙箱边界的豁免，不能用 `deny` 替代无人值守工具权限收窄。

请求绑定 task、执行租约、toolCallId、工具名与精确参数哈希；参数变化拒绝，批准仅可消费一次。最多保留 32 个未消费的待答／已批准请求；有效期取 120 秒、任务截止和 runtime token 失效时间的最早者。Web 路由检查用户有效、Agent 访问权、工作区和会话绑定，记录决策用户；当前实现没有额外将决策用户限定为原执行发起人，不能把原生对话的操作人限制套用于它。频道则校验原消息发送者和来源，且不能通过 Web 代答。没有“总是允许”；拒绝／超时成为失败工具结果，由模型继续处理，不自动将整轮判失败。详见[工作台工具审批](./AGENT_WORKBENCH.zh-CN.md#工具审批)。

## Pi 原生对话与 UI

已授权 Pi 扩展仍可通过原生 `tool_call` 和 `ctx.ui` 决定是否确认、阻止或继续，独立于平台工具审批。旧审批 readiness 握手不恢复。不可变修订、内置工具禁用项、MCP allowlist、沙箱隔离及实时协作授权独立生效；回答任一种确认都不能扩大这些权限。

Web 适配 `confirm`、`select`、`input`、`editor` 的 `extension_ui_request` / `extension_ui_response`，以及通知、状态、文本 widget、标题和编辑器文本。任意 TUI `custom()` 或自定义终端组件不转译为 Web。没有 UI 通道的宿主保持非交互 JSON 模式。

每个待答对话绑定当前任务或 Work 执行租约、原生请求 ID 和有效期。只有该执行所属操作人能回答；重复、过期、跨工作区、跨会话、跨租约或撤权后的回答均拒绝。同一 ID 不能替换问题或选项。宿主取消、扩展 signal 或超时会退休对话，取消结果按 Pi 原生语义返回。回调等待期间，任务仍保持标准 WORKING，界面投影为等待输入；不是新的 A2A 状态，也不意味着可恢复进程检查点。

UI 请求和持久投影上限 256 KiB，最多 32 个当前待答对话、64 条最新非对话事件。它们是有界 Web 展示，不是另一份会话历史。传输或授权失败不能默认为批准；已初始化的原生会话历史仍保存，后续输入不重放失败轮次。

[A2A 1.0 授权语义](https://a2a-protocol.org/latest/specification/#764-in-task-authorization-scope)将授权范围和执行校验交给实现，并不要求每个内部工具调用都人工审批。ToolPlane 接纳任务只授权已有配置能力；INPUT_REQUIRED 用于补充输入，AUTH_REQUIRED 用于额外授权。

**平台工具审批与原生确认都不等于操作系统隔离。**已授权扩展可以在沙箱内直接执行 Node、文件和网络操作；不要给不受信任的扩展额外管理凭据。同一 Agent 的 HOME／XDG 与登录状态共享，会话目录分离不是容器级隔离。

## 原生 todo

默认加载固定 Pi SDK 的官方 todo 扩展示例；已授权包提供 `todo` 时使用包实现。权威状态只来自 SessionManager 当前分支的原生工具结果，启动、重启、分支切换和清空时重新投影。平台不注册第二个 todo 工具或维护另一套待办状态机。

Web 使用 beUI TodoList 显示 `{id:number,text:string,done:boolean}` 原生列表。完成、刷新和新任务排队期间保留最近投影，之后由宿主当前分支覆盖。自定义不同 schema 不猜测转换；超过展示限制时保留原生完整状态并通知用户，不截断或伪造列表。

## 路由

```text
POST     /api/v1/agent-runtime/tasks/{taskId}/ui
POST     /api/v1/agent-runtime/sessions/ui
POST     /api/v1/agent-runtime/tasks/{taskId}/tools
POST     /api/v1/agent-runtime/tasks/{taskId}/tool-approvals
GET/POST /api/v1/agents/{agentId}/conversations/{conversationId}/tool-approvals
GET/POST /api/v1/agents/{agentId}/conversations/{conversationId}/execution
GET/POST /api/v1/workspaces/{slug}/agents/{agentId}/a2a/console/ui?rootTaskId=...&taskId=...
GET/POST /api/v1/workspaces/{slug}/work-sessions/{workSessionId}/ui
```

运行时 UI 入口只接受当前执行的签名凭据和有效租约；会话浏览器入口从 URL 会话的服务端绑定推导任务，禁止客户端指定 taskId，只接受同源登录态和该执行所属账户。协议控制台及 Work 入口继续执行各自的工作区和操作人校验。读取返回 `execution` 及 `uiRequests`、`todos`、`uiEvents`，回答提交原生 `extension_ui_response`。

工具审批使用独立的 `tool-approvals` 路由与 `toolApprovals` 投影，不把审批决定伪装成 `extension_ui_response`。runtime 路由执行请求／读取／消费协议；浏览器 GET 读取、POST 决策，按请求用户及 Agent 访问权鉴权，未携带 Authorization 的写请求还须同源。频道审批只能由原频道命令决策，不能通过 Web API 代答。

## 迁移与验收

历史原生 UI 切换曾使用 `20261102000000_pi_native_ui` 和 `20261102010000_native_ui_work_cutover`，将旧审批表移至 `toolplane_archive` 保留证据，并将旧 `waiting_approval` Work 标为失败、不重放。这描述的是旧机制退役，不代表当前版本没有工具审批；新 `AgentToolApproval` 与旧归档表、旧 readiness 协议不同。部署当前版本应备份数据库与卷、排空旧任务、应用该版本完整迁移链、生成 Prisma Client，再按单运行时所有者流程重启，不能只应用这两个历史迁移。

建议分别验证平台审批的精确参数绑定、单次消费、超时、跨租约／工作区／会话拒绝、成员与非成员权限、频道原发送者短码、无人值守豁免与实时撤权，以及 Pi 原生对话的操作人限制、取消、todo 刷新和原生分支恢复。请求幂等比较须覆盖 PostgreSQL JSONB 往返，不依赖对象键顺序。

宿主集成测试使用真实 Pi SDK 和受控本地模型/UI 服务；浏览器验收应实际完成一次原生确认并观察宿主继续执行，而不只看卡片。它们不代表付费 provider、远程 TLS 或全部 Docker 路径均已验证。参见[原生 SDK 验证](RUNTIME_OPERATIONS.zh-CN.md#原生-sdk-验证)。
