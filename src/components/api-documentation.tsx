"use client";

import { createOpenAPIPage } from "fumadocs-openapi/ui";
import type { Document } from "fumadocs-openapi";
import snapshot from "../../public/openapi.json";

// The built-in playground persists auth in localStorage. Keep the reference
// read-only; the separately selected request playground disables persistence.
const OpenAPIPage = createOpenAPIPage({ playground: { enabled: false } });
const methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;
const operations = Object.entries(snapshot.paths).flatMap(([path, item]) =>
  methods.filter((method) => method in item).map((method) => ({ path, method })));

export function ApiDocumentation() {
  // JSON imports widen OpenAPI literals such as parameter locations to string.
  return <OpenAPIPage payload={{ bundled: snapshot as unknown as Document }} operations={operations} />;
}
