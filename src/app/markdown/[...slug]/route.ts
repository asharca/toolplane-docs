import { getDocs } from "@/lib/docs";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getDocs()).map((doc) => ({
    slug: [...doc.slug.slice(0, -1), `${doc.slug.at(-1)}.md`],
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join("/");
  const doc = (await getDocs()).find((candidate) => `${candidate.slug.join("/")}.md` === path);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(doc.content, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
