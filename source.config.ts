import path from "node:path";
import { defineCollections, defineConfig } from "fumadocs-mdx/config";
import { z } from "zod";
import type { Doc } from "./src/lib/docs-links";

// Keep the original public URL classification, including nested source paths.
const categories: Record<string, Doc["category"]> = {
  AGENT_PUBLIC_API: "api", AGENT_CONTROL_MCP: "api", A2A_NATIVE: "api",
  A2A_MCP_BRIDGE: "api", REMOTE_MCP_HTTP: "api", ARCHITECTURE: "developers",
  AGENT_RUNTIMES: "developers", RELEASES: "developers", UI_LIBRARY: "developers",
  RUNTIME_OPERATIONS: "developers", OBSERVABILITY: "developers",
  A2A_VALIDATION: "developers", A2A_E2E_VALIDATION: "developers",
  A2A_RESOURCE_LIMITS: "developers", A2A_LOCAL_COLLABORATION: "developers",
};

export const publicDocs = defineCollections({
  type: "doc",
  dir: "content",
  files: ["docs/**/*.md", "README.md", "CHANGELOG.md", "infra/firecrawl/README.md",
    "!**/[pP][lL][aA][nN][sS]/**", "!**/[aA][gG][eE][nN][tT][sS]{,.*}/**",
    "!**/[cC][lL][aA][uU][dD][eE]{,.*}/**", "!**/[aA][gG][eE][nN][tT][sS]{,.*}",
    "!**/[cC][lL][aA][uU][dD][eE]{,.*}", "!**/.*", "!**/.*/**"],
  postprocess: { includeProcessedMarkdown: { headingIds: false } },
  schema: (ctx) => z.object({}).transform(() => {
    const file = path.relative(path.join(process.cwd(), "content"), ctx.path).split(path.sep).join("/");
    const stem = path.posix.basename(file, ".md");
    const explicitLanguage = /\.(en|zh-CN)$/.exec(stem)?.[1];
    const topic = file.replace(/(?:\.(?:en|zh-CN))?\.md$/, "");
    const name = path.posix.basename(topic);
    const category = Object.hasOwn(categories, name) ? categories[name] : file === "CHANGELOG.md" ? "developers" : "guides";
    const title = /^#\s+(.+?)\s*#*\s*$/m.exec(ctx.source)?.[1] ?? stem;
    const language: Doc["language"] = explicitLanguage ? explicitLanguage === "en" ? "en" : "zh" : /\p{Script=Han}/u.test(title) ? "zh" : "en";
    const slug = [language, category, ...topic.split("/")];
    return { file, topic, category, title, language, slug, url: `/docs/${slug.map(encodeURIComponent).join("/")}` };
  }),
});

export default defineConfig();
