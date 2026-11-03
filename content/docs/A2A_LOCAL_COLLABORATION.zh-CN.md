# 原生 A2A 内部协作


控制台提供显式的 A2A 协作开关、连接信息与本地任务调试，见[A2A 接入指南](A2A_CONSOLE.zh-CN.md)。下面的 Bearer API 保持不变；普通聊天、Work、Control MCP 和频道使用通用 Agent 执行核心，不需要启用 A2A。

本文供维护 Agent 配置、原生执行器和任务调度的开发者使用。A2A 协议 Handler 负责网络请求、认证与协议投影，`src/lib/agents/execution/` 负责通用准入、调度、固定修订、工具与审批；普通入口不再调用 A2A Handler。内部执行仍复用既有 Task、Context、去重和事件存储；官方 `@a2a-js/sdk@1.2.0` 的网络类型与状态保持不变。

## 边界与入口

本地 Context 使用 `targetKind=local`、工作区、Agent、调用用户和配置指纹；不创建虚假的
Endpoint、API 客户端或私人 Conversation。公开 Context 保留发布修订与客户端隔离。
公共凭据不能访问本地入口，公共执行服务也不能取得私人 Agent 的权限。

本地可执行目标仅为 Pi SDK 0.87.1，使用已应用修订中的模型、MCP、Skill、能力包和会话沙箱；其他运行时历史只读，不提供执行兼容。
`Context.id` 绑定独立原生上下文与可写工作卷，不共享来源会话目录；同一上下文串行。

新链路直接接原生沙箱执行端口，不调用旧 `runAgentTurn`、旧协作 Worker、Responses API
或 `runDedicatedSandboxTurn`。受支持运行时的经典聊天、Work、Control MCP 和显式授权渠道
现在通过[统一入口与原生 Pi 交互](A2A_INGRESS_APPROVALS.zh-CN.md)使用同一核心；历史数据不自动重放。[A2A 接入页面](A2A_CONSOLE.zh-CN.md)提供开关、连接示例和任务树。

## 显式启用和调用

先配置调用方与目标的模型、联网 Docker 沙箱及工具，在调用方已有的“子智能体”设置
中选择允许的目标。这些有向关联只表示委派范围，不自动开放整个工作区。

入站 `a2aInboundEnabled` 与出站 `a2aOutboundEnabled` 独立且默认关闭。委派由调用方
的出站策略和有向关联授权，目标无需开放入站；入站只控制 A2A 接口与任务控制台的直接
调用。普通聊天、Work、control 发起方无需开放自己的入站；账户令牌根入口另需 `a2aInternalEnabled`。
工作区所有者或管理员可通过下列入口配置：

```bash
curl -X PUT "$TOOLPLANE_URL/api/v1/workspaces/$WORKSPACE/agents/$AGENT_ID/a2a/local" \
  -H "Authorization: Bearer $ACCOUNT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"inboundEnabled":true}'
```

用同一入口的 `GET` 获取标准 Agent Card，`POST` 发送 A2A 1.0 JSON-RPC。
普通成员可以调用已明确开启的本地 Agent，但不能启用它。管理写入会在事务中重新检查
管理员身份并写审计。仅接受有效的账户级 Bearer；Cookie、Toolkit Token、公共服务密钥、
运行凭据和带 Origin 的浏览器请求不能作为该入口的身份。

同一管理员 PUT 接受 `outboundEnabled` 和严格的 `policy`（`schemaVersion: 1`、`targets`）。
每个目标包含 `kind`、`targetId`、`capabilityIds`、`maxCalls`、`maxDepth`、`maxConcurrent`、
`timeoutSeconds`、`maxInputBytes`、`dataAllowance: "text_only"`。可选 `budget` 包含
`currency`、`maxAuthorizedCostMicros`、`authorizedCostPerCallMicros`；这是授权预留，
不是供应商实际费用。每次新调用/续写均消耗单次预留，失败或结果未知不退回；相同消息重试
不重复消费。严格策略拒绝测量账单硬上限和 token 限额，不能假装对端提供了费用证明。
策略不匹配、次数/费用耗尽时，运行工具持久化 INPUT_REQUIRED 并返回 `approvalRequired`，
不创建子任务、不发送数据。模型不能批准；已批准范围内的确认可恢复原上下文，扩大权限
需管理员修改策略并创建新任务/修订，不能用一句回复扩大历史上下文。固定修订与实时授权的交集见[原生 Pi SDK](AGENT_RUNTIMES.zh-CN.md)。

遵循 [A2A 1.0 AgentCard 语义](https://a2a-protocol.org/v1.0.0/specification/#441-agentcard)，
卡片的 `description` 返回 Agent 配置的简介，并去掉首尾空白；未填写或只有空白时，
兜底为 `Explicitly enabled workspace-local Agent.`。`skills` 列出 Agent 直接关联或通过 Toolkit
关联、且允许 Agent 调用的已安装 Skill，按已安装 Skill ID 去重；名称和说明来自已安装
Skill/目录元数据，禁止 Agent 调用的 Skill 不返回。没有符合条件的 Skill 时返回空列表。
卡片不包含私有系统提示词或 Skill 正文。修改简介不改变执行配置指纹，也不会使已有任务授权失效。

```bash
curl "$TOOLPLANE_URL/api/v1/workspaces/$WORKSPACE/agents/$AGENT_ID/a2a/local" \
  -H "Authorization: Bearer $ACCOUNT_TOKEN" \
  -H 'Content-Type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{
    "message":{"messageId":"review-001","role":"ROLE_USER","parts":[{"text":"分别委派代码审查与测试，汇总结果。"}]},
    "configuration":{"returnImmediately":true,"historyLength":0}
  }}'
```

后续查询、订阅、取消及输入补充仍使用标准 `GetTask`、`SubscribeToTask`、`CancelTask`、
`SendMessage`。同一消息 ID 只可重试完全相同的内容。`taskId` 用于尚未终结且需要输入的
任务；已终结任务需要创建新任务。原生 RPC 和返回状态不增加自定义的委派方法或等待状态。

## 运行时协作工具

每轮本地任务会注入一个受限 MCP 桥接器。MCP 是 CLI 的工具接入口，不是另外一套 A2A
网络协议或独立的任务存储。

| 工具 | 作用 |
| --- | --- |
| `a2a_list_agents` | 仅返回当前被关联且配置有效的目标 ID 与名称，无需内部开关 |
| `a2a_send_message` | `agentId` 加标准 A2A `SendMessageRequest`，交给同一任务核心，立即返回 Task |
| `a2a_get_task` | 查询当前任务直接委派的子任务，含追问与交付物 |
| `a2a_cancel_task` | 请求取消直接子任务及其后代 |
| `a2a_await_tasks` | 记录要等待的直接子任务 ID，然后正常结束本轮 |
| `a2a_request_input` | 记录追问，然后正常结束本轮；不能批准操作 |
| `a2a_publish_artifact` | 向当前任务发布不可变的文本、JSON 或任务文件交付物 |

模型不能提供调用用户、父任务、根任务、委派深度、截止时间或授权凭据来覆盖服务端状态。
签名运行凭据同时绑定任务与本轮执行租约，不能拿普通模型代理 Token 委派任务。
进入等待、追问或终态后，该轮凭据立即失效；恢复时重新签发。模型与 MCP 代理也检查这一
租约，而不只是协作接口检查。账户 Token 不投影到沙箱中。

## 等待、追问和恢复

父 Agent 委派 B、C 后调用 `a2a_await_tasks`，并**正常结束当前执行轮次**。核心记录等待
条件、回收执行租约和沙箱写入槽；父 Task 对外仍为 `TASK_STATE_WORKING`。内部 `phase`
区分 queued、executing、waiting、resumable、paused、done，不把这些作为 A2A 枚举发送。

所有选中的子任务完成、失败、取消或需要输入/授权时，父任务进入可恢复阶段。领取动作
在事务与租约控制下只发生一次；父任务在原 Context 获得一条用户角色的结果通知并继续。
子任务内容是**不可信任务数据**，不是系统指令或权限。结果过大时只附 ID，调用方通过
查询工具取回，不把无限文本塞进上下文。

子任务追问会唤醒父任务。父任务可用相同子 `taskId`、新 `messageId` 补充信息，再次等待；
无法回答时可向自己的调用者追问。即使父任务忘记显式等待，正常退出时也会自动等待仍未
终结的直接子任务，避免把委派中的工作误报为全部完成。不能通过崩溃或超时把任务伪装
成一次成功暂停。

根任务取消、失败或授权失效会传播至后代。运行中的任务先收到取消请求，执行器真正
停止后才确认取消；已经发生的外部操作不会回滚。服务重启保留持久等待/可恢复记录，但
原先正在执行且结果不确定的任务失败终结，不自动重放其副作用。

## 交付物

本地输入与输出支持标准 A2A 1.0 文件 Part（`raw` 或 `url`，并声明 filename 和 mediaType）；
接收完成后才能执行。远端还必须在 Card 中声明对应 MIME。文件支持不会扩大公共端点能力；当前没有公共执行适配器。

运行中的本地 Agent 可调用 `a2a_publish_artifact`：

```json
{
  "artifactId": "review-v1",
  "name": "review.json",
  "parts": [{ "data": { "approved": false, "findings": [] }, "mediaType": "application/json" }]
}
```

内联 Part 使用标准 A2A 的 `text`、`data` 或规范 Base64 `raw`；内联内容合计不超过 32 KiB。
发布工具还接受当前任务的 `fileId` 或允许的沙箱文件 `path`，不能借此读取任意宿主路径。
文件写入不可变任务存储后，持久化交付物只保留所属任务的文件句柄，不保存 Base64 或远端签名 URL。
单文件最多 10 MiB、每任务最多 20 个文件且合计 100 MiB；文件保留七天，下载仍需任务权限。
任务文件列表、读取与沙箱暂存沿用任务及每级祖先 grant 的固定 Agent 修订，不因 Agent 发布新默认修订而切换目标指纹；无附件的 Work 也会经过该授权检查。固定修订不会绕过当前成员身份、方向性委派开关或父子绑定撤销，撤销后仍拒绝读取；真实文件落盘失败仍保留显式文件阶段重试语义。

输入接收或沙箱落盘失败时，显式重试只恢复文件阶段，不追加业务消息、不重放模型或 MCP 调用。
远端已返回终态但文件接收失败时，保留观察到的终态，待文件恢复完成才结束任务并唤醒等待方；不会再次 SendMessage。

同一任务内 artifactId 不可覆盖：相同内容重试不新增事件，不同内容需使用新 ID。最多发布
十五个显式交付物，为最终结果预留一个位置；还受快照、事件记录与工作区限额约束。
发布不代表任务完成。只有尚在执行、授权有效、未取消或暂停的当轮租约才能发布。

会检查 `acceptedOutputModes`。要求 JSON 时，Agent 必须显式发布 JSON 交付物；不能把
最后一段普通文本猜成 JSON 并伪报格式满足。交付内容始终是任务数据，不是新权限。

交付物附平台生成的 `toolplane.dev/provenance`：来源任务/上下文、目标身份、内容字节数
和规范化持久化 parts 的 SHA-256（对象键排序，数组保序，算法名
`sha256-canonical-parts-json`）。本地发布的文件 Part 按实际文件大小计入字节数；摘要覆盖不可变文件句柄，而非下载 URL。
摘要不是授权或可信证明，访问仍受任务权限约束；产物 URL 不会被自动访问。

## 调度与限制

任务根链最多 16 个任务、3 条委派边；父任务最多恢复 16 次。后代共享根截止时间，最长
840 秒，补充消息不能延长。每工作区的未结束本地/远端任务总数不超过管理员配置的
平台执行上限加 16 个排队名额；排队名额不会增加实际执行并发。每个调用身份最多保留
256 个任务；Context 最多 128 个任务。输入、输出、快照和消息数量沿用原生核心限制。
工作区用户入口每分钟最多 120 次请求；受限运行时入口也有独立请求限制。

整个核心仍只有一个运行时所有者。本地沙箱任务统一遵守管理员的单 Agent 和平台并发
限额；每个会话/context 使用独立沙箱，同一会话仍串行。原有四槽池仅限制公共端点与
远端执行，不再额外限制本地 Pi SDK。等待中的
父任务释放执行名额；忙碌的根任务保持排队，嵌套子任务遇满额立即失败，避免相互等待。

这些不是金额或精确 Token 预算。聚合准入计数见[资源限额](A2A_RESOURCE_LIMITS.zh-CN.md)。
大文件/二进制输入、自动历史记忆迁移和分布式执行仍未支持。原生扩展交互与 Web 展示限制见[专门说明](A2A_INGRESS_APPROVALS.zh-CN.md)。

## 迁移与验证

应用 `20260922010000_a2a_local_collaboration` 并重新生成 Prisma Client；已有原生核心
迁移必须先应用。本迁移为已有公开 Context 回填工作区并保留发布修订、身份和任务快照，
增加本地目标约束与调度字段，不迁移、重放或删除旧聊天/协作数据。

```bash
pnpm exec prisma generate
pnpm vitest run tests/integration/a2a-local.test.ts tests/integration/a2a-native.test.ts
pnpm exec tsc --noEmit
```

运行时适配测试覆盖四种 dedicated runtime 的投影；任务循环测试使用替身执行器，MCP
互通使用官方未修改客户端。PGlite 模式跳过真实 PostgreSQL 并发测试，不能作为并发锁
正确性证据。尚未完成四种真实 CLI/模型、浏览器端到端验收或官方 A2A TCK 认证。

本版还需应用 `20260923050000_a2a_storage_accounting`，参见[资源限额与迁移](A2A_RESOURCE_LIMITS.zh-CN.md)。

文件交付还需应用 `20261029010000_a2a_task_files`，重新生成 Prisma Client 并重启开发服务。

内部任务现在可通过[远程 Agent 注册与委派](A2A_REMOTE_AGENTS.zh-CN.md)调用经过单独批准的外部 A2A 服务。部署来源白名单、工作区注册和发起方 Agent 授权都必须显式配置；不自动开放私人资源。

### 子智能体共存的验收边界

原生子任务与平台委派共存需应用 `20261102040000_agent_subagent_modes_coexist`。
Agent `/chat` 与 Pi/OMP Work 均通过统一任务准入、Context、执行租约和 `toolplane-runtime` 入口提供平台委派。Work coordinator 只负责观察及保存本轮回复，不再直接调用独立沙箱 turn；子 Agent 继续使用自己的固定修订、实时授权和独立可写卷。

Work 保留原 Conversation 的原生会话 ID、活动消息（含已有附件与引用）、工作目录、推理设置和 slash 命令；固定资源还要与 Work 创建时的资源快照及当前授权取交集。任务身份不是新增授权：没有固定出站权限时不提供平台委派工具，撤销有向关联或出站权限仍立即收窄后续调用。子任务开始与结果进入同一 Work 子任务活动，流式父输出、用量、命令结果、原生对话与本轮唯一回复仍由原有界面展示和持久化。

明确取消 Work 时，控制面只允许取消该 Work 操作人、修订和入口绑定所属的根任务，并级联取消后代；已设置取消标记不会被当成恢复执行授权。普通观察断开不取消已接纳的任务。历史上没有执行操作人或固定修订的 Work 不推断身份，也不通过当前默认权限恢复。

2026-11-03 早先验收曾出现 Pi 父 Agent 等待约 31 秒后收到独立 OMP 子沙箱终态、但文本为空的失败。任务 `COMPLETED` 只证明终态，不证明结果正确。后续验收必须分别从 `/chat` 和 Work 提交，检查独立子执行的预定文本/文件，以及父回复实际采用该结果；OMP 原生与平台任务共存还必须在同一真实父会话内分别产出有效结果。新增行为回归覆盖 Work 的两种运行时、任务凭据、消息/资源收窄、命令、输出流和取消后代；测试与真实运行验收结果以实际执行记录为准。

同日最终 `/chat` 真实验收已通过：同一 OMP 父会话先由原生子任务执行 bash 得到 `CHAT_NATIVE=323`，再由独立 Pi 子 Agent 返回 `CHAT_PLATFORM=667`；两项完成事件与父回复的 `CHAT_SUM=990` 均已核对。显式修订升级后继续会话也实际返回 `UPGRADE_OK`。验收使用固定 OMP 18.14.0 和真实模型；为避开首次下载耗时，沙箱预置了摘要校验通过的同版二进制，这不验证首次在线下载安装链路。

Work 入口也已完成真实顺序验收：升级后的既有会话先由原生子任务 bash 输出 `91`，随后平台 Pi 子任务独立返回 `WORK_PLATFORM=143`；父回复实际采用两项结果输出 `WORK_SUM=234`，Work 回到 `idle` 且无错误。复用沙箱时 Conversation 与 A2A Context 必须原子绑定同一授权沙箱，模型代理仍严格验证两者；不能为修复绑定遗漏而放宽授权。

OMP 的 RPC 宿主工具使用 `tp__…` 注册名，避免原生 MCP 目录刷新清理其保留的 `mcp__…` 命名空间；Pi 调用名保持不变。模型按本轮提供的确切名称调用，旧会话历史中的调用名不提供兼容别名。真实 OMP 二进制探针已验证原生任务完成并刷新目录后宿主工具仍可调用；平台委派端到端结果以上述 Work 验收为准。
