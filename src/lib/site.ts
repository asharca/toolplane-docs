export const BASE_PATH = "/toolplane-docs";
export const SITE_URL = "https://asharca.github.io/toolplane-docs";
export const APP_URL = "https://tp.rhzy.ai";
export const SOURCE_REPO = "https://github.com/asharca/ToolPlane";
export const DOCS_REPO = "https://github.com/asharca/toolplane-docs";

/** Native anchors/assets need the prefix; Next Link/router add it themselves. */
export function sitePath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`)
    ? `${BASE_PATH}${path}` : path;
}
export function withoutBase(path: string): string {
  return path === BASE_PATH ? "/" : path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
}
