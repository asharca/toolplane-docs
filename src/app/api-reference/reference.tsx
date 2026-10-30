"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import { APP_URL, sitePath } from "@/lib/site";
import "@scalar/api-reference-react/style.css";

const defaultServer = process.env.NEXT_PUBLIC_API_SERVER || "https://toolplane.example.com";
export function Reference() {
  const { resolvedTheme } = useTheme();
  const [server, setServer] = useState(defaultServer);
  const [draft, setDraft] = useState(defaultServer);
  return <>
    <div className="reference-toolbar space-y-3 text-sm">
      <h1 className="text-xl font-semibold">ToolPlane API Reference · Development snapshot</h1>
      <p>固定开发版 OpenAPI，不是线上稳定版契约。先选择你有权操作的实例；执行请求可能修改真实数据。凭据只应在明确选定目标后输入，不持久保存。</p>
      <p>Pinned development OpenAPI, not a stable production contract. Select an authorized instance before entering credentials or sending requests. Requests may change real data; credentials are not persisted.</p>
      <form className="flex flex-wrap items-center gap-3" onSubmit={(event) => { event.preventDefault(); setServer(draft.replace(/\/+$/, "")); }}>
        <label htmlFor="api-server">Target server / 目标实例</label>
        <input id="api-server" type="url" required value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="https://your-toolplane.example.com" />
        <button className="rounded-md border border-fd-border px-3 py-2" type="submit">Apply / 应用</button>
      </form>
      <p>Active server: <code>{server}</code> · <a className="underline" href={sitePath("/openapi.json")}>Download pinned OpenAPI</a> · <a className="underline" href={`${APP_URL}/docs-api`} target="_blank" rel="noopener noreferrer">Live app reference (version may differ)</a></p>
      <p className="text-fd-muted-foreground">跨域请求由目标实例的 CORS 策略决定；本站不代理凭据或请求。Browser CORS restrictions apply; this site does not proxy requests or credentials.</p>
    </div>
    <ApiReferenceReact key={server} configuration={{
      url: sitePath("/openapi.json"),
      servers: [{ url: server, description: "Explicitly selected instance / 明确选择的实例" }],
      darkMode: resolvedTheme === "dark", hideDarkModeToggle: true,
      withDefaultFonts: false, persistAuth: false, hideClientButton: true,
      agent: { disabled: true }, mcp: { disabled: true }, showDeveloperTools: "never",
      hideTestRequestButton: false,
    }} />
  </>;
}
