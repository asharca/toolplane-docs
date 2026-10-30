import path from "node:path";
import type { Doc } from "./docs-links";

const categories: Record<string, Doc["category"]> = {
  AGENT_PUBLIC_API: "api", AGENT_CONTROL_MCP: "api", A2A_NATIVE: "api",
  A2A_MCP_BRIDGE: "api", REMOTE_MCP_HTTP: "api", ARCHITECTURE: "developers",
  AGENT_RUNTIMES: "developers", RELEASES: "developers", UI_LIBRARY: "developers",
  RUNTIME_OPERATIONS: "developers", OBSERVABILITY: "developers",
  A2A_VALIDATION: "developers", A2A_E2E_VALIDATION: "developers",
  A2A_RESOURCE_LIMITS: "developers", A2A_LOCAL_COLLABORATION: "developers",
  DOCS_AUTHORING: "developers",
};

/** Shared by collection metadata and compile-time source-link resolution. */
export function documentMetadata(file: string, source: string) {
  const stem = path.posix.basename(file).replace(/\.mdx?$/, "");
  const explicitLanguage = /\.(en|zh-CN)$/.exec(stem)?.[1];
  const topic = file.replace(/(?:\.(?:en|zh-CN))?\.mdx?$/, "");
  const name = path.posix.basename(topic);
  const category = Object.hasOwn(categories, name) ? categories[name] : file === "CHANGELOG.md" ? "developers" : "guides";
  const title = /^#\s+(.+?)\s*#*\s*$/m.exec(source)?.[1] ?? stem;
  const language: Doc["language"] = explicitLanguage ? explicitLanguage === "en" ? "en" : "zh" : /\p{Script=Han}/u.test(title) ? "zh" : "en";
  const slug = [language, category, ...topic.split("/")];
  return { file, topic, category, title, language, slug, url: `/docs/${slug.map(encodeURIComponent).join("/")}` };
}
