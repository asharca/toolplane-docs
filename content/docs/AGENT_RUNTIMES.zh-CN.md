# Agent 运行时实现：原生 Pi SDK


ToolPlane 使用官方 `AgentSession` 的 **Pi SDK 1.5.2**，在 Agent 专属 Docker 沙箱中执行。GitHub 插件来源、所有权与恢复流程见[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md)。

从 0.87.1 升级为原地兼容：记录 `piVersion: "0.87.1"` 的已应用修订、记录 `sdkVersion: "0.87.1"` 的会话状态和 0.87.1 捕获的能力包继续在 1.5.2 上执行，无需新建会话或重新授权；会话状态在下一轮写回 1.5.2，之后发布的修订和新捕获的包均记录 1.5.2。其他版本仍以 `PI_SDK_VERSION_MISMATCH` 拒绝。

OMP、普通 Pi CLI、Claude Code、DSH 和旧 Harness 均已退役，不是可选执行器或恢复降级方案。历史消息、修订和绑定文件保留只读；转换创建需要显式授权的全新 Pi 草稿，不恢复旧会话，也不继承旧凭据或执行授权。

## 1. 配置不等于执行授权

**Agent** 管理工作区内的配置与资源关系；可编辑**草稿**与不可变的已应用**修订**分离。**Conversation**、Work 准入或本地 A2A context 各自固定修订；同一 Agent 复用一个持久 Docker 沙箱，各会话使用独立工作目录与原生进程状态。

普通创建只使用 Pi（内部标识 `pi-sdk`）。已有 OMP 用户可使用可选的 Pi 迁移导入流程，普通创建不要求本机配置。创建 Agent 或沙箱记录不代表运行时就绪，也不构成执行授权。

### 新建：确认配置后创建即可使用

控制台新建向导最后的**创建并启用**是一次明确授权：用户已选择模型、技能、能力包和工具并看到配置摘要，提交后自动准备和应用首个不可变版本，成功直接进入可输入的工作页，不再要求去设置重复启用。准备期间显示检查进度；任何权限、依赖或能力预检失败都在原表单反馈并保留输入，Agent、默认沙箱与首个版本一并回滚，不留下创建成功但无法使用的半成品。准备通过不代表已执行任务，仍由用户发送消息才开始执行。

Pi SDK 在创建／发布前准备：从固定 digest 的 `toolplane-pi-package-capture:1.5.2` 镜像离线导出 SDK 与完整生产依赖，校验后存入服务进程用户的 `~/.cache/toolplane/pi-sdk/1.5.2/linux-<架构>-node26/<镜像摘要>/`。并发准备复用同一制品，缓存不包含会话或凭据。首次使用的 Agent 卷通过受跟踪流接收内部归档，校验字节、路径、链接与包版本后原子安装；聊天不运行 pnpm，也不访问 npm。专用安装进程使用固定大小的复用缓冲区复制和校验文件，避免为上万个小文件反复创建读写流，不省略归档与安装后完整性校验。后续轮次检查安装状态并复用 SDK，已有不完整安装明确失败，不静默覆盖。

容器化应用从自身读取可信 SDK 安装器，经 stdin 交给无网络、只读根文件系统的固定镜像执行，不把应用内部脚本路径交给宿主 Docker daemon 做 bind mount。该导出不需要共享脚本目录；独立的原生能力预检仍遵循运维文档的专用 `TMPDIR` 挂载要求。

此行为仅用于完整的新建向导。克隆、历史转换和低层创建保持未授权状态；已有未启用记录不会被自动授予权限。插件先添加到工作区，再由 Agent 设置选择；工作区更新后的自动跟随遇到新增 MCP 工具或代码变化时需 owner/admin 审核。修改已有 Agent 仍走下面的配置确认流程，既有会话固定版本不变。

### 设置：保存即生效，仅新增授权单独确认

指令、模型等普通配置修改和权限缩减，点击**保存**后自动准备并应用新版本，不要求再确认整份配置。仅新增工具、技能/包代码变化、凭据/知识库访问、网络/环境权限或扩大协作范围时，进入独立的**确认新增权限**界面，只列出增量；**允许并保存**后生效，**返回修改**不授予新权限。初次启用的未授权记录不以其草稿充当已授权基线。保存仅影响新会话，不执行任务，也不改变已有会话固定版本。

保存草稿不占用执行容量，也不因同一 Agent 正在执行或排队而被拒绝；同一 Agent 的草稿写入仍互斥，并与删除、沙箱迁移等独占维护操作互斥。正常执行不因草稿写入暂停，平台和 Agent 并发上限仍生效。已有会话不自动切换修订；实时权限收窄与凭据撤销仍按原有规则生效。

尚未应用的 provider／model 草稿（包括清空草稿 provider）不撤销已应用修订：旧会话继续使用自己的固定模型，新入口使用当前已应用修订。固定 provider 被删除、移出工作区或清空凭据时仍立即拒绝执行；切换草稿不是撤销凭据的替代操作。

从工作页面打开智能体设置或新建时使用客户端导航进入拦截式弹窗，不能使用触发整页加载的普通链接。取消（含空白创建）与右上角关闭共用关闭逻辑：先播放与工作区设置一致的收拢动画，再返回原有历史路由，不重新请求工作页面；保留底层会话组件和未发送输入。退出完成以弹窗面板自身的动画为准，不等待表单内任意嵌套动画；减少动态效果模式使用淡出。直接访问弹窗 URL（包括刷新）没有底层页面，关闭时导航到工作页或有效的工作区返回地址。

底层 Work 的频道轮询不应触发子智能体配置重新加载；翻译上下文变化只更新文案，不作为资源请求依赖。设置已有快照时不以加载占位替换列表。

1. 保存先更新可编辑配置，再自动准备；准备或发布失败时明确提示“修改已暂存，但尚未生效”，保留原有默认版本。没有新增授权时无需额外点击确认。
2. 内部 Prepare 在发布事务外完成依赖捕获/构建与原生能力预检，冻结镜像、Pi 版本、网络/资源限制、初始快照、凭据引用、模型与指令、Skill/包制品及 MCP/A2A 授权；凭据明文不进入配置。权限增量比较忽略无关配置和集合顺序，替换可执行内容仍须确认。
3. 自动保存和显式确认都提交准确的准备结果与预期当前修订 ID，重新验证实时权限、制品、源摘要与原生预检，再原子比较并切换默认修订（CAS）。另一页面已更新默认时，不按旧基线自动应用，要求重开设置。配置编辑使待确认结果失效；确认成功后更新比较基线，避免重复索取既有权限。
   审核快照以完整 JSON 字符串跨 Server Action 返回，浏览器解析后审阅并原样提交；不让技能正文或附件单独经过可能吞掉开头 BOM 的 Flight 文本块。发布仍校验原始内容摘要，不通过剥离 BOM、重算摘要或改写历史快照容错。
4. **回滚**以同一 Agent 保留的历史修订发布一个新版本，仍须预期当前修订检查和实时验证。不改写历史、不恢复撤销授权，也不移动现有会话固定引用。

实现见 [`revisions.ts`](../src/lib/agents/revisions.ts) 和 [`revision-types.ts`](../src/lib/agents/revision-types.ts)。工作区安装包不等于为 Agent 启用。单项 Enable 和引导安装只将明确审阅的改动合入已应用修订，不发布无关草稿。卸载通过 CAS 发布仅移除该包的新默认，同时保留会话引用制品和共享 MCP deployment。

侧栏状态区分配置就绪与运行状态：已启用 Agent 的沙箱正常 `stopped`（按需启动或闲置回收）不是警告，待机不亮点；当前会话运行中为绿色。未完成配置、`setup_required`、等待用户或审批仍为黄色，真实运行/恢复错误为红色。Agent 聚合当前会话的等待状态，不因历史失败会话永久显示错误。

工作页每个智能体首次只预览前 5 条会话；当前选中项若不在前 5 条，额外保留可见。列表尾部一次“展开全部”即可浏览完整历史，也可收回预览，不需要分批点击“更多”。搜索覆盖未展开的全部历史，清除搜索后恢复原有预览与展开选择。资源菜单按 Escape 只关闭当前菜单，不关闭移动端侧栏。

同一智能体内的 Work 与普通会话各自默认按创建时间倒序排列，同一时间以 ID 决定固定次序；切换会话、更新标题、运行状态变化和后台刷新不重新排位。手动拖动后的顺序优先，并在刷新后保留。

Agent、Work 与 Assistant 的自动会话标题（包括首条消息生成的临时标题）最多 20 个 Unicode 字符，空格、标点和省略号计入上限。模型命名优先概括为 6–10 个中文字或 2–4 个短词，服务端对超长输出强制截短。此限制不作用于回复正文，不批量改写已有标题，也不覆盖手动命名。

Work 会话菜单的**删除对话**需要确认，永久删除该会话的消息、工作记录及可独立清理的工作目录和附件，保留同一智能体的共享沙箱与其他会话；不可分割的旧版恢复卷沿用保留策略。排队、运行、等待输入或正在访问文件／终端时拒绝删除，错误保留在确认弹窗。成功后仅移除对应列表项：删除其他会话不切换当前会话，删除当前项才通过客户端导航切到同一智能体的其他会话；两者均不整页重载，保留侧栏展开及滚动状态。

## 2. 固定执行链路

```text
Chat / 消息渠道 / Work / 本地 A2A
  → 鉴权，校验工作区、Agent 与会话准入
  → 固定不可变修订 ∩ 当前实时权限
  → 获取会话/沙箱租约并执行并发限制
  → 获取该 Agent 的共享沙箱及当前会话目录
  → sandbox-turn.ts / sandbox-runtime.ts
  → Pi：native-runtime-session.mjs → pi-sdk-session.mjs → 官方 AgentSession
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

新 Conversation、Work 和本地 A2A context 持久化 `agentRevisionId`；Work 在分配目录前的准入阶段固定修订。每个 Agent 按固定环境懒创建一个持久沙箱，不读取当前可变模板。会话分别使用 `/workspace/conversations/conversation-<身份摘要>/`；无 Conversation 的 A2A 使用 `context-<身份摘要>`。Pi SDK 安装在共享的 `/workspace/.toolplane/runtime-packages/`，插件装配、技能、宿主 socket、临时文件和原生历史位于各会话目录。HOME 与 XDG 目录是 Agent 级的 `/workspace/.toolplane/agent-home`：CLI 登录（如 `gh auth login`）、Git 全局配置和 `~/.local/bin` 用户级安装在该 Agent 的所有会话、终端和入口间共享，属于可变环境而非修订内容；需要不同外部身份时应拆成不同 Agent。`/workspace/shared` 是显式共享文件目录，每个会话目录中有指向它的 `shared` 链接。目录分离不是同一 Agent 内的容器安全隔离；不同 Agent 不共享可写卷。共享沙箱执行租约按会话划分：同一会话串行，同一 Agent 的不同会话在管理员的单 Agent／平台并发限额内并行；停止、删除、迁移等生命周期操作独占整个沙箱。共享运行时安装和新会话绑定在同一沙箱内依次进行，不阻塞已在执行的会话。

显式调用 Agent 会话的 `POST /api/v1/agents/{agentId}/conversations/{conversationId}/revision` 升级时，Conversation、关联 Work 及属于该会话的普通入口 Context 在同一事务内前移到当前修订；Context 的目标绑定同步更新，ID、原生状态和目录不变。共享沙箱的环境固定引用和其他会话不变；改变镜像、网络、凭据等共享环境的升级返回 `AGENT_SHARED_ENVIRONMENT_CONFLICT`，不会隐式影响其他会话。历史任务、授权快照、消息和幂等回执不重写。存在排队、执行、等待输入/授权或尚未停止的后代任务时拒绝升级。普通发送消息不会隐式升级。

`PiSessionPackageSet` 按 Conversation／Context 记录准确包 release/checksum 和 MCP 绑定，不以共享 sandboxId 作为唯一身份；同一容器内不同会话可保留不同版本。工作区包更新、新应用默认和回滚只影响新会话。普通卸载或下架保留已引用的批准制品；危险 release 撤销和当前 provider、凭据、包、MCP、方向性协作限制仍阻止执行。固定引用不是不可撤销权限快照。

条目下架后，新建 Work 在写入 Conversation/Work 记录前返回 `PI_PACKAGE_UNAVAILABLE`，不为新任务分配执行资源；已有会话仍按上述固定引用与实时撤销规则处理。

数据库管理身份、修订/沙箱绑定、授权与任务回执；官方 SDK JSONL 文件管理原生对话状态。状态限定在当前会话目录的 `.toolplane/runtimes/<运行时>/agents/<agent-id>/`；本地 A2A 复用持久化 context ID。私有宿主状态跟踪 new/fork/switch 后实际选中的 SDK 会话，与旧 Harness 检查点无关。旧独立卷首次使用时校验后复制到会话目录，原卷停止并只读保留至 Agent 删除；迁移只改原生路由头及状态路径，不重写消息正文、修订或插件 checksum。

保留 context 必须重新打开原生会话。持久历史丢失，或宿主在首次会话文件落盘前丢失，返回 `PI_SDK_SESSION_MISSING`。历史修订/包固定引用未解决返回 `AGENT_REVISION_UNRESOLVED`；包集合不匹配返回 `PI_SDK_PACKAGE_SET_CHANGED`。应排查或恢复匹配工作卷，不得从当前默认猜测固定引用、修改 checksum、重放消息，或新建空会话冒充恢复。

### 实时执行阶段

智能体 Work 与助手会话在执行期间显示相同的阶段：排队中、准备中、等待模型响应、生成中、执行工具中。准备阶段包括固定配置、连接和运行环境准备；等待模型从真实 provider 请求边界开始，收到正文、思考或工具调用内容后才进入生成。工具执行结束后，下一次模型请求会重新显示等待模型响应，不用固定延时猜测进度。

Work 通过现有输出快照和 SSE `stage` 事件恢复当前阶段；Pi 使用 `before_provider_request`。助手通过 `ChatRunEvent` 保存 transient `data-chat-execution` 事件，并在快照中提供 `{ runId, stage, sequence }`，依照轮次和游标恢复，阶段不写入保存的消息正文。终态清除实时阶段；既有历史、停止请求、确认与授权规则不变。

准备阶段不逐文件启动 Docker 命令：Pi 每轮把可信宿主脚本、MCP factory、动态配置、技能处理、包校验与安装状态检查合并为一次受跟踪执行。宿主源码仍每轮读取并覆盖，Pi 源码 checksum 改变仍重启常驻宿主；技能仅在内容摘要变化时重建，插件快照仍每轮校验、物化，不缓存或跳过授权。助手并发准备远程工具与历史／附件，各 MCP Deployment 的工具发现也并发进行；全部已启动分支结束后才进入模型或报告失败，工具组装与错误优先级仍按原输入顺序。沙箱首次启动、已准备制品的本地分发、原生进程启动与远程 MCP 响应仍计入真实准备时间；创建完成并不承诺首轮零等待，也不消除模型提供商的响应耗时。

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

Prepare/发布在固定隔离捕获镜像 `toolplane-pi-package-capture:1.5.2` 中使用真实 SDK loader，不靠扩展工厂源码文本猜测能力。原生命名空间检查覆盖工具、命令、Skill、prompt 及保留的生成 MCP 名称。冲突保留类型化 `PI_CAPABILITY_CONFLICT`；所选扩展加载失败保留 `PI_EXTENSION_LOAD_FAILED` 和有界阶段诊断。不静默丢弃冲突扩展或替换版本。

冻结快照包含依赖，执行和 reload 前完整验证字节与链接；篡改在 turn 执行前返回 `PI_PACKAGE_CHECKSUM_MISMATCH`。原生快照必须匹配执行平台/架构。启动不安装插件依赖、不执行包管理器 hooks，也不将发现任意用户配置作为降级方案。

命令保留原生调用大小写和 `:1` 等冲突后缀。未知命令报错，不转成模型提示词。纯命令完成回执不伪造成模型回答。Web 适配原生 RPC 的确认、选择、输入、编辑、通知、状态、文本 widget、标题和编辑器文本；任意 TUI `custom()`、自定义终端组件和终端布局不转译为 Web。

默认加载已安装 Pi SDK 的官方 todo 扩展示例；已授权包提供同名 `todo` 工具时使用包实现。todo 的权威状态来自原生 SessionManager 当前分支的工具结果，启动、重启、分支切换及清空后重新投影；平台不注册第二个 todo 工具或维护另一套任务状态机。`/todos` 在 Web 中显示原生待办通知。仅识别 `{id:number,text:string,done:boolean}` 列表；自定义不同结构仍可执行，但不猜测转换为列表。
在 Agent 新建和设置的“内置工具 → 编排工具”中可查看并启用/禁用 `todo`，默认启用；底层仍使用上述 Pi 扩展，不新增平台工具实现。

UI 请求和持久展示投影上限为 256 KiB，最多 32 个待答对话和 64 条最新非对话事件。todo 超过展示限制时保留原生完整数据并通知用户，不截断或伪造待办；鉴权或传输失败仍会终止当前交互。完成后的 todo 可刷新查看，新任务排队时保持上次展示，直到原生当前分支投影覆盖。

在自己拥有且空闲的会话发送 `/compact` 或 `/compact <自定义指令>`，对同一保留会话调用原生 `session.compact()`，须等待持久化的原生结果。绑定忙碌时拒绝第二个 writer；失败不回退宿主摘要或 CLI 压缩。渠道命令要求稳定 transport 消息 ID 去重；已鉴权会话命令生成原生回执 ID。Work 命令仍由 coordinator 管理。

## 8. 取消、排空与历史策略

取消停止绑定原生进程和会话 MCP sidecar，不删除持久工作卷。Docker 操作接入运行时所有权与取消跟踪。终止是有界清理，不是任意工具副作用的回滚。未知副作用和远端 ACK 保持未知，不能重放任务制造完成结果，也不承诺远端 exactly-once。会话/沙箱忙碌时，未领取的委派工作保持排队，直到正常租约重新可用。

单个工具调用失败（例如 shell 命令以非零状态退出）只是一条失败的工具结果，模型读到后继续处理，不会让本轮失败。模型请求失败、用户停止或 UI 传输失败时，本轮以 `PI_SDK_MODEL_FAILED` / `PI_SDK_ABORTED` / `PI_SDK_UI_FAILED` 结束，但已写入的原生会话历史会保存，下一条消息在同一会话里继续，不会变成 `PI_SDK_SESSION_MISSING`，也不会重放这一轮。

单次模型请求失败时，宿主按工作区设置 **模型请求重试**（`Workspace.modelRetryAttempts`，0–10，默认 3，工作区成员均可修改）在本轮内原地重试，退避为 2s、4s、8s…。每轮开始时读取当前值，不进入修订，也不重启常驻宿主。可重试的失败沿用 Pi 1.5.2 的瞬时错误判定（限流、5xx、超时、连接中断、流未结束等），另外加入网关已返回 HTTP 200、却在流中报告上游空响应的情况（例如 sub2api 的 `empty_stream`）。失败的那次请求保留在原始历史中，但不会作为 assistant 回合重新发给模型；它没有执行任何工具，因此不会重复执行工具。

重试用尽或遇到不可重试的错误时，返回固定原因并附带已重试次数，例如 `PI_SDK_MODEL_FAILED: EMPTY_STREAM RETRIED_3`。原因只来自白名单：`HTTP_nnn`、`UNREACHABLE`、`TIMEOUT`、`EMPTY_STREAM`、`STREAM_INCOMPLETE`、`CONTENT_FILTER`、`PROVIDER_ERROR`；供应商原文不会离开宿主。控制台会把它翻译成可操作的提示。重试次数计入任务总时限。

单一 runtime owner 完成恢复后才接受执行。所有权丢失停止新工作；停机停止 coordinator/broker，排空或中止跟踪操作，最后释放所有权。不确定清理保留 dirty marker。HTTP liveness 不等于 readiness，换数据库/domain 或删除恢复标记不是接管流程。遵循[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md)，包括准确且仅用于一次重启的恢复 ACK 要求。

**已退役运行时和未解决固定引用的历史会话只读。**保留非删除范围内的历史消息、response、绑定文件读取、历史解析/归档访问及真正已绑定操作的取消/排空。不得启动、恢复、重放旧运行时，也不向其上传或开启执行终端。已删除的专用执行/model/profile/runtime MCP/dashboard/upload 路由不是兼容入口。旧 `pi-harness` 任务标签只识别绑定清理。受控转换须排空旧任务，创建全新草稿并重新审阅授权，不恢复旧运行时状态、不自动重新发布公开包。公共 A2A 服务启用返回 `runtime_unsupported`（HTTP 409），旧公开发布 action 已删除；公开 A2A 发送及退役 HTTP 执行入口在新记录或分配前拒绝（HTTP 410 或对应协议错误），不转接新执行器。

排障优先使用关联 ID、状态、耗时与失败类型。Agent 内容采集须显式限时授权，见[可观测性](./OBSERVABILITY.zh-CN.md)。不要将完整原生输出、提示词或私有配置贴到公开 issue。

## 9. 回归源码与证据边界

保留的 [`native-runtime-session.test.ts`](../tests/integration/native-runtime-session.test.ts) 是无条件运行的原生 SDK daemon 回归，不是环境变量开启的真实 CLI/容器矩阵，不能证明真实 provider 或 Docker 验收。

[`pi-sdk-host.test.ts`](../tests/integration/pi-sdk-host.test.ts) 使用仓库已安装的 `@earendil-works/pi-coding-agent` 依赖，配合临时目录和受控本地 HTTP 模型/MCP/UI fixture 启动真实 SDK 宿主，覆盖自动压缩、原生对话、todo 分支恢复与失败后继续。需要固定依赖、兼容 Node、子进程及本地 socket/文件访问；它不是付费 provider 测试，也不要求预装 CLI 的沙箱。[`pi-sdk-capabilities.test.ts`](../tests/integration/pi-sdk-capabilities.test.ts) 在 Vitest 模块转换之外调用已安装的原生 extension/Skill loader 和命名空间检查。

涉及数据库/Docker 的租约与通信套件只在已批准隔离环境、固定捕获镜像下串行运行；前提以[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md#原生-sdk-验证)和各测试源码为准。不要使用生产 Agent 沙箱、并发操作同一测试数据库，也不要将 parser/unit/受控宿主结果当作真实 provider 验收。原生压缩须单独验证，通信 smoke 不覆盖它。

SDK 变更须同步维护修订 Prepare/CAS、原生预检、冻结制品、实时 broker 权限、会话固定引用、独立工作卷、命令与取消边界。相关文档随实现更新，不得为满足旧调用方或测试而恢复已退役执行别名。

## 10. OMP 退役与配置迁入 Pi

OMP 不再提供新建、发布、回滚执行、续写、原生子任务或执行终端。平台不再下载或分发 OMP 二进制；保留历史配置 schema、修订、消息、文件及原生事件的只读解释，不改写历史运行时标识。升级前须排空旧执行，按单所有者流程受控重启。历史转换只产生未授权的 Pi 草稿，不能直接将 OMP 修订或会话改成 Pi。

### 可选：导入本机 OMP 配置

1. 在已安装项目依赖的 ToolPlane 源码目录执行离线导出：

   ```bash
   node scripts/export-omp-config.mjs --root ~/.omp/agent --output omp-import.json
   ```

   导出器只读取配置及声明资源，不执行插件、hook 或安装脚本，不安装依赖、不修改源配置、不上传内容。输出文件仅当前用户可读写，已有文件不会被覆盖。模型目录、认证数据库、历史、缓存和配置备份不进入包；MCP 凭据以占位符表示，导入时重新填写。
2. 在**新建智能体 → 从 OMP 导入**上传 JSON，目标固定为 Pi。模型只能选择当前工作区已授权的提供商与模型，不复用本机 provider 密钥。
3. 阅读兼容性问题，修正 MCP 配置、填写掩码凭据或明确排除资源。OMP 专属设置、命令、hook、工具和原生角色不能伪装成 Pi 能力；原生角色须明确排除。可迁移插件仍需明确的 `pi.extensions` 声明及真实 Pi 加载预检。`SYSTEM.md` 采用追加指令语义，不替换平台主指令。
4. 隔离 MCP 发现可能执行服务或连接远程服务，必须先勾选**允许检查 MCP**；仅上传文件不执行服务。检查授权不等于导入授权。
5. 审阅资源、工具和兼容性结果后批准导入；任何编辑使上次预览及批准失效。提交重新核对工作区权限、输入和实际 MCP 目录，经正常 Pi 创建、预检和修订授权后进入新 Agent 设置，不改变已有会话。

可复用技能、MCP 和插件仍在平台原页面管理，不创建第二套资源管理入口。OMP 原生 `task`、角色模型和 `eval` 不会自动转成平台 Agent 或 Pi 工具；导入成功也不证明原行为等价，须实际调用所选资源验收。

### 平台 Agent 委派

Pi 可勾选同工作区已有且就绪的 Agent；每个子 Agent 使用自己的已应用修订、模型、技能、MCP、插件与独立沙箱。调用沿用本地 A2A 的 `pi_a2a_peers`、`pi_a2a_submit`、`pi_a2a_status` 和 `pi_a2a_cancel`。`pi_a2a_submit` 默认等待子任务结束（最长约 4.5 分钟），返回结果与文件；仍在运行时返回 `pending: true`，使用 `pi_a2a_status` 查询。`wait: false` 可先发起多个独立任务。

勾选并应用父 Agent 修订授权父级调用该子 Agent，不要求子级打开面向直接调用的入站开关。设置说明未就绪原因；执行重新检查工作区、固定与实时目标授权、有向关联、深度、循环与预算。凭据和沙箱目录不共享，文件经委派接口传递。只保留远程目标时，出站开关仍由 A2A 设置控制。

Work 与 `/chat` 共享委派准入和任务租约，保留原 Conversation 的原生状态及 Work 固定快照收窄；不复制子 Agent 到父沙箱。子任务活动独立投影，不把子输出当父指令或扩权依据；撤销关联或出站权限会阻止后续调用。

### 网页通知

Work 顶部的完成通知须用户主动开启并授权浏览器；页面隐藏或失焦时，仅当前实时轮次结束事件触发通知。历史回放、重连不补发，同一轮跨标签去重；通知不包含任务内容，关闭页面后不保证通知。插件仍可使用 `ctx.ui.notify()`，不执行 OMP 的 TTY／BEL 钩子。
