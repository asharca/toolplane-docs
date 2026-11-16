# 原生 A2A 任务服务


本文记录公共 Endpoint 的 A2A 协议与历史管理契约，**当前不能启用公共执行**。使用私人 Pi Agent 的本地协作请看[控制台指南](A2A_CONSOLE.zh-CN.md)和[内部协作](A2A_LOCAL_COLLABORATION.zh-CN.md)，不要按历史公开服务示例尝试发布。

本功能使用 A2A **1.0** 网络协议，依赖精确锁定的官方 `@a2a-js/sdk@1.2.0`。
协议版本与 SDK 版本不同。依据 [A2A 规范](https://a2a-protocol.org/latest/specification/)
实现 JSON-RPC 绑定；没有启用 SDK 的 v0.3 兼容层。

## 新架构，而不是 Responses 接口改名

```text
保留的公共协议层：外部 A2A 客户端 → Endpoint 凭据 → 官方 JSON-RPC → 任务查询／历史／取消
当前公共执行边界：新消息／续写 → 拒绝，不创建任务或分配运行时
当前本地执行链路：账户级授权 → 本地 Agent 准入 → 固定 Pi 修订 → Agent 沙箱
```

任务核心不调用 `prepareAgentResponse`、`executePreparedAgentResponse`、旧内部协作
Worker 或私人 Conversation。Task 是业务生命周期，不是某一次 HTTP 或模型调用。
Context 可以包含多个 Task；它绑定调用身份、发布版本和独立运行会话，不允许跨客户端借用。
旧 Responses 的鉴权、限额、历史与取消控制面保留，不提供执行兼容或转接新 SDK；两条链路保留通用发布契约、身份与并发准入边界。
当前没有可用的公开执行适配器。A2A 服务启用返回 `runtime_unsupported`（HTTP 409），旧公开发布 action 已删除；公开 A2A 的新消息与续写在锁和记录创建前拒绝（内部 `A2AHttpError` HTTP 410，传输层可能序列化为协议错误）。Responses/OpenAI HTTP 执行入口保持 HTTP 410，不创建新的 Run 或 runtime 分配，也不转接 Pi。以下协议说明用于保留的管理、历史与集成契约，不表示当前可以发布新公共 Agent。

## 显式开启

以下是保留的管理请求形状，不是当前可执行的启用步骤。`enabled: true` 在创建客户端或密钥前返回 `runtime_unsupported`；关闭与撤销已有凭据仍遵循管理授权。入口要求工作区所有者或管理员的**账户级 Bearer Token**：

```bash
curl "$TOOLPLANE_URL/api/v1/workspaces/$WORKSPACE/agents/$AGENT_ID/a2a" \
  -H "Authorization: Bearer $ACCOUNT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"clientName":"External A2A integration"}'
```

历史成功创建的响应只返回一次 `token`，应保存在服务端秘密存储，不放在提示词、日志、前端或仓库。客户端和密钥创建不是幂等操作，响应不确定时先查询，不盲目重试。当前版本不会因下列协议说明重新开放创建／启用；关闭使用 `{"enabled":false}`。
服务凭据、Toolkit Token、运行 Token、Cookie 均不能用来批准自己的发布。

新客户端只有 `a2a:send`、`a2a:read`、`a2a:cancel`，取消同时要求读取权限。
旧的 `responses:*` 权限不自动获得 A2A 权限。账户级或运行时 Token 不能调用公共任务接口。
整个链路是服务端到服务端接入；浏览器 Origin 被拒绝。本版没有 OAuth 自动发现/授权交换。

## Agent Card 与协议入口

管理响应返回实际路径。每个 Endpoint 的地址为：

```text
GET  /api/v1/agent-endpoints/{endpointId}/a2a/.well-known/agent-card.json
POST /api/v1/agent-endpoints/{endpointId}/a2a
```

Card 也需要该 Endpoint 的授权凭据，可通过直接配置的 Card URL 发现，不把根域名的
well-known 文档改成自定义 Agent 数组。Card 地址来自部署者配置的 `NEXT_PUBLIC_APP_URL`，
不能由不可信 Host Header 决定；非 loopback 部署默认要求 HTTPS，平台管理员可通过[传输调试设置](RUNTIME_OPERATIONS.zh-CN.md#管理员传输调试设置)允许显式 HTTP。
Card 只含公开名称、服务修订、能力、地址和鉴权声明，不含提示词、Provider、内部工具或凭据。

下面仅保留 `SendMessage` 请求格式；当前公共入口拒绝新执行，不会返回成功 Task：

```bash
curl "$TOOLPLANE_URL/api/v1/agent-endpoints/$ENDPOINT_ID/a2a" \
  -H "Authorization: Bearer $A2A_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{
    "message":{"messageId":"review-001","role":"ROLE_USER","parts":[{"text":"审查这份补丁。"}]},
    "configuration":{"returnImmediately":true,"historyLength":0}
  }}'
```

成功执行时的历史契约返回标准 `result.task`，状态使用 `TASK_STATE_SUBMITTED` 等官方枚举，不是旧 Response ID；当前公共入口不会产生这类新任务。查询和订阅保留任务时仍须检查标准状态，不能把建立连接视为任务完成。

| 标准方法 | 实现 |
| --- | --- |
| `SendMessage` | 公共入口拒绝新消息和续写，不创建任务 |
| `SendStreamingMessage` | 公共入口拒绝新执行，不产生新的执行流 |
| `GetTask` | 当前身份范围内查询；historyLength=0 不返回历史 |
| `ListTasks` | 状态时间倒序、带签名且绑定查询/身份的游标分页 |
| `CancelTask` | 请求停止，执行器结束后才确认取消；已完成等终态不可取消 |
| `SubscribeToTask` | 首事件为当前 Task；终态任务返回 UnsupportedOperationError |

`ListTasks.nextPageToken` 总是存在；末页是空字符串。默认不包含 artifacts，开启
`includeArtifacts` 后才返回。游标不是数据库 offset，不可以挪到其他身份或过滤条件使用。
重订阅发送当前快照和后续持久事件，不承诺任意 Last-Event-ID 历史重放。
原生任务流目前不包含模型逐 token 增量；不会冒充 Token 流。

## 生命周期和安全边界

同一 Context 仅允许一个活动 Task。后续新的任务使用相同 Context；补充信息必须使用
原 Task 的 taskId、新 messageId，且原任务处于 INPUT_REQUIRED。COMPLETED、FAILED、
CANCELED、REJECTED 不重开。AUTH_REQUIRED 不接受模型消息作为授权，不把普通文本猜测成原生审批或追问事件。

任务、接收消息去重记录和初始事件在同一事务内写入。状态和交付物事件同样原子写入。
Worker 与 HTTP 请求解耦，执行租约防止过期执行器覆盖结果。取消请求不是停止确认，
已发生的工具副作用也不会回滚。重启时先完成平台运行时所有权恢复，再将不确定的
WORKING 任务失败终结；绝不自动重放可能有副作用的执行。

身份从已验证凭据取得，不接受 message.metadata 中的 workspace、client、subject 或
agentId 作为授权。读、继续、取消和订阅都限制到 Endpoint、客户端及授权主体。
密钥撤销、作用域变化、工作区关闭、Endpoint 禁用在运行和订阅期间继续检查。
任务内容不进入公共诊断日志，未知异常只返回通用错误。

当前限制：请求体 256 KiB；输入 20,000 字符；输出 65,536 字符；Task 快照 512 KiB；
每任务最多 32 条历史消息；每 Context 最多 128 个任务；每客户端最多 100 个 Context、
1,000 个保留任务；Worker 最多四个执行；每身份八个、全局 64 个观察连接。
任务最长 840 秒，实际取 Endpoint 超时、凭据寿命和 Context 到期时间中的最小值；补充
信息不会延长原截止时间。Context 最多保留 30 天，终结后按有限批次清理。
聚合输出预留和载荷存储准入已加入，见[资源限额](A2A_RESOURCE_LIMITS.zh-CN.md)。它们不是精确金额或 Token 计费。

## 支持范围与验证

只声明 JSONRPC、streaming 和 text/plain。REST、gRPC、Push Notification、扩展 Card、
文件与结构化输入均未声明实现；不支持的能力返回标准错误，不伪造成功。
没有自动注册任意外部 URL，不会抓取调用方提供的文件 URL。
内部 Pi SDK Agent 可以通过独立的[原生协作入口](A2A_LOCAL_COLLABORATION.zh-CN.md)使用同一任务核心，支持父任务等待与续轮。入口适配、原生扩展 UI 及安全边界见[统一入口说明](A2A_INGRESS_APPROVALS.zh-CN.md)；Web 交互不会为公开 Endpoint 增加执行能力。

升级前按平台单所有者流程应用 `20260922000000_a2a_native_tasks` 并重新生成 Prisma Client。
此迁移新增独立表、索引和显式开关，不迁移/重放旧会话或旧协作任务。

```bash
pnpm exec prisma generate
pnpm vitest run tests/integration/a2a-native.test.ts
pnpm exec tsc --noEmit
pnpm lint
```

单元测试使用未改动的官方 ClientFactory/JSON-RPC transport 进行互通验证。
集成测试使用隔离数据库和替身执行器；`TOOLPLANE_TEST_PGLITE=1` 仅用于本地嵌入数据库，
明确跳过真实 PostgreSQL 并发锁验证。CI 不应设置该标记。不能把此模式结果当成真实
PostgreSQL 并发、真实 SDK/模型端到端验收或官方 TCK 认证。

外部 MCP 客户端可通过[原生 MCP 适配](A2A_MCP_BRIDGE.zh-CN.md)使用同一任务核心，不经过旧 Responses 执行链。

本版还需应用 `20260923050000_a2a_storage_accounting`，参见[资源限额与迁移](A2A_RESOURCE_LIMITS.zh-CN.md)。

内部任务现在可通过[远程 Agent 注册与委派](A2A_REMOTE_AGENTS.zh-CN.md)调用经过单独批准的外部 A2A 服务。部署来源白名单、工作区注册和发起方 Agent 授权都必须显式配置；不自动开放私人资源。
