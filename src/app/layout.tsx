import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { getDocs } from "@/lib/docs";
import { DocsShell } from "@/components/docs-shell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ToolPlane 开发文档", template: "%s | ToolPlane 开发文档" },
  description: "ToolPlane 当前开发版本的中文优先文档，不是线上稳定版承诺。Chinese-first documentation for the current development version, not a stable production contract.",
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const docs = (await getDocs()).map(({ url, title, language, category, topic }) => ({ url, title, language, category, topic }));
  return <html lang="zh-CN" suppressHydrationWarning><body><DocsShell docs={docs}>{children}</DocsShell></body></html>;
}
