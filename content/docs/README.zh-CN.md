# ToolPlane 文档

从[项目介绍与快速开始](../README.md)入门，按下面的主题继续阅读。

## 文档网站

访问 [ToolPlane 中文开发文档](https://asharca.github.io/toolplane-docs/docs/zh/)；英文入口为 `/toolplane-docs/docs/en/`，只有真实英文原文，不生成占位翻译。站点无需登录，独立于应用部署。当前内容对应开发分支，不代表线上稳定版；阅读前核对所用代码版本。中文站按以下分类组织：

- **用户文档**：安装、配置、集成与日常运维。
- **开发者文档**：架构、运行时实现、贡献与发布维护。
- **API 文档**：协议与接入说明，以及本站 `/toolplane-docs/api-reference/` 的 Scalar 交互式参考。本站使用固定的开发版 OpenAPI 快照；执行请求前明确选择有权访问的目标实例。运行中应用的 `/docs-api` 和 `/api/v1/openapi.json` 则描述该实例自身版本。

网站采用 [Fumadocs](https://fumadocs.dev) 提供导航、响应式布局和全文搜索，正文复用安全的 Streamdown 渲染 Markdown、代码和 Mermaid。Fumadocs 在 `/docs/search` 生成静态搜索索引，内置搜索框在浏览器本地搜索并按当前语言与分类过滤。相对 Markdown 链接保留目标文档的语言，其他仓库文件链接指向 GitHub；共享链接解析位于 `src/lib/docs-links.ts`。

公开文档的唯一维护源是 [`asharca/toolplane-docs`](https://github.com/asharca/toolplane-docs) 的 `content/`。主题放在 `content/docs/`，图片与示例配置一并维护；不再编辑 ToolPlane 主仓库中的旧文档正文。迁入的项目 README 与 CHANGELOG 是带来源记录的历史快照，不会自动同步；应用仓库根 README 和自动生成的 CHANGELOG 仍在应用仓库维护。

`source.config.ts` 在构建时完成分类与语言识别：`.en.md` 为英文，`.zh-CN.md` 为中文，无语言后缀时按首个标题识别。路径为 `/toolplane-docs/docs/{语言}/{分类}/{原主题路径}`，去掉文件名语言后缀。新增主题应检查分类、相对链接、搜索和语言切换；不发布 Agent 指令、内部计划、隐藏文件、环境文件或私有运维数据。

合并文档 PR 到 `main` 后，GitHub Actions 使用 pnpm 和 Fumadocs 构建静态 HTML、搜索索引与资源并发布到 GitHub Pages。站点不依赖应用数据库、Node 常驻服务或运行时凭据。原应用的文档入口切换只在应用升级后生效，不能仅靠发布文档改变旧应用。

## 架构与运行时

| 文档 | 内容 |
|---|---|
| [原生 Pi SDK](./AGENT_RUNTIMES.zh-CN.md) | Pi-only 执行、不可变修订、能力 receipt/CAS 与安全边界 |

## 使用与集成

| 文档 | 内容 |
|---|---|
| [远程 MCP HTTP](./REMOTE_MCP_HTTP.zh-CN.md) | HTTP/HTTPS 端点、明文传输确认与能力指纹 |
| [沙箱与连接器](./SANDBOXES.zh-CN.md) | Docker、设备连接、终端与屏幕 |
| [Agent Control MCP](./AGENT_CONTROL_MCP.zh-CN.md) | 从 MCP 客户端创建 Pi 草稿和调用 Agent |
| [公共 Agent API](./AGENT_PUBLIC_API.zh-CN.md) | 保留的鉴权、限额、历史与当前执行限制 |
| [A2A 控制台接入](./A2A_CONSOLE.zh-CN.md) | 连接示例、凭据与本地任务调试 |
| [A2A MCP 适配](./A2A_MCP_BRIDGE.zh-CN.md) | 外部 MCP 客户端的原生任务协议 |
| [A2A 资源限额](./A2A_RESOURCE_LIMITS.zh-CN.md) | 载荷存储、输出预留与迁移 |
| [远程 A2A Agent](./A2A_REMOTE_AGENTS.zh-CN.md) | 注册、出站授权、远程委派与恢复 |
| [原生 A2A 1.0](./A2A_NATIVE.zh-CN.md) | 标准任务、事件订阅与发布授权 |
| [A2A 内部协作](./A2A_LOCAL_COLLABORATION.zh-CN.md) | 本地身份、原生委派、父任务等待与恢复 |
| [消息渠道](./AGENT_MESSAGING_PLATFORMS.zh-CN.md) | Telegram、飞书、QQ、微信、Discord、Slack |

## 部署与维护

| 文档 | 内容 |
|---|---|
| [升级与恢复](./RUNTIME_OPERATIONS.zh-CN.md) | 受控切换、包导入、客户端登记与单所有者恢复 |
| [日志与审计](./OBSERVABILITY.zh-CN.md) | 日志模型、诊断抓取与保留策略 |
| [版本发布](./RELEASES.zh-CN.md) | release-please 发布流程与 GitHub 配置 |
| [共享 UI](./UI_LIBRARY.zh-CN.md) | 原版 beUI Registry 源码接入 |

## 维护约定

- 每个主题维护唯一内容来源，并在本索引登记；其他位置链接到现存文档，不恢复已删除的旧专题或翻译副本。
- 行为以代码为准；跨仓库的功能变更应关联代码 PR 与文档 PR，并说明适用版本。结构图和流程图优先使用 Mermaid。
- 新专题放在 `content/docs/`，中文使用 `TOPIC_NAME.zh-CN.md`，开头说明用途与读者。

- [统一入口与执行前审批](./A2A_INGRESS_APPROVALS.zh-CN.md)
