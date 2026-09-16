// Copies ../posts (the author's working folder) into src/content/posts and public/files,
// normalising front matter so the site never has to deal with folder names or legacy fields.
//
//   posts/<name>.md                -> src/content/posts/<slug>/index.md
//   posts/<name>/index.md + images -> src/content/posts/<slug>/index.md + images (max 2000px wide)
//   PDFs referenced by <embed>     -> public/files/<slug>/<file>.pdf  (kind: pdf)
//   posts with `encrypt: true`     -> locked/<slug>.json, encrypted (see lock-posts.mjs); the
//                                     collection entry gets only the public front matter
//
// It runs as an Astro integration (see astro.config.mjs): once whenever Astro starts, and during
// `astro dev` again on every change under ../posts, so edits there show up in the browser.
// `npm run sync` runs it once on its own; `npm run sync -- --watch` keeps it watching.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { lockPost, lockedSlugs, readLocked, removeLocked } from "./lock-posts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.resolve(root, "..", "posts");
const OUT = path.join(root, "src", "content", "posts");
const FILES = path.join(root, "public", "files");

const CATEGORIES = ["研究", "杂学", "玩家", "生活"];

// Windows paths are case-insensitive: after a slug is renamed to lower case the old folder is
// still the same directory, so rename it explicitly and compare names case-insensitively.
const canon = (name) => name.toLowerCase();

/** Copies a file unless an up-to-date copy exists. Returns whether it wrote. */
function copyIfChanged(from, to) {
  const s = fs.statSync(from);
  if (fs.existsSync(to)) {
    const d = fs.statSync(to);
    if (d.size === s.size && d.mtimeMs >= s.mtimeMs) return false;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

// Images wider than this are scaled down when copied. The text column is 700px, so this is enough
// for high-density screens and for zooming in the image viewer. Astro turns the copy into WebP at
// build time; the originals in ../posts are never touched.
const MAX_IMAGE_WIDTH = 2000;
const RESIZABLE = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Width as displayed, i.e. after the EXIF orientation is applied. */
const shownWidth = (meta) => ((meta.orientation ?? 1) >= 5 ? meta.height : meta.width);

/**
 * Copies an image, scaling it down to MAX_IMAGE_WIDTH if it is wider. The copy gets the source's
 * mtime, so an unchanged source whose copy is already narrow enough is skipped.
 * Returns whether it wrote.
 */
async function copyImageIfChanged(from, to) {
  const s = fs.statSync(from);
  if (fs.existsSync(to) && Math.abs(fs.statSync(to).mtimeMs - s.mtimeMs) < 1) {
    const meta = await sharp(to).metadata().catch(() => null);
    if (!meta || shownWidth(meta) <= MAX_IMAGE_WIDTH) return false;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const meta = await sharp(from).metadata().catch(() => null);
  if (meta && shownWidth(meta) > MAX_IMAGE_WIDTH) {
    // High quality: Astro compresses it again when it makes the WebP.
    await sharp(from)
      .rotate()
      .resize({ width: MAX_IMAGE_WIDTH })
      .keepIccProfile()
      // (For PNG, a quality option would reduce it to a palette, so PNG keeps its defaults.)
      .toFormat(meta.format, meta.format === "png" ? {} : { quality: 92 })
      .toFile(to);
  } else {
    fs.copyFileSync(from, to);
  }
  fs.utimesSync(to, s.atime, s.mtime);
  return true;
}

/** Writes text unless the file already holds it. Returns whether it wrote. */
function writeIfChanged(to, text) {
  if (fs.existsSync(to) && fs.readFileSync(to, "utf8") === text) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, text);
  return true;
}

/** A .gitignore pattern for a name directly inside the folder that holds the .gitignore. */
const ignorePattern = (name) => `/${name.replace(/[\\*?[\]!#]/g, "\\$&").replace(/ $/, "\\ ")}`;

const IGNORE_HEADER = [
  "# Encrypted posts, kept out of git so their plain text is never published. Maintained by",
  "# site/scripts/sync-posts.mjs; the encrypted copies are committed in site/locked/.",
];

/**
 * Adds encrypted posts to ../posts/.gitignore. An entry is dropped only when its post is present
 * and no longer encrypted, so a checkout without the plain text never loses one.
 */
function updateGitignore(lockedSources, plainSources) {
  const file = path.join(SRC, ".gitignore");
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"))
    : [];
  const plain = new Set(plainSources.map(ignorePattern));
  const lines = [...new Set([...existing.filter((l) => !plain.has(l)), ...lockedSources.map(ignorePattern)])].sort();
  if (!lines.length && !fs.existsSync(file)) return false;
  return writeIfChanged(file, `${[...IGNORE_HEADER, ...lines].join("\n")}\n`);
}

function fixCase(parent, name) {
  if (!fs.existsSync(parent)) return;
  const found = fs.readdirSync(parent).find((n) => canon(n) === canon(name) && n !== name);
  if (!found) return;
  const temp = path.join(parent, `${found}.renaming`);
  fs.renameSync(path.join(parent, found), temp);
  fs.renameSync(temp, path.join(parent, name));
}

// Page counts are cached per file version: loading a large PDF on every save would be slow.
const pageCounts = new Map();
async function countPages(file) {
  const { size, mtimeMs } = fs.statSync(file);
  const key = `${file}:${size}:${mtimeMs}`;
  if (pageCounts.has(key)) return pageCounts.get(key);
  const bytes = fs.readFileSync(file);
  let pages;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pages = doc.getPageCount();
  } catch {
    const m = bytes.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
    pages = m ? m.length : undefined;
  }
  pageCounts.set(key, pages);
  return pages;
}

function ymd(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function cleanBody(body) {
  return body
    // The PDF is rendered by the post template.
    .replace(/<embed\b[^>]*\.pdf[^>]*>\s*/gi, "")
    // The table of contents lives in the sidebar.
    .replace(/^\s*<!--\s*toc\s*-->\s*$/gim, "")
    // Stray lone backticks and zero-width spaces left over from the old site.
    .replace(/^\s*`\s*$/gm, "")
    // "​    text" was a zero-width space used to indent a paragraph; without the space the
    // indentation would turn the line into a code block, so drop both.
    .replace(/^​[ \t​]*/gm, "")
    .replace(/​/g, "");
}

// PDF.js runtime data (CJK cMaps, standard fonts, image decoders) for the in-page PDF reader.
function copyPdfjsAssets() {
  const pdfjs = path.join(root, "node_modules", "pdfjs-dist");
  const copyDir = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copyDir(path.join(from, e.name), path.join(to, e.name));
      else copyIfChanged(path.join(from, e.name), path.join(to, e.name));
    }
  };
  for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    if (fs.existsSync(path.join(pdfjs, dir))) copyDir(path.join(pdfjs, dir), path.join(root, "public", "pdfjs", dir));
  }
}

/**
 * Brings src/content/posts and public/files in line with ../posts.
 * Returns the number of posts and a list of what actually changed.
 */
export async function syncPosts({ assets = true } = {}) {
  if (!fs.existsSync(SRC)) throw new Error(`posts folder not found: ${SRC}`);

  const seen = new Map();
  const changed = [];
  const lockedSources = [];
  const plainSources = [];
  const lockedHere = new Set();

  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    const full = path.join(SRC, entry.name);
    let mdPath;
    let assetDir = null;
    if (entry.isFile() && entry.name.endsWith(".md")) {
      mdPath = full;
    } else if (entry.isDirectory() && fs.existsSync(path.join(full, "index.md"))) {
      mdPath = path.join(full, "index.md");
      assetDir = full;
    } else {
      continue;
    }

    const { data, content } = matter(fs.readFileSync(mdPath, "utf8"));
    const rel = path.relative(SRC, mdPath);
    if (!data.title || !data.date) throw new Error(`${rel}: front matter needs title and date`);

    const category = data.category ?? (Array.isArray(data.categories) ? data.categories[0] : data.categories);
    if (!CATEGORIES.includes(category)) {
      throw new Error(`${rel}: category must be one of ${CATEGORIES.join(" / ")}, got "${category}"`);
    }

    const slug = String(data.slug ?? data.url_suffix ?? `post-${ymd(data.date)}`);
    if (seen.has(slug)) throw new Error(`${rel}: slug "${slug}" is already used by ${seen.get(slug)}`);
    seen.set(slug, rel);

    const fm = {
      title: String(data.title),
      date: new Date(data.date),
      category,
      tags: (Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : []).map(String),
      kind: data.kind ?? "prose",
      source: rel.replace(/\\/g, "/"),
    };
    if (data.cast) fm.cast = data.cast;

    // The whole folder (or the .md file) is kept out of git, images included.
    const source = assetDir ? `${entry.name}/` : entry.name;
    if (data.encrypt) {
      if (data.password == null || String(data.password) === "") throw new Error(`${rel}: encrypt: true needs a password`);
      if (data.file || /<embed\b[^>]*\.pdf/i.test(content)) throw new Error(`${rel}: PDF posts can't be encrypted`);
      lockedSources.push(source);
      lockedHere.add(slug);
      fm.locked = true;
      if (data.hint) fm.hint = String(data.hint);
      // Through JSON, so the date reads the same as in the committed copy.
      const publicFm = JSON.parse(JSON.stringify(fm));
      if (await lockPost({ slug, fm: publicFm, password: String(data.password), body: cleanBody(content), assetDir })) {
        changed.push(`locked/${slug}.json`);
      }
      continue; // The collection entry is written from locked/ below.
    }
    plainSources.push(source);
    if (removeLocked(slug)) changed.push(`removed locked/${slug}.json`);

    const pdf = data.file ?? content.match(/<embed\b[^>]*src=["']([^"']+\.pdf)["']/i)?.[1];
    if (pdf) {
      const pdfPath = path.join(assetDir ?? SRC, pdf);
      if (!fs.existsSync(pdfPath)) throw new Error(`${rel}: PDF not found: ${pdf}`);
      fm.kind = "pdf";
      fm.file = path.basename(pdf);
      fm.sizeBytes = data.sizeBytes ?? fs.statSync(pdfPath).size;
      const pages = data.pages ?? (await countPages(pdfPath));
      if (pages) fm.pages = pages;
      fixCase(FILES, slug);
      if (copyIfChanged(pdfPath, path.join(FILES, slug, fm.file))) changed.push(path.join(rel, "..", fm.file));
    }

    fixCase(OUT, slug);
    const dest = path.join(OUT, slug);
    if (writeIfChanged(path.join(dest, "index.md"), matter.stringify(cleanBody(content), fm))) changed.push(rel);

    if (assetDir) {
      for (const f of fs.readdirSync(assetDir)) {
        if (f === "index.md" || f.toLowerCase().endsWith(".pdf")) continue;
        const copy = RESIZABLE.has(path.extname(f).toLowerCase()) ? copyImageIfChanged : copyIfChanged;
        if (await copy(path.join(assetDir, f), path.join(dest, f))) changed.push(path.join(entry.name, f));
      }
    }
  }

  if (updateGitignore(lockedSources, plainSources)) changed.push("posts/.gitignore");

  // Encrypted posts come from their committed copies, the only source in a checkout such as CI.
  // Their entries carry no text, just the cipher in the front matter for the page to embed.
  for (const slug of lockedSlugs()) {
    const { fm, cipher } = readLocked(slug);
    if (seen.has(slug) && !lockedHere.has(slug)) {
      throw new Error(`locked/${slug}.json: slug "${slug}" is already used by ${seen.get(slug)}`);
    }
    seen.set(slug, fm.source);
    fixCase(OUT, slug);
    const dest = path.join(OUT, slug);
    // Images copied before the post was encrypted.
    if (fs.existsSync(dest)) {
      for (const f of fs.readdirSync(dest)) if (f !== "index.md") fs.rmSync(path.join(dest, f), { recursive: true, force: true });
    }
    if (writeIfChanged(path.join(dest, "index.md"), matter.stringify("", { ...fm, cipher }))) changed.push(fm.source);
  }

  // Drop posts that were removed or renamed at the source.
  const keep = new Set([...seen.keys()].map(canon));
  for (const dir of [OUT, FILES]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (keep.has(canon(name))) continue;
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      if (dir === OUT) changed.push(`removed ${name}`);
    }
  }

  if (assets) copyPdfjsAssets();
  return { count: seen.size, changed };
}

/**
 * Re-syncs whenever something under ../posts changes. Saves arrive in bursts (editors write
 * temp files, images land one by one), so changes are gathered for a moment first.
 * A broken post is reported and skipped over; the watcher keeps running.
 */
export function watchPosts(log) {
  let timer;
  let running = false;
  let again = false;

  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const { changed } = await syncPosts({ assets: false });
      if (changed.length) {
        const shown = changed.slice(0, 4).map((c) => c.replace(/\\/g, "/")).join(", ");
        log.info(`synced ${shown}${changed.length > 4 ? ` and ${changed.length - 4} more` : ""}`);
      }
    } catch (err) {
      log.error(err.message);
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  };

  return fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  });
}

/** Astro integration: sync on start, and keep ../posts watched while the dev server runs. */
export function postsSync() {
  let watcher;
  return {
    name: "carillon:posts",
    hooks: {
      "astro:config:setup": async ({ logger }) => {
        const { count } = await syncPosts();
        logger.info(`${count} posts synced from ${SRC}`);
      },
      "astro:server:setup": ({ logger }) => {
        watcher?.close();
        watcher = watchPosts(logger);
        logger.info(`watching ${SRC} for changes`);
      },
      "astro:server:done": () => {
        watcher?.close();
        watcher = undefined;
      },
    },
  };
}

// Command line: `node scripts/sync-posts.mjs [--watch]`
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const log = { info: (m) => console.log(`[sync-posts] ${m}`), error: (m) => console.error(`[sync-posts] ${m}`) };
  syncPosts()
    .then(({ count }) => {
      log.info(`${count} posts synced from ${SRC}`);
      if (process.argv.includes("--watch")) {
        watchPosts(log);
        log.info("watching for changes (Ctrl+C to stop)");
      }
    })
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
