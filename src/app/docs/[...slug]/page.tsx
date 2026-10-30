import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsPage, DocsTitle, DocsDescription, DocsBody, EditOnGitHub } from "fumadocs-ui/layouts/docs/page";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Callout } from "fumadocs-ui/components/callout";
import { getDocs } from "@/lib/docs";
import { DocumentContent } from "@/components/document-content";
import { DOCS_REPO, APP_URL } from "@/lib/site";
import provenance from "../../../../migration-manifest.json";

const categories = {
  zh: { guides: "使用指南", developers: "开发者文档", api: "API 与协议" },
  en: { guides: "Guides", developers: "Developer documentation", api: "API & protocols" },
} as const;
export const dynamicParams = false;
export async function generateStaticParams() {
  const docs = await getDocs();
  return [
    ...(["zh", "en"] as const).flatMap((language) => [
      { slug: [language] },
      ...Object.keys(categories[language]).map((category) => ({ slug: [language, category] })),
    ]),
    ...docs.map((doc) => ({ slug: doc.slug })),
  ];
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = (await getDocs()).find((candidate) => candidate.slug.join("/") === slug.join("/"));
  const language = slug[0] === "en" ? "en" : "zh";
  return { title: doc?.title ?? (language === "zh" ? "文档目录" : "Documentation index"), alternates: { canonical: `https://asharca.github.io/toolplane-docs/docs/${slug.join("/")}/` } };
}
export default async function DocumentPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const [language, category] = slug;
  if (language !== "zh" && language !== "en") notFound();
  const zh = language === "zh";
  const docs = await getDocs();
  if (slug.length === 1) return <DocsPage full><DocsTitle>{zh ? "ToolPlane 开发文档" : "ToolPlane development documentation"}</DocsTitle><DocsDescription>{zh ? "中文优先，文档与代码共同演进。" : "Chinese-first documentation, evolving with the development code."}</DocsDescription><DocsBody>
    <p>{zh ? "使用指南、开发者文档与 API 协议按原始文档语言分类。页面不等同于当前线上版本承诺。" : "Only genuinely English source documents appear here. Most current guides are available in Chinese; no automatic or placeholder translations are supplied."}</p>
    <Cards>{Object.entries(categories[language]).map(([key, title]) => <Card key={key} href={`/docs/${language}/${key}`} title={title}>{docs.filter((doc) => doc.language === language && doc.category === key).length} {zh ? "篇原始文档" : "source documents"}</Card>)}</Cards>
    {!zh && <p><Link href="/docs/zh">查看中文开发文档 / Browse Chinese documentation →</Link></p>}
  </DocsBody></DocsPage>;
  if (slug.length === 2 && Object.hasOwn(categories[language], category)) {
    const visible = docs.filter((doc) => doc.language === language && doc.category === category);
    return <DocsPage full><DocsTitle>{categories[language][category as keyof typeof categories.zh]}</DocsTitle><DocsBody>
      {category === "api" && <p><a href={`${APP_URL}/docs-api`} target="_blank" rel="noopener noreferrer">{zh ? "线上实例参考（版本可能不同）" : "Live app reference (version may differ)"}</a></p>}
      {visible.length ? <Cards>{visible.map((doc) => <Card key={doc.file} href={doc.url} title={doc.title}>{doc.file}</Card>)}</Cards> : <p>{zh ? "此分类尚无该语言的原文。" : "No English source documents in this section. Translations are not yet available."} <Link href={`/docs/${zh ? "en" : "zh"}/${category}`}>{zh ? "查看英文目录" : "Browse the Chinese section"}</Link></p>}
    </DocsBody></DocsPage>;
  }
  const doc = docs.find((candidate) => candidate.slug.join("/") === slug.join("/"));
  if (!doc) notFound();
  const snapshot = ["README.md", "CHANGELOG.md"].includes(doc.file);
  return <DocsPage toc={doc.toc} tableOfContent={{ enabled: true }} tableOfContentPopover={{ enabled: true }}>
    <DocsTitle>{doc.title}</DocsTitle>
    <DocsDescription>{zh ? "开发版本文档 · 请核对部署代码和功能支持边界。" : "Development documentation · Check your deployed code and supported capabilities."}</DocsDescription>
    <DocsBody>
      <Callout title={zh ? "版本与来源" : "Version and source"}>
        {zh ? "当前开发文档不等同于线上稳定版承诺。迁入正文保留原文；旧站点维护说明以本站仓库 README 为准。" : "These development documents are not a stable-release promise. Imported prose is preserved; this repository README supersedes old embedded-site authoring instructions."}
        {snapshot && <p>Source snapshot: <code>{provenance.upstreamCommit.slice(0, 12)}</code> + development worktree · <time>{provenance.importedAt}</time>. {zh ? "不是未来自动同步源。" : "Not an automatically synchronized future source."}</p>}
      </Callout>
      <DocumentContent file={doc.file} />
    </DocsBody>
    <EditOnGitHub href={`${DOCS_REPO}/edit/main/content/${doc.file}`}>
      {zh ? "在文档源中编辑此页" : "Edit this page on GitHub"}
    </EditOnGitHub>
  </DocsPage>;
}
