import { getCollection, type CollectionEntry } from "astro:content";
import type { Category } from "../data/site";

export { toRoman } from "./roman";

export type Post = CollectionEntry<"posts">;

/** All posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection("posts");
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id));
}

const pad = (n: number) => String(n).padStart(2, "0");

export const fmtDate = (d: Date) => `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
export const yearOf = (d: Date) => String(d.getUTCFullYear());
export const postUrl = (p: Post) => `/post/${p.id}/`;
export const categoryUrl = (c: Category) => `/category/${c.slug}/`;
export const entriesLabel = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

/** Titles without CJK characters are set in Lora instead of Noto Serif SC. */
export const isLatin = (s: string) => !/[　-鿿가-힯＀-￯]/.test(s);

/** Posts grouped by year, keeping the input order (newest year first for getPosts()). */
export function groupByYear(posts: Post[]) {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    const y = yearOf(p.data.date);
    map.set(y, [...(map.get(y) ?? []), p]);
  }
  return [...map].map(([year, posts]) => ({ year, posts }));
}

export function formatSize(bytes: number) {
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/** Tag counts in order of first appearance. */
export function countTags(posts: Post[]) {
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count }));
}
