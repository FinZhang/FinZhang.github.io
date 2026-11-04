import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getPosts, postUrl, type Post } from "../lib/posts";
import { plainText } from "../lib/markdown.mjs";
import { SITE } from "../data/site";

/** How many of the newest posts the feed carries. */
const LIMIT = 30;
/** Summary length in characters. */
const SUMMARY = 200;

function summary(p: Post) {
  if (p.data.locked) return "🔒 加密文章，请到博客内输入密码阅读。";
  if (p.data.kind === "pdf") return p.data.pages ? `PDF 文档，共 ${p.data.pages} 页。` : "PDF 文档。";
  const text = plainText(p.body ?? "");
  return text.length > SUMMARY ? `${text.slice(0, SUMMARY)}…` : text;
}

export const GET: APIRoute = async (context) => {
  const posts = (await getPosts()).slice(0, LIMIT);
  return rss({
    title: SITE.title,
    description: SITE.bio,
    site: context.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      link: postUrl(p),
      pubDate: p.data.date,
      categories: [p.data.category, ...p.data.tags],
      description: summary(p),
    })),
    customData: "<language>zh-CN</language>",
  });
};
