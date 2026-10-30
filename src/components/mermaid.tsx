"use client";

import { use, useId, useSyncExternalStore } from "react";

const subscribeClient = () => () => {};
const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, create: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing as Promise<T>;
  const promise = create();
  cache.set(key, promise);
  return promise;
}
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Official Fumadocs Mermaid recipe, using Mermaid's strict SVG security mode. */
export function Mermaid({ chart }: { chart: string }) {
  const isClient = useSyncExternalStore(subscribeClient, () => true, () => false);
  return isClient ? <MermaidContent chart={chart} /> : null;
}
function MermaidContent({ chart }: { chart: string }) {
  const id = useId().replaceAll(":", "");
  const theme = useSyncExternalStore<"dark" | "default">(subscribeTheme, () => document.documentElement.classList.contains("dark") ? "dark" : "default", () => "default");
  const { default: mermaid } = use(cached("mermaid", () => import("mermaid")));
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", fontFamily: "inherit", theme });
  const { svg, bindFunctions } = use(cached(`${chart}-${theme}`, () => mermaid.render(id, chart.replaceAll("\\n", "\n"))));
  return <div className="my-6 overflow-x-auto" ref={(container) => { if (container) bindFunctions?.(container); }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
