# Agent 消息平台


## 频道管理

每个 Agent 设置中的“频道”默认展示全部已添加连接，以名称、平台、运行状态和开关为主。上方平台标签仅筛选列表；“添加频道”先选择平台，再创建连接并展开配置。工作区设置不再重复提供频道入口。Feishu、Telegram、QQ、WeChat、Discord、Slack 按相同顺序展示。

点击连接行的“配置”在原行下展开，同时只展开一个连接；设置只保留“基础”和“权限”两个标签，其他连接仍保留在列表中。基础管理名称、绑定、凭据与会话隔离；权限集中管理开放范围、管理员、白名单、陌生发送人处理及配对批准。“收起”返回紧凑列表；迁移和删除位于“更多操作”，确认仍在当前连接行内完成，不额外叠加弹窗。次要凭据和命令说明收在“高级设置”。桌面名称与绑定字段并排，窄屏自动改为单列。沙箱内的频道入口使用相同行为。基础配置通过“保存设置”提交。

添加频道会自动绑定当前管理账户作为执行身份，无需到 A2A 接入页面另行授权，也不要求开启 A2A 入站协作。微信绑定 Agent 后，扫码确认并保存凭据即自动启动；直接提供完整凭据添加微信时也自动启动。原有缺少执行身份的连接，在管理员重新启动、配对或保存配置时自动补齐身份，不会擅自使用工作区所有者。

频道可以先创建为未绑定的草稿。绑定 Agent 之后才能启动 runner。删除 Agent 不会连带删除
频道，频道可以重新绑定；删除频道会停止 runner，但保留会话历史。服务器启动时会恢复之
前标记为 running 或 starting 的已绑定频道；已停止的频道和不完整的草稿保持停止。
ToolPlane 保留自己的工作区鉴权和 Agent 沙箱执行模型，不引入 Cherry Studio 的 Electron
IPC 或宿主机目录访问。

管理接口为 `GET/POST /api/v1/workspaces/[slug]/agent-channels`，支持账户 Bearer token
或会话 Cookie；所有 POST 管理动作仅允许工作区所有者或管理员。POST 动作包括 `create`、`update`、`delete`、`start`、`stop`、`pair`、
`check`、`apply`、`move`、`approvePairing`、`dismissPairing`、`allowSender`、`revokeSender`、`upgradeConversations`。`GET ?logs=[connectionId]` 在工作区鉴权后返回内存中最近 200
行日志；`GET ?access=[connectionId]` 仅所有者或管理员可读，返回待审配对、已批准发送人和最近 7 天被拒发送人。已知密钥会脱敏，任何管理响应都不包含 runner 或入站 token。非密钥配置值可读可
清空。密钥字段留空表示保留已加密存储的原值。编辑运行中的连接会将其重启。

频道会话按连接 ID 和上游 chat 共同键控，绑定同一 Agent 的两个机器人不会意外共享历史。适配器上报 `dm`、`group`、`channel`、`thread` 四类会话来源：私聊每个 chat 一个会话；群组和频道默认按成员分会话；线程默认由成员共享。连接设置中的“群聊按成员分会话”“线程按成员分会话”可调整这一规则。已有会话不会改键：没有新键会话时，普通消息继续使用旧键下的最新会话；显式 `/new` 按当前规则新建。

频道会话出现在 Work 侧栏 Channels 分组中对应 Agent 之下。它们是普通的
`Conversation`/`Message` 历史，不是 Work 会话。选中会话会跳转到
`/app/[workspace]/work?agent=[agentId]&c=[conversationId]`，复用现有 Work 界面及其侧
栏、搜索和沙箱工具。`/app/[workspace]/chat` 保留给助手使用；旧的 Agent chat 路由重定
向到 Work。频道对话只读观察通过 SSE 展示本轮文本、执行阶段与实际工具活动，结束落库后切换为历史消息；同一页面持续接收后续回合，无需手动刷新。观察不会提交任务、授予工具权限或重放执行；原生对话回答仍只允许执行所属账户。迁移后旧历史仍归原 Agent。

频道消息直接进入通用 Agent 执行核心，普通执行不依赖 A2A 开关。上游正常收到实际结果，而不是逐条“已接受”回执；执行失败会在会话保存安全的失败消息并回传提示，不自动重放。Pi 扩展需要原生确认、选择或文本输入时，频道发送会话 Work 链接；绑定的执行账户登录后回应原生对话，不需要进入 A2A 设置。平台不另加逐次工具审批。交互通知发送失败不会中断正在执行的任务；最终回复投递失败不会制造第二条执行失败回复。会话执行状态、原生 dialog 和 todo 投影通过 `/api/v1/agents/{agentId}/conversations/{conversationId}/execution` 读取，POST 接受原生 `extension_ui_response`；只接受同源登录态及该执行的所属账户，并拒绝过期或重复回答。持久化回复不代表上游已确认投递，不承诺跨重启 exactly-once。

连接行的“查看频道观测”打开工作区日志中的频道视图（`/app/[workspace]/observability?tab=channels&channelId=[connectionId]&agentId=[agentId]`），集中查看对话记录和连接运行日志，不再放在设置标签中。对话记录每五秒增量读取已持久化的新消息，按会话显示最新消息和已加载数量；首次读取最近 100 条，可继续加载更早记录。通过会话链接进入 Work 查看完整历史、正在执行的文本和工具过程。运行日志支持暂停、筛选和复制；两类视图均不提供发送、编辑、重试或删除消息操作。

读取接口为 `GET /api/v1/workspaces/[slug]/agent-channels?history=[connectionId]`，可用 `after=[messageId]` 增量读取或 `before=[messageId]` 向前分页。每页最多 100 条，仅投影用户／智能体消息的文本，不返回工具内部数据或频道凭据。每次请求检查工作区成员身份、连接归属及游标所属频道；迁移后只读取连接当前 Agent 的记录，原 Agent 历史仍保留在其已有会话中。

实时观察接口为 `GET /api/v1/agents/{agentId}/conversations/{conversationId}/events`，只接受同源浏览器登录态。服务端校验工作区、Agent、会话与任务绑定，持续重查权限并在撤权时清空输出、关闭订阅。普通频道输出对所属工作区成员可见，不等于获得原生交互的回答权限。连接恢复读取最新快照，不重放任务；进程重启后已持久化的最终活动仍可恢复，执行中的内存片段不保证跨重启保留。

飞书/Lark 注册使用扫码设备流程，自动保存返回的 App ID 和 App Secret。微信使用现有的
iLink 配对流程。轮询在完成、过期、失败或关闭编辑器时停止。主要凭据字段与参考实现一致；
ToolPlane 额外策略和微信手动凭据保留在 Advanced 之下。

各平台的接入方式没有统一 URL。每个生态有自己的配置界面：bot token 表单、Socket Mode
应用、扫码、本地 daemon、邮箱收件箱或公开 webhook 回调。

ToolPlane 平台负责原生频道工作和 Agent 执行。一个频道连接属于一个 Agent，代表一个配
置好的外部生态入口。

## 发送人准入

准入在 Agent 执行之前检查，包括 HTTP 交接边界这一层。未配置白名单时默认拒绝；连接设置中的“对所有人开放”允许任何人（控制台会显示警告）。判定顺序：平台私聊／群组策略为 `disabled` 时拒绝；chat／频道白名单；频道管理员；Discord 角色白名单；最后是开放、平台 `*_ALLOWED_USERS` 或已批准发送人之一。频道管理员只跳过用户和角色白名单，不跳过 chat 白名单。

陌生私聊按连接设置处理：`pair` 回复 8 位配对码（1 小时过期、每连接最多 3 个待审、同一发送人一小时内只回复一次），由工作区所有者或管理员在频道的访问管理中批准；`ignore` 静默；`decline` 回复一次后静默 24 小时。群组、频道和线程中的拒绝始终静默。平台策略为 `allowlist` 时按 `ignore` 处理，为 `pairing` 时按 `pair` 处理。每次拒绝记录 `channel.sender_rejected`（同一发送人与规则每分钟最多一次，不含配对码），访问管理中可一键允许。

升级前的连接沿用原有效行为：服务启动时把“白名单为空即放行”的旧连接显式写为“对所有人开放”，并移除已废弃的 `*_ALLOW_ALL_USERS` 凭据项；托管 runner 连接保持按 chat 共享会话。

## 会话操作

频道命令与同一 chat 的传入消息按序处理，命令输出不进入模型上下文。频道配置面板列出这些命令。

| 命令 | 谁可用 | 作用 |
| --- | --- | --- |
| `/help`、`/whoami` | 已准入发送人 | 列出命令；返回上游 ID 与角色（管理员／用户） |
| `/status` | 已准入发送人 | 当前会话、固定修订与当前修订、模型（含会话覆盖标记）、角色和分会话方式 |
| `/new` | 已准入发送人 | 新会话，使用当前已发布修订；旧历史保留但不带入 |
| `/resume [n]` | 已准入发送人 | 列出同一路由键下最近 10 个会话；带序号时切换到该会话 |
| `/compact [focus]` 等 Pi SDK 命令 | 已准入发送人 | 在固定修订的原生会话中执行 |
| `/upgrade` | 频道管理员 | 把当前会话原地升级到当前修订，保留历史和会话模型覆盖 |
| `/model [list｜<provider:model>｜<model>｜reset]` | 频道管理员 | 仅修改当前会话的模型；`reset` 恢复固定修订的模型 |

频道管理员是连接设置中填写的平台用户 ID。`/new` 和 `/upgrade` 需要确认：Discord 与 Telegram 显示原生按钮，其他平台回复 `/new now` 等文本确认；确认 2 分钟内有效，带 `now`、`--yes` 或 `-y` 可跳过。`/new` 仅频道可用；新工作会话通过智能体侧栏的新建工作入口创建。

`/model` 的会话覆盖只能选择本工作区模型提供商已列出的模型，执行前实时校验；覆盖不改变智能体默认模型和固定修订，`/new` 新建的会话不带覆盖。提供商或模型被移除后，该会话的轮次以 `MODEL_OVERRIDE_UNAVAILABLE` 失败，需发送 `/model reset` 或换选模型。

控制台的频道连接行显示仍使用旧修订的频道会话数量，可一键升级空闲会话；执行中的会话跳过。Work 中选中的频道会话同样显示修订更新提示。

入站消息在准入后先持久化再处理：按 chat／线程串行、90 秒租约、最多 3 次尝试，重启后恢复未完成事件；同一平台消息 ID 重复投递不会产生第二轮执行。每连接最多积压 200 条，超出时记录错误并丢弃；已完成和失败的事件保留 7 天。最终回复在崩溃窗口内可能重复投递，不承诺跨重启 exactly-once。

智能体侧栏保留 New work 控件。操作绝不会把控制台文本作为频道消息发出，也不会把
用户带进助手界面。

Work 输入框在 `+` 和 `/` 之间共享一个五项菜单：附件、已存 prompt 管理、MCP prompts、
MCP resources、用户可调用的已绑定 skills。菜单和固定工具栏均不再提供“新任务”。
`@` 在当前沙箱中搜索文件和会话（包括频道历史），排除当前会话。引用读取会校验工作
区、Agent 和沙箱归属。选中的引用以可移除 chip 呈现，作为带引用元数据的 text part 持久
化，并进入 runtime 上下文。Prompt 模板按 Agent 存储，不存浏览器。菜单的 **Customize
toolbar** 项可以固定/取消固定动作、拖拽按钮排序、恢复默认。固定的动作离开根菜单；
工具栏偏好在本浏览器内跨 Work 会话持久化。

`/` 列出当前 Pi SDK 支持的原生命令（而非额外的 `+` 工具），包括 `/compact [focus]`。选中即插入命令，提交即执行；不支持的命令绝不会变成普通模型 prompt。历史非 Pi 运行时命令记录仍可读取，不恢复旧命令执行。

命令通过固定修订的原生 SDK 执行，不在宿主机侧模拟。Work 命令与普通轮次使用相同的协调器、实时授权和独立会话沙箱；原生 daemon 在轮次间保留会话状态，恢复以原生会话文件为准。压缩改变该原生会话的活动上下文，`/new` 另起一个会话；不重放旧平台历史来恢复执行。命令输出作为普通助手回复存储和渲染，支持复制（包括旧命令记录）；控制类读数不进入模型上下文。

## 职责划分

平台频道层负责：

- 原生应用创建、OAuth、bot token、扫码配对或 daemon 会话
- 签名校验和 challenge 握手
- 平台白名单和频道/用户策略
- 轮询、WebSocket、webhook、IMAP 或 bridge 事件接收
- 文件/媒体下载与上传
- 通过平台 SDK 完成最终回复投递

Agent runtime 负责：

- 工作区和 API token 鉴权
- Agent 模型/工具/skill/沙箱解析
- 会话与消息持久化
- 从来源元数据派生稳定的 `sessionKey`
- 有意静默（intentional silence）处理

## 原生传输

频道适配器改编自 Cherry Studio 的 Node 频道实现，对应 revision
c03519c028cfe25e32060ad7dcdeea531f22fd46。见 `src/lib/agents/channels/NOTICE` 和保留
的 AGPL 许可证。Electron IPC、宿主目录凭据存储和 Cherry 的 Agent 执行器不在其中。

| 平台 | 原生传输 | 凭据 |
| --- | --- | --- |
| Telegram | grammY Bot API 轮询 | Bot token |
| 飞书 / Lark | 官方 Lark Node SDK WebSocket | App ID 和 secret |
| QQ | 官方机器人 REST API 和 WebSocket 网关 | App ID 和 secret |
| 微信 | 腾讯 iLink 轮询与加密媒体 | 扫码签发的 token 和账户 ID |
| Discord | REST API 和 Gateway WebSocket | Bot token |
| Slack | REST API 和 Socket Mode | Bot token 和 app token |

`channel-runtime.ts` 在常驻 Node 服务器中管理这些适配器。入站消息直接调用
`runAgentChannelMessage`，回复使用同一适配器。频道层没有 Python 平台导入或外部运行时 checkout 路径；Agent 执行统一使用固定修订的 Pi SDK，频道传输从不选择或替换 Agent runtime。企业微信（WeCom）和钉钉的旧记录保留，其旧托管启动器不可用；回调集成保持独立，且必须对交接进行鉴权。

## 沙箱归属与迁移

每个沙箱有一个 Channels 标签页。`AgentChannelConnection.sandboxId` 限定其配置范围；绑
定的 Agent 从该沙箱的分配关系解析。现有 Agent 频道会被回填到该 Agent 的 runtime/默认
沙箱。未分配的沙箱可以接受草稿配置，但在分配 Agent 前不能启动回复。托管公网端点沙箱
除外。

工作区级管理 API 保留，但工作区设置不再提供全频道列表入口。`GET ?sandboxId=...` 只返回该沙箱
的频道。`POST { action: "move", connectionId, sandboxId }` 把频道移动到同一工作区的
另一个沙箱。移动前先停止旧适配器并中止进行中的轮次再重新绑定。凭据、配对状态、连接
ID 和入站 token 保持不变，因此迁移不需要重新扫码。活跃频道会对目标 Agent 重启。没有
Agent 的目标收到一个停止的草稿。重启失败会回滚原绑定。

历史仍归原 Agent；目标 Agent 开启自己的会话。调用方不能复用原 Agent 的会话 ID。已排
队的旧消息和迟到的适配器事件在移动后不能再回复。Runtime 轮次会显式收到频道的沙箱 ID。

入站事件已持久化（见上文队列说明），但适配器连接状态仍是单进程的；日志在内存中保留最近
200 行。要用同一套 bot 凭据运行多个应用副本，请先引入适配器的分布式归属。

## 接入流程类型

平台目录在 `src/lib/agents/platforms.ts`。每个条目包含 `setupFlow`、凭据字段、配置步
骤、连接模式，以及是否真的需要公网回调 URL。

示例：

| 平台 | 流程 | 用户第一步 | 需要公网回调？ |
| --- | --- | --- | --- |
| Telegram | Bot Token | 粘贴 BotFather token 和允许的 Telegram ID | 否 |
| 企业微信 | 扫码 | 扫企业微信二维码；回退为 Bot ID + Secret | 否 |
| 微信 | 扫码 | 扫微信二维码进行 iLink 登录 | 否 |
| Slack | Socket Mode | 粘贴 `xoxb-` bot token 和 `xapp-` app token | 否 |
| Discord | Gateway Bot | 粘贴 bot token 并启用 privileged intents | 否 |
| WhatsApp Cloud | Cloud Webhook | 配置 Meta 应用凭据和回调 URL | 是 |
| 企业微信回调 | Webhook Callback | 创建自建应用和加密回调 | 是 |
| LINE | Webhook Callback | 配置 Messaging API 频道 webhook | 是 |
| SimpleX | 本地 Daemon | 把平台 worker 指向 `simplex-chat` WebSocket daemon | 否 |
| ntfy | Topic Subscribe | 让平台 worker 订阅一个 topic | 否 |

## 扫码与配对流程

有些平台不能只靠静态 token 表单配置：

- 企业微信 AI Bot 设置显示二维码；扫码返回 Bot ID 和 Secret。
- 微信/iLink 登录显示二维码；扫码返回账户/会话数据。
- WhatsApp bridge 设置显示必须在手机 App 中扫描的配对二维码。
- Signal 链接以 `signal-cli link` URI 开始，应渲染为二维码。

ToolPlane 把这些建模为两阶段频道连接：

```text
create channel -> request QR -> user scans -> poll provider -> save credentials -> stopped -> running
```

对支持扫码的平台，UI 不要求用户粘贴二维码载荷。ToolPlane 主动调用平台设置端点，把
短期配对会话存进频道配置，渲染返回的二维码内容，并轮询平台等待扫码完成。提供方返回
凭据后，ToolPlane 将其加密存到频道上。

当前活跃的扫码提供方：

| 平台 | 二维码请求 | 轮询结果 | 保存的凭据 |
| --- | --- | --- | --- |
| 企业微信 | `work.weixin.qq.com/ai/qc/generate` | `work.weixin.qq.com/ai/qc/query_result` | `WECOM_BOT_ID`、`WECOM_SECRET` |
| 微信 | `ilink/bot/get_bot_qrcode` | `ilink/bot/get_qrcode_status` | `WEIXIN_ACCOUNT_ID`、`WEIXIN_TOKEN`、`WEIXIN_BASE_URL` |

WhatsApp、Signal、元宝等 bridge 平台使用相同的 UI 契约，但仍需要一个 ToolPlane 设置
runner 来启动原生 bridge、接收其二维码/链接事件并向频道回报完成。标记为
`requiredAt: "start"` 的凭据在频道首次创建时不需要；在托管 runner 启动前必须提供。

## 端点

每个 Agent 仍暴露一个通用内部端点：

```text
POST /api/v1/agents/:agentId/messages
```

配置好的频道使用按连接的端点：

```text
POST /api/v1/agent-channels/:connectionId/events
```

该端点在用户于 Agent UI 中创建频道连接时生成。它是原生平台处理与 ToolPlane Agent
runtime 之间的边界。例如：

- Telegram 设置从 `TELEGRAM_BOT_TOKEN` 开始；托管 runner 随后接收 Telegram 更新并调用
  ToolPlane。
- Slack 设置从 Socket Mode token 开始；Slack 事件经平台持有的 WebSocket 到达。
- 微信设置从扫码开始；原生传输长轮询 iLink。
- WhatsApp Cloud 确实需要公网 HTTPS 回调，因为 Meta 通过 webhook 投递消息。

频道交接端点要求生成的频道 token：

```text
Authorization: Bearer <toolplane-channel-token>
```

对无法发送自定义 Authorization 头的 webhook 产品，频道端点也接受 query token：

```text
POST /api/v1/agent-channels/:connectionId/events?token=<toolplane-channel-token>
```

通用 API token 供内部服务和自定义集成经 `/api/v1/agents/:agentId/messages` 使用，不
是常规的原生频道路径。

## 归一化交接格式

托管 runner 和回调处理器可以在 ToolPlane 有归一化器时向频道端点发送原生载荷，也可以
直接发送归一化格式：

```json
{
  "message": "hello",
  "source": {
    "platform": "slack",
    "chatType": "channel",
    "chatId": "C123",
    "userId": "U123",
    "threadId": "1720000000.000100",
    "messageId": "1720000000.000200"
  }
}
```

## 响应契约

托管 runner 和回调处理器按 `delivery` 字段分支。

```json
{
  "agentId": "agent-id",
  "conversationId": "conversation-id",
  "delivery": "message",
  "message": "Reply to send back to the platform.",
  "rawMessage": "Reply to send back to the platform.",
  "sessionKey": "msg:slack:channel:C123:1720000000.000100",
  "source": {
    "platform": "slack",
    "chatType": "channel",
    "chatId": "C123",
    "userId": "U123",
    "threadId": "1720000000.000100"
  }
}
```

如果 Agent 最终回复恰好是 `[SILENT]`、`SILENT`、`NO_REPLY` 或 `NO REPLY`，ToolPlane
返回：

```json
{
  "delivery": "silent",
  "message": "",
  "rawMessage": "NO_REPLY"
}
```

该助手轮次仍会持久化在会话记录中。

## 支持的平台 slug

- `api`
- `webhooks`
- `open_webui`
- `telegram`
- `discord`
- `slack`
- `google_chat`
- `whatsapp`
- `whatsapp_cloud`
- `signal`
- `sms`
- `email`
- `homeassistant`
- `mattermost`
- `matrix`
- `dingtalk`
- `feishu`
- `wecom`
- `wecom_callback`
- `weixin`
- `bluebubbles`
- `qqbot`
- `yuanbao`
- `teams`
- `teams_meetings`
- `msgraph_webhook`
- `line`
- `ntfy`
- `raft`
- `irc`
- `simplex`
- `photon`

连字符别名也被接受，如 `whatsapp-cloud`、`wecom-callback`、
`teams-meetings`、`msgraph-webhook`、`open-webui`。
