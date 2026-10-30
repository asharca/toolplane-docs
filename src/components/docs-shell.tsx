"use client";

import { usePathname, useRouter } from "next/navigation";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { Doc } from "@/lib/docs-links";
import { APP_URL, DOCS_REPO, sitePath, withoutBase } from "@/lib/site";

type NavDoc = Pick<Doc, "url" | "title" | "language" | "category" | "topic">;
export function DocsShell({ docs, children }: { docs: NavDoc[]; children: React.ReactNode }) {
  const pathname = withoutBase(usePathname()).replace(/\/$/, "") || "/";
  const router = useRouter();
  const language = pathname.split("/")[2] === "en" ? "en" : "zh";
  const section = pathname.split("/")[3];
  const category = pathname === "/api-reference" || section === "api" ? "api" : section === "developers" ? "developers" : "guides";
  const zh = language === "zh";
  const base = `/docs/${language}`;
  const labels = zh ? { guides: "使用指南", developers: "开发者文档", api: "API 与协议" } : { guides: "Guides", developers: "Developers", api: "API & protocols" };
  const current = docs.find((doc) => doc.url === pathname);
  const visible = docs.filter((doc) => doc.language === language && doc.category === category);
  const otherLanguage = zh ? "en" : "zh";
  const translation = current && docs.find((doc) => doc.language === otherLanguage && doc.topic === current.topic);
  const categories = ["guides", "developers", "api"] as const;
  return <RootProvider key={`${language}/${category}`} i18n={{
    locale: language,
    locales: [
      { locale: "zh", name: `中文${current && !zh && !translation ? " · 目录（无译文）" : ""}` },
      { locale: "en", name: `English${current && zh && !translation ? " · index (no translation)" : ""}` },
    ],
    onLocaleChange: (next) => {
      if (next === language) return;
      router.push(translation?.language === next ? translation.url : `/docs/${next}`);
    },
    translations: zh ? {
    "Search(search trigger)": "搜索文档", "Open Search(search trigger)(aria-label)": "搜索文档",
    "Search(search dialog)": "搜索文档", "No results found(search dialog)": "没有找到相关文档",
    "Close Search(search dialog)(aria-label)": "关闭搜索", "On this page(table of contents)": "本页目录",
    "Next Page(pagination)": "下一页", "Previous Page(pagination)": "上一页",
    "Open Sidebar(sidebar)(aria-label)": "打开目录", "Close Sidebar(sidebar)(aria-label)": "关闭目录",
    "Collapse Sidebar(sidebar)(aria-label)": "收起目录", "Toggle Theme(theme switcher)(aria-label)": "切换主题",
    "Light(theme switcher)(aria-label)": "浅色", "Dark(theme switcher)(aria-label)": "深色", "System(theme switcher)(aria-label)": "跟随系统",
    "Choose a language(language switcher)": "选择语言", "Choose a language(aria-label)": "选择语言",
  } : undefined }} search={{ options: { type: "static", api: sitePath("/docs/search"), defaultTag: category } }}>
    <div lang={zh ? "zh-CN" : "en"}>
      <DocsLayout
        nav={{ title: zh ? "ToolPlane · 开发文档" : "ToolPlane · Dev Docs", url: base }}
        githubUrl={DOCS_REPO}
        links={[
          { text: zh ? "文档首页" : "Documentation index", url: base },
          { text: "API Reference", url: "/api-reference" },
          { text: zh ? "实例（版本可能不同）" : "Live app (version may differ)", url: APP_URL, external: true },
        ]}
        tabs={categories.map((key) => ({
          title: labels[key],
          url: `${base}/${key}`,
          urls: new Set([
            `${base}/${key}`,
            ...docs.filter((doc) => doc.language === language && doc.category === key).map((doc) => doc.url),
            ...(key === "guides" ? [base] : []),
            ...(key === "api" ? ["/api-reference"] : []),
          ]),
        }))}
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
