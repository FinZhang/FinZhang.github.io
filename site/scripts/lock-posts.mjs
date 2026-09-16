// Encrypted posts: front matter `encrypt: true`, `password` and an optional `hint`.
//
// The site is built by GitHub Actions from the repository, and those posts are kept out of it
// (sync-posts.mjs lists them in ../posts/.gitignore). So they are rendered here, on the author's
// machine, with the site's own Markdown pipeline, and only the result is committed — encrypted —
// as locked/<slug>.json. Images are embedded in the encrypted HTML, so they are protected too.
// The build reads just that file; the page decrypts it in the browser once the password is given.
//
//   locked/<slug>.json = { fm: public front matter, cipher: { v, iter, salt, iv, data } }
//   decrypted data     = { html, headings: [{ depth, slug, text }] }
//
// PBKDF2-SHA256 derives an AES-256-GCM key from the password; src/scripts/locked-post.ts mirrors it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import sharp from "sharp";
import { remarkPlugins, rehypePlugins } from "../src/lib/markdown-plugins.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCKED = path.join(root, "locked");

const ITERATIONS = 250_000;
// Embedded images are capped at this width (the text column is 700px) and stored as WebP.
const MAX_IMAGE_WIDTH = 1600;

const { subtle } = globalThis.crypto;
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const unb64 = (text) => new Uint8Array(Buffer.from(text, "base64"));

async function deriveKey(password, salt, iter) {
  const base = await subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { v: 1, iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) };
}

/** The plain text, or null when the password doesn't open it. */
async function decrypt(cipher, password) {
  try {
    const key = await deriveKey(password, unb64(cipher.salt), cipher.iter);
    const data = await subtle.decrypt({ name: "AES-GCM", iv: unb64(cipher.iv) }, key, unb64(cipher.data));
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}

/** Replaces local images with WebP data URLs, so they travel inside the encrypted HTML. */
function rehypeInlineImages({ dir }) {
  return async (tree) => {
    const images = [];
    const walk = (n) => {
      if (n.type === "element" && n.tagName === "img") images.push(n);
      n.children?.forEach(walk);
    };
    walk(tree);
    for (const img of images) {
      const src = String(img.properties?.src ?? "");
      if (!src || /^([a-z]+:|\/|#)/i.test(src)) continue;
      const file = path.join(dir ?? "", decodeURI(src));
      if (!dir || !fs.existsSync(file)) throw new Error(`image not found: ${src}`);
      const { data, info } = await sharp(file)
        .rotate()
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      Object.assign(img.properties, {
        src: `data:image/webp;base64,${b64(data)}`,
        width: info.width,
        height: info.height,
        loading: "lazy",
        decoding: "async",
      });
    }
  };
}

async function render(body, fm, assetDir) {
  const processor = await createMarkdownProcessor({
    syntaxHighlight: false,
    remarkPlugins,
    rehypePlugins: [...rehypePlugins, [rehypeInlineImages, { dir: assetDir }]],
  });
  const { code, metadata } = await processor.render(body, { frontmatter: fm });
  return JSON.stringify({ html: code, headings: metadata.headings.map(({ depth, slug, text }) => ({ depth, slug, text })) });
}

const fileOf = (slug) => path.join(LOCKED, `${slug}.json`);

export function readLocked(slug) {
  const file = fileOf(slug);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** Slugs of all committed encrypted posts. */
export function lockedSlugs() {
  if (!fs.existsSync(LOCKED)) return [];
  return fs.readdirSync(LOCKED).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export function removeLocked(slug) {
  const file = fileOf(slug);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

// Renders and PBKDF2 are slow enough to notice on every save in `astro dev`; skip unchanged posts.
const done = new Map();

/**
 * Renders and encrypts a post into locked/<slug>.json. A fresh salt would change the file on
 * every run, so an existing file is kept when it already decrypts to the same content.
 * Returns whether it wrote.
 */
export async function lockPost({ slug, fm, password, body, assetDir }) {
  const assets = assetDir
    ? fs.readdirSync(assetDir).map((f) => `${f}:${fs.statSync(path.join(assetDir, f)).mtimeMs}`)
    : [];
  const stamp = JSON.stringify([fm, password, body, assets]);
  if (done.get(slug) === stamp && fs.existsSync(fileOf(slug))) return false;

  const plain = await render(body, fm, assetDir);
  const existing = readLocked(slug);
  if (existing && JSON.stringify(existing.fm) === JSON.stringify(fm) && (await decrypt(existing.cipher, password)) === plain) {
    done.set(slug, stamp);
    return false;
  }
  fs.mkdirSync(LOCKED, { recursive: true });
  fs.writeFileSync(fileOf(slug), `${JSON.stringify({ fm, cipher: await encrypt(plain, password) }, null, 1)}\n`);
  done.set(slug, stamp);
  return true;
}
