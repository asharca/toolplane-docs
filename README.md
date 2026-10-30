# ToolPlane 开发文档 / Development documentation

独立、中文优先的 ToolPlane 开发文档网站：<https://asharca.github.io/toolplane-docs/>。

**这是当前开发版本的文档，不是生产稳定版契约。** 功能、迁移、运行时与 API 必须和实际部署的代码修订、实例配置一起核对。主应用与生产数据库不参与本站构建；GitHub Pages 只托管静态文件。

## 安装、构建与预览

沿用 ToolPlane 的 Next.js 16.2.9、React 19.3.0、Fumadocs core/UI 16.15.18、MDX 15.4.6 与 pnpm 10.34.1。需要 Node.js **26.12.1 或更高版本**。

```sh
pnpm install --frozen-lockfile
pnpm dev --hostname 127.0.0.1 --port 3108
# http://127.0.0.1:3108/toolplane-docs/

pnpm build
pnpm preview
# http://127.0.0.1:3108/toolplane-docs/
```

`PORT=3109 pnpm preview` 可更换预览端口。预览命令仅提供 `out/` 静态文件，模拟 Pages 的 `/toolplane-docs` 前缀。不要使用 `next start`；本项目是 `output: "export"`，不需要应用服务、认证、数据库或环境密钥。

## 唯一创作源

- 正文只在 **本仓库 `content/`** 编辑，不再在 ToolPlane 主仓库维护第二份公开文档。
- `content/docs/**/*.{md,mdx}`：公开指南；`content/README.md`、`content/CHANGELOG.md` 与 `content/infra/firecrawl/README.md`：迁移时的完整源文快照。根目录本文件是本站维护说明，不是被迁移的项目 README。
- `public/source/docs/assets/` 与 `public/source/docs/sandboxes/`：公开图片和可下载示例。保留其源相对路径，便于 Markdown 引用。
- `source.config.ts` 是公开内容白名单；拒绝 plans、AGENTS/CLAUDE 指令和隐藏目录。不要将规划、个人笔记、凭据、运行数据、数据库导出或内部证据放入白名单目录。
- 普通文章使用 `.md`；需要官方 Tabs、Steps、Callout、Cards 等组件时使用 `.mdx`。`.zh-CN.md` / `.zh-CN.mdx` 表示中文，`.en.md` / `.en.mdx` 表示英文；无语言后缀时，以首个一级标题是否含汉字判断语言。**没有译文就不生成译文页**；切换语言明确回到对应目录。
- 既有 URL 保持 `/docs/{zh|en}/{guides|developers|api}/{topic}`，topic 保留原始仓库路径、去掉语言和 `.md` 后缀。例如 `content/docs/AGENT_RUNTIMES.zh-CN.md` 对应 `/toolplane-docs/docs/zh/developers/docs/AGENT_RUNTIMES/`。
- 使用原始相对 Markdown 链接，例如 `./SANDBOXES.zh-CN.md`、`../README.md`。渲染器在构建后的页面解析到本站目标；非文档源码链接仍指向 `asharca/ToolPlane` 的 GitHub，公开迁移资产在本站提供。正文不批量改写，不要手工加 basePath。
- 页面使用 Fumadocs 官方 DocsLayout、DocsPage 与默认中性色主题，不维护自定义站点外壳或覆盖样式。正文由 Fumadocs MDX 编译，使用官方代码块、表格、Callout、Tabs、Steps、Cards 与 Mermaid 组件。参考[文档编写指南](https://asharca.github.io/toolplane-docs/docs/zh/developers/docs/DOCS_AUTHORING/)。生成目录 `.source/`、`.next/`、`out/` 不提交。
- 迁移文档中保留的旧嵌入站说明属于历史原文；**本站作者工作流以本文件为准**。

## 跨仓库代码／文档配对流程

1. 应用行为变更在 `asharca/ToolPlane` 提 PR；文档变更在 `asharca/toolplane-docs` 提配对 PR，双方说明中互链并注明代码 commit、版本或计划发布版本。
2. 文档 PR 区分“开发中”与已发布能力；合并前核对代码接口、迁移和配置，不用线上可访问与否替代版本对应说明。
3. 对已发布行为的文档，标明实际已发布代码版本／commit。对尚未发布的行为继续保留开发状态，不声称生产已经支持。
4. `content/CHANGELOG.md` 是迁移快照，**不会自动接收应用 release-please 更新**。后续更新由配对文档 PR 显式选择内容并记录来源，不建立暗中抓取或双向同步。根 README 与 Firecrawl 导入页同理。

## API 参考与固定快照

`/api-reference/` 默认使用 Fumadocs OpenAPI 官方组件展示固定开发版 `public/openapi.json`，不在运行时拉取线上未固定 schema。参考页关闭会持久保存凭据的内置 Playground；单独的“交互调试”标签保留 Scalar，并明确禁用凭据持久化。快照来自迁移时 ToolPlane 的 `src/app/api/v1/openapi.json/route.ts` 的纯 `GET()`，合并 Agent 与 A2A 公共定义。来源、时间、源文件哈希和导出结果哈希记录在 `migration-manifest.json`。

默认目标是不可作为真实实例使用的 `https://toolplane.example.com`。可在页面上明确输入目标 URL，或者构建时配置公开的 `NEXT_PUBLIC_API_SERVER=https://your-instance.example.com`。该设置不是秘密，**不可放 token**。请求不会自动执行，凭据 `persistAuth: false`，不嵌入令牌、不提供凭据代理。请求受目标实例 CORS 限制；不要为方便调试放松生产边界。主应用的 <https://tp.rhzy.ai/docs-api> 和 <https://tp.rhzy.ai/api/v1/openapi.json> 仍是该实例自己的参考，版本可能不同。

更新快照时，在目标 ToolPlane revision 的工作区、已有依赖可用的前提下运行以下本地导出（不会读取生产数据库）：

```sh
node --conditions=react-server --import tsx --input-type=module -e '
const mod = await import("./src/app/api/v1/openapi.json/route.ts");
const GET = mod.GET ?? mod.default.GET;
process.stdout.write(JSON.stringify(await GET().json(), null, 2) + "\n");
' > ../toolplane-docs/public/openapi.json
```

配对 PR 必须注明源 commit／工作树状态，重新记录该快照与相关 schema 源文件 SHA-256，审查变化。不从线上生产接口抓取替代开发快照。

## Pages 发布

仓库 Settings → Pages 的 Source 选择 **GitHub Actions**。`.github/workflows/pages.yml` 在 PR 只构建、上传静态产物；`main` push 或手动触发才部署。安装使用 `pnpm install --frozen-lockfile`，构建 `pnpm build`，产物为 `out/`。不使用主应用发布流程，不部署容器、不运行迁移。

`next.config.ts` 固定 `basePath: "/toolplane-docs"` 和 `trailingSlash: true`；移动仓库名或使用自定义域名时，需要同时更新它、`src/lib/site.ts`、canonical URL 和工作流／外链，不能仅移除预览 URL 前缀。

## 来源、完整性与许可归属

首次迁移从 ToolPlane 开发工作树导入 **21 份 Markdown 与 3 个公开资产／示例**，排除所有规划与代理指令。`migration-manifest.json` 逐文件保存原路径、目标路径、字节数与 SHA-256；正文按原始字节保留，不通过链接替换改变原文。源 HEAD 为 `87b28a8c68a3e14a00e25c3ecaa270e416c26c67`，同时包含当时未提交的开发工作树内容；具体导入时间见 manifest。README／CHANGELOG 页显示同一快照来源，不能将它描述为该 commit 的干净 checkout 或线上版本。

原始文档及资产归属于 ToolPlane 项目及其各自作者；保留原文及已有声明。导入时 ToolPlane 根目录未发现 LICENSE，**本次迁移不新增、推断或扩大任何许可授权**；公开可访问不等于授予新的复制／再分发许可。第三方依赖依照各自发行包许可（Fumadocs 与 Scalar 为 MIT；Mermaid 及传递依赖遵循各自许可）；本站未重新许可其源码，许可证与版权声明由包自身保留。
