import Link from "next/link";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
export default function DocsIndex() {
  return <DocsPage full><DocsTitle>ToolPlane 开发文档</DocsTitle><DocsBody><p>中文优先；内容对应当前开发版本，不是线上稳定版契约。</p><p><Link href="/docs/zh">中文文档 →</Link></p><p><Link href="/docs/en">English index →</Link></p></DocsBody></DocsPage>;
}
