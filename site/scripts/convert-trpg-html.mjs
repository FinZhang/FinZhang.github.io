// One-off migration: TRPG chat logs written as HTML (<div class="chat-item">…) → ```trpg blocks.
//
//   node scripts/convert-trpg-html.mjs           dry run: convert in memory and verify
//   node scripts/convert-trpg-html.mjs --write   back up originals to ../posts-html-backup and rewrite
//
// The block format (rendered by remarkTrpg in src/lib/markdown.mjs):
//
//   ```trpg
//   @KP 21:45:32
//   first paragraph
//   second paragraph
//
//   @零崎人识
//   （感觉剧情像outlast
//   ```
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS = path.resolve(root, "..", "posts");
const BACKUP = path.resolve(root, "..", "posts-html-backup");
const WRITE = process.argv.includes("--write");
const OPEN = '<div class="chat-item';
const TIME = /\s+((?:\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}(?::\d{2})?)$/;
const DICE = /^(bot|dice|骰娘|投骰姬|骰子)/i;

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
const stripTags = (s) => decode(s.replace(/<[^>]*>/g, ""));

function itemEnd(text, start) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(text)); ) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return -1;
}

// Some old logs miss a closing </div>, which nests the following messages inside it.
// A message therefore ends at its balanced </div> or at the next message, whichever comes first.
function messageEnd(text, start) {
  const balanced = itemEnd(text, start);
  const next = text.indexOf(OPEN, start + OPEN.length);
  if (next !== -1 && (balanced === -1 || next < balanced)) return next;
  return balanced === -1 ? text.length : balanced;
}

const STRAY = /^(?:\s|<\/div>)*/;

function parseItem(html) {
  const isBot = /^<div class="chat-item[^"]*\b(chat-user-)?bot/i.test(html);
  let name = "";
  let time = "";
  let body;
  const nameSpan = html.match(/<span class="chat-item-name">([\s\S]*?)<\/span>/);
  if (nameSpan) {
    name = stripTags(nameSpan[1]).trim();
    time = stripTags(html.match(/<span class="chat-item-time">([\s\S]*?)<\/span>/)?.[1] ?? "").trim();
    body = html.replace(/<div class="meta">[\s\S]*?<\/div>/, "");
  } else {
    const meta = html.match(/<span class="meta">([\s\S]*?)<\/span>/);
    const label = stripTags(meta?.[1] ?? "").trim();
    const t = label.match(TIME);
    name = t ? label.slice(0, t.index).trim() : label;
    time = t ? t[1] : "";
    body = meta ? html.replace(meta[0], () => "") : html;
  }
  const lines = decode(
    body
      .replace(/^<div[^>]*>/, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("@") ? `\\${l}` : l));
  return { name, time, lines, isBot };
}

function convert(src) {
  const fm = src.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)?.[0] ?? "";
  const original = src
    .slice(fm.length)
    .replace(/<style id="color-theme">[\s\S]*?<\/style>\s*/g, "")
    // An unclosed <style> left at the end of one export.
    .replace(/<style>\s*$/, "")
    // Exporter wrapper around a whole log; its closing tag is skipped as a stray </div>.
    .replace(/<div class="chat-log"[^>]*>\s*/g, "");
  const body = original.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g, (_, d, t) => `\n\n${"#".repeat(Number(d))} ${stripTags(t).trim()}\n\n`);

  const chunks = [];
  const bots = new Set();
  let items = 0;
  let i = 0;
  const pushText = (text) => chunks.push(text.replace(/\n{3,}/g, "\n\n"));

  for (;;) {
    const start = body.indexOf(OPEN, i);
    if (start === -1) {
      pushText(body.slice(i));
      break;
    }
    pushText(body.slice(i, start).replace(/\s*$/, start ? "\n\n" : ""));

    const group = [];
    let pos = start;
    for (;;) {
      const end = messageEnd(body, pos);
      group.push(parseItem(body.slice(pos, end)));
      pos = end;
      const gap = body.slice(pos).match(STRAY)[0].length;
      if (!body.startsWith(OPEN, pos + gap)) break;
      pos += gap;
    }
    items += group.length;
    for (const it of group) if (it.isBot && it.name && !DICE.test(it.name)) bots.add(it.name);

    const fence = group.some((it) => it.lines.some((l) => l.startsWith("```"))) ? "````" : "```";
    const block = group.map((it) => [`@${[it.name, it.time].filter(Boolean).join(" ")}`, ...it.lines].join("\n")).join("\n\n");
    chunks.push(`${fence}trpg\n${block}\n${fence}`);
    i = pos;
    // Make sure whatever follows starts on a fresh paragraph.
    const rest = body.slice(i);
    const lead = rest.match(STRAY)[0].length;
    i += lead;
    if (lead < rest.length) chunks.push("\n\n");
  }

  let frontmatter = fm;
  if (bots.size) {
    const cast = [...bots].map((b) => `  "${b}": dice`).join("\n");
    frontmatter = fm.replace(/\r?\n---\r?\n$/, `\ncast:\n${cast}\n---\n`);
  }
  const out = frontmatter + chunks.join("").replace(/\s*$/, "\n");

  // Verify: identical text once markup, markers and whitespace are removed.
  const flat = (s) => s.replace(/^#{1,6} /gm, "").replace(/\s+/g, "");
  const before = flat(stripTags(original.replace(/<br\s*\/?>|<\/?(p|div|h[1-6])\b[^>]*>/gi, "\n")));
  const after = flat(
    out
      .slice(frontmatter.length)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^`{3,4}(trpg)?$/gm, "")
      .replace(/^(\\)?@/gm, (_, escaped) => (escaped ? "@" : "")),
  );
  let diff = -1;
  for (let k = 0; k < Math.max(before.length, after.length); k++) {
    if (before[k] !== after[k]) {
      diff = k;
      break;
    }
  }
  const expected = (original.match(/<div class="chat-item/g) ?? []).length;
  return { out, items, expected, diff, before, after, bots: [...bots] };
}

const files = [];
for (const entry of fs.readdirSync(POSTS, { withFileTypes: true })) {
  const p = entry.isDirectory() ? path.join(POSTS, entry.name, "index.md") : path.join(POSTS, entry.name);
  if (p.endsWith(".md") && fs.existsSync(p) && fs.readFileSync(p, "utf8").includes(OPEN)) files.push(p);
}

let failed = false;
for (const file of files) {
  const rel = path.relative(POSTS, file);
  const src = fs.readFileSync(file, "utf8");
  const r = convert(src);
  const ok = r.diff === -1 && r.items === r.expected;
  console.log(`${ok ? "ok  " : "FAIL"} ${rel}: ${r.items}/${r.expected} messages, ${src.length} → ${r.out.length} chars${r.bots.length ? `, cast dice: ${r.bots.join(", ")}` : ""}`);
  if (!ok) {
    failed = true;
    if (r.diff !== -1) console.log(`     text differs at ${r.diff}:\n     before …${r.before.slice(Math.max(0, r.diff - 40), r.diff + 40)}\n     after  …${r.after.slice(Math.max(0, r.diff - 40), r.diff + 40)}`);
    continue;
  }
  if (WRITE) {
    const backup = path.join(BACKUP, rel);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, src);
    fs.writeFileSync(file, r.out);
  }
}
if (!files.length) console.log("No HTML chat logs found.");
else if (!WRITE && !failed) console.log("Dry run only. Re-run with --write to back up and rewrite these files.");
process.exit(failed ? 1 : 0);
