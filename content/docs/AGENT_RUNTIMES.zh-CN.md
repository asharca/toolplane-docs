# Agent 运行时实现：原生 Pi SDK 与 OMP


ToolPlane 支持两种独立的可执行 Agent：在专属 Docker 沙箱中使用官方 `AgentSession` 的 **Pi SDK 0.87.1**，以及使用原生 RPC UI 协议的 **OMP 18.14.0**。两者共享平台的修订、模型代理和工作区授权边界，不互相降级。GitHub 插件来源、所有权与恢复流程见[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md)。

普通 Pi CLI、Claude Code、DSH 和旧 Harness 仍不是可选执行器或恢复降级方案。已退役运行时的历史消息和绑定文件只读；转换创建需要显式授权的全新草稿，不恢复旧会话。

## 1. 配置不等于执行授权

**Agent** 管理工作区内的配置与资源关系；可编辑**草稿**与不可变的已应用**修订**分离。**Conversation**、Work 准入或本地 A2A context 各自固定修订；同一 Agent 复用一个持久 Docker 沙箱，各会话使用独立工作目录与原生进程状态。

普通创建默认使用 Pi（内部标识 `pi-sdk`），也可主动选择 OMP（`omp`）；它们不是同一运行时的别名。已有 OMP 用户可使用独立的可选导入流程，普通创建不要求本机配置。创建 Agent 或沙箱记录不代表运行时就绪，也不构成执行授权。

### 新建：确认配置后创建即可使用

控制台新建向导最后的**创建并启用**是一次明确授权：用户已选择模型、技能、能力包和工具并看到配置摘要，提交后自动准备和应用首个不可变版本，成功直接进入可输入的工作页，不再要求去设置重复启用。准备期间显示检查进度；任何权限、依赖或能力预检失败都在原表单反馈并保留输入，Agent、默认沙箱与首个版本一并回滚，不留下创建成功但无法使用的半成品。准备通过不代表已执行任务，仍由用户发送消息才开始执行。

此行为仅用于完整的新建向导。克隆、历史转换和低层创建保持未授权状态；已有未启用记录不会被自动授予权限。插件先添加到工作区，再由 Agent 设置选择；工作区更新后的自动跟随遇到新增 MCP 工具或代码变化时需 owner/admin 审核。修改已有 Agent 仍走下面的配置确认流程，既有会话固定版本不变。

### 设置：保存即生效，仅新增授权单独确认

指令、模型等普通配置修改和权限缩减，点击**保存**后自动准备并应用新版本，不要求再确认整份配置。仅新增工具、技能/包代码变化、凭据/知识库访问、网络/环境权限或扩大协作范围时，进入独立的**确认新增权限**界面，只列出增量；**允许并保存**后生效，**返回修改**不授予新权限。初次启用的未授权记录不以其草稿充当已授权基线。保存仅影响新会话，不执行任务，也不改变已有会话固定版本。

从工作页面打开智能体设置或新建时使用客户端导航进入拦截式弹窗，不能使用触发整页加载的普通链接。取消（含空白创建）与右上角关闭共用关闭逻辑：先播放与工作区设置一致的收拢动画，再返回原有历史路由，不重新请求工作页面；保留底层会话组件和未发送输入。退出完成以弹窗面板自身的动画为准，不等待表单内任意嵌套动画；减少动态效果模式使用淡出。直接访问弹窗 URL（包括刷新）没有底层页面，关闭时导航到工作页或有效的工作区返回地址。

底层 Work 的频道轮询不应触发子智能体配置重新加载；翻译上下文变化只更新文案，不作为资源请求依赖。设置已有快照时不以加载占位替换列表。

1. 保存先更新可编辑配置，再自动准备；准备或发布失败时明确提示“修改已暂存，但尚未生效”，保留原有默认版本。没有新增授权时无需额外点击确认。
2. 内部 Prepare 在发布事务外完成依赖捕获/构建与原生能力预检，冻结镜像、Pi 版本、网络/资源限制、初始快照、凭据引用、模型与指令、Skill/包制品及 MCP/A2A 授权；凭据明文不进入配置。权限增量比较忽略无关配置和集合顺序，替换可执行内容仍须确认。
3. 自动保存和显式确认都提交准确的准备结果与预期当前修订 ID，重新验证实时权限、制品、源摘要与原生预检，再原子比较并切换默认修订（CAS）。另一页面已更新默认时，不按旧基线自动应用，要求重开设置。配置编辑使待确认结果失效；确认成功后更新比较基线，避免重复索取既有权限。
4. **回滚**以同一 Agent 保留的历史修订发布一个新版本，仍须预期当前修订检查和实时验证。不改写历史、不恢复撤销授权，也不移动现有会话固定引用。

实现见 [`revisions.ts`](../src/lib/agents/revisions.ts) 和 [`revision-types.ts`](../src/lib/agents/revision-types.ts)。工作区安装包不等于为 Agent 启用。单项 Enable 和引导安装只将明确审阅的改动合入已应用修订，不发布无关草稿。卸载通过 CAS 发布仅移除该包的新默认，同时保留会话引用制品和共享 MCP deployment。

侧栏状态区分配置就绪与运行状态：已启用 Agent 的沙箱正常 `stopped`（按需启动或闲置回收）不是警告，待机不亮点；当前会话运行中为绿色。未完成配置、`setup_required`、等待用户或审批仍为黄色，真实运行/恢复错误为红色。Agent 聚合当前会话的等待状态，不因历史失败会话永久显示错误。

## 2. 固定执行链路

```text
Chat / 消息渠道 / Work / 本地 A2A
  → 鉴权，校验工作区、Agent 与会话准入
  → 固定不可变修订 ∩ 当前实时权限
  → 获取会话/沙箱租约并执行并发限制
  → 获取该 Agent 的共享沙箱及当前会话目录
  → sandbox-turn.ts / sandbox-runtime.ts
  → Pi：native-runtime-session.mjs → pi-sdk-session.mjs → 官方 AgentSession
  → OMP：omp-session.mjs → 固定 OMP 二进制 → rpc-ui 原生会话
  → 受控模型 / 原生扩展 UI / MCP / 协作 broker
  → 原生事件与完成回执
  → 调用方负责 UI 流、Work 状态与平台消息持久化
```

Pi 宿主按 `message_update.assistantMessageEvent` 转发真实正文与 thinking 增量，经运行时解析、Work SSE 到达页面，不等最终回执才补发全文。驻留宿主的复用签名包含输出协议，协议切换沿用安全重启和原生历史恢复，不创建替代会话或重放历史。验收须证明任务结束前浏览器已显示正文增量，不能只核对最终回复。

执行记录展开后按实际高度进入会话滚动区域，运行中也不使用固定高度裁剪窗口。读者展开过程或工具详情时暂停自动跟随，长工具载荷保留内部滚动；回到底部可继续跟随新输出。

右侧消息导航轨道以覆盖层显示，不随显隐给消息视口添加单侧占位；消息列与输入栏始终使用相同的居中宽度基准。验收同时检查溢出与未溢出状态、桌面和窄屏，以及导航跳转。

SDK 要求 Linux、Node 26，原生包架构须匹配 Docker daemon。可信运行时安装与冻结扩展制品落盘是不同操作；每轮不重新下载或安装审核过的扩展依赖。不得通过在活跃沙箱安装新版上游 Pi 或修改版本文件来升级。

沙箱不可用、固定引用无效、broker 拒绝或原生加载失败均停止执行，不选择宿主模型循环、普通 CLI、其他运行时、当前可变默认值，也不重放历史消息。

## 3. 源码导航

| 职责 | 源码 |
|---|---|
| 运行时能力分类 | [`runtime-kind.ts`](../src/lib/agents/runtime-kind.ts) |
| 不可变准备、发布与实时权限交集 | [`revisions.ts`](../src/lib/agents/revisions.ts) |
| 会话沙箱分配与保留绑定 | [`conversation-sandbox.ts`](../src/lib/agents/conversation-sandbox.ts) |
| 专属 turn 与 Docker 执行 | [`sandbox-turn.ts`](../src/lib/agents/sandbox-turn.ts)、[`sandbox-runtime.ts`](../src/lib/agents/sandbox-runtime.ts) |
| 持久守护进程与 SDK 宿主 | [`native-runtime-session.mjs`](../scripts/native-runtime-session.mjs)、[`pi-sdk-session.mjs`](../scripts/pi-sdk-session.mjs) |
| 原生能力预检与命名空间 | [`pi-sdk-preflight.mjs`](../scripts/pi-sdk-preflight.mjs)、[`pi-sdk-capabilities.mjs`](../scripts/pi-sdk-capabilities.mjs) |
| 快照字节与链接验证 | [`pi-sdk-package-files.mjs`](../scripts/pi-sdk-package-files.mjs) |
| 准确包会话固定引用 | [`pi-session-packages.ts`](../src/lib/agents/pi-session-packages.ts) |
| 运行时授权 | [`runtime-access.ts`](../src/lib/agents/runtime-access.ts)、[`runtime-grant.ts`](../src/lib/agents/runtime-grant.ts) |
| 原生扩展 UI 与 todo 投影 | [`pi-sdk-ui.mjs`](../scripts/pi-sdk-ui.mjs)、[`pi-sdk-native-resources.mjs`](../scripts/pi-sdk-native-resources.mjs)、[`execution/native-ui.ts`](../src/lib/agents/execution/native-ui.ts) |
| 命令与会话操作 | [`runtime-commands.ts`](../src/lib/agents/runtime-commands.ts)、[`runtime-command-service.ts`](../src/lib/agents/runtime-command-service.ts)、[`conversation-operations.ts`](../src/lib/agents/conversation-operations.ts) |
| 消息、Work 与任务执行 | [`message-service.ts`](../src/lib/agents/message-service.ts)、[`work/coordinator.ts`](../src/lib/work/coordinator.ts)、[`execution/worker.ts`](../src/lib/agents/execution/worker.ts) |
| UI 投影 | [`ui-stream.ts`](../src/lib/agents/ui-stream.ts) |

保留的历史事件 parser 用于解释已存数据，不意味着旧适配器仍可执行。

## 4. 会话固定引用与共享工作环境

新 Conversation、Work 和本地 A2A context 持久化 `agentRevisionId`；Work 在分配目录前的准入阶段固定修订。每个 Agent 按固定环境懒创建一个持久沙箱，不读取当前可变模板。会话分别使用 `/workspace/conversations/conversation-<身份摘要>/`；无 Conversation 的 A2A 使用 `context-<身份摘要>/`。Pi SDK／OMP 二进制安装在共享的 `/workspace/.toolplane/runtime-packages/`，会话 HOME、插件装配、技能、宿主 socket、临时文件和原生历史位于各自目录。目录分离不是同一 Agent 内的容器安全隔离；不同 Agent 不共享可写卷。当前共享沙箱执行租约使同一 Agent 的 turn 串行，跨 Agent 仍受平台并发限额控制。

显式调用 Agent 会话的 `POST /api/v1/agents/{agentId}/conversations/{conversationId}/revision` 升级时，Conversation、关联 Work 及属于该会话的普通入口 Context 在同一事务内前移到当前修订；Context 的目标绑定同步更新，ID、原生状态和目录不变。共享沙箱的环境固定引用和其他会话不变；改变镜像、网络、凭据等共享环境的升级返回 `AGENT_SHARED_ENVIRONMENT_CONFLICT`，不会隐式影响其他会话。历史任务、授权快照、消息和幂等回执不重写。存在排队、执行、等待输入/授权或尚未停止的后代任务时拒绝升级。普通发送消息不会隐式升级。

`PiSessionPackageSet` 按 Conversation／Context 记录准确包 release/checksum 和 MCP 绑定，不以共享 sandboxId 作为唯一身份；同一容器内不同会话可保留不同版本。工作区包更新、新应用默认和回滚只影响新会话。普通卸载或下架保留已引用的批准制品；危险 release 撤销和当前 provider、凭据、包、MCP、方向性协作限制仍阻止执行。固定引用不是不可撤销权限快照。

条目下架后，新建 Work 在写入 Conversation/Work 记录前返回 `PI_PACKAGE_UNAVAILABLE`，不为新任务分配执行资源；已有会话仍按上述固定引用与实时撤销规则处理。

数据库管理身份、修订/沙箱绑定、授权与任务回执；官方 SDK JSONL 文件管理原生对话状态。状态限定在当前会话目录的 `.toolplane/runtimes/<运行时>/agents/<agent-id>/`；本地 A2A 复用持久化 context ID。私有宿主状态跟踪 new/fork/switch 后实际选中的 SDK 会话，与旧 Harness 检查点无关。旧独立卷首次使用时校验后复制到会话目录，原卷停止并只读保留至 Agent 删除；迁移只改原生路由头及状态路径，不重写消息正文、修订或插件 checksum。

保留 context 必须重新打开原生会话。持久历史丢失，或宿主在首次会话文件落盘前丢失，返回 `PI_SDK_SESSION_MISSING`。历史修订/包固定引用未解决返回 `AGENT_REVISION_UNRESOLVED`；包集合不匹配返回 `PI_SDK_PACKAGE_SET_CHANGED`。应排查或恢复匹配工作卷，不得从当前默认猜测固定引用、修改 checksum、重放消息，或新建空会话冒充恢复。

### 实时执行阶段

智能体 Work 与助手会话在执行期间显示相同的阶段：排队中、准备中、等待模型响应、生成中、执行工具中。准备阶段包括固定配置、连接和运行环境准备；等待模型从真实 provider 请求边界开始，收到正文、思考或工具调用内容后才进入生成。工具执行结束后，下一次模型请求会重新显示等待模型响应，不用固定延时猜测进度。

Work 通过现有输出快照和 SSE `stage` 事件恢复当前阶段；Pi 使用 `before_provider_request`，OMP 根级通过有序原生 RPC 通知请求边界。助手通过 `ChatRunEvent` 保存 transient `data-chat-execution` 事件，并在快照中提供 `{ runId, stage, sequence }`，依照轮次和游标恢复，阶段不写入保存的消息正文。终态清除实时阶段；既有历史、停止请求、确认与授权规则不变。

准备阶段不逐文件启动 Docker 命令：Pi／OMP 每轮把可信宿主脚本和 MCP factory 合并为一次受跟踪写入，仍重新读取、覆盖全部源码并保留 Pi 源码 checksum 重载；动态配置与包校验保持原顺序，不缓存或跳过授权。助手并发准备远程工具与历史／附件，各 MCP Deployment 的工具发现也并发进行；全部已启动分支结束后才进入模型或报告失败，工具组装与错误优先级仍按原输入顺序。首次安装、原生运行时启动与远程 MCP 响应仍计入真实准备时间。

### 单条消息临时切换模型

智能体和助手的输入框右下角可以选择本次发送使用的模型，默认是配置里的模型（标有“默认”）。选择只作用于之后从这个输入框发出的消息，不修改智能体/助手配置，也不发布新修订；刷新页面或点“恢复默认”后回到默认模型。每条回复下方显示实际回答的模型。

- 请求体携带可选 `modelOverride: { providerId, model }`。服务端校验服务商属于当前工作区且已配置凭据、模型在该服务商的模型列表中，并满足运行时要求（助手：文本、工具、推理、附件能力；智能体：与配置模型相同的 Pi 格式要求）。不满足时拒绝并返回本地化错误，不回退到其他模型。
- 智能体：每次提示都通过原生 `session.setModel(..., { persist: false })` 设置本轮模型；未指定时显式恢复固定修订的默认模型。会话历史、包和工作卷不变，凭据仍经模型代理和运行时 grant 解析。
- 助手：覆盖只作用于该次 Run，参与幂等哈希；回复消息记录实际使用的服务商和模型。重新生成未指定覆盖时使用默认模型。

### 助手会话升级到最新配置

助手会话固定创建时的修订。只有系统提示词、模型、模型参数、最大步数和 MCP 授权进入修订；改名称、描述或置顶不发布新修订。
会话修订落后于默认修订时，会话顶部提示“默认配置有更新”：

- 「查看更新」调用 `GET /api/v1/chat/threads/{threadId}/revision?targetVersion=N`，列出变化的配置项，并提示是否授予新工具权限。
- 「升级到最新版本」调用 `POST` 同一路径：把当前分支的消息复制到固定新修订的新会话并跳转过去；原会话不变。有进行中的 Run 时拒绝。
  会话修订由数据库触发器 `ChatThread_revision_pin` 保证不可变，因此升级不修改原会话。

## 5. 原生守护进程与请求 context

[`native-runtime-session.mjs`](../scripts/native-runtime-session.mjs) 只接受 `pi-sdk`，按私有状态路径哈希生成沙箱内 Unix socket，同一时间只允许一个请求，其他请求返回 `PI_SDK_BUSY`。它跨 turn 保留 SDK 子进程，处理停机、socket 断开和配置签名变化。守护进程重启不等于允许重放中断任务。

[`pi-sdk-session.mjs`](../scripts/pi-sdk-session.mjs) 加载固定 SDK，使用明确资源构建官方会话服务，关闭默认扩展、Skill、prompt、theme 和 context file 的自动发现。模型凭据仅在请求期间保存在内存；每次请求刷新 runtime token、MCP context 与原生 UI 通道，结束后清理请求凭据。缺少 context 返回 `PI_SDK_CONTEXT_REQUIRED`；原生工具定义变化返回 `PI_SDK_TOOLSET_CHANGED`，不静默改变保留会话。上下文压缩使用 Pi 原生自动压缩，不另建摘要或历史状态机。

结构化事件走专用文件描述符。扩展 stdout/stderr 不是可信协议通道，不能伪造 broker 结果。数据库消息持久化和 UI/Work 生命周期由调用方负责，不由低层执行器代办。

## 6. 受控 broker 与隔离边界

模型请求走 ToolPlane 的凭据化模型代理 `/api/v1/agent-runtime/model/{providerId}`，不把真实上游密钥交给扩展配置。运行时 grant 是范围受限的凭据，不是个人 API Token 或桌面安装 Token。代理重新校验当前资源关系，上游凭据由平台管理。不要将 runtime token、provider key 或数据库凭据暴露到提示词、日志或 issue 附件。

平台不再注入逐次工具审批或审批 readiness 握手；是否询问用户由已授权的 Pi 扩展决定，`ctx.ui.confirm/select/input/editor` 使用原生 RPC 请求和响应。通用任务通过 `/api/v1/agent-runtime/tasks/<task-id>/ui`，专属 Work 通过 `/api/v1/agent-runtime/sessions/ui` 传递交互。通道只允许 HTTP(S)、无内嵌凭据/query/fragment、禁止重定向，并校验 runtime token、操作人、工作区与当前执行租约。重复、过期、跨租约或已撤权的响应不能继续执行；无 UI 通道时保持非交互 JSON 模式。

MCP 工具必须同时位于不可变修订授权和当前显式工具 allowlist 内。会话 broker 校验固定镜像/recipe 和实时授权后懒启动隔离 sidecar；共享 deployment 停止不意味着可以丢弃有效固定 recipe，也不能借用共享进程。协作同样取固定/实时入站出站权限交集，并执行明确有界目标授权、工作区/操作者范围及循环/深度限制。

任务运行时的工具目录保留固定修订中的稳定位置，避免撤权后重编号导致原生工具名变化。`tools/list` 不是实时授权凭据；协作调用仍在派发前重新检查出站权限。关闭 A2A 出站会拒绝协作调用，但不关闭同一任务的交付物发布能力。

授权里一个工具都没开放的 MCP 服务不会交给 Pi 会话；设置页的 MCP 一栏会列出这些服务并给出“选择工具”入口。会话启动时某个 MCP 服务列工具失败，Pi MCP 扩展先上报 `toolplane_mcp_unavailable`（部署 ID 和固定拒绝码，如 `MCP_TOOL_FORBIDDEN`），宿主把失败记为 `PI_MCP_TOOLS_UNAVAILABLE: <拒绝码> <服务名>`，控制台据此提示哪个服务、因为什么失败。拒绝码只来自运行时路由的固定白名单，不包含工具输出或凭据。

**工具审批不等于任意代码隔离。**已批准扩展可在沙箱内直接使用 Node、文件与网络。内置工具禁用项和 broker scope 不替代容器、挂载、网络边界。附件元数据也不能证明字节已挂载；可读路径提示必须来自有效沙箱 `runtimePath`。

回调连通性先检查 `TOOLPLANE_RUNTIME_ORIGIN` 和容器到平台实际网络。`sandboxRuntimeOrigin()` 将 loopback 转换为 `host.docker.internal`，取 URL origin，不保留配置中的子路径。

## 7. 原生预检、包与命令

Prepare/发布在固定隔离捕获镜像 `toolplane-pi-package-capture:0.87.1` 中使用真实 SDK loader，不靠扩展工厂源码文本猜测能力。原生命名空间检查覆盖工具、命令、Skill、prompt 及保留的生成 MCP 名称。冲突保留类型化 `PI_CAPABILITY_CONFLICT`；所选扩展加载失败保留 `PI_EXTENSION_LOAD_FAILED` 和有界阶段诊断。不静默丢弃冲突扩展或替换版本。

冻结快照包含依赖，执行和 reload 前完整验证字节与链接；篡改在 turn 执行前返回 `PI_PACKAGE_CHECKSUM_MISMATCH`。原生快照必须匹配执行平台/架构。启动不安装插件依赖、不执行包管理器 hooks，也不将发现任意用户配置作为降级方案。

命令保留原生调用大小写和 `:1` 等冲突后缀。未知命令报错，不转成模型提示词。纯命令完成回执不伪造成模型回答。Web 适配原生 RPC 的确认、选择、输入、编辑、通知、状态、文本 widget、标题和编辑器文本；任意 TUI `custom()`、自定义终端组件和终端布局不转译为 Web。

默认加载已安装 Pi SDK 的官方 todo 扩展示例；已授权包提供同名 `todo` 工具时使用包实现。todo 的权威状态来自原生 SessionManager 当前分支的工具结果，启动、重启、分支切换及清空后重新投影；平台不注册第二个 todo 工具或维护另一套任务状态机。`/todos` 在 Web 中显示原生待办通知。仅识别 `{id:number,text:string,done:boolean}` 列表；自定义不同结构仍可执行，但不猜测转换为列表。
在 Agent 新建和设置的“内置工具 → 编排工具”中可查看并启用/禁用 `todo`，默认启用；底层仍使用上述 Pi 扩展，不新增平台工具实现。

UI 请求和持久展示投影上限为 256 KiB，最多 32 个待答对话和 64 条最新非对话事件。todo 超过展示限制时保留原生完整数据并通知用户，不截断或伪造待办；鉴权或传输失败仍会终止当前交互。完成后的 todo 可刷新查看，新任务排队时保持上次展示，直到原生当前分支投影覆盖。

在自己拥有且空闲的会话发送 `/compact` 或 `/compact <自定义指令>`，对同一保留会话调用原生 `session.compact()`，须等待持久化的原生结果。绑定忙碌时拒绝第二个 writer；失败不回退宿主摘要或 CLI 压缩。渠道命令要求稳定 transport 消息 ID 去重；已鉴权会话命令生成原生回执 ID。Work 命令仍由 coordinator 管理。

## 8. 取消、排空与历史策略

取消停止绑定原生进程和会话 MCP sidecar，不删除持久工作卷。Docker 操作接入运行时所有权与取消跟踪。终止是有界清理，不是任意工具副作用的回滚。未知副作用和远端 ACK 保持未知，不能重放任务制造完成结果，也不承诺远端 exactly-once。会话/沙箱忙碌时，未领取的委派工作保持排队，直到正常租约重新可用。

单个工具调用失败（例如 shell 命令以非零状态退出）只是一条失败的工具结果，模型读到后继续处理，不会让本轮失败。模型请求失败、用户停止或 UI 传输失败时，本轮以 `PI_SDK_MODEL_FAILED` / `PI_SDK_ABORTED` / `PI_SDK_UI_FAILED` 结束，但已写入的原生会话历史会保存，下一条消息在同一会话里继续，不会变成 `PI_SDK_SESSION_MISSING`，也不会重放这一轮。

单一 runtime owner 完成恢复后才接受执行。所有权丢失停止新工作；停机停止 coordinator/broker，排空或中止跟踪操作，最后释放所有权。不确定清理保留 dirty marker。HTTP liveness 不等于 readiness，换数据库/domain 或删除恢复标记不是接管流程。遵循[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md)，包括准确且仅用于一次重启的恢复 ACK 要求。

**已退役运行时和未解决固定引用的历史会话只读。**保留非删除范围内的历史消息、response、绑定文件读取、历史解析/归档访问及真正已绑定操作的取消/排空。不得启动、恢复、重放旧运行时，也不向其上传或开启执行终端。已删除的专用执行/model/profile/runtime MCP/dashboard/upload 路由不是兼容入口。旧 `pi-harness` 任务标签只识别绑定清理。受控转换须排空旧任务，创建全新草稿并重新审阅授权，不恢复旧运行时状态、不自动重新发布公开包。公共 A2A 服务启用返回 `runtime_unsupported`（HTTP 409），旧公开发布 action 已删除；公开 A2A 发送及退役 HTTP 执行入口在新记录或分配前拒绝（HTTP 410 或对应协议错误），不转接新执行器。

排障优先使用关联 ID、状态、耗时与失败类型。Agent 内容采集须显式限时授权，见[可观测性](./OBSERVABILITY.zh-CN.md)。不要将完整原生输出、提示词或私有配置贴到公开 issue。

## 9. 回归源码与证据边界

保留的 [`native-runtime-session.test.ts`](../tests/integration/native-runtime-session.test.ts) 是无条件运行的原生 SDK daemon 回归，不是环境变量开启的真实 CLI/容器矩阵，不能证明真实 provider 或 Docker 验收。

[`pi-sdk-host.test.ts`](../tests/integration/pi-sdk-host.test.ts) 使用仓库已安装的 `@earendil-works/pi-coding-agent` 依赖，配合临时目录和受控本地 HTTP 模型/MCP/UI fixture 启动真实 SDK 宿主，覆盖自动压缩、原生对话、todo 分支恢复与失败后继续。需要固定依赖、兼容 Node、子进程及本地 socket/文件访问；它不是付费 provider 测试，也不要求预装 CLI 的沙箱。[`pi-sdk-capabilities.test.ts`](../tests/integration/pi-sdk-capabilities.test.ts) 在 Vitest 模块转换之外调用已安装的原生 extension/Skill loader 和命名空间检查。

涉及数据库/Docker 的租约与通信套件只在已批准隔离环境、固定捕获镜像下串行运行；前提以[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md#原生-sdk-验证)和各测试源码为准。不要使用生产 Agent 沙箱、并发操作同一测试数据库，也不要将 parser/unit/受控宿主结果当作真实 provider 验收。原生压缩须单独验证，通信 smoke 不覆盖它。

SDK 变更须同步维护修订 Prepare/CAS、原生预检、冻结制品、实时 broker 权限、会话固定引用、独立工作卷、命令与取消边界。相关文档随实现更新，不得为满足旧调用方或测试而恢复已退役执行别名。

## 10. OMP 与平台资源

OMP 在自己的会话目录中维护原生历史、上下文与 todo。每轮启动原生进程并恢复同一会话；平台不将消息记录重新拼成模型历史。原生工具事件、todo、澄清和支持的文本 UI 投影到网页；终端专用 UI 不等于 Web 组件。版本固定为 18.14.0，首次在 Linux glibc x64/arm64 沙箱内下载对应制品并验证 SHA-256，后续使用同会话卷内的校验制品。

普通创建选择 **OMP** 后，通过平台现有的 **MCP**、**技能** 和 **插件** 设置绑定资源，再审核并应用 Agent 修订。已有本机 OMP 配置可从新建向导选择**从 OMP 导入**；这是可选迁移入口，不是另一套日常资源管理方式。

- **技能**：直接使用工作区技能资源；平台按修订冻结内容，将已授权技能落盘到会话私有目录，交给 OMP 原生发现。
- **MCP**：选择工作区连接，由平台网关执行工具发现与调用，并按修订和实时授权收窄。可选导入将本机连接转换为同一种平台连接；凭据需另外明确配置，不复制宿主登录状态。
- **插件**：绑定工作区已安装的兼容插件及精确 release；平台校验不可变内容并装载其原生入口。导入的 hooks/extensions 同样成为工作区私有插件，不能绕过代码预检与权限确认。
- **模型**：使用平台模型提供商和授权模型；会话只获得受限运行时凭据，不复制宿主 OMP 登录状态、环境或历史。

运行时所需的目录、模型代理、MCP 适配器和插件入口由平台内部生成。内部快照用于版本固定和历史读取，不是第二套资源管理界面；既有会话不随草稿修改而改变。

### 可选：导入本机 OMP

1. 在已安装项目依赖的 ToolPlane 源码目录执行离线导出，将 `--root` 指向本机 OMP 的 `agent` 目录：

   ```bash
   node scripts/export-omp-config.mjs --root ~/.omp/agent --output omp-import.json
   ```

   导出器只读取配置及声明的资源，不执行插件、hook 或安装脚本，不安装依赖、不修改源配置、不上传内容。输出文件仅当前用户可读写，已有文件不会被覆盖。Skill 支持文件、启用的插件 feature 和已安装依赖闭包一并打包；模型目录、认证数据库、历史、缓存和配置备份不进入包。MCP 凭据转为占位符，需要在导入时重新填写。
2. 在 Work 的**新建智能体 → 从 OMP 导入**上传 JSON。导入默认**保留 OMP 执行语义**；若要使用 Pi，必须主动选择**迁移至 Pi**。模型只允许选择当前工作区已有的兼容提供商与模型，不复用本机 provider 密钥或自动创建提供商。
3. 阅读资源和兼容性列表，修正可编辑的 MCP 配置、填写掩码凭据，或明确排除不迁移的资源。绝对路径、本机可执行命令、缺失依赖、未映射原生能力和版本差异不能静默忽略。OMP 专属设置、命令、hook、工具与原生角色不会伪装成 Pi 能力；Pi 插件迁移要求明确的 `pi.extensions` 声明及真实 Pi 加载预检。`SYSTEM.md` 在平台上采用追加指令语义，不替换平台主指令，预览会明确提示。
4. MCP 工具发现会执行隔离服务或连接远程服务，必须先勾选**允许检查 MCP**再预览；仅上传文件不会执行这些服务。预览列出实际发现的工具名称、说明与输入 schema。检查授权不等于创建授权。
5. 确认资源、工具和兼容性结果后，明确批准并导入。任何编辑使上次预览及批准失效；提交重新核对输入、工作区权限和 MCP 工具目录，变化时要求重新预览。导入复用正常创建、能力预检和首个修订授权流程，成功后进入新 Agent 的设置页；不会升级或改变已有会话。

OMP 加载预检在无网络、无凭据的隔离容器中执行。服务进程用户的 `~/.cache/toolplane/omp/<版本>/<平台>-<架构>/omp` 缓存固定版本二进制；每次进程首次使用仍由安装器验证固定 SHA-256，不接受未经验证的缓存。缓存缺失时需先下载制品，服务重启不再重复下载已验证制品。会话自己的工作卷和凭据不进入这个缓存。

可复用的技能、MCP 和插件在原平台页面继续管理；OMP 专属配置与原生角色保留为当前运行时的固定快照或私有包内容，不创建平台 Agent、不恢复手工子定义库。沙箱只获得当前修订授权的资源与凭据。导入成功或加载预检通过不等于任务完成，仍需实际调用所选技能、插件和 MCP 验证其行为。

### 资源归属与编辑

- Agent 主指令使用现有指令编辑器。已有 `SYSTEM.md`、`APPEND_SYSTEM.md`、`AGENTS.md`、`RULES.md` 与 `rules/*` 追加指令仍可查看、编辑；不覆盖主 `systemPrompt`，也不再次自动发现同一文件。
- 子智能体有两种可同时启用的方式：**平台 Agent** 勾选工作区已有 Agent；**OMP 原生子任务** 由 OMP 按当前任务生成临时角色并调用，不另建平台 Agent 或独立定义库。Pi 只支持平台 Agent。
- 技能在平台技能页管理，hooks/extensions 在插件中管理。修改资源产生新版本，不改写已有会话固定的版本。
- 插件配置和 feature 变化派生私有不可变 release；入口按冻结的 `omp`/`pi` manifest 重算。未知 feature、缺失入口或依赖在保存前拒绝，不能让入口清单与实际执行代码不一致。代码与权限变化沿用新增权限审核。
- TMUX、TTY 与终端 BEL 钩子不在网页中执行。Work 顶部的完成通知按钮是对应的网页适配：用户主动开启并授权浏览器通知后，页面隐藏或失焦时，收到当前实时轮次结束事件才通知；历史回放与重连快照不补发，同一工作轮次跨标签去重。通知只包含通用结束提示，不泄露任务内容；关闭页面后不保证通知。插件自身的页面提示仍使用 `ctx.ui.notify()` 等受支持接口。

原生开关、目标选择和原生并发/深度限制保存到父 Agent 草稿，沿用 Prepare、权限审核和 Apply 流程，应用后仅对新会话生效。已有会话继续使用固定修订的设置；历史缺少该字段的修订保留原执行语义。修订中的 `subagentMode: "native"` 表示启用原生子任务，平台目标仍由同一修订的委派策略决定。保存子智能体设置不修改远程 Agent 的允许列表；只保留远程目标时，出站开关维持 A2A 接入页的设置。

修订历史将原生开关与限制计入委派配置变更。启用原生子任务或扩大并发、深度上限标记为新增权限；仅收窄原生限制不标记为扩权，判定与应用前的权限审核保持一致。

### 平台 Agent

勾选同工作区已有 Agent；每个被调用 Agent 使用自己的已应用修订、模型、技能、MCP、插件和独立会话沙箱。调用沿用本地 A2A 的 `pi_a2a_peers`、`pi_a2a_submit`、`pi_a2a_status` 和 `pi_a2a_cancel`。`pi_a2a_submit` 默认等待子任务结束（最长约 4.5 分钟）并直接返回结果与回传文件；仍在运行时返回 `pending: true`，再用 `pi_a2a_status` 查询。传 `wait: false` 可先并行发起多个子任务再分别收取结果。父会话只可调用已明确允许的目标，子任务的开始与结果显示在父会话的子任务活动中。

勾选并应用父 Agent 修订即授权父 Agent 调用该子 Agent，子 Agent 无需开启入站协作；入站开关只控制 A2A 接口和任务控制台的直接调用。设置列出每个 Agent 的未就绪原因（无已应用修订、缺少可联网 Docker 沙箱、修订未设置模型、沙箱或模型提供商在应用后变更），未就绪的 Agent 不能新勾选；已勾选的可保留或移除。执行时检查工作区、父修订与实时目标授权、有向关联，以及深度、循环和预算限制。凭据与沙箱目录不共享；文件通过已有委派文件接口传递。

Pi 与 OMP 的 Work 和 `/chat` 共享委派准入及任务租约，不注入脱离授权的工具。Work 沿用已有 Conversation 的原生状态及活动消息，额外保留 Work 固定资源快照的收窄；不复制平台子 Agent 到父沙箱。父输出流与子活动分开投影，Work coordinator 只写一份本轮助手回复。原生交互仍在 Work 界面回答，但答复绑定当前任务租约；取消和过期后不能回答旧对话。

### OMP 原生子任务

OMP 根据当前任务生成临时子角色并通过原生 `task` 调用，无须预先创建、导入 JSON 或发布子定义版本。角色属于当前会话，不进入平台 Agent 列表。设置只提供开关、最大并发和最大嵌套深度。原生子任务使用父会话授权的模型和能力上限，不得创建新凭据、连接或插件安装；不承诺独立沙箱隔离。

本机导入的原生角色可以保留在私有插件中，模型映射必须选择工作区已有提供商及模型，并经过修订授权；未指定独立映射的角色继承父模型。调用使用原始角色名（例如 `backend`、`frontend`），宿主在应用固定指令、模型与工具限制后，为执行分配唯一的 `tp-native-*` 内部身份。工具历史中的内部身份不表示角色替换，不应因此重复成功任务。角色模型与工具不能由任务参数绕过授权；这些角色不成为平台 Agent。

原生子任务与平台 Agent 可同时启用：前者适合在当前沙箱内并行拆分小任务，后者适合需要独立技能、工具或沙箱的工作。平台委派工具只由父会话使用，原生子任务的工具清单不含这些工具，并由可信策略扩展拒绝调用；未启用原生子任务时关闭 `task` 入口。网页区分子任务角色、工具活动、状态和结果；OMP 18.14 普通子任务没有原生 todo，由父会话维护，不模拟另一套待办。

实际执行的插件 hook 具有唯一调用 ID，记录插件、事件、完成/失败/超时、耗时、净化后的结果及可选子执行来源；不保存原始参数、返回载荷或异常文本。实时投影保留最近 64 条记录，Agent/Work 在本轮结束时将新记录写入回复历史，并按调用 ID 去重。完成屏障有界等待已启动的 hook 与报告；报告失败不能覆盖原有拒绝或取消结果，也不会重放 hook。网页在现有执行记录中展示这些信息，不另设通用 hooks 页面。

撤销有向关联或父 Agent 出站授权会收窄后续调用；固定修订不授予不可撤销权限。平台子 Agent 的执行记录与父会话区分，不把子输出当成父级指令或自动扩权依据。

实现见应用仓库的 `src/lib/agents/platform-subagents.ts`、`src/lib/a2a/local-policy.ts`、`src/lib/a2a/pi-tools.ts`、`scripts/omp-policy.mjs` 和 `src/lib/agents/sandbox-runtime.ts`。原生开关与平台目标通过 Agent `/subagents` 读取与保存（`{ native, agentIds, nativePolicy }`）；追加指令仍通过 Agent `/instructions` 编辑。
