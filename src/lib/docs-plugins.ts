import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { documentMetadata } from "./docs-metadata";
import { resolveDocLink } from "./docs-links";
import { withoutBase } from "./site";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  attributes?: { type: string; name: string; value: string }[];
  name?: string;
};

export const publicDocPatterns = ["docs/**/*.md", "docs/**/*.mdx", "README.md", "CHANGELOG.md", "infra/firecrawl/README.md"];
export const privateDocPatterns = [
  "!**/[pP][lL][aA][nN][sS]/**", "!**/[aA][gG][eE][nN][tT][sS]{,.*}/**",
  "!**/[cC][lL][aA][uU][dD][eE]{,.*}/**", "!**/[aA][gG][eE][nN][tT][sS]{,.*}",
  "!**/[cC][lL][aA][uU][dD][eE]{,.*}", "!**/.*", "!**/.*/**",
];

/** Resolve Markdown URLs before the image and heading presets transform nodes. */
export function remarkDocumentLinks() {
  return (tree: MarkdownNode, file: { path: string }) => {
    const root = path.join(process.cwd(), "content");
    const source = path.relative(root, file.path).split(path.sep).join("/");
    const links = globSync(publicDocPatterns, { cwd: root })
      .filter((name) => !name.split("/").some((segment) => segment.startsWith(".") || /^(?:plans|agents|claude)(?:\.|$)/i.test(segment)))
      .map((name) => documentMetadata(name, readFileSync(path.join(root, name), "utf8")));
    const visit = (node: MarkdownNode) => {
      if (node.url) {
        node.url = resolveDocLink(source, node.url, links, node.type === "image");
        // The image preset probes public/ on disk, where the deployment prefix is absent.
        if (node.type === "image") node.url = withoutBase(node.url);
      }
      if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
        for (const attribute of node.attributes ?? []) {
          if (attribute.type === "mdxJsxAttribute" && typeof attribute.value === "string" && (attribute.name === "href" || attribute.name === "src")) {
            attribute.value = resolveDocLink(source, attribute.value, links, attribute.name === "src");
          }
        }
      }
      // Legacy .md is plain Markdown, not JSX: never drop literal angle syntax.
      if (source.endsWith(".md") && node.type === "html") node.type = "text";
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

type HtmlNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
};

/** Keep old Streamdown anchors working alongside Fumadocs' canonical heading IDs. */
export function rehypeLegacyHeadingAnchors() {
  return (tree: HtmlNode) => {
    let titleSeen = false;
    const visit = (node: HtmlNode) => {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")) {
        const id = node.properties?.id;
        if (node.tagName === "h1" && !titleSeen) {
          titleSeen = true;
          // DocsTitle owns the visible article title; retain incoming title anchors.
          node.tagName = "span";
          node.children = [];
        }
        if (typeof id === "string" && !id.startsWith("user-content-")) {
          node.children ??= [];
          node.children.push({ type: "element", tagName: "span", properties: { id: `user-content-${id}`, ariaHidden: "true" }, children: [] });
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
