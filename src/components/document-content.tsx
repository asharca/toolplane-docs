"use client";

import { Streamdown, defaultRemarkPlugins } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { remarkHeading } from "fumadocs-core/mdx-plugins/remark-heading";
import { resolveDocLink } from "@/lib/docs-links";

type MarkdownNode = { type?: string; url?: string; children?: MarkdownNode[] };
function documentLinks({ file, links }: { file: string; links: { file: string; url: string }[] }) {
  return function visit(node: MarkdownNode) {
    if (node.url) {
      node.url = resolveDocLink(file, node.url, links, node.type === "image");
      if ((node.url.startsWith("/toolplane-docs/docs/") || node.url.startsWith("#")) && !node.url.includes("#user-content-")) {
        node.url = node.url.replace("#", "#user-content-");
      }
    }
    node.children?.forEach(visit);
  };
}
const blockedHtml = ["base", "embed", "iframe", "link", "meta", "object", "script", "style"];

export function DocumentContent({ content, file, links }: { content: string; file: string; links: { file: string; url: string }[] }) {
  return <Streamdown
    mode="static"
    className="docs-content"
    plugins={{ code, mermaid }}
    disallowedElements={blockedHtml}
    components={{
      a: ({ href, children, node: _node, ...props }) => <a {...props} href={href}
        target={href?.startsWith("/") || href?.startsWith("#") ? undefined : "_blank"}
        rel={href?.startsWith("/") || href?.startsWith("#") ? undefined : "noopener noreferrer"}>{children}</a>,
    }}
    remarkPlugins={[...Object.values(defaultRemarkPlugins), remarkHeading, [documentLinks, { file, links }]]}
  >{content}</Streamdown>;
}
