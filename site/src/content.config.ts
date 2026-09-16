import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Entries are produced by scripts/sync-posts.mjs from ../posts — edit posts there, not here.
const posts = defineCollection({
  loader: glob({
    pattern: "*/index.md",
    base: "./src/content/posts",
    // Keep the folder name (the post's url_suffix) as-is, including its case.
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(["研究", "杂学", "玩家", "生活"]),
    tags: z.array(z.string()).default([]),
    kind: z.enum(["prose", "pdf"]).default("prose"),
    file: z.string().optional(),
    pages: z.number().optional(),
    sizeBytes: z.number().optional(),
    source: z.string(),
    /** TRPG speaker roles, see remarkTrpg in src/lib/markdown.mjs. */
    cast: z.record(z.string(), z.enum(["keeper", "dice", "player", "guest"])).optional(),
    /** Encrypted post (front matter `encrypt: true`): no body, the page decrypts `cipher`. */
    locked: z.boolean().default(false),
    hint: z.string().optional(),
    cipher: z.object({ v: z.number(), iter: z.number(), salt: z.string(), iv: z.string(), data: z.string() }).optional(),
  }),
});

export const collections = { posts };
