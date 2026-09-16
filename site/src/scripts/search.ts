// Client-side search over /search.json (title + tags + body), loaded on first focus.

interface Entry {
  id: string;
  t: string; // title
  d: string; // date
  c: string; // category
  g: string[]; // tags
  b: string; // plain-text body
}
interface Indexed extends Entry {
  tl: string;
  gl: string;
  bl: string;
}

const MAX_RESULTS = 8;
let index: Promise<Indexed[]> | null = null;

const loadIndex = () =>
  (index ??= fetch("/search.json")
    .then((r) => r.json() as Promise<Entry[]>)
    .then((list) => list.map((e) => ({ ...e, tl: e.t.toLowerCase(), gl: e.g.join(" ").toLowerCase(), bl: e.b.toLowerCase() }))));

function highlight(text: string, terms: string[]) {
  const frag = document.createDocumentFragment();
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    let at = -1;
    let len = 0;
    for (const t of terms) {
      const j = lower.indexOf(t, i);
      if (j !== -1 && (at === -1 || j < at)) {
        at = j;
        len = t.length;
      }
    }
    if (at === -1) {
      frag.append(text.slice(i));
      break;
    }
    if (at > i) frag.append(text.slice(i, at));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + len);
    frag.append(mark);
    i = at + len;
  }
  return frag;
}

function snippet(e: Indexed, terms: string[]) {
  const positions = terms.map((t) => e.bl.indexOf(t)).filter((p) => p !== -1);
  if (!positions.length) return e.b.slice(0, 90);
  const start = Math.max(0, Math.min(...positions) - 24);
  return (start > 0 ? "…" : "") + e.b.slice(start, start + 110);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string | Node) {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.append(content);
  return node;
}

export function initSearch() {
  document.querySelectorAll<HTMLElement>("[data-search]").forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = "true";

    const input = root.querySelector("input")!;
    const out = root.querySelector<HTMLElement>(".search-results")!;
    const scope = root.dataset.scope;
    let active = -1;
    let timer: number | undefined;

    input.addEventListener("focus", () => void loadIndex(), { once: true });

    const run = async () => {
      const q = input.value.trim().toLowerCase();
      active = -1;
      if (!q) {
        out.hidden = true;
        out.replaceChildren();
        return;
      }
      const terms = [...new Set(q.split(/\s+/))];
      const list = await loadIndex();
      if (input.value.trim().toLowerCase() !== q) return;

      const hits: { e: Indexed; score: number }[] = [];
      for (const e of list) {
        if (scope && e.c !== scope) continue;
        let score = 0;
        let ok = true;
        for (const t of terms) {
          const inTitle = e.tl.includes(t);
          const inTags = e.gl.includes(t);
          const inBody = e.bl.includes(t);
          if (!inTitle && !inTags && !inBody) {
            ok = false;
            break;
          }
          score += (inTitle ? 10 : 0) + (inTags ? 5 : 0) + (inBody ? 1 : 0);
        }
        if (ok) hits.push({ e, score });
      }
      hits.sort((a, b) => b.score - a.score);

      const nodes: Node[] = [el("p", "search-count", hits.length ? `${hits.length} ${hits.length === 1 ? "result" : "results"} · 结果` : "No matches · 无结果")];
      for (const { e } of hits.slice(0, MAX_RESULTS)) {
        const a = el("a", "search-hit");
        a.href = `/post/${e.id}/`;
        a.append(
          el("span", "search-hit-title", highlight(e.t, terms)),
          el("span", "search-hit-meta", `${e.d} · ${e.c}`),
          el("span", "search-hit-snippet", highlight(snippet(e, terms), terms)),
        );
        nodes.push(a);
      }
      if (hits.length > MAX_RESULTS) nodes.push(el("p", "search-more", `+ ${hits.length - MAX_RESULTS} more — refine the query`));
      out.replaceChildren(...nodes);
      out.hidden = false;
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = window.setTimeout(run, 120);
    });
    input.addEventListener("keydown", (ev) => {
      const links = [...out.querySelectorAll<HTMLAnchorElement>(".search-hit")];
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        if (!links.length) return;
        ev.preventDefault();
        active = (active + (ev.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle("is-active", i === active));
      } else if (ev.key === "Enter") {
        const target = links[active] ?? links[0];
        if (target) {
          ev.preventDefault();
          target.click();
        }
      } else if (ev.key === "Escape") {
        input.value = "";
        void run();
      }
    });
  });
}
