// In-place filtering for the category (by tag) and timeline (by category) lists, and the sticky
// sidebar both pages share.
//
// [data-filter-root]            wraps the chips, the list and the sidebar bars
//   [data-filter="value"]       chip; "" means all
//   [data-group="2020"]         year group, hidden when empty
//     [data-group-count]        "3 entries"
//     [data-values="a|b"]       list item
//   [data-shown]                "Showing n / m"
//   [data-shown-count]          big numeral
//   [data-bar="2020"]           year bar, recomputed when the root has data-bars="shown"

import { scrollSpy } from "./scroll-spy";

function initFilters() {
  document.querySelectorAll<HTMLElement>("[data-filter-root]").forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = "true";

    const chips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter]")];
    const items = [...root.querySelectorAll<HTMLElement>("[data-values]")];
    const groups = [...root.querySelectorAll<HTMLElement>("[data-group]")];
    const total = items.length;
    let current = "";

    const apply = (value: string) => {
      current = value;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === value)));

      const perGroup: Record<string, number> = {};
      let shown = 0;
      for (const item of items) {
        const ok = !value || item.dataset.values!.split("|").includes(value);
        item.hidden = !ok;
        if (!ok) continue;
        shown++;
        const g = item.closest<HTMLElement>("[data-group]")?.dataset.group;
        if (g) perGroup[g] = (perGroup[g] ?? 0) + 1;
      }

      for (const g of groups) {
        const n = perGroup[g.dataset.group!] ?? 0;
        g.hidden = n === 0;
        const label = g.querySelector("[data-group-count]");
        if (label) label.textContent = `${n} ${n === 1 ? "entry" : "entries"}`;
      }
      root.querySelectorAll("[data-shown]").forEach((e) => (e.textContent = `Showing ${shown} / ${total}`));
      root.querySelectorAll("[data-shown-count]").forEach((e) => (e.textContent = String(shown).padStart(2, "0")));

      if (root.dataset.bars === "shown") {
        const max = Math.max(1, ...Object.values(perGroup));
        root.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar) => {
          const n = perGroup[bar.dataset.bar!] ?? 0;
          bar.hidden = n === 0;
          bar.querySelector<HTMLElement>("[data-bar-fill]")!.style.width = `${Math.round((n / max) * 100)}%`;
          bar.querySelector("[data-bar-count]")!.textContent = String(n);
        });
      }
      root.dispatchEvent(new CustomEvent("filterchange"));
    };

    chips.forEach((chip) =>
      chip.addEventListener("click", () => {
        const v = chip.dataset.filter ?? "";
        apply(v && v === current ? "" : v);
      }),
    );

    // Timeline: the year list in the sidebar follows the year in view.
    const jumps = [...root.querySelectorAll<HTMLAnchorElement>("a.year-bar")];
    if (jumps.length) {
      const spy = scrollSpy(jumps, (activeLink) => jumps.forEach((j) => j.setAttribute("aria-current", String(j === activeLink))));
      root.addEventListener("filterchange", () => spy.update());
      jumps.forEach((j) => j.addEventListener("click", () => flashWhenSettled(j.hash.slice(1))));
    }
  });
}

// Near the end of the page a jump may not scroll at all, so once scrolling has come to rest the
// year's label flashes to show where the jump landed.
function flashWhenSettled(id: string) {
  const label = document.getElementById(decodeURIComponent(id))?.querySelector<HTMLElement>("[data-year-label]");
  if (!label) return;
  let last = window.scrollY;
  let still = 0;
  const started = Date.now();
  const check = () => {
    still = window.scrollY === last ? still + 1 : 0;
    last = window.scrollY;
    if (still < 2 && Date.now() - started < 1500) return void setTimeout(check, 60);
    label.classList.remove("is-flash");
    void label.offsetWidth; // restart the animation when clicked again
    label.classList.add("is-flash");
    const done = (e: AnimationEvent) => {
      if (e.target !== label) return;
      label.classList.remove("is-flash");
      label.removeEventListener("animationend", done);
    };
    label.addEventListener("animationend", done);
  };
  setTimeout(check, 60);
}

// The sticky sidebar holds the year list, author and worldbuilding blocks. On a screen too short
// for all of it, stick it by its bottom edge instead, so its end can still be reached.
function fitStickySidebar() {
  const aside = document.querySelector<HTMLElement>(".side-sticky");
  if (!aside) return;
  const GAP = 24;
  const fit = () => (aside.style.top = `${Math.min(GAP, window.innerHeight - aside.offsetHeight - GAP)}px`);
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(aside);
  window.addEventListener("resize", fit);
  document.addEventListener(
    "astro:before-swap",
    () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    },
    { once: true },
  );
}

document.addEventListener("astro:page-load", initFilters);
document.addEventListener("astro:page-load", fitStickySidebar);
