// The Markdown pipeline, shared by astro.config.mjs and scripts/lock-posts.mjs (which renders
// encrypted posts ahead of time), so both produce the same HTML.
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkTrpg, rehypeArticle } from "./markdown.mjs";

export const remarkPlugins = [remarkMath, remarkTrpg];
export const rehypePlugins = [[rehypeKatex, { strict: false, throwOnError: false }], rehypeArticle];
