# 统一入口与原生 Pi 交互

面向部署者、工作区管理员和集成开发者。ToolPlane 负责准入、资源授权和 Web 传输；Pi 扩展负责执行中的确认和输入，不另建平台逐次工具审批。

## 支持边界

Pi SDK 与 OMP 的聊天、Work、Agent Control MCP 和消息渠道，通过 `submitAgentEntry` / `runAgentEntry` 进入 `src/lib/agents/execution/` 中的通用执行核心，统一处理准入、调度、固定修订和工具。A2A 是可选的协议入口及 Agent 委派能力，不是普通执行的开关；数据库中保留的 `A2ATask` / `A2AContext` 名称不代表每次执行都走 A2A 协议。标准 A2A/MCP 服务入口按各自的鉴权策略适配到同一核心；独立 A2A 工作台已移除。

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

频道正常回复实际执行结果，不逐条发送接收回执。Pi 扩展发起确认、选择或文本输入时，通知用户打开原会话的 Work 链接；绑定的真实平台操作人登录后回应原生对话，无需进入 A2A 设置。外部消息中的“批准”不是控制面决策。执行失败保存安全的失败消息并尝试回传，不泄露原始异常或凭据；断开观察者不伪造失败、不重放任务。任务持久化不等于最终消息已投递，不承诺跨重启 exactly-once。

## 原生权限与 UI

平台不再注入执行前工具审批或 readiness 握手。已授权 Pi 扩展通过原生 `tool_call` 和 `ctx.ui` 决定是否确认、阻止或继续；没有权限扩展时，不凭空增加一套平台弹窗。不可变修订、内置工具禁用项、MCP allowlist、沙箱隔离及实时协作授权仍独立生效，点击确认不能扩大这些权限。

Web 适配 `confirm`、`select`、`input`、`editor` 的 `extension_ui_request` / `extension_ui_response`，以及通知、状态、文本 widget、标题和编辑器文本。任意 TUI `custom()` 或自定义终端组件不转译为 Web。没有 UI 通道的宿主保持非交互 JSON 模式。

每个待答对话绑定当前任务或 Work 执行租约、原生请求 ID 和有效期。只有该执行所属操作人能回答；重复、过期、跨工作区、跨会话、跨租约或撤权后的回答均拒绝。同一 ID 不能替换问题或选项。宿主取消、扩展 signal 或超时会退休对话，取消结果按 Pi 原生语义返回。回调等待期间，任务仍保持标准 WORKING，界面投影为等待输入；不是新的 A2A 状态，也不意味着可恢复进程检查点。

UI 请求和持久投影上限 256 KiB，最多 32 个当前待答对话、64 条最新非对话事件。它们是有界 Web 展示，不是另一份会话历史。传输或授权失败不能默认为批准；已初始化的原生会话历史仍保存，后续输入不重放失败轮次。

[A2A 1.0 授权语义](https://a2a-protocol.org/latest/specification/#764-in-task-authorization-scope)将授权范围和执行校验交给实现，并不要求每个内部工具调用都人工审批。ToolPlane 接纳任务只授权已有配置能力；INPUT_REQUIRED 用于补充输入，AUTH_REQUIRED 用于额外授权。

**原生确认不等于操作系统隔离。**已授权扩展可以在沙箱内直接执行 Node、文件和网络操作；不要给不受信任的扩展额外管理凭据。

## 原生 todo

默认加载固定 Pi SDK 的官方 todo 扩展示例；已授权包提供 `todo` 时使用包实现。权威状态只来自 SessionManager 当前分支的原生工具结果，启动、重启、分支切换和清空时重新投影。平台不注册第二个 todo 工具或维护另一套待办状态机。

Web 使用 beUI TodoList 显示 `{id:number,text:string,done:boolean}` 原生列表。完成、刷新和新任务排队期间保留最近投影，之后由宿主当前分支覆盖。自定义不同 schema 不猜测转换；超过展示限制时保留原生完整状态并通知用户，不截断或伪造列表。

## 路由

```text
POST     /api/v1/agent-runtime/tasks/{taskId}/ui
POST     /api/v1/agent-runtime/sessions/ui
POST     /api/v1/agent-runtime/tasks/{taskId}/tools
GET/POST /api/v1/agents/{agentId}/conversations/{conversationId}/execution
GET/POST /api/v1/workspaces/{slug}/agents/{agentId}/a2a/console/ui?rootTaskId=...&taskId=...
GET/POST /api/v1/workspaces/{slug}/work-sessions/{workSessionId}/ui
```

运行时 UI 入口只接受当前执行的签名凭据和有效租约；会话浏览器入口从 URL 会话的服务端绑定推导任务，禁止客户端指定 taskId，只接受同源登录态和该执行所属账户。协议控制台及 Work 入口继续执行各自的工作区和操作人校验。读取返回 `execution` 及 `uiRequests`、`todos`、`uiEvents`，回答提交原生 `extension_ui_response`。

## 迁移与验收

切换前备份并排空旧任务，应用 `20261102000000_pi_native_ui` 和 `20261102010000_native_ui_work_cutover`，生成 Prisma Client，按单运行时所有者流程重启。旧审批表移至 `toolplane_archive` schema 保留证据，不提供旧审批兼容入口。旧 `waiting_approval` Work 标为失败，不自动启动或重放。

重点验证原生对话回答、重复与跨租约拒绝、取消/超时、实时撤权、todo 完成后刷新和原生分支恢复。请求幂等比较须覆盖真实 PostgreSQL JSONB 往返，不依赖对象键顺序。

宿主集成测试使用真实 Pi SDK 和受控本地模型/UI 服务；浏览器验收应实际完成一次原生确认并观察宿主继续执行，而不只看卡片。它们不代表付费 provider、远程 TLS 或全部 Docker 路径均已验证。参见[原生 SDK 验证](RUNTIME_OPERATIONS.zh-CN.md#原生-sdk-验证)。
