import { cache, isValidElement, type ReactNode } from "react";
import { publicDocs } from "../../.source/server";
import type { Doc } from "./docs-links";

function headingText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headingText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return headingText(node.props.children);
  return "";
}

export const getDocs = cache(async (): Promise<Doc[]> => Promise.all(publicDocs.map(async (doc) => ({
  file: doc.file, topic: doc.topic, category: doc.category, title: doc.title,
  language: doc.language, slug: doc.slug, url: doc.url,
  content: await doc.getText("processed"),
  toc: doc.toc.map((entry) => ({ title: headingText(entry.title), depth: entry.depth, url: entry.url })),
}))));

/** Never include executable MDX components in the serialized Doc contract. */
export function getDocBody(file: string) {
  const doc = publicDocs.find((candidate) => candidate.file === file);
  if (!doc) throw new Error(`Unknown documentation source: ${file}`);
  return doc.body;
}
