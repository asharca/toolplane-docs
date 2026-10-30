import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const config: NextConfig = {
  output: "export",
  basePath: "/toolplane-docs",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};
export default createMDX()(config);
