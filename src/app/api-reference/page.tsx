import type { Metadata } from "next";
import { DocsPage } from "fumadocs-ui/layouts/docs/page";
import { Reference } from "./reference";
export const metadata: Metadata = { title: "API Reference · Development snapshot" };
export default function ApiReferencePage() {
  return <DocsPage full tableOfContent={{ enabled: false }} tableOfContentPopover={{ enabled: false }} footer={{ enabled: false }} breadcrumb={{ enabled: false }}><Reference /></DocsPage>;
}
