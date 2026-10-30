import { Suspense, type ComponentProps } from "react";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { getDocBody } from "@/lib/docs";
import { sitePath, withoutBase } from "@/lib/site";
import { Mermaid } from "./mermaid";

const components = {
  ...defaultMdxComponents,
  a: ({ href, ...props }: ComponentProps<typeof defaultMdxComponents.a>) => <defaultMdxComponents.a {...props} href={href ? withoutBase(href) : href} />,
  Card: ({ href, ...props }: ComponentProps<typeof defaultMdxComponents.Card>) => <defaultMdxComponents.Card {...props} href={href ? withoutBase(href) : href} />,
  img: ({ src, ...props }: ComponentProps<typeof defaultMdxComponents.img>) => <defaultMdxComponents.img {...props} src={typeof src === "string" ? sitePath(src) : src} />,
  Tab,
  Tabs,
  Step,
  Steps,
  Mermaid: ({ chart }: { chart: string }) => <Suspense><Mermaid chart={chart} /></Suspense>,
};

/** Compiled MDX stays server-side; navigation and search receive only Doc metadata. */
export function DocumentContent({ file }: { file: string }) {
  const Body = getDocBody(file);
  return <Body components={components} />;
}
