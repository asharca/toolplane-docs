# Agent 运行时实现：原生 Pi SDK


ToolPlane 使用官方 `AgentSession` 的 **Pi SDK 1.5.2**，在 Agent 专属 Docker 沙箱中执行。兼容列表精确为 `1.5.2` 与 `0.87.1`：已应用修订的 `piVersion: "0.87.1"`、会话状态的 `sdkVersion: "0.87.1"` 及该版本捕获的能力包可继续在 1.5.2 上执行，不因这次升级要求新会话或重新授权；不改写历史修订或包 checksum，会话状态在下一次持久化时写回 1.5.2，新修订与新捕获包记录 1.5.2。实时权限、制品完整性、Node 26 与平台/架构检查仍有效。版本错误按入口区分：不支持的修订版本或安装 SDK 不匹配返回 `PI_SDK_VERSION_MISMATCH`，不支持的会话状态版本返回 `PI_SDK_SESSION_MISSING`，包运行时/平台不匹配在制品校验处拒绝，不统一承诺同一错误码。GitHub 插件来源、所有权与恢复流程见[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md)。

OMP、普通 Pi CLI、Claude Code、DSH 和旧 Harness 均已退役，不是可选执行器或恢复降级方案。历史消息、修订和绑定文件保留只读；转换创建需要显式授权的全新 Pi 草稿，不恢复旧会话，也不继承旧凭据或执行授权。

本文对照 ToolPlane `9c6f9d8`（0.39.0）源码整理，描述该代码基线的行为，不代表文档发布已经完成应用部署、数据库迁移或真实运行验收。日常操作与各项限制统一见[Agent 工作台与工具](./AGENT_WORKBENCH.zh-CN.md)。

## 1. 配置不等于执行授权

**Agent** 管理工作区内的配置与资源关系；可编辑**草稿**与不可变的已应用**修订**分离。**Conversation**、Work 准入或本地 A2A context 各自固定修订；同一 Agent 复用一个持久 Docker 沙箱，各会话使用独立工作目录与原生进程状态。

普通创建只使用 Pi（内部标识 `pi-sdk`）。已有 OMP 用户可使用可选的 Pi 迁移导入流程，普通创建不要求本机配置。创建 Agent 或沙箱记录不代表运行时就绪，也不构成执行授权。

### 新建：确认配置后创建即可使用

控制台新建向导最后的**创建并启用**是一次明确授权：用户已选择模型、技能、能力包和工具并看到配置摘要，提交后自动准备和应用首个不可变版本，成功直接进入可输入的工作页，不再要求去设置重复启用。准备期间显示检查进度；任何权限、依赖或能力预检失败都在原表单反馈并保留输入，Agent、默认沙箱与首个版本一并回滚，不留下创建成功但无法使用的半成品。准备通过不代表已执行任务，仍由用户发送消息才开始执行。

Pi SDK 在创建／发布前准备：从固定 digest 的 `toolplane-pi-package-capture:1.5.2` 镜像离线导出 SDK 与完整生产依赖，校验后存入服务进程用户的 `~/.cache/toolplane/pi-sdk/1.5.2/linux-<架构>-node26/<镜像摘要>/`。并发准备复用同一制品，缓存不包含会话或凭据。首次使用的 Agent 卷通过受跟踪流接收内部归档，校验字节、路径、链接与包版本后原子安装；聊天不运行 pnpm，也不访问 npm。专用安装进程使用固定大小的复用缓冲区复制和校验文件，避免为上万个小文件反复创建读写流，不省略归档与安装后完整性校验。后续轮次检查安装状态并复用 SDK，已有不完整安装明确失败，不静默覆盖。

容器化应用从自身读取可信 SDK 安装器，经 stdin 交给无网络、只读根文件系统的固定镜像执行，不把应用内部脚本路径交给宿主 Docker daemon 做 bind mount。该导出不需要共享脚本目录；独立的原生能力预检仍遵循运维文档的专用 `TMPDIR` 挂载要求。

此行为仅用于完整的新建向导。克隆、历史转换和低层创建保持未授权状态；已有未启用记录不会被自动授予权限。插件先添加到工作区，再由 Agent 设置选择；工作区更新后的自动跟随遇到新增 MCP 工具或代码变化时需 owner/admin 审核。修改已有 Agent 仍走下面的配置确认流程，既有会话固定版本不变。

### 设置：保存草稿，逐行审阅后发布

指令、模型、技能和执行配置修改在点击**保存**后先保存草稿并准备准确快照，再展示文件差异：提示词、技能正文及文件、模型与权限配置分别显示增删行、原/新行号和变更数量。可复制 patch；二进制附件明确标注，不冒充文本内容。新增工具、技能/包代码变化、凭据/知识库访问、网络/环境权限或扩大协作范围仍单独列出授权增量。确认发布前不切换默认修订，返回修改也不授予新增修订权限；初次启用的未授权草稿不作为已授权基线。没有执行配置差异时不生成空修订。发布只影响新会话，不执行任务，也不改变已有会话固定版本。名称、预算等非修订设置不因此变成发布内容；实时权限收窄仍独立生效。

保存草稿不占用执行容量，也不因同一 Agent 正在执行或排队而被拒绝；同一 Agent 的草稿写入仍互斥，并与删除、沙箱迁移等独占维护操作互斥。正常执行不因草稿写入暂停，平台和 Agent 并发上限仍生效。已有会话不自动切换修订；实时权限收窄与凭据撤销仍按原有规则生效。

尚未应用的 provider／model 草稿（包括清空草稿 provider）不撤销已应用修订：旧会话继续使用自己的固定模型，新入口使用当前已应用修订。固定 provider 被删除、移出工作区或清空凭据时仍立即拒绝执行；切换草稿不是撤销凭据的替代操作。

从工作页面打开智能体设置或新建时使用客户端导航进入拦截式弹窗，不能使用触发整页加载的普通链接。取消（含空白创建）与右上角关闭共用关闭逻辑：先播放与工作区设置一致的收拢动画，再返回原有历史路由，不重新请求工作页面；保留底层会话组件和未发送输入。退出完成以弹窗面板自身的动画为准，不等待表单内任意嵌套动画；减少动态效果模式使用淡出。直接访问弹窗 URL（包括刷新）没有底层页面，关闭时导航到工作页或有效的工作区返回地址。

底层 Work 的频道轮询不应触发子智能体配置重新加载；翻译上下文变化只更新文案，不作为资源请求依赖。设置已有快照时不以加载占位替换列表。

1. 保存先更新可编辑配置，再准备审核快照；准备或发布失败时保留原有默认版本，草稿不等于已生效。普通提示词修改也须审阅具体差异后确认发布。
2. 内部 Prepare 在发布事务外完成依赖捕获/构建与原生能力预检，冻结镜像、Pi 版本、网络/资源限制、初始快照、凭据引用、模型与指令、Skill/包制品及 MCP/A2A 授权；凭据明文不进入配置。权限增量比较忽略无关配置和集合顺序，替换可执行内容仍须确认。
3. 确认发布提交准确的准备结果与预期当前修订 ID，重新验证实时权限、制品、源摘要与原生预检，再原子比较并切换默认修订（CAS）。另一页面已更新默认时，不按旧基线自动应用，要求重新准备和审核。配置编辑使待确认结果失效；确认成功后更新比较基线，避免重复索取既有权限。
   审核快照以完整 JSON 字符串跨 Server Action 返回，浏览器解析后审阅并原样提交；不让技能正文或附件单独经过可能吞掉开头 BOM 的 Flight 文本块。发布仍校验原始内容摘要，不通过剥离 BOM、重算摘要或改写历史快照容错。
4. **回滚**以同一 Agent 保留的历史修订发布一个新版本，仍须预期当前修订检查和实时验证。不改写历史、不恢复撤销授权，也不移动现有会话固定引用。

历史修订和自进化提案使用同一逐行差异展示。历史版本优先与记录的父修订比较，未记录父修订的旧版本与前一个正式发布版本比较；未发布候选不会误作正式发布的前驱。查看历史差异只读取保存的不可变内容，不读取插件上游最新分支，也不需要再次执行工具。

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

[`native-runtime-session.mjs`](../scripts/native-runtime-session.mjs) 只接受 `pi-sdk`，按私有状态路径哈希生成沙箱内 Unix socket，同一时间只允许一个执行请求，其他执行请求返回 `PI_SDK_BUSY`。运行中的插话/追问/清空使用绑定具体 runId 的第二条控制连接，不抢占或结束原执行连接。它跨 turn 保留 SDK 子进程，处理停机、socket 断开和配置签名变化；控制注册表仍受单 owner/单进程拓扑限制，不提供跨主机 pub/sub。守护进程重启不等于允许重放中断任务。

[`pi-sdk-session.mjs`](../scripts/pi-sdk-session.mjs) 加载固定 SDK，使用明确资源构建官方会话服务，关闭默认扩展、Skill、prompt、theme 和无界 context file 自动发现。模型凭据仅在请求期间保存在内存；每次请求刷新 runtime token、MCP context 与原生 UI 通道，结束后清理请求凭据。缺少 context 返回 `PI_SDK_CONTEXT_REQUIRED`；不受支持的原生工具定义变化返回 `PI_SDK_TOOLSET_CHANGED`，不静默改变保留会话。受控可选工具列表变化则通过宿主签名在下一轮重载。上下文压缩使用 Pi 原生自动压缩，不另建摘要或历史状态机。

结构化事件走专用文件描述符。扩展 stdout/stderr 不是可信协议通道，不能伪造 broker 结果。数据库消息持久化和 UI/Work 生命周期由调用方负责，不由低层执行器代办。

### 有界项目指令文件

固定修订 `contextFiles` 控制项目指令读取。新 Agent（含创建为新草稿的复制）默认开启；旧 Agent 草稿和历史修订缺省关闭，修改草稿不影响已有固定会话。开启时保留 SDK 的 `noContextFiles: true`，通过 `agentsFilesOverride` 提供受控结果，避免 SDK 一直向文件系统根读取。

读取顺序为宿主 `agentDir`，再从 `workspaceRoot` 到 `cwd` 的祖先链（含两端），每目录最多选择一个文件，优先级为 `AGENTS.override.md`、`AGENTS.md`、`AGENTS.MD`、`CLAUDE.md`、`CLAUDE.MD`。不扫描子目录、兄弟会话或根界限之外的祖先；真实路径去重，逃出允许目录集合的符号链接跳过。内容进入 Pi 原生 `project_context`，用量归入 `instructionFiles`。

这些是可写项目文件，不是不可变资源快照；reload/新宿主重新发现，无文件监控、递归发现或 OMP 配置自动映射。它是指令加载选择，不是 native shell 的安全边界。

### 可选工具的授权与加载

`optionalBuiltinTools?: string[]` 缺省视为 `[]`，不回填旧修订或修改 checksum；新建/克隆为新 Agent 默认关闭。唯一注册表区分 `sandbox-extension` 与 `platform`，只接受已有真实实现的注册名，与默认工具的 `disabledBuiltinTools` 分离。新增权限进入既有 builtin 审核。

沙箱扩展按可信源码物化、离线预检，源码和有效列表加入宿主签名；平台工具走任务 MCP bridge，每次调用重查 grant、租约、固定修订和实时草稿交集，不依赖 A2A 出站开关。目录位置固定不等于实时授权，撤销后平台调用返回 `OPTIONAL_BUILTIN_TOOL_FORBIDDEN`，不把工具失败提升为整轮失败。沙箱扩展移除在下一轮生效，不中断在途代码。当前工具清单及依赖见[工作台指南](./AGENT_WORKBENCH.zh-CN.md#启用可选内置工具)。

## 6. 受控 broker 与隔离边界

模型请求走 ToolPlane 的凭据化模型代理 `/api/v1/agent-runtime/model/{providerId}`，不把真实上游密钥交给扩展配置。运行时 grant 是范围受限的凭据，不是个人 API Token 或桌面安装 Token。代理重新校验当前资源关系，上游凭据由平台管理。不要将 runtime token、provider key 或数据库凭据暴露到提示词、日志或 issue 附件。

固定修订 `secretObfuscation` 开启时，统一模型网关在出站文本/结构化 JSON 中替换已登记且实时有效的环境凭据，并且仅在入站结构化工具参数中还原；正文/推理保留标识符。新 Agent 默认开启，旧记录与历史缺省关闭。覆盖范围仅限 `environment.credentialReferences` 中长度至少 8 字符的授权值，不扫描未知环境变量、文件、二进制或图片，也不重写本地历史。细节见[工作台指南的密钥混淆说明](./AGENT_WORKBENCH.zh-CN.md)。

固定修订 `toolApproval` 提供 `off/write/exec/all` 与按实际工具名的 `ask/allow/deny` 覆盖。普通 Work/chat/control/频道根入口受策略控制；A2A 根任务、委派后代和触发器免人工审批，即使 deny 覆盖也自动放行并留审计。普通会话通过带工作区/会话鉴权的 `tool-approvals` 接口决定，频道通过原发送者在原 chat/thread 的 `/approve`、`/deny` 短码决定；两者不能互相代替。精确参数绑定、有效租约、最长 120 秒与单次消费共同约束执行，拒绝/超时是失败工具结果而非整轮失败，未提供“总是允许”。操作见[工具审批](./AGENT_WORKBENCH.zh-CN.md#工具审批)。

审批不同于 Pi 扩展自己发起的 `ctx.ui.confirm/select/input/editor` 原生对话。后者仍经原生 RPC：通用任务使用 `/api/v1/agent-runtime/tasks/<task-id>/ui`，专属 Work 使用 `/api/v1/agent-runtime/sessions/ui`。通道只允许 HTTP(S)、无内嵌凭据/query/fragment、禁止重定向，并校验 runtime token、操作人、工作区与当前执行租约。重复、过期、跨租约或已撤权的响应不能继续执行；无 UI 通道时保持非交互 JSON 模式。旧审批 readiness 握手不恢复。

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

`/handoff [focus]` 是始终可用的宿主命令，不依赖可选工具；它在空闲非空会话中通过原生 compact 生成并提交交接文档，失败/取消不写成功标记。可选 `checkpoint/rewind/context_notes` 管理当前原生树上下文与分支笔记，旧树及平台历史保留；都不回退文件或外部副作用。详见[工作台指南的上下文维护说明](./AGENT_WORKBENCH.zh-CN.md)。

## 8. 取消、排空与历史策略

取消停止绑定原生进程和会话 MCP sidecar，不删除持久工作卷。Docker 操作接入运行时所有权与取消跟踪。终止是有界清理，不是任意工具副作用的回滚。未知副作用和远端 ACK 保持未知，不能重放任务制造完成结果，也不承诺远端 exactly-once。会话/沙箱忙碌时，未领取的委派工作保持排队，直到正常租约重新可用。

单个工具调用失败（例如 shell 命令以非零状态退出）只是一条失败的工具结果，模型读到后继续处理，不会让本轮失败。模型请求失败、用户停止或 UI 传输失败时，本轮以 `PI_SDK_MODEL_FAILED` / `PI_SDK_ABORTED` / `PI_SDK_UI_FAILED` 结束，但已写入的原生会话历史会保存，下一条消息在同一会话里继续，不会变成 `PI_SDK_SESSION_MISSING`，也不会重放这一轮。

单次模型请求失败时，宿主按工作区设置 **模型请求重试**（`Workspace.modelRetryAttempts`，0–10，默认 3，工作区成员均可修改）在本轮内原地重试，退避为 2s、4s、8s…。每轮开始时读取当前值，不进入修订，也不重启常驻宿主。可重试的失败沿用 Pi 的瞬时错误判定（限流、5xx、超时、连接中断、流未结束等），另外加入网关已返回 HTTP 200、却在流中报告上游空响应的情况（例如 sub2api 的 `empty_stream`）。失败请求保留在原始历史，但不作为 assistant 回合重新发给模型；重试在 SDK 请求恢复边界进行，不重新提交用户 prompt。

同模型重试耗尽后，固定修订 `fallbackModels` 可按顺序尝试最多三个精确 provider/model 对，每个独立使用同模型重试预算；本轮一旦出现任何 `tool_execution_start` 就不再切换兜底，避免重放已有或未知副作用。鉴权/非瞬态 4xx、取消及全局任务截止不兜底；下一轮重新选择准入主模型。`roleModels.compaction/title` 分别服务原生压缩与会话命名，缺省沿用主模型；额外 provider/model 必须在固定授权中精确列出，且每次检查实时目录/凭据。实际应答模型通过既有 `data-agent-turn-model` 展示，用量按真实模型分别计价，不把兜底变成全局默认。

所有可用模型仍失败或错误不可重试时，返回固定原因并附带最后实际模型的同模型重试次数，例如 `PI_SDK_MODEL_FAILED: EMPTY_STREAM RETRIED_3`。原因只来自白名单：`HTTP_nnn`、`UNREACHABLE`、`TIMEOUT`、`EMPTY_STREAM`、`STREAM_INCOMPLETE`、`CONTENT_FILTER`、`PROVIDER_ERROR`、`GATEWAY_ERROR`；供应商原文不会离开宿主。`GATEWAY_ERROR` 表示 ToolPlane 网关内部处理失败，不能归因于供应商。重试计入任务总时限，SDK 内部恢复/压缩方法变化须重新验证。

Advisor 是固定修订的可选被动文本审查，建议经 steer 或单次 final follow-up 反馈，不授予工具/审批权；流式规则可对正文提醒、对工具调用提醒或阻止，但不是代码隔离或回滚。月预算告警只记录运行中首次越线，不取消已准入任务；达到预算仍阻止新回合。配置、用量和限制统一见[工作台指南](./AGENT_WORKBENCH.zh-CN.md)。

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

## 11. 定时与 Webhook 触发

Agent 设置 →「触发器」。工作区 owner/admin 可创建、修改、启停、立即运行和删除；每次运行新建会话并按新会话规则固定修订（启用灰度时可能选中候选），以触发器创建者身份执行。创建者已离开工作区时失败并记录 `TRIGGER_ACTOR_UNAVAILABLE`。

- **定时**：cron 表达式 + 时区，界面默认浏览器时区。只有运行时所有者调度，约每 15 秒检查到期记录，按原 `nextRunAt` 原子领取并推进下次时间；这不是跨重启 exactly-once 或漏执行补跑保证。
- **Webhook**：`POST /api/v1/triggers/{triggerId}/webhook`，`Authorization: Bearer <触发器密钥>`，JSON 请求体最多 64 KiB；将 JSON 序列化后替换提示词中的 `{{payload}}`。接纳成功返回 `202 { conversationId }`，不表示任务已完成。只接受该触发器的密钥，不接受个人 API 令牌、会话 Cookie 或 Toolkit 令牌；每个触发器限流 30 次/分钟、1000 次/天。密钥只在创建或轮换时显示，服务端保存哈希；停用后返回 404。
- 管理接口：`/api/v1/agents/{agentId}/triggers`（GET/POST）、`/{triggerId}`（PATCH/DELETE）、`/{triggerId}/run`（POST，立即运行）。工作区成员可读取，写操作须 owner/admin；Cookie 写入还需同源校验。
- 可将最终结果投递到同一 Agent 绑定的原生频道与指定 Chat ID，投递状态与执行状态分开；失败投递不改写执行结果。边界见[消息平台的触发器结果投递](./AGENT_MESSAGING_PLATFORMS.zh-CN.md#触发器结果投递)。

触发器属于无人值守入口，`toolApproval`（包括 `deny` 覆盖）不等待人工批准，自动放行并留审计；固定授权、MCP allowlist、实时撤权和沙箱边界仍有效。不要把交互审批策略当成 Webhook 的工具权限限制。

## 12. 用量与月度预算

用量按任务聚合到唯一 `AgentUsage`，不等于发生了 Agent 间 A2A 调用。模型网关逐响应记录运行中的用量，任务结算以 SDK 总量替换临时观测值并标记完成，避免双重计费；失败轮次已观测到的用量同样计入。费用由服务端按模型目录单价（美元/百万 token）计算，包含输入、输出、缓存读取与缓存写入，多模型按实际模型计价；沙箱模型定义不携带真实单价。普通任务缺少单价或单价为零时计零，不代表实际免费，也不能据此证明预算覆盖了真实账单。

Agent 设置 →「用量与预算」由 owner/admin 设置月度美元上限（留空不限，按 UTC 自然月；零预算会拒绝新任务）。任务结算检测当月达到 80% 后通知工作区 owner/admin，每月只通知一次；运行中首次达到 100% 留预算越线记录，不取消已经准入的轮次。达到上限后统一准入拒绝会话、委派、频道、触发器、控制 MCP 等新任务，错误码 `AGENT_BUDGET_EXCEEDED`（REST 402）；它不是在途费用的硬截断。预算不进入执行配置，修改不发布新修订。工作区汇总见「日志」→「智能体用量」。

## 13. Agent 自进化

智能体设置中的**自进化**管理经验、记忆、改进提案、隔离评测和灰度发布。这里更新提示词、技能和受审核的上下文，不训练模型权重，不允许智能体自行取得账户令牌、修改平台运行代码或扩大执行权限。

### 经验与记忆

- Work／Agent 回复的点赞、点踩和说明按消息与操作人保存，可查看或撤回自己的反馈。
- 执行经验关联原任务、会话和不可变修订，记录整轮结果、工具调用／失败、token 和费用。工具失败但模型继续完成任务，不自动判整轮失败。
- 记忆有 Agent、会话和任务作用范围。来源内容先作为待审核数据，审核、编辑、合并和归档使用版本检查，避免并发覆盖。
- 启用后，每轮只读取已批准且作用范围匹配的条目；Agent 范围还要求该入口允许，并保存本轮使用的版本快照。记忆不是凭据存储，不能覆盖固定修订和实时工具授权。

### 反思与修订提案

自进化及定时反思默认关闭；启用后可手动排队，或配置反思间隔与独立月度费用上限，同时仍检查 Agent 月预算。模型读取可访问的经验和反馈，产出待审核记忆、提示词变更或私有技能提案。反思不直接发布修改；后台任务保留状态和费用，失败不生成虚假的成功提案。

提案展示来源证据和具体文件 diff。审核必须基于仍然有效的默认修订，基线变化后不能用旧提案覆盖新配置。批准候选与推广到默认版本是两个操作：候选保留父修订并经修订授权／能力校验，不立即改变全部新会话。新私有技能须明确审核和授权，不可伪装为已有安装或改写第三方制品。

### 隔离评测

评测用例包含输入与判定规则，支持精确文本、包含文本及模型评分。基线和候选分别在临时隔离的 Pi SDK 环境执行，不挂载生产可写卷、不传生产环境凭据、不调用真实有副作用的 MCP。外部工具通过显式录制数据提供；参数不匹配、缺少所需工具或未实际调用必需工具必须失败，不能以任意成功结果或口头答案替代。

结果保存用例快照、两组输出、质量、token、运行及评分费用，展示质量／成本 Pareto 比较，并列出被排除的生产能力。隔离评测通过不等于生产业务成功，也不证明未执行的外部服务可用；推广前须审阅差异，不把调用正常结束当作任务质量通过。

反思与评测要求模型目录明确配置输入、输出、缓存读取、缓存写入四类单价；免费项可显式设零，缺价返回 `MODEL_PRICING_UNAVAILABLE`，不同于普通任务的零价回退。评测记录实际执行镜像摘要；隔离容器有持久清理记录，恢复先清理旧容器，清理失败不隐藏为成功。

开发验收入口为 `TOOLPLANE_TEST_NATIVE_EVOLUTION=1 pnpm vitest run tests/integration/agent-evolution-native.test.ts`，须先核实独立测试库、本机 Docker 及固定 `toolplane-pi-package-capture:1.5.2` 镜像。该测试使用受控模型响应和真实 Pi／bash 执行，验证执行／隔离边界，不证明真实模型质量提升；本文未执行该验收。

### 灰度、推广与回滚

灰度按比例为新会话／context 固定候选版本，现有会话不随百分比、默认版本或停止灰度而漂移。界面对比基线与候选的样本数、成功率、工具失败、反馈和成本；样本不足不能宣称已证明改进。

启动灰度要求匹配当前基线及候选的成功评测，且结果非空、所有结果均无失败码；这并非自动要求候选质量高于基线。停止只停止后续分流；推广重查当前基线与候选，并走正式修订发布验证。回滚也重新校验授权、发布新的历史配置版本，不回退版本指针、不恢复已撤销凭据、不重写现有会话。评测结论不能绕过发布检查。
