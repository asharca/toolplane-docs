import type { Metadata } from "next";
import { DocsPage, DocsTitle, DocsDescription, DocsBody } from "fumadocs-ui/layouts/docs/page";
import { Tabs, Tab } from "fumadocs-ui/components/tabs";
import { Callout } from "fumadocs-ui/components/callout";
import { ApiDocumentation } from "@/components/api-documentation";
import { Reference } from "./reference";
export const metadata: Metadata = { title: "API Reference · Development snapshot" };
export default function ApiReferencePage() {
  return <DocsPage full tableOfContent={{ enabled: false }} tableOfContentPopover={{ enabled: false }} footer={{ enabled: false }} breadcrumb={{ enabled: false }}>
    <DocsTitle>API Reference</DocsTitle>
    <DocsDescription>固定开发版 OpenAPI · Pinned development snapshot</DocsDescription>
    <DocsBody>
      <Callout type="warn">本站描述开发版本，不代表线上稳定版契约。参考页不发送请求；交互调试需要明确选择有权操作的实例。Development documentation, not a stable production contract.</Callout>
      <Tabs items={["接口参考 / Reference", "交互调试 / Playground"]}>
        <Tab><ApiDocumentation /></Tab>
        <Tab><Reference /></Tab>
      </Tabs>
    </DocsBody>
  </DocsPage>;
}
