// Markdown transforms that give posts the journal layout from the design handoff.

const isEl = (node, tag) => node?.type === "element" && (!tag || node.tagName === tag);
const classes = (node) => {
  const c = node?.properties?.className;
  return Array.isArray(c) ? c : typeof c === "string" ? c.split(" ") : [];
};
const addClass = (node, name) => {
  node.properties ??= {};
  node.properties.className = [...classes(node), name];
};
const isBlank = (node) => node.type === "text" && !node.value.trim();

function walk(node, fn) {
  fn(node);
  if (node.children) for (const child of node.children) walk(child, fn);
}

// ── TRPG logs ────────────────────────────────────────────────────────────────
//
//   ```trpg
//   @KP 21:45:32          ← speaker, optional time ("HH:MM[:SS]" or "YYYY-MM-DD HH:MM")
//   ===== 分割线 =====     ← a line wrapped in === becomes a labelled rule
//   one paragraph per line
//
//   @阿瑟
//   \@ escapes a line that really starts with @
//   ```
//
// Roles are inferred (KP/GM → keeper, bot/骰娘 → dice, everyone else → player) and can be
// overridden per post with front matter `cast: { "名字": keeper | dice | player | guest }`.
// The five most active players get the speaker palette; the rest are set as guests.

const KEEPER = /^(kp|gm|dm|守秘人|主持人?)$/i;
const DICE = /^(bot|dice|骰娘|投骰姬|骰子)/i;
const HEADER = /^@(.*?)(?:\s+((?:\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}(?::\d{2})?))?\s*$/;
const BREAK = /^[=＝]{3,}\s*(.*?)\s*[=＝]{3,}$/;
const PALETTE_SIZE = 5;

function parseLog(value) {
  const entries = [];
  let current = null;
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(HEADER);
    if (header) {
      current = { name: header[1].trim(), time: header[2] ?? "", lines: [] };
      entries.push(current);
      continue;
    }
    if (!current) entries.push((current = { name: "", time: "", lines: [] }));
    current.lines.push(line.startsWith("\\@") ? line.slice(1) : line);
  }
  return entries;
}

const h = (tag, className, children, props = {}) => ({
  type: "trpg",
  data: { hName: tag, hProperties: { className: [].concat(className), ...props } },
  children,
});
const text = (value) => ({ type: "text", value });

export function remarkTrpg() {
  return (tree, file) => {
    const blocks = [];
    walk(tree, (n) => {
      n.children?.forEach((c, index) => {
        if (c.type === "code" && c.lang === "trpg") blocks.push({ parent: n, index, entries: parseLog(c.value) });
      });
    });
    if (!blocks.length) return;

    const cast = file.data?.astro?.frontmatter?.cast ?? {};
    const roleOf = (name) => cast[name] ?? (KEEPER.test(name) ? "keeper" : DICE.test(name) ? "dice" : "player");
    const spoken = new Map();
    for (const b of blocks) {
      for (const e of b.entries) if (roleOf(e.name) === "player") spoken.set(e.name, (spoken.get(e.name) ?? 0) + 1);
    }
    // Cameos (unnamed, or under 2% of player lines) read as guests and don't take a colour.
    const total = [...spoken.values()].reduce((a, b) => a + b, 0);
    const ranked = [...spoken]
      .filter(([name, n]) => name && n / total >= 0.02 && cast[name] !== "player")
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .concat(Object.keys(cast).filter((name) => cast[name] === "player"));

    for (const b of blocks) {
      let previous;
      const entries = b.entries.map((e) => {
        let role = roleOf(e.name);
        const rank = ranked.indexOf(e.name);
        if (role === "player" && (rank === -1 || rank >= PALETTE_SIZE)) role = "guest";
        const who = h("div", "log-who", [
          h("span", "log-name", [text(e.name || "—")]),
          ...(e.time ? [h("span", "log-time", [text(e.time)])] : []),
        ]);
        const lines = e.lines.map((line) => {
          const rule = line.match(BREAK);
          if (!rule) return { type: "paragraph", children: [text(line)] };
          return h("p", "log-break", rule[1] ? [h("span", "log-break-label", [text(rule[1])])] : []);
        });
        const entry = h("div", previous === e.name ? ["log-entry", "is-cont"] : "log-entry", [who, h("div", "log-text", lines)], {
          dataRole: role,
          dataSpeaker: role === "player" ? String(rank + 1) : undefined,
        });
        previous = e.name;
        return entry;
      });
      b.parent.children[b.index] = h("div", "log", entries);
    }
  };
}

/** Heading roles, numbered figures and grouped display formulas. */
export function rehypeArticle() {
  return (tree) => {
    // Headings: the highest level in a post is a chapter rule, the next level a section title.
    const headings = [];
    walk(tree, (n) => {
      if (n.type === "element" && /^h[1-6]$/.test(n.tagName)) headings.push(n);
    });
    // House convention: h3 is a chapter, h4 a section. Posts that skip those levels fall back
    // to their own top two levels.
    const depths = [...new Set(headings.map((el) => Number(el.tagName[1])))].sort();
    const chapter = depths.includes(3) ? 3 : depths[0];
    const section = depths.includes(4) ? 4 : depths.find((d) => d > chapter);
    for (const el of headings) {
      const d = Number(el.tagName[1]);
      if (d === chapter) addClass(el, "h-chapter");
      else if (d === section) addClass(el, "h-section");
      else addClass(el, "h-minor");
    }

    // Standalone images become plates. Only images with a real alt text get a numbered caption;
    // placeholder alts like ![1](1.jpg) or ![img](…) show the image alone.
    let fig = 0;
    walk(tree, (parent) => {
      if (!parent.children) return;
      parent.children = parent.children.map((p) => {
        if (!isEl(p, "p")) return p;
        const content = p.children.filter((c) => !isBlank(c));
        if (content.length !== 1 || !isEl(content[0], "img")) return p;
        const img = content[0];
        const alt = String(img.properties?.alt ?? "").trim();
        const children = [img];
        if (alt && !/^(\d+|img|image|pic|picture|photo|图片?)$/i.test(alt)) {
          fig += 1;
          children.push({ type: "element", tagName: "figcaption", properties: {}, children: [{ type: "text", value: `Fig. ${fig} — ${alt}` }] });
        }
        return { type: "element", tagName: "figure", properties: {}, children };
      });
    });

    // <!-- image-width: 50% --> sizes every image after it (until the next such line) as a share
    // of the text column; put it at the top of a post to size them all. "auto" restores the default.
    // The width is set on each image's parent, so it survives Astro's image processing.
    const WIDTH = /^<!--\s*image-width:\s*(auto|\d+(?:\.\d+)?(?:%|px|em|rem))\s*-->$/i;
    let imageWidth = null;
    walk(tree, (n) => {
      if (n.type === "raw") {
        const m = String(n.value).trim().match(WIDTH);
        if (m) imageWidth = m[1].toLowerCase() === "auto" ? null : m[1];
        return;
      }
      if (!imageWidth || !n.children) return;
      if (n.children.some((c) => isEl(c, "img"))) {
        n.properties ??= {};
        n.properties.style = "--img-width: " + imageWidth;
      }
    });

    // Consecutive display formulas share one ruled block.
    const isDisplay = (n) =>
      isEl(n) &&
      (classes(n).includes("katex-display") ||
        classes(n).includes("math-display") ||
        (n.children?.filter((c) => !isBlank(c)).length === 1 &&
          classes(n.children.find((c) => !isBlank(c))).includes("katex-display")));
    walk(tree, (parent) => {
      if (!parent.children || classes(parent).includes("formula")) return;
      const out = [];
      let group = null;
      for (const child of parent.children) {
        if (isDisplay(child)) {
          if (!group) {
            group = { type: "element", tagName: "div", properties: { className: ["formula"] }, children: [] };
            out.push(group);
          }
          group.children.push(child);
        } else if (group && isBlank(child)) {
          continue;
        } else {
          group = null;
          out.push(child);
        }
      }
      parent.children = out;
    });
  };
}

/** Plain text of a post body for the search index. */
export function plainText(markdown) {
  return markdown
    .replace(/<style\b[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^`{3,}.*$/gm, " ")
    .replace(/^\\?@/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
