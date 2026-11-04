# Agent 沙箱


Agent 沙箱为 Agent 提供一个行为类似小型操作环境的工作区。在本项目中，沙箱以 MCP tools
的形式暴露给 Agent，并以 PTY 终端流的形式暴露给浏览器控制台。应用不会把任意的服务器
宿主机目录挂载为沙箱。

沙箱分为两类：

- **本体沙箱**：创建智能体时自动生成的 Docker 模板；执行环境按智能体复用，多个会话各用独立目录。
  本体沙箱固定属于该智能体，不能在设置中替换，也不能挂到其他智能体。
- **外挂沙箱**：工作区中独立创建的 Docker 沙箱、用户 Connector 或用户自己添加的 SSH
  服务器。一个智能体最多挂载 16 个，同一外挂沙箱可被多个智能体共用；每次挂载单独选择
  访问级别。详见[外挂沙箱](#外挂沙箱)。

## 运行时形态

```txt
Agent
|-- MCP deployments
|-- Skills
|-- Toolkits
`-- Sandboxes
    `-- Sandbox deployment
        `-- scripts/sandbox-mcp-server.mjs
            |-- sandbox_info
            |-- shell_exec
            |-- list_dir
            |-- read_file
            |-- write_file
            `-- terminal session stream
```

## 模式

### Docker Linux

Docker 模式启动一个持久容器和卷：

```txt
Sandbox row
`-- Deployment source=sandbox
    `-- sandbox-mcp-server
        `-- docker container
            `-- /workspace volume
```

默认镜像：

```txt
mcr.microsoft.com/devcontainers/javascript-node:26-bookworm
```

容器非特权运行，移除 Linux capabilities，带 pids/cpu/memory 限制，可使用专用的
`mcp-sandbox` 网络或 `none`。

#### 工作区数据生命周期

以下详细生命周期适用于 Docker Linux 沙箱。每个 Docker 沙箱拥有一个挂载在 `/workspace`
的 named volume：

- 创建沙箱会创建其专属工作区卷。
- 克隆会创建新沙箱，并把源沙箱当前的工作区卷复制到克隆的新卷中。克隆继承源镜像、网络
  和沙箱配置，但不继承源沙箱的快照记录。
- 创建快照会把当前工作区卷复制到一个独立的 named volume，并记录在源沙箱上。
- 恢复就绪快照会替换当前工作区卷的内容。恢复前数据的临时副本用于恢复复制失败时的自动
  回滚，随后删除。如果恢复和自动回滚都失败，ToolPlane 会让沙箱保持停止，并把该副本保留
  为就绪的恢复快照，而不是从部分恢复的数据启动。
- 删除快照先移除其 named volume，再删除数据库记录。Docker 清理失败会被报告，记录保留
  可重试。

克隆、创建快照和恢复会先静默受影响的沙箱：受管的 MCP 进程被终止、Docker 容器被停止后
才复制任何卷。操作完成后（包括回滚路径），原本运行的沙箱会重新启动；原本停止的保持
停止。正在 provisioning 的沙箱必须先完成 provisioning 才能开始这些操作。克隆复制成功
后，新克隆作为独立沙箱启动。删除快照只移除独立的快照卷，不会暂停沙箱。

卷复制在带命名和标签的辅助容器中进行。克隆在辅助容器退出且清理被确认前保持不可运行的
`copying` 状态；服务器启动时会移除残留辅助容器，并把中断的克隆改为 `copy_failed`，此时
只能删除。恢复的恢复记录在备份复制开始前创建，并在活动卷被替换前标记为就绪。随后部署
保持 `restoring`，直到活动卷确认为完好。如果辅助容器清理暂时无法确认，沙箱保持
`restore_cleanup_required`；清理后，中断的恢复变为 `restore_failed`，此时只能恢复就绪
的恢复快照或删除。临时恢复记录在其卷被移除前先进入 `deleting`，避免崩溃留下指向已丢失
卷的可恢复记录。

生命周期操作按沙箱串行化。工作区删除先关闭进程内的工作区闸门并排空进行中的操作，再取
得用于严格外部清理的清单。如 README 部署要求所述，ToolPlane 必须以单个常驻 Node 进程
运行；多个控制面副本无法安全共享同一个本地 Docker runtime。

删除 Docker 沙箱会停止其进程，严格移除每一个快照卷，然后移除其容器和主工作区卷，最后
删除数据库记录。工作区删除遵循同样的「先快照、后运行时」严格清理顺序。外部清理开始前，
部署进入不可运行的 `deleting` 状态。如果 Docker 或数据库清理失败，该状态被保留用于幂
等重试，而不是暴露一个空的重建工作区卷。

只有挂载在 `/workspace` 的 named volume 会被复制或快照。容器可写层、其他挂载中的数据
和外部服务都不包含。例如，写到 `/workspace` 之外的文件、只装进运行中容器可写层的包，
不会被复制到克隆，也不会被快照恢复捕获或回滚。

用户 Connector 沙箱不支持克隆或快照操作。Connector 数据留在用户机器上，ToolPlane 不复
制也不删除它。

#### 智能体共享沙箱与会话目录

Pi SDK 和 OMP 按智能体共享一个持久 Docker 执行环境，固定版本运行时只安装一次。每个会话在 `/workspace/conversations/` 下使用自己的目录、HOME、插件、技能和原生历史；无控制台会话的本地 A2A context 也有独立目录。文件面板和终端以当前会话目录为根，终端流每 15 秒重新校验凭据、成员资格和映射。

这是同一智能体内的目录分离，不是进程／容器级隔离；原生 shell 在该智能体授权的共享容器内执行。不同智能体仍有独立容器和可写卷，不能用另一智能体或会话的令牌访问平台文件入口。打开尚未执行的会话不会展示或创建模板工作区。会话终端保持打开不阻止已运行沙箱中的后续 turn；真正的启动和破坏性生命周期操作仍要求独占访问。

终端 PTY 的生命周期跟随会话和终端面板，不跟随后台历史／状态刷新、翻译回调或主题变化。
手动重连、关闭终端面板、切换会话或运行状态变化时会释放旧终端；关闭后才返回的创建请求
会立即回收其 PTY，不附着到后续终端。后台刷新须保留当前 shell、工作目录和未提交命令。

首次接纳／启动失败留下的模型标签、失败状态和耗时记录不代表原生会话已建立；用户明确
发送下一条请求时，可以首次创建原生会话，不会自动重放旧请求。已有正文、推理、工具活动
或已完成执行的会话仍要求恢复原生历史；历史缺失时拒绝继续，不能静默创建空会话替代。

管理员在**管理后台 → 系统设置 → 智能体会话并发**配置每个智能体的同时执行数
（1–32，默认 1）及平台总数（1–256，默认 16，不能小于单个智能体上限）。限额统计
正在执行的 turn，而非保存的会话数量。当前共享沙箱租约让同一智能体的会话串行，不同智能体可并行。普通请求
等待空位时可以取消；原生根任务保留排队状态，嵌套委派任务遇满额立即失败，避免父子
任务互等。调低限额不打断正在执行的任务。公共端点保留独立限额，但当前不接受新发布或执行。
持久本地/远端任务另有工作区准入边界：平台执行上限加 16 个排队名额，原有存储配额仍生效。

旧独立会话卷在首次使用时停止原容器、校验卷摘要并完整复制到共享卷内的会话目录；复制成功后才原子切换 Conversation、Work、Context 和插件快照映射。原卷作为只读迁移归档保留至智能体删除，失败不创建空历史替代原数据。原生 Pi／OMP 路由元数据重定位，消息正文不改写。

空闲 15 分钟后，运行时所有者停止共享容器但保留卷。有执行、待处理任务、文件／终端流或活跃 PTY 时不停止。下次执行启动同一个沙箱。删除单个会话只停止其宿主／MCP 并清理该会话目录，不删除共享容器或其他会话；失败保留删除意图供重试。删除整个智能体才移除共享运行时和迁移归档。共享环境不兼容的会话升级被拒绝，不隐式替换其他会话使用的环境。

部署前备份数据库与卷，应用 `20261103000000_agent_shared_sandbox`、`20261103010000_shared_sandbox_conversations` 和 `20261103020000_shared_sandbox_package_sets`，重新生成 Prisma 客户端并按单运行时所有者流程重启。

### 用户 Connector

Connector 模式让用户暴露自己机器上的一个目录，无需开 SSH、配置密钥，也无需让平台主动
连接任意用户主机。Linux、macOS、Windows PowerShell 和 Windows 命令提示符都使用同一行
命令：

```text
npx -y --no-audit --package "http://localhost:3002/api/v1/connectors/package.tgz?v=0.1.13" connector connect --server "http://localhost:3002" --token "mcpcon_..." --root "~/toolplane-sandbox" --screen-vnc "auto"
```

Connector 要求 Node.js 20+、能访问 ToolPlane 的 HTTP 和 WebSocket 端点、能访问 npm
registry。托管的 tarball 包含 CLI 包元数据；`npx` 会从配置的 npm registry 下载其 `ws`
和 `node-pty` 依赖。Windows 支持面向 Windows 10 1809 或更新版本及 Windows 11 的
x64/arm64，`node-pty` 在其上使用 ConPTY。如果 PowerShell 策略阻止 `npx.ps1`，可在命令
提示符中原样运行该命令。配置好的本地根目录由 bootstrap 返回；`--root <path>` 仍是面向
开发的可选手动覆盖，并会作为控制台显示的实际根目录回报。

屏幕支持基于能力探测。桌面 connector 仅在带 `--screen-vnc auto` 时探测
`127.0.0.1:5900`；显式 `--screen-vnc 127.0.0.1:<port>` 可选择另一个本地 VNC 服务。找到
后，沙箱页会增加由 noVNC 支撑的 Screen 标签页。它以只读打开，由用户显式启用控制。平台
创建一次性、60 秒有效的 viewer ticket 并转发 RFB 字节流；平台无法选择 connector 的 VNC
目标。macOS 上使用 **VNC viewers may control screen with password** 下配置的密码，而不
是 Mac 账户密码。

Android 通过一台旁边装有 `adb` 的电脑使用同一个 connector：

```text
npx -y --no-audit --package "http://localhost:3002/api/v1/connectors/package.tgz?v=0.1.13" connector connect --server "http://localhost:3002" --token "mcpcon_..." --root "/sdcard/ToolPlane" --android "auto"
```

手机可使用 USB 调试或 Android 11+ 无线调试。`auto` 要求恰好一台已授权设备，否则传入
其受限的 ADB 序列号。Shell、PTY 和文件操作通过 ADB 在 Android shell 用户下执行。屏幕显
示使用 `adb exec-out screencap -p`，为只读。

沙箱页在创建 connector 沙箱或用户点击 **Generate command** 时生成 `mcpcon_...` token。
该命令启动本地 connector agent。agent 调用平台 bootstrap 端点，发现 WebSocket broker，
然后保持一条已认证的 WebSocket 会话。

```txt
User machine
`-- connector package tarball from /api/v1/connectors/package.tgz
    |-- native shell (PowerShell on Windows, POSIX shell on macOS/Linux)
    |-- local filesystem root
    |-- structured process execution
    |-- local PTY (ConPTY on Windows)
    |-- optional loopback VNC source
    `-- optional Android ADB device
        |
        | WebSocket
        v
Platform connector broker
`-- sandbox-mcp-server
    |-- shell_exec
    |-- process_exec
    |-- list_dir
    |-- read_file
    |-- write_file
    |-- terminal stream
    `-- authenticated screen relay
```

关键性质：

- 平台从不主动打开到用户机器的连接。
- connector token 通过 HTTP 和 WebSocket 的 `Authorization: Bearer` 头发送，绝不放进 URL。
- 文件操作被客户端约束在 bootstrap 配置的根目录之下。
- 交互式终端是 `node-pty` 在用户机器上创建的真实 PTY，因此 shell 补全和正常终端行为得
  以保留。
- connector 在 v2 握手中上报其平台、架构、shell 家族、Node 版本和能力。`sandbox_info`
  暴露这些值，Agent 据此在 Windows 上使用 PowerShell 语法、在其他平台使用 POSIX 语法。
- `shell_exec` 和 PTY 有意以启动 connector 的本地用户权限运行。它们不是 OS 安全边界，
  能访问超出配置文件工具根目录的内容。不可信负载请使用专用的低权限账户。

Next.js 服务器在 `instrumentation.ts` 中启动 connector broker：

```txt
NEXT server process
|-- connector WebSocket broker
|   |-- public WS /connect (Authorization: Bearer mcpcon_...)
|   |-- public WS /screen/source/:sessionId (connector Bearer)
|   |-- public WS /screen/view/:ticket (one-use browser ticket)
|   `-- internal HTTP /internal/connectors/...
`-- MCP supervisor
    `-- sandbox-mcp-server child processes
```

broker 监听：

```txt
CONNECTOR_WS_BIND        default 0.0.0.0
CONNECTOR_WS_PORT        default 9321
CONNECTOR_WS_PUBLIC_URL  optional explicit public ws:// or wss:// URL
```

`docker-compose.yml` 用 `APP_HOST_PORT`（默认 `10030`）发布应用 HTTP 端口，用
`CONNECTOR_WS_HOST_PORT`（默认 `9321`）发布 broker：

```yaml
app:
  ports:
    - '${APP_HOST_BIND:-0.0.0.0}:${APP_HOST_PORT:-10030}:3000'
    - '${CONNECTOR_WS_HOST_BIND:-0.0.0.0}:${CONNECTOR_WS_HOST_PORT:-9321}:9321'
```

生产环境在 Coolify 或其他反向代理后时，把 `/connect`、`/screen/source/*`、
`/screen/view/*` 连同 WebSocket 升级一起路由到 broker 发布的主机端口。把
`CONNECTOR_WS_PUBLIC_URL` 设为公开 WebSocket 源，例如：

```txt
wss://example.com
```

如果代理运行在另一台主机上，用主机防火墙把 broker 端口限制为该代理的 IP，或把
`CONNECTOR_WS_HOST_BIND` 设为合适的内网网卡。

所有生成的 connector 沙箱都存储：

```txt
connector.provider         = websocket
connector.protocolVersion  = 2026-07-connector-ws-v2
connector.serverUrl        = platform URL shown in the command
connector.remoteRoot       = root path returned by bootstrap
connector.tokenHash        = sha256(token)
connector.tokenPrefix      = short display prefix only
connector.packageName      = /api/v1/connectors/package.tgz
```

明文 token 通过一个短期、HttpOnly、strict-same-site、scope 到该沙箱页的 Cookie 交付给
设置页，不写入 URL。数据库只保存 token 哈希。轮换 token 会立即断开旧会话。

协议 v2 是对 connector `0.1.8` 及更早版本的破坏性升级。升级 ToolPlane 后，停止旧的
connector 进程，在沙箱页生成新命令并重新运行。旧进程会被有意拒绝，而不是静默使用不兼
容的文件或进程语义。

### 外挂沙箱

在**智能体设置 → 沙箱**中挂载。本体沙箱只读展示，外挂沙箱逐个选择访问级别：

| 级别 | 工具 |
|---|---|
| 只读 | `sandbox_info`、`list_dir`、`read_file`、`download_file` |
| 读写 | 只读工具 + `write_file`、`delete_file` |
| 完全 | 读写工具 + `shell_exec`、`process_exec` |

挂载随设置保存进入新的不可变修订，只对新会话生效。会话执行时，Pi 通过
`/api/v1/agent-runtime/sandboxes/{sandboxId}/rpc` 调用外挂沙箱工具；该入口只接受携带
该沙箱 ID 的会话运行时令牌，每次请求重新校验修订和当前挂载，实际权限取两者较低者。
解除挂载或降低级别立即收窄已有会话，不会让整轮失败；沙箱停止或离线时工具列表为空、
调用返回错误。外挂沙箱工具与 MCP 工具一样经过原生工具审批。

### SSH 服务器

在**沙箱 → 新建外挂沙箱 → SSH** 中直接添加自己的服务器：

1. 填写主机、端口、用户名和远程工作目录（绝对路径，必须已存在），认证方式选私钥（可带
   口令，可从本地文件读取）或密码。
2. 点击**检测主机**。平台读取服务器的主机公钥并显示 SHA256 指纹；请通过可信来源核对后
   勾选确认。修改主机或端口会清除检测结果。
3. 创建时平台先用提交的凭据实际登录一次，并检查工作目录存在、远端装有 `python3`；失败
   时不保存任何记录，并给出具体原因（认证失败、主机密钥不符、目录或 python3 缺失等）。

凭据以 AES-256-GCM 加密后存入数据库（`SandboxSshServer`），页面与接口不返回明文。沙箱
启动时，凭据只写入仅当前进程可读的临时目录（目录 0700、文件 0600），停止或退出时删除；
密码和私钥口令经 `SSH_ASKPASS` 文件提供，不进入命令行或环境变量。主机公钥固定在创建时
确认的结果上，连接到解析出的具体 IP 并以固定别名校验，主机密钥变化时拒绝连接。

网络限制：

- 公网地址默认允许。
- 私有网络地址（10/8、172.16/12、192.168/16、fc00::/7）只有在**管理后台 → 系统设置 →
  私网主机白名单**中列出主机名、`*.子域` 或精确 IP 后才允许；此列表与 Remote MCP 共用，
  不再分别配置。该设置在每次检测、创建和启动时重新读取，移除后下一次连接即被拒绝。
- 本机回环、链路本地（含云元数据 169.254.169.254）、未指定和组播等地址始终拒绝，
  白名单不能放开。

主机检测与创建按用户限流。SSH 与 Connector 的命令以远端账号权限运行，不是容器隔离；
只有在信任该账号时才授予完全权限。

删除外挂沙箱会同时解除所有挂载。

### 已禁用的遗留模式

数据库中可能仍有 `kind=host`、遗留 connector JSON，或旧版管理员目标文件
（`TOOLPLANE_SSH_TARGETS_FILE`）创建的 SSH 记录。这些记录没有保存凭据，显示为已停用且
不能启动；请删除后按上文重新添加 SSH 服务器。该环境变量已不再读取。

```txt
Legacy sandbox row
|-- kind=host       disabled
|-- ssh (no stored server credentials) disabled
`-- legacy connector disabled
```

## Skill 脚本执行

当 Agent 同时拥有 skills 和沙箱时，`skill_run_script` 会先把 skill bundle 写入第一个绑
定的沙箱再执行：

```txt
.toolplane/skills/<skill-slug>/
|-- SKILL.md
|-- reference files
`-- scripts/*
```

二进制 bundle 文件使用 base64 编码的 `write_file`，由沙箱运行时解码，不经过 shell 命
令。脚本使用结构化的 `process_exec` 参数：Node.js 映射到 connector 当前的 Node 可执行
文件，Python 映射到原生 Python launcher/解释器，Bash 要求已安装 Bash。Windows 上把
`TOOLPLANE_CONNECTOR_BASH` 设为绝对可执行路径，如 `C:\\Program Files\\Git\\bin\\bash.exe`；
Python 不在 `PATH` 中时设置 `TOOLPLANE_CONNECTOR_PYTHON`。`TOOLPLANE_CONNECTOR_SHELL`
可选择绝对 `pwsh.exe` 路径，但交互式会话不支持 `cmd.exe`。这避免了 Windows 上对 POSIX
引号和 `base64 -d` 的假设。

没有绑定沙箱时，`skill_run_script` 返回错误，不回退宿主机执行。显式传入的 Sandbox ID 必须属于 Agent 的绑定集合。

## 数据库

```txt
Workspace 1-* Sandbox
Sandbox 1-1 Deployment
Agent 1-1 Sandbox via AgentSandbox (本体沙箱模板)
Agent *-* Sandbox via AgentExternalSandbox (外挂沙箱，access=read|write|full)
Sandbox 1-0..1 SandboxSshServer (SSH 主机、固定主机公钥、加密凭据)
```

部署前应用迁移 `20261101020000_agent_external_sandboxes`（原有非默认绑定会转为只读外挂
挂载）和 `20261101030000_sandbox_ssh_servers`。

沙箱 deployment 就是 MCP supervisor 启动、停止、对账并暴露给 Agent 工具构建器的对象。
