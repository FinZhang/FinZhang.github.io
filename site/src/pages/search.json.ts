import type { APIRoute } from "astro";
import { fmtDate, getPosts } from "../lib/posts";
import { plainText } from "../lib/markdown.mjs";

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const index = posts.map((p) => ({
    id: p.id,
    t: p.data.title,
    d: fmtDate(p.data.date),
    c: p.data.category,
    g: p.data.tags,
    b: p.data.locked ? "" : plainText(p.body ?? ""),
  }));
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
