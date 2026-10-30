import { APP_URL, SOURCE_REPO, sitePath } from "./site";

export type Doc = {
  file: string;
  language: "zh" | "en";
  topic: string;
  slug: string[];
  url: string;
  title: string;
  content: string;
  category: "guides" | "developers" | "api";
  toc: { title: string; url: string; depth: number }[];
};
const publicAssets: Record<string, true> = {
  "docs/assets/toolplane-overview.svg": true,
  "docs/sandboxes/docker-compose.ssh.example.yml": true,
  "docs/sandboxes/ssh-targets.example.json": true,
};

export function resolveDocLink(file: string, href: string, docs: Pick<Doc, "file" | "url">[], image = false): string {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(href)) return href;
  if (href.startsWith("/")) {
    if (href === "/api/v1/openapi.json") return sitePath("/openapi.json");
    if (/^\/docs(?:[/?#]|$)/.test(href)) return sitePath(href);
    if (href.startsWith("/toolplane-docs/")) return href;
    return `${APP_URL}${href}`;
  }
  const match = /^([^?#]*)(.*)$/.exec(href);
  if (!match) return href;
  let decoded: string;
  try { decoded = decodeURIComponent(match[1]); } catch { return href; }
  if (decoded.includes("\\")) return href;
  const segments = file.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { if (!segments.length) return href; segments.pop(); }
    else segments.push(segment);
  }
  const target = segments.join("/");
  const suffix = match[2];
  const doc = docs.find((candidate) => candidate.file === target);
  if (doc) return `${sitePath(doc.url)}${suffix}`;
  if (publicAssets[target]) return `${sitePath(`/source/${segments.map(encodeURIComponent).join("/")}`)}${suffix}`;
  const original = image ? "https://raw.githubusercontent.com/asharca/ToolPlane/main" : `${SOURCE_REPO}/blob/main`;
  return `${original}/${segments.map(encodeURIComponent).join("/")}${suffix}`;
}
