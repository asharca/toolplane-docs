import Link from "next/link";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";

export default function HomePage() {
  return <DocsPage full><DocsBody><div className="landing">
    <p className="text-sm font-medium text-fd-muted-foreground">ToolPlane · Development documentation</p>
    <h1>从工具接入到 Agent 运行，<br />了解当前开发中的 ToolPlane。</h1>
    <p>独立维护的中文优先开发文档。这里描述当前开发代码，不承诺线上实例已经具备相同能力；升级、部署和调用前，请核对代码修订、迁移与实例配置。</p>
    <div className="flex flex-wrap gap-6"><Link href="/docs/zh">阅读中文文档 →</Link><Link href="/docs/en">English index →</Link><Link href="/api-reference">交互式 API 参考 →</Link></div>
    <p className="text-sm text-fd-muted-foreground">English pages are listed only when the source is actually English. Missing translations are not generated or relabeled.</p>
  </div></DocsBody></DocsPage>;
}
