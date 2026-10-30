"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { Doc } from "@/lib/docs-links";
import { APP_URL, DOCS_REPO, sitePath, withoutBase } from "@/lib/site";

type NavDoc = Pick<Doc, "url" | "title" | "language" | "category" | "topic">;
export function DocsShell({ docs, children }: { docs: NavDoc[]; children: React.ReactNode }) {
  const pathname = withoutBase(usePathname());
  const router = useRouter();
  const language = pathname.split("/")[2] === "en" ? "en" : "zh";
  const section = pathname.split("/")[3];
  const category = section === "developers" || section === "api" ? section : "guides";
  const zh = language === "zh";
  const base = `/docs/${language}`;
  const labels = zh ? { guides: "使用指南", developers: "开发者文档", api: "API 与协议" } : { guides: "Guides", developers: "Developers", api: "API & protocols" };
  const current = docs.find((doc) => doc.url === pathname);
  const visible = docs.filter((doc) => doc.language === language && doc.category === category);
  const otherLanguage = zh ? "en" : "zh";
  const translation = current && docs.find((doc) => doc.language === otherLanguage && doc.topic === current.topic);
  return <RootProvider key={`${language}/${category}`} i18n={{ locale: language, translations: zh ? {
    "Search(search trigger)": "搜索文档", "Open Search(search trigger)(aria-label)": "搜索文档",
    "Search(search dialog)": "搜索文档", "No results found(search dialog)": "没有找到相关文档",
    "Close Search(search dialog)(aria-label)": "关闭搜索", "On this page(table of contents)": "本页目录",
    "Next Page(pagination)": "下一页", "Previous Page(pagination)": "上一页",
    "Open Sidebar(sidebar)(aria-label)": "打开目录", "Close Sidebar(sidebar)(aria-label)": "关闭目录",
    "Collapse Sidebar(sidebar)(aria-label)": "收起目录", "Toggle Theme(theme switcher)(aria-label)": "切换主题",
    "Light(theme switcher)(aria-label)": "浅色", "Dark(theme switcher)(aria-label)": "深色", "System(theme switcher)(aria-label)": "跟随系统",
  } : undefined }} search={{ options: { type: "static", api: sitePath("/docs/search"), defaultTag: category } }}>
    <div className="docs-site" lang={zh ? "zh-CN" : "en"}>
      <div className="sticky top-0 z-50 border-b border-fd-border bg-fd-background">
        <div className="bg-fd-secondary px-4 py-1 text-center text-xs leading-5">
          {zh ? "开发版本文档 · 不代表线上稳定版；部署前请核对代码版本与实例配置。" : "Development documentation · Not a stable production contract. Match your code revision and instance configuration."}
        </div>
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:flex-nowrap md:px-6">
          <Link href="/docs/zh" className="font-semibold">ToolPlane {zh ? "开发文档" : "Dev Docs"}</Link>
          <nav aria-label={zh ? "文档分类" : "Documentation sections"} className="order-3 flex w-full justify-center gap-5 text-sm md:order-none md:w-auto">
            {(["guides", "developers", "api"] as const).map((key) => <Link key={key} href={`${base}/${key}`} aria-current={section === key ? "page" : undefined} className={section === key ? "font-semibold text-fd-primary" : "text-fd-muted-foreground"}>{labels[key]}</Link>)}
            <Link href="/api-reference">API Reference</Link>
          </nav>
          <select aria-label={zh ? "语言" : "Language"} value={language} className="max-w-48 rounded-md border border-fd-border px-2 py-1 text-sm" onChange={(event) => {
            const next = event.target.value;
            router.push(translation?.language === next ? translation.url : `/docs/${next}${section ? `/${category}` : ""}`);
          }}>
            <option value="zh">中文{current && !zh && !translation ? " · 目录（无译文）" : ""}</option>
            <option value="en">English{current && zh && !translation ? " · index (no translation)" : ""}</option>
          </select>
        </header>
      </div>
      <DocsLayout nav={{ title: zh ? "ToolPlane 文档" : "ToolPlane Docs", url: base }} tabs={false}
        githubUrl={DOCS_REPO}
        links={[{ text: zh ? "实例（线上版本可能不同）" : "Live app (version may differ)", url: APP_URL, external: true }]}
        sidebar={{ enabled: pathname.startsWith("/docs/") && !!section }}
        tree={{ name: labels[category], children: [
          { type: "page", name: zh ? "分类概览" : "Section overview", url: `${base}/${category}` },
          ...(category === "api" ? [{ type: "page" as const, name: "Interactive API Reference", url: "/api-reference" }] : []),
          ...visible.map((doc) => ({ type: "page" as const, name: doc.title, url: doc.url })),
        ] }}>
        {children}
      </DocsLayout>
    </div>
  </RootProvider>;
}
