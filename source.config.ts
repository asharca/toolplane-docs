import path from "node:path";
import { defineCollections, defineConfig } from "fumadocs-mdx/config";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { z } from "zod";
import { documentMetadata } from "./src/lib/docs-metadata";
import { publicDocPatterns, privateDocPatterns, remarkDocumentLinks, rehypeLegacyHeadingAnchors } from "./src/lib/docs-plugins";

export const publicDocs = defineCollections({
  type: "doc",
  dir: "content",
  files: [...publicDocPatterns, ...privateDocPatterns],
  postprocess: { includeProcessedMarkdown: { headingIds: false } },
  schema: (ctx) => z.object({}).transform(() => {
    const file = path.relative(path.join(process.cwd(), "content"), ctx.path).split(path.sep).join("/");
    return documentMetadata(file, ctx.source);
  }),
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (defaults) => [remarkDocumentLinks, ...defaults, remarkMdxMermaid],
    rehypePlugins: [rehypeLegacyHeadingAnchors],
    // Images already resolve to static Pages assets or the original source repository.
    remarkImageOptions: { useImport: false },
  },
});
