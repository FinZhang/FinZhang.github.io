import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkTrpg, rehypeArticle } from "./src/lib/markdown.mjs";
import { postsSync } from "./scripts/sync-posts.mjs";

export default defineConfig({
  site: "https://finzhang.space",
  // Copies ../posts into the site on start, and live while `astro dev` runs.
  integrations: [postsSync()],
  // Keep HTML whitespace rules: inline runs like "← 研究 · Institute" rely on their spaces.
  compressHTML: true,
  vite: {
    // PDF.js ships its own worker and top-level await; serve it as-is in dev.
    optimizeDeps: { exclude: ["pdfjs-dist"] },
  },
  markdown: {
    syntaxHighlight: false,
    processor: unified({
      remarkPlugins: [remarkMath, remarkTrpg],
      rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }], rehypeArticle],
    }),
  },
});
