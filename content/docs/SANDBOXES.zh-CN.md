# Agent 沙箱


Agent 沙箱为 Agent 提供一个行为类似小型操作环境的工作区。在本项目中，沙箱以 MCP tools
的形式暴露给 Agent，并以 PTY 终端流的形式暴露给浏览器控制台。应用不会把任意的服务器
宿主机目录挂载为沙箱。

下文默认镜像及 Agent 可选工具依赖随对应应用 PR 合入后的版本生效；不表示已有模板或历史修订已升级。使用步骤与工具限制见[Agent 工作台与工具](./AGENT_WORKBENCH.zh-CN.md)。

沙箱分为两类：

- **智能体沙箱**：每个会话（Conversation，或没有绑定会话的本地 A2A Context）在首次执行时创建自己的 Docker 沙箱，运行在 gVisor（`runsc`）中，会话之间不共享任何文件、HOME 或软件。列表显示实际执行沙箱及其真实状态；尚未执行的会话不会产生占位沙箱。基础环境模板固定属于智能体，不能替换或挂到其他智能体；模板与只读归档不单独列为用户分类，也不计入沙箱数量。
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

默认选项使用 ToolPlane 自有沙箱镜像 `ghcr.io/asharca/toolplane-sandbox:latest`，由 Dockerfile 的 `sandbox` target 在 Node 26 开发基础镜像上加入 Chromium、Liberation 与 Noto CJK 字体，最终以非 root 的 `node` 用户运行。服务端可用 `TOOLPLANE_DEFAULT_SANDBOX_IMAGE` 指定固定 digest（非空值必须为 `...@sha256:<64位小写hex>`，可变 tag 拒绝为 `SANDBOX_DEFAULT_IMAGE_INVALID`）。未设置/空白时使用上述默认选项，首次捕获修订仍会解析并固定实际 image digest，拉取失败不静默退回旧镜像。

此选择只影响新建 Agent 模板与新建默认沙箱；既有模板、固定修订的 `environment.image` 和已运行容器不改。需要 Chromium 的旧 Agent 应通过已有显式环境/沙箱配置审核流程或新建 Agent 使用新镜像，不能重写历史 pin。CI 镜像发布、digest 获取与部署见[运行时运维](./RUNTIME_OPERATIONS.zh-CN.md#agent-工具镜像部署)。

容器非特权运行，移除 Linux capabilities，带 pids/cpu/memory 限制。`network=isolated` 使用专用 `mcp-sandbox` bridge，**允许互联网出站，不等于禁网**；`none` 才是断网。沙箱内 browser 使用这套实际网络，不经主机代取；平台侧 `web_search/web_fetch` 则有独立授权和受控出网，不随沙箱 none 自动关闭。智能体会话沙箱固定运行在 gVisor 中，见[gVisor 运行时](#gvisor-运行时)；工作区中独立创建的 Docker 沙箱使用 Docker 默认运行时。

#### 可选工具的沙箱前提

可选工具均默认关闭，须经过 Agent 草稿保存、准备、权限审核和应用修订；镜像存在不代表获得工具权限。启用清单与操作见[工作台指南](./AGENT_WORKBENCH.zh-CN.md#启用可选内置工具)。

| 工具 | 环境前提与边界 |
| --- | --- |
| `browser` | 沙箱内需可执行 Chromium；默认镜像设 `TOOLPLANE_CHROMIUM_PATH=/usr/bin/chromium`，这是可执行路径而非启用开关。旧/自定义镜像缺失时返回 `BROWSER_CHROMIUM_MISSING`，不自动安装，不连接用户 Chrome。none 下拒绝 HTTP(S) open，但允许 file/data/about；截图中的敏感信息不能靠文本脱敏移除 |
| `eval` | Python 需沙箱已有 `python3`，JavaScript 使用宿主 Node；不下载依赖。内存变量不跨宿主重启/回收恢复，notice 会说明状态重建 |
| `lsp` | 由应用 Docker daemon 中独立 `lsp-tools` 镜像离线导出依赖，安装到 `/workspace/.toolplane-tools/lsp/<sha256>/`；不改 SDK、不在沙箱 npm/npx，旧沙箱首次授权时按需物化。仅 TS/JS 与 Python 的五种只读查询 |
| `debug` | Node 使用已有 inspector，Python 还需兼容 `python3`；debugpy 从独立 capture 制品离线校验物化，不在沙箱 pip 安装、不改 SDK。只调试工具自己启动的本回合程序，无远程/PID attach |
| `task` | 多个子会话共享父沙箱/cwd、模型与权限，并发共享文件，不创建独立隔离 worktree；深度最多一层 |

LSP/debug 依赖完整性校验失败须恢复正确制品，不自动覆盖用户改动。原生 bash 仍可修改本会话沙箱内的文件，这些工具的目录/路径检查不是额外 OS 隔离。不要假设默认资源配额足够所有 Chromium/语言服务工作负载；上线前由部署者在实际沙箱核对 CPU、内存和 PID 限额。

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
不会被复制到克隆，也不会被快照恢复捕获或回滚。会话沙箱记录的软件清单在卷内，会随克隆
和快照一起复制，新容器按清单重装（见[会话沙箱的软件安装](#会话沙箱的软件安装)）。

用户 Connector 沙箱不支持克隆或快照操作。Connector 数据留在用户机器上，ToolPlane 不复
制也不删除它。

#### 每会话独立沙箱

参照 Claude Code cloud 的做法，每个会话拥有自己的容器和 `/workspace` 卷：绑定在会话上的本地 A2A Context 与该会话共用沙箱，没有绑定会话的 Context 单独一个。会话目录（`/workspace/conversations/…`）、HOME（`/workspace/.toolplane/agent-home`）、XDG 目录和 Pi 原生状态的路径不变，但它们所在的卷只属于这个会话：CLI 登录、`~/.local/bin`、`apt`／`npm -g`／`pip` 安装都只对本会话可见。需要在会话或智能体之间共享文件、登录态或软件时，挂载一个[外挂沙箱](#外挂沙箱)。文件面板和终端以当前会话目录为根，文件面板拒绝 `.toolplane` 路径；终端流每 15 秒重新校验凭据、成员资格和映射。打开尚未执行的会话不会展示或创建工作区。

每个会话固定自己的修订环境创建沙箱，同一智能体的会话可以同时固定在环境不同的修订上；升级只影响被升级的会话。

终端 PTY 的生命周期跟随会话和终端面板，不跟随后台历史／状态刷新、翻译回调或主题变化。
手动重连、关闭终端面板、切换会话或运行状态变化时会释放旧终端；关闭后才返回的创建请求
会立即回收其 PTY，不附着到后续终端。后台刷新须保留当前 shell、工作目录和未提交命令。

首次接纳／启动失败留下的模型标签、失败状态和耗时记录不代表原生会话已建立；用户明确
发送下一条请求时，可以首次创建原生会话，不会自动重放旧请求。已有正文、推理、工具活动
或已完成执行的会话仍要求恢复原生历史；历史缺失时拒绝继续，不能静默创建空会话替代。

管理员在**管理后台 → 系统设置 → 智能体会话并发**配置每个智能体的同时执行数
（1–32，默认 1）及平台总数（1–256，默认 16，不能小于单个智能体上限）。限额统计
正在执行的 turn，而非保存的会话数量。Work、聊天、渠道与本地 A2A 共用这组限额。同一会话串行，同一智能体的不同会话在
各自的沙箱中按限额并行，不同智能体也可并行。普通请求
等待空位时可以取消；原生根任务保留排队状态，嵌套委派任务遇满额立即失败，避免父子
任务互等。调低限额不打断正在执行的任务。公共端点保留独立限额，但当前不接受新发布或执行。
持久本地/远端任务另有工作区准入边界：平台执行上限加 16 个排队名额，原有存储配额仍生效。

每个 Docker 沙箱的 CPU 和内存由管理员在**管理后台 → 系统设置 → 沙箱资源**统一设置，默认 8 核、
16 GiB，每个会话的沙箱单独分配；宿主机进程数上限固定为 4096。修改在沙箱下次启动时生效，已有
容器原地更新配额，保留容器文件系统。旧修订中记录的资源限额不再使用。会话卷暂不限制容量。

#### 会话沙箱的生命周期

- **空闲停止**：默认空闲 15 分钟后，运行时所有者停止该会话的容器但保留卷，下次执行时启动同一个沙箱。管理员可在**管理后台 → 系统设置 → 智能体沙箱空闲自动关闭**关闭此行为。有执行、待处理任务、文件／终端流或活跃 PTY 时不停止。
- **回收**：连续 7 天没有活动（活动时间持久化在 `Sandbox.lastActiveAt`，服务重启后仍有效），运行时所有者把该会话的 Pi 原生会话状态压缩保存到数据库（`PiSessionCheckpoint`），再删除容器、卷和快照。对话记录、附件、产物和插件固定版本都保留。下次发送消息时，按固定修订创建新沙箱、恢复 Pi 状态并重新放入附件，模型接着之前的上下文继续，工作区其余文件从空白开始。Pi 状态压缩后超过约 72 MiB 时不回收，保留原卷并记录维护失败。
- **删除**：删除会话只删除它自己的沙箱（容器、卷和快照），失败保留删除意图供重试；删除智能体时删除其所有会话沙箱和只读归档。

#### 旧共享沙箱的归档与迁移

此前每个智能体共用一个持久沙箱。迁移 `20261127000000_session_sandboxes` 把这些沙箱标记为只读归档，保留到智能体删除时；运行时所有者会停止归档的容器。尚未迁移的会话在文件面板中以只读方式浏览归档里自己的目录，不能写入或打开终端。该会话下次执行时，只把它自己的会话目录和 Pi 状态复制到新的会话卷，并在同一事务中切换 Conversation、Work、Context 和插件快照映射；共享 HOME、`/workspace/shared` 和其他会话的内容都不复制。更早的独立会话卷归档保持原有的只读行为。

部署前备份数据库与卷，宿主机安装并在 Docker 中注册 `runsc`，应用迁移，重新生成 Prisma 客户端，并按单运行时所有者流程重启。

#### 会话沙箱的软件安装

会话在自己的容器内以镜像默认用户执行（预置镜像为 root），根文件系统可写。安装的系统包只对本会话可见，容器重建（修订环境或镜像变化、修改沙箱环境变量、运行时变化等）会丢弃可写层。ToolPlane 用卷内的 `/workspace/.toolplane/environment/packages.list` 记录可重装的软件，不把它当作不可变修订或完整环境备份；会话沙箱被回收时，清单随卷一起删除。

- 每轮执行后及移除运行中的容器前，记录相对初始基线新增的 apt 手动安装包、npm 全局包和默认 Python 环境中由 pip／uv 安装的包；npm、pip 记录版本。卸载后会移除相应条目，仅删清单行而不卸载则会在下一次记录时重新加入。
- 新容器先记录镜像自带软件，再后台重装清单。重装不阻止会话执行，所以依赖尚未就绪时工具仍可能失败；不要把容器启动成功当作软件恢复完成。重装期间暂停更新清单，输出在同目录 `replay.log`，失败项保存在 `failed.list` 和清单中，下次重建重试。
- apt 使用当时软件源版本；npm、pip 按记录版本安装。软件源不可达或禁网时可能失败。清单不保存私有软件源凭据，也不保证精确复现旧容器。
- 不覆盖下载到 `/usr/local/bin` 的文件、源码编译产物、cargo/go 等其他管理器或独立 Python 虚拟环境。需要持久保存的文件应放在 `/workspace`；HOME 中的文件本身随卷保留，不依赖重装。
- 已有容器首次记录时以当时软件为基线，不补记此前安装。运行用户须能写入卷内记录目录和容器内 `/var/lib/toolplane`，普通非 root 自定义镜像通常不满足条件；目录不可写时不记录或重装。

实现见 [`sandbox-environment.sh`](../scripts/sandbox-environment.sh)。这项恢复只重装清单软件，不恢复已经删除的文件或外部副作用。

#### gVisor 运行时

智能体会话沙箱用 Docker 运行时 `runsc`（gVisor）创建：沙箱内的系统调用由 gVisor 的用户态内核处理，不直接落到宿主机内核。capabilities、`no-new-privileges`、CPU／内存／进程数限额、网络、`/workspace` 卷和软件清单重装都照常生效，桌面（Xvnc、Chromium）同样可用。

宿主机按 [gVisor 安装文档](https://gvisor.dev/docs/user_guide/install/)安装 `runsc` 软件包，并在 `/etc/docker/daemon.json` 中注册运行时，再执行 `systemctl reload docker`：

```json
{
  "runtimes": {
    "runsc": { "path": "/usr/bin/runsc" }
  }
}
```

启动会话沙箱前，ToolPlane 通过 `docker info` 确认 daemon 已注册 `runsc`；未注册时拒绝启动，不回退到 runc。仓库自带的 compose 已让 socket proxy 放行只读的 `INFO` 接口。

- **切换时机**：已有容器在下次启动时发现运行时不一致，会先记录软件清单，再删除旧容器、用 `runsc` 重建；工作区卷保留，软件按清单重装。
- **DNS**：Docker 内置 DNS（`127.0.0.11`）在 gVisor 内不可用。沙箱每次启动时，ToolPlane 改用 Docker 为默认 bridge 网络写入的上游 DNS 服务器。容器名无法解析；访问宿主机仍使用 `host.docker.internal`。
- **进程数**：宿主机 pids cgroup 会把 gVisor 自身的线程也计入（空闲约 80 个，每个沙箱内进程再加约 2 个），超过上限时整个沙箱会崩溃，而不是让进程收到 `EAGAIN`。因此宿主机上限保持 4096，不要调低。
- **不支持的组合**：设置为“在智能体沙箱中运行”的 MCP 需要加入沙箱的进程和网络命名空间，gVisor 沙箱没有可加入的命名空间，因此这类调用会被拒绝，原因码为 `MCP_AGENT_SANDBOX_UNSUPPORTED`。需要先关闭该 MCP 的此选项。
- **范围**：只有智能体会话沙箱使用 gVisor。工作区中独立创建的 Docker 沙箱、MCP 服务容器，以及预检、卷复制等平台自身的短时辅助容器，仍使用默认运行时。

#### 桌面与接管

新建 Pi Agent 时打开 **桌面和浏览器**，它的沙箱改用 `ghcr.io/asharca/toolplane-desktop`
（ToolPlane Dockerfile 的 `sandbox-desktop` 目标）：Node 26 镜像加上只监听容器回环地址的
Xvnc（1280×800）、openbox 和 Chromium。只能在创建时选择，已有 Agent 的修订环境不变。CPU
和内存与其他沙箱一样按后台**沙箱资源**设置分配。自建镜像源时用同一目标构建，并设置
`TOOLPLANE_DESKTOP_SANDBOX_IMAGE`。

镜像用标签 `io.toolplane.desktop.rfb-port` 声明 VNC 端口。ToolPlane 通过 `docker exec` 在
容器内桥接这个端口，不对外发布端口。Work 的 **屏幕** 面板和沙箱详情页复用 Connector 屏幕
的一次性 viewer ticket 和 `/screen/view/<ticket>` 转发，所以部署要求相同：设置
`CONNECTOR_WS_PUBLIC_URL`，并让反向代理转发 `/screen/*` 的 WebSocket 升级。

Agent 获得三个工具，截图以图片交给模型，所以要选支持图片输入的模型：

- `desktop_computer`：截图、点击、输入、按键、滚动和拖拽，坐标为屏幕像素。
- `desktop_browser`：经 CDP 操作同一个 Chromium 窗口：打开网址、读取页面文本和带编号的
  可交互元素、按编号点击或输入、按键、滚动、后退、截图。
- `desktop_request_takeover`：遇到人机验证、单点登录、通行密钥、扫码、支付验证或必须本人
  操作的步骤时请用户接管。原因只能是 `captcha`、`sso`、`passkey`、`qr`、
  `payment_verification`、`human_required`。

请求接管时本轮暂停，Work 显示接管卡片并打开屏幕面板。用户点 **打开屏幕** 进入控制模式，
只完成被卡住的那一步，再点 **已完成，继续**：屏幕自动退回只读，Agent 继续执行；点 **取消**
则 Agent 不会自动重试。等待受本轮截止时间限制，服务重启后不会恢复。没有网页界面的入口（如
消息渠道）会直接返回不可用，由 Agent 在回复里说明需要用户做什么。

屏幕处于控制模式时，服务端在容器内写入 30 秒租约并每 10 秒续期；租约有效期间，桌面工具返回
`DISPLAY_USER_CONTROLLED` 失败结果，本轮继续。关闭控制或断开屏幕后移除租约。

浏览器配置目录位于本会话 HOME 的 `.config/toolplane-chromium`，登录状态随会话卷保留，只对该
会话可见；会话沙箱被回收时一并删除。Agent 拥有 shell，能读取其中的 Cookie，也能绕过租约直接
操作 X 显示；租约只用于协调，不是安全边界。密码和验证码应在接管时直接输入到屏幕上，不要发到聊天里。


### 用户 Connector

Connector 模式让用户暴露自己机器上的一个目录，无需开 SSH、配置密钥，也无需让平台主动
连接任意用户主机。Linux、macOS、Windows PowerShell 和 Windows 命令提示符都使用同一行
命令：

```text
npx -y --no-audit --package "https://<实例域名>/api/v1/connectors/package.tgz?v=<控制台生成的版本>" connector connect --server "https://<实例域名>" --token "<一次性连接令牌>" --root "<本地目录>" --screen-vnc "auto"
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
npx -y --no-audit --package "https://<实例域名>/api/v1/connectors/package.tgz?v=<控制台生成的版本>" connector connect --server "https://<实例域名>" --token "<一次性连接令牌>" --root "/sdcard/ToolPlane" --android "auto"
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
调用返回错误。外挂沙箱工具与 MCP 工具同样受已应用的工具策略约束；平台 `toolApproval` 和 Pi 扩展原生对话不是一回事，审批入口与豁免见[工具审批](AGENT_WORKBENCH.zh-CN.md#工具审批)。

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
