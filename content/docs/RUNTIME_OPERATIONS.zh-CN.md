# 运行时运维与架构升级


本指南面向单所有者 ToolPlane 部署的运维人员，说明运行时恢复、GitHub 插件来源、经审阅的 Pi 能力与只读历史存储；不引入 active-active 执行，也不构成生产迁移授权。

## 升级顺序

1. 备份 Postgres 和托管运行时卷，记录当前版本及恢复流程。数据库与数据卷的恢复是不同操作。
2. 停止旧应用，确认其子进程和外部复制、导入、删除操作已结束。不要让新旧实例同时操作同一运行域。
3. 审阅目标版本对应的仓库迁移，仅在明确核实的目标数据库通过现有部署 migrator 应用，然后生成匹配的 Prisma client 并构建应用。保留的消息、文件和审计/来源记录不是可随意清除的迁移数据。
4. 使用 `pnpm start` 或生产镜像启动一个应用进程，等待 `/api/v1/readiness` 返回 HTTP 200，再接收运行时流量。`/api/v1/health` 只表示存活，不证明恢复完成。
5. 受控切换前排空全部旧运行时活动任务。撤销退休的 Toolkit/插件客户端凭据，不再登记外部插件客户端或恢复旧执行。非删除范围内的历史消息和文件保留只读；历史转换产生重新授权的全新 Pi 草稿，不能把旧状态冒充可恢复会话。

新操作运行时不要只回退应用程序。先停止所有者，再采用验证过的数据库/卷恢复或向前修复方案。生产备份和凭据不能进入测试产物。

移除旧 managed/RPC 运行时的迁移 `20261026120000_remove_hermes_runtime` 会删除对应 Agent 及其级联历史、专用上传预留与会话字段；执行前须备份并在独立数据库验证。它不删除通用 WorkspaceAttachment、消息渠道配置、非删除范围内的历史、AgentEndpointRuntime 修订清单或公共分配外键。该删除不能只靠回退应用恢复；本说明不是生产或共享数据库迁移授权。

侧栏“系统更新”向所有已登录用户展示当前版本、目标 Release 版本、配置的 GitHub 仓库链接和可滚动阅读的更新日志（来自该 Release 的 Markdown 发布说明）。普通用户可打开面板阅读版本和 Changelog，但不显示检查更新、安装按钮或安装状态；只有平台管理员显示操作入口，安装接口也独立校验管理员身份。即使未启用在线更新或未配置可写运行目录，版本与发布说明仍可阅读；安装仍受原有运行目录、发布制品和运行时保护约束。发布信息不可用时保留当前版本与仓库入口，不伪造更新日志。

在线发布更新必须使用受管生产启动器。下载校验完成后，更新器先排空当前 runtime owner，**确认干净退出后才替换任何运行文件**，确保停机阶段的动态导入仍来自旧版本。缺少停机入口或排空失败时保留旧文件并报告失败；成功替换后发送 SIGTERM，由启动器完成退出，不直接调用 `process.exit()`。排空失败后的运行时保持阻断，须人工核对恢复，不能自动确认 dirty 标记。

更新完成必须同时满足目标版本、替换后的进程标识和 `runtimeReady=true`。本地更新状态接口在新进程处于 idle、运行时尚未就绪时返回 HTTP 503 和 `Retry-After: 2`，防止旧版界面把版本号变化误报为成功；下载、应用及失败状态仍正常返回，保留进度与错误信息。恢复阻塞不能靠页面刷新或删除所有权标记绕过。

Docker/Coolify 健康检查应使用 `/api/v1/readiness`，而不是 `/api/v1/health`，停机宽限须为 60 秒（手工重启使用 `docker restart --timeout 60`）。发布归档不会修改已有容器的健康检查和停止超时配置，应更新部署定义并在受控重部署时生效。原地更新后的容器不能直接按旧镜像重建，必须先保留当前运行版本。

Docker 构建与运行阶段共用 `python-runtime-base`，确保 Prisma 组装时检测到的 OpenSSL ABI 与启动环境一致。须保持这些系统库一致，否则镜像可能只包含 OpenSSL 1.1 引擎，而生产需要 OpenSSL 3，导致启动时临时联网下载。上线前应使用最终镜像，在禁止外网访问的隔离备份数据库上验证 `prisma migrate deploy`。

当前应用、SDK 沙箱与捕获平台使用 Node 26。受管启动器仍在 Next 前加载 `abort-signal.cjs`，对原生 `AbortSignal.any()` 的结果短暂添加再移除 abort 监听器，启动弱引用源信号跟踪。该兼容处理源于 Node 24.21 上曾观察到的嵌套组合信号保留与 `Set maximum size exceeded`，不表示已经证明 Node 26 存在相同缺陷。发布组装仍须将该文件与内嵌 `server.cjs` 放在同一目录；移除前须在目标 Node 版本运行 `pnpm vitest run tests/unit/abort-signal.test.ts` 并验证长时间运行行为。已经耗尽信号集合的进程须受控重启；只重启 MCP bridge 无法清空主进程的信号集合。

## 管理员传输调试设置

在**管理后台 → 系统设置 → HTTP 调试与 A2A 文件**配置，只有平台管理员可保存或恢复默认；操作记录进入设置审计。

- **允许 HTTP（调试）**默认关闭。开启后，本平台支持显式配置的 HTTP 传输，包括 A2A Card／RPC／文件链接、Sandbox OAuth、MCP、插件包获取与隔离捕获、发布下载和频道 HTTP／WS。不会在 HTTPS 失败后自动降级，不跳过工作区权限、凭据作用域、域名／Origin 白名单、DNS 固定、SSRF、PKCE 或制品完整性校验。
- **A2A 内联文件上限**默认 32 KiB，范围 1–10240 KiB；可设置为 512 KiB。文件数、单文件与任务总容量等其他边界仍有效。设置覆盖本平台的接收、校验、发送与远端响应解析，不会更改外部服务的限制。

HTTP 会明文传输令牌、凭据、文件和工具数据，仅用于可信隔离环境。保存后新请求读取当前策略；已有页面需刷新，已建立的外部连接不会因此变成加密连接。恢复默认重新禁止未经独立授权的 HTTP；既有 MCP 显式 HTTP 同意仍按原规则生效，管理员开关不会写入或扩张该持久授权。

浏览器页面响应会按当前策略允许 HTTP 图片／媒体／框架资源；调试开启时 HTTPS 响应清除本站 HSTS。浏览器自身的 mixed-content、secure-context、父域 HSTS／预加载限制仍有效，不能由应用开关绕过；浏览器侧 HTTP 调试应使用 HTTP 页面和适当的本地测试域名。

远端若固定只接收 32 KiB 内联文件或 HTTPS 文件链接，即使本平台开启 HTTP 并提高到 512 KiB，远端仍可拒绝。独立客户端不读取平台数据库；自带 HTTPS 限制的第三方客户端须自行配置，维护的沙箱管理 CLI 对显式 HTTP 地址打印明文风险警告。

## 统一私网主机白名单

**管理后台 → 系统设置 → 私网主机白名单**同时控制 Remote MCP 和 SSH 的私网目标，不再维护两个独立列表。支持精确 DNS 主机、`*.example.com` 子域通配和精确 RFC1918／ULA IP；最多 100 个不同条目、8,192 个字符，不接受 CIDR。保存、清空和恢复默认仅限平台管理员，并进入设置审计。

数据库设置 `network.privateHosts` 优先于环境变量 `TOOLPLANE_PRIVATE_HOSTS`；显式保存空列表禁止全部私网目标，恢复默认删除数据库覆盖，再使用环境变量或内置空列表。读取失败或持久值损坏时拒绝私网连接，不回退到宽松的环境设置。保存后作用于后续 SSH 检测／连接和 MCP 启动；已建立的连接不会因此自动断开。

升级时先停止旧 owner，再应用 `20261105000000_shared_private_hosts`，按单所有者流程构建、启动并检查 readiness。迁移将原 `mcp.remotePrivateHosts` 与 `sandboxes.sshPrivateHosts` 的条目取并集并去重，合并后同一条目同时适用于两种协议；已有新设置不被覆盖，旧列表全空时保留显式空覆盖，历史审计不删除。损坏或合并后超限的列表保持拒绝访问，需管理员修正。部署环境中的旧变量 `TOOLPLANE_REMOTE_MCP_PRIVATE_HOSTS` 须改名为 `TOOLPLANE_PRIVATE_HOSTS`，运行时代码不保留旧名称兼容。迁移后不得运行仍写入旧键的旧应用。

白名单不放开回环、链路本地、云元数据、未指定或组播地址，也不替代工作区权限、MCP HTTP 风险授权、SSH 凭据或固定主机密钥校验。


## 共享 MCP 凭据切换

共享 MCP Deployment 的环境值使用 `AUTH_SECRET` 加密，保存在绑定工作区的
`credentialEnvelope` 中；数据库 `env` 只保存空字符串，公开序列化与 Deployment
列表只提供环境变量名和空值/`configured` 掩码状态。API 响应或导出不得包含
明文或密文 envelope。实时运行访问必须先验证工作区归属，再显式解密凭据。
旧非空明文配置在显式迁移前禁止运行。恢复数据库时必须保留原
`AUTH_SECRET`；更改此密钥不等于轮换凭据。

先备份数据库、停止应用/runtime owner，并独立确认所有 MCP 子进程及容器已经
退出。脚本不会停止服务或核对外部进程。所选工作区的 Deployment 持久状态必须
全部为 `stopped`、`error` 或 `setup_required`，否则拒绝；陈旧的空闲状态不能
证明实际进程已退出。核对目标 `DATABASE_URL`、`AUTH_SECRET` 后，按工作区的
数据库 ID（不是 slug）逐个执行：

```bash
# 默认只读 dry-run，仅输出计数。
pnpm exec node --conditions=react-server --import tsx scripts/migrate-mcp-credentials.ts --workspace WORKSPACE_ID
# 审阅 dry-run 并确认停机后，显式写入。
pnpm exec node --conditions=react-server --import tsx scripts/migrate-mcp-credentials.ts --workspace WORKSPACE_ID --apply
```

每次执行使用一个 Serializable 事务，更新时比较原工作区、状态、时间戳和配置；
并发修改、无效配置或明文/密文混合配置会回滚整批。已迁移行仅校验、不重写，
重复执行幂等。不会输出凭据值、密文、哈希或数据库错误；须私下排查失败，
不要将配置粘贴到日志或支持产物中。全部必需工作区迁移后再启动一个 owner，
等待 readiness 成功。

通过已认证的 Deployment 环境设置轮换或撤销值，不要直接修改 envelope 元数据。
轮换/撤销先停止旧进程，再存储重新密封的值；停止失败时不得绕过。
新运行连接通过显式私有解析器取得当前工作区凭据，元数据不能作为凭据来源。
本脚本只转换共享 MCP Deployment 环境值，不转换目录 recipe 或 Agent 专属凭据引用。
隔离测试数据库的聚焦回归入口：
`pnpm vitest run tests/integration/mcp-environment-credentials.test.ts`。

Docker MCP 的环境值只通过运行时 stdin 引导传入，不使用 Docker 环境参数、
镜像/构建层或 secret 文件。引导读取一行私有数据后 exec 原镜像入口和命令，
后续 stdin 完整保留给 MCP JSON-RPC。需要环境投影（包括包缓存设置）的镜像
必须提供带内建 `read`、`printf`、`eval`、`export` 的 POSIX `/bin/sh`；
无 shell 镜像将拒绝启动。没有环境投影的 Docker recipe 保留原入口，不要求
引导。禁止通过添加 `--env`、`--env-file` 绕过该传输约束。
运行时诊断会同时脱敏已配置环境和仅容器可见环境投影中的值，不依赖键名是否
看起来与密钥有关。仅存在于容器环境投影中的值也不得出现在捕获的 stderr 或
运行时日志响应中。

## 单一运行时所有者

`runtime/owner.ts` 用**独立长期连接**持有 PostgreSQL session advisory lock，不使用连接池中的短事务锁。数据库和 `TOOLPLANE_RUNTIME_DOMAIN`（默认 `default`）确定所有权域，同域两个进程不能同时恢复或操作运行时。操作同一 Docker 资源的所有应用必须使用相同数据库和 domain；改 domain 不是绕过所有权冲突的安全办法。

所有者经历 acquiring → recovering → ready，再经过 draining → stopped。执行入口未就绪时返回 503 和 `Retry-After`；恢复所需的签名 runtime 回调仍独立校验凭据。所有权连接丢失会中止受管操作、停止新工作，并保留恢复阻断。已有的数据库准入锁和预算控制仍与进程所有权相互独立。

`SystemSetting` 中的 dirty 标记仅在确认干净退出后移除。崩溃、数据库断连或不确定的 Docker 操作之后，即使 advisory lock 已释放，下个进程也拒绝自动接管。应检查日志、停止所有旧 owner，并确认 Docker helper、复制与删除操作已结束；之后才将 `TOOLPLANE_RUNTIME_RECOVERY_ACK` 设为恢复错误中打印的准确 UUID，用于**一次重启**，恢复后移除该变量。这是对外部操作已核对的确认，不是密码、强制解锁开关或自动高可用。无效标记需要排查，不能随意猜 UUID。

生产启动器收到 SIGTERM/SIGINT 后停止接收 HTTP、停止维护任务/coordinator/broker，有界排空或中止已跟踪工作，最后释放独立连接锁。启动器外层退出上限为 50 秒，Compose 提供 60 秒。超时或不确定操作保留 dirty 标记。自定义进程管理器应给予同等宽限并调用受管停机流程。`pnpm dev` 不具备生产启动器的信号编排，异常停止后可能需要显式恢复。

## GitHub 插件中心

插件只有一种形态：**Pi package**。插件中心 `/app/{workspace}/plugins` 分为“发现”“已添加”“来源”；已添加页和入口显示“有更新”数量。独立 Skill/MCP 管理仍是工作区功能，不是插件发布渠道。独立资源市场、Agent/Assistant 模板市场、复合资源包、手工发布、npm/Git 即时导入、组装及外部客户端登记/安装器均已移除。公共站点只提供产品介绍，不再提供公共市场或 Agent 目录。

插件详情分为“介绍”“更新日志”“资源”“插件配置”。介绍优先展示所选不可变版本中的根目录 README；缺失时明确提示，不生成虚构说明、不读取浮动分支替代旧版本。支持 README、README.md、README.markdown、README.txt（文件名不区分大小写），内联展示上限为 256 KiB。Markdown 使用安全渲染器；GitHub 来源的相对文档与图片链接固定到捕获提交。资源页只列实际包含的资源；安装、版本和运行时权限保留在侧栏。工作区私有导入与官方来源在列表上明确区分。

“更新日志”按新到旧连续展示全部已批准版本，向下滚动即可阅读历史，不必逐个切换版本。右侧版本列表定位到对应日志，也可通过详情页 `?view=changelog&version=<releaseId>#release-<releaseId>` 直达。每个版本优先显示已保存的发布说明；没有时从经过 checksum 校验的版本快照读取根目录日志，依次选择 `CHANGELOG.md`、`CHANGELOG.markdown`、`CHANGELOG.txt`、`CHANGELOG`，再选择同类 `HISTORY` 文件，文件名不区分大小写。单个日志文件只内联展示不超过 256 KiB 的有效 UTF-8 文本，不读取依赖目录或跟随符号链接。

作者可使用 `## [1.2.3] - 2026-11-04` 或 `## v1.2.3` 等 ATX Markdown 标题，版本须与 `package.json` 的版本精确对应。平台提取该章节及其子标题内容，忽略代码块内的标题，不将 `Unreleased` 或其他版本误认为当前版本。未匹配到章节（包括 Setext 标题等其他格式）时展示所选快照的完整日志并明确标注；缺失、空白、超限或无效文件显示“未提供更新说明”，不以 README 代替。GitHub 源文件链接固定到捕获提交，不读取浮动分支或 GitHub Releases 的可变内容。

新 GitHub 同步和工作区私有插件导入／追加版本只把精确匹配的章节写入 `MarketRelease.releaseNotes`，完整日志仍随制品接受密钥扫描。已有版本只读派生展示，不回填数据库、不改变 checksum 或 Agent／会话引用。没有日志的历史版本不会因上游后来补写而获得虚构的更新说明。

### 官方来源与工作区来源

部署者通过以下环境变量配置平台全局官方来源；所有工作区只读可见并标记“官方”，不是每个工作区分别登记：

| 环境变量 | 默认值与用途 |
| --- | --- |
| `TOOLPLANE_OFFICIAL_PLUGIN_REPOSITORY` | `asharca/toolplane-plugins`；显式空字符串禁用官方来源 |
| `TOOLPLANE_OFFICIAL_PLUGIN_BRANCH` | `main` |
| `TOOLPLANE_OFFICIAL_PLUGIN_TOKEN` | 可选 GitHub 读取令牌；同步时从环境读取，不存入数据库 |
| `TOOLPLANE_RESOURCE_REGISTRY_WEBHOOK_SECRET` | 可选高熵 Webhook 主密钥；自动同步需配置，不得直接交给 GitHub 或用户 |

启动时创建或更新官方来源；从未同步或仓库/分支变化时排队同步。只有平台管理员能手动同步官方来源。官方仓库为 [`asharca/toolplane-plugins`](https://github.com/asharca/toolplane-plugins)。

工作区 owner/admin 可在“来源”登记自己的 GitHub `owner/repository` 和分支：公开仓库无需令牌，私有仓库使用有读取权限的 PAT，加密存储且不回显。工作区来源的插件只对本工作区可见，即使仓库本身公开也不会成为全局来源。成员可查看，来源增删、凭据修改、同步及插件添加/更新/移除均重新检查工作区权限。不使用 GitHub App，不支持 GitLab、npm registry 或任意 HTTPS 目录来源。

### 使用官方仓库与贡献插件

插件中心提供“创建自己的市场”和“向官方贡献插件”入口。官方仓库为普通 GitHub 仓库，不启用模板功能。用户通过 Fork 创建自己的仓库，再运行 `node scripts/create-plugin.mjs my-review` 创建只读 Pi review prompt、README 和索引项；运行 `node scripts/validate-registry.mjs` 后提交到自己的仓库，并在平台“来源”登记和同步。Fork 不授予官方身份，也不扩大工作区可见性。

向官方贡献时，在 Fork 的分支提交插件和索引项，再发起 Pull Request。维护者审核后合并；合并还需官方来源同步才能进入目录。贡献者不获得直接推送官方分支的权限。中文贡献规范见仓库的 `CONTRIBUTING.md`；CI 不执行插件代码。README 修改时也必须递增包版本。历史 OCR 内容没有声明许可证，仓库不替原作者授予许可。


### v3 仓库格式

多插件仓库在根目录提供 `registry.json`：

```json
{
  "schemaVersion": 3,
  "plugins": [
    { "id": "ocrplane-cli", "path": "plugins/ocrplane-cli" }
  ]
}
```

`id` 满足 `^[a-z0-9][a-z0-9-]{0,63}$`，ID 和相对路径都唯一。禁止越界路径、软链接或把索引作为跨仓库引用。每个目录包含 Pi `package.json`，版本直接取其 SemVer `version`，不在索引另填版本：

```json
{
  "name": "@toolplane/ocrplane-cli",
  "version": "2.0.0",
  "description": "OCR and document understanding",
  "keywords": ["pi-package", "ocr"],
  "pi": { "skills": ["./skills"] }
}
```

该示例的技能位于 `plugins/ocrplane-cli/skills/ocrplane-cli/SKILL.md`。Pi 包也可包含 prompts、extensions 和 themes；需要构建的扩展应提交可加载产物。可选 `toolplane.plugin.json` 提供 `{ "name": "OcrPlane CLI", "summary": "文档 OCR 技能", "tags": ["ocr"] }`，另可提供 `iconUrl`；缺省使用 package.json 的 `displayName`、`description`、`keywords`。不再使用 `resource.json` 或包内独立成员的发布模型。

官方仓库要求每个插件根目录提供非空 README.md，说明用法、运行时与外部依赖、所需工具和网络、配置键（不得放密钥值）、限制及许可。该作者侧要求不追溯修改既有发布版本；本机导入包也可能本来没有 README。GitHub 目录目前捕获 Pi 包，OMP 私有导入不因此自动转换为可公开分发的 Pi 包。

单插件仓库可以不提供 `registry.json`，直接在根目录提供 Pi `package.json`；插件路径为空，ID 从包名 slug 化派生。同一 ID/版本不能对应不同 digest；任何内容修改都应增加版本。v2 索引明确报错 `registry.json v2 is no longer supported; migrate to v3`，不会自动兼容解析。

### 同步与更新提示

登记来源会初次同步，也可点击“立即同步”。后台只处理已排队任务，不轮询上游、不发送更新通知。同步把分支解析为固定 commit，从该 commit 捕获 Pi 制品，执行路径/内容校验与 secret scan 后自动批准，不走发布前人工审核队列。同版本不同内容拒绝索引，失败保留上一成功目录；仓库不可达不等于插件已移除。同步不在应用宿主机执行仓库脚本，不安装 CLI、不注入凭据，也不授予 Agent 执行权限。

自动同步使用 GitHub JSON push Webhook，端点保持 `/api/v1/resource-registries/{registryId}/webhook`。取得该来源的 Webhook 配置后，将返回的派生 Secret 填入 GitHub，**不要填写服务端主密钥**。只有匹配登记仓库/分支且通过签名校验的 push 才入队；delivery ID 去重，HTTP 202 仅表示已排队。没有 Webhook 仍可手动同步，不接受未签名请求降级。轮换主密钥后需重新配置各来源 Webhook。

同步发现新的已批准版本后，插件显示“有更新”。工作区 owner/admin 明确选择目标版本并审阅需要的 MCP 绑定后更新工作区安装；成员不能替工作区升级。添加只建立工作区安装，不执行插件。索引删除 ID 后条目标记 `removed`，退出发现，但已有安装继续使用固定制品。

### Agent 自动跟随与审核

Agent 设置从**工作区已添加的插件**选择，选择时绑定工作区当前版本。工作区管理员更新插件后，已选择该插件的 Agent 自动跟随：成功时发布新的不可变 Agent 修订，新会话使用新修订，既有会话、Conversation、Work 和 A2A 固定快照不变。

当新版本增加 MCP 需求/工具，或代码指纹发生变化时，自动跟随暂停为“需审核”，保留目标版本，owner/admin 审阅差异并批准后才应用。指纹对 MCP key/工具排序；代码 digest 包括声明的 skills/prompts/themes 路径之外的文件及去掉 `version` 字段后的根 package.json，因此扩展、依赖或脚本变化需审核，单纯版本号变化不触发代码审核，纯 MCP 删除不扩权。

状态为“已同步”“待同步”“需审核”“失败”。Agent 正忙时进入待同步，由后台重试；请求用户失去 owner/admin 权限后不得继续代其升级。失败显示错误，不能假称新修订已生效。审核执行代码意味着接受其在 Agent 沙箱内的 Node、文件和网络副作用，工具审批不是任意代码隔离边界。包的 MCP 工具仍须满足固定修订授权和当前连接允许列表，快照不会恢复已撤销权限。

移除工作区插件会解绑 Agent，并发布仅收窄该插件能力的新默认修订，不顺带应用其他草稿改动；保留既有会话引用、制品及共享 MCP。平台管理员可**下架条目**（`withdrawn`）或**撤销危险版本**（`revoked`）；同步不能覆盖安全下架。普通移除/下架不等于安全撤销，危险版本的实时撤销约束仍应用于固定引用。

### 部署与冻结制品

备份后应用 `20261030000000_plugin_center`，生成 Prisma 客户端，按本文单所有者流程重启，并将来源仓库改为 v3 后同步。旧复合包中的 Pi 安装迁移为独立插件；非 Pi 市场和外部客户端分发不再提供兼容入口。历史会话保留准确制品，不伪造来源或重新捕获覆盖 checksum。

管理员显式构建可信捕获镜像；同步不会隐式构建：

```bash
docker build --target pi-package-capture -t toolplane-pi-package-capture:0.87.1 .
```

Pi 捕获要求 runtime owner 已就绪，使用隔离非 root 容器；生产依赖随包冻结，不执行扩展 factory、生命周期脚本、Git hooks 或 pnpmfile。内部归档仅是传输格式，不是 ZIP 上传/发布入口。更新捕获脚本后需重建镜像。SDK 固定 0.87.1，要求 Linux、Node 26，原生快照须匹配执行架构；执行 turn 时不安装插件依赖。

Conversation、A2A context 和 Work 固定不可变修订及包制品，更新不重写已有引用。无法证明准确引用时返回 `AGENT_REVISION_UNRESOLVED`，保留历史只读；持久会话丢失返回 `PI_SDK_SESSION_MISSING`，需新建会话，不能重放历史伪造恢复。文件/链接篡改以 `PI_PACKAGE_CHECKSUM_MISMATCH` 拒绝执行，扩展加载失败为 `PI_EXTENSION_LOAD_FAILED`。命令保留大小写及 `:1` 冲突后缀；Web 支持原生 RPC UI 对话及文本投影，不转译任意 TUI 自定义组件。


## 不可变 Pi SDK 修订

所有可执行 Agent 均使用 **Pi SDK 0.87.1**。Chat、消息渠道、control、Work 和本地
A2A 统一走固定修订的原生 SDK 入口，不回退直接 Pi CLI、宿主 Agent 循环
或旧 Harness。其他 Pi 版本会被拒绝，不会安装到活跃 Agent 或代替所选版本。
原生扩展预检需要固定隔离镜像 `toolplane-pi-package-capture:0.87.1`。
预检容器只以只读方式挂载暂存的公开辅助脚本，使用独立可写 `/tmp`，不会向只读根文件系统
复制脚本。原生加载器的命名冲突保留类型化 `PI_CAPABILITY_CONFLICT` 分类。
`PI_EXTENSION_LOAD_FAILED` 保留有界的分阶段诊断 cause；先检查实际失败阶段，不要直接归因
于扩展工厂。原生 npm 快照必须匹配执行平台与架构，不能改标签或移植字节冒充兼容。
Control MCP 只创建原生 `pi-sdk` 草稿；创建不等于执行授权，须明确配置、授权并发布不可变修订。

运行时变更流程是 **保存草稿 → Prepare → 审阅 → Apply**：

1. 保存配置只修改草稿，不改变已发布默认修订或任何现有会话。
2. Prepare 在发布事务外完成依赖捕获/构建及原生能力预检。准备结果冻结 digest 镜像、
   Pi 版本、网络/资源限制、可选的校验和验证初始快照、凭据引用、模型与指令、Skill/
   包内容及 MCP/A2A 授权；凭据明文不进入配置。
3. 审阅这份准确的配置及能力/权限变化，Apply 时同时提交预期当前修订 ID。发布重新
   验证权限、产物、源摘要和原生预检，再原子比较并切换默认修订。预期修订已过期或
   校验失败均保持旧默认修订不变，须重新 Prepare 和审阅。
4. 回滚通过 `rollbackAgentRevision(...)` 与预期当前修订 ID，以同一 Agent 的历史
   修订发布一个**新版本**。它会重新校验保留产物和当前权限，不改写历史、不恢复
   已撤销授权、不修改已有会话。保留的历史包固定引用可在卸载/撤回发布后继续使用，
   但危险 release、MCP 或凭据撤销仍会阻止执行。

卸载通过 CAS 产生仅移除该包的新默认修订，准确保留其余已应用字段，不要求无关的已撤销权限
重新变得可发布。该纯收窄操作不授予或执行任何能力、不恢复撤销权限；历史会话仍执行实时权限交集。

不要编辑运行时版本文件、在活跃沙箱安装上游新版本，或通过更新可变模板迁移会话。
新 Conversation、Work 和本地 A2A 会话持久化所选 `agentRevisionId`；已有会话继续
使用自己的修订，并与实时 provider、凭据、包、MCP 和方向性协作权限取交集。固定引用
缺失、不匹配或历史状态未解决时拒绝执行，不能以 Agent 当前配置猜测恢复。

### 单项 Skill 的审阅和应用；MCP 直接绑定

单项 Skill Enable 是审阅并发布，不是仅绑定草稿。先选择已有发布修订的原生 Agent，再通过
`previewAgentResourceAction` 审阅完整 Skill 制品。未发布目标以 `revisionPreparationRequired`
拒绝。预览返回签名 `reviewReceipt`、`sourceChecksum` 及 15 分钟 `expiresAt`；
`enableAgentResourceAction` 校验回执与 `expectedRevisionId` 后只将该项变更加入当前已应用配置。

MCP 不再走审阅回执：在 Agent 设置或 Assistant 编辑器中添加即可，绑定始终跟随部署工具目录。
工具访问权限仅在 MCP 部署的 Tools 页选择，并统一作用于所有已连接的 Agent 与 Assistant。目录、暴露策略或连接配方变化时，系统为已应用该 MCP 的
Agent/Assistant 自动发布只刷新 MCP 授权的新修订；已有会话保持原修订，用户可在会话内确认后原地
更新到当前修订。详见[远程 MCP](./REMOTE_MCP_HTTP.zh-CN.md#协议校验与执行归属)。

## 原生会话与历史运行时边界

平台逐次工具审批及 readiness 握手已移除，确认由已授权的原生 Pi 扩展发起。任务使用
`/api/v1/agent-runtime/tasks/<task-id>/ui`，专属 Work 使用
`/api/v1/agent-runtime/sessions/ui`。通道保持仅 HTTP(S)、禁止内嵌凭据/query/fragment、
禁止重定向、有界响应与 runtime token 校验；每次读写重新验证当前授权与执行租约。
原生 UI 不能扩大修订、MCP、沙箱或协作授权。

切换前排空旧任务并备份。应用 `20261102000000_pi_native_ui` 和
`20261102010000_native_ui_work_cutover`，生成 Prisma 客户端并按单所有者流程重启。
旧 `A2AToolApproval`、`WorkApproval` 表移入 `toolplane_archive` schema 保留证据，
不作为新审批入口；旧 `waiting_approval` Work 标为失败，不自动执行或重放。
数据库仅保存有界 Web 投影，原生会话文件仍是 todo 和上下文的权威来源。

每个 Agent 按固定环境懒创建一个持久沙箱，会话在 `/workspace/conversations/` 下拥有独立目录；不同 Agent 不共享可写卷。同一 Agent 内目录分离不是原生 shell 的安全隔离。Pi／OMP 固定运行时安装按 Agent 复用，原生状态在会话目录的 `.toolplane/runtimes/<运行时>/agents/<agent-id>/` 下。数据库管理会话身份、修订、包固定引用、任务回执与授权；共享 sandboxId 不再唯一标识会话或插件快照。保留 context 必须重新打开原会话；状态丢失须排查或恢复卷，不伪造历史。

共享沙箱切换须备份后应用 `20261103000000_agent_shared_sandbox`、`20261103010000_shared_sandbox_conversations`、`20261103020000_shared_sandbox_package_sets`，生成客户端并重启。旧卷在首次执行时校验后完整迁入会话目录，再原子移动 Conversation／Context／Work／PiSessionPackageSet 映射；原卷只读保留至 Agent 删除。原生 JSONL 只重定位 session 头与宿主路径，保留 OMP 标题前导记录及消息正文。不得把旧授权令牌复制成新执行凭据。

同会话串行、原生/session-MCP 租约及原有 Agent/平台并发限制继续生效。停止和取消
停止绑定进程及会话 MCP sidecar，不删除工作卷。本文其他章节的通用 owner、dirty-marker
和恢复规则仍适用。工具副作用或远端回执不确定时保持未知，不得通过重放制造完成结果，
也不承诺远端 exactly-once。
会话或沙箱忙碌时，尚未领取的委派任务保持排队，不执行或重放；只有正常租约重新可用后才继续准入。
不能因共享 deployment 停止就移除已授权的固定 MCP recipe；会话 broker 校验固定镜像／recipe
与实时授权后懒启动隔离 sidecar，不借用共享 deployment 进程。

上下文默认启用 Pi 原生自动压缩。在自己拥有且空闲的 Pi SDK 会话中发送 `/compact` 或 `/compact <自定义指令>`，
将对同一保留会话执行原生 `session.compact()`。须等待原生命令结果持久化；绑定忙碌时
拒绝另开 writer，失败不回退宿主摘要或 CLI 压缩。压缩须单独验证，下述通信 smoke
不覆盖它。
已认证的会话命令请求生成原生回执 ID；外部 channel transport 送入的命令必须提供稳定消息 ID 去重。

协作使用独立入站/出站权限与明确且有界的目标授权；选择目标不会自动开启任一方向。
工作区/账户范围、实时授权、循环/深度限制、任务租约和审批策略仍然生效。旧
`set-local` / `a2aInternalEnabled` 控制已删除。个人 Bearer 仅用于操作者控制的服务，
不能放入提示词、浏览器代码或交给第三方 Agent。
每条边都按包含远端叶子的最终链深度校验固定／实时策略交集；子 Agent 对远端的较宽策略不能
扩大祖先批准的深度。续接纳入子任务结果前也须校验当前子任务权限；撤销不能让父任务无限等待
已失去授权的子任务。

已退役运行时和未解决固定修订的历史会话只读；当前 Pi SDK 与 OMP 不属于已退役运行时。已删除的专用公开执行、runtime MCP/dashboard、上传、模型和 profile 路由不映射到新执行器。保留非删除范围内的历史消息、response 和绑定文件读取，以及真实已绑定操作的取消/排空。旧 `pi-harness` 任务标记仅用于绑定清理，不接受新执行或重放。转换产生须重新授权的全新 Pi 草稿，不恢复旧运行时状态。
公共 API 的认证、凭据、限额、历史、取消与重放数据契约保留，但不恢复执行。所有运行时的 `publicEndpoint=false`；A2A 服务启用在创建客户端/密钥前返回 `runtime_unsupported`（HTTP 409），旧公开发布 action 已删除。公开 A2A 的新消息和续写在持久化前拒绝（内部 HTTP 410，传输层可能序列化为协议错误）；Responses/OpenAI HTTP 执行入口保持 HTTP 410，不引入兼容适配器或创建新 Run/分配。关闭服务和撤销现有密钥仍可操作。
活跃会话终端流每 15 秒重新校验相同的当前认证身份、工作区成员资格、固定修订、沙箱映射
与 bridge；凭据、身份或执行权限撤销会关闭流，已打开连接不代表永久授权。
复用真正运行中的会话也会重验修订、卷和凭据，但不会重启 bridge，也无需关闭活跃终端；
文件或终端访问期间仍禁止会破坏会话的生命周期操作。

### 原生 SDK 验证

使用已批准的隔离 PostgreSQL/Docker 环境及固定捕获镜像，串行运行当前原生宿主、
能力、租约及通信测试：

```sh
pnpm test --no-file-parallelism tests/integration/pi-sdk-host.test.ts tests/integration/pi-sdk-capabilities.test.ts tests/integration/pi-sdk-native-leases.test.ts tests/integration/pi-agent-communication.test.ts
```

不能同时运行另一个共用该数据库的测试进程，也不能用 PGlite 证明独立会话锁生效。
已删除的 Harness host/recovery/binding 测试和 `pi-harness-recovery-check.mjs`
不再是发布检查。单元/解析器结果不能证明真实 provider、Docker 或跨账户验收通过。

### 付费模型通信 smoke

先阅读 `node scripts/pi-agent-communication-smoke.mjs --help`，再提供全部六个必填
环境变量：

| 变量 | 必需范围 |
|---|---|
| `TOOLPLANE_SMOKE_BASE_URL` | `localhost`、`127.0.0.1` 或 `[::1]` 上的隔离本地应用 origin；HTTPS 或回环 HTTP，不含凭据/路径/query/fragment |
| `TOOLPLANE_SMOKE_WORKSPACE_SLUG` | 已授权的可丢弃测试工作区 |
| `TOOLPLANE_SMOKE_AGENT_A_ID` | 已存在且已发布的 `pi-smoke-disposable-*` Pi Agent |
| `TOOLPLANE_SMOKE_AGENT_B_ID` | 另一个已存在且已发布的 `pi-smoke-disposable-*` Pi Agent |
| `TOOLPLANE_SMOKE_PERSONAL_TOKEN` | 获准访问这两个本地 A2A 端点的操作者 token，仅放环境变量 |
| `TOOLPLANE_SMOKE_DATABASE_URL` | 明确指定的本地隔离 PostgreSQL，库名包含 `test`、`acceptance` 或 `disposable` |

两个 Agent 须预先具备活跃的 Pi SDK 0.87.1 已发布修订、固定 digest 环境镜像、可用
真实模型、入站授权和原生 `bash` 权限。A 须同时具备已发布及实时出站权限，并有
明确、有界、仅文本的 A → B 授权。应用/runtime owner 和 Docker 须 ready，不能在
运行中修改配置或授权强行制造通过结果。

获准使用真实 provider 后运行 `node scripts/pi-agent-communication-smoke.mjs`。
显式指定的检查数据库连接强制只读，**不**通过该连接配置 Agent 或修改运行时账本；
已认证应用仍会创建任务，委派原生工具会写入唯一命名的 smoke 文件。带 token 的
请求只发送到所选两个本地 A2A 端点并拒绝重定向，不发到 console BFF 或第三方。

smoke 验证同一消息的幂等准入、一个真实完成的子任务、原生工具结算与文件内容、
彼此隔离且绑定修订的 context 沙箱，再在同一保留 context/session 中创建新任务，
且不再次委派。它只读检查账本绑定的容器与原生会话，并验证已发布默认修订未变。
它不安装依赖、不修改运行时配置、不杀进程、不进行崩溃/重启重放探测，也不要求
交互式杀进程/重启或审批确认。缺前提、任务要求补充输入、超时和未知结果均失败，
不跳过或伪造通过。失败清理仅取消本次提交且仍活跃的回执，无法确认时明确报告；
产物保留供检查。

这是付费模型验收，不是前提检查或崩溃恢复证明。真实 HTTPS 远端、其他账号授权和
`/compact` 须单独验证；`a2a-e2e-preflight.mjs` 仅报告前提。禁止指向生产或普通
共享开发运行时，也不能仅为运行 smoke 修改 owner/recovery ACK、迁移共享库或重启服务。

## 通用附件与历史存储

WorkspaceAttachment、Pi 会话文件和 Work 附件继续使用现有鉴权、配额及限定范围的文件生命周期，不因删除专用上传预留而失效。非删除范围内的历史绑定文件保持只读；查看历史不能启动旧运行时。归档导入只向停止状态的存储复制文件。物理销毁由显式授权的删除生命周期负责，普通停止保留卷。Connector 文件仍位于用户机器。继续监控物理磁盘和文件系统限制；只读保留不等于自动回收。

通用工作区附件 `POST /api/v1/workspaces/{slug}/attachments` 继续按现有权限接受写入，不因删除专用运行时上传而统一返回 403。历史沙箱通过 `Sandbox.config.readOnly` 与 `Deployment.installCfg.readOnly` 标记只读，迁移保留其映射和卷；这些只读资源禁止变更、附件写入、MCP 授权/导出、OAuth 与自动协调恢复。保留历史读取不代表可以重新授予执行能力或恢复旧运行时。

## 安装与诊断变化

排空后的 dry-run/apply 转换必须审阅复制的配置与授权；新 Pi 草稿须执行 Prepare、审阅及 Apply，不能恢复旧会话。旧 Toolkit bootstrap、同步、可执行安装链接和旧 scoped Token 不再接受。新客户端使用插件中心经审阅的登记；保护一次性配置，泄露后明确撤销登记 Token。

Agent 内容采集见[日志与审计](./OBSERVABILITY.zh-CN.md)。普通诊断不启用内容采集；显式开启后仍有大小限制、审计，最多保留 24 小时。公共 Endpoint 禁止策略不可覆盖。

## 验证边界

`tests/unit/runtime-owner.test.ts` 验证状态机和租约故障路径；`tests/integration/runtime-owner-lease.test.ts` 需要真实独立 PostgreSQL 会话，验证锁争用和连接丢失。上述原生 SDK 测试分别覆盖宿主/能力/租约边界。`TOOLPLANE_TEST_PGLITE=1` 仅供隔离嵌入式数据库冒烟测试，跳过其不支持的多会话场景，不能在 CI 或生产设置。Docker 生命周期及真实客户端验收需要相应运行环境，不能用解析器或 mock 测试通过替代。
